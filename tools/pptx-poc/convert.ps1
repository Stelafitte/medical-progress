param(
    [Parameter(Mandatory = $true)]
    [string]$InputPptx,

    [Parameter(Mandatory = $true)]
    [string]$OutputDir,

    [string]$PythonExe = "python"
)

$ErrorActionPreference = "Stop"

$source = (Resolve-Path -LiteralPath $InputPptx).Path
if ([System.IO.Path]::GetExtension($source).ToLowerInvariant() -ne ".pptx") {
    throw "Input must be a .pptx file."
}

$output = [System.IO.Path]::GetFullPath($OutputDir)
New-Item -ItemType Directory -Force -Path $output | Out-Null
$rendered = Join-Path $output "_rendered"
New-Item -ItemType Directory -Force -Path $rendered | Out-Null

$powerPoint = New-Object -ComObject PowerPoint.Application
try {
    $deck = $powerPoint.Presentations.Open($source, $true, $false, $false)
    try {
        # 18 = ppSaveAsPNG
        $deck.SaveAs($rendered, 18)
    }
    finally {
        $deck.Close()
    }
}
finally {
    $powerPoint.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($powerPoint) | Out-Null
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
& $PythonExe (Join-Path $scriptDir "build_package.py") `
    --pptx $source `
    --rendered-dir $rendered `
    --output-dir $output `
    --player-dir (Join-Path $scriptDir "player")

if ($LASTEXITCODE -ne 0) {
    throw "Package construction failed with exit code $LASTEXITCODE."
}

Remove-Item -LiteralPath $rendered -Recurse -Force
Write-Output (Join-Path $output "manifest.json")

