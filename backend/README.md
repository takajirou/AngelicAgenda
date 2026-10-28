# AngelicAgenda API

NestJS APIとAngelic-Angelを同じ外部サーバー上で動かします。iOSアプリから受け取ったX Cookieは入力検証後、権限`0600`の設定ファイルへ保存され、Angelic-Angelの登録と通知待受に使用されます。Cookie値はログへ出しません。

## 必須環境変数

| 変数 | 内容 |
| --- | --- |
| `ANGELIC_SETUP_TOKEN` | iOSアプリとのセットアップAPIを保護する十分に長いランダム値 |
| `ANGELIC_ANGEL_BINARY_PATH` | Angelic-Angel実行ファイルの絶対パス |
| `ANGELIC_ANGEL_CONFIG_PATH` | Cookieと登録情報を保存する設定ファイルの絶対パス |
| `WEBHOOK_ENDPOINT` | 復号した通知の転送先URL |

Docker Composeではバイナリと2つのパスが設定済みです。`.env.example`を`.env`へコピーし、秘密値とWebhook URLを設定します。

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
