#!/usr/bin/env bash
# Encode frames/ (2160x2160 JPEGs) + audio/music.wav -> out/pnp-tug-of-war.mp4, a 1080x1080 clip for X.
# Holds the last frame 3 s so the music rings out; music only, normalized to -16 LUFS.
set -euo pipefail
cd "$(dirname "$0")/.."
FF=${FFMPEG:-$(python3 -c 'import imageio_ffmpeg as f; print(f.get_ffmpeg_exe())' 2>/dev/null || echo ffmpeg)}
OUT=${1:-out/pnp-tug-of-war.mp4}
mkdir -p out
"$FF" -hide_banner -loglevel error -stats -y -framerate 30 -i frames/%05d.jpg -i audio/music.wav \
  -vf "scale=1080:1080:flags=lanczos:in_range=pc:out_range=tv,format=yuv420p,tpad=stop_mode=clone:stop_duration=3" \
  -af "loudnorm=I=-16:TP=-1.5:LRA=9" \
  -c:v libx264 -profile:v high -preset slow -crf 20 -pix_fmt yuv420p -tune animation \
  -c:a aac -b:a 160k -ar 48000 -movflags +faststart -shortest "$OUT"
echo "wrote $OUT"
