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

    async getAllSearchableNodes() {
        const books = readBooks();
        console.log(`[RAG] Indexing ${books.length} books...`);
        const allNodes = [];
        for (const book of books) {
            try {
                const nodes = readStructure(book.ID_BOOK);
                for (const node of nodes) {
                    // Read content file
                    const contentPath = path.join(getBookDir(book.ID_BOOK), `${node.ID_NODE}.html`);
                    let content = '';
                    if (fs.existsSync(contentPath)) {
                        // Read full content to ensure "all sheets" are indexed
                        // We will rely on aiService to manage the prompt context window size
                        content = fs.readFileSync(contentPath, 'utf-8');
                    }

                    allNodes.push({
                        ID_NODE: node.ID_NODE,
                        ID_BOOK: book.ID_BOOK,
                        NM_TITLE: node.NM_TITLE,
                        SNIPPET: content
                    });
                }
            } catch (e) {
                console.error(`Error indexing book ${book.ID_BOOK}:`, e);
            }
        }
        console.log(`[RAG] Found ${allNodes.length} searchable nodes.`);
        return allNodes;
    }

    async searchNodes(query) {
        const allNodes = await this.getAllSearchableNodes();
        if (!query) return [];

        const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
        console.log(`[RAG] Searching for: ${terms.join(', ')}`);

        const scored = allNodes.map(node => {
            let score = 0;
            const title = node.NM_TITLE.toLowerCase();
            const content = node.SNIPPET.toLowerCase();

            terms.forEach(term => {
                if (title.includes(term)) score += 10;
                if (content.includes(term)) score += 2;
            });

            return { ...node, score };
        });

        // Retorna top 5 relevants
        const results = scored.filter(n => n.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);
        console.log(`[RAG] Found ${results.length} matches.`);
        return results;
    }

    async getBookTree(bookId) {
        const nodes = readStructure(bookId);
        console.log(`[LocalDocService] getBookTree book=${bookId}, rawNodes=${nodes.length}`);
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

    async deleteNode(id) {
        const books = readBooks();
        for (const book of books) {
            let nodes = readStructure(book.ID_BOOK);
            const node = nodes.find(n => n.ID_NODE == id);

            if (node) {
                // Recursive collect all descendants to delete their files
                // Ensure we use the correct type from the found node
                const targetId = node.ID_NODE;
                const toDeleteIds = [targetId];

                const findDescendants = (parentId) => {
                    // Use loose equality for parent check too just in case
                    const children = nodes.filter(n => n.ID_PARENT_NODE == parentId);
                    for (const child of children) {
                        toDeleteIds.push(child.ID_NODE);
                        findDescendants(child.ID_NODE);
                    }
                };
                findDescendants(targetId);

                // Delete files
                for (const delId of toDeleteIds) {
                    const filePath = path.join(getBookDir(book.ID_BOOK), `${delId}.html`);
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                    }
                }

                // Remove from structure - Use filter with includes on IDs
                nodes = nodes.filter(n => !toDeleteIds.includes(n.ID_NODE));
                writeStructure(book.ID_BOOK, nodes);

                return true;
            }
        }
        throw new Error("Node not found");
    }

    async moveNode(nodeId, targetBookId, targetParentId, newIndex) {
        const books = readBooks();
        let sourceBookId = null;
        let nodeToMove = null;
        let sourceNodes = null;

        // 1. Find Source
        for (const book of books) {
            const nodes = readStructure(book.ID_BOOK);
            const node = nodes.find(n => n.ID_NODE == nodeId);
            if (node) {
                sourceBookId = book.ID_BOOK;
                nodeToMove = { ...node }; // Clone
                sourceNodes = nodes;
                break;
            }
        }

        if (!nodeToMove) throw new Error("Source node not found");

        // 2. Prepare Target
        let targetNodes = [];
        if (sourceBookId == targetBookId) {
            targetNodes = sourceNodes; // Reference same array if same book
        } else {
            targetNodes = readStructure(targetBookId);
        }

        // 3. Remove from Source
        if (sourceBookId == targetBookId) {
            targetNodes = targetNodes.filter(n => n.ID_NODE != nodeId);
        } else {
            // Remove from source book file
            const newSourceNodes = sourceNodes.filter(n => n.ID_NODE != nodeId);
            writeStructure(sourceBookId, newSourceNodes);

            // Move File
            const sourcePath = path.join(getBookDir(sourceBookId), `${nodeId}.html`);
            const targetPath = path.join(getBookDir(targetBookId), `${nodeId}.html`);
            if (fs.existsSync(sourcePath)) {
                fs.renameSync(sourcePath, targetPath);
            }
        }

        // 4. Update Node Properties
        nodeToMove.ID_BOOK = targetBookId;
        nodeToMove.ID_PARENT_NODE = targetParentId;
        nodeToMove.DT_UPDATED = new Date().toISOString();

        // 5. Insert at new Index
        const siblings = targetNodes.filter(n => n.ID_PARENT_NODE == targetParentId);
        const nonSiblings = targetNodes.filter(n => n.ID_PARENT_NODE != targetParentId);

        if (newIndex < 0) newIndex = 0;
        if (newIndex > siblings.length) newIndex = siblings.length;

        siblings.splice(newIndex, 0, nodeToMove);

        // 5a. Update NU_ORDER for all siblings
        siblings.forEach((sib, idx) => {
            sib.NU_ORDER = idx;
        });

        // 5b. Merge
        const finalNodes = [...nonSiblings, ...siblings];

        writeStructure(targetBookId, finalNodes);

        return true;
    }
}

module.exports = new LocalDocService();
