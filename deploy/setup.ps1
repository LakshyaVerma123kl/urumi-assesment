# 1. Create Cluster
Write-Host "Creating Kubernetes Cluster..." -ForegroundColor Green
kind create cluster --config ./deploy/kind-config.yaml

# 2. Install Ingress Controller (Essential for routing)
Write-Host "Installing NGINX Ingress..." -ForegroundColor Green
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml

# 3. Wait for Ingress
Write-Host "Waiting for Ingress to be ready..." -ForegroundColor Yellow
kubectl wait --namespace ingress-nginx --for=condition=ready pod --selector=app.kubernetes.io/component=controller --timeout=90s

Write-Host "Cluster Ready!" -ForegroundColor Green