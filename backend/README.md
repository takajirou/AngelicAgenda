# AngelicAgenda API

NestJS、PostgreSQL、Angelic-Angelを組み合わせたマルチユーザーAPIです。利用者ごとに認証、Xセッション、通知リスナー、保存ポストを分離します。

## セキュリティモデル

- アプリ利用者はメールアドレスと12文字以上のパスワードで登録・ログインする
- パスワードはランダムsalt、サーバー専用pepper、scryptで一方向ハッシュ化する
- API認証には30日で失効するランダムなBearerトークンを使い、DBにはHMACハッシュだけを保存する
- X CookieとPush登録情報を含む設定はAES-256-GCMで暗号化してPostgreSQLへ保存する
- 復号した設定は実行中だけtmpfsへ権限`0600`で配置し、ログへ出さない
- Angelic-Angelを利用者ごとに1プロセス起動し、署名付き内部Webhookで利用者を特定する
- 投稿は`user_id`と投稿IDの組で重複排除し、本人のBearerトークンでのみ取得できる
- X連携解除とアカウント削除で、リスナー・暗号化設定・利用者データを削除する

## 必須環境変数

| 変数 | 内容 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL接続URL |
| `AUTH_PEPPER`または`AUTH_PEPPER_FILE` | 32文字以上の認証用秘密値 |
| `X_SESSION_ENCRYPTION_KEY`または`X_SESSION_ENCRYPTION_KEY_FILE` | 32バイトを表す64桁の16進数 |
| `ANGELIC_ANGEL_BINARY_PATH` | Angelic-Angel実行ファイルの絶対パス |
| `ANGELIC_ANGEL_CONFIG_DIRECTORY` | 復号した実行時設定を置くtmpfs上の絶対パス |
| `WEBHOOK_BASE_URL` | `http://127.0.0.1:3000/webhooks/x/` |
| `MAX_ACTIVE_X_SESSIONS` | 同時に保持する利用者別Xセッション数。既定値20 |

## APIフロー

1. `POST /auth/register`または`POST /auth/login`でアプリセッションを取得する
2. Bearerトークン付きで`POST /integrations/angelic-angel/session`を呼び、本人のX Cookieを登録する
3. Angelic-Angelが`POST /webhooks/x/{userId}/{signature}`へ通知を転送する
4. `GET /tweets?limit=50`で本人の保存ポストだけを取得する
5. `DELETE /integrations/angelic-angel/session`でX連携を解除する
6. `DELETE /auth/account`でアカウントと関連データを削除する

詳細な入出力は[`openapi.yaml`](./openapi.yaml)を参照してください。

## 開発コマンド

```bash
npm ci
npm run lint
npm test
npm run test:e2e
npm run build
```

## 開発用DB管理画面

開発用Docker Composeには[pgweb](https://github.com/sosedoff/pgweb)を含めています。プロジェクトルートで起動し、ブラウザから`http://localhost:8081`を開くとPostgreSQLのテーブルとデータを確認・編集できます。

```bash
docker compose up --build --detach
```

pgwebはCompose内のPostgreSQLへ自動接続するため、接続情報の入力は不要です。開発環境では外部から管理画面へアクセスできないよう、ホスト側の`127.0.0.1`だけに公開しています。本番環境はホストのポートへ公開せず、認証付きのCloudflare Tunnel経由でのみアクセスできます。

管理画面を止める場合は、次を実行します。

```bash
docker compose stop pgweb
```

Dockerイメージは[sh1ma/Angelic-Angel](https://github.com/sh1ma/Angelic-Angel)を固定コミットからビルドします。ライセンス本文はイメージ内の`/usr/share/doc/angelic-angel/LICENSE`へ含めています。
