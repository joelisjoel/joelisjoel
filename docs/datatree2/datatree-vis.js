// DatatreeVis: renders a dataTreeStateEvolution object (see
// state-evolution.js) as the living data tree. The evolution object owns
// WHAT exists and WHAT happens (graph nodes with placement annotations,
// fly directives, beam deliveries, vitality curves); this class owns HOW it
// looks — filament amplification, wind, bokeh, the cosmetic landscape, the
// camera tour, and manual flight. Playback ping-pongs through the
// evolution's duration ("Tenet rewind"), so vitality and beams simply
// evaluate at a reversing time while fly motion stays continuous: flies
// integrate toward whatever their directive currently says, never sampling
// stored paths.
import * as THREE from 'three';
import { assertEvolution } from './evolution-schema.mjs?v=1';
import {
    FS_ENTER_ICON, FS_EXIT_ICON, HINT_FLY, HINT_FLYING,
    buildHint, buildFullscreenButton, buildTransportBar,
} from '../include/player-chrome.js?v=1';

// --- Deterministic randomness for all cosmetic amplification ---

function mulberry32(a) {
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// --- Palette ---

const CORE = new THREE.Color(0xcfeeff);
const CYAN = new THREE.Color(0x52c8f0);
const TEAL_DEEP = new THREE.Color(0x1b6a8c);
const GOLD = new THREE.Color(0xe8b850);
const GOLD_BRIGHT = new THREE.Color(0xffd98a);
const HEALTHY_GOLDEN = new THREE.Color(0xffd98a);
const HP_ORANGE = new THREE.Color(0xff8a2a);
const HP_BROWN = new THREE.Color(0x5e2c06);
const HP_BLACK = new THREE.Color(0x0e0703);
const FLOWER_YELLOW = new THREE.Color(0xffdf6e);
const FLOWER_CORE = new THREE.Color(0xfff3c8);
const TREE_CENTER = new THREE.Vector3(0, 1.25, 0);

function hpColor(h) {
    if (h > 2 / 3) return HP_ORANGE.clone().lerp(HEALTHY_GOLDEN, (h - 2 / 3) * 3);
    if (h > 1 / 3) return HP_BROWN.clone().lerp(HP_ORANGE, (h - 1 / 3) * 3);
    return HP_BLACK.clone().lerp(HP_BROWN, h * 3);
}

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

export class DatatreeVis {
    constructor(container, evolution, options = {}) {
        assertEvolution(evolution, options.source ?? 'evolution');
        this.container = container;
        this.evolution = evolution;
        this.seed = options.seed ?? 1337;
        // chrome:false renders headless — no hint/fullscreen/transport UI
        // and no click handling — for a host shell that supplies its own
        // player chrome and drives the clock through the vis interface
        // (playing, suspended, manualMode, PERIOD_MS, fraction,
        // seekToFraction, setManual, resize)
        this.chrome = options.chrome !== false;
        this.suspended = false;
        this.density = (window.innerWidth || 1024) < 700 ? 0.6 : 1;

        this._indexGraph();
        this._buildGeometryArrays();
        this._generateTree();
        this._generateLandscape();
        this._buildScene();
        this._buildBlooms();
        this._buildFlies();
        this._buildBeams();
        this._buildCamera();
        this._buildControls();

        this._lastFrame = null;
        this._animate = this._animate.bind(this);
        requestAnimationFrame(this._animate);
    }

    // --- Evolution time: ping-pong over the authored duration ---
    _evolutionTime(wallSeconds) {
        const d = this.evolution.meta.duration;
        const cycle = wallSeconds % (2 * d);
        return cycle < d ? cycle : 2 * d - cycle;
    }

    // ------------------------------------------------------------------
    // Graph indexing
    // ------------------------------------------------------------------
    _indexGraph() {
        this.nodesById = new Map();
        for (const node of this.evolution.graph.nodes) {
            this.nodesById.set(node.id, {
                ...node,
                posV: new THREE.Vector3(...node.pos),
                children: [],
            });
        }
        for (const node of this.nodesById.values()) {
            if (node.parent) this.nodesById.get(node.parent).children.push(node);
        }
        this.blooms = [...this.nodesById.values()].filter((n) => n.kind === 'bloom');
        this.leaves = [...this.nodesById.values()].filter((n) => n.kind === 'bloom' || n.kind === 'twig');

        // Per-fly action lists, time-sorted; per-node beam lists
        this.flyActions = new Map();
        for (const fly of this.evolution.flies) this.flyActions.set(fly.id, []);
        this.beamActions = [];
        for (const action of this.evolution.actions) {
            if (action.fly && this.flyActions.has(action.fly)) {
                this.flyActions.get(action.fly).push(action);
            }
            if (action.type === 'beam') this.beamActions.push(action);
        }
        for (const list of this.flyActions.values()) list.sort((a, b) => a.t - b.t);
    }

    // Vitality is a pure function of evolution time: hp0, minus decay,
    // plus every beam delivered by then. Evaluable forwards and backwards.
    _bloomHp(bloom, t) {
        let hp = bloom.hp0 - bloom.decayRate * t;
        for (const beam of this.beamActions) {
            if (beam.node === bloom.id && t >= beam.t + beam.duration) hp += beam.heal;
        }
        return THREE.MathUtils.clamp(hp, 0, 100);
    }

    // The fly's current directive: the latest action at or before t, else
    // its default wide orbit around its start node
    _flyDirective(fly, t) {
        const list = this.flyActions.get(fly.id);
        let current = null;
        for (const action of list) {
            if (action.t <= t) current = action;
            else break;
        }
        if (!current) return { type: 'orbit', node: fly.start, radius: 'wide' };
        if (current.type === 'steer') return { type: 'steer', node: current.toward };
        if (current.type === 'beam') return { type: 'orbit', node: current.node, radius: 'tight' };
        return { type: 'orbit', node: current.around, radius: current.radius };
    }

    // ------------------------------------------------------------------
    // Geometry accumulation helpers
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

    _flexAt(p) {
        const heightFactor = THREE.MathUtils.clamp((p.y - 0.25) / 1.6, 0, 1);
        const reachFactor = THREE.MathUtils.clamp((Math.hypot(p.x, p.z) - 0.2) / 1.6, 0, 1);
        return Math.pow(Math.max(heightFactor, reachFactor * 0.9), 1.6) * (0.35 + 0.65 * reachFactor);
    }

    // ------------------------------------------------------------------
    // The tree: filaments amplified from the GRAPH. Each filament flows
    // from a golden base seat, up the trunk as a braided helix, then along
    // its leaf's ancestor chain (branch via-points are placement
    // annotations), splaying into twigs at the end.
    // ------------------------------------------------------------------
    _generateTree() {
        const rand = mulberry32(this.seed);
        const randRange = (a, b) => a + (b - a) * rand();
        const root = this.nodesById.get('root');

        const trunkRadius = (t) => 0.13 + Math.pow(1 - t, 2.2) * 0.42 + Math.pow(t, 2.6) * 0.2;
        const trunkPoint = (t) => new THREE.Vector3(
            Math.sin(t * 2.1) * 0.04,
            0.12 + t * (root.posV.y - 0.12),
            Math.sin(t * 1.3 + 1) * 0.03
        );

        // Leaf pool weighted by the branch weights along each chain
        const leafPool = [];
        for (const leaf of this.leaves) {
            const branch = this.nodesById.get(leaf.parent);
            const w = Math.round(((branch.weight ?? 1) + (leaf.weight ?? 1)) * 6);
            for (let i = 0; i < w; i++) leafPool.push(leaf);
        }

        // Ancestor chain of positions from the root to the leaf, expanding
        // each edge's via annotations
        const chainFor = (leaf) => {
            const chain = [];
            let node = leaf;
            while (node && node.parent) {
                chain.unshift(node);
                node = this.nodesById.get(node.parent);
            }
            const points = [];
            for (const link of chain) {
                if (link.via) for (const v of link.via) points.push(new THREE.Vector3(...v));
                points.push(link.posV.clone());
            }
            return points;
        };

        const FILAMENTS = Math.round(470 * this.density);
        this.filamentTracks = [];

        for (let f = 0; f < FILAMENTS; f++) {
            const phase = rand() * Math.PI * 2;
            const isGold = rand() < 0.08;
            const brightness = 0.35 + rand() * 0.65;
            const interior = rand() < 0.35;
            const theta0 = rand() * Math.PI * 2;
            const twist = randRange(1.0, 2.4) * (rand() < 0.5 ? -1 : 1);
            const radialSeat = randRange(0.55, 1.0);
            const leaf = leafPool[Math.floor(rand() * leafPool.length)];
            const pathPoints = chainFor(leaf);

            const controls = [];
            const baseDir = theta0 + randRange(-0.3, 0.3);
            controls.push(new THREE.Vector3(
                Math.cos(baseDir) * randRange(0.5, 0.95),
                randRange(0.0, 0.06),
                Math.sin(baseDir) * randRange(0.5, 0.95)
            ));
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
            // Follow the ancestor chain with a shrinking braid offset
            const offsetAngle = rand() * Math.PI * 2;
            pathPoints.forEach((p, i) => {
                const t = (i + 1) / pathPoints.length;
                const shrink = 0.085 * (1 - t * 0.8);
                controls.push(new THREE.Vector3(
                    p.x + Math.cos(offsetAngle + t * 3) * shrink + Math.sin(t * 6 + phase) * 0.02,
                    p.y + Math.sin(offsetAngle + t * 3) * shrink,
                    p.z + Math.sin(offsetAngle * 1.3 + t * 2) * shrink
                ));
            });
            // Tip splay past the leaf
            const deviation = new THREE.Vector3(randRange(-1, 1), randRange(-0.2, 1), randRange(-1, 1))
                .normalize().multiplyScalar(randRange(0.12, 0.35));
            controls.push(controls[controls.length - 1].clone().add(deviation));

            const curve = new THREE.CatmullRomCurve3(controls);
            const samples = curve.getPoints(34);
            const track = { samples, phase, leaf, flex: [], colors: [] };

            for (const p of samples) {
                track.flex.push(this._flexAt(p));
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

            // Twiglets thicken the canopy near the tip
            for (let tw = 0; tw < 3; tw++) {
                const startIndex = samples.length - 1 - Math.floor(randRange(2, 8));
                const start = samples[startIndex];
                const tangent = samples[Math.min(startIndex + 1, samples.length - 1)].clone().sub(start).normalize();
                const spread = new THREE.Vector3(randRange(-1, 1), randRange(-0.4, 1), randRange(-1, 1))
                    .normalize().multiplyScalar(0.7);
                const dir = tangent.add(spread).normalize();
                let prev = start;
                const twigLength = randRange(0.08, 0.2);
                for (let sIdx = 1; sIdx <= 3; sIdx++) {
                    const next = start.clone().addScaledVector(dir, twigLength * (sIdx / 3))
                        .add(new THREE.Vector3(randRange(-0.015, 0.015), randRange(-0.015, 0.015), randRange(-0.015, 0.015)));
                    this._pushSegment(prev, next, track.colors[startIndex], track.colors[startIndex],
                        track.flex[startIndex], Math.min(1, track.flex[startIndex] + (sIdx / 3) * 0.2), phase);
                    prev = next;
                }
                if (rand() < 0.85) {
                    this._pushNode(prev, CYAN.clone().lerp(CORE, rand()), randRange(0.012, 0.03),
                        Math.min(1, track.flex[startIndex] + 0.2), phase);
                }
            }
            for (let g = 0; g < 4; g++) {
                if (rand() < 0.6) {
                    const gi = Math.floor(randRange(samples.length * 0.5, samples.length - 1));
                    this._pushNode(samples[gi], CYAN.clone().lerp(CORE, rand() * 0.7),
                        randRange(0.01, 0.03), track.flex[gi], phase);
                }
            }
            this._pushNode(samples[samples.length - 1],
                isGold ? GOLD_BRIGHT : CYAN.clone().lerp(CORE, rand()),
                randRange(0.02, 0.05), track.flex[samples.length - 1], phase);
        }

        // Cross-links weave neighbors through the trunk and crown
        for (let l = 0; l < Math.round(520 * this.density); l++) {
            const a = this.filamentTracks[Math.floor(rand() * this.filamentTracks.length)];
            const ia = Math.floor(randRange(6, 20));
            const pa = a.samples[ia];
            let best = null;
            let bestDist = 0.14;
            for (let probe = 0; probe < 12; probe++) {
                const b = this.filamentTracks[Math.floor(rand() * this.filamentTracks.length)];
                if (b === a) continue;
                const ib = Math.min(ia + Math.floor(randRange(-2, 3)), b.samples.length - 1);
                const d = pa.distanceTo(b.samples[ib]);
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

        // Web clouds at every leaf node, plexus-stitched and anchored
        const webRand = mulberry32(this.seed + 3);
        const WEB_CYAN = CYAN.clone().lerp(TEAL_DEEP, 0.45);
        for (const leaf of this.leaves) {
            const branch = this.nodesById.get(leaf.parent);
            const w = ((branch.weight ?? 1) / 3) * (leaf.kind === 'bloom' ? 1.05 : 0.7);
            const center = leaf.posV;
            const radii = new THREE.Vector3(0.62 * w, 0.24 * w + 0.08, 0.46 * w);
            const count = Math.round((70 + (branch.weight ?? 1) * 40) * this.density * (leaf.kind === 'bloom' ? 1 : 0.7));
            const cloudPhase = webRand() * Math.PI * 2;
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
            for (let i = 0; i < pts.length; i++) {
                const dists = pts.map((q, j) => ({ j, d: i === j ? Infinity : pts[i].distanceTo(q) }));
                dists.sort((a, b) => a.d - b.d);
                for (let n = 0; n < 2; n++) {
                    const shade = WEB_CYAN.clone().lerp(CYAN, webRand() * 0.6);
                    this._pushSegment(pts[i], pts[dists[n].j], shade, shade, 0.55, 0.55, cloudPhase + webRand() * 0.7);
                }
                if (webRand() < 0.6) {
                    const spark = webRand() < 0.08;
                    this._pushNode(pts[i],
                        spark ? GOLD_BRIGHT : CYAN.clone().lerp(CORE, Math.pow(webRand(), 2)),
                        0.01 + Math.pow(webRand(), 2.2) * 0.055, 0.55, cloudPhase + webRand() * 0.7);
                }
            }
        }
    }

    // ------------------------------------------------------------------
    // Landscape: PURELY visual — mound, Cartesian hill grid, glints
    // ------------------------------------------------------------------
    _generateLandscape() {
        const moundRand = mulberry32(this.seed + 11);
        const MOUND_RADIUS = 1.18;
        const MOUND_HEIGHT = 0.3;
        const moundSurface = (azimuth, r) => {
            const rr = Math.min(r, MOUND_RADIUS);
            return new THREE.Vector3(
                Math.cos(azimuth) * rr,
                MOUND_HEIGHT * (1 - Math.pow(rr / MOUND_RADIUS, 2)) - 0.02,
                Math.sin(azimuth) * rr
            );
        };
        const moundGold = (r) => {
            const rim = Math.pow(THREE.MathUtils.clamp(r / MOUND_RADIUS, 0, 1), 2.2);
            return GOLD.clone().multiplyScalar(0.45 + 0.2 * rim).lerp(GOLD_BRIGHT, rim * 0.75);
        };
        for (let i = 0; i < Math.round(150 * this.density); i++) {
            const a0 = moundRand() * Math.PI * 2;
            const sweep = (1.2 + moundRand() * 2.6) * (moundRand() < 0.5 ? -1 : 1);
            const rBase = 0.35 + moundRand() * 0.8;
            const rDip = moundRand() * 0.5;
            const phase = moundRand() * Math.PI * 2;
            let prev = null;
            let prevColor = null;
            for (let sIdx = 0; sIdx <= 12; sIdx++) {
                const f = sIdx / 12;
                const azimuth = a0 + sweep * f;
                const r = Math.abs(rBase + Math.sin(f * Math.PI) * rDip * (moundRand() < 0.5 ? -1 : 1) * 0.5
                    + (moundRand() - 0.5) * 0.05);
                const pt = moundSurface(azimuth, r);
                pt.y += (moundRand() - 0.5) * 0.02;
                const color = moundGold(r);
                if (prev) this._pushSegment(prev, pt, prevColor, color, 0.02, 0.02, phase);
                prev = pt;
                prevColor = color;
            }
            if (moundRand() < 0.25) {
                this._pushNode(prev, GOLD_BRIGHT, 0.012 + Math.pow(moundRand(), 2) * 0.03, 0.02, phase);
            }
        }
        {
            const netPts = [];
            for (let i = 0; i < Math.round(70 * this.density); i++) {
                const pt = moundSurface(moundRand() * Math.PI * 2, Math.sqrt(moundRand()) * 0.75);
                pt.y += 0.015;
                netPts.push(pt);
            }
            for (let i = 0; i < netPts.length; i++) {
                const dists = netPts.map((q, j) => ({ j, d: i === j ? Infinity : netPts[i].distanceTo(q) }));
                dists.sort((a, b) => a.d - b.d);
                for (let n = 0; n < 2; n++) {
                    const c = moundGold(Math.hypot(netPts[i].x, netPts[i].z));
                    this._pushSegment(netPts[i], netPts[dists[n].j], c, c, 0.02, 0.02, moundRand() * 6);
                }
            }
        }

        const terrainRand = mulberry32(this.seed + 19);
        const T_EXTENT = 24;
        const T_SPACING = this.density < 1 ? 0.85 : 0.6;
        const BROWN_NEAR = new THREE.Color(0x8a5f24);
        const BROWN_FAR = new THREE.Color(0x372512);
        const terrainHeight = (x, z) => {
            const d = Math.hypot(x, z);
            const roll = Math.sin(x * 0.31 + 0.8) * Math.sin(z * 0.27 + 2.1)
                + 0.5 * Math.sin(x * 0.11 - z * 0.17 + 1.0)
                + 0.3 * Math.sin(x * 0.53 + z * 0.41);
            const amplitude = 0.03 + THREE.MathUtils.clamp((d - 1.3) / 5, 0, 1) * 0.32;
            const hills = -0.02 + roll * amplitude;
            const domeSpan = MOUND_RADIUS * 1.08;
            const domeBump = d < domeSpan ? (MOUND_HEIGHT - 0.02) * (1 - Math.pow(d / domeSpan, 2)) : 0;
            return hills + domeBump;
        };
        const terrainColor = (x, z) => {
            const d = Math.hypot(x, z);
            return GOLD.clone().multiplyScalar(0.7)
                .lerp(BROWN_NEAR, THREE.MathUtils.smoothstep(d, 1.15, 3.4))
                .lerp(BROWN_FAR, THREE.MathUtils.smoothstep(d, 2.5, 16));
        };
        const steps = Math.round((T_EXTENT * 2) / T_SPACING);
        for (let axis = 0; axis < 2; axis++) {
            for (let i = 0; i <= steps; i++) {
                const fixed = -T_EXTENT + i * T_SPACING + (terrainRand() - 0.5) * T_SPACING * 0.25;
                let prev = null;
                let prevColor = null;
                for (let j = 0; j <= steps; j++) {
                    const along = -T_EXTENT + j * T_SPACING;
                    const x = axis === 0 ? fixed : along;
                    const z = axis === 0 ? along : fixed;
                    if (Math.hypot(x, z) < 0.3) { prev = null; continue; }
                    const pt = new THREE.Vector3(x, terrainHeight(x, z), z);
                    const color = terrainColor(x, z);
                    if (prev) this._pushSegment(prev, pt, prevColor, color, 0.0, 0.0, 0);
                    prev = pt;
                    prevColor = color;
                }
            }
        }
    }

    // ------------------------------------------------------------------
    // Scene, materials, atmosphere
    // ------------------------------------------------------------------
    _buildScene() {
        this.scene = new THREE.Scene();
        {
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
        const addGlow = (texture, position, scale, opacity) => {
            const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
                map: texture, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending,
            }));
            sprite.position.copy(position);
            sprite.scale.set(scale.x, scale.y, 1);
            this.scene.add(sprite);
        };
        const goldGlow = glowTexture('rgba(240, 185, 90, 0.9)', 'rgba(240, 185, 90, 0)');
        const tealGlow = glowTexture('rgba(70, 150, 200, 0.7)', 'rgba(70, 150, 200, 0)');
        addGlow(goldGlow, new THREE.Vector3(0, 0.12, -0.6), new THREE.Vector2(4.6, 1.1), 0.28);
        addGlow(goldGlow, new THREE.Vector3(0, 0.05, 0.0), new THREE.Vector2(3.0, 0.6), 0.22);
        addGlow(tealGlow, new THREE.Vector3(-1.6, 1.7, -2.2), new THREE.Vector2(4.2, 2.4), 0.14);
        addGlow(tealGlow, new THREE.Vector3(1.8, 1.5, -2.4), new THREE.Vector2(3.8, 2.2), 0.12);
        addGlow(tealGlow, new THREE.Vector3(-2.6, 0.7, 2.3), new THREE.Vector2(0.55, 0.55), 0.2);
        addGlow(goldGlow, new THREE.Vector3(2.4, 0.4, 2.6), new THREE.Vector2(0.4, 0.4), 0.16);

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
                    gl_PointSize = aSize * (1.0 + defocus * 1.6) * (uPixelScale / depth);
                    vAlpha = 1.0 / (1.0 + defocus * defocus * 1.4);
                    gl_Position = projectionMatrix * mv;
                }
            `,
            fragmentShader: /* glsl */`
                varying vec3 vColor;
                varying float vAlpha;
                void main() {
                    float d = length(gl_PointCoord - 0.5);
                    gl_FragColor = vec4(vColor, smoothstep(0.5, 0.12, d) * vAlpha);
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
    // Blooms: petals, stems, labels, and the vitality status node
    // ------------------------------------------------------------------
    _buildBlooms() {
        const flowerRand = mulberry32(this.seed + 23);
        this.labelSprites = [];
        this.bloomStates = [];

        const petalPositions = [];
        const petalColors = [];
        const petalSizes = [];
        const petalFlex = [];
        const petalPhase = [];

        this.blooms.forEach((bloom, i) => {
            const center = bloom.posV;
            const phase = flowerRand() * Math.PI * 2;
            bloom.phase = phase;

            for (let petal = 0; petal < 16; petal++) {
                const dir = new THREE.Vector3(flowerRand() - 0.5, flowerRand() - 0.5, flowerRand() - 0.5).normalize();
                const reach = 0.03 + Math.pow(flowerRand(), 0.7) * 0.075;
                const pos = center.clone().addScaledVector(dir, reach);
                const color = flowerRand() < 0.3 ? FLOWER_CORE : FLOWER_YELLOW.clone().lerp(GOLD_BRIGHT, flowerRand() * 0.5);
                petalPositions.push(pos.x, pos.y, pos.z);
                petalColors.push(color.r, color.g, color.b);
                petalSizes.push(0.068 + flowerRand() * 0.076);
                petalFlex.push(0.45);
                petalPhase.push(phase);
                if (flowerRand() < 0.5) {
                    this._pushSegment(center, pos, GOLD, FLOWER_YELLOW, 0.45, 0.45, phase);
                }
            }
            petalPositions.push(center.x, center.y, center.z);
            petalColors.push(FLOWER_CORE.r, FLOWER_CORE.g, FLOWER_CORE.b);
            petalSizes.push(0.23);
            petalFlex.push(0.45);
            petalPhase.push(phase);
            this._pushSegment(center, center.clone().add(new THREE.Vector3(0, 0.075, 0)),
                GOLD, FLOWER_CORE, 0.45, 0.45, phase);

            // Status node offset like a distinguished petal
            const statusPos = center.clone().add(
                new THREE.Vector3(Math.cos(i * 2.4), 0.5, Math.sin(i * 2.4)).normalize().multiplyScalar(0.06));
            this.bloomStates.push({ bloom, statusPos, phase });

            // Label sprite with glow, CPU-wind-mirrored
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
            ctx.fillText(bloom.label, 256, 64);
            ctx.shadowBlur = 8;
            ctx.fillText(bloom.label, 256, 64);
            const texture = new THREE.CanvasTexture(canvas);
            texture.colorSpace = THREE.SRGBColorSpace;
            const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
                map: texture, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
            }));
            sprite.position.copy(center).add(new THREE.Vector3(0, 0.095, 0));
            sprite.scale.set(0.31, 0.078, 1);
            this.scene.add(sprite);
            this.labelSprites.push({
                sprite,
                base: sprite.position.clone(),
                windAt: center.clone().add(new THREE.Vector3(0, 0.075, 0)),
                phase,
                flex: 0.45,
            });
        });

        // Petals share the static node system via their own buffer
        const petalGeometry = new THREE.BufferGeometry();
        petalGeometry.setAttribute('position', new THREE.Float32BufferAttribute(petalPositions, 3));
        petalGeometry.setAttribute('color', new THREE.Float32BufferAttribute(petalColors, 3));
        petalGeometry.setAttribute('aSize', new THREE.Float32BufferAttribute(petalSizes, 1));
        petalGeometry.setAttribute('aFlex', new THREE.Float32BufferAttribute(petalFlex, 1));
        petalGeometry.setAttribute('aPhase', new THREE.Float32BufferAttribute(petalPhase, 1));
        this.scene.add(new THREE.Points(petalGeometry, this.nodeMaterial));

        // Status nodes: dynamic color/size driven by hp(t)
        const n = this.bloomStates.length;
        this.statusColors = new Float32Array(n * 3);
        this.statusSizes = new Float32Array(n);
        const statusPositions = new Float32Array(n * 3);
        this.bloomStates.forEach((bs, i) => {
            statusPositions[i * 3] = bs.statusPos.x;
            statusPositions[i * 3 + 1] = bs.statusPos.y;
            statusPositions[i * 3 + 2] = bs.statusPos.z;
        });
        this.statusGeometry = new THREE.BufferGeometry();
        this.statusGeometry.setAttribute('position', new THREE.BufferAttribute(statusPositions, 3));
        this.statusGeometry.setAttribute('color', new THREE.BufferAttribute(this.statusColors, 3).setUsage(THREE.DynamicDrawUsage));
        this.statusGeometry.setAttribute('aSize', new THREE.BufferAttribute(this.statusSizes, 1).setUsage(THREE.DynamicDrawUsage));
        this.statusGeometry.setAttribute('aFlex', new THREE.Float32BufferAttribute(this.bloomStates.map(() => 0.45), 1));
        this.statusGeometry.setAttribute('aPhase', new THREE.Float32BufferAttribute(this.bloomStates.map((bs) => bs.phase), 1));
        this.scene.add(new THREE.Points(this.statusGeometry, this.nodeMaterial));
    }

    // ------------------------------------------------------------------
    // Flies: star-sprite gems whose positions are INTEGRATED from
    // directives — the data never stores paths
    // ------------------------------------------------------------------
    _buildFlies() {
        const ffRand = mulberry32(this.seed + 31);
        this.flies = this.evolution.flies.map((spec) => {
            const startNode = this.nodesById.get(spec.start);
            return {
                spec,
                anchor: startNode.posV.clone(),
                ampScale: 1,
                ax: 0.7 + ffRand() * 1.6,
                ay: 0.9 + ffRand() * 1.8,
                az: 0.6 + ffRand() * 1.4,
                p1: ffRand() * Math.PI * 2,
                p2: ffRand() * Math.PI * 2,
                p3: ffRand() * Math.PI * 2,
                rx: 0.08 + ffRand() * 0.16,
                ry: 0.05 + ffRand() * 0.1,
                rz: 0.08 + ffRand() * 0.16,
                baseSize: (0.17 + ffRand() * 0.17) * (1 + Math.pow(ffRand(), 3)) * spec.size,
                flicker: 2 + ffRand() * 3,
            };
        });

        const n = this.flies.length;
        this.flyPositions = new Float32Array(n * 3);
        this.flySizes = new Float32Array(n);
        const flyColors = new Float32Array(n * 3);
        const zero = new Float32Array(n);
        const violet = new THREE.Color(0x9b4dff);
        const lilac = new THREE.Color(0xd18bff);
        for (let i = 0; i < n; i++) {
            const c = violet.clone().lerp(lilac, (i % 5) / 5);
            flyColors[i * 3] = c.r; flyColors[i * 3 + 1] = c.g; flyColors[i * 3 + 2] = c.b;
        }
        this.flyGeometry = new THREE.BufferGeometry();
        this.flyGeometry.setAttribute('position', new THREE.BufferAttribute(this.flyPositions, 3).setUsage(THREE.DynamicDrawUsage));
        this.flyGeometry.setAttribute('color', new THREE.BufferAttribute(flyColors, 3));
        this.flyGeometry.setAttribute('aSize', new THREE.BufferAttribute(this.flySizes, 1).setUsage(THREE.DynamicDrawUsage));
        this.flyGeometry.setAttribute('aFlex', new THREE.BufferAttribute(zero, 1));
        this.flyGeometry.setAttribute('aPhase', new THREE.BufferAttribute(zero.slice(), 1));

        this.flyMaterial = new THREE.ShaderMaterial({
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
                    gl_PointSize = aSize * (1.0 + defocus * 0.45) * (uPixelScale / depth);
                    vAlpha = 1.0 / (1.0 + defocus * defocus * 0.35);
                    gl_Position = projectionMatrix * mv;
                }
            `,
            fragmentShader: /* glsl */`
                varying vec3 vColor;
                varying float vAlpha;
                void main() {
                    vec2 c = gl_PointCoord - 0.5;
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
        this.scene.add(new THREE.Points(this.flyGeometry, this.flyMaterial));
    }

    _updateFlies(tEvo, wall, dt) {
        const slow = wall * 0.5; // gems drift at half speed
        for (let i = 0; i < this.flies.length; i++) {
            const fly = this.flies[i];
            const directive = this._flyDirective(fly.spec, tEvo);
            const node = this.nodesById.get(directive.node);
            // The anchor eases toward the directed node; hover amplitude
            // tightens for tight orbits, opens for travel and wide orbits
            const targetAmp = directive.type === 'orbit' && directive.radius === 'tight' ? 0.28 : 1;
            fly.ampScale += (targetAmp - fly.ampScale) * Math.min(1, dt * 3);
            fly.anchor.lerp(node.posV, Math.min(1, dt * (directive.type === 'steer' ? 1.6 : 0.9)));

            const hx = Math.sin(slow * fly.ax + fly.p1) * fly.rx;
            const hy = Math.sin(slow * fly.ay + fly.p2) * fly.ry;
            const hz = Math.cos(slow * fly.az + fly.p3) * fly.rz;
            this.flyPositions[i * 3] = fly.anchor.x + hx * fly.ampScale;
            this.flyPositions[i * 3 + 1] = fly.anchor.y + hy * fly.ampScale;
            this.flyPositions[i * 3 + 2] = fly.anchor.z + hz * fly.ampScale;
            this.flySizes[i] = fly.baseSize * (0.55 + 0.45 * Math.sin(slow * fly.flicker + fly.p1) ** 2);
        }
        this.flyGeometry.attributes.position.needsUpdate = true;
        this.flyGeometry.attributes.aSize.needsUpdate = true;
    }

    // ------------------------------------------------------------------
    // Beams: flashlight cones + code dashes for actions active at tEvo
    // ------------------------------------------------------------------
    _buildBeams() {
        this.MAX_BEAMS = 4;
        this.BEAM_DASHES = 7;
        this.beamPositions = new Float32Array(this.MAX_BEAMS * this.BEAM_DASHES * 6);
        this.beamGeometry = new THREE.BufferGeometry();
        this.beamGeometry.setAttribute('position', new THREE.BufferAttribute(this.beamPositions, 3).setUsage(THREE.DynamicDrawUsage));
        this.scene.add(new THREE.LineSegments(this.beamGeometry, new THREE.LineBasicMaterial({
            color: 0xe0c4ff, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending,
        })));

        this.flashlights = [];
        const coneGeometry = new THREE.ConeGeometry(0.028, 1, 14, 1, true);
        coneGeometry.translate(0, -0.5, 0);
        for (let i = 0; i < this.MAX_BEAMS; i++) {
            const mesh = new THREE.Mesh(coneGeometry, new THREE.MeshBasicMaterial({
                color: 0xb87aff, transparent: true, opacity: 0, depthWrite: false,
                blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
            }));
            mesh.visible = false;
            this.flashlights.push(mesh);
            this.scene.add(mesh);
        }
        this._beamScratchA = new THREE.Vector3();
        this._beamScratchB = new THREE.Vector3();
        this._beamOrigin = new THREE.Vector3();
        this._beamDir = new THREE.Vector3();
        this._beamDown = new THREE.Vector3(0, -1, 0);
        this.flyIndexById = new Map(this.evolution.flies.map((f, i) => [f.id, i]));
    }

    _updateBeams(tEvo) {
        this.beamPositions.fill(0);
        for (const mesh of this.flashlights) mesh.visible = false;
        let slot = 0;
        for (const beam of this.beamActions) {
            if (slot >= this.MAX_BEAMS) break;
            const u = (tEvo - beam.t) / beam.duration;
            if (u < 0 || u > 1) continue;
            const target = this.nodesById.get(beam.node);
            const bloomState = this.bloomStates.find((bs) => bs.bloom.id === beam.node);
            const to = bloomState ? bloomState.statusPos : target.posV;
            const flyIndex = this.flyIndexById.get(beam.fly);
            this._beamOrigin.set(
                this.flyPositions[flyIndex * 3],
                this.flyPositions[flyIndex * 3 + 1],
                this.flyPositions[flyIndex * 3 + 2]
            );
            const flashlight = this.flashlights[slot];
            this._beamDir.copy(to).sub(this._beamOrigin);
            const length = Math.max(this._beamDir.length(), 0.001);
            flashlight.position.copy(this._beamOrigin);
            flashlight.quaternion.setFromUnitVectors(this._beamDown, this._beamDir.normalize());
            // Aperture tracks the target's rendered radius (statusSizes is
            // a world-space diameter), erring narrow so the pool of light
            // never spills past the node
            const targetSize = bloomState
                ? this.statusSizes[this.bloomStates.indexOf(bloomState)]
                : 0.08;
            const aperture = Math.max((targetSize * 0.5 * 0.7) / 0.028, 0.6);
            flashlight.scale.set(aperture, length, aperture);
            flashlight.material.opacity = 0.34 * Math.sin(Math.PI * u);
            flashlight.visible = true;
            for (let k = 0; k < this.BEAM_DASHES; k++) {
                const march = ((tEvo - beam.t) * 1.6 + k / this.BEAM_DASHES) % 1;
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
            slot += 1;
        }
        this.beamGeometry.attributes.position.needsUpdate = true;
    }

    _updateVitality(tEvo, wall) {
        this.bloomStates.forEach((bs, i) => {
            const h = this._bloomHp(bs.bloom, tEvo) / 100;
            const color = hpColor(h);
            let size = 0.08;
            if (h < 0.8) {
                const distress = (0.8 - h) / 0.8;
                const pulse = 0.5 + 0.5 * Math.sin(wall * (3 + distress * 4) + i * 1.7);
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
    }

    _updateLabels(wall) {
        for (const label of this.labelSprites) {
            const p = label.windAt;
            const gust = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(wall * 0.35 + p.x * 0.4));
            const s1 = Math.sin(wall * 1.1 + label.phase + p.y * 1.3);
            const s2 = Math.sin(wall * 2.3 + label.phase * 1.7 + p.x * 0.8);
            const s3 = Math.cos(wall * 0.9 + label.phase);
            const k = label.flex * 0.0275 * gust;
            label.sprite.position.set(
                label.base.x + s1 * k,
                label.base.y + s2 * 0.25 * k,
                label.base.z + s3 * 0.6 * k
            );
        }
    }

    // ------------------------------------------------------------------
    // Camera: orbit + bloom tour, exponential smoothing, manual flight
    // ------------------------------------------------------------------
    _buildCamera() {
        this.camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.05, 40);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.domElement.style.display = 'block';
        this.fillViewport = this.container.dataset.fill === 'viewport';
        this.renderer.domElement.style.borderRadius = this.fillViewport ? '0' : '8px';
        this.container.appendChild(this.renderer.domElement);

        this.LOOP_MS = 60000;
        this.ORBIT_FRACTION = 25 / 60;
        this.ORBIT_RADIUS = 3.5;
        this.ORBIT_HEIGHT = 1.25;
        this.ORBIT_SWEEP = Math.PI * 1.75;
        this.START_OFFSET_MS = this.ORBIT_FRACTION * this.LOOP_MS - 1000;

        const orbitPosition = (theta) => new THREE.Vector3(
            Math.cos(theta) * this.ORBIT_RADIUS,
            this.ORBIT_HEIGHT + Math.sin(theta * 2) * 0.15,
            Math.sin(theta) * this.ORBIT_RADIUS
        );
        this._orbitPosition = orbitPosition;

        const stops = this.evolution.meta.tourStops.map((id) => this.nodesById.get(id).posV);
        const RADIUS = 0.5;
        const HEIGHT = 0.06;
        const circleAround = (center, angle) => new THREE.Vector3(
            center.x + Math.cos(angle) * RADIUS,
            center.y + HEIGHT,
            center.z + Math.sin(angle) * RADIUS
        );
        this._circleAround = circleAround;

        this.tourSegments = [];
        let cursor = orbitPosition(this.ORBIT_SWEEP);
        let previousLook = TREE_CENTER;
        stops.forEach((stop, i) => {
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
            this.tourSegments.push({ kind: 'circle', center: stop.clone(), entryAngle, duration: 8, lookTo: stop.clone() });
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

        this._lookTarget = new THREE.Vector3();
        this._targetPosition = new THREE.Vector3();
        this._smoothPosition = new THREE.Vector3();
        this._smoothLook = new THREE.Vector3();
        this._cameraPrimed = false;
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
            const alpha = 1 - Math.exp(-2.6 * dt);
            this._smoothPosition.lerp(this._targetPosition, alpha);
            this._smoothLook.lerp(this._lookTarget, alpha);
        }
        this.camera.position.copy(this._smoothPosition);
        this.camera.lookAt(this._smoothLook);
        const focus = Math.max(this._smoothPosition.distanceTo(this._smoothLook), 0.4);
        this.lineMaterial.uniforms.uFocus.value = focus;
        this.nodeMaterial.uniforms.uFocus.value = focus;
        this.flyMaterial.uniforms.uFocus.value = focus;
    }

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
            this.fsButton = buildFullscreenButton(this.container, () => {
                if (document.fullscreenElement === this.container) document.exitFullscreen?.();
                else this.container.requestFullscreen?.();
            });
            document.addEventListener('fullscreenchange', () => {
                this.fsButton.innerHTML = document.fullscreenElement === this.container
                    ? FS_EXIT_ICON : FS_ENTER_ICON;
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

        // Transport: play/pause + a scrub track over one evolution round
        // trip (out and back), YouTube-style along the bottom edge. The
        // clock state always exists — a hosting shell drives it directly
        // when chrome is off.
        this.simNow = 0;
        this.playing = true;
        this.PERIOD_MS = this.evolution.meta.duration * 2000;
        this.playerUI = null;

        if (this.chrome) this._buildTransportBar();

        this.resize = this.resize.bind(this);
        this.resize();
        window.addEventListener('resize', this.resize);
        document.addEventListener('fullscreenchange', this.resize);
    }

    _buildTransportBar() {
        this.playerUI = buildTransportBar(this.container, {
            isPlaying: () => this.playing,
            onPlayToggle: () => {
                this.playing = !this.playing;
                this.playerUI.setPlaying(this.playing);
            },
            onSeek: (frac) => this.seekToFraction(frac),
        });
        this.hint.style.bottom = '48px';
        this.fsButton.style.bottom = '4px';
        this.playerUI.update(0, this.PERIOD_MS);
    }

    // --- The vis interface (see DESIGN.md) ---

    fraction() {
        return (this.simNow % this.PERIOD_MS) / this.PERIOD_MS;
    }

    // Seeks keep the current cycle, so absolute time never jumps by more
    // than one period — wind phase stays continuous
    seekToFraction(frac) {
        frac = THREE.MathUtils.clamp(frac, 0, 0.9999);
        const cycle = Math.floor(this.simNow / this.PERIOD_MS);
        this.simNow = (cycle + frac) * this.PERIOD_MS;
        this._cameraPrimed = false; // snap to the sought pose
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
            this._smoothPosition.copy(this.camera.position);
            this._smoothLook.copy(this.camera.position).addScaledVector(this._manualForward, 2);
        }
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
        this.flyMaterial.uniforms.uFocus.value = focus;
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
        this.flyMaterial.uniforms.uPixelScale.value = scale;
    }

    // ------------------------------------------------------------------
    _animate() {
        requestAnimationFrame(this._animate);
        const now = performance.now();
        const rawDt = Math.min((now - (this._lastFrame ?? now)) / 1000, 0.05);
        this._lastFrame = now;
        if (this.suspended) return; // hidden behind another vis: idle cheaply
        // The scene runs on simNow, the pausable/seekable master clock
        const dt = this.playing ? rawDt : 0;
        this.simNow += dt * 1000;
        const wall = this.simNow / 1000;
        const tEvo = this._evolutionTime(wall);

        this.lineMaterial.uniforms.uTime.value = wall;
        this.nodeMaterial.uniforms.uTime.value = wall;
        this.flyMaterial.uniforms.uTime.value = wall;

        this._updateFlies(tEvo, wall, dt);
        this._updateVitality(tEvo, wall);
        this._updateBeams(tEvo);
        this._updateLabels(wall);

        // Manual flight keeps real-time dt so a paused scene can be roamed
        if (this.manualMode) this._updateManualFlight(rawDt);
        else this._positionCamera(this.simNow, dt);
        this.playerUI?.update(this.fraction(), this.PERIOD_MS);
        this.renderer.render(this.scene, this.camera);
    }
}
