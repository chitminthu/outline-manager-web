//pages/index.js
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Geist, Geist_Mono } from 'next/font/google';
import toast from 'react-hot-toast';
import { getServers, safeServer } from '../lib/serverStore';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  if (bytes < 1e6) return `${(bytes / 1e3).toFixed(1)} KB`;
  if (bytes < 1e9) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${(bytes / 1e9).toFixed(2)} GB`;
}

function formatUptime(ms) {
  if (!ms) return null;
  const days = Math.floor((Date.now() - ms) / (1000 * 60 * 60 * 24));
  if (days < 1) return 'Less than a day';
  if (days === 1) return '1 day';
  if (days < 30) return `${days} days`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo`;
  return `${Math.floor(months / 12)}y`;
}

// Fetch status for a single server with a client-side timeout as backup
async function fetchStatus(serverId) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000); // 8s client-side backup
  try {
    const res = await fetch(`/api/servers/${serverId}/status`, {
      signal: controller.signal,
    });
    clearTimeout(timer);
    return await res.json();
  } catch (err) {
    clearTimeout(timer);
    return { online: false, reason: err.name === 'AbortError' ? 'timeout' : 'unreachable' };
  }
}

function StatusBadge({ online, loading, reason }) {
  if (loading) {
    return (
      <span className="rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-medium text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500 animate-pulse">
        ○ Checking…
      </span>
    );
  }
  if (online) {
    return (
      <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        ● Online
      </span>
    );
  }
  return (
    <span className="rounded-full bg-red-500/10 px-2.5 py-0.5 text-xs font-medium text-red-600 dark:text-red-400"
      title={reason === 'timeout' ? 'Connection timed out' : 'Could not reach server'}>
      {reason === 'timeout' ? '⏱ Timed out' : '✕ Offline'}
    </span>
  );
}

function SkeletonRow() {
  return (
    <div className="space-y-2">
      {[40, 60, 50].map((w, i) => (
        <div key={i} className={`h-3 w-${w} rounded-full bg-zinc-100 dark:bg-zinc-800`} />
      ))}
    </div>
  );
}

function DeleteServerModal({ serverName, onConfirm, onCancel, isDeleting }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-900 p-6 shadow-2xl">
        <h3 className="text-lg font-semibold text-white">Remove Server</h3>
        <p className="mt-2 text-sm text-zinc-400">
          Remove <span className="font-mono text-white">&ldquo;{serverName}&rdquo;</span> from your
          dashboard? This only removes it from your list — it does not affect the Outline server or
          any keys.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onCancel} disabled={isDeleting}
            className="rounded-full px-5 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/10 disabled:opacity-50">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={isDeleting}
            className="rounded-full bg-red-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-50">
            {isDeleting ? 'Removing…' : 'Remove'}
          </button>
        </div>
      </div>
    </div>
  );
}

export async function getServerSideProps() {
  const servers = getServers().map(safeServer);
  return { props: { servers } };
}

export default function Dashboard({ servers: initialServers }) {
  const [servers, setServers] = useState(initialServers);
  const [statuses, setStatuses] = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [newName, setNewName] = useState('');
  const [newApiUrl, setNewApiUrl] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  // Fetch status for a specific server and update state
  const loadStatus = useCallback((serverId) => {
    setStatuses((prev) => ({ ...prev, [serverId]: { loading: true } }));
    fetchStatus(serverId).then((data) => {
      setStatuses((prev) => ({ ...prev, [serverId]: { loading: false, ...data } }));
    });
  }, []);

  // Load status for all servers on mount or when server list changes
  useEffect(() => {
    servers.forEach((s) => loadStatus(s.id));
  }, [servers, loadStatus]);

  const handleAddServer = async (e) => {
    e.preventDefault();
    if (!newName.trim() || !newApiUrl.trim()) return;
    setIsAdding(true);
    try {
      const res = await fetch('/api/servers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), apiUrl: newApiUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message || 'Failed to add server');
        return;
      }
      toast.success('Server added');
      // Update state directly — no page refresh needed.
      // The useEffect watching [servers] will automatically trigger a status
      // fetch for the new entry.
      setServers((prev) => [...prev, data.server]);
      setNewName('');
      setNewApiUrl('');
      setShowAddForm(false);
    } catch {
      toast.error('Failed to add server');
    } finally {
      setIsAdding(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/servers/${deleteTarget.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success(`"${deleteTarget.name}" removed`);
      // Remove from state directly — no page refresh
      setServers((prev) => prev.filter((s) => s.id !== deleteTarget.id));
      setStatuses((prev) => {
        const next = { ...prev };
        delete next[deleteTarget.id];
        return next;
      });
      setDeleteTarget(null);
    } catch {
      toast.error('Failed to remove server');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className={`${geistSans.variable} ${geistMono.variable} flex min-h-screen justify-center bg-zinc-50 font-sans dark:bg-black`}>
      {deleteTarget && (
        <DeleteServerModal
          serverName={deleteTarget.name}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTarget(null)}
          isDeleting={isDeleting}
        />
      )}

      <main className="flex w-full max-w-6xl flex-col gap-10 px-4 py-16 sm:px-8">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-white">
              Outline Dashboard
            </h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {servers.length === 0
                ? 'No servers yet — add one below'
                : `${servers.length} server${servers.length > 1 ? 's' : ''}`}
            </p>
          </div>
          <div className="mt-1 flex items-center gap-3">
            <button
              onClick={() => setShowAddForm((v) => !v)}
              className="rounded-full border border-black/10 px-4 py-1 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-400 dark:hover:bg-white/5"
            >
              {showAddForm ? 'Cancel' : '+ Add Server'}
            </button>
            <a href="https://auth.chitminthu.me/logout"
              className="rounded-full border border-black/10 px-4 py-1 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-400 dark:hover:bg-white/5">
              Sign out
            </a>
          </div>
        </div>

        {/* Add Server Form */}
        {showAddForm && (
          <div className="rounded-xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-900/50">
            <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-zinc-400">Add Server</h2>
            <form onSubmit={handleAddServer} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex flex-1 flex-col gap-3 sm:flex-row">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nickname (e.g. London VPN)"
                  maxLength={100}
                  className="h-11 flex-1 rounded-full border border-black/10 bg-transparent px-4 text-sm text-black transition focus:border-zinc-400 focus:outline-none dark:border-white/15 dark:text-white dark:focus:border-zinc-500"
                />
                <input
                  type="text"
                  value={newApiUrl}
                  onChange={(e) => setNewApiUrl(e.target.value)}
                  placeholder="https://ip:port/token"
                  className="h-11 flex-[2] rounded-full border border-black/10 bg-transparent px-4 font-mono text-sm text-black transition focus:border-zinc-400 focus:outline-none dark:border-white/15 dark:text-white dark:focus:border-zinc-500"
                />
              </div>
              <button
                type="submit"
                disabled={isAdding || !newName.trim() || !newApiUrl.trim()}
                className="h-11 rounded-full bg-black px-6 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                {isAdding ? 'Adding…' : 'Add'}
              </button>
            </form>
            <p className="mt-3 text-xs text-zinc-400">
              Find your API URL in the Outline Manager app: three-dot menu → View server config → <span className="font-mono">apiUrl</span>
            </p>
          </div>
        )}

        {/* Server Cards */}
        {servers.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-black/10 py-20 dark:border-white/10">
            <p className="text-3xl">🖥️</p>
            <p className="mt-4 text-base font-medium text-zinc-600 dark:text-zinc-300">No servers yet</p>
            <p className="mt-1 text-sm text-zinc-400">Click &ldquo;+ Add Server&rdquo; above to get started</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {servers.map((server) => {
              const status = statuses[server.id] || { loading: true };
              // Use the real Outline server name once we have it, fall back to
              // the local nickname while loading or if offline.
              const displayName = (!status.loading && status.online && status.name)
                ? status.name
                : server.name;

              return (
                <div key={server.id}
                  className="flex flex-col rounded-xl border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900/50">

                  {/* Card header */}
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-mono font-medium text-zinc-900 dark:text-zinc-50 truncate">
                      {displayName}
                    </h3>
                    <StatusBadge
                      online={status.online}
                      loading={status.loading}
                      reason={status.reason}
                    />
                  </div>

                  {/* Live stats */}
                  <div className="mt-4 flex-1">
                    {status.loading ? (
                      <SkeletonRow />
                    ) : status.online ? (
                      <dl className="space-y-2 text-sm">
                        {status.version && (
                          <div className="flex justify-between">
                            <dt className="text-zinc-400">Version</dt>
                            <dd className="font-mono text-zinc-700 dark:text-zinc-300">v{status.version}</dd>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <dt className="text-zinc-400">Keys</dt>
                          <dd className="font-mono text-zinc-700 dark:text-zinc-300">{status.keyCount}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-zinc-400">Total usage</dt>
                          <dd className="font-mono text-zinc-700 dark:text-zinc-300">{formatBytes(status.totalBytes)}</dd>
                        </div>
                        {status.createdTimestampMs && (
                          <div className="flex justify-between">
                            <dt className="text-zinc-400">Uptime</dt>
                            <dd className="font-mono text-zinc-700 dark:text-zinc-300">{formatUptime(status.createdTimestampMs)}</dd>
                          </div>
                        )}
                      </dl>
                    ) : (
                      <p className="text-sm text-zinc-400">
                        {status.reason === 'timeout'
                          ? 'Connection timed out. Check if the server is reachable.'
                          : 'Could not reach this server. Check the API URL.'}
                      </p>
                    )}
                  </div>

                  {/* Card actions */}
                  <div className="mt-5 flex items-center justify-between border-t border-black/5 pt-4 dark:border-white/5">
                    <Link href={`/server/${server.id}`}
                      className="rounded-full bg-black px-4 py-1.5 text-xs font-medium text-white transition hover:bg-zinc-700 dark:bg-white dark:text-black dark:hover:bg-zinc-200">
                      Manage →
                    </Link>
                    <div className="flex items-center gap-2">
                      {/* Retry button for offline servers */}
                      {!status.loading && !status.online && (
                        <button
                          onClick={() => loadStatus(server.id)}
                          className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-200 dark:bg-white/5 dark:text-zinc-400 dark:hover:bg-white/10"
                        >
                          Retry
                        </button>
                      )}
                      <button
                        onClick={() => setDeleteTarget(server)}
                        className="rounded-full bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-500/20 dark:text-red-400">
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </main>
    </div>
  );
}