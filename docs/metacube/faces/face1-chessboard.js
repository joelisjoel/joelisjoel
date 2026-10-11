// Face 1 (+x): an ornate baroque chessboard, with 3D pieces in starting position.
import * as THREE from 'three';
import { PIECE_BUILDERS } from './chess-pieces.js';

const BOARD_SIZE = 1024;
const FRAME = 64;
const SQUARE = (BOARD_SIZE - FRAME * 2) / 8;

const LIGHT_SQUARE = '#f0d9b5';
const DARK_SQUARE = '#8b5a2b';
const GILT = '#caa43c';
const GILT_SHADOW = '#5c4813';

// Row 0 = black's back rank, row 7 = white's back rank
const START_POSITION = [
    ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'],
    ['p', 'p', 'p', 'p', 'p', 'p', 'p', 'p'],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    [null, null, null, null, null, null, null, null],
    ['P', 'P', 'P', 'P', 'P', 'P', 'P', 'P'],
    ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'],
];

function drawGiltFrame(ctx) {
    ctx.fillStyle = GILT;
    ctx.fillRect(0, 0, BOARD_SIZE, BOARD_SIZE);

    ctx.strokeStyle = GILT_SHADOW;
    ctx.lineWidth = 6;
    ctx.strokeRect(FRAME - 10, FRAME - 10, BOARD_SIZE - (FRAME - 10) * 2, BOARD_SIZE - (FRAME - 10) * 2);

    // Corner medallions for a bit of baroque flourish
    const corners = [
        [FRAME / 2, FRAME / 2],
        [BOARD_SIZE - FRAME / 2, FRAME / 2],
        [FRAME / 2, BOARD_SIZE - FRAME / 2],
        [BOARD_SIZE - FRAME / 2, BOARD_SIZE - FRAME / 2],
    ];
    for (const [cx, cy] of corners) {
        ctx.beginPath();
        ctx.arc(cx, cy, FRAME * 0.32, 0, Math.PI * 2);
        ctx.fillStyle = GILT_SHADOW;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(cx, cy, FRAME * 0.2, 0, Math.PI * 2);
        ctx.fillStyle = GILT;
        ctx.fill();
    }
}

function drawSquares(ctx) {
    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            ctx.fillStyle = (row + col) % 2 === 0 ? LIGHT_SQUARE : DARK_SQUARE;
            ctx.fillRect(FRAME + col * SQUARE, FRAME + row * SQUARE, SQUARE, SQUARE);
        }
    }
}

export function createFace1Material() {
    const canvas = document.createElement('canvas');
    canvas.width = BOARD_SIZE;
    canvas.height = BOARD_SIZE;
    const ctx = canvas.getContext('2d');

    drawGiltFrame(ctx);
    drawSquares(ctx);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.needsUpdate = true;

    return new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.4,
        metalness: 0.3,
    });
}

const WHITE_PIECE_MATERIAL = new THREE.MeshStandardMaterial({ color: 0xf5f0e6, roughness: 0.35, metalness: 0.1 });
const BLACK_PIECE_MATERIAL = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.35, metalness: 0.2 });

// Convert a board square's pixel center on the canvas into +x-face local coordinates,
// matching BoxGeometry's own UV mapping for that face (u -> local z, v -> local y)
// so the 3D pieces line up exactly with the squares drawn in the texture.
function squareToLocalPosition(row, col) {
    const px = FRAME + col * SQUARE + SQUARE / 2;
    const py = FRAME + row * SQUARE + SQUARE / 2;
    return {
        y: 0.5 - py / BOARD_SIZE,
        z: 0.5 - px / BOARD_SIZE,
    };
}

// The Opera Game — Morphy vs. Duke of Brunswick & Count Isouard, Paris 1858.
// Each entry is one piece's move: [fromRow, fromCol] -> [toRow, toCol], with
// `capture: true` when it removes whatever sits on the destination square.
// Castling is split into its two piece moves (king, then rook).
const OPERA_GAME_ACTIONS = [
    { from: [6, 4], to: [4, 4] },                    // 1. e4
    { from: [1, 4], to: [3, 4] },                    // e5
    { from: [7, 6], to: [5, 5] },                    // 2. Nf3
    { from: [1, 3], to: [2, 3] },                    // d6
    { from: [6, 3], to: [4, 3] },                    // 3. d4
    { from: [0, 2], to: [4, 6] },                    // Bg4
    { from: [4, 3], to: [3, 4], capture: true },     // 4. dxe5
    { from: [4, 6], to: [5, 5], capture: true },     // Bxf3
    { from: [7, 3], to: [5, 5], capture: true },     // 5. Qxf3
    { from: [2, 3], to: [3, 4], capture: true },     // dxe5
    { from: [7, 5], to: [4, 2] },                    // 6. Bc4
    { from: [0, 6], to: [2, 5] },                    // Nf6
    { from: [5, 5], to: [5, 1] },                    // 7. Qb3
    { from: [0, 3], to: [1, 4] },                    // Qe7
    { from: [7, 1], to: [5, 2] },                    // 8. Nc3
    { from: [1, 2], to: [2, 2] },                    // c6
    { from: [7, 2], to: [3, 6] },                    // 9. Bg5
    { from: [1, 1], to: [3, 1] },                    // b5
    { from: [5, 2], to: [3, 1], capture: true },     // 10. Nxb5
    { from: [2, 2], to: [3, 1], capture: true },     // cxb5
    { from: [4, 2], to: [3, 1], capture: true },     // 11. Bxb5+
    { from: [0, 1], to: [1, 3] },                    // Nbd7
    { from: [7, 4], to: [7, 2] },                    // 12. O-O-O (king)
    { from: [7, 0], to: [7, 3] },                    // O-O-O (rook)
    { from: [0, 0], to: [0, 3] },                    // Rd8
    { from: [7, 3], to: [1, 3], capture: true },     // 13. Rxd7
    { from: [0, 3], to: [1, 3], capture: true },     // Rxd7
    { from: [7, 7], to: [7, 3] },                    // 14. Rd1
    { from: [1, 4], to: [2, 4] },                    // Qe6
    { from: [3, 1], to: [1, 3], capture: true },     // 15. Bxd7+
    { from: [2, 5], to: [1, 3], capture: true },     // Nxd7
    { from: [5, 1], to: [0, 1] },                    // 16. Qb8+
    { from: [1, 3], to: [0, 1], capture: true },     // Nxb8
    { from: [7, 3], to: [0, 3] },                    // 17. Rd8#
];

const MOVE_DURATION = 700; // ms to slide a piece between squares
const PAUSE_DURATION = 2800; // ms to hold after each move lands
const STEP_DURATION = MOVE_DURATION + PAUSE_DURATION;
const END_PAUSE = 6000; // ms to hold on the checkmate position before replaying
const LIFT_HEIGHT = 0.05; // how far a piece rises off the board mid-move

function easeInOutQuad(t) {
    return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export function createFace1Pieces() {
    const group = new THREE.Group();
    const boardState = [];
    const initialSquares = new Map(); // piece mesh -> starting {row, col}

    for (let row = 0; row < 8; row++) {
        boardState.push(new Array(8).fill(null));
    }

    for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const piece = START_POSITION[row][col];
            if (!piece) continue;

            const isWhitePiece = piece === piece.toUpperCase();
            const material = isWhitePiece ? WHITE_PIECE_MATERIAL : BLACK_PIECE_MATERIAL;
            const pieceGroup = PIECE_BUILDERS[piece.toLowerCase()](material);

            // Pieces are built pointing up local +Y; rotate so "up" points out of the +x face
            pieceGroup.rotation.z = -Math.PI / 2;

            const { y, z } = squareToLocalPosition(row, col);
            pieceGroup.position.set(0.5, y, z);
            group.add(pieceGroup);

            boardState[row][col] = pieceGroup;
            initialSquares.set(pieceGroup, { row, col });
        }
    }

    let actionIndex = 0;
    let actionStartTime = null;
    let capturedThisAction = null;
    let sequenceStartTime = null;

    function resetBoard() {
        for (let row = 0; row < 8; row++) {
            boardState[row].fill(null);
        }
        for (const [piece, { row, col }] of initialSquares) {
            const { y, z } = squareToLocalPosition(row, col);
            piece.position.set(0.5, y, z);
            piece.visible = true;
            boardState[row][col] = piece;
        }
        actionIndex = 0;
        actionStartTime = null;
        capturedThisAction = null;
    }

    function update() {
        const now = performance.now();
        if (sequenceStartTime === null) sequenceStartTime = now;
        if (actionStartTime === null) actionStartTime = now;

        if (actionIndex >= OPERA_GAME_ACTIONS.length) {
            if (now - actionStartTime > END_PAUSE) {
                resetBoard();
            }
            return;
        }

        const action = OPERA_GAME_ACTIONS[actionIndex];
        const piece = boardState[action.from[0]][action.from[1]];
        if (!piece) {
            // Defensive: shouldn't happen with a correct move list
            actionIndex += 1;
            actionStartTime = now;
            return;
        }

        const t = now - actionStartTime;
        const fromPos = squareToLocalPosition(action.from[0], action.from[1]);
        const toPos = squareToLocalPosition(action.to[0], action.to[1]);

        if (t < MOVE_DURATION) {
            const progress = t / MOVE_DURATION;
            const eased = easeInOutQuad(progress);
            const lift = Math.sin(progress * Math.PI) * LIFT_HEIGHT;

            piece.position.y = fromPos.y + (toPos.y - fromPos.y) * eased;
            piece.position.z = fromPos.z + (toPos.z - fromPos.z) * eased;
            piece.position.x = 0.5 + lift;

            if (action.capture && capturedThisAction === null) {
                const captured = boardState[action.to[0]][action.to[1]];
                if (captured) {
                    captured.visible = false;
                    capturedThisAction = captured;
                }
            }
        } else if (t < STEP_DURATION) {
            piece.position.set(0.5, toPos.y, toPos.z);
        } else {
            piece.position.set(0.5, toPos.y, toPos.z);
            boardState[action.from[0]][action.from[1]] = null;
            boardState[action.to[0]][action.to[1]] = piece;
            actionIndex += 1;
            actionStartTime = now;
            capturedThisAction = null;
        }
    }

    return { group, update };
}
