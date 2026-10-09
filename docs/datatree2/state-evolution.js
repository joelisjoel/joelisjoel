// dataTreeStateEvolution: the WHAT of the data tree, with none of the HOW.
//
// This object is the contract for driving the visualization from real data
// (e.g. edits flowing through a code tree, where nodes are directories,
// packages, and files). Everything structural is a node in a graph:
// parent links define the hierarchy, and each node's position (and optional
// `via` routing points for the edge to its parent) are ANNOTATIONS, as if
// supplied by a prior placement algorithm. The renderer draws whatever
// graph it is given; the landscape beneath is purely cosmetic and lives
// entirely in the vis layer.
//
// Dynamics are a timeline of ACTIONS — intents, not trajectories. Flies are
// told to steer toward or orbit nodes; the vis layer integrates their actual
// paths, so node positions can change without invalidating the data. Node
// vitality is hp0 + decayRate + discrete heal deliveries, evaluable at any
// time t in either direction — which the ping-pong ("Tenet rewind")
// playback depends on.

export const dataTreeStateEvolution = {
    meta: {
        schemaVersion: 1, // see evolution-schema.mjs
        duration: 20, // seconds of evolution; playback ping-pongs 0->20->0
        loop: 'pingpong',
        // Blooms the camera tour visits, in order
        tourStops: ['health', 'energy', 'revenue'],
    },

    graph: {
        // kinds: 'root' (trunk crown), 'branch' (limb), 'twig' (sub-branch,
        // gets a web cloud), 'bloom' (labeled leaf with vitality).
        // pos: placement annotation. via: optional routing points for the
        // edge back to the parent (the windswept sweep of a limb).
        // weight: relative share of structure flowing through the node.
        nodes: [
            { id: 'root', kind: 'root', parent: null, pos: [0, 1.05, 0] },

            { id: 'pkg-energy', kind: 'branch', parent: 'root', weight: 3, pos: [-1.9, 1.52, 0.15], via: [[-0.6, 1.18, 0.12], [-1.3, 1.38, -0.1]] },
            { id: 'pkg-teams', kind: 'branch', parent: 'root', weight: 2, pos: [-1.5, 1.95, -0.1], via: [[-0.48, 1.5, -0.15], [-1.05, 1.82, 0.05]] },
            { id: 'pkg-code', kind: 'branch', parent: 'root', weight: 2, pos: [0.05, 2.05, -0.05], via: [[0.12, 1.65, 0.1]] },
            { id: 'pkg-health', kind: 'branch', parent: 'root', weight: 3, pos: [1.9, 1.58, 0.1], via: [[0.58, 1.28, 0.15], [1.3, 1.48, -0.05]] },
            { id: 'pkg-revenue', kind: 'branch', parent: 'root', weight: 2, pos: [1.8, 1.15, -0.18], via: [[0.62, 1.02, -0.2], [1.35, 1.0, 0.0]] },
            { id: 'pkg-reliability', kind: 'branch', parent: 'root', weight: 1.5, pos: [-1.55, 1.2, 0.4], via: [[-0.52, 0.92, 0.32], [-1.15, 1.02, 0.45]] },
            { id: 'pkg-growth', kind: 'branch', parent: 'root', weight: 1.5, pos: [1.3, 1.9, -0.4], via: [[0.42, 1.5, -0.38], [0.95, 1.78, -0.5]] },

            // Sub-branches: two modules per package
            { id: 'mod-energy-a', kind: 'twig', parent: 'pkg-energy', weight: 1, pos: [-2.3, 1.75, 0.5] },
            { id: 'mod-energy-b', kind: 'twig', parent: 'pkg-energy', weight: 1, pos: [-2.25, 1.2, -0.25] },
            { id: 'mod-teams-a', kind: 'twig', parent: 'pkg-teams', weight: 1, pos: [-1.85, 2.25, 0.2] },
            { id: 'mod-teams-b', kind: 'twig', parent: 'pkg-teams', weight: 1, pos: [-1.9, 1.75, -0.45] },
            { id: 'mod-code-a', kind: 'twig', parent: 'pkg-code', weight: 1, pos: [0.45, 2.3, 0.25] },
            { id: 'mod-code-b', kind: 'twig', parent: 'pkg-code', weight: 1, pos: [-0.35, 2.3, -0.3] },
            { id: 'mod-health-a', kind: 'twig', parent: 'pkg-health', weight: 1, pos: [2.3, 1.9, 0.45] },
            { id: 'mod-health-b', kind: 'twig', parent: 'pkg-health', weight: 1, pos: [2.35, 1.35, -0.2] },
            { id: 'mod-revenue-a', kind: 'twig', parent: 'pkg-revenue', weight: 1, pos: [2.2, 1.3, -0.55] },
            { id: 'mod-revenue-b', kind: 'twig', parent: 'pkg-revenue', weight: 1, pos: [2.15, 0.85, 0.15] },
            { id: 'mod-reliability-a', kind: 'twig', parent: 'pkg-reliability', weight: 1, pos: [-1.95, 1.45, 0.75] },
            { id: 'mod-growth-a', kind: 'twig', parent: 'pkg-growth', weight: 1, pos: [1.6, 2.25, -0.7] },

            // Third module per package: fills out each limb's canopy
            { id: 'mod-energy-c', kind: 'twig', parent: 'pkg-energy', weight: 1, pos: [-2.45, 1.5, 0.15] },
            { id: 'mod-teams-c', kind: 'twig', parent: 'pkg-teams', weight: 1, pos: [-1.75, 2.3, -0.15] },
            { id: 'mod-code-c', kind: 'twig', parent: 'pkg-code', weight: 1, pos: [0.1, 2.5, -0.05] },
            { id: 'mod-health-c', kind: 'twig', parent: 'pkg-health', weight: 1, pos: [2.4, 1.65, 0.15] },
            { id: 'mod-revenue-c', kind: 'twig', parent: 'pkg-revenue', weight: 1, pos: [2.3, 1.05, -0.2] },
            { id: 'mod-reliability-b', kind: 'twig', parent: 'pkg-reliability', weight: 1, pos: [-2.0, 1.05, 0.6] },
            { id: 'mod-growth-b', kind: 'twig', parent: 'pkg-growth', weight: 1, pos: [1.75, 1.95, -0.85] },

            // Files: leaf-level nodes hanging off the modules, pushing the
            // canopy out another ring
            { id: 'file-energy-a1', kind: 'twig', parent: 'mod-energy-a', weight: 0.6, pos: [-2.6, 1.95, 0.7] },
            { id: 'file-energy-b1', kind: 'twig', parent: 'mod-energy-b', weight: 0.6, pos: [-2.55, 1.05, -0.45] },
            { id: 'file-teams-a1', kind: 'twig', parent: 'mod-teams-a', weight: 0.6, pos: [-2.1, 2.5, 0.35] },
            { id: 'file-teams-b1', kind: 'twig', parent: 'mod-teams-b', weight: 0.6, pos: [-2.2, 1.85, -0.65] },
            { id: 'file-code-a1', kind: 'twig', parent: 'mod-code-a', weight: 0.6, pos: [0.7, 2.55, 0.4] },
            { id: 'file-code-b1', kind: 'twig', parent: 'mod-code-b', weight: 0.6, pos: [-0.6, 2.55, -0.45] },
            { id: 'file-health-a1', kind: 'twig', parent: 'mod-health-a', weight: 0.6, pos: [2.6, 2.15, 0.6] },
            { id: 'file-health-b1', kind: 'twig', parent: 'mod-health-b', weight: 0.6, pos: [2.65, 1.2, -0.35] },
            { id: 'file-revenue-a1', kind: 'twig', parent: 'mod-revenue-a', weight: 0.6, pos: [2.5, 1.2, -0.75] },
            { id: 'file-revenue-b1', kind: 'twig', parent: 'mod-revenue-b', weight: 0.6, pos: [2.45, 0.7, 0.35] },
            { id: 'file-reliability-a1', kind: 'twig', parent: 'mod-reliability-a', weight: 0.6, pos: [-2.25, 1.55, 0.95] },
            { id: 'file-growth-a1', kind: 'twig', parent: 'mod-growth-a', weight: 0.6, pos: [1.85, 2.45, -0.9] },

            // Blooms: the labeled leaves whose vitality the flies tend.
            // hp0/decayRate define vitality over time; heals arrive as beam
            // actions below.
            { id: 'energy', kind: 'bloom', parent: 'pkg-energy', label: 'energy', pos: [-1.55, 1.75, 0.1], hp0: 55, decayRate: 2.4 },
            { id: 'teams', kind: 'bloom', parent: 'pkg-teams', label: 'teams', pos: [-1.25, 2.05, 0.0], hp0: 96, decayRate: 1.2 },
            { id: 'code', kind: 'bloom', parent: 'pkg-code', label: 'code', pos: [0.1, 2.2, 0.05], hp0: 90, decayRate: 1.5 },
            { id: 'health', kind: 'bloom', parent: 'pkg-health', label: 'health', pos: [1.55, 1.8, 0.05], hp0: 30, decayRate: 2.0 },
            { id: 'revenue', kind: 'bloom', parent: 'pkg-revenue', label: 'revenue', pos: [1.5, 1.35, -0.25], hp0: 88, decayRate: 2.2 },
            { id: 'reliability', kind: 'bloom', parent: 'pkg-reliability', label: 'reliability', pos: [-1.3, 1.4, 0.45], hp0: 92, decayRate: 1.4 },
            { id: 'growth', kind: 'bloom', parent: 'pkg-growth', label: 'growth', pos: [1.1, 2.05, -0.45], hp0: 85, decayRate: 1.8 },
        ],
    },

    // The swarm: identity and disposition only. `start` seats each fly near
    // a bloom at t=0 (orbiting wide unless the timeline says otherwise).
    flies: [
        ...Array.from({ length: 50 }, (_, i) => {
            const blooms = ['energy', 'teams', 'code', 'health', 'revenue', 'reliability', 'growth'];
            return {
                id: `fly-${String(i).padStart(2, '0')}`,
                role: i % 10 < 3 ? 'roamer' : 'nurse',
                size: 0.8 + ((i * 37) % 100) / 100 * 1.2,
                start: blooms[i % blooms.length],
            };
        }),
    ],

    // Time-ordered directives. steer: head toward a node (the vis eases the
    // fly over); orbit: circle a node at 'tight' or 'wide' radius; beam: a
    // healing injection — `heal` HP delivered when the beam completes.
    actions: [
        // -- Act 1: 'health' is critical at t0; nearby nurses converge fast
        { t: 0.4, type: 'steer', fly: 'fly-03', toward: 'health' },
        { t: 0.5, type: 'steer', fly: 'fly-10', toward: 'health' },
        { t: 0.6, type: 'steer', fly: 'fly-17', toward: 'health' },
        { t: 0.8, type: 'steer', fly: 'fly-24', toward: 'health' },
        { t: 1.4, type: 'orbit', fly: 'fly-03', around: 'health', radius: 'tight' },
        { t: 1.6, type: 'orbit', fly: 'fly-10', around: 'health', radius: 'tight' },
        { t: 1.8, type: 'orbit', fly: 'fly-17', around: 'health', radius: 'tight' },
        { t: 2.0, type: 'orbit', fly: 'fly-24', around: 'health', radius: 'tight' },
        { t: 2.2, type: 'beam', fly: 'fly-03', node: 'health', duration: 2, heal: 26 },
        { t: 4.8, type: 'beam', fly: 'fly-10', node: 'health', duration: 2, heal: 18 },
        { t: 7.4, type: 'beam', fly: 'fly-17', node: 'health', duration: 2, heal: 24 },
        { t: 10.0, type: 'beam', fly: 'fly-24', node: 'health', duration: 2, heal: 28 },

        // -- Act 2: 'energy' sags below care mid-story
        { t: 4.0, type: 'steer', fly: 'fly-07', toward: 'energy' },
        { t: 4.2, type: 'steer', fly: 'fly-14', toward: 'energy' },
        { t: 4.4, type: 'steer', fly: 'fly-28', toward: 'energy' },
        { t: 5.2, type: 'orbit', fly: 'fly-07', around: 'energy', radius: 'tight' },
        { t: 5.4, type: 'orbit', fly: 'fly-14', around: 'energy', radius: 'tight' },
        { t: 5.6, type: 'orbit', fly: 'fly-28', around: 'energy', radius: 'tight' },
        { t: 6.0, type: 'beam', fly: 'fly-07', node: 'energy', duration: 2, heal: 20 },
        { t: 9.0, type: 'beam', fly: 'fly-14', node: 'energy', duration: 2, heal: 16 },
        { t: 12.5, type: 'beam', fly: 'fly-28', node: 'energy', duration: 2, heal: 25 },
        { t: 15.5, type: 'beam', fly: 'fly-07', node: 'energy', duration: 2, heal: 22 },

        // -- Act 3: 'revenue' drifts under threshold late; a pair attends
        { t: 11.0, type: 'steer', fly: 'fly-21', toward: 'revenue' },
        { t: 11.2, type: 'steer', fly: 'fly-35', toward: 'revenue' },
        { t: 12.0, type: 'orbit', fly: 'fly-21', around: 'revenue', radius: 'tight' },
        { t: 12.2, type: 'orbit', fly: 'fly-35', around: 'revenue', radius: 'tight' },
        { t: 13.0, type: 'beam', fly: 'fly-21', node: 'revenue', duration: 2, heal: 24 },
        { t: 16.0, type: 'beam', fly: 'fly-35', node: 'revenue', duration: 2, heal: 27 },

        // -- 'health' crew released once their patient stabilizes
        { t: 12.6, type: 'orbit', fly: 'fly-03', around: 'code', radius: 'wide' },
        { t: 12.9, type: 'orbit', fly: 'fly-10', around: 'teams', radius: 'wide' },
        { t: 13.2, type: 'orbit', fly: 'fly-17', around: 'growth', radius: 'wide' },
        { t: 13.5, type: 'orbit', fly: 'fly-24', around: 'reliability', radius: 'wide' },

        // -- Roamers keep their unhurried rounds throughout
        { t: 2.5, type: 'steer', fly: 'fly-00', toward: 'growth' },
        { t: 3.4, type: 'orbit', fly: 'fly-00', around: 'growth', radius: 'wide' },
        { t: 6.5, type: 'steer', fly: 'fly-20', toward: 'teams' },
        { t: 7.4, type: 'orbit', fly: 'fly-20', around: 'teams', radius: 'wide' },
        { t: 8.5, type: 'steer', fly: 'fly-30', toward: 'reliability' },
        { t: 9.6, type: 'orbit', fly: 'fly-30', around: 'reliability', radius: 'wide' },
        { t: 10.5, type: 'steer', fly: 'fly-40', toward: 'code' },
        { t: 11.4, type: 'orbit', fly: 'fly-40', around: 'code', radius: 'wide' },
        { t: 14.0, type: 'steer', fly: 'fly-01', toward: 'energy' },
        { t: 15.0, type: 'orbit', fly: 'fly-01', around: 'energy', radius: 'wide' },
        { t: 16.5, type: 'steer', fly: 'fly-31', toward: 'health' },
        { t: 17.6, type: 'orbit', fly: 'fly-31', around: 'health', radius: 'wide' },
    ],
};
