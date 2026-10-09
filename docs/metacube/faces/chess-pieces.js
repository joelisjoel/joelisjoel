// Simple stylized 3D chess piece geometry, built upward along local +Y from y=0.
import * as THREE from 'three';

function addCylinder(group, material, { radiusTop, radiusBottom, height, y, segments = 16 }) {
    const geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = y + height / 2;
    group.add(mesh);
    return y + height;
}

function addSphere(group, material, { radius, y, segments = 16 }) {
    const geometry = new THREE.SphereGeometry(radius, segments, segments);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = y + radius;
    group.add(mesh);
    return y + radius * 2;
}

function addCone(group, material, { radius, height, y, segments = 16 }) {
    const geometry = new THREE.ConeGeometry(radius, height, segments);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = y + height / 2;
    group.add(mesh);
    return y + height;
}

function addBase(group, material, y) {
    return addCylinder(group, material, { radiusTop: 0.034, radiusBottom: 0.04, height: 0.014, y });
}

export function createPawn(material) {
    const group = new THREE.Group();
    let y = addBase(group, material, 0);
    y = addCylinder(group, material, { radiusTop: 0.018, radiusBottom: 0.026, height: 0.035, y });
    addSphere(group, material, { radius: 0.02, y });
    return group;
}

export function createRook(material) {
    const group = new THREE.Group();
    let y = addBase(group, material, 0);
    y = addCylinder(group, material, { radiusTop: 0.03, radiusBottom: 0.032, height: 0.05, y });
    y = addCylinder(group, material, { radiusTop: 0.036, radiusBottom: 0.034, height: 0.012, y });

    // Crenellations around the rim
    for (let i = 0; i < 4; i++) {
        const angle = (i / 4) * Math.PI * 2;
        const geometry = new THREE.BoxGeometry(0.014, 0.014, 0.014);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(Math.cos(angle) * 0.026, y + 0.007, Math.sin(angle) * 0.026);
        group.add(mesh);
    }
    return group;
}

export function createKnight(material) {
    const group = new THREE.Group();
    let y = addBase(group, material, 0);
    y = addCylinder(group, material, { radiusTop: 0.024, radiusBottom: 0.032, height: 0.05, y });

    // Stylized angled "head"
    const geometry = new THREE.BoxGeometry(0.022, 0.06, 0.03);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = y + 0.025;
    mesh.rotation.z = -0.35;
    mesh.rotation.x = 0.15;
    group.add(mesh);
    return group;
}

export function createBishop(material) {
    const group = new THREE.Group();
    let y = addBase(group, material, 0);
    y = addCylinder(group, material, { radiusTop: 0.014, radiusBottom: 0.03, height: 0.06, y });
    y = addCone(group, material, { radius: 0.02, height: 0.03, y });
    addSphere(group, material, { radius: 0.012, y });
    return group;
}

export function createQueen(material) {
    const group = new THREE.Group();
    let y = addBase(group, material, 0);
    y = addCylinder(group, material, { radiusTop: 0.02, radiusBottom: 0.034, height: 0.07, y });
    const crownY = addSphere(group, material, { radius: 0.026, y: y - 0.012 });

    // Small crown spikes
    for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2;
        const geometry = new THREE.ConeGeometry(0.006, 0.018, 6);
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(Math.cos(angle) * 0.018, crownY - 0.018, Math.sin(angle) * 0.018);
        group.add(mesh);
    }
    return group;
}

export function createKing(material) {
    const group = new THREE.Group();
    let y = addBase(group, material, 0);
    y = addCylinder(group, material, { radiusTop: 0.022, radiusBottom: 0.036, height: 0.08, y });
    y = addSphere(group, material, { radius: 0.022, y: y - 0.01 });

    // Cross on top
    const upright = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.03, 0.008), material);
    upright.position.y = y + 0.015;
    group.add(upright);

    const crossbar = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.008, 0.008), material);
    crossbar.position.y = y + 0.02;
    group.add(crossbar);

    return group;
}

export const PIECE_BUILDERS = {
    p: createPawn,
    r: createRook,
    n: createKnight,
    b: createBishop,
    q: createQueen,
    k: createKing,
};
