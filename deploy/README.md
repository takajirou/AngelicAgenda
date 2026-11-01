# 自宅Windows PC + Cloudflare Tunnel デプロイ

NestJS、Angelic-Angel、PostgreSQLを自宅Windows PCのDocker Desktopで動かし、外部公開はCloudflare Tunnelだけに限定する構成です。ルーターのポート開放や固定IPは不要で、APIやDBのポートをLANやインターネットへ公開しません。

## 1. 前提を準備する

- 常時起動できるWindows 10またはWindows 11 PC
- WSL 2
- [Docker Desktop for Windows](https://docs.docker.com/desktop/setup/install/windows-install/)
- Git for Windows
- Cloudflareアカウント
- CloudflareでDNS管理する独自ドメイン
- 自動デプロイを使用する場合は、GitHub Actionsのself-hosted runner

安定した公開URLを作るには独自ドメインが必要です。無料のQuick TunnelはURLが起動ごとに変わるため、動作確認以外には使用しません。

管理者PowerShellでWSL 2をインストールし、必要ならWindowsを再起動します。

```powershell
wsl --install
```

Docker DesktopではWSL 2エンジンとLinuxコンテナを使用し、「Start Docker Desktop when you sign in」を有効にします。PowerShellで次を確認してください。

```powershell
docker version
docker compose version
```

## 2. Windowsのスリープを止める

Angelic-AngelはMozilla AutoPushへ常時接続するため、PCがスリープすると通知を受信できません。

- 「設定 > システム > 電源とバッテリー > 画面、スリープ、休止状態のタイムアウト」で、電源接続時のスリープを「なし」にする
- ノートPCでは「コントロール パネル > 電源オプション > カバーを閉じたときの動作」で、電源接続時を「何もしない」にする
- Docker Desktopをログイン時に自動起動する
- Windows Updateのアクティブ時間を設定し、予期しない再起動を減らす

再起動後はWindowsへログインし、Docker Desktopが起動するまでコンテナは復旧しません。自動ログインは認証を迂回するため推奨しません。

## 3. リポジトリとシークレットを準備する

OneDriveなどへ自動同期されない、現在のユーザーだけが使用するフォルダーへ配置します。PowerShellで実行してください。

```powershell
git clone <このリポジトリのURL> AngelicAgenda
Set-Location AngelicAgenda

function New-RandomHex {
    param([int]$ByteCount = 32)
    $bytes = New-Object byte[] $ByteCount
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $generator.GetBytes($bytes)
    }
    finally {
        $generator.Dispose()
    }
    return (($bytes | ForEach-Object { $_.ToString("x2") }) -join "")
}

New-RandomHex | Set-Content -NoNewline -Encoding ascii deploy\secrets\postgres_password
New-RandomHex | Set-Content -NoNewline -Encoding ascii deploy\secrets\angelic_setup_token
```

Webhookはバックエンドコンテナ内の`http://127.0.0.1:3000/webhooks/x`へ固定されるため、外部公開URLの設定は不要です。

## 4. Cloudflare Tunnelを作成する

1. Cloudflare Dashboardの「Networking > Tunnels」でTunnelを作成する
2. Tunnel名を`angelic-agenda-home`などにする
3. Public Hostnameへ`api.example.com`などを登録する
4. Service Typeを`HTTP`、URLを`backend:3000`にする
5. 「Add a replica」に表示されるコマンドから、`eyJ...`で始まるTunnelトークンだけをコピーする
6. 次のPowerShellを実行し、非表示の入力欄へトークンを貼り付けてEnterを押す

```powershell
$secureToken = Read-Host "Tunnel token" -AsSecureString
$plainToken = [System.Net.NetworkCredential]::new("", $secureToken).Password
$secretDirectory = (Resolve-Path "deploy\secrets").Path
[System.IO.File]::WriteAllText(
    (Join-Path $secretDirectory "cloudflare_tunnel_token"),
    $plainToken,
    [System.Text.Encoding]::ASCII
)
Remove-Variable plainToken, secureToken
```

Tunnelトークンを持つ人はTunnelを起動できます。Git、Issue、ログ、チャット、スクリーンショットへ含めないでください。

## 5. 構成検証と起動

```powershell
docker compose -f deploy\compose.production.yml config --quiet
docker compose -f deploy\compose.production.yml up --build --detach
```

初回はRustとNestJSをビルドするため時間がかかります。

```powershell
docker compose -f deploy\compose.production.yml ps
curl.exe --fail-with-body https://api.example.com/health
```

正常なら`{"status":"ok"}`が返ります。Composeの`restart: unless-stopped`により、Docker Desktop再起動後もコンテナが自動復旧します。

失敗時はCookieやトークンを出力しない範囲でログを確認します。

```powershell
docker compose -f deploy\compose.production.yml logs --tail 100 backend cloudflared
```

Cloudflare Tunnelは外向き接続だけを使用するため、ルーターのポート転送、固定IP、Windows Defender Firewallの受信規則追加は不要です。自宅のグローバルIPが変わってもTunnelは再接続します。

## 6. iOSアプリから接続する

iOSアプリの外部サーバーのベースURLは`https://agenda-api.takajirou.app`に固定されています。`/webhooks/x`はAngelic-Angelが通知を転送する別のエンドポイントです。`ios/Config/Secrets.xcconfig.example`を`Secrets.xcconfig`としてコピーし、`deploy\secrets\angelic_setup_token`と同じ値を`ANGELIC_SETUP_TOKEN`へ設定してからアプリをビルドします。接続画面での入力は不要です。

接続が成功すると、Angelic-Angelの設定はDocker volume `angelic_angel_data`へ保存され、コンテナ再作成後も維持されます。受信したツイート内容はPostgreSQLの`tweet_contents`テーブルへ保存されます。

## 7. GitHub Actionsの自動デプロイを設定する

`main`へのpush時に、CIが成功した場合だけ自宅Windows PCへデプロイします。自宅PCでDocker Desktopが起動していることが前提です。

### self-hosted runnerを登録する

1. GitHubリポジトリの「Settings > Actions > Runners」からWindows x64 runnerを追加する
2. 管理者PowerShellで`C:\`へ移動し、GitHubに表示されるコマンドを実行して`C:\actions-runner`へ展開する。`C:\Windows\System32`配下には配置しない
3. runnerの追加ラベルとして`angelic-agenda`を設定する
4. runnerをWindowsサービスとして登録し、既定の`NT AUTHORITY\NETWORK SERVICE`ではなく、Docker Desktopを操作できるWindowsユーザーで実行する
5. そのユーザーで`docker version`と`docker compose version`が成功することを確認する

GitHubが表示するrunner登録トークンは短時間だけ有効です。リポジトリ、ログ、チャットへ保存しないでください。公開リポジトリでは、信頼できないpull requestをself-hosted runnerで実行しないでください。このワークフローは`main`へのpushと手動実行だけを対象にしています。

### production environmentとSecretsを登録する

GitHubリポジトリの「Settings > Environments」で`production` environmentを作成し、次のEnvironment secretsを登録します。

| Secret名 | 設定する値 |
| --- | --- |
| `POSTGRES_PASSWORD` | `deploy\secrets\postgres_password`の内容 |
| `ANGELIC_SETUP_TOKEN` | `deploy\secrets\angelic_setup_token`の内容 |
| `CLOUDFLARE_TUNNEL_TOKEN` | `deploy\secrets\cloudflare_tunnel_token`の内容 |

`ANGELIC_SETUP_TOKEN`はiOSアプリのBuild Settingに設定した値と一致させてください。自動実行を止めないため、`production` environmentにrequired reviewerは設定しません。デプロイの同時実行はワークフロー側で直列化されます。

初回セットアップ後は「Actions > Deploy production > Run workflow」で手動実行し、成功を確認します。その後は`main`へのpushごとに次の処理が自動実行されます。

1. lint、単体テスト、E2Eテスト、ビルド
2. GitHub SecretsからCompose用のシークレットファイルを作成
3. 既存データを保持したままPostgreSQLユーザーのパスワードを現在のSecretへ同期
4. バックエンドイメージをビルドし、Composeサービスを更新
5. コンテナのhealthcheckと公開`/health`を確認

失敗時は、通知本文やCookieを出さない範囲でコンテナ状態と直近100行のログをActionsへ出力します。

`POSTGRES_PASSWORD`を変更しても`postgres_data` volumeは削除されません。自動デプロイ時にDB内の`app`ユーザーへ新しい値を反映するため、保存済みのツイート内容を維持したままSecretを更新できます。

## 運用

### 更新

```powershell
git pull --ff-only
docker compose -f deploy\compose.production.yml pull
docker compose -f deploy\compose.production.yml up --build --detach
```

更新後に`docker compose ps`と`/health`を確認してから、不要な旧イメージを`docker image prune`で削除します。

### バックアップ

PC本体の故障に備え、バックアップを外付けディスクや暗号化したクラウドストレージへ定期的にコピーしてください。PowerShellの文字コード変換を避けるため、PostgreSQLにはカスタム形式のバックアップファイルをコンテナ内で作らせます。

```powershell
New-Item -ItemType Directory -Force backups | Out-Null
docker compose -f deploy\compose.production.yml exec -T database pg_dump -U app -d app -Fc -f /tmp/angelic-agenda.dump
docker compose -f deploy\compose.production.yml cp database:/tmp/angelic-agenda.dump backups\angelic-agenda.dump
docker compose -f deploy\compose.production.yml exec -T database rm /tmp/angelic-agenda.dump
docker compose -f deploy\compose.production.yml cp backend:/var/lib/angelic-angel/angelic-angel.toml backups\angelic-angel.toml
```

`angelic-angel.toml`にはXのCookieとPush登録情報が含まれるため、暗号化して保管してください。

### 停電・再起動後

- Windowsへログインし、Docker Desktopが起動しているか確認する
- `docker compose ps`で3サービスが稼働中か確認する
- `/health`が200を返すか確認する
- Cloudflare DashboardでTunnelがHealthyか確認する
- Angelic-Angelが再接続しているか、本文やCookieを表示しないログで確認する

## 制約

- PCの電源断、スリープ、回線停止中は通知を受信できません。
- 安定したCloudflare Tunnelの公開ホスト名にはCloudflareで管理するドメインが必要です。
- iOSアプリ本体は実機、TestFlightまたはApp Storeで配布します。
- Web Push通知に本文や投稿URLが含まれない場合、その通知からツイート内容は作成されません。
- 通知は全投稿の取得や停止中の通知の回収を保証するものではありません。
