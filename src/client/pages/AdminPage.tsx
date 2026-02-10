import { useState, useEffect, useCallback } from 'react';
import {
  listDevices,
  approveDevice,
  approveAllDevices,
  restartGateway,
  getStorageStatus,
  triggerSync,
  listFiles,
  readFile,
  writeFile,
  createDirectory,
  deleteFile,
  AuthError,
  type PendingDevice,
  type PairedDevice,
  type DeviceListResponse,
  type StorageStatusResponse,
  type FileEntry,
} from '../api';
import './AdminPage.css';

// Small inline spinner for buttons
function ButtonSpinner() {
  return <span className="btn-spinner" />;
}

function formatSyncTime(isoString: string | null) {
  if (!isoString) return 'Never';
  try {
    const date = new Date(isoString);
    return date.toLocaleString();
  } catch {
    return isoString;
  }
}

function formatTimestamp(ts: number) {
  const date = new Date(ts);
  return date.toLocaleString();
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTimeAgo(ts: number) {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function AdminPage() {
  const [pending, setPending] = useState<PendingDevice[]>([]);
  const [paired, setPaired] = useState<PairedDevice[]>([]);
  const [storageStatus, setStorageStatus] = useState<StorageStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [restartInProgress, setRestartInProgress] = useState(false);
  const [syncInProgress, setSyncInProgress] = useState(false);

  // File browser state
  const WORKSPACE_ROOT = '/root/clawd';
  const [fileBrowserPath, setFileBrowserPath] = useState(WORKSPACE_ROOT);
  const [fileEntries, setFileEntries] = useState<FileEntry[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<{ path: string; content: string } | null>(null);
  const [editingFile, setEditingFile] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [fileSaving, setFileSaving] = useState(false);
  const [showNewFileDialog, setShowNewFileDialog] = useState(false);
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [newItemName, setNewItemName] = useState('');

  const fetchDevices = useCallback(async () => {
    try {
      setError(null);
      const data: DeviceListResponse = await listDevices();
      setPending(data.pending || []);
      setPaired(data.paired || []);

      if (data.error) {
        setError(data.error);
      } else if (data.parseError) {
        setError(`Parse error: ${data.parseError}`);
      }
    } catch (err) {
      if (err instanceof AuthError) {
        setError('Authentication required. Please log in via Cloudflare Access.');
      } else {
        setError(err instanceof Error ? err.message : 'Failed to fetch devices');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStorageStatus = useCallback(async () => {
    try {
      const status = await getStorageStatus();
      setStorageStatus(status);
    } catch (err) {
      // Don't show error for storage status - it's not critical
      console.error('Failed to fetch storage status:', err);
    }
  }, []);

  useEffect(() => {
    fetchDevices();
    fetchStorageStatus();
  }, [fetchDevices, fetchStorageStatus]);

  const handleApprove = async (requestId: string) => {
    setActionInProgress(requestId);
    try {
      const result = await approveDevice(requestId);
      if (result.success) {
        // Refresh the list
        await fetchDevices();
      } else {
        setError(result.error || 'Approval failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve device');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleApproveAll = async () => {
    if (pending.length === 0) return;

    setActionInProgress('all');
    try {
      const result = await approveAllDevices();
      if (result.failed && result.failed.length > 0) {
        setError(`Failed to approve ${result.failed.length} device(s)`);
      }
      // Refresh the list
      await fetchDevices();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve devices');
    } finally {
      setActionInProgress(null);
    }
  };

  const handleRestartGateway = async () => {
    if (
      !confirm(
        'Are you sure you want to restart the gateway? This will disconnect all clients temporarily.',
      )
    ) {
      return;
    }

    setRestartInProgress(true);
    try {
      const result = await restartGateway();
      if (result.success) {
        setError(null);
        // Show success message briefly
        alert('Gateway restart initiated. Clients will reconnect automatically.');
      } else {
        setError(result.error || 'Failed to restart gateway');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restart gateway');
    } finally {
      setRestartInProgress(false);
    }
  };

  const handleSync = async () => {
    setSyncInProgress(true);
    try {
      const result = await triggerSync();
      if (result.success) {
        // Update the storage status with new lastSync time
        setStorageStatus((prev) => (prev ? { ...prev, lastSync: result.lastSync || null } : null));
        setError(null);
      } else {
        setError(result.error || 'Sync failed');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sync');
    } finally {
      setSyncInProgress(false);
    }
  };

  // File browser handlers
  const fetchFiles = useCallback(async (path?: string) => {
    const targetPath = path || fileBrowserPath;
    setFilesLoading(true);
    try {
      const data = await listFiles(targetPath);
      setFileEntries(data.entries || []);
      setFileBrowserPath(targetPath);
      setSelectedFile(null);
      setEditingFile(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to list files');
    } finally {
      setFilesLoading(false);
    }
  }, [fileBrowserPath]);

  const handleFileClick = async (entry: FileEntry) => {
    const fullPath = `${fileBrowserPath}/${entry.name}`.replace(/\/+/g, '/');
    if (entry.type === 'dir') {
      fetchFiles(fullPath);
    } else {
      try {
        const data = await readFile(fullPath);
        setSelectedFile({ path: fullPath, content: data.content });
        setEditingFile(false);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to read file');
      }
    }
  };

  const handleNavigateUp = () => {
    if (fileBrowserPath === WORKSPACE_ROOT) return;
    const parent = fileBrowserPath.substring(0, fileBrowserPath.lastIndexOf('/')) || WORKSPACE_ROOT;
    fetchFiles(parent.startsWith(WORKSPACE_ROOT) ? parent : WORKSPACE_ROOT);
  };

  const handleBreadcrumbClick = (index: number) => {
    const relativePath = fileBrowserPath.replace(WORKSPACE_ROOT, '');
    const parts = relativePath.split('/').filter(Boolean);
    const targetPath = WORKSPACE_ROOT + '/' + parts.slice(0, index).join('/');
    fetchFiles(targetPath.replace(/\/+$/, '') || WORKSPACE_ROOT);
  };

  const handleSaveFile = async () => {
    if (!selectedFile) return;
    setFileSaving(true);
    try {
      await writeFile(selectedFile.path, editContent);
      setSelectedFile({ ...selectedFile, content: editContent });
      setEditingFile(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save file');
    } finally {
      setFileSaving(false);
    }
  };

  const handleCreateFile = async () => {
    if (!newItemName.trim()) return;
    const fullPath = `${fileBrowserPath}/${newItemName.trim()}`.replace(/\/+/g, '/');
    try {
      await writeFile(fullPath, '');
      setShowNewFileDialog(false);
      setNewItemName('');
      fetchFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create file');
    }
  };

  const handleCreateFolder = async () => {
    if (!newItemName.trim()) return;
    const fullPath = `${fileBrowserPath}/${newItemName.trim()}`.replace(/\/+/g, '/');
    try {
      await createDirectory(fullPath);
      setShowNewFolderDialog(false);
      setNewItemName('');
      fetchFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create folder');
    }
  };

  const handleDeleteFile = async (entry: FileEntry) => {
    const fullPath = `${fileBrowserPath}/${entry.name}`.replace(/\/+/g, '/');
    if (!confirm(`Delete "${entry.name}"? This cannot be undone.`)) return;
    try {
      await deleteFile(fullPath);
      if (selectedFile?.path === fullPath) setSelectedFile(null);
      fetchFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  // Load files on mount
  useEffect(() => {
    fetchFiles();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="devices-page">
      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="dismiss-btn">
            Dismiss
          </button>
        </div>
      )}

      {storageStatus && !storageStatus.configured && (
        <div className="warning-banner">
          <div className="warning-content">
            <strong>R2 Storage Not Configured</strong>
            <p>
              Paired devices and conversations will be lost when the container restarts. To enable
              persistent storage, configure R2 credentials. See the{' '}
              <a
                href="https://github.com/cloudflare/moltworker"
                target="_blank"
                rel="noopener noreferrer"
              >
                README
              </a>{' '}
              for setup instructions.
            </p>
            {storageStatus.missing && (
              <p className="missing-secrets">Missing: {storageStatus.missing.join(', ')}</p>
            )}
          </div>
        </div>
      )}

      {storageStatus?.configured && (
        <div className="success-banner">
          <div className="storage-status">
            <div className="storage-info">
              <span>
                R2 storage is configured. Your data will persist across container restarts.
              </span>
              <span className="last-sync">
                Last backup: {formatSyncTime(storageStatus.lastSync)}
              </span>
            </div>
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleSync}
              disabled={syncInProgress}
            >
              {syncInProgress && <ButtonSpinner />}
              {syncInProgress ? 'Syncing...' : 'Backup Now'}
            </button>
          </div>
        </div>
      )}

      <section className="devices-section gateway-section">
        <div className="section-header">
          <h2>Gateway Controls</h2>
          <button
            className="btn btn-danger"
            onClick={handleRestartGateway}
            disabled={restartInProgress}
          >
            {restartInProgress && <ButtonSpinner />}
            {restartInProgress ? 'Restarting...' : 'Restart Gateway'}
          </button>
        </div>
        <p className="hint">
          Restart the gateway to apply configuration changes or recover from errors. All connected
          clients will be temporarily disconnected.
        </p>
      </section>

      {loading ? (
        <div className="loading">
          <div className="spinner"></div>
          <p>Loading devices...</p>
        </div>
      ) : (
        <>
          <section className="devices-section">
            <div className="section-header">
              <h2>Pending Pairing Requests</h2>
              <div className="header-actions">
                {pending.length > 0 && (
                  <button
                    className="btn btn-primary"
                    onClick={handleApproveAll}
                    disabled={actionInProgress !== null}
                  >
                    {actionInProgress === 'all' && <ButtonSpinner />}
                    {actionInProgress === 'all'
                      ? 'Approving...'
                      : `Approve All (${pending.length})`}
                  </button>
                )}
                <button className="btn btn-secondary" onClick={fetchDevices} disabled={loading}>
                  Refresh
                </button>
              </div>
            </div>

            {pending.length === 0 ? (
              <div className="empty-state">
                <p>No pending pairing requests</p>
                <p className="hint">
                  Devices will appear here when they attempt to connect without being paired.
                </p>
              </div>
            ) : (
              <div className="devices-grid">
                {pending.map((device) => (
                  <div key={device.requestId} className="device-card pending">
                    <div className="device-header">
                      <span className="device-name">
                        {device.displayName || device.deviceId || 'Unknown Device'}
                      </span>
                      <span className="device-badge pending">Pending</span>
                    </div>
                    <div className="device-details">
                      {device.platform && (
                        <div className="detail-row">
                          <span className="label">Platform:</span>
                          <span className="value">{device.platform}</span>
                        </div>
                      )}
                      {device.clientId && (
                        <div className="detail-row">
                          <span className="label">Client:</span>
                          <span className="value">{device.clientId}</span>
                        </div>
                      )}
                      {device.clientMode && (
                        <div className="detail-row">
                          <span className="label">Mode:</span>
                          <span className="value">{device.clientMode}</span>
                        </div>
                      )}
                      {device.role && (
                        <div className="detail-row">
                          <span className="label">Role:</span>
                          <span className="value">{device.role}</span>
                        </div>
                      )}
                      {device.remoteIp && (
                        <div className="detail-row">
                          <span className="label">IP:</span>
                          <span className="value">{device.remoteIp}</span>
                        </div>
                      )}
                      <div className="detail-row">
                        <span className="label">Requested:</span>
                        <span className="value" title={formatTimestamp(device.ts)}>
                          {formatTimeAgo(device.ts)}
                        </span>
                      </div>
                    </div>
                    <div className="device-actions">
                      <button
                        className="btn btn-success"
                        onClick={() => handleApprove(device.requestId)}
                        disabled={actionInProgress !== null}
                      >
                        {actionInProgress === device.requestId && <ButtonSpinner />}
                        {actionInProgress === device.requestId ? 'Approving...' : 'Approve'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="devices-section">
            <div className="section-header">
              <h2>Paired Devices</h2>
            </div>

            {paired.length === 0 ? (
              <div className="empty-state">
                <p>No paired devices</p>
              </div>
            ) : (
              <div className="devices-grid">
                {paired.map((device, index) => (
                  <div key={device.deviceId || index} className="device-card paired">
                    <div className="device-header">
                      <span className="device-name">
                        {device.displayName || device.deviceId || 'Unknown Device'}
                      </span>
                      <span className="device-badge paired">Paired</span>
                    </div>
                    <div className="device-details">
                      {device.platform && (
                        <div className="detail-row">
                          <span className="label">Platform:</span>
                          <span className="value">{device.platform}</span>
                        </div>
                      )}
                      {device.clientId && (
                        <div className="detail-row">
                          <span className="label">Client:</span>
                          <span className="value">{device.clientId}</span>
                        </div>
                      )}
                      {device.clientMode && (
                        <div className="detail-row">
                          <span className="label">Mode:</span>
                          <span className="value">{device.clientMode}</span>
                        </div>
                      )}
                      {device.role && (
                        <div className="detail-row">
                          <span className="label">Role:</span>
                          <span className="value">{device.role}</span>
                        </div>
                      )}
                      <div className="detail-row">
                        <span className="label">Paired:</span>
                        <span className="value" title={formatTimestamp(device.approvedAtMs)}>
                          {formatTimeAgo(device.approvedAtMs)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* File Browser Section */}
      <section className="devices-section files-section">
        <div className="section-header">
          <h2>Workspace Files</h2>
          <div className="header-actions">
            <button className="btn btn-secondary btn-sm" onClick={() => { setShowNewFileDialog(true); setNewItemName(''); }}>
              + File
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => { setShowNewFolderDialog(true); setNewItemName(''); }}>
              + Folder
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => fetchFiles()} disabled={filesLoading}>
              Refresh
            </button>
          </div>
        </div>

        {/* Breadcrumb */}
        <div className="files-breadcrumb">
          <button className="breadcrumb-item" onClick={() => fetchFiles(WORKSPACE_ROOT)}>
            workspace
          </button>
          {fileBrowserPath.replace(WORKSPACE_ROOT, '').split('/').filter(Boolean).map((part, i) => (
            <span key={i}>
              <span className="breadcrumb-sep">/</span>
              <button className="breadcrumb-item" onClick={() => handleBreadcrumbClick(i + 1)}>
                {part}
              </button>
            </span>
          ))}
        </div>

        {/* New file/folder dialog */}
        {(showNewFileDialog || showNewFolderDialog) && (
          <div className="new-item-dialog">
            <input
              type="text"
              className="new-item-input"
              placeholder={showNewFileDialog ? 'filename.md' : 'folder-name'}
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') showNewFileDialog ? handleCreateFile() : handleCreateFolder();
                if (e.key === 'Escape') { setShowNewFileDialog(false); setShowNewFolderDialog(false); }
              }}
              autoFocus
            />
            <button className="btn btn-success btn-sm" onClick={showNewFileDialog ? handleCreateFile : handleCreateFolder}>
              Create
            </button>
            <button className="btn btn-secondary btn-sm" onClick={() => { setShowNewFileDialog(false); setShowNewFolderDialog(false); }}>
              Cancel
            </button>
          </div>
        )}

        {/* File list */}
        {filesLoading ? (
          <div className="loading" style={{ minHeight: '100px' }}>
            <div className="spinner" />
          </div>
        ) : (
          <div className="files-list">
            {fileBrowserPath !== WORKSPACE_ROOT && (
              <div className="file-row" onClick={handleNavigateUp}>
                <span className="file-icon">&#128194;</span>
                <span className="file-name">..</span>
                <span className="file-size"></span>
                <span className="file-actions"></span>
              </div>
            )}
            {fileEntries
              .sort((a, b) => {
                if (a.type === 'dir' && b.type !== 'dir') return -1;
                if (a.type !== 'dir' && b.type === 'dir') return 1;
                return a.name.localeCompare(b.name);
              })
              .map((entry) => (
              <div
                key={entry.name}
                className={`file-row ${selectedFile?.path === `${fileBrowserPath}/${entry.name}` ? 'selected' : ''}`}
                onClick={() => handleFileClick(entry)}
              >
                <span className="file-icon">{entry.type === 'dir' ? '\uD83D\uDCC1' : '\uD83D\uDCC4'}</span>
                <span className="file-name">{entry.name}</span>
                <span className="file-size">{entry.type === 'file' ? formatFileSize(entry.size) : ''}</span>
                <span className="file-actions" onClick={(e) => e.stopPropagation()}>
                  <button className="btn-icon btn-delete" onClick={() => handleDeleteFile(entry)} title="Delete">
                    &#x2715;
                  </button>
                </span>
              </div>
            ))}
            {fileEntries.length === 0 && fileBrowserPath === WORKSPACE_ROOT && (
              <div className="empty-state" style={{ padding: '1.5rem' }}>
                <p>Workspace is empty</p>
              </div>
            )}
          </div>
        )}

        {/* File viewer/editor */}
        {selectedFile && (
          <div className="file-viewer">
            <div className="file-viewer-header">
              <span className="file-viewer-path">{selectedFile.path.replace(WORKSPACE_ROOT + '/', '')}</span>
              <div className="header-actions">
                {editingFile ? (
                  <>
                    <button className="btn btn-success btn-sm" onClick={handleSaveFile} disabled={fileSaving}>
                      {fileSaving && <ButtonSpinner />}
                      {fileSaving ? 'Saving...' : 'Save'}
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setEditingFile(false)}>
                      Cancel
                    </button>
                  </>
                ) : (
                  <button className="btn btn-primary btn-sm" onClick={() => { setEditContent(selectedFile.content); setEditingFile(true); }}>
                    Edit
                  </button>
                )}
                <button className="btn btn-secondary btn-sm" onClick={() => setSelectedFile(null)}>
                  Close
                </button>
              </div>
            </div>
            {editingFile ? (
              <textarea
                className="file-editor"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                spellCheck={false}
              />
            ) : (
              <pre className="file-content">{selectedFile.content}</pre>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
