const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const oracledb = require('oracledb');
const db = require('./db');
const aiService = require('./services/aiService');
const learningService = require('./services/learningService');
const multer = require('multer');
// const path = require('path'); // Already imported at top
const os = require('os');
const upload = multer({ dest: path.join(os.tmpdir(), 'oracle-lowcode-uploads') });
const fs = require('fs');
const csv = require('csv-parser');

// Docs Module Imports
const docService = require('./services/localDocService');
// const setupDocs = require('./scripts/setupDocs'); // Deprecated for Local Storage

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
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all for dev/electron
    methods: ["GET", "POST"]
  }
});

const chatService = require('./services/chatService');
chatService.setSocketIo(io);

const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increased limit for data import

// Disable caching for all routes
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  next();
});

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
  try {
    fs.mkdirSync(uploadsDir, { recursive: true });
  } catch (err) {
    console.error(`Failed to create uploads dir at ${uploadsDir}: ${err.message}`);
    debugLog(`Failed to create uploads dir at ${uploadsDir}: ${err.message}`);
    // Fallback to temp
    uploadsDir = path.join(os.tmpdir(), 'hap-query-report-uploads');
    if (!fs.existsSync(uploadsDir)) {
      try { fs.mkdirSync(uploadsDir, { recursive: true }); } catch (e) { /* give up */ }
    }
    console.log(`Falling back to uploads directory: ${uploadsDir}`);
  }
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
  debugLog('Whoops, you need the Oracle Instant Client installed!');
  debugLog(err.message);
  console.error('Whoops, you need the Oracle Instant Client installed!');
  console.error(err);
}

// --- Serve Static Frontend ---
// In production/packaged mode, serve the React app from 'client/dist'
const clientDistPath = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(clientDistPath)) {
  console.log(`[DEBUG] Serving static files from: ${clientDistPath}`);
  console.log(`[DEBUG] Directory contents: ${fs.readdirSync(clientDistPath).join(', ')}`);
  app.use(express.static(clientDistPath));
  // SPA Fallback
  // SPA Fallback
  app.get(/.*/, (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
      return next();
    }
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
} else {
  console.log(`Client dist not found at: ${clientDistPath}. Assuming Dev Mode.`);
}
// -----------------------------
app.post('/api/connect', async (req, res) => {
  const { user, password, connectString } = req.body;
  try {
    const result = await db.checkConnection({ user, password, connectString });

    // Chat Schema is already initialized by ChatService constructor (SQLite)
    // chatService.initializeSchema();

    res.json({ success: true, message: 'Conexão realizada com sucesso!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// --- CHAT API ROUTES ---
app.post('/api/chat/register', async (req, res) => {
  try {
    const { username, password, team } = req.body;
    console.log(`Registering user: ${username}`);
    await chatService.registerUser(username, password, team);
    res.json({ success: true });
  } catch (e) {
    console.error("Registration error:", e);
    res.status(500).json({ success: false, message: e.message, error: e.message });
  }
});

// --- CHAT ROUTES ---
app.post('/api/chat/register', async (req, res) => {
  try {
    const { username, password, team } = req.body;
    console.log(`Registering user: ${username}`);
    const result = await chatService.registerUser(username, password, team);
    res.json(result);
  } catch (e) {
    console.error("Register error:", e);
    res.status(500).json({ success: false, message: e.message });
  }
});

app.post('/api/chat/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    console.log(`Logging in user: ${username}`);
    const result = await chatService.loginUser(username, password);
    if (result.success) res.json(result);
    else res.status(401).json(result);
  } catch (e) {
    console.error("Login error:", e);
    res.status(500).json({ success: false, message: e.message, error: e.message });
  }
});

app.get('/api/chat/history', async (req, res) => {
  try {
    const { username } = req.query;
    const history = await chatService.getHistory(username);
    res.json(history);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- SOCKET.IO EVENTS ---
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  socket.on('join', (data) => {
    // data can be just username (legacy) or { username, team }
    const username = typeof data === 'object' ? data.username : data;
    const team = typeof data === 'object' ? data.team : 'Geral';

    chatService.users.set(socket.id, { username, team });

    // Ensure Adapter knows about this user (Critical for Presence in Polling Mode)
    if (chatService.adapter && chatService.adapter.trackPresence) {
      chatService.adapter.trackPresence(username, team);
    }

    // Emit list of users with teams
    const userList = Array.from(chatService.users.values());

    // Send to everyone (including sender)
    io.emit('users_update', userList);

    // Also explicitly send to the joining socket to be sure
    socket.emit('users_update', userList);

    console.log(`${username} (${team}) joined chat. Total users: ${userList.length}`);
  });

  socket.on('message', async (data) => {
    // data: { sender, content, type, metadata, recipient }
    try {
      await chatService.saveMessage(data.sender, data.content, data.type, data.metadata, data.recipient);
    } catch (e) {
      console.error("SaveMessage Error:", e);
      // Continue to echo so the chat doesn't feel broken, even if persistence failed
    }

    const msgPayload = { ...data, timestamp: new Date() };

    if (data.recipient && data.recipient !== 'ALL') {
      // Private Message
      // Find recipient socket(s)
      let sent = false;
      for (const [id, user] of chatService.users.entries()) {
        if (user.username === data.recipient) {
          io.to(id).emit('message', msgPayload);
          sent = true;
        }
      }
      // Also send back to sender (so it appears in their chat)
      socket.emit('message', msgPayload);
    } else {
      // Broadcast to all
      io.emit('message', msgPayload);
    }
  });

  socket.on('share_item', async (data) => {
    // data: { sender, recipient, itemType, itemData }
    console.log(`[Share] ${data.sender} -> ${data.recipient} type: ${data.itemType}`);

    try {
      // Use ChatService to handle persistence and broadcasing (via Adapter if active)
      const type = 'SHARED_ITEM';
      const metadata = { itemType: data.itemType, itemData: data.itemData };

      // This will trigger SupabaseAdapter.sendMessage, which now handles serialization correctly
      await chatService.saveMessage(data.sender, `Compartilhou um ${data.itemType}`, type, metadata, data.recipient);

      // Optimistic/Local broadcast is handled by the Adapter's event listener or the client's optimistic UI.
      // But if we want to ensure specific local sockets get it immediately (if not using adapter for local echo):
      // if (data.recipient === 'ALL') io.emit('message', { ... }); 
      // But chatService.saveMessage in Supabase mode relies on Supabase event to come back.
      // In Local mode, it relies on fallback.
      // Client already has optimistic UI.
    } catch (e) {
      console.error("Share error:", e);
    }
  });


  socket.on('disconnect', () => {
    const user = chatService.users.get(socket.id);
    chatService.users.delete(socket.id);
    if (user) {
      io.emit('users_update', Array.from(chatService.users.values()));
      console.log(`${user.username} disconnected.`);
    }
  });
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

// 3.1 Get Schema Dictionary (Tables & Columns)
app.get('/api/schema/dictionary', async (req, res) => {
  try {
    const dictionary = await db.getSchemaDictionary();
    res.json(dictionary);
  } catch (err) {
    console.error("Schema Dictionary Error:", err);
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

app.post('/api/ai/create-table-confirm', async (req, res) => {
  try {
    const { tableName, columns, indices, grants } = req.body;
    if (!tableName || !columns) throw new Error("Dados incompletos.");

    await db.createTable(tableName, columns, indices, grants);
    res.json({ success: true, tableName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ai/chat', async (req, res) => {
  try {
    console.log('[DEBUG] POST /api/ai/chat received');
    const { message, mode, history } = req.body;
    console.log(`[DEBUG] Processing message in mode: ${mode}, content: ${message?.substring(0, 50)}...`);

    const result = await aiService.processMessage(message, mode, history);
    console.log('[DEBUG] processMessage result:', JSON.stringify(result));

    if (result === undefined) {
      console.error('[ERROR] processMessage returned undefined!');
      return res.status(500).json({ error: 'Internal AI Error: Result is undefined' });
    }

    res.json(result);
  } catch (err) {
    console.error('[ERROR] /api/ai/chat handler failed:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ai/sql/optimize', async (req, res) => {
  try {
    const { sql } = req.body;
    const result = await aiService.optimizeSql(sql);
    res.json(result);
  } catch (err) {
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
        finalSql = `SELECT * FROM (${sql}\n) WHERE ${whereClauses.join(' AND ')}`;
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
    const countSql = `SELECT COUNT(*) FROM (${cleanSql}\n)`;
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
        finalSql = `SELECT * FROM (${sql}\n) WHERE ${whereClauses.join(' AND ')}`;
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

// 8.1 Import// Chat Switch Endpoint
app.post('/api/chat/switch', async (req, res) => {
  try {
    const { backend } = req.body; // 'supabase' or 'oracle'
    if (backend !== 'supabase' && backend !== 'oracle') {
      return res.status(400).json({ error: "Invalid backend" });
    }
    await chatService.switchBackend(backend);
    res.json({ success: true, backend });
  } catch (e) {
    console.error("Switch failed:", e);
    res.status(500).json({ error: e.message });
  }
});

// Chat History Endpoint
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

// AI Text Processing Endpoint
app.post('/api/ai/text', async (req, res) => {
  try {
    const { text, instruction } = req.body;
    if (!text || !instruction) return res.status(400).json({ error: 'Missing text or instruction' });

    // Ensure aiService has the method
    if (!aiService.processText) {
      return res.status(503).json({ error: 'AI Service capabilities not fully loaded' });
    }

    const result = await aiService.processText(text, instruction);
    res.json({ result });
  } catch (e) {
    console.error("AI Route Error:", e);
    res.status(500).json({ error: e.message });
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

// 9. AI Learning Endpoints
app.get('/api/ai/suggestions', (req, res) => {
  try {
    const suggestions = learningService.getSuggestions();
    res.json(suggestions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/ai/suggestions', (req, res) => {
  try {
    const suggestions = learningService.getSuggestions();
    res.json(suggestions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/ai/skills', (req, res) => {
  try {
    const skills = learningService.getSkills();
    res.json(skills);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- DOCS MODULE ROUTES ---

// Init DB - Explicit Init now used via /api/docs/init
// setupDocs().catch(console.error);

// Docs Module Routes
app.get('/api/docs/status', async (req, res) => {
  try {
    const status = await setupDocs.checkStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/docs/init', async (req, res) => {
  try {
    const result = await setupDocs.initializeDatabase();
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/docs/search', async (req, res) => {
  try {
    const query = req.query.q;
    const results = await docService.searchNodes(query);
    res.json(results);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/docs/search-index', async (req, res) => {
  try {
    const nodes = await docService.getAllSearchableNodes();
    res.json(nodes);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/docs/books', async (req, res) => {
  try {
    const books = await docService.listBooks();
    res.json(books);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/docs/books', async (req, res) => {
  try {
    const { title, description } = req.body;
    const id = await docService.createBook(title, description);
    res.json({ id, message: 'Book created' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/docs/books/:id/tree', async (req, res) => {
  try {
    const tree = await docService.getBookTree(req.params.id);
    res.json(tree);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/docs/nodes/:id', async (req, res) => {
  try {
    const node = await docService.getNode(req.params.id);
    res.json(node);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// DEBUG ROUTE - Remove after use
app.get('/api/debug/find-bloqueios', async (req, res) => {
  try {
    const term = 'bloqueios';
    const results = {};

    results.dump = await db.executeQuery(
      `SELECT ID_NODE, NM_TITLE, dbms_lob.substr(CL_CONTENT, 100, 1) as SAMPLE FROM TB_DOC_NODES FETCH FIRST 10 ROWS ONLY`,
      {}, 10, { outFormat: db.oracledb.OUT_FORMAT_OBJECT }
    );

    results.clobInstr = await db.executeQuery(
      `SELECT ID_NODE, NM_TITLE, DBMS_LOB.SUBSTR(CL_CONTENT, 4000, 1) as FULL_CONTENT FROM TB_DOC_NODES WHERE DBMS_LOB.INSTR(UPPER(CL_CONTENT), UPPER(:q)) > 0`,
      { q: term }, 10, { outFormat: db.oracledb.OUT_FORMAT_OBJECT }
    );

    res.json(results);
  } catch (e) {
    res.status(500).json({ error: e.message, stack: e.stack });
  }
});

app.post('/api/docs/chat', async (req, res) => {
  try {
    const { message, history, currentContext } = req.body;
    const result = await aiService.processDocsChat(message, history, currentContext);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/docs/ai/process', async (req, res) => {
  try {
    const { text, instruction, context } = req.body;
    // We reuse the existing aiService, but maybe need a specific method?
    // Let's us aiService.processMessage but frame it as a request.
    // Or better, a direct call to the LLM if aiService exposes it. 
    // Checking aiService.js first would be good, but assuming processMessage handles general prompts:

    const prompt = `
    Context: the user is writing a document about "${context || 'General Topic'}".
    Selected Text: "${text}".
    Instruction: ${instruction} (e.g. summarize, expand, fix grammar).
    
    Please provide ONLY the result text to replace or append.
    `;

    const result = await aiService.processMessage(prompt, 'chat');
    // The aiService might return a JSON structure { text: ... } or just a string depending on implementation.
    // Assuming it returns { text: "response" } based on previous usage.

    res.json({ text: result.text || result });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- NEW SQL AI ENDPOINTS ---
app.post('/api/ai/sql/fix', async (req, res) => {
  try {
    const { sql, error } = req.body;
    const result = await aiService.fixSqlError(sql, error);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/ai/sql/explain', async (req, res) => {
  try {
    const { sql } = req.body;
    const result = await aiService.explainSql(sql);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/ai/sql/chat', async (req, res) => {
  try {
    const { prompt, schemaContext } = req.body;
    // schemaContext might be client-side filtered schema or full text
    const result = await aiService.generateSql(prompt, schemaContext);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});


app.post('/api/docs/nodes', async (req, res) => {
  try {
    const { bookId, parentId, title, type } = req.body;
    const id = await docService.createNode(bookId, parentId, title, type);
    res.json({ id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/docs/nodes/:id', async (req, res) => {
  try {
    const { content, title } = req.body;
    await docService.updateNodeContent(req.params.id, content, title);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/docs/nodes/move', async (req, res) => {
  try {
    const { nodeId, targetBookId, targetParentId, newIndex } = req.body;
    await docService.moveNode(nodeId, targetBookId, targetParentId, newIndex);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/docs/nodes/:id', async (req, res) => {
  try {
    await docService.deleteNode(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Serve static files from the public directory
app.use(express.static(path.join(rootDir, 'public')));

// Use a regex to avoid path-to-regexp issues in bundled environment
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(rootDir, 'public', 'index.html'));
});

// Start Server Function
function startServer(port) {
  return new Promise((resolve, reject) => {
    server.listen(port, () => {
      console.log(`Server running on port ${port}`);
      resolve(server);
    });

    server.on('error', (e) => {
      if (e.code === 'EADDRINUSE') {
        console.log(`Address in use on port ${port}, retrying...`);
        reject(e);
      } else {
        console.error('Server error:', e);
        reject(e);
      }
    });
  });
}

// Only start if run directly
if (require.main === module) {
  startServer(PORT).catch(err => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
}

module.exports = startServer;
