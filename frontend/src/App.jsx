import React, { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import {
  Store, Plus, ExternalLink, Trash2, Loader2, RefreshCw,
  CheckCircle2, XCircle, Server, Users, Shield, MessageSquare,
  ClipboardList, Settings, Key, LogOut, Eye, EyeOff, Send,
  Power, PowerOff, Edit, Copy, AlertTriangle, Clock, Zap,
  Activity, Bot, ChevronRight, Globe, Lock, Hash
} from "lucide-react";

const API = import.meta.env.VITE_API_BASE || (window.location.port === "5173" || window.location.port === "3000" ? "http://localhost:3001" : "");

// ─────────────────────────────────────────────
// MAIN APP — Tab-based dashboard
// ─────────────────────────────────────────────
export default function App() {
  const [apiKey, setApiKey] = useState(localStorage.getItem("gw_api_key") || "");
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("servers");

  const api = useCallback(() => {
    return axios.create({
      baseURL: API,
      headers: { Authorization: `Bearer ${apiKey}` }
    });
  }, [apiKey]);

  const login = async () => {
    if (!apiKey.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await api().post("/api/auth/login");
      setUser(res.data.user);
      localStorage.setItem("gw_api_key", apiKey);
    } catch (err) {
      setError(err.response?.data?.error || "Login failed. Check your API key.");
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setUser(null);
    setApiKey("");
    localStorage.removeItem("gw_api_key");
  };

  // Auto-login if key exists
  useEffect(() => {
    if (apiKey && !user) login();
  }, []); // eslint-disable-line

  // ── Login Screen ──
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-600 shadow-lg shadow-indigo-500/30 mb-4">
              <Globe className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-white">MCP Gateway</h1>
            <p className="text-indigo-300 mt-2">Team MCP Gateway & Store Platform</p>
          </div>
          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl">
            <label className="block text-sm font-medium text-indigo-200 mb-2">API Key</label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && login()}
              placeholder="gw_xxxxxxxxxxxxxxxx"
              className="w-full px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono text-sm"
            />
            {error && <p className="text-red-400 text-sm mt-2 flex items-center gap-1"><XCircle className="w-4 h-4" />{error}</p>}
            <button
              onClick={login}
              disabled={loading || !apiKey}
              className="w-full mt-4 bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-xl font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Key className="w-5 h-5" />}
              Authenticate
            </button>
          </div>
          <p className="text-center text-white/30 text-xs mt-6">Connect with your gateway API key. Ask your admin if you don't have one.</p>
        </div>
      </div>
    );
  }

  // ── Dashboard ──
  const tabs = [
    { id: "servers", label: "MCP Servers", icon: Server },
    { id: "chat", label: "Chat Agent", icon: MessageSquare },
    { id: "team", label: "Team", icon: Users, adminOnly: true },
    { id: "audit", label: "Audit Log", icon: ClipboardList },
    { id: "stores", label: "Stores", icon: Store },
  ];

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col min-h-screen">
        <div className="p-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center">
              <Globe className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-bold text-sm">MCP Gateway</h1>
              <p className="text-xs text-indigo-300">v2.0</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {tabs.filter(t => !t.adminOnly || user.role === 'admin').map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                tab === t.id
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-full bg-indigo-600/30 flex items-center justify-center">
              <span className="text-xs font-bold text-indigo-300">{user.username[0].toUpperCase()}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user.username}</p>
              <p className="text-xs text-slate-500 flex items-center gap-1">
                <Shield className="w-3 h-3" />{user.role}
              </p>
            </div>
          </div>
          <button onClick={logout} className="w-full flex items-center justify-center gap-2 text-xs text-slate-500 hover:text-red-400 transition py-1.5 rounded-lg hover:bg-white/5">
            <LogOut className="w-3 h-3" /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-6xl mx-auto p-8">
          {tab === "servers" && <McpServersPage api={api()} user={user} />}
          {tab === "chat" && <ChatPage api={api()} user={user} />}
          {tab === "team" && <TeamPage api={api()} user={user} />}
          {tab === "audit" && <AuditPage api={api()} />}
          {tab === "stores" && <StoresPage api={api()} />}
        </div>
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────
// MCP SERVERS PAGE
// ─────────────────────────────────────────────
function McpServersPage({ api, user }) {
  const [servers, setServers] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", url: "", auth_type: "none", auth_credential: "" });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => { api.get("/api/mcp-servers").then(r => setServers(r.data)).catch(() => {}); }, [api]);
  useEffect(() => { load(); const i = setInterval(load, 5000); return () => clearInterval(i); }, [load]);

  const addServer = async (e) => {
    e.preventDefault();
    try { await api.post("/api/mcp-servers", form); setForm({ name: "", url: "", auth_type: "none", auth_credential: "" }); setShowAdd(false); load(); } catch (err) { alert(err.response?.data?.error || "Failed"); }
  };

  const toggleServer = async (id) => { await api.post(`/api/mcp-servers/${id}/toggle`); load(); };
  const deleteServer = async (id) => { if (confirm("Delete this server?")) { await api.delete(`/api/mcp-servers/${id}`); load(); } };
  const refresh = async () => { setRefreshing(true); await api.post("/api/mcp-servers/refresh").catch(() => {}); await load(); setRefreshing(false); };

  const statusBadge = (status) => {
    const styles = {
      connected: "bg-emerald-50 text-emerald-700 border-emerald-200",
      unreachable: "bg-red-50 text-red-700 border-red-200",
      disabled: "bg-slate-100 text-slate-500 border-slate-200",
      unknown: "bg-amber-50 text-amber-700 border-amber-200"
    };
    return <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${styles[status] || styles.unknown}`}>{status?.toUpperCase()}</span>;
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">MCP Servers</h2>
          <p className="text-slate-500 text-sm mt-1">Manage upstream MCP server connections and their tools</p>
        </div>
        <div className="flex gap-3">
          <button onClick={refresh} disabled={refreshing} className="flex items-center gap-2 px-4 py-2 text-sm border border-slate-200 rounded-xl hover:bg-slate-50 transition">
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} /> Sync Tools
          </button>
          {user.role === "admin" && (
            <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-2 px-4 py-2 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition">
              <Plus className="w-4 h-4" /> Add Server
            </button>
          )}
        </div>
      </div>

      {/* Add Server Form */}
      {showAdd && (
        <form onSubmit={addServer} className="bg-white border border-slate-200 rounded-2xl p-6 mb-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Server Name</label>
              <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="My MCP Server" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">MCP Endpoint URL</label>
              <input value={form.url} onChange={e => setForm({...form, url: e.target.value})} placeholder="http://hostname:port/mcp" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent" required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Auth Type</label>
              <select value={form.auth_type} onChange={e => setForm({...form, auth_type: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
                <option value="none">None</option>
                <option value="bearer">Bearer Token</option>
                <option value="header">Custom Header</option>
              </select>
            </div>
            {form.auth_type !== "none" && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Credential</label>
                <input type="password" value={form.auth_credential} onChange={e => setForm({...form, auth_credential: e.target.value})} placeholder="Token or header value" className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">Add Server</button>
            <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 border border-slate-200 rounded-lg text-sm hover:bg-slate-50">Cancel</button>
          </div>
        </form>
      )}

      {/* Server List */}
      <div className="space-y-4">
        {servers.map(server => (
          <div key={server.id} className="bg-white border border-slate-200 rounded-2xl p-6 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${server.status === 'connected' ? 'bg-emerald-50' : server.status === 'unreachable' ? 'bg-red-50' : 'bg-slate-100'}`}>
                  <Server className={`w-5 h-5 ${server.status === 'connected' ? 'text-emerald-600' : server.status === 'unreachable' ? 'text-red-600' : 'text-slate-400'}`} />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800">{server.name}</h3>
                  <a href={server.url} target="_blank" rel="noopener noreferrer" className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline font-mono inline-flex items-center gap-1 mt-0.5">
                    {server.url} <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {statusBadge(server.status)}
                {user.role === "admin" && (
                  <>
                    <button onClick={() => toggleServer(server.id)} className={`p-2 rounded-lg transition ${server.is_enabled ? 'text-emerald-600 hover:bg-emerald-50' : 'text-slate-400 hover:bg-slate-50'}`} title={server.is_enabled ? "Disable" : "Enable"}>
                      {server.is_enabled ? <Power className="w-4 h-4" /> : <PowerOff className="w-4 h-4" />}
                    </button>
                    <button onClick={() => deleteServer(server.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition" title="Delete">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Tools */}
            {server.tools && server.tools.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <p className="text-xs font-medium text-slate-500 mb-2">Tools ({server.tools.length})</p>
                <div className="flex flex-wrap gap-2">
                  {server.tools.map((t, i) => (
                    <span key={i} className="inline-flex items-center gap-1 text-xs bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-lg font-mono">
                      <Zap className="w-3 h-3" />{t.tool_name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}
        {servers.length === 0 && (
          <div className="text-center py-16 text-slate-400">
            <Server className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No MCP servers registered yet.</p>
          </div>
        )}
      </div>

      {/* Connection Info */}
      <div className="mt-8 bg-indigo-50 border border-indigo-100 rounded-2xl p-6">
        <h3 className="font-semibold text-indigo-800 mb-2 flex items-center gap-2"><Globe className="w-4 h-4" /> External Client Connection</h3>
        <p className="text-sm text-indigo-600 mb-3">Connect Claude Code, Cursor, or MCP Inspector to the gateway:</p>
        <div className="bg-white rounded-lg p-3 font-mono text-sm text-slate-700 flex items-center justify-between">
          <span>MCP Endpoint: <a href="http://localhost:3001/mcp" target="_blank" rel="noopener noreferrer" className="text-indigo-600 font-bold hover:underline">http://localhost:3001/mcp</a> | Header: Authorization: Bearer &lt;your-api-key&gt;</span>
          <button onClick={() => navigator.clipboard.writeText("http://localhost:3001/mcp")} className="text-indigo-600 hover:text-indigo-800"><Copy className="w-4 h-4" /></button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// CHAT AGENT PAGE
// ─────────────────────────────────────────────
function ChatPage({ api, user }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    setMessages(prev => [...prev, { role: "user", content: userMsg }]);
    setLoading(true);

    try {
      const history = messages.map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));
      const res = await api.post("/api/chat", { message: userMsg, history });

      setMessages(prev => [...prev, {
        role: "assistant",
        content: res.data.response,
        toolCalls: res.data.toolCalls || [],
        error: res.data.error
      }]);
    } catch (err) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: `Error: ${err.response?.data?.error || err.message}`,
        error: true
      }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <div className="mb-4">
        <h2 className="text-2xl font-bold text-slate-800">Chat Agent</h2>
        <p className="text-slate-500 text-sm mt-1">Ask questions — the agent calls MCP tools as <strong>{user.username}</strong></p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto bg-white border border-slate-200 rounded-2xl p-6 space-y-4 mb-4">
        {messages.length === 0 && (
          <div className="text-center py-20 text-slate-400">
            <Bot className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p className="text-lg font-medium">Ask me anything!</p>
            <p className="text-sm mt-2">Try: "What products are in the store?" or "What time is it in Tokyo?"</p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
              msg.role === "user"
                ? "bg-indigo-600 text-white"
                : msg.error
                  ? "bg-red-50 text-red-800 border border-red-200"
                  : "bg-slate-100 text-slate-800"
            }`}>
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>

              {/* Tool calls */}
              {msg.toolCalls && msg.toolCalls.length > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-200/50 space-y-2">
                  <p className="text-xs font-semibold opacity-60">Tools Called:</p>
                  {msg.toolCalls.map((tc, j) => (
                    <div key={j} className="bg-white/20 rounded-lg px-3 py-2 text-xs font-mono">
                      <span className="font-bold text-indigo-300">{tc.tool}</span>
                      <span className="opacity-60 ml-2">{JSON.stringify(tc.arguments).substring(0, 80)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-slate-100 rounded-2xl px-4 py-3 flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" /> Thinking & calling tools...
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Input */}
      <div className="flex gap-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && send()}
          placeholder="Ask a question (e.g., 'List today's orders' or 'Calculate 15% of 250')"
          className="flex-1 px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          disabled={loading}
        />
        <button onClick={send} disabled={loading || !input.trim()} className="px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition disabled:opacity-50 flex items-center gap-2">
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// TEAM MANAGEMENT PAGE (Admin only)
// ─────────────────────────────────────────────
function TeamPage({ api, user }) {
  const [users, setUsers] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ username: "", email: "", role: "member" });
  const [newKey, setNewKey] = useState(null);

  const load = useCallback(() => { api.get("/api/users").then(r => setUsers(r.data)).catch(() => {}); }, [api]);
  useEffect(() => { load(); }, [load]);

  const addUser = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post("/api/users", form);
      setNewKey(res.data.api_key);
      setForm({ username: "", email: "", role: "member" });
      setShowAdd(false);
      load();
    } catch (err) {
      alert(err.response?.data?.error || "Failed");
    }
  };

  const revokeUser = async (id) => { if (confirm("Revoke this user's access?")) { await api.post(`/api/users/${id}/revoke`); load(); } };
  const activateUser = async (id) => { await api.post(`/api/users/${id}/activate`); load(); };
  const deleteUser = async (id) => { if (confirm("Delete this user permanently?")) { await api.delete(`/api/users/${id}`); load(); } };

  const regenKey = async (id) => {
    if (confirm("Generate a new API key? The old one will stop working.")) {
      const res = await api.post(`/api/users/${id}/regenerate-key`);
      setNewKey(res.data.api_key);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Team Management</h2>
          <p className="text-slate-500 text-sm mt-1">Invite members, manage API keys, and control access</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} className="flex items-center gap-2 px-4 py-2 text-sm bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition">
          <Plus className="w-4 h-4" /> Invite Member
        </button>
      </div>

      {/* New Key Alert */}
      {newKey && (
        <div className="mb-6 bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
          <div className="flex items-start justify-between">
            <div>
              <p className="font-semibold text-emerald-800 flex items-center gap-2"><Key className="w-4 h-4" /> New API Key Generated!</p>
              <p className="text-sm text-emerald-600 mt-1">Copy this key now — it won't be shown again.</p>
              <code className="block mt-2 bg-white px-3 py-2 rounded-lg font-mono text-sm text-emerald-800 border border-emerald-200">{newKey}</code>
            </div>
            <button onClick={() => { navigator.clipboard.writeText(newKey); }} className="text-emerald-600 hover:text-emerald-800 p-2"><Copy className="w-5 h-5" /></button>
          </div>
          <button onClick={() => setNewKey(null)} className="text-sm text-emerald-600 mt-3 hover:underline">Dismiss</button>
        </div>
      )}

      {/* Add User Form */}
      {showAdd && (
        <form onSubmit={addUser} className="bg-white border border-slate-200 rounded-2xl p-6 mb-6 space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
              <input value={form.username} onChange={e => setForm({...form, username: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
              <select value={form.role} onChange={e => setForm({...form, role: e.target.value})} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">Create User</button>
            <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-2 border border-slate-200 rounded-lg text-sm hover:bg-slate-50">Cancel</button>
          </div>
        </form>
      )}

      {/* User List */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-6 py-3 font-medium text-slate-600">User</th>
              <th className="text-left px-6 py-3 font-medium text-slate-600">Role</th>
              <th className="text-left px-6 py-3 font-medium text-slate-600">Key Prefix</th>
              <th className="text-left px-6 py-3 font-medium text-slate-600">Status</th>
              <th className="text-right px-6 py-3 font-medium text-slate-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-6 py-4">
                  <div>
                    <p className="font-medium text-slate-800">{u.username}</p>
                    <p className="text-xs text-slate-400">{u.email}</p>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${u.role === 'admin' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'}`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-6 py-4 font-mono text-xs text-slate-500">{u.api_key_prefix}...</td>
                <td className="px-6 py-4">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${u.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                    {u.is_active ? 'Active' : 'Revoked'}
                  </span>
                </td>
                <td className="px-6 py-4 text-right space-x-1">
                  <button onClick={() => regenKey(u.id)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition" title="Regenerate Key"><Key className="w-4 h-4" /></button>
                  {u.is_active ? (
                    <button onClick={() => revokeUser(u.id)} className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition" title="Revoke"><PowerOff className="w-4 h-4" /></button>
                  ) : (
                    <button onClick={() => activateUser(u.id)} className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition" title="Activate"><Power className="w-4 h-4" /></button>
                  )}
                  {u.id !== user.id && <button onClick={() => deleteUser(u.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition" title="Delete"><Trash2 className="w-4 h-4" /></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// AUDIT LOG PAGE
// ─────────────────────────────────────────────
function AuditPage({ api }) {
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);

  const load = useCallback(() => {
    api.get("/api/audit?limit=200").then(r => { setLogs(r.data.logs || []); setTotal(r.data.total || 0); }).catch(() => {});
  }, [api]);
  useEffect(() => { load(); const i = setInterval(load, 5000); return () => clearInterval(i); }, [load]);

  const outcomeStyle = (status) => {
    if (status === 'success') return 'bg-emerald-50 text-emerald-700';
    if (status === 'error' || status === 'failed') return 'bg-red-50 text-red-700';
    if (status === 'timeout') return 'bg-amber-50 text-amber-700';
    return 'bg-slate-50 text-slate-700';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Audit Log</h2>
          <p className="text-slate-500 text-sm mt-1">{total} total entries — every tool call, user action, and server event</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-4 py-2 text-sm border border-slate-200 rounded-xl hover:bg-slate-50">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="text-left px-4 py-3 font-medium text-slate-600">Time</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">User</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Action</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Server</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Tool</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Duration</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(log => (
              <tr key={log.id} className="border-b border-slate-50 hover:bg-slate-50">
                <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">{new Date(log.timestamp).toLocaleString()}</td>
                <td className="px-4 py-3 font-medium text-slate-700">{log.username || '—'}</td>
                <td className="px-4 py-3 font-mono text-xs">{log.action}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{log.server_name || '—'}</td>
                <td className="px-4 py-3 font-mono text-xs text-indigo-600">{log.tool_name || '—'}</td>
                <td className="px-4 py-3 text-xs text-slate-500">{log.duration_ms ? `${log.duration_ms}ms` : '—'}</td>
                <td className="px-4 py-3"><span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${outcomeStyle(log.status)}`}>{log.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {logs.length === 0 && <div className="text-center py-12 text-slate-400">No audit entries yet.</div>}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// STORES PAGE (existing functionality, refined)
// ─────────────────────────────────────────────
function StoresPage({ api }) {
  const [stores, setStores] = useState([]);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => { api.get("/api/stores").then(r => setStores(r.data)).catch(() => {}); }, [api]);
  useEffect(() => { load(); const i = setInterval(load, 3000); return () => clearInterval(i); }, [load]);

  const create = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try { await api.post("/api/stores", { name: newName }); setNewName(""); load(); } catch (err) { alert(err.response?.data?.error || "Failed"); }
    setCreating(false);
  };

  const del = async (id) => {
    if (confirm("Delete this store? All data will be lost.")) {
      try { await api.delete(`/api/stores/${id}`); load(); } catch { alert("Delete failed"); }
    }
  };

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-800">WooCommerce Stores</h2>
        <p className="text-slate-500 text-sm mt-1">Provision and manage WooCommerce instances on Kubernetes</p>
      </div>

      <form onSubmit={create} className="flex gap-4 mb-8">
        <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="New store name..." className="flex-1 px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500" />
        <button type="submit" disabled={creating || !newName} className="px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition disabled:opacity-50 flex items-center gap-2">
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Launch Store
        </button>
      </form>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {stores.map(s => (
          <div key={s.id} className={`bg-white border border-slate-200 rounded-2xl p-5 transition-all ${s.status === 'DELETING' ? 'opacity-50' : 'hover:shadow-md'}`}>
            <div className="flex items-center justify-between mb-3">
              <div className={`p-2 rounded-lg ${s.status === 'READY' ? 'bg-emerald-50' : s.status === 'FAILED' ? 'bg-red-50' : 'bg-indigo-50'}`}>
                {s.status === 'READY' ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : s.status === 'FAILED' ? <XCircle className="w-5 h-5 text-red-600" /> : <Loader2 className="w-5 h-5 text-indigo-600 animate-spin" />}
              </div>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${s.status === 'READY' ? 'bg-emerald-50 text-emerald-700' : s.status === 'FAILED' ? 'bg-red-50 text-red-700' : 'bg-indigo-50 text-indigo-700'}`}>{s.status}</span>
            </div>
            <h3 className="font-bold text-slate-800 truncate">{s.name}</h3>
            <p className="text-xs text-slate-400 font-mono mt-1">{s.id}</p>
            <div className="flex gap-2 mt-4 pt-3 border-t border-slate-100">
              {s.status === 'READY' ? (
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-1 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition">
                  Visit <ExternalLink className="w-3 h-3" />
                </a>
              ) : (
                <div className="flex-1 text-center py-2 text-xs text-slate-400 bg-slate-50 rounded-lg">{s.status === 'FAILED' ? 'Failed' : 'Provisioning...'}</div>
              )}
              <button onClick={() => del(s.id)} className="p-2 text-slate-400 hover:text-red-600 rounded-lg transition"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        ))}
        {stores.length === 0 && (
          <div className="col-span-full text-center py-16 bg-white border border-dashed border-slate-200 rounded-2xl text-slate-400">
            <Store className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No stores running. Launch one above.</p>
          </div>
        )}
      </div>
    </div>
  );
}
