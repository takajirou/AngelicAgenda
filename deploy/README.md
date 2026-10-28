# 自宅Windows PC + Cloudflare Tunnel デプロイ

NestJS、Angelic-Angel、PostgreSQLを自宅Windows PCのDocker Desktopで動かし、外部公開はCloudflare Tunnelだけに限定する構成です。ルーターのポート開放や固定IPは不要で、APIやDBのポートをLANやインターネットへ公開しません。

## 1. 前提を準備する

- 常時起動できるWindows 10またはWindows 11 PC
- WSL 2
- [Docker Desktop for Windows](https://docs.docker.com/desktop/setup/install/windows-install/)
- Git for Windows
- Cloudflareアカウント
- CloudflareでDNS管理する独自ドメイン

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
Copy-Item deploy\.env.production.example deploy\.env.production

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

`deploy\.env.production`の`WEBHOOK_ENDPOINT`を、Cloudflare Tunnelに割り当てる公開URLへ変更します。

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
docker compose --env-file deploy\.env.production -f deploy\compose.production.yml config --quiet
docker compose --env-file deploy\.env.production -f deploy\compose.production.yml up --build --detach
```

初回はRustとNestJSをビルドするため時間がかかります。

```powershell
docker compose --env-file deploy\.env.production -f deploy\compose.production.yml ps
curl.exe --fail-with-body https://api.example.com/health
```

正常なら`{"status":"ok"}`が返ります。Composeの`restart: unless-stopped`により、Docker Desktop再起動後もコンテナが自動復旧します。

失敗時はCookieやトークンを出力しない範囲でログを確認します。

```powershell
docker compose --env-file deploy\.env.production -f deploy\compose.production.yml logs --tail 100 backend cloudflared
```

Cloudflare Tunnelは外向き接続だけを使用するため、ルーターのポート転送、固定IP、Windows Defender Firewallの受信規則追加は不要です。自宅のグローバルIPが変わってもTunnelは再接続します。

## 6. iOSアプリから接続する

iOSアプリの接続画面へ次を設定します。

- 外部サーバーURL: `https://api.example.com`
- セットアップトークン: `deploy\secrets\angelic_setup_token`に生成した値

接続が成功すると、Angelic-Angelの設定はDocker volume `angelic_angel_data`へ保存され、コンテナ再作成後も維持されます。

## 運用

### 更新

```powershell
git pull --ff-only
docker compose --env-file deploy\.env.production -f deploy\compose.production.yml pull
docker compose --env-file deploy\.env.production -f deploy\compose.production.yml up --build --detach
```

更新後に`docker compose ps`と`/health`を確認してから、不要な旧イメージを`docker image prune`で削除します。

### バックアップ

PC本体の故障に備え、バックアップを外付けディスクや暗号化したクラウドストレージへ定期的にコピーしてください。PowerShellの文字コード変換を避けるため、PostgreSQLにはカスタム形式のバックアップファイルをコンテナ内で作らせます。

```powershell
New-Item -ItemType Directory -Force backups | Out-Null
docker compose --env-file deploy\.env.production -f deploy\compose.production.yml exec -T database pg_dump -U app -d app -Fc -f /tmp/angelic-agenda.dump
docker compose --env-file deploy\.env.production -f deploy\compose.production.yml cp database:/tmp/angelic-agenda.dump backups\angelic-agenda.dump
docker compose --env-file deploy\.env.production -f deploy\compose.production.yml exec -T database rm /tmp/angelic-agenda.dump
docker compose --env-file deploy\.env.production -f deploy\compose.production.yml cp backend:/var/lib/angelic-angel/angelic-angel.toml backups\angelic-angel.toml
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
- `WEBHOOK_ENDPOINT`の通知受信APIは別途実装が必要です。現時点のバックエンドはセッション登録とAngelic-Angel起動までを提供します。
