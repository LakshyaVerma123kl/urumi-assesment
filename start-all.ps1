# Start all MCP Platform services locally for development and demonstration

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  Starting Team MCP Gateway & WooCommerce Platform" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan

# 1. Start WooCommerce MCP Server (Port 3002)
Write-Host "`n[1/5] Starting WooCommerce MCP Server on port 3002..." -ForegroundColor Yellow
Start-Process -NoNewWindow node -ArgumentList "src/server.js" -WorkingDirectory "$PSScriptRoot\woocommerce-mcp-server"

# 2. Start Time & Utility MCP Server (Port 3003)
Write-Host "[2/5] Starting Time & Utility MCP Server on port 3003..." -ForegroundColor Yellow
Start-Process -NoNewWindow node -ArgumentList "src/server.js" -WorkingDirectory "$PSScriptRoot\time-mcp-server"

# 3. Start Calculator MCP Server (Port 3004)
Write-Host "[3/5] Starting Calculator MCP Server on port 3004..." -ForegroundColor Yellow
Start-Process -NoNewWindow node -ArgumentList "src/server.js" -WorkingDirectory "$PSScriptRoot\calculator-mcp-server"

Start-Sleep -Seconds 2

# 4. Start Gateway Backend (Port 3001)
Write-Host "[4/5] Starting MCP Gateway & Orchestrator on port 3001..." -ForegroundColor Yellow
Start-Process -NoNewWindow node -ArgumentList "src/server.js" -WorkingDirectory "$PSScriptRoot\backend"

Start-Sleep -Seconds 2

# 5. Start Frontend (Port 5173)
Write-Host "[5/5] Starting Frontend Dashboard on port 5173..." -ForegroundColor Yellow
Start-Process -NoNewWindow npx -ArgumentList "vite --port 5173" -WorkingDirectory "$PSScriptRoot\frontend"

Write-Host "`n==================================================" -ForegroundColor Green
Write-Host "  All services started successfully!" -ForegroundColor Green
Write-Host "  Dashboard: http://localhost:5173" -ForegroundColor Green
Write-Host "  Gateway API: http://localhost:3001" -ForegroundColor Green
Write-Host "  MCP Endpoint: POST http://localhost:3001/mcp" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
