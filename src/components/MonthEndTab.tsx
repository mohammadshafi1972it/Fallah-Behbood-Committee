import React, { useState, useMemo } from 'react';
import { Transaction, Member, AppSettings, MonthBalanceTableRow, MonthBalanceConfig } from '../types';
import { 
  computeMonthBalanceTable, 
  calculateContributionsForMonth, 
  formatMoney, 
  num, 
  exportCsv, 
  fmtDate, 
  findMember,
  getMonthLabel
} from '../lib/ledgerUtils';
import { 
  Calendar, 
  Download, 
  CheckCircle, 
  AlertCircle, 
  Wallet, 
  Bell, 
  Send, 
  MessageSquare, 
  Edit3, 
  Calculator, 
  Sparkles, 
  TrendingUp, 
  TrendingDown, 
  ShieldCheck, 
  AlertTriangle,
  FileSpreadsheet,
  Building2,
  Banknote
} from 'lucide-react';
import { SendReminderModal, OverdueMemberItem } from './SendReminderModal';
import { MonthBalanceReportModal } from './MonthBalanceReportModal';
import { ManualMonthBalanceModal } from './ManualMonthBalanceModal';
import { ConsolidatedMonthEndMemberModal } from './ConsolidatedMonthEndMemberModal';
import { Users, FileText } from 'lucide-react';

interface MonthEndTabProps {
  transactions: Transaction[];
  members: Member[];
  settings: AppSettings;
  onUpdateMonthBalanceConfig: (month: string, config: MonthBalanceConfig) => void;
  showToast: (msg: string) => void;
}

export const MonthEndTab: React.FC<MonthEndTabProps> = ({
  transactions,
  members,
  settings,
  onUpdateMonthBalanceConfig,
  showToast,
}) => {
  // Compute Month Balance Table with automatic sequential carryover & manual overrides
  const monthBalanceRows = useMemo(
    () => computeMonthBalanceTable(transactions, settings.openingBalance, settings.monthBalances),
    [transactions, settings.openingBalance, settings.monthBalances]
  );

  const availableMonths = useMemo(() => monthBalanceRows.map((r) => r.month), [monthBalanceRows]);

  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    return availableMonths.length > 0 ? availableMonths[availableMonths.length - 1] : new Date().toISOString().slice(0, 7);
  });

  // Keep selectedMonth updated if available months change
  const currentMonthRow = useMemo(() => {
    return monthBalanceRows.find((r) => r.month === selectedMonth) || monthBalanceRows[monthBalanceRows.length - 1] || {
      month: selectedMonth,
      monthLabel: getMonthLabel(selectedMonth),
      openingBalance: num(settings.openingBalance),
      income: 0,
      incomeCount: 0,
      expenditure: 0,
      expenditureCount: 0,
      net: 0,
      autoBalance: num(settings.openingBalance),
      effectiveBalance: num(settings.openingBalance),
      mode: 'auto',
      variance: 0,
      isReconciled: true,
    };
  }, [monthBalanceRows, selectedMonth, settings.openingBalance]);

  // Payments for selected month
  const monthlyPayments = useMemo(() => {
    if (!selectedMonth) return [];
    return transactions
      .filter((t) => t.type === 'Expenditure' && t.date && t.date.slice(0, 7) === selectedMonth)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [transactions, selectedMonth]);

  // Contributions for selected month
  const [isReminderModalOpen, setIsReminderModalOpen] = useState(false);
  const [singleTargetMember, setSingleTargetMember] = useState<OverdueMemberItem | null>(null);

  // WhatsApp Report & Manual Entry Modals
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const [targetReportMonthRow, setTargetReportMonthRow] = useState<MonthBalanceTableRow | null>(null);

  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [targetManualMonthRow, setTargetManualMonthRow] = useState<MonthBalanceTableRow | null>(null);

  // Consolidated Month-End Member Balance Statement Modal
  const [isConsolidatedModalOpen, setIsConsolidatedModalOpen] = useState(false);
  const [targetConsolidatedMonthRow, setTargetConsolidatedMonthRow] = useState<MonthBalanceTableRow | null>(null);

  const handleOpenConsolidatedReport = (row: MonthBalanceTableRow) => {
    setTargetConsolidatedMonthRow(row);
    setIsConsolidatedModalOpen(true);
  };

  const memberContributions = useMemo(() => {
    return calculateContributionsForMonth(members, transactions, selectedMonth);
  }, [members, transactions, selectedMonth]);

  const overdueMembersList = useMemo<OverdueMemberItem[]>(() => {
    return memberContributions
      .filter((c) => c.status !== 'Paid')
      .map((c) => {
        const m = findMember(members, c.ledgerNo);
        return {
          ledgerNo: c.ledgerNo,
          name: c.name,
          outstanding: Math.max(0, c.expected - c.paid),
          month: selectedMonth,
          phone: m?.phone,
          status: c.status === 'Partial' ? 'Partial' : 'Due',
        };
      });
  }, [memberContributions, members, selectedMonth]);

  const contribPaidCount = useMemo(
    () => memberContributions.filter((c) => c.status === 'Paid').length,
    [memberContributions]
  );

  const contribDueCount = useMemo(
    () => memberContributions.length - contribPaidCount,
    [memberContributions]
  );

  const totalCollected = useMemo(
    () => memberContributions.reduce((s, c) => s + c.paid, 0),
    [memberContributions]
  );

  const totalExpected = useMemo(
    () => memberContributions.reduce((s, c) => s + c.expected, 0),
    [memberContributions]
  );

  // Overall Financial Stats across all recorded months
  const overallIncome = useMemo(() => monthBalanceRows.reduce((s, r) => s + r.income, 0), [monthBalanceRows]);
  const overallExpenditure = useMemo(() => monthBalanceRows.reduce((s, r) => s + r.expenditure, 0), [monthBalanceRows]);
  const latestClosingBalance = useMemo(
    () => (monthBalanceRows.length > 0 ? monthBalanceRows[monthBalanceRows.length - 1].effectiveBalance : num(settings.openingBalance)),
    [monthBalanceRows, settings.openingBalance]
  );

  const handleOpenWhatsAppReport = (row: MonthBalanceTableRow) => {
    setTargetReportMonthRow(row);
    setIsWhatsAppModalOpen(true);
  };

  const handleOpenManualEntry = (row: MonthBalanceTableRow) => {
    setTargetManualMonthRow(row);
    setIsManualModalOpen(true);
  };

  const handleExportMonthBalancesCsv = () => {
    exportCsv(
      [
        'Month',
        'Month Name',
        'Opening Balance',
        'Income',
        'Income Count',
        'Expenditure',
        'Expenditure Count',
        'Net Surplus/Deficit',
        'Auto Calculated Balance',
        'Mode',
        'Effective Closing Balance',
        'Cash in Hand',
        'Bank Balance',
        'Variance',
        'Reconciled Status',
        'Audited By',
        'Notes',
      ],
      monthBalanceRows.map((r) => [
        r.month,
        r.monthLabel,
        r.openingBalance,
        r.income,
        r.incomeCount,
        r.expenditure,
        r.expenditureCount,
        r.net,
        r.autoBalance,
        r.mode === 'manual' ? 'Manual' : 'Automatic',
        r.effectiveBalance,
        r.cashInHand || '',
        r.bankBalance || '',
        r.variance,
        r.isReconciled ? 'Reconciled' : 'Discrepancy',
        r.verifiedBy || '',
        r.notes || '',
      ]),
      `Fallah_Behbood_Month_Balances_${new Date().toISOString().split('T')[0]}.csv`
    );
    showToast('Month Balances exported to CSV successfully.');
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="p-1.5 bg-emerald-50 text-emerald-700 rounded-lg">
              <Calendar className="w-5 h-5" />
            </span>
            <h2 className="text-base font-bold text-slate-900">
              Month Balance & Financial Statements
            </h2>
          </div>
          <p className="text-xs text-slate-500">
            Automated month-end balance tracking, manual physical audit adjustments, and instant WhatsApp report sharing.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Consolidated Member Balance List for Selected Month */}
          <button
            onClick={() => handleOpenConsolidatedReport(currentMonthRow)}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-all shadow-2xs cursor-pointer hover:shadow-xs"
            title="Generate consolidated balance list for all members as of month end"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-200" />
            <span>Consolidated Member Balances ({currentMonthRow.monthLabel})</span>
          </button>

          {/* Quick WhatsApp Report for Selected Month */}
          <button
            onClick={() => handleOpenWhatsAppReport(currentMonthRow)}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-bold text-white bg-[#25D366] hover:bg-[#1EBE5D] rounded-lg transition-all shadow-2xs cursor-pointer hover:shadow-xs"
          >
            <MessageSquare className="w-4 h-4" />
            <span>WhatsApp Report</span>
          </button>

          {/* Quick Manual Entry for Selected Month */}
          <button
            onClick={() => handleOpenManualEntry(currentMonthRow)}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors shadow-2xs cursor-pointer"
          >
            <Edit3 className="w-4 h-4 text-amber-600" />
            <span>
              {currentMonthRow.mode === 'manual' ? 'Edit Manual Balance' : 'Set Manual Balance'}
            </span>
          </button>

          {/* Export CSV */}
          <button
            onClick={handleExportMonthBalancesCsv}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
            title="Download Month Balances CSV"
          >
            <Download className="w-4 h-4 text-slate-600" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
        </div>
      </div>

      {/* Financial Health Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold block mb-1">
            Opening Balance (Session)
          </span>
          <span className="text-lg sm:text-xl font-bold text-slate-900 font-mono">
            {formatMoney(settings.openingBalance)}
          </span>
          <p className="text-[10px] text-slate-400 mt-1">Starting treasury reserve</p>
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs">
          <span className="text-[10px] text-emerald-800 uppercase tracking-wider font-bold block mb-1 flex items-center gap-1">
            <TrendingUp className="w-3 h-3 text-emerald-600" />
            <span>Total Collections</span>
          </span>
          <span className="text-lg sm:text-xl font-bold text-emerald-700 font-mono">
            {formatMoney(overallIncome)}
          </span>
          <p className="text-[10px] text-slate-400 mt-1">Across all recorded months</p>
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs">
          <span className="text-[10px] text-rose-800 uppercase tracking-wider font-bold block mb-1 flex items-center gap-1">
            <TrendingDown className="w-3 h-3 text-rose-600" />
            <span>Total Payments</span>
          </span>
          <span className="text-lg sm:text-xl font-bold text-rose-700 font-mono">
            {formatMoney(overallExpenditure)}
          </span>
          <p className="text-[10px] text-slate-400 mt-1">Total vouchers disbursed</p>
        </div>

        <div className="bg-white border border-emerald-200 p-4 rounded-xl shadow-xs bg-emerald-50/20">
          <span className="text-[10px] text-emerald-900 uppercase tracking-wider font-bold block mb-1 flex items-center justify-between">
            <span>Effective Closing Balance</span>
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
          </span>
          <span className="text-lg sm:text-xl font-bold text-slate-900 font-mono">
            {formatMoney(latestClosingBalance)}
          </span>
          <p className="text-[10px] text-emerald-700 font-semibold mt-1">
            Net Surplus: {overallIncome >= overallExpenditure ? '+' : ''}
            {formatMoney(overallIncome - overallExpenditure)}
          </p>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. MASTER TABLE OF MONTH BALANCES (Automatic + Manual Entry with WhatsApp) */}
      {/* ========================================================================= */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-serif font-bold text-slate-900 flex items-center gap-2">
              <span>Month Balance Master Table</span>
              <span className="text-[10px] font-sans font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full">
                {monthBalanceRows.length} Months Tracked
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Click any month row to view itemized transactions or use the action buttons to share WhatsApp reports and configure manual balances.
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1 text-[11px] text-slate-600 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              <span>⚡ Automatic</span>
            </span>
            <span className="flex items-center gap-1 text-[11px] text-slate-600 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
              <span className="w-2 h-2 rounded-full bg-amber-500"></span>
              <span>✍️ Manual Override</span>
            </span>
          </div>
        </div>

        <div className="border border-slate-200 rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-800 text-white font-serif uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-3">Month</th>
                <th className="py-3 px-3">Opening (Rs.)</th>
                <th className="py-3 px-3">Income / Collections</th>
                <th className="py-3 px-3">Expenditures</th>
                <th className="py-3 px-3">Net Movement</th>
                <th className="py-3 px-3">Auto Calculated</th>
                <th className="py-3 px-3">Mode & Closing Balance</th>
                <th className="py-3 px-3 text-center">Status</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {monthBalanceRows.map((r) => {
                const isSelected = r.month === selectedMonth;
                const isManual = r.mode === 'manual';

                return (
                  <tr
                    key={r.month}
                    onClick={() => setSelectedMonth(r.month)}
                    className={`transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-amber-50/70 font-semibold'
                        : 'hover:bg-slate-50/80'
                    }`}
                  >
                    {/* Month Label */}
                    <td className="py-3 px-3 font-sans">
                      <div className="flex items-center gap-1.5">
                        {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"></span>}
                        <span className="font-bold text-slate-900">{r.monthLabel}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono block">{r.month}</span>
                    </td>

                    {/* Opening Balance */}
                    <td className="py-3 px-3 text-slate-700">{formatMoney(r.openingBalance)}</td>

                    {/* Income */}
                    <td className="py-3 px-3">
                      <span className="text-emerald-700 font-bold">+{formatMoney(r.income)}</span>
                      <span className="text-[10px] text-slate-400 block font-sans">
                        {r.incomeCount} {r.incomeCount === 1 ? 'entry' : 'entries'}
                      </span>
                    </td>

                    {/* Expenditure */}
                    <td className="py-3 px-3">
                      <span className="text-rose-700 font-bold">-{formatMoney(r.expenditure)}</span>
                      <span className="text-[10px] text-slate-400 block font-sans">
                        {r.expenditureCount} {r.expenditureCount === 1 ? 'voucher' : 'vouchers'}
                      </span>
                    </td>

                    {/* Net Surplus / Deficit */}
                    <td className="py-3 px-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${
                          r.net >= 0
                            ? 'bg-emerald-100/70 text-emerald-800'
                            : 'bg-rose-100/70 text-rose-800'
                        }`}
                      >
                        {r.net >= 0 ? '+' : ''}
                        {formatMoney(r.net)}
                      </span>
                    </td>

                    {/* Auto Calculated Balance */}
                    <td className="py-3 px-3 text-slate-600 font-mono">{formatMoney(r.autoBalance)}</td>

                    {/* Effective Balance & Mode */}
                    <td className="py-3 px-3">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`px-1.5 py-0.5 rounded text-[9px] font-sans font-bold uppercase tracking-wider ${
                            isManual
                              ? 'bg-amber-100 text-amber-900 border border-amber-300'
                              : 'bg-emerald-100 text-emerald-900'
                          }`}
                        >
                          {isManual ? 'Manual' : 'Auto'}
                        </span>
                        <span className="font-bold text-slate-900 text-sm">
                          {formatMoney(r.effectiveBalance)}
                        </span>
                      </div>

                      {/* Cash in Hand / Bank breakdown if manual */}
                      {isManual && (r.cashInHand !== undefined || r.bankBalance !== undefined) && (
                        <div className="text-[10px] text-slate-500 font-sans mt-0.5 space-x-1.5">
                          {r.cashInHand !== undefined && (
                            <span className="inline-flex items-center gap-0.5">
                              <Banknote className="w-2.5 h-2.5 text-emerald-700" />
                              <span>Cash: {formatMoney(r.cashInHand)}</span>
                            </span>
                          )}
                          {r.bankBalance !== undefined && (
                            <span className="inline-flex items-center gap-0.5">
                              <Building2 className="w-2.5 h-2.5 text-blue-700" />
                              <span>Bank: {formatMoney(r.bankBalance)}</span>
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Status / Variance */}
                    <td className="py-3 px-3 text-center font-sans">
                      {r.isReconciled ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-md text-[10px] font-bold">
                          <CheckCircle className="w-3 h-3 text-emerald-600" />
                          <span>Reconciled</span>
                        </span>
                      ) : (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-800 rounded-md text-[10px] font-bold border border-amber-200"
                          title={`Discrepancy between ledger calculation and physical entry: ${formatMoney(r.variance)}`}
                        >
                          <AlertTriangle className="w-3 h-3 text-amber-600" />
                          <span>Diff: {r.variance > 0 ? '+' : ''}{formatMoney(r.variance)}</span>
                        </span>
                      )}
                    </td>

                    {/* Quick Action Buttons */}
                    <td className="py-3 px-3 text-right font-sans" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Consolidated Member Balances Button */}
                        <button
                          onClick={() => handleOpenConsolidatedReport(r)}
                          className="p-1.5 text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors border border-emerald-300 cursor-pointer"
                          title="View Consolidated Member Balances as of Month End & Print PDF"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
                        </button>

                        {/* WhatsApp Report Button */}
                        <button
                          onClick={() => handleOpenWhatsAppReport(r)}
                          className="p-1.5 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors border border-emerald-200 cursor-pointer"
                          title="Generate & Share WhatsApp Report"
                        >
                          <MessageSquare className="w-3.5 h-3.5 text-[#25D366]" />
                        </button>

                        {/* Manual Entry Setup */}
                        <button
                          onClick={() => handleOpenManualEntry(r)}
                          className="p-1.5 text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-200 cursor-pointer"
                          title="Configure Auto / Manual Balance"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-amber-700" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. SELECTED MONTH DETAILS & ITEMIZATION */}
      {/* ========================================================================= */}
      <div className="bg-slate-50/50 border border-slate-200 rounded-xl p-5 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-600" />
            <label className="text-xs font-bold text-slate-800">Detailed Audit For Reporting Month:</label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="text-xs font-mono font-bold px-3 py-1.5 border border-slate-300 rounded-lg bg-white focus:outline-emerald-600 shadow-2xs"
            >
              {availableMonths.map((m) => (
                <option key={m} value={m}>
                  {getMonthLabel(m)} ({m})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleOpenConsolidatedReport(currentMonthRow)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors cursor-pointer shadow-2xs"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-200" />
              <span>Consolidated Balances Statement (PDF / Excel)</span>
            </button>

            <button
              onClick={() => handleOpenWhatsAppReport(currentMonthRow)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-emerald-800 bg-emerald-100/70 hover:bg-emerald-200 rounded-lg transition-colors cursor-pointer border border-emerald-300"
            >
              <Send className="w-3.5 h-3.5 text-emerald-700" />
              <span>Share Month Statement</span>
            </button>
          </div>
        </div>

        {/* Selected Month KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white border border-slate-200 p-3.5 rounded-xl text-center">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Opening Balance</span>
            <span className="text-base font-bold text-slate-900 font-mono">
              {formatMoney(currentMonthRow.openingBalance)}
            </span>
          </div>

          <div className="bg-white border border-slate-200 p-3.5 rounded-xl text-center">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Income This Month</span>
            <span className="text-base font-bold text-emerald-700 font-mono">
              {formatMoney(currentMonthRow.income)}
            </span>
          </div>

          <div className="bg-white border border-slate-200 p-3.5 rounded-xl text-center">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Payments This Month</span>
            <span className="text-base font-bold text-rose-700 font-mono">
              {formatMoney(currentMonthRow.expenditure)}
            </span>
          </div>

          <div className="bg-white border border-slate-200 p-3.5 rounded-xl text-center">
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block flex items-center justify-center gap-1">
              <span>Closing Balance</span>
              <span className="text-[9px] font-sans font-bold text-emerald-700">
                ({currentMonthRow.mode === 'manual' ? 'Manual' : 'Auto'})
              </span>
            </span>
            <span className="text-base font-bold text-slate-900 font-mono">
              {formatMoney(currentMonthRow.effectiveBalance)}
            </span>
          </div>
        </div>

        {/* Selected Month Expenditures List */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h3 className="text-sm font-serif font-bold text-slate-800">
              Expenditures in {currentMonthRow.monthLabel} ({monthlyPayments.length} Vouchers)
            </h3>
            <button
              onClick={() =>
                exportCsv(
                  ['Date', 'Head', 'Paid To', 'Amount', 'Voucher No', 'Mode', 'Remarks'],
                  monthlyPayments.map((t) => [
                    fmtDate(t.date),
                    t.head,
                    t.paidTo,
                    t.amount,
                    t.receiptVoucherNo,
                    t.mode,
                    t.remarks,
                  ]),
                  `Fallah_Behbood_Payments_${selectedMonth}.csv`
                )
              }
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden overflow-x-auto max-h-64 overflow-y-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-800 text-white font-serif uppercase tracking-wider text-[10px] sticky top-0">
                <tr>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Head</th>
                  <th className="py-2.5 px-3">Paid To</th>
                  <th className="py-2.5 px-3">Amount</th>
                  <th className="py-2.5 px-3">Voucher No</th>
                  <th className="py-2.5 px-3">Mode</th>
                  <th className="py-2.5 px-3">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {monthlyPayments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-8 text-center text-slate-400 font-sans">
                      No expenditure payments recorded for {currentMonthRow.monthLabel}.
                    </td>
                  </tr>
                ) : (
                  monthlyPayments.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="py-2 px-3">{fmtDate(t.date)}</td>
                      <td className="py-2 px-3 font-sans font-medium text-slate-700">{t.head}</td>
                      <td className="py-2 px-3 font-sans font-bold text-slate-900">{t.paidTo}</td>
                      <td className="py-2 px-3 font-bold text-rose-700">{formatMoney(t.amount)}</td>
                      <td className="py-2 px-3 text-slate-500">{t.receiptVoucherNo || '—'}</td>
                      <td className="py-2 px-3 text-slate-600">{t.mode || 'Cash'}</td>
                      <td className="py-2 px-3 font-sans text-slate-500">{t.remarks || '—'}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Selected Month Member Contributions */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <h3 className="text-sm font-serif font-bold text-slate-800">
              Member Subscriptions for {currentMonthRow.monthLabel}
            </h3>
            <div className="flex items-center gap-2">
              {overdueMembersList.length > 0 && (
                <button
                  onClick={() => {
                    setSingleTargetMember(null);
                    setIsReminderModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors cursor-pointer shadow-xs"
                >
                  <Bell className="w-3.5 h-3.5" />
                  <span>Send Reminders ({overdueMembersList.length})</span>
                </button>
              )}

              <button
                onClick={() =>
                  exportCsv(
                    ['Ledger No', 'Member Name', 'Expected (Rs.)', 'Paid (Rs.)', 'Status'],
                    memberContributions.map((c) => [c.ledgerNo, c.name, c.expected, c.paid, c.status]),
                    `Fallah_Behbood_Contributions_${selectedMonth}.csv`
                  )
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl">
              <span className="text-[10px] text-emerald-800 uppercase font-bold block">Members Paid</span>
              <span className="text-base font-bold text-emerald-900 font-mono">{contribPaidCount}</span>
            </div>

            <div className="bg-rose-50 border border-rose-200 p-3 rounded-xl">
              <span className="text-[10px] text-rose-800 uppercase font-bold block">Members Due</span>
              <span className="text-base font-bold text-rose-900 font-mono">{contribDueCount}</span>
            </div>

            <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
              <span className="text-[10px] text-slate-600 uppercase font-bold block">Total Collected</span>
              <span className="text-base font-bold text-emerald-700 font-mono">{formatMoney(totalCollected)}</span>
            </div>

            <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
              <span className="text-[10px] text-slate-600 uppercase font-bold block">Total Expected</span>
              <span className="text-base font-bold text-slate-800 font-mono">{formatMoney(totalExpected)}</span>
            </div>
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden overflow-x-auto max-h-72 overflow-y-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-800 text-white font-serif uppercase tracking-wider text-[10px] sticky top-0">
                <tr>
                  <th className="py-2.5 px-3">Ledger No</th>
                  <th className="py-2.5 px-3">Member Name</th>
                  <th className="py-2.5 px-3">Expected Rate</th>
                  <th className="py-2.5 px-3">Amount Paid</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {memberContributions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400 font-sans">
                      No members directory recorded.
                    </td>
                  </tr>
                ) : (
                  memberContributions.map((c) => {
                    const mInfo = findMember(members, c.ledgerNo);
                    const isOverdue = c.status !== 'Paid';
                    const outstanding = Math.max(0, c.expected - c.paid);

                    return (
                      <tr key={c.ledgerNo} className="hover:bg-slate-50">
                        <td className="py-2 px-3 font-bold text-slate-800">{c.ledgerNo}</td>
                        <td className="py-2 px-3 font-sans font-bold text-slate-900">{c.name}</td>
                        <td className="py-2 px-3 text-slate-600">{formatMoney(c.expected)}</td>
                        <td className="py-2 px-3 font-bold text-slate-900">{formatMoney(c.paid)}</td>
                        <td className="py-2 px-3 text-center">
                          <span
                            className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-sans font-bold uppercase tracking-wider ${
                              c.status === 'Paid'
                                ? 'bg-emerald-100 text-emerald-800'
                                : c.status === 'Partial'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {c.status}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-right font-sans">
                          {isOverdue ? (
                            <button
                              onClick={() => {
                                setSingleTargetMember({
                                  ledgerNo: c.ledgerNo,
                                  name: c.name,
                                  outstanding,
                                  month: selectedMonth,
                                  phone: mInfo?.phone,
                                  status: c.status === 'Partial' ? 'Partial' : 'Due',
                                });
                                setIsReminderModalOpen(true);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors cursor-pointer"
                            >
                              <Bell className="w-3 h-3 text-amber-600" />
                              <span>Send Reminder</span>
                            </button>
                          ) : (
                            <span className="text-[10px] text-emerald-600 font-semibold inline-flex items-center gap-1">
                              <CheckCircle className="w-3 h-3" />
                              <span>Cleared</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* WhatsApp Month Balance Report Modal */}
      <MonthBalanceReportModal
        isOpen={isWhatsAppModalOpen}
        onClose={() => setIsWhatsAppModalOpen(false)}
        monthRow={targetReportMonthRow}
        transactions={transactions}
        members={members}
        settings={settings}
        showToast={showToast}
      />

      {/* Manual / Automatic Month Balance Setup Modal */}
      <ManualMonthBalanceModal
        isOpen={isManualModalOpen}
        onClose={() => setIsManualModalOpen(false)}
        monthRow={targetManualMonthRow}
        onSave={(month, config) => onUpdateMonthBalanceConfig(month, config)}
        showToast={showToast}
      />

      {/* Send Member Reminder Modal */}
      <SendReminderModal
        isOpen={isReminderModalOpen}
        onClose={() => setIsReminderModalOpen(false)}
        overdueMembers={overdueMembersList}
        organizationName={settings.organizationName}
        selectedMonth={selectedMonth}
        singleTarget={singleTargetMember}
        showToast={showToast}
      />

      {/* Consolidated Month-End Member Balance Modal */}
      <ConsolidatedMonthEndMemberModal
        isOpen={isConsolidatedModalOpen}
        onClose={() => setIsConsolidatedModalOpen(false)}
        monthRow={targetConsolidatedMonthRow}
        members={members}
        transactions={transactions}
        settings={settings}
        showToast={showToast}
      />
    </div>
  );
};
