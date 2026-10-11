# Metacube — design & state

Live at `/metacube/` on Joel is Joel (moved from dendroslabs.com/metacube).
A floating cube whose six faces are miniature dioramas; the viewer spins it
and inspects each scene.
This document is the handoff: current state, the decisions that shaped it,
and known shortcomings.

## Current state (complete, stable)

All six faces are finished and merged to prod:

| Face | File | Scene |
|------|------|-------|
| 1 | `faces/face1-chessboard.js` | Chessboard with pieces (`chess-pieces.js`) |
| 2 | `faces/face2-mandelbrot.js` | Animated Mandelbrot topography |
| 3 | `faces/face3-clock.js` | Mechanical clock with a real going train |
| 4 | `faces/face4-hologram.js` | Robot workshop with volumetric hologram |
| 5 | `faces/face5-staircase.js` | Escher "Relativity" room with walking figures |
| 6 | `faces/face6-strangeloop.js` | Strange-loop knot on a fluted pedestal |

`index.html` owns the shared scene: renderer (shadow maps enabled), the
cube shell (`cube.receiveShadow`), a high-resolution Milky Way stellar
backdrop, and a sunlight source placed behind the viewer so the near face
is always lit.

## Architecture

- Each face module exports a build function that populates a THREE.Group
  local to its face; faces are self-contained and know nothing about each
  other. Adding a face means adding a module and mounting its group on the
  cube shell.
- **Rotation** is quaternion-based free-body rotation with angular
  momentum: drags apply torque, momentum persists, and spin is capped at
  0.5 rotations/sec. Do not reintroduce Euler-angle rotation — it was
  replaced deliberately to avoid gimbal issues and to make momentum feel
  physical.
- **Touch drag** maps finger movement to rotation in the same direction on
  both axes. This was fixed twice (an inversion was added, then removed);
  the current mapping is the verified-correct one — see git history before
  "fixing" it again.

## Face-specific decisions worth knowing

- **Clock (face 3)**: the movement is a physically-plausible going train —
  gear ratios are real, so hands and wheels stay coherent. The assembly is
  sunk into a circular well cut into the face, behind a pierced chapter
  ring with Roman numerals.
- **Mandelbrot (face 2)**: log-scale topography, animation slowed 5×, the
  fringe "breathes" with the set. A black skirt frame with `DoubleSide`
  material hides a see-through artifact at the face edge — keep it.
- **Hologram workshop (face 4)**: the most detailed scene. Real-time
  shadows, procedural normal maps (`normalMapFromHeight` helper), lathe-
  profiled bodies, a volumetric hologram (ghost layers + motes + a 14s
  message loop), idle motion, a humanoid protocol droid and kneeling human
  at 0.7 scale. Character proportions were tuned against a reference image
  — preserve relative scale if editing.
- **Staircase (face 5)**: faithful to Escher's *Relativity* — three gravity
  orientations with figures walking loops. Walls carry a hatched-plaster
  texture and doorway decals evoking the lithograph. The interior palette
  is deliberately darker with a material color multiplier: exterior
  sunlight passes through geometry (no shadow occlusion inside), so
  brightness is controlled in the material, not the lights.

## Shortcomings / future observations

- No level-of-detail management: all six faces build and animate at full
  detail permanently. Phones cope today, but the next face added should
  probably introduce visibility-based animation gating (skip updating
  faces pointing away from the camera).
- The stellar background is a generated texture at fixed resolution;
  regenerating at runtime costs a frame spike on load.
- Face modules share copy-pasted helper patterns (materials, normal-map
  generation). A shared `faces/lib.js` would cut duplication if the
  project grows.
- No automated tests; verification is by Playwright screenshots (see the
  workflow notes in `docs/datatree2/DESIGN.md`, which apply repo-wide).
