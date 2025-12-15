const docService = require('../services/localDocService');
const fs = require('fs');

async function test() {
    console.log("Starting limit test...");

    // 1. Create a dummy book
    const bookId = await docService.createBook("Limit Test Book", "Testing limits");
    console.log(`Created book ${bookId}`);

    try {
        // 2. Create a dummy large page (10k chars)
        const longText = "A".repeat(10000);
        const nodeId = await docService.createNode(bookId, null, "Large Page");
        await docService.updateNodeContent(nodeId, longText, "Large Page");
        console.log(`Created large page ${nodeId} with 10000 chars.`);

        // 3. Index
        const nodes = await docService.getAllSearchableNodes();
        const myNode = nodes.find(n => n.ID_NODE == nodeId);

        if (myNode) {
            console.log(`Node found in index.`);
            console.log(`Snippet length: ${myNode.SNIPPET.length}`);

            if (myNode.SNIPPET.length > 4050) {
                console.log("SUCCESS: Snippet is larger than 4000 chars!");
            } else if (myNode.SNIPPET.length === 10000) {
                console.log("SUCCESS: Snippet is exactly 10000 chars!");
            } else {
                console.log(`FAILURE: Snippet truncated? Length: ${myNode.SNIPPET.length}`);
            }
        } else {
            console.log("FAILURE: Node not found in index.");
        }

    } catch (e) {
        console.error(e);
    } finally {
        // Cleanup
        await docService.deleteBook(bookId);
        console.log("Cleanup done.");
    }
}

test();
