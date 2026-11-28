# P vs NP tug of war: clips for X

One clip per day (`out/pnp-YYYY-MM-DD.mp4`), each rebuilt from `versions/YYYY-MM-DD/`
(narration, timing, clip text and the two record snapshots it compares). Build a new one with
`tools/make_version.sh DATE DATA_DIR`; the daily steps are in `../RUNBOOK.md`.

From Nov 28 the clip is **16:9 (1920x1080)** and drawn from the **v3 page, `../pages/game.html`**
(the one live at joelisjoel.org/pnp), by `tools/build_clip_v3.py`. Clips up to `2026-11-27b` are
square (1080x1080) and drawn from `../pages/tug.html` by `tools/build_clip.py`; `CLIP_PAGE=tug
tools/make_version.sh …` still builds that kind.

## The 16:9 clip (from Nov 28)

`tools/build_clip_v3.py ../pages/game.html clip.html` keeps only the page's field: the stands
(neutral lemmas, the library and meta-complexity programs, above and below the field, with the
snipers among them), the truth zones, ropes, knot, lasers and target lines. The page's controls,
scoreboard, benches, odds timeline, legend and text are hidden. The field is drawn at half size and
scaled up 2x, with labels a little larger again, so they and the lasers read on a phone held
landscape. Kills in the stands are rings a little larger than the page's.

- **Header**: eyebrow, title, the record clock with "hour N of M", and four tallies counted the way
  the page draws them: checked toward P = NP (its truth zone), open in the grey field (the open
  lemmas on the two sides), in the stands (every neutral lemma and sniper shown), checked toward
  P ≠ NP.
- **Knot**: stays at the centre. The page moves it only when the P = NP search's target is proved;
  the page's toy odds only drive its hidden timeline. `render_clip.mjs` prints a note if the knot
  ever leaves the centre.
- **Overlays**: captions in a band under the field, the gold date tag just above them, the markets
  or X-posts panel over the middle of the field, and the end card.
- `render_clip.mjs` renders at 1920x1080 with device scale factor 2 (`--size`, `--dsf`);
  `encode_vo.sh` scales to 1920x1080 (`SIZE=`), and `make_version.sh` writes the site copy at
  1280x720.

## The first clip (Nov 25)

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
3. Copy `<data dir>/out/game/data.json` here as `data.json` (`out/tug/` for the square clip), then
   `python3 tools/clip_text.py <data dir>/head.json <data dir>/head_prev.json` writes `clip.json`
   (hours, counts, captions, and a "since yesterday's post" line).
4. Rebuild `clip.html` (`tools/build_clip_v3.py ../pages/game.html clip.html`), render and encode as above.
   `tools/make_version.sh` does steps 3 and 4, and the voiceover steps, in one go.

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
