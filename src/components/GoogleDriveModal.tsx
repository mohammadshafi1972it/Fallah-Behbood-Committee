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
  AlertCircle,
  Copy,
  ChevronDown,
  ChevronUp,
  Settings,
  HelpCircle
} from 'lucide-react';
import { 
  googleSignIn, 
  googleLogout, 
  getCachedToken, 
  fetchDriveFilesList, 
  syncLedgerToGoogleSheet, 
  saveJsonBackupToDrive, 
  loadFileFromGoogleDrive,
  getEffectiveClientId,
  getCustomClientId,
  setCustomClientId
} from '../lib/googleDriveAuth';
import * as XLSX from 'xlsx';

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
  
  // Custom Client ID & Setup Guide state
  const [showSetupGuide, setShowSetupGuide] = useState(false);
  const [customClientIdInput, setCustomClientIdInput] = useState(getCustomClientId());
  const [copiedOrigin, setCopiedOrigin] = useState(false);

  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'https://ais-dev-q7cs2onbyych77fnnygxzd-657798019634.asia-east1.run.app';

  useEffect(() => {
    if (isOpen) {
      setCustomClientIdInput(getCustomClientId());
      if (storageStatus.isGoogleConnected) {
        loadDriveFiles();
      }
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
      const msg = err.message || '';
      if (msg.includes('expired') || msg.includes('sign-in') || msg.includes('401') || msg.includes('UNAUTHENTICATED') || msg.includes('credentials')) {
        showToast('Google session expired. Please sign in again.');
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
      showToast(`Welcome ${result.user.name || result.user.email || 'User'}! Connected to Google Drive.`);
      onStatusUpdate();
      
      try {
        const files = await fetchDriveFilesList(result.accessToken);
        setDriveFiles(files);
      } catch (fErr) {
        console.warn('Initial drive list check:', fErr);
      }
    } catch (err: any) {
      console.error('Sign-in error:', err);
      let msg = err.message || 'Failed to connect to Google Drive.';
      if (err.message?.includes('OAuth 2.0 policy') || err.message?.includes('origin') || err.message?.includes('400')) {
        setShowSetupGuide(true);
      }
      setAuthError(msg);
      showToast(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCustomClientId = () => {
    setCustomClientId(customClientIdInput);
    showToast(customClientIdInput ? 'Custom Google OAuth Client ID saved!' : 'Reset to default Client ID.');
  };

  const handleCopyOrigin = () => {
    navigator.clipboard.writeText(currentOrigin);
    setCopiedOrigin(true);
    showToast('Origin URL copied to clipboard!');
    setTimeout(() => setCopiedOrigin(false), 2000);
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
      const msg = err.message || 'Unknown error';
      showToast('Google Sheets Sync: ' + msg);
      if (msg.includes('expired') || msg.includes('sign-in') || msg.includes('401') || msg.includes('credentials')) {
        onStatusUpdate();
      }
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
      const msg = err.message || 'Unknown error';
      showToast('Google Drive Backup: ' + msg);
      if (msg.includes('expired') || msg.includes('sign-in') || msg.includes('401') || msg.includes('credentials')) {
        onStatusUpdate();
      }
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

  // Instant Offline Excel Download
  const handleDownloadExcel = () => {
    const wb = XLSX.utils.book_new();

    const ledgerRows = transactions.map((t) => ({
      'Date': t.date,
      'Type': t.type,
      'Ledger No': t.ledgerNo || '',
      'Name / Paid To': t.type === 'Income' ? t.memberName : t.paidTo,
      'Head / Fund': t.head,
      'Amount (Rs.)': t.amount,
      'For Month': t.forMonth || '',
      'Receipt/Voucher No': t.receiptVoucherNo || '',
      'Payment Mode': t.mode,
      'Remarks': t.remarks || '',
    }));
    const wsLedger = XLSX.utils.json_to_sheet(ledgerRows);
    XLSX.utils.book_append_sheet(wb, wsLedger, 'Ledger Entries');

    const membersRows = members.map((m) => ({
      'Ledger No': m.ledgerNo,
      'Member Name': m.name,
      'Phone / WhatsApp': m.phone || '',
      'Monthly Due (Rs.)': m.monthlyDue || 150,
    }));
    const wsMembers = XLSX.utils.json_to_sheet(membersRows);
    XLSX.utils.book_append_sheet(wb, wsMembers, 'Members Directory');

    const totalIncome = transactions.filter((t) => t.type === 'Income').reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const totalExpenditure = transactions.filter((t) => t.type === 'Expenditure').reduce((s, t) => s + (Number(t.amount) || 0), 0);
    const opening = Number(settings.openingBalance) || 0;

    const summaryRows = [
      { 'Metric': 'Organization Name', 'Value': settings.organizationName || 'Fallah Behbood Committee' },
      { 'Metric': 'Opening Balance (Rs.)', 'Value': opening },
      { 'Metric': 'Total Income (Rs.)', 'Value': totalIncome },
      { 'Metric': 'Total Expenditure (Rs.)', 'Value': totalExpenditure },
      { 'Metric': 'Net Balance (Rs.)', 'Value': opening + totalIncome - totalExpenditure },
      { 'Metric': 'Total Members', 'Value': members.length },
      { 'Metric': 'Export Date', 'Value': new Date().toLocaleString() },
    ];
    const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

    XLSX.writeFile(wb, `Fallah_Behbood_Committee_Ledger_${new Date().toISOString().split('T')[0]}.xlsx`);
    showToast('Excel workbook downloaded successfully!');
  };

  // Instant Offline JSON Backup Download
  const handleDownloadJsonBackup = () => {
    const data = {
      transactions,
      members,
      settings,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Fallah_Behbood_Committee_Backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('JSON Backup file downloaded successfully!');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-2xl w-full p-6 relative animate-in fade-in zoom-in duration-150 my-8 max-h-[90vh] overflow-y-auto">
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
            <h2 className="text-lg font-bold text-slate-800">Google Drive & Cloud Storage</h2>
            <p className="text-xs text-slate-500">
              Synchronize your committee ledger directly to Google Sheets and keep secure cloud backups.
            </p>
          </div>
        </div>

        {authError && (
          <div className="mb-4 p-3.5 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 space-y-1.5">
            <div className="flex items-center gap-2 font-bold">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>Google OAuth Origin Notice</span>
            </div>
            <p className="leading-relaxed">
              Google requires the exact App Origin URL to be registered under <strong>Authorized JavaScript origins</strong> in the Google Cloud Console.
            </p>
          </div>
        )}

        {/* Auth Status Section */}
        {!storageStatus.isGoogleConnected ? (
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 mb-5 text-center">
            <ShieldCheck className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
            <h3 className="text-base font-bold text-slate-900 mb-1">Connect Your Google Account</h3>
            <p className="text-xs text-slate-600 max-w-md mx-auto mb-5 leading-relaxed">
              Sign in with your Google account to enable cloud synchronization to Google Sheets and store backups in Google Drive.
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                onClick={handleSignIn}
                disabled={loading}
                className="inline-flex items-center gap-3 px-5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-lg border border-slate-300 shadow-xs transition-all hover:shadow-sm cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <RefreshCw className="w-4 h-4 text-emerald-600 animate-spin" />
                ) : (
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 48 48">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                  </svg>
                )}
                <span>{loading ? 'Connecting Google Account...' : 'Sign in with Google'}</span>
              </button>

              <button
                onClick={() => setShowSetupGuide(!showSetupGuide)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 bg-transparent hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
              >
                <HelpCircle className="w-4 h-4 text-slate-500" />
                <span>OAuth Origin Settings</span>
                {showSetupGuide ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
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

        {/* Expandable Google Cloud Setup Guide */}
        {showSetupGuide && (
          <div className="mb-5 p-4 bg-amber-50/70 border border-amber-200 rounded-xl text-xs space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-amber-900 flex items-center gap-1.5">
                <Settings className="w-4 h-4 text-amber-700" />
                Google Cloud Console OAuth Origin Setup
              </span>
              <a
                href="https://console.cloud.google.com/apis/credentials"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-[11px] text-blue-700 font-bold hover:underline"
              >
                <span>Open Google Cloud Credentials</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>

            <p className="text-slate-700 leading-relaxed">
              If Google displays an <em>"OAuth 2.0 policy"</em> origin message, add this app's JavaScript origin into your OAuth 2.0 Client ID:
            </p>

            <div className="flex items-center gap-2 bg-white p-2.5 rounded-lg border border-amber-200">
              <code className="text-slate-800 text-[11px] font-mono select-all truncate flex-1">{currentOrigin}</code>
              <button
                onClick={handleCopyOrigin}
                className="px-2.5 py-1 text-xs font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 rounded transition-colors inline-flex items-center gap-1 shrink-0 cursor-pointer"
              >
                <Copy className="w-3 h-3" />
                <span>{copiedOrigin ? 'Copied!' : 'Copy'}</span>
              </button>
            </div>

            <ol className="list-decimal list-inside text-slate-700 space-y-1 text-[11px] pl-1 leading-relaxed">
              <li>Open <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" className="text-blue-700 underline">Google Cloud Credentials</a>.</li>
              <li>Click your <strong>OAuth 2.0 Client ID</strong> (Web Application).</li>
              <li>Under <strong>Authorized JavaScript origins</strong>, click <strong>+ ADD URI</strong> and paste the URL above.</li>
              <li>Click <strong>Save</strong> and wait 1 minute for Google's servers to update.</li>
            </ol>

            <div className="pt-2 border-t border-amber-200/80">
              <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                Optional: Use Custom OAuth Client ID
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="e.g. 123456789-abcdefg.apps.googleusercontent.com"
                  value={customClientIdInput}
                  onChange={(e) => setCustomClientIdInput(e.target.value)}
                  className="flex-1 px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-emerald-600 font-mono"
                />
                <button
                  onClick={handleSaveCustomClientId}
                  className="px-3 py-1.5 text-xs font-bold bg-slate-800 text-white rounded-lg hover:bg-slate-900 transition-colors shrink-0 cursor-pointer"
                >
                  Save ID
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Cloud Sync Actions when connected */}
        {storageStatus.isGoogleConnected && (
          <div className="space-y-4 mb-5">
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

              <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 bg-slate-50/50">
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

        {/* 100% Reliable Offline Backup & Excel Export Section */}
        <div className="pt-4 border-t border-slate-200">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5 flex items-center justify-between">
            <span>Direct Excel & Local Backup (Instant & Offline)</span>
            <span className="text-[10px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">Always Ready</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              onClick={handleDownloadExcel}
              className="px-3.5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 shadow-2xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Download Excel Ledger (.xlsx)</span>
            </button>

            <button
              onClick={handleDownloadJsonBackup}
              className="px-3.5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 shadow-2xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4 text-blue-600" />
              <span>Download JSON Backup</span>
            </button>
          </div>
        </div>

        <div className="mt-5 pt-3 border-t border-slate-100 flex justify-end">
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
