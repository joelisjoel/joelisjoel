// Face 2 (-x): the Mandelbrot set as a height relief. Points that never escape
// (the set's true/interior members) are extruded above the flat base; everything
// else stays flush with the cube face, colored by escape speed.
//
// The relief breathes: rather than a uniform scale, each interior point's rise is
// timed by its own final |z| after the escape-time iteration completes. Points near
// the center of the main cardioid settle into small, tightly bounded orbits (low
// final |z|) and rise first; points near the fractal's boundary have larger, more
// dramatic bounded orbits (higher final |z|) and rise last. That ordering traces
// the shape from its stable core out to its frilly edge — the same order in which
// escape-time iteration itself resolves the boundary with increasing confidence.
import * as THREE from 'three';

const GRID_QUADS = 220; // quads per side; (GRID_QUADS + 1)^2 vertices
const MAX_ITERATIONS = 100;
const REAL_MIN = -2.2;
const REAL_MAX = 0.8;
const IMAG_MIN = -1.5;
const IMAG_MAX = 1.5;

const IN_SET_ALTITUDE = 0.2; // 20% of the cube's edge length
const SURFACE_EPSILON = 0.002; // keeps the whole relief just outside the box's own face
const FLAT_X = -0.5 - SURFACE_EPSILON;
const RISEN_X = FLAT_X - IN_SET_ALTITUDE;

const LOOP_DURATION_MS = 20000; // one full rise-and-fall breath every 20s
const RISE_WINDOW = 0.35; // fraction of the rise-half of the loop each point's own transition takes

const IN_SET_COLOR = new THREE.Color(0x0a0a16);

function mandelbrotSample(cRe, cIm) {
    let zRe = 0;
    let zIm = 0;
    for (let i = 0; i < MAX_ITERATIONS; i++) {
        const zRe2 = zRe * zRe;
        const zIm2 = zIm * zIm;
        if (zRe2 + zIm2 > 4) {
            return { iterations: i, inSet: false, finalMagnitude: 0 };
        }
        zIm = 2 * zRe * zIm + cIm;
        zRe = zRe2 - zIm2 + cRe;
    }
    return { iterations: MAX_ITERATIONS, inSet: true, finalMagnitude: Math.sqrt(zRe * zRe + zIm * zIm) };
}

function escapeColor(iterations) {
    const t = iterations / MAX_ITERATIONS;
    const hue = (220 - t * 220) / 360;
    const lightness = 0.32 + t * 0.25;
    return new THREE.Color().setHSL(hue, 0.8, lightness);
}

function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export function createFace2Mesh() {
    const verticesPerSide = GRID_QUADS + 1;
    const positions = new Float32Array(verticesPerSide * verticesPerSide * 3);
    const colors = new Float32Array(verticesPerSide * verticesPerSide * 3);

    // Interior (in-set) vertices animate with the reveal ordering; escaped
    // vertices animate too, their foothill heights scaling with the same
    // breathing wave so the colored fringe rises and falls with the black set
    const interiorVertexIndices = [];
    const interiorFinalMagnitudes = [];
    const escapedVertexIndices = [];
    const escapedFoothillHeights = [];

    let p = 0;
    let c = 0;
    let vertexIndex = 0;
    for (let j = 0; j <= GRID_QUADS; j++) {
        const t = j / GRID_QUADS;
        const cIm = IMAG_MIN + t * (IMAG_MAX - IMAG_MIN);
        const yCube = 0.5 - t;

        for (let i = 0; i <= GRID_QUADS; i++) {
            const s = i / GRID_QUADS;
            const cRe = REAL_MIN + s * (REAL_MAX - REAL_MIN);
            const zCube = s - 0.5;

            const sample = mandelbrotSample(cRe, cIm);

            // Escaped points get a log-scaled altitude target from their escape
            // time: log compresses the huge dynamic range of iteration counts,
            // turning the near-boundary region into foothills that climb toward
            // the set. Their heights are animated by the breathing wave in
            // update(), so the whole terrain — fringe and set alike — rises
            // and falls together.
            positions[p++] = FLAT_X;
            positions[p++] = yCube;
            positions[p++] = zCube;

            if (!sample.inSet) {
                const foothill = Math.log(1 + sample.iterations) / Math.log(1 + MAX_ITERATIONS);
                escapedVertexIndices.push(vertexIndex);
                escapedFoothillHeights.push(IN_SET_ALTITUDE * 0.8 * foothill);
            }

            const color = sample.inSet ? IN_SET_COLOR : escapeColor(sample.iterations);
            colors[c++] = color.r;
            colors[c++] = color.g;
            colors[c++] = color.b;

            if (sample.inSet) {
                interiorVertexIndices.push(vertexIndex);
                interiorFinalMagnitudes.push(sample.finalMagnitude);
            }
            vertexIndex += 1;
        }
    }

    // Normalize final magnitudes across the interior into a 0..1 reveal order
    // (loops, not spread — the interior array is far too large for spread args)
    let minMagnitude = Infinity;
    for (const magnitude of interiorFinalMagnitudes) {
        if (magnitude < minMagnitude) minMagnitude = magnitude;
    }
    let maxMagnitude = -Infinity;
    for (const magnitude of interiorFinalMagnitudes) {
        if (magnitude > maxMagnitude) maxMagnitude = magnitude;
    }
    const magnitudeRange = Math.max(maxMagnitude - minMagnitude, 1e-6);
    const revealOrder = new Float32Array(interiorFinalMagnitudes.length);
    for (let k = 0; k < interiorFinalMagnitudes.length; k++) {
        revealOrder[k] = (interiorFinalMagnitudes[k] - minMagnitude) / magnitudeRange;
    }

    const indices = [];
    for (let j = 0; j < GRID_QUADS; j++) {
        for (let i = 0; i < GRID_QUADS; i++) {
            const v00 = j * verticesPerSide + i;
            const v01 = (j + 1) * verticesPerSide + i;
            const v10 = j * verticesPerSide + (i + 1);
            const v11 = (j + 1) * verticesPerSide + (i + 1);

            // Wound so the computed face normal points outward along -X
            indices.push(v00, v01, v10);
            indices.push(v10, v01, v11);
        }
    }

    const geometry = new THREE.BufferGeometry();
    const positionAttribute = new THREE.BufferAttribute(positions, 3);
    positionAttribute.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('position', positionAttribute);
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.45,
        metalness: 0.15,
        // Backfaces render too: seen from under the risen terrain the sheet
        // stays solid instead of vanishing into a see-through hole
        side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geometry, material);

    // Black border skirt: four thin slabs framing the relief's perimeter,
    // spanning from the face plane out to the terrain's maximum rise. When
    // the terrain lifts, the gap between its edge and the face would
    // otherwise show straight through the cube; the skirt swallows that
    // sightline in darkness.
    const relief = new THREE.Group();
    relief.add(mesh);
    const skirtMaterial = new THREE.MeshStandardMaterial({ color: 0x05060c, roughness: 0.9, metalness: 0.05 });
    const skirtDepth = IN_SET_ALTITUDE + 0.006; // covers interior rise and fringe
    const skirtMidX = FLAT_X - skirtDepth / 2 + 0.002;
    for (const spec of [
        { size: [skirtDepth, 0.004, 1], position: [skirtMidX, 0.499, 0] },
        { size: [skirtDepth, 0.004, 1], position: [skirtMidX, -0.499, 0] },
        { size: [skirtDepth, 1, 0.004], position: [skirtMidX, 0, 0.499] },
        { size: [skirtDepth, 1, 0.004], position: [skirtMidX, 0, -0.499] },
    ]) {
        const slab = new THREE.Mesh(new THREE.BoxGeometry(...spec.size), skirtMaterial);
        slab.position.set(...spec.position);
        relief.add(slab);
    }

    let startTime = null;

    function update() {
        const now = performance.now();
        if (startTime === null) startTime = now;

        const loopProgress = ((now - startTime) % LOOP_DURATION_MS) / LOOP_DURATION_MS;
        const wave = 1 - Math.abs(1 - 2 * loopProgress); // 0 -> 1 -> 0 triangle, seamless at the wrap

        for (let k = 0; k < interiorVertexIndices.length; k++) {
            const localStart = revealOrder[k] * (1 - RISE_WINDOW);
            const localProgress = Math.min(Math.max((wave - localStart) / RISE_WINDOW, 0), 1);
            const eased = easeInOutQuad(localProgress);

            positions[interiorVertexIndices[k] * 3] = FLAT_X + (RISEN_X - FLAT_X) * eased;
        }

        // The colored fringe scales with the same wave, so the foothills grow
        // and recede together with the black set instead of sitting frozen
        for (let k = 0; k < escapedVertexIndices.length; k++) {
            positions[escapedVertexIndices[k] * 3] = FLAT_X - escapedFoothillHeights[k] * wave;
        }

        positionAttribute.needsUpdate = true;
        geometry.computeVertexNormals();
    }

    return { group: relief, update };
}
