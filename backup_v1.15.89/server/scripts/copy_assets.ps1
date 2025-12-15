
$publicDir = Join-Path $PSScriptRoot "../public"
$distDir = Join-Path $PSScriptRoot "../../client/dist"

Write-Host "Checking Source: $distDir"
if (-not (Test-Path $distDir)) {
    Write-Error "Client dist directory not found at $distDir. Run 'npm run build' in client first."
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
