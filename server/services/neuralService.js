const fs = require('fs');
const path = require('path');

// Storage structure:
// {
//   nodes: { "id": { id, type, current_activation: 0 } },
//   edges: [ { from, to, weight, relation } ]
// }

class NeuralService {
    constructor() {
        this.storagePath = path.join(__dirname, '../data/neural_memory.json');
        this.graph = { nodes: {}, edges: [] };
        this.loadGraph();
    }

    loadGraph() {
        try {
            const dir = path.dirname(this.storagePath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

            if (fs.existsSync(this.storagePath)) {
                this.graph = JSON.parse(fs.readFileSync(this.storagePath, 'utf8'));
            } else {
                this.seedBaseKnowledge(); // Start with some base knowledge as requested
                this.saveGraph();
            }
        } catch (e) {
            console.error("NeuralService Load Error:", e);
        }
    }

    saveGraph() {
        try {
            fs.writeFileSync(this.storagePath, JSON.stringify(this.graph, null, 2));
        } catch (e) {
            console.error("NeuralService Save Error:", e);
        }
    }

    /**
     * Seeds the neural network with basic concepts about the user's domain.
     * This ensures the "Agent" isn't empty on day 1.
     */
    seedBaseKnowledge() {
        // Base Nodes
        this.addNode('CLIENTE', 'concept');
        this.addNode('VENDA', 'concept');
        this.addNode('PRODUTO', 'concept');
        this.addNode('ESTOQUE', 'concept');

        // Connect them (Basic Business Logic)
        this.addEdge('CLIENTE', 'VENDA', 0.9, 'performs');
        this.addEdge('VENDA', 'PRODUTO', 0.9, 'contains');
        this.addEdge('PRODUTO', 'ESTOQUE', 0.8, 'tracked_by');
    }

    addNode(id, type, tags = []) {
        const nodeId = id.toUpperCase();
        if (!this.graph.nodes[nodeId]) {
            this.graph.nodes[nodeId] = {
                id: nodeId,
                type,
                tags,
                activation: 0,
                last_activated: null
            };
            return true;
        }
        return false;
    }

    addEdge(from, to, weight = 0.5, relation = 'related') {
        const fromId = from.toUpperCase();
        const toId = to.toUpperCase();

        // Auto-create nodes if they don't exist
        this.addNode(fromId, 'auto');
        this.addNode(toId, 'auto');

        const existing = this.graph.edges.find(e => e.from === fromId && e.to === toId);
        if (existing) {
            existing.weight = Math.min(1.0, existing.weight + 0.1); // Reinforce
            existing.relation = relation;
        } else {
            this.graph.edges.push({ from: fromId, to: toId, weight, relation });
        }
        this.saveGraph();
    }

    /**
     * Syncs local memory with the Hive Mind (Supabase).
     * respecting the Trust Hierarchy: Individual > Base > Collective.
     * @param {SupabaseAdapter} adapter 
     */
    async sync(adapter) {
        if (!adapter) return;
        console.log('[NeuralService] Starting Hive Mind Sync...');

        // 1. Check Global Config / Kill Switch
        const forceReset = await adapter.getConfig('force_reset_flag');
        const minVersion = await adapter.getConfig('min_kb_version');

        // TODO: stored local version check
        if (forceReset === 'true') {
            console.warn('[NeuralService] ⚠️ GLOBAL KILL SWITCH DETECTED. Wiping local memory...');
            this.graph = { nodes: {}, edges: [] };
            this.seedBaseKnowledge(); // Re-seed basics
            // We don't save yet, we wait to pull valid data
        }

        // 2. Pull Global Memory
        const globalNodes = await adapter.getGlobalMemory();
        if (!globalNodes || globalNodes.length === 0) {
            console.log('[NeuralService] No global memory found. Skipping merge.');
            return;
        }

        console.log(`[NeuralService] Pulled ${globalNodes.length} nodes from Hive Mind.`);

        // 3. Merge Strategy (Hierarchy)
        let newEdgesCount = 0;
        let conflictsResolved = 0;

        for (const globalNode of globalNodes) {
            const { term, target, type, source_type, validation_status } = globalNode;

            // source_type: 'MANUAL_OVERRIDE' (Individual), 'OFFICIAL_DEV' (Base), 'PASSIVE_OBSERVATION' (Collective)
            // Local graph edges don't track 'source_type' yet. We assume local edges are 'MANUAL' or 'PASSIVE-LOCAL'.
            // For now, simpler logic:

            // If Global is OFFICIAL (Base) -> It overrides everything except explicit local User Overrides.
            // But we don't track 'User Override' vs 'Passive Local' in JSON yet.
            // Let's assume everything currently in JSON is "Local Truth".

            // Conflict Check: Do we have an edge for this Term?
            const existingEdge = this.graph.edges.find(e => e.from === term.toUpperCase());

            if (existingEdge) {
                if (existingEdge.to === target.toUpperCase()) {
                    // Same connection. Reinforce weight?
                    if (source_type === 'OFFICIAL_DEV') existingEdge.weight = 1.0;
                    continue;
                }

                // Conflict! Local says A -> B, Global says A -> C.
                if (source_type === 'OFFICIAL_DEV') {
                    // Base Knowledge wins over Local Unknown
                    // Unless we add a flag 'is_locked' to local edges?
                    // For Phase 4, let's say Base wins.
                    console.log(`[Neural] Conflict: Local(${existingEdge.to}) vs Base(${target}). Base wins.`);
                    existingEdge.to = target.toUpperCase();
                    existingEdge.weight = 1.0;
                    existingEdge.relation = type;
                    conflictsResolved++;
                } else {
                    // Collaborative Suggestion vs Local. Local wins (User preference).
                    console.log(`[Neural] Conflict: Local(${existingEdge.to}) vs Hive(${target}). Local preserved.`);
                }
            } else {
                // New knowledge! Adopt it.
                // If it's PASSIVE from Hive, only adopt if valid/verified?
                // Adapter already filtered for VERIFIED (mostly).
                this.addEdge(term, target, 0.8, type || 'synonym');
                newEdgesCount++;
            }
        }

        this.saveGraph();
        console.log(`[NeuralService] Sync Complete. Added: ${newEdgesCount}, Conflicts Resolved: ${conflictsResolved}.`);
    }

    /**
     * "Activates" the neural network around a specific term to find related concepts.
     * @param {string} startTerm e.g. "CLIENTE"
     * @returns {Array} List of related nodes sorted by weight
     */
    activate(startTerm) {
        const root = startTerm.toUpperCase();
        if (!this.graph.nodes[root]) return [];

        // Simple BFS with weight decay
        const activated = [];
        const visited = new Set();
        const queue = [{ id: root, signal: 1.0 }];

        while (queue.length > 0) {
            const current = queue.shift();
            if (visited.has(current.id)) continue;
            visited.add(current.id);

            // Don't include the root itself in results
            if (current.id !== root) {
                activated.push({ id: current.id, relevance: current.signal, node: this.graph.nodes[current.id] });
            }

            // Propagate
            if (current.signal > 0.2) { // Threshold
                const outgoing = this.graph.edges.filter(e => e.from === current.id);
                for (const edge of outgoing) {
                    queue.push({
                        id: edge.to,
                        signal: current.signal * edge.weight
                    });
                }

                // Bidirectional association (weaker reverse)
                const incoming = this.graph.edges.filter(e => e.to === current.id);
                for (const edge of incoming) {
                    queue.push({
                        id: edge.from,
                        signal: current.signal * edge.weight * 0.5
                    });
                }
            }
        }

        return activated.sort((a, b) => b.relevance - a.relevance);
    }
}

module.exports = new NeuralService();
