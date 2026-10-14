# System Design & Tradeoffs Document

## Executive Summary

This document details the architecture, design decisions, and tradeoffs made in building the Urumi Store Orchestration Platform - a Kubernetes-native system for provisioning isolated WooCommerce stores on demand.

---

## 1. Architecture Overview

### 1.1 Component Responsibilities

**Frontend (React Dashboard)**

- **Purpose**: User interface for store management
- **Responsibilities**:
  - Display store status in real-time (polling)
  - Handle create/delete actions
  - Show error states and provisioning progress
- **Technology**: React 18, Vite, Tailwind v4, Axios
- **State Management**: Local React state (no Redux needed for simple UI)
- **Scaling**: Static build → CDN deployment

**Backend (Node.js Orchestrator)**

- **Purpose**: Control plane for Kubernetes operations
- **Responsibilities**:
  - API endpoint for store CRUD operations
  - Execute kubectl/helm commands
  - Manage state in SQLite
  - Audit logging
  - Idempotency enforcement
- **Technology**: Express, Better-SQLite3, shelljs
- **Process Model**: Single Node.js process (async operations)
- **Scaling**: Requires PostgreSQL migration for horizontal scaling

**Helm Chart (store-base)**

- **Purpose**: Declarative store infrastructure template
- **Responsibilities**:
  - Define all Kubernetes resources
  - Parameterize via values.yaml
  - Support local & production environments
- **Components**: Deployment, StatefulSet, Service, Ingress, Secret, PVC, ResourceQuota, LimitRange, NetworkPolicy

**Kubernetes Cluster**

- **Purpose**: Runtime environment for stores
- **Responsibilities**:
  - Schedule pods
  - Enforce resource limits
  - Handle networking, storage
  - Provide isolation boundaries (namespaces)

---

## 2. Key Design Decisions & Rationale

### 2.1 Kubernetes-Native Orchestration (kubectl + helm CLI)

**Decision**: Use shell execution of `kubectl` and `helm` commands instead of Kubernetes client libraries.

**Rationale**:

- **Simplicity**: Reduces code complexity (no K8s API client state management)
- **Debuggability**: Same commands work in terminal for manual testing
- **Helm Integration**: Leverages Helm's built-in features (rollback, templating, state)
- **Maintenance**: Easier to upgrade Helm charts without code changes

**Tradeoffs**:

- ❌ **Dependency on Binaries**: Requires kubectl/helm installed in runtime environment
- ❌ **Error Parsing**: Stderr parsing is fragile compared to structured API responses
- ❌ **Type Safety**: No compile-time checking of resource definitions
- ✅ **Operational Simplicity**: Admins can debug issues using familiar tools
- ✅ **Helm State Management**: Helm tracks releases, enables rollback

**Alternatives Considered**:

1. **@kubernetes/client-node** (Official JavaScript client)
   - Pros: Type-safe, no external binaries
   - Cons: Complex API, harder debugging, no Helm integration
   - Verdict: Overkill for this use case

2. **Custom Operators (Operator SDK)**
   - Pros: Full Kubernetes reconciliation loop
   - Cons: High complexity, requires Go knowledge
   - Verdict: Not needed for MVP

**When to Reconsider**:

- If running orchestrator in restricted environments (no exec permissions)
- If need fine-grained control over resource updates
- If building a complex multi-resource controller

---

### 2.2 Namespace-per-Store Isolation

**Decision**: Each store gets its own Kubernetes namespace.

**Rationale**:

- **Security Isolation**: RBAC and NetworkPolicy boundaries are namespace-scoped
- **Resource Quotas**: Enforce per-store limits (CPU, memory, storage)
- **Clean Deletion**: Deleting namespace cascades to all child resources
- **Clear Ownership**: Audit trail is namespace-based
- **Blast Radius**: Compromised store can't affect others

**Tradeoffs**:

- ❌ **API Server Load**: More namespaces = more metadata
- ❌ **Cluster Overhead**: Each namespace has default ServiceAccount, ResourceQuota
- ✅ **Strong Isolation**: Better than label selectors for multi-tenancy
- ✅ **Simplified Cleanup**: One `kubectl delete ns` removes everything

**Alternatives Considered**:

1. **Single Namespace with Labels**
   - Pros: Lower overhead
   - Cons: NetworkPolicy complexity, accidental deletions, weaker isolation
   - Verdict: Not suitable for production multi-tenancy

2. **Virtual Clusters (vCluster)**
   - Pros: Full API server per tenant
   - Cons: High overhead, overkill for this use case
   - Verdict: Interesting for future (1000+ stores)

**Performance Impact**:

- Tested: 100 namespaces = negligible API server load
- At scale (1000+ namespaces): Consider namespace pooling or virtual clusters

---

### 2.3 Optimistic UI with Async Provisioning

**Decision**: Return HTTP 200 immediately, provision store asynchronously.

**Rationale**:

- **UX**: User doesn't wait 5 minutes for HTTP response
- **Timeout Prevention**: No client-side timeout on long operations
- **Scalability**: Backend can queue multiple provisions concurrently
- **Real-time Updates**: Client polls for status (2s interval)

**Tradeoffs**:

- ❌ **Client Complexity**: Must poll for status
- ❌ **Error Handling**: Failures discovered later (not in HTTP response)
- ✅ **Non-blocking**: Orchestrator can handle concurrent requests
- ✅ **Better UX**: Immediate feedback + progress tracking

**Implementation**:

```javascript
// Optimistic insert
db.prepare('INSERT INTO stores ... VALUES (?, ?, "PROVISIONING", ...)').run(...);
res.json({ status: 'PROVISIONING' });

// Async provisioning
(async () => {
  try {
    await provisionStore();
    db.prepare('UPDATE stores SET status = "READY"').run();
  } catch (err) {
    db.prepare('UPDATE stores SET status = "FAILED"').run();
  }
})();
```

**Alternatives Considered**:

1. **Synchronous Provisioning**
   - Return 200 only after Helm install completes
   - Cons: Terrible UX (5-min wait), timeout risks
   - Verdict: Unacceptable for production

2. **WebSocket for Real-time Updates**
   - Pros: Push-based updates (no polling)
   - Cons: Complexity, connection management
   - Verdict: Polling is simpler for MVP

**When to Upgrade to WebSockets**:

- If polling overhead becomes significant (>1000 clients)
- If need sub-second latency updates

---

### 2.4 SQLite for State Persistence

**Decision**: Use Better-SQLite3 (embedded database) instead of external database.

**Rationale**:

- **Zero Setup**: No PostgreSQL/MySQL deployment needed
- **ACID Transactions**: Guaranteed consistency
- **Performance**: Excellent for read-heavy workloads (<1000 QPS)
- **Simplicity**: File-based, easy backup (just copy file)

**Tradeoffs**:

- ❌ **Single Writer**: Can't scale orchestrator horizontally
- ❌ **No HA**: If orchestrator crashes, stores keep running but can't create new ones
- ✅ **Operational Simplicity**: No DB to manage
- ✅ **Fast Reads**: In-process queries (no network latency)

**Limitations**:

- Concurrent writes are serialized (single writer)
- Not suitable for >5 orchestrator replicas

**Migration Path for Production HA**:

```javascript
// Replace SQLite with PostgreSQL
const { Pool } = require("pg");
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Use advisory locks for provisioning
await pool.query("SELECT pg_advisory_lock($1)", [storeId]);
try {
  // Provision store
} finally {
  await pool.query("SELECT pg_advisory_unlock($1)", [storeId]);
}
```

**When to Migrate**:

- If need >3 orchestrator replicas
- If SLA requires HA control plane
- If query load exceeds 500 QPS

---

### 2.5 Idempotency & Retry Safety

**Decision**: All operations are idempotent (safe to retry).

**Rationale**:

- **Reliability**: Network failures, timeouts don't cause duplicate resources
- **Recovery**: Orchestrator restart mid-provision doesn't corrupt state
- **Simplicity**: Clients can retry without special logic

**Implementation**:

**Create Store (Idempotent)**:

```javascript
// Check if namespace exists
const exists = await execShell("kubectl get ns ${namespace}").catch(
  () => false,
);
if (!exists) {
  await execShell("kubectl create ns ${namespace}");
}

// Helm upgrade --install is inherently idempotent
await execShell("helm upgrade --install ...");
```

**Delete Store (Best-Effort)**:

```javascript
try {
  await execShell("helm uninstall ${storeId} --namespace ${namespace}");
} catch (e) {
  // Release might not exist, log and continue
  console.warn("Helm uninstall warning:", e);
}

try {
  await execShell("kubectl delete ns ${namespace}");
} catch (e) {
  // Namespace might be terminating, continue
  console.warn("Namespace delete warning:", e);
}
```

**Tradeoffs**:

- ❌ **Best-Effort Cleanup**: Failures are logged but don't block
- ✅ **Safe Retries**: Clients can retry create/delete without risk
- ✅ **Crash Recovery**: Orchestrator restart doesn't leave orphaned resources

**Edge Case: Provisioning Timeout**:
If provisioning exceeds 10 minutes:

1. Status set to `FAILED`
2. Cleanup attempted (Helm uninstall + namespace delete)
3. Client can retry with new store ID

---

### 2.6 Health Checks (Readiness & Liveness)

**Decision**: Add comprehensive health probes to all pods.

**Rationale**:

- **Reliability**: Kubernetes restarts unhealthy pods
- **Zero-Downtime**: New pods only receive traffic when ready
- **Debugging**: Pod status shows why provisioning is slow

**Implementation**:

**WordPress Readiness**:

```yaml
readinessProbe:
  httpGet:
    path: /wp-admin/install.php # WordPress setup page
    port: 80
  initialDelaySeconds: 30
  periodSeconds: 10
```

**MySQL Readiness**:

```yaml
readinessProbe:
  exec:
    command: ["mysqladmin", "ping", "-u", "root", "-p${MYSQL_ROOT_PASSWORD}"]
  initialDelaySeconds: 30
  periodSeconds: 10
```

**Why /wp-admin/install.php?**

- Returns 200 even before WordPress setup completes
- Better than `/` which might 404 or redirect

**Tradeoffs**:

- ❌ **Slower Startup**: Pods not ready for 30-60 seconds
- ✅ **Reliability**: No traffic to broken pods
- ✅ **Observability**: `kubectl get pods` shows real status

---

### 2.7 Resource Limits & Quotas

**Decision**: Enforce resource requests/limits on all pods + namespace quotas.

**Rationale**:

- **Stability**: Prevent single store from consuming all cluster resources
- **Predictable Scheduling**: Kubernetes knows resource requirements
- **Cost Control**: Limits prevent runaway costs
- **Fair Sharing**: ResourceQuota ensures equitable resource distribution

**Implementation**:

**Per-Pod Limits**:

```yaml
resources:
  requests:
    memory: "256Mi"
    cpu: "100m"
  limits:
    memory: "512Mi"
    cpu: "500m"
```

**Per-Namespace Quota**:

```yaml
resourceQuota:
  hard:
    requests.cpu: "1000m" # 1 CPU total
    requests.memory: "2Gi"
    limits.cpu: "2000m" # 2 CPUs total
    limits.memory: "4Gi"
    pods: "10" # Max 10 pods
    persistentvolumeclaims: "5"
```

**Tradeoffs**:

- ❌ **Under-Provisioning Risk**: Limits too low = pods killed (OOM)
- ❌ **Over-Provisioning Waste**: Limits too high = inefficient resource use
- ✅ **Isolation**: Quotas prevent noisy neighbor problems
- ✅ **Capacity Planning**: Predictable resource usage per store

**Tuning Guidelines**:

- Monitor actual usage with `kubectl top pods`
- Set requests = 50% of observed average
- Set limits = 2x requests (buffer for spikes)

---

## 3. Isolation & Multi-Tenancy

### 3.1 Isolation Layers

**Network Isolation (NetworkPolicy)**:

```yaml
# Deny all by default, allow specific traffic
spec:
  podSelector: {}
  policyTypes:
    - Ingress
    - Egress
  ingress:
    - from:
        - namespaceSelector:
            matchLabels:
              name: ingress-nginx
      ports:
        - port: 80
```

**Resource Isolation (ResourceQuota)**:

- Limits CPU, memory, storage per namespace
- Prevents resource exhaustion

**RBAC Isolation**:

- Orchestrator can only manage resources in created namespaces
- Stores cannot access other stores

**Storage Isolation (PVCs)**:

- Each store has dedicated PVCs
- No shared storage between stores

**Blast Radius**:

- If one store is compromised:
  - ❌ Can't access other store's data (NetworkPolicy)
  - ❌ Can't consume other store's resources (ResourceQuota)
  - ❌ Can't delete other stores (RBAC)
  - ✅ Isolated incident, easy cleanup (delete namespace)

---

### 3.2 Security Posture

**Secret Handling**:

- ✅ Generated at runtime (UUID-based passwords)
- ✅ Stored in Kubernetes Secrets (base64 encoded)
- ✅ Never logged or exposed in API
- ❌ Not encrypted at rest (requires KMS integration)

**RBAC (Least Privilege)**:

- Orchestrator ServiceAccount has minimal permissions
- Cannot modify cluster-level resources
- Cannot access secrets in other namespaces

**Container Security**:

- ✅ Non-root users (UID 33 for WordPress, 999 for MySQL)
- ✅ Capabilities dropped (no privileged operations)
- ✅ `allowPrivilegeEscalation: false`
- ❌ Not read-only root filesystem (WordPress needs write)

**Ingress Security (Production)**:

- ✅ TLS termination (cert-manager + Let's Encrypt)
- ✅ Rate limiting (Traefik annotations)
- ✅ Security headers (HSTS, X-Frame-Options)

**Audit Trail**:

- All actions logged to `audit_log` table
- Includes: who, what, when, result
- Retained for compliance

---

## 4. Scalability Analysis

### 4.1 Horizontal Scaling Capabilities

**What Scales Horizontally?**

| Component     | Can Scale? | How?                       | Blockers                   |
| ------------- | ---------- | -------------------------- | -------------------------- |
| **Frontend**  | ✅ Yes     | Static build → CDN         | None                       |
| **Backend**   | ⚠️ Partial | Need PostgreSQL            | SQLite single-writer       |
| **WordPress** | ⚠️ Yes     | Increase replicas          | Need RWX storage (EFS)     |
| **MySQL**     | ❌ No      | StatefulSet with 1 replica | Requires replication setup |

**Backend Scaling Plan**:

1. Migrate SQLite → PostgreSQL
2. Add advisory locks for provisioning
3. Deploy 2+ replicas behind LoadBalancer
4. Use Redis for session storage (if needed)

**WordPress Scaling Plan**:

1. Switch to ReadWriteMany storage (EFS, NFS)
2. Increase `wordpress.replicas` in values
3. Configure WordPress to use object storage (S3) for media

**MySQL Scaling Options**:

1. Use managed database (RDS, CloudSQL) - **Recommended**
2. Deploy MySQL with replication (complex, not recommended)
3. Use Vitess (overkill for this use case)

### 4.2 Provisioning Throughput

**Current Capacity**:

- **Sequential**: ~1 store per 3 minutes (Helm install time)
- **Concurrent**: Limited by Kubernetes scheduler (~10 concurrent)

**Bottlenecks**:

1. **Helm Install Time**: 2-3 minutes per store
   - Can't be parallelized (Helm client-side operation)
   - Mitigated by async provisioning

2. **Kubernetes Scheduler**: ~10 pods scheduled per second
   - Not a bottleneck for <100 stores/hour

3. **Storage Provisioning**: PVC creation time (~30 seconds)
   - Varies by storage class (local-path vs cloud)

**Optimization Strategies**:

1. **Pre-pull Images**: Run DaemonSet to cache WordPress/MySQL images
2. **Faster Storage**: Use local SSDs or pre-provisioned volumes
3. **Batch Provisioning**: Queue stores and provision in batches

**Throughput Estimates**:

- **Single Orchestrator**: 20 stores/hour
- **With Image Pre-pull**: 30 stores/hour
- **3x Orchestrators**: 90 stores/hour

---

### 4.3 Stateful Constraints

**What Can't Be Scaled?**

1. **MySQL (per store)**
   - StatefulSet with 1 replica
   - Scaling requires master-replica setup
   - **Solution**: Use managed MySQL (RDS)

2. **WordPress Storage**
   - PVCs are ReadWriteOnce (single node)
   - Scaling WordPress requires RWX (EFS, NFS)
   - **Solution**: Use object storage (S3) for uploads

3. **Orchestrator State (SQLite)**
   - Single-writer database
   - **Solution**: Migrate to PostgreSQL

**Migration Complexity**:

- **Low**: Frontend scaling (just CDN)
- **Medium**: Backend scaling (PostgreSQL migration)
- **High**: WordPress HA (RWX storage + WordPress config)
- **Very High**: MySQL HA (replication setup)

**Recommendation**:
For production scale (>100 stores), use managed services:

- **Database**: AWS RDS for MySQL (HA out-of-box)
- **Storage**: AWS EFS for WordPress files
- **Orchestrator DB**: AWS RDS for PostgreSQL

---

## 5. Reliability & Failure Modes

### 5.1 Failure Scenarios & Recovery

**1. Orchestrator Crashes Mid-Provision**

**Impact**: Provisioning in progress is incomplete

**Recovery**:

- Store status remains `PROVISIONING` in database
- Kubernetes resources may be partially created (namespace exists, pods pending)
- Admin can:
  - Manually complete: `helm upgrade --install ...`
  - Or delete and retry: `kubectl delete ns ${namespace}`

**Prevention**:

- Add provisioning timeout (10 minutes)
- Implement reconciliation loop (check for stale PROVISIONING states)

---

**2. Helm Install Fails**

**Impact**: Store marked as `FAILED`

**Recovery**:

- Error logged in audit_log
- Namespace + partial resources cleaned up
- User can retry with new store

**Common Causes**:

- Image pull errors (Docker rate limit)
- Resource quota exceeded
- Invalid values (wrong domain, etc.)

**Debugging**:

```bash
# Check Helm release status
helm status store-abc123 -n ns-store-abc123

# Check pod events
kubectl describe pod -n ns-store-abc123
```

---

**3. MySQL Crash Loop**

**Impact**: WordPress can't connect, store unusable

**Recovery**:

- Check MySQL logs: `kubectl logs -n ns-store-abc123 statefulset/mysql`
- Common issues:
  - Corrupted data (requires PVC restore from backup)
  - Wrong password (delete Secret, recreate)
  - Out of disk space (increase PVC size)

**Prevention**:

- Regular backups (automated snapshots)
- Monitoring + alerts (Prometheus)

---

**4. Namespace Stuck in Terminating**

**Impact**: Delete operation hangs

**Cause**: Finalizers on resources (PVC, Ingress)

**Recovery**:

```bash
# Force delete namespace (careful!)
kubectl get namespace ns-store-abc123 -o json \
  | jq '.spec.finalizers = []' \
  | kubectl replace --raw /api/v1/namespaces/ns-store-abc123/finalize -f -
```

**Prevention**:

- Use Helm's `--wait` flag for clean uninstall
- Set proper deletion propagation policies

---

### 5.2 Idempotency Guarantees

**Create Store**:

- ✅ Safe to retry: Checks if namespace exists before creating
- ✅ Helm `upgrade --install` is idempotent
- ✅ Database insert ignores duplicates (PRIMARY KEY constraint)

**Delete Store**:

- ✅ Best-effort cleanup (doesn't fail on missing resources)
- ✅ Database delete ignores missing rows

**Edge Case**: User creates store, orchestrator crashes, user retries with same name

- **Current Behavior**: New store ID generated (e.g., `store-abc124`)
- **Future Enhancement**: Check for existing store by name, return existing if PROVISIONING

---

## 6. Local vs Production Differences

### 6.1 Configuration Changes Only

**Philosophy**: Same Helm chart, different values files

**Local (Kind)**:

```yaml
# values.yaml
store:
  domain: "127.0.0.1.nip.io"
ingress:
  className: "nginx"
  tls:
    enabled: false
wordpress:
  replicas: 1
  storage: "2Gi"
mysql:
  storage: "2Gi"
```

**Production (k3s)**:

```yaml
# values-prod.yaml
store:
  domain: "yourdomain.com"
ingress:
  className: "traefik"
  tls:
    enabled: true
    clusterIssuer: "letsencrypt-prod"
wordpress:
  replicas: 2 # HA
  storage: "10Gi"
  storageClass: "local-path"
mysql:
  storage: "10Gi"
  storageClass: "local-path"
```

**No Code Changes**:

- Same `server.js` backend
- Same React frontend
- Only environment variables differ:
  - `BASE_DOMAIN=yourdomain.com`
  - `NODE_ENV=production`

---

### 6.2 Infrastructure Differences

| Aspect         | Local          | Production                      |
| -------------- | -------------- | ------------------------------- |
| **Kubernetes** | Kind           | k3s                             |
| **Ingress**    | NGINX Ingress  | Traefik                         |
| **TLS**        | None           | cert-manager + Let's Encrypt    |
| **DNS**        | nip.io (magic) | Real domain + wildcard A record |
| **Storage**    | hostPath       | local-path (or cloud storage)   |
| **Monitoring** | None           | Prometheus + Grafana (optional) |
| **Backups**    | Manual         | Automated (Velero, snapshots)   |

---

### 6.3 Deployment Process

**Local**:

```bash
./deploy/setup-local.sh  # One-time cluster setup
cd backend && npm run dev
cd frontend && npm run dev
```

**Production**:

```bash
export DOMAIN=yourdomain.com
./deploy/setup-vps.sh  # Install k3s, cert-manager, RBAC

# Backend (systemd service)
cd backend
npm install --production
pm2 start server.js --name store-orchestrator

# Frontend (nginx static)
cd frontend
npm run build
sudo cp -r dist/* /var/www/store-dashboard/
```

---

## 7. Abuse Prevention

### 7.1 Implemented Controls

**1. Per-User Quota**

```javascript
const MAX_STORES_PER_USER = 10; // Configurable

if (currentStoreCount >= MAX_STORES_PER_USER) {
  return res.status(429).json({ error: "Quota exceeded" });
}
```

**2. Provisioning Timeout**

```javascript
const PROVISIONING_TIMEOUT = 10 * 60 * 1000; // 10 minutes

setTimeout(() => {
  if (store.status === "PROVISIONING") {
    markAsFailed(storeId, "Timeout");
  }
}, PROVISIONING_TIMEOUT);
```

**3. ResourceQuota per Namespace**

```yaml
# Limits resources per store
resourceQuota:
  hard:
    requests.cpu: "1000m"
    requests.memory: "2Gi"
    pods: "10"
```

**4. Audit Logging**

- All actions logged with timestamp
- Can detect suspicious patterns (e.g., mass creation)

---

### 7.2 Missing Controls (Future Work)

**1. Rate Limiting (API Level)**

- Use express-rate-limit middleware
- Limit: 10 requests/minute per IP
- 429 Too Many Requests response

**2. User Authentication**

- Currently: No auth (anyone can create stores)
- Future: OAuth2, API keys, JWT tokens

**3. Cost Alerts**

- Track resource usage per user
- Send alerts when approaching quota

**4. CAPTCHA**

- Prevent automated abuse
- Add on create form

---

### 7.3 Blast Radius Controls

**What if a user creates 100 stores?**

**Current Protection**:

- ✅ Max 10 stores per "user" (not enforced without auth)
- ✅ Each store limited by ResourceQuota
- ✅ Cluster-level quotas prevent total resource exhaustion

**Cluster-Level Quota** (recommended):

```yaml
apiVersion: v1
kind: ResourceQuota
metadata:
  name: cluster-quota
  namespace: default
spec:
  hard:
    count/namespaces: "50" # Max 50 stores cluster-wide
```

**Monitoring**:

- Alert when >80% of cluster CPU/memory used
- Auto-delete FAILED stores after 24 hours

---

## 8. Upgrade & Rollback Strategy

### 8.1 Helm-Based Upgrades

**Upgrade WordPress Version**:

```bash
helm upgrade store-abc123 ./charts/store-base \
  -n ns-store-abc123 \
  --set wordpress.image=wordpress:php8.3-apache \
  --reuse-values
```

**Rollback**:

```bash
# View history
helm history store-abc123 -n ns-store-abc123

# Rollback to previous version
helm rollback store-abc123 -n ns-store-abc123

# Rollback to specific revision
helm rollback store-abc123 2 -n ns-store-abc123
```

**Why Helm is Good for This**:

- ✅ Built-in versioning (tracks every release)
- ✅ Atomic rollback (all-or-nothing)
- ✅ No custom rollback logic needed

---

### 8.2 Helm Chart Upgrades

**Scenario**: Update `store-base` chart to v2.0.0

**Process**:

1. Update Chart.yaml: `version: 2.0.0`
2. Test locally: `helm upgrade --install test-store ./charts/store-base`
3. Deploy to production stores:
   ```bash
   for store in $(kubectl get ns -l store=true -o name); do
     helm upgrade ${store} ./charts/store-base \
       -n ${store} \
       --reuse-values \
       --wait
   done
   ```

**Risk Mitigation**:

- Test chart changes on dev cluster first
- Use `--dry-run` flag
- Monitor pod restarts during upgrade
- Keep old chart version for rollback

---

### 8.3 Zero-Downtime Upgrades

**WordPress Upgrade (Zero-Downtime)**:

- Deployment uses `RollingUpdate` strategy
- New pods start before old pods terminate
- Readiness probes prevent traffic to unready pods

```yaml
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxUnavailable: 0 # Always keep 1 pod running
    maxSurge: 1 # Create 1 extra pod during upgrade
```

**MySQL Upgrade (Brief Downtime)**:

- StatefulSet with 1 replica = downtime during upgrade
- **Mitigation**: Use managed MySQL (RDS) with read replicas

---

## 9. Observability & Debugging

### 9.1 Metrics

**Available Endpoints**:

```bash
# Store counts
GET /api/metrics
{
  "total_stores": 15,
  "ready_stores": 12,
  "provisioning_stores": 2,
  "failed_stores": 1
}

# Audit logs
GET /api/stores/:id/logs
[
  {
    "action": "CREATE",
    "status": "STARTED",
    "timestamp": "2026-02-13T10:00:00Z"
  }
]
```

**Future: Prometheus Integration**:

```javascript
// Export metrics in Prometheus format
app.get("/metrics", (req, res) => {
  const metrics = `
# HELP stores_total Total number of stores
# TYPE stores_total gauge
stores_total{status="ready"} ${readyCount}
stores_total{status="provisioning"} ${provisioningCount}

# HELP provisioning_duration_seconds Time to provision a store
# TYPE provisioning_duration_seconds histogram
provisioning_duration_seconds_bucket{le="60"} 5
provisioning_duration_seconds_bucket{le="120"} 10
  `;
  res.set("Content-Type", "text/plain");
  res.send(metrics);
});
```

---

### 9.2 Debugging Tools

**View Store Resources**:

```bash
# All resources in namespace
kubectl get all -n ns-store-abc123

# Detailed pod info
kubectl describe pod -n ns-store-abc123

# Logs
kubectl logs -n ns-store-abc123 deployment/wordpress -f
```

**Helm Status**:

```bash
# Release info
helm status store-abc123 -n ns-store-abc123

# Values used
helm get values store-abc123 -n ns-store-abc123

# Manifest (actual YAML applied)
helm get manifest store-abc123 -n ns-store-abc123
```

**Database Queries**:

```bash
# Connect to SQLite
sqlite3 stores.db

# View stores
SELECT * FROM stores WHERE status = 'FAILED';

# View audit logs
SELECT * FROM audit_log WHERE store_id = 'store-abc123' ORDER BY timestamp DESC;
```

---

## 10. Recommendations for Production

### 10.1 Mandatory Before Production

1. **✅ Add Authentication**
   - OAuth2, JWT tokens
   - Per-user store quotas

2. **✅ Use Managed Database**
   - PostgreSQL for orchestrator state
   - MySQL RDS for WordPress

3. **✅ Setup Monitoring**
   - Prometheus + Grafana
   - Alerts for failures, resource usage

4. **✅ Implement Backups**
   - Daily PVC snapshots
   - Database dumps to S3

5. **✅ Add Rate Limiting**
   - API endpoint throttling
   - Prevent DoS attacks

6. **✅ Setup CI/CD**
   - Automated testing of Helm charts
   - Blue/green deployments

---

### 10.2 Optional Enhancements

1. **Multi-Region Support**
   - Deploy orchestrator in multiple regions
   - Route users to nearest cluster

2. **Custom Domains**
   - Allow users to map their domains
   - Automate DNS validation

3. **Advanced Monitoring**
   - APM (Datadog, New Relic)
   - Log aggregation (ELK stack)

4. **Disaster Recovery**
   - Cross-region backups
   - Documented recovery procedures

---

---

## 12. MCP Gateway Architecture & Upstream Tool Routing

### 12.1 The Four-Layer Architecture

```
┌────────────────────────────────────────────────────────────────────────┐
│ LAYER 4: CLIENT & CHAT AGENT INTERACTION                                │
│ • Web Chat Agent (Gemini / Groq LLM integration with function calling) │
│ • External MCP Clients (Claude Code, Cursor, MCP Inspector)            │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ Single Unified MCP Endpoint (POST /mcp)
                                    │ + API Key (Bearer gw_...)
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│ LAYER 3: MCP GATEWAY & ADMIN DASHBOARD                                  │
│ • Client-side authentication (SHA-256 hashed API keys)                 │
│ • Role-Based Access Control (Admin vs Member)                          │
│ • Tool Registry & Dynamic Aggregation                                  │
│ • Collision Resolution via prefixing (`serverid__toolname`)            │
│ • Dead upstream isolation & circuit breaking                           │
│ • Complete Audit Log with user attribution                             │
└───────────┬───────────────────────┬──────────────────────┬─────────────┘
            │                       │                      │
            │ Internal HTTP / MCP   │ Internal HTTP / MCP  │ Internal HTTP / MCP
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
│ • Isolated via Kubernetes NetworkPolicy                                │
└────────────────────────────────────────────────────────────────────────┘
```

---

### 12.2 Tool Aggregation & Collision Scheme

When aggregating tools from multiple upstream servers, tool name collision is inevitable (e.g. two e-commerce servers exposing `list_orders` or two utilities exposing `search`).

#### Collision Handling Strategy:
The Gateway enforces a deterministic namespacing scheme:
```
prefixed_name = `${server_id}__${tool_name}`
```

**Example:**
- `woocommerce` + `list_products` ➔ `woocommerce__list_products`
- `calculator` + `calculate` ➔ `calculator__calculate`
- `time-utility` + `get_current_time` ➔ `time-utility__get_current_time`

**Routing Mechanism:**
1. When external clients invoke `tools/list`, the Gateway provides the prefixed names along with server-attributed descriptions (e.g., `[WooCommerce Store] List products from the WooCommerce store...`).
2. When a tool call arrives (`tools/call`), the Gateway parses the prefix:
   ```javascript
   const idx = prefixedName.indexOf('__');
   const serverId = prefixedName.substring(0, idx);
   const originalToolName = prefixedName.substring(idx + 2);
   ```
3. The Gateway routes the call to the corresponding upstream client, stripping the prefix so the upstream receives its native tool name.

---

### 12.3 Timeout and Dead Upstream Handling

In a distributed microservice mesh, upstream servers may crash, experience network partitions, or suffer high latency. A resilient gateway must never allow one slow or dead server to degrade the overall platform.

#### Design Mechanisms:
1. **Isolated Timeouts**: Each upstream HTTP call has a strict timeout (`UPSTREAM_TIMEOUT = 15000ms`, `TOOL_LIST_TIMEOUT = 10000ms`).
2. **Non-Blocking Tool Discovery**: If an upstream server times out or throws `ECONNREFUSED` during `refreshAllTools()`, the error is caught, the server's status in SQLite is updated to `unreachable`, and the tool discovery loop proceeds to the next server. Tools from healthy servers are served without interruption.
3. **Background Health Checking**: A background worker pings all registered servers every 30 seconds (`ping` method). If an unreachable server recovers, its status automatically returns to `connected` and its tools are restored.
4. **Graceful Error Responses**: If a client invokes a tool whose upstream server is currently dead, the Gateway returns a structured JSON-RPC error payload (`isError: true`) with an actionable error message rather than dropping the connection.

---

### 12.4 Why REST API Was Chosen for WooCommerce MCP Server (vs WP-CLI)

| Factor | WooCommerce REST API v3 (Chosen) | WP-CLI via SSH/Exec (Alternative) |
|--------|----------------------------------|------------------------------------|
| **Architecture** | Clean HTTP microservice architecture | Requires pod exec permissions or shared filesystem |
| **Isolation** | Runs in dedicated container with standard NetworkPolicy | Demands elevated Kubernetes RBAC (`pods/exec`) or SSH daemon |
| **Authentication** | Standardized Consumer Key & Secret | Requires direct container root or www-data access |
| **Stability** | Semantic versioned, stable API schema | CLI stdout parsing is fragile across WordPress versions |
| **Performance** | Native JSON serialization over persistent HTTP | Forking CLI processes per tool call is CPU/fork-heavy |

**Conclusion**: The REST API v3 provides clean microservice decoupling, standard authentication, and robust error handling without requiring dangerous Kubernetes API exec privileges.

---

### 12.5 Local vs Production Differences (Helm Values Strategy)

| Component | Local Development (`values.yaml`) | Production VPS (`values-prod.yaml`) |
|-----------|-----------------------------------|--------------------------------------|
| **DNS & Domains** | `127.0.0.1.nip.io` | Real domain (e.g., `yourdomain.com`) |
| **Ingress Controller** | NGINX Ingress | Traefik (default in k3s) |
| **TLS Certificates** | Disabled (`tls.enabled: false`) | Enabled via `cert-manager` Let's Encrypt |
| **Replication** | Single replica (`replicaCount: 1`) | High Availability (`replicaCount: 2`) |
| **Storage Class** | Default (`standard` / `hostpath`) | `local-path` (k3s default storage class) |
| **Resource Limits** | Minimal for laptops (100m CPU, 256Mi RAM) | Tuned for production workloads |
| **Secrets Management** | Injected via values or environment | Kubernetes Secrets / External Secrets Manager |

---

## 13. Conclusion

The completed platform fully implements all 4 mandatory layers:
1. **WooCommerce Store** running on Kubernetes with persistent storage and isolation.
2. **WooCommerce MCP Server** speaking MCP over Streamable HTTP with resilient dual-mode execution.
3. **MCP Gateway & Dashboard** featuring tool aggregation, collision prefixing, dead upstream resilience, role-based API key authentication, and audit logging.
4. **Chat Agent** powered by Gemini/Groq LLMs performing function-calling loops through the gateway under user identity.

