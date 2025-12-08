const fs = require('fs');
const path = require('path');
const os = require('os');


// Determine base directory for docs
// We want this to be persistent.
// In Electron, we can use the same logic as uploadsDir or a sibling 'docs' folder.
let baseDir;
try {
    const appData = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + "/.local/share");
    baseDir = path.join(appData, 'HapQueryReport', 'docs');
} catch (e) {
    baseDir = path.join(os.tmpdir(), 'hap-query-report-docs');
}

// Ensure base dir exists
if (!fs.existsSync(baseDir)) {
    try {
        fs.mkdirSync(baseDir, { recursive: true });
    } catch (e) {
        console.error("Failed to create docs dir:", e);
    }
}

const BOOKS_FILE = path.join(baseDir, 'books.json');

// Helper: Read Books Index
function readBooks() {
    if (!fs.existsSync(BOOKS_FILE)) return [];
    try {
        return JSON.parse(fs.readFileSync(BOOKS_FILE, 'utf-8'));
    } catch (e) {
        return [];
    }
}

// Helper: Write Books Index
function writeBooks(books) {
    fs.writeFileSync(BOOKS_FILE, JSON.stringify(books, null, 2), 'utf-8');
}

// Helper: Get Book Dir
function getBookDir(bookId) {
    const dir = path.join(baseDir, String(bookId));
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
}

// Helper: Get Structure File
function getStructureFile(bookId) {
    return path.join(getBookDir(bookId), 'structure.json');
}

// Helper: Read Structure
function readStructure(bookId) {
    const file = getStructureFile(bookId);
    if (!fs.existsSync(file)) return [];
    try {
        return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch (e) {
        return [];
    }
}

// Helper: Write Structure
function writeStructure(bookId, nodes) {
    fs.writeFileSync(getStructureFile(bookId), JSON.stringify(nodes, null, 2), 'utf-8');
}

class LocalDocService {

    constructor() {
        console.log(`[LocalDocService] Initialized at ${baseDir}`);
    }

    // --- BOOKS ---
    async listBooks() {
        return readBooks().sort((a, b) => new Date(b.DT_CREATED) - new Date(a.DT_CREATED));
    }

    async createBook(title, description, owner = 'USER') {
        const books = readBooks();
        const newBook = {
            ID_BOOK: Date.now(), // Use timestamp as ID for simplicity
            NM_TITLE: title,
            DS_DESCRIPTION: description,
            CD_OWNER: owner,
            DT_CREATED: new Date().toISOString()
        };
        books.push(newBook);
        writeBooks(books);

        // Create dir
        getBookDir(newBook.ID_BOOK);
        // Create empty structure
        writeStructure(newBook.ID_BOOK, []);

        return newBook.ID_BOOK;
    }

    async deleteBook(id) {
        let books = readBooks();
        books = books.filter(b => b.ID_BOOK != id);
        writeBooks(books);
        // We could delete the folder here, but keeping it as trash for now is safer, 
        // or we can rename it. For now, strict deletion:
        const dir = getBookDir(id);
        if (fs.existsSync(dir)) {
            try {
                fs.rmSync(dir, { recursive: true, force: true });
            } catch (e) {
                console.error("Failed to delete book dir:", e);
            }
        }
        return true;
    }

    // --- NODES (Pages) ---
    async getBookTree(bookId) {
        const nodes = readStructure(bookId);
        // Sort by Order then Title logic if needed, but array order usually suffices in JSON
        // We need to build the tree object for the frontend
        return this.buildTree(nodes);
    }

    buildTree(flatNodes) {
        const map = {};
        const roots = [];

        // Deep copy to avoid mutating source during render
        const nodes = flatNodes.map(n => ({ ...n, children: [] }));

        nodes.forEach(n => {
            map[n.ID_NODE] = n;
        });

        nodes.forEach(n => {
            if (n.ID_PARENT_NODE && map[n.ID_PARENT_NODE]) {
                map[n.ID_PARENT_NODE].children.push(n);
            } else {
                roots.push(n);
            }
        });
        return roots;
    }

    async getNode(id) {
        // Since we don't have a global index of nodes, we have to search?
        // OR, the frontend usually requests node by knowing the book?
        // Actually, the current API `GET /api/docs/nodes/:id` doesn't pass the book ID.
        // This makes JSON storage a bit tricky if we split by book.
        // Solution: Read all book structures? Expensive.
        // Better Solution: We pass BookID in the request if possible, OR we keep a global Node Index?
        // Let's iterate books for now, it's local and fast enough for < 100 books.

        const books = readBooks();
        for (const book of books) {
            const nodes = readStructure(book.ID_BOOK);
            const node = nodes.find(n => n.ID_NODE == id);
            if (node) {
                // Read content
                const contentPath = path.join(getBookDir(book.ID_BOOK), `${id}.html`);
                if (fs.existsSync(contentPath)) {
                    node.CL_CONTENT = fs.readFileSync(contentPath, 'utf-8');
                } else {
                    node.CL_CONTENT = '';
                }
                return node;
            }
        }
        return null;
    }

    async createNode(bookId, parentId, title, type = 'PAGE') {
        const nodes = readStructure(bookId);
        const newNode = {
            ID_NODE: Date.now() + Math.floor(Math.random() * 1000),
            ID_BOOK: bookId,
            ID_PARENT_NODE: parentId,
            NM_TITLE: title,
            TP_NODE: type,
            NU_ORDER: nodes.length,
            DT_UPDATED: new Date().toISOString()
        };
        nodes.push(newNode);
        writeStructure(bookId, nodes);

        // Create empty content file
        const contentPath = path.join(getBookDir(bookId), `${newNode.ID_NODE}.html`);
        fs.writeFileSync(contentPath, '', 'utf-8');

        return newNode.ID_NODE;
    }

    async updateNodeContent(id, content, title) {
        const books = readBooks();
        for (const book of books) {
            const nodes = readStructure(book.ID_BOOK);
            const index = nodes.findIndex(n => n.ID_NODE == id);

            if (index !== -1) {
                // Update Metadata
                if (title) nodes[index].NM_TITLE = title;
                nodes[index].DT_UPDATED = new Date().toISOString();
                writeStructure(book.ID_BOOK, nodes);

                // Update Content
                if (content !== undefined) {
                    const contentPath = path.join(getBookDir(book.ID_BOOK), `${id}.html`);
                    fs.writeFileSync(contentPath, content, 'utf-8');
                }
                return true;
            }
        }
        throw new Error("Node not found");
    }
}

module.exports = new LocalDocService();
