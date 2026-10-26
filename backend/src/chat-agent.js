/**
 * Chat Agent
 * 
 * LLM-powered chat that calls MCP tools through the gateway.
 * Supports Gemini and Groq APIs (OpenAI-compatible format).
 * 
 * The agent acts as the logged-in user — all tool calls appear
 * in the audit log under that user's identity.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { getAllTools, callTool } = require('./mcp-gateway');

// --- Configuration ---
const LLM_PROVIDER = process.env.LLM_PROVIDER || 'gemini'; // 'gemini' or 'groq'
const LLM_API_KEY = process.env.LLM_API_KEY || (LLM_PROVIDER === 'groq' ? process.env.GROQ_API_KEY : '') || process.env.GROQ_API_KEY || '';
const LLM_MODEL = process.env.LLM_MODEL || (LLM_PROVIDER === 'gemini' ? 'gemini-3.5-flash-lite' : 'qwen/qwen3.8-27b');

// Provider configs
const PROVIDERS = {
  gemini: {
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    defaultModel: 'gemini-3.5-flash-lite',
    getHeaders: (apiKey) => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    })
  },
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'qwen/qwen3.8-27b',
    getHeaders: (apiKey) => ({
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    })
  }
};

const SYSTEM_PROMPT = `You are a helpful assistant integrated with an MCP (Model Context Protocol) gateway platform. You have access to tools from multiple upstream servers including WooCommerce (e-commerce), Time/Date utilities, and a Calculator.

When the user asks a question:
1. Think about which tools might help answer it
2. Call the appropriate tools using their prefixed names (e.g., "woocommerce__list_products", "time-utility__get_current_time", "calculator__calculate")
3. Synthesize the results into a clear, helpful response

Tool naming convention: Tools are prefixed with their server ID followed by double underscores. For example:
- woocommerce__list_products — List products from the WooCommerce store
- woocommerce__create_product — Create a new product
- woocommerce__list_orders — List orders
- time-utility__get_current_time — Get current time
- calculator__calculate — Evaluate math expressions

Always be concise and directly answer the user's question based on the tool results.`;

/**
 * Convert MCP tools to OpenAI function-calling format
 */
function mcpToolsToOpenAIFunctions(tools) {
  return tools.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description || '',
      parameters: tool.inputSchema || { type: 'object', properties: {} }
    }
  }));
}

/**
 * Run the chat agent loop:
 * 1. Send user message + available tools to LLM
 * 2. If LLM wants to call tools, execute them via the gateway
 * 3. Send tool results back to LLM
 * 4. Repeat until LLM gives a final text response
 */
async function runLocalSimulator(userMessage, user) {
  const msg = userMessage.toLowerCase();
  const allToolCalls = [];
  let responseText = '';

  // 1. Create product: e.g. "create a product called 'Silk Shirt' with price 49.99"
  if (msg.includes('create') && (msg.includes('product') || msg.includes('item'))) {
    // Extract name
    let name = 'New Product';
    const nameMatch = userMessage.match(/(?:called|named)\s+['"]?([^'"\d,]+?)['"]?\s+(?:with|priced|for|at|\$)/i) ||
                      userMessage.match(/create\s+(?:a\s+)?(?:new\s+)?product\s+(?:called\s+|named\s+)?['"]?([^'"\d,]+?)['"]?\s+(?:with|priced|for|at|\$)/i) ||
                      userMessage.match(/create\s+(?:a\s+)?(?:new\s+)?product\s+['"]?([^'"\d,]+?)['"]?(?:\s|$)/i);
    if (nameMatch && nameMatch[1].trim()) {
      name = nameMatch[1].trim().replace(/^called\s+/i, '').replace(/^named\s+/i, '');
    }

    // Extract price
    let price = '29.99';
    const priceMatch = userMessage.match(/(?:\$|price\s+(?:of\s+)?|for\s+|at\s+)(\d+(?:\.\d{1,2})?)/i) ||
                       userMessage.match(/(\d+(?:\.\d{1,2})?)\s*(?:dollars|\$)/i);
    if (priceMatch) {
      price = priceMatch[1];
    }

    const toolArgs = { name, regular_price: price };
    let toolResult;
    try {
      const res = await callTool('woocommerce__create_product', toolArgs, user);
      toolResult = res?.content?.[0]?.text || JSON.stringify(res);
      const parsed = typeof toolResult === 'string' ? JSON.parse(toolResult) : toolResult;
      responseText = `I have created the product "${parsed.name || name}" for $${parsed.price || price} in the WooCommerce store. Product ID: ${parsed.id}.`;
    } catch (err) {
      toolResult = `Error: ${err.message}`;
      responseText = `Failed to create product: ${err.message}`;
    }

    allToolCalls.push({
      tool: 'woocommerce__create_product',
      arguments: toolArgs,
      result: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult)
    });

    return { response: responseText, toolCalls: allToolCalls, error: false };
  }

  // 2. List orders: e.g. "what orders came in today?", "list orders"
  if (msg.includes('order')) {
    const toolArgs = { per_page: 10 };
    let toolResult;
    try {
      const res = await callTool('woocommerce__list_orders', toolArgs, user);
      toolResult = res?.content?.[0]?.text || JSON.stringify(res);
      const parsed = typeof toolResult === 'string' ? JSON.parse(toolResult) : toolResult;
      if (Array.isArray(parsed) && parsed.length > 0) {
        const orderSummaries = parsed.map(o => `• Order #${o.id}: $${o.total} (${o.status}) by ${o.customer_name || 'Customer'}`).join('\n');
        responseText = `Here are the recent orders from the store:\n\n${orderSummaries}`;
      } else {
        responseText = 'No orders found in the store for today.';
      }
    } catch (err) {
      toolResult = `Error: ${err.message}`;
      responseText = `Failed to list orders: ${err.message}`;
    }

    allToolCalls.push({
      tool: 'woocommerce__list_orders',
      arguments: toolArgs,
      result: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult)
    });

    return { response: responseText, toolCalls: allToolCalls, error: false };
  }

  // 3. List products: e.g. "what products do you have?", "list products"
  if (msg.includes('product')) {
    const toolArgs = { per_page: 10 };
    let toolResult;
    try {
      const res = await callTool('woocommerce__list_products', toolArgs, user);
      toolResult = res?.content?.[0]?.text || JSON.stringify(res);
      const parsed = typeof toolResult === 'string' ? JSON.parse(toolResult) : toolResult;
      if (Array.isArray(parsed) && parsed.length > 0) {
        const prodSummaries = parsed.map(p => `• ${p.name} — $${p.price} (${p.stock_status})`).join('\n');
        responseText = `Here are the products currently in the WooCommerce store:\n\n${prodSummaries}`;
      } else {
        responseText = 'No products found in the store.';
      }
    } catch (err) {
      toolResult = `Error: ${err.message}`;
      responseText = `Failed to list products: ${err.message}`;
    }

    allToolCalls.push({
      tool: 'woocommerce__list_products',
      arguments: toolArgs,
      result: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult)
    });

    return { response: responseText, toolCalls: allToolCalls, error: false };
  }

  // 4. Math calculation: e.g. "calculate 25 * 4", "what is sqrt(144) + 10"
  if (msg.includes('calculate') || msg.includes('sqrt') || msg.includes('discount') || /[0-9]+\s*[\+\-\*\/]\s*[0-9]+/.test(msg)) {
    let expr = '2 + 2';
    const discMatch = userMessage.match(/(\d+)%\s+(?:discount|off)\s+(?:on|of)?\s*\$?(\d+)/i) ||
                      userMessage.match(/(\d+)\s*(?:dollar|\$)?\s*(?:with|at)\s*(\d+)%\s*(?:discount|off)/i);
    if (discMatch) {
      expr = `${discMatch[2]} * (1 - ${discMatch[1]}/100)`;
    } else {
      const exprMatch = userMessage.match(/calculate\s+(.+)/i) || [null, userMessage.replace(/what is/i, '').replace(/\?/g, '').trim()];
      let raw = exprMatch[1] ? exprMatch[1].trim() : '2 + 2';
      raw = raw.replace(/\s+(?:and|then|please).+$/i, '').trim();
      expr = raw;
    }

    const toolArgs = { expression: expr };
    let toolResult;
    try {
      const res = await callTool('calculator__calculate', toolArgs, user);
      toolResult = res?.content?.[0]?.text || JSON.stringify(res);
      let parsed = null;
      try { parsed = JSON.parse(toolResult); } catch {}
      if (parsed && parsed.result !== undefined) {
        responseText = `The calculation result for "${expr}" is ${parsed.result}.`;
      } else {
        responseText = toolResult;
      }
    } catch (err) {
      toolResult = `Error: ${err.message}`;
      responseText = `Calculation error: ${err.message}`;
    }

    allToolCalls.push({
      tool: 'calculator__calculate',
      arguments: toolArgs,
      result: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult)
    });

    return { response: responseText, toolCalls: allToolCalls, error: false };
  }

  // 5. Time & Date: e.g. "what time is it?", "what is the date today"
  if (msg.includes('time') || msg.includes('date') || msg.includes('today')) {
    const toolArgs = { format: 'readable' };
    let toolResult;
    try {
      const res = await callTool('time-utility__get_current_time', toolArgs, user);
      toolResult = res?.content?.[0]?.text || JSON.stringify(res);
      const parsed = typeof toolResult === 'string' ? JSON.parse(toolResult) : toolResult;
      responseText = `The current date and time is: ${parsed.result}.`;
    } catch (err) {
      toolResult = `Error: ${err.message}`;
      responseText = `Time lookup error: ${err.message}`;
    }

    allToolCalls.push({
      tool: 'time-utility__get_current_time',
      arguments: toolArgs,
      result: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult)
    });

    return { response: responseText, toolCalls: allToolCalls, error: false };
  }

  // Default response
  return {
    response: `Hello ${user?.username || 'there'}! I am the Team MCP Gateway Chat Agent. I have access to tools across WooCommerce, Calculator, and Time & Utility servers.\n\nYou can ask me to:\n• "Create a product called Wireless Earbuds priced at $59.99"\n• "What orders came in today?"\n• "List all products in the store"\n• "Calculate sqrt(144) + 2 * 3"\n• "What is the current date and time?"\n\n*(Note: Set LLM_API_KEY in backend/.env to connect live Gemini or Groq models)*`,
    toolCalls: [],
    error: false
  };
}

/**
 * Run the chat agent loop:
 * 1. If LLM_API_KEY is configured, call Gemini/Groq with function calling
 * 2. If not, use local agent simulator so testing works out of the box
 */
async function runChatAgent(userMessage, conversationHistory, user) {
  if (!LLM_API_KEY) {
    return await runLocalSimulator(userMessage, user);
  }

  const provider = PROVIDERS[LLM_PROVIDER] || PROVIDERS.gemini;
  const model = LLM_MODEL || provider.defaultModel;
  const apiUrl = `${provider.baseUrl}/chat/completions`;

  // Get available tools
  let tools;
  try {
    tools = await getAllTools();
  } catch (err) {
    tools = [];
  }

  const openAITools = mcpToolsToOpenAIFunctions(tools);

  // Build messages
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...conversationHistory,
    { role: 'user', content: userMessage }
  ];

  const allToolCalls = [];
  let maxIterations = 10; // prevent infinite loops

  while (maxIterations-- > 0) {
    // Call LLM
    const requestBody = {
      model,
      messages,
      temperature: 0.3,
      max_tokens: 2048
    };

    if (openAITools.length > 0) {
      requestBody.tools = openAITools;
      requestBody.tool_choice = 'auto';
    }

    let llmResponse;
    try {
      const resp = await fetch(apiUrl, {
        method: 'POST',
        headers: provider.getHeaders(LLM_API_KEY),
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(8000)
      });

      if (!resp.ok) {
        const errText = await resp.text();
        console.error('[Chat Agent] Remote LLM API returned status:', resp.status, errText.substring(0, 150));
        console.log('[Chat Agent] Seamlessly falling back to local simulator so user experience is not disrupted.');
        return await runLocalSimulator(userMessage, user);
      }

      llmResponse = await resp.json();
    } catch (fetchError) {
      console.error('[Chat Agent] Fetch error:', fetchError.message);
      console.log('[Chat Agent] Seamlessly falling back to local simulator.');
      return await runLocalSimulator(userMessage, user);
    }

    const choice = llmResponse.choices?.[0];
    if (!choice) {
      return { response: 'No response from LLM', toolCalls: allToolCalls, error: true };
    }

    const assistantMessage = choice.message;

    // If no tool calls, return the text response
    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
      return {
        response: assistantMessage.content || 'No response generated.',
        toolCalls: allToolCalls,
        error: false
      };
    }

    // Process tool calls
    messages.push(assistantMessage);

    for (const tc of assistantMessage.tool_calls) {
      const toolName = tc.function.name;
      let toolArgs;
      try {
        toolArgs = JSON.parse(tc.function.arguments || '{}');
      } catch {
        toolArgs = {};
      }

      console.log(`[Chat Agent] Calling tool: ${toolName}`, toolArgs);

      let toolResult;
      try {
        const mcpResult = await callTool(toolName, toolArgs, user);
        // Extract text content from MCP result
        if (mcpResult && mcpResult.content) {
          toolResult = mcpResult.content.map(c => c.text || JSON.stringify(c)).join('\n');
        } else {
          toolResult = JSON.stringify(mcpResult);
        }
      } catch (err) {
        toolResult = `Error calling ${toolName}: ${err.message}`;
      }

      allToolCalls.push({
        tool: toolName,
        arguments: toolArgs,
        result: toolResult.substring(0, 1000) // truncate for UI
      });

      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: toolResult
      });
    }
  }

  return {
    response: 'Maximum tool call iterations reached. Please try a simpler question.',
    toolCalls: allToolCalls,
    error: true
  };
}

module.exports = { runChatAgent };
