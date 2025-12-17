
const fs = require('fs');
const path = require('path');
const os = require('os');

const APPDATA = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + "/.local/share");
const DOCS_DIR = path.join(APPDATA, 'HapQueryReport', 'docs');
const BOOKS_FILE = path.join(DOCS_DIR, 'books.json');

if (!fs.existsSync(BOOKS_FILE)) {
    console.log("No books file found at", BOOKS_FILE);
    process.exit(0);
}

try {
    const raw = fs.readFileSync(BOOKS_FILE, 'utf8');
    const structure = JSON.parse(raw);

    console.log("=== Book Audit ===");
    console.log(`Total Books: ${structure.length}`);
    console.log("ID | TITLE | OWNER");
    console.log("-".repeat(50));

    structure.forEach(b => {
        console.log(`${b.ID_BOOK} | ${b.NM_TITLE} | ${b.CD_OWNER || 'UNDEFINED (Public)'}`);
    });
    console.log("-".repeat(50));

} catch (e) {
    console.error("Error reading structure:", e);
}
