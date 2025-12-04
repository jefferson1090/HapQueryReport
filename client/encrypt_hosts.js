import CryptoJS from 'crypto-js';

const SECRET_KEY = 'hap-query-report-secret-key';

const host2 = 'SRV-CLIENT.HAPVIDA.COM.BR:1521/CLIENT';
const encrypted2 = CryptoJS.AES.encrypt(host2, SECRET_KEY).toString();
console.log('--- START 2 ---');
console.log(encrypted2);
console.log('--- END 2 ---');
