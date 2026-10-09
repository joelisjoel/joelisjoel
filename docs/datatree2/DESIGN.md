# Data tree — design & state

The data tree is a family of 3D "living tree" visualizations grown from
the original `docs/images/data_tree.png` artwork, now evolving toward a
general renderer for real hierarchical data (code trees, package graphs).
This is the handoff document: what exists, how it fits together, the
decisions that matter, and where the rough edges are.

## The pieces

| Piece | Path | Role | Owner domain |
|-------|------|------|--------------|
| Player shell | `docs/include/player-shell.js` | Vis-agnostic MiniPlayer host: fullscreen (incl. iOS pseudo-fs), transport, picker drawer, vis registry | shell |
| Player chrome | `docs/include/player-chrome.js` | Shared UI furniture: fullscreen glyphs, hint, transport bar builder | shell |
| Tree zero | `docs/include/tree-zero.js` | `TreeZeroVis` — the original hand-authored scene as a vis-interface class | tree zero |
| Renderer | `docs/datatree2/datatree-vis.js` | `DatatreeVis` — renders any evolution object | renderer |
| Schema | `docs/datatree2/evolution-schema.mjs` | THE contract: schema version, validator, camera envelope constants | schema |
| Tree two data | `docs/datatree2/state-evolution.js` | Hand-authored demo evolution | data |
| Docs tree data | `docs/datatree2/data/dendros-docs.js` | GENERATED from this repo's git history — never hand-edit; regenerate | data |
| Ingester | `ingestion/github-tree-ingest.mjs` | Git history → evolution module (see `ingestion/README.md`) | ingestion |
| Guardrails | `scripts/*.mjs` + `.github/workflows/checks.yml` | Validator, stamp checker, determinism check, render smoke test | guardrails |
| Homepage | `docs/index.html` | Shell + the vis registry (three lazy loaders) | page |
| `/datatree` | `docs/datatree/` | Tree zero standalone, full viewport (visual reference; do not break) | page |
| `/datatree2`, `/datatree2/dendros` | `docs/datatree2/…/index.html` | Standalone evolution pages | page |
| `/looker` | `docs/looker/` | Iframe-friendly embed page (Looker Studio URL embed and other hosts); picks data via `?data=` | page |
| Looker publishing | `publishing/looker/` | Looker Studio community-viz package: dscc wrapper, rows→evolution producer, manifest, build (see its README) | publishing |

**Ownership for parallel agents:** work is partitioned by the domains
above. An agent changing the shell touches `include/player-*.js` and
pages; an agent extending the renderer touches `datatree-vis.js` (and the
schema, with a version bump, if the contract grows); an agent improving
ingestion touches `ingestion/`; data modules are regenerated, not edited.
Cross-domain changes go through the two contracts below — if you need
something from another domain that the contract doesn't offer, extend the
contract explicitly rather than reaching into internals.

## The two contracts

### 1. The evolution schema (data ↔ renderer ↔ ingestion)

`dataTreeStateEvolution` is a plain object: `meta` (**`schemaVersion`**,
`duration`, `loop: 'pingpong'`, `tourStops`), `graph.nodes` (kinds
`root`/`branch`/`twig`/`bloom`; `parent` links; `pos` and optional `via`
routing points as **placement annotations**, as if from a prior layout
algorithm), `flies` (identity + role + start only), and `actions` (a
time-ordered list of intents: `steer`, `orbit` tight/wide, `beam` with
heal amount). **No trajectories are ever stored** — the vis integrates fly
motion (exponential anchor lerp + seeded lissajous hover), so node
positions can change without invalidating the data.

The contract is machine-checked, not prose: `evolution-schema.mjs`
exports `SCHEMA_VERSION`, `validateEvolution()`, `CAMERA_ENVELOPE` (the
normalization target producers must respect and the hard bound the
camera choreography assumes), and `ROOT_ID` (`'root'` — DatatreeVis
anchors the trunk by that id). `DatatreeVis` asserts the schema at
construction; the ingester validates before writing;
`scripts/validate-data.mjs` validates every committed data module in CI.
**Growing the schema means bumping `SCHEMA_VERSION` in that one module
and updating its validator in the same change** — producers and consumers
then fail loudly instead of drifting.

Two properties make the "Tenet rewind" ping-pong playback work and must
be preserved in any extension:

1. **Vitality is a pure function of time**: `hp(t) = hp0 − decay·t +
   Σ heals delivered by t`, clamped. No mutable HP state.
2. **Evolution time** is a triangle wave of the master clock, so
   everything derived from it evaluates cleanly in both directions (beam
   dashes march on evolution time so they rewind).

(Tree zero predates the schema and keeps live mutable HP internally;
that's fine because nothing replays or rewinds it.)

### 2. The vis interface (shell ↔ scenes)

Every scene the shell can host implements:

```js
/**
 * @typedef {Object} Vis
 * @property {boolean} playing     get/set — master clock runs when true
 * @property {boolean} suspended   set — hidden behind another vis; the
 *                                 scene idles cheaply (clock frozen, no
 *                                 rendering) but keeps its rAF alive
 * @property {boolean} manualMode  read — manual flight engaged
 * @property {number}  PERIOD_MS   read — ms of one transport cycle
 *                                 (60s camera loop for tree zero,
 *                                 2×duration for evolutions)
 * @method fraction()              → [0,1) — current transport position
 * @method seekToFraction(frac)    jump the clock. MUST stay within the
 *                                 current cycle so absolute-time motion
 *                                 (wind phase, firefly hops) never
 *                                 lurches; snap the camera and never
 *                                 integrate decay across the jump
 * @method setManual(on)           enter/exit manual flight
 * @method resize()                re-fit renderer to container
 */
```

Constructed with `{ chrome: false }` a vis is headless — no hint /
fullscreen / transport UI and no click handling — and the host owns all
chrome. With chrome on (the standalone pages), the vis builds its own
from `player-chrome.js`. These members are the API the homepage depends
on; treat any change as a cross-domain contract change.

The homepage registry lives IN `docs/index.html`: an array of
`{ id, title, sub, thumb, load(wrapper) → Promise<Vis> }`. Every vis —
tree zero included — lazy-builds on first selection. Adding a vis means
adding one card there; no shared module changes.

## Architecture notes

- **DatatreeVis** amplifies the graph into ~470 seeded filaments by
  walking each leaf's ancestor chain (`chainFor`, expanding `via`
  points); the landscape (mound + Cartesian grid) is purely cosmetic and
  lives entirely in the vis layer.
- **PlayerShell** owns the master-clock *controls* only; each vis owns
  its own clock (`simNow`), pausable and seekable. Scrubs snap the
  camera and clamp HP integration; manual flight keeps real-time `dt` so
  a paused scene can be roamed.
- **iOS fallback**: iPhone Safari has no element-fullscreen API, so the
  shell (and tree zero's standalone chrome) pin the container over the
  page (class `pseudo-fs`) and dispatch a synthetic `fullscreenchange`
  so every listener reacts identically. `resize()` implementations check
  `closest('.pseudo-fs')`.
- **Ingestion**: `ingestion/github-tree-ingest.mjs` (zero-dep Node,
  needs git CLI) turns a repo subtree + history into an evolution
  module. Placement: height ≈ directory depth; children ring their
  parent radially in alphabetical order (start angle hashed from parent
  id → deterministic); ring radius decays 0.7× per level; a fixed-order
  de-crowding pass repels same-depth nodes in xz; the result normalizes
  into `CAMERA_ENVELOPE` from the schema module. Activity is
  recency-weighted (14d half-life); the hottest nodes bloom and start
  sicker; the 10 most recent bloom-touching commits replay as
  steer/orbit/beam sequences. `--now` pins the clock for reproducible
  output.

## Seeded determinism

Everything random in scene generation is `mulberry32`-seeded (SEED
1337); every load builds the identical tree. When editing generation
code, **never remove `rand()` draws without replacing them** — later
draws shift and the whole tree changes (this bit us once). This rule is
now machine-enforced: `scripts/smoke-test.mjs` hashes tree zero's and
tree two's generated geometry buffers against
`scripts/golden-geometry.json` in CI. A deliberate visual change
re-goldens with `node scripts/smoke-test.mjs --update-golden`; an
accidental one fails the build.

## Guardrails

`npm run checks` locally, or the `checks` workflow on every PR:

| Check | Script | Catches |
|-------|--------|---------|
| Schema | `scripts/validate-data.mjs` | Committed data modules violating the evolution contract |
| Stamps | `scripts/check-stamps.mjs` | A changed module still carrying its old `?v=` stamp on the base branch, or references disagreeing on a stamp |
| Determinism | `scripts/check-ingest-determinism.mjs` | The ingester rolling different dice across runs |
| Smoke + goldens | `scripts/smoke-test.mjs` | Page errors on any player page; seeded geometry drifting from golden |

The smoke test needs `npm install --no-save three@0.163.0 playwright`
(pinned: three matches the pages' importmaps; playwright pins the
browser so geometry goldens stay stable).

## Repo workflow (applies to all front-end work here)

- `main` IS prod (GitHub Pages, dendroslabs.com, serving `docs/`). Flow:
  feature branch → PR → squash-merge. One PR per change batch.
- **Cache stamps**: phones cache aggressively. Every changed module
  needs its `?v=N` bumped in every referencing page — including import
  specifiers inside modules (e.g. `datatree-vis.js` importing the schema
  and chrome modules, and the registry in `index.html`). One bump per PR
  is enough; the stamp checker enforces this against the base branch.
- **Local testing**: no network for esm.sh in the sandbox —
  `scripts/smoke-test.mjs` handles the whole dance (vendors `three` from
  node_modules into `docs/vendor_tmp/`, rewrites importmaps into
  `_test.html` twins, serves, screenshots via `--shots <dir>`, cleans
  up). `.gitignore` covers `vendor_tmp/` and `_test*.html` so scaffolding
  can't land in a commit.

## Shortcomings / future observations

- The evolution schema has no notion of nodes appearing/disappearing
  over time — the graph is static across the window. Real "edits to a
  code tree" will eventually want add/remove actions (grow/wither
  animations). That's a `SCHEMA_VERSION` 2 conversation.
- Beam `heal` is delivered as a step at beam end; a ramp during the beam
  would read better on scrub.
- The transport slider represents different timelines per vis (camera
  loop vs evolution round trip). Consistent but subtle; consider
  labeling the mode in the readout.
- Generated data (`data/dendros-docs.js`) is committed, not built in CI.
  A scheduled action re-running the ingester would keep the docs tree
  current automatically (the determinism check makes those diffs
  trustworthy).
- Tree zero's flower "game" uses live `Math.random()` state, so its
  beams/HP don't survive a scrub the way evolutions do. Porting it onto
  an authored evolution object would unify the two — at the cost of its
  emergent feel.
