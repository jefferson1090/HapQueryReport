const db = require('../db');

class DocService {

    // --- BOOKS ---
    async listBooks() {
        // Return hierarchy or simple list? Simple list for dashboard.
        const sql = `SELECT * FROM TB_DOC_BOOKS ORDER BY DT_CREATED DESC`;
        const result = await db.executeQuery(sql, {}, 100, { outFormat: db.oracledb.OUT_FORMAT_OBJECT });
        return result.rows;
    }

    async createBook(title, description, owner = 'USER') {
        const sql = `INSERT INTO TB_DOC_BOOKS (NM_TITLE, DS_DESCRIPTION, CD_OWNER) VALUES (:title, :descriptionVal, :owner) RETURNING ID_BOOK INTO :id`;
        const result = await db.execute(sql, {
            title: title,
            descriptionVal: description,
            owner: owner,
            id: { dir: db.oracledb.BIND_OUT, type: db.oracledb.NUMBER }
        });
        return result.outBinds.id[0];
    }

    async deleteBook(id) {
        await db.executeQuery(`DELETE FROM TB_DOC_BOOKS WHERE ID_BOOK = :id`, { id });
        return true;
    }

    // --- NODES (Pages) ---
    async getBookTree(bookId) {
        // Fetch all nodes for a book and reconstruct tree in JS (cheaper than recursive SQL for small docs)
        const sql = `SELECT ID_NODE, ID_PARENT_NODE, NM_TITLE, TP_NODE, NU_ORDER FROM TB_DOC_NODES WHERE ID_BOOK = :bid ORDER BY NU_ORDER ASC, NM_TITLE ASC`;
        const result = await db.executeQuery(sql, { bid: bookId }, 5000, { outFormat: db.oracledb.OUT_FORMAT_OBJECT });
        return this.buildTree(result.rows);
    }

    buildTree(nodes) {
        const map = {};
        const roots = [];

        // Init map
        nodes.forEach(n => {
            map[n.ID_NODE] = { ...n, children: [] };
        });

        // Link
        nodes.forEach(n => {
            if (n.ID_PARENT_NODE && map[n.ID_PARENT_NODE]) {
                map[n.ID_PARENT_NODE].children.push(map[n.ID_NODE]);
            } else {
                roots.push(map[n.ID_NODE]);
            }
        });

        return roots;
    }

    async getNode(id) {
        const sql = `SELECT * FROM TB_DOC_NODES WHERE ID_NODE = :id`;
        const result = await db.executeQuery(sql, { id }, 1, { outFormat: db.oracledb.OUT_FORMAT_OBJECT });
        return result.rows[0];
    }

    async createNode(bookId, parentId, title, type = 'PAGE') {
        const sql = `INSERT INTO TB_DOC_NODES (ID_BOOK, ID_PARENT_NODE, NM_TITLE, TP_NODE, CL_CONTENT) 
                     VALUES (:bid, :pid, :title, :nodeType, EMPTY_CLOB()) RETURNING ID_NODE INTO :id`;
        const result = await db.execute(sql, {
            bid: bookId,
            pid: parentId || null,
            title: title,
            nodeType: type,
            id: { dir: db.oracledb.BIND_OUT, type: db.oracledb.NUMBER }
        });

        // TODO: Update Order logic if needed
        return result.outBinds.id[0];
    }

    async updateNodeContent(id, content, title) {
        let sql = `UPDATE TB_DOC_NODES SET DT_UPDATED = SYSDATE`;
        const params = { id };

        if (title) {
            sql += `, NM_TITLE = :title`;
            params.title = title;
        }

        if (content) {
            sql += `, CL_CONTENT = :content`;
            params.content = content; // Accessing CLOB might need streaming for huge docs, but simple string works for moderate size in node-oracledb 6+
        }

        sql += ` WHERE ID_NODE = :id`;

        await db.executeQuery(sql, params);
        return true;
    }
}

module.exports = new DocService();
