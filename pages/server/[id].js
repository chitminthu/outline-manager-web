// pages/server/[id].js
import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { Geist, Geist_Mono } from 'next/font/google';
import toast from 'react-hot-toast';
import { QRCodeSVG } from 'qrcode.react';
import { createOutlineApi } from '../../lib/outlineClient';
import { getServer } from '../../lib/serverStore';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

// ── Formatters ────────────────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  if (bytes < 1e6) return `${(bytes / 1e3).toFixed(1)} KB`;
  if (bytes < 1e9) return `${(bytes / 1e6).toFixed(1)} MB`;
  return `${(bytes / 1e9).toFixed(2)} GB`;
}

function formatDate(ms) {
  if (!ms) return 'N/A';
  const d = new Date(ms);
  if (isNaN(d)) return 'N/A';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatUptime(ms) {
  if (!ms) return 'N/A';
  const diffMs = Date.now() - ms;
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days < 1) return 'Less than a day';
  if (days === 1) return '1 day';
  if (days < 30) return `${days} days`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months > 1 ? 's' : ''}`;
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  return remMonths > 0 ? `${years}y ${remMonths}m` : `${years} year${years > 1 ? 's' : ''}`;
}

function formatLastSeen(unixSeconds) {
  if (!unixSeconds) return null;
  const diffMs = Date.now() - unixSeconds * 1000;
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 2) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function parseLimit(str) {
  const s = str.trim().toUpperCase().replace(/\s+/g, '');
  const match = s.match(/^([\d.]+)(GB|MB|KB|B)?$/);
  if (!match) return null;
  const num = parseFloat(match[1]);
  if (isNaN(num) || num < 0) return null;
  const multipliers = { B: 1, KB: 1e3, MB: 1e6, GB: 1e9 };
  const unit = match[2] || 'GB';
  return Math.floor(num * multipliers[unit]);
}

// ── Sub-components ────────────────────────────────────────────────────────────

function UsageBar({ used, limit }) {
  if (!limit) return null;
  const pct = Math.min((used / limit) * 100, 100);
  const color = pct >= 90 ? 'bg-red-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-emerald-500';
  return (
    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
      <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function StatCard({ label, value, sub, accent }) {
  return (
    <div className={`flex flex-col gap-1 rounded-xl border bg-white p-5 dark:bg-zinc-900/50 ${accent ? 'border-red-500/30' : 'border-black/10 dark:border-white/10'}`}>
      <span className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className={`text-2xl font-semibold ${accent ? 'text-red-500' : 'text-black dark:text-white'}`}>{value}</span>
      {sub && <span className="text-xs text-zinc-500 dark:text-zinc-400">{sub}</span>}
    </div>
  );
}

function Badge({ children, color }) {
  const colors = {
    amber: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
    red: 'bg-red-500/15 text-red-600 dark:text-red-400',
    zinc: 'bg-zinc-200 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colors[color] || colors.zinc}`}>
      {children}
    </span>
  );
}

// Sortable column header — shows arrow indicator for active sort
function SortHeader({ label, field, sortField, sortDir, onSort }) {
  const isActive = sortField === field;
  return (
    <th
      onClick={() => onSort(field)}
      className="cursor-pointer select-none whitespace-nowrap px-5 py-4 text-xs font-medium uppercase tracking-wider text-zinc-500 transition hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
    >
      <span className="flex items-center gap-1">
        {label}
        <span className={`transition ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'}`}>
          {isActive ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'}
        </span>
      </span>
    </th>
  );
}

function DeleteModal({ keyName, onConfirm, onCancel, isDeleting }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-900 p-6 shadow-2xl">
        <h3 className="text-lg font-semibold text-white">Delete Access Key</h3>
        <p className="mt-2 text-sm text-zinc-400">
          Are you sure you want to delete{' '}
          <span className="font-mono text-white">&ldquo;{keyName}&rdquo;</span>?
          This action cannot be undone.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onCancel} disabled={isDeleting}
            className="rounded-full px-5 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/10 disabled:opacity-50">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={isDeleting}
            className="rounded-full bg-red-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-50">
            {isDeleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

function QRModal({ keyData, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}>
      <div className="w-full max-w-xs rounded-2xl border border-white/10 bg-zinc-900 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-white">{keyData.name || 'Untitled'}</h3>
            <p className="text-xs text-zinc-500">Scan with the Outline app</p>
          </div>
          <button onClick={onClose}
            className="rounded-full p-1.5 text-zinc-400 transition hover:bg-white/10 hover:text-white">
            ✕
          </button>
        </div>
        <div className="flex justify-center rounded-xl bg-white p-4">
          <QRCodeSVG value={keyData.accessUrl} size={200} />
        </div>
        <p className="mt-3 break-all text-center font-mono text-xs text-zinc-500">{keyData.accessUrl}</p>
      </div>
    </div>
  );
}

// ── Server-side data fetching ─────────────────────────────────────────────────

export async function getServerSideProps({ params }) {
  const { id } = params;

  const server = getServer(id);
  if (!server) return { notFound: true };

  try {
    const api = createOutlineApi(server.apiUrl);

    const [keysRes, metricsRes, serverRes, metricsEnabledRes, experimentalRes] = await Promise.all([
      api.get('/access-keys/'),
      api.get('/metrics/transfer'),
      api.get('/server'),
      api.get('/metrics/enabled'),
      api.get('/experimental/server/metrics', { params: { since: '24h' } }).catch(() => null),
    ]);

    const rawKeys = keysRes.data.accessKeys || [];
    const transferMetrics = metricsRes.data.bytesTransferredByUserId || {};
    const serverInfo = serverRes.data || {};
    const isMetricsEnabled = metricsEnabledRes.data.metricsEnabled || false;
    const totalUsageBytes = Object.values(transferMetrics).reduce((s, b) => s + b, 0);

    // Build lookup map — stringify accessKeyId since key.id from standard API is a string
    const experimentalByKeyId = {};
    if (experimentalRes?.data?.accessKeys) {
      for (const k of experimentalRes.data.accessKeys) {
        experimentalByKeyId[String(k.accessKeyId)] = k;
      }
    }

    const keys = rawKeys
      .map((key) => {
        const usedBytes = transferMetrics[key.id] || 0;
        const limitBytes = key.dataLimit?.bytes || null;
        const usedPct = limitBytes ? Math.min((usedBytes / limitBytes) * 100, 100) : null;
        const trafficShare = totalUsageBytes > 0 ? ((usedBytes / totalUsageBytes) * 100).toFixed(1) : '0.0';
        const isOverLimit = limitBytes ? usedBytes >= limitBytes : false;

        const exp = experimentalByKeyId[key.id] || null;
        const lastTrafficSeen = exp?.connection?.lastTrafficSeen || null;
        // peakDeviceCount.data is the count — use ?? not || so 0 is preserved
        const peakDeviceCount = exp?.connection?.peakDeviceCount?.data ?? null;

        return {
          id: key.id,
          name: key.name || '',
          accessUrl: key.accessUrl || '',
          usedBytes,
          limitBytes,
          usedPct,
          trafficShare: parseFloat(trafficShare),
          isOverLimit,
          lastTrafficSeen,
          peakDeviceCount,
        };
      })
      .sort((a, b) => b.usedBytes - a.usedBytes); // default sort

    const activeKeys = keys.filter((k) => k.usedBytes > 0).length;
    const unusedKeys = keys.filter((k) => k.usedBytes === 0).length;
    const keysOverLimit = keys.filter((k) => k.isOverLimit).length;
    const avgUsageBytes = activeKeys > 0 ? Math.floor(totalUsageBytes / activeKeys) : 0;
    const defaultLimitBytes = serverInfo.accessKeyDataLimit?.bytes || null;
    const hasExperimental = experimentalRes !== null;

    return {
      props: {
        serverId: id,
        keys,
        serverInfo: {
          name: serverInfo.name || server.name || null,
          cipher: rawKeys[0]?.method || null,
          serverId: serverInfo.serverId || null,
          version: serverInfo.version || null,
          hostnameForAccessKeys: serverInfo.hostnameForAccessKeys || null,
          portForNewAccessKeys: serverInfo.portForNewAccessKeys || null,
          createdTimestampMs: serverInfo.createdTimestampMs || null,
          defaultLimitBytes,
          totalUsage: totalUsageBytes,
          activeKeys,
          unusedKeys,
          keysOverLimit,
          avgUsageBytes,
        },
        isMetricsEnabled,
        hasExperimental,
      },
    };
  } catch {
    return {
      props: {
        serverId: id,
        keys: [],
        serverInfo: { name: server.name },
        isMetricsEnabled: false,
        hasExperimental: false,
        error: 'Could not connect to the Outline server.',
      },
    };
  }
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ServerDetail({ serverId, keys: initialKeys, serverInfo, isMetricsEnabled, hasExperimental, error }) {
  const router = useRouter();

  // Sorting state — default: data used descending
  const [sortField, setSortField] = useState('usedBytes');
  const [sortDir, setSortDir] = useState('desc');

  // Clicking the same column toggles direction; clicking a new column defaults to desc
  const handleSort = (field) => {
    if (field === sortField) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortField(field);
      // name sorts asc by default (A→Z); everything else desc (highest first)
      setSortDir(field === 'name' ? 'asc' : 'desc');
    }
  };

  // Apply sort to keys — no server round-trip, purely client-side
  const keys = [...initialKeys].sort((a, b) => {
    let aVal, bVal;
    switch (sortField) {
      case 'name':
        aVal = (a.name || '').toLowerCase();
        bVal = (b.name || '').toLowerCase();
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      case 'usedBytes':
        aVal = a.usedBytes;
        bVal = b.usedBytes;
        break;
      case 'trafficShare':
        aVal = a.trafficShare;
        bVal = b.trafficShare;
        break;
      case 'lastTrafficSeen':
        // null (never used) always goes to bottom regardless of sort direction
        if (!a.lastTrafficSeen && !b.lastTrafficSeen) return 0;
        if (!a.lastTrafficSeen) return 1;
        if (!b.lastTrafficSeen) return -1;
        aVal = a.lastTrafficSeen;
        bVal = b.lastTrafficSeen;
        break;
      case 'peakDeviceCount':
        aVal = a.peakDeviceCount ?? -1;
        bVal = b.peakDeviceCount ?? -1;
        break;
      default:
        return 0;
    }
    return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
  });

  // Add key
  const [newKeyName, setNewKeyName] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  // Delete key
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Inline key rename
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef(null);

  // Inline per-key limit edit
  const [limitEditId, setLimitEditId] = useState(null);
  const [limitEditValue, setLimitEditValue] = useState('');
  const limitInputRef = useRef(null);

  // Inline server default limit edit
  const [isEditingServerLimit, setIsEditingServerLimit] = useState(false);
  const [serverLimitValue, setServerLimitValue] = useState(
    serverInfo.defaultLimitBytes ? formatBytes(serverInfo.defaultLimitBytes).replace(' ', '') : ''
  );
  const serverLimitInputRef = useRef(null);

  // Server name rename
  const [isRenamingServer, setIsRenamingServer] = useState(false);
  const [serverNameValue, setServerNameValue] = useState(serverInfo.name || '');
  const serverNameInputRef = useRef(null);

  // Metrics toggle — optimistic
  const [metricsEnabled, setMetricsEnabled] = useState(isMetricsEnabled);
  const [isTogglingMetrics, setIsTogglingMetrics] = useState(false);

  // QR modal
  const [qrKey, setQrKey] = useState(null);

  const refresh = useCallback(() => router.replace(router.asPath), [router]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleAddKey = async (e) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    setIsAdding(true);
    try {
      const res = await fetch('/api/addKey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName.trim(), serverId }),
      });
      if (!res.ok) throw new Error();
      toast.success('Key added');
      setNewKeyName('');
      refresh();
    } catch {
      toast.error('Failed to add key');
    } finally {
      setIsAdding(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await fetch('/api/deleteKey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deleteTarget.id, serverId }),
      });
      if (!res.ok) throw new Error();
      toast.success(`"${deleteTarget.name || 'Untitled'}" deleted`);
      setDeleteTarget(null);
      refresh();
    } catch {
      toast.error('Failed to delete key');
    } finally {
      setIsDeleting(false);
    }
  };

  const startRenameServer = () => {
    setServerNameValue(serverInfo.name || '');
    setIsRenamingServer(true);
    setTimeout(() => serverNameInputRef.current?.select(), 0);
  };

  const commitRenameServer = async () => {
    const trimmed = serverNameValue.trim();
    setIsRenamingServer(false);
    if (!trimmed || trimmed === serverInfo.name) return;
    try {
      const res = await fetch('/api/renameServer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, serverId }),
      });
      if (!res.ok) throw new Error();
      toast.success('Server renamed');
      refresh();
    } catch {
      toast.error('Failed to rename server');
    }
  };

  const startEditServerLimit = () => {
    setServerLimitValue(
      serverInfo.defaultLimitBytes ? formatBytes(serverInfo.defaultLimitBytes).replace(' ', '') : ''
    );
    setIsEditingServerLimit(true);
    setTimeout(() => serverLimitInputRef.current?.select(), 0);
  };

  const commitServerLimit = async () => {
    const raw = serverLimitValue.trim();
    setIsEditingServerLimit(false);
    if (!raw) {
      if (!serverInfo.defaultLimitBytes) return;
      try {
        const res = await fetch('/api/setServerLimit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ serverId, bytes: null }),
        });
        if (!res.ok) throw new Error();
        toast.success('Default limit removed');
        refresh();
      } catch {
        toast.error('Failed to remove default limit');
      }
      return;
    }
    const bytes = parseLimit(raw);
    if (bytes === null) {
      toast.error('Invalid limit. Use e.g. "100 GB" or "500 MB"');
      return;
    }
    if (bytes === serverInfo.defaultLimitBytes) return;
    try {
      const res = await fetch('/api/setServerLimit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId, bytes }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Default limit set to ${formatBytes(bytes)}`);
      refresh();
    } catch {
      toast.error('Failed to set default limit');
    }
  };

  const handleToggleMetrics = async () => {
    if (isTogglingMetrics) return;
    const newValue = !metricsEnabled;
    setIsTogglingMetrics(true);
    setMetricsEnabled(newValue);
    try {
      const res = await fetch('/api/toggleMetrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId, enabled: newValue }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Metrics ${newValue ? 'enabled' : 'disabled'}`);
    } catch {
      setMetricsEnabled(!newValue);
      toast.error('Failed to toggle metrics');
    } finally {
      setIsTogglingMetrics(false);
    }
  };

  const startRename = (key) => {
    setRenamingId(key.id);
    setRenameValue(key.name || '');
    setTimeout(() => renameInputRef.current?.select(), 0);
  };

  const commitRename = async (key) => {
    const trimmed = renameValue.trim();
    setRenamingId(null);
    if (!trimmed || trimmed === key.name) return;
    try {
      const res = await fetch('/api/renameKey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: key.id, name: trimmed, serverId }),
      });
      if (!res.ok) throw new Error();
      toast.success('Key renamed');
      refresh();
    } catch {
      toast.error('Failed to rename key');
    }
  };

  const startLimitEdit = (key) => {
    setLimitEditId(key.id);
    setLimitEditValue(key.limitBytes ? formatBytes(key.limitBytes).replace(' ', '') : '');
    setTimeout(() => limitInputRef.current?.select(), 0);
  };

  const commitLimit = async (key) => {
    const raw = limitEditValue.trim();
    setLimitEditId(null);
    if (!raw) {
      if (!key.limitBytes) return;
      try {
        const res = await fetch('/api/setLimit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: key.id, bytes: null, serverId }),
        });
        if (!res.ok) throw new Error();
        toast.success('Limit removed');
        refresh();
      } catch {
        toast.error('Failed to remove limit');
      }
      return;
    }
    const bytes = parseLimit(raw);
    if (bytes === null) {
      toast.error('Invalid limit. Use e.g. "10 GB" or "500 MB"');
      return;
    }
    if (bytes === key.limitBytes) return;
    try {
      const res = await fetch('/api/setLimit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: key.id, bytes, serverId }),
      });
      if (!res.ok) throw new Error();
      toast.success(`Limit set to ${formatBytes(bytes)}`);
      refresh();
    } catch {
      toast.error('Failed to set limit');
    }
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Failed to copy');
    }
  };

  const activeKeys = initialKeys.filter((k) => k.usedBytes > 0);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-900 text-white">
        <div className="text-center">
          <p className="text-4xl">⚠️</p>
          <h1 className="mt-4 text-2xl font-bold text-red-400">Connection Error</h1>
          <p className="mt-2 text-zinc-400">{error}</p>
          <Link href="/" className="mt-6 inline-block text-sm text-zinc-400 underline hover:text-white">
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={`${geistSans.variable} ${geistMono.variable} flex min-h-screen justify-center bg-zinc-50 font-sans dark:bg-black`}>
      {deleteTarget && (
        <DeleteModal
          keyName={deleteTarget.name || 'Untitled'}
          onConfirm={handleConfirmDelete}
          onCancel={() => setDeleteTarget(null)}
          isDeleting={isDeleting}
        />
      )}
      {qrKey && <QRModal keyData={qrKey} onClose={() => setQrKey(null)} />}

      <main className="flex w-full max-w-6xl flex-col gap-10 px-4 py-16 sm:px-8">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <Link href="/"
              className="mb-2 inline-flex items-center gap-1 text-xs text-zinc-400 transition hover:text-zinc-600 dark:hover:text-zinc-200">
              ← All Servers
            </Link>
            <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-white">
              Outline Dashboard
            </h1>
            <div className="mt-1 flex items-center gap-1.5">
              {isRenamingServer ? (
                <input
                  ref={serverNameInputRef}
                  value={serverNameValue}
                  onChange={(e) => setServerNameValue(e.target.value)}
                  onBlur={commitRenameServer}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRenameServer();
                    if (e.key === 'Escape') setIsRenamingServer(false);
                  }}
                  maxLength={100}
                  className="rounded-md border border-zinc-300 bg-transparent px-2 py-0.5 text-sm text-zinc-600 focus:border-zinc-400 focus:outline-none dark:border-zinc-600 dark:text-zinc-400"
                />
              ) : (
                <button
                  onClick={startRenameServer}
                  title="Click to rename server"
                  className="group flex items-center gap-1.5 text-sm text-cyan-600 transition hover:text-cyan-500 dark:text-cyan-400 dark:hover:text-cyan-300"
                >
                  <span>
                    {serverInfo.name || 'Outline Server'}
                    {serverInfo.version && ` · v${serverInfo.version}`}
                    {serverInfo.createdTimestampMs && ` · Up ${formatUptime(serverInfo.createdTimestampMs)}`}
                  </span>
                  <span className="opacity-0 text-xs text-zinc-400 transition group-hover:opacity-100">✎</span>
                </button>
              )}
            </div>
          </div>

          <div className="mt-1 flex items-center gap-3">
            <button
              onClick={handleToggleMetrics}
              disabled={isTogglingMetrics}
              title={metricsEnabled ? 'Click to disable metrics' : 'Click to enable metrics'}
              className={`rounded-full px-3 py-1 text-xs font-medium transition disabled:opacity-50 ${
                metricsEnabled
                  ? 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400'
                  : 'bg-yellow-500/10 text-yellow-600 hover:bg-yellow-500/20 dark:text-yellow-400'
              }`}
            >
              {metricsEnabled ? '● Metrics On' : '○ Metrics Off'}
            </button>
            <a href="https://auth.chitminthu.me/logout"
              className="rounded-full border border-black/10 px-4 py-1 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 dark:border-white/10 dark:text-zinc-400 dark:hover:bg-white/5">
              Sign out
            </a>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Total Keys" value={initialKeys.length} sub={`${serverInfo.unusedKeys ?? 0} never used`} />
          <StatCard label="Active Keys" value={serverInfo.activeKeys ?? 0} sub="used at least once" />
          <StatCard label="Total Usage" value={formatBytes(serverInfo.totalUsage)} sub={`avg ${formatBytes(serverInfo.avgUsageBytes)} / active key`} />
          <StatCard label="Over Limit" value={serverInfo.keysOverLimit ?? 0}
            sub={serverInfo.keysOverLimit > 0 ? 'keys at capacity' : 'all within limit'}
            accent={serverInfo.keysOverLimit > 0} />
        </div>

        {/* Server Info + Traffic + Add Key */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">

          {/* Server Details */}
          <div className="rounded-xl border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900/50">
            <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-zinc-400">Server Details</h2>
            <dl className="space-y-3 text-sm">
              {[
                ['Name', serverInfo.name],
                ['Version', serverInfo.version],
                ['Hostname', serverInfo.hostnameForAccessKeys],
                ['Port', serverInfo.portForNewAccessKeys],
                ['Created', formatDate(serverInfo.createdTimestampMs)],
                ['Uptime', formatUptime(serverInfo.createdTimestampMs)],
                ['Cipher', serverInfo.cipher],
                ['Server ID', serverInfo.serverId],
              ].map(([label, value]) =>
                value !== null && value !== undefined ? (
                  <div key={label} className="flex items-start justify-between gap-3">
                    <dt className="shrink-0 text-zinc-400">{label}</dt>
                    <dd className="truncate text-right font-mono text-zinc-800 dark:text-zinc-200">{value}</dd>
                  </div>
                ) : null
              )}
              <div className="flex items-center justify-between gap-3">
                <dt className="shrink-0 text-sm text-zinc-400">Default Limit</dt>
                <dd className="text-right">
                  {isEditingServerLimit ? (
                    <input
                      ref={serverLimitInputRef}
                      value={serverLimitValue}
                      onChange={(e) => setServerLimitValue(e.target.value)}
                      onBlur={commitServerLimit}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitServerLimit();
                        if (e.key === 'Escape') setIsEditingServerLimit(false);
                      }}
                      placeholder="e.g. 100GB"
                      className="w-28 rounded-md border border-zinc-300 bg-transparent px-2 py-0.5 text-right font-mono text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-600 dark:text-zinc-50"
                    />
                  ) : (
                    <button
                      onClick={startEditServerLimit}
                      title="Click to set default limit (leave empty to remove)"
                      className="group flex items-center gap-1 font-mono text-sm text-cyan-600 transition hover:text-cyan-500 dark:text-cyan-400 dark:hover:text-cyan-300"
                    >
                      {serverInfo.defaultLimitBytes
                        ? formatBytes(serverInfo.defaultLimitBytes)
                        : <span className="text-zinc-300 dark:text-zinc-600">None</span>}
                      <span className="opacity-0 text-xs text-zinc-400 transition group-hover:opacity-100">✎</span>
                    </button>
                  )}
                </dd>
              </div>
            </dl>
          </div>

          {/* Traffic Breakdown */}
          <div className="rounded-xl border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900/50">
            <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-zinc-400">Traffic Breakdown</h2>
            {activeKeys.length === 0 ? (
              <p className="text-sm text-zinc-400">No traffic recorded yet.</p>
            ) : (
              <div className="space-y-4">
                {activeKeys.slice(0, 6).map((key, i) => (
                  <div key={key.id}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-1.5 truncate font-mono text-zinc-800 dark:text-zinc-200">
                        {i === 0 && <span className="text-amber-500">★</span>}
                        {key.name || 'Untitled'}
                      </span>
                      <span className="ml-2 shrink-0 font-mono text-xs text-zinc-400">{key.trafficShare}%</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                      <div className="h-full rounded-full bg-cyan-500" style={{ width: `${key.trafficShare}%` }} />
                    </div>
                    <p className="mt-0.5 text-right font-mono text-xs text-zinc-400">{formatBytes(key.usedBytes)}</p>
                  </div>
                ))}
                {activeKeys.length > 6 && (
                  <p className="text-xs text-zinc-400">+{activeKeys.length - 6} more active keys</p>
                )}
              </div>
            )}
          </div>

          {/* Add Key */}
          <div className="rounded-xl border border-black/10 bg-white p-5 dark:border-white/10 dark:bg-zinc-900/50">
            <h2 className="mb-4 text-xs font-medium uppercase tracking-wider text-zinc-400">Add New Key</h2>
            <form onSubmit={handleAddKey} className="flex flex-col gap-3">
              <input
                type="text"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="Key name"
                maxLength={100}
                className="h-11 w-full rounded-full border border-black/10 bg-transparent px-4 text-sm text-black transition focus:border-zinc-400 focus:outline-none dark:border-white/15 dark:text-white dark:focus:border-zinc-500"
              />
              <button
                type="submit"
                disabled={isAdding || !newKeyName.trim()}
                className="h-11 w-full rounded-full bg-black text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                {isAdding ? 'Adding…' : 'Add Key'}
              </button>
            </form>
            {serverInfo.defaultLimitBytes && (
              <p className="mt-4 text-xs text-zinc-400">
                New keys inherit server default:{' '}
                <span className="font-mono text-zinc-600 dark:text-zinc-300">
                  {formatBytes(serverInfo.defaultLimitBytes)}
                </span>
              </p>
            )}
          </div>
        </div>

        {/* Keys Table */}
        <div className="overflow-x-auto rounded-xl border border-black/10 bg-white dark:border-white/10 dark:bg-zinc-900/50">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-black/10 dark:border-white/10">
              <tr>
                {/* Name is sortable */}
                <SortHeader label="Name / ID" field="name" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                {/* Data Used is sortable */}
                <SortHeader label="Data Used" field="usedBytes" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                {/* Limit — not sortable, just a header */}
                <th className="whitespace-nowrap px-5 py-4 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Limit</th>
                {/* Traffic Share is sortable */}
                <SortHeader label="Traffic Share" field="trafficShare" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                {/* Experimental columns — only if available */}
                {hasExperimental && (
                  <SortHeader label="Last Active" field="lastTrafficSeen" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                )}
                {hasExperimental && (
                  <SortHeader label="Devices" field="peakDeviceCount" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                )}
                <th className="whitespace-nowrap px-5 py-4 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Key</th>
                <th className="whitespace-nowrap px-5 py-4 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/10 dark:divide-white/10">
              {keys.length === 0 ? (
                <tr>
                  <td colSpan={hasExperimental ? 8 : 6} className="px-5 py-12 text-center text-zinc-400">
                    No access keys yet. Add one above.
                  </td>
                </tr>
              ) : (
                keys.map((key, i) => {
                  // "Top" badge based on original sort position (highest data user)
                  const isTop = key.id === initialKeys[0]?.id && key.usedBytes > 0;
                  const neverUsed = key.usedBytes === 0;
                  const isRenaming = renamingId === key.id;
                  const isEditingLimit = limitEditId === key.id;
                  const lastSeen = formatLastSeen(key.lastTrafficSeen);

                  return (
                    <tr key={key.id} className="transition-colors hover:bg-zinc-50 dark:hover:bg-white/[0.03]">

                      {/* Name + ID */}
                      <td className="px-5 py-4">
                        <div className="flex flex-col gap-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {isRenaming ? (
                              <input
                                ref={renameInputRef}
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                onBlur={() => commitRename(key)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') commitRename(key);
                                  if (e.key === 'Escape') setRenamingId(null);
                                }}
                                maxLength={100}
                                className="rounded-md border border-zinc-300 bg-transparent px-2 py-0.5 font-mono text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-600 dark:text-zinc-50"
                              />
                            ) : (
                              <button
                                onClick={() => startRename(key)}
                                title="Click to rename"
                                className="group flex items-center gap-1 font-mono font-medium text-cyan-600 transition hover:text-cyan-500 dark:text-cyan-400 dark:hover:text-cyan-300"
                              >
                                {key.name || 'Untitled'}
                                <span className="opacity-0 text-xs text-zinc-400 transition group-hover:opacity-100">✎</span>
                              </button>
                            )}
                            {isTop && <Badge color="amber">★ Top</Badge>}
                            {neverUsed && <Badge color="zinc">Unused</Badge>}
                            {key.isOverLimit && <Badge color="red">Over limit</Badge>}
                          </div>
                          <span className="font-mono text-xs text-zinc-400">#{key.id}</span>
                        </div>
                      </td>

                      {/* Data Used */}
                      <td className="px-5 py-4">
                        <span className="font-mono text-zinc-900 dark:text-zinc-100">{formatBytes(key.usedBytes)}</span>
                        {key.limitBytes && (
                          <>
                            <UsageBar used={key.usedBytes} limit={key.limitBytes} />
                            <span className="mt-0.5 block font-mono text-xs text-zinc-400">
                              {key.usedPct !== null ? `${key.usedPct.toFixed(0)}%` : ''}
                            </span>
                          </>
                        )}
                      </td>

                      {/* Per-key Limit */}
                      <td className="px-5 py-4 font-mono text-sm">
                        {isEditingLimit ? (
                          <input
                            ref={limitInputRef}
                            value={limitEditValue}
                            onChange={(e) => setLimitEditValue(e.target.value)}
                            onBlur={() => commitLimit(key)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitLimit(key);
                              if (e.key === 'Escape') setLimitEditId(null);
                            }}
                            placeholder="e.g. 10GB"
                            className="w-24 rounded-md border border-zinc-300 bg-transparent px-2 py-0.5 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none dark:border-zinc-600 dark:text-zinc-50"
                          />
                        ) : (
                          <button
                            onClick={() => startLimitEdit(key)}
                            title="Click to set limit (leave empty to remove)"
                            className="group flex items-center gap-1 text-cyan-600 transition hover:text-cyan-500 dark:text-cyan-400 dark:hover:text-cyan-300"
                          >
                            {key.limitBytes
                              ? <span className="text-zinc-600 dark:text-zinc-400">{formatBytes(key.limitBytes)}</span>
                              : <span className="text-zinc-300 dark:text-zinc-600">—</span>}
                            <span className="opacity-0 text-xs text-zinc-400 transition group-hover:opacity-100">✎</span>
                          </button>
                        )}
                      </td>

                      {/* Traffic Share */}
                      <td className="px-5 py-4 font-mono text-sm">
                        {key.usedBytes > 0 ? (
                          <div>
                            <span className="text-zinc-700 dark:text-zinc-300">{key.trafficShare}%</span>
                            <div className="mt-1 h-1 w-16 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                              <div className="h-full rounded-full bg-cyan-500" style={{ width: `${key.trafficShare}%` }} />
                            </div>
                          </div>
                        ) : <span className="text-zinc-300 dark:text-zinc-600">—</span>}
                      </td>

                      {/* Last Active */}
                      {hasExperimental && (
                        <td className="px-5 py-4 text-xs">
                          {lastSeen
                            ? <span className="font-mono text-zinc-600 dark:text-zinc-400">{lastSeen}</span>
                            : <span className="text-zinc-300 dark:text-zinc-600">—</span>}
                        </td>
                      )}

                      {/* Peak Devices */}
                      {hasExperimental && (
                        <td className="px-5 py-4 text-xs font-mono">
                          {key.peakDeviceCount != null
                            ? <span className="text-zinc-600 dark:text-zinc-400">{key.peakDeviceCount}</span>
                            : <span className="text-zinc-300 dark:text-zinc-600">—</span>}
                        </td>
                      )}

                      {/* Key — Copy + QR */}
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => copyToClipboard(key.accessUrl)}
                            className="rounded-full bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-600 transition hover:bg-cyan-500/20 dark:text-cyan-400"
                          >
                            Copy
                          </button>
                          <button
                            onClick={() => setQrKey(key)}
                            className="rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-600 transition hover:bg-zinc-200 dark:bg-white/5 dark:text-zinc-400 dark:hover:bg-white/10"
                          >
                            QR
                          </button>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="px-5 py-4">
                        <button
                          onClick={() => setDeleteTarget(key)}
                          className="rounded-full bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-500/20 dark:text-red-400"
                        >
                          Delete
                        </button>
                      </td>

                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <p className="text-center text-xs text-zinc-400">
          Usage is cumulative since server creation · Click any column header to sort · Click any name or limit to edit
          {hasExperimental && ' · Last Active and Devices from last 24h'}
        </p>

      </main>
    </div>
  );
}