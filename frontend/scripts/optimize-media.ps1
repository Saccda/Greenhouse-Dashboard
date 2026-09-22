# Convert phone footage into something a browser will actually play.
#
# PowerShell version of optimize-media.sh, because Windows' `bash` resolves to
# WSL and fails when no Linux distro is installed.
#
#   Requires ffmpeg:   winget install Gyan.FFmpeg    (then open a NEW terminal)
#   Run from the frontend directory:
#       powershell -ExecutionPolicy Bypass -File scripts\optimize-media.ps1
#
# Three faults this fixes, all of which break playback today:
#
#   1. CONTAINER. A .MOV is served as video/quicktime, which Chrome and Firefox
#      refuse even when the bytes inside are ordinary H.264. "PP Campus in
#      Operation Side View.MOV" is a true QuickTime container (ftyp 'qt  '), so
#      it cannot play for most visitors.
#
#   2. FASTSTART. Every video here has its moov atom — the index a decoder needs
#      before it can show a single frame — at 99.7% of the file. The browser
#      must therefore download the whole thing before playback starts. On the
#      36 MB clip that is the difference between a video and a blank box.
#
#   3. SIZE. Everything under public/ is uploaded on every deploy and downloaded
#      by every visitor who opens the page.
#
# Re-encoding is lossy, so the originals are left untouched. Output goes to
# public\campus\ and public\farm\ under web-friendly names.

$ErrorActionPreference = "Stop"

$PublicDir = Join-Path (Split-Path -Parent $PSScriptRoot) "public"
if (-not (Test-Path $PublicDir)) {
    Write-Host "Could not find $PublicDir - run this from the frontend directory." -ForegroundColor Red
    exit 1
}

$ffmpeg = (Get-Command ffmpeg -ErrorAction SilentlyContinue)
if (-not $ffmpeg) {
    Write-Host "ffmpeg not found on PATH." -ForegroundColor Red
    Write-Host "  Install:  winget install Gyan.FFmpeg"
    Write-Host "  Then open a NEW terminal (PATH does not refresh in this one) and re-run."
    exit 1
}

# The Kampot clips are included because they have exactly the same faults as the
# campus ones, so the Overview page has been downloading each in full before the
# first frame.
$Jobs = @(
    @{ Src = "PP Campus in Operation Side View.MOV";  Folder = "campus"; Out = "campus-operation-side.mp4"  }
    @{ Src = "PP Campus in Operation Front View.mp4"; Folder = "campus"; Out = "campus-operation-front.mp4" }
    @{ Src = "InsideFarm.MOV";                        Folder = "farm";   Out = "inside-farm.mp4"           }
    @{ Src = "OutsideFarm.mp4";                       Folder = "farm";   Out = "outside-farm.mp4"          }
    @{ Src = "InsideFarm_Zoom Out View.MOV";          Folder = "farm";   Out = "inside-farm-wide.mp4"      }
    @{ Src = "OutsideFarm_Zoom Out View.MOV";         Folder = "farm";   Out = "outside-farm-wide.mp4"     }
)

$Width = 1280
$totalBefore = 0
$totalAfter = 0

foreach ($job in $Jobs) {
    $src = Join-Path $PublicDir $job.Src
    if (-not (Test-Path $src)) {
        Write-Host "SKIP (not found): $($job.Src)" -ForegroundColor DarkGray
        continue
    }

    $outDir = Join-Path $PublicDir $job.Folder
    if (-not (Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir | Out-Null }
    $dst = Join-Path $outDir $job.Out

    $beforeMB = [math]::Round((Get-Item $src).Length / 1MB, 1)
    $totalBefore += (Get-Item $src).Length
    Write-Host ""
    Write-Host "-> $($job.Src)  ($beforeMB MB)" -ForegroundColor Cyan

    # crf 26 is deliberate: visually near-identical for this footage, roughly a
    # tenth the size of the phone original. Audio drops to 96k AAC because
    # nothing here depends on the sound.
    & ffmpeg -hide_banner -loglevel error -y `
        -i $src `
        -vf "scale='min($Width,iw)':-2" `
        -c:v libx264 -crf 26 -preset slow -pix_fmt yuv420p `
        -c:a aac -b:a 96k `
        -movflags +faststart `
        $dst
    if ($LASTEXITCODE -ne 0) {
        Write-Host "   ffmpeg failed on this file, continuing" -ForegroundColor Yellow
        continue
    }

    $afterMB = [math]::Round((Get-Item $dst).Length / 1MB, 1)
    $totalAfter += (Get-Item $dst).Length
    Write-Host "   -> $($job.Folder)/$($job.Out)  ($afterMB MB)" -ForegroundColor Green

    # A poster frame means the card shows something before anyone presses play,
    # instead of a black rectangle.
    $poster = [System.IO.Path]::GetFileNameWithoutExtension($job.Out) + "-poster.jpg"
    $posterPath = Join-Path $outDir $poster
    & ffmpeg -hide_banner -loglevel error -y -i $dst -ss 00:00:01 -vframes 1 -q:v 4 $posterPath
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   -> $($job.Folder)/$poster" -ForegroundColor Green
    }
}

Write-Host ""
if ($totalBefore -gt 0) {
    $b = [math]::Round($totalBefore / 1MB, 1)
    $a = [math]::Round($totalAfter / 1MB, 1)
    $pct = [math]::Round(100 * (1 - $totalAfter / $totalBefore))
    Write-Host "Total: $b MB -> $a MB  ($pct% smaller)" -ForegroundColor Cyan
}
Write-Host "Originals under public\ are untouched. Once you are happy with the"
Write-Host "converted versions, delete the large sources so they stop shipping"
Write-Host "with every deploy."
