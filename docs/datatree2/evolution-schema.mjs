// evolution-schema: the machine-checkable contract for dataTreeStateEvolution
// objects. Dependency-free and environment-agnostic on purpose — the browser
// renderer (DatatreeVis), the Node ingester, and the CI validator all import
// this same module, so producers and consumers cannot drift apart silently.
//
// Version history:
//   1 — initial versioned schema: meta { schemaVersion, duration, loop,
//       tourStops }, graph.nodes (root/branch/twig/bloom, parent links, pos,
//       optional via/weight, bloom vitality), flies, actions
//       (steer/orbit/beam).

export const SCHEMA_VERSION = 1;

// The renderer's camera constants (orbit radius 3.5, tour rings, fog) assume
// node positions inside this envelope. Producers (the ingester, hand
// authoring) should normalize INTO the target; positions past the hard limit
// sit outside the camera choreography and are rejected.
export const CAMERA_ENVELOPE = {
    targetRadius: 2.45, // xz distance producers should normalize to
    targetHeight: 2.35, // y producers should normalize to
    hardRadius: 3.2,    // beyond this the orbiting camera collides with nodes
    hardHeight: 2.8,
};

// DatatreeVis anchors the trunk on the node with this exact id.
export const ROOT_ID = 'root';

export const NODE_KINDS = ['root', 'branch', 'twig', 'bloom'];
export const FLY_ROLES = ['roamer', 'nurse'];
export const ACTION_TYPES = ['steer', 'orbit', 'beam'];
export const ORBIT_RADII = ['tight', 'wide'];

const isFiniteNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const isVec3 = (v) => Array.isArray(v) && v.length === 3 && v.every(isFiniteNumber);

// Validate an evolution object. Returns { errors, warnings } — arrays of
// human-readable strings. Errors are contract violations the renderer cannot
// survive; warnings flag positions outside the normalization target (still
// rendered, but the camera tour may frame them poorly).
export function validateEvolution(evolution) {
    const errors = [];
    const warnings = [];
    const err = (msg) => errors.push(msg);

    if (!evolution || typeof evolution !== 'object') {
        return { errors: ['evolution is not an object'], warnings };
    }

    // --- meta ---
    const meta = evolution.meta;
    if (!meta || typeof meta !== 'object') {
        err('meta is missing');
    } else {
        if (meta.schemaVersion !== SCHEMA_VERSION) {
            err(`meta.schemaVersion is ${JSON.stringify(meta.schemaVersion)}; this validator understands ${SCHEMA_VERSION}`);
        }
        if (!isFiniteNumber(meta.duration) || meta.duration <= 0) {
            err(`meta.duration must be a positive number, got ${JSON.stringify(meta.duration)}`);
        }
        if (meta.loop !== 'pingpong') {
            err(`meta.loop must be 'pingpong', got ${JSON.stringify(meta.loop)}`);
        }
        if (!Array.isArray(meta.tourStops) || meta.tourStops.length === 0) {
            err('meta.tourStops must be a non-empty array of node ids');
        }
    }

    // --- graph.nodes ---
    const nodes = evolution.graph?.nodes;
    const byId = new Map();
    if (!Array.isArray(nodes) || nodes.length === 0) {
        err('graph.nodes must be a non-empty array');
    } else {
        for (const node of nodes) {
            const label = `node ${JSON.stringify(node?.id)}`;
            if (typeof node?.id !== 'string' || node.id === '') {
                err(`node with missing/empty id: ${JSON.stringify(node)}`);
                continue;
            }
            if (byId.has(node.id)) err(`duplicate node id ${JSON.stringify(node.id)}`);
            byId.set(node.id, node);
            if (!NODE_KINDS.includes(node.kind)) {
                err(`${label}: kind must be one of ${NODE_KINDS.join('/')}, got ${JSON.stringify(node.kind)}`);
            }
            if (!isVec3(node.pos)) err(`${label}: pos must be [x, y, z] finite numbers`);
            if (node.via !== undefined
                && (!Array.isArray(node.via) || !node.via.every(isVec3))) {
                err(`${label}: via must be an array of [x, y, z] points`);
            }
            if (node.weight !== undefined && (!isFiniteNumber(node.weight) || node.weight <= 0)) {
                err(`${label}: weight must be a positive number`);
            }
            if (node.kind === 'bloom') {
                if (typeof node.label !== 'string' || node.label === '') err(`${label}: blooms need a label`);
                if (!isFiniteNumber(node.hp0) || node.hp0 < 0 || node.hp0 > 100) {
                    err(`${label}: blooms need hp0 in [0, 100]`);
                }
                if (!isFiniteNumber(node.decayRate) || node.decayRate < 0) {
                    err(`${label}: blooms need decayRate >= 0`);
                }
            }
            if (isVec3(node.pos)) {
                const r = Math.hypot(node.pos[0], node.pos[2]);
                const y = node.pos[1];
                if (r > CAMERA_ENVELOPE.hardRadius || y > CAMERA_ENVELOPE.hardHeight) {
                    err(`${label}: pos outside the hard camera envelope `
                        + `(r=${r.toFixed(2)} > ${CAMERA_ENVELOPE.hardRadius} or y=${y} > ${CAMERA_ENVELOPE.hardHeight})`);
                } else if (r > CAMERA_ENVELOPE.targetRadius * 1.15 || y > CAMERA_ENVELOPE.targetHeight * 1.15) {
                    warnings.push(`${label}: pos well outside the normalization target `
                        + `(r=${r.toFixed(2)}, y=${y}; target r<=${CAMERA_ENVELOPE.targetRadius}, y<=${CAMERA_ENVELOPE.targetHeight})`);
                }
            }
        }

        // Root and parent structure
        const roots = [...byId.values()].filter((n) => n.kind === 'root');
        if (roots.length !== 1) err(`expected exactly one root node, found ${roots.length}`);
        if (roots.length === 1 && roots[0].id !== ROOT_ID) {
            err(`the root node's id must be ${JSON.stringify(ROOT_ID)} (DatatreeVis looks it up by that id), got ${JSON.stringify(roots[0].id)}`);
        }
        for (const node of byId.values()) {
            if (node.kind === 'root') {
                if (node.parent !== null && node.parent !== undefined) {
                    err(`root node must have parent: null`);
                }
                continue;
            }
            if (typeof node.parent !== 'string' || !byId.has(node.parent)) {
                err(`node ${JSON.stringify(node.id)}: parent ${JSON.stringify(node.parent)} does not resolve`);
            }
        }
        // Every parent chain must reach the root (catches cycles)
        for (const node of byId.values()) {
            const seen = new Set();
            let cursor = node;
            while (cursor && cursor.parent != null) {
                if (seen.has(cursor.id)) {
                    err(`parent cycle through node ${JSON.stringify(cursor.id)}`);
                    break;
                }
                seen.add(cursor.id);
                cursor = byId.get(cursor.parent);
            }
        }
    }

    if (meta && Array.isArray(meta.tourStops)) {
        for (const stop of meta.tourStops) {
            if (!byId.has(stop)) err(`meta.tourStops references unknown node ${JSON.stringify(stop)}`);
        }
    }

    // --- flies ---
    const flyIds = new Set();
    if (!Array.isArray(evolution.flies)) {
        err('flies must be an array');
    } else {
        for (const fly of evolution.flies) {
            const label = `fly ${JSON.stringify(fly?.id)}`;
            if (typeof fly?.id !== 'string' || fly.id === '') {
                err(`fly with missing/empty id: ${JSON.stringify(fly)}`);
                continue;
            }
            if (flyIds.has(fly.id)) err(`duplicate fly id ${JSON.stringify(fly.id)}`);
            flyIds.add(fly.id);
            if (!FLY_ROLES.includes(fly.role)) {
                err(`${label}: role must be one of ${FLY_ROLES.join('/')}, got ${JSON.stringify(fly.role)}`);
            }
            if (!byId.has(fly.start)) err(`${label}: start node ${JSON.stringify(fly.start)} does not resolve`);
            if (fly.size !== undefined && (!isFiniteNumber(fly.size) || fly.size <= 0)) {
                err(`${label}: size must be a positive number`);
            }
        }
    }

    // --- actions ---
    if (!Array.isArray(evolution.actions)) {
        err('actions must be an array');
    } else {
        evolution.actions.forEach((action, i) => {
            const label = `actions[${i}] (${action?.type} @ t=${action?.t})`;
            if (!ACTION_TYPES.includes(action?.type)) {
                err(`${label}: type must be one of ${ACTION_TYPES.join('/')}`);
                return;
            }
            const duration = meta?.duration;
            if (!isFiniteNumber(action.t) || action.t < 0
                || (isFiniteNumber(duration) && action.t > duration)) {
                err(`${label}: t must be within [0, meta.duration]`);
            }
            if (!flyIds.has(action.fly)) err(`${label}: fly ${JSON.stringify(action.fly)} does not resolve`);
            const nodeRef = { steer: 'toward', orbit: 'around', beam: 'node' }[action.type];
            if (!byId.has(action[nodeRef])) {
                err(`${label}: ${nodeRef} ${JSON.stringify(action[nodeRef])} does not resolve`);
            }
            if (action.type === 'orbit' && !ORBIT_RADII.includes(action.radius)) {
                err(`${label}: radius must be one of ${ORBIT_RADII.join('/')}`);
            }
            if (action.type === 'beam') {
                if (!isFiniteNumber(action.duration) || action.duration <= 0) {
                    err(`${label}: beam duration must be a positive number`);
                }
                if (!isFiniteNumber(action.heal) || action.heal < 0) {
                    err(`${label}: beam heal must be a number >= 0`);
                }
            }
        });
    }

    return { errors, warnings };
}

// Throw on contract violations, log warnings. `source` names the module in
// the message so a failing page says which data file is broken.
export function assertEvolution(evolution, source = 'evolution') {
    const { errors, warnings } = validateEvolution(evolution);
    for (const w of warnings) console.warn(`[evolution-schema] ${source}: ${w}`);
    if (errors.length > 0) {
        throw new Error(`[evolution-schema] ${source} violates schema v${SCHEMA_VERSION}:\n  - ${errors.join('\n  - ')}`);
    }
}
