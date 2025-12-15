require('dotenv').config();
const db = require('./db');

async function diagnose() {
    try {
        console.log("=== 1. Checking Database Connection ===");
        // Simulate connection
        await db.checkConnection({
            user: process.env.DB_USER || 'system',
            password: process.env.DB_PASSWORD || 'password',
            connectString: process.env.DB_CONNECT_STRING || 'localhost/xe'
        });
        console.log("Connected.");

        console.log("\n=== 2. Sample Data Dump (Top 5 Nodes) ===");
        const dumpSql = `SELECT ID_NODE, NM_TITLE, LENGTH(CL_CONTENT) as CONTENT_LEN, dbms_lob.substr(CL_CONTENT, 100, 1) as CONTENT_PREVIEW FROM TB_DOC_NODES FETCH FIRST 5 ROWS ONLY`;
        const dump = await db.executeQuery(dumpSql, {}, 5, { outFormat: db.oracledb.OUT_FORMAT_OBJECT });
        console.table(dump.rows);

        const term = 'teste'; // The term user mentioned
        console.log(`\n=== 3. Testing Search Strategies for term: "${term}" ===`);

        // Strategy A: Standard LIKE on Title
        console.log("--- Strategy A: UPPER(NM_TITLE) LIKE UPPER(...) ---");
        const resA = await db.executeQuery(
            `SELECT ID_NODE, NM_TITLE FROM TB_DOC_NODES WHERE UPPER(NM_TITLE) LIKE UPPER(:q)`,
            { q: `%${term}%` }, 10, { outFormat: db.oracledb.OUT_FORMAT_OBJECT }
        );
        console.log(`Found: ${resA.rows.length} rows.`);
        if (resA.rows.length > 0) console.log(resA.rows[0]);

        // Strategy B: REGEXP_LIKE on Content
        console.log("\n--- Strategy B: REGEXP_LIKE(CL_CONTENT, ..., 'i') ---");
        try {
            const resB = await db.executeQuery(
                `SELECT ID_NODE, NM_TITLE FROM TB_DOC_NODES WHERE REGEXP_LIKE(CL_CONTENT, :q, 'i')`,
                { q: term }, 10, { outFormat: db.oracledb.OUT_FORMAT_OBJECT }
            );
            console.log(`Found: ${resB.rows.length} rows.`);
        } catch (e) {
            console.log("FAILED: " + e.message);
        }

        // Strategy C: DBMS_LOB.INSTR
        console.log("\n--- Strategy C: DBMS_LOB.INSTR(UPPER(CL_CONTENT), UPPER(...)) ---");
        try {
            const resC = await db.executeQuery(
                `SELECT ID_NODE, NM_TITLE FROM TB_DOC_NODES WHERE DBMS_LOB.INSTR(UPPER(CL_CONTENT), UPPER(:q)) > 0`,
                { q: term }, 10, { outFormat: db.oracledb.OUT_FORMAT_OBJECT }
            );
            console.log(`Found: ${resC.rows.length} rows.`);
        } catch (e) {
            console.log("FAILED: " + e.message);
        }

        // Strategy D: 4K Cast (Fallback for simple setups)
        console.log("\n--- Strategy D: UPPER(DBMS_LOB.SUBSTR(CL_CONTENT, 4000, 1)) LIKE ... ---");
        try {
            const resD = await db.executeQuery(
                `SELECT ID_NODE, NM_TITLE FROM TB_DOC_NODES WHERE UPPER(DBMS_LOB.SUBSTR(CL_CONTENT, 4000, 1)) LIKE UPPER(:q)`,
                { q: `%${term}%` }, 10, { outFormat: db.oracledb.OUT_FORMAT_OBJECT }
            );
            console.log(`Found: ${resD.rows.length} rows.`);
        } catch (e) {
            console.log("FAILED: " + e.message);
        }

    } catch (e) {
        fs.appendFileSync('diagnosis.txt', "FATAL ERROR: " + e.message + "\n");
    } finally {
        process.exit(0);
    }
}

const fs = require('fs');
// Monkey patch console.log
const origLog = console.log;
console.log = function (...args) {
    fs.appendFileSync('diagnosis.txt', args.join(' ') + '\n');
    origLog.apply(console, args);
};
console.table = function (data) {
    fs.appendFileSync('diagnosis.txt', JSON.stringify(data, null, 2) + '\n');
};

diagnose();
