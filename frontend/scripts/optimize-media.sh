#!/usr/bin/env bash
#
# Convert phone footage into something a browser will actually play.
#
# Requires ffmpeg:   winget install Gyan.FFmpeg     (then reopen the terminal)
# Run from the frontend directory:   bash scripts/optimize-media.sh
#
# Three things this fixes, all of which break playback today:
#
#   1. CONTAINER. A .MOV is served as video/quicktime, which Chrome and Firefox
#      refuse even when the bytes inside are ordinary H.264. "PP Campus in
#      Operation Side View.MOV" is a true QuickTime container (ftypqt), so it
#      will not play for most visitors.
#
#   2. FASTSTART. Every video here has its moov atom at the END of the file, so
#      the browser must download the whole thing before the first frame appears.
#      On a 36 MB file over a rural connection that is the difference between a
#      video and a blank box. -movflags +faststart moves it to the front.
#
#   3. SIZE. 36 MB for a clip is not a web asset. Everything under public/ is
#      uploaded on every deploy and downloaded by every visitor who opens the
#      page.
#
# Re-encoding is lossy, so the originals are left untouched — output goes to
# public/campus/ under web-friendly names.
set -euo pipefail

PUBLIC="$(cd "$(dirname "${BASH_SOURCE[0]}")/../public" && pwd)"
OUT="$PUBLIC/campus"
mkdir -p "$OUT"

if ! command -v ffmpeg >/dev/null 2>&1; then
  echo "ffmpeg not found on PATH."
  echo "  Install:  winget install Gyan.FFmpeg"
  echo "  Then open a NEW terminal and run this again."
  exit 1
fi

# source file | output name | long edge in px
JOBS=(
  "PP Campus in Operation Side View.MOV|campus-operation-side.mp4|1280"
  "PP Campus in Operation Front View.mp4|campus-operation-front.mp4|1280"
)

for job in "${JOBS[@]}"; do
  IFS='|' read -r src out width <<< "$job"
  if [ ! -f "$PUBLIC/$src" ]; then
    echo "SKIP (not found): $src"
    continue
  fi

  before=$(du -m "$PUBLIC/$src" | cut -f1)
  echo ""
  echo "-> $src  (${before} MB)"

  # crf 26 is a deliberate choice: visually near-identical for this kind of
  # footage, roughly a tenth the size of the phone original. Audio is dropped to
  # 96k mono-ish AAC because nothing here depends on the sound.
  ffmpeg -hide_banner -loglevel error -y \
    -i "$PUBLIC/$src" \
    -vf "scale='min($width,iw)':-2" \
    -c:v libx264 -crf 26 -preset slow -pix_fmt yuv420p \
    -c:a aac -b:a 96k \
    -movflags +faststart \
    "$OUT/$out"

  after_kb=$(du -k "$OUT/$out" | cut -f1)
  echo "   -> campus/$out  ($((after_kb / 1024)) MB)"

  # A poster frame means the card shows something before anyone presses play,
  # instead of a black rectangle.
  poster="${out%.mp4}-poster.jpg"
  ffmpeg -hide_banner -loglevel error -y \
    -i "$OUT/$out" -ss 00:00:01 -vframes 1 -q:v 4 "$OUT/$poster"
  echo "   -> campus/$poster"
done

echo ""
echo "Done. Originals under public/ are untouched — once you are happy with the"
echo "converted versions, delete the large source files so they stop shipping"
echo "with every deploy."
