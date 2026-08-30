<#
.SYNOPSIS
    Convertit un PowerPoint commente en paquet apprenant.

.DESCRIPTION
    PowerPoint est utilise pour ce que lui seul sait faire fidelement : rendre
    les diapositives. Deux rendus sont demandes.

    1. Une image PNG par diapositive : nette, legere, suffisante pour une
       diapositive statique.
    2. Une video du diaporama entier, avec les minutages et la narration. C'est
       le seul rendu qui preserve les animations et les boucles video incluses
       dans les diapositives. Elle est ensuite decoupee en un clip par
       diapositive.

    Le reste (audio, minutages, textes, sommaire) est extrait directement de
    l'OOXML, sans PowerPoint.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\tools\pptx-poc\convert.ps1 `
      -InputPptx 'C:\cours\module6.pptx' `
      -OutputDir 'C:\cours\module6-package'

.EXAMPLE
    # Diaporama sans animation ni video : le rendu video est inutile.
    ... -SkipVideo
#>
param(
    [Parameter(Mandatory = $true)]
    [string]$InputPptx,

    [Parameter(Mandatory = $true)]
    [string]$OutputDir,

    [string]$PythonExe = "python",

    [switch]$SkipVideo,

    [int]$VideoHeight = 1080,

    [int]$FramesPerSecond = 30,

    [int]$VideoQuality = 85
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
$deckVideo = Join-Path $output "_deck.mp4"
$derived = Join-Path $output "_derived"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

$powerPoint = New-Object -ComObject PowerPoint.Application
try {
    $deck = $powerPoint.Presentations.Open($source, $true, $false, $false)
    try {
        Write-Output "Rendu des diapositives en PNG..."
        # 18 = ppSaveAsPNG
        $deck.SaveAs($rendered, 18)

        if (-not $SkipVideo) {
            if (Test-Path -LiteralPath $deckVideo) {
                Remove-Item -LiteralPath $deckVideo -Force
            }
            Write-Output "Export video du diaporama (animations, videos, narration)..."
            Write-Output "  Cette etape est longue : comptez plusieurs minutes."
            # UseTimingsAndNarrations = $true : sans cela, PowerPoint impose une
            # duree fixe par diapositive et la narration part en vrille.
            $deck.CreateVideo($deckVideo, $true, 5, $VideoHeight, $FramesPerSecond, $VideoQuality)

            # 1 = en cours, 2 = en file, 3 = termine, 4 = echec
            $lastReport = [DateTime]::UtcNow
            while ($deck.CreateVideoStatus -eq 1 -or $deck.CreateVideoStatus -eq 2) {
                Start-Sleep -Seconds 2
                if (([DateTime]::UtcNow - $lastReport).TotalSeconds -ge 20) {
                    $size = 0
                    if (Test-Path -LiteralPath $deckVideo) {
                        $size = (Get-Item -LiteralPath $deckVideo).Length / 1MB
                    }
                    Write-Output ("  ... en cours ({0:N1} Mo ecrits)" -f $size)
                    $lastReport = [DateTime]::UtcNow
                }
            }
            if ($deck.CreateVideoStatus -eq 4) {
                throw "PowerPoint n'a pas reussi a produire la video du diaporama."
            }
            Write-Output "Video du diaporama produite."
        }
    }
    finally {
        $deck.Close()
    }
}
finally {
    $powerPoint.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($powerPoint) | Out-Null
}

$videoArgs = @()
if (-not $SkipVideo) {
    Write-Output "Decoupage en clips par diapositive..."
    & $PythonExe (Join-Path $scriptDir "split_deck_video.py") `
        --pptx $source `
        --video $deckVideo `
        --out-dir $derived
    if ($LASTEXITCODE -ne 0) {
        throw "Slide video split failed with exit code $LASTEXITCODE."
    }
    $videoArgs = @("--video-dir", (Join-Path $derived "video"))
}

Write-Output "Assemblage du paquet..."
& $PythonExe (Join-Path $scriptDir "build_package.py") `
    --pptx $source `
    --rendered-dir $rendered `
    --output-dir $output `
    --player-dir (Join-Path $scriptDir "player") `
    @videoArgs

if ($LASTEXITCODE -ne 0) {
    throw "Package construction failed with exit code $LASTEXITCODE."
}

Remove-Item -LiteralPath $rendered -Recurse -Force
if (Test-Path -LiteralPath $derived) { Remove-Item -LiteralPath $derived -Recurse -Force }
if (Test-Path -LiteralPath $deckVideo) { Remove-Item -LiteralPath $deckVideo -Force }

Write-Output (Join-Path $output "manifest.json")
