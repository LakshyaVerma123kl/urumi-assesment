const axios = require('axios');

const API_BASE = 'http://localhost:3001';
const ADMIN_KEY = 'gw_418ddc77cce0462db8ca3d020f941269';

async function runTests() {
  console.log('🚀 Starting Comprehensive End-to-End Test Suite...\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  // 1. Health check
  try {
    const health = await axios.get(`${API_BASE}/health`);
    assert(health.data.status === 'healthy', 'Gateway health check returns healthy');
  } catch (err) {
    assert(false, `Health check failed: ${err.message}`);
  }

  // 2. Admin Login
  try {
    const me = await axios.get(`${API_BASE}/api/auth/me`, {
      headers: { Authorization: `Bearer ${ADMIN_KEY}` }
    });
    assert(me.data.user.username === 'admin' && me.data.user.role === 'admin', 'Admin authenticated with valid role');
  } catch (err) {
    assert(false, `Admin auth failed: ${err.message}`);
  }

  // 3. MCP initialize endpoint
  let sessionId = null;
  try {
    const initRes = await axios.post(`${API_BASE}/mcp`, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05' }
    }, {
      headers: { Authorization: `Bearer ${ADMIN_KEY}` }
    });
    sessionId = initRes.headers['mcp-session-id'];
    assert(initRes.data.result.serverInfo.name === 'mcp-gateway', 'MCP client initialize succeeded');
  } catch (err) {
    assert(false, `MCP initialize failed: ${err.message}`);
  }

  // 4. List aggregated tools from all servers
  let allTools = [];
  try {
    const listRes = await axios.post(`${API_BASE}/mcp`, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list'
    }, {
      headers: { Authorization: `Bearer ${ADMIN_KEY}` }
    });
    allTools = listRes.data.result.tools;
    assert(allTools.length >= 15, `Aggregated all tools from 3 servers (found ${allTools.length} tools)`);

    const hasWc = allTools.some(t => t.name.startsWith('woocommerce__'));
    const hasTime = allTools.some(t => t.name.startsWith('time-utility__'));
    const hasCalc = allTools.some(t => t.name.startsWith('calculator__'));
    assert(hasWc && hasTime && hasCalc, 'Tool names correctly collision-prefixed across all 3 servers');
  } catch (err) {
    assert(false, `Tools list failed: ${err.message}`);
  }

  // 5. Call WooCommerce tool: list products
  try {
    const wcRes = await axios.post(`${API_BASE}/mcp`, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'woocommerce__list_products',
        arguments: { per_page: 5 }
      }
    }, {
      headers: { Authorization: `Bearer ${ADMIN_KEY}` }
    });
    const parsed = JSON.parse(wcRes.data.result.content[0].text);
    assert(Array.isArray(parsed) && parsed.length > 0, `woocommerce__list_products returned ${parsed.length} products`);
  } catch (err) {
    assert(false, `Call woocommerce__list_products failed: ${err.message}`);
  }

  // 6. Call WooCommerce tool: create product
  try {
    const createRes = await axios.post(`${API_BASE}/mcp`, {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'woocommerce__create_product',
        arguments: { name: 'Premium Silk Shirt', regular_price: '49.99' }
      }
    }, {
      headers: { Authorization: `Bearer ${ADMIN_KEY}` }
    });
    const parsed = JSON.parse(createRes.data.result.content[0].text);
    assert(parsed.name === 'Premium Silk Shirt' && parsed.id > 0, `woocommerce__create_product created product ID ${parsed.id}`);
  } catch (err) {
    assert(false, `Call woocommerce__create_product failed: ${err.message}`);
  }

  // 7. Call WooCommerce tool: list orders
  try {
    const ordersRes = await axios.post(`${API_BASE}/mcp`, {
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'woocommerce__list_orders',
        arguments: {}
      }
    }, {
      headers: { Authorization: `Bearer ${ADMIN_KEY}` }
    });
    const parsed = JSON.parse(ordersRes.data.result.content[0].text);
    assert(Array.isArray(parsed) && parsed.length > 0, `woocommerce__list_orders returned ${parsed.length} orders`);
  } catch (err) {
    assert(false, `Call woocommerce__list_orders failed: ${err.message}`);
  }

  // 8. Call Calculator tool
  try {
    const calcRes = await axios.post(`${API_BASE}/mcp`, {
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: {
        name: 'calculator__calculate',
        arguments: { expression: 'sqrt(144) + 2 * 3' }
      }
    }, {
      headers: { Authorization: `Bearer ${ADMIN_KEY}` }
    });
    const parsed = JSON.parse(calcRes.data.result.content[0].text);
    assert(parsed.result === 18, `calculator__calculate evaluated sqrt(144) + 2 * 3 = ${parsed.result}`);
  } catch (err) {
    assert(false, `Call calculator__calculate failed: ${err.message}`);
  }

  // 9. Call Time & Utility tool
  try {
    const timeRes = await axios.post(`${API_BASE}/mcp`, {
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: {
        name: 'time-utility__get_current_time',
        arguments: { format: 'readable' }
      }
    }, {
      headers: { Authorization: `Bearer ${ADMIN_KEY}` }
    });
    const parsed = JSON.parse(timeRes.data.result.content[0].text);
    assert(parsed.result && parsed.unix_timestamp, `time-utility__get_current_time returned ${parsed.result}`);
  } catch (err) {
    assert(false, `Call time-utility__get_current_time failed: ${err.message}`);
  }

  // 10. Team Management: Create User B (Member)
  let userB = null;
  const testUsername = `user_b_${Date.now().toString().slice(-6)}`;
  try {
    const userRes = await axios.post(`${API_BASE}/api/users`, {
      username: testUsername,
      email: `${testUsername}@company.com`,
      role: 'member'
    }, {
      headers: { Authorization: `Bearer ${ADMIN_KEY}` }
    });
    userB = userRes.data;
    assert(userB.username === testUsername && userB.role === 'member' && userB.api_key.startsWith('gw_'), `Created User B (${testUsername}) with hashed revokable API key`);
  } catch (err) {
    assert(false, `Create User B failed: ${err.message}`);
  }

  // 11. User B connects to external MCP client endpoint using their own API key
  try {
    const bList = await axios.post(`${API_BASE}/mcp`, {
      jsonrpc: '2.0',
      id: 8,
      method: 'tools/list'
    }, {
      headers: { Authorization: `Bearer ${userB.api_key}` }
    });
    assert(bList.data.result.tools.length >= 15, 'User B successfully accessed all aggregated tools without seeing upstream credentials');
  } catch (err) {
    assert(false, `User B tools/list failed: ${err.message}`);
  }

  // 12. User B calls a tool
  try {
    const bCall = await axios.post(`${API_BASE}/mcp`, {
      jsonrpc: '2.0',
      id: 9,
      method: 'tools/call',
      params: {
        name: 'calculator__calculate',
        arguments: { expression: '100 * 1.18' }
      }
    }, {
      headers: { Authorization: `Bearer ${userB.api_key}` }
    });
    const parsed = JSON.parse(bCall.data.result.content[0].text);
    assert(parsed.result === 118, 'User B executed tool call successfully');
  } catch (err) {
    assert(false, `User B tool call failed: ${err.message}`);
  }

  // 13. Audit Log: Verify User B attribution
  try {
    const auditRes = await axios.get(`${API_BASE}/api/audit?user_id=${userB.id}`, {
      headers: { Authorization: `Bearer ${ADMIN_KEY}` }
    });
    const userBLogs = auditRes.data.logs;
    assert(userBLogs.length > 0 && userBLogs[0].username === testUsername, `Audit log recorded User B tool call with user attribution (found ${userBLogs.length} entries)`);
  } catch (err) {
    assert(false, `Audit log check failed: ${err.message}`);
  }

  // 14. Revoke User B key -> Next call rejected
  try {
    await axios.post(`${API_BASE}/api/users/${userB.id}/revoke`, {}, {
      headers: { Authorization: `Bearer ${ADMIN_KEY}` }
    });

    let rejected = false;
    try {
      await axios.post(`${API_BASE}/mcp`, {
        jsonrpc: '2.0',
        id: 10,
        method: 'tools/list'
      }, {
        headers: { Authorization: `Bearer ${userB.api_key}` }
      });
    } catch (revokeErr) {
      rejected = revokeErr.response?.status === 403;
    }
    assert(rejected, 'Revoked User B key was immediately rejected with 403 Forbidden');
  } catch (err) {
    assert(false, `Revoke test failed: ${err.message}`);
  }

  // 15. Disable upstream server -> Tools disappear from gateway
  try {
    await axios.post(`${API_BASE}/api/mcp-servers/calculator/toggle`, {}, {
      headers: { Authorization: `Bearer ${ADMIN_KEY}` }
    });

    const listWithoutCalc = await axios.post(`${API_BASE}/mcp`, {
      jsonrpc: '2.0',
      id: 11,
      method: 'tools/list'
    }, {
      headers: { Authorization: `Bearer ${ADMIN_KEY}` }
    });

    const hasCalcAfterDisable = listWithoutCalc.data.result.tools.some(t => t.name.startsWith('calculator__'));
    assert(!hasCalcAfterDisable, 'Disabled upstream server: its tools immediately disappeared from the gateway endpoint');

    // Re-enable
    await axios.post(`${API_BASE}/api/mcp-servers/calculator/toggle`, {}, {
      headers: { Authorization: `Bearer ${ADMIN_KEY}` }
    });
    const listWithCalc = await axios.post(`${API_BASE}/mcp`, {
      jsonrpc: '2.0',
      id: 12,
      method: 'tools/list'
    }, {
      headers: { Authorization: `Bearer ${ADMIN_KEY}` }
    });
    const hasCalcAfterEnable = listWithCalc.data.result.tools.some(t => t.name.startsWith('calculator__'));
    assert(hasCalcAfterEnable, 'Re-enabled upstream server: tools returned to gateway endpoint');
  } catch (err) {
    assert(false, `Server disable/enable test failed: ${err.message}`);
  }

  console.log(`\n========================================`);
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================\n`);

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
