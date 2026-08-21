import React, { useState, useMemo } from 'react';
import { Member, Transaction, AppSettings, MemberBalanceItem } from '../types';
import {
  computeMemberBalanceList,
  printAllMembersBalancePDF,
  exportAllMembersBalanceExcel,
  formatMoney,
  fmtDate,
  num,
  todayISO,
} from '../lib/ledgerUtils';
import {
  X,
  Printer,
  Download,
  Share2,
  Search,
  Filter,
  ArrowUpDown,
  FileText,
  Users,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Pencil,
  Sparkles,
} from 'lucide-react';

interface AllMembersBalancePdfModalProps {
  isOpen: boolean;
  onClose: () => void;
  members: Member[];
  transactions: Transaction[];
  settings: AppSettings;
  onEditMemberBalance?: (member: Member) => void;
  showToast?: (msg: string) => void;
}

export const AllMembersBalancePdfModal: React.FC<AllMembersBalancePdfModalProps> = ({
  isOpen,
  onClose,
  members,
  transactions,
  settings,
  onEditMemberBalance,
  showToast,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [sortBy, setSortBy] = useState<'ledger' | 'name' | 'balanceDesc' | 'balanceAsc' | 'paidDesc'>('ledger');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');

  // Compute all live member balances (incorporating manual opening balance + auto paid transactions)
  const allMemberBalances = useMemo(() => {
    return computeMemberBalanceList(members, transactions, settings.memberBalanceOverrides);
  }, [members, transactions, settings.memberBalanceOverrides]);

  // Summary KPI Calculations
  const stats = useMemo(() => {
    let totalOpening = 0;
    let totalPaid = 0;
    let totalEffective = 0;
    let totalReceipts = 0;
    let activePayers = 0;
    let advanceCount = 0;
    let arrearsCount = 0;
    let clearedCount = 0;

    allMemberBalances.forEach((m) => {
      totalOpening += m.openingBalance;
      totalPaid += m.totalPaid;
      totalEffective += m.effectiveBalance;
      totalReceipts += m.receiptsCount;
      if (m.totalPaid > 0) activePayers++;
      if (m.status === 'Advance') advanceCount++;
      else if (m.status === 'Arrears') arrearsCount++;
      else if (m.status === 'Cleared') clearedCount++;
    });

    return {
      totalMembers: allMemberBalances.length,
      activePayers,
      totalOpening,
      totalPaid,
      totalEffective,
      totalReceipts,
      advanceCount,
      arrearsCount,
      clearedCount,
    };
  }, [allMemberBalances]);

  // Filtered and Sorted list for display and PDF export
  const displayedBalances = useMemo(() => {
    let list = allMemberBalances.slice();

    // Status filter
    if (statusFilter !== 'All') {
      if (statusFilter === 'Advance') {
        list = list.filter((m) => m.status === 'Advance');
      } else if (statusFilter === 'Arrears') {
        list = list.filter((m) => m.status === 'Arrears');
      } else if (statusFilter === 'Cleared') {
        list = list.filter((m) => m.status === 'Cleared');
      } else if (statusFilter === 'WithOpening') {
        list = list.filter((m) => m.openingBalance !== 0);
      } else if (statusFilter === 'WithPayments') {
        list = list.filter((m) => m.totalPaid > 0);
      }
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.ledgerNo.toLowerCase().includes(q) ||
          (m.phone || '').toLowerCase().includes(q) ||
          (m.address || '').toLowerCase().includes(q) ||
          (m.balanceNotes || '').toLowerCase().includes(q)
      );
    }

    // Sorting
    list.sort((a, b) => {
      if (sortBy === 'ledger') {
        const aNum = parseInt(a.ledgerNo.replace(/\D/g, ''), 10);
        const bNum = parseInt(b.ledgerNo.replace(/\D/g, ''), 10);
        if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
        return a.ledgerNo.localeCompare(b.ledgerNo);
      }
      if (sortBy === 'name') {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === 'balanceDesc') {
        return b.effectiveBalance - a.effectiveBalance;
      }
      if (sortBy === 'balanceAsc') {
        return a.effectiveBalance - b.effectiveBalance;
      }
      if (sortBy === 'paidDesc') {
        return b.totalPaid - a.totalPaid;
      }
      return 0;
    });

    return list;
  }, [allMemberBalances, statusFilter, searchQuery, sortBy]);

  // Subtotals of the displayed list
  const displayedSubtotals = useMemo(() => {
    let sumOpening = 0;
    let sumPaid = 0;
    let sumEffective = 0;
    let sumReceipts = 0;

    displayedBalances.forEach((m) => {
      sumOpening += m.openingBalance;
      sumPaid += m.totalPaid;
      sumEffective += m.effectiveBalance;
      sumReceipts += m.receiptsCount;
    });

    return { sumOpening, sumPaid, sumEffective, sumReceipts };
  }, [displayedBalances]);

  if (!isOpen) return null;

  const handlePrint = () => {
    printAllMembersBalancePDF(displayedBalances, settings.organizationName, {
      orientation,
      sessionTag: settings.sessionTag,
      subTitle: settings.subTitle,
      filterLabel: statusFilter === 'All' ? 'All Registered Members' : `Filtered: ${statusFilter}`,
    });
    if (showToast) showToast('Opened All Members Balance PDF statement for printing.');
  };

  const handleExportExcel = () => {
    exportAllMembersBalanceExcel(displayedBalances, settings.organizationName);
    if (showToast) showToast('Exported All Members Balance report to Excel.');
  };

  const handleShareWhatsApp = () => {
    const text = `*${settings.organizationName || 'Fallah Behbood Committee'}*\n` +
      `📋 *ALL MEMBERS BALANCE & AUDIT STATEMENT*\n` +
      `Session: ${settings.sessionTag || '2026–27'}\n` +
      `-----------------------------------------\n` +
      `👥 Total Members: ${stats.totalMembers}\n` +
      `🟢 Active Payers: ${stats.activePayers}\n` +
      `💰 Manual Opening Balances: ${formatMoney(stats.totalOpening)}\n` +
      `📥 Total Collections Paid: ${formatMoney(stats.totalPaid)}\n` +
      `🌟 Net Effective Balance: ${formatMoney(stats.totalEffective)}\n` +
      `🧾 Total Receipts Count: ${stats.totalReceipts}\n` +
      `-----------------------------------------\n` +
      `Generated on: ${fmtDate(todayISO())}`;

    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 md:p-6 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[92vh] flex flex-col relative overflow-hidden">
        {/* Header */}
        <div className="p-4 md:p-5 border-b border-slate-200 bg-slate-50/80 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-600 text-white rounded-xl shadow-xs">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base md:text-lg font-bold text-slate-900 flex items-center gap-2">
                <span>All Members Balance & Audit Statement</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full">
                  PDF & Ledger
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                {settings.organizationName || 'Fallah Behbood Committee'} • Real-time auto-updating balances with manual baseline support
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center flex-wrap gap-2">
            <div className="flex items-center bg-slate-200/80 p-0.5 rounded-lg text-xs font-semibold">
              <button
                onClick={() => setOrientation('portrait')}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  orientation === 'portrait' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Portrait
              </button>
              <button
                onClick={() => setOrientation('landscape')}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  orientation === 'landscape' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Landscape
              </button>
            </div>

            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer"
              title="Print / Save PDF"
            >
              <Printer className="w-4 h-4" />
              <span>Print / PDF</span>
            </button>

            <button
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 transition-colors cursor-pointer"
              title="Export Excel"
            >
              <Download className="w-3.5 h-3.5 text-slate-600" />
              <span>Excel</span>
            </button>

            <button
              onClick={handleShareWhatsApp}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-lg border border-emerald-200 transition-colors cursor-pointer"
              title="Share on WhatsApp"
            >
              <Share2 className="w-3.5 h-3.5 text-emerald-600" />
              <span className="hidden sm:inline">WhatsApp</span>
            </button>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer ml-1"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Executive Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 p-4 bg-slate-100/70 border-b border-slate-200">
          <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Members</div>
            <div className="text-base font-extrabold text-slate-900 mt-0.5">{stats.totalMembers}</div>
            <div className="text-[10px] text-slate-400">{stats.activePayers} active payers</div>
          </div>

          <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Manual Opening</div>
            <div className={`text-base font-extrabold mt-0.5 font-mono ${stats.totalOpening >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
              {formatMoney(stats.totalOpening)}
            </div>
            <div className="text-[10px] text-slate-400">Baseline balance</div>
          </div>

          <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Paid (Auto)</div>
            <div className="text-base font-extrabold text-emerald-700 mt-0.5 font-mono">
              {formatMoney(stats.totalPaid)}
            </div>
            <div className="text-[10px] text-emerald-600 font-medium">{stats.totalReceipts} receipts recorded</div>
          </div>

          <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Effective Balance</div>
            <div className={`text-base font-extrabold mt-0.5 font-mono ${stats.totalEffective >= 0 ? 'text-emerald-800' : 'text-rose-800'}`}>
              {formatMoney(stats.totalEffective)}
            </div>
            <div className="text-[10px] text-slate-400">Net member funds</div>
          </div>

          <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Advance Credits</div>
            <div className="text-base font-extrabold text-emerald-600 mt-0.5">
              {stats.advanceCount} <span className="text-xs font-normal text-slate-500">members</span>
            </div>
            <div className="text-[10px] text-emerald-700">Positive balance</div>
          </div>

          <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Arrears / Due</div>
            <div className="text-base font-extrabold text-rose-600 mt-0.5">
              {stats.arrearsCount} <span className="text-xs font-normal text-slate-500">members</span>
            </div>
            <div className="text-[10px] text-rose-700">Negative balance</div>
          </div>
        </div>

        {/* Filter & Search Bar */}
        <div className="p-3 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center flex-wrap gap-2 flex-1 min-w-[280px]">
            <div className="relative flex-1 min-w-[180px] max-w-sm">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search member name, ledger #, phone..."
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-400 bg-white"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-1">
              <Filter className="w-3.5 h-3.5 text-slate-500" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              >
                <option value="All">All Members ({allMemberBalances.length})</option>
                <option value="Advance">Advance Balance ({stats.advanceCount})</option>
                <option value="Arrears">Arrears / Due ({stats.arrearsCount})</option>
                <option value="Cleared">Cleared (0 Balance)</option>
                <option value="WithOpening">Has Manual Opening Bal</option>
                <option value="WithPayments">Has Payment Entries</option>
              </select>
            </div>

            <div className="flex items-center gap-1">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-2.5 py-1.5 border border-slate-300 rounded-lg bg-white font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-400"
              >
                <option value="ledger">Sort: Ledger No. (Asc)</option>
                <option value="name">Sort: Member Name (A-Z)</option>
                <option value="balanceDesc">Sort: Highest Live Balance</option>
                <option value="balanceAsc">Sort: Lowest / Arrears</option>
                <option value="paidDesc">Sort: Most Paid Amount</option>
              </select>
            </div>
          </div>

          <div className="text-slate-500 text-[11px] font-medium">
            Showing <strong className="text-slate-800">{displayedBalances.length}</strong> of {allMemberBalances.length} members
          </div>
        </div>

        {/* Member Table View */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-800 text-white uppercase text-[10px] tracking-wider">
                  <th className="py-2.5 px-3 text-center w-10">#</th>
                  <th className="py-2.5 px-3 w-20">Ledger #</th>
                  <th className="py-2.5 px-3">Member Details</th>
                  <th className="py-2.5 px-3 text-right">Monthly Due</th>
                  <th className="py-2.5 px-3 text-right">Opening Bal. (Manual)</th>
                  <th className="py-2.5 px-3 text-right">Total Paid (Auto)</th>
                  <th className="py-2.5 px-3 text-center">Receipts</th>
                  <th className="py-2.5 px-3">Last Payment</th>
                  <th className="py-2.5 px-3 text-right">Effective Balance</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-2 text-center w-16">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {displayedBalances.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-8 text-center text-slate-500">
                      No members matched the filter criteria.
                    </td>
                  </tr>
                ) : (
                  displayedBalances.map((item, idx) => {
                    const isPositive = item.effectiveBalance > 0;
                    const isNegative = item.effectiveBalance < 0;

                    return (
                      <tr key={item.ledgerNo} className="hover:bg-slate-50 transition-colors">
                        <td className="py-2.5 px-3 text-center text-slate-400 font-mono text-[11px]">
                          {idx + 1}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                          #{item.ledgerNo}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-900">{item.name}</div>
                          {item.phone && <div className="text-[10px] text-slate-500">📱 {item.phone}</div>}
                          {item.balanceNotes && (
                            <div className="text-[10px] text-amber-700 italic">Note: {item.balanceNotes}</div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                          {formatMoney(item.monthlyDue)}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => onEditMemberBalance && onEditMemberBalance(item.member)}
                            className={`font-mono font-semibold hover:underline cursor-pointer ${
                              item.openingBalance > 0
                                ? 'text-emerald-700'
                                : item.openingBalance < 0
                                ? 'text-rose-700'
                                : 'text-slate-400'
                            }`}
                            title="Click to edit manual opening balance"
                          >
                            {item.openingBalance !== 0 ? formatMoney(item.openingBalance) : 'Rs. 0'}
                          </button>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-800">
                          {formatMoney(item.totalPaid)}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono text-slate-600">
                          {item.receiptsCount > 0 ? (
                            <span className="px-1.5 py-0.5 bg-slate-100 rounded text-[11px]">
                              {item.receiptsCount}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 whitespace-nowrap text-[11px]">
                          {item.lastPaymentDate ? fmtDate(item.lastPaymentDate) : <span className="text-slate-400">None</span>}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-extrabold">
                          <span
                            className={`px-2 py-0.5 rounded text-xs ${
                              isPositive
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : isNegative
                                ? 'bg-rose-50 text-rose-800 border border-rose-200'
                                : 'text-slate-700'
                            }`}
                          >
                            {formatMoney(item.effectiveBalance)}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {item.status === 'Advance' && (
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-bold text-[10px] rounded-full">
                              Advance
                            </span>
                          )}
                          {item.status === 'Arrears' && (
                            <span className="px-2 py-0.5 bg-rose-100 text-rose-800 font-bold text-[10px] rounded-full">
                              Arrears
                            </span>
                          )}
                          {item.status === 'Cleared' && (
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-700 font-bold text-[10px] rounded-full">
                              Cleared
                            </span>
                          )}
                          {item.status === 'Active' && (
                            <span className="px-2 py-0.5 bg-sky-100 text-sky-800 font-bold text-[10px] rounded-full">
                              Active
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => onEditMemberBalance && onEditMemberBalance(item.member)}
                            className="p-1.5 text-slate-500 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                            title="Edit Manual Opening Balance"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              {displayedBalances.length > 0 && (
                <tfoot>
                  <tr className="bg-amber-50 font-bold text-slate-900 border-t-2 border-amber-300">
                    <td colSpan={3} className="py-3 px-3 text-right uppercase text-[11px]">
                      Subtotal ({displayedBalances.length} Members):
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-slate-500">—</td>
                    <td className={`py-3 px-3 text-right font-mono ${displayedSubtotals.sumOpening >= 0 ? 'text-emerald-800' : 'text-rose-800'}`}>
                      {formatMoney(displayedSubtotals.sumOpening)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-emerald-900 text-sm">
                      {formatMoney(displayedSubtotals.sumPaid)}
                    </td>
                    <td className="py-3 px-3 text-center font-mono">{displayedSubtotals.sumReceipts}</td>
                    <td className="py-3 px-3 text-slate-500">—</td>
                    <td className="py-3 px-3 text-right font-mono text-sm text-slate-900">
                      {formatMoney(displayedSubtotals.sumEffective)}
                    </td>
                    <td colSpan={2} className="py-3 px-3 text-center text-xs text-amber-900">
                      Consolidated
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3 md:p-4 border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="text-slate-500 text-[11px] flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>
              Real-time synchronization enabled. Every transaction recorded automatically recalculates member balances.
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-lg transition-colors cursor-pointer"
            >
              Close
            </button>
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Generate PDF Balance</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
