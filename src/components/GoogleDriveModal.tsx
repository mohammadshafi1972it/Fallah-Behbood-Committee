import React, { useState, useEffect } from 'react';
import { StorageStatus, DriveFileItem, Transaction, Member, AppSettings } from '../types';
import { 
  Cloud, 
  CheckCircle2, 
  RefreshCw, 
  X, 
  FileSpreadsheet, 
  Download, 
  Upload, 
  LogOut, 
  ExternalLink, 
  ShieldCheck, 
  HardDrive,
  AlertCircle
} from 'lucide-react';
import { 
  googleSignIn, 
  googleLogout, 
  getCachedToken, 
  fetchDriveFilesList, 
  syncLedgerToGoogleSheet, 
  saveJsonBackupToDrive, 
  loadFileFromGoogleDrive 
} from '../lib/googleDriveAuth';

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
  const [savingBackup, setSavingBackup] = useState(false);
  const [driveFiles, setDriveFiles] = useState<DriveFileItem[]>([]);
  const [lastSheetUrl, setLastSheetUrl] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && storageStatus.isGoogleConnected) {
      loadDriveFiles();
    }
  }, [isOpen, storageStatus.isGoogleConnected]);

  if (!isOpen) return null;

  const loadDriveFiles = async () => {
    const token = getCachedToken();
    if (!token) return;

    try {
      setLoading(true);
      const files = await fetchDriveFilesList(token);
      setDriveFiles(files);
    } catch (err: any) {
      console.error('Failed to list drive files', err);
      // If 401 unauthorized, token might have expired
      if (err.message?.includes('401') || err.message?.includes('UNAUTHENTICATED')) {
        showToast('Google session expired. Please sign in again.');
        await googleLogout();
        onStatusUpdate();
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async () => {
    setAuthError(null);
    setLoading(true);
    try {
      const result = await googleSignIn();
      showToast(`Welcome ${result.user.displayName || result.user.email || 'User'}! Connected to Google Drive.`);
      onStatusUpdate();
      
      // Load drive files right after sign-in
      try {
        const files = await fetchDriveFilesList(result.accessToken);
        setDriveFiles(files);
      } catch (fErr) {
        console.warn('Initial drive list check:', fErr);
      }
    } catch (err: any) {
      console.error('Sign-in error:', err);
      let msg = err.message || 'Failed to connect to Google Drive.';
      if (err.code === 'auth/popup-closed-by-user') {
        msg = 'Sign-in window was closed before completion.';
      } else if (err.code === 'auth/cancelled-popup-request') {
        msg = 'Sign-in cancelled.';
      }
      setAuthError(msg);
      showToast(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    try {
      setLoading(true);
      await googleLogout();
      setDriveFiles([]);
      setLastSheetUrl(null);
      onStatusUpdate();
      showToast('Disconnected from Google Account & Google Drive.');
    } catch (err) {
      showToast('Error signing out.');
    } finally {
      setLoading(false);
    }
  };

  const handleSyncToSheets = async () => {
    const token = getCachedToken();
    if (!token) {
      showToast('Please sign in to Google first.');
      return;
    }

    try {
      setSyncingSheet(true);
      const result = await syncLedgerToGoogleSheet(token, {
        transactions,
        members,
        settings,
        existingSpreadsheetId: settings.linkedGoogleSheetId,
      });

      setLastSheetUrl(result.webViewLink);
      showToast('Ledger and members synced to Google Sheet!');
      onStatusUpdate();
      loadDriveFiles();
    } catch (err: any) {
      console.error('Sheets sync error:', err);
      showToast('Failed to sync to Google Sheets: ' + (err.message || 'Unknown error'));
    } finally {
      setSyncingSheet(false);
    }
  };

  const handleSaveJsonBackup = async () => {
    const token = getCachedToken();
    if (!token) {
      showToast('Please sign in to Google first.');
      return;
    }

    try {
      setSavingBackup(true);
      await saveJsonBackupToDrive(token, {
        transactions,
        members,
        settings,
      });

      showToast('JSON ledger backup saved safely into your Google Drive!');
      loadDriveFiles();
    } catch (err: any) {
      console.error('Backup error:', err);
      showToast('Failed to save JSON backup: ' + (err.message || 'Unknown error'));
    } finally {
      setSavingBackup(false);
    }
  };

  const handleLoadFile = async (file: DriveFileItem) => {
    const token = getCachedToken();
    if (!token) {
      showToast('Please sign in to Google first.');
      return;
    }

    const confirmed = window.confirm(
      `Load data from "${file.name}"? This will update your active committee ledger with the contents of this file.`
    );
    if (!confirmed) return;

    try {
      setLoading(true);
      const result = await loadFileFromGoogleDrive(token, file.id);

      onDataLoaded({
        members: result.members,
        transactions: result.transactions,
        settings: result.settings || settings,
      });

      showToast(`Successfully restored ${result.transactions.length} entries & ${result.members.length} members from Google Drive.`);
      onClose();
    } catch (err: any) {
      console.error('Load file error:', err);
      showToast('Failed to load file: ' + (err.message || 'Invalid format'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-2xl w-full p-6 relative animate-in fade-in zoom-in duration-150">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
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
              Directly sync your ledger to Google Sheets and store secure JSON cloud backups in Google Drive.
            </p>
          </div>
        </div>

        {authError && (
          <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{authError}</span>
          </div>
        )}

        {/* Auth Status Section */}
        {!storageStatus.isGoogleConnected ? (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 mb-6 text-center">
            <ShieldCheck className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
            <h3 className="text-base font-bold text-slate-900 mb-1">Connect Your Google Account</h3>
            <p className="text-xs text-slate-600 max-w-md mx-auto mb-5 leading-relaxed">
              Sign in with your Google account to enable automatic cloud synchronization, export multi-tab spreadsheets to Google Sheets, and keep your ledger data backed up in Google Drive.
            </p>
            
            {/* Standard Official Sign in with Google Button */}
            <button
              onClick={handleSignIn}
              disabled={loading}
              className="inline-flex items-center gap-3 px-5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-lg border border-slate-300 shadow-xs transition-all hover:shadow-sm cursor-pointer disabled:opacity-50"
            >
              {loading ? (
                <RefreshCw className="w-4 h-4 text-emerald-600 animate-spin" />
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                </svg>
              )}
              <span>{loading ? 'Connecting Google Account...' : 'Sign in with Google'}</span>
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
                <p className="text-[11px] text-emerald-700">Google Drive & Google Sheets access active</p>
              </div>
            </div>
            <button
              onClick={handleSignOut}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-700 bg-white border border-rose-200 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Disconnect</span>
            </button>
          </div>
        )}

        {/* Actions Section when connected */}
        {storageStatus.isGoogleConnected && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={handleSyncToSheets}
                disabled={syncingSheet}
                className="p-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-left transition-colors flex items-start gap-3 shadow-xs disabled:opacity-50 cursor-pointer"
              >
                <FileSpreadsheet className="w-5 h-5 mt-0.5 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold mb-0.5 flex items-center gap-1.5">
                    <span>Sync to Google Sheet</span>
                    {syncingSheet && <RefreshCw className="w-3 h-3 animate-spin" />}
                  </h4>
                  <p className="text-[11px] opacity-90">Export ledger, members, dues & summaries into a multi-tab Google Sheet.</p>
                </div>
              </button>

              <button
                onClick={handleSaveJsonBackup}
                disabled={savingBackup}
                className="p-4 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-left transition-colors flex items-start gap-3 shadow-xs disabled:opacity-50 cursor-pointer"
              >
                <Upload className="w-5 h-5 mt-0.5 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold mb-0.5 flex items-center gap-1.5">
                    <span>Save JSON Cloud Backup</span>
                    {savingBackup && <RefreshCw className="w-3 h-3 animate-spin" />}
                  </h4>
                  <p className="text-[11px] opacity-90">Upload full database state backup file directly into your Google Drive.</p>
                </div>
              </button>
            </div>

            {lastSheetUrl && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between text-xs text-emerald-900">
                <span className="font-semibold">Google Sheet generated & synced successfully</span>
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
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Committee Files in Google Drive
                </h3>
                <button
                  onClick={loadDriveFiles}
                  disabled={loading}
                  className="text-xs text-emerald-700 hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                  <span>Refresh List</span>
                </button>
              </div>

              <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-slate-50/50">
                {driveFiles.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400">
                    No ledger files found in your Google Drive yet. Click "Sync to Google Sheet" or "Save JSON Cloud Backup" above.
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
                          <p className="text-xs font-bold text-slate-800 truncate">{file.name}</p>
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
                            title="Open in Google Drive / Sheets"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        )}
                        <button
                          onClick={() => handleLoadFile(file)}
                          disabled={loading}
                          className="px-2.5 py-1 text-xs font-semibold text-emerald-800 bg-emerald-100/70 hover:bg-emerald-200 rounded-md transition-colors cursor-pointer"
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
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
