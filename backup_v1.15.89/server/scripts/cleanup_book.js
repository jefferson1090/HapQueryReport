const http = require('http');

const API_HOST = 'localhost';
const API_PORT = 3001;
const API_BASE = '/api/docs';
const BOOK_ID = 1765219329133; // "Manual da Aplicação" (The one with garbage)

function request(method, path, body = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: API_HOST,
            port: API_PORT,
            path: path,
            method: method,
            headers: { 'Content-Type': 'application/json' }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try { resolve(data ? JSON.parse(data) : null); }
                    catch (e) { resolve(null); }
                } else {
                    reject(new Error(`Status ${res.statusCode}: ${data}`));
                }
            });
        });

        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function run() {
    console.log(`Cleaning Book ID: ${BOOK_ID}...`);

    console.log("Fetching tree...");
    let tree = [];
    try {
        tree = await request('GET', `${API_BASE}/books/${BOOK_ID}/tree`);
    } catch (e) { console.error("Fetch failed:", e.message); return; }

    if (!tree || tree.length === 0) {
        console.log("Book is already empty.");
        return;
    }

    console.log(`Found ${tree.length} root nodes. Deleting ALL...`);

    // Recursive delete function (client-side recursion to be safe)
    const deleteNode = async (node) => {
        if (node.children && node.children.length > 0) {
            console.log(`Typing into children of ${node.NM_TITLE}`);
            for (const c of node.children) await deleteNode(c);
        }
        process.stdout.write(`Deleting: ${node.NM_TITLE}... `);
        try {
            await request('DELETE', `${API_BASE}/nodes/${node.ID_NODE}`);
            console.log("✓");
        } catch (e) {
            console.log(`X (${e.message})`);
        }
    };

    for (const node of tree) {
        await deleteNode(node);
    }

    console.log("Cleanup Complete.");
}

run().catch(console.error);
