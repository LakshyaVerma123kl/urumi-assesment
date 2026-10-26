#!/usr/bin/env bash
set -e

# Setup local Kubernetes environment using Kind and NGINX Ingress

echo "=========================================="
echo "  Setting up Local Kubernetes Cluster"
echo "=========================================="

# 1. Create Cluster
echo "[1/3] Creating Kubernetes Cluster with Kind..."
kind create cluster --config ./deploy/kind-config.yaml --name urumi-cluster

# 2. Install Ingress Controller (Essential for routing)
echo "[2/3] Installing NGINX Ingress Controller..."
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml

# 3. Wait for Ingress
echo "[3/3] Waiting for Ingress Controller to be ready..."
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=120s

echo "=========================================="
echo "  Cluster Ready!"
echo "  Deploy platform with:"
echo "  helm install mcp-platform charts/mcp-platform -f charts/mcp-platform/values.yaml"
echo "=========================================="
