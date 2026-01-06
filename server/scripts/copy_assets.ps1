
$publicDir = Join-Path $PSScriptRoot "../public"
$distDir = Join-Path $PSScriptRoot "../../client/dist"

$clientDir = Join-Path $PSScriptRoot "../../client"

Write-Host "Building Client at: $clientDir"
Push-Location $clientDir
try {
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Client build failed."
        exit $LASTEXITCODE
    }
}
finally {
    Pop-Location
}

Write-Host "Checking Source: $distDir"
if (-not (Test-Path $distDir)) {
    Write-Error "Client dist directory not found at $distDir after build."
    exit 1
}

Write-Host "Preparing Destination: $publicDir"
if (-not (Test-Path $publicDir)) {
    New-Item -ItemType Directory -Path $publicDir -Force | Out-Null
    Write-Host "Created public directory."
}
else {
    # Remove old files to ensure fresh copy
    Remove-Item "$publicDir\*" -Recurse -Force
}

Write-Host "Copying assets..."
Copy-Item -Path "$distDir\*" -Destination $publicDir -Recurse -Force
Write-Host "Copy complete."
