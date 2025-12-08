const http = require('http');

const query = 'teste';
const url = `http://localhost:3001/api/docs/search?q=${query}`;

http.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
        console.log(`Status: ${res.statusCode}`);
        console.log(`Response: ${data}`);
    });
}).on('error', (err) => {
    console.error(`Error: ${err.message}`);
});
