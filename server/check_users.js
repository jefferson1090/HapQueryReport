const db = require('./db');
require('dotenv').config();

async function checkUsers() {
    try {
        const result = await db.execute("SELECT USERNAME, PASSWORD, TEAM FROM HAP_CHAT_USERS");
        console.log("Users found:", result.rows);
    } catch (err) {
        console.error("Error:", err);
    }
}

checkUsers();
