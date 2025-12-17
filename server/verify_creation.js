
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
    console.log("=== Verifying Book Creation ===");

    // Create Private Book for 'Assistente'
    console.log("Creating book 'Teste Privado' for owner 'Assistente'...");
    const res = await request('POST', '/api/docs/books', { 'x-username': 'Assistente' }, JSON.stringify({
        title: 'Teste Privado do Assistente',
        description: 'Auto-generated'
    }));
    console.log("Response:", res);

    if (res.id) {
        console.log("SUCCESS: Book created with ID", res.id);
    } else {
        console.log("FAILURE: Book not created", res);
    }
}

test().catch(console.error);
