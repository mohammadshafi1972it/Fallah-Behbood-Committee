import React, { useState, useMemo } from 'react';
import { Member, Transaction, AppSettings, MonthEndIntimationSlip } from '../types';
import {
  buildMonthEndIntimationSlip,
  printSingleIntimationSlipPDF,
  printBatchMonthEndIntimationsPDF,
  getAvailableYears,
  BASE_START_YEAR,
  formatMoney,
  fmtDate,
  isLedger131,
  exportCsv,
  getMonthLabel,
} from '../lib/ledgerUtils';
import {
  X,
  Printer,
  Download,
  Search,
  Filter,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Send,
  Calendar,
  Layers,
  Phone,
  Copy,
  Check,
  FileText,
  Sparkles,
  ArrowUpDown,
  Lock,
  RefreshCw,
} from 'lucide-react';

interface MonthEndIntimationModalProps {
  isOpen: boolean;
  onClose: () => void;
  members: Member[];
  transactions: Transaction[];
  settings: AppSettings;
  defaultMonth?: string; // YYYY-MM
  onSnapshotOpeningBalances?: (asOfDate: string) => void;
  showToast: (msg: string) => void;
}

export const MonthEndIntimationModal: React.FC<MonthEndIntimationModalProps> = ({
  isOpen,
  onClose,
  members,
  transactions,
  settings,
  defaultMonth,
  onSnapshotOpeningBalances,
  showToast,
}) => {
  const currentMonthStr = useMemo(() => new Date().toISOString().slice(0, 7), []);
  const [selectedYearMonth, setSelectedYearMonth] = useState<string>(
    defaultMonth || currentMonthStr
  );

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'PaidUp' | 'Advance' | 'Arrears' | 'HasPhone'>('All');
  const [sortBy, setSortBy] = useState<'ledger_asc' | 'paid_desc' | 'due_desc' | 'balance_desc' | 'name_asc'>('ledger_asc');

  // Preview Message Drawer state
  const [previewSlip, setPreviewSlip] = useState<MonthEndIntimationSlip | null>(null);
  const [copiedMsg, setCopiedMsg] = useState(false);

  // Available Years starting from 2019
  const availableYears = useMemo(() => getAvailableYears(transactions, BASE_START_YEAR), [transactions]);

  // Year and Month breakdown
  const [selectedYear, setSelectedYear] = useState<string>(() => {
    return (defaultMonth || currentMonthStr).slice(0, 4);
  });
  const [selectedMonthIndex, setSelectedMonthIndex] = useState<string>(() => {
    return (defaultMonth || currentMonthStr).slice(5, 7);
  });

  const handleYearChange = (year: string) => {
    setSelectedYear(year);
    setSelectedYearMonth(`${year}-${selectedMonthIndex}`);
  };

  const handleMonthChange = (monthIdx: string) => {
    setSelectedMonthIndex(monthIdx);
    setSelectedYearMonth(`${selectedYear}-${monthIdx}`);
  };

  // Build Intimation Slips for all members for the selected month
  const allSlips = useMemo<MonthEndIntimationSlip[]>(() => {
    if (!selectedYearMonth) return [];
    return members.map((m) =>
      buildMonthEndIntimationSlip(m, transactions, selectedYearMonth, settings)
    );
  }, [members, transactions, selectedYearMonth, settings]);

  // Filter and sort slips
  const filteredSlips = useMemo(() => {
    let list = allSlips;

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.ledgerNo.toLowerCase().includes(q) ||
          (s.phone && s.phone.includes(q))
      );
    }

    if (statusFilter === 'PaidUp') {
      list = list.filter((s) => s.isPaidUp || s.status === 'Paid Up (Nil)');
    } else if (statusFilter === 'Advance') {
      list = list.filter((s) => s.status === 'Advance' || s.closingBalance > 0);
    } else if (statusFilter === 'Arrears') {
      list = list.filter((s) => s.status === 'Arrears' || s.closingBalance < 0);
    } else if (statusFilter === 'HasPhone') {
      list = list.filter((s) => !!s.phone && s.phone.trim().length >= 6);
    }

    return [...list].sort((a, b) => {
      if (sortBy === 'ledger_asc') {
        return (parseInt(a.ledgerNo, 10) || 0) - (parseInt(b.ledgerNo, 10) || 0);
      }
      if (sortBy === 'paid_desc') return b.totalPaidToDate - a.totalPaidToDate;
      if (sortBy === 'due_desc') return Math.abs(b.closingBalance) - Math.abs(a.closingBalance);
      if (sortBy === 'balance_desc') return b.closingBalance - a.closingBalance;
      if (sortBy === 'name_asc') return a.name.localeCompare(b.name);
      return 0;
    });
  }, [allSlips, searchQuery, statusFilter, sortBy]);

  // KPIs
  const kpis = useMemo(() => {
    let totalPaidInMonth = 0;
    let totalCumulativePaid = 0;
    let totalOpeningBalance = 0;
    let paidUpCount = 0;
    let advanceCount = 0;
    let arrearsCount = 0;
    let totalPendingArrears = 0;

    allSlips.forEach((s) => {
      totalPaidInMonth += s.subsequentPaymentsInMonth;
      totalCumulativePaid += s.totalPaidToDate;
      totalOpeningBalance += s.baselineOpeningBalance;
      if (s.isPaidUp || s.status === 'Paid Up (Nil)') paidUpCount++;
      else if (s.status === 'Advance' || s.closingBalance > 0) advanceCount++;
      else if (s.status === 'Arrears' || s.closingBalance < 0) {
        arrearsCount++;
        totalPendingArrears += Math.abs(s.closingBalance);
      }
    });

    return {
      totalPaidInMonth,
      totalCumulativePaid,
      totalOpeningBalance,
      paidUpCount,
      advanceCount,
      arrearsCount,
      totalPendingArrears,
    };
  }, [allSlips]);

  if (!isOpen) return null;

  const monthLabel = getMonthLabel(selectedYearMonth);

  // Print single slip
  const handlePrintSingle = (slip: MonthEndIntimationSlip) => {
    printSingleIntimationSlipPDF(slip, settings.organizationName);
    showToast(`Opening Print Slip for #${slip.ledgerNo} ${slip.name}...`);
  };

  // Batch Print 3-per-page A4 slips
  const handlePrintBatch = () => {
    printBatchMonthEndIntimationsPDF(filteredSlips, settings.organizationName, selectedYearMonth);
    showToast(`Generating printable batch Intimation Slips for ${monthLabel}...`);
  };

  // Export CSV
  const handleExportCSV = () => {
    const headers = [
      'Ledger No',
      'Member Name',
      'Phone',
      'Monthly Rate (Rs.)',
      'Opening Balance as on Date (Rs.)',
      `Payments in ${monthLabel} (Rs.)`,
      'Total Paid to Date (Rs.)',
      'Paid Upto Status',
      'Month-End Closing Balance (Rs.)',
      'Account Status',
    ];
    const rows = filteredSlips.map((s) => [
      s.ledgerNo,
      s.name,
      s.phone || '',
      s.monthlyRate,
      s.baselineOpeningBalance,
      s.subsequentPaymentsInMonth,
      s.totalPaidToDate,
      s.currentPaidUptoBadge,
      s.status === 'Paid Up (Nil)' ? 0 : s.closingBalance,
      s.status,
    ]);

    exportCsv(headers, rows, `Month_End_Intimations_${selectedYearMonth}.csv`);
    showToast(`Exported ${filteredSlips.length} Member Intimations to CSV.`);
  };

  // Open WhatsApp Web Link directly
  const handleSendWhatsApp = (slip: MonthEndIntimationSlip) => {
    if (!slip.phone || slip.phone.trim().length < 6) {
      setPreviewSlip(slip);
      showToast(`No phone recorded for #${slip.ledgerNo}. You can copy the message text.`);
      return;
    }

    let cleanPhone = slip.phone.replace(/[^\d]/g, '');
    if (cleanPhone.length === 10) cleanPhone = '91' + cleanPhone;

    const encodedText = encodeURIComponent(slip.whatsappMessageText);
    const waUrl = `https://wa.me/${cleanPhone}?text=${encodedText}`;
    window.open(waUrl, '_blank');
    showToast(`Opening WhatsApp chat for #${slip.ledgerNo} ${slip.name}...`);
  };

  // Copy message to clipboard
  const handleCopyMessage = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMsg(true);
    showToast('Intimation text copied to clipboard.');
    setTimeout(() => setCopiedMsg(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-7xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[94vh]">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/20 text-emerald-300 rounded-xl border border-emerald-500/30">
              <MessageSquare className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-serif font-bold text-white tracking-wide">
                  Month-End Member Balance Intimation & Dispatcher
                </h2>
                <span className="text-xs bg-emerald-700 text-emerald-100 font-bold px-2 py-0.5 rounded-full">
                  Year-Wise (2019+)
                </span>
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                Automatically calculates Opening Balance as on date, adds subsequent payments, computes dynamic "Paid Upto" and dispatches month-end statements to members.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              onClick={handlePrintBatch}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer shadow-sm"
              title="Print 3-per-page A4 slips to cut & distribute"
            >
              <Printer className="w-4 h-4" />
              <span>Batch Print Slips (3/Page)</span>
            </button>

            <button
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
              title="Export Month-End Table to CSV"
            >
              <Download className="w-4 h-4" />
              <span>Export CSV</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Month & Year Bar */}
        <div className="bg-slate-50 border-b border-slate-200 p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* Year Selector */}
            <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 shadow-2xs">
              <Calendar className="w-4 h-4 text-emerald-700" />
              <label className="text-xs font-bold text-slate-700">Financial Year:</label>
              <select
                value={selectedYear}
                onChange={(e) => handleYearChange(e.target.value)}
                className="text-xs font-mono font-bold text-emerald-900 bg-transparent outline-none cursor-pointer"
              >
                {availableYears.map((y) => (
                  <option key={y} value={y}>
                    Year {y} ({y}–{(parseInt(y, 10) + 1).toString().slice(-2)})
                  </option>
                ))}
              </select>
            </div>

            {/* Month Selector */}
            <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 shadow-2xs">
              <label className="text-xs font-bold text-slate-700">Reporting Month:</label>
              <select
                value={selectedMonthIndex}
                onChange={(e) => handleMonthChange(e.target.value)}
                className="text-xs font-bold text-slate-800 bg-transparent outline-none cursor-pointer"
              >
                <option value="01">January (01)</option>
                <option value="02">February (02)</option>
                <option value="03">March (03)</option>
                <option value="04">April (04)</option>
                <option value="05">May (05)</option>
                <option value="06">June (06)</option>
                <option value="07">July (07)</option>
                <option value="08">August (08)</option>
                <option value="09">September (09)</option>
                <option value="10">October (10)</option>
                <option value="11">November (11)</option>
                <option value="12">December (12)</option>
              </select>
            </div>

            <span className="text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-1 rounded-lg">
              Active Statement: {monthLabel}
            </span>
          </div>

          {/* Quick Snapshot Action if provided */}
          {onSnapshotOpeningBalances && (
            <button
              onClick={() => {
                if (
                  window.confirm(
                    `Set all payments made up to ${fmtDate(selectedYearMonth + '-01')} as baseline Opening Balance & Paid Upto for all members?`
                  )
                ) {
                  onSnapshotOpeningBalances(selectedYearMonth + '-01');
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-lg transition-colors cursor-pointer"
              title="Lock payments up to this date as baseline Opening Balance"
            >
              <Lock className="w-3.5 h-3.5 text-amber-700" />
              <span>Snapshot as Baseline Opening Balance</span>
            </button>
          )}
        </div>

        {/* KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5 p-3 sm:p-4 bg-white border-b border-slate-100">
          <div className="bg-slate-50 border border-slate-200/80 p-2.5 rounded-xl text-center">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Members Audited</span>
            <span className="text-sm font-bold text-slate-900 font-mono mt-0.5 block">{allSlips.length}</span>
          </div>
          <div className="bg-emerald-50/50 border border-emerald-200 p-2.5 rounded-xl text-center">
            <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">Paid in {monthLabel}</span>
            <span className="text-sm font-bold text-emerald-800 font-mono mt-0.5 block">+{formatMoney(kpis.totalPaidInMonth)}</span>
          </div>
          <div className="bg-slate-50 border border-slate-200/80 p-2.5 rounded-xl text-center">
            <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider block">Total Paid to Date</span>
            <span className="text-sm font-bold text-slate-900 font-mono mt-0.5 block">{formatMoney(kpis.totalCumulativePaid)}</span>
          </div>
          <div className="bg-teal-50 border border-teal-200 p-2.5 rounded-xl text-center">
            <span className="text-[10px] font-bold text-teal-800 uppercase tracking-wider block">Paid Up / Nil Due</span>
            <span className="text-sm font-bold text-teal-900 font-mono mt-0.5 block">{kpis.paidUpCount} Members</span>
          </div>
          <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl text-center">
            <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">Advance Credit</span>
            <span className="text-sm font-bold text-emerald-900 font-mono mt-0.5 block">{kpis.advanceCount} Members</span>
          </div>
          <div className="bg-rose-50 border border-rose-200 p-2.5 rounded-xl text-center">
            <span className="text-[10px] font-bold text-rose-800 uppercase tracking-wider block">Arrears Pending</span>
            <span className="text-sm font-bold text-rose-800 font-mono mt-0.5 block">{formatMoney(kpis.totalPendingArrears)}</span>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="px-4 py-3 bg-slate-50/70 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[280px]">
            {/* Search Input */}
            <div className="relative flex-1 max-w-sm">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search member name, ledger #, phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg outline-none focus:border-emerald-600 shadow-2xs"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Status Filter */}
            <div className="flex items-center gap-1 bg-white border border-slate-300 rounded-lg p-0.5 text-xs shadow-2xs">
              <button
                onClick={() => setStatusFilter('All')}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                  statusFilter === 'All' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                All ({allSlips.length})
              </button>
              <button
                onClick={() => setStatusFilter('PaidUp')}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                  statusFilter === 'PaidUp' ? 'bg-teal-700 text-white' : 'text-teal-800 hover:bg-teal-50'
                }`}
              >
                Paid Up ({kpis.paidUpCount})
              </button>
              <button
                onClick={() => setStatusFilter('Advance')}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                  statusFilter === 'Advance' ? 'bg-emerald-700 text-white' : 'text-emerald-800 hover:bg-emerald-50'
                }`}
              >
                Advance ({kpis.advanceCount})
              </button>
              <button
                onClick={() => setStatusFilter('Arrears')}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                  statusFilter === 'Arrears' ? 'bg-rose-700 text-white' : 'text-rose-800 hover:bg-rose-50'
                }`}
              >
                Arrears ({kpis.arrearsCount})
              </button>
              <button
                onClick={() => setStatusFilter('HasPhone')}
                className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                  statusFilter === 'HasPhone' ? 'bg-blue-700 text-white' : 'text-blue-800 hover:bg-blue-50'
                }`}
              >
                With Phone
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="text-xs bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 font-medium text-slate-800 outline-none shadow-2xs cursor-pointer"
            >
              <option value="ledger_asc">Ledger No (Asc)</option>
              <option value="paid_desc">Total Paid (High to Low)</option>
              <option value="due_desc">Arrears Due (High to Low)</option>
              <option value="balance_desc">Closing Balance (High to Low)</option>
              <option value="name_asc">Member Name (A to Z)</option>
            </select>
          </div>
        </div>

        {/* Members Table */}
        <div className="flex-1 overflow-x-auto overflow-y-auto min-h-[350px]">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-800 text-white font-serif uppercase tracking-wider text-[10px] sticky top-0 z-10">
              <tr>
                <th className="py-2.5 px-3 text-center w-12">#</th>
                <th className="py-2.5 px-3">Ledger & Member</th>
                <th className="py-2.5 px-3">Contact</th>
                <th className="py-2.5 px-3 text-right">Rate</th>
                <th className="py-2.5 px-3 text-right">Opening Bal. (as on date)</th>
                <th className="py-2.5 px-3 text-right">Paid in {monthLabel}</th>
                <th className="py-2.5 px-3 text-right">Total Paid to Date</th>
                <th className="py-2.5 px-3 text-center">Paid Upto</th>
                <th className="py-2.5 px-3 text-right">Month-End Balance</th>
                <th className="py-2.5 px-3 text-center">Status</th>
                <th className="py-2.5 px-3 text-center w-36">Actions / WhatsApp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {filteredSlips.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-500 font-sans">
                    No members matched the filter criteria for {monthLabel}.
                  </td>
                </tr>
              ) : (
                filteredSlips.map((slip, idx) => {
                  const is131 = isLedger131(slip.ledgerNo);
                  const isPositive = slip.closingBalance > 0;
                  const isNegative = slip.closingBalance < 0;
                  const isNil = slip.status === 'Paid Up (Nil)' || slip.closingBalance === 0;

                  return (
                    <tr
                      key={slip.ledgerNo}
                      className={`hover:bg-slate-50/90 transition-colors ${
                        is131 ? 'bg-amber-50/50' : idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'
                      }`}
                    >
                      <td className="py-2.5 px-3 text-center text-slate-400 font-mono font-medium">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`font-mono font-bold px-1.5 py-0.5 rounded text-[11px] ${
                              is131
                                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                : 'bg-slate-100 text-slate-900'
                            }`}
                          >
                            #{slip.ledgerNo}
                          </span>
                          <span className="font-bold text-slate-900">{slip.name}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 font-mono">
                        {slip.phone ? (
                          <span className="inline-flex items-center gap-1 text-[11px]">
                            <Phone className="w-3 h-3 text-slate-400" />
                            <span>{slip.phone}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400 italic text-[10px]">No phone</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                        {formatMoney(slip.monthlyRate)}/m
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                        <span
                          className={
                            slip.baselineOpeningBalance < 0
                              ? 'text-rose-700 font-semibold'
                              : slip.baselineOpeningBalance > 0
                              ? 'text-emerald-700 font-semibold'
                              : 'text-slate-500'
                          }
                        >
                          {slip.baselineOpeningBalance >= 0 ? '+' : ''}
                          {formatMoney(slip.baselineOpeningBalance)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-800">
                        {slip.subsequentPaymentsInMonth > 0 ? (
                          <span className="bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                            +{formatMoney(slip.subsequentPaymentsInMonth)}
                          </span>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">
                        {formatMoney(slip.totalPaidToDate)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold font-mono ${
                            slip.isFullYearPaid
                              ? 'bg-teal-100 text-teal-900 border border-teal-300'
                              : slip.currentPaidUptoBadge.includes('Adv')
                              ? 'bg-emerald-100 text-emerald-900'
                              : 'bg-slate-100 text-slate-800'
                          }`}
                          title={slip.currentPaidUpto}
                        >
                          {slip.currentPaidUptoBadge}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold">
                        {isNil ? (
                          <span className="text-teal-700 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded text-[11px]">
                            Nil (Paid Up)
                          </span>
                        ) : isPositive ? (
                          <span className="text-emerald-700">+{formatMoney(slip.closingBalance)}</span>
                        ) : isNegative ? (
                          <span className="text-rose-700">-{formatMoney(Math.abs(slip.closingBalance))}</span>
                        ) : (
                          <span className="text-slate-600">{formatMoney(0)}</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            slip.status === 'Paid Up (Nil)' || isNil
                              ? 'bg-teal-100 text-teal-800 border border-teal-200'
                              : slip.status === 'Advance'
                              ? 'bg-emerald-100 text-emerald-800'
                              : slip.status === 'Arrears'
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {slip.status}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* 1-Click WhatsApp Intimation */}
                          <button
                            onClick={() => handleSendWhatsApp(slip)}
                            className="p-1.5 text-white bg-[#25D366] hover:bg-[#1EBE5D] rounded-lg transition-colors shadow-2xs cursor-pointer"
                            title="Send Month-End Intimation via WhatsApp"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                          </button>

                          {/* Print Single Slip */}
                          <button
                            onClick={() => handlePrintSingle(slip)}
                            className="p-1.5 text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors border border-slate-200 cursor-pointer"
                            title="Print Individual A5 Slip"
                          >
                            <Printer className="w-3.5 h-3.5 text-slate-600" />
                          </button>

                          {/* Preview Message Drawer */}
                          <button
                            onClick={() => setPreviewSlip(slip)}
                            className="p-1.5 text-emerald-800 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors border border-emerald-200 cursor-pointer"
                            title="View Intimation Slip Details & Copy Text"
                          >
                            <FileText className="w-3.5 h-3.5 text-emerald-700" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Modal Footer */}
        <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
          <div>
            Showing <strong className="text-slate-900">{filteredSlips.length}</strong> of{' '}
            <strong className="text-slate-900">{allSlips.length}</strong> member accounts for{' '}
            <strong className="text-emerald-900">{monthLabel}</strong>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrintBatch}
              className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg transition-colors cursor-pointer"
            >
              Print All Filtered Slips
            </button>
            <button
              onClick={onClose}
              className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white font-semibold rounded-lg transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>

        {/* Message Preview Drawer / Modal */}
        {previewSlip && (
          <div className="fixed inset-0 z-60 flex items-center justify-center p-3 bg-slate-950/70 backdrop-blur-2xs">
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-[#25D366]/20 text-[#25D366] rounded-lg">
                    <MessageSquare className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      Month-End WhatsApp Intimation Notice
                    </h3>
                    <p className="text-[11px] text-slate-500 font-mono">
                      #{previewSlip.ledgerNo} {previewSlip.name} • {previewSlip.monthLabel}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setPreviewSlip(null)}
                  className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 max-h-72 overflow-y-auto">
                <pre className="text-xs font-sans whitespace-pre-wrap text-slate-800 leading-relaxed">
                  {previewSlip.whatsappMessageText}
                </pre>
              </div>

              <div className="flex items-center justify-between gap-3 pt-2">
                <button
                  onClick={() => handleCopyMessage(previewSlip.whatsappMessageText)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                >
                  {copiedMsg ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedMsg ? 'Copied Text' : 'Copy Text'}</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handlePrintSingle(previewSlip)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>Print Slip</span>
                  </button>

                  <button
                    onClick={() => handleSendWhatsApp(previewSlip)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#25D366] hover:bg-[#1EBE5D] rounded-lg transition-colors cursor-pointer shadow-sm"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>Send on WhatsApp</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
