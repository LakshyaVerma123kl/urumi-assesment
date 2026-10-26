/**
 * Calculator MCP Server
 * 
 * A lightweight MCP server providing math, calculation, and conversion tools.
 * Used as one of the required 3+ upstream MCP servers for the gateway.
 */

const express = require('express');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const PORT = process.env.PORT || 3004;
const SERVER_AUTH_TOKEN = process.env.SERVER_AUTH_TOKEN || '';

// --- Tool Definitions ---
const TOOLS = [
  {
    name: 'calculate',
    description: 'Evaluate a mathematical expression. Supports +, -, *, /, %, ** (power), parentheses, and common math functions (sqrt, abs, ceil, floor, round, sin, cos, tan, log, log2, log10, exp, PI, E).',
    inputSchema: {
      type: 'object',
      properties: {
        expression: { type: 'string', description: 'Math expression to evaluate, e.g. "sqrt(144) + 2 * 3"' }
      },
      required: ['expression']
    }
  },
  {
    name: 'convert_units',
    description: 'Convert values between common units. Supports length (m, km, mi, ft, in, cm, mm, yd), weight (kg, g, lb, oz, mg), temperature (C, F, K), and data (B, KB, MB, GB, TB).',
    inputSchema: {
      type: 'object',
      properties: {
        value: { type: 'number', description: 'The value to convert (required)' },
        from_unit: { type: 'string', description: 'Source unit (required)' },
        to_unit: { type: 'string', description: 'Target unit (required)' }
      },
      required: ['value', 'from_unit', 'to_unit']
    }
  },
  {
    name: 'random_number',
    description: 'Generate random numbers within a range.',
    inputSchema: {
      type: 'object',
      properties: {
        min: { type: 'number', description: 'Minimum value (inclusive)', default: 0 },
        max: { type: 'number', description: 'Maximum value (inclusive)', default: 100 },
        count: { type: 'number', description: 'How many random numbers to generate (max 100)', default: 1 },
        integer: { type: 'boolean', description: 'Whether to generate integers only', default: true }
      }
    }
  },
  {
    name: 'statistics',
    description: 'Calculate statistical measures for a set of numbers: mean, median, mode, std deviation, min, max, sum.',
    inputSchema: {
      type: 'object',
      properties: {
        numbers: { type: 'array', items: { type: 'number' }, description: 'Array of numbers to analyze (required)' }
      },
      required: ['numbers']
    }
  },
  {
    name: 'percentage',
    description: 'Calculate percentages: what percent of, percent change, add/subtract percentage.',
    inputSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', description: 'Type of calculation', enum: ['what_percent_of', 'percent_change', 'add_percent', 'subtract_percent'] },
        value: { type: 'number', description: 'The base value (required)' },
        percent_or_value2: { type: 'number', description: 'Percentage or second value depending on operation (required)' }
      },
      required: ['operation', 'value', 'percent_or_value2']
    }
  }
];

// --- Safe Math Expression Evaluator ---
function safeEval(expression) {
  // Sanitize: only allow numbers, operators, parens, dots, spaces, and math function names
  const sanitized = expression
    .replace(/\bsqrt\b/g, 'Math.sqrt')
    .replace(/\babs\b/g, 'Math.abs')
    .replace(/\bceil\b/g, 'Math.ceil')
    .replace(/\bfloor\b/g, 'Math.floor')
    .replace(/\bround\b/g, 'Math.round')
    .replace(/\bsin\b/g, 'Math.sin')
    .replace(/\bcos\b/g, 'Math.cos')
    .replace(/\btan\b/g, 'Math.tan')
    .replace(/\blog10\b/g, 'Math.log10')
    .replace(/\blog2\b/g, 'Math.log2')
    .replace(/\blog\b/g, 'Math.log')
    .replace(/\bexp\b/g, 'Math.exp')
    .replace(/\bPI\b/g, 'Math.PI')
    .replace(/\bpi\b/g, 'Math.PI')
    .replace(/\bE\b/g, 'Math.E')
    .replace(/\bpow\b/g, 'Math.pow')
    .replace(/\bmin\b/g, 'Math.min')
    .replace(/\bmax\b/g, 'Math.max');

  // Validate: reject anything that isn't a known safe pattern
  if (/[^0-9+\-*/%.(),\s^Math.sqrtabceilflooroundsincogtanexplogPIEpowminmax]/.test(sanitized.replace(/Math\.\w+/g, ''))) {
    throw new Error('Expression contains invalid characters. Only numbers, operators (+, -, *, /, %, **), parentheses, and math functions are allowed.');
  }

  try {
    const fn = new Function(`"use strict"; return (${sanitized});`);
    const result = fn();
    if (typeof result !== 'number' || !isFinite(result)) {
      throw new Error('Result is not a finite number');
    }
    return result;
  } catch (e) {
    throw new Error(`Failed to evaluate expression: ${e.message}`);
  }
}

// --- Unit Conversion Tables ---
const LENGTH_TO_METERS = { m: 1, km: 1000, mi: 1609.344, ft: 0.3048, in: 0.0254, cm: 0.01, mm: 0.001, yd: 0.9144 };
const WEIGHT_TO_KG = { kg: 1, g: 0.001, lb: 0.453592, oz: 0.0283495, mg: 0.000001, ton: 1000 };
const DATA_TO_BYTES = { B: 1, KB: 1024, MB: 1048576, GB: 1073741824, TB: 1099511627776 };

function convertUnits(value, from, to) {
  from = from.trim();
  to = to.trim();

  // Temperature
  const tempUnits = ['C', 'F', 'K'];
  if (tempUnits.includes(from.toUpperCase()) && tempUnits.includes(to.toUpperCase())) {
    return convertTemperature(value, from.toUpperCase(), to.toUpperCase());
  }

  // Length
  if (LENGTH_TO_METERS[from] !== undefined && LENGTH_TO_METERS[to] !== undefined) {
    return (value * LENGTH_TO_METERS[from]) / LENGTH_TO_METERS[to];
  }

  // Weight
  if (WEIGHT_TO_KG[from] !== undefined && WEIGHT_TO_KG[to] !== undefined) {
    return (value * WEIGHT_TO_KG[from]) / WEIGHT_TO_KG[to];
  }

  // Data
  if (DATA_TO_BYTES[from] !== undefined && DATA_TO_BYTES[to] !== undefined) {
    return (value * DATA_TO_BYTES[from]) / DATA_TO_BYTES[to];
  }

  throw new Error(`Cannot convert from "${from}" to "${to}". Ensure both units are in the same category (length, weight, temperature, or data).`);
}

function convertTemperature(value, from, to) {
  if (from === to) return value;
  // Convert to Celsius first
  let celsius;
  if (from === 'C') celsius = value;
  else if (from === 'F') celsius = (value - 32) * 5 / 9;
  else celsius = value - 273.15; // K

  // Convert from Celsius to target
  if (to === 'C') return celsius;
  if (to === 'F') return celsius * 9 / 5 + 32;
  return celsius + 273.15; // K
}

// --- Tool Implementations ---
function calculate(args) {
  const result = safeEval(args.expression);
  return {
    expression: args.expression,
    result: Math.round(result * 1e10) / 1e10 // avoid floating point noise
  };
}

function convertUnitsHandler(args) {
  const { value, from_unit, to_unit } = args;
  const result = convertUnits(value, from_unit, to_unit);
  return {
    original: { value, unit: from_unit },
    converted: { value: Math.round(result * 1e10) / 1e10, unit: to_unit },
    formula: `${value} ${from_unit} = ${Math.round(result * 1e10) / 1e10} ${to_unit}`
  };
}

function randomNumber(args = {}) {
  const { min = 0, max = 100, count = 1, integer = true } = args;
  const n = Math.min(Math.max(count, 1), 100);
  const numbers = Array.from({ length: n }, () => {
    const val = Math.random() * (max - min) + min;
    return integer ? Math.floor(val) : Math.round(val * 1e6) / 1e6;
  });
  return { min, max, count: n, integer, numbers };
}

function statistics(args) {
  const nums = args.numbers;
  if (!nums || nums.length === 0) throw new Error('Provide at least one number');

  const sorted = [...nums].sort((a, b) => a - b);
  const sum = nums.reduce((a, b) => a + b, 0);
  const mean = sum / nums.length;

  // Median
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;

  // Mode
  const freq = {};
  nums.forEach(n => freq[n] = (freq[n] || 0) + 1);
  const maxFreq = Math.max(...Object.values(freq));
  const mode = Object.keys(freq).filter(k => freq[k] === maxFreq).map(Number);

  // Standard deviation
  const variance = nums.reduce((acc, n) => acc + Math.pow(n - mean, 2), 0) / nums.length;
  const stdDev = Math.sqrt(variance);

  return {
    count: nums.length, sum, mean: Math.round(mean * 1e6) / 1e6,
    median, mode: mode.length === nums.length ? 'no mode' : mode,
    min: sorted[0], max: sorted[sorted.length - 1],
    range: sorted[sorted.length - 1] - sorted[0],
    variance: Math.round(variance * 1e6) / 1e6,
    standard_deviation: Math.round(stdDev * 1e6) / 1e6
  };
}

function percentageCalc(args) {
  const { operation, value, percent_or_value2 } = args;
  let result, explanation;

  switch (operation) {
    case 'what_percent_of':
      result = (value / percent_or_value2) * 100;
      explanation = `${value} is ${Math.round(result * 100) / 100}% of ${percent_or_value2}`;
      break;
    case 'percent_change':
      result = ((percent_or_value2 - value) / Math.abs(value)) * 100;
      explanation = `Change from ${value} to ${percent_or_value2} is ${Math.round(result * 100) / 100}%`;
      break;
    case 'add_percent':
      result = value + (value * percent_or_value2 / 100);
      explanation = `${value} + ${percent_or_value2}% = ${Math.round(result * 100) / 100}`;
      break;
    case 'subtract_percent':
      result = value - (value * percent_or_value2 / 100);
      explanation = `${value} - ${percent_or_value2}% = ${Math.round(result * 100) / 100}`;
      break;
    default:
      throw new Error(`Unknown operation: ${operation}`);
  }

  return { operation, value, percent_or_value2, result: Math.round(result * 1e6) / 1e6, explanation };
}

// --- Tool Router ---
function executeTool(name, args) {
  switch (name) {
    case 'calculate': return calculate(args);
    case 'convert_units': return convertUnitsHandler(args);
    case 'random_number': return randomNumber(args);
    case 'statistics': return statistics(args);
    case 'percentage': return percentageCalc(args);
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
            serverInfo: { name: 'calculator-mcp', version: '1.0.0' },
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
  res.json({ status: 'healthy', server: 'calculator-mcp', tools_count: TOOLS.length, timestamp: new Date().toISOString() });
});

// GET /mcp — Friendly HTML explorer
app.get('/mcp', (req, res) => {
  if (req.headers.accept && req.headers.accept.includes('application/json')) {
    return res.json({ status: 'active', server: 'calculator-mcp', tools: TOOLS });
  }

  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html><html><head><title>Calculator MCP</title><meta charset="utf-8">
  <style>body{font-family:sans-serif;background:#0f172a;color:#f8fafc;padding:2rem;max-width:800px;margin:auto;line-height:1.6}h1{color:#10b981}.card{background:#1e293b;border-radius:1rem;padding:1.5rem;margin-bottom:1rem;border:1px solid #334155}code{background:#0f172a;color:#38bdf8;padding:0.2rem 0.4rem;border-radius:0.3rem}.tool{background:#334155;padding:0.6rem 1rem;border-radius:0.5rem;margin-bottom:0.5rem}.name{font-weight:bold;color:#6ee7b7;font-family:monospace}a{color:#10b981}</style>
  </head><body><h1>🧮 Calculator MCP Server</h1><div class="card"><p><strong>Port:</strong> ${PORT}</p><p><strong>MCP Endpoint:</strong> <code>POST http://localhost:${PORT}/mcp</code></p><p><strong>Gateway:</strong> <a href="http://localhost:3001/mcp">http://localhost:3001/mcp</a></p><p><strong>Health:</strong> <a href="/health">/health</a></p></div><div class="card"><h3>Tools</h3>${TOOLS.map(t=>`<div class="tool"><div class="name">${t.name}</div><div style="color:#94a3b8;font-size:0.875rem">${t.description}</div></div>`).join('')}</div></body></html>`);
});

app.get('/', (req, res) => res.redirect('/mcp'));
app.get('/.well-known/appspecific/com.chrome.devtools.json', (req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`\n  Calculator MCP Server`);
  console.log(`  Port: ${PORT}`);
  console.log(`  Tools: ${TOOLS.map(t => t.name).join(', ')}`);
  console.log(`  MCP Endpoint: POST http://localhost:${PORT}/mcp\n`);
});
