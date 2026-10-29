# iOSアプリ

## 外部サーバーへのX通知接続

このアプリは、個人検証用に`WKWebView`でXのログイン画面を開き、ログイン後にXドメインの`auth_token`と`ct0`だけを検出します。取得した値はHTTPSで外部サーバーへ一度だけ送信し、画面表示・ログ出力・端末保存は行いません。接続成功後はXのWebViewデータを削除します。

外部サーバーURLは`https://agenda-api.takajirou.app/webhooks/x`に固定されています。アプリの接続画面では次を入力します。

- セットアップトークン: サーバーの`ANGELIC_SETUP_TOKEN`と同じランダム値

X Developer ConsoleのClient ID、Client Secret、Callback URIはこの方式では使用しません。

## 注意事項

- Xの非公開Web Cookieと画面仕様に依存するため、X側の変更で動作しなくなる可能性があります。
- CookieはXアカウントと同等の機密情報です。画面共有、スクリーンショット、ログ、Issueなどへ値を貼り付けないでください。
- 一般公開向けの認証方式ではありません。個人検証の範囲で使用し、Xの規約とポリシーを確認してください。

## テスト

```bash
xcodebuild \
  -project AngelicAgenda.xcodeproj \
  -scheme AngelicAgenda \
  -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /tmp/AngelicAgendaDerivedData \
  CODE_SIGNING_ALLOWED=NO \
  build-for-testing
```
