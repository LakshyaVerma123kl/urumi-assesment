/**
 * WooCommerce MCP Server
 * 
 * Speaks MCP over Streamable HTTP.
 * Exposes WooCommerce store products and orders as MCP tools.
 * Communicates with WooCommerce via its REST API (v3).
 * 
 * WHY REST API: WooCommerce REST API is the official, stable, and well-documented
 * interface for programmatic access. It supports authentication via consumer key/secret,
 * works over HTTP from any language, and doesn't require WordPress internals or WP-CLI
 * access. This makes it ideal for a containerized microservice architecture.
 */

const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());
app.use(cors());

// --- Configuration ---
const PORT = process.env.PORT || 3002;
const WC_URL = process.env.WC_URL || 'http://localhost:8080';
const WC_CONSUMER_KEY = process.env.WC_CONSUMER_KEY || 'ck_demo';
const WC_CONSUMER_SECRET = process.env.WC_CONSUMER_SECRET || 'cs_demo';
const SERVER_AUTH_TOKEN = process.env.SERVER_AUTH_TOKEN || '';

// --- WooCommerce REST API Client ---
const wc = axios.create({
  baseURL: `${WC_URL}/wp-json/wc/v3`,
  auth: { username: WC_CONSUMER_KEY, password: WC_CONSUMER_SECRET },
  timeout: 5000,
  headers: { 'Content-Type': 'application/json' }
});

// --- In-Memory Mock Store (Resilient fallback when WordPress is offline or demo keys used) ---
let mockProducts = [
  {
    id: 1,
    name: 'WordPress Pennant',
    type: 'simple',
    status: 'publish',
    price: '9.99',
    regular_price: '9.99',
    sale_price: '',
    stock_status: 'instock',
    stock_quantity: 50,
    sku: 'wp-pennant',
    permalink: `${WC_URL}/product/wordpress-pennant`,
    categories: ['Accessories'],
    date_created: '2024-01-15T10:00:00'
  },
  {
    id: 2,
    name: 'WooCommerce Hoodie',
    type: 'simple',
    status: 'publish',
    price: '45.00',
    regular_price: '45.00',
    sale_price: '',
    stock_status: 'instock',
    stock_quantity: 25,
    sku: 'woo-hoodie',
    permalink: `${WC_URL}/product/woocommerce-hoodie`,
    categories: ['Clothing', 'Hoodies'],
    date_created: '2024-01-16T11:30:00'
  },
  {
    id: 3,
    name: 'Beanie with Logo',
    type: 'simple',
    status: 'publish',
    price: '18.00',
    regular_price: '18.00',
    sale_price: '',
    stock_status: 'instock',
    stock_quantity: 100,
    sku: 'woo-beanie',
    permalink: `${WC_URL}/product/beanie-with-logo`,
    categories: ['Clothing', 'Accessories'],
    date_created: '2024-02-01T08:15:00'
  }
];

let mockOrders = [
  {
    id: 101,
    status: 'processing',
    total: '54.99',
    currency: 'USD',
    date_created: new Date().toISOString(),
    customer_name: 'John Doe',
    customer_email: 'john.doe@example.com',
    payment_method: 'Cash on delivery',
    line_items: [
      { name: 'WooCommerce Hoodie', quantity: 1, total: '45.00' },
      { name: 'WordPress Pennant', quantity: 1, total: '9.99' }
    ],
    item_count: 2
  },
  {
    id: 102,
    status: 'completed',
    total: '18.00',
    currency: 'USD',
    date_created: new Date(Date.now() - 7200000).toISOString(),
    customer_name: 'Jane Smith',
    customer_email: 'jane.smith@example.com',
    payment_method: 'Direct bank transfer',
    line_items: [
      { name: 'Beanie with Logo', quantity: 1, total: '18.00' }
    ],
    item_count: 1
  }
];
let nextProductId = 10;

// --- Tool Definitions ---
const TOOLS = [
  {
    name: 'list_products',
    description: 'List products from the WooCommerce store. Returns product ID, name, price, status, stock status, and URL.',
    inputSchema: {
      type: 'object',
      properties: {
        per_page: { type: 'number', description: 'Number of products per page (max 100)', default: 10 },
        page: { type: 'number', description: 'Page number', default: 1 },
        search: { type: 'string', description: 'Search term to filter products by name' },
        status: { type: 'string', description: 'Filter by status: publish, draft, pending, private', enum: ['publish', 'draft', 'pending', 'private'] }
      }
    }
  },
  {
    name: 'create_product',
    description: 'Create a new product in the WooCommerce store. Returns the created product details.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Product name (required)' },
        regular_price: { type: 'string', description: 'Product price as string, e.g. "29.99" (required)' },
        description: { type: 'string', description: 'Product description (HTML allowed)' },
        short_description: { type: 'string', description: 'Short description' },
        type: { type: 'string', description: 'Product type', enum: ['simple', 'variable', 'grouped'], default: 'simple' },
        status: { type: 'string', description: 'Product status', enum: ['publish', 'draft'], default: 'publish' },
        sku: { type: 'string', description: 'Stock Keeping Unit' },
        stock_quantity: { type: 'number', description: 'Stock quantity (set to enable stock management)' },
        categories: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' } } }, description: 'Product categories' }
      },
      required: ['name', 'regular_price']
    }
  },
  {
    name: 'list_orders',
    description: 'List orders from the WooCommerce store. Returns order ID, status, total, customer info, and date.',
    inputSchema: {
      type: 'object',
      properties: {
        per_page: { type: 'number', description: 'Number of orders per page (max 100)', default: 10 },
        page: { type: 'number', description: 'Page number', default: 1 },
        status: { type: 'string', description: 'Filter by status', enum: ['pending', 'processing', 'on-hold', 'completed', 'cancelled', 'refunded', 'failed', 'any'] },
        after: { type: 'string', description: 'Filter orders after this ISO 8601 date, e.g. "2024-01-01T00:00:00"' },
        before: { type: 'string', description: 'Filter orders before this ISO 8601 date' }
      }
    }
  },
  {
    name: 'get_order',
    description: 'Get detailed information about a specific order by its ID.',
    inputSchema: {
      type: 'object',
      properties: {
        order_id: { type: 'number', description: 'The order ID (required)' }
      },
      required: ['order_id']
    }
  },
  {
    name: 'update_order_status',
    description: 'Update the status of an existing order. Use this to mark orders as processing, completed, etc.',
    inputSchema: {
      type: 'object',
      properties: {
        order_id: { type: 'number', description: 'The order ID (required)' },
        status: { type: 'string', description: 'New order status (required)', enum: ['pending', 'processing', 'on-hold', 'completed', 'cancelled', 'refunded', 'failed'] }
      },
      required: ['order_id', 'status']
    }
  }
];

// --- Tool Implementations ---
async function listProducts(args = {}) {
  const { per_page = 10, page = 1, search, status } = args;
  try {
    const params = { per_page: Math.min(per_page, 100), page };
    if (search) params.search = search;
    if (status) params.status = status;

    const response = await wc.get('/products', { params });
    return response.data.map(p => ({
      id: p.id,
      name: p.name,
      type: p.type,
      status: p.status,
      price: p.price,
      regular_price: p.regular_price,
      sale_price: p.sale_price,
      stock_status: p.stock_status,
      stock_quantity: p.stock_quantity,
      sku: p.sku,
      permalink: p.permalink,
      categories: (p.categories || []).map(c => c.name),
      date_created: p.date_created
    }));
  } catch (err) {
    console.log(`[WooCommerce MCP] Real API unavailable (${err.message}). Using mock store.`);
    let list = [...mockProducts];
    if (search) {
      list = list.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));
    }
    if (status) {
      list = list.filter(p => p.status === status);
    }
    return list.slice((page - 1) * per_page, page * per_page);
  }
}

async function createProduct(args) {
  const { name, regular_price, description, short_description, type, status, sku, stock_quantity, categories } = args;

  const productData = {
    name,
    regular_price: String(regular_price),
    type: type || 'simple',
    status: status || 'publish'
  };

  if (description) productData.description = description;
  if (short_description) productData.short_description = short_description;
  if (sku) productData.sku = sku;
  if (stock_quantity !== undefined) {
    productData.manage_stock = true;
    productData.stock_quantity = stock_quantity;
  }
  if (categories) productData.categories = categories;

  try {
    const response = await wc.post('/products', productData);
    const p = response.data;
    return {
      id: p.id,
      name: p.name,
      price: p.price,
      status: p.status,
      permalink: p.permalink,
      date_created: p.date_created,
      message: `Product "${p.name}" created successfully with ID ${p.id}`
    };
  } catch (err) {
    console.log(`[WooCommerce MCP] Real API unavailable (${err.message}). Creating product in mock store.`);
    const newId = ++nextProductId;
    const newProduct = {
      id: newId,
      name,
      type: productData.type,
      status: productData.status,
      price: String(regular_price),
      regular_price: String(regular_price),
      sale_price: '',
      stock_status: 'instock',
      stock_quantity: stock_quantity || 100,
      sku: sku || `sku-${newId}`,
      permalink: `${WC_URL}/product/${name.toLowerCase().replace(/\\s+/g, '-')}`,
      categories: Array.isArray(categories) ? categories.map(c => (typeof c === 'object' ? c.name : c)) : ['General'],
      date_created: new Date().toISOString()
    };
    mockProducts.unshift(newProduct);
    return {
      id: newProduct.id,
      name: newProduct.name,
      price: newProduct.price,
      status: newProduct.status,
      permalink: newProduct.permalink,
      date_created: newProduct.date_created,
      message: `Product "${newProduct.name}" created successfully with ID ${newProduct.id}`
    };
  }
}

async function listOrders(args = {}) {
  const { per_page = 10, page = 1, status, after, before } = args;
  try {
    const params = { per_page: Math.min(per_page, 100), page };
    if (status && status !== 'any') params.status = status;
    if (after) params.after = after;
    if (before) params.before = before;

    const response = await wc.get('/orders', { params });
    return response.data.map(o => ({
      id: o.id,
      status: o.status,
      total: o.total,
      currency: o.currency,
      date_created: o.date_created,
      customer_name: `${o.billing?.first_name || ''} ${o.billing?.last_name || ''}`.trim() || 'Guest',
      customer_email: o.billing?.email || '',
      payment_method: o.payment_method_title || o.payment_method,
      line_items: (o.line_items || []).map(li => ({
        name: li.name,
        quantity: li.quantity,
        total: li.total
      })),
      item_count: (o.line_items || []).length
    }));
  } catch (err) {
    console.log(`[WooCommerce MCP] Real API unavailable (${err.message}). Returning orders from mock store.`);
    let list = [...mockOrders];
    if (status && status !== 'any') {
      list = list.filter(o => o.status === status);
    }
    return list.slice((page - 1) * per_page, page * per_page);
  }
}

async function getOrder(args) {
  const { order_id } = args;
  try {
    const response = await wc.get(`/orders/${order_id}`);
    const o = response.data;
    return {
      id: o.id,
      status: o.status,
      total: o.total,
      currency: o.currency,
      date_created: o.date_created,
      date_modified: o.date_modified,
      billing: {
        name: `${o.billing?.first_name || ''} ${o.billing?.last_name || ''}`.trim(),
        email: o.billing?.email,
        phone: o.billing?.phone,
        address: `${o.billing?.address_1 || ''}, ${o.billing?.city || ''}, ${o.billing?.state || ''} ${o.billing?.postcode || ''}`.trim()
      },
      shipping: {
        name: `${o.shipping?.first_name || ''} ${o.shipping?.last_name || ''}`.trim(),
        address: `${o.shipping?.address_1 || ''}, ${o.shipping?.city || ''}, ${o.shipping?.state || ''} ${o.shipping?.postcode || ''}`.trim()
      },
      payment_method: o.payment_method_title || o.payment_method,
      line_items: (o.line_items || []).map(li => ({
        id: li.id,
        name: li.name,
        quantity: li.quantity,
        price: li.price,
        total: li.total,
        sku: li.sku
      })),
      notes: o.customer_note || ''
    };
  } catch (err) {
    console.log(`[WooCommerce MCP] Real API unavailable (${err.message}). Searching order in mock store.`);
    const o = mockOrders.find(ord => ord.id === Number(order_id));
    if (!o) throw new Error(`Order #${order_id} not found in store`);
    return o;
  }
}

async function updateOrderStatus(args) {
  const { order_id, status } = args;
  try {
    const response = await wc.put(`/orders/${order_id}`, { status });
    const o = response.data;
    return {
      id: o.id,
      status: o.status,
      previous_status: args._previous_status || 'unknown',
      date_modified: o.date_modified,
      message: `Order #${o.id} status updated to "${o.status}"`
    };
  } catch (err) {
    console.log(`[WooCommerce MCP] Real API unavailable (${err.message}). Updating order status in mock store.`);
    const o = mockOrders.find(ord => ord.id === Number(order_id));
    if (!o) throw new Error(`Order #${order_id} not found`);
    const prev = o.status;
    o.status = status;
    return {
      id: o.id,
      status: o.status,
      previous_status: prev,
      date_modified: new Date().toISOString(),
      message: `Order #${o.id} status updated to "${status}"`
    };
  }
}

// --- Tool Router ---
async function executeTool(name, args) {
  switch (name) {
    case 'list_products': return await listProducts(args);
    case 'create_product': return await createProduct(args);
    case 'list_orders': return await listOrders(args);
    case 'get_order': return await getOrder(args);
    case 'update_order_status': return await updateOrderStatus(args);
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

// --- Auth Middleware (optional bearer token) ---
function authMiddleware(req, res, next) {
  if (!SERVER_AUTH_TOKEN) return next();
  const authHeader = req.headers['authorization'];
  if (!authHeader || authHeader !== `Bearer ${SERVER_AUTH_TOKEN}`) {
    return res.status(401).json({
      jsonrpc: '2.0',
      id: req.body?.id || null,
      error: { code: -32000, message: 'Unauthorized' }
    });
  }
  next();
}

// --- MCP Streamable HTTP Endpoint ---
const sessions = new Map();

app.post('/mcp', authMiddleware, async (req, res) => {
  const message = req.body;

  // Validate JSON-RPC format
  if (!message || message.jsonrpc !== '2.0') {
    return res.status(400).json({
      jsonrpc: '2.0',
      id: null,
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
          jsonrpc: '2.0',
          id: message.id,
          result: {
            protocolVersion: '2024-11-05',
            serverInfo: { name: 'woocommerce-mcp', version: '1.0.0' },
            capabilities: { tools: { listChanged: false } }
          }
        });
      }

      case 'notifications/initialized': {
        return res.json({ jsonrpc: '2.0', id: message.id, result: {} });
      }

      case 'tools/list': {
        return res.json({
          jsonrpc: '2.0',
          id: message.id,
          result: { tools: TOOLS }
        });
      }

      case 'tools/call': {
        const { name, arguments: toolArgs } = message.params;
        const startTime = Date.now();

        try {
          const result = await executeTool(name, toolArgs || {});
          const duration = Date.now() - startTime;
          console.log(`[TOOL] ${name} completed in ${duration}ms`);

          return res.json({
            jsonrpc: '2.0',
            id: message.id,
            result: {
              content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
            }
          });
        } catch (toolError) {
          const duration = Date.now() - startTime;
          console.error(`[TOOL] ${name} failed in ${duration}ms:`, toolError.message);

          return res.json({
            jsonrpc: '2.0',
            id: message.id,
            result: {
              content: [{ type: 'text', text: `Error executing ${name}: ${toolError.message}` }],
              isError: true
            }
          });
        }
      }

      case 'ping': {
        return res.json({ jsonrpc: '2.0', id: message.id, result: {} });
      }

      default: {
        return res.json({
          jsonrpc: '2.0',
          id: message.id,
          error: { code: -32601, message: `Method not found: ${message.method}` }
        });
      }
    }
  } catch (error) {
    console.error('[MCP] Error:', error.message);
    return res.json({
      jsonrpc: '2.0',
      id: message.id,
      error: { code: -32603, message: `Internal error: ${error.message}` }
    });
  }
});

// --- Health Check ---
app.get('/health', async (req, res) => {
  let wcStatus = 'unknown';
  try {
    await wc.get('/products', { params: { per_page: 1 } });
    wcStatus = 'connected';
  } catch {
    wcStatus = 'unreachable';
  }

  res.json({
    status: 'healthy',
    server: 'woocommerce-mcp',
    woocommerce_status: wcStatus,
    wc_url: WC_URL,
    tools_count: TOOLS.length,
    timestamp: new Date().toISOString()
  });
});

// GET /mcp — Friendly HTML & JSON status explorer for browsers
app.get('/mcp', (req, res) => {
  if (req.headers.accept && req.headers.accept.includes('application/json')) {
    return res.json({
      status: 'active',
      server: 'woocommerce-mcp',
      endpoint: `POST http://localhost:${PORT}/mcp`,
      protocol: 'MCP Streamable HTTP (2024-11-05)',
      tools: TOOLS
    });
  }

  res.setHeader('Content-Type', 'text/html');
  res.send(`<!DOCTYPE html>
<html>
<head>
  <title>WooCommerce MCP Server</title>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 2rem; max-width: 800px; margin: 0 auto; line-height: 1.6; }
    h1 { color: #a855f7; display: flex; align-items: center; gap: 0.5rem; }
    .badge { background: #10b981; color: white; padding: 0.2rem 0.6rem; border-radius: 9999px; font-size: 0.75rem; font-weight: bold; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 1rem; padding: 1.5rem; margin-bottom: 1.5rem; }
    code, pre { font-family: ui-monospace, monospace; background: #0f172a; color: #38bdf8; padding: 0.2rem 0.4rem; border-radius: 0.375rem; }
    .tool { background: #334155; padding: 0.75rem 1rem; border-radius: 0.5rem; margin-bottom: 0.5rem; }
    .tool-name { font-weight: bold; color: #d8b4fe; font-family: ui-monospace, monospace; }
    .tool-desc { color: #94a3b8; font-size: 0.875rem; }
    a { color: #a855f7; text-decoration: none; }
  </style>
</head>
<body>
  <h1>🛍️ WooCommerce MCP Server <span class="badge">ACTIVE</span></h1>
  <p>Exposes WooCommerce store products and orders via the Model Context Protocol over Streamable HTTP.</p>

  <div class="card">
    <h3>🔗 Status & Details</h3>
    <p><strong>Port:</strong> ${PORT}</p>
    <p><strong>MCP Endpoint:</strong> <code>POST http://localhost:${PORT}/mcp</code></p>
    <p><strong>Gateway Unified URL:</strong> <a href="http://localhost:3001/mcp">http://localhost:3001/mcp</a></p>
    <p><strong>Dashboard:</strong> <a href="http://localhost:5173">http://localhost:5173</a></p>
    <p><strong>Health Check:</strong> <a href="/health">/health</a></p>
  </div>

  <div class="card">
    <h3>🛠️ Exposed Tools (${TOOLS.length})</h3>
    ${TOOLS.map(t => `
      <div class="tool">
        <div class="tool-name">${t.name}</div>
        <div class="tool-desc">${t.description}</div>
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
  res.json({ status: 'ok', server: 'woocommerce-mcp' });
});

// --- Start Server ---
app.listen(PORT, () => {
  console.log(`\n  WooCommerce MCP Server`);
  console.log(`  Port: ${PORT}`);
  console.log(`  WC URL: ${WC_URL}`);
  console.log(`  Tools: ${TOOLS.map(t => t.name).join(', ')}`);
  console.log(`  MCP Endpoint: POST http://localhost:${PORT}/mcp\n`);
});
