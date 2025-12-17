const http = require('http');

const req = http.get('http://localhost:3001/', (res) => {
    console.log('STATUS:', res.statusCode);
    res.on('data', () => { });
    res.on('end', () => console.log('Body received.'));
});

req.on('error', (e) => {
    console.error('ERROR:', e.message);
});
