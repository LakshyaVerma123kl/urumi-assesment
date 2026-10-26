#!/bin/sh
set -e

echo "=========================================="
echo " Starting MCP Microservices in Cloud Mode"
echo "=========================================="

# 1. Start WooCommerce MCP Server (Port 3002)
PORT=3002 node /app/woocommerce-mcp-server/src/server.js &

# 2. Start Time & Utility MCP Server (Port 3003)
PORT=3003 node /app/time-mcp-server/src/server.js &

# 3. Start Calculator MCP Server (Port 3004)
PORT=3004 node /app/calculator-mcp-server/src/server.js &

# Wait for upstreams to bind to their ports
sleep 2

# 4. Start Gateway Backend on public port ($PORT injected by Render/cloud, default 3001)
echo "Starting MCP Gateway & Dashboard Backend on port ${PORT:-3001}..."
cd /app/backend
exec node src/server.js
