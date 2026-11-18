# iOSアプリ

## 利用フロー

1. メールアドレスと12文字以上のパスワードで利用者登録またはログインする
2. XのWeb画面で本人のXアカウントへログインする
3. 検出した`auth_token`と`ct0`だけをHTTPSでサーバーへ一度送信する
4. Cookieを読み取った直後にXのCookieとWebViewデータを端末から削除する
5. `GET /tweets?limit=50`から本人の保存ポストだけを表示する
6. 告知一覧の絞り込みボタンから、ライブチケット・グッズ告知の取得設定を変更する

アプリのセッショントークンはKeychainへ保存します。共通シークレットをアプリへ埋め込む方式は使用しません。X Cookie、パスワード、通知本文はログへ出しません。

絞り込み設定は利用者ごとにバックエンドへ保存されます。初期状態は無効で、既存の挙動と同じく受信したすべてのツイートを表示します。

一覧は起動時に自動取得し、プル更新と空状態からの再読み込みに対応します。アカウントメニューからX連携解除、ログアウト、アカウント削除を実行できます。

## 注意事項

- Xの非公開Web Cookieと画面仕様に依存するため、X側の変更で動作しなくなる可能性があります。
- CookieはXアカウントと同等の機密情報です。画面共有、スクリーンショット、ログ、Issueへ貼り付けないでください。
- サーバーは利用者ごとにAngelic-Angelプロセスを起動するため、利用者数に応じてCPU・メモリ・接続数を監視してください。
- Xおよび関連サービスの規約を確認したうえで配布してください。

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
