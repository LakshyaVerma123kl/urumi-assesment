/**
 * Main Gateway Server
 * 
 * Combines:
 * - Store orchestrator (existing Kubernetes provisioning)
 * - MCP Gateway endpoint (for external MCP clients)
 * - REST API for dashboard (servers, users, audit, chat)
 * - Authentication via API keys
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const shell = require('shelljs');
const { v4: uuidv4 } = require('uuid');


// --- Modules ---
const { db, generateApiKey } = require('./db');
const { authMiddleware, adminOnly, logAudit } = require('./auth');
const { 
  handleMcpRequest, startHealthChecks, refreshAllTools, 
  getAllTools, removeClient 
} = require('./mcp-gateway');
const { runChatAgent } = require('./chat-agent');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cors());

// Health check endpoint for Kubernetes liveness and readiness probes
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'mcp-gateway',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// --- Configuration ---
const PORT = process.env.PORT || 3001;
const BASE_DOMAIN = process.env.BASE_DOMAIN || '127.0.0.1.nip.io';
const CHART_PATH = path.join(__dirname, '..', 'charts', 'store-base');
const MAX_STORES_PER_USER = parseInt(process.env.MAX_STORES_PER_USER || '10');
const PROVISIONING_TIMEOUT = parseInt(process.env.PROVISIONING_TIMEOUT || '900000');

// ═══════════════════════════════════════════════
// SECTION 1: MCP GATEWAY ENDPOINT
// External MCP clients (Claude Code, Cursor, MCP Inspector) connect here.
// ═══════════════════════════════════════════════

app.post('/mcp', authMiddleware(false), (req, res) => {
  const handler = handleMcpRequest(req.user);
  return handler(req, res);
});

// GET /mcp — Interactive Explorer and Documentation for browsers & SSE
app.get('/mcp', async (req, res) => {
  if (req.headers.accept && req.headers.accept.includes('text/event-stream')) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.write(`data: ${JSON.stringify({ jsonrpc: '2.0', method: 'ping', params: {} })}\n\n`);
    return;
  }

  const tools = await getAllTools();
  if (req.headers.accept && req.headers.accept.includes('application/json')) {
    return res.json({
      status: 'active',
      service: 'mcp-gateway',
      version: '2.0.0',
      protocol: 'MCP Streamable HTTP (2024-11-05)',
      toolsCount: tools.length,
      tools: tools.map(t => ({ name: t.name, description: t.description }))
    });
  }

  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html>
<head>
  <title>MCP Gateway - Unified Endpoint</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 2rem; max-width: 900px; margin: 0 auto; line-height: 1.6; }
    h1 { color: #818cf8; margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.5rem; }
    .badge { display: inline-block; background: #10b981; color: white; padding: 0.2rem 0.6rem; border-radius: 9999px; font-size: 0.75rem; font-weight: bold; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 1rem; padding: 1.5rem; margin-bottom: 1.5rem; }
    code, pre { font-family: ui-monospace, Menlo, Monaco, Consolas, monospace; background: #0f172a; color: #38bdf8; padding: 0.2rem 0.4rem; border-radius: 0.375rem; }
    pre { padding: 1rem; overflow-x: auto; font-size: 0.875rem; border: 1px solid #334155; }
    .tool { background: #334155; padding: 0.75rem 1rem; border-radius: 0.5rem; margin-bottom: 0.5rem; }
    .tool-name { font-weight: bold; color: #a5b4fc; font-family: ui-monospace, monospace; }
    .tool-desc { color: #94a3b8; font-size: 0.875rem; margin-top: 0.25rem; }
    a { color: #818cf8; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .btn { display: inline-block; background: #4f46e5; color: white; padding: 0.5rem 1rem; border-radius: 0.5rem; font-weight: 500; margin-top: 0.5rem; text-decoration: none; }
    .btn:hover { background: #4338ca; text-decoration: none; }
  </style>
</head>
<body>
  <h1>🌐 MCP Gateway Endpoint <span class="badge">ACTIVE</span></h1>
  <p>Unified Model Context Protocol (MCP) gateway aggregating upstream tools across WooCommerce, Calculator, and Utilities.</p>

  <div class="card">
    <h3>🔗 Connection Details</h3>
    <p><strong>MCP Endpoint:</strong> <code>POST http://localhost:3001/mcp</code></p>
    <p><strong>Authentication:</strong> <code>Authorization: Bearer &lt;your-api-key&gt;</code></p>
    <p><strong>Dashboard UI:</strong> <a href="http://localhost:5173" class="btn">Open React Dashboard</a></p>
    <p style="margin-top: 1rem;"><strong>Health Check:</strong> <a href="/health">/health</a></p>
  </div>

  <div class="card">
    <h3>⚡ How to Connect External Clients</h3>
    <p>Connect Claude Code, Cursor, or MCP Inspector using:</p>
    <pre>curl -X POST http://localhost:3001/mcp \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer gw_your_api_key" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'</pre>
  </div>

  <div class="card">
    <h3>🛠️ Available Aggregated Tools (${tools.length})</h3>
    ${tools.map(t => `
      <div class="tool">
        <div class="tool-name">${t.name}</div>
        <div class="tool-desc">${t.description || ''}</div>
      </div>
    `).join('')}
  </div>
</body>
</html>`);
});

// Root handler
app.get('/', (req, res) => {
  res.redirect('/mcp');
});

// Chrome DevTools endpoint
app.get('/.well-known/appspecific/com.chrome.devtools.json', (req, res) => {
  res.json({ status: 'ok', service: 'mcp-gateway' });
});

// ═══════════════════════════════════════════════
// SECTION 2: USER & TEAM MANAGEMENT API
// ═══════════════════════════════════════════════

// Login / Verify API key
app.post('/api/auth/login', authMiddleware(false), (req, res) => {
  res.json({ user: req.user });
});

// Get current user
app.get('/api/auth/me', authMiddleware(false), (req, res) => {
  res.json({ user: req.user });
});

// List all users (admin only)
app.get('/api/users', authMiddleware(false), adminOnly, (req, res) => {
  const users = db.prepare(`
    SELECT id, username, email, role, api_key_prefix, is_active, created_at 
    FROM users ORDER BY created_at DESC
  `).all();
  res.json(users);
});

// Create user (admin only)
app.post('/api/users', authMiddleware(false), adminOnly, (req, res) => {
  const { username, email, role } = req.body;
  if (!username || !username.trim()) {
    return res.status(400).json({ error: 'Username is required' });
  }

  const validRole = (role === 'admin' || role === 'member') ? role : 'member';

  // Check duplicate
  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get(username);
  if (existing) {
    return res.status(409).json({ error: 'Username already exists' });
  }

  const userId = uuidv4();
  const { key, prefix, hash } = generateApiKey();

  db.prepare(`
    INSERT INTO users (id, username, email, role, api_key_hash, api_key_prefix) 
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(userId, username.trim(), email || '', validRole, hash, prefix);

  logAudit({
    userId: req.user.id, username: req.user.username,
    action: 'create_user', status: 'success',
    message: `Created user ${username} with role ${validRole}`
  });

  // Return the API key (only shown once!)
  res.json({
    id: userId,
    username: username.trim(),
    email: email || '',
    role: validRole,
    api_key: key,
    api_key_prefix: prefix,
    message: 'SAVE THE API KEY — it will not be shown again!'
  });
});

// Regenerate API key for a user (admin or self)
app.post('/api/users/:id/regenerate-key', authMiddleware(false), (req, res) => {
  const { id } = req.params;
  
  // Allow admin or self
  if (req.user.role !== 'admin' && req.user.id !== id) {
    return res.status(403).json({ error: 'Not authorized' });
  }

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const { key, prefix, hash } = generateApiKey();
  db.prepare("UPDATE users SET api_key_hash = ?, api_key_prefix = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run(hash, prefix, id);

  logAudit({
    userId: req.user.id, username: req.user.username,
    action: 'regenerate_key', status: 'success',
    message: `Regenerated API key for ${user.username}`
  });

  res.json({ api_key: key, api_key_prefix: prefix, message: 'New API key generated. Old key is now invalid.' });
});

// Revoke / Deactivate a user's key (admin only)
app.post('/api/users/:id/revoke', authMiddleware(false), adminOnly, (req, res) => {
  const { id } = req.params;
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  db.prepare("UPDATE users SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);

  logAudit({
    userId: req.user.id, username: req.user.username,
    action: 'revoke_user', status: 'success',
    message: `Revoked API key for ${user.username}`
  });

  res.json({ message: `User ${user.username} has been deactivated` });
});

// Reactivate user (admin only)
app.post('/api/users/:id/activate', authMiddleware(false), adminOnly, (req, res) => {
  const { id } = req.params;
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  db.prepare("UPDATE users SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
  res.json({ message: `User ${user.username} has been reactivated` });
});

// Delete user (admin only)
app.delete('/api/users/:id', authMiddleware(false), adminOnly, (req, res) => {
  const { id } = req.params;
  if (req.user.id === id) {
    return res.status(400).json({ error: 'Cannot delete yourself' });
  }
  db.prepare("DELETE FROM users WHERE id = ?").run(id);
  res.json({ message: 'User deleted' });
});

// ═══════════════════════════════════════════════
// SECTION 3: MCP SERVER MANAGEMENT API
// ═══════════════════════════════════════════════

// List all MCP servers with their tools
app.get('/api/mcp-servers', authMiddleware(false), (req, res) => {
  const servers = db.prepare("SELECT * FROM mcp_servers ORDER BY created_at").all();
  
  // Attach tools to each server
  const getTools = db.prepare("SELECT tool_name, prefixed_name, description FROM server_tools WHERE server_id = ?");
  const result = servers.map(s => ({
    ...s,
    // Never send auth_credential to the browser!
    auth_credential: s.auth_credential ? '••••••••' : '',
    tools: getTools.all(s.id)
  }));

  res.json(result);
});

// Add a new MCP server (admin only)
app.post('/api/mcp-servers', authMiddleware(false), adminOnly, async (req, res) => {
  const { name, url, auth_type, auth_credential, auth_header_name } = req.body;
  
  if (!name || !url) {
    return res.status(400).json({ error: 'Name and URL are required' });
  }

  const serverId = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').substring(0, 30);
  
  // Check duplicate
  const existing = db.prepare("SELECT id FROM mcp_servers WHERE id = ?").get(serverId);
  if (existing) {
    return res.status(409).json({ error: 'Server with this name already exists' });
  }

  db.prepare(`
    INSERT INTO mcp_servers (id, name, url, auth_type, auth_credential, auth_header_name)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(serverId, name, url, auth_type || 'none', auth_credential || '', auth_header_name || 'Authorization');

  logAudit({
    userId: req.user.id, username: req.user.username,
    action: 'add_server', status: 'success',
    message: `Added MCP server: ${name} (${url})`
  });

  // Refresh tools to pick up new server
  await refreshAllTools().catch(err => console.error('Refresh error:', err.message));

  res.json({ id: serverId, name, url, status: 'unknown', message: 'Server added. Tools will be synced shortly.' });
});

// Update MCP server (admin only)
app.put('/api/mcp-servers/:id', authMiddleware(false), adminOnly, async (req, res) => {
  const { id } = req.params;
  const { name, url, auth_type, auth_credential, auth_header_name } = req.body;

  const server = db.prepare("SELECT * FROM mcp_servers WHERE id = ?").get(id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  db.prepare(`
    UPDATE mcp_servers SET 
      name = COALESCE(?, name),
      url = COALESCE(?, url),
      auth_type = COALESCE(?, auth_type),
      auth_credential = COALESCE(?, auth_credential),
      auth_header_name = COALESCE(?, auth_header_name),
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(name || null, url || null, auth_type || null, auth_credential || null, auth_header_name || null, id);

  removeClient(id);
  await refreshAllTools().catch(() => {});

  res.json({ message: 'Server updated' });
});

// Enable/Disable MCP server (admin only)
app.post('/api/mcp-servers/:id/toggle', authMiddleware(false), adminOnly, async (req, res) => {
  const { id } = req.params;
  const server = db.prepare("SELECT * FROM mcp_servers WHERE id = ?").get(id);
  if (!server) return res.status(404).json({ error: 'Server not found' });

  const newEnabled = server.is_enabled ? 0 : 1;
  const newStatus = newEnabled ? 'unknown' : 'disabled';
  
  db.prepare("UPDATE mcp_servers SET is_enabled = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
    .run(newEnabled, newStatus, id);

  if (!newEnabled) removeClient(id);

  logAudit({
    userId: req.user.id, username: req.user.username,
    serverId: id, serverName: server.name,
    action: newEnabled ? 'enable_server' : 'disable_server',
    status: 'success',
    message: `${newEnabled ? 'Enabled' : 'Disabled'} server: ${server.name}`
  });

  await refreshAllTools().catch(() => {});

  res.json({ message: `Server ${newEnabled ? 'enabled' : 'disabled'}`, is_enabled: newEnabled });
});

// Delete MCP server (admin only)
app.delete('/api/mcp-servers/:id', authMiddleware(false), adminOnly, (req, res) => {
  const { id } = req.params;
  db.prepare("DELETE FROM server_tools WHERE server_id = ?").run(id);
  db.prepare("DELETE FROM mcp_servers WHERE id = ?").run(id);
  removeClient(id);

  logAudit({
    userId: req.user.id, username: req.user.username,
    action: 'delete_server', status: 'success',
    message: `Deleted MCP server: ${id}`
  });

  res.json({ message: 'Server deleted' });
});

// Refresh tools from all servers
app.post('/api/mcp-servers/refresh', authMiddleware(false), async (req, res) => {
  await refreshAllTools();
  res.json({ message: 'Tools refreshed' });
});

// ═══════════════════════════════════════════════
// SECTION 4: AUDIT LOG API
// ═══════════════════════════════════════════════

app.get('/api/audit', authMiddleware(false), (req, res) => {
  const { limit = 100, offset = 0, user_id, server_id, action } = req.query;
  
  let query = "SELECT * FROM audit_log WHERE 1=1";
  const params = [];

  if (user_id) { query += " AND user_id = ?"; params.push(user_id); }
  if (server_id) { query += " AND server_id = ?"; params.push(server_id); }
  if (action) { query += " AND action = ?"; params.push(action); }

  query += " ORDER BY timestamp DESC LIMIT ? OFFSET ?";
  params.push(parseInt(limit), parseInt(offset));

  const logs = db.prepare(query).all(...params);
  const total = db.prepare("SELECT COUNT(*) as count FROM audit_log").get().count;

  res.json({ logs, total, limit: parseInt(limit), offset: parseInt(offset) });
});

// ═══════════════════════════════════════════════
// SECTION 5: CHAT AGENT API
// ═══════════════════════════════════════════════

app.post('/api/chat', authMiddleware(false), async (req, res) => {
  const { message, history = [] } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    const result = await runChatAgent(message, history, req.user);
    res.json(result);
  } catch (error) {
    console.error('[Chat] Error:', error.message);
    res.json({ response: `Chat error: ${error.message}`, toolCalls: [], error: true });
  }
});

// ═══════════════════════════════════════════════
// SECTION 6: STORE MANAGEMENT API (existing)
// ═══════════════════════════════════════════════

const execShell = (cmd, timeout = 120000) => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Command timeout')), timeout);
    shell.exec(cmd, { silent: false }, (code, stdout, stderr) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(stderr || stdout));
      resolve(stdout);
    });
  });
};

const namespaceExists = async (namespace) => {
  try { await execShell(`kubectl get namespace ${namespace}`); return true; } catch { return false; }
};

app.get('/api/stores', authMiddleware(true), (req, res) => {
  const stores = db.prepare('SELECT id, name, status, url, created_at, error_message FROM stores ORDER BY created_at DESC').all();
  res.json(stores);
});

app.get('/api/stores/:id', authMiddleware(true), (req, res) => {
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(req.params.id);
  if (!store) return res.status(404).json({ error: 'Store not found' });
  res.json(store);
});

app.get('/api/stores/:id/logs', authMiddleware(true), (req, res) => {
  const logs = db.prepare("SELECT * FROM audit_log WHERE (server_id = ? OR message LIKE ?) ORDER BY timestamp DESC LIMIT 50")
    .all(req.params.id, `%${req.params.id}%`);
  res.json(logs);
});

app.post('/api/stores', authMiddleware(true), async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Store name is required' });

  const countStmt = db.prepare("SELECT COUNT(*) as count FROM stores WHERE status != 'FAILED'");
  if (countStmt.get().count >= MAX_STORES_PER_USER) {
    return res.status(429).json({ error: `Maximum store limit reached (${MAX_STORES_PER_USER})` });
  }

  const storeId = `store-${uuidv4().substring(0, 8)}`;
  const namespace = `ns-${storeId}`;
  const fullUrl = `http://${storeId}.${BASE_DOMAIN}`;
  const now = new Date().toISOString();

  db.prepare('INSERT INTO stores (id, name, status, url, created_at, updated_at, provisioning_started_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(storeId, name, 'PROVISIONING', fullUrl, now, now, now);

  logAudit({
    userId: req.user?.id, username: req.user?.username || 'anonymous',
    action: 'create_store', status: 'started', message: `Creating store: ${name}`
  });

  res.json({ id: storeId, status: 'PROVISIONING', url: fullUrl });

  // Async provisioning
  (async () => {
    try {
      if (!await namespaceExists(namespace)) await execShell(`kubectl create ns ${namespace}`);
      const dbPass = uuidv4();
      await execShell(`helm upgrade --install ${storeId} "${CHART_PATH}" --namespace ${namespace} --set store.id=${storeId} --set store.domain=${BASE_DOMAIN} --set mysql.rootPassword=${dbPass} --set mysql.userPassword=${dbPass} --wait --timeout 15m`, 900000);

      db.prepare("UPDATE stores SET status = 'READY', updated_at = ?, provisioning_completed_at = ?, error_message = NULL WHERE id = ?")
        .run(new Date().toISOString(), new Date().toISOString(), storeId);
      logAudit({ action: 'create_store', status: 'success', message: `Store ${name} is ready` });
    } catch (error) {
      db.prepare("UPDATE stores SET status = 'FAILED', updated_at = ?, error_message = ? WHERE id = ?")
        .run(new Date().toISOString(), error.message, storeId);
      logAudit({ action: 'create_store', status: 'failed', message: error.message });
      try {
        await execShell(`helm uninstall ${storeId} --namespace ${namespace} --wait --timeout 3m || true`, 180000);
        await execShell(`kubectl delete ns ${namespace} --wait=true --timeout=3m || true`, 180000);
      } catch {}
    }
  })();

  setTimeout(() => {
    const s = db.prepare('SELECT status FROM stores WHERE id = ?').get(storeId);
    if (s && s.status === 'PROVISIONING') {
      db.prepare("UPDATE stores SET status = 'FAILED', error_message = 'Provisioning timeout' WHERE id = ?").run(storeId);
    }
  }, PROVISIONING_TIMEOUT);
});

app.delete('/api/stores/:id', authMiddleware(true), async (req, res) => {
  const { id } = req.params;
  const namespace = `ns-${id}`;
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(id);
  if (!store) return res.status(404).json({ error: 'Store not found' });

  db.prepare("UPDATE stores SET status = 'DELETING', updated_at = ? WHERE id = ?").run(new Date().toISOString(), id);
  res.json({ status: 'DELETING' });

  (async () => {
    try {
      try { await execShell(`helm uninstall ${id} --namespace ${namespace} --wait --timeout 5m`, 300000); } catch {}
      try { await execShell(`kubectl delete ns ${namespace} --wait=true --timeout=5m`, 300000); } catch {}
      db.prepare('DELETE FROM stores WHERE id = ?').run(id);
    } catch (error) {
      db.prepare("UPDATE stores SET status = 'ERROR_DELETING', error_message = ? WHERE id = ?").run(error.message, id);
    }
  })();
});

// ═══════════════════════════════════════════════
// SECTION 7: TOOLS & HEALTH
// ═══════════════════════════════════════════════

// List all aggregated tools (for dashboard display)
app.get('/api/tools', authMiddleware(false), async (req, res) => {
  const tools = await getAllTools();
  res.json(tools);
});

app.get('/api/metrics', (req, res) => {
  const stats = {
    total_stores: db.prepare('SELECT COUNT(*) as c FROM stores').get().c,
    ready_stores: db.prepare("SELECT COUNT(*) as c FROM stores WHERE status = 'READY'").get().c,
    total_servers: db.prepare('SELECT COUNT(*) as c FROM mcp_servers').get().c,
    connected_servers: db.prepare("SELECT COUNT(*) as c FROM mcp_servers WHERE status = 'connected'").get().c,
    total_users: db.prepare('SELECT COUNT(*) as c FROM users').get().c,
    total_audit_entries: db.prepare('SELECT COUNT(*) as c FROM audit_log').get().c
  };
  res.json(stats);
});

// ═══════════════════════════════════════════════
// ERROR HANDLING & STARTUP
// ═══════════════════════════════════════════════

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`\n╔════════════════════════════════════════════╗`);
  console.log(`║   MCP GATEWAY & STORE ORCHESTRATOR v2.0   ║`);
  console.log(`╚════════════════════════════════════════════╝`);
  console.log(` API:       http://localhost:${PORT}`);
  console.log(` MCP:       POST http://localhost:${PORT}/mcp`);
  console.log(` Dashboard: http://localhost:5173`);
  console.log(` Charts:    ${CHART_PATH}`);
  console.log(`────────────────────────────────────────────\n`);

  // Start gateway health checks & tool sync
  startHealthChecks();
});