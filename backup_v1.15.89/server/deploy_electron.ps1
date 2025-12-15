# Find the latest Setup exe
$distDir = "C:\Users\jeffe\.gemini\antigravity\scratch\oracle-lowcode\server\dist"
$latestExe = Get-ChildItem -Path "$distDir\*.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1

if (!$latestExe) {
    Write-Error "No .exe found in $distDir. Did the build fail?"
    exit 1
}

$source = $latestExe.FullName
Write-Host "Found installer: $source"

$dest1 = "C:\Users\jeffe\Downloads\Projeto Desktop Qiuery"
# Use OneDrive environment variable for dynamic path
$oneDrive = $env:OneDrive
if (-not $oneDrive) {
    # Fallback if env var missing (e.g. running as different user context?)
    $oneDrive = "C:\Users\jeffe\OneDrive - HAPVIDA ASSISTÊNCIA MÉDICA LTDA"
}
$dest2 = Join-Path $oneDrive "JEFFERSON\versoes_app\Version_HapAssistente"

Write-Host "Deploying Electron App..."

# Deploy to Destination 1
if (!(Test-Path -Path $dest1)) {
    New-Item -ItemType Directory -Force -Path $dest1 | Out-Null
    Write-Host "Created directory $dest1"
}
Copy-Item -Path $source -Destination $dest1 -Force
Write-Host "Deployed to $dest1"

# Deploy to Destination 2 (OneDrive)
if (!(Test-Path -Path $dest2)) {
    try {
        New-Item -ItemType Directory -Force -Path $dest2 | Out-Null
        Write-Host "Created OneDrive directory $dest2"
    }
    catch {
        Write-Host "Failed to create directory on OneDrive. Check permissions."
        exit 1
    }
}
try {
    # Clean up old versions in OneDrive to save space (Keep only latest.json and new exe)
    # Remove-Item "$dest2\*.exe" -Force -ErrorAction SilentlyContinue 
    # (User asked to remove old version: "Excluir o que tinha")
    Get-ChildItem -Path "$dest2\*.exe" | Remove-Item -Force -ErrorAction SilentlyContinue
    
    Copy-Item -Path $source -Destination $dest2 -Force
    
    # Create Version Info File (latest.json)
    $jsonContent = @{
        version       = "1.15.85"
        releaseDate   = (Get-Date).ToString("yyyy-MM-dd HH:mm")
        notes         = "Versão v1.15.85: Teste Cloud End-to-End."
        installerPath = $dest2
    } | ConvertTo-Json

    $jsonFile = "$dest2\latest.json"
    $jsonContent | Set-Content -Path $jsonFile
    Write-Host "Created version info at $jsonFile"

    # --- SUPABASE PUBLISH ---
    # Placeholder URL - User must update this manualy or we use the local path as fallback for now
    $WebUrl = "https://hapvida-my.sharepoint.com/:f:/r/personal/jefferson_santos_hapvida_com_br/Documents/JEFFERSON/versoes_app/Version_HapAssistente?csf=1&web=1" 
    
    Write-Host "Publishing to Supabase..."
    node scripts/publish_version.js "1.15.85" "Versão v1.15.85: Teste Cloud End-to-End." $WebUrl
    Write-Host "Deployed to $dest2"
}
catch {
    Write-Host "Failed to copy to OneDrive. Check permissions or connectivity."
    Write-Error $_
}

Write-Host "Deployment Complete!"
