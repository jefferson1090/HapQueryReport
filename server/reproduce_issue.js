const fetch = require('node-fetch');

const BASE_URL = 'http://localhost:3001/api';

// Mock connection data (User needs to be connected first)
// We assume the user has already connected via the UI, so the server has connectionParams.
// If not, we need to connect. But we don't have credentials.
// We will assume the server is running and connected.
// If not, this script will fail with "Not connected".

async function runQuery(sql) {
    console.log(`\n--- Running Query: "${sql}" ---`);
    try {
        const res = await fetch(`${BASE_URL}/query`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sql, limit: 100 })
        });
        const data = await res.json();
        if (data.error) {
            console.error("Query Error:", data.error);
        } else {
            console.log("Query Success. Rows:", data.rows ? data.rows.length : 0);
        }
    } catch (e) {
        console.error("Fetch Error:", e.message);
    }
}

async function runCount(sql) {
    console.log(`\n--- Running Count: "${sql}" ---`);
    try {
        const res = await fetch(`${BASE_URL}/query/count`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sql })
        });
        const data = await res.json();
        if (data.error) {
            console.error("Count Error:", data.error);
        } else {
            console.log("Count Success:", data.count);
        }
    } catch (e) {
        console.error("Fetch Error:", e.message);
    }
}

async function main() {
    // Test 1: Valid Query
    await runQuery("SELECT 1 FROM DUAL");

    // Test 2: Query with semicolon
    await runQuery("SELECT 1 FROM DUAL;");

    // Test 3: Query with semicolon and space
    await runQuery("SELECT 1 FROM DUAL; ");

    // Test 4: Query with semicolon and newline
    await runQuery("SELECT 1 FROM DUAL;\n");

    // Test 5: Query with comment
    await runQuery("SELECT 1 FROM DUAL -- comment");

    // Test 6: Count with semicolon
    await runCount("SELECT 1 FROM DUAL;");
}

main();
