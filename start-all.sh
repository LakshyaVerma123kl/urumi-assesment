#!/usr/bin/env bash
# Start all MCP Platform services locally for development and demonstration

echo "=================================================="
echo "  Starting Team MCP Gateway & WooCommerce Platform"
echo "=================================================="

# 1. Start WooCommerce MCP Server (Port 3002)
echo "[1/5] Starting WooCommerce MCP Server on port 3002..."
(cd woocommerce-mcp-server && node src/server.js) &
PID_WC=$!

# 2. Start Time & Utility MCP Server (Port 3003)
echo "[2/5] Starting Time & Utility MCP Server on port 3003..."
(cd time-mcp-server && node src/server.js) &
PID_TIME=$!

# 3. Start Calculator MCP Server (Port 3004)
echo "[3/5] Starting Calculator MCP Server on port 3004..."
(cd calculator-mcp-server && node src/server.js) &
PID_CALC=$!

sleep 2

# 4. Start Gateway Backend (Port 3001)
echo "[4/5] Starting MCP Gateway & Orchestrator on port 3001..."
(cd backend && node src/server.js) &
PID_GW=$!

sleep 2

# 5. Start Frontend (Port 5173)
echo "[5/5] Starting Frontend Dashboard on port 5173..."
(cd frontend && npx vite --port 5173) &
PID_FE=$!

echo "=================================================="
echo "  All services started successfully!"
echo "  Dashboard: http://localhost:5173"
echo "  Gateway API: http://localhost:3001"
echo "  MCP Endpoint: POST http://localhost:3001/mcp"
echo "=================================================="

trap "kill $PID_WC $PID_TIME $PID_CALC $PID_GW $PID_FE" SIGINT SIGTERM EXIT
wait
