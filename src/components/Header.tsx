import React from 'react';
import { StorageStatus, AppSettings } from '../types';
import { HardDrive, Cloud, FileSpreadsheet, RefreshCw, Trash2, ShieldCheck, CheckCircle2, AlertCircle } from 'lucide-react';

interface HeaderProps {
  settings: AppSettings;
  storageStatus: StorageStatus;
  onOpenGoogleDriveModal: () => void;
  onOpenExcelModal: () => void;
  onClearAllData: () => void;
  onSyncGoogleNow: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  settings,
  storageStatus,
  onOpenGoogleDriveModal,
  onOpenExcelModal,
  onClearAllData,
  onSyncGoogleNow,
}) => {
  return (
    <header className="mb-6 bg-white border-b border-amber-200/80 rounded-xl p-5 shadow-sm">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-serif text-2xl md:text-3xl font-bold text-slate-800 tracking-tight">
              {settings.organizationName || 'Fallah Behbood Committee'}
            </h1>
            <span className="inline-block px-2.5 py-1 text-xs font-mono uppercase tracking-wider font-semibold text-amber-800 bg-amber-100/80 border border-amber-300 rounded">
              {settings.sessionTag || 'Session 2026–27'}
            </span>
          </div>
          <p className="text-sm text-slate-600 mt-1">
            {settings.subTitle || 'Income & Expenditure Ledger — Pampore'}
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onOpenGoogleDriveModal}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-colors border shadow-xs ${
              storageStatus.isGoogleConnected
                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
            title="Google Drive & Google Sheets Integration"
          >
            <Cloud className={`w-4 h-4 ${storageStatus.isGoogleConnected ? 'text-emerald-600' : 'text-slate-500'}`} />
            <span>{storageStatus.isGoogleConnected ? 'Google Drive Synced' : 'Connect Google Drive'}</span>
          </button>

          <button
            onClick={onOpenExcelModal}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-white text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors shadow-xs"
            title="Excel File Export & Import Manager"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Excel Backup / Export</span>
          </button>

          <button
            onClick={onClearAllData}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-rose-700 bg-rose-50/60 border border-rose-200 rounded-lg hover:bg-rose-100 transition-colors"
            title="Clear all stored data"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
            <span>Clear Data</span>
          </button>
        </div>
      </div>

      {/* Storage Status Bar */}
      <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between text-xs text-slate-600 gap-2">
        <div className="flex items-center gap-2">
          <div
            className={`w-2.5 h-2.5 rounded-full ${
              storageStatus.isGoogleConnected
                ? 'bg-emerald-500 animate-pulse'
                : storageStatus.mode === 'localStorage'
                ? 'bg-amber-500'
                : 'bg-slate-400'
            }`}
          />
          <span className="font-medium">
            {storageStatus.isGoogleConnected ? (
              <span className="text-emerald-800">
                Connected to Google Account ({storageStatus.googleUserEmail || 'Google Drive'})
              </span>
            ) : storageStatus.mode === 'file' ? (
              <span>Saving to local file ({storageStatus.connectedFileName})</span>
            ) : (
              <span>Saving automatically to browser local storage</span>
            )}
          </span>
          {storageStatus.lastSyncedAt && (
            <span className="text-slate-400">
              • Last synced: {new Date(storageStatus.lastSyncedAt).toLocaleTimeString()}
            </span>
          )}
        </div>

        {storageStatus.isGoogleConnected && (
          <button
            onClick={onSyncGoogleNow}
            disabled={storageStatus.syncing}
            className="inline-flex items-center gap-1 text-xs text-emerald-700 hover:text-emerald-900 font-semibold cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${storageStatus.syncing ? 'animate-spin' : ''}`} />
            <span>{storageStatus.syncing ? 'Syncing to Google Sheets...' : 'Sync Now to Google Sheets'}</span>
          </button>
        )}
      </div>
    </header>
  );
};
