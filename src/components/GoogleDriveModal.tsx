import React, { useState, useEffect } from 'react';
import { StorageStatus, DriveFileItem, Transaction, Member, AppSettings } from '../types';
import { Cloud, CheckCircle2, RefreshCw, X, FileSpreadsheet, Download, Upload, LogOut, ExternalLink, ShieldCheck, HardDrive } from 'lucide-react';

interface GoogleDriveModalProps {
  isOpen: boolean;
  onClose: () => void;
  storageStatus: StorageStatus;
  transactions: Transaction[];
  members: Member[];
  settings: AppSettings;
  onDataLoaded: (data: { members: Member[]; transactions: Transaction[]; settings: AppSettings }) => void;
  onStatusUpdate: () => void;
  showToast: (msg: string) => void;
}

export const GoogleDriveModal: React.FC<GoogleDriveModalProps> = ({
  isOpen,
  onClose,
  storageStatus,
  transactions,
  members,
  settings,
  onDataLoaded,
  onStatusUpdate,
  showToast,
}) => {
  const [loading, setLoading] = useState(false);
  const [syncingSheet, setSyncingSheet] = useState(false);
  const [driveFiles, setDriveFiles] = useState<DriveFileItem[]>([]);
  const [lastSheetUrl, setLastSheetUrl] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && storageStatus.isGoogleConnected) {
      fetchDriveFiles();
    }
  }, [isOpen, storageStatus.isGoogleConnected]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        showToast('Google Account connected successfully!');
        onStatusUpdate();
        fetchDriveFiles();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onStatusUpdate, showToast]);

  if (!isOpen) return null;

  const handleConnectGoogle = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/auth/google/url');
      const data = await res.json();
      if (data.url) {
        // Try opening popup first, fallback to direct redirect if blocked
        const authPopup = window.open(data.url, 'google_oauth_popup', 'width=600,height=700');
        if (!authPopup || authPopup.closed || typeof authPopup.closed === 'undefined') {
          window.location.href = data.url;
        }
      } else {
        showToast('OAuth configuration error: ' + (data.error || 'Unable to generate auth URL'));
      }
    } catch (err) {
      showToast('Error connecting to Google OAuth service');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnectGoogle = async () => {
    try {
      setLoading(true);
      await fetch('/api/auth/google/logout', { method: 'POST' });
      onStatusUpdate();
      showToast('Disconnected from Google Drive');
    } catch (err) {
      showToast('Failed to logout');
    } finally {
      setLoading(false);
    }
  };

  const fetchDriveFiles = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/google/drive/files');
      if (res.ok) {
        const data = await res.json();
        setDriveFiles(data.files || []);
      }
    } catch (err) {
      console.error('Failed to list drive files', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSyncToSheets = async () => {
    try {
      setSyncingSheet(true);
      const res = await fetch('/api/google/drive/sync-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          spreadsheetId: settings.linkedGoogleSheetId,
          sheetTitle: `${settings.organizationName || 'Fallah Behbood Committee'} Ledger`,
          data: { transactions, members, settings },
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setLastSheetUrl(data.webViewLink);
        showToast('Successfully synced data to Google Sheets!');
        onStatusUpdate();
        fetchDriveFiles();
      } else {
        showToast('Failed to sync to Google Sheets: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      showToast('Error during Google Sheets synchronization');
    } finally {
      setSyncingSheet(false);
    }
  };

  const handleSaveJsonBackup = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/google/drive/save-backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: 'Fallah_Behbood_Committee_Ledger_Backup.json',
          data: { transactions, members, settings, exportedAt: new Date().toISOString() },
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        showToast('JSON ledger backup saved directly to Google Drive!');
        fetchDriveFiles();
      } else {
        showToast('Backup error: ' + (data.error || 'Failed to save'));
      }
    } catch (err) {
      showToast('Failed to save JSON backup');
    } finally {
      setLoading(false);
    }
  };

  const handleLoadDriveFile = async (fileId: string) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/google/drive/load-file/${fileId}`);
      const result = await res.json();

      if (res.ok && result.success && result.data) {
        onDataLoaded({
          members: result.data.members || [],
          transactions: result.data.transactions || [],
          settings: result.data.settings || settings,
        });
        showToast(`Loaded ${result.data.transactions?.length || 0} transactions and ${result.data.members?.length || 0} members from Google Drive.`);
        onClose();
      } else {
        showToast('Failed to load file: ' + (result.error || 'Invalid file content'));
      }
    } catch (err) {
      showToast('Error loading file from Google Drive');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-2xl w-full p-6 relative animate-in fade-in zoom-in duration-150">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 border-b border-slate-100 pb-4 mb-5">
          <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-xl">
            <Cloud className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Google Drive & Google Sheets Integration</h2>
            <p className="text-xs text-slate-500">
              Sync your ledger directly to Google Sheets or backup JSON data to Google Drive for secure remote retrieval.
            </p>
          </div>
        </div>

        {/* Auth Status Banner */}
        {!storageStatus.isGoogleConnected ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-center">
            <ShieldCheck className="w-8 h-8 text-amber-600 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-amber-900 mb-1">Connect Your Google Account</h3>
            <p className="text-xs text-amber-700 max-w-md mx-auto mb-4">
              Authorize access to save your Fallah Behbood Committee ledger and member subscriptions safely in Google Drive and Google Sheets.
            </p>
            <button
              onClick={handleConnectGoogle}
              disabled={loading}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white text-xs font-semibold rounded-lg hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50"
            >
              <Cloud className="w-4 h-4" />
              <span>{loading ? 'Connecting...' : 'Authorize Google Account'}</span>
            </button>
          </div>
        ) : (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <p className="text-xs font-semibold text-emerald-900">
                  Connected to Google Account ({storageStatus.googleUserEmail || 'Authorized'})
                </p>
                <p className="text-[11px] text-emerald-700">Ready to sync and restore ledger data</p>
              </div>
            </div>
            <button
              onClick={handleDisconnectGoogle}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs text-rose-700 bg-white border border-rose-200 rounded-lg hover:bg-rose-50"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Disconnect</span>
            </button>
          </div>
        )}

        {/* Actions Section when connected */}
        {storageStatus.isGoogleConnected && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={handleSyncToSheets}
                disabled={syncingSheet}
                className="p-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-left transition-colors flex items-start gap-3 shadow-xs disabled:opacity-50"
              >
                <FileSpreadsheet className="w-5 h-5 mt-0.5 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold mb-0.5">Sync to Google Sheet</h4>
                  <p className="text-[11px] opacity-90">Export ledger, members, dues & summaries into a multi-tab Google Sheet.</p>
                </div>
              </button>

              <button
                onClick={handleSaveJsonBackup}
                disabled={loading}
                className="p-4 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-left transition-colors flex items-start gap-3 shadow-xs disabled:opacity-50"
              >
                <Upload className="w-5 h-5 mt-0.5 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold mb-0.5">Save JSON Backup</h4>
                  <p className="text-[11px] opacity-90">Upload full database state backup directly into your Google Drive.</p>
                </div>
              </button>
            </div>

            {lastSheetUrl && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between text-xs text-emerald-900">
                <span>Google Sheet generated successfully</span>
                <a
                  href={lastSheetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-emerald-700 font-bold hover:underline"
                >
                  <span>Open in Google Sheets</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}

            {/* List Drive Files */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Ledger Files in Google Drive
                </h3>
                <button
                  onClick={fetchDriveFiles}
                  className="text-xs text-emerald-700 hover:underline inline-flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Refresh List</span>
                </button>
              </div>

              <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-slate-50/50">
                {driveFiles.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400">
                    No ledger files found in your Google Drive yet. Click "Sync to Google Sheet" or "Save JSON Backup" above.
                  </div>
                ) : (
                  driveFiles.map((file) => (
                    <div key={file.id} className="p-3 flex items-center justify-between hover:bg-white transition-colors">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {file.mimeType.includes('spreadsheet') ? (
                          <FileSpreadsheet className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : (
                          <HardDrive className="w-4 h-4 text-slate-600 shrink-0" />
                        )}
                        <div className="truncate">
                          <p className="text-xs font-medium text-slate-800 truncate">{file.name}</p>
                          <p className="text-[10px] text-slate-400">
                            Modified: {file.modifiedTime ? new Date(file.modifiedTime).toLocaleDateString() : '—'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {file.webViewLink && (
                          <a
                            href={file.webViewLink}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1 text-slate-400 hover:text-slate-600"
                            title="Open file"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                        <button
                          onClick={() => handleLoadDriveFile(file.id)}
                          className="px-2.5 py-1 text-xs font-semibold text-emerald-800 bg-emerald-100/70 hover:bg-emerald-200 rounded-md transition-colors"
                        >
                          Load Data
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
