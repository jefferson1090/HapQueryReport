const docService = require('./services/localDocService');

async function test() {
    console.log("Testing LocalDocService...");
    try {
        const books = await docService.listBooks();
        console.log(`Books: ${books.length}`);

        console.log("Testing searchNodes...");
        if (typeof docService.searchNodes !== 'function') {
            console.error("FAIL: searchNodes is not a function!");
            process.exit(1);
        }

        const results = await docService.searchNodes("teste"); // Use a generic term likely to exist or just verify it runs
        console.log("Search Results:", results);

        console.log("SUCCESS: LocalDocService passed basic checks.");
    } catch (e) {
        console.error("Test Failed:", e);
    }
}

test();
