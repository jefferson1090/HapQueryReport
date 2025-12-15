const fs = require('fs');
const path = require('path');
const os = require('os');

// Determine path (copied from localDocService detection logic)
let baseDir;
try {
    const appData = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + "/.local/share");
    baseDir = path.join(appData, 'HapQueryReport', 'docs');
} catch (e) {
    baseDir = path.join(os.tmpdir(), 'hap-query-report-docs');
}

const BOOK_ID = '1765219329133'; // Manual da Aplicação

const bookDir = path.join(baseDir, BOOK_ID);
const structureFile = path.join(bookDir, 'structure.json');

console.log(`Force cleaning book: ${BOOK_ID}`);
console.log(`Path: ${structureFile}`);

if (fs.existsSync(structureFile)) {
    // Backup first
    fs.copyFileSync(structureFile, structureFile + '.bak');

    // Write empty array
    fs.writeFileSync(structureFile, '[]', 'utf8');
    console.log("SUCCESS: Structure file wiped (set to empty array).");
} else {
    console.log("ERROR: Structure file not found.");
}
