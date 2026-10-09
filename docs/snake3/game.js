// --- Game Constants & State ---
const GRID_SIZE = 20;
const BOARD_SIZE = 600; // Logical size for 2D grid mapping
const TILE_COUNT = 30;  // 600 / 20
const TILE_SIZE = 1;    // 3D world unit size for a tile

// Map 2D grid coordinates (0..29) to 3D world coordinates
// Center of board is (0,0,0). Top-Left is (-15, 0, -15) roughly.
// Let's center the board at 0,0. Range: -15 to +15.
function gridToWorld(x, y) {
    return {
        x: (x - TILE_COUNT / 2) * TILE_SIZE + TILE_SIZE / 2,
        z: (y - TILE_COUNT / 2) * TILE_SIZE + TILE_SIZE / 2
    };
}

let score = 0;
let highScore = localStorage.getItem('snakeHighScore') || 0;
document.getElementById('highScore').textContent = highScore;

let snake = []; // Array of {x, y} objects (grid coords)
let snakeMeshes = []; // Array of THREE.Mesh
let food = { x: 15, y: 15 };
let foodMesh;

let dx = 0;
let dy = 0;
let nextDx = 0; // Start stationary
let nextDy = 0;

let isGameOver = false;
let isPaused = false;
let gameSpeed = 100;
let lastTime = 0;
let accumulator = 0;
let hasStarted = false;

// --- Three.js Setup ---
const canvas = document.getElementById('gameCanvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(800, 800);
renderer.setScissorTest(true);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d0d0d);

// 1. Top View Camera (Upper Right in Spec -> Top Left in Grid? Spec says Upper Right twice. Let's stick to Plan: TL=Top)
// Top Left: Top Down View
const topCamera = new THREE.OrthographicCamera(-20, 20, 20, -20, 1, 1000);
topCamera.position.set(0, 40, 0);
topCamera.up.set(0, 0, -1); // Align -Z (Up direction) with Screen Top
topCamera.lookAt(0, 0, 0);

// 2. FPV Camera (Lower Left)
const fpvCamera = new THREE.PerspectiveCamera(60, 400 / 400, 0.1, 1000);
fpvCamera.layers.enable(1); // Enable Layer 1 (Skybox)

// 3. Side View W-E (Upper Right) - Looking South to North? Spec says "looking south to north"
// "Upper Right Viewport - West to East Perspective... looking south to north" -> This is confusing.
// Let's assume "Side View" looking at the arena from the side.
// "West to East Perspective" -> Camera at West (-X) looking East (+X)?
// "looking south to north" -> Camera at South (+Z) looking North (-Z)?
// 3. Side View W-E (Upper Right)
// "West View... looking west" -> Camera at East (+X) looking West (-X)?
// Spec says "looking west". My previous implementation was "looking +X" (West to East).
// If looking West, camera should be at +X looking -X.
// Constraint: "y position... same in both upper viewports".
// UL Y-axis is North-South (Z).
// If UR looks West (-X). Up is -Z (North).
// Then Screen Y is -Z. This matches.
// Floor alignment: "aligned to the left edge".
// Floor is Y=0. Left edge is Screen X = -20.
// Camera sees X from -20 to 20.
// If Up is -Z. Look is -X. Right is Cross(-X, -Z) = -Y.
// Wait. Cross(-X, -Z) -> X cross Z is -Y. So -X cross -Z is -Y.
// So Right is -Y (Down). Left is +Y (Up).
// Screen X is Height (Y).
// If Left Edge is Screen X = -20. And Left is +Y.
// Then +Y = -20? No.
// Let's stick to my previous orientation which was working for "West View" (Side View).
// Previous: Pos (-40, 15, 0) looking (0, 15, 0). Up (0, 0, -1).
// Look +X. Up -Z. Right +Y.
// Screen X is +Y (Height).
// Screen Y is -Z (North).
// Floor is Y=0.
// In Screen X (Height), Y=0 is at X=0 (Center).
// We want Floor (Y=0) at Left Edge (Screen X = -20).
// So we need to shift camera so that Y=0 maps to Screen X = -20.
// Current: Y=15 maps to Screen X=0.
// Y=0 maps to Screen X = -15.
// We want Y=0 to map to Screen X = -20.
// So we need to shift camera by 5 units.
// New Center Y should be 20.
// Y=20 maps to Screen X=0.
// Y=0 maps to Screen X = -20. Correct.

const sideWECamera = new THREE.OrthographicCamera(-20, 20, 20, -20, 1, 1000);
sideWECamera.position.set(40, 20, 0); // Shifted to East (+40) to look West
sideWECamera.up.set(0, 0, -1);
sideWECamera.lookAt(0, 20, 0);

// 4. Side View N-S (Lower Left)
// "North View... looking north".
// Previous: Pos (0, 15, 40) looking (0, 15, 0). Up (0, 1, 0).
// Look -Z (North). Up +Y. Right +X (East).
// Screen X is +X (East). Matches UL.
// Screen Y is +Y (Height).
// Floor is Y=0.
// In Screen Y (Height), Y=0 is at Y=-15 (relative to center 15).
// We want Floor (Y=0) at Bottom Edge (Screen Y = -20).
// So we need to shift camera so that Y=0 maps to Screen Y = -20.
// Current: Y=15 maps to Screen Y=0.
// Y=0 maps to Screen Y = -15.
// We want Y=0 to map to Screen Y = -20.
// So we need to shift camera by 5 units.
// New Center Y should be 20.
// Y=20 maps to Screen Y=0.
// Y=0 maps to Screen Y = -20. Correct.

const sideNSCamera = new THREE.OrthographicCamera(-20, 20, 20, -20, 1, 1000);
sideNSCamera.position.set(0, 20, 40); // Shifted to Y=20
sideNSCamera.up.set(0, 1, 0);
sideNSCamera.lookAt(0, 20, 0);

// Lights
const ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
scene.add(ambientLight);

const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(10, 20, 10);
scene.add(dirLight);

// Materials
const snakeHeadMat = new THREE.MeshPhongMaterial({
    color: 0x00ffff,
    emissive: 0x00ffff,
    emissiveIntensity: 0.5,
    transparent: true,
    opacity: 0.9
});
const snakeBodyMat = new THREE.MeshPhongMaterial({
    color: 0x00cccc,
    emissive: 0x00cccc,
    emissiveIntensity: 0.2,
    transparent: true,
    opacity: 0.6
});
const foodMat = new THREE.MeshPhongMaterial({
    color: 0xff00ff,
    emissive: 0xff00ff,
    emissiveIntensity: 0.8,
    transparent: true,
    opacity: 0.9
});
const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const pupilMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
const mouthMat = new THREE.MeshBasicMaterial({ color: 0x000000 });

// Geometry
const cubeGeo = new THREE.BoxGeometry(TILE_SIZE * 0.9, TILE_SIZE * 0.9, TILE_SIZE * 0.9);
const foodGeo = new THREE.SphereGeometry(TILE_SIZE * 0.4, 16, 16);

// --- Audio System (Preserved) ---
const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContext();

function playSound(type) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    if (type === 'eat') {
        osc.type = 'square';
        osc.frequency.setValueAtTime(440, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.1);
        gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
    } else if (type === 'die') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.5);
        gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.5);
    }
}

// Music System
let isMusicPlaying = false;
let nextNoteTime = 0;
let noteIndex = 0;
let timerID = null;
const tempo = 110;
const notes = [55.00, 55.00, 65.41, 73.42, 55.00, 55.00, 82.41, 73.42];

function nextNote() {
    const secondsPerBeat = 60.0 / tempo;
    nextNoteTime += 0.25 * secondsPerBeat;
    noteIndex = (noteIndex + 1) % notes.length;
}

function scheduleNote(beatNumber, time) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    const filter = audioCtx.createBiquadFilter();
    osc.type = 'sawtooth';
    osc.frequency.value = notes[beatNumber];
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    filter.Q.value = 2;
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.1, time + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start(time);
    osc.stop(time + 0.25);
}

function scheduler() {
    while (nextNoteTime < audioCtx.currentTime + 0.1) {
        scheduleNote(noteIndex, nextNoteTime);
        nextNote();
    }
    timerID = window.setTimeout(scheduler, 25.0);
}

function startMusic() {
    if (isMusicPlaying) return;
    if (audioCtx.state === 'suspended') audioCtx.resume();
    isMusicPlaying = true;
    noteIndex = 0;
    nextNoteTime = audioCtx.currentTime;
    scheduler();
}

function stopMusic() {
    isMusicPlaying = false;
    window.clearTimeout(timerID);
}

// --- Game Logic ---

let trailMeshes = []; // Array of { mesh, opacity }

function createGridTexture(bgColor, gridColor) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, 512, 512);

    // Grid
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 4; // Thicker for visibility
    const step = 64; // 512 / 64 = 8 lines? 30 units... 
    // We want gridlines to match units roughly. 
    // Texture repeats 1x1 over 32x32 area. 
    // 512px / 32 units = 16px per unit.
    // Let's draw lines every 16px.

    ctx.beginPath();
    for (let i = 0; i <= 512; i += 16) {
        ctx.moveTo(i, 0);
        ctx.lineTo(i, 512);
        ctx.moveTo(0, i);
        ctx.lineTo(512, i);
    }
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
}

function createWalls() {
    const wallGroup = new THREE.Group();
    const texture = createGridTexture('rgba(0, 50, 0, 0.3)', '#00ff00'); // Translucent Green bg, Green grid

    const wallMat = new THREE.MeshPhongMaterial({
        map: texture,
        color: 0x00ff00,
        emissive: 0x004400,
        emissiveIntensity: 0.2,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide
    });

    // Arena is 30x30 units. Height = 2.
    // Top Wall (z = -15.5)
    const topWall = new THREE.Mesh(new THREE.BoxGeometry(32, 2, 1), wallMat);
    topWall.position.set(0, 1, -15.5);

    // Bottom Wall (z = 15.5)
    const bottomWall = new THREE.Mesh(new THREE.BoxGeometry(32, 2, 1), wallMat);
    bottomWall.position.set(0, 1, 15.5);

    // Left Wall (x = -15.5)
    const leftWall = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 30), wallMat);
    leftWall.position.set(-15.5, 1, 0);

    // Right Wall (x = 15.5)
    const rightWall = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 30), wallMat);
    rightWall.position.set(15.5, 1, 0);

    wallGroup.add(topWall, bottomWall, leftWall, rightWall);
    return wallGroup;
}

function createFloor() {
    const texture = createGridTexture('#000033', '#000066'); // Dark Blue bg, Lighter Blue grid

    const floorGeo = new THREE.PlaneGeometry(32, 32);
    const floorMat = new THREE.MeshPhongMaterial({
        map: texture,
        color: 0x8888ff,
        emissive: 0x000033,
        emissiveIntensity: 0.5
    });

    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.5;
    return floor;
}

function createCeiling() {
    // Generate star texture
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Black background
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 512, 512);

    // Stars
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 500; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const size = Math.random() * 1.5;
        ctx.globalAlpha = Math.random();
        ctx.fillRect(x, y, size, size);
    }

    const texture = new THREE.CanvasTexture(canvas);
    const ceilingGeo = new THREE.PlaneGeometry(32, 32);
    const ceilingMat = new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide
    });

    const ceiling = new THREE.Mesh(ceilingGeo, ceilingMat);
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.y = 30; // Ceiling height
    ceiling.layers.set(1); // Only visible to cameras with Layer 1 enabled
    return ceiling;
}

function createSnakeHead() {
    const group = new THREE.Group();
    const headMesh = new THREE.Mesh(cubeGeo, snakeHeadMat);
    group.add(headMesh);

    // Eyes
    const eyeGeo = new THREE.BoxGeometry(0.2, 0.2, 0.1);
    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-0.2, 0.2, -0.4); // Front face is -z
    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(0.2, 0.2, -0.4);

    const pupilGeo = new THREE.BoxGeometry(0.1, 0.1, 0.11);
    const leftPupil = new THREE.Mesh(pupilGeo, pupilMat);
    leftPupil.position.set(-0.2, 0.2, -0.41);
    const rightPupil = new THREE.Mesh(pupilGeo, pupilMat);
    rightPupil.position.set(0.2, 0.2, -0.41);

    // Mouth
    const mouthGeo = new THREE.BoxGeometry(0.6, 0.1, 0.1);
    const mouth = new THREE.Mesh(mouthGeo, mouthMat);
    mouth.position.set(0, -0.2, -0.4);

    group.add(leftEye, rightEye, leftPupil, rightPupil, mouth);
    return group;
}

function initGame() {
    // Cleanup old meshes
    snakeMeshes.forEach(m => scene.remove(m));
    trailMeshes.forEach(t => {
        scene.remove(t.mesh);
        t.mesh.material.dispose();
    });
    trailMeshes = [];

    if (foodMesh) scene.remove(foodMesh);

    // Clear Scene (except lights/cameras if we kept them, but simpler to just clear meshes)
    // Actually, let's just add them if they don't exist, or clear everything.
    // For simplicity, let's remove specific groups if they exist.
    const oldWalls = scene.getObjectByName('walls');
    if (oldWalls) scene.remove(oldWalls);
    const oldFloor = scene.getObjectByName('floor');
    if (oldFloor) scene.remove(oldFloor);

    const oldCeiling = scene.getObjectByName('ceiling');
    if (oldCeiling) scene.remove(oldCeiling);

    const walls = createWalls();
    walls.name = 'walls';
    scene.add(walls);

    const floor = createFloor();
    floor.name = 'floor';
    scene.add(floor);

    const ceiling = createCeiling();
    ceiling.name = 'ceiling';
    scene.add(ceiling);

    snake = [
        { x: 10, y: 10 },
        { x: 10, y: 11 }, // Tail behind
        { x: 10, y: 12 }
    ];
    snakeMeshes = [];

    // Create Snake Meshes
    for (let i = 0; i < snake.length; i++) {
        let mesh;
        if (i === 0) {
            mesh = createSnakeHead();
        } else {
            mesh = new THREE.Mesh(cubeGeo, snakeBodyMat);
        }
        const pos = gridToWorld(snake[i].x, snake[i].y);
        mesh.position.set(pos.x, 0, pos.z);
        scene.add(mesh);
        snakeMeshes.push(mesh);
    }

    dx = 0; dy = -1; // Moving Up (Negative Z)
    nextDx = 0; nextDy = -1;

    score = 0;
    document.getElementById('score').textContent = score;
    gameSpeed = 100;
    isGameOver = false;
    isPaused = false;
    hasStarted = false;
    document.getElementById('game-over').style.display = 'none';

    generateFood();

    // Reset Camera
    updateCamera();
}

function generateFood() {
    if (foodMesh) scene.remove(foodMesh);

    let valid = false;
    while (!valid) {
        food = {
            x: Math.floor(Math.random() * TILE_COUNT),
            y: Math.floor(Math.random() * TILE_COUNT)
        };
        valid = true;
        for (let s of snake) {
            if (s.x === food.x && s.y === food.y) {
                valid = false;
                break;
            }
        }
    }

    foodMesh = new THREE.Mesh(foodGeo, foodMat);
    const pos = gridToWorld(food.x, food.y);
    foodMesh.position.set(pos.x, 0, pos.z);
    scene.add(foodMesh);
}

function update() {
    if (!hasStarted) return;

    dx = nextDx;
    dy = nextDy;

    const head = { x: snake[0].x + dx, y: snake[0].y + dy };

    // Wall Collision
    if (head.x < 0 || head.x >= TILE_COUNT || head.y < 0 || head.y >= TILE_COUNT) {
        gameOver();
        return;
    }

    // Self Collision
    for (let i = 0; i < snake.length; i++) {
        if (head.x === snake[i].x && head.y === snake[i].y) {
            gameOver();
            return;
        }
    }

    snake.unshift(head);

    // Eat Food
    if (head.x === food.x && head.y === food.y) {
        score += 10;
        document.getElementById('score').textContent = score;
        if (score > highScore) {
            highScore = score;
            localStorage.setItem('snakeHighScore', highScore);
            document.getElementById('highScore').textContent = highScore;
        }
        playSound('eat');
        generateFood();
        if (gameSpeed > 50) gameSpeed -= 1;

        // Add new body mesh
        const mesh = new THREE.Mesh(cubeGeo, snakeBodyMat);
        scene.add(mesh);
        snakeMeshes.push(mesh); // Add to end (tail) later, but logic needs sync
        // Actually, we just added a logical segment. 
        // We need to sync meshes in updateMeshes()
    } else {
        // Spawn trail at the position the tail is leaving
        const tail = snake[snake.length - 1];
        spawnTrail(tail.x, tail.y);
        snake.pop();
    }

    updateMeshes();
    updateTrail();
    updateCamera();
}

function spawnTrail(x, y) {
    const mesh = new THREE.Mesh(cubeGeo, snakeBodyMat.clone()); // Clone to allow independent opacity
    const pos = gridToWorld(x, y);
    mesh.position.set(pos.x, 0, pos.z);
    mesh.material.opacity = 0.4; // Start lower than body
    mesh.material.transparent = true;
    scene.add(mesh);
    trailMeshes.push({ mesh: mesh, opacity: 0.4 });
}

function updateTrail() {
    for (let i = trailMeshes.length - 1; i >= 0; i--) {
        const t = trailMeshes[i];
        t.opacity -= 0.02; // Fade out speed
        t.mesh.material.opacity = t.opacity;

        // Scale down slightly for effect
        t.mesh.scale.multiplyScalar(0.95);

        if (t.opacity <= 0) {
            scene.remove(t.mesh);
            t.mesh.material.dispose(); // Cleanup
            trailMeshes.splice(i, 1);
        }
    }
}

function updateMeshes() {
    // Sync meshes with snake array
    // If snake grew, we need more meshes
    while (snakeMeshes.length < snake.length) {
        const mesh = new THREE.Mesh(cubeGeo, snakeBodyMat);
        scene.add(mesh);
        snakeMeshes.push(mesh);
    }
    // If snake shrank (shouldn't happen), remove
    while (snakeMeshes.length > snake.length) {
        const m = snakeMeshes.pop();
        scene.remove(m);
    }

    for (let i = 0; i < snake.length; i++) {
        const pos = gridToWorld(snake[i].x, snake[i].y);
        snakeMeshes[i].position.set(pos.x, 0, pos.z);

        // Rotate head to face direction
        if (i === 0) {
            if (dx === 1) snakeMeshes[i].rotation.y = -Math.PI / 2;
            else if (dx === -1) snakeMeshes[i].rotation.y = Math.PI / 2;
            else if (dy === 1) snakeMeshes[i].rotation.y = 0; // Down (+Z)
            else if (dy === -1) snakeMeshes[i].rotation.y = Math.PI; // Up (-Z)
        }
    }
}

function updateCamera() {
    if (snakeMeshes.length === 0) return;

    const headPos = snakeMeshes[0].position;

    // Position FPV camera behind head
    // "about two segments behind" -> 2 units
    // We need to know direction.
    let camX = headPos.x;
    let camZ = headPos.z;
    let lookX = headPos.x;
    let lookZ = headPos.z;

    if (dx === 0 && dy === -1) { // Up
        camZ += 2.5;
        lookZ -= 5;
    } else if (dx === 0 && dy === 1) { // Down
        camZ -= 2.5;
        lookZ += 5;
    } else if (dx === -1 && dy === 0) { // Left
        camX += 2.5;
        lookX -= 5;
    } else if (dx === 1 && dy === 0) { // Right
        camX -= 2.5;
        lookX += 5;
    } else {
        // Default start (facing up/away)
        camZ += 2.5;
        lookZ -= 5;
    }

    // Smooth lerp could be nice, but hard snap is fine for snake
    fpvCamera.position.set(camX, 1.5, camZ);
    fpvCamera.lookAt(lookX, 0, lookZ);
}

function gameOver() {
    isGameOver = true;
    stopMusic();
    playSound('die');
    document.getElementById('final-score').textContent = score;
    document.getElementById('game-over').style.display = 'block';
}

function resetGame() {
    startMusic();
    initGame();
    hasStarted = true;
}

function gameLoop(currentTime) {
    requestAnimationFrame(gameLoop);

    const deltaTime = currentTime - lastTime;
    lastTime = currentTime;

    if (!isPaused && !isGameOver && hasStarted) {
        accumulator += deltaTime;
        if (accumulator > gameSpeed) {
            update();
            accumulator = 0;
        }
    }

    render();
}

function render() {
    // 800x800 Canvas. 400x400 Viewports.

    // 1. Top Left: Top View (Map) (Was Side W-E)
    // x=0, y=400
    renderer.setScissor(0, 400, 400, 400);
    renderer.setViewport(0, 400, 400, 400);
    renderer.render(scene, topCamera);

    // 2. Top Right: Side View W-E (Was Top)
    // x=400, y=400
    renderer.setScissor(400, 400, 400, 400);
    renderer.setViewport(400, 400, 400, 400);
    renderer.render(scene, sideWECamera);

    // 3. Bottom Left: Side View N-S (Was BR)
    // x=0, y=0
    renderer.setScissor(0, 0, 400, 400);
    renderer.setViewport(0, 0, 400, 400);
    renderer.render(scene, sideNSCamera);

    // 4. Bottom Right: FPV (Was BL)
    // x=400, y=0
    renderer.setScissor(400, 0, 400, 400);
    renderer.setViewport(400, 0, 400, 400);
    renderer.render(scene, fpvCamera);
}

// Input Handling
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        if (isGameOver) {
            resetGame();
        } else {
            isPaused = !isPaused;
            if (!isPaused) startMusic();
            else stopMusic();
        }
        e.preventDefault();
        return;
    }

    if (!hasStarted && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        hasStarted = true;
        startMusic();
    }

    const goingUp = dy === -1;
    const goingDown = dy === 1;
    const goingRight = dx === 1;
    const goingLeft = dx === -1;

    switch (e.key) {
        case 'ArrowLeft':
            if (!goingRight) { nextDx = -1; nextDy = 0; }
            break;
        case 'ArrowRight':
            if (!goingLeft) { nextDx = 1; nextDy = 0; }
            break;
        case 'ArrowUp':
            if (!goingDown) { nextDx = 0; nextDy = -1; }
            break;
        case 'ArrowDown':
            if (!goingUp) { nextDx = 0; nextDy = 1; }
            break;
    }
});

window.addEventListener('click', () => {
    if (!hasStarted && !isGameOver) {
        hasStarted = true;
        startMusic();
    }
});

// Initialize
initGame();
requestAnimationFrame(gameLoop);
