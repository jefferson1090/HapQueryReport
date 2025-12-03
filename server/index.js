const express = require('express');
const cors = require('cors');
const oracledb = require('oracledb');
const db = require('./db');
const multer = require('multer');
const path = require('path');
const os = require('os');
const upload = multer({ dest: path.join(os.tmpdir(), 'oracle-lowcode-uploads') });
const fs = require('fs');
const csv = require('csv-parser');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increased limit for data import

// Determine root directory (handles both dev and pkg executable)
const rootDir = process.pkg ? path.dirname(process.execPath) : __dirname;

console.log("--------------------------------------------------");
console.log("Server Root Directory:", rootDir);
console.log("Serving static files from:", path.join(rootDir, 'public'));
console.log("--------------------------------------------------");

app.use(express.static(path.join(rootDir, 'public')));

// Initialize Oracle Client (Thick Mode)
// Uses bundled Instant Client for compatibility with older DBs (NJS-116)
try {
  let clientPath;
  if (process.pkg) {
    // If packaged with pkg (legacy)
    clientPath = path.join(path.dirname(process.execPath), 'instantclient');
  } else {
    // If running from source or Electron
    // In Electron production, resources are in resources/app/server/instantclient or resources/instantclient depending on config
    // We will configure electron-builder to put it in a predictable place
    clientPath = path.join(__dirname, 'instantclient');

    // Check if we are in Electron production (packaged)
    if (process.resourcesPath && !process.env.ELECTRON_IS_DEV) {
      // In packaged Electron, we'll put instantclient in the root of resources
      // But let's try to find it relative to __dirname first which is safe if we include it in extraResources
      const potentialPath = path.join(process.resourcesPath, 'instantclient');
      if (fs.existsSync(potentialPath)) {
        clientPath = potentialPath;
      }
    }
  }

  console.log(`Initializing Oracle Client from: ${clientPath}`);
  oracledb.initOracleClient({ libDir: clientPath });
} catch (err) {
  console.error('Whoops, you need the Oracle Instant Client installed!');
  console.error(err);
}

// Routes

// 1. Connection Test
app.post('/api/connect', async (req, res) => {
  const { user, password, connectString } = req.body;
  try {
    const result = await db.checkConnection({ user, password, connectString });
    res.json({ success: true, message: 'Connected successfully!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 2. List Tables
app.get('/api/tables', async (req, res) => {
  try {
    const search = req.query.search || '';
    const tables = await db.getTables(search);
    res.json(tables);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. List Columns
app.get('/api/columns/:table', async (req, res) => {
  try {
    const columns = await db.getColumns(req.params.table);
    res.json(columns);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Execute Query
const { Parser } = require('json2csv');

app.post('/api/export', async (req, res) => {
  // ... (Export logic is handled client-side now, but keeping this as backup/legacy)
  try {
    const { sql, params, format } = req.body;
    const result = await db.executeQuery(sql, params);

    if (format === 'csv') {
      const fields = result.metaData.map(m => m.name);
      const opts = { fields };
      const parser = new Parser(opts);
      const data = result.rows.map(row => {
        const obj = {};
        result.metaData.forEach((meta, i) => {
          obj[meta.name] = row[i];
        });
        return obj;
      });

      const csv = parser.parse(data);
      res.header('Content-Type', 'text/csv');
      res.attachment(`export_${new Date().toISOString().slice(0, 10)}.csv`);
      return res.send(csv);
    } else {
      // TXT (Tab delimited)
      const header = result.metaData.map(m => m.name).join('\t');
      const rows = result.rows.map(row => row.join('\t')).join('\n');
      const txt = header + '\n' + rows;
      res.header('Content-Type', 'text/plain');
      res.attachment(`export_${new Date().toISOString().slice(0, 10)}.txt`);
      return res.send(txt);
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/query', async (req, res) => {
  const { sql, params, limit } = req.body;
  try {
    const result = await db.executeQuery(sql, params || [], limit);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Upload SQL
app.post('/api/upload/sql', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  try {
    const sqlContent = fs.readFileSync(req.file.path, 'utf8');
    res.json({ sql: sqlContent });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    try { fs.unlinkSync(req.file.path); } catch (e) { }
  }
});

// Helper: Detect Delimiter
function detectDelimiter(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(4096); // Read 4KB chunk
    const bytesRead = fs.readSync(fd, buffer, 0, 4096, 0);
    fs.closeSync(fd);

    const content = buffer.toString('utf8', 0, bytesRead);
    const firstLine = content.split(/\r?\n/)[0];

    console.log('First line for detection (truncated):', firstLine.substring(0, 100));

    const commas = (firstLine.match(/,/g) || []).length;
    const semicolons = (firstLine.match(/;/g) || []).length;
    const tabs = (firstLine.match(/\t/g) || []).length;
    const pipes = (firstLine.match(/\|/g) || []).length;

    console.log(`Delimiters found - ;: ${semicolons}, ,: ${commas}, tab: ${tabs}, |: ${pipes}`);

    if (semicolons >= commas && semicolons >= tabs && semicolons >= pipes && semicolons > 0) return ';';
    if (tabs >= commas && tabs >= semicolons && tabs >= pipes && tabs > 0) return '\t';
    if (pipes >= commas && pipes >= semicolons && pipes >= tabs && pipes > 0) return '|';
    return ','; // Default
  } catch (e) {
    console.error("Error detecting delimiter:", e);
    return ',';
  }
}

// 6. Upload CSV for Analysis (AI/Heuristic)
app.post('/api/upload/csv', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  const results = [];
  const headers = [];
  let rowCount = 0;

  try {
    let delimiter = req.body.delimiter;
    if (!delimiter || delimiter === 'auto') {
      delimiter = detectDelimiter(req.file.path);
    }

    // Handle escaped tab character string
    if (delimiter === '\\t') delimiter = '\t';

    console.log(`Using delimiter: '${delimiter}' for file ${req.file.originalname}`);

    fs.createReadStream(req.file.path)
      .pipe(csv({ separator: delimiter }))
      .on('headers', (headerList) => {
        headerList.forEach(h => headers.push(h));
      })
      .on('data', (data) => {
        if (rowCount < 100) { // Analyze first 100 rows for type inference
          results.push(data);
        }
        rowCount++;
      })
      .on('end', () => {
        // Analyze types and sanitize names
        const suggestions = analyzeCsvStructure(headers, results);
        const tableName = suggestTableName(req.file.originalname);

        // DO NOT DELETE FILE HERE. We need it for the full import.
        // File will be deleted after import or by OS temp cleanup.

        res.json({
          tableName,
          columns: suggestions,
          preview: results.slice(0, 5),
          filePath: req.file.path, // Return path for full import
          delimiter: delimiter,
          totalEstimatedRows: rowCount // This is just what we read so far, but for full file we'd need to read all. 
          // Actually, since we read the whole stream here to count? 
          // No, we should probably stop reading if we just want preview? 
          // But to count rows we need to read all. 
          // For speed, let's just read all here? It might be slow for 100k rows.
          // Let's just return what we have.
        });
      })
      .on('error', (err) => {
        console.error("CSV Parse Error:", err);
        res.status(500).json({ error: "Failed to parse CSV file." });
      });
  } catch (err) {
    console.error("Upload Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 7. Check Table Exists
app.post('/api/check-table', async (req, res) => {
  const { tableName } = req.body;
  try {
    const exists = await db.checkTableExists(tableName);
    res.json({ exists });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Create Table & Import Data
app.post('/api/create-table', async (req, res) => {
  const { tableName, columns, data, dropIfExists, grantToUser, filePath, delimiter } = req.body;
  try {
    if (dropIfExists) {
      await db.dropTable(tableName);
    }

    await db.createTable(tableName, columns);

    // Insert Data
    let totalInserted = 0;

    if (filePath) {
      // FULL IMPORT FROM FILE
      console.log(`Starting full import from ${filePath} into ${tableName}`);

      const batchSize = 1000;
      let batch = [];

      await new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
          .pipe(csv({ separator: delimiter || ';' })) // Use provided delimiter
          .on('data', async (row) => {
            batch.push(row);
            if (batch.length >= batchSize) {
              // Pause stream? csv-parser doesn't easily pause/resume async.
              // Better to accumulate and insert. 
              // WARNING: Async inside 'data' event is tricky.
              // We might flood the DB.
              // Alternative: Use a transform stream or just accumulate and hope for best?
              // For 100k rows, memory might be okay if we don't store ALL.
              // But we can't await inside 'data' easily without pausing.
              // Let's use a simple accumulation and insert at end? No, memory.

              // We will just push to a big array? No.
              // We need to handle backpressure.
              // Since we can't easily do backpressure with this simple setup, 
              // we will accumulate all and insert in chunks? 
              // 100k rows * 1KB = 100MB. It's manageable in memory for Node.js.
              // Let's try reading all into memory and then inserting in batches.
            }
          })
          .on('end', async () => {
            // Actually, let's read everything into memory first to be safe with async inserts
            // This is not ideal for HUGE files (GBs), but for 100k rows it's fine.
            resolve();
          })
          .on('error', reject);
      });

      // Re-reading to process (simpler than handling async stream backpressure manually)
      const allRows = [];
      await new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
          .pipe(csv({ separator: delimiter || ';' }))
          .on('data', (row) => allRows.push(row))
          .on('end', resolve)
          .on('error', reject);
      });

      console.log(`Read ${allRows.length} rows. Inserting in batches...`);

      for (let i = 0; i < allRows.length; i += batchSize) {
        const chunk = allRows.slice(i, i + batchSize);
        await db.insertData(tableName, columns, chunk);
        totalInserted += chunk.length;
        if (i % 10000 === 0) console.log(`Inserted ${i} rows...`);
      }

      // Clean up file
      try { fs.unlinkSync(filePath); } catch (e) { console.error("Failed to delete temp file", e); }

    } else if (data && data.length > 0) {
      // Legacy/Preview import
      await db.insertData(tableName, columns, data);
      totalInserted = data.length;
    }

    // Grant Access (Optional)
    if (grantToUser) {
      try {
        await db.executeQuery(`GRANT ALL ON "${tableName}" TO ${grantToUser}`);
      } catch (grantErr) {
        console.warn("Grant failed:", grantErr.message);
      }
    }

    res.json({ success: true, message: `Tabela criada e ${totalInserted} linhas importadas.` });
  } catch (err) {
    console.error("Create Table Error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

function analyzeCsvStructure(headers, rows) {
  const usedNames = new Set();

  return headers.map(header => {
    // 1. Sanitize & Truncate for Oracle (30 chars)
    let cleanName = header
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove accents
      .replace(/[^a-zA-Z0-9]/g, "_") // Replace special chars with _
      .toUpperCase();

    // Ensure it starts with a letter (Oracle requirement for unquoted identifiers)
    if (!/^[A-Z]/.test(cleanName)) {
      cleanName = 'C_' + cleanName;
    }

    // Truncate to 28 chars to leave room for deduplication suffix
    if (cleanName.length > 28) {
      cleanName = cleanName.substring(0, 28);
    }

    // Deduplicate
    let finalName = cleanName;
    let counter = 1;
    while (usedNames.has(finalName)) {
      finalName = `${cleanName}_${counter}`;
      counter++;
    }
    usedNames.add(finalName);

    // 2. Type Inference
    let isNumber = true;
    let isDate = true;
    let hasData = false;

    for (const row of rows) {
      const val = row[header];
      if (!val || val.trim() === '') continue;
      hasData = true;

      // Check Number (allow commas/dots)
      if (isNaN(Number(val.replace(',', '.')))) isNumber = false;

      // Check Date (simple check)
      if (isNaN(Date.parse(val))) isDate = false;
    }

    if (!hasData) isNumber = false; // Default to String if empty

    let type = 'VARCHAR2(255)';
    if (isNumber) type = 'NUMBER';
    else if (isDate) type = 'DATE';

    return {
      name: finalName,
      type: type,
      originalName: header
    };
  });
}

function suggestTableName(filename) {
  // Remove extension and sanitize
  let name = filename.split('.').slice(0, -1).join('.');
  name = name.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
  if (!/^[A-Z]/.test(name)) name = 'T_' + name;
  return name.substring(0, 30);
}

// Use a regex to avoid path-to-regexp issues in bundled environment
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(rootDir, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
