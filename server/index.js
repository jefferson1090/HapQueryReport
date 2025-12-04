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

const debugLogPath = path.join(os.tmpdir(), 'hap_debug.log');
function debugLog(msg) {
  try {
    fs.appendFileSync(debugLogPath, new Date().toISOString() + ': ' + msg + '\n');
  } catch (e) {
    // ignore
  }
}

debugLog('Starting server...');
debugLog('Node version: ' + process.version);
debugLog('Electron version: ' + process.versions.electron);


const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increased limit for data import

// Determine root directory (handles both dev and pkg executable)
const rootDir = process.pkg ? path.dirname(process.execPath) : __dirname;

// Determine Uploads Directory
let uploadsDir;
if (process.versions.electron || process.env.ELECTRON_RUN_AS_NODE) {
  // If running in Electron, use userData directory (writable)
  try {
    // Fallback to APPDATA if electron module isn't available in this process
    const appData = process.env.APPDATA || (process.platform == 'darwin' ? process.env.HOME + '/Library/Preferences' : process.env.HOME + "/.local/share");
    uploadsDir = path.join(appData, 'HapQueryReport', 'uploads');
  } catch (e) {
    console.error("Failed to determine Electron path, falling back to temp", e);
    uploadsDir = path.join(os.tmpdir(), 'hap-query-report-uploads');
  }
} else {
  // Dev mode or standard Node
  uploadsDir = path.join(rootDir, 'public', 'uploads');
}

console.log(`Using uploads directory: ${uploadsDir}`);

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Serve uploads statically
app.use('/uploads', express.static(uploadsDir));

// Configure storage for attachments
const attachmentStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    // Sanitize filename and add timestamp to prevent collisions
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9]/g, '_');
    cb(null, name + '-' + uniqueSuffix + ext);
  }
});

const uploadAttachment = multer({
  storage: attachmentStorage,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

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

  debugLog(`Initializing Oracle Client from: ${clientPath}`);
  oracledb.initOracleClient({ libDir: clientPath });
  debugLog('Oracle Client initialized successfully');
} catch (err) {
  debugLog('Whoops, you need the Oracle Instant Client installed!');
  debugLog(err.message);
  console.error('Whoops, you need the Oracle Instant Client installed!');
  console.error(err);
}

// Routes

// 1. Connection Test
app.post('/api/connect', async (req, res) => {
  const { user, password, connectString } = req.body;
  try {
    const result = await db.checkConnection({ user, password, connectString });
    res.json({ success: true, message: 'Conexão realizada com sucesso!' });
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
  const { sql, params, limit, filter } = req.body;
  try {
    let finalSql = sql;

    // Server-side filtering (Global search)
    if (filter && typeof filter === 'string' && filter.trim() !== '') {
      // We don't know columns here easily, so we can't do a smart "WHERE col LIKE %val%".
      // But we can try to wrap. However, without column names, we can't construct the WHERE clause.
      // The client needs to send column names or we need to fetch them first.
      // Fetching columns for every query is slow.
      // Alternative: The client sends the filter as a simple string, and we accept it ONLY if we also get a list of columns?
      // Or, we just support the "Column Filters" sent from the UI.
    }

    // Support structured column filters from UI
    if (filter && typeof filter === 'object') {
      const whereClauses = [];
      Object.entries(filter).forEach(([col, val]) => {
        if (val && typeof val === 'string' && val.trim() !== '') {
          // Sanitize column name (basic)
          const safeCol = col.replace(/[^a-zA-Z0-9_]/g, '');
          // Use bind parameters for values would be best, but for now we'll use sanitized injection for simplicity in this wrapper
          // OR better: use a subquery with string matching?
          // Let's use simple string concatenation for the wrapper, assuming the inner query is valid.
          // We need to be careful about SQL injection here.
          // Since we are wrapping, we can use: UPPER("col") LIKE UPPER('%val%')
          // We should escape single quotes in val.
          const safeVal = val.replace(/'/g, "''");
          whereClauses.push(`UPPER("${safeCol}") LIKE UPPER('%${safeVal}%')`);
        }
      });

      if (whereClauses.length > 0) {
        finalSql = `SELECT * FROM (${sql}) WHERE ${whereClauses.join(' AND ')}`;
      }
    }

    const result = await db.executeQuery(finalSql, params || [], limit);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/query/count', async (req, res) => {
  const { sql, params } = req.body;
  try {
    const cleanSql = sql.trim().replace(/;$/, '');
    const countSql = `SELECT COUNT(*) FROM (${cleanSql})`;
    const result = await db.executeQuery(countSql, params || []);
    res.json({ count: result.rows[0][0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Upload SQL
app.post('/api/upload/sql', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado' });
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

// Streaming CSV Export
app.post('/api/export/csv', async (req, res) => {
  const { sql, params, filter } = req.body;
  let conn;
  try {
    let finalSql = sql;

    // Apply Server-side filtering (Same logic as /api/query)
    if (filter && typeof filter === 'object') {
      const whereClauses = [];
      Object.entries(filter).forEach(([col, val]) => {
        if (val && typeof val === 'string' && val.trim() !== '') {
          const safeCol = col.replace(/[^a-zA-Z0-9_]/g, '');
          const safeVal = val.replace(/'/g, "''");
          whereClauses.push(`UPPER("${safeCol}") LIKE UPPER('%${safeVal}%')`);
        }
      });

      if (whereClauses.length > 0) {
        finalSql = `SELECT * FROM (${sql}) WHERE ${whereClauses.join(' AND ')}`;
      }
    }

    const { stream, connection } = await db.getStream(finalSql, params || []);
    conn = connection;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="export_${Date.now()}.csv"`);
    res.write('\ufeff'); // BOM

    stream.on('metadata', (meta) => {
      const headers = meta.map(m => m.name).join(';') + '\n';
      res.write(headers);
    });

    stream.on('data', (row) => {
      const csvRow = row.map(val => {
        if (val === null || val === undefined) return '';
        if (val instanceof Date) return val.toISOString();
        const str = String(val);
        if (str.includes(';') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      }).join(';') + '\n';
      res.write(csvRow);
    });

    stream.on('end', () => {
      res.end();
      conn.close();
    });

    stream.on('error', (err) => {
      console.error("Stream Error:", err);
      if (!res.headersSent) res.status(500).send(err.message);
      try { conn.close(); } catch (e) { }
    });

  } catch (err) {
    console.error("Export Error:", err);
    if (conn) try { await conn.close(); } catch (e) { }
    if (!res.headersSent) res.status(500).json({ error: err.message });
  }
});

// 5.1 Upload Attachment
app.post('/api/upload/attachment', uploadAttachment.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  // Return relative path for frontend use
  const relativePath = `/uploads/${req.file.filename}`;
  res.json({ url: relativePath, filename: req.file.originalname, size: req.file.size });
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

// 6.1 Analyze Local CSV (IPC/Native Dialog)
app.post('/api/analyze-local-csv', async (req, res) => {
  const { filePath } = req.body;
  if (!filePath) {
    return res.status(400).json({ error: 'No file path provided' });
  }

  const results = [];
  const headers = [];
  let rowCount = 0;

  try {
    let delimiter = req.body.delimiter;
    if (!delimiter || delimiter === 'auto') {
      delimiter = detectDelimiter(filePath);
    }

    if (delimiter === '\\t') delimiter = '\t';

    console.log(`Analyzing local file: ${filePath} with delimiter: '${delimiter}'`);

    fs.createReadStream(filePath)
      .pipe(csv({ separator: delimiter }))
      .on('headers', (headerList) => {
        headerList.forEach(h => headers.push(h));
      })
      .on('data', (data) => {
        if (rowCount < 100) {
          results.push(data);
        }
        rowCount++;
      })
      .on('end', () => {
        const suggestions = analyzeCsvStructure(headers, results);
        const tableName = suggestTableName(path.basename(filePath));

        res.json({
          tableName,
          columns: suggestions,
          preview: results.slice(0, 5),
          filePath: filePath,
          delimiter: delimiter,
          totalEstimatedRows: rowCount
        });
      })
      .on('error', (err) => {
        console.error("CSV Parse Error:", err);
        res.status(500).json({ error: "Failed to parse CSV file." });
      });
  } catch (err) {
    console.error("Analyze Error:", err);
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

// Global state for active import jobs
const activeJobs = {};

// 8. Create Table & Import Data
app.post('/api/create-table', async (req, res) => {
  const { tableName, columns, data, dropIfExists, grantToUser, filePath, delimiter, jobId } = req.body;

  if (jobId) {
    activeJobs[jobId] = { progress: 0, status: 'Starting', cancelled: false, totalRows: 0, insertedRows: 0 };
  }

  try {
    if (dropIfExists) {
      await db.dropTable(tableName);
    }

    await db.createTable(tableName, columns);

    // Insert Data
    let totalInserted = 0;

    if (filePath) {
      // FULL IMPORT FROM FILE (STREAMING)
      console.log(`Starting full streaming import from ${filePath} into ${tableName}`);

      const batchSize = 2000;
      let batch = [];

      const stream = fs.createReadStream(filePath)
        .pipe(csv({ separator: delimiter || ';' }));

      for await (const row of stream) {
        // Check Cancellation
        if (jobId && activeJobs[jobId].cancelled) {
          console.log(`Job ${jobId} cancelled.`);
          stream.destroy();
          if (jobId) activeJobs[jobId].status = 'Cancelled';
          return res.json({ success: false, message: 'Importação cancelada pelo usuário.' });
        }

        batch.push(row);

        if (batch.length >= batchSize) {
          await db.insertData(tableName, columns, batch);
          totalInserted += batch.length;
          batch = [];

          if (jobId) {
            activeJobs[jobId].insertedRows = totalInserted;
            activeJobs[jobId].status = `Inserindo dados... (${totalInserted} linhas)`;
          }

          if (totalInserted % 10000 === 0) console.log(`Inserted ${totalInserted} rows...`);
        }
      }

      // Insert remaining rows
      if (batch.length > 0) {
        await db.insertData(tableName, columns, batch);
        totalInserted += batch.length;
        if (jobId) activeJobs[jobId].insertedRows = totalInserted;
      }

      console.log(`Finished import. Total rows: ${totalInserted}`);

      // Clean up file if it's in uploads directory
      if (filePath.includes('oracle-lowcode-uploads') || filePath.includes('hap-query-report-uploads')) {
        try { fs.unlinkSync(filePath); } catch (e) { console.error("Failed to delete temp file", e); }
      }

    } else if (data && data.length > 0) {
      // Legacy/Preview import
      await db.insertData(tableName, columns, data);
      totalInserted = data.length;
    }

    // CREATE INDICES (New Feature)
    if (jobId) activeJobs[jobId].status = 'Criando índices...';
    console.log(`Creating indices for table ${tableName}...`);

    for (const col of columns) {
      const shortTable = tableName.substring(0, 10);
      const shortCol = col.name.substring(0, 10);
      const rand = Math.floor(Math.random() * 1000);
      const indexName = `IDX_${shortTable}_${shortCol}_${rand}`.toUpperCase().substring(0, 30);

      try {
        await db.executeQuery(`CREATE INDEX "${indexName}" ON "${tableName}" ("${col.name}")`);
      } catch (idxErr) {
        console.warn(`Failed to create index on ${col.name}:`, idxErr.message);
      }
    }

    // Grant Access (Optional)
    if (grantToUser) {
      try {
        await db.executeQuery(`GRANT ALL ON "${tableName}" TO ${grantToUser}`);
      } catch (grantErr) {
        console.warn("Grant failed:", grantErr.message);
      }
    }

    if (jobId) {
      activeJobs[jobId].status = 'Concluído';
      activeJobs[jobId].progress = 100;
    }

    res.json({ success: true, message: `Tabela criada, ${totalInserted} linhas importadas e índices gerados.`, totalInserted: totalInserted });
  } catch (err) {
    console.error("Create Table Error:", err);
    if (jobId) {
      activeJobs[jobId].status = 'Erro';
      activeJobs[jobId].error = err.message;
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

// 8.1 Import Status Endpoint
app.get('/api/import-status/:jobId', (req, res) => {
  const { jobId } = req.params;
  if (activeJobs[jobId]) {
    res.json(activeJobs[jobId]);
  } else {
    res.status(404).json({ error: 'Job not found' });
  }
});

// 8.2 Cancel Import Endpoint
app.post('/api/cancel-import/:jobId', (req, res) => {
  const { jobId } = req.params;
  if (activeJobs[jobId]) {
    activeJobs[jobId].cancelled = true;
    res.json({ success: true, message: 'Cancelamento solicitado.' });
  } else {
    res.status(404).json({ error: 'Job not found' });
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

  // Prefix with TT_ as requested
  name = 'TT_' + name;

  return name.substring(0, 30);
}

// Serve static files from the public directory
app.use(express.static(path.join(rootDir, 'public')));

// Use a regex to avoid path-to-regexp issues in bundled environment
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(rootDir, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
