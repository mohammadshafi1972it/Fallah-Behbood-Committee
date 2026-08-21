import React, { useState, useMemo } from 'react';
import { MonthBalanceTableRow, Member, Transaction, AppSettings, MonthEndMemberBalanceItem } from '../types';
import {
  computeMonthEndMemberBalances,
  printMonthEndConsolidatedMemberPDF,
  exportMonthEndConsolidatedMemberExcel,
  formatMoney,
  fmtDate,
  isLedger131,
} from '../lib/ledgerUtils';
import {
  X,
  Printer,
  Download,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  FileSpreadsheet,
  Users,
  ShieldCheck,
  Calendar,
  Sparkles,
  ArrowUpDown,
} from 'lucide-react';

interface ConsolidatedMonthEndMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  monthRow: MonthBalanceTableRow | null;
  members: Member[];
  transactions: Transaction[];
  settings: AppSettings;
  showToast: (msg: string) => void;
}

export const ConsolidatedMonthEndMemberModal: React.FC<ConsolidatedMonthEndMemberModalProps> = ({
  isOpen,
  onClose,
  monthRow,
  members,
  transactions,
  settings,
  showToast,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'PaidUp' | 'Advance' | 'Arrears' | 'Ledger131'>('All');
  const [sortBy, setSortBy] = useState<'ledger_asc' | 'paid_desc' | 'due_desc' | 'balance_desc' | 'name_asc'>('ledger_asc');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');

  const consolidatedList = useMemo<MonthEndMemberBalanceItem[]>(() => {
    if (!monthRow) return [];
    return computeMonthEndMemberBalances(
      members,
      transactions,
      monthRow.month,
      settings.memberBalanceOverrides
    );
  }, [monthRow, members, transactions, settings.memberBalanceOverrides]);

  const filteredAndSortedList = useMemo(() => {
    let list = consolidatedList;

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (m) => m.name.toLowerCase().includes(q) || m.ledgerNo.toLowerCase().includes(q)
      );
    }

    if (statusFilter === 'PaidUp') {
      list = list.filter((m) => m.monthEndStatus === 'Paid Up (Nil)' || m.isFullYearPaid || m.isPaidUp);
    } else if (statusFilter === 'Advance') {
      list = list.filter((m) => m.monthEndStatus === 'Advance' || m.monthEndEffectiveBalance > 0);
    } else if (statusFilter === 'Arrears') {
      list = list.filter((m) => m.monthEndStatus === 'Arrears' || m.monthEndEffectiveBalance < 0);
    } else if (statusFilter === 'Ledger131') {
      list = list.filter((m) => isLedger131(m.ledgerNo));
    }

    return [...list].sort((a, b) => {
      if (sortBy === 'ledger_asc') return (parseInt(a.ledgerNo, 10) || 0) - (parseInt(b.ledgerNo, 10) || 0);
      if (sortBy === 'paid_desc') return b.cumulativePaidToDate - a.cumulativePaidToDate;
      if (sortBy === 'due_desc') return b.cumulativeDueToDate - a.cumulativeDueToDate;
      if (sortBy === 'balance_desc') return b.monthEndEffectiveBalance - a.monthEndEffectiveBalance;
      if (sortBy === 'name_asc') return a.name.localeCompare(b.name);
      return 0;
    });
  }, [consolidatedList, searchQuery, statusFilter, sortBy]);

  // Overall KPIs
  const kpis = useMemo(() => {
    let grandDue = 0;
    let grandPaid = 0;
    let grandAnnual = 0;
    let paidUpCount = 0;
    let advanceCount = 0;
    let arrearsCount = 0;

    consolidatedList.forEach((m) => {
      grandDue += m.cumulativeDueToDate;
      grandPaid += m.cumulativePaidToDate;
      grandAnnual += m.annualDue;
      if (m.monthEndStatus === 'Paid Up (Nil)' || m.isFullYearPaid || m.isPaidUp) {
        paidUpCount++;
      } else if (m.monthEndStatus === 'Advance' || m.monthEndEffectiveBalance > 0) {
        advanceCount++;
      } else if (m.monthEndStatus === 'Arrears' || m.monthEndEffectiveBalance < 0) {
        arrearsCount++;
      }
    });

    return {
      grandDue,
      grandPaid,
      grandAnnual,
      paidUpCount,
      advanceCount,
      arrearsCount,
      netDifference: grandPaid - grandDue,
    };
  }, [consolidatedList]);

  if (!isOpen || !monthRow) return null;

  const handlePrintPDF = () => {
    printMonthEndConsolidatedMemberPDF(
      monthRow,
      filteredAndSortedList,
      settings.organizationName,
      {
        orientation,
        sessionTag: 'Session 2026–27',
        subTitle: 'Consolidated Member Financial Statement — Pampore',
        filterLabel: `Consolidated as of ${monthRow.monthLabel} (${statusFilter !== 'All' ? statusFilter : 'All Members'})`,
      }
    );
    showToast(`Generating Consolidated PDF for ${monthRow.monthLabel}...`);
  };

  const handleExportExcel = () => {
    exportMonthEndConsolidatedMemberExcel(
      monthRow,
      filteredAndSortedList,
      settings.organizationName
    );
    showToast(`Exported ${monthRow.monthLabel} Member Balances to Excel.`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white w-full max-w-6xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-amber-950 p-4 sm:p-5 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/20 border border-amber-400/30 rounded-xl text-amber-300">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold font-serif">
                  Consolidated Member Balance Statement
                </h2>
                <span className="bg-amber-500/20 text-amber-300 border border-amber-400/30 text-[10px] font-mono px-2 py-0.5 rounded-full font-bold">
                  {monthRow.monthLabel}
                </span>
              </div>
              <p className="text-xs text-slate-300">
                12-Month Target: Rs. 1,800/yr (@150/mo) • Ledger #131: Rs. 3,600/yr (@300/mo) • Auto-calculated Paid Upto
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Top KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 p-4 bg-slate-50 border-b border-slate-200">
          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] uppercase font-bold text-slate-500 block">Total Members</span>
            <span className="text-base font-bold font-mono text-slate-900">{consolidatedList.length}</span>
          </div>

          <div className="bg-white p-3 rounded-xl border border-emerald-200 shadow-2xs">
            <span className="text-[10px] uppercase font-bold text-emerald-700 block">Paid Up / Cleared</span>
            <span className="text-base font-bold font-mono text-emerald-800">
              {kpis.paidUpCount} <span className="text-xs font-normal text-slate-500">/ {consolidatedList.length}</span>
            </span>
          </div>

          <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-2xs">
            <span className="text-[10px] uppercase font-bold text-slate-500 block">Due Upto Month End</span>
            <span className="text-base font-bold font-mono text-slate-700">{formatMoney(kpis.grandDue)}</span>
          </div>

          <div className="bg-white p-3 rounded-xl border border-emerald-200 shadow-2xs">
            <span className="text-[10px] uppercase font-bold text-emerald-700 block">Total Collected to Date</span>
            <span className="text-base font-bold font-mono text-emerald-700">{formatMoney(kpis.grandPaid)}</span>
          </div>

          <div className="bg-white p-3 rounded-xl border border-amber-200 shadow-2xs col-span-2 sm:col-span-1">
            <span className="text-[10px] uppercase font-bold text-amber-800 block">Pending Arrears</span>
            <span className="text-base font-bold font-mono text-rose-700">{kpis.arrearsCount} Members</span>
          </div>
        </div>

        {/* Toolbar & Filters */}
        <div className="p-4 bg-white border-b border-slate-200 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 flex-1">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search member by name or ledger #..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-slate-800 bg-slate-50/50"
              />
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-500 font-medium whitespace-nowrap">Filter:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="bg-transparent font-semibold text-slate-800 focus:outline-none cursor-pointer text-xs"
              >
                <option value="All">All Members ({consolidatedList.length})</option>
                <option value="PaidUp">Paid Up / Cleared</option>
                <option value="Advance">Advance Paid</option>
                <option value="Arrears">Pending Arrears</option>
                <option value="Ledger131">Ledger #131 (@300/mo)</option>
              </select>
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-500 font-medium whitespace-nowrap">Sort:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-transparent font-semibold text-slate-800 focus:outline-none cursor-pointer text-xs"
              >
                <option value="ledger_asc">Ledger No. (1, 2, 3...)</option>
                <option value="paid_desc">Highest Paid to Date</option>
                <option value="due_desc">Highest Due</option>
                <option value="balance_desc">Highest Balance</option>
                <option value="name_asc">Name (A–Z)</option>
              </select>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1 bg-slate-50 px-2 py-1 border border-slate-200 rounded-lg text-xs">
              <span className="text-slate-500 font-medium text-[11px]">PDF:</span>
              <label className="inline-flex items-center gap-1 cursor-pointer">
                <input
                  type="radio"
                  name="con-pdf-orient"
                  value="portrait"
                  checked={orientation === 'portrait'}
                  onChange={() => setOrientation('portrait')}
                  className="accent-slate-800"
                />
                <span className="text-[11px] font-medium text-slate-700">Port</span>
              </label>
              <label className="inline-flex items-center gap-1 cursor-pointer ml-1">
                <input
                  type="radio"
                  name="con-pdf-orient"
                  value="landscape"
                  checked={orientation === 'landscape'}
                  onChange={() => setOrientation('landscape')}
                  className="accent-slate-800"
                />
                <span className="text-[11px] font-medium text-slate-700">Land</span>
              </label>
            </div>

            <button
              onClick={handleExportExcel}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              title="Export to Excel Spreadsheet (.xlsx)"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Excel (.xlsx)</span>
            </button>

            <button
              onClick={handlePrintPDF}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors cursor-pointer shadow-xs"
              title="Print High-Fidelity Consolidated Month-End PDF Statement"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Month-End PDF</span>
            </button>
          </div>
        </div>

        {/* Consolidated Table */}
        <div className="flex-1 overflow-auto p-4">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-800 text-white font-serif uppercase tracking-wider text-[10px] sticky top-0 shadow-xs">
              <tr>
                <th className="py-2.5 px-3 text-center w-10">#</th>
                <th className="py-2.5 px-3">Ledger #</th>
                <th className="py-2.5 px-3">Member Name</th>
                <th className="py-2.5 px-3 text-right">Monthly Rate (12M Total)</th>
                <th className="py-2.5 px-3 text-right">Due Upto {monthRow.monthLabel}</th>
                <th className="py-2.5 px-3 text-right">Paid to Date</th>
                <th className="py-2.5 px-3 text-center">Paid Upto (Months)</th>
                <th className="py-2.5 px-3 text-right">Month-End Balance</th>
                <th className="py-2.5 px-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans">
              {filteredAndSortedList.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400 font-sans">
                    No members match the selected criteria.
                  </td>
                </tr>
              ) : (
                filteredAndSortedList.map((m, idx) => {
                  const is131 = isLedger131(m.ledgerNo);
                  const isNil = (m.isPaidUp || m.monthEndStatus === 'Paid Up (Nil)') && m.showNilBalanceWhenPaid && m.monthEndEffectiveBalance <= 0;
                  const isPositive = m.monthEndEffectiveBalance > 0;
                  const isNegative = m.monthEndEffectiveBalance < 0;

                  return (
                    <tr
                      key={m.ledgerNo}
                      className={`hover:bg-amber-50/40 transition-colors ${
                        is131 ? 'bg-amber-50/30' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3 text-center text-slate-400 font-mono text-[11px]">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900">
                        <span>#{m.ledgerNo}</span>
                        {is131 && (
                          <span className="ml-1.5 text-[9px] font-sans font-bold bg-amber-100 text-amber-900 border border-amber-300 px-1.5 py-0.5 rounded">
                            @300/m
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-slate-900">
                        {m.name}
                        {m.phone && (
                          <span className="block text-[10px] text-slate-400 font-normal font-mono">
                            📱 {m.phone}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                        {formatMoney(m.monthlyDue)}/m
                        <span className="block text-[10px] text-slate-400">
                          (Target: {formatMoney(m.annualDue)})
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                        {formatMoney(m.cumulativeDueToDate)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-800">
                        {formatMoney(m.cumulativePaidToDate)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold font-mono ${
                            m.isFullYearPaid
                              ? 'bg-teal-100 text-teal-900 border border-teal-300'
                              : 'bg-slate-100 text-slate-800'
                          }`}
                          title={m.paidUptoText}
                        >
                          {m.paidUptoBadge}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold">
                        {isNil ? (
                          <span className="text-teal-700 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded text-[11px]">
                            Nil (Paid Up)
                          </span>
                        ) : isPositive ? (
                          <span className="text-emerald-700">
                            +{formatMoney(m.monthEndEffectiveBalance)}
                          </span>
                        ) : isNegative ? (
                          <span className="text-rose-700">
                            -{formatMoney(Math.abs(m.monthEndEffectiveBalance))}
                          </span>
                        ) : (
                          <span className="text-slate-600">{formatMoney(0)}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            m.monthEndStatus === 'Paid Up (Nil)' || isNil
                              ? 'bg-teal-100 text-teal-800 border border-teal-200'
                              : m.monthEndStatus === 'Advance'
                              ? 'bg-emerald-100 text-emerald-800'
                              : m.monthEndStatus === 'Arrears'
                              ? 'bg-rose-100 text-rose-800'
                              : m.monthEndStatus === 'Cleared'
                              ? 'bg-slate-100 text-slate-700'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {m.monthEndStatus}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {filteredAndSortedList.length > 0 && (
              <tfoot className="bg-amber-50/70 border-t-2 border-amber-300 font-mono font-bold text-[11px]">
                <tr>
                  <td colSpan={3} className="py-3 px-3 text-right uppercase font-sans">
                    Grand Total ({filteredAndSortedList.length} Members):
                  </td>
                  <td className="py-3 px-3 text-right">{formatMoney(kpis.grandAnnual)}</td>
                  <td className="py-3 px-3 text-right">{formatMoney(kpis.grandDue)}</td>
                  <td className="py-3 px-3 text-right text-emerald-800">{formatMoney(kpis.grandPaid)}</td>
                  <td className="py-3 px-3 text-center text-teal-800">{kpis.paidUpCount} Paid Up</td>
                  <td className="py-3 px-3 text-right text-slate-900">
                    {formatMoney(kpis.netDifference)}
                  </td>
                  <td className="py-3 px-3 text-center text-slate-600 font-sans">AUDITED</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Modal Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
          <div>
            Showing <strong className="text-slate-800">{filteredAndSortedList.length}</strong> of{' '}
            <strong className="text-slate-800">{consolidatedList.length}</strong> members
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
