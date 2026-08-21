import React, { useState, useEffect, useCallback } from 'react';
import { Transaction, Member, AppSettings, StorageStatus, MonthBalanceConfig } from './types';
import { Header } from './components/Header';
import { LedgerTab } from './components/LedgerTab';
import { MembersTab } from './components/MembersTab';
import { DashboardTab } from './components/DashboardTab';
import { MonthEndTab } from './components/MonthEndTab';
import { GoogleDriveModal } from './components/GoogleDriveModal';
import { ExcelManagerModal } from './components/ExcelManagerModal';
import { DeleteConfirmModal } from './components/DeleteConfirmModal';
import { ToastNotification } from './components/ToastNotification';
import { FileText, Users, LayoutDashboard, CalendarCheck } from 'lucide-react';
import { subscribeAuth, getCachedToken, getCachedUser, syncLedgerToGoogleSheet } from './lib/googleDriveAuth';

const STORAGE_KEY = 'fbc-ledger-data';

export default function App() {
  const [activeTab, setActiveTab] = useState<'ledger' | 'members' | 'dashboard' | 'monthend'>('ledger');

  // Core Data
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [settings, setSettings] = useState<AppSettings>({
    openingBalance: 0,
    organizationName: 'Fallah Behbood Committee',
    subTitle: 'Income & Expenditure Ledger — Pampore',
    sessionTag: 'Session 2026–27',
    standardMonthlyDue: 150,
    autoSyncGoogleDrive: true,
  });

  // Storage Status
  const [storageStatus, setStorageStatus] = useState<StorageStatus>({
    mode: 'localStorage',
    isGoogleConnected: false,
    syncing: false,
  });

  // Modals
  const [isDriveModalOpen, setIsDriveModalOpen] = useState(false);
  const [isExcelModalOpen, setIsExcelModalOpen] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Delete Confirm Modal
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
  }, []);

  // Update Google Auth Status
  const checkGoogleAuthStatus = useCallback(() => {
    const user = getCachedUser();
    const token = getCachedToken();
    const isConnected = !!(user || token);

    setStorageStatus((prev) => ({
      ...prev,
      isGoogleConnected: isConnected,
      googleUserEmail: user?.email || (isConnected ? 'Google Account Connected' : undefined),
    }));
  }, []);

  // Initialize Auth listener & Load Initial Local Storage Data
  useEffect(() => {
    // Subscribe to Google auth state
    const unsubscribe = subscribeAuth((user, token) => {
      const isConnected = !!(user || token);
      setStorageStatus((prev) => ({
        ...prev,
        isGoogleConnected: isConnected,
        googleUserEmail: user?.email || (isConnected ? 'Google Account Connected' : undefined),
      }));
    });

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.transactions) setTransactions(parsed.transactions);
        if (parsed.members) setMembers(parsed.members);
        if (parsed.settings) setSettings(parsed.settings);
      }
    } catch (e) {
      console.error('Failed to load local storage', e);
    }

    return () => {
      unsubscribe();
    };
  }, []);

  // Save to LocalStorage on Change
  useEffect(() => {
    try {
      const payload = {
        transactions,
        members,
        settings,
        lastSaved: new Date().toISOString(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.error('Failed to save to local storage', e);
    }
  }, [transactions, members, settings]);

  // Sync Now to Google Sheets
  const handleSyncGoogleNow = async () => {
    const token = getCachedToken();
    if (!token) {
      setIsDriveModalOpen(true);
      return;
    }

    try {
      setStorageStatus((prev) => ({ ...prev, syncing: true }));
      const result = await syncLedgerToGoogleSheet(token, {
        transactions,
        members,
        settings,
        existingSpreadsheetId: settings.linkedGoogleSheetId,
      });

      setSettings((prev) => ({
        ...prev,
        linkedGoogleSheetId: result.spreadsheetId,
        lastSyncedAt: result.syncedAt,
      }));

      setStorageStatus((prev) => ({
        ...prev,
        lastSyncedAt: result.syncedAt,
      }));

      showToast('Successfully synced ledger & members to Google Sheets!');
    } catch (err: any) {
      console.error('Sync error:', err);
      showToast('Failed to sync to Google Sheets: ' + (err.message || 'Error'));
    } finally {
      setStorageStatus((prev) => ({ ...prev, syncing: false }));
    }
  };

  // Transaction Handlers
  const handleSaveTransaction = (txn: Transaction) => {
    setTransactions((prev) => {
      const idx = prev.findIndex((t) => t.id === txn.id);
      if (idx > -1) {
        const copy = [...prev];
        copy[idx] = txn;
        return copy;
      }
      return [txn, ...prev];
    });
  };

  const handleDeleteTransaction = (id: string) => {
    const target = transactions.find((t) => t.id === id);
    const label = target ? `${target.type} of ${target.amount}` : 'this entry';

    setDeleteModal({
      isOpen: true,
      title: 'Delete Ledger Entry?',
      message: `Are you sure you want to permanently delete ${label}? This operation cannot be undone.`,
      onConfirm: () => {
        setTransactions((prev) => prev.filter((t) => t.id !== id));
        showToast('Entry deleted.');
      },
    });
  };

  const handleBulkImportTransactions = (newTxns: Transaction[], newMembers: Member[]) => {
    if (newTxns.length) {
      setTransactions((prev) => [...newTxns, ...prev]);
    }
    if (newMembers.length) {
      setMembers((prev) => {
        const map = new Map(prev.map((m) => [m.ledgerNo, m]));
        newMembers.forEach((m) => {
          if (!map.has(m.ledgerNo)) {
            map.set(m.ledgerNo, m);
          }
        });
        return Array.from(map.values());
      });
    }
  };

  // Member Handlers
  const handleAddMember = (member: Member) => {
    setMembers((prev) => [...prev, member]);
  };

  const handleUpdateMember = (updatedMember: Member) => {
    setMembers((prev) => {
      const idx = prev.findIndex((m) => m.ledgerNo === updatedMember.ledgerNo);
      if (idx > -1) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], ...updatedMember, updatedAt: new Date().toISOString() };
        return copy;
      }
      return [...prev, updatedMember];
    });
  };

  const handleUpdateMemberBalance = (
    ledgerNo: string,
    openingBalance: number,
    previousDue?: number,
    showNilBalanceWhenPaid?: boolean,
    notes?: string
  ) => {
    setMembers((prev) => {
      const idx = prev.findIndex((m) => m.ledgerNo === ledgerNo);
      if (idx > -1) {
        const copy = [...prev];
        copy[idx] = {
          ...copy[idx],
          openingBalance,
          previousDue,
          showNilBalanceWhenPaid,
          balanceNotes: notes,
          updatedAt: new Date().toISOString(),
        };
        return copy;
      }
      return prev;
    });

    // Also update settings.memberBalanceOverrides
    setSettings((prev) => ({
      ...prev,
      memberBalanceOverrides: {
        ...(prev.memberBalanceOverrides || {}),
        [ledgerNo]: {
          openingBalance,
          previousDue,
          showNilBalanceWhenPaid,
          notes,
        },
      },
    }));
  };

  const handleRemoveMember = (ledgerNo: string) => {
    const target = members.find((m) => m.ledgerNo === ledgerNo);
    const label = target ? target.name : `Ledger No. ${ledgerNo}`;

    setDeleteModal({
      isOpen: true,
      title: 'Remove Member?',
      message: `Remove ${label} from the member directory? Their past ledger entries will be preserved.`,
      onConfirm: () => {
        setMembers((prev) => prev.filter((m) => m.ledgerNo !== ledgerNo));
        showToast('Member removed from directory.');
      },
    });
  };

  const handleBulkImportMembers = (newMembers: Member[]) => {
    setMembers((prev) => {
      const map = new Map(prev.map((m) => [m.ledgerNo, m]));
      newMembers.forEach((m) => map.set(m.ledgerNo, m));
      return Array.from(map.values());
    });
  };

  // Clear All Data
  const handleClearAllData = () => {
    setDeleteModal({
      isOpen: true,
      title: 'Clear All App Data?',
      message: `This will permanently erase all ${transactions.length} transactions and ${members.length} member records from this browser. Make sure you have exported an Excel or Google Drive backup first.`,
      onConfirm: () => {
        setTransactions([]);
        setMembers([]);
        setSettings({
          openingBalance: 0,
          organizationName: 'Fallah Behbood Committee',
          subTitle: 'Income & Expenditure Ledger — Pampore',
          sessionTag: 'Session 2026–27',
          standardMonthlyDue: 150,
          autoSyncGoogleDrive: true,
        });
        localStorage.removeItem(STORAGE_KEY);
        showToast('All app data cleared.');
      },
    });
  };

  const handleDataLoadedFromDrive = (data: {
    members: Member[];
    transactions: Transaction[];
    settings: AppSettings;
  }) => {
    if (data.members) setMembers(data.members);
    if (data.transactions) setTransactions(data.transactions);
    if (data.settings) setSettings(data.settings);
  };

  const handleUpdateMonthBalanceConfig = (month: string, config: MonthBalanceConfig) => {
    setSettings((prev) => {
      const updated = { ...(prev.monthBalances || {}) };
      updated[month] = config;
      return {
        ...prev,
        monthBalances: updated,
      };
    });
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 font-sans p-3 sm:p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header Component */}
        <Header
          settings={settings}
          storageStatus={storageStatus}
          onOpenGoogleDriveModal={() => setIsDriveModalOpen(true)}
          onOpenExcelModal={() => setIsExcelModalOpen(true)}
          onClearAllData={handleClearAllData}
          onSyncGoogleNow={handleSyncGoogleNow}
          onUpdateSessionTag={(newTag) => {
            setSettings((prev) => ({ ...prev, sessionTag: newTag }));
            showToast(`Active session changed to ${newTag}`);
          }}
        />

        {/* Main Navigation Tabs */}
        <nav className="flex items-center gap-1.5 border-b border-slate-200 overflow-x-auto pb-px">
          <button
            onClick={() => setActiveTab('ledger')}
            className={`inline-flex items-center gap-2 px-5 py-3 text-xs font-semibold rounded-t-xl transition-all border cursor-pointer whitespace-nowrap ${
              activeTab === 'ledger'
                ? 'bg-white text-slate-900 border-slate-200 border-b-white -mb-px font-bold shadow-2xs'
                : 'bg-slate-200/60 text-slate-600 border-transparent hover:bg-slate-200/90'
            }`}
          >
            <FileText className="w-4 h-4 text-emerald-700" />
            <span>Ledger Entries ({transactions.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('members')}
            className={`inline-flex items-center gap-2 px-5 py-3 text-xs font-semibold rounded-t-xl transition-all border cursor-pointer whitespace-nowrap ${
              activeTab === 'members'
                ? 'bg-white text-slate-900 border-slate-200 border-b-white -mb-px font-bold shadow-2xs'
                : 'bg-slate-200/60 text-slate-600 border-transparent hover:bg-slate-200/90'
            }`}
          >
            <Users className="w-4 h-4 text-blue-700" />
            <span>Members Directory ({members.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('dashboard')}
            className={`inline-flex items-center gap-2 px-5 py-3 text-xs font-semibold rounded-t-xl transition-all border cursor-pointer whitespace-nowrap ${
              activeTab === 'dashboard'
                ? 'bg-white text-slate-900 border-slate-200 border-b-white -mb-px font-bold shadow-2xs'
                : 'bg-slate-200/60 text-slate-600 border-transparent hover:bg-slate-200/90'
            }`}
          >
            <LayoutDashboard className="w-4 h-4 text-purple-700" />
            <span>Financial Analytics & Dashboard</span>
          </button>

          <button
            onClick={() => setActiveTab('monthend')}
            className={`inline-flex items-center gap-2 px-5 py-3 text-xs font-semibold rounded-t-xl transition-all border cursor-pointer whitespace-nowrap ${
              activeTab === 'monthend'
                ? 'bg-white text-slate-900 border-slate-200 border-b-white -mb-px font-bold shadow-2xs'
                : 'bg-slate-200/60 text-slate-600 border-transparent hover:bg-slate-200/90'
            }`}
          >
            <CalendarCheck className="w-4 h-4 text-amber-700" />
            <span>Month End Reconciliation</span>
          </button>
        </nav>

        {/* Tab Content Panels */}
        <main className="bg-white rounded-b-xl border border-slate-200 p-5 shadow-xs">
          {activeTab === 'ledger' && (
            <LedgerTab
              transactions={transactions}
              members={members}
              onSaveTransaction={handleSaveTransaction}
              onDeleteTransaction={handleDeleteTransaction}
              onBulkImportTransactions={handleBulkImportTransactions}
              showToast={showToast}
            />
          )}

          {activeTab === 'members' && (
            <MembersTab
              members={members}
              transactions={transactions}
              settings={settings}
              organizationName={settings.organizationName}
              onAddMember={handleAddMember}
              onUpdateMember={handleUpdateMember}
              onUpdateMemberBalance={handleUpdateMemberBalance}
              onRemoveMember={handleRemoveMember}
              onBulkImportMembers={handleBulkImportMembers}
              onSaveTransaction={handleSaveTransaction}
              onDeleteTransaction={handleDeleteTransaction}
              showToast={showToast}
            />
          )}

          {activeTab === 'dashboard' && (
            <DashboardTab
              transactions={transactions}
              members={members}
              settings={settings}
              onUpdateOpeningBalance={(bal) => setSettings((prev) => ({ ...prev, openingBalance: bal }))}
              showToast={showToast}
            />
          )}

          {activeTab === 'monthend' && (
            <MonthEndTab
              transactions={transactions}
              members={members}
              settings={settings}
              onUpdateMonthBalanceConfig={handleUpdateMonthBalanceConfig}
              onUpdateMemberBalance={handleUpdateMemberBalance}
              showToast={showToast}
            />
          )}
        </main>
      </div>

      {/* Google Drive Modal */}
      <GoogleDriveModal
        isOpen={isDriveModalOpen}
        onClose={() => setIsDriveModalOpen(false)}
        storageStatus={storageStatus}
        transactions={transactions}
        members={members}
        settings={settings}
        onDataLoaded={handleDataLoadedFromDrive}
        onStatusUpdate={checkGoogleAuthStatus}
        showToast={showToast}
      />

      {/* Excel Manager Modal */}
      <ExcelManagerModal
        isOpen={isExcelModalOpen}
        onClose={() => setIsExcelModalOpen(false)}
        transactions={transactions}
        members={members}
        settings={settings}
        onBulkImportTransactions={handleBulkImportTransactions}
        showToast={showToast}
      />

      {/* Reusable Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={deleteModal.isOpen}
        onClose={() => setDeleteModal((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={deleteModal.onConfirm}
        title={deleteModal.title}
        message={deleteModal.message}
      />

      {/* Toast Notification */}
      <ToastNotification message={toastMsg} onClose={() => setToastMsg(null)} />
    </div>
  );
}
