const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const Groq = require("groq-sdk");

async function verify() {
    const apiKey = process.env.GROQ_API_KEY;
    console.log("Checking API Key...");
    if (!apiKey) {
        console.error("❌ GROQ_API_KEY is missing in .env");
        return;
    }
    console.log(`Key found: ${apiKey.substring(0, 10)}...`);

    const groq = new Groq({ apiKey });

    try {
        console.log("Sending test request to Groq...");
        const completion = await groq.chat.completions.create({
            messages: [{ role: "user", content: "Hello, are you working?" }],
            model: process.env.AI_MODEL || "llama-3.3-70b-versatile",
        });
        console.log("✅ API Response Received:");
        console.log(completion.choices[0]?.message?.content);
    } catch (e) {
        console.error("❌ API Request Failed:", e.message);
    }
}

verify();
