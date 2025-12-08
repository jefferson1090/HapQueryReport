require('dotenv').config();
const db = require('./db');

async function testSearch(query) {
    try {
        console.log('Connecting...');
        await db.initialize(); // Assuming db module connects on query or has init

        console.log(`Searching for "${query}"...`);

        // Test 1: Simple LIKE on Title
        const sqlTitle = `SELECT ID_NODE, NM_TITLE FROM TB_DOC_NODES WHERE UPPER(NM_TITLE) LIKE UPPER(:q)`;
        const resTitle = await db.executeQuery(sqlTitle, { q: `%${query}%` }, 100, { outFormat: db.oracledb.OUT_FORMAT_OBJECT });
        console.log('--- TITLE SEARCH (LIKE) ---');
        console.log(resTitle.rows);

        // Test 2: REGEXP_LIKE on Title
        const sqlRegex = `SELECT ID_NODE, NM_TITLE FROM TB_DOC_NODES WHERE REGEXP_LIKE(NM_TITLE, :q, 'i')`;
        const resRegex = await db.executeQuery(sqlRegex, { q: query }, 100, { outFormat: db.oracledb.OUT_FORMAT_OBJECT });
        console.log('--- TITLE SEARCH (REGEXP) ---');
        console.log(resRegex.rows);

        // Test 3: CLOB Search
        const sqlClob = `SELECT ID_NODE, NM_TITLE FROM TB_DOC_NODES WHERE DBMS_LOB.INSTR(UPPER(CL_CONTENT), UPPER(:q)) > 0`;
        const resClob = await db.executeQuery(sqlClob, { q: query }, 100, { outFormat: db.oracledb.OUT_FORMAT_OBJECT });
        console.log('--- CLOB SEARCH (INSTR) ---');
        console.log(resClob.rows);

    } catch (err) {
        console.error('Error:', err);
    }
}

const q = process.argv[2] || 'teste';
testSearch(q);
