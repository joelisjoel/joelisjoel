#!/usr/bin/env bash
# Build one dated version of the clip from a day's data run.
#   tools/make_version.sh DATE DATA_DIR
# DATA_DIR is a pipeline/update.sh data dir (head.json, head_prev.json, markets.json, out/<page>/data.json).
# Needs versions/DATE/narration.json (lines o1 r1 n1 n3 n2 e1; see the README).
# CLIP_PAGE picks the page the clip is drawn from:
#   game (default, from Nov 28) pages/game.html (v3, live at joelisjoel.org/pnp): 1920x1080 for posting, 1280x720 for the site
#   tug                         pages/tug.html (v2), the square clips up to 2026-11-27b: 1080x1080, 720x720 for the site
# Writes out/pnp-DATE.mp4 (for posting) and out/site/pnp-DATE.mp4 (for joelisjoel.org),
# and keeps timing.json, clip.json and both head files in versions/DATE/ so the version can be rebuilt.
set -euo pipefail
cd "$(dirname "$0")/.."
DATE=${1:?date YYYY-MM-DD}; DATA=${2:?data dir}; V=versions/$DATE
[ -f "$V/narration.json" ] || { echo "write $V/narration.json first" >&2; exit 1; }
FF=${FFMPEG:-$(python3 -c 'import imageio_ffmpeg as f; print(f.get_ffmpeg_exe())' 2>/dev/null || echo ffmpeg)}
PAGE=${CLIP_PAGE:-game}
case "$PAGE" in
  game) BUILD=tools/build_clip_v3.py; SIZE=1920x1080; SITE=1280:720 ;;
  tug)  BUILD=tools/build_clip.py;    SIZE=1080x1080; SITE=720:720 ;;
  *) echo "CLIP_PAGE is game or tug" >&2; exit 1 ;;
esac
cp "$DATA/out/$PAGE/data.json" data.json
python3 "$BUILD" "../pages/$PAGE.html" clip.html
cp "$V/narration.json" narration.json
python3 tools/tts.py
python3 tools/music.py
rm -f posts.json markets_prev.json; [ -f "$V/posts.json" ] && cp "$V/posts.json" posts.json
# market prices at the last post: the newest earlier version's markets.json (PREV_MARKETS overrides)
if [ -n "${PREV_MARKETS:-}" ]; then cp "$PREV_MARKETS" markets_prev.json
else for pv in $(ls -d versions/*/ | sort -r); do pv=${pv%/}; if [[ "$pv" < "$V" && -f "$pv/markets.json" ]]; then cp "$pv/markets.json" markets_prev.json; break; fi; done; fi
python3 tools/clip_text.py "$DATA/head.json" "$DATA/head_prev.json" data.json "$DATA/markets.json"
rm -rf frames && node tools/render_clip.mjs --size=$SIZE
mkdir -p out/site
SIZE=$SIZE bash tools/encode_vo.sh "out/pnp-$DATE.mp4"
"$FF" -hide_banner -loglevel error -y -i "out/pnp-$DATE.mp4" -vf "scale=$SITE:flags=lanczos" \
  -c:v libx264 -profile:v high -preset slow -crf 24 -pix_fmt yuv420p -c:a copy -movflags +faststart "out/site/pnp-$DATE.mp4"
cp timing.json clip.json "$V/"; cp "$DATA/markets.json" "$V/markets.json" 2>/dev/null || true; cp "$DATA/head.json" "$V/head.json"; cp "$DATA/head_prev.json" "$V/head_prev.json"
"$FF" -hide_banner -i "out/pnp-$DATE.mp4" -vf blackdetect=d=0.2:pix_th=0.02 -af ebur128 -f null - 2>&1 | grep -E "blackdetect|^ +I:" || true
ls -la "out/pnp-$DATE.mp4" "out/site/pnp-$DATE.mp4"
