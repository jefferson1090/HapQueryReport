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
        let query = `SELECT OWNER || '.' || OBJECT_NAME, OBJECT_TYPE 
             FROM ALL_OBJECTS 
             WHERE OBJECT_TYPE IN ('TABLE', 'VIEW')
             AND OWNER NOT IN (
                'SYS', 'SYSTEM', 'OUTLN', 'DBSNMP', 'APPQOSSYS', 'WMSYS', 'CTXSYS', 
                'XDB', 'ORDDATA', 'ORDSYS', 'MDSYS', 'OLAPSYS', 'LBACSYS', 'DVSYS', 
                'GSMADMIN_INTERNAL', 'APEX_040000', 'APEX_030200', 'AUDSYS'
             )`;

        const params = {};
        if (search) {
            query += ` AND UPPER(OWNER || '.' || OBJECT_NAME) LIKE UPPER(:search)`;
            params.search = `%${search}%`;
        }

        query += ` ORDER BY OBJECT_TYPE, OWNER, OBJECT_NAME OFFSET 0 ROWS FETCH NEXT 50 ROWS ONLY`;

        const result = await conn.execute(query, params);
        // Map to format: "OWNER.NAME"
        return result.rows.map(row => row[0]);
    } finally {
        if (conn) await conn.close();
    }
}

// Smart Search Logic
async function findObjects(term) {
    let conn;
    try {
        term = term ? term.trim() : '';
        if (!term) return [];

        conn = await getConnection();

        const baseQuery = `SELECT OWNER, OBJECT_NAME, OBJECT_TYPE 
                           FROM ALL_OBJECTS 
                           WHERE OBJECT_TYPE IN ('TABLE', 'VIEW')
                           AND OWNER NOT IN ('SYS', 'SYSTEM', 'OUTLN', 'DBSNMP', 'APPQOSSYS', 'WMSYS', 'CTXSYS', 'XDB', 'ORDDATA', 'ORDSYS', 'MDSYS', 'OLAPSYS', 'LBACSYS', 'DVSYS', 'GSMADMIN_INTERNAL')`;

        // 1. Exact Match First
        const exactParams = { term: term.toUpperCase() };
        // Check for "OWNER.OBJECT" pattern
        let exactWhere = "";
        if (term.includes('.')) {
            exactWhere = "AND UPPER(OWNER || '.' || OBJECT_NAME) = :term";
        } else {
            exactWhere = "AND UPPER(OBJECT_NAME) = :term";
        }

        const exactResult = await conn.execute(
            `${baseQuery} ${exactWhere} ORDER BY OWNER, OBJECT_NAME`,
            exactParams
        );

        if (exactResult.rows.length > 0) {
            return exactResult.rows.map(row => ({
                owner: row[0],
                object_name: row[1],
                object_type: row[2],
                full_name: `${row[0]}.${row[1]}`
            }));
        }

        // 2. Fuzzy Match (Fallback)
        const fuzzyParams = { term: `%${term.toUpperCase()}%` };
        const fuzzyResult = await conn.execute(
            `${baseQuery} AND UPPER(OBJECT_NAME) LIKE :term ORDER BY OBJECT_TYPE, OWNER, OBJECT_NAME FETCH NEXT 50 ROWS ONLY`,
            fuzzyParams
        );

        return fuzzyResult.rows.map(row => ({
            owner: row[0],
            object_name: row[1],
            object_type: row[2],
            full_name: `${row[0]}.${row[1]}`
        }));

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

        // 1. Try to get View Definition
        // Improved Logic: If owner is provided, check directly. If not, or if failed, try to find the view globally (in ALL_VIEWS).
        let viewText = null;
        try {
            // A. Direct check
            let viewSql = `SELECT TEXT FROM ALL_VIEWS WHERE UPPER(VIEW_NAME) = UPPER(:tableName)`;
            const viewParams = { tableName };

            if (owner && owner !== connectionParams.user.toUpperCase()) {
                viewSql += ` AND UPPER(OWNER) = UPPER(:owner)`;
                viewParams.owner = owner;
            } else {
                // Optimization: Prefer current user, but if not found, we might search others? 
                // Actually, if no owner specified, it might be a public synonym or another schema.
                // Let's first try exact match if we can. 
            }

            // Let's just try to find ANY view with this name accessible to us.
            // If we have an owner, enforce it.
            let finalViewSql = `SELECT TEXT FROM ALL_VIEWS WHERE UPPER(VIEW_NAME) = UPPER(:tableName)`;
            let finalViewParams = { tableName };

            if (owner) {
                finalViewSql += ` AND UPPER(OWNER) = UPPER(:owner)`;
                finalViewParams.owner = owner;
            }

            // Fetch
            const viewResult = await conn.execute(
                finalViewSql + " FETCH NEXT 1 ROWS ONLY",
                finalViewParams,
                { fetchInfo: { TEXT: { type: oracledb.STRING } } }
            );

            if (viewResult.rows.length > 0) {
                viewText = viewResult.rows[0][0];
            } else if (!owner) {
                // Return Null, handled later.
            }
        } catch (e) {
            // Ignore view check errors
            console.error("View check error", e);
        }

        // 1.2 Try to fetch columns (Owner Specific or First Match)
        let columnSql = `
            SELECT column_name, data_type, data_length, nullable, data_default, owner
            FROM ALL_TAB_COLUMNS 
            WHERE UPPER(TABLE_NAME) = UPPER(:tableName)
        `;
        const columnParams = { tableName };

        if (owner) {
            columnSql += ` AND UPPER(OWNER) = UPPER(:owner)`;
            columnParams.owner = owner;
        } else {
            // Prioritize current user if no owner specified, but allow others
            columnSql += ` ORDER BY (CASE WHEN UPPER(OWNER) = UPPER('${connectionParams.user}') THEN 0 ELSE 1 END), OWNER, COLUMN_ID`;
        }

        if (owner) {
            columnSql += ` ORDER BY COLUMN_ID`;
        }

        const result = await conn.execute(
            columnSql,
            columnParams,
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
        );

        // If generic search returned rows from multiple schemas (unlikely due to we need column list of ONE table),
        // we should filter by the first owner found.
        let finalRows = result.rows;
        if (!owner && finalRows.length > 0) {
            const firstOwner = finalRows[0].OWNER;
            finalRows = finalRows.filter(r => r.OWNER === firstOwner);
        }

        // Map to ensure uppercase keys (just in case) and add view definition if exists
        // Map to ensure uppercase keys (just in case) and add view definition if exists
        const structure = finalRows.map(row => ({
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

        if (viewText) {
            structure.viewDefinition = viewText;
        }

        return structure;
    } finally {
        if (conn) await conn.close();
    }
}

async function getSchemaDictionary() {
    let conn;
    try {
        conn = await getConnection();

        // Blocklist for system schemas
        const ownerBlocklist = `
            'SYS', 'SYSTEM', 'OUTLN', 'DBSNMP', 'APPQOSSYS', 'WMSYS', 'CTXSYS', 
            'XDB', 'ORDDATA', 'ORDSYS', 'MDSYS', 'OLAPSYS', 'LBACSYS', 'DVSYS', 
            'GSMADMIN_INTERNAL', 'APEX_040000', 'APEX_030200', 'AUDSYS'
        `;

        // Fetch columns for tables and views
        // Prioritize schemas: Current User, HUMASTER, INCORPORA, then others.
        const sql = `
            SELECT OWNER, TABLE_NAME, COLUMN_NAME, DATA_TYPE
            FROM ALL_TAB_COLUMNS
            WHERE OWNER NOT IN (${ownerBlocklist})
            ORDER BY 
                CASE 
                    WHEN OWNER = '${currentUser}' THEN 0
                    WHEN OWNER IN ('HUMASTER', 'INCORPORA') THEN 1
                    ELSE 2 
                END,
                OWNER, TABLE_NAME, COLUMN_ID
        `;

        // Set a safe limit (200,000 columns) to prevent browser crash, 
        // but rely on prioritization to get the important stuff.
        const result = await conn.execute(sql, [], { maxRows: 200000 });

        const dictionary = {};
        const ownersFound = new Set();

        // Current User (to prioritize short names)
        const currentUser = connectionParams.user.toUpperCase();

        result.rows.forEach(row => {
            const [owner, tableName, colName, dataType] = row;

            // 1. Fully Qualified Name: OWNER.TABLE_NAME
            const fullName = `${owner}.${tableName}`;
            if (!dictionary[fullName]) dictionary[fullName] = [];
            dictionary[fullName].push(colName);

            // 2. Short Name: TABLE_NAME (Only if it belongs to current user or isn't taken yet)
            // If collision (same table name in multiple schemas), current user wins.
            if (owner === currentUser) {
                // Always overwrite/set for current user
                if (!dictionary[tableName]) dictionary[tableName] = [];
                dictionary[tableName].push(colName);
            } else {
                // Only set if not already present (avoid overwriting current user's table with same name from another schema)
                if (!dictionary[tableName]) {
                    dictionary[tableName] = [];
                    dictionary[tableName].push(colName);
                } else {
                    // If it exists, append only if it's the SAME array (meaning it was set by this block previously)
                    // Actually, if dictionary[tableName] exists, it might be from current user OR another schema.
                    // It's complex to track "who owns the short key".
                    // Simplification: Short name `TABLE` maps to the first one found (alphabetic owner order mostly) OR current user.
                    // Since we process row by row, and we want current user priority, we should ideally simply maintain two sets or just trust the overwrite logic above?
                    // My logic above: 
                    // - If owner is current user -> Force write to dictionary[tableName] (because subsequent lines for same table will just append).
                    // - If owner is NOT current user -> Only write if dictionary[tableName] is empty.
                    // The issue: What if we processed 'OTHER_USER' first, filled dictionary['T1'], and then encounter 'CURRENT_USER' later?
                    // We would overwrite dictionary['T1'] with a NEW array, essentially clearing the 'OTHER_USER' columns from the short name entry.
                    // That is CORRECT behavior for prioritization. 

                    // However, we need to make sure we are appending to the *correct* array instance.
                    // When we do dictionary[tableName] = [], we create a new array.
                    // Subsequent rows for that same table:
                    // Owner matches -> dictionary[tableName].push
                    // Owner doesn't match -> dictionary[tableName].push (if it was created by that non-owner logic).

                    // Optimization: Just push to `dictionary[fullName]`.
                    // Then handle `dictionary[tableName]` carefully.
                }
            }
        });

        // Second Pass for Short Names to avoid the "overwrite clears previous columns" issue during iteration
        // Actually, let's simpler:
        // Use the `fullName` entries to populate `tableName` entries.
        // Filter keys by owner == current user, set those first.
        // Then remaining keys that don't conflict.

        // Optimized Single Pass approach:
        // Map: Owner -> Table -> [Cols]
        const tempMap = {};
        result.rows.forEach(row => {
            const [owner, name, col] = row;
            if (!tempMap[owner]) tempMap[owner] = {};
            if (!tempMap[owner][name]) tempMap[owner][name] = [];
            tempMap[owner][name].push(col);
        });

        // Build final dictionary
        Object.keys(tempMap).forEach(owner => {
            Object.keys(tempMap[owner]).forEach(table => {
                const cols = tempMap[owner][table];
                const fullName = `${owner}.${table}`;

                // Always add full name
                dictionary[fullName] = cols;

                // Add short name logic
                if (owner === currentUser) {
                    // Always win
                    dictionary[table] = cols;
                } else {
                    // Only if empty
                    if (!dictionary[table]) {
                        dictionary[table] = cols;
                    }
                }
            });
        });

        console.log(`[Schema Dictionary] Loaded ${Object.keys(dictionary).length} keys from ${ownersFound.size} schemas.`);
        console.log(`[Schema Dictionary] Schemas found: ${Array.from(ownersFound).sort().join(', ')}`);

        return dictionary;

    } finally {
        if (conn) await conn.close();
    }
}


async function executeQuery(sql, params = [], limit = 1000, extraOptions = {}) {
    let conn;
    try {
        conn = await getConnection();
        // Limit rows to avoid crashing browser, default 1000 but adjustable
        const options = {
            maxRows: limit === 'all' ? undefined : Number(limit),
            ...extraOptions
        };
        const result = await conn.execute(sql, params, options);
        return {
            metaData: result.metaData,
            rows: result.rows
        };
    } finally {
        if (conn) await conn.close();
    }
}

async function execute(sql, params = [], options = {}) {
    let conn;
    try {
        conn = await getConnection();
        // Default autoCommit to true if not specified, since global might be set but good to be explicit
        const execOptions = { autoCommit: true, ...options };
        return await conn.execute(sql, params, execOptions);
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
        // 2. Add Indices / Constraints
        for (const idx of indices) {
            // Support Object format: { name: 'IDX_NAME', column: 'COL_NAME' }
            if (typeof idx === 'object' && idx.name && idx.column) {
                const indexSql = `CREATE INDEX "${idx.name.toUpperCase()}" ON "${tableName.toUpperCase()}" ("${idx.column.toUpperCase()}")`;
                log("Creating Index (Structured): " + indexSql);
                try { await conn.execute(indexSql); } catch (e) { log("Index Error: " + e.message); }
            }
            // Support Raw SQL (if starts with CREATE INDEX)
            else if (typeof idx === 'string' && idx.trim().toUpperCase().startsWith('CREATE INDEX')) {
                log("Creating Index (Raw): " + idx);
                try { await conn.execute(idx); } catch (e) { log("Index Error: " + e.message); }
            }
            // Legacy/Simple: idx is a column name
            else if (typeof idx === 'string' && columns.some(c => c.name === idx)) {
                const indexSql = `CREATE INDEX "IDX_${tableName}_${idx}" ON "${tableName}" ("${idx}")`;
                log("Creating Index (Simple): " + indexSql);
                try { await conn.execute(indexSql); } catch (e) { log("Index Error: " + e.message); }
            }
        }

        // 3. Grants
        for (const user of grants) {
            // Support Raw SQL
            if (typeof user === 'string' && user.trim().toUpperCase().startsWith('GRANT')) {
                log("Granting (Raw): " + user);
                try { await conn.execute(user); } catch (e) { log("Grant Error: " + e.message); }
            }
            // Legacy: user is just a username
            else {
                const grantSql = `GRANT ALL ON "${tableName}" TO "${user.toUpperCase()}"`;
                log("Granting (Simple): " + grantSql);
                try { await conn.execute(grantSql); } catch (e) { log("Grant Error: " + e.message); }
            }
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

async function getStream(sql, params = []) {
    const conn = await getConnection();
    return {
        stream: conn.queryStream(sql, params),
        connection: conn
    };
}

async function checkTableExists(tableName) {
    let conn;
    try {
        conn = await getConnection();
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
        if (err.errorNum !== 942) {
            throw err;
        }
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
    getStream,
    getConnection,
    execute,
    oracledb,
    findObjects,
    getSchemaDictionary
};
