import CryptoJS from 'crypto-js';

const SECRET_KEY = 'hap-query-report-secret-key';

const encrypt = (text) => {
    return CryptoJS.AES.encrypt(text, SECRET_KEY).toString();
};

const creds = [
    { name: 'HOMO_PASS', val: 'ste001' },
    { name: 'HOMO_HOST', val: 'orahml01.hapvida.com.br:1521/haphml' },
    { name: 'PROD_PASS', val: 'smr001' },
    { name: 'PROD_HOST', val: 'SRV-CLIENT.HAPVIDA.COM.BR:1521/CLIENT' }
];

import fs from 'fs';
const output = creds.map(c => `${c.name}: ${encrypt(c.val)}`).join('\n');
fs.writeFileSync('creds.txt', output);
console.log('Done');
