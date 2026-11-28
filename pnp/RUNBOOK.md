# Daily P vs NP update: runbook

One run a day, early morning Pacific time. A scheduled task resumes the Claude Code session that
built this and points it here. The run **prepares** everything and sends Joel the clip; nothing
goes on joelisjoel.org and nothing is posted until Joel says so.

Repos and branches: this folder is in `joelisjoel/joelisjoel`, the site is `joelisjoel/joelisjoel.github.io`;
both use branch `claude/p-np-project-overview-vf39gz`. The environment must allow `pequalnp.com`
and `data.pequalnp.com` (the "Joelisjoel" cloud environment does).

## 1. Data

```bash
DATE=$(TZ=America/Los_Angeles date +%F)          # the version's name
DATA=<scratchpad>/pnp-data                         # reuse between runs: its caches make runs fast
mkdir -p "$DATA"
# a fresh DATA dir starts from the latest snapshot, so "since the last post" still works
[ -f "$DATA/head.json" ] || cp "$(ls snapshots/*.json | tail -1)" "$DATA/head.json"
pipeline/update.sh "$DATA"                         # about 50 requests, plus changed records
cp "$DATA/head.json" "snapshots/$(date -u +%Y-%m-%dT%H%MZ).json"
```

`head_prev.json` must be the snapshot of the **last posted version** (`clip/versions/<last>/head.json`).
If a day was skipped, copy that file over `$DATA/head_prev.json` before building.

## 2. Look for big news first

Compare `head.json` with `head_prev.json` and the program files:
- `breakthrough` is no longer `null`, or any program target (`plan.json` → `target.lemma_id`) is now checked;
- a lemma on the P = NP side is checked;
- new kills on the two sides (the tug data's `attacks` whose victim is on a side);
- the counts: lemmas, checked, refuted, conjectures, outside contributors and steps.

If any of the first two happened, lead with it in the message to Joel, before anything else.

## 3. Refresh the three private pages

Publish each page with its new `data.json` (Artifact tool, `url` set so the link stays the same):

| Page | Source | Data | Link |
|---|---|---|---|
| Tug of war | `pages/tug.html` | `$DATA/out/tug/data.json` | https://claude.ai/artifact/XUrA1GuKmCZyL3rzZNL8fm |
| Roots | `pages/roots.html` | `$DATA/out/roots/data.json` | https://claude.ai/artifact/1fJUacy2TEVW8VFNK39Vh1 |
| Field | `pages/field.html` | `$DATA/out/field/data.json` | https://claude.ai/artifact/MWgWvHaGkfp7HYa6zmKcJP |
| Game (v3, phone first) | `pages/game.html` | `$DATA/out/game/data.json` | https://claude.ai/artifact/1RL4CUU5XgywQuixDDrMVn |

## 4. Script the clip

Write `clip/versions/$DATE/narration.json`, starting from the last version's file. Line ids are
fixed, because `tools/clip_text.py` maps each to a stretch of the record:

| Id | Over | Says |
|---|---|---|
| `o1` | the busiest laser moment (the thumbnail) | what this is, and "here's what's new today" |
| `r1` | hour 0 to the last post, fast | the story so far, one sentence |
| `n1` | the new hours, up to the first new kill on the two sides | the headline change |
| `n3` | the new kills on the two sides | those kills, or the next true change if there were none |
| `n2` | the rest of the new hours | the other change worth saying |
| `e1` | the end card | the checked total; nothing pulls toward P = NP; nothing has reached the claim |

Rules: odds are always the chance that **P = NP** (the surprising answer): our toy odds, Manifold's
"Does P = NP?" and the 2019 poll (12% said P = NP). Polymarket and Kalshi price whether the question
gets settled, either way; say so whenever you quote them. Every number comes from the data and is checked; numbers are spelled as words; captions
use `text` (with ≠ and =) and the voice reads `say` (words). Print each line's phonemes
(`kokoro.tokenizer.phonemize`) and fix anything misread. Say what the data shows, not more:
counts are not odds, and no lemma states P ≠ NP.

## 5. Build and look

```bash
clip/tools/make_version.sh "$DATE" "$DATA"        # about 6 minutes
```

Then look at frames 0 (the thumbnail), one in the story so far, one in the new hours, and the
end card. Check that the captions fit and the voice lines up with the picture (the new kills fire
during `n3`).

## 6. Commit

Commit `clip/versions/$DATE/`, `clip/out/pnp-$DATE.mp4` and the snapshot to this repo and push the branch.

## 7. Prepare the site (do not publish)

In `joelisjoel.github.io`, on the branch:
- refresh the live game: `python3 pipeline/site_game.py pages/game.html $DATA/out/game/data.json <site>/pnp`;
- copy `clip/out/site/pnp-$DATE.mp4` to `videos/`;
- in `_data/home.yml`, item `pequalsnp`: add the new clip at the top of `videos:` (keep the 7
  newest in the list), refresh `images/home/pequalsnp-clip-poster.jpg` from frame 0 (720x720),
  and update the "As of …" sentence with the new numbers;
- `jekyll build` to check, then push the branch. **Do not merge to `main`** until Joel says so.

## 8. Tell Joel

Send the 1080 clip (`clip/out/pnp-$DATE.mp4`) with: big news if any, what changed (numbers),
a suggested post, and the question "publish to joelisjoel.org?". Publishing = fast-forward `main`
to the site branch, then check the live page.

End the message with a reminder to log yesterday's post in the post log (Google Sheet "P vs NP post
log" in the "P vs NP Visualizer" Drive folder): link, impressions, likes, replies, reposts, feature
requests. Read it with Drive `read_file_content` and mention yesterday's numbers if they're there. The
Sheets connector can't write to it yet, so Joel fills it in.

## Storage

Each site clip adds about 2 MB that git keeps forever. Check `git count-objects -vH` in the site
repo now and then; before it nears 800 MB, move older clips to YouTube (`youtube:` on an entry).
