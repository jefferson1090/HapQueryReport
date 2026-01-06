const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '../.env');
console.log("Reading env from:", envPath);

if (fs.existsSync(envPath)) {
    const envConfig = dotenv.parse(fs.readFileSync(envPath));
    console.log("Keys found in .env:");
    Object.keys(envConfig).forEach(key => {
        console.log(`- ${key}`);
    });
} else {
    console.log("File not found.");
}
