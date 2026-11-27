#!/usr/bin/env bash
# Encode frames/ (2160x2160 JPEGs) + voiceover + music -> a 1080x1080 clip for X.
# Voice treatment and ducking follow video/pi/tools/encode.sh: a light digital sheen on the
# Kokoro voice, the music ducked under it, loudness normalized to -15 LUFS, last frame held 3 s.
set -euo pipefail
cd "$(dirname "$0")/.."
FF=${FFMPEG:-$(python3 -c 'import imageio_ffmpeg as f; print(f.get_ffmpeg_exe())' 2>/dev/null || echo ffmpeg)}
OUT=${1:-out/pnp-tug-of-war.mp4}
mkdir -p out
"$FF" -hide_banner -loglevel error -y -i audio/vo_track.wav -i audio/music.wav -filter_complex "
[0:a]highpass=f=80,equalizer=f=3500:t=q:w=1.2:g=3,
     chorus=0.7:0.85:21|33:0.20|0.16:0.30|0.40:1.1|0.8,
     aecho=0.85:0.6:19|41:0.16|0.08,
     acrusher=bits=11:mode=log:aa=1:mix=0.10,
     aformat=channel_layouts=stereo,volume=1.6,asplit=2[vo][sc];
[1:a]volume=0.55[m];
[m][sc]sidechaincompress=threshold=0.04:ratio=5:attack=15:release=350:makeup=1[md];
[vo][md]amix=inputs=2:normalize=0:duration=longest,
     loudnorm=I=-15:TP=-1.5:LRA=9[out]" -map "[out]" -ar 48000 audio/mix.wav
"$FF" -hide_banner -loglevel error -stats -y -framerate 30 -i frames/%05d.jpg -i audio/mix.wav \
  -vf "scale=1080:1080:flags=lanczos:in_range=pc:out_range=tv,format=yuv420p,tpad=stop_mode=clone:stop_duration=3" \
  -c:v libx264 -profile:v high -preset slow -crf 20 -pix_fmt yuv420p -tune animation \
  -c:a aac -b:a 160k -ar 48000 -movflags +faststart -shortest "$OUT"
echo "wrote $OUT"
