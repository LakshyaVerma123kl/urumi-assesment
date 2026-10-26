# Quick Start Guide

Get your first WooCommerce store running in 5 minutes.

## Prerequisites

Install these before starting:

```bash
# macOS
brew install docker kubectl helm kind

# Ubuntu/Debian
sudo apt-get install docker.io kubectl
curl https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
curl -Lo ./kind https://kind.sigs.k8s.io/dl/v0.20.0/kind-linux-amd64
chmod +x ./kind && sudo mv ./kind /usr/local/bin/

# Windows (PowerShell as Admin)
choco install docker-desktop kubernetes-cli kubernetes-helm kind
```

Also install Node.js 18+:

- Download from https://nodejs.org

## Step 1: Clone & Setup

```bash
git clone <your-repo-url> urumi-platform
cd urumi-platform

# On Linux/macOS:
chmod +x deploy/*.sh
./deploy/setup.sh

# On Windows (PowerShell):
.\deploy\setup.ps1
```

Expected output:

```
✓ All prerequisites installed
✓ Cluster created
✓ Ingress Controller ready
✓ RBAC configured
✓ Chart validated

SETUP COMPLETE! ✓
```

## Step 2: Start Backend

```bash
cd backend
npm install
npm run dev
```

You should see:

```
╔════════════════════════════════════════╗
║   URUMI STORE ORCHESTRATOR v1.0       ║
╚════════════════════════════════════════╝
🚀 Server: http://localhost:3001
```

## Step 3: Start Frontend

Open a NEW terminal:

```bash
cd frontend
npm install
npm run dev
```

Dashboard opens at: **http://localhost:5173**

## Step 4: Create Your First Store

1. Enter name: "My Test Store"
2. Click "Launch Store"
3. Wait 2-3 minutes (status: PROVISIONING → READY)
4. Click "Visit Dashboard"

## Step 5: Access WooCommerce

Store URL: `http://store-XXXXX.127.0.0.1.nip.io`

1. **Complete WordPress Setup**:
   - Language: English
   - Site Title: My Test Store
   - Username: admin
   - Password: (choose strong password)
   - Email: your@email.com

2. **Install WooCommerce**:
   - Dashboard → Plugins → Add New
   - Search "WooCommerce"
   - Click "Install Now" → "Activate"

3. **Complete WooCommerce Setup Wizard**:
   - Store Details: Fill in
   - Industry: Select any
   - Product Types: Physical products
   - Business Details: Skip
   - Theme: Select default (Storefront)

4. **Add a Test Product**:
   - Products → Add New
   - Product Name: "Test Product"
   - Regular Price: 10.00
   - Publish

## Step 6: Test Checkout

1. Visit storefront (click "Visit Store" in WP admin)
2. Click "Add to Cart" on test product
3. Click "View Cart" → "Proceed to Checkout"
4. Fill in billing details
5. Payment Method: **Cash on Delivery**
6. Click "Place Order"

✅ **Success!** Order created and visible in WooCommerce → Orders.

## Common Issues

### "Port 80 already in use"

```bash
# Check what's using port 80
sudo lsof -i :80

# Stop conflicting service (e.g., Apache)
sudo systemctl stop apache2
```

### "Cannot connect to backend"

Make sure backend is running on port 3001:

```bash
curl http://localhost:3001/health
```

### "Store stuck in PROVISIONING"

Check Kubernetes pods:

```bash
# Replace store-XXXXX with your store ID
kubectl get pods -n ns-store-XXXXX

# View logs
kubectl logs -n ns-store-XXXXX deployment/wordpress
```

### "Cannot access store URL"

Verify ingress:

```bash
kubectl get ingress -A
```

## Cleanup

Delete all stores from dashboard or:

```bash
# List all stores
kubectl get ns -l store=true

# Delete specific store
kubectl delete ns ns-store-XXXXX

# Tear down entire cluster
kind delete cluster --name urumi-cluster
```

## Next Steps

- Read full [README.md](README.md) for production deployment
- Review [SYSTEM_DESIGN.md](docs/SYSTEM_DESIGN.md) for architecture details
- Check [demo video requirements](README.md#demo-video-requirements) for submission

---

**Need help?** Check the [Troubleshooting](README.md#troubleshooting) section in README.md.
