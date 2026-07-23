# One-click local launcher (see docs/adr/0022 for why this closes the
# "click a button" gap): starts Postgres + Redis, applies migrations,
# starts the API/worker/web dev servers each in their own window so you
# can see their logs, then opens the browser. No manual token/bootstrap
# step needed anymore — sign in with any @curatal.com email.
#
# Usage:  powershell -ExecutionPolicy Bypass -File start.ps1

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

function Write-Step($message) {
    Write-Host "==> $message" -ForegroundColor Cyan
}

# Postgres (local, native Windows service) and Redis (Upstash, free cloud
# instance) are both external to this repo — see docs/architecture/
# dev-database.md for why this isn't docker-compose.yml. Load root .env
# into THIS process so DATABASE_URL/REDIS_URL propagate to the spawned
# dev-server windows below (they read process.env directly, no dotenv).
Write-Step 'Loading .env...'
if (-not (Test-Path "$root\.env")) {
    Write-Host '.env not found at repo root — copy .env.example and fill in DATABASE_URL/REDIS_URL.' -ForegroundColor Red
    exit 1
}
Get-Content "$root\.env" | ForEach-Object {
    if ($_ -match '^\s*([^#=]+)=(.*)$') {
        $name = $matches[1].Trim()
        $value = $matches[2].Trim().Trim('"')
        [System.Environment]::SetEnvironmentVariable($name, $value, 'Process')
    }
}

Write-Step 'Checking Postgres is reachable...'
$pgReady = & pg_isready -h localhost -p 5432 -U cqp -d cqp
if ($LASTEXITCODE -ne 0) {
    Write-Host "Postgres isn't reachable at localhost:5432 as user cqp. $pgReady" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path "$root\packages\db\.env")) {
    Write-Step 'Creating packages/db/.env from the example (safe local default)...'
    Copy-Item "$root\packages\db\.env.example" "$root\packages\db\.env"
}

Write-Step 'Generating Prisma client and applying migrations...'
& corepack pnpm --filter "@cqp/db" run generate
& corepack pnpm --filter "@cqp/db" run migrate:deploy

Write-Step 'Starting the API (:3000), worker, and web dashboard (:5173)...'
Start-Process powershell -ArgumentList '-NoExit', '-Command', "cd '$root'; corepack pnpm --filter @cqp/api run dev"
Start-Process powershell -ArgumentList '-NoExit', '-Command', "cd '$root'; corepack pnpm --filter @cqp/worker run dev"
Start-Process powershell -ArgumentList '-NoExit', '-Command', "cd '$root'; corepack pnpm --filter @cqp/web run dev"

Write-Step 'Waiting for the dashboard to come up...'
Start-Sleep -Seconds 5
Start-Process 'http://localhost:5173'

Write-Host ''
Write-Host 'Running. Sign in with any @curatal.com email — no token needed.' -ForegroundColor Green
Write-Host 'Three new PowerShell windows opened (api/worker/web) — close them to stop.' -ForegroundColor Green
