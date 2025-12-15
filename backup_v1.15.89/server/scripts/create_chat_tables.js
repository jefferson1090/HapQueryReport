const db = require('../db');

async function createChatTables() {
    try {
        console.log("Creating HAP_CHAT_USERS table...");
        try {
            await db.execute(`
                CREATE TABLE HAP_CHAT_USERS (
                    USERNAME VARCHAR2(50) PRIMARY KEY,
                    PASSWORD VARCHAR2(100),
                    LAST_SEEN DATE
                )
            `);
            console.log("HAP_CHAT_USERS created.");
        } catch (e) {
            if (e.message.includes("ORA-00955")) {
                console.log("HAP_CHAT_USERS already exists.");
            } else {
                throw e;
            }
        }

        console.log("Creating HAP_CHAT_MESSAGES table...");
        try {
            await db.execute(`
                CREATE TABLE HAP_CHAT_MESSAGES (
                    ID NUMBER GENERATED ALWAYS AS IDENTITY,
                    SENDER VARCHAR2(50),
                    CONTENT CLOB,
                    MSG_TYPE VARCHAR2(20) DEFAULT 'TEXT',
                    METADATA CLOB,
                    TIMESTAMP DATE DEFAULT SYSDATE
                )
            `);
            console.log("HAP_CHAT_MESSAGES created.");
        } catch (e) {
            if (e.message.includes("ORA-00955")) {
                console.log("HAP_CHAT_MESSAGES already exists.");
            } else {
                throw e;
            }
        }

        console.log("Tables created successfully.");
        process.exit(0);
    } catch (err) {
        console.error("Error creating tables:", err);
        process.exit(1);
    }
}

createChatTables();
