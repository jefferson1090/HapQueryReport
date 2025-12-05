const oracledb = require('oracledb');
const fs = require('fs');
const path = require('path');

// Enable auto-commit for this simple app
oracledb.autoCommit = true;

const LOG_FILE = path.join(__dirname, 'server_log.txt');

function log(msg) {
    const timestamp = new Date().toISOString();
    const logMsg = `[${timestamp}] ${msg}\n`;
    console.log(msg);
    try {
        fs.appendFileSync(LOG_FILE, logMsg);
    } catch (e) {
        console.error("Failed to write to log file:", e);
    }
}

let connectionParams = null;

async function getConnection() {
    if (!connectionParams) {
        throw new Error("Não conectado ao banco de dados. Por favor, conecte-se primeiro.");
    }
    return await oracledb.getConnection(connectionParams);
}

async function checkConnection(params) {
    let conn;
    try {
        conn = await oracledb.getConnection(params);
        // If successful, store params for future use (simple session management for single user)
        connectionParams = params;
        log("Connection successful for user: " + params.user);
        return true;
    } catch (err) {
        log("Connection failed: " + err.message);
        throw err;
    } finally {
        if (conn) {
            try { await conn.close(); } catch (e) { console.error(e); }
        }
    }
}

async function getTables(search = '') {
    let conn;
    try {
        conn = await getConnection();

        // Query ALL_OBJECTS to get both tables and views
        let query = `SELECT OWNER || '.' || OBJECT_NAME 
             FROM ALL_OBJECTS 
             WHERE OBJECT_TYPE IN ('TABLE', 'VIEW')
             AND OWNER NOT IN (
                'SYS', 'SYSTEM', 'OUTLN', 'DBSNMP', 'APPQOSSYS', 'WMSYS', 'CTXSYS', 
                'XDB', 'ORDDATA', 'ORDSYS', 'MDSYS', 'OLAPSYS', 'LBACSYS', 'DVSYS', 
                'GSMADMIN_INTERNAL', 'APEX_040000', 'APEX_030200', 'AUDSYS'
             )`;

        const params = {};
        if (search) {
            // If search contains a dot, we might be searching for OWNER.OBJECT
            // If not, we search in both or just object name.
            // The user said "humaster.vw_", so we need to support full string match.
            query += ` AND UPPER(OWNER || '.' || OBJECT_NAME) LIKE UPPER(:search)`;
            params.search = `%${search}%`;
        }

        query += ` ORDER BY OWNER, OBJECT_NAME OFFSET 0 ROWS FETCH NEXT 50 ROWS ONLY`;

        const result = await conn.execute(query, params);
        return result.rows.map(row => row[0]);
    } finally {
        if (conn) await conn.close();
    }
}

async function getColumns(tableNameInput) {
    let conn;
    try {
        let owner, tableName;
        if (tableNameInput.includes('.')) {
            [owner, tableName] = tableNameInput.split('.');
        } else {
            // Fallback if no owner provided
            owner = connectionParams.user.toUpperCase();
            tableName = tableNameInput;
        }

        conn = await getConnection();

        // 1. Try to get View Definition first (if it's a view)
        // We can check if it's a view by querying ALL_VIEWS
        let viewText = null;
        try {
            // Only check if it's a view if we are looking for structure
            const viewResult = await conn.execute(
                `SELECT TEXT FROM ALL_VIEWS WHERE UPPER(OWNER) = UPPER(:owner) AND UPPER(VIEW_NAME) = UPPER(:tableName)`,
                [owner, tableName],
                { fetchInfo: { TEXT: { type: oracledb.STRING } } } // Long columns need specific fetch info
            );
            if (viewResult.rows.length > 0) {
                viewText = viewResult.rows[0][0];
            }
        } catch (e) {
            // Ignore view check errors
        }

        const result = await conn.execute(
            `SELECT column_name, data_type, data_length, nullable, data_default
             FROM ALL_TAB_COLUMNS 
             WHERE UPPER(OWNER) = UPPER(:owner) AND UPPER(TABLE_NAME) = UPPER(:tableName) 
             ORDER BY column_id`,
            [owner, tableName],
            { outFormat: oracledb.OUT_FORMAT_OBJECT } // Return objects!
        );

        // Map to ensure uppercase keys (just in case) and add view definition if exists
        const structure = result.rows.map(row => ({
            COLUMN_NAME: row.COLUMN_NAME,
            DATA_TYPE: row.DATA_TYPE,
            DATA_LENGTH: row.DATA_LENGTH,
            NULLABLE: row.NULLABLE,
            DATA_DEFAULT: row.DATA_DEFAULT
        }));

        if (viewText) {
            // Attach view text to the array as a special property (or handle elsewhere)
            // But getColumns returns an array. Let's return the array, but with a hidden prop? 
            // Better: Let the caller handle it. But we need to return it.
            // Let's attach it to the first column or return an object wrapper?
            // Existing code expects array. Let's stick to array but maybe add a property to the array itself.
            structure.viewDefinition = viewText;
        }

        return structure;
    } finally {
        if (conn) await conn.close();
    }
}

async function executeQuery(sql, params = [], limit = 1000) {
    let conn;
    try {
        conn = await getConnection();
        // Limit rows to avoid crashing browser, default 1000 but adjustable
        const options = { maxRows: limit === 'all' ? undefined : Number(limit) };
        const result = await conn.execute(sql, params, options);
        return {
            metaData: result.metaData,
            rows: result.rows
        };
    } finally {
        if (conn) await conn.close();
    }
}

async function createTable(tableName, columns, indices = [], grants = []) {
    let conn;
    try {
        conn = await getConnection();

        // 1. Create Table
        const colDefs = columns.map(c => `"${c.name}" ${c.type}`).join(', ');
        const sql = `CREATE TABLE "${tableName.toUpperCase()}" (${colDefs})`;
        log("Executing Create Table: " + sql);
        await conn.execute(sql);

        // 2. Add Indices / Constraints
        for (const idx of indices) {
            if (columns.some(c => c.name === idx)) {
                const indexSql = `CREATE INDEX "IDX_${tableName}_${idx}" ON "${tableName}" ("${idx}")`;
                log("Creating Index: " + indexSql);
                try { await conn.execute(indexSql); } catch (e) { log("Index Error: " + e.message); }
            }
        }

        // 3. Grants
        for (const user of grants) {
            const grantSql = `GRANT ALL ON "${tableName}" TO "${user.toUpperCase()}"`;
            log("Granting: " + grantSql);
            try { await conn.execute(grantSql); } catch (e) { log("Grant Error: " + e.message); }
        }

        log("Table created successfully");
    } catch (err) {
        log("Error creating table: " + err.message);
        throw err;
    } finally {
        if (conn) await conn.close();
    }
}

async function insertData(tableName, columns, data) {
    let conn;
    try {
        conn = await getConnection();

        // Construct INSERT statement
        // INSERT INTO table (col1, col2) VALUES (:1, :2)
        const colNames = columns.map(c => `"${c.name}"`).join(', ');
        const bindVars = columns.map((_, i) => `:${i + 1}`).join(', ');
        const sql = `INSERT INTO "${tableName}" (${colNames}) VALUES (${bindVars})`;

        log("Executing Insert SQL (first 100 chars): " + sql.substring(0, 100));

        // Prepare data for bind
        const binds = data.map(row => {
            return columns.map(c => {
                // Use the sanitized name to look up data if we mapped it in index.js, 
                // OR use originalName if we are still using the raw CSV row object.
                // In index.js we mapped data to new keys, so we should use c.name.
                // BUT, let's check both to be robust.
                let val = row[c.name];
                if (val === undefined) {
                    val = row[c.originalName];
                }

                if (val === undefined || val === null || val === '') return null;

                if (c.type === 'NUMBER') {
                    // Handle comma decimals
                    if (typeof val === 'string') {
                        val = val.replace(',', '.');
                    }
                    const num = Number(val);
                    return isNaN(num) ? null : num;
                }

                if (c.type === 'DATE') {
                    // Simple date handling - Oracle expects Date object or string in specific format
                    // Let's try to parse to Date object
                    const d = new Date(val);
                    return isNaN(d.getTime()) ? null : d;
                }

                return String(val); // Ensure string for VARCHAR
            });
        });

        // Use executeMany for performance
        const options = { autoCommit: true, batchErrors: true };
        const result = await conn.executeMany(sql, binds, options);

        if (result.batchErrors && result.batchErrors.length > 0) {
            log("Batch Errors: " + JSON.stringify(result.batchErrors));
            // We could throw here, but partial success might be better. 
            // Let's log it.
        } else {
            log(`Inserted ${result.rowsAffected} rows.`);
        }

        return result;
    } catch (err) {
        log("Error inserting data: " + err.message);
        throw err;
    } finally {
        if (conn) await conn.close();
    }
}

module.exports = {
    checkConnection,
    getTables,
    getColumns,
    executeQuery,
    createTable,
    insertData,
    checkTableExists,
    dropTable,
    getStream
};

async function getStream(sql, params = []) {
    const conn = await getConnection();
    // Return both stream and connection so caller can manage lifecycle
    return {
        stream: conn.queryStream(sql, params),
        connection: conn
    };
}

async function checkTableExists(tableName) {
    let conn;
    try {
        conn = await getConnection();
        // Check if table exists for the current user
        const result = await conn.execute(
            `SELECT count(*) FROM user_tables WHERE table_name = :tableName`,
            [tableName.toUpperCase()]
        );
        return result.rows[0][0] > 0;
    } finally {
        if (conn) await conn.close();
    }
}

async function dropTable(tableName) {
    let conn;
    try {
        conn = await getConnection();
        await conn.execute(`DROP TABLE "${tableName.toUpperCase()}"`);
        log(`Table ${tableName} dropped.`);
    } catch (err) {
        // Ignore if table doesn't exist (ORA-00942)
        if (err.errorNum !== 942) {
            throw err;
        }
    } finally {
        if (conn) await conn.close();
    }
}
