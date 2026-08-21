import React, { useState, useMemo } from 'react';
import { Member, Transaction } from '../types';
import { 
  fmtDate, 
  formatMoney, 
  calculateMemberTotals, 
  exportCsv, 
  findMember, 
  INCOME_HEADS,
  computeMemberYearlyBreakdown,
  getAvailableYears,
  BASE_START_YEAR
} from '../lib/ledgerUtils';
import { X, Printer, Download, FileText, Search, Filter, ArrowRightLeft, Calendar, Pencil, Trash2, CheckCircle2, Save, Layers } from 'lucide-react';

interface MemberHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  member: Member | null;
  allMembers?: Member[];
  onSelectMember?: (member: Member) => void;
  transactions: Transaction[];
  organizationName: string;
  onSaveTransaction?: (txn: Transaction) => void;
  onDeleteTransaction?: (id: string) => void;
  showToast?: (msg: string) => void;
}

export const MemberHistoryModal: React.FC<MemberHistoryModalProps> = ({
  isOpen,
  onClose,
  member,
  allMembers = [],
  onSelectMember,
  transactions,
  organizationName,
  onSaveTransaction,
  onDeleteTransaction,
  showToast,
}) => {
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [selectedYear, setSelectedYear] = useState<string>('All');
  const [selectedHead, setSelectedHead] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Yearly Breakdown from 2019 to Present for this member
  const yearlyBreakdown = useMemo(() => {
    if (!member) return [];
    return computeMemberYearlyBreakdown(transactions, member, BASE_START_YEAR);
  }, [transactions, member]);

  // Editing state
  const [editingTxn, setEditingTxn] = useState<Transaction | null>(null);
  const [editDate, setEditDate] = useState<string>('');
  const [editAmount, setEditAmount] = useState<string>('');
  const [editHead, setEditHead] = useState<string>('Membership Subscription');
  const [editReceiptNo, setEditReceiptNo] = useState<string>('');
  const [editForMonth, setEditForMonth] = useState<string>('');
  const [editMode, setEditMode] = useState<string>('Cash');
  const [editRemarks, setEditRemarks] = useState<string>('');

  // All Income transactions for this member sorted chronologically
  const allMemberTxns = useMemo(() => {
    if (!member) return [];
    return transactions
      .filter((t) => t.type === 'Income' && String(t.ledgerNo).trim() === String(member.ledgerNo).trim())
      .sort((a, b) => a.date.localeCompare(b.date)); // Oldest first
  }, [transactions, member?.ledgerNo]);

  // Extract available years & heads
  const availableYears = useMemo(() => {
    return getAvailableYears(transactions, BASE_START_YEAR);
  }, [transactions]);

  const availableHeads = useMemo(() => {
    const heads = new Set<string>();
    allMemberTxns.forEach((t) => {
      if (t.head) heads.add(t.head);
    });
    return Array.from(heads).sort();
  }, [allMemberTxns]);

  // Calculate Running Cumulative Paid on chronologically sorted list
  const txnsWithRunningTotal = useMemo(() => {
    let running = 0;
    return allMemberTxns.map((t) => {
      running += t.amount || 0;
      return {
        ...t,
        runningTotal: running,
      };
    });
  }, [allMemberTxns]);

  // Filtered transactions for display (Newest first)
  const filteredDisplayTxns = useMemo(() => {
    let list = txnsWithRunningTotal.slice();

    if (selectedYear !== 'All') {
      list = list.filter((t) => t.date.startsWith(selectedYear));
    }

    if (selectedHead !== 'All') {
      list = list.filter((t) => t.head === selectedHead);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (t) =>
          (t.receiptVoucherNo || '').toLowerCase().includes(q) ||
          (t.head || '').toLowerCase().includes(q) ||
          (t.forMonth || '').toLowerCase().includes(q) ||
          (t.remarks || '').toLowerCase().includes(q)
      );
    }

    return list.reverse(); // Display newest first
  }, [txnsWithRunningTotal, selectedYear, selectedHead, searchQuery]);

  // Member overall statistics
  const totals = useMemo(() => {
    if (!member) return { totalPaid: 0, count: 0, lastPaymentDate: null };
    return calculateMemberTotals(transactions, member.ledgerNo);
  }, [transactions, member?.ledgerNo]);

  if (!isOpen || !member) return null;

  const handleStartEdit = (txn: Transaction) => {
    setEditingTxn(txn);
    setEditDate(txn.date || new Date().toISOString().slice(0, 10));
    setEditAmount(String(txn.amount || ''));
    setEditHead(txn.head || 'Membership Subscription');
    setEditReceiptNo(txn.receiptVoucherNo || '');
    setEditForMonth(txn.forMonth || '');
    setEditMode(txn.mode || 'Cash');
    setEditRemarks(txn.remarks || '');
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTxn || !onSaveTransaction) return;

    const parsedAmount = parseFloat(editAmount);
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      if (showToast) showToast('Please enter a valid amount.');
      return;
    }

    const updatedTxn: Transaction = {
      ...editingTxn,
      date: editDate,
      amount: parsedAmount,
      head: editHead,
      receiptVoucherNo: editReceiptNo,
      forMonth: editForMonth,
      mode: editMode,
      remarks: editRemarks,
      updatedAt: new Date().toISOString(),
    };

    onSaveTransaction(updatedTxn);
    if (showToast) showToast(`Payment receipt #${updatedTxn.receiptVoucherNo || 'entry'} updated successfully!`);
    setEditingTxn(null);
  };

  const handleDelete = (txn: Transaction) => {
    if (!onDeleteTransaction) return;
    const confirmMsg = `Delete payment receipt #${txn.receiptVoucherNo || 'entry'} of ${formatMoney(txn.amount)} dated ${fmtDate(txn.date)}?`;
    if (window.confirm(confirmMsg)) {
      onDeleteTransaction(txn.id);
      if (showToast) showToast('Payment entry deleted.');
    }
  };

  const handleExportCSV = () => {
    const headers = ['Date', 'Receipt/Voucher No', 'Fund / Head', 'For Month', 'Remarks', 'Payment Mode', 'Amount (Rs.)', 'Cumulative Total (Rs.)'];
    const rows = filteredDisplayTxns.map((t) => [
      fmtDate(t.date),
      t.receiptVoucherNo || '—',
      t.head,
      t.forMonth || '—',
      t.remarks || '—',
      t.mode || 'Cash',
      t.amount,
      t.runningTotal,
    ]);
    exportCsv(headers, rows, `Member_Payment_History_Ledger_${member.ledgerNo}_${member.name.replace(/\s+/g, '_')}.csv`);
  };

  const handlePrintPDF = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const rows = filteredDisplayTxns
      .map(
        (t) => `
      <tr>
        <td style="text-align: center;">${fmtDate(t.date)}</td>
        <td style="text-align: center;">${t.receiptVoucherNo || '—'}</td>
        <td>${t.head}</td>
        <td style="text-align: center;">${t.forMonth || '—'}</td>
        <td>${t.mode || 'Cash'}</td>
        <td style="text-align: right; font-weight: bold;">${formatMoney(t.amount)}</td>
        <td style="text-align: right; color: #166534;">${formatMoney(t.runningTotal)}</td>
      </tr>
    `
      )
      .join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Member Ledger History — ${member.name} (#${member.ledgerNo})</title>
        <style>
          @page { size: A4 ${orientation}; margin: 15mm; }
          body { font-family: 'Times New Roman', serif; color: #111; margin: 0; padding: 10px; }
          .header { text-align: center; border-bottom: 2px solid #1e293b; padding-bottom: 12px; margin-bottom: 15px; }
          h1 { font-size: 18pt; margin: 0 0 4px; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; }
          .sub { font-size: 11pt; color: #475569; font-weight: bold; }
          .meta-grid { display: flex; justify-content: space-between; background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px; font-size: 10pt; margin-bottom: 15px; }
          .meta-item { line-height: 1.5; }
          table { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin-top: 10px; }
          th, td { border: 1px solid #94a3b8; padding: 6px 8px; }
          th { background-color: #0f172a; color: #ffffff; text-transform: uppercase; font-size: 8.5pt; letter-spacing: 0.5px; }
          tr:nth-child(even) { background-color: #f8fafc; }
          .summary-box { font-size: 10pt; font-weight: bold; margin-top: 15px; text-align: right; border-top: 2px dashed #94a3b8; padding-top: 8px; }
          .footer { margin-top: 30px; text-align: right; font-size: 8.5pt; color: #64748b; border-top: 1px solid #e2e8f0; padding-top: 6px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${organizationName || 'Fallah Behbood Committee'}</h1>
          <div class="sub">MEMBER PAYMENT HISTORY STATEMENT</div>
        </div>

        <div class="meta-grid">
          <div class="meta-item">
            <strong>Ledger Folio No:</strong> #${member.ledgerNo}<br/>
            <strong>Member Name:</strong> ${member.name}<br/>
            <strong>Monthly Subscription Rate:</strong> ${formatMoney(member.monthlyDue)}
          </div>
          <div class="meta-item" style="text-align: right;">
            <strong>Total Subscription Receipts:</strong> ${totals.count} entries<br/>
            <strong>Cumulative Total Paid:</strong> <span style="color: #166534; font-size: 11pt;">${formatMoney(totals.totalPaid)}</span><br/>
            <strong>Statement Date:</strong> ${fmtDate(new Date().toISOString().slice(0, 10))}
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 12%;">Date</th>
              <th style="width: 13%;">Voucher #</th>
              <th>Fund / Head</th>
              <th style="width: 12%;">For Month</th>
              <th style="width: 12%;">Mode</th>
              <th style="width: 15%; text-align: right;">Amount (Rs.)</th>
              <th style="width: 18%; text-align: right;">Cumulative (Rs.)</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="7" style="text-align:center; padding: 15px;">No payment records found.</td></tr>'}
          </tbody>
        </table>

        <div class="summary-box">
          Total Recorded Member Contributions: ${formatMoney(totals.totalPaid)}
        </div>

        <div class="footer">
          Generated automatically by Accounting System on ${new Date().toLocaleString()}
        </div>

        <script>
          window.onload = function() { window.print(); }
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-4xl w-full p-6 relative">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header with Quick Member Switcher */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4 mb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-500 text-white rounded-xl shadow-xs">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-900">{member.name}</h2>
                <span className="bg-slate-100 text-slate-800 text-xs font-mono font-bold px-2.5 py-0.5 rounded-md border border-slate-200">
                  Ledger #{member.ledgerNo}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Complete Member Payment & Contribution History Statement
              </p>
            </div>
          </div>

          {/* Quick Member Switcher Dropdown */}
          {allMembers.length > 0 && onSelectMember && (
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl p-1.5 self-start sm:self-auto">
              <ArrowRightLeft className="w-4 h-4 text-slate-400 ml-1.5 shrink-0" />
              <select
                value={member.ledgerNo}
                onChange={(e) => {
                  const m = findMember(allMembers, e.target.value);
                  if (m) {
                    setEditingTxn(null);
                    onSelectMember(m);
                  }
                }}
                className="text-xs font-semibold text-slate-800 bg-transparent focus:outline-none pr-2 cursor-pointer max-w-[200px]"
              >
                {allMembers
                  .slice()
                  .sort((a, b) => (parseInt(a.ledgerNo, 10) || 0) - (parseInt(b.ledgerNo, 10) || 0))
                  .map((m) => (
                    <option key={m.ledgerNo} value={m.ledgerNo}>
                      #{m.ledgerNo} - {m.name}
                    </option>
                  ))}
              </select>
            </div>
          )}
        </div>

        {/* Member Statistics Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50/80 p-4 rounded-xl border border-slate-200/80 mb-4">
          <div className="bg-white p-3 rounded-lg border border-slate-100 shadow-2xs">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Monthly Subscription</span>
            <span className="text-sm font-bold text-slate-800 font-mono mt-0.5 block">{formatMoney(member.monthlyDue)}</span>
          </div>

          <div className="bg-white p-3 rounded-lg border border-emerald-100 shadow-2xs">
            <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider block">Total Paid (All Heads)</span>
            <span className="text-sm font-bold text-emerald-800 font-mono mt-0.5 block">{formatMoney(totals.totalPaid)}</span>
          </div>

          <div className="bg-white p-3 rounded-lg border border-slate-100 shadow-2xs">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Payment Vouchers</span>
            <span className="text-sm font-bold text-slate-800 font-mono mt-0.5 block">{totals.count} Entries</span>
          </div>

          <div className="bg-white p-3 rounded-lg border border-slate-100 shadow-2xs">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Last Payment Recorded</span>
            <span className="text-xs font-bold text-slate-700 mt-1 block">
              {totals.lastPaymentDate ? fmtDate(totals.lastPaymentDate) : 'No payments'}
            </span>
          </div>
        </div>

        {/* Multi-Year Subscription Audit (2019 – Present) */}
        <div className="bg-white border border-slate-200 rounded-xl p-4 mb-5 shadow-2xs">
          <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-emerald-700" />
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                Annual Subscription Breakdown (2019 – Present)
              </h3>
            </div>
            <span className="text-[10px] text-slate-500 font-mono">
              Base Rate: Rs. {member.monthlyDue}/PM (Annual Standard: Rs. {member.monthlyDue * 12})
            </span>
          </div>

          <div className="overflow-x-auto max-h-44 overflow-y-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-100 text-slate-700 uppercase tracking-wider text-[10px] sticky top-0">
                <tr>
                  <th className="py-2 px-3">Year / Session</th>
                  <th className="py-2 px-3 text-right">Expected Due</th>
                  <th className="py-2 px-3 text-right">Paid in Year</th>
                  <th className="py-2 px-3 text-right">Balance Due</th>
                  <th className="py-2 px-3 text-center">Status</th>
                  <th className="py-2 px-3 text-center">Paid Upto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {yearlyBreakdown.map((yb) => (
                  <tr
                    key={yb.year}
                    onClick={() => setSelectedYear(selectedYear === yb.year ? 'All' : yb.year)}
                    className={`cursor-pointer transition-colors ${
                      selectedYear === yb.year ? 'bg-emerald-50 font-bold' : 'hover:bg-slate-50'
                    }`}
                    title="Click to filter entries to this year"
                  >
                    <td className="py-1.5 px-3 font-bold text-slate-900 flex items-center gap-1">
                      <span>{yb.year}</span>
                      {selectedYear === yb.year && (
                        <span className="text-[9px] bg-emerald-600 text-white px-1 rounded">Filtered</span>
                      )}
                    </td>
                    <td className="py-1.5 px-3 text-right text-slate-600">{formatMoney(yb.expectedAnnualDue)}</td>
                    <td className="py-1.5 px-3 text-right text-emerald-800 font-semibold">{formatMoney(yb.totalPaid)}</td>
                    <td
                      className={`py-1.5 px-3 text-right font-bold ${
                        yb.outstandingBalance > 0 ? 'text-rose-700' : 'text-emerald-700'
                      }`}
                    >
                      {formatMoney(yb.outstandingBalance)}
                    </td>
                    <td className="py-1.5 px-3 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-sans font-bold ${
                          yb.status === 'Paid'
                            ? 'bg-emerald-100 text-emerald-800'
                            : yb.status === 'Partial'
                            ? 'bg-amber-100 text-amber-900'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {yb.status}
                      </span>
                    </td>
                    <td className="py-1.5 px-3 text-center text-slate-600 text-[11px] font-sans">
                      {yb.paidUptoMonth || 'None'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Inline Edit Transaction Form Modal / Card */}
        {editingTxn && (
          <div className="bg-amber-50/80 border-2 border-amber-300 rounded-xl p-4 mb-5 shadow-sm">
            <div className="flex items-center justify-between pb-2 mb-3 border-b border-amber-200">
              <div className="flex items-center gap-2 text-amber-900 font-bold text-sm">
                <Pencil className="w-4 h-4 text-amber-600" />
                <span>Edit Payment Entry (Receipt #{editingTxn.receiptVoucherNo || 'N/A'})</span>
              </div>
              <button
                type="button"
                onClick={() => setEditingTxn(null)}
                className="text-xs font-semibold text-slate-500 hover:text-slate-700 underline cursor-pointer"
              >
                Cancel
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">Payment Date</label>
                  <input
                    type="date"
                    required
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2 bg-white font-mono focus:ring-2 focus:ring-amber-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-medium mb-1">Amount (Rs.)</label>
                  <input
                    type="number"
                    step="any"
                    required
                    value={editAmount}
                    onChange={(e) => setEditAmount(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2 bg-white font-mono font-bold text-emerald-800 focus:ring-2 focus:ring-amber-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-medium mb-1">Receipt / Voucher #</label>
                  <input
                    type="text"
                    value={editReceiptNo}
                    onChange={(e) => setEditReceiptNo(e.target.value)}
                    placeholder="e.g. R-102"
                    className="w-full border border-slate-300 rounded-lg p-2 bg-white font-mono focus:ring-2 focus:ring-amber-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-medium mb-1">Fund / Head</label>
                  <select
                    value={editHead}
                    onChange={(e) => setEditHead(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2 bg-white font-semibold text-slate-800 focus:ring-2 focus:ring-amber-400 focus:outline-none cursor-pointer"
                  >
                    {INCOME_HEADS.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block text-slate-700 font-medium mb-1">For Month</label>
                  <input
                    type="text"
                    value={editForMonth}
                    onChange={(e) => setEditForMonth(e.target.value)}
                    placeholder="e.g. 2026-08 or August 2026"
                    className="w-full border border-slate-300 rounded-lg p-2 bg-white focus:ring-2 focus:ring-amber-400 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-medium mb-1">Payment Mode</label>
                  <select
                    value={editMode}
                    onChange={(e) => setEditMode(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg p-2 bg-white focus:ring-2 focus:ring-amber-400 focus:outline-none cursor-pointer"
                  >
                    <option value="Cash">Cash</option>
                    <option value="UPI">UPI / GPay / PhonePe</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Online">Online</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-medium mb-1">Remarks / Particulars</label>
                  <input
                    type="text"
                    value={editRemarks}
                    onChange={(e) => setEditRemarks(e.target.value)}
                    placeholder="Optional notes..."
                    className="w-full border border-slate-300 rounded-lg p-2 bg-white focus:ring-2 focus:ring-amber-400 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setEditingTxn(null)}
                  className="px-3.5 py-1.5 bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Update Payment Entry</span>
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Search & Filter Toolbar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Filter by voucher #, month, fund head..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-slate-800 bg-white"
            />
          </div>

          <div className="flex items-center gap-2">
            {/* Year Filter */}
            {availableYears.length > 0 && (
              <div className="flex items-center gap-1.5 bg-white border border-slate-200 px-2.5 py-1.5 rounded-lg text-xs">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-slate-500 font-medium">Year:</span>
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="bg-transparent font-semibold text-slate-800 focus:outline-none cursor-pointer"
                >
                  <option value="All">All Years</option>
                  {availableYears.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Head Filter */}
            {availableHeads.length > 0 && (
              <div className="flex items-center gap-1.5 bg-white border border-slate-200 px-2.5 py-1.5 rounded-lg text-xs">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-slate-500 font-medium">Head:</span>
                <select
                  value={selectedHead}
                  onChange={(e) => setSelectedHead(e.target.value)}
                  className="bg-transparent font-semibold text-slate-800 focus:outline-none cursor-pointer"
                >
                  <option value="All">All Heads</option>
                  {availableHeads.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>

        {/* History Table */}
        <div className="border border-slate-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto mb-5 shadow-2xs">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-900 text-slate-200 font-serif uppercase tracking-wider text-[10px] sticky top-0 z-10">
              <tr>
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3">Voucher #</th>
                <th className="py-2.5 px-3">Fund / Head</th>
                <th className="py-2.5 px-3">For Month</th>
                <th className="py-2.5 px-3">Mode</th>
                <th className="py-2.5 px-3 text-right">Amount (Rs.)</th>
                <th className="py-2.5 px-3 text-right">Cumulative Total</th>
                <th className="py-2.5 px-3 text-center min-w-[70px]">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredDisplayTxns.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400 font-sans">
                    {searchQuery || selectedYear !== 'All' || selectedHead !== 'All'
                      ? 'No payments matching the selected filters.'
                      : 'No payment transactions recorded for this member yet.'}
                  </td>
                </tr>
              ) : (
                filteredDisplayTxns.map((t) => (
                  <tr
                    key={t.id}
                    className={`hover:bg-amber-50/40 transition-colors ${editingTxn?.id === t.id ? 'bg-amber-100/60 font-bold' : ''}`}
                  >
                    <td className="py-2 px-3 text-slate-700 whitespace-nowrap">{fmtDate(t.date)}</td>
                    <td className="py-2 px-3 font-mono text-slate-500">{t.receiptVoucherNo || '—'}</td>
                    <td className="py-2 px-3 font-sans font-medium text-slate-900">{t.head}</td>
                    <td className="py-2 px-3 text-slate-600 font-sans">{t.forMonth || '—'}</td>
                    <td className="py-2 px-3 text-slate-500 font-sans">{t.mode || 'Cash'}</td>
                    <td className="py-2 px-3 text-right font-bold text-slate-900">{formatMoney(t.amount)}</td>
                    <td className="py-2 px-3 text-right font-bold text-emerald-800">{formatMoney(t.runningTotal)}</td>
                    <td className="py-2 px-3 text-center whitespace-nowrap font-sans">
                      <div className="flex items-center justify-center gap-1">
                        {onSaveTransaction && (
                          <button
                            onClick={() => handleStartEdit(t)}
                            title="Edit this payment entry"
                            className="p-1 text-slate-500 hover:text-amber-700 hover:bg-amber-100 rounded transition-colors cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {onDeleteTransaction && (
                          <button
                            onClick={() => handleDelete(t)}
                            title="Delete this payment entry"
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer Actions */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <div className="flex items-center gap-3 text-xs">
            <span className="text-slate-500 font-medium">Print Layout:</span>
            <label className="inline-flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="modal-orientation"
                value="portrait"
                checked={orientation === 'portrait'}
                onChange={() => setOrientation('portrait')}
                className="accent-slate-800"
              />
              <span className="text-slate-700 font-medium">Portrait</span>
            </label>
            <label className="inline-flex items-center gap-1 cursor-pointer">
              <input
                type="radio"
                name="modal-orientation"
                value="landscape"
                checked={orientation === 'landscape'}
                onChange={() => setOrientation('landscape')}
                className="accent-slate-800"
              />
              <span className="text-slate-700 font-medium">Landscape</span>
            </label>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-slate-600" />
              <span>Export CSV</span>
            </button>
            <button
              onClick={handlePrintPDF}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg transition-colors shadow-xs cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / PDF Statement</span>
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
