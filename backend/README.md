# AngelicAgenda API

NestJS APIとAngelic-Angelを同じ外部サーバー上で動かします。iOSアプリから受け取ったX Cookieは入力検証後、権限`0600`の設定ファイルへ保存され、Angelic-Angelの登録と通知待受に使用されます。復号されたX通知からツイート本文を抽出し、PostgreSQLへ保存します。Cookie値と通知本文はログへ出しません。

## 必須環境変数

| 変数                        | 内容                                                       |
| --------------------------- | ---------------------------------------------------------- |
| `ANGELIC_SETUP_TOKEN`       | iOSアプリとのセットアップAPIを保護する十分に長いランダム値 |
| `ANGELIC_ANGEL_BINARY_PATH` | Angelic-Angel実行ファイルの絶対パス                        |
| `ANGELIC_ANGEL_CONFIG_PATH` | Cookieと登録情報を保存する設定ファイルの絶対パス           |
| `DATABASE_URL`              | ツイート内容を保存するPostgreSQL接続URL                    |
| `WEBHOOK_ENDPOINT`          | `http://127.0.0.1:3000/webhooks/x`（Composeでは設定済み）  |

Docker Composeではバイナリ、設定パス、DB接続、内部Webhook URLが設定済みです。`.env.example`を`.env`へコピーし、秘密値を設定します。

```bash
cp .env.example .env
openssl rand -hex 32
# 出力を.envのANGELIC_SETUP_TOKENへ設定
docker compose up --build
```

自宅Windows PCからCloudflare Tunnel経由で公開する本番構成は、[`deploy/README.md`](../deploy/README.md)を参照してください。本番ComposeはAPIやDBのポートをホストへ公開せず、シークレットをGit管理外のファイルから読み込みます。

外部公開時は、Caddyやnginxなどのリバースプロキシで有効なTLS証明書を設定し、iOSアプリには`https://`の公開URLを入力してください。NestJSの3000番ポートをそのままインターネットへ公開しないでください。

## セットアップAPI

`POST /integrations/angelic-angel/session`

- `Authorization: Bearer <ANGELIC_SETUP_TOKEN>`が必須
- JSON本文は`authToken`と`ct0`
- 成功時は登録を完了して`listen`を起動し、`{"status":"registered"}`を返す
- 同時実行、不正入力、設定不足、Angelic-Angel登録失敗は明示的にエラーを返す

このAPIはログイン済みWeb Cookieを扱います。レート制限、アクセス元制限、監視をリバースプロキシ側でも追加してください。

## X通知Webhook

`POST /webhooks/x`

- Angelic-Angelが復号した通知JSONを受信する内部エンドポイント
- ループバックアドレスからの接続だけを許可し、Cloudflare Tunnelなど外部からの要求は拒否する
- `data.uri`がXの投稿URLまたは`/account/status/id`形式の相対パスで、タイトルと本文を取得できた通知だけを保存する
- X側が追加した未使用フィールドは型にかかわらず境界で除去し、保存に利用するフィールドだけを検証する
- 投稿ID、本文、投稿者表示名、投稿者ハンドル、元URL、通知種別、通知時刻を正規化する
- 同じ投稿IDの再送は重複登録せず、`duplicate: true`を返す
- 投稿以外の通知は`ignored`として正常応答し、Angelic-Angelの接続を維持する
- 通知本文をログへ出さず、保存・重複・無視と必要フィールドの有無だけを記録する

Angelic-Angelの固定コミットには、安全パッチをDockerビルド時に適用します。パッチは通知本文のログ出力を止め、Webhookが非2xxを返したときに`not_delivered`でACKするためのものです。

リスナーの生ログはそのまま出力せず、AutoPush接続、通知受信、復号、Webhook転送の成否だけを固定文言へ変換して記録します。Cookie、通知本文、投稿ID、Push登録IDはログへ出しません。

## ツイート取得API

`GET /tweets?limit=50`

- `Authorization: Bearer <ANGELIC_SETUP_TOKEN>`が必須
- 保存済みツイートを受信日時の新しい順で返す
- `limit`は1〜100、省略時は50
- 現在の共有トークン方式は個人検証用。複数ユーザー対応時はユーザー認証とデータ分離へ置き換える

詳細な入出力は[`openapi.yaml`](./openapi.yaml)を参照してください。

## 開発コマンド

```bash
npm ci
npm run lint
npm test
npm run test:e2e
npm run build
```

## Angelic-Angel

Dockerイメージは[sh1ma/Angelic-Angel](https://github.com/sh1ma/Angelic-Angel)を固定コミットからビルドします。ライセンス本文はイメージ内の`/usr/share/doc/angelic-angel/LICENSE`へ含めています。
