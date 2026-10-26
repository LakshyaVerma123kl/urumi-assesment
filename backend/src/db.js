/**
 * Database Module
 * 
 * Initializes SQLite with all tables for:
 * - Stores (existing)
 * - Users & API keys
 * - MCP server registry
 * - Tool cache
 * - Audit log (expanded)
 */

const Database = require('better-sqlite3');
const path = require('path');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'gateway.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// --- Schema ---
db.exec(`
  -- Users & team management
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    email TEXT DEFAULT '',
    role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('admin', 'member')),
    api_key_hash TEXT,
    api_key_prefix TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- MCP Server registry
  CREATE TABLE IF NOT EXISTS mcp_servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    auth_type TEXT DEFAULT 'none' CHECK(auth_type IN ('none', 'bearer', 'header')),
    auth_credential TEXT DEFAULT '',
    auth_header_name TEXT DEFAULT 'Authorization',
    status TEXT DEFAULT 'unknown' CHECK(status IN ('connected', 'unreachable', 'disabled', 'unknown')),
    is_enabled INTEGER DEFAULT 1,
    last_health_check DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Cached tools from upstream servers
  CREATE TABLE IF NOT EXISTS server_tools (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    server_id TEXT NOT NULL,
    tool_name TEXT NOT NULL,
    prefixed_name TEXT NOT NULL,
    description TEXT DEFAULT '',
    input_schema TEXT DEFAULT '{}',
    FOREIGN KEY (server_id) REFERENCES mcp_servers(id) ON DELETE CASCADE
  );

  -- Audit log (expanded for MCP tool calls)
  CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    username TEXT,
    server_id TEXT,
    server_name TEXT,
    tool_name TEXT,
    action TEXT NOT NULL,
    status TEXT NOT NULL,
    duration_ms INTEGER DEFAULT 0,
    message TEXT DEFAULT '',
    request_summary TEXT DEFAULT '',
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  -- Stores (existing functionality)
  CREATE TABLE IF NOT EXISTS stores (
    id TEXT PRIMARY KEY,
    name TEXT,
    status TEXT,
    url TEXT,
    created_at DATETIME,
    updated_at DATETIME,
    error_message TEXT,
    provisioning_started_at DATETIME,
    provisioning_completed_at DATETIME
  );

  -- Create indexes
  CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
  CREATE INDEX IF NOT EXISTS idx_audit_server ON audit_log(server_id);
  CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp);
  CREATE INDEX IF NOT EXISTS idx_server_tools_server ON server_tools(server_id);
  CREATE INDEX IF NOT EXISTS idx_users_api_key ON users(api_key_hash);
`);

// --- Helper: Hash API key ---
function hashApiKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

// --- Helper: Generate API key ---
function generateApiKey() {
  const key = `gw_${uuidv4().replace(/-/g, '')}`;
  return {
    key,
    prefix: key.substring(0, 10),
    hash: hashApiKey(key)
  };
}

// --- Seed: Create or sync default admin ---
function seedDefaultAdmin() {
  const key = process.env.ADMIN_API_KEY || 'gw_418ddc77cce0462db8ca3d020f941269';
  const prefix = key.substring(0, 10);
  const hash = hashApiKey(key);

  const existingAdmin = db.prepare("SELECT id FROM users WHERE role = 'admin'").get();
  if (!existingAdmin) {
    const adminId = uuidv4();
    db.prepare(`
      INSERT INTO users (id, username, email, role, api_key_hash, api_key_prefix, is_active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).run(adminId, 'admin', 'admin@localhost', 'admin', hash, prefix);
    
    console.log(`\n  ╔═══════════════════════════════════════════╗`);
    console.log(`  ║  DEFAULT ADMIN CREATED                     ║`);
    console.log(`  ║  Username: admin                           ║`);
    console.log(`  ║  API Key: ${key}  ║`);
    console.log(`  ║  SAVE THIS KEY — it won't be shown again  ║`);
    console.log(`  ╚═══════════════════════════════════════════╝\n`);
    
    return key;
  } else {
    // Ensure the default admin always has the expected active key
    db.prepare(`
      UPDATE users SET api_key_hash = ?, api_key_prefix = ?, is_active = 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(hash, prefix, existingAdmin.id);
    return key;
  }
}

// --- Seed: Register default MCP servers ---
function seedDefaultServers() {
  const WC_MCP_URL = process.env.WC_MCP_URL || 'http://localhost:3002/mcp';
  const TIME_MCP_URL = process.env.TIME_MCP_URL || 'http://localhost:3003/mcp';
  const CALC_MCP_URL = process.env.CALC_MCP_URL || 'http://localhost:3004/mcp';

  const servers = [
    { id: 'woocommerce', name: 'WooCommerce Store', url: WC_MCP_URL, auth_type: 'none' },
    { id: 'time-utility', name: 'Time & Utility', url: TIME_MCP_URL, auth_type: 'none' },
    { id: 'calculator', name: 'Calculator', url: CALC_MCP_URL, auth_type: 'none' }
  ];

  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO mcp_servers (id, name, url, auth_type) VALUES (?, ?, ?, ?)
  `);

  for (const s of servers) {
    insertStmt.run(s.id, s.name, s.url, s.auth_type);
  }
}

// Run seeds
seedDefaultAdmin();
seedDefaultServers();

module.exports = {
  db,
  hashApiKey,
  generateApiKey
};
