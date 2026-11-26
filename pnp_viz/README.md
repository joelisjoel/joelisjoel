# pnp_viz: picturing the public attack on P vs NP

Visualizations of the public record of [pequalnp.com](https://pequalnp.com/), where a fleet of
AI agents attacks P vs NP in the open and the Lean proof checker decides what counts. The data
is the site's own public export at data.pequalnp.com; this is an independent view, not made by
or affiliated with pequalnp.com.

| Folder | What |
|---|---|
| `pages/` | Three interactive pages, each reading a `data.json` beside it |
| `pipeline/` | Refreshes the record and builds each page's `data.json` |
| `clip/` | Daily 1080x1080 video clips of the tug of war for X, with voiceover; one folder per version |
| `snapshots/` | The record's `head.json` from every data run (counts, for "what changed") |
| `RUNBOOK.md` | The daily update, step by step |

## The pages

- `field.html`: v0, a football field. Lemmas pull left (P = NP) or right (P ≠ NP) by the answer
  their program aims at, with distance from midfield set by plan role; height is time.
- `roots.html`: v1, root systems under the ground. Each program's target sits under the surface,
  its chain is the taproot and its themes are side roots; known results are bedrock. Plays back
  growth over time, with a toy confidence meter whose weights are on the page.
- `tug.html`: v2, a tug of war. One rope per theme; open claims at the front and checked ones
  behind, every lemma in front of what it rests on; color is activity; kills are lasers fired by
  each refuted lemma's negation twin; the claim is the knot at midfield.

- `game.html`: v3, the game, phone first. Truth zones hold each side's checked lemmas; open lemmas stand in the
  grey field by our guess at how likely each is true; the claim is the ball; a scoreboard (targets proved,
  first downs), coaches with sourced quotes, the most active players, and toy odds over time. Also served at
  joelisjoel.org/pnp/ (`pipeline/site_game.py` makes that copy).

They were written as Claude artifacts, which wrap each file in a standard HTML document. To host
one elsewhere, add `<!doctype html>`, a charset and viewport meta, and serve it with its
`data.json` (2 to 3 MB) beside it.

## Data

`pipeline/update.sh <data dir>` fetches the record (about 50 requests, one at a time, plus any
side lemma whose record changed), keeps the previous `head.json` as `head_prev.json`, and writes
`<data dir>/out/{field,roots,tug}/data.json`. The data dir keeps caches between runs.

What the data does and doesn't say:
- Program sides come from each program's `aims_at`. The P = NP search's checked steps are lower
  bounds it used to kill its own candidate algorithms, so the tug of war puts them on the P ≠ NP side.
- Themes are keyword rules over the site's search index (`pipeline/build_roots_data.py`).
- A kill's shooter is named in the record for the programs aiming at an answer; in the grey
  middle it is matched as the adjacent lemma checked in the same minute (true in every case sampled).
- No lemma in the record states P ≠ NP. P = NP appears as "SAT is in P" (L-alg-001), equivalent
  to it by two checked library lemmas.

## The clip

See `clip/README.md` and `RUNBOOK.md`. Clips are named by date: `clip/out/pnp-2026-11-25.mp4`
was the first post (music only), `clip/out/pnp-2026-11-26.mp4` the first daily update with
voiceover, also on joelisjoel.org/projects.
