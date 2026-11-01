[CmdletBinding()]
param(
    [Parameter()]
    [ValidatePattern('^https://')]
    [string]$HealthUrl = 'https://agenda-api.takajirou.app/health'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$deployDirectory = Split-Path -Parent $PSScriptRoot
$composeFile = Join-Path $deployDirectory 'compose.production.yml'
$secretDirectory = Join-Path $deployDirectory 'secrets'
$requiredSecretFiles = @{
    postgres_password = 32
    auth_pepper = 32
    x_session_encryption_key = 64
    cloudflare_tunnel_token = 20
}

foreach ($entry in $requiredSecretFiles.GetEnumerator()) {
    $secretPath = Join-Path $secretDirectory $entry.Key
    if (-not (Test-Path -LiteralPath $secretPath -PathType Leaf)) {
        throw "Required deployment secret file is missing: $($entry.Key)"
    }

    if ((Get-Item -LiteralPath $secretPath).Length -lt $entry.Value) {
        throw "Deployment secret file is shorter than required: $($entry.Key)"
    }
}

$encryptionKey = [System.IO.File]::ReadAllText(
    (Join-Path $secretDirectory 'x_session_encryption_key')
).Trim()
if ($encryptionKey -notmatch '^[0-9a-fA-F]{64}$') {
    throw 'x_session_encryption_key must contain exactly 64 hexadecimal characters.'
}

function Assert-NativeCommandSucceeded {
    param(
        [Parameter(Mandatory)]
        [string]$Operation
    )

    if ($LASTEXITCODE -ne 0) {
        throw "$Operation failed with exit code $LASTEXITCODE."
    }
}

docker info --format '{{json .ServerVersion}}'
Assert-NativeCommandSucceeded 'Docker availability check'

docker compose version
Assert-NativeCommandSucceeded 'Docker Compose availability check'

docker compose -f $composeFile config --quiet
Assert-NativeCommandSucceeded 'Docker Compose configuration validation'

docker compose -f $composeFile build backend
Assert-NativeCommandSucceeded 'Backend image build'

docker compose -f $composeFile up --detach --wait --wait-timeout 120 database
Assert-NativeCommandSucceeded 'Database startup'

docker compose -f $composeFile exec -T --user postgres database sh /usr/local/share/angelic-agenda/sync-postgres-password.sh
Assert-NativeCommandSucceeded 'PostgreSQL password synchronization'

docker compose -f $composeFile up --detach --remove-orphans --wait --wait-timeout 300
Assert-NativeCommandSucceeded 'Production service update'

$healthCheckSucceeded = $false
$lastHealthError = $null

for ($attempt = 1; $attempt -le 10; $attempt++) {
    try {
        $response = Invoke-RestMethod -Uri $HealthUrl -Method Get -TimeoutSec 10
        if ($response.status -ne 'ok') {
            throw "Unexpected health response status: $($response.status)"
        }

        $healthCheckSucceeded = $true
        break
    }
    catch {
        $lastHealthError = $_
        if ($attempt -lt 10) {
            Start-Sleep -Seconds 5
        }
    }
}

if (-not $healthCheckSucceeded) {
    throw "Health check failed after 10 attempts: $($lastHealthError.Exception.Message)"
}

# 旧単一ユーザー構成のvolumeには平文のX Cookieが残るため、
# 新構成の起動確認後にComposeラベルで対象を限定して削除する。
$legacyVolumes = @(
    docker volume ls --quiet `
        --filter 'label=com.docker.compose.project=angelic-agenda' `
        --filter 'label=com.docker.compose.volume=angelic_angel_data'
)
Assert-NativeCommandSucceeded 'Legacy Angelic Angel volume lookup'
foreach ($legacyVolume in $legacyVolumes) {
    if (-not [string]::IsNullOrWhiteSpace($legacyVolume)) {
        docker volume rm $legacyVolume
        Assert-NativeCommandSucceeded 'Legacy Angelic Angel volume removal'
    }
}

Write-Host 'Production deployment completed successfully.'
