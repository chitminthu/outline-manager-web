//pages/index.js
import { useState, useCallback } from 'react';
import { useRouter } from 'next/router';
import { Geist, Geist_Mono } from 'next/font/google';
import toast from 'react-hot-toast';
import { outlineApi } from '../lib/outlineClient';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

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
    <div className={`flex flex-col gap-1 rounded-xl border bg-white p-5 dark:bg-zinc-900/50 ${accent ? 'border-red-500/30 dark:border-red-500/30' : 'border-black/10 dark:border-white/10'}`}>
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
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="rounded-full px-5 py-2 text-sm font-medium text-zinc-300 transition hover:bg-white/10 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="rounded-full bg-red-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-50"
          >
            {isDeleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

export async function getServerSideProps() {
  const apiUrl = process.env.OUTLINE_API_URL;
  if (!apiUrl) {
    return { props: { keys: [], serverInfo: {}, isMetricsEnabled: false } };
  }

  try {
    const [keysRes, metricsRes, serverRes, metricsEnabledRes] = await Promise.all([
      outlineApi.get('/access-keys/'),
      outlineApi.get('/metrics/transfer'),
      outlineApi.get('/server'),
      outlineApi.get('/metrics/enabled'),
    ]);

    const rawKeys = keysRes.data.accessKeys || [];
    const transferMetrics = metricsRes.data.bytesTransferredByUserId || {};
    const serverInfo = serverRes.data || {};
    const isMetricsEnabled = metricsEnabledRes.data.metricsEnabled || false;

    const totalUsageBytes = Object.values(transferMetrics).reduce((s, b) => s + b, 0);

    const keys = rawKeys
      .map((key) => {
        const usedBytes = transferMetrics[key.id] || 0;
        const limitBytes = key.dataLimit?.bytes || null;
        const usedPct = limitBytes ? Math.min((usedBytes / limitBytes) * 100, 100) : null;
        const trafficShare = totalUsageBytes > 0
          ? ((usedBytes / totalUsageBytes) * 100).toFixed(1)
          : '0.0';
        const isOverLimit = limitBytes ? usedBytes >= limitBytes : false;
        return {
          id: key.id,
          name: key.name || '',
          port: key.port || null,
          method: key.method || null,
          accessUrl: key.accessUrl || '',
          usedBytes,
          limitBytes,
          usedPct,
          trafficShare,
          isOverLimit,
        };
      })
      .sort((a, b) => b.usedBytes - a.usedBytes);

    const activeKeys = keys.filter((k) => k.usedBytes > 0).length;
    const unusedKeys = keys.filter((k) => k.usedBytes === 0).length;
    const keysOverLimit = keys.filter((k) => k.isOverLimit).length;
    const avgUsageBytes = activeKeys > 0 ? Math.floor(totalUsageBytes / activeKeys) : 0;
    const defaultLimitBytes = serverInfo.accessKeyDataLimit?.bytes || null;

    return {
      props: {
        keys,
        serverInfo: {
          name: serverInfo.name || null,
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
      },
    };
  } catch {
    return {
      props: {
        keys: [],
        serverInfo: {},
        isMetricsEnabled: false,
        error: 'Could not connect to the Outline server.',
      },
    };
  }
}

export default function Home({ keys, serverInfo, isMetricsEnabled, error }) {
  const router = useRouter();
  const [newKeyName, setNewKeyName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const refresh = useCallback(() => router.replace(router.asPath), [router]);

  const handleAddKey = async (e) => {
    e.preventDefault();
    if (!newKeyName.trim()) return;
    setIsAdding(true);
    try {
      const res = await fetch('/api/addKey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName.trim() }),
      });
      if (!res.ok) throw new Error();
      toast.success('Key added successfully');
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
        body: JSON.stringify({ id: deleteTarget.id }),
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

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied to clipboard');
    } catch {
      toast.error('Failed to copy');
    }
  };

  const activeKeys = keys.filter((k) => k.usedBytes > 0);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-900 text-white">
        <div className="text-center">
          <p className="text-4xl">⚠️</p>
          <h1 className="mt-4 text-2xl font-bold text-red-400">Connection Error</h1>
          <p className="mt-2 text-zinc-400">{error}</p>
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

      <main className="flex w-full max-w-6xl flex-col gap-10 px-4 py-16 sm:px-8">

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-black dark:text-white">
              Outline Dashboard
            </h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              {serverInfo.name || 'Outline Server'}
              {serverInfo.version && ` · v${serverInfo.version}`}
              {serverInfo.createdTimestampMs && ` · Up ${formatUptime(serverInfo.createdTimestampMs)}`}
            </p>
          </div>
          <span className={`mt-1 rounded-full px-3 py-1 text-xs font-medium ${isMetricsEnabled ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'}`}>
            {isMetricsEnabled ? '● Metrics On' : '○ Metrics Off'}
          </span>
        </div>

        {!isMetricsEnabled && (
          <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 px-5 py-4 text-sm text-yellow-700 dark:text-yellow-400">
            Metrics are disabled. Enable them in Outline Manager to track data usage accurately.
          </div>
        )}

        {/* Summary Stats */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            label="Total Keys"
            value={keys.length}
            sub={`${serverInfo.unusedKeys ?? 0} never used`}
          />
          <StatCard
            label="Active Keys"
            value={serverInfo.activeKeys ?? 0}
            sub="used at least once"
          />
          <StatCard
            label="Total Usage"
            value={formatBytes(serverInfo.totalUsage)}
            sub={`avg ${formatBytes(serverInfo.avgUsageBytes)} / active key`}
          />
          <StatCard
            label="Over Limit"
            value={serverInfo.keysOverLimit ?? 0}
            sub={serverInfo.keysOverLimit > 0 ? 'keys at capacity' : 'all within limit'}
            accent={serverInfo.keysOverLimit > 0}
          />
        </div>

        {/* Server Info + Traffic Breakdown + Add Key */}
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
                ['Default Limit', serverInfo.defaultLimitBytes ? formatBytes(serverInfo.defaultLimitBytes) : 'None'],
                ['Server ID', serverInfo.serverId],
              ].map(([label, value]) =>
                value !== null && value !== undefined ? (
                  <div key={label} className="flex items-start justify-between gap-3">
                    <dt className="shrink-0 text-zinc-400">{label}</dt>
                    <dd className="truncate text-right font-mono text-zinc-800 dark:text-zinc-200">{value}</dd>
                  </div>
                ) : null
              )}
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
                {['Name / ID', 'Cipher · Port', 'Data Used', 'Limit', 'Traffic Share', 'Access Key', 'Actions'].map((h) => (
                  <th key={h} className="whitespace-nowrap px-5 py-4 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-black/10 dark:divide-white/10">
              {keys.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-zinc-400">
                    No access keys yet. Add one above.
                  </td>
                </tr>
              ) : (
                keys.map((key, i) => {
                  const isTop = i === 0 && key.usedBytes > 0;
                  const neverUsed = key.usedBytes === 0;
                  return (
                    <tr key={key.id} className="transition-colors hover:bg-zinc-50 dark:hover:bg-white/[0.03]">

                      {/* Name + ID */}
                      <td className="px-5 py-4">
                        <div className="flex flex-col gap-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono font-medium text-zinc-900 dark:text-zinc-50">
                              {key.name || 'Untitled'}
                            </span>
                            {isTop && <Badge color="amber">★ Top</Badge>}
                            {neverUsed && <Badge color="zinc">Unused</Badge>}
                            {key.isOverLimit && <Badge color="red">Over limit</Badge>}
                          </div>
                          <span className="font-mono text-xs text-zinc-400">#{key.id}</span>
                        </div>
                      </td>

                      {/* Method + Port */}
                      <td className="px-5 py-4 font-mono text-xs">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-zinc-700 dark:text-zinc-300">{key.method || '—'}</span>
                          {key.port && <span className="text-zinc-400">:{key.port}</span>}
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

                      {/* Limit */}
                      <td className="px-5 py-4 font-mono text-sm">
                        {key.limitBytes
                          ? <span className="text-zinc-600 dark:text-zinc-400">{formatBytes(key.limitBytes)}</span>
                          : <span className="text-zinc-300 dark:text-zinc-600">—</span>}
                      </td>

                      {/* Traffic Share */}
                      <td className="px-5 py-4 font-mono text-sm">
                        {key.usedBytes > 0
                          ? (
                            <div>
                              <span className="text-zinc-700 dark:text-zinc-300">{key.trafficShare}%</span>
                              <div className="mt-1 h-1 w-16 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                                <div className="h-full rounded-full bg-cyan-500" style={{ width: `${key.trafficShare}%` }} />
                              </div>
                            </div>
                          )
                          : <span className="text-zinc-300 dark:text-zinc-600">—</span>}
                      </td>

                      {/* Access Key */}
                      <td className="px-5 py-4">
                        <button
                          onClick={() => copyToClipboard(key.accessUrl)}
                          className="rounded-full bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-600 transition hover:bg-cyan-500/20 dark:text-cyan-400"
                        >
                          Copy Key
                        </button>
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
          Usage is cumulative since server creation · Sorted by data used (highest first)
        </p>

      </main>
    </div>
  );
}