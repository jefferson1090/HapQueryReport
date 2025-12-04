$version = "1.1.26"
$sourceExe = "C:\Users\jeffe\.gemini\antigravity\scratch\oracle-lowcode\server\dist\Hap Query Report Setup $version.exe"
$destDir = "C:\Users\jeffe\Downloads\Projeto Desktop Qiuery"
$sourceCodeDir = "C:\Users\jeffe\Downloads\Projeto Desktop Qiuery\Codigo Fonte"
$projectRoot = "C:\Users\jeffe\.gemini\antigravity\scratch\oracle-lowcode"

Write-Host "Starting Deployment for version $version..."

# 1. Deploy Executable
if (!(Test-Path -Path $destDir)) {
    New-Item -ItemType Directory -Force -Path $destDir | Out-Null
}
Copy-Item -Path $sourceExe -Destination $destDir -Force
Write-Host "Deployed Executable to $destDir"

# 2. Deploy Source Code
if (Test-Path -Path $sourceCodeDir) {
    Remove-Item -Path $sourceCodeDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $sourceCodeDir | Out-Null

# Copy Client
Write-Host "Copying Client Source..."
$clientDest = "$sourceCodeDir\client"
New-Item -ItemType Directory -Force -Path $clientDest | Out-Null
Copy-Item -Path "$projectRoot\client\*" -Destination $clientDest -Recurse -Force -Exclude "node_modules", "dist", ".git"

# Copy Server
Write-Host "Copying Server Source..."
$serverDest = "$sourceCodeDir\server"
New-Item -ItemType Directory -Force -Path $serverDest | Out-Null
Copy-Item -Path "$projectRoot\server\*" -Destination $serverDest -Recurse -Force -Exclude "node_modules", "dist", "uploads", ".git", "server.exe", "oracle-builder.exe", "server_log.txt"

Write-Host "Source Code Transfer Complete!"
