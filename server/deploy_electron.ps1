$source = "C:\Users\jeffe\.gemini\antigravity\scratch\oracle-lowcode\server\dist\Oracle Low-Code Builder Setup 1.0.0.exe"
$dest1 = "C:\Users\jeffe\Downloads\Projeto Desktop Qiuery"
$dest2 = "Z:\Jefferson\Projeto Desktop Quere"

Write-Host "Deploying Electron App..."

# Deploy to Destination 1
if (!(Test-Path -Path $dest1)) {
    New-Item -ItemType Directory -Force -Path $dest1 | Out-Null
    Write-Host "Created directory $dest1"
}
Copy-Item -Path $source -Destination $dest1 -Force
Write-Host "Deployed to $dest1"

# Deploy to Destination 2 (Network Drive)
if (Test-Path -Path "Z:\") {
    if (!(Test-Path -Path $dest2)) {
        try {
            New-Item -ItemType Directory -Force -Path $dest2 | Out-Null
            Write-Host "Created directory $dest2"
        }
        catch {
            Write-Host "Failed to create directory on Z: drive. Check permissions."
            exit 1
        }
    }
    try {
        Copy-Item -Path $source -Destination $dest2 -Force
        Write-Host "Deployed to $dest2"
    }
    catch {
        Write-Host "Failed to copy to Z: drive. Check permissions or connectivity."
    }
}
else {
    Write-Host "Z: drive not found. Skipping network deployment."
}

Write-Host "Deployment Complete!"
