const { GoogleGenerativeAI } = require("@google/generative-ai");
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function listModels() {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    try {
        // For v1beta/v0.x of the SDK, listModels might not be directly exposed easily in the main class 
        // depending on version, but let's try the standard way if available, 
        // or just try to instantiate a known fallback model.
        // Actually, the SDK doesn't always expose listModels simply on the instance. 
        // But we can try 'getGenerativeModel' with a safe one and see.

        // Alternative: Use fetch directly to list models if SDK fails.
        const key = process.env.GEMINI_API_KEY;
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
        const data = await response.json();

        if (data.models) {
            console.log("Available Models:");
            data.models.forEach(m => console.log(`- ${m.name} (${m.supportedGenerationMethods})`));
        } else {
            console.log("Error listing models:", data);
        }

    } catch (e) {
        console.error("Error:", e);
    }
}

listModels();
