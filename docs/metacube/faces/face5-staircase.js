// Face 5 (+z): a 3D interpretation of M.C. Escher's "Relativity" — a pale
// stone room sunk INTO the cube's volume, entered through a real opening in
// the face, where three gravity fields coexist at right angles. Three
// staircases cross the space, each belonging to a different "down": one lies
// on the back wall (seen top-down by the viewer), one climbs sideways with
// its treads facing the viewer's lateral +z, one climbs the other lateral
// axis. Faceless figures walk them at conflicting angles — including the
// print's signature pair sharing a single staircase, one striding along the
// top while another hangs from its underside. Everything is near-monochrome,
// echoing the lithograph.
import * as THREE from 'three';

const BOARD_SIZE = 1024;

// The shaft opening occupies the center 0.72 of the face; the face texture keeps
// an opaque stone frame around it and punches a REAL hole via alphaTest
const SHAFT_HALF = 0.36;
const HOLE_MIN_PX = ((1 - 2 * SHAFT_HALF) / 2) * BOARD_SIZE;
const HOLE_MAX_PX = BOARD_SIZE - HOLE_MIN_PX;

const STONE_LIGHT = '#d3cfc6';
const STONE_MID = '#bdb9b0';
const STONE_DARK = '#a19d94';
const MORTAR = '#807c74';

export function createFace5Material() {
    const canvas = document.createElement('canvas');
    canvas.width = BOARD_SIZE;
    canvas.height = BOARD_SIZE;
    const ctx = canvas.getContext('2d');

    // Stone-block frame
    ctx.fillStyle = STONE_MID;
    ctx.fillRect(0, 0, BOARD_SIZE, BOARD_SIZE);

    const block = 64;
    for (let row = 0; row < BOARD_SIZE / block; row++) {
        for (let col = 0; col < BOARD_SIZE / block + 1; col++) {
            const offset = (row % 2) * block * 0.5;
            const shades = [STONE_LIGHT, STONE_MID, STONE_DARK];
            ctx.fillStyle = shades[(row * 7 + col * 3) % 3];
            ctx.fillRect(col * block - offset + 2, row * block + 2, block - 4, block - 4);
        }
    }
    ctx.strokeStyle = MORTAR;
    ctx.lineWidth = 4;
    for (let i = 0; i <= BOARD_SIZE / block; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * block);
        ctx.lineTo(BOARD_SIZE, i * block);
        ctx.stroke();
    }

    // Carved rim around the opening
    ctx.strokeStyle = MORTAR;
    ctx.lineWidth = 14;
    ctx.strokeRect(HOLE_MIN_PX - 7, HOLE_MIN_PX - 7, HOLE_MAX_PX - HOLE_MIN_PX + 14, HOLE_MAX_PX - HOLE_MIN_PX + 14);

    // The opening itself: fully transparent -> discarded by alphaTest -> a real
    // hole in the face through which the room is visible
    ctx.clearRect(HOLE_MIN_PX, HOLE_MIN_PX, HOLE_MAX_PX - HOLE_MIN_PX, HOLE_MAX_PX - HOLE_MIN_PX);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.needsUpdate = true;

    return new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.85,
        metalness: 0.05,
        alphaTest: 0.5,
    });
}

// --- The Relativity room ---

// Interior plaster in the lithograph's manner: pale ground laid over with
// fine parallel hatching (the woodcut shading Escher rendered every surface
// with), broad tonal bands, and faint stone coursing with staggered joints
function createHatchedPlasterTexture() {
    const SIZE = 512;
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#cbc7bd';
    ctx.fillRect(0, 0, SIZE, SIZE);

    // Hatching: horizontal strokes whose weight swells and fades in bands,
    // like the graver's parallel lines
    for (let y = 0; y < SIZE; y += 3) {
        const band = 0.5 + 0.5 * Math.sin(y * 0.025) * Math.sin(y * 0.007 + 1.7);
        ctx.strokeStyle = `rgba(84, 81, 74, ${0.05 + 0.13 * band})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 0; x <= SIZE; x += 32) {
            const wave = Math.sin((x + y * 3) * 0.02) * 1.2;
            if (x === 0) ctx.moveTo(x, y + wave);
            else ctx.lineTo(x, y + wave);
        }
        ctx.stroke();
    }
    // A sparse cross-hatch pass deepens the darker bands
    for (let d = -SIZE; d < SIZE * 2; d += 9) {
        const band = Math.sin(d * 0.01);
        if (band < 0.3) continue;
        ctx.strokeStyle = `rgba(84, 81, 74, ${0.06 * band})`;
        ctx.beginPath();
        ctx.moveTo(d, 0);
        ctx.lineTo(d - SIZE * 0.55, SIZE);
        ctx.stroke();
    }

    // Stone coursing: faint horizontal beds with staggered vertical joints
    ctx.strokeStyle = 'rgba(74, 71, 64, 0.28)';
    ctx.lineWidth = 2;
    const course = 96;
    for (let y = course; y < SIZE; y += course) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(SIZE, y);
        ctx.stroke();
    }
    for (let row = 0; row < SIZE / course; row++) {
        const offset = (row % 2) * course;
        for (let x = offset + course / 2; x < SIZE; x += course * 2) {
            ctx.beginPath();
            ctx.moveTo(x, row * course);
            ctx.lineTo(x, (row + 1) * course);
            ctx.stroke();
        }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.needsUpdate = true;
    return texture;
}

const WALL_STONE = new THREE.MeshStandardMaterial({
    map: createHatchedPlasterTexture(),
    color: 0x8f8b84, // multiplies the map back down to the room's mid-gray
    roughness: 0.9,
    metalness: 0.02,
});
const STEP_STONE = new THREE.MeshStandardMaterial({ color: 0x9c988f, roughness: 0.8, metalness: 0.03 });
const UNDER_STONE = new THREE.MeshStandardMaterial({ color: 0x6b6660, roughness: 0.85, metalness: 0.02 });
const RAIL_STONE = new THREE.MeshStandardMaterial({ color: 0x3f3d39, roughness: 0.7, metalness: 0.05 });
const ARCH_STONE = new THREE.MeshStandardMaterial({ color: 0x8a867e, roughness: 0.85, metalness: 0.02 });

const SHAFT_DEPTH = 0.42; // how far the room sinks into the cube
const WALL_THICKNESS = 0.03;

// One staircase in its local frame: climbing +x, up +y, width along z,
// first tread at the origin. Solid treads and risers over an angled
// stringer, with railing posts and a handrail on both edges, and a small
// landing at the top.
const STAIR_STEPS = 14;
const RUN_STEP = 0.036;
const RISE_STEP = 0.0143;
const STAIR_WIDTH = 0.056;
const STAIR_RUN = STAIR_STEPS * RUN_STEP;
const STAIR_RISE = STAIR_STEPS * RISE_STEP;
const SLOPE = STAIR_RISE / STAIR_RUN;

function buildStair() {
    const stair = new THREE.Group();

    for (let i = 0; i < STAIR_STEPS; i++) {
        const x = (i + 0.5) * RUN_STEP;
        const y = (i + 1) * RISE_STEP;
        const tread = new THREE.Mesh(new THREE.BoxGeometry(RUN_STEP, 0.006, STAIR_WIDTH), STEP_STONE);
        tread.position.set(x, y - 0.003, 0);
        stair.add(tread);
        const riser = new THREE.Mesh(new THREE.BoxGeometry(0.006, RISE_STEP, STAIR_WIDTH), STEP_STONE);
        riser.position.set(x - RUN_STEP / 2 + 0.003, y - RISE_STEP / 2, 0);
        stair.add(riser);
    }

    // Angled stringer slab beneath the steps, so the flight reads solid from
    // every gravity's point of view (some flights are seen from below)
    const stringerLength = Math.hypot(STAIR_RUN, STAIR_RISE);
    const stringer = new THREE.Mesh(new THREE.BoxGeometry(stringerLength, 0.022, STAIR_WIDTH), UNDER_STONE);
    stringer.position.set(STAIR_RUN / 2, STAIR_RISE / 2 - 0.014, 0);
    stringer.rotation.z = Math.atan2(STAIR_RISE, STAIR_RUN);
    stair.add(stringer);

    // Railings: posts every other step, handrail bars along the slope
    for (const side of [-1, 1]) {
        for (let i = 0; i < STAIR_STEPS; i += 2) {
            const x = (i + 0.5) * RUN_STEP;
            const y = (i + 1) * RISE_STEP;
            const post = new THREE.Mesh(new THREE.CylinderGeometry(0.0016, 0.0016, 0.028, 6), RAIL_STONE);
            post.position.set(x, y + 0.014, side * (STAIR_WIDTH / 2 - 0.003));
            stair.add(post);
        }
        const rail = new THREE.Mesh(new THREE.BoxGeometry(stringerLength, 0.004, 0.004), RAIL_STONE);
        rail.position.set(STAIR_RUN / 2, STAIR_RISE / 2 + 0.028, side * (STAIR_WIDTH / 2 - 0.003));
        rail.rotation.z = Math.atan2(STAIR_RISE, STAIR_RUN);
        stair.add(rail);
    }

    // Top landing
    const landing = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.01, STAIR_WIDTH), STEP_STONE);
    landing.position.set(STAIR_RUN + 0.03, STAIR_RISE - 0.005, 0);
    stair.add(landing);

    return stair;
}

// A faceless walking figure in its local frame: standing on y = 0, facing +x,
// legs swinging from the hips.
function buildWalker(tone) {
    const material = new THREE.MeshStandardMaterial({ color: tone, roughness: 0.75, metalness: 0.03 });
    const group = new THREE.Group();

    const hips = [];
    for (const side of [-1, 1]) {
        const hip = new THREE.Group();
        hip.position.set(0, 0.022, side * 0.004);
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.0032, 0.0026, 0.022, 6), material);
        leg.position.y = -0.011;
        hip.add(leg);
        group.add(hip);
        hips.push(hip);
    }

    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.0065, 0.008, 0.024, 8), material);
    torso.position.y = 0.036;
    group.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.0068, 8, 8), material);
    head.position.y = 0.055;
    group.add(head);

    return { group, hips };
}

// A dark arched doorway drawn flat, lithograph-style: black opening under a
// round arch, hatched reveals, jamb frame, and a threshold step. Applied as
// wall decals in conflicting gravities — the print's doorways everywhere.
function createDoorwayDecal() {
    const W = 256;
    const H = 384;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // Jamb frame
    ctx.strokeStyle = '#5d5a53';
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(36, H - 10);
    ctx.lineTo(36, 130);
    ctx.arc(W / 2, 130, W / 2 - 36, Math.PI, 0, false);
    ctx.lineTo(W - 36, H - 10);
    ctx.stroke();

    // The dark opening
    ctx.fillStyle = '#2b2823';
    ctx.beginPath();
    ctx.moveTo(52, H - 18);
    ctx.lineTo(52, 132);
    ctx.arc(W / 2, 132, W / 2 - 52, Math.PI, 0, false);
    ctx.lineTo(W - 52, H - 18);
    ctx.closePath();
    ctx.fill();

    // Hatched half-shadow inside the reveal, as the lithograph shades depth
    ctx.strokeStyle = 'rgba(140, 135, 124, 0.35)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 16; i++) {
        const x = 58 + i * 5;
        ctx.beginPath();
        ctx.moveTo(x, H - 22);
        ctx.lineTo(x - 14, 160 - i * 3);
        ctx.stroke();
    }

    // Threshold step
    ctx.fillStyle = '#b3afa6';
    ctx.fillRect(40, H - 20, W - 80, 14);
    ctx.strokeStyle = '#6f6c66';
    ctx.lineWidth = 3;
    ctx.strokeRect(40, H - 20, W - 80, 14);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.needsUpdate = true;

    const material = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.85,
        metalness: 0.02,
        transparent: true,
        alphaTest: 0.5,
        side: THREE.DoubleSide,
    });
    return new THREE.Mesh(new THREE.PlaneGeometry(0.11, 0.165), material);
}

// A round-topped doorway arch, extruded flat, in local XY with up +y
function buildArch() {
    const outerHalf = 0.07;
    const innerHalf = 0.045;
    const legTop = 0.11;

    const shape = new THREE.Shape();
    shape.moveTo(-outerHalf, 0);
    shape.lineTo(-outerHalf, legTop);
    shape.absarc(0, legTop, outerHalf, Math.PI, 0, true);
    shape.lineTo(outerHalf, 0);
    shape.lineTo(innerHalf, 0);
    shape.lineTo(innerHalf, legTop);
    shape.absarc(0, legTop, innerHalf, 0, Math.PI, false);
    shape.lineTo(-innerHalf, 0);
    shape.closePath();

    const geometry = new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: false });
    return new THREE.Mesh(geometry, ARCH_STONE);
}

// Orient a group by naming the world directions its local x and y map to;
// explicit basis vectors sidestep Euler-order puzzles entirely.
function orient(group, localXTo, localYTo) {
    const x = localXTo.clone().normalize();
    const y = localYTo.clone().normalize();
    const z = new THREE.Vector3().crossVectors(x, y);
    group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

const WALK_TRAVERSE_MS = 15000; // one full up-and-back per figure
const STRIDES_PER_TRAVERSE = STAIR_STEPS;

export function createFace5Staircase() {
    // Scene built with +Y up and the face plane at y = 0; one fixed single-axis
    // rotation maps scene +Y onto cube +Z (out of the face), so negative scene y
    // descends into the cube's volume.
    const group = new THREE.Group();
    group.position.set(0, 0, 0.5);
    group.rotation.x = Math.PI / 2;

    const room = new THREE.Group();
    group.add(room);

    // Back wall (the top-down world's floor), far below the opening
    const backWall = new THREE.Mesh(
        new THREE.BoxGeometry(SHAFT_HALF * 2, 0.02, SHAFT_HALF * 2),
        WALL_STONE
    );
    backWall.position.y = -SHAFT_DEPTH - 0.01;
    room.add(backWall);

    // Side walls lining the opening, from the back wall up to the face plane
    const wallLength = SHAFT_HALF * 2;
    const wallSpecs = [
        { x: 0, z: SHAFT_HALF - WALL_THICKNESS / 2, w: wallLength, d: WALL_THICKNESS },
        { x: 0, z: -SHAFT_HALF + WALL_THICKNESS / 2, w: wallLength, d: WALL_THICKNESS },
        { x: SHAFT_HALF - WALL_THICKNESS / 2, z: 0, w: WALL_THICKNESS, d: wallLength },
        { x: -SHAFT_HALF + WALL_THICKNESS / 2, z: 0, w: WALL_THICKNESS, d: wallLength },
    ];
    for (const spec of wallSpecs) {
        const wall = new THREE.Mesh(new THREE.BoxGeometry(spec.w, SHAFT_DEPTH, spec.d), WALL_STONE);
        wall.position.set(spec.x, -SHAFT_DEPTH / 2, spec.z);
        room.add(wall);
    }

    // --- Three staircases, one per gravity field ---

    // Stair C: the top-down world. Down is -y (into the cube); the stair lies
    // on the back wall, crossing the room diagonally — the viewer sees it from
    // directly above, like the print's lowest flights.
    const stairC = buildStair();
    stairC.position.set(-0.24, -0.418, 0.12);
    stairC.rotation.y = Math.PI / 5; // climb heads diagonally across the room
    room.add(stairC);

    // Stair A: sideways world #1. Down is -z; the stair climbs left-to-right
    // with its treads facing the viewer's lateral +z — seen edge-on.
    const stairA = buildStair();
    orient(stairA, new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1));
    stairA.position.set(-0.25, -0.16, -0.28);
    room.add(stairA);

    // Stair B: sideways world #2, perpendicular to both others. Down is +x;
    // the stair climbs across the other lateral axis.
    const stairB = buildStair();
    orient(stairB, new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0));
    stairB.position.set(0.3, -0.28, -0.25);
    room.add(stairB);

    // Filler plinths joining each sideways stair's foot to its own floor-wall
    const plinthA = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, STAIR_WIDTH), UNDER_STONE);
    orient(plinthA, new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1));
    plinthA.position.set(-0.21, -0.16, -0.305);
    room.add(plinthA);
    const plinthB = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, STAIR_WIDTH), UNDER_STONE);
    orient(plinthB, new THREE.Vector3(0, 0, 1), new THREE.Vector3(-1, 0, 0));
    plinthB.position.set(0.305, -0.28, -0.21);
    room.add(plinthB);

    // --- Arched doorways in two different gravities ---
    const archBack = buildArch();
    archBack.position.set(-0.1, -0.418, 0.3);
    room.add(archBack);
    const archSide = buildArch();
    orient(archSide, new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1));
    archSide.position.set(0.12, -0.34, -0.315);
    room.add(archSide);

    // --- Drawn doorway decals set into the walls, one per gravity, so every
    // wall claims a different "up" the way the print's openings do ---
    // On the +x wall, upright along the viewer's axis, seen sideways
    const doorway1 = createDoorwayDecal();
    orient(doorway1, new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0));
    doorway1.position.set(0.328, -0.26, -0.05);
    room.add(doorway1);
    // On the -x wall, its head pointing down into the cube
    const doorway2 = createDoorwayDecal();
    orient(doorway2, new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, -1, 0));
    doorway2.position.set(-0.328, -0.24, 0.1);
    room.add(doorway2);
    // On the -z wall beneath stair A's flight, upright for the sideways world
    const doorway3 = createDoorwayDecal();
    orient(doorway3, new THREE.Vector3(0, -1, 0), new THREE.Vector3(1, 0, 0));
    doorway3.position.set(0.08, -0.31, -0.328);
    room.add(doorway3);

    // --- The walking figures, one gravity each ---
    // Each walker lives in its stair's local frame: a carrier group translates
    // along the flight, and the figure inside flips for underside walking and
    // turns to face the direction of travel.
    const walkers = [
        { stair: stairC, tone: 0x55524c, offset: 0, underside: false, phase: 0 },
        { stair: stairA, tone: 0x8a867e, offset: -0.012, underside: false, phase: 0.35 },
        { stair: stairA, tone: 0x3f3d39, offset: 0.012, underside: true, phase: 0.7 }, // the print's inverted companion
        { stair: stairB, tone: 0xa9a59c, offset: 0, underside: false, phase: 0.5 },
    ];

    for (const walker of walkers) {
        const built = buildWalker(walker.tone);
        walker.figure = built.group;
        walker.hips = built.hips;
        walker.carrier = new THREE.Group();
        walker.carrier.add(built.group);
        if (walker.underside) built.group.rotation.x = Math.PI; // feet to the stringer's underside
        walker.stair.add(walker.carrier);
    }

    function update() {
        const t = performance.now();
        for (const walker of walkers) {
            const cycle = ((t / WALK_TRAVERSE_MS) + walker.phase) % 2;
            const p = cycle < 1 ? cycle : 2 - cycle; // ping-pong traverse
            const ascending = cycle < 1;

            const x = p * STAIR_RUN;
            const y = walker.underside
                ? SLOPE * x - 0.028 // hanging beneath the stringer
                : p * STAIR_RISE + 0.004;
            walker.carrier.position.set(x, y, walker.offset);
            walker.figure.rotation.y = ascending ? 0 : Math.PI;

            // Stride: legs swing in opposition, with a slight bob
            const stride = Math.sin(p * STRIDES_PER_TRAVERSE * Math.PI * 2);
            walker.hips[0].rotation.z = 0.55 * stride;
            walker.hips[1].rotation.z = -0.55 * stride;
            walker.figure.position.y = 0.002 * Math.abs(stride);
        }
    }

    // Neutral light in the room's heart plus a cool wash from the opening,
    // keeping the print's even, shadow-soft grays
    const roomLight = new THREE.PointLight(0xffffff, 0.55, 1.0);
    roomLight.position.set(0, -0.14, 0);
    room.add(roomLight);
    const skylight = new THREE.PointLight(0xdde4f0, 0.25, 0.8);
    skylight.position.set(0, -0.02, 0);
    room.add(skylight);

    update();
    return { group, update };
}
