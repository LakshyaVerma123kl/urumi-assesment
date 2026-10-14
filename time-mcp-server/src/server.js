/**
 * Time & Utility MCP Server
 * 
 * A lightweight MCP server providing time, date, and utility tools.
 * Used as one of the required 3+ upstream MCP servers for the gateway.
 */

const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3003;
const SERVER_AUTH_TOKEN = process.env.SERVER_AUTH_TOKEN || '';

// --- Tool Definitions ---
const TOOLS = [
  {
    name: 'get_current_time',
    description: 'Get the current date and time in various formats and timezones.',
    inputSchema: {
      type: 'object',
      properties: {
        timezone: { type: 'string', description: 'IANA timezone string, e.g. "America/New_York", "Asia/Kolkata", "UTC"', default: 'UTC' },
        format: { type: 'string', description: 'Output format', enum: ['iso', 'readable', 'unix'], default: 'readable' }
      }
    }
  },
  {
    name: 'get_date_info',
    description: 'Get detailed information about a specific date (day of week, week number, is weekend, days until, etc).',
    inputSchema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Date in YYYY-MM-DD format. Defaults to today.' }
      }
    }
  },
  {
    name: 'calculate_date_difference',
    description: 'Calculate the difference between two dates in days, weeks, months, and years.',
    inputSchema: {
      type: 'object',
      properties: {
        start_date: { type: 'string', description: 'Start date in YYYY-MM-DD format (required)' },
        end_date: { type: 'string', description: 'End date in YYYY-MM-DD format (required)' }
      },
      required: ['start_date', 'end_date']
    }
  },
  {
    name: 'generate_uuid',
    description: 'Generate one or more UUIDs (v4).',
    inputSchema: {
      type: 'object',
      properties: {
        count: { type: 'number', description: 'Number of UUIDs to generate (max 20)', default: 1 }
      }
    }
  },
  {
    name: 'format_timestamp',
    description: 'Convert a Unix timestamp to a human-readable date/time string.',
    inputSchema: {
      type: 'object',
      properties: {
        timestamp: { type: 'number', description: 'Unix timestamp in seconds (required)' },
        timezone: { type: 'string', description: 'IANA timezone', default: 'UTC' }
      },
      required: ['timestamp']
    }
  }
];

// --- Tool Implementations ---
function getCurrentTime(args = {}) {
  const { timezone = 'UTC', format = 'readable' } = args;
  const now = new Date();

  let formatted;
  try {
    if (format === 'iso') {
      formatted = now.toLocaleString('sv-SE', { timeZone: timezone }).replace(' ', 'T') + 'Z';
    } else if (format === 'unix') {
      formatted = Math.floor(now.getTime() / 1000);
    } else {
      formatted = now.toLocaleString('en-US', {
        timeZone: timezone,
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
      });
    }
  } catch {
    formatted = now.toISOString();
  }

  return {
    timezone,
    format,
    result: formatted,
    utc_iso: now.toISOString(),
    unix_timestamp: Math.floor(now.getTime() / 1000)
  };
}

function getDateInfo(args = {}) {
  const dateStr = args.date || new Date().toISOString().split('T')[0];
  const date = new Date(dateStr + 'T00:00:00Z');

  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${dateStr}. Use YYYY-MM-DD format.`);
  }

  const now = new Date();
  const today = new Date(now.toISOString().split('T')[0] + 'T00:00:00Z');
  const diffMs = date.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  const dayNum = date.getUTCDay();

  // Get week number
  const startOfYear = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNumber = Math.ceil(((date - startOfYear) / (1000 * 60 * 60 * 24) + startOfYear.getUTCDay() + 1) / 7);

  // Days in month
  const daysInMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();

  // Is leap year
  const year = date.getUTCFullYear();
  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || (year % 400 === 0);

  return {
    date: dateStr,
    day_of_week: dayOfWeek,
    day_of_year: Math.ceil((date - startOfYear) / (1000 * 60 * 60 * 24)) + 1,
    week_number: weekNumber,
    month: date.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' }),
    year,
    is_weekend: dayNum === 0 || dayNum === 6,
    is_leap_year: isLeapYear,
    days_in_month: daysInMonth,
    days_from_today: diffDays,
    relative: diffDays === 0 ? 'today' : diffDays > 0 ? `${diffDays} days from now` : `${Math.abs(diffDays)} days ago`
  };
}

function calculateDateDifference(args) {
  const start = new Date(args.start_date + 'T00:00:00Z');
  const end = new Date(args.end_date + 'T00:00:00Z');

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error('Invalid date format. Use YYYY-MM-DD.');
  }

  const diffMs = Math.abs(end - start);
  const totalDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  return {
    start_date: args.start_date,
    end_date: args.end_date,
    total_days: totalDays,
    weeks: Math.floor(totalDays / 7),
    remaining_days: totalDays % 7,
    approximate_months: parseFloat((totalDays / 30.44).toFixed(1)),
    approximate_years: parseFloat((totalDays / 365.25).toFixed(2)),
    total_hours: totalDays * 24,
    is_same_date: totalDays === 0
  };
}

function generateUuid(args = {}) {
  const count = Math.min(Math.max(args.count || 1, 1), 20);
  const uuids = Array.from({ length: count }, () => uuidv4());
  return { count, uuids };
}

function formatTimestamp(args) {
  const { timestamp, timezone = 'UTC' } = args;
  const date = new Date(timestamp * 1000);

  if (isNaN(date.getTime())) {
    throw new Error(`Invalid timestamp: ${timestamp}`);
  }

  let formatted;
  try {
    formatted = date.toLocaleString('en-US', {
      timeZone: timezone,
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
    });
  } catch {
    formatted = date.toISOString();
  }

  return {
    unix_timestamp: timestamp,
    timezone,
    formatted,
    iso: date.toISOString()
  };
}

// --- Tool Router ---
function executeTool(name, args) {
  switch (name) {
    case 'get_current_time': return getCurrentTime(args);
    case 'get_date_info': return getDateInfo(args);
    case 'calculate_date_difference': return calculateDateDifference(args);
    case 'generate_uuid': return generateUuid(args);
    case 'format_timestamp': return formatTimestamp(args);
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

// --- Auth Middleware ---
function authMiddleware(req, res, next) {
  if (!SERVER_AUTH_TOKEN) return next();
  const authHeader = req.headers['authorization'];
  if (!authHeader || authHeader !== `Bearer ${SERVER_AUTH_TOKEN}`) {
    return res.status(401).json({
      jsonrpc: '2.0', id: req.body?.id || null,
      error: { code: -32000, message: 'Unauthorized' }
    });
  }
  next();
}

// --- MCP Streamable HTTP Endpoint ---
const sessions = new Map();

app.post('/mcp', authMiddleware, async (req, res) => {
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
        sessions.set(sessionId, { created: Date.now() });
        res.setHeader('Mcp-Session-Id', sessionId);
        return res.json({
          jsonrpc: '2.0', id: message.id,
          result: {
            protocolVersion: '2024-11-05',
            serverInfo: { name: 'time-utility-mcp', version: '1.0.0' },
            capabilities: { tools: { listChanged: false } }
          }
        });
      }

      case 'notifications/initialized':
        return res.json({ jsonrpc: '2.0', id: message.id, result: {} });

      case 'tools/list':
        return res.json({ jsonrpc: '2.0', id: message.id, result: { tools: TOOLS } });

      case 'tools/call': {
        const { name, arguments: toolArgs } = message.params;
        try {
          const result = executeTool(name, toolArgs || {});
          return res.json({
            jsonrpc: '2.0', id: message.id,
            result: { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
          });
        } catch (toolError) {
          return res.json({
            jsonrpc: '2.0', id: message.id,
            result: { content: [{ type: 'text', text: `Error: ${toolError.message}` }], isError: true }
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
    return res.json({
      jsonrpc: '2.0', id: message.id,
      error: { code: -32603, message: error.message }
    });
  }
});

// --- Health ---
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', server: 'time-utility-mcp', tools_count: TOOLS.length, timestamp: new Date().toISOString() });
});

// GET /mcp — Friendly HTML explorer
app.get('/mcp', (req, res) => {
  if (req.headers.accept && req.headers.accept.includes('application/json')) {
    return res.json({ status: 'active', server: 'time-utility-mcp', tools: TOOLS });
  }

  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html><html><head><title>Time & Utility MCP</title><meta charset="utf-8">
  <style>body{font-family:sans-serif;background:#0f172a;color:#f8fafc;padding:2rem;max-width:800px;margin:auto;line-height:1.6}h1{color:#38bdf8}.card{background:#1e293b;border-radius:1rem;padding:1.5rem;margin-bottom:1rem;border:1px solid #334155}code{background:#0f172a;color:#38bdf8;padding:0.2rem 0.4rem;border-radius:0.3rem}.tool{background:#334155;padding:0.6rem 1rem;border-radius:0.5rem;margin-bottom:0.5rem}.name{font-weight:bold;color:#7dd3fc;font-family:monospace}a{color:#38bdf8}</style>
  </head><body><h1>⏱️ Time & Utility MCP Server</h1><div class="card"><p><strong>Port:</strong> ${PORT}</p><p><strong>MCP Endpoint:</strong> <code>POST http://localhost:${PORT}/mcp</code></p><p><strong>Gateway:</strong> <a href="http://localhost:3001/mcp">http://localhost:3001/mcp</a></p><p><strong>Health:</strong> <a href="/health">/health</a></p></div><div class="card"><h3>Tools</h3>${TOOLS.map(t=>`<div class="tool"><div class="name">${t.name}</div><div style="color:#94a3b8;font-size:0.875rem">${t.description}</div></div>`).join('')}</div></body></html>`);
});

app.get('/', (req, res) => res.redirect('/mcp'));
app.get('/.well-known/appspecific/com.chrome.devtools.json', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`\n  Time & Utility MCP Server`);
  console.log(`  Port: ${PORT}`);
  console.log(`  Tools: ${TOOLS.map(t => t.name).join(', ')}`);
  console.log(`  MCP Endpoint: POST http://localhost:${PORT}/mcp\n`);
});
