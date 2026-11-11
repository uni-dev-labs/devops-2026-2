
param(
    [string]$BaseUrl = "http://localhost:3000",
    [int]$Iterations = 100,
    [int]$Warmup = 5
)

$ErrorActionPreference = "Stop"
$BaseUrl = $BaseUrl.TrimEnd("/")

$endpoints = @(
    @{ Service = "API"; Name = "Health API"; Path = "/health" },
    @{ Service = "PostgreSQL"; Name = "Health PostgreSQL"; Path = "/api/postgres/health" },
    @{ Service = "PostgreSQL"; Name = "Listado PostgreSQL"; Path = "/api/postgres/users?limit=20&offset=0" },
    @{ Service = "MongoDB"; Name = "Health MongoDB"; Path = "/api/mongo/health" },
    @{ Service = "MongoDB"; Name = "Listado MongoDB"; Path = "/api/mongo/users?limit=20&offset=0" },
    @{ Service = "MongoDB"; Name = "Listado productos"; Path = "/api/products" }
)

$allSamples = New-Object System.Collections.Generic.List[object]
$summary = New-Object System.Collections.Generic.List[object]

Write-Host "`nBENCHMARK DE TRAZABILIDAD" -ForegroundColor Cyan
Write-Host "Fecha: $(Get-Date)"
Write-Host "Solicitudes por endpoint: $Iterations"
Write-Host "Calentamiento: $Warmup solicitudes"
Write-Host "Tipo de prueba: solicitudes secuenciales`n"

foreach ($endpoint in $endpoints) {

    $url = "$BaseUrl$($endpoint.Path)"
    Write-Host "Midiendo $($endpoint.Service) - $($endpoint.Name)..." -ForegroundColor Yellow

    # Calentamiento: no se incluye en las estadísticas.
    for ($i = 1; $i -le $Warmup; $i++) {
        try {
            Invoke-RestMethod -Uri $url -Method Get -TimeoutSec 20 | Out-Null
        }
        catch {
            Write-Warning "Fallo durante calentamiento: $($_.Exception.Message)"
        }
    }

    $successfulTimes = New-Object System.Collections.Generic.List[double]
    $errors = 0
    $totalWatch = [System.Diagnostics.Stopwatch]::StartNew()

    for ($i = 1; $i -le $Iterations; $i++) {

        $requestWatch = [System.Diagnostics.Stopwatch]::StartNew()
        $status = "OK"
        $errorMessage = ""

        try {
            Invoke-RestMethod -Uri $url -Method Get -TimeoutSec 20 | Out-Null
            $successfulTimes.Add([double]$requestWatch.Elapsed.TotalMilliseconds)
        }
        catch {
            $status = "ERROR"
            $errors++
            $errorMessage = $_.Exception.Message
        }

        $requestWatch.Stop()
        $milliseconds = [math]::Round($requestWatch.Elapsed.TotalMilliseconds, 3)

        $allSamples.Add([pscustomobject]@{
            Service = $endpoint.Service
            Endpoint = $endpoint.Path
            Iteration = $i
            Milliseconds = $milliseconds
            Status = $status
            Error = $errorMessage
        })
    }

    $totalWatch.Stop()
    $success = $successfulTimes.Count

    if ($success -gt 0) {
        $stats = $successfulTimes | Measure-Object -Average -Minimum -Maximum
        $sorted = @($successfulTimes.ToArray() | Sort-Object)
        $p95Index = [int][math]::Ceiling(0.95 * $sorted.Count) - 1
        $p95 = $sorted[$p95Index]

        $minimum = [math]::Round($stats.Minimum, 3)
        $average = [math]::Round($stats.Average, 3)
        $maximum = [math]::Round($stats.Maximum, 3)
        $p95 = [math]::Round($p95, 3)
    }
    else {
        $minimum = 0
        $average = 0
        $maximum = 0
        $p95 = 0
    }

    $rps = 0
    if ($totalWatch.Elapsed.TotalSeconds -gt 0) {
        $rps = [math]::Round(
            $success / $totalWatch.Elapsed.TotalSeconds, 2
        )
    }

    $summary.Add([pscustomobject]@{
        Service = $endpoint.Service
        Endpoint = $endpoint.Path
        Requests = $Iterations
        Success = $success
        Errors = $errors
        MinMs = $minimum
        AvgMs = $average
        P95Ms = $p95
        MaxMs = $maximum
        RequestsPerSecond = $rps
    })
}

$reportDir = Join-Path (Split-Path -Parent $PSScriptRoot) "reports\trazabilidad"
New-Item -ItemType Directory -Force -Path $reportDir | Out-Null

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$summaryPath = Join-Path $reportDir "resumen-$stamp.csv"
$rawPath = Join-Path $reportDir "mediciones-$stamp.csv"

$summary | Export-Csv -Path $summaryPath -NoTypeInformation -Encoding UTF8
$allSamples | Export-Csv -Path $rawPath -NoTypeInformation -Encoding UTF8

Write-Host "`nRESUMEN DE RESULTADOS" -ForegroundColor Green
$summary | Format-Table Service, Endpoint, Requests, Success, Errors, MinMs, AvgMs, P95Ms, MaxMs, RequestsPerSecond -AutoSize

Write-Host "`nArchivos generados:"
Write-Host $summaryPath
Write-Host $rawPath

if (($summary | Where-Object { $_.Errors -gt 0 }).Count -gt 0) {
    Write-Warning "Hay errores. Revisa el CSV antes de presentar los resultados."
}
else {
    Write-Host "`nTodas las solicitudes medidas finalizaron correctamente." -ForegroundColor Green
}
