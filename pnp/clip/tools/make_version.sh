#!/usr/bin/env bash
# Build one dated version of the clip from a day's data run.
#   tools/make_version.sh DATE DATA_DIR
# DATA_DIR is a pipeline/update.sh data dir (head.json, head_prev.json, out/tug/data.json).
# Needs versions/DATE/narration.json (lines o1 r1 n1 n3 n2 e1; see the README).
# Writes out/pnp-DATE.mp4 (1080, for posting), out/site/pnp-DATE.mp4 (720, for joelisjoel.org)
# and keeps timing.json, clip.json and both head files in versions/DATE/ so the version can be rebuilt.
set -euo pipefail
cd "$(dirname "$0")/.."
DATE=${1:?date YYYY-MM-DD}; DATA=${2:?data dir}; V=versions/$DATE
[ -f "$V/narration.json" ] || { echo "write $V/narration.json first" >&2; exit 1; }
FF=${FFMPEG:-$(python3 -c 'import imageio_ffmpeg as f; print(f.get_ffmpeg_exe())' 2>/dev/null || echo ffmpeg)}
cp "$DATA/out/tug/data.json" data.json
python3 tools/build_clip.py ../pages/tug.html clip.html
cp "$V/narration.json" narration.json
python3 tools/tts.py
python3 tools/music.py
python3 tools/clip_text.py "$DATA/head.json" "$DATA/head_prev.json" data.json
rm -rf frames && node tools/render_clip.mjs
mkdir -p out/site
bash tools/encode_vo.sh "out/pnp-$DATE.mp4"
"$FF" -hide_banner -loglevel error -y -i "out/pnp-$DATE.mp4" -vf "scale=720:720:flags=lanczos" \
  -c:v libx264 -profile:v high -preset slow -crf 24 -pix_fmt yuv420p -c:a copy -movflags +faststart "out/site/pnp-$DATE.mp4"
cp timing.json clip.json "$V/"; cp "$DATA/head.json" "$V/head.json"; cp "$DATA/head_prev.json" "$V/head_prev.json"
"$FF" -hide_banner -i "out/pnp-$DATE.mp4" -vf blackdetect=d=0.2:pix_th=0.02 -af ebur128 -f null - 2>&1 | grep -E "blackdetect|^ +I:" || true
ls -la "out/pnp-$DATE.mp4" "out/site/pnp-$DATE.mp4"
