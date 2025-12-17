
const http = require('http');

function request(method, path, headers = {}, body = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: 3001,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve(data);
                }
            });
        });

        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

async function test() {
    console.log("=== Testing Doc Isolation (Native HTTP) ===");
    const API_PATH = '/api/docs/books';

    // 1. Create Public Book
    console.log("\n1. Creating Public Book...");
    const json1 = await request('POST', API_PATH, {}, JSON.stringify({ title: 'Public Book Check', description: 'Public' }));
    console.log("Created Public:", json1);
    const pubId = json1.id;

    // 2. Create Private Book
    console.log("\n2. Creating Private Book...");
    const json2 = await request('POST', API_PATH, { 'x-username': 'PRIVATE_USER' }, JSON.stringify({ title: 'Private Book Check', description: 'Private' }));
    console.log("Created Private:", json2);
    const privId = json2.id;

    // 3. List as Public User
    console.log("\n3. Listing as Public User...");
    const books1 = await request('GET', API_PATH);
    const hasPublic1 = Array.isArray(books1) && books1.some(b => b.ID_BOOK == pubId);
    const hasPrivate1 = Array.isArray(books1) && books1.some(b => b.ID_BOOK == privId);
    console.log(`- Sees Public? ${hasPublic1}`);
    console.log(`- Sees Private? ${hasPrivate1}  <-- Should be FALSE`);

    // 4. List as Private User
    console.log("\n4. Listing as Private User...");
    const books2 = await request('GET', API_PATH, { 'x-username': 'PRIVATE_USER' });
    const hasPublic2 = Array.isArray(books2) && books2.some(b => b.ID_BOOK == pubId);
    const hasPrivate2 = Array.isArray(books2) && books2.some(b => b.ID_BOOK == privId);
    console.log(`- Sees Public? ${hasPublic2}`);
    console.log(`- Sees Private? ${hasPrivate2}  <-- Should be TRUE`);

    // 5. Cleanup
    console.log("\nCleaning up...");
    if (pubId) await request('DELETE', `${API_PATH}/${pubId}`);
    if (privId) await request('DELETE', `${API_PATH}/${privId}`);
}

test().catch(console.error);
