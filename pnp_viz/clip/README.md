# P vs NP tug of war: a 43-second clip for X

A square (1080x1080) clip of the tug-of-war view of the pequalnp.com agent fleet's
public record: 85 hours of lemmas appearing, kills as lasers, and the claim at midfield.
Music only, no narration.

The clip is drawn by the same code as the published tug-of-war page, with the controls
hidden, the knot held at midfield (the page's toy confidence model stays off a public clip),
larger labels, and overlays for the title, clock, tallies and captions.

## Steps

1. `python3 tools/build_clip.py ../pages/tug.html clip.html`: turns the page into the clip page.
   Copy the record's `data.json` (built from data.pequalnp.com) beside it.
2. `python3 tools/music.py`: the score from the `video/pi` explainer in dendroslabs/dendroslabs.github.io, timed by `timing.json`
   (title 4 s, hours 0-42 in 12 s, hours 42-85 in 18 s, end card 6 s).
3. `node tools/render_clip.mjs`: 1,200 frames at 2160x2160, in order, since lemma positions
   ease from frame to frame. `--only=780,990` renders just those frames for a check.
4. `bash tools/encode.sh`: scales to 1080, holds the last frame 3 s, x264 CRF 20.

`clip.html`, `data.json`, `clip.json`, `frames/` and `audio/` are not committed.

## Daily update with voiceover (from Nov 26)

The update clip opens on the busiest moment for lasers on the two sides, so X's thumbnail
(the first frame) is the most interesting frame, with its caption already up. A Kokoro
voiceover (`af_heart`, speed 0.95) says what is new since the last post; captions are the
spoken lines, word for word, with symbols (P ≠ NP) where the voice says words.

1. Write `narration.json` (lines `o1` open, `r1` story so far, `n1`, `n3`, `n2` what's new, `e1` totals;
   a `say` field holds the spoken form when the caption uses symbols). Check phonemes first.
2. `python3 tools/tts.py`: voice wavs and `timing.json` (slots rounded up to beats at 120 bpm).
3. `python3 tools/music.py`: score and voice track from `timing.json`.
4. `python3 tools/clip_text.py <head.json> <previous head.json> data.json`: maps each line to a
   stretch of record time (the cold open at the laser peak, the story so far up to the last post,
   the new hours split at the new kills) and writes `clip.json`.
5. `node tools/render_clip.mjs`, then `bash tools/encode_vo.sh <out.mp4>`: voice sheen and music
   ducking as in that explainer, -15 LUFS.

## Updating with fresh data

1. `../pipeline/update.sh <data dir>`: refetches the record from data.pequalnp.com (about 50
   requests, plus any side lemma whose record changed), keeps the previous `head.json` as
   `head_prev.json`, and writes the three pages' `data.json` files to `<data dir>/out/`.
   The data dir keeps caches (side lemma records, refuted records), so later runs fetch little.
2. Republish the field, roots and tug-of-war pages with their new `data.json`.
3. Copy `<data dir>/out/tug/data.json` here as `data.json`, then
   `python3 tools/clip_text.py <data dir>/head.json <data dir>/head_prev.json` writes `clip.json`
   (hours, counts, captions, and a "since yesterday's post" line).
4. Rebuild `clip.html`, render and encode as above.

The Nov 26 11:09am PT update: 23,475 lemmas (+6,255), 11,176 checked (+3,075), 5,194 refuted (+81).
The kills nearly stopped overnight while outside agents kept adding results.

## Timeline

| Video | Record | Caption |
|---|---|---|
| 0-4 s | before hour 0 | Title card |
| 4-10 s | hours 0-21 | The fleet builds chains toward P ≠ NP targets |
| 10-16 s | hours 21-42 | Outside agents start joining |
| 16-24.5 s | hours 42-62 | The grey middle fills; white flashes are kills |
| 24.5-34 s | hours 62-85 | Blue lasers: P ≠ NP lemmas killed by their exact opposite |
| 34-43 s | hour 85 | End card: 8,101 checked, none toward P = NP, nothing reaches the claim |
