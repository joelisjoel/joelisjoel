// TreeZeroVis: the original Dendros data-tree banner as a live 3D scene,
// rebuilt to match the source artwork's anatomy. A hand-traced skeleton
// (trunk profile and major windswept limbs digitized from the original
// image) is amplified by a SEEDED generator into hundreds of filaments that
// flow continuously from the golden base, braid up the trunk as a woven
// cable, and stream out along the limbs — every load produces the identical
// tree. All strands merge into one geometry per material; wind lives in the
// vertex shader (per-vertex flexibility), and a bokeh shader gives depth of
// focus.
//
// Unlike DatatreeVis this scene is hand-authored, not data-driven: the
// flower "game" (HP decay, firefly nurses, healing beams) runs on live
// mutable state rather than a replayable evolution object. It implements
// the same vis interface (playing, suspended, manualMode, PERIOD_MS,
// fraction, seekToFraction, setManual, resize) so a PlayerShell can host it
// interchangeably with evolution-driven vises.
//
// SEEDED DETERMINISM: every generation stream below is mulberry32-seeded.
// Never remove a rand() draw without replacing it — later draws shift and
// the whole tree changes.
import * as THREE from 'three';
import {
    FS_ENTER_ICON, FS_EXIT_ICON, HINT_FLY, HINT_FLYING,
    buildHint, buildFullscreenButton,
} from './player-chrome.js?v=1';

const SEED = 1337;
function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// --- Palette sampled from the source image ---

const CORE = new THREE.Color(0xcfeeff);
const CYAN = new THREE.Color(0x52c8f0);
const TEAL_DEEP = new THREE.Color(0x1b6a8c);
const GOLD = new THREE.Color(0xe8b850);
const GOLD_BRIGHT = new THREE.Color(0xffd98a);
const TREE_CENTER = new THREE.Vector3(0, 1.25, 0);

const FLOWER_YELLOW = new THREE.Color(0xffdf6e);
const FLOWER_CORE = new THREE.Color(0xfff3c8);
const FLOWER_NAMES = ['energy', 'teams', 'code', 'health', 'revenue', 'reliability', 'growth'];

// HP color ladder: golden-yellow at full health, sinking through orange
// and brown to black at zero
const HEALTHY_GOLDEN = new THREE.Color(0xffd98a);
const HP_ORANGE = new THREE.Color(0xff8a2a);
const HP_BROWN = new THREE.Color(0x5e2c06);
const HP_BLACK = new THREE.Color(0x0e0703);
const CARE_THRESHOLD = 80; // below this, the flies start to worry
function hpColor(h) {
    if (h > 2 / 3) return HP_ORANGE.clone().lerp(HEALTHY_GOLDEN, (h - 2 / 3) * 3);
    if (h > 1 / 3) return HP_BROWN.clone().lerp(HP_ORANGE, (h - 1 / 3) * 3);
    return HP_BLACK.clone().lerp(HP_BROWN, h * 3);
}

// --- The traced skeleton ---
// Trunk: a vertical axis with the artwork's flare-waist-flare radius profile.
const TRUNK_BASE_Y = 0.12;
const TRUNK_TOP_Y = 1.05;
function trunkRadius(t) {
    // t 0 at base, 1 at crown: wide flare, narrow waist, flare into limbs
    const flareBase = Math.pow(1 - t, 2.2) * 0.42;
    const flareTop = Math.pow(t, 2.6) * 0.2;
    return 0.13 + flareBase + flareTop;
}
function trunkPoint(t) {
    return new THREE.Vector3(
        Math.sin(t * 2.1) * 0.04,
        TRUNK_BASE_Y + t * (TRUNK_TOP_Y - TRUNK_BASE_Y),
        Math.sin(t * 1.3 + 1) * 0.03
    );
}

// Major limbs, digitized from the image: mostly horizontal, windswept wide,
// with depth variation for parallax. Weight = share of trunk filaments that
// flow into the limb.
const LIMB_SPECS = [
    { weight: 3, points: [[-0.06, 1.0, 0.0], [-0.6, 1.18, 0.12], [-1.3, 1.38, -0.1], [-1.9, 1.52, 0.15]] },
    { weight: 2, points: [[-0.03, 1.08, 0.05], [-0.48, 1.5, -0.15], [-1.05, 1.82, 0.05], [-1.5, 1.95, -0.1]] },
    { weight: 2, points: [[0.0, 1.12, -0.05], [0.12, 1.65, 0.1], [0.05, 2.05, -0.05]] },
    { weight: 3, points: [[0.06, 1.02, 0.04], [0.58, 1.28, 0.15], [1.3, 1.48, -0.05], [1.9, 1.58, 0.1]] },
    { weight: 2, points: [[0.06, 0.98, -0.06], [0.62, 1.02, -0.2], [1.35, 1.0, 0.0], [1.8, 1.15, -0.18]] },
    { weight: 1.5, points: [[-0.05, 0.95, 0.08], [-0.52, 0.92, 0.32], [-1.15, 1.02, 0.45], [-1.55, 1.2, 0.4]] },
    { weight: 1.5, points: [[0.03, 1.08, -0.1], [0.42, 1.5, -0.38], [0.95, 1.78, -0.5], [1.3, 1.9, -0.4]] },
];

// Shared wind displacement, identical in every shader and mirrored on the
// CPU for sprites, so parts sway as one body
const WIND_GLSL = /* glsl */`
    uniform float uTime;
    attribute float aFlex;
    attribute float aPhase;
    vec3 windOffset(vec3 p) {
        float gust = 0.4 + 0.6 * (0.5 + 0.5 * sin(uTime * 0.35 + p.x * 0.4));
        float s1 = sin(uTime * 1.1 + aPhase + p.y * 1.3);
        float s2 = sin(uTime * 2.3 + aPhase * 1.7 + p.x * 0.8);
        float s3 = cos(uTime * 0.9 + aPhase);
        return vec3(s1, s2 * 0.25, s3 * 0.6) * (aFlex * 0.0275 * gust);
    }
`;

export class TreeZeroVis {
    constructor(container, options = {}) {
        this.container = container;
        // chrome:false renders headless — no hint/fullscreen UI and no
        // click handling — for a host shell that supplies its own player
        // chrome and drives the clock through the vis interface
        this.chrome = options.chrome !== false;
        this.suspended = false;
        // Density scales every element count: phones build the same tree
        // from the same seed at reduced weight
        this.density = (window.innerWidth || 1024) < 700 ? 0.6 : 1;

        this._buildGeometryArrays();
        this._generateTree();
        this._generateWebs();
        this._generateMound();
        this._generateTerrain();
        this._generateFlowers();
        this._generateMotes();
        this._buildScene();
        this._buildFireflies();
        this._buildHealth();
        this._buildLabels();
        this._buildCamera();
        this._buildControls();

        this._lastFrame = null;
        this._animate = this._animate.bind(this);
        requestAnimationFrame(this._animate);
    }

    // ------------------------------------------------------------------
    // Geometry accumulation
    // ------------------------------------------------------------------
    _buildGeometryArrays() {
        this.linePositions = [];
        this.lineColors = [];
        this.lineFlex = [];
        this.linePhase = [];
        this.nodePositions = [];
        this.nodeColors = [];
        this.nodeSizes = [];
        this.nodeFlex = [];
        this.nodePhase = [];
    }

    _pushSegment(a, b, ca, cb, fa, fb, phase) {
        this.linePositions.push(a.x, a.y, a.z, b.x, b.y, b.z);
        this.lineColors.push(ca.r, ca.g, ca.b, cb.r, cb.g, cb.b);
        this.lineFlex.push(fa, fb);
        this.linePhase.push(phase, phase);
    }

    _pushNode(p, color, size, flex, phase) {
        this.nodePositions.push(p.x, p.y, p.z);
        this.nodeColors.push(color.r, color.g, color.b);
        this.nodeSizes.push(size);
        this.nodeFlex.push(flex);
        this.nodePhase.push(phase);
    }

    // ------------------------------------------------------------------
    // Filament generation: base -> woven trunk -> limb stream -> tip splay
    // ------------------------------------------------------------------
    _generateTree() {
        const rand = mulberry32(SEED);
        const randRange = (a, b) => a + (b - a) * rand();

        this.limbs = LIMB_SPECS.map((spec) => ({
            weight: spec.weight,
            curve: new THREE.CatmullRomCurve3(spec.points.map((p) => new THREE.Vector3(...p))),
        }));
        // Sub-branches: each limb spawns children partway along, continuing
        // the limb's sweep with their own spread — a full extra level
        for (const limb of this.limbs) {
            limb.subs = [];
            for (let i = 0; i < 5; i++) {
                const t0 = 0.4 + rand() * 0.35;
                const origin = limb.curve.getPoint(t0);
                const tangent = limb.curve.getTangent(t0);
                const spread = new THREE.Vector3(randRange(-1, 1), randRange(-0.1, 0.9), randRange(-1, 1))
                    .normalize().multiplyScalar(0.55);
                const dir = tangent.clone().add(spread).normalize();
                const len = (0.45 + rand() * 0.5) * (limb.weight / 3 + 0.4);
                const mid = origin.clone().addScaledVector(dir, len * 0.5)
                    .add(new THREE.Vector3(randRange(-0.08, 0.08), randRange(0, 0.12), randRange(-0.08, 0.08)));
                const end = origin.clone().addScaledVector(dir, len)
                    .add(new THREE.Vector3(randRange(-0.08, 0.08), randRange(0.04, 0.2), randRange(-0.08, 0.08)));
                limb.subs.push({ t0, curve: new THREE.CatmullRomCurve3([origin, mid, end]) });
            }
        }

        const FILAMENT_COUNT = Math.round(380 * this.density);
        const SAMPLES_PER_FILAMENT = 34;

        // Pick a limb for a filament by weight, keyed to its azimuth so
        // bundles leave the crown coherently
        const limbPool = [];
        this.limbs.forEach((limb, index) => {
            for (let i = 0; i < limb.weight * 10; i++) limbPool.push(index);
        });

        // Filament sample arrays are kept for cross-linking afterwards
        this.filamentTracks = [];

        for (let f = 0; f < FILAMENT_COUNT; f++) {
            const phase = rand() * Math.PI * 2;
            const isGold = rand() < 0.08;
            const brightness = 0.35 + rand() * 0.65;
            const interior = rand() < 0.35; // inner-weave strands read darker
            const theta0 = rand() * Math.PI * 2;
            const twist = randRange(1.0, 2.4) * (rand() < 0.5 ? -1 : 1);
            const radialSeat = randRange(0.55, 1.0);
            const limb = this.limbs[limbPool[Math.floor(rand() * limbPool.length)]];

            // Tip splay: past this limb fraction the filament peels away
            // along its own persistent deviation, forming twigs without
            // explicit sub-splines
            const peelAt = randRange(0.45, 0.9);
            const deviation = new THREE.Vector3(randRange(-1, 1), randRange(-0.2, 1), randRange(-1, 1))
                .normalize().multiplyScalar(randRange(0.25, 0.7));

            const controls = [];
            // Base tail: seated out on the flare, dipping toward the ground
            const baseDir = theta0 + randRange(-0.3, 0.3);
            controls.push(new THREE.Vector3(
                Math.cos(baseDir) * randRange(0.5, 0.95),
                randRange(0.0, 0.06),
                Math.sin(baseDir) * randRange(0.5, 0.95)
            ));
            // Trunk climb: helix seated on the radius profile with braid wobble
            const trunkSteps = 10;
            for (let i = 0; i <= trunkSteps; i++) {
                const t = i / trunkSteps;
                const axis = trunkPoint(t);
                const theta = theta0 + twist * t + Math.sin(t * 7 + phase) * 0.18;
                const r = trunkRadius(t) * radialSeat * (1 + Math.sin(t * 9 + phase * 2) * 0.08);
                controls.push(new THREE.Vector3(
                    axis.x + Math.cos(theta) * r,
                    axis.y,
                    axis.z + Math.sin(theta) * r
                ));
            }
            // Limb stream: follow the limb spline on a shrinking offset;
            // nearly half the filaments divert onto one of the limb's
            // sub-branches partway out
            const subLimb = rand() < 0.6 ? limb.subs[Math.floor(rand() * limb.subs.length)] : null;
            const limbSteps = 9;
            const offsetAngle = rand() * Math.PI * 2;
            for (let i = 1; i <= limbSteps; i++) {
                const t = i / limbSteps;
                const on = (subLimb && t > subLimb.t0)
                    ? subLimb.curve.getPoint(Math.min((t - subLimb.t0) / (1 - subLimb.t0), 1))
                    : limb.curve.getPoint(Math.min(t, 1));
                const shrink = 0.085 * (1 - t * 0.8);
                const wobble = Math.sin(t * 6 + phase) * 0.02;
                const p = new THREE.Vector3(
                    on.x + Math.cos(offsetAngle + t * 3) * shrink + wobble,
                    on.y + Math.sin(offsetAngle + t * 3) * shrink,
                    on.z + Math.sin(offsetAngle * 1.3 + t * 2) * shrink
                );
                if (t > peelAt) {
                    const peel = (t - peelAt) / (1 - peelAt);
                    p.addScaledVector(deviation, peel * peel);
                }
                controls.push(p);
            }

            const curve = new THREE.CatmullRomCurve3(controls);
            const samples = curve.getPoints(SAMPLES_PER_FILAMENT);
            const track = { samples, phase, limb, flex: [], colors: [] };

            for (let i = 0; i < samples.length; i++) {
                const p = samples[i];
                // Flexibility: rigid at the base, freest at the twig tips
                const heightFactor = THREE.MathUtils.clamp((p.y - 0.25) / 1.6, 0, 1);
                const reachFactor = THREE.MathUtils.clamp((Math.hypot(p.x, p.z) - 0.2) / 1.6, 0, 1);
                track.flex.push(Math.pow(Math.max(heightFactor, reachFactor * 0.9), 1.6) * (0.35 + 0.65 * reachFactor));

                // Color: golden near the ground (merging into the root
                // mound), teal-to-cyan above, with interior strands darker
                let color;
                if (isGold) {
                    color = GOLD.clone().lerp(GOLD_BRIGHT, brightness * 0.6);
                } else {
                    const body = (interior ? TEAL_DEEP : CYAN).clone().lerp(CORE, brightness * (interior ? 0.15 : 0.45));
                    const goldMix = 1 - THREE.MathUtils.smoothstep(p.y, 0.12, 0.45);
                    color = body.lerp(GOLD, goldMix * 0.85);
                }
                track.colors.push(color);
            }
            this.filamentTracks.push(track);

            for (let i = 0; i < samples.length - 1; i++) {
                this._pushSegment(samples[i], samples[i + 1], track.colors[i], track.colors[i + 1],
                    track.flex[i], track.flex[i + 1], phase);
            }

            // Twiglets: short offshoots near the tip thicken the canopy body
            for (let tw = 0; tw < 3; tw++) {
                const startIndex = samples.length - 1 - Math.floor(randRange(2, 8));
                const start = samples[startIndex];
                const tangent = samples[Math.min(startIndex + 1, samples.length - 1)].clone().sub(start).normalize();
                const spread = new THREE.Vector3(randRange(-1, 1), randRange(-0.4, 1), randRange(-1, 1))
                    .normalize().multiplyScalar(0.7);
                const dir = tangent.add(spread).normalize();
                let prevTw = start;
                const twigLength = randRange(0.08, 0.2);
                for (let sIdx = 1; sIdx <= 3; sIdx++) {
                    const f2 = sIdx / 3;
                    const next = start.clone().addScaledVector(dir, twigLength * f2)
                        .add(new THREE.Vector3(randRange(-0.015, 0.015), randRange(-0.015, 0.015), randRange(-0.015, 0.015)));
                    this._pushSegment(prevTw, next, track.colors[startIndex], track.colors[startIndex],
                        track.flex[startIndex], Math.min(1, track.flex[startIndex] + f2 * 0.2), phase);
                    prevTw = next;
                }
                if (rand() < 0.85) {
                    this._pushNode(prevTw, CYAN.clone().lerp(CORE, rand()), randRange(0.012, 0.03),
                        Math.min(1, track.flex[startIndex] + 0.2), phase);
                }
            }

            // Extra glints scattered along the limb run
            for (let g = 0; g < 4; g++) {
                if (rand() < 0.6) {
                    const gi = Math.floor(randRange(samples.length * 0.5, samples.length - 1));
                    this._pushNode(samples[gi], CYAN.clone().lerp(CORE, rand() * 0.7),
                        randRange(0.01, 0.03), track.flex[gi], phase);
                }
            }

            // Junction glints where the filament crests the crown, and a tip
            // node (The old crown glint placed a node at the same height on
            // every filament, forming a distracting ring around the trunk —
            // removed. The draws are kept so the seeded stream stays aligned.)
            if (rand() < 0.95) {
                randRange(0.015, 0.035);
            }
            const last = samples.length - 1;
            this._pushNode(samples[last], isGold ? GOLD_BRIGHT : CYAN.clone().lerp(CORE, rand()),
                randRange(0.02, 0.05), track.flex[last], phase);
        }

        // Cross-links weave neighboring filaments together through the trunk
        // and crown, with a bright node where each link lands
        const LINK_TRIES = Math.round(520 * this.density);
        for (let l = 0; l < LINK_TRIES; l++) {
            const a = this.filamentTracks[Math.floor(rand() * this.filamentTracks.length)];
            const ia = Math.floor(randRange(6, 20)); // trunk-and-crown span
            const pa = a.samples[ia];
            let best = null;
            let bestDist = 0.14;
            for (let probe = 0; probe < 12; probe++) {
                const b = this.filamentTracks[Math.floor(rand() * this.filamentTracks.length)];
                if (b === a) continue;
                const ib = Math.min(ia + Math.floor(randRange(-2, 3)), b.samples.length - 1);
                const pb = b.samples[ib];
                const d = pa.distanceTo(pb);
                if (d > 0.015 && d < bestDist) { best = { track: b, index: ib }; bestDist = d; }
            }
            if (best) {
                const pb = best.track.samples[best.index];
                this._pushSegment(pa, pb, a.colors[ia], best.track.colors[best.index],
                    a.flex[ia], best.track.flex[best.index], a.phase);
                if (rand() < 0.35) {
                    this._pushNode(pb, CORE, randRange(0.012, 0.03), best.track.flex[best.index], best.track.phase);
                }
            }
        }
    }

    // ------------------------------------------------------------------
    // Canopy web clouds: the artwork's dense plexus masses around the limb
    // ends. Flattened ellipsoids of scattered points, each stitched to its
    // two nearest neighbors and anchored back onto the filament tips.
    // ------------------------------------------------------------------
    _generateWebs() {
        const webRand = mulberry32(SEED + 3);
        const WEB_CYAN = CYAN.clone().lerp(TEAL_DEEP, 0.45);
        for (const limb of this.limbs) {
            const clouds = [
                { at: 0.3, scale: 0.5 },
                { at: 0.45, scale: 0.62 },
                { at: 0.72, scale: 0.85 },
                { at: 1.0, scale: 1.05 },
            ];
            for (const sub of limb.subs) {
                clouds.push({ center: sub.curve.getPoint(1), scale: 0.55 });
            }
            for (const cloud of clouds) {
                const center = cloud.center || limb.curve.getPoint(cloud.at);
                const w = (limb.weight / 3) * cloud.scale;
                const radii = new THREE.Vector3(0.62 * w, 0.24 * w + 0.08, 0.46 * w);
                const count = Math.round((70 + limb.weight * 40 * cloud.scale) * this.density);
                const cloudPhase = webRand() * Math.PI * 2;

                // Scatter inside the flattened ellipsoid, biased to its skin
                const pts = [];
                for (let i = 0; i < count; i++) {
                    const u = webRand() * Math.PI * 2;
                    const v = Math.acos(2 * webRand() - 1);
                    const shell = 0.45 + 0.55 * Math.sqrt(webRand());
                    pts.push(new THREE.Vector3(
                        center.x + Math.sin(v) * Math.cos(u) * radii.x * shell,
                        center.y + Math.cos(v) * radii.y * shell,
                        center.z + Math.sin(v) * Math.sin(u) * radii.z * shell
                    ));
                }

                // Stitch each point to its two nearest neighbors
                for (let i = 0; i < pts.length; i++) {
                    const dists = pts.map((q, j) => ({ j, d: i === j ? Infinity : pts[i].distanceTo(q) }));
                    dists.sort((a, b) => a.d - b.d);
                    for (let n = 0; n < 2; n++) {
                        const q = pts[dists[n].j];
                        const phase = cloudPhase + webRand() * 0.7;
                        const shade = WEB_CYAN.clone().lerp(CYAN, webRand() * 0.6);
                        this._pushSegment(pts[i], q, shade, shade, 0.55, 0.55, phase);
                    }
                    // Sparse glow nodes, power-law sized, rare gold sparks
                    if (webRand() < 0.75) {
                        const spark = webRand() < 0.08;
                        this._pushNode(pts[i],
                            spark ? GOLD_BRIGHT : CYAN.clone().lerp(CORE, Math.pow(webRand(), 2)),
                            0.01 + Math.pow(webRand(), 2.2) * 0.055,
                            0.55, cloudPhase + webRand() * 0.7);
                    }
                }

                // Anchor strands: tie the web back to this limb's tips
                const tips = [];
                for (const track of this.filamentTracks) {
                    if (track.limb === limb) tips.push(track);
                }
                const anchors = Math.min(16, tips.length);
                for (let a = 0; a < anchors; a++) {
                    const track = tips[Math.floor(webRand() * tips.length)];
                    const tipIndex = track.samples.length - 1 - Math.floor(webRand() * 4);
                    const tip = track.samples[tipIndex];
                    let best = pts[0];
                    let bestD = Infinity;
                    for (const q of pts) {
                        const d = tip.distanceTo(q);
                        if (d < bestD) { best = q; bestD = d; }
                    }
                    if (bestD < 1.2) {
                        const shade = WEB_CYAN.clone().lerp(CYAN, 0.4);
                        this._pushSegment(tip, best, track.colors[tipIndex], shade,
                            track.flex[tipIndex], 0.55, track.phase);
                    }
                }
            }
        }
    }

    // ------------------------------------------------------------------
    // The golden root mound: a dome of horizontally woven fiber, densest
    // and brightest at the rim, with a plexus net over the crown.
    // ------------------------------------------------------------------
    _generateMound() {
        this.MOUND_RADIUS = 1.18;
        this.MOUND_HEIGHT = 0.3;
        const MOUND_RADIUS = this.MOUND_RADIUS;
        const MOUND_HEIGHT = this.MOUND_HEIGHT;
        const moundRand = mulberry32(SEED + 11);
        const moundSurface = (azimuth, r) => {
            const rr = Math.min(r, MOUND_RADIUS);
            return new THREE.Vector3(
                Math.cos(azimuth) * rr,
                MOUND_HEIGHT * (1 - Math.pow(rr / MOUND_RADIUS, 2)) - 0.02,
                Math.sin(azimuth) * rr
            );
        };
        const moundGold = (r) => {
            // Brighter toward the rim, like the artwork's edge-lit fibers
            const rim = Math.pow(THREE.MathUtils.clamp(r / MOUND_RADIUS, 0, 1), 2.2);
            return GOLD.clone().multiplyScalar(0.45 + 0.2 * rim).lerp(GOLD_BRIGHT, rim * 0.75);
        };
        // Woven arcs sweeping around the dome
        for (let i = 0; i < Math.round(150 * this.density); i++) {
            const a0 = moundRand() * Math.PI * 2;
            const sweep = (1.2 + moundRand() * 2.6) * (moundRand() < 0.5 ? -1 : 1);
            const rBase = 0.35 + moundRand() * 0.8;
            const rDip = moundRand() * 0.5;
            const phase = moundRand() * Math.PI * 2;
            const steps = 12;
            let prev = null;
            let prevColor = null;
            for (let sIdx = 0; sIdx <= steps; sIdx++) {
                const f = sIdx / steps;
                const azimuth = a0 + sweep * f;
                const r = rBase + Math.sin(f * Math.PI) * rDip * (moundRand() < 0.5 ? -1 : 1) * 0.5
                    + (moundRand() - 0.5) * 0.05;
                const pt = moundSurface(azimuth, Math.abs(r));
                pt.y += (moundRand() - 0.5) * 0.02;
                const color = moundGold(Math.abs(r));
                if (prev) this._pushSegment(prev, pt, prevColor, color, 0.02, 0.02, phase);
                prev = pt;
                prevColor = color;
            }
            if (moundRand() < 0.25) {
                this._pushNode(prev, GOLD_BRIGHT, 0.012 + Math.pow(moundRand(), 2) * 0.03, 0.02, phase);
            }
        }
        // Plexus net across the crown of the mound
        {
            const netPts = [];
            for (let i = 0; i < Math.round(70 * this.density); i++) {
                const azimuth = moundRand() * Math.PI * 2;
                const r = Math.sqrt(moundRand()) * 0.75;
                const pt = moundSurface(azimuth, r);
                pt.y += 0.015;
                netPts.push(pt);
            }
            for (let i = 0; i < netPts.length; i++) {
                const dists = netPts.map((q, j) => ({ j, d: i === j ? Infinity : netPts[i].distanceTo(q) }));
                dists.sort((a, b) => a.d - b.d);
                for (let n = 0; n < 2; n++) {
                    const q = netPts[dists[n].j];
                    const c = moundGold(Math.hypot(netPts[i].x, netPts[i].z));
                    this._pushSegment(netPts[i], q, c, c, 0.02, 0.02, moundRand() * Math.PI * 2);
                }
                if (moundRand() < 0.2) {
                    this._pushNode(netPts[i], GOLD_BRIGHT, 0.01 + Math.pow(moundRand(), 2) * 0.025, 0.02, moundRand() * 6);
                }
            }
        }
    }

    // ------------------------------------------------------------------
    // Landscape: a Cartesian wire grid rolling away to the horizon. Hills
    // swell with distance via layered sines; near the tree the grid carries
    // the mound's gold, fading to brown earth far out.
    // ------------------------------------------------------------------
    _generateTerrain() {
        const terrainRand = mulberry32(SEED + 19);
        const T_EXTENT = 24;
        const T_SPACING = this.density < 1 ? 0.38 : 0.27;
        const T_CLEAR = 0.3; // only the trunk core itself stays clear
        const BROWN_NEAR = new THREE.Color(0x8a5f24);
        const BROWN_FAR = new THREE.Color(0x372512);
        const { MOUND_RADIUS, MOUND_HEIGHT } = this;
        const terrainHeight = (x, z) => {
            const d = Math.hypot(x, z);
            const roll = Math.sin(x * 0.31 + 0.8) * Math.sin(z * 0.27 + 2.1)
                + 0.5 * Math.sin(x * 0.11 - z * 0.17 + 1.0)
                + 0.3 * Math.sin(x * 0.53 + z * 0.41);
            const amplitude = 0.03 + THREE.MathUtils.clamp((d - 1.3) / 5, 0, 1) * 0.32;
            const hills = -0.02 + roll * amplitude;
            // Warp up onto the root mound: near the tree the grid rides the
            // dome just beneath the golden weave, meeting it seamlessly
            const domeSpan = MOUND_RADIUS * 1.08;
            const domeBump = d < domeSpan
                ? (MOUND_HEIGHT - 0.02) * (1 - Math.pow(d / domeSpan, 2))
                : 0;
            return hills + domeBump;
        };
        const terrainColor = (x, z) => {
            const d = Math.hypot(x, z);
            const near = GOLD.clone().multiplyScalar(0.7)
                .lerp(BROWN_NEAR, THREE.MathUtils.smoothstep(d, 1.15, 3.4));
            return near.lerp(BROWN_FAR, THREE.MathUtils.smoothstep(d, 2.5, 16));
        };
        const steps = Math.round((T_EXTENT * 2) / T_SPACING);
        const gridPoint = (x, z) => new THREE.Vector3(x, terrainHeight(x, z), z);
        for (let axis = 0; axis < 2; axis++) {
            for (let i = 0; i <= steps; i++) {
                const fixed = -T_EXTENT + i * T_SPACING + (terrainRand() - 0.5) * T_SPACING * 0.25;
                let prev = null;
                let prevColor = null;
                for (let j = 0; j <= steps; j++) {
                    const along = -T_EXTENT + j * T_SPACING;
                    const x = axis === 0 ? fixed : along;
                    const z = axis === 0 ? along : fixed;
                    if (Math.hypot(x, z) < T_CLEAR) { prev = null; continue; }
                    const pt = gridPoint(x, z);
                    const color = terrainColor(x, z);
                    if (prev) this._pushSegment(prev, pt, prevColor, color, 0.0, 0.0, 0);
                    prev = pt;
                    prevColor = color;
                }
            }
        }
        // Dim gold glints scattered across the near-to-mid field
        for (let i = 0; i < Math.round(90 * this.density); i++) {
            const x = (terrainRand() - 0.5) * 14;
            const z = (terrainRand() - 0.5) * 14;
            if (Math.hypot(x, z) < T_CLEAR) continue;
            this._pushNode(gridPoint(x, z).add(new THREE.Vector3(0, 0.01, 0)),
                terrainColor(x, z).lerp(GOLD_BRIGHT, 0.35),
                0.008 + Math.pow(terrainRand(), 2) * 0.02, 0.0, 0);
        }
    }

    // ------------------------------------------------------------------
    // Flowers: seven small clusters of yellow nodes nested in the canopy,
    // one per limb, each with petal strands and a bright core
    // ------------------------------------------------------------------
    _generateFlowers() {
        this.flowers = [];
        const flowerRand = mulberry32(SEED + 23);
        this.limbs.forEach((limb) => {
            const at = 0.72 + flowerRand() * 0.2;
            // Lifted clear of the web clouds so each bloom reads from afar
            const center = limb.curve.getPoint(at).add(new THREE.Vector3(
                (flowerRand() - 0.5) * 0.15,
                0.16 + flowerRand() * 0.14,
                (flowerRand() - 0.5) * 0.15
            ));
            const phase = flowerRand() * Math.PI * 2;
            this.flowers.push({ center, phase });

            for (let petal = 0; petal < 16; petal++) {
                const dir = new THREE.Vector3(flowerRand() - 0.5, flowerRand() - 0.5, flowerRand() - 0.5).normalize();
                const reach = 0.03 + Math.pow(flowerRand(), 0.7) * 0.075;
                const pos = center.clone().addScaledVector(dir, reach);
                this._pushNode(pos,
                    flowerRand() < 0.3 ? FLOWER_CORE : FLOWER_YELLOW.clone().lerp(GOLD_BRIGHT, flowerRand() * 0.5),
                    0.068 + flowerRand() * 0.076, 0.45, phase);
                if (flowerRand() < 0.5) {
                    this._pushSegment(center, pos, GOLD, FLOWER_YELLOW, 0.45, 0.45, phase);
                }
            }
            this._pushNode(center, FLOWER_CORE, 0.23, 0.45, phase);
            // Stem reaching up to the name label
            this._pushSegment(center, center.clone().add(new THREE.Vector3(0, 0.075, 0)),
                GOLD, FLOWER_CORE, 0.45, 0.45, phase);
        });
    }

    // Drifting ambient motes
    _generateMotes() {
        const moteRand = mulberry32(SEED + 7);
        for (let i = 0; i < Math.round(240 * this.density); i++) {
            this._pushNode(
                new THREE.Vector3((moteRand() - 0.5) * 8, moteRand() * 3.6, (moteRand() - 0.5) * 8),
                moteRand() < 0.15 ? GOLD : CYAN,
                0.012 + moteRand() * 0.035,
                0.6, moteRand() * Math.PI * 2
            );
        }
    }

    // ------------------------------------------------------------------
    // Scene assembly: one draw call for all strands, one for all glows
    // ------------------------------------------------------------------
    _buildScene() {
        this.scene = new THREE.Scene();
        {
            // Vertical gradient sky matching the artwork's grade
            const sky = document.createElement('canvas');
            sky.width = 16;
            sky.height = 256;
            const ctx = sky.getContext('2d');
            const g = ctx.createLinearGradient(0, 0, 0, 256);
            g.addColorStop(0, '#0c2c44');
            g.addColorStop(0.45, '#071b2c');
            g.addColorStop(1, '#02090f');
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, 16, 256);
            const skyTexture = new THREE.CanvasTexture(sky);
            skyTexture.colorSpace = THREE.SRGBColorSpace;
            this.scene.background = skyTexture;
        }
        this.scene.fog = new THREE.Fog(0x071b2c, 8, 30);

        // Soft radial-glow sprite texture shared by atmosphere billboards
        const glowTexture = (inner, outer) => {
            const c = document.createElement('canvas');
            c.width = 128;
            c.height = 128;
            const ctx = c.getContext('2d');
            const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
            g.addColorStop(0, inner);
            g.addColorStop(1, outer);
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, 128, 128);
            const t = new THREE.CanvasTexture(c);
            t.colorSpace = THREE.SRGBColorSpace;
            return t;
        };
        const addGlowSprite = (texture, position, scale, opacity) => {
            const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
                map: texture, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending,
            }));
            sprite.position.copy(position);
            sprite.scale.set(scale.x, scale.y, 1);
            this.scene.add(sprite);
        };
        const goldGlow = glowTexture('rgba(240, 185, 90, 0.9)', 'rgba(240, 185, 90, 0)');
        const tealGlow = glowTexture('rgba(70, 150, 200, 0.7)', 'rgba(70, 150, 200, 0)');
        // Horizon blaze behind the root mound
        addGlowSprite(goldGlow, new THREE.Vector3(0, 0.12, -0.6), new THREE.Vector2(4.6, 1.1), 0.28);
        addGlowSprite(goldGlow, new THREE.Vector3(0, 0.05, 0.0), new THREE.Vector2(3.0, 0.6), 0.22);
        // Teal haze banks behind the canopy
        addGlowSprite(tealGlow, new THREE.Vector3(-1.6, 1.7, -2.2), new THREE.Vector2(4.2, 2.4), 0.14);
        addGlowSprite(tealGlow, new THREE.Vector3(1.8, 1.5, -2.4), new THREE.Vector2(3.8, 2.2), 0.12);
        // A few big out-of-focus foreground bokeh blobs
        addGlowSprite(tealGlow, new THREE.Vector3(-2.6, 0.7, 2.3), new THREE.Vector2(0.55, 0.55), 0.2);
        addGlowSprite(goldGlow, new THREE.Vector3(2.4, 0.4, 2.6), new THREE.Vector2(0.4, 0.4), 0.16);
        addGlowSprite(tealGlow, new THREE.Vector3(3.0, 2.2, 1.8), new THREE.Vector2(0.7, 0.7), 0.12);

        this.lineMaterial = new THREE.ShaderMaterial({
            uniforms: { uTime: { value: 0 }, uFocus: { value: 3.5 } },
            vertexShader: /* glsl */`
                uniform float uFocus;
                varying vec3 vColor;
                varying float vAlpha;
                ${WIND_GLSL}
                void main() {
                    vColor = color;
                    vec4 mv = modelViewMatrix * vec4(position + windOffset(position), 1.0);
                    float defocus = abs(-mv.z - uFocus);
                    vAlpha = 0.16 + 0.84 / (1.0 + defocus * defocus * 0.55);
                    gl_Position = projectionMatrix * mv;
                }
            `,
            fragmentShader: /* glsl */`
                varying vec3 vColor;
                varying float vAlpha;
                void main() { gl_FragColor = vec4(vColor, vAlpha * 0.62); }
            `,
            vertexColors: true,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });

        this.nodeMaterial = new THREE.ShaderMaterial({
            uniforms: { uTime: { value: 0 }, uFocus: { value: 3.5 }, uPixelScale: { value: 300 } },
            vertexShader: /* glsl */`
                attribute float aSize;
                uniform float uFocus;
                uniform float uPixelScale;
                varying vec3 vColor;
                varying float vAlpha;
                ${WIND_GLSL}
                void main() {
                    vColor = color;
                    vec4 mv = modelViewMatrix * vec4(position + windOffset(position), 1.0);
                    float depth = -mv.z;
                    float defocus = abs(depth - uFocus);
                    float blur = 1.0 + defocus * 1.6;
                    gl_PointSize = aSize * blur * (uPixelScale / depth);
                    vAlpha = 1.0 / (1.0 + defocus * defocus * 1.4);
                    gl_Position = projectionMatrix * mv;
                }
            `,
            fragmentShader: /* glsl */`
                varying vec3 vColor;
                varying float vAlpha;
                void main() {
                    float d = length(gl_PointCoord - 0.5);
                    float disc = smoothstep(0.5, 0.12, d);
                    gl_FragColor = vec4(vColor, disc * vAlpha);
                }
            `,
            vertexColors: true,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });

        const lineGeometry = new THREE.BufferGeometry();
        lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(this.linePositions, 3));
        lineGeometry.setAttribute('color', new THREE.Float32BufferAttribute(this.lineColors, 3));
        lineGeometry.setAttribute('aFlex', new THREE.Float32BufferAttribute(this.lineFlex, 1));
        lineGeometry.setAttribute('aPhase', new THREE.Float32BufferAttribute(this.linePhase, 1));
        this.scene.add(new THREE.LineSegments(lineGeometry, this.lineMaterial));

        const nodeGeometry = new THREE.BufferGeometry();
        nodeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(this.nodePositions, 3));
        nodeGeometry.setAttribute('color', new THREE.Float32BufferAttribute(this.nodeColors, 3));
        nodeGeometry.setAttribute('aSize', new THREE.Float32BufferAttribute(this.nodeSizes, 1));
        nodeGeometry.setAttribute('aFlex', new THREE.Float32BufferAttribute(this.nodeFlex, 1));
        nodeGeometry.setAttribute('aPhase', new THREE.Float32BufferAttribute(this.nodePhase, 1));
        this.scene.add(new THREE.Points(nodeGeometry, this.nodeMaterial));
    }

    // ------------------------------------------------------------------
    // Fireflies: live points that hover around the flowers on lissajous
    // drifts and occasionally shuttle to another flower along an arcing
    // bezier. Their anchor moves continuously, so hover and travel blend
    // without a snap.
    // ------------------------------------------------------------------
    _buildFireflies() {
        this.FIREFLY_COUNT = 50;
        this.fireflies = [];
        const ffRand = mulberry32(SEED + 31);
        for (let i = 0; i < this.FIREFLY_COUNT; i++) {
            this.fireflies.push({
                from: Math.floor(ffRand() * this.flowers.length),
                to: null,
                u: 0,
                duration: 1,
                ctrl: new THREE.Vector3(),
                nextHop: 2 + ffRand() * 10,
                ax: 0.7 + ffRand() * 1.6,
                ay: 0.9 + ffRand() * 1.8,
                az: 0.6 + ffRand() * 1.4,
                p1: ffRand() * Math.PI * 2,
                p2: ffRand() * Math.PI * 2,
                p3: ffRand() * Math.PI * 2,
                rx: 0.08 + ffRand() * 0.16,
                ry: 0.05 + ffRand() * 0.1,
                rz: 0.08 + ffRand() * 0.16,
                baseSize: (0.17 + ffRand() * 0.17) * (1 + Math.pow(ffRand(), 3)), // a few run to 2x
                flicker: 2 + ffRand() * 3,
                roamer: ffRand() < 0.3, // 30% keep wandering the whole tree
                ampScale: 1,
            });
        }
        this.fireflyPositions = new Float32Array(this.FIREFLY_COUNT * 3);
        this.fireflySizes = new Float32Array(this.FIREFLY_COUNT);
        this.fireflyGeometry = new THREE.BufferGeometry();
        this.fireflyGeometry.setAttribute('position', new THREE.BufferAttribute(this.fireflyPositions, 3).setUsage(THREE.DynamicDrawUsage));
        {
            const ffColors = new Float32Array(this.FIREFLY_COUNT * 3);
            const ffZero = new Float32Array(this.FIREFLY_COUNT);
            const violet = new THREE.Color(0x9b4dff);
            const lilac = new THREE.Color(0xd18bff);
            for (let i = 0; i < this.FIREFLY_COUNT; i++) {
                const c = violet.clone().lerp(lilac, (i % 5) / 5);
                ffColors[i * 3] = c.r; ffColors[i * 3 + 1] = c.g; ffColors[i * 3 + 2] = c.b;
            }
            this.fireflyGeometry.setAttribute('color', new THREE.BufferAttribute(ffColors, 3));
            this.fireflyGeometry.setAttribute('aSize', new THREE.BufferAttribute(this.fireflySizes, 1).setUsage(THREE.DynamicDrawUsage));
            this.fireflyGeometry.setAttribute('aFlex', new THREE.BufferAttribute(ffZero, 1));
            this.fireflyGeometry.setAttribute('aPhase', new THREE.BufferAttribute(ffZero.slice(), 1));
        }

        // Fireflies render as four-pointed stars: a hot core with vertical
        // and horizontal spikes, in the bokeh-sizing vertex path — far less
        // defocus swell than the bokeh nodes, so the stars stay crisp
        this.fireflyMaterial = new THREE.ShaderMaterial({
            uniforms: { uTime: { value: 0 }, uFocus: { value: 3.5 }, uPixelScale: { value: 300 } },
            vertexShader: /* glsl */`
                attribute float aSize;
                uniform float uFocus;
                uniform float uPixelScale;
                varying vec3 vColor;
                varying float vAlpha;
                ${WIND_GLSL}
                void main() {
                    vColor = color;
                    vec4 mv = modelViewMatrix * vec4(position + windOffset(position), 1.0);
                    float depth = -mv.z;
                    float defocus = abs(depth - uFocus);
                    float blur = 1.0 + defocus * 0.45;
                    gl_PointSize = aSize * blur * (uPixelScale / depth);
                    vAlpha = 1.0 / (1.0 + defocus * defocus * 0.35);
                    gl_Position = projectionMatrix * mv;
                }
            `,
            fragmentShader: /* glsl */`
                varying vec3 vColor;
                varying float vAlpha;
                void main() {
                    vec2 c = gl_PointCoord - 0.5;
                    // A hard diamond core with thin, sharply tapered blades
                    float m = abs(c.x) + abs(c.y);
                    float core = 1.0 - smoothstep(0.03, 0.052, m);
                    float spikeX = pow(max(0.0, 1.0 - 2.0 * abs(c.x)), 2.0) * exp(-abs(c.y) * 220.0);
                    float spikeY = pow(max(0.0, 1.0 - 2.0 * abs(c.y)), 2.0) * exp(-abs(c.x) * 220.0);
                    float glow = 0.35 * exp(-30.0 * dot(c, c));
                    float star = clamp(spikeX + spikeY + core + glow, 0.0, 1.0);
                    vec3 tint = mix(vColor, vec3(1.0), core * 0.85 + glow * 0.3);
                    gl_FragColor = vec4(tint, star * vAlpha);
                }
            `,
            vertexColors: true,
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
        });
        this.scene.add(new THREE.Points(this.fireflyGeometry, this.fireflyMaterial));
        this._fireflyScratch = new THREE.Vector3();
        this._fireflyAnchor = new THREE.Vector3();
    }

    // ------------------------------------------------------------------
    // Flower health: nodes periodically sicken to a pulsing orange; the
    // fireflies flock to them and shoot beams of code that restore the
    // node back to yellow. LIVE state — every bloom starts with random HP
    // and bleeds 1-3 HP each second; firefly injections restore 10-30.
    // ------------------------------------------------------------------
    _buildHealth() {
        this.flowerHealth = this.flowers.map((flower, i) => ({
            hp: Math.random() * 100,
            decayRate: 1 + Math.random() * 2,
            lastBeamAt: 0,
            node: flower.center.clone().add(
                new THREE.Vector3(Math.cos(i * 2.4), 0.5, Math.sin(i * 2.4)).normalize().multiplyScalar(0.06)
            ),
            phase: flower.phase,
        }));
        this.sickFlowers = []; // indices below the care threshold
        this._lastHealthT = null;

        this.MAX_BEAMS = 4;
        this.BEAM_DASHES = 7;
        this.BEAM_DURATION = 2.0;
        this.activeBeams = [];
        // Flashlight cones, one per beam slot: apex at the firefly,
        // spreading toward the node, in the fireflies' violet
        this.flashlights = [];
        {
            const coneGeometry = new THREE.ConeGeometry(0.028, 1, 14, 1, true);
            coneGeometry.translate(0, -0.5, 0); // apex at origin, body along -Y
            for (let i = 0; i < this.MAX_BEAMS; i++) {
                const mesh = new THREE.Mesh(coneGeometry, new THREE.MeshBasicMaterial({
                    color: 0xb87aff, transparent: true, opacity: 0, depthWrite: false,
                    blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
                }));
                mesh.visible = false;
                this.flashlights.push(mesh);
                this.scene.add(mesh);
            }
        }
        this._beamDown = new THREE.Vector3(0, -1, 0);
        this._beamDir = new THREE.Vector3();
        this._beamOrigin = new THREE.Vector3();
        this._beamScratchA = new THREE.Vector3();
        this._beamScratchB = new THREE.Vector3();
        this.beamPositions = new Float32Array(this.MAX_BEAMS * this.BEAM_DASHES * 6);
        this.beamGeometry = new THREE.BufferGeometry();
        this.beamGeometry.setAttribute('position', new THREE.BufferAttribute(this.beamPositions, 3).setUsage(THREE.DynamicDrawUsage));
        this.scene.add(new THREE.LineSegments(this.beamGeometry, new THREE.LineBasicMaterial({
            color: 0xe0c4ff, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending,
        })));

        const n = this.flowers.length;
        this.statusColors = new Float32Array(n * 3);
        this.statusSizes = new Float32Array(n);
        const statusPositions = new Float32Array(n * 3);
        this.flowerHealth.forEach((fh, i) => {
            statusPositions[i * 3] = fh.node.x;
            statusPositions[i * 3 + 1] = fh.node.y;
            statusPositions[i * 3 + 2] = fh.node.z;
        });
        this.statusGeometry = new THREE.BufferGeometry();
        this.statusGeometry.setAttribute('position', new THREE.BufferAttribute(statusPositions, 3));
        this.statusGeometry.setAttribute('color', new THREE.BufferAttribute(this.statusColors, 3).setUsage(THREE.DynamicDrawUsage));
        this.statusGeometry.setAttribute('aSize', new THREE.BufferAttribute(this.statusSizes, 1).setUsage(THREE.DynamicDrawUsage));
        this.statusGeometry.setAttribute('aFlex', new THREE.Float32BufferAttribute(this.flowerHealth.map(() => 0.45), 1));
        this.statusGeometry.setAttribute('aPhase', new THREE.Float32BufferAttribute(this.flowerHealth.map((fh) => fh.phase), 1));
        this.scene.add(new THREE.Points(this.statusGeometry, this.nodeMaterial));
    }

    _updateFlowerHealth(t) {
        // Clamp to [0, 0.1]: a scrub can jump t far in either direction,
        // and decay must never integrate across the jump
        const dt = this._lastHealthT === null ? 0 : Math.min(Math.max(t - this._lastHealthT, 0), 0.1);
        this._lastHealthT = t;

        this.sickFlowers.length = 0;
        this.flowerHealth.forEach((fh, i) => {
            fh.hp = Math.max(0, fh.hp - fh.decayRate * dt);
            if (fh.hp < CARE_THRESHOLD) this.sickFlowers.push(i);

            // A hovering firefly at an ailing bloom fires a healing injection
            if (fh.hp < CARE_THRESHOLD && t - fh.lastBeamAt > 2.6 && this.activeBeams.length < this.MAX_BEAMS) {
                const shooter = this.fireflies.findIndex((fly) => fly.from === i && fly.to === null);
                if (shooter >= 0) {
                    this.activeBeams.push({
                        shooter,
                        target: i,
                        born: t,
                        duration: this.BEAM_DURATION,
                        heal: 10 + Math.random() * 20,
                    });
                    fh.lastBeamAt = t;
                    // Hold the shooter at the bloom for the whole treatment
                    this.fireflies[shooter].nextHop = Math.max(
                        this.fireflies[shooter].nextHop, t / 2 + this.BEAM_DURATION / 2 + 0.3);
                }
            }

            // Status node: the HP ladder colors it golden -> orange ->
            // brown -> black, pulsing harder the sicker it gets
            const h = fh.hp / 100;
            const color = hpColor(h);
            let size = 0.08;
            if (h < 0.8) {
                const distress = (0.8 - h) / 0.8;
                const pulse = 0.5 + 0.5 * Math.sin(t * (3 + distress * 4) + i * 1.7);
                color.multiplyScalar(0.7 + 0.6 * pulse * distress);
                size = 0.08 + distress * (0.03 + 0.05 * pulse);
            }
            this.statusColors[i * 3] = color.r;
            this.statusColors[i * 3 + 1] = color.g;
            this.statusColors[i * 3 + 2] = color.b;
            this.statusSizes[i] = size;
        });
        this.statusGeometry.attributes.color.needsUpdate = true;
        this.statusGeometry.attributes.aSize.needsUpdate = true;

        // Expired beams deliver their injection; live ones render below
        for (let b = this.activeBeams.length - 1; b >= 0; b--) {
            const beam = this.activeBeams[b];
            if (t - beam.born > beam.duration) {
                const fh = this.flowerHealth[beam.target];
                fh.hp = Math.min(100, fh.hp + beam.heal);
                this.activeBeams.splice(b, 1);
            }
        }
        this.beamPositions.fill(0);
        this.flashlights.forEach((mesh) => { mesh.visible = false; });
        this.activeBeams.forEach((beam, slot) => {
            const to = this.flowerHealth[beam.target].node;
            const u = (t - beam.born) / beam.duration;
            // Live origin: the flashlight stays attached to its firefly
            this._beamOrigin.set(
                this.fireflyPositions[beam.shooter * 3],
                this.fireflyPositions[beam.shooter * 3 + 1],
                this.fireflyPositions[beam.shooter * 3 + 2]
            );
            // Cone from gem to node, fading in and out over its 2s life
            const flashlight = this.flashlights[slot];
            this._beamDir.copy(to).sub(this._beamOrigin);
            const length = Math.max(this._beamDir.length(), 0.001);
            flashlight.position.copy(this._beamOrigin);
            flashlight.quaternion.setFromUnitVectors(this._beamDown, this._beamDir.normalize());
            flashlight.scale.set(1, length, 1);
            flashlight.material.opacity = 0.34 * Math.sin(Math.PI * THREE.MathUtils.clamp(u, 0, 1));
            flashlight.visible = true;
            // Code dashes marching down the beam's core
            for (let k = 0; k < this.BEAM_DASHES; k++) {
                const march = ((t - beam.born) * 1.6 + k / this.BEAM_DASHES) % 1;
                this._beamScratchA.copy(this._beamOrigin).lerp(to, march);
                this._beamScratchB.copy(this._beamOrigin).lerp(to, Math.min(march + 0.055, 1));
                const base = (slot * this.BEAM_DASHES + k) * 6;
                this.beamPositions[base] = this._beamScratchA.x;
                this.beamPositions[base + 1] = this._beamScratchA.y;
                this.beamPositions[base + 2] = this._beamScratchA.z;
                this.beamPositions[base + 3] = this._beamScratchB.x;
                this.beamPositions[base + 4] = this._beamScratchB.y;
                this.beamPositions[base + 5] = this._beamScratchB.z;
            }
        });
        this.beamGeometry.attributes.position.needsUpdate = true;
    }

    _updateFireflies(t) {
        for (let i = 0; i < this.FIREFLY_COUNT; i++) {
            const fly = this.fireflies[i];
            let hoverAmp = 1;
            if (fly.to === null) {
                const atSickBloom = this.flowerHealth[fly.from].hp < 80;
                this._fireflyAnchor.copy(this.flowers[fly.from].center);
                // Nurses close ranks: at a sick bloom they tighten their
                // orbit; idle nurses hurry over when a bloom sickens
                const targetAmp = (!fly.roamer && atSickBloom) ? 0.28 : 1;
                fly.ampScale += (targetAmp - fly.ampScale) * 0.05;
                if (!fly.roamer && this.sickFlowers.length > 0 && !atSickBloom) {
                    fly.nextHop = Math.min(fly.nextHop, t + 0.7);
                }
                if (t > fly.nextHop) {
                    // Depart for another flower along an arcing control
                    // point. Nurses sense the sickest NEARBY bloom (deficit
                    // discounted by distance); with nothing below the care
                    // threshold, everyone just wanders.
                    let target;
                    if (!fly.roamer && this.sickFlowers.length > 0) {
                        const here = this.flowers[fly.from].center;
                        let bestScore = -Infinity;
                        target = this.sickFlowers[0];
                        for (const idx of this.sickFlowers) {
                            const score = (80 - this.flowerHealth[idx].hp)
                                / (0.5 + here.distanceTo(this.flowers[idx].center));
                            if (score > bestScore) { bestScore = score; target = idx; }
                        }
                    } else {
                        target = Math.floor(Math.random() * this.flowers.length);
                        if (target === fly.from) target = (target + 1) % this.flowers.length;
                    }
                    fly.to = target;
                    fly.u = 0;
                    const a = this.flowers[fly.from].center;
                    const b = this.flowers[fly.to].center;
                    const dist = a.distanceTo(b);
                    fly.duration = THREE.MathUtils.clamp(dist / 0.5, 2, 7);
                    fly.startTime = t;
                    fly.ctrl.copy(a).lerp(b, 0.5).add(new THREE.Vector3(
                        (Math.random() - 0.5) * 0.8,
                        0.25 + Math.random() * 0.45,
                        (Math.random() - 0.5) * 0.8
                    ));
                }
            } else {
                const u = THREE.MathUtils.clamp((t - fly.startTime) / fly.duration, 0, 1);
                const e = u * u * (3 - 2 * u);
                const a = this.flowers[fly.from].center;
                const b = this.flowers[fly.to].center;
                const inv = 1 - e;
                this._fireflyAnchor.set(
                    inv * inv * a.x + 2 * e * inv * fly.ctrl.x + e * e * b.x,
                    inv * inv * a.y + 2 * e * inv * fly.ctrl.y + e * e * b.y,
                    inv * inv * a.z + 2 * e * inv * fly.ctrl.z + e * e * b.z
                );
                hoverAmp = 1 - 0.65 * Math.sin(Math.PI * u);
                if (u >= 1) {
                    fly.from = fly.to;
                    fly.to = null;
                    fly.nextHop = t + 2 + Math.random() * 9;
                }
            }
            this._fireflyScratch.set(
                Math.sin(t * fly.ax + fly.p1) * fly.rx,
                Math.sin(t * fly.ay + fly.p2) * fly.ry,
                Math.cos(t * fly.az + fly.p3) * fly.rz
            ).multiplyScalar(hoverAmp * fly.ampScale);
            this.fireflyPositions[i * 3] = this._fireflyAnchor.x + this._fireflyScratch.x;
            this.fireflyPositions[i * 3 + 1] = this._fireflyAnchor.y + this._fireflyScratch.y;
            this.fireflyPositions[i * 3 + 2] = this._fireflyAnchor.z + this._fireflyScratch.z;
            this.fireflySizes[i] = fly.baseSize * (0.55 + 0.45 * Math.sin(t * fly.flicker + fly.p1) ** 2);
        }
        this.fireflyGeometry.attributes.position.needsUpdate = true;
        this.fireflyGeometry.attributes.aSize.needsUpdate = true;
    }

    // ------------------------------------------------------------------
    // Glowing name annotations, one per flower, billboarded at the bloom
    // core. Sprites can't ride the wind vertex shader, so each keeps a
    // reference and is displaced on the CPU with the IDENTICAL formula.
    // ------------------------------------------------------------------
    _buildLabels() {
        this.labelSprites = [];
        this.flowers.forEach((flower, i) => {
            const canvas = document.createElement('canvas');
            canvas.width = 512;
            canvas.height = 128;
            const ctx = canvas.getContext('2d');
            ctx.font = '58px Inter, -apple-system, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowColor = 'rgba(255, 216, 130, 0.95)';
            ctx.shadowBlur = 26;
            ctx.fillStyle = '#fff6d8';
            ctx.fillText(FLOWER_NAMES[i], 256, 64);
            ctx.shadowBlur = 8;
            ctx.fillText(FLOWER_NAMES[i], 256, 64);
            const texture = new THREE.CanvasTexture(canvas);
            texture.colorSpace = THREE.SRGBColorSpace;
            const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
                map: texture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
            }));
            sprite.position.copy(flower.center).add(new THREE.Vector3(0, 0.095, 0));
            sprite.scale.set(0.31, 0.078, 1);
            this.scene.add(sprite);
            this.labelSprites.push({
                sprite,
                base: sprite.position.clone(),
                windAt: flower.center.clone().add(new THREE.Vector3(0, 0.075, 0)), // the stem's top
                phase: flower.phase,
                flex: 0.45,
            });
        });
    }

    // JS mirror of the vertex shader's windOffset, applied to the labels
    _updateLabels(t) {
        for (const label of this.labelSprites) {
            const p = label.windAt;
            const gust = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * 0.35 + p.x * 0.4));
            const s1 = Math.sin(t * 1.1 + label.phase + p.y * 1.3);
            const s2 = Math.sin(t * 2.3 + label.phase * 1.7 + p.x * 0.8);
            const s3 = Math.cos(t * 0.9 + label.phase);
            const k = label.flex * 0.0275 * gust;
            label.sprite.position.set(
                label.base.x + s1 * k,
                label.base.y + s2 * 0.25 * k,
                label.base.z + s3 * 0.6 * k
            );
        }
    }

    // ------------------------------------------------------------------
    // Camera choreography: slow orbit, then a dive through the canopy —
    // a tour of three blooms with a full slow circle around each.
    // ------------------------------------------------------------------
    _buildCamera() {
        this.camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.05, 40);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.domElement.style.display = 'block';
        this.fillViewport = this.container.dataset.fill === 'viewport';
        this.renderer.domElement.style.borderRadius = this.fillViewport ? '0' : '8px';
        this.container.appendChild(this.renderer.domElement);

        this.LOOP_MS = 60000;
        this.PERIOD_MS = this.LOOP_MS;
        this.ORBIT_FRACTION = 25 / 60;
        this.ORBIT_RADIUS = 3.5;
        this.ORBIT_HEIGHT = 1.25;
        this.ORBIT_SWEEP = Math.PI * 1.75;
        // Start the loop clock one second shy of the dive, so visitors see
        // the flower tour right away before the slow orbit settles in
        this.START_OFFSET_MS = this.ORBIT_FRACTION * this.LOOP_MS - 1000;

        const orbitPosition = (theta) => new THREE.Vector3(
            Math.cos(theta) * this.ORBIT_RADIUS,
            this.ORBIT_HEIGHT + Math.sin(theta * 2) * 0.15,
            Math.sin(theta) * this.ORBIT_RADIUS
        );
        this._orbitPosition = orbitPosition;

        const TOUR_STOPS = [this.flowers[0].center, this.flowers[2].center, this.flowers[3].center];
        const FLOWER_ORBIT_RADIUS = 0.5;
        const FLOWER_ORBIT_HEIGHT = 0.06;
        const circleAround = (center, angle) => new THREE.Vector3(
            center.x + Math.cos(angle) * FLOWER_ORBIT_RADIUS,
            center.y + FLOWER_ORBIT_HEIGHT,
            center.z + Math.sin(angle) * FLOWER_ORBIT_RADIUS
        );
        this._circleAround = circleAround;

        // Build the dive timeline: approach A, orbit A, transit B, orbit B,
        // transit C, orbit C, exit — durations in seconds; segments chain so
        // each ends where the next begins
        this.tourSegments = [];
        let cursor = orbitPosition(this.ORBIT_SWEEP);
        let previousLook = TREE_CENTER;
        TOUR_STOPS.forEach((stop, i) => {
            const entryAngle = Math.atan2(cursor.z - stop.z, cursor.x - stop.x);
            const ringStart = circleAround(stop, entryAngle);
            const mid = cursor.clone().lerp(ringStart, 0.5).add(new THREE.Vector3(0, 0.28, 0));
            this.tourSegments.push({
                kind: 'path',
                curve: new THREE.CatmullRomCurve3([cursor.clone(), mid, ringStart]),
                duration: i === 0 ? 3 : 2.5,
                lookFrom: previousLook.clone(),
                lookTo: stop.clone(),
            });
            this.tourSegments.push({
                kind: 'circle',
                center: stop.clone(),
                entryAngle,
                duration: 8, // one full revolution
                lookTo: stop.clone(),
            });
            cursor = ringStart;
            previousLook = stop;
        });
        const exitMid = cursor.clone().lerp(orbitPosition(Math.PI * 2), 0.5).add(new THREE.Vector3(0, 0.5, 0));
        this.tourSegments.push({
            kind: 'path',
            curve: new THREE.CatmullRomCurve3([cursor.clone(), exitMid, orbitPosition(Math.PI * 2)]),
            duration: 3,
            lookFrom: previousLook.clone(),
            lookTo: TREE_CENTER.clone(),
        });
        this.TOUR_TOTAL = this.tourSegments.reduce((sum, seg) => sum + seg.duration, 0);

        // The choreography computes a TARGET pose; the real camera chases
        // it through an exponential smoother, so every seam — including
        // hand-off to and from manual flight — rounds into a glide.
        this._lookTarget = new THREE.Vector3();
        this._targetPosition = new THREE.Vector3();
        this._smoothPosition = new THREE.Vector3();
        this._smoothLook = new THREE.Vector3();
        this._cameraPrimed = false;
        this.SMOOTH_RATE = 2.6; // 1/s: ~0.4s settling time
    }

    _smootherstep(x) { return x * x * x * (x * (x * 6 - 15) + 10); }

    _positionCamera(now, dt) {
        const t = ((now + this.START_OFFSET_MS) % this.LOOP_MS) / this.LOOP_MS;
        if (t < this.ORBIT_FRACTION) {
            const theta = (t / this.ORBIT_FRACTION) * this.ORBIT_SWEEP;
            this._targetPosition.copy(this._orbitPosition(theta));
            this._lookTarget.copy(TREE_CENTER);
        } else {
            let elapsed = ((t - this.ORBIT_FRACTION) / (1 - this.ORBIT_FRACTION)) * this.TOUR_TOTAL;
            let segment = this.tourSegments[this.tourSegments.length - 1];
            for (const candidate of this.tourSegments) {
                if (elapsed <= candidate.duration) { segment = candidate; break; }
                elapsed -= candidate.duration;
            }
            const v = THREE.MathUtils.clamp(elapsed / segment.duration, 0, 1);
            if (segment.kind === 'path') {
                segment.curve.getPoint(v, this._targetPosition);
                this._lookTarget.copy(segment.lookFrom).lerp(segment.lookTo, this._smootherstep(v));
            } else {
                this._targetPosition.copy(this._circleAround(segment.center, segment.entryAngle + Math.PI * 2 * v));
                this._lookTarget.copy(segment.lookTo);
            }
        }
        if (!this._cameraPrimed) {
            this._smoothPosition.copy(this._targetPosition);
            this._smoothLook.copy(this._lookTarget);
            this._cameraPrimed = true;
        } else {
            const alpha = 1 - Math.exp(-this.SMOOTH_RATE * dt);
            this._smoothPosition.lerp(this._targetPosition, alpha);
            this._smoothLook.lerp(this._lookTarget, alpha);
        }
        this.camera.position.copy(this._smoothPosition);
        this.camera.lookAt(this._smoothLook);
        // Focus rides the current subject
        const focus = Math.max(this._smoothPosition.distanceTo(this._smoothLook), 0.4);
        this.lineMaterial.uniforms.uFocus.value = focus;
        this.nodeMaterial.uniforms.uFocus.value = focus;
        this.fireflyMaterial.uniforms.uFocus.value = focus;
    }

    // ------------------------------------------------------------------
    // Manual flight, chrome, and the player clock
    // ------------------------------------------------------------------
    _buildControls() {
        this.manualMode = false;
        this.manualYaw = 0;
        this.manualPitch = 0;
        this.heldKeys = new Set();
        this._manualEuler = new THREE.Euler(0, 0, 0, 'YXZ');
        this._manualMove = new THREE.Vector3();
        this._manualForward = new THREE.Vector3();
        this._manualRight = new THREE.Vector3();

        this.container.style.position = 'relative';
        this.hint = null;
        if (this.chrome) {
            this.hint = buildHint(this.container);
            // Click the banner to take the controls; click again to hand
            // back to the tour
            this.renderer.domElement.addEventListener('click', () => this.setManual(!this.manualMode));
        }
        document.addEventListener('mousemove', (event) => {
            if (!this.manualMode) return;
            this.manualYaw -= (event.movementX || 0) * 0.0024;
            this.manualPitch = THREE.MathUtils.clamp(this.manualPitch - (event.movementY || 0) * 0.0024, -1.45, 1.45);
        });
        const FLIGHT_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyR', 'KeyF']);
        window.addEventListener('keydown', (event) => {
            if (this.manualMode && FLIGHT_KEYS.has(event.code)) {
                this.heldKeys.add(event.code);
                event.preventDefault();
            }
        });
        window.addEventListener('keyup', (event) => this.heldKeys.delete(event.code));

        if (this.chrome) {
            // Fullscreen with the iOS pseudo-fullscreen fallback (iPhone
            // Safari has no element fullscreen API: pin the container over
            // the page and dispatch a synthetic fullscreenchange)
            const isFs = () => document.fullscreenElement === this.container
                || this.container.classList.contains('pseudo-fs');
            const setPseudo = (on) => {
                const c = this.container;
                c.classList.toggle('pseudo-fs', on);
                c.style.position = on ? 'fixed' : 'relative';
                c.style.inset = on ? '0' : '';
                c.style.zIndex = on ? '999' : '';
                c.style.background = on ? '#02090f' : '';
                document.documentElement.style.overflow = on ? 'hidden' : '';
                this.renderer.domElement.style.borderRadius = on || this.fillViewport ? '0' : '8px';
                this.resize();
                document.dispatchEvent(new Event('fullscreenchange'));
            };
            this.fsButton = buildFullscreenButton(this.container, () => {
                if (isFs()) {
                    if (document.fullscreenElement === this.container) document.exitFullscreen?.();
                    else setPseudo(false);
                } else if (this.container.requestFullscreen) {
                    this.container.requestFullscreen();
                } else {
                    setPseudo(true);
                }
            });
            window.addEventListener('keydown', (event) => {
                if (event.key === 'Escape' && this.container.classList.contains('pseudo-fs')) setPseudo(false);
            });
            document.addEventListener('fullscreenchange', () => {
                this.fsButton.innerHTML = isFs() ? FS_EXIT_ICON : FS_ENTER_ICON;
            });
        }

        // Touch look: on phones there is no pointer lock, so manual flight
        // steers by finger drag instead
        let touchLook = null;
        this.renderer.domElement.addEventListener('pointerdown', (event) => {
            if (event.pointerType === 'touch') touchLook = { id: event.pointerId, x: event.clientX, y: event.clientY };
        });
        this.renderer.domElement.addEventListener('pointermove', (event) => {
            if (!this.manualMode || event.pointerType !== 'touch') return;
            if (!touchLook || event.pointerId !== touchLook.id) return;
            this.manualYaw -= (event.clientX - touchLook.x) * 0.005;
            this.manualPitch = THREE.MathUtils.clamp(
                this.manualPitch - (event.clientY - touchLook.y) * 0.005, -1.45, 1.45);
            touchLook.x = event.clientX;
            touchLook.y = event.clientY;
        });
        this.renderer.domElement.addEventListener('pointerup', () => { touchLook = null; });
        this.renderer.domElement.addEventListener('pointercancel', () => { touchLook = null; });

        // The player clock: the whole scene runs on simNow, pausable and
        // seekable; a hosting shell drives it through the vis interface
        this.simNow = 0;
        this.playing = true;

        this.resize = this.resize.bind(this);
        this.resize();
        window.addEventListener('resize', this.resize);
        document.addEventListener('fullscreenchange', this.resize);
    }

    // --- The vis interface (see docs/datatree2/DESIGN.md) ---

    fraction() {
        return ((this.simNow + this.START_OFFSET_MS) % this.LOOP_MS) / this.LOOP_MS;
    }

    // Jump the clock so the 60s loop lands at `frac`, staying within the
    // current cycle so absolute-time motion (wind phase, firefly hops)
    // doesn't lurch by minutes
    seekToFraction(frac) {
        frac = THREE.MathUtils.clamp(frac, 0, 0.9999);
        const cycle = Math.floor((this.simNow + this.START_OFFSET_MS) / this.LOOP_MS);
        this.simNow = (cycle + frac) * this.LOOP_MS - this.START_OFFSET_MS;
        this._cameraPrimed = false;  // snap, don't glide, to the sought pose
        this._lastHealthT = null;    // never integrate HP decay across a jump
    }

    setManual(on) {
        this.manualMode = on;
        if (this.hint) {
            this.hint.textContent = on ? HINT_FLYING : HINT_FLY;
        }
        // While flying, finger drags steer the camera instead of scrolling
        this.renderer.domElement.style.touchAction = on ? 'none' : '';
        if (on) {
            this._manualEuler.setFromQuaternion(this.camera.quaternion, 'YXZ');
            this.manualYaw = this._manualEuler.y;
            this.manualPitch = this._manualEuler.x;
            this.renderer.domElement.requestPointerLock?.();
        } else {
            if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock?.();
            // Hand the smoother the manual pose so the tour resumes gliding
            this._smoothPosition.copy(this.camera.position);
            this._smoothLook.copy(this.camera.position).addScaledVector(this._manualForward, 2);
        }
    }

    resize() {
        // Fill the screen when we ARE the fullscreen element, when an
        // ancestor is (embedded in a host player), or under the host's
        // iOS pseudo-fullscreen
        const fsEl = document.fullscreenElement;
        const fill = this.fillViewport
            || (fsEl && (fsEl === this.container || fsEl.contains(this.container)))
            || this.container.closest('.pseudo-fs') !== null;
        const w = fill ? window.innerWidth : this.container.clientWidth;
        const h = fill ? window.innerHeight : Math.round(w * 0.58);
        this.renderer.setSize(w, h);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        const scale = h * 0.45;
        this.nodeMaterial.uniforms.uPixelScale.value = scale;
        this.fireflyMaterial.uniforms.uPixelScale.value = scale;
    }

    _updateManualFlight(dt) {
        this._manualEuler.set(this.manualPitch, this.manualYaw, 0, 'YXZ');
        this.camera.quaternion.setFromEuler(this._manualEuler);
        this._manualForward.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
        this._manualRight.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
        this._manualMove.set(0, 0, 0);
        if (this.heldKeys.has('KeyW')) this._manualMove.add(this._manualForward);
        if (this.heldKeys.has('KeyS')) this._manualMove.sub(this._manualForward);
        if (this.heldKeys.has('KeyD')) this._manualMove.add(this._manualRight);
        if (this.heldKeys.has('KeyA')) this._manualMove.sub(this._manualRight);
        if (this.heldKeys.has('KeyR')) this._manualMove.y += 1;
        if (this.heldKeys.has('KeyF')) this._manualMove.y -= 1;
        if (this._manualMove.lengthSq() > 0) {
            this.camera.position.addScaledVector(this._manualMove.normalize(), 1.4 * dt);
        }
        const focus = THREE.MathUtils.clamp(this.camera.position.distanceTo(TREE_CENTER), 0.4, 6);
        this.lineMaterial.uniforms.uFocus.value = focus;
        this.nodeMaterial.uniforms.uFocus.value = focus;
        this.fireflyMaterial.uniforms.uFocus.value = focus;
    }

    // ------------------------------------------------------------------
    _animate() {
        requestAnimationFrame(this._animate);
        const now = performance.now();
        const rawDt = Math.min((now - (this._lastFrame ?? now)) / 1000, 0.05);
        this._lastFrame = now;
        if (this.suspended) return; // hidden behind another vis: idle cheaply
        const dt = this.playing ? rawDt : 0;
        this.simNow += dt * 1000;
        this.lineMaterial.uniforms.uTime.value = this.simNow / 1000;
        this.nodeMaterial.uniforms.uTime.value = this.simNow / 1000;
        this.fireflyMaterial.uniforms.uTime.value = this.simNow / 1000;
        this._updateFireflies(this.simNow / 2000); // fireflies live at half speed
        this._updateFlowerHealth(this.simNow / 1000);
        this._updateLabels(this.simNow / 1000);
        // Manual flight keeps real-time dt so a paused scene can be roamed
        if (this.manualMode) this._updateManualFlight(rawDt);
        else this._positionCamera(this.simNow, dt);
        this.renderer.render(this.scene, this.camera);
    }
}
