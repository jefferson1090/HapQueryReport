import CryptoJS from 'crypto-js';

const SECRET_KEY = 'hap-query-report-secret-key';

const args = process.argv.slice(2);

if (args.length === 0) {
    console.log('Usage: node encrypt_hosts.js "string_to_encrypt"');
    console.log('Example: node encrypt_hosts.js "localhost:1521/ZE"');
    process.exit(1);
}

const input = args[0];
const encrypted = CryptoJS.AES.encrypt(input, SECRET_KEY).toString();

console.log('\n--- Encrypted Output ---');
console.log(encrypted);
console.log('------------------------\n');

// Verify decryption
const bytes = CryptoJS.AES.decrypt(encrypted, SECRET_KEY);
const decrypted = bytes.toString(CryptoJS.enc.Utf8);

if (decrypted !== input) {
    console.error("ERROR: Decryption check failed!");
} else {
    console.log("Verification: OK (Decrypted matches input)");
}
