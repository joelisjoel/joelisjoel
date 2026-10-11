// Face 3 (+y): a skeleton clock built as a real going train. Five coaxial
// wheel-and-pinion arbors chain exactly the way a mechanical clock's do:
// barrel (great wheel) -> center arbor (which carries the hands, at the dial
// center) -> third wheel -> fourth wheel -> escape wheel, each mesh a big
// wheel driving the next arbor's small pinion. An anchor escapement rocks
// over the escape wheel and the whole train advances in discrete beats, one
// escape tooth per tick, with every other wheel geared down through the
// exact tooth ratios — so only the escapement end visibly hurries, just as
// in a real movement. Meshing is kinematically exact: one shared module,
// centers at the sum of pitch radii, and initial phases solved so teeth
// seat in gaps along each line of centers.
import * as THREE from 'three';

const BOARD_SIZE = 1024;
const CENTER = BOARD_SIZE / 2;
const DIAL_RADIUS = BOARD_SIZE * 0.32;
const BEZEL_WIDTH = 24;
const BEZEL_TEETH = 26;

const BRASS = '#a9762f';
const BRASS_SHADOW = '#5e3d16';
const BRASS_HIGHLIGHT = '#d8a94f';
const COPPER = '#8c5a3c';
const CAVITY = '#16110c';
const CAVITY_EDGE = '#241a12';

const SURFACE_EPSILON = 0.01;

function gearRingPoints(cx, cy, outerR, innerR, teeth) {
    const points = [];
    const toothAngle = (Math.PI * 2) / teeth;
    for (let i = 0; i < teeth; i++) {
        const a0 = i * toothAngle;
        const a1 = a0 + toothAngle * 0.3;
        const a2 = a0 + toothAngle * 0.5;
        const a3 = a0 + toothAngle * 0.8;
        points.push(
            [cx + Math.cos(a0) * innerR, cy + Math.sin(a0) * innerR],
            [cx + Math.cos(a1) * outerR, cy + Math.sin(a1) * outerR],
            [cx + Math.cos(a2) * outerR, cy + Math.sin(a2) * outerR],
            [cx + Math.cos(a3) * innerR, cy + Math.sin(a3) * innerR],
        );
    }
    return points;
}

function drawGearRing(ctx, cx, cy, outerR, innerR, teeth, fillStyle) {
    const points = gearRingPoints(cx, cy, outerR, innerR, teeth);
    ctx.beginPath();
    points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = fillStyle;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = BRASS_SHADOW;
    ctx.stroke();
}

function drawRivets(ctx, cx, cy, radius, count, size) {
    for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const x = cx + Math.cos(angle) * radius;
        const y = cy + Math.sin(angle) * radius;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fillStyle = BRASS_SHADOW;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x - size * 0.25, y - size * 0.25, size * 0.45, 0, Math.PI * 2);
        ctx.fillStyle = BRASS_HIGHLIGHT;
        ctx.fill();
    }
}

function drawBackground(ctx) {
    ctx.fillStyle = COPPER;
    ctx.fillRect(0, 0, BOARD_SIZE, BOARD_SIZE);
    ctx.fillStyle = BRASS;
    ctx.fillRect(24, 24, BOARD_SIZE - 48, BOARD_SIZE - 48);

    drawRivets(ctx, CENTER, CENTER, BOARD_SIZE / 2 - 44, 32, 6);
}

// Clock convention uses IIII rather than IV, balancing VIII across the dial
const ROMAN_NUMERALS = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];

// The opening punched through the face; the chapter ring now lives on a
// pierced 3D ring floating in the well's mouth
const OPENING_RADIUS = 0.322; // face units
const OPENING_RADIUS_PX = OPENING_RADIUS * BOARD_SIZE;

// The bezel ring around the opening; the movement cavity is now a REAL
// circular hole cut through the face (alphaTest), with the works sunk in a
// recessed well behind it
function drawBezelAndOpening(ctx) {
    drawGearRing(ctx, CENTER, CENTER, DIAL_RADIUS + BEZEL_WIDTH + 16, DIAL_RADIUS + BEZEL_WIDTH - 10, BEZEL_TEETH, BRASS);
    drawRivets(ctx, CENTER, CENTER, DIAL_RADIUS + BEZEL_WIDTH - 4, BEZEL_TEETH, 5);

    // A thin shadowed lip between the bezel and the cut edge
    ctx.beginPath();
    ctx.arc(CENTER, CENTER, DIAL_RADIUS + BEZEL_WIDTH - 10, 0, Math.PI * 2);
    ctx.fillStyle = CAVITY_EDGE;
    ctx.fill();

    // The opening itself: fully transparent -> discarded by alphaTest -> a
    // real hole in the face through which the sunken movement is visible
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(CENTER, CENTER, OPENING_RADIUS_PX, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

export function createFace3Material() {
    const canvas = document.createElement('canvas');
    canvas.width = BOARD_SIZE;
    canvas.height = BOARD_SIZE;
    const ctx = canvas.getContext('2d');

    drawBackground(ctx);
    drawBezelAndOpening(ctx);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.needsUpdate = true;

    return new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.45,
        metalness: 0.4,
        alphaTest: 0.5,
    });
}

// The pierced chapter ring: numerals, bands, and the minute track drawn on a
// transparent canvas so the works stay visible between the markings, the way
// a skeleton clock's fretted ring exposes its movement. Mapped onto a flat
// plane whose transparent regions are discarded by alphaTest.
function createChapterRing() {
    const SIZE = 512;
    const HALF = SIZE / 2;
    const PLANE_SPAN = 0.66; // world units covered by the texture square
    const scale = SIZE / PLANE_SPAN; // px per world unit

    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');

    const rimOuter = 0.316 * scale;
    const rimInner = 0.242 * scale;
    const tickOuter = 0.31 * scale;

    // Outer and inner bands
    ctx.strokeStyle = BRASS;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(HALF, HALF, rimOuter, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(HALF, HALF, rimInner, 0, Math.PI * 2);
    ctx.stroke();

    // Minute track: 60 ticks, heavier at the hours
    for (let i = 0; i < 60; i++) {
        const angle = (i / 60) * Math.PI * 2;
        const isHour = i % 5 === 0;
        const rInner = (isHour ? 0.285 : 0.297) * scale;
        ctx.lineWidth = isHour ? 6 : 3;
        ctx.strokeStyle = isHour ? BRASS_HIGHLIGHT : BRASS;
        ctx.beginPath();
        ctx.moveTo(HALF + Math.sin(angle) * tickOuter, HALF - Math.cos(angle) * tickOuter);
        ctx.lineTo(HALF + Math.sin(angle) * rInner, HALF - Math.cos(angle) * rInner);
        ctx.stroke();
    }

    // Roman numerals, radially oriented
    ctx.fillStyle = BRASS_HIGHLIGHT;
    ctx.font = `bold ${Math.round(0.048 * scale)}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const numeralRadius = 0.262 * scale;
    for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2;
        const x = HALF + Math.sin(angle) * numeralRadius;
        const y = HALF - Math.cos(angle) * numeralRadius;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.fillText(ROMAN_NUMERALS[i], 0, 0);
        ctx.restore();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.needsUpdate = true;

    const material = new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.4,
        metalness: 0.5,
        alphaTest: 0.4,
        side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(PLANE_SPAN, PLANE_SPAN), material);
    ring.rotation.x = -Math.PI / 2; // lie flat, facing out of the +y face
    return ring;
}

// --- 3D brass movement ---

const GEAR_MATERIAL = new THREE.MeshStandardMaterial({ color: 0x9c6b30, roughness: 0.35, metalness: 0.75 });
const STEEL_MATERIAL = new THREE.MeshStandardMaterial({ color: 0x8a8d94, roughness: 0.3, metalness: 0.85 });

// One shared module across every mesh — the physical precondition for gearing:
// it makes every gear's teeth the same size as the gaps in its neighbors'.
const MODULE = 0.005;
const ADDENDUM = MODULE * 0.85;
const DEDENDUM = MODULE * 1.15;

function pitchRadiusOf(teeth) {
    return (MODULE * teeth) / 2;
}

function createGearShape(teeth, outerRadius, innerRadius, boreRadius, spoked) {
    const shape = new THREE.Shape();
    const toothAngle = (Math.PI * 2) / teeth;

    for (let i = 0; i < teeth; i++) {
        const a0 = i * toothAngle;
        const a1 = a0 + toothAngle * 0.3;
        const a2 = a0 + toothAngle * 0.5;
        const a3 = a0 + toothAngle * 0.8;
        const p0 = [Math.cos(a0) * innerRadius, Math.sin(a0) * innerRadius];
        const p1 = [Math.cos(a1) * outerRadius, Math.sin(a1) * outerRadius];
        const p2 = [Math.cos(a2) * outerRadius, Math.sin(a2) * outerRadius];
        const p3 = [Math.cos(a3) * innerRadius, Math.sin(a3) * innerRadius];

        if (i === 0) shape.moveTo(p0[0], p0[1]);
        else shape.lineTo(p0[0], p0[1]);
        shape.lineTo(p1[0], p1[1]);
        shape.lineTo(p2[0], p2[1]);
        shape.lineTo(p3[0], p3[1]);
    }
    shape.closePath();

    if (spoked) {
        // Wheel crossings: annular-sector windows leaving a hub, a rim, and
        // four spokes, as a clockmaker would cross out a large wheel
        const hubR = innerRadius * 0.3;
        const rimR = innerRadius * 0.8;
        const spokes = 4;
        const spokeHalfAngle = 0.14;
        for (let s = 0; s < spokes; s++) {
            const start = (s / spokes) * Math.PI * 2 + spokeHalfAngle;
            const end = ((s + 1) / spokes) * Math.PI * 2 - spokeHalfAngle;
            const window_ = new THREE.Path();
            window_.absarc(0, 0, hubR, start, end, false);
            window_.absarc(0, 0, rimR, end, start, true);
            window_.closePath();
            shape.holes.push(window_);
        }
    }
    if (boreRadius > 0) {
        const bore = new THREE.Path();
        bore.absellipse(0, 0, boreRadius, boreRadius, 0, Math.PI * 2, true);
        shape.holes.push(bore);
    }
    return shape;
}

// Escape wheel: pointed saw teeth leaning away from the direction of drive,
// the classic recoil-escapement profile
function createEscapeWheelShape(teeth, tipRadius, rootRadius, boreRadius) {
    const shape = new THREE.Shape();
    const pitch = (Math.PI * 2) / teeth;
    for (let i = 0; i < teeth; i++) {
        const aTip = i * pitch;
        const aBack = aTip + pitch * 0.3;
        const aNext = aTip + pitch;
        const tip = [Math.cos(aTip) * tipRadius, Math.sin(aTip) * tipRadius];
        const back = [Math.cos(aBack) * rootRadius, Math.sin(aBack) * rootRadius];
        const root = [Math.cos(aNext) * rootRadius, Math.sin(aNext) * rootRadius];
        if (i === 0) shape.moveTo(tip[0], tip[1]);
        else shape.lineTo(tip[0], tip[1]);
        shape.lineTo(back[0], back[1]);
        shape.lineTo(root[0], root[1]);
    }
    shape.closePath();
    if (boreRadius > 0) {
        const bore = new THREE.Path();
        bore.absellipse(0, 0, boreRadius, boreRadius, 0, Math.PI * 2, true);
        shape.holes.push(bore);
    }
    return shape;
}

function extrudeFlat(shape, depth) {
    return new THREE.ExtrudeGeometry(shape, {
        depth,
        bevelEnabled: true,
        bevelSize: depth * 0.12,
        bevelThickness: depth * 0.12,
        bevelSegments: 1,
    });
}

// Two meshing planes between the movement's front and back, like the space
// between a real movement's plates: wheels alternate levels so each big wheel
// reaches the next arbor's pinion at its own height
const LEVEL_LOW = 0.012;
const LEVEL_HIGH = 0.04;
const WHEEL_DEPTH = 0.013;
const PINION_DEPTH = 0.026;
const ARBOR_TOP = 0.065;

// The going train. Order matters: each entry's mesh parent must precede it.
// `meshTeeth` names the gear on the PARENT that this arbor's `pinion` engages;
// the center arbor sits at the dial center (its arbor carries the hands), and
// the barrel is solved backward through the same mesh constraint.
const ESCAPE_TEETH = 15;
const TRAIN = [
    { id: 'center', wheel: 40, wheelLevel: LEVEL_HIGH, pinion: 12, pinionLevel: LEVEL_LOW },
    { id: 'barrel', parent: 'center', meshTeeth: 12, angleDeg: 170, wheel: 48, wheelLevel: LEVEL_LOW, drum: true },
    { id: 'third', parent: 'center', meshTeeth: 40, angleDeg: -35, wheel: 36, wheelLevel: LEVEL_LOW, pinion: 10, pinionLevel: LEVEL_HIGH },
    { id: 'fourth', parent: 'third', meshTeeth: 36, angleDeg: 10, wheel: 30, wheelLevel: LEVEL_HIGH, pinion: 9, pinionLevel: LEVEL_LOW },
    { id: 'escape', parent: 'fourth', meshTeeth: 30, angleDeg: 75, pinion: 8, pinionLevel: LEVEL_HIGH, escapeWheel: true },
];

const ESCAPE_TIP_RADIUS = 0.065;
const ESCAPE_ROOT_RADIUS = 0.05;

// One beat: the anchor rocks once and the escape wheel jumps one tooth
const BEAT_MS = 500;
const ESCAPE_PITCH = (Math.PI * 2) / ESCAPE_TEETH;
const ANCHOR_ROCK_AMPLITUDE = 0.1;

function wrapToToothPitch(angle, teeth) {
    const pitch = (Math.PI * 2) / teeth;
    return ((angle % pitch) + pitch * 1.5) % pitch - pitch / 2;
}

function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
}

// The escape wheel's angle advances one tooth pitch per beat: a dwell while
// the pallet locks, then a quick drop near the end of the beat
function escapeSteps(timeMs) {
    const n = Math.floor(timeMs / BEAT_MS);
    const f = (timeMs % BEAT_MS) / BEAT_MS;
    const drop = f < 0.7 ? 0 : easeOutCubic((f - 0.7) / 0.3);
    return n + drop;
}

// Builds a hand pointing toward local -Z at rest (the "12 o'clock" direction),
// with a scrollwork ring near the tip and a tail past the pivot.
function buildHand({ length, tailLength, width, thickness, color }) {
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.7 });

    const shaft = new THREE.Mesh(new THREE.BoxGeometry(width, thickness, length + tailLength), material);
    shaft.position.z = (tailLength - length) / 2;
    group.add(shaft);

    const ring = new THREE.Mesh(new THREE.TorusGeometry(width * 1.6, width * 0.4, 8, 16), material);
    ring.position.set(0, 0, -length * 0.62);
    group.add(ring);

    const tip = new THREE.Mesh(new THREE.OctahedronGeometry(width * 1.5, 0), material);
    tip.position.set(0, 0, -length);
    tip.scale.set(1, 0.6, 1.8);
    group.add(tip);

    return group;
}

const SINK_DEPTH = 0.07; // how far the movement drops below the face plane

export function createFace3Clock() {
    const group = new THREE.Group();
    group.position.set(0, 0.5 + SURFACE_EPSILON, 0);

    // The recessed well behind the face opening: a dark cylindrical wall and
    // floor the sunken movement lives in
    const wellMaterial = new THREE.MeshStandardMaterial({ color: 0x1d150d, roughness: 0.8, metalness: 0.3, side: THREE.BackSide });
    const wellWall = new THREE.Mesh(new THREE.CylinderGeometry(0.324, 0.324, 0.13, 48, 1, true), wellMaterial);
    wellWall.position.y = -0.065;
    group.add(wellWall);
    const wellFloor = new THREE.Mesh(
        new THREE.CircleGeometry(0.324, 48),
        new THREE.MeshStandardMaterial({ color: 0x241a12, roughness: 0.85, metalness: 0.25 })
    );
    wellFloor.rotation.x = -Math.PI / 2;
    wellFloor.position.y = -0.13;
    group.add(wellFloor);

    // The pierced chapter ring floats in the well's mouth, just under the cut
    const chapterRing = createChapterRing();
    chapterRing.position.y = -0.002;
    group.add(chapterRing);

    // A soft warm lamp down in the well so the sunken brass keeps its glow
    const wellLamp = new THREE.PointLight(0xffdca0, 1.4, 0.7);
    wellLamp.position.set(0.08, -0.01, -0.08);
    group.add(wellLamp);

    // Everything mechanical hangs from this sunken carrier
    const movement = new THREE.Group();
    movement.position.y = -SINK_DEPTH;
    group.add(movement);

    // --- Solve the train: positions, speed ratios, and mesh phases ---
    const byId = new Map();
    for (const spec of TRAIN) {
        if (!spec.parent) {
            spec.position = { x: 0, z: 0 };
            spec.ratio = 1; // provisional; normalized to the escape arbor below
            spec.phase = 0;
        } else {
            const parent = byId.get(spec.parent);
            const theta = (spec.angleDeg * Math.PI) / 180;
            const ownMeshGear = spec.pinion ?? spec.wheel;
            const distance = pitchRadiusOf(spec.meshTeeth) + pitchRadiusOf(ownMeshGear);
            spec.position = {
                x: parent.position.x + Math.cos(theta) * distance,
                z: parent.position.z + Math.sin(theta) * distance,
            };
            spec.ratio = -parent.ratio * (spec.meshTeeth / ownMeshGear);

            // Exact mesh phase. delta: how far the parent's nearest tooth center
            // sits off the line of centers (in the parent's initial pose). The
            // child seats a gap on that line, corrected by delta scaled through
            // the gear ratio (arc length is conserved across the contact point,
            // and external gears counter-rotate).
            const delta = wrapToToothPitch(theta - parent.phase, spec.meshTeeth);
            spec.phase = (theta + Math.PI) - Math.PI / ownMeshGear - delta * (spec.meshTeeth / ownMeshGear);
        }
        byId.set(spec.id, spec);
    }
    // Normalize ratios so the escape arbor advances 1:1 with the beat function
    const escapeRatio = byId.get('escape').ratio;
    for (const spec of TRAIN) spec.ratio /= escapeRatio;

    // --- Build the arbors ---
    const arbors = [];
    for (const spec of TRAIN) {
        const pivot = new THREE.Group();
        pivot.rotation.x = -Math.PI / 2; // fixed, one-time: local +Z -> world +Y
        pivot.position.set(spec.position.x, 0, spec.position.z);

        const spinner = new THREE.Group();
        pivot.add(spinner);

        if (spec.wheel) {
            const pitch = pitchRadiusOf(spec.wheel);
            const shape = createGearShape(
                spec.wheel,
                pitch + ADDENDUM,
                pitch - DEDENDUM,
                0.006,
                spec.wheel >= 30
            );
            const wheelMesh = new THREE.Mesh(extrudeFlat(shape, WHEEL_DEPTH), GEAR_MATERIAL);
            wheelMesh.position.z = spec.wheelLevel - WHEEL_DEPTH / 2;
            spinner.add(wheelMesh);
        }
        if (spec.pinion) {
            const pitch = pitchRadiusOf(spec.pinion);
            const shape = createGearShape(spec.pinion, pitch + ADDENDUM, pitch - DEDENDUM, 0.004, false);
            const pinionMesh = new THREE.Mesh(extrudeFlat(shape, PINION_DEPTH), STEEL_MATERIAL);
            pinionMesh.position.z = spec.pinionLevel - PINION_DEPTH / 2;
            spinner.add(pinionMesh);
        }
        if (spec.escapeWheel) {
            const shape = createEscapeWheelShape(ESCAPE_TEETH, ESCAPE_TIP_RADIUS, ESCAPE_ROOT_RADIUS, 0.005);
            const escMesh = new THREE.Mesh(extrudeFlat(shape, WHEEL_DEPTH * 0.7), STEEL_MATERIAL);
            escMesh.position.z = LEVEL_LOW - (WHEEL_DEPTH * 0.7) / 2;
            spinner.add(escMesh);
        }
        if (spec.drum) {
            // The mainspring barrel under its great wheel, with a click ratchet
            const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 24), GEAR_MATERIAL);
            drum.rotation.x = Math.PI / 2;
            drum.position.z = spec.wheelLevel + 0.02;
            spinner.add(drum);
            const ratchet = new THREE.Mesh(
                extrudeFlat(createEscapeWheelShape(12, 0.03, 0.023, 0.005), 0.006),
                STEEL_MATERIAL
            );
            ratchet.position.z = spec.wheelLevel + 0.032;
            spinner.add(ratchet);
        }

        // Arbor rod and collet
        const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, ARBOR_TOP, 10), STEEL_MATERIAL);
        rod.rotation.x = Math.PI / 2;
        rod.position.z = ARBOR_TOP / 2;
        pivot.add(rod);
        const collet = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.009, 0.008, 12), GEAR_MATERIAL);
        collet.rotation.x = Math.PI / 2;
        collet.position.z = ARBOR_TOP - 0.006;
        pivot.add(collet);

        movement.add(pivot);
        arbors.push({ spinner, ratio: spec.ratio, phase: spec.phase });
    }

    // --- Anchor escapement, rocking over the escape wheel ---
    const escapeSpec = byId.get('escape');
    const anchorDir = { x: -0.29, z: 0.957 };
    const anchorDistance = 0.105;
    const anchorPos = {
        x: escapeSpec.position.x + anchorDir.x * anchorDistance,
        z: escapeSpec.position.z + anchorDir.z * anchorDistance,
    };

    const anchorPivot = new THREE.Group();
    anchorPivot.rotation.x = -Math.PI / 2;
    anchorPivot.position.set(anchorPos.x, 0, anchorPos.z);
    movement.add(anchorPivot);

    const anchorRocker = new THREE.Group();
    anchorRocker.position.z = LEVEL_LOW + 0.016; // hovers just above the escape wheel plane
    anchorPivot.add(anchorRocker);

    // In the pivot's local frame (x -> world x, y -> world -z) the escape
    // wheel center sits at:
    const escLocal = {
        x: escapeSpec.position.x - anchorPos.x,
        y: -(escapeSpec.position.z - anchorPos.z),
    };
    const towardEscape = Math.atan2(escLocal.y, escLocal.x);
    // Pallet arc radius: from the anchor arbor to the escape wheel's rim at
    // roughly 40 degrees off the line of centers
    const dCenters = Math.hypot(escLocal.x, escLocal.y);
    const palletArcRadius = Math.sqrt(
        dCenters * dCenters + ESCAPE_TIP_RADIUS * ESCAPE_TIP_RADIUS
        - 2 * dCenters * ESCAPE_TIP_RADIUS * Math.cos((40 * Math.PI) / 180)
    );
    const arcSpan = (76 * Math.PI) / 180;
    const arms = new THREE.Mesh(
        new THREE.TorusGeometry(palletArcRadius, 0.006, 8, 28, arcSpan),
        STEEL_MATERIAL
    );
    arms.rotation.z = towardEscape - arcSpan / 2;
    anchorRocker.add(arms);

    // Pallet tips at the arc's ends, dipping toward the wheel teeth
    for (const side of [-1, 1]) {
        const a = towardEscape + (side * arcSpan) / 2;
        const pallet = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.018, 0.012), STEEL_MATERIAL);
        pallet.position.set(Math.cos(a) * (palletArcRadius - 0.006), Math.sin(a) * (palletArcRadius - 0.006), 0);
        pallet.rotation.z = a;
        anchorRocker.add(pallet);
    }

    // Stem from the arbor out to the arc, and a short crutch with a bob
    // swinging opposite the wheel
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.007, palletArcRadius, 0.007), STEEL_MATERIAL);
    stem.position.set(
        Math.cos(towardEscape) * palletArcRadius * 0.5,
        Math.sin(towardEscape) * palletArcRadius * 0.5,
        0
    );
    stem.rotation.z = towardEscape - Math.PI / 2;
    anchorRocker.add(stem);

    const crutchLength = 0.058;
    const away = towardEscape + Math.PI;
    const crutch = new THREE.Mesh(new THREE.BoxGeometry(0.005, crutchLength, 0.005), STEEL_MATERIAL);
    crutch.position.set(Math.cos(away) * crutchLength * 0.5, Math.sin(away) * crutchLength * 0.5, 0);
    crutch.rotation.z = away - Math.PI / 2;
    anchorRocker.add(crutch);
    const bob = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 10), GEAR_MATERIAL);
    bob.position.set(Math.cos(away) * crutchLength, Math.sin(away) * crutchLength, 0);
    anchorRocker.add(bob);

    // Anchor arbor rod
    const anchorRod = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.05, 10), STEEL_MATERIAL);
    anchorRod.rotation.x = Math.PI / 2;
    anchorRod.position.z = 0.025;
    anchorPivot.add(anchorRod);

    // --- Movement pillars, as between a real movement's plates. Azimuths
    // picked to clear the wheels and the anchor ---
    for (const angleDeg of [90, 135, 240, 290]) {
        const a = (angleDeg * Math.PI) / 180;
        const pillar = new THREE.Group();
        pillar.position.set(Math.cos(a) * 0.275, 0, Math.sin(a) * 0.275);
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.062, 12), GEAR_MATERIAL);
        shaft.position.y = 0.031;
        pillar.add(shaft);
        const knop = new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 8), GEAR_MATERIAL);
        knop.position.y = 0.033;
        knop.scale.y = 0.5;
        pillar.add(knop);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.01, 0.01, 12), GEAR_MATERIAL);
        cap.position.y = 0.066;
        pillar.add(cap);
        movement.add(pillar);
    }

    // --- Hands on the center arbor, reading real time ---
    const handsGroup = new THREE.Group();
    handsGroup.position.y = 0.08;
    movement.add(handsGroup);

    const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.075, 14), GEAR_MATERIAL);
    cannon.position.y = -0.038;
    handsGroup.add(cannon);

    const hourHand = buildHand({ length: 0.2, tailLength: 0.035, width: 0.015, thickness: 0.011, color: 0x9c6b30 });
    const minuteHand = buildHand({ length: 0.28, tailLength: 0.045, width: 0.011, thickness: 0.009, color: 0xd8a94f });
    const secondHand = buildHand({ length: 0.3, tailLength: 0.075, width: 0.0045, thickness: 0.0055, color: 0x7a2e1d });
    minuteHand.position.y = 0.008;
    secondHand.position.y = 0.016;
    handsGroup.add(hourHand, minuteHand, secondHand);

    const pivotCap = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.012, 16), GEAR_MATERIAL);
    pivotCap.position.y = 0.024;
    handsGroup.add(pivotCap);

    function update(date) {
        const secondsFraction = (date.getSeconds() + date.getMilliseconds() / 1000) / 60;
        const minutesFraction = (date.getMinutes() + secondsFraction) / 60;
        const hoursFraction = ((date.getHours() % 12) + minutesFraction) / 12;

        hourHand.rotation.y = -hoursFraction * Math.PI * 2;
        minuteHand.rotation.y = -minutesFraction * Math.PI * 2;
        secondHand.rotation.y = -secondsFraction * Math.PI * 2;

        // The escapement gates the whole train: the escape arbor advances one
        // tooth per beat, and every wheel follows at its exact gear ratio
        const now = performance.now();
        const escapeAngle = ESCAPE_PITCH * escapeSteps(now);
        for (const { spinner, ratio, phase } of arbors) {
            spinner.rotation.z = phase + ratio * escapeAngle;
        }

        anchorRocker.rotation.z = ANCHOR_ROCK_AMPLITUDE * Math.cos((Math.PI * now) / BEAT_MS);
    }

    update(new Date());
    return { group, update };
}
