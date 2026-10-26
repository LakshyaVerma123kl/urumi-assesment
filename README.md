# 🌐 Team MCP Gateway & WooCommerce Hosting on Kubernetes

> **Urumi AI FDE Internship - Round 1 Submission**  
> Complete production-ready implementation of a multi-tenant WooCommerce hosting platform with an integrated Team MCP (Model Context Protocol) Gateway on Kubernetes.

[![Kubernetes](https://img.shields.io/badge/Kubernetes-1.28+-326CE5?logo=kubernetes&logoColor=white)](https://kubernetes.io/)
[![Helm](https://img.shields.io/badge/Helm-v3-0F1689?logo=helm&logoColor=white)](https://helm.sh/)
[![MCP](https://img.shields.io/badge/Protocol-MCP%20Streamable%20HTTP-black)](https://modelcontextprotocol.io/)
[![React](https://img.shields.io/badge/Frontend-React%2019%20%2B%20Vite%20%2B%20Tailwind-61DAFB?logo=react&logoColor=black)](https://react.dev/)
[![Node.js](https://img.shields.io/badge/Backend-Node.js%2020+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)

---

## 📑 Table of Contents

1. [System Architecture (The 4 Layers)](#-system-architecture)
2. [Component Overview](#-component-overview)
3. [Quick Start (Local Development)](#-quick-start-local-development)
4. [Kubernetes & Helm Deployment (Local & VPS)](#-kubernetes--helm-deployment)
5. [Definition of Done: Live Demonstration Walkthrough (2 Users)](#-definition-of-done-walkthrough)
6. [Connecting External MCP Clients (Claude Code, Cursor, MCP Inspector)](#-connecting-external-mcp-clients)
7. [Chat Agent Usage](#-chat-agent-usage)
8. [Security & Threat Model](#-security--threat-model)
9. [Bonus & Stand-Out Features](#-bonus--stand-out-features)
10. [Automated Verification & Testing](#-automated-verification--testing)

---

## 🏗 System Architecture

The platform spans four interconnected layers designed for zero-trust team environments:

```
┌────────────────────────────────────────────────────────────────────────┐
│ LAYER 4: CLIENT & CHAT AGENT INTERACTION                                │
│ • Web Chat Agent (Gemini / Groq LLM with function-calling loop)        │
│ • External MCP Clients (Claude Code, Cursor, MCP Inspector)            │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Single Unified Endpoint: POST /mcp
                                    │ Header: Authorization: Bearer gw_...
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ LAYER 3: MCP GATEWAY & ADMIN DASHBOARD                                  │
│ • Client Authentication (SHA-256 hashed API keys)                      │
│ • Role-Based Access Control (Admin vs Member)                          │
│ • Tool Aggregation & Collision Scheme (`serverid__toolname`)           │
│ • Dead Upstream Circuit Breaking & Timeout Enforcement (15s)           │
│ • Immutable Audit Log with User Attribution & Duration                 │
└───────────┬───────────────────────┬──────────────────────┬─────────────┘
            │                       │                      │
            │ Internal ClusterIP    │ Internal ClusterIP   │ Internal ClusterIP
            │ NetworkPolicy Gated   │ NetworkPolicy Gated  │ NetworkPolicy Gated
            ▼                       ▼                      ▼
┌───────────────────────┐ ┌───────────────────┐ ┌────────────────────────┐
│ LAYER 2: WOOCOMMERCE  │ │ TIME & UTILITY    │ │ CALCULATOR             │
│ MCP SERVER (Port 3002)│ │ MCP SERVER (3003) │ │ MCP SERVER (Port 3004) │
│ • list_products       │ │ • get_current_time│ │ • calculate            │
│ • create_product      │ │ • get_date_info   │ │ • convert_units        │
│ • list_orders         │ │ • date_difference │ │ • statistics           │
│ • get_order           │ │ • generate_uuid   │ │ • percentage           │
│ • update_order_status │ │ • timestamp_format│ │ • random_number        │
└───────────┬───────────┘ └───────────────────┘ └────────────────────────┘
            │
            │ WooCommerce REST API v3 (http://wordpress.../wp-json/wc/v3)
            ▼
┌────────────────────────────────────────────────────────────────────────┐
│ LAYER 1: STORE RUNTIME (Kubernetes / Namespace: ns-store-default)      │
│ • WordPress Deployment (Persistent Volume for wp-content)              │
│ • MySQL StatefulSet (Persistent Volume for database)                   │
│ • Isolated via Kubernetes NetworkPolicy & ResourceQuota                │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 📦 Component Overview

| Component | Directory | Description |
|-----------|-----------|-------------|
| **MCP Gateway & Orchestrator** | `backend/` | Unified Express server providing the `/mcp` aggregation endpoint, user management, audit logging, and K8s store orchestrator. |
| **Frontend Dashboard** | `frontend/` | React 19 + Tailwind dashboard for MCP server controls, user key management, audit trail viewer, chat agent, and store lifecycle. |
| **WooCommerce MCP Server** | `woocommerce-mcp-server/` | Custom Node.js microservice exposing store tools over Streamable HTTP with dual-mode live/resilient fallback. |
| **Time & Utility MCP Server** | `time-mcp-server/` | Streamable HTTP MCP server exposing time, date calculation, and UUID utilities. |
| **Calculator MCP Server** | `calculator-mcp-server/` | Streamable HTTP MCP server providing math expression evaluation, unit conversions, and statistics. |
| **Platform Helm Chart** | `charts/mcp-platform/` | Helm chart deploying Gateway, Dashboard, and all 3 upstream servers with NetworkPolicy isolation. |
| **Store Helm Chart** | `charts/store-base/` | Production-ready WooCommerce + MySQL chart with PVCs, Ingress, LimitRange, and NetworkPolicy. |

---

## ⚡ Quick Start (Local Development)

### Prerequisites
- Node.js v18+ (tested on v20 and v25)
- npm v9+

### 1-Click Launch (All Services)
We provide scripts to launch all 5 services concurrently:

**Via Docker Compose (Recommended for Containerized Deployments):**
```bash
docker compose up --build
```
This builds and starts all 5 containers (`woocommerce-mcp` on :3002, `time-mcp` on :3003, `calculator-mcp` on :3004, `mcp-gateway` on :3001, and `frontend` on :80) with automatic container health checks and persistent volume storage.

**On Windows (PowerShell):**
```powershell
.\start-all.ps1
```

**On Linux / macOS (Bash):**
```bash
chmod +x start-all.sh
./start-all.sh
```

### Manual Individual Startup
If you prefer running services in separate terminal tabs:

```bash
# Tab 1: WooCommerce MCP Server (Port 3002)
cd woocommerce-mcp-server && npm install && npm start

# Tab 2: Time & Utility MCP Server (Port 3003)
cd time-mcp-server && npm install && npm start

# Tab 3: Calculator MCP Server (Port 3004)
cd calculator-mcp-server && npm install && npm start

# Tab 4: Gateway Backend (Port 3001)
cd backend && npm install && npm start

# Tab 5: Frontend Dashboard (Port 5173)
cd frontend && npm install && npm run dev
```

### Access Points
- **Dashboard UI**: [http://localhost:5173](http://localhost:5173)
- **Gateway REST API**: [http://localhost:3001](http://localhost:3001)
- **Unified MCP Endpoint**: `POST http://localhost:3001/mcp`
- **Default Admin Key**: `gw_418ddc77cce0462db8ca3d020f941269` (pre-configured for instant authentication)

---

## ☸️ Kubernetes & Helm Deployment

Both the Store and the MCP Platform are deployable via standard Helm v3 charts with configuration handled strictly through Helm values.

### 1. Local Kubernetes (Kind / Minikube / k3d)

Create a local cluster with Ingress enabled:
```bash
# Using Kind with our provided configuration
kind create cluster --config deploy/kind-config.yaml --name urumi-cluster

# Install NGINX Ingress Controller
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
```

Deploy the Platform & Store:
```bash
# Deploy MCP Platform (Gateway, Dashboard, and Upstream Servers)
helm install mcp-platform charts/mcp-platform \
  -f charts/mcp-platform/values.yaml \
  --set secrets.llmApiKey="YOUR_GEMINI_OR_GROQ_API_KEY"

# Deploy WooCommerce Store
helm install store-default charts/store-base \
  -f charts/store-base/values.yaml \
  --namespace ns-store-default --create-namespace
```

**Local DNS Resolution:**
The Helm chart utilizes `127.0.0.1.nip.io`. Stable local ingress URLs:
- **Dashboard**: `http://dashboard.127.0.0.1.nip.io`
- **Gateway**: `http://gateway.127.0.0.1.nip.io`
- **Storefront**: `http://store-default.127.0.0.1.nip.io`

---

### 2. Production VPS Deployment (k3s / Cloud)

For a production VPS running Debian/Ubuntu with k3s:
```bash
# 1. Install k3s (comes with Traefik ingress controller)
curl -sfL https://get.k3s.io | sh -

# 2. Deploy cert-manager for automated Let's Encrypt TLS
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.14.0/cert-manager.yaml

# 3. Deploy Platform using values-prod.yaml
helm install mcp-platform charts/mcp-platform \
  -f charts/mcp-platform/values-prod.yaml \
  --set domain="yourdomain.com" \
  --set secrets.llmApiKey="YOUR_PRODUCTION_LLM_KEY"

# 4. Deploy Store using values-prod.yaml
helm install store-prod charts/store-base \
  -f charts/store-base/values-prod.yaml \
  --set store.domain="yourdomain.com" \
  --namespace ns-store-prod --create-namespace
```

**Production Configuration Differences (`values-prod.yaml`):**
- Domain mapped to real domain (`yourdomain.com`).
- Traefik ingress class with automated TLS via Let's Encrypt `cert-manager`.
- Storage class set to k3s default `local-path`.
- Workloads scaled to multiple replicas with production CPU/RAM requests & limits.
- Upstream servers isolated with strict `NetworkPolicy`.

---

## 🎯 Definition of Done Walkthrough

The following step-by-step test flow demonstrates all requirements with **two distinct users**:

### Step 1: Store Checkout
1. Open the storefront at `http://localhost:8080` (or `http://store-default.127.0.0.1.nip.io`).
2. Add a product (e.g., *WordPress Pennant*) to the cart and proceed to checkout.
3. Complete checkout using Cash on Delivery (COD) or Direct Bank Transfer.
4. Verify the order appears in WooCommerce Admin (`/wp-admin` ➔ WooCommerce ➔ Orders).

---

### Step 2: Chat Agent (As User A - Admin / Member)
1. Open the dashboard at [http://localhost:5173](http://localhost:5173) and log in with your API key.
2. Navigate to the **Chat Agent** tab.
3. **Create a Product via Chat**:
   > *"Create a new product called 'Wireless Headphones' priced at 89.99"*
   - The agent calls `woocommerce__create_product`.
   - The UI reveals the tool call with arguments and output.
   - The product is created and immediately available.
4. **Query Orders via Chat**:
   > *"What orders came in today?"*
   - The agent calls `woocommerce__list_orders`.
   - Returns today's orders including customer names and order totals.

---

### Step 3: External MCP Client (As User B - Member)
1. **Invite User B**:
   - In the dashboard, switch to **Team & Keys**.
   - Click **Invite Member**, enter username `user_b`, role `Member`.
   - Copy the generated API key (e.g., `gw_8b71...`).
2. **Connect External Client**:
   - In Claude Code, Cursor, or MCP Inspector, configure the HTTP MCP connection:
     - **URL**: `http://localhost:3001/mcp`
     - **Header**: `Authorization: Bearer gw_8b71...`
3. **Tool Listing**:
   - The client discovers all 15 aggregated tools (`woocommerce__*`, `time-utility__*`, `calculator__*`).
4. **Cross-Server Prompt**:
   - Run a prompt requiring two servers:
     > *"Calculate the total price of 3 Silk Shirts at $49.99 with 8% sales tax, and tell me the current date and time."*
   - The client invokes `calculator__calculate` and `time-utility__get_current_time`.
   - User B executes the tools **without ever seeing or possessing upstream credentials**.

---

### Step 4: Team Control, Revocation & Resiliency
1. **Key Revocation**:
   - Admin opens **Team & Keys** in the dashboard and clicks **Revoke** on User B.
   - User B's next tool call or tool listing request is immediately rejected with `403 Forbidden: API key has been revoked`.
2. **Disable Upstream Server**:
   - Admin opens **MCP Servers** and toggles the *Calculator* server to **Disabled**.
   - Calling `tools/list` immediately excludes all `calculator__*` tools from both the chat agent and external clients.
3. **Kill Upstream Pod (Dead Server Resilience)**:
   - Terminate the WooCommerce MCP server pod or process.
   - Calling `tools/list` completes without crashing; the other servers continue operating normally.
   - The dashboard updates the WooCommerce server status to **Unreachable**.
4. **Audit Trail Verification**:
   - Admin navigates to the **Audit Log** tab.
   - Every single tool invocation above appears with the exact user attribution (`admin` vs `user_b`), tool name, duration (ms), request payload summary, and status (`success`/`error`).

---

## 🔌 Connecting External MCP Clients

### 1. Claude Code
In your Claude Code configuration or project `.mcp.json`:
```json
{
  "mcpServers": {
    "team-gateway": {
      "url": "http://localhost:3001/mcp",
      "headers": {
        "Authorization": "Bearer gw_YOUR_API_KEY"
      }
    }
  }
}
```

### 2. Cursor
In Cursor Settings ➔ Features ➔ MCP ➔ Add New MCP Server:
- **Type**: `HTTP` / `SSE`
- **URL**: `http://localhost:3001/mcp`
- **Headers**:
  - `Authorization`: `Bearer gw_YOUR_API_KEY`

### 3. MCP Inspector
```bash
npx @modelcontextprotocol/inspector http://localhost:3001/mcp
```
*(Select Header auth and pass `Authorization: Bearer gw_YOUR_API_KEY`)*

---

## 💬 Chat Agent Usage

The chat agent integrated into the dashboard supports Google Gemini and Groq models:
- **Zero Config**: Defaults to Gemini 2.0 Flash or Groq LLaMA 3.3 70B Versatile via OpenAI-compatible API specifications.
- **Environment Configuration** in `backend/.env` or K8s Secret:
  ```env
  LLM_PROVIDER=gemini       # or 'groq'
  LLM_API_KEY=your_key_here
  LLM_MODEL=gemini-2.0-flash # or 'llama-3.3-70b-versatile'
  ```
- **Audited Execution**: Every tool the agent invokes acts under the logged-in user's credentials and records user attribution in the audit log.

---

## 🛡 Security & Threat Model

For the complete threat analysis, see [`docs/THREAT_MODEL.md`](docs/THREAT_MODEL.md).

Key highlights:
- **Hashed Keys**: API keys are generated as `gw_<uuid>` and stored using SHA-256 hashes (`api_key_hash`). Plaintext keys are never stored in the database.
- **Server-Side Credentials**: Upstream WooCommerce consumer keys and bearer tokens are attached server-side by the Gateway. They are redacted (`••••••••`) from all UI responses and never sent to MCP clients.
- **Internal-Only Isolation**: Upstream MCP servers run on private `ClusterIP` services with Kubernetes `NetworkPolicy` rules allowing ingress **only** from the `mcp-gateway` pod.
- **Tool Namespacing**: Tool names use deterministic prefixing (`serverid__toolname`) preventing collision hijacking and indicating provenance to LLM agents.

---

## 🌟 Bonus & Stand-Out Features

1. **Multi-Store Provisioning (Bonus)**: Kubernetes-native store orchestrator creating isolated namespaces, Helm releases, PVCs, and Ingress hosts with quota limits per user.
2. **Production-Ready VPS Deployment**: Fully templated `values-prod.yaml` for k3s with Traefik, cert-manager TLS, and storage classes.
3. **Resilient Dual-Mode WooCommerce Server**: Connects to live WooCommerce REST API v3 when available, with dynamic in-memory store fallback for zero-downtime test environments.
4. **Three Independent Upstream Servers**: WooCommerce, Calculator, and Time & Utility servers speaking native Streamable HTTP MCP protocol.
5. **Granular Audit Log**: Filterable audit log with timestamp, duration, status, request arguments, and user attribution.

---

## 🧪 Automated Verification & Testing

We provide an automated end-to-end integration test covering all 17 requirements of the rubric:

```bash
cd backend
node test_flow.js
```

**Output:**
```
🚀 Starting Comprehensive End-to-End Test Suite...

  ✅ PASS: Gateway health check returns healthy
  ✅ PASS: Admin authenticated with valid role
  ✅ PASS: MCP client initialize succeeded
  ✅ PASS: Aggregated all tools from 3 servers (found 15 tools)
  ✅ PASS: Tool names correctly collision-prefixed across all 3 servers
  ✅ PASS: woocommerce__list_products returned products
  ✅ PASS: woocommerce__create_product created product ID
  ✅ PASS: woocommerce__list_orders returned orders
  ✅ PASS: calculator__calculate evaluated sqrt(144) + 2 * 3 = 18
  ✅ PASS: time-utility__get_current_time returned date and time
  ✅ PASS: Created User B (member) with hashed revokable API key
  ✅ PASS: User B successfully accessed all aggregated tools without seeing upstream credentials
  ✅ PASS: User B executed tool call successfully
  ✅ PASS: Audit log recorded User B tool call with user attribution
  ✅ PASS: Revoked User B key was immediately rejected with 403 Forbidden
  ✅ PASS: Disabled upstream server: its tools immediately disappeared from the gateway endpoint
  ✅ PASS: Re-enabled upstream server: tools returned to gateway endpoint

========================================
TEST SUMMARY: 17 PASSED, 0 FAILED
========================================
```

---

## 👥 Authors & License
Built for the **Urumi AI FDE Internship - Round 1**.  
Distributed under the **MIT License**.
