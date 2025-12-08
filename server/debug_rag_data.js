const docService = require('./services/localDocService');

async function debugData() {
    console.log("=== DEBUGGING DOC DATA ===");
    const books = await docService.listBooks();
    console.log(`Books Found: ${books.length}`);

    const allNodes = await docService.getAllSearchableNodes();
    console.log(`Total Searchable Nodes: ${allNodes.length}`);

    console.log("\n--- CONTENT DUMP ---");
    allNodes.forEach(n => {
        console.log(`[NODE ${n.ID_NODE}] Title: "${n.NM_TITLE}"`);
        console.log(`Snippet (${n.SNIPPET.length} chars): "${n.SNIPPET.substring(0, 100).replace(/\n/g, ' ')}..."`);
        console.log("-");
    });
}

debugData();
