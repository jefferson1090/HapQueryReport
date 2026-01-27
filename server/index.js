
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const oracledb = require('oracledb');
const db = require('./db');
const aiService = require('./services/aiService');
const agentService = require('./services/agentService');
const neuralService = require('./services/neuralService');

const learningService = require('./services/learningService');
const chatService = require('./services/chatService');
// const docsChatService = require('./services/docsChatService');
const knowledgeService = require('./services/knowledgeService');
const { parseSigoSql } = require('./services/sigoSqlParser');
const multer = require('multer');
// const path = require('path'); // Already imported at top
const os = require('os');
const upload = multer({ dest: path.join(os.tmpdir(), 'oracle-lowcode-uploads') });
const fs = require('fs');
const csv = require('csv-parser');
const configManager = require('./services/ConfigManager');

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

// Initialize Config Sync (Async - non-blocking for UI, but important for AI keys)
// 1. Load Local Config Immediately
try {
  const localConfig = configManager.get('groqApiKey') ? configManager.config : configManager.loadLocalConfig();
  if (localConfig.groqApiKey) {
    aiService.updateConfig(localConfig);
    console.log('Local config loaded into AI Service.');
  }
} catch (e) { console.error('Error loading local config:', e); }

// 2. Sync Remote (Async)
configManager.syncResponse().then((newConfig) => {
  debugLog('Config Sync completed.');
  console.log('Config Sync completed.');
  if (newConfig) {
    aiService.updateConfig(newConfig);
  }
}).catch(console.error);



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

chatService.setSocketIo(io);

const PORT = process.env.PORT || 3001;

const compression = require('compression');

app.use(cors());
app.use(compression()); // Enable GZIP compression
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
    console.error(`Failed to create uploads dir at ${uploadsDir}: ${err.message} `);
    debugLog(`Failed to create uploads dir at ${uploadsDir}: ${err.message} `);
    // Fallback to temp
    uploadsDir = path.join(os.tmpdir(), 'hap-query-report-uploads');
    if (!fs.existsSync(uploadsDir)) {
      try { fs.mkdirSync(uploadsDir, { recursive: true }); } catch (e) { /* give up */ }
    }
    console.log(`Falling back to uploads directory: ${uploadsDir} `);
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

  debugLog(`Initializing Oracle Client from: ${clientPath} `);
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
// In production/packaged mode, assets are copied to 'public' folder by copy_assets.ps1
// In dev/monorepo mode, they might be in '../client/dist'
const possiblePaths = [
  path.join(__dirname, 'public'), // Production (copied)
  path.join(__dirname, '..', 'client', 'dist') // Dev (sibling)
];

let clientDistPath = null;
for (const p of possiblePaths) {
  if (fs.existsSync(p) && fs.existsSync(path.join(p, 'index.html'))) {
    clientDistPath = p;
    break;
  }
}

if (clientDistPath) {
  console.log(`[DEBUG] Serving static files from: ${clientDistPath}`);
  try {
    console.log(`[DEBUG] Directory contents: ${fs.readdirSync(clientDistPath).join(', ')}`);
  } catch (e) { /* ignore */ }

  app.use(express.static(clientDistPath));

  // SPA Fallback
  app.get(/.*/, (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) {
      return next();
    }
    console.log(`[DEBUG] Serving index.html for path: ${req.path}`);
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
} else {
  console.error('[ERROR] Could not find client build! Checked:', possiblePaths);
  app.get('/', (req, res) => {
    res.send('Frontend build not found. Please run build script.');
  });
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
    console.log(`Registering user: ${username} `);
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
    console.log(`Registering user: ${username} `);
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
    console.log(`Logging in user: ${username} `);
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

// --- SYSTEM ROUTES ---
app.get('/api/config/info', (req, res) => {
  res.json({
    channel: configManager.getChannel(),
    version: process.env.npm_package_version || '2.0.0'
  });
});

app.get('/api/ai/status', async (req, res) => {
  try {
    const status = await aiService.testConnection();
    res.json({
      ...status,
      hasKey: !!aiService.apiKey,
      model: aiService.modelName
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});


// --- CHAT SERVICE SETUP ---
if (chatService.setStatusHandler) {
  chatService.setStatusHandler((status) => {
    console.log("[Index] Broadcasting backend status:", status);
    io.emit('backend_status', status);
  });
}

// --- SOCKET.IO EVENTS ---
io.on('connection', (socket) => {
  console.log('New client connected:', socket.id);

  socket.on('join', (data) => {
    // data can be just username (legacy) or { username, team }
    const username = typeof data === 'object' ? data.username : data;
    const team = typeof data === 'object' ? data.team : 'Geral';

    console.log(`[DEBUG] Socket JOIN received: ${username} (${team}) ID: ${socket.id} `);

    chatService.users.set(socket.id, { username, team });

    // Ensure Adapter knows about this user (Critical for Presence in Polling Mode)
    if (chatService.adapter && chatService.adapter.trackPresence) {
      chatService.adapter.trackPresence(username, team);
    }

    // Emit list of users with teams
    const userList = Array.from(chatService.users.values());

    // Send to everyone (including sender)
    io.emit('update_user_list', userList);

    // Also explicitly send to the joining socket to be sure
    socket.emit('update_user_list', userList);

    console.log(`${username} (${team}) joined chat.Total users: ${userList.length} `);
  });

  // Typing Indicators
  socket.on('typing', (data) => {
    socket.broadcast.emit('typing', data); // data: { username }
  });

  socket.on('stop_typing', (data) => {
    socket.broadcast.emit('stop_typing', data);
  });

  socket.on('mark_read', async (data) => {
    try {
      if (data.messageIds && data.messageIds.length > 0) {
        await chatService.markAsRead(data.messageIds);

        // Broadcast update to Senders (Simpler to broadcast to all, clients filter by ID)
        const readAt = new Date().toISOString();
        data.messageIds.forEach(id => {
          io.emit('message_update', { id, read_at: readAt });
        });
      }
    } catch (e) {
      console.error("MarkRead Error:", e);
    }
  });

  socket.on('message', async (data) => {
    // data: { sender, content, type, metadata, recipient }
    let msgPayload;
    try {
      msgPayload = await chatService.saveMessage(data.sender, data.content, data.type, data.metadata, data.recipient);
    } catch (e) {
      console.error("SaveMessage Error:", e);
      // Fallback
      msgPayload = { ...data, timestamp: new Date() };
    }

    // Ensure payload has everything
    if (!msgPayload) msgPayload = { ...data, timestamp: new Date() };

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
      // Also send back to sender (so it confirms delivery/persistence)
      socket.emit('message', msgPayload);
    } else {
      // Broadcast to all
      io.emit('message', msgPayload);
    }
  });


  socket.on('share_item', async (data) => {
    // data: { sender, recipient, itemType, itemData }
    console.log(`[Share] ${data.sender} -> ${data.recipient} type: ${data.itemType} `);

    try {
      // Use ChatService to handle persistence and broadcasing (via Adapter if active)
      const type = 'SHARED_ITEM';
      const metadata = { itemType: data.itemType, itemData: data.itemData };

      // This will trigger SupabaseAdapter.sendMessage, which now handles serialization correctly
      await chatService.saveMessage(data.sender, `Compartilhou um ${data.itemType} `, type, metadata, data.recipient);

    } catch (e) {
      console.error("Share error:", e);
    }
  });

  // --- NEW HANDLERS FOR REAL-TIME SYNC ---

  socket.on('reminder_update', (data) => {
    // data: { reminder, sender }
    const reminder = data.reminder;
    const allowedUsers = new Set();

    // 1. Authorize Creator/Sender
    if (data.sender) allowedUsers.add(data.sender);
    if (reminder.sharedBy) allowedUsers.add(reminder.sharedBy);

    // 2. Authorize Shared Recipients
    if (Array.isArray(reminder.sharedWith)) {
      reminder.sharedWith.forEach(u => allowedUsers.add(typeof u === 'string' ? u : u.username));
    }

    // 3. Selective Broadcast
    // Iterate all connected sockets and send ONLY to authorized users
    for (const [socketId, user] of chatService.users.entries()) {
      // If user is authorized OR if it's explicitly public (future proofing)
      if (allowedUsers.has(user.username)) {
        io.to(socketId).emit('reminder_update', data);
      }
    }

    // Debug log for privacy check
    console.log(`[Privacy] Reminder ${reminder.id} update sent to ${[...allowedUsers].join(', ')}`);
  });

  socket.on('message_reaction', async (data) => {
    // data: { messageId, emoji, username }
    console.log(`[Socket] Received reaction from ${data.username}: ${data.emoji} on msg ${data.messageId} `);
    try {
      await chatService.addReaction(data.messageId, data.emoji, data.username);
      // Broadcast reaction to update UI
      io.emit('message_reaction', data);
      console.log(`[Socket] Broadcasted reaction for ${data.messageId}`);
    } catch (e) {
      console.error("Reaction error:", e);
    }
  });

  socket.on('mark_read', async (data) => {
    // data: { messageIds, username }
    if (!data.messageIds || data.messageIds.length === 0) return;
    try {
      await chatService.markAsRead(data.messageIds); // This triggers adapter update -> listener -> emit
      console.log(`[Socket] Marked ${data.messageIds.length} msgs as read by ${data.username} `);
    } catch (e) {
      console.error("MarkRead error:", e);
    }
  });


  socket.on('disconnect', () => {
    const user = chatService.users.get(socket.id);
    chatService.users.delete(socket.id);
    if (user) {
      io.emit('update_user_list', Array.from(chatService.users.values()));
      console.log(`${user.username} disconnected.`);
    }
  });
});

// Helper to get connection params from request
const getDbParams = (req) => {
  // 1. Try Header (JSON encoded)
  if (req.headers['x-db-connection']) {
    try {
      return JSON.parse(req.headers['x-db-connection']);
    } catch (e) {
      console.error("Failed to parse x-db-connection header:", e);
    }
  }
  // 2. Try Body (for POST) - optional, but header is standard
  if (req.body && req.body.connection) {
    return req.body.connection;
  }
  // 3. Fallback to null (db.js will try global or error)
  return null;
};

// 2. List Tables
app.get('/api/tables', async (req, res) => {
  try {
    const search = req.query.search || '';
    const dbParams = getDbParams(req);
    const tables = await db.getTables(search, dbParams);
    res.json(tables);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. List Columns
app.get('/api/columns/:table', async (req, res) => {
  try {
    const dbParams = getDbParams(req);
    const columns = await db.getColumns(req.params.table, dbParams);
    res.json(columns);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3.1 Get Schema Dictionary (Tables & Columns)
app.get('/api/schema/dictionary', async (req, res) => {
  try {
    const dbParams = getDbParams(req);
    const dictionary = await db.getSchemaDictionary(dbParams);
    res.json(dictionary);
  } catch (err) {
    console.error("Schema Dictionary Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 4. Execute Query
app.post('/api/export', async (req, res) => {
  // ... (Export logic is handled client-side now, but keeping this as backup/legacy)
  try {
    // Lazy load json2csv to prevent startup crashes if dependency issues exist
    const { Parser } = require('json2csv');
    const { sql, params, format } = req.body;
    const dbParams = getDbParams(req);
    const result = await db.executeQuery(sql, params, 1000, {}, dbParams);

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
    const dbParams = getDbParams(req);
    if (!tableName || !columns) throw new Error("Dados incompletos.");

    await db.createTable(tableName, columns, indices, grants, dbParams);
    res.json({ success: true, tableName });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ... (AI Chat Code Omitted - No DB access there yet) ...
app.post('/api/ai/chat', async (req, res) => {
  try {
    console.log('[DEBUG] POST /api/ai/chat received');
    const { message, mode, history, userId } = req.body;
    console.log(`[DEBUG] Processing message in mode: ${mode}, user: ${userId}, content: ${message?.substring(0, 50)}...`);

    const result = await aiService.processMessage(message, mode, history, userId);
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

// --- AI Chat V3 Routes ---

app.get('/api/chat/ai/sessions', async (req, res) => {
  try {
    const sessions = chatService.getAiSessions();
    res.json(sessions);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/chat/ai/sessions', async (req, res) => {
  try {
    const { title } = req.body;
    const session = chatService.createAiSession(title);
    res.json(session);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/chat/ai/sessions/:id', async (req, res) => {
  try {
    const history = chatService.getAiHistory(req.params.id);
    res.json(history);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete('/api/chat/ai/sessions/:id', async (req, res) => {
  try {
    chatService.deleteAiSession(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/chat/ai/message', async (req, res) => {
  try {
    const { sessionId, role, content } = req.body;
    const msg = chatService.saveAiMessage(sessionId, role, content);
    res.json(msg);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/query', async (req, res) => {
  const { sql, params, limit, offset, filter } = req.body;
  const dbParams = getDbParams(req);
  console.log('[API] /api/query called with SQL:', sql);
  try {
    let finalSql = sql;

    // Server-side filtering (Global search)
    if (filter && typeof filter === 'string' && filter.trim() !== '') {
      // We don't know columns here easily, so we can't do a smart "WHERE col LIKE %val%".
    }

    // Support structured column filters from UI
    if (filter && typeof filter === 'object') {
      const whereClauses = [];
      Object.entries(filter).forEach(([col, val]) => {
        if (val && typeof val === 'string' && val.trim() !== '') {
          // Sanitize column name (basic)
          const safeCol = col.replace(/[^a-zA-Z0-9_]/g, '');
          // Escape single quotes
          const safeVal = val.replace(/'/g, "''");
          whereClauses.push(`UPPER("${safeCol}") LIKE UPPER('%${safeVal}%')`);
        }
      });

      if (whereClauses.length > 0) {
        finalSql = `SELECT * FROM(${sql}\n) WHERE ${whereClauses.join(' AND ')} `;
      }
    }

    console.log(`[API] Executing query... (Limit: ${limit}, Offset: ${offset})`);
    const result = await db.executeQuery(finalSql, params || [], limit, { offset }, dbParams);
    console.log(`[API] Query executed. Rows: ${result.rows ? result.rows.length : 0}`);

    res.json(result);
  } catch (err) {
    console.error('[API] /api/query failed:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/explain', async (req, res) => {
  const { sql, params } = req.body;
  const dbParams = getDbParams(req);
  console.log('[API] /api/explain called');
  try {
    const planLines = await db.getExplainPlan(sql, params, dbParams);
    res.json({ lines: planLines });
  } catch (err) {
    console.error('[API] /api/explain failed:', err);
    res.status(500).json({ error: err.message });
  }
});



app.post('/api/verify-missing', async (req, res) => {
  const { tableName, columnName, values } = req.body;
  const dbParams = getDbParams(req);

  // Check required params
  if (!tableName || !columnName || !values || !Array.isArray(values) || values.length === 0) {
    return res.json({ missingItems: [], count: 0 });
  }

  try {
    console.log(`[API] /api/verify-missing called for ${tableName}.${columnName} with ${values.length} items.`);

    // 1. Prepare unique list
    const uniqueValues = [...new Set(values.map(v => String(v).trim()).filter(v => v !== ''))];
    if (uniqueValues.length === 0) return res.json({ missingItems: [], count: 0 });

    // 2. Build Efficient SQL (Tuple IN)
    const col = columnName; // Expecting safe column name or sanitize if needed
    let whereClause = '';

    // Simple heuristic: treat as string unless proven otherwise. 
    // For verify, usually used for ID lists or Codes which are strings or safe numbers.
    // We will stick to string quoting to be safe, unless col is known number?
    // Let's assume string for general robustness with 'Tuples'.

    if (uniqueValues.length > 1000) {
      const tuples = uniqueValues.map(v => `('${v.replace(/'/g, "''")}', '0')`).join(',');
      whereClause = `(${col}, '0') IN (${tuples})`;
    } else {
      const quoted = uniqueValues.map(v => `'${v.replace(/'/g, "''")}'`).join(',');
      whereClause = `${col} IN (${quoted})`;
    }

    const sql = `SELECT DISTINCT ${col} FROM ${tableName} WHERE ${whereClause}`;

    // 3. Execute with High Limit
    // We fetching "found" items to diff against "uniqueValues"
    // Limit 1M is safe for Node server memory (1M strings is maybe 100MB RAM, feasible).
    const limit = 1000000;

    // Not using db.executeQuery with offset, just raw execute if possible or reuse executeQuery with 'all'
    // executeQuery handles formatting return, which is fine.
    const result = await db.executeQuery(sql, [], limit, {}, dbParams);

    // 4. Calculate Difference
    const foundSet = new Set(result.rows.map(r => String(r[0]))); // Ensure string comparison
    const missingItems = uniqueValues.filter(val => !foundSet.has(val));

    console.log(`[API] Verified. Found: ${foundSet.size}, Missing: ${missingItems.length}`);

    res.json({ missingItems, count: missingItems.length });
  } catch (err) {
    console.error('[API] /api/verify-missing failed:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/query/count', async (req, res) => {
  const { sql, params } = req.body;
  const dbParams = getDbParams(req);
  try {
    const cleanSql = sql.trim().replace(/;$/, '');
    const countSql = `SELECT COUNT(*) FROM (${cleanSql}\n)`;
    const result = await db.executeQuery(countSql, params || [], 1000, {}, dbParams);
    res.json({ count: result.rows[0][0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Endpoint SIGO Workflow: Parse SQL File
app.post('/api/parse-sql', (req, res) => {
  try {
    const { sqlContent } = req.body;
    if (!sqlContent) {
      return res.status(400).json({ error: 'Conteúdo SQL vazio' });
    }

    const result = parseSigoSql(sqlContent);
    res.json(result);

  } catch (err) {
    console.error('Erro ao processar SQL:', err);
    res.status(500).json({ error: err.message });
  }
});

// ... (CSV Export Code omitted/truncated) ...

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
        finalSql = `SELECT * FROM(${sql}\n) WHERE ${whereClauses.join(' AND ')} `;
      }
    }

    const { stream, connection } = await db.getStream(finalSql, params || []);
    conn = connection;

    const now = new Date();
    const ts = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0') + '_' + String(now.getHours()).padStart(2, '0') + '-' + String(now.getMinutes()).padStart(2, '0') + '-' + String(now.getSeconds()).padStart(2, '0');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename = "exportacao_${ts}.csv"`);
    res.write('\ufeff'); // BOM

    stream.on('metadata', (meta) => {
      const headers = meta.map(m => m.name).join(';') + '\n';
      res.write(headers);
    });

    stream.on('data', (row) => {
      const csvRow = row.map(val => {
        if (val === null || val === undefined) return '';
        if (val instanceof Date) {
          const d = val;
          const day = String(d.getDate()).padStart(2, '0');
          const month = String(d.getMonth() + 1).padStart(2, '0');
          const year = d.getFullYear();
          const hours = String(d.getHours()).padStart(2, '0');
          const minutes = String(d.getMinutes()).padStart(2, '0');
          const seconds = String(d.getSeconds()).padStart(2, '0');
          if (hours === '00' && minutes === '00' && seconds === '00') return `${day}/${month}/${year}`;
          return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
        }
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

    // 1. CREATE TABLE
    if (jobId) activeJobs[jobId].status = 'Criando tabela...';
    await db.createTable(tableName, columns);

    // 2. CREATE INDICES (Moved before Data)
    if (jobId) activeJobs[jobId].status = 'Criando índices...';
    console.log(`Creating indices for table ${tableName}...`);

    for (const col of columns) {
      const shortTable = tableName.substring(0, 10);
      const shortCol = col.name.substring(0, 10);
      const rand = Math.floor(Math.random() * 1000);
      const indexName = `IDX_${shortTable}_${shortCol}_${rand}`.toUpperCase().substring(0, 30);

      try {
        if (col.type === 'DATE') {
          await db.executeQuery(`CREATE INDEX "${indexName}" ON "${tableName}" ("${col.name}")`);
        } else if (col.type === 'NUMBER') {
          await db.executeQuery(`CREATE INDEX "${indexName}" ON "${tableName}" ("${col.name}")`);
        } else if (col.type.startsWith('VARCHAR')) {
          await db.executeQuery(`CREATE INDEX "${indexName}" ON "${tableName}" (UPPER("${col.name}"))`);
        }
      } catch (idxErr) {
        console.warn(`Failed to create index on ${col.name}:`, idxErr.message);
      }
    }

    // 3. GRANT ACCESS (Moved before Data)
    if (grantToUser) {
      if (jobId) activeJobs[jobId].status = `Concedendo acesso a ${grantToUser}...`;
      try {
        await db.executeQuery(`GRANT ALL ON "${tableName}" TO ${grantToUser}`);
      } catch (grantErr) {
        console.warn("Grant failed:", grantErr.message);
      }
    }

    // 4. INSERT DATA (Moved to End)
    let totalInserted = 0;
    if (jobId) activeJobs[jobId].status = 'Inserindo dados...';

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
    const { text, instruction, history } = req.body;
    console.log(`[AI Endpoint] Received request. Text length: ${text?.length}, Instruction: ${instruction?.substring(0, 50)}...`);

    if (!text || !instruction) {
      console.warn("[AI Endpoint] Missing text or instruction");
      return res.status(400).json({ error: 'Missing text or instruction' });
    }

    // Pass history to aiService
    if (!aiService.processWithGroq) { // Check specific method if needed
      // fallback or error
    }

    const result = await aiService.processWithGroq(text || instruction, history || []);
    res.json({ result });
  } catch (e) {
    console.error("AI Route Error:", e);
    res.status(500).json({ error: e.message });
  }
});

// AI Feedback / Learning Endpoint
app.post('/api/ai/feedback', (req, res) => {
  try {
    const { term, value, type, context } = req.body;
    if (!term || !value || !type) {
      return res.status(400).json({ error: "Missing fields" });
    }
    const result = knowledgeService.learn(term, value, type, context);
    res.json({ success: true, learned: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// AI Knowledge Debug Endpoint
app.get('/api/ai/knowledge', (req, res) => {
  res.json(knowledgeService.knowledge);
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

// Helper to get user from headers
const getUser = (req) => req.headers['x-username'] || 'USER';

app.get('/api/docs/books', async (req, res) => {
  try {
    const owner = getUser(req);
    console.log(`[Docs] Listing books for owner: '${owner}' (Header: ${req.headers['x-username']})`);
    const books = await docService.listBooks(owner);
    res.json(books);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/docs/books', async (req, res) => {
  try {
    const { title, description } = req.body;
    const owner = getUser(req);
    console.log(`[Docs] Creating book '${title}' for owner: '${owner}'`);
    const id = await docService.createBook(title, description, owner);
    res.json({ id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/docs/books/:id', async (req, res) => {
  try {
    await docService.deleteBook(req.params.id);
    res.json({ success: true });
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

app.post('/api/docs/nodes/copy', async (req, res) => {
  try {
    const { nodeId, targetBookId, targetParentId, newIndex } = req.body;
    const newId = await docService.copyNode(nodeId, targetBookId, targetParentId, newIndex);
    res.json({ success: true, newId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/docs/books/copy', async (req, res) => {
  try {
    const { sourceBookId, newTitle } = req.body;
    const owner = getUser(req);
    const newId = await docService.copyBook(sourceBookId, newTitle, owner);
    res.json({ success: true, newId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/docs/nodes/:id', async (req, res) => {
  try {
    await docService.deleteNode(req.params.id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/chat/history', async (req, res) => {
  try {
    const limit = req.query.limit || 100;
    const history = await chatService.getHistory(limit);
    res.json(history);
  } catch (e) {
    console.error("History error:", e);
    res.status(500).json({ error: e.message });
  }
});

// --- FINAL ERROR HANDLING ---

// Bundle splitting regex fix (Legacy comment removal)
// The previous block (1426-1433) was redundant with Lines 183-200.

// 404 Handler for unhandled API routes (passed through by the first SPA fallback)
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API Endpoint Not Found' });
  }
  next();
});

// --- ADMIN HIVE MIND ROUTES ---

app.get('/api/ai/admin/memory', async (req, res) => {
  try {
    if (!chatService.adapter) return res.status(503).json({ error: "Supabase not connected" });
    // Fetch ALL memory (not just verified) for review
    const { data, error } = await chatService.adapter.client
      .from('ai_global_memory')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json(data);
  } catch (e) {
    console.error("Admin Memory Fetch Error:", e);
    res.status(500).json({ error: e.message });
  }
});

app.patch('/api/ai/admin/memory/:id', async (req, res) => {
  try {
    if (!chatService.adapter) return res.status(503).json({ error: "Supabase not connected" });
    const { validation_status } = req.body;

    const { error } = await chatService.adapter.client
      .from('ai_global_memory')
      .update({ validation_status })
      .eq('id', req.params.id);

    if (error) throw error;

    // If approved, trigger a sync for the current server context too?
    // Maybe logic: If approved, it becomes 'VERIFIED' and next sync picks it up.

    res.json({ success: true });
  } catch (e) {
    console.error("Admin Memory Update Error:", e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/ai/admin/config', async (req, res) => {
  try {
    if (!chatService.adapter) return res.status(503).json({ error: "Supabase not connected" });
    const { data, error } = await chatService.adapter.client
      .from('ai_config')
      .select('key, value');

    if (error) throw error;

    // Transform array to object
    const config = {};
    data.forEach(item => config[item.key] = item.value);
    res.json(config);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/ai/admin/config', async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!chatService.adapter) return res.status(503).json({ error: "Supabase not connected" });

    const { error } = await chatService.adapter.client
      .from('ai_config')
      .upsert({ key, value });

    if (error) throw error;
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// Start Server Function
const startServer = (port) => {
  return new Promise((resolve, reject) => {
    server.listen(port, () => {
      console.log(`Server running on port ${port}`);
      debugLog(`Server running on port ${port}`);

      // Run Database Cleanup on Startup (Keep last 90 days)
      try {
        setTimeout(async () => {
          console.log("Running scheduled cleanup...");
          chatService.cleanup(30);

          // Phase 4: Hive Mind Sync (Context Awareness)
          // Wait for ChatService to establish Supabase connection
          if (chatService.adapter) {
            console.log("[Hive Mind] Initiating Knowledge Sync...");
            await neuralService.sync(chatService.adapter);
          } else {
            console.warn("[Hive Mind] Supabase Adapter not ready. Skipping Sync.");
          }

        }, 5000); // Delay 5s to ensure connection and not slow down startup
      } catch (e) {
        console.error("Startup tasks error:", e);
      }

      resolve();
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
