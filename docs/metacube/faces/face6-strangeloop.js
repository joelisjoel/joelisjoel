// Face 6 (-z): an original homage to Gödel, Escher, Bach — the strange loop
// itself. A golden trefoil knot (the simplest curve that endlessly returns to
// its own beginning while seeming always to climb) floats and precesses above
// an engraved pedestal, breathing with a slow emissive pulse. The face beneath
// is an aged-parchment plate with recursive frames-within-frames, the visual
// grammar of a hierarchy that folds back into itself.
import * as THREE from 'three';

const BOARD_SIZE = 1024;
const CENTER = BOARD_SIZE / 2;

const PARCHMENT = '#e6d9bb';
const PARCHMENT_DARK = '#d3c39e';
const INK = '#4a3421';
const INK_FAINT = 'rgba(74, 52, 33, 0.45)';
const GOLD_INK = '#8a6a1f';

export function createFace6Material() {
    const canvas = document.createElement('canvas');
    canvas.width = BOARD_SIZE;
    canvas.height = BOARD_SIZE;
    const ctx = canvas.getContext('2d');

    // Parchment base with soft mottling
    ctx.fillStyle = PARCHMENT;
    ctx.fillRect(0, 0, BOARD_SIZE, BOARD_SIZE);
    for (let i = 0; i < 260; i++) {
        const x = Math.random() * BOARD_SIZE;
        const y = Math.random() * BOARD_SIZE;
        const r = 20 + Math.random() * 70;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(211, 195, 158, 0.16)');
        g.addColorStop(1, 'rgba(211, 195, 158, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }

    // Recursive frames: the same rectangle drawn into itself again and again,
    // each iteration thinner and fainter — a visual regress
    for (let k = 0; k < 7; k++) {
        const inset = 36 + k * k * 14;
        ctx.strokeStyle = k % 2 === 0 ? INK : INK_FAINT;
        ctx.lineWidth = Math.max(7 - k, 1.5);
        ctx.strokeRect(inset, inset, BOARD_SIZE - inset * 2, BOARD_SIZE - inset * 2);
    }

    // Corner glyphs: tiny endless loops sketched with two interlinked circles
    for (const [cx, cy] of [[86, 86], [BOARD_SIZE - 86, 86], [86, BOARD_SIZE - 86], [BOARD_SIZE - 86, BOARD_SIZE - 86]]) {
        ctx.strokeStyle = GOLD_INK;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(cx - 9, cy, 15, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx + 9, cy, 15, 0, Math.PI * 2);
        ctx.stroke();
    }

    // Central medallion beneath the pedestal: engraved rings and a motto
    // circling the rim
    ctx.strokeStyle = INK;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(CENTER, CENTER, 300, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(CENTER, CENTER, 268, 0, Math.PI * 2);
    ctx.stroke();

    const motto = 'EVER RISING · EVER RETURNING · ';
    ctx.fillStyle = GOLD_INK;
    ctx.font = 'bold 34px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < motto.length; i++) {
        const angle = (i / motto.length) * Math.PI * 2 - Math.PI / 2;
        ctx.save();
        ctx.translate(CENTER + Math.cos(angle) * 284, CENTER + Math.sin(angle) * 284);
        ctx.rotate(angle + Math.PI / 2);
        ctx.fillText(motto[i], 0, 0);
        ctx.restore();
    }

    // Radiating hatch lines inside the medallion, woodcut style
    ctx.strokeStyle = INK_FAINT;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 72; i++) {
        const angle = (i / 72) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(CENTER + Math.cos(angle) * 150, CENTER + Math.sin(angle) * 150);
        ctx.lineTo(CENTER + Math.cos(angle) * 258, CENTER + Math.sin(angle) * 258);
        ctx.stroke();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.needsUpdate = true;

    return new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.8,
        metalness: 0.05,
    });
}

// --- The floating knot and its pedestal ---

const MARBLE = new THREE.MeshStandardMaterial({ color: 0xcfc8b8, roughness: 0.55, metalness: 0.05 });
const MARBLE_DARK = new THREE.MeshStandardMaterial({ color: 0xa89f8c, roughness: 0.6, metalness: 0.05 });

export function createFace6StrangeLoop() {
    // Scene built with +Y up and the face plane at y = 0; one fixed single-axis
    // rotation maps scene +Y onto cube -Z (out of the face).
    const group = new THREE.Group();
    group.position.set(0, 0, -0.5);
    group.rotation.x = -Math.PI / 2;

    // Gold inlay ring set into the face around the pedestal
    const inlay = new THREE.Mesh(
        new THREE.RingGeometry(0.15, 0.175, 48),
        new THREE.MeshStandardMaterial({ color: 0xb8912d, roughness: 0.35, metalness: 0.8, side: THREE.DoubleSide })
    );
    inlay.rotation.x = -Math.PI / 2;
    inlay.position.y = 0.002;
    group.add(inlay);

    // Pedestal: square base under a round plinth, a fluted column between
    // torus moldings, and a molded cap
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.018, 0.27), MARBLE_DARK);
    base.position.y = 0.009;
    group.add(base);
    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.13, 0.026, 32), MARBLE_DARK);
    plinth.position.y = 0.031;
    group.add(plinth);
    const lowerTorus = new THREE.Mesh(new THREE.TorusGeometry(0.088, 0.009, 10, 32), MARBLE);
    lowerTorus.rotation.x = Math.PI / 2;
    lowerTorus.position.y = 0.048;
    group.add(lowerTorus);
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.085, 0.06, 32), MARBLE);
    column.position.y = 0.078;
    group.add(column);
    // Flutes: slender rods standing in the column's surface
    for (let i = 0; i < 14; i++) {
        const angle = (i / 14) * Math.PI * 2;
        const flute = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.005, 0.058, 6), MARBLE_DARK);
        flute.position.set(Math.cos(angle) * 0.074, 0.078, Math.sin(angle) * 0.074);
        flute.rotation.z = Math.cos(angle) * -0.12;
        flute.rotation.x = Math.sin(angle) * 0.12;
        group.add(flute);
    }
    const upperTorus = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.008, 10, 32), MARBLE);
    upperTorus.rotation.x = Math.PI / 2;
    upperTorus.position.y = 0.108;
    group.add(upperTorus);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.098, 0.072, 0.022, 32), MARBLE);
    cap.position.y = 0.124;
    group.add(cap);
    const capRim = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.005, 8, 40), MARBLE_DARK);
    capRim.rotation.x = Math.PI / 2;
    capRim.position.y = 0.134;
    group.add(capRim);

    // The strange loop: a golden trefoil. Nested groups keep the fixed lie-flat
    // tilt and the two animated axes from coupling through one Euler.
    const knotMaterial = new THREE.MeshStandardMaterial({
        color: 0xd4a017,
        roughness: 0.22,
        metalness: 0.9,
        emissive: 0x6b4a00,
        emissiveIntensity: 0.25,
    });
    const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.135, 0.038, 300, 32, 2, 3), knotMaterial);

    // A slender companion strand winding the same trefoil path, scaled out
    // into a halo around the main loop
    const strand = new THREE.Mesh(
        new THREE.TorusKnotGeometry(0.135, 0.006, 240, 10, 2, 3),
        new THREE.MeshStandardMaterial({
            color: 0xf0c860,
            roughness: 0.3,
            metalness: 0.85,
            emissive: 0x8a5f10,
            emissiveIntensity: 0.4,
        })
    );
    strand.scale.setScalar(1.32);

    const spinner = new THREE.Group(); // animated: slow precession about the face normal
    const nodder = new THREE.Group(); // animated: gentle nutation about x
    spinner.position.y = 0.33;
    spinner.add(nodder);
    nodder.add(knot);
    nodder.add(strand);
    group.add(spinner);

    // Motes of light racing along the trefoil's centerline — the endless
    // traversal made visible. Uses the same parametric curve TorusKnotGeometry
    // builds from (p = 2, q = 3).
    function trefoilPoint(u, target) {
        const factor = 0.135 * (2 + Math.cos(3 * u)) * 0.5;
        target.set(
            factor * Math.cos(2 * u),
            factor * Math.sin(2 * u),
            0.135 * Math.sin(3 * u) * 0.5
        );
        return target;
    }
    const CHASER_COUNT = 9;
    const chasers = [];
    // Unlit and self-bright so the sparks pop against the lit gold
    const chaserMaterial = new THREE.MeshBasicMaterial({ color: 0xfffbe8 });
    for (let i = 0; i < CHASER_COUNT; i++) {
        const mote = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 8), chaserMaterial);
        nodder.add(mote);
        chasers.push({ mote, offset: (i / CHASER_COUNT) * Math.PI * 2 });
    }
    const chaserScratch = new THREE.Vector3();

    // A warm glint light above the pedestal so the gold catches fire as it turns
    const glow = new THREE.PointLight(0xffd27a, 2.5, 0.9);
    glow.position.set(0.12, 0.42, 0.12);
    group.add(glow);

    function update() {
        const t = performance.now();
        spinner.rotation.y = t * 0.0004;
        nodder.rotation.x = 0.35 * Math.sin(t * 0.00013);

        // Breathing glow: the loop brightens as if arriving somewhere, then
        // settles back where it began
        const pulse = 0.5 + 0.5 * Math.sin(t * 0.0006);
        knotMaterial.emissiveIntensity = 0.15 + 0.45 * pulse;
        glow.intensity = 1.8 + 1.6 * pulse;

        // Motes circulate forever along the halo strand (the same trefoil
        // path scaled out past the main tube), swelling as the loop peaks
        for (const chaser of chasers) {
            trefoilPoint(t * 0.0004 + chaser.offset, chaserScratch);
            chaser.mote.position.copy(chaserScratch).multiplyScalar(1.32);
        }
        const moteScale = 0.8 + 0.5 * pulse;
        for (const chaser of chasers) chaser.mote.scale.setScalar(moteScale);
    }

    update();
    return { group, update };
}
