# Levanta el stack, corre las pruebas de humo y guarda toda la evidencia
# en la carpeta evidencia/ para adjuntarla al Pull Request.
#
# Uso:  ./scripts/evidencia.ps1

$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$out  = "evidencia"
$log  = Join-Path $out "evidencia.txt"
$base = "http://localhost:3000"
$script:failed = 0

New-Item -ItemType Directory -Force -Path $out | Out-Null
Set-Content -Path $log -Value "" -Encoding utf8

function Log([string]$text) {
    Write-Host $text
    Add-Content -Path $log -Value $text -Encoding utf8
}
function Say([string]$title) { Log ""; Log "=== $title ===" }
function Run([string]$cmd) {
    Log "`$ $cmd"
    $result = Invoke-Expression "$cmd 2>&1" | Out-String
    Log $result.TrimEnd()
}

Log "Evidencia práctica Docker - DevOps 2026-2"
Log "Fecha:  $((Get-Date).ToUniversalTime().ToString('yyyy-MM-dd HH:mm:ss')) UTC"
Log "Rama:   $(git rev-parse --abbrev-ref HEAD 2>$null)"
Log "Commit: $(git rev-parse --short HEAD 2>$null)"

Say "Versiones"
Run "docker --version"
Run "docker compose version"

Say "Levantando el stack"
if (-not (Test-Path ".env")) { Copy-Item .env.example .env }
Run "docker compose up --build -d"

Say "Esperando a que la API responda"
for ($i = 1; $i -le 60; $i++) {
    try {
        Invoke-RestMethod -Uri "$base/health" -TimeoutSec 3 | Out-Null
        Log "API lista tras ${i}s"
        break
    } catch {
        Start-Sleep -Seconds 1
        if ($i -eq 60) { Log "TIMEOUT: la API no respondió en 60s" }
    }
}

Say "Estado de los contenedores"
Run "docker compose ps"

Say "Imágenes construidas"
Run "docker images --filter reference='*devops*'"

function Check {
    param([string]$Desc, [string]$Url, [string]$Method = "GET", $Body = $null)

    Log ""
    Log "--- $Desc ---"
    try {
        $params = @{ Uri = $Url; Method = $Method; TimeoutSec = 15 }
        if ($Body) {
            $params.Body        = ($Body | ConvertTo-Json -Compress)
            $params.ContentType = "application/json"
        }
        $resp = Invoke-WebRequest @params
        Log ($resp.Content)
        Log "HTTP $($resp.StatusCode)"
        Log "[OK] $Desc"
    } catch {
        Log ($_.Exception.Message)
        Log "[FALLO] $Desc"
        $script:failed++
    }
}

Say "Pruebas de humo"
Check "GET /health"              "$base/health"
Check "GET /api/postgres/health" "$base/api/postgres/health"
Check "GET /api/mongo/health"    "$base/api/mongo/health"

$stamp = [int][double]::Parse((Get-Date -UFormat %s))
Check "POST /api/postgres/users" "$base/api/postgres/users" "POST" @{ name = "Ana";  email = "ana+$stamp@example.com" }
Check "POST /api/mongo/users"    "$base/api/mongo/users"    "POST" @{ name = "Luis"; email = "luis+$stamp@example.com" }

Check "GET /api/postgres/users"  "$base/api/postgres/users"
Check "GET /api/mongo/users"     "$base/api/mongo/users"

Say "Persistencia: los datos siguen en el volumen tras reiniciar la API"
Run "docker compose restart api"
Start-Sleep -Seconds 8
Check "GET /api/postgres/users (tras restart)" "$base/api/postgres/users"
Check "GET /api/mongo/users (tras restart)"    "$base/api/mongo/users"

Say "Logs del servicio api"
$logsApi = Invoke-Expression "docker compose logs --tail 60 api 2>&1" | Out-String
Set-Content -Path (Join-Path $out "logs-api.txt") -Value $logsApi -Encoding utf8
Log $logsApi.TrimEnd()

Say "Resultado"
if ($script:failed -eq 0) { Log "TODAS LAS PRUEBAS PASARON" }
else { Log "$($script:failed) prueba(s) fallaron" }

Write-Host ""
Write-Host "Evidencia guardada en: $out\"
exit $script:failed
