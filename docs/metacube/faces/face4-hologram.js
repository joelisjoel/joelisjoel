// Face 4 (-y): a workshop scene standing ON the face — the face's deck-plate
// texture is the floor, and the cast's feet rest on it (like the chess pieces on
// +x). A cylindrical astromech-style droid projects a translucent hologram of a
// robed figure — rendered as an ANIMATED 2D CANVAS TEXTURE on a projection plane,
// redrawn every frame with a gesture loop, drifting scanlines, glitch bands, and
// flicker — while a human figure stands nearby, watching.
// An homage to the famous recorded-plea hologram scene, drawn procedurally.
import * as THREE from 'three';

const BOARD_SIZE = 1024;
const SURFACE_EPSILON = 0.01;

const WALL_DARK = '#241f1a';
const WALL_PANEL = '#2e2822';
const PANEL_LINE = '#171310';

// Derive a tangent-space normal map from a grayscale height canvas via
// central differences — every groove, slat, and rivet painted into the
// height pass catches light as real relief.
function normalMapFromHeight(heightCanvas, strength) {
    const w = heightCanvas.width;
    const h = heightCanvas.height;
    const src = heightCanvas.getContext('2d').getImageData(0, 0, w, h).data;
    const heightAt = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;

    const data = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const dx = (heightAt(x - 1, y) - heightAt(x + 1, y)) * strength;
            const dy = (heightAt(x, y + 1) - heightAt(x, y - 1)) * strength;
            const invLen = 1 / Math.sqrt(dx * dx + dy * dy + 1);
            const i = (y * w + x) * 4;
            data[i] = (dx * invLen * 0.5 + 0.5) * 255;
            data[i + 1] = (dy * invLen * 0.5 + 0.5) * 255;
            data[i + 2] = (invLen * 0.5 + 0.5) * 255;
            data[i + 3] = 255;
        }
    }

    const texture = new THREE.DataTexture(data, w, h);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.needsUpdate = true;
    return texture;
}

// --- Workshop floor texture ---

export function createFace4Material() {
    const canvas = document.createElement('canvas');
    canvas.width = BOARD_SIZE;
    canvas.height = BOARD_SIZE;
    const ctx = canvas.getContext('2d');

    // Height pass painted in parallel: plates raised, gaps and panel lines
    // recessed, so the deck reads as real riveted plate under the lights
    const heightCanvas = document.createElement('canvas');
    heightCanvas.width = BOARD_SIZE;
    heightCanvas.height = BOARD_SIZE;
    const hctx = heightCanvas.getContext('2d');

    ctx.fillStyle = WALL_DARK;
    ctx.fillRect(0, 0, BOARD_SIZE, BOARD_SIZE);
    hctx.fillStyle = '#3c3c3c';
    hctx.fillRect(0, 0, BOARD_SIZE, BOARD_SIZE);

    const plate = BOARD_SIZE / 4;
    for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
            const offset = (row % 2) * plate * 0.5;
            ctx.fillStyle = (row + col) % 2 === 0 ? WALL_PANEL : WALL_DARK;
            ctx.fillRect(col * plate + offset - plate, row * plate, plate - 6, plate - 6);
            hctx.fillStyle = '#8c8c8c';
            hctx.fillRect(col * plate + offset - plate, row * plate, plate - 6, plate - 6);
        }
    }

    ctx.strokeStyle = PANEL_LINE;
    ctx.lineWidth = 4;
    hctx.strokeStyle = '#282828';
    hctx.lineWidth = 4;
    for (let i = 0; i <= 4; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * plate);
        ctx.lineTo(BOARD_SIZE, i * plate);
        ctx.stroke();
        hctx.beginPath();
        hctx.moveTo(0, i * plate);
        hctx.lineTo(BOARD_SIZE, i * plate);
        hctx.stroke();
    }

    // Deck rivets along the plate seams: bright bumps in the height pass
    for (let i = 0; i <= 4; i++) {
        for (let x = plate / 8; x < BOARD_SIZE; x += plate / 4) {
            for (const dy of [-14, 14]) {
                const y = i * plate + dy;
                if (y < 0 || y > BOARD_SIZE) continue;
                ctx.fillStyle = 'rgba(58, 52, 44, 0.9)';
                ctx.beginPath();
                ctx.arc(x, y, 5, 0, Math.PI * 2);
                ctx.fill();
                hctx.fillStyle = '#d0d0d0';
                hctx.beginPath();
                hctx.arc(x, y, 5, 0, Math.PI * 2);
                hctx.fill();
            }
        }
    }

    for (const [sx, sy, sr] of [[260, 700, 90], [740, 320, 60], [620, 810, 45]]) {
        const gradient = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
        gradient.addColorStop(0, 'rgba(10, 8, 6, 0.55)');
        gradient.addColorStop(1, 'rgba(10, 8, 6, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(sx, sy, sr, 0, Math.PI * 2);
        ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.needsUpdate = true;

    return new THREE.MeshStandardMaterial({
        map: texture,
        normalMap: normalMapFromHeight(heightCanvas, 2.5),
        normalScale: new THREE.Vector2(1.2, 1.2),
        roughness: 0.7,
        metalness: 0.35,
    });
}

// --- The animated 2D hologram texture ---

// Drawing happens in a fixed 256x384 coordinate space; RES scales the backing
// canvas (and a matching context transform) up from that, so doubling the
// texture resolution doesn't touch any of the artwork's coordinates.
const HOLO_RES = 2;
const HOLO_W = 256;
const HOLO_H = 384;
const CX = HOLO_W / 2;

// Draws one frame of the robed figure. `raise` in [0,1] is the plea gesture:
// 0 = hands clasped low, 1 = both arms extended outward in appeal. `bow` in
// [0,1] dips the head and shoulders; `burst` forces the glitch band, used
// while the figure materializes and dissolves.
function drawHoloFrame(ctx, t, raise, bow = 0, burst = false) {
    ctx.setTransform(HOLO_RES, 0, 0, HOLO_RES, 0, 0);
    ctx.clearRect(0, 0, HOLO_W, HOLO_H);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(140, 220, 255, 0.9)';
    ctx.shadowBlur = 14;

    const sway = Math.sin(t * 1.1) * 2;
    const bowDrop = bow * 16;

    // Hood, draped behind the head and shoulders
    ctx.fillStyle = 'rgba(150, 210, 250, 0.22)';
    ctx.beginPath();
    ctx.ellipse(CX + sway * 0.4, 96, 46, 58, 0, 0, Math.PI * 2);
    ctx.fill();

    // Robe body: shoulders tapering out to a swaying hem, with a hem arc
    const hemSway = Math.sin(t * 1.3) * 4;
    ctx.fillStyle = 'rgba(165, 222, 252, 0.55)';
    ctx.beginPath();
    ctx.moveTo(CX - 28 + sway, 112);
    ctx.quadraticCurveTo(CX - 40 + hemSway * 0.4, 230, CX - 66 + hemSway, 348);
    ctx.quadraticCurveTo(CX, 362, CX + 66 + hemSway, 348);
    ctx.quadraticCurveTo(CX + 40 + hemSway * 0.4, 230, CX + 28 + sway, 112);
    ctx.closePath();
    ctx.fill();

    // Belt
    ctx.fillStyle = 'rgba(190, 235, 255, 0.7)';
    ctx.fillRect(CX - 40, 188, 80, 9);

    // Robe folds, swaying gently
    ctx.strokeStyle = 'rgba(210, 240, 255, 0.18)';
    ctx.lineWidth = 3;
    for (let i = 0; i < 5; i++) {
        const fx = CX - 28 + i * 14;
        ctx.beginPath();
        ctx.moveTo(fx, 210);
        ctx.quadraticCurveTo(fx + Math.sin(t * 1.3 + i) * 4, 280, fx + hemSway * (0.4 + i * 0.1), 344);
        ctx.stroke();
    }

    // Head with side hair buns — the silhouette's key cue. The whole head
    // group drops with the bow.
    ctx.save();
    ctx.translate(0, bowDrop);
    ctx.fillStyle = 'rgba(180, 228, 255, 0.8)';
    ctx.beginPath();
    ctx.ellipse(CX + sway * 0.5, 80, 20, 24, 0, 0, Math.PI * 2);
    ctx.fill();
    for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(CX + side * 30 + sway * 0.5, 82, 13, 0, Math.PI * 2);
        ctx.fill();
    }
    // Hairline arc over the brow
    ctx.strokeStyle = 'rgba(120, 190, 235, 0.5)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(CX + sway * 0.5, 84, 19, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();

    // Subtle face
    ctx.fillStyle = 'rgba(30, 80, 120, 0.5)';
    ctx.beginPath();
    ctx.arc(CX - 7 + sway * 0.5, 78, 2.4, 0, Math.PI * 2);
    ctx.arc(CX + 7 + sway * 0.5, 78, 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(30, 80, 120, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(CX + sway * 0.5, 92, 5, Math.PI * 0.2, Math.PI * 0.8);
    ctx.stroke();
    ctx.restore();

    // Arms: interpolate elbow/hand between clasped rest and outstretched plea
    const lerp = (a, b) => a + (b - a) * raise;
    const shoulderY = 124 + bowDrop * 0.6;
    for (const side of [-1, 1]) {
        const sx = CX + side * 24;
        const ex = CX + side * lerp(20, 52);
        const ey = lerp(168, 158);
        const hx = CX + side * lerp(6, 74);
        const hy = lerp(206, 196);

        ctx.strokeStyle = 'rgba(175, 225, 252, 0.68)';
        ctx.lineWidth = 11;
        ctx.beginPath();
        ctx.moveTo(sx, shoulderY);
        ctx.quadraticCurveTo(ex, ey, hx, hy);
        ctx.stroke();

        ctx.fillStyle = 'rgba(195, 235, 255, 0.8)';
        ctx.beginPath();
        ctx.arc(hx, hy, 6.5, 0, Math.PI * 2);
        ctx.fill();
    }

    // Projection base glow pooling at the figure's feet
    const baseGlow = ctx.createRadialGradient(CX, 356, 4, CX, 356, 60);
    baseGlow.addColorStop(0, 'rgba(150, 220, 255, 0.5)');
    baseGlow.addColorStop(1, 'rgba(150, 220, 255, 0)');
    ctx.fillStyle = baseGlow;
    ctx.save();
    ctx.translate(CX, 356);
    ctx.scale(1, 0.22);
    ctx.translate(-CX, -356);
    ctx.beginPath();
    ctx.arc(CX, 356, 60, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.shadowBlur = 0;

    // Occasional horizontal glitch band: shift a slice of the image sideways.
    // drawImage source coords are raw canvas pixels (untouched by the context
    // transform), so they get the HOLO_RES factor; the destination is in the
    // transformed base space.
    const glitchPhase = t % 2.7;
    if (glitchPhase < 0.14 || burst) {
        const bandY = 40 + ((t * 731) % 280);
        const shift = Math.sin(t * 91) * 14;
        ctx.drawImage(
            ctx.canvas,
            0, bandY * HOLO_RES, HOLO_W * HOLO_RES, 10 * HOLO_RES,
            shift, bandY, HOLO_W, 10
        );
    }

    // Drifting scanlines, erased out of the drawn figure
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    const scan = (t * 14) % 4;
    for (let y = scan; y < HOLO_H; y += 4) {
        ctx.fillRect(0, y, HOLO_W, 1.2);
    }
    ctx.globalCompositeOperation = 'source-over';
}

// --- The cylindrical projector droid ---

function createDroidBodyTextures() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Matching height pass: panels recessed, slats grooved, rivets raised
    const heightCanvas = document.createElement('canvas');
    heightCanvas.width = 512;
    heightCanvas.height = 256;
    const hctx = heightCanvas.getContext('2d');

    ctx.fillStyle = '#d8d4ca';
    ctx.fillRect(0, 0, 512, 256);
    hctx.fillStyle = '#a0a0a0';
    hctx.fillRect(0, 0, 512, 256);

    // Recessed panel details in steel blue, spaced around the barrel
    const panel = (x, y, w, h, fill) => {
        ctx.fillStyle = fill;
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = '#7a7668';
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, w, h);
        hctx.fillStyle = '#6a6a6a';
        hctx.fillRect(x, y, w, h);
        hctx.strokeStyle = '#404040';
        hctx.lineWidth = 3;
        hctx.strokeRect(x, y, w, h);
    };
    for (let i = 0; i < 4; i++) {
        const x0 = i * 128;
        panel(x0 + 18, 24, 60, 70, '#49759c');
        panel(x0 + 90, 30, 26, 40, '#b8b4a8');
        panel(x0 + 22, 116, 40, 30, '#49759c');
        panel(x0 + 74, 110, 42, 62, '#b8b4a8');
        // Vent slats: deep grooves
        ctx.fillStyle = '#3a3833';
        hctx.fillStyle = '#303030';
        for (let s = 0; s < 5; s++) {
            ctx.fillRect(x0 + 24, 190 + s * 8, 88, 4);
            hctx.fillRect(x0 + 24, 190 + s * 8, 88, 4);
        }
        // Panel rivets: raised dots at the panel corners
        hctx.fillStyle = '#e0e0e0';
        ctx.fillStyle = '#8f8b80';
        for (const [rx, ry] of [[x0 + 12, 16], [x0 + 84, 16], [x0 + 12, 100], [x0 + 84, 100], [x0 + 120, 180]]) {
            ctx.beginPath();
            ctx.arc(rx, ry, 3.5, 0, Math.PI * 2);
            ctx.fill();
            hctx.beginPath();
            hctx.arc(rx, ry, 3.5, 0, Math.PI * 2);
            hctx.fill();
        }
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return { map: texture, normalMap: normalMapFromHeight(heightCanvas, 3) };
}

function createProjectorDroid() {
    // Built facing +Z (eye and holo-lens on the +Z side); rotated to face the
    // scene by the caller
    const droid = new THREE.Group();

    const bodyTextures = createDroidBodyTextures();
    const bodyMaterial = new THREE.MeshStandardMaterial({
        map: bodyTextures.map,
        normalMap: bodyTextures.normalMap,
        normalScale: new THREE.Vector2(1.4, 1.4),
        roughness: 0.5,
        metalness: 0.4,
    });
    // The barrel as a lathe profile: skirt flare at the base, a subtle
    // mid-body rib, shoulder taper, and a dome-seam inset at the top — real
    // silhouette information instead of a plain cylinder
    const bodyProfile = [
        [0.059, -0.065], [0.0575, -0.052], [0.055, -0.042],
        [0.055, 0.018], [0.0562, 0.024], [0.055, 0.03],
        [0.0545, 0.05], [0.052, 0.06], [0.0502, 0.065],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    const body = new THREE.Mesh(new THREE.LatheGeometry(bodyProfile, 40), bodyMaterial);
    body.position.y = 0.075;
    droid.add(body);

    const domeMaterial = new THREE.MeshStandardMaterial({ color: 0x9ba1a9, roughness: 0.3, metalness: 0.85 });
    const dome = new THREE.Group();
    dome.position.y = 0.14;
    const domeShell = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2),
        domeMaterial
    );
    dome.add(domeShell);

    // Main eye: dark recessed lens with a small red indicator above
    const eye = new THREE.Mesh(
        new THREE.CylinderGeometry(0.013, 0.015, 0.01, 16),
        new THREE.MeshStandardMaterial({ color: 0x101014, roughness: 0.2, metalness: 0.6 })
    );
    eye.rotation.x = Math.PI / 2 - 0.5;
    eye.position.set(0, 0.028, 0.047);
    dome.add(eye);

    const indicator = new THREE.Mesh(
        new THREE.SphereGeometry(0.005, 10, 10),
        new THREE.MeshStandardMaterial({ color: 0xff4444, emissive: 0xcc2222, emissiveIntensity: 1.6 })
    );
    indicator.position.set(0.018, 0.04, 0.036);
    dome.add(indicator);

    // Holoprojector lens, glowing blue, aimed out and slightly down
    const holoLens = new THREE.Mesh(
        new THREE.CylinderGeometry(0.007, 0.009, 0.012, 12),
        new THREE.MeshStandardMaterial({ color: 0x7fd4ff, emissive: 0x4fb8f0, emissiveIntensity: 2.4 })
    );
    holoLens.rotation.x = Math.PI / 2 + 0.3;
    holoLens.position.set(-0.016, 0.012, 0.05);
    dome.add(holoLens);

    droid.add(dome);

    // Dome greebles: sweep antenna, sensor discs, and a second small lens
    const antennaPivot = new THREE.Group();
    antennaPivot.position.set(-0.024, 0.038, -0.02);
    dome.add(antennaPivot);
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0018, 0.045, 6), domeMaterial);
    antenna.position.y = 0.022;
    antennaPivot.add(antenna);
    const antennaTip = new THREE.Mesh(
        new THREE.SphereGeometry(0.0035, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0x66ccff, emissive: 0x3399cc, emissiveIntensity: 1.2 })
    );
    antennaTip.position.y = 0.045;
    antennaPivot.add(antennaTip);
    for (const [ax, ay, az] of [[0.032, 0.03, -0.028], [-0.036, 0.024, 0.018]]) {
        const disc = new THREE.Mesh(
            new THREE.CylinderGeometry(0.009, 0.011, 0.006, 12),
            new THREE.MeshStandardMaterial({ color: 0x49759c, roughness: 0.4, metalness: 0.6 })
        );
        disc.position.set(ax, ay, az);
        disc.lookAt(new THREE.Vector3(ax * 3, ay * 3 + 0.14, az * 3));
        dome.add(disc);
    }
    const sideLens = new THREE.Mesh(
        new THREE.CylinderGeometry(0.005, 0.006, 0.008, 10),
        new THREE.MeshStandardMaterial({ color: 0x101014, roughness: 0.2, metalness: 0.6 })
    );
    sideLens.rotation.z = Math.PI / 2 - 0.4;
    sideLens.position.set(0.042, 0.02, 0.02);
    dome.add(sideLens);

    // Body greebles: a base skirt ring, side hatch boxes, and a front coupling
    const legMaterial = new THREE.MeshStandardMaterial({ color: 0xc6c2b8, roughness: 0.55, metalness: 0.45 });
    const skirtRing = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.062, 0.014, 28), legMaterial);
    skirtRing.position.y = 0.016;
    droid.add(skirtRing);
    for (const side of [-1, 1]) {
        const hatch = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.036, 0.03), legMaterial);
        hatch.position.set(side * 0.057, 0.09, 0.02);
        droid.add(hatch);
    }
    const coupling = new THREE.Mesh(
        new THREE.BoxGeometry(0.022, 0.016, 0.008),
        new THREE.MeshStandardMaterial({ color: 0x3a3833, roughness: 0.5, metalness: 0.5 })
    );
    coupling.position.set(0, 0.036, 0.055);
    droid.add(coupling);

    // Legs: shoulder discs, angled struts, ankle wedges, and treaded feet on
    // both sides, plus the retractable third leg angled back from the skirt
    for (const side of [-1, 1]) {
        const shoulder = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.014, 18), legMaterial);
        shoulder.rotation.x = Math.PI / 2;
        shoulder.position.set(side * 0.062, 0.1, 0);
        droid.add(shoulder);

        const shoulderCap = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.018, 12), new THREE.MeshStandardMaterial({ color: 0x49759c, roughness: 0.4, metalness: 0.6 }));
        shoulderCap.rotation.x = Math.PI / 2;
        shoulderCap.position.set(side * 0.062, 0.1, 0);
        droid.add(shoulderCap);

        const strut = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.105, 0.026), legMaterial);
        strut.rotation.z = side * -0.12;
        strut.position.set(side * 0.069, 0.052, 0);
        droid.add(strut);

        const ankle = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.026, 0.034), legMaterial);
        ankle.rotation.z = side * 0.35;
        ankle.position.set(side * 0.072, 0.03, 0.004);
        droid.add(ankle);

        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.024, 0.052), legMaterial);
        foot.position.set(side * 0.074, 0.012, 0.008);
        droid.add(foot);
        const toe = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.014, 0.014), legMaterial);
        toe.position.set(side * 0.074, 0.007, 0.04);
        droid.add(toe);
    }
    const centerLeg = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.07, 0.018), legMaterial);
    centerLeg.rotation.x = 0.5;
    centerLeg.position.set(0, 0.032, -0.035);
    droid.add(centerLeg);
    const centerFoot = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.018, 0.04), legMaterial);
    centerFoot.position.set(0, 0.009, -0.052);
    droid.add(centerFoot);

    return { droid, dome, antennaPivot };
}

// --- The human watcher ---

const SKIN = new THREE.MeshStandardMaterial({ color: 0xd9b08c, roughness: 0.6, metalness: 0.05 });
const TUNIC = new THREE.MeshStandardMaterial({ color: 0xe6ddc6, roughness: 0.75, metalness: 0.02 });
const TROUSERS = new THREE.MeshStandardMaterial({ color: 0xcfc2a0, roughness: 0.75, metalness: 0.02 });
const BOOTS = new THREE.MeshStandardMaterial({ color: 0x6b5236, roughness: 0.6, metalness: 0.1 });
const HAIR = new THREE.MeshStandardMaterial({ color: 0xb08d57, roughness: 0.8, metalness: 0.02 });
const BELT = new THREE.MeshStandardMaterial({ color: 0x5a4228, roughness: 0.6, metalness: 0.15 });

// A limb segment: a cylinder aligned from point `a` to point `b` via quaternion
// (no Euler mixing), with a joint sphere at the far end. `tipRadius` tapers
// the segment toward `b` for anatomical (or servo-armature) silhouettes.
function limb(a, b, radius, material, parent, tipRadius = radius) {
    const from = new THREE.Vector3(...a);
    const to = new THREE.Vector3(...b);
    const dir = to.clone().sub(from);
    const length = dir.length();

    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(tipRadius, radius, length, 12), material);
    mesh.position.copy(from).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    parent.add(mesh);

    const joint = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.05, 10, 10), material);
    joint.position.copy(to);
    parent.add(joint);
}

// Built facing +Z, kneeling on one knee with a forearm resting across the
// raised knee, leaning toward the small hologram on the floor before them —
// the reference staging for this scene.
function createHumanWatcher() {
    const human = new THREE.Group();

    // Right leg kneeling: thigh down-and-back to the grounded knee, shin flat
    // along the floor behind
    limb([0.028, 0.155, 0], [0.032, 0.032, -0.1], 0.018, TROUSERS, human, 0.013);
    limb([0.032, 0.032, -0.1], [0.032, 0.03, -0.2], 0.014, TROUSERS, human, 0.011);
    const trailBoot = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.03, 0.06), BOOTS);
    trailBoot.position.set(0.032, 0.018, -0.215);
    human.add(trailBoot);

    // Left leg planted: thigh forward to the raised knee, shin down to the foot
    limb([-0.028, 0.155, 0], [-0.034, 0.145, 0.1], 0.018, TROUSERS, human, 0.013);
    limb([-0.034, 0.145, 0.1], [-0.034, 0.03, 0.075], 0.014, TROUSERS, human, 0.011);
    const plantBoot = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.032, 0.062), BOOTS);
    plantBoot.position.set(-0.034, 0.018, 0.09);
    human.add(plantBoot);
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.019, 0.014, 12), BOOTS);
    cuff.position.set(-0.034, 0.042, 0.078);
    human.add(cuff);

    // Torso leaning slightly toward the hologram, belted
    limb([0, 0.165, -0.01], [0, 0.3, 0.02], 0.043, TUNIC, human);
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.02, 16), BELT);
    belt.position.set(0, 0.18, -0.005);
    human.add(belt);
    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.014, 0.006), new THREE.MeshStandardMaterial({ color: 0xb8a878, metalness: 0.7, roughness: 0.3 }));
    buckle.position.set(0, 0.18, 0.04);
    human.add(buckle);
    const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.026, 0.014), BELT);
    pouch.position.set(-0.045, 0.18, 0.01);
    human.add(pouch);

    // Left forearm resting across the raised knee; right hand on the thigh
    limb([-0.047, 0.285, 0.015], [-0.056, 0.21, 0.05], 0.014, TUNIC, human, 0.011);
    limb([-0.056, 0.21, 0.05], [-0.034, 0.16, 0.098], 0.011, TUNIC, human, 0.009);
    const leftHand = new THREE.Mesh(new THREE.SphereGeometry(0.013, 10, 10), SKIN);
    leftHand.position.set(-0.034, 0.16, 0.098);
    human.add(leftHand);

    limb([0.047, 0.285, 0.015], [0.056, 0.215, 0.025], 0.014, TUNIC, human, 0.011);
    limb([0.056, 0.215, 0.025], [0.03, 0.195, 0.06], 0.011, TUNIC, human, 0.009);
    const rightHand = new THREE.Mesh(new THREE.SphereGeometry(0.013, 10, 10), SKIN);
    rightHand.position.set(0.03, 0.195, 0.06);
    human.add(rightHand);

    // Neck and head, in a pivot so the watching tilt animates a single axis
    limb([0, 0.3, 0.02], [0, 0.318, 0.024], 0.014, SKIN, human);

    const headPivot = new THREE.Group();
    headPivot.position.set(0, 0.325, 0.024);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.032, 20, 16), SKIN);
    head.position.y = 0.026;
    head.scale.set(0.92, 1.05, 0.96);
    headPivot.add(head);

    const hair = new THREE.Mesh(
        new THREE.SphereGeometry(0.0345, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.62),
        HAIR
    );
    hair.position.y = 0.03;
    hair.rotation.x = -0.25; // sweep the hairline back off the face
    headPivot.add(hair);

    // Face and ear detail
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.005, 8, 8), SKIN);
    nose.position.set(0, 0.022, 0.031);
    headPivot.add(nose);
    for (const side of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.SphereGeometry(0.007, 8, 8), SKIN);
        ear.position.set(side * 0.029, 0.024, 0.002);
        ear.scale.set(0.5, 1, 0.8);
        headPivot.add(ear);
    }

    // Tunic collar at the neckline
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.02, 0.006, 8, 16), TUNIC);
    collar.rotation.x = Math.PI / 2;
    collar.position.set(0, 0.305, 0.02);
    human.add(collar);

    human.add(headPivot);
    return { human, headPivot };
}

// --- The humanoid protocol robot ---

const ROBOT_GOLD = new THREE.MeshStandardMaterial({ color: 0xc9a227, roughness: 0.28, metalness: 0.9 });
const ROBOT_JOINT = new THREE.MeshStandardMaterial({ color: 0x6e5a1e, roughness: 0.5, metalness: 0.7 });
const ROBOT_MIDRIFF = new THREE.MeshStandardMaterial({ color: 0x2c2620, roughness: 0.6, metalness: 0.5 });

// A servo piston: an outer sleeve from `a` to the midpoint and a thinner
// rod completing the run to `b`, the armature detail on every joint of a
// protocol droid's limbs.
function piston(a, b, parent) {
    const from = new THREE.Vector3(...a);
    const to = new THREE.Vector3(...b);
    const mid = from.clone().lerp(to, 0.55);
    const sleeveDir = mid.clone().sub(from);
    const sleeve = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0045, 0.0045, sleeveDir.length(), 8),
        ROBOT_JOINT
    );
    sleeve.position.copy(from).addScaledVector(sleeveDir, 0.5);
    sleeve.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), sleeveDir.clone().normalize());
    parent.add(sleeve);
    const rodDir = to.clone().sub(mid);
    const rod = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0022, 0.0022, rodDir.length(), 8),
        new THREE.MeshStandardMaterial({ color: 0xb9bcc2, roughness: 0.25, metalness: 0.9 })
    );
    rod.position.copy(mid).addScaledVector(rodDir, 0.5);
    rod.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), rodDir.clone().normalize());
    parent.add(rod);
}

// Built facing +Z, ~0.49 tall — human-scale, as a protocol droid stands eye
// to eye with its master. Stiff-armed posture, glowing round eyes.
function createProtocolDroid() {
    const robot = new THREE.Group();

    // Feet and legs
    for (const side of [-1, 1]) {
        const foot = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.024, 0.062), ROBOT_GOLD);
        foot.position.set(side * 0.024, 0.012, 0.008);
        robot.add(foot);
        limb([side * 0.024, 0.024, 0], [side * 0.025, 0.15, 0.004], 0.011, ROBOT_GOLD, robot, 0.015);
        limb([side * 0.025, 0.15, 0.004], [side * 0.027, 0.24, 0], 0.014, ROBOT_GOLD, robot, 0.018);
        const kneePlate = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.03, 0.014), ROBOT_JOINT);
        kneePlate.position.set(side * 0.025, 0.15, 0.018);
        robot.add(kneePlate);
        // Calf and thigh pistons running behind the leg
        piston([side * 0.032, 0.21, -0.018], [side * 0.03, 0.152, -0.014], robot);
        piston([side * 0.03, 0.148, -0.014], [side * 0.028, 0.05, -0.011], robot);
    }

    // Pelvis, exposed midriff wiring, and chest
    const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.092, 0.05, 0.06), ROBOT_GOLD);
    pelvis.position.y = 0.255;
    robot.add(pelvis);
    const midriff = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.04, 0.045, 16), ROBOT_MIDRIFF);
    midriff.position.y = 0.3;
    robot.add(midriff);
    for (const [wireY, wireColor] of [[0.29, 0xb8542a], [0.3, 0x3f6ea8], [0.31, 0x8a8d94]]) {
        const wire = new THREE.Mesh(new THREE.TorusGeometry(0.041, 0.0035, 6, 20), new THREE.MeshStandardMaterial({ color: wireColor, roughness: 0.5, metalness: 0.6 }));
        wire.rotation.x = Math.PI / 2;
        wire.position.y = wireY;
        robot.add(wire);
    }
    const chest = new THREE.Mesh(new THREE.CylinderGeometry(0.054, 0.047, 0.095, 18), ROBOT_GOLD);
    chest.position.y = 0.368;
    robot.add(chest);
    const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.05, 0.012), ROBOT_JOINT);
    chestPlate.position.set(0, 0.372, 0.049);
    robot.add(chestPlate);

    // Stiff bent arms with ball shoulders
    for (const side of [-1, 1]) {
        const shoulder = new THREE.Mesh(new THREE.SphereGeometry(0.02, 12, 12), ROBOT_JOINT);
        shoulder.position.set(side * 0.064, 0.4, 0);
        robot.add(shoulder);
        limb([side * 0.064, 0.4, 0], [side * 0.072, 0.31, 0.012], 0.013, ROBOT_GOLD, robot, 0.01);
        limb([side * 0.072, 0.31, 0.012], [side * 0.056, 0.28, 0.09], 0.011, ROBOT_GOLD, robot, 0.009);
        const hand = new THREE.Mesh(new THREE.SphereGeometry(0.013, 10, 10), ROBOT_GOLD);
        hand.position.set(side * 0.056, 0.28, 0.09);
        robot.add(hand);
        // Forearm piston under the bent elbow
        piston([side * 0.078, 0.315, 0.002], [side * 0.062, 0.285, 0.075], robot);
    }

    // Neck and head, in a pivot for idle turns
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.015, 0.03, 12), ROBOT_JOINT);
    neck.position.y = 0.428;
    robot.add(neck);
    // Ribbed neck rings
    for (const ringY of [0.42, 0.428, 0.436]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0145, 0.0022, 6, 16), ROBOT_GOLD);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = ringY;
        robot.add(ring);
    }

    const robotHead = new THREE.Group();
    robotHead.position.y = 0.443;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.034, 20, 16), ROBOT_GOLD);
    skull.position.y = 0.022;
    skull.scale.set(0.9, 1.05, 0.95);
    robotHead.add(skull);
    const eyeMaterial = new THREE.MeshStandardMaterial({ color: 0xfff2b0, emissive: 0xd8b840, emissiveIntensity: 2.2 });
    for (const side of [-1, 1]) {
        const eye = new THREE.Mesh(new THREE.SphereGeometry(0.0065, 10, 10), eyeMaterial);
        eye.position.set(side * 0.013, 0.027, 0.028);
        robotHead.add(eye);
    }
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.004, 0.005), ROBOT_MIDRIFF);
    mouth.position.set(0, 0.008, 0.031);
    robotHead.add(mouth);
    robot.add(robotHead);

    return { robot, robotHead, eyeMaterial };
}

// --- Workshop set dressing ---

const BENCH_METAL = new THREE.MeshStandardMaterial({ color: 0x5c584f, roughness: 0.6, metalness: 0.5 });
const CRATE_METAL = new THREE.MeshStandardMaterial({ color: 0x6e6a5e, roughness: 0.7, metalness: 0.35 });
const TOOL_METAL = new THREE.MeshStandardMaterial({ color: 0x8a8d94, roughness: 0.35, metalness: 0.8 });
const CABLE_RUBBER = new THREE.MeshStandardMaterial({ color: 0x1d1a16, roughness: 0.9, metalness: 0.05 });

function createWorkshopProps() {
    const props = new THREE.Group();

    // Workbench along the back of the scene, strewn with tools and a spare
    // droid dome under repair
    const bench = new THREE.Group();
    bench.position.set(0.05, 0, -0.34);
    const benchTop = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.014, 0.12), BENCH_METAL);
    benchTop.position.y = 0.13;
    bench.add(benchTop);
    for (const [lx, lz] of [[-0.15, -0.045], [0.15, -0.045], [-0.15, 0.045], [0.15, 0.045]]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.13, 0.014), BENCH_METAL);
        leg.position.set(lx, 0.065, lz);
        bench.add(leg);
    }
    const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.01, 0.1), BENCH_METAL);
    shelf.position.y = 0.05;
    bench.add(shelf);
    const spareDome = new THREE.Mesh(
        new THREE.SphereGeometry(0.035, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0x9ba1a9, roughness: 0.3, metalness: 0.85 })
    );
    spareDome.position.set(-0.1, 0.137, 0);
    bench.add(spareDome);
    const oilCan = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.036, 12), TOOL_METAL);
    oilCan.position.set(0.02, 0.155, -0.02);
    bench.add(oilCan);
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.004, 0.024, 8), TOOL_METAL);
    spout.rotation.z = -0.6;
    spout.position.set(0.032, 0.176, -0.02);
    bench.add(spout);
    for (const [tx, tz, tw] of [[0.08, 0.02, 0.05], [0.12, -0.025, 0.036], [-0.03, 0.03, 0.042]]) {
        const tool = new THREE.Mesh(new THREE.BoxGeometry(tw, 0.008, 0.014), TOOL_METAL);
        tool.rotation.y = tx * 7;
        tool.position.set(tx, 0.141, tz);
        bench.add(tool);
    }
    props.add(bench);

    // Stacked supply crates
    for (const [cx, cy, cz, s, ry] of [[0.36, 0.035, -0.22, 0.07, 0.1], [0.36, 0.1, -0.21, 0.058, -0.25], [-0.38, 0.03, -0.12, 0.06, 0.35]]) {
        const crate = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), CRATE_METAL);
        crate.position.set(cx, cy, cz);
        crate.rotation.y = ry;
        props.add(crate);
        const lid = new THREE.Mesh(new THREE.BoxGeometry(s * 1.06, s * 0.16, s * 1.06), BENCH_METAL);
        lid.position.set(cx, cy + s / 2, cz);
        lid.rotation.y = ry;
        props.add(lid);
    }

    // Battery cart: a squat box on wheels with twin capacitor drums
    const cart = new THREE.Group();
    cart.position.set(-0.36, 0, 0.24);
    cart.rotation.y = 0.5;
    const cartBody = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.06), CRATE_METAL);
    cartBody.position.y = 0.05;
    cart.add(cartBody);
    for (const side of [-1, 1]) {
        const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.05, 12), TOOL_METAL);
        drum.rotation.z = Math.PI / 2;
        drum.position.set(0, 0.095, side * 0.015);
        cart.add(drum);
        for (const end of [-1, 1]) {
            const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.01, 12), CABLE_RUBBER);
            wheel.rotation.x = Math.PI / 2;
            wheel.position.set(end * 0.032, 0.014, side * 0.034);
            cart.add(wheel);
        }
    }
    props.add(cart);

    // Cable runs snaking across the deck toward the droid
    for (const [ccx, ccz, cr, rot, arc] of [[-0.28, 0.12, 0.07, 0.4, 3.6], [-0.1, -0.2, 0.09, 2.1, 2.8]]) {
        const cable = new THREE.Mesh(new THREE.TorusGeometry(cr, 0.004, 6, 24, arc), CABLE_RUBBER);
        cable.rotation.x = -Math.PI / 2;
        cable.rotation.z = rot;
        cable.position.set(ccx, 0.004, ccz);
        props.add(cable);
    }

    // Work lamp on a stand, throwing warm light over the bench
    const lamp = new THREE.Group();
    lamp.position.set(-0.13, 0, -0.3);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.007, 0.24, 10), BENCH_METAL);
    pole.position.y = 0.12;
    lamp.add(pole);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.036, 14, 1, true), BENCH_METAL);
    shade.rotation.x = 0.7;
    shade.position.set(0, 0.245, 0.016);
    lamp.add(shade);
    const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.008, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xcc9944, emissiveIntensity: 2 })
    );
    bulb.position.set(0, 0.238, 0.028);
    lamp.add(bulb);
    // The lamp is the workshop's shadow-caster: a spotlight throwing the
    // bench and cast into relief
    const lampLight = new THREE.SpotLight(0xffd9a0, 2.2, 0.75, Math.PI / 2.6, 0.55, 1.2);
    lampLight.position.set(0, 0.23, 0.04);
    lampLight.castShadow = true;
    lampLight.shadow.mapSize.set(512, 512);
    lampLight.shadow.camera.near = 0.02;
    lampLight.shadow.camera.far = 0.8;
    lampLight.shadow.bias = -0.004;
    lamp.add(lampLight);
    lampLight.target.position.set(0.18, 0, 0.12);
    lamp.add(lampLight.target);
    props.add(lamp);

    return props;
}

// --- Scene assembly ---

function smoothstep(edge0, edge1, x) {
    const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
    return t * t * (3 - 2 * t);
}

const GESTURE_LOOP_MS = 14000;
const HOLO_BASE_OPACITY = 0.85;
// The hologram is SMALL, as a real tabletop projection would be — about a
// quarter of the kneeling watcher's height. Plane is 0.12 tall, so centering
// it at 0.06 puts its bottom edge — the figure's feet — exactly on the floor
const FIGURE_CENTER_HEIGHT = 0.06;

export function createFace4Hologram() {
    // The cast stands ON the -y face (like the chess pieces on +x): the face's
    // deck-plate texture is the workshop floor. Inner scene is built with up =
    // +Y and a flat XZ ground plane; one fixed single-axis rotation maps scene
    // +Y onto cube -Y (outward from the face), so feet sit on the face with no
    // Euler coupling against the animated children.
    const group = new THREE.Group();
    group.position.set(0, -0.5 - SURFACE_EPSILON, 0);
    group.rotation.z = Math.PI;

    const sceneGroup = new THREE.Group();
    group.add(sceneGroup);

    // Staging follows the reference frame: the human kneels at the left
    // watching the small hologram on the floor before them; the projector
    // droid stands at the right beaming it out, with the humanoid robot at
    // its shoulder. Proportions: humanoid ~ human height, astromech ~60% of
    // the humanoid, hologram about knee-high to the kneeling watcher.
    const { droid, dome, antennaPivot } = createProjectorDroid();
    droid.scale.setScalar(1.35 * 0.7); // droids at 70% scale beside the human
    droid.position.set(0.16, 0, -0.02);
    droid.rotation.y = -Math.PI / 2; // face -X, toward the watcher
    sceneGroup.add(droid);

    const { robot, robotHead, eyeMaterial } = createProtocolDroid();
    robot.scale.setScalar(0.7);
    robot.position.set(0.3, 0, -0.11);
    robot.rotation.y = -1.28; // turned toward the hologram
    sceneGroup.add(robot);

    const { human, headPivot } = createHumanWatcher();
    human.position.set(-0.24, 0, 0.02);
    human.rotation.y = Math.PI / 2; // face +X, toward droids and hologram
    sceneGroup.add(human);

    // Workshop set dressing around the cast
    sceneGroup.add(createWorkshopProps());

    // The hologram: an animated canvas texture on a translucent projection plane
    const holoCanvas = document.createElement('canvas');
    holoCanvas.width = HOLO_W * HOLO_RES;
    holoCanvas.height = HOLO_H * HOLO_RES;
    const holoCtx = holoCanvas.getContext('2d');

    const holoTexture = new THREE.CanvasTexture(holoCanvas);
    holoTexture.colorSpace = THREE.SRGBColorSpace;

    const holoMaterial = new THREE.MeshBasicMaterial({
        map: holoTexture,
        transparent: true,
        opacity: HOLO_BASE_OPACITY,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
    });
    const holoPlane = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.12), holoMaterial);
    // Small and upright on the floor between the watcher and the droids,
    // turned to address the kneeling human (plane normal -X, where they
    // kneel) — the way a real projection faces its audience.
    holoPlane.position.set(-0.1, FIGURE_CENTER_HEIGHT, 0.02);
    holoPlane.rotation.y = -Math.PI / 2; // single static axis: normal -> -X
    sceneGroup.add(holoPlane);

    // Ghost planes offset along the view normal give the projection depth:
    // faint copies of the same animated texture, slightly scaled, so the
    // figure parallaxes like a volume instead of reading as a card
    const ghosts = [];
    for (const [offset, ghostScale] of [[-0.008, 1.05], [0.008, 0.96]]) {
        const ghostMaterial = holoMaterial.clone();
        ghostMaterial.opacity = 0.3;
        const ghost = new THREE.Mesh(holoPlane.geometry, ghostMaterial);
        ghost.position.copy(holoPlane.position);
        ghost.position.x += offset;
        ghost.rotation.y = -Math.PI / 2;
        sceneGroup.add(ghost);
        ghosts.push({ mesh: ghost, material: ghostMaterial, baseScale: ghostScale });
    }

    // Shimmer motes drifting up through the projection volume
    const SHIMMER_COUNT = 50;
    const shimmerPositions = new Float32Array(SHIMMER_COUNT * 3);
    const shimmerSeeds = [];
    for (let i = 0; i < SHIMMER_COUNT; i++) {
        shimmerSeeds.push({
            x: -0.1 + (Math.random() - 0.5) * 0.075,
            z: 0.02 + (Math.random() - 0.5) * 0.075,
            y0: Math.random() * 0.135,
            speed: 0.02 + Math.random() * 0.03,
            wobble: Math.random() * Math.PI * 2,
        });
    }
    const shimmerGeometry = new THREE.BufferGeometry();
    shimmerGeometry.setAttribute('position', new THREE.BufferAttribute(shimmerPositions, 3));
    const shimmerMaterial = new THREE.PointsMaterial({
        color: 0x9fe0ff,
        size: 0.006,
        transparent: true,
        opacity: 0.7,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
    });
    const shimmer = new THREE.Points(shimmerGeometry, shimmerMaterial);
    sceneGroup.add(shimmer);

    // Projection beam from the droid's holo-lens up to the base of the
    // figure, with a streaked alpha texture scrolling toward the figure so
    // the light visibly FLOWS
    const beamAlphaCanvas = document.createElement('canvas');
    beamAlphaCanvas.width = 64;
    beamAlphaCanvas.height = 256;
    const bctx = beamAlphaCanvas.getContext('2d');
    bctx.fillStyle = '#404040';
    bctx.fillRect(0, 0, 64, 256);
    for (let i = 0; i < 26; i++) {
        const x = Math.random() * 64;
        const y = Math.random() * 256;
        const len = 30 + Math.random() * 90;
        const g = bctx.createLinearGradient(0, y, 0, y + len);
        g.addColorStop(0, 'rgba(255,255,255,0)');
        g.addColorStop(0.5, `rgba(255,255,255,${0.25 + Math.random() * 0.5})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        bctx.fillStyle = g;
        bctx.fillRect(x, y, 2 + Math.random() * 3, len);
    }
    const beamAlphaTexture = new THREE.CanvasTexture(beamAlphaCanvas);
    beamAlphaTexture.wrapS = THREE.RepeatWrapping;
    beamAlphaTexture.wrapT = THREE.RepeatWrapping;

    const beamMaterial = new THREE.MeshBasicMaterial({
        color: 0x7fd4ff,
        alphaMap: beamAlphaTexture,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
    });
    const beamFrom = new THREE.Vector3(0.111, 0.14, -0.034); // the droid's holo-lens (at 70% scale)
    const beamTo = new THREE.Vector3(-0.1, 0.008, 0.02); // the figure's feet
    const beamDir = beamTo.clone().sub(beamFrom);
    const beam = new THREE.Mesh(
        new THREE.ConeGeometry(0.03, beamDir.length(), 20, 1, true),
        beamMaterial
    );
    beam.position.copy(beamFrom).addScaledVector(beamDir, 0.5);
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), beamDir.clone().normalize());
    sceneGroup.add(beam);

    // Cool blue glow the hologram casts onto the droid, floor, and human
    const holoLight = new THREE.PointLight(0x66ccff, 2.2, 0.55);
    holoLight.position.set(-0.09, 0.09, 0.05);
    holoLight.castShadow = true;
    holoLight.shadow.mapSize.set(256, 256);
    holoLight.shadow.camera.near = 0.02;
    holoLight.shadow.camera.far = 0.6;
    holoLight.shadow.bias = -0.004;
    sceneGroup.add(holoLight);

    // Every opaque mesh in the workshop casts and receives; the additive
    // hologram planes and beam are excluded (they'd punch black holes)
    group.traverse((obj) => {
        if (obj.isMesh && !obj.material.transparent) {
            obj.castShadow = true;
            obj.receiveShadow = true;
        }
    });

    function update() {
        const now = performance.now();
        const t = now / 1000;

        // The full message loop: materialize -> plea -> hold -> lower ->
        // bow -> dissolve, then the recording starts again
        const phase = (now % GESTURE_LOOP_MS) / GESTURE_LOOP_MS;
        const raise = smoothstep(0.18, 0.34, phase) - smoothstep(0.58, 0.74, phase);
        const bow = smoothstep(0.78, 0.86, phase) - smoothstep(0.9, 0.96, phase);
        const materializing = smoothstep(0.0, 0.06, phase);
        const presence = materializing - smoothstep(0.955, 0.998, phase);
        const burst = phase < 0.05 || phase > 0.94;

        drawHoloFrame(holoCtx, t, raise, bow, burst);
        holoTexture.needsUpdate = true;

        // Materialize: the figure resolves from a stretched vertical streak
        const stretchY = 1 + (1 - materializing) * 0.9;
        const stretchX = 0.25 + materializing * 0.75;
        holoPlane.scale.set(stretchX, stretchY, 1);
        for (const ghost of ghosts) {
            ghost.mesh.scale.set(stretchX * ghost.baseScale, stretchY * ghost.baseScale, 1);
        }

        // Recorded-message flicker on the plane, ghosts, beam, motes, and
        // cast light together, all gated by presence through the loop
        let flicker = 1 + 0.1 * Math.sin(t * 13.7) * Math.sin(t * 7.3);
        if (Math.sin(t * 2.13) > 0.985) flicker *= 0.35;
        const visibility = flicker * presence;
        holoMaterial.opacity = HOLO_BASE_OPACITY * visibility;
        for (const ghost of ghosts) ghost.material.opacity = 0.3 * visibility;
        beamMaterial.opacity = 0.35 * visibility;
        holoLight.intensity = 2.2 * visibility;
        shimmerMaterial.opacity = 0.7 * visibility;

        // Beam streaks flow toward the figure; motes spiral slowly upward
        beamAlphaTexture.offset.y = -t * 0.35;
        for (let i = 0; i < SHIMMER_COUNT; i++) {
            const seed = shimmerSeeds[i];
            const y = (seed.y0 + t * seed.speed) % 0.14;
            shimmerPositions[i * 3] = seed.x + 0.004 * Math.sin(t * 1.7 + seed.wobble);
            shimmerPositions[i * 3 + 1] = y;
            shimmerPositions[i * 3 + 2] = seed.z + 0.004 * Math.cos(t * 1.3 + seed.wobble);
        }
        shimmerGeometry.attributes.position.needsUpdate = true;

        // --- Idle motion: the cast breathes, shifts, and glances ---

        // Astromech: the dome scans, the chassis rocks faintly with it, and
        // the antenna wobbles a beat behind
        dome.rotation.y = 0.18 * Math.sin(t * 0.6);
        droid.rotation.z = 0.015 * Math.sin(t * 0.6 + Math.PI / 2);
        antennaPivot.rotation.z = 0.1 * Math.sin(t * 2.3) * Math.abs(Math.sin(t * 0.6));

        // Human: watching tilt, slow breath, and a gentle weight shift
        // between knee and planted foot
        headPivot.rotation.x = 0.3 + 0.03 * Math.sin(t * 0.37);
        human.scale.y = 1 + 0.006 * Math.sin(t * 1.9);
        human.rotation.z = 0.012 * Math.sin(t * 0.21);

        // Humanoid: servo head turns easing toward a new glance target every
        // few seconds, with an occasional eye flicker
        const glanceTarget = -0.1 + 0.25 * Math.sin(Math.floor(t / 3.7) * 4.7);
        robotHead.rotation.y += (glanceTarget - robotHead.rotation.y) * 0.06;
        eyeMaterial.emissiveIntensity = Math.sin(t * 17.3) > 0.97 ? 0.8 : 2.2;
    }

    update();
    return { group, update };
}
