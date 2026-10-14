/**
 * MCP Gateway
 * 
 * Acts as both:
 * 1. MCP CLIENT — connects to every registered upstream MCP server
 * 2. MCP SERVER — exposes one unified MCP endpoint to external clients
 * 
 * Key features:
 * - Tool aggregation from all enabled upstream servers
 * - Tool name collision handling via prefix scheme: "serverid__toolname"
 * - Timeout and dead upstream handling (doesn't break other servers)
 * - Upstream credentials stay server-side (never sent to browser/client)
 * - Health checking of upstream servers
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { db } = require('./db');
const { logAudit } = require('./auth');

// --- Configuration ---
const UPSTREAM_TIMEOUT = parseInt(process.env.UPSTREAM_TIMEOUT || '15000'); // 15s per tool call
const HEALTH_CHECK_INTERVAL = parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000'); // 30s
const TOOL_LIST_TIMEOUT = parseInt(process.env.TOOL_LIST_TIMEOUT || '10000'); // 10s for listing tools

// --- In-memory tool cache ---
let toolCache = new Map(); // prefixedName -> { serverId, serverName, originalName, tool }
let lastToolRefresh = 0;

// --- MCP Client: Connect to an upstream server ---
class McpUpstreamClient {
  constructor(serverId, serverName, url, authType, authCredential, authHeaderName) {
    this.serverId = serverId;
    this.serverName = serverName;
    this.url = url;
    this.authType = authType;
    this.authCredential = authCredential;
    this.authHeaderName = authHeaderName || 'Authorization';
    this.sessionId = null;
    this.requestId = 0;
    this.initialized = false;
  }

  getHeaders() {
    const headers = { 'Content-Type': 'application/json' };
    if (this.sessionId) {
      headers['Mcp-Session-Id'] = this.sessionId;
    }
    if (this.authType === 'bearer' && this.authCredential) {
      headers['Authorization'] = `Bearer ${this.authCredential}`;
    } else if (this.authType === 'header' && this.authCredential) {
      headers[this.authHeaderName] = this.authCredential;
    }
    return headers;
  }

  async sendRequest(method, params = {}, timeout = UPSTREAM_TIMEOUT) {
    const body = {
      jsonrpc: '2.0',
      id: ++this.requestId,
      method,
      params
    };

    const response = await axios.post(this.url, body, {
      headers: this.getHeaders(),
      timeout
    });

    // Capture session ID from initialize response
    if (method === 'initialize' && response.headers['mcp-session-id']) {
      this.sessionId = response.headers['mcp-session-id'];
    }

    const data = response.data;
    if (data.error) {
      throw new Error(`MCP Error ${data.error.code}: ${data.error.message}`);
    }

    return data.result;
  }

  async initialize() {
    try {
      const result = await this.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        clientInfo: { name: 'mcp-gateway', version: '1.0.0' },
        capabilities: {}
      }, TOOL_LIST_TIMEOUT);

      // Send initialized notification
      await this.sendRequest('notifications/initialized', {}, 5000).catch(() => {});
      
      this.initialized = true;
      return result;
    } catch (error) {
      this.initialized = false;
      throw error;
    }
  }

  async listTools() {
    if (!this.initialized) {
      await this.initialize();
    }
    const result = await this.sendRequest('tools/list', {}, TOOL_LIST_TIMEOUT);
    return result.tools || [];
  }

  async callTool(toolName, args) {
    if (!this.initialized) {
      await this.initialize();
    }
    return await this.sendRequest('tools/call', {
      name: toolName,
      arguments: args || {}
    }, UPSTREAM_TIMEOUT);
  }

  async ping() {
    return await this.sendRequest('ping', {}, 5000);
  }
}

// --- Upstream client pool ---
const upstreamClients = new Map(); // serverId -> McpUpstreamClient

function getOrCreateClient(server) {
  if (upstreamClients.has(server.id)) {
    return upstreamClients.get(server.id);
  }
  const client = new McpUpstreamClient(
    server.id, server.name, server.url,
    server.auth_type, server.auth_credential, server.auth_header_name
  );
  upstreamClients.set(server.id, client);
  return client;
}

function removeClient(serverId) {
  upstreamClients.delete(serverId);
}

// --- Tool Name Collision Handling ---
// Scheme: prefix all tools with "serverid__toolname"
// This ensures uniqueness even if two servers expose a tool with the same name.
// Example: "woocommerce__list_products", "calculator__calculate"
function prefixToolName(serverId, toolName) {
  return `${serverId}__${toolName}`;
}

function parsePrefixedToolName(prefixedName) {
  const idx = prefixedName.indexOf('__');
  if (idx === -1) return { serverId: null, toolName: prefixedName };
  return {
    serverId: prefixedName.substring(0, idx),
    toolName: prefixedName.substring(idx + 2)
  };
}

// --- Refresh Tools from All Upstream Servers ---
async function refreshAllTools() {
  const servers = db.prepare("SELECT * FROM mcp_servers WHERE is_enabled = 1").all();
  const newCache = new Map();

  // Clear existing cached tools
  db.prepare("DELETE FROM server_tools").run();

  const insertTool = db.prepare(`
    INSERT INTO server_tools (server_id, tool_name, prefixed_name, description, input_schema)
    VALUES (?, ?, ?, ?, ?)
  `);

  for (const server of servers) {
    try {
      const client = getOrCreateClient(server);
      const tools = await client.listTools();

      // Update server status to connected
      db.prepare("UPDATE mcp_servers SET status = 'connected', last_health_check = CURRENT_TIMESTAMP WHERE id = ?")
        .run(server.id);

      for (const tool of tools) {
        const prefixed = prefixToolName(server.id, tool.name);
        newCache.set(prefixed, {
          serverId: server.id,
          serverName: server.name,
          originalName: tool.name,
          tool: {
            name: prefixed,
            description: `[${server.name}] ${tool.description || ''}`,
            inputSchema: tool.inputSchema || { type: 'object', properties: {} }
          }
        });

        insertTool.run(
          server.id,
          tool.name,
          prefixed,
          tool.description || '',
          JSON.stringify(tool.inputSchema || {})
        );
      }

      console.log(`[Gateway] ${server.name}: ${tools.length} tools loaded`);
    } catch (error) {
      console.error(`[Gateway] ${server.name} (${server.url}): ${error.message}`);
      db.prepare("UPDATE mcp_servers SET status = 'unreachable', last_health_check = CURRENT_TIMESTAMP WHERE id = ?")
        .run(server.id);
      // Remove stale client so it reinitializes next time
      removeClient(server.id);
    }
  }

  toolCache = newCache;
  lastToolRefresh = Date.now();
  console.log(`[Gateway] Total tools: ${newCache.size}`);
  return newCache;
}

// --- Get All Tools (with lazy refresh) ---
async function getAllTools() {
  if (toolCache.size === 0 || Date.now() - lastToolRefresh > 60000) {
    await refreshAllTools();
  }
  return Array.from(toolCache.values()).map(entry => entry.tool);
}

// --- Call a Tool via Gateway ---
async function callTool(prefixedName, args, user) {
  const entry = toolCache.get(prefixedName);
  if (!entry) {
    // Try refreshing tools first
    await refreshAllTools();
    const retryEntry = toolCache.get(prefixedName);
    if (!retryEntry) {
      throw new Error(`Tool not found: ${prefixedName}`);
    }
    return await callToolInternal(retryEntry, args, user);
  }
  return await callToolInternal(entry, args, user);
}

async function callToolInternal(entry, args, user) {
  const { serverId, serverName, originalName } = entry;

  // Check server is still enabled
  const server = db.prepare("SELECT * FROM mcp_servers WHERE id = ? AND is_enabled = 1").get(serverId);
  if (!server) {
    throw new Error(`Server "${serverName}" is disabled or removed`);
  }

  const startTime = Date.now();
  let outcome = 'success';
  let errorMsg = '';
  let result;

  try {
    const client = getOrCreateClient(server);
    result = await client.callTool(originalName, args);
  } catch (error) {
    outcome = error.message.includes('timeout') ? 'timeout' : 'error';
    errorMsg = error.message;

    // Update server status if unreachable
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.message.includes('timeout')) {
      db.prepare("UPDATE mcp_servers SET status = 'unreachable', last_health_check = CURRENT_TIMESTAMP WHERE id = ?")
        .run(serverId);
      removeClient(serverId);
    }

    throw error;
  } finally {
    const duration = Date.now() - startTime;

    // Audit log
    logAudit({
      userId: user?.id,
      username: user?.username || 'anonymous',
      serverId,
      serverName,
      toolName: `${serverId}__${originalName}`,
      action: 'tool_call',
      status: outcome,
      durationMs: duration,
      message: errorMsg || `Called ${originalName}`,
      requestSummary: JSON.stringify(args || {}).substring(0, 500)
    });
  }

  return result;
}

// --- Health Check All Servers ---
async function healthCheckAll() {
  const servers = db.prepare("SELECT * FROM mcp_servers").all();

  for (const server of servers) {
    if (!server.is_enabled) {
      db.prepare("UPDATE mcp_servers SET status = 'disabled', last_health_check = CURRENT_TIMESTAMP WHERE id = ?")
        .run(server.id);
      continue;
    }

    try {
      const client = getOrCreateClient(server);
      await client.ping();
      db.prepare("UPDATE mcp_servers SET status = 'connected', last_health_check = CURRENT_TIMESTAMP WHERE id = ?")
        .run(server.id);
    } catch {
      db.prepare("UPDATE mcp_servers SET status = 'unreachable', last_health_check = CURRENT_TIMESTAMP WHERE id = ?")
        .run(server.id);
      removeClient(server.id);
    }
  }
}

// --- MCP Server Endpoint (for external clients like Claude Code, Cursor) ---
const gatewaySessions = new Map();

function handleMcpRequest(user) {
  return async (req, res) => {
    const message = req.body;

    if (!message || message.jsonrpc !== '2.0') {
      return res.status(400).json({
        jsonrpc: '2.0', id: null,
        error: { code: -32600, message: 'Invalid JSON-RPC request' }
      });
    }

    try {
      switch (message.method) {
        case 'initialize': {
          const sessionId = uuidv4();
          gatewaySessions.set(sessionId, { user, created: Date.now() });
          res.setHeader('Mcp-Session-Id', sessionId);

          logAudit({
            userId: user?.id, username: user?.username,
            action: 'mcp_initialize', status: 'success',
            message: 'MCP session initialized'
          });

          return res.json({
            jsonrpc: '2.0', id: message.id,
            result: {
              protocolVersion: '2024-11-05',
              serverInfo: { name: 'mcp-gateway', version: '1.0.0' },
              capabilities: { tools: { listChanged: true } }
            }
          });
        }

        case 'notifications/initialized':
          return res.json({ jsonrpc: '2.0', id: message.id, result: {} });

        case 'tools/list': {
          const tools = await getAllTools();
          return res.json({
            jsonrpc: '2.0', id: message.id,
            result: { tools }
          });
        }

        case 'tools/call': {
          const { name, arguments: toolArgs } = message.params;
          try {
            const result = await callTool(name, toolArgs || {}, user);
            return res.json({
              jsonrpc: '2.0', id: message.id,
              result
            });
          } catch (toolError) {
            return res.json({
              jsonrpc: '2.0', id: message.id,
              result: {
                content: [{ type: 'text', text: `Error: ${toolError.message}` }],
                isError: true
              }
            });
          }
        }

        case 'ping':
          return res.json({ jsonrpc: '2.0', id: message.id, result: {} });

        default:
          return res.json({
            jsonrpc: '2.0', id: message.id,
            error: { code: -32601, message: `Method not found: ${message.method}` }
          });
      }
    } catch (error) {
      console.error('[Gateway MCP] Error:', error.message);
      return res.json({
        jsonrpc: '2.0', id: message.id,
        error: { code: -32603, message: error.message }
      });
    }
  };
}

// --- Start periodic health checks ---
let healthInterval = null;
function startHealthChecks() {
  // Initial refresh
  refreshAllTools().catch(err => console.error('[Gateway] Initial tool refresh failed:', err.message));

  healthInterval = setInterval(() => {
    healthCheckAll().catch(err => console.error('[Gateway] Health check error:', err.message));
  }, HEALTH_CHECK_INTERVAL);
}

function stopHealthChecks() {
  if (healthInterval) clearInterval(healthInterval);
}

module.exports = {
  refreshAllTools,
  getAllTools,
  callTool,
  healthCheckAll,
  handleMcpRequest,
  startHealthChecks,
  stopHealthChecks,
  prefixToolName,
  parsePrefixedToolName,
  removeClient,
  getOrCreateClient
};
