$targetDir = "C:\Users\jeffe\Downloads\OracleApp"
$sourceExe = "C:\Users\jeffe\.gemini\antigravity\scratch\oracle-lowcode\server\oracle-builder.exe"
$sourceClient = "C:\Users\jeffe\.gemini\antigravity\scratch\oracle-lowcode\client\dist"
$batFile = "$targetDir\start_app.bat"

Write-Host "Deploying to $targetDir..."

# Create target directory
if (!(Test-Path -Path $targetDir)) {
    New-Item -ItemType Directory -Force -Path $targetDir | Out-Null
    Write-Host "Created directory $targetDir"
}

# Copy Executable
Copy-Item -Path $sourceExe -Destination $targetDir -Force
Write-Host "Copied executable"

# Copy Public Assets
$publicDir = "$targetDir\public"
if (Test-Path -Path $publicDir) {
    Remove-Item -Path $publicDir -Recurse -Force
}
Copy-Item -Path $sourceClient -Destination $publicDir -Recurse -Force
Write-Host "Copied public assets"

# Create Batch File
$batContent = @"
@echo off
echo Starting Oracle Low-Code Builder...
start "" "http://localhost:3001"
oracle-builder.exe
pause
"@
Set-Content -Path $batFile -Value $batContent
Write-Host "Created start_app.bat"

Write-Host "Deployment Complete!"
