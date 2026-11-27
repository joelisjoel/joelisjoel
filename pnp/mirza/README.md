# pnp/mirza: the P vs NP attack drawn like Mirza's Riemann map

On November 20, 2026 a Lean proof of the Riemann Hypothesis was released, and Mirza drew all of it
in [A map of a 17-million-line proof](https://bosnadev.com/lab/riemann): each dot is a file, each
thread means "this relies on that", and the theorem sits at the top. This folder draws the public
record of [pequalnp.com](https://pequalnp.com/), an attack on P vs NP still in progress, the same way,
so the two can be seen side by side: a finished proof, and an attempt.

The layout ideas are Mirza's and are credited on the page; the code and the data are ours.

**First demo:** [P vs NP, drawn like the Riemann map](https://claude.ai/artifact/Y8bVsgN74UobuN56U1SEgt) (a private
Claude artifact; snapshot of November 26, 2026, 19:09 UTC).

## Files

| File | What |
|---|---|
| `page.html` | The page: the two towers to one scale (203 levels against 3), the comparison table, and the Spire view of the record (claim, target rings, levels, the floor by program), with select-to-light. Artifact-wrapped like `pnp/pages/*.html` (no doctype); reads `data.json` beside it. 2D canvas, no external scripts or fonts |
| `tools/graph_stats.py` | Loads the record as a graph and measures it (`load`, `levels`, `measure`); every number on the page comes from here |
| `tools/build_mirza_data.py` | Packs the record into the page's `data.json` (about 1.4 MB): per lemma the program, number, status, level and a short title where the cache has one, plus the 163 links, the targets and `graph_stats.py`'s counts. Stops if its arrays disagree with `graph_stats.py` |

## Rebuild

```bash
python3 -I pnp/mirza/tools/graph_stats.py <data dir>                     # the numbers
python3 -I pnp/mirza/tools/build_mirza_data.py <data dir> /tmp/mirza/data.json
```

`<data dir>` is the one `pnp/pipeline/update.sh` fills. Then publish `page.html` with `data.json` beside it (for the
artifact, the Artifact tool's `files` maps `data.json` to the built file); `data.json` is generated, so it isn't
committed. To host it elsewhere, add `<!doctype html>`, a charset and viewport meta. The page loads only its own two
files, so it fits joelisjoel.org's Content-Security-Policy.

## Can we use Mirza's code?

No, we rebuild it.
- **It isn't published.** His [open-source page](https://bosnadev.com/open-source) lists four
  projects, and the Riemann map isn't one of them. GitHub has no repository for it. The page ships
  as one minified script with no license, so all rights are reserved: we can't copy it. Ideas and
  methods (dots and threads, height by chain length, the three arrangements) are fine to reuse with
  credit.
- **It wouldn't fit as is.** It's built around one finished theorem (its main view hangs every file
  below it), it loads its own preprocessed binary data for 175,187 files (about 17 MB), and every
  file in it is checked. Our record has no theorem at the top, three statuses, two possible answers,
  and changes every hour.

If we ever want his code, we ask him. That conversation is worth having anyway.

## What the record looks like as a graph

`tools/graph_stats.py <data dir>` measures it. On November 26, 2026 at 11:09am PT:

| | Riemann proof (Mirza) | pequalnp record |
|---|---|---|
| Pieces | 175,187 files | 23,475 lemmas |
| Links | 753,261 imports | 163 |
| At the top | the theorem | nothing: no lemma states P ≠ NP, and the P = NP candidate is open |
| Longest chain | 203 files | 3 lemmas |
| Largest connected piece | all of it | 24 lemmas |
| Linked to nothing | none | 23,285 lemmas |
| Status | all checked | 11,205 checked, 6,727 open, 5,198 refuted, 345 other |

Links here are each lemma's `depends_on` list in the record; the Lean files may import more, which
would need the proofs repository to check. Of the six program targets, only geometric complexity
theory's rests on anything (3 lemmas).

## Plan (steps 1 to 3 and 5 are in the first demo)

1. **Spire first.** Height is a lemma's level above the basics (the longest chain beneath it). Unlike
   depth below a theorem, it never changes once a lemma is checked, so the picture stays put as the
   record grows. Today that is a wide, flat field with a few low bumps.
2. **Ghost points above it** for the six program targets and, at the top, the claim. The empty
   space between the field and the claim is the story.
3. **Color is status:** checked, open, refuted (dim). Threads are links.
4. **Side by side** with the Riemann numbers (203 tall against 3) for a post on X.
5. **Phone first.** On joelisjoel.org only the site's own files may load, so any library (three.js is
   MIT) is copied into the site. Start in 2D canvas; go 3D only if it earns it.
