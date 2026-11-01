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
    angelic_setup_token = 32
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

Write-Host 'Production deployment completed successfully.'
