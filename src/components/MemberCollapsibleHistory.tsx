import React, { useState, useMemo } from 'react';
import { Member, Transaction } from '../types';
import { fmtDate, formatMoney, calculateMemberTotals, exportCsv, INCOME_HEADS } from '../lib/ledgerUtils';
import { History, Pencil, Trash2, Download, Printer, Search, Calendar, Filter, Save, X, ExternalLink } from 'lucide-react';

interface MemberCollapsibleHistoryProps {
  member: Member;
  transactions: Transaction[];
  onOpenFullModal: (member: Member) => void;
  onSaveTransaction?: (txn: Transaction) => void;
  onDeleteTransaction?: (id: string) => void;
  showToast?: (msg: string) => void;
}

export const MemberCollapsibleHistory: React.FC<MemberCollapsibleHistoryProps> = ({
  member,
  transactions,
  onOpenFullModal,
  onSaveTransaction,
  onDeleteTransaction,
  showToast,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<string>('All');
  const [selectedHead, setSelectedHead] = useState<string>('All');

  // Inline editing state
  const [editingTxn, setEditingTxn] = useState<Transaction | null>(null);
  const [editDate, setEditDate] = useState<string>('');
  const [editAmount, setEditAmount] = useState<string>('');
  const [editHead, setEditHead] = useState<string>('Membership Subscription');
  const [editReceiptNo, setEditReceiptNo] = useState<string>('');
  const [editForMonth, setEditForMonth] = useState<string>('');
  const [editMode, setEditMode] = useState<string>('Cash');
  const [editRemarks, setEditRemarks] = useState<string>('');

  // All Income transactions for this member sorted chronologically (oldest first)
  const allMemberTxns = useMemo(() => {
    return transactions
      .filter((t) => t.type === 'Income' && String(t.ledgerNo).trim() === String(member.ledgerNo).trim())
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [transactions, member.ledgerNo]);

  // Extract available years & heads
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    allMemberTxns.forEach((t) => {
      if (t.date && t.date.length >= 4) {
        years.add(t.date.substring(0, 4));
      }
    });
    return Array.from(years).sort().reverse();
  }, [allMemberTxns]);

  const availableHeads = useMemo(() => {
    const heads = new Set<string>();
    allMemberTxns.forEach((t) => {
      if (t.head) heads.add(t.head);
    });
    return Array.from(heads).sort();
  }, [allMemberTxns]);

  // Calculate Running Cumulative Paid
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

  const totals = calculateMemberTotals(transactions, member.ledgerNo);

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

  return (
    <div className="bg-slate-900/5 p-4 sm:p-5 rounded-2xl border border-amber-200/80 shadow-inner my-2">
      {/* Top Banner Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 pb-3 border-b border-slate-200/80 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-amber-500 text-white rounded-lg shadow-2xs">
            <History className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-slate-900 font-serif">
                Payment History — #{member.ledgerNo} {member.name}
              </h4>
              <span className="bg-emerald-100 text-emerald-900 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                {totals.count} Payments ({formatMoney(totals.totalPaid)})
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Monthly due rate: <strong className="text-slate-700">{formatMoney(member.monthlyDue)}</strong>
              {totals.lastPaymentDate && (
                <span className="ml-2">
                  • Last payment: <strong className="text-slate-700">{fmtDate(totals.lastPaymentDate)}</strong>
                </span>
              )}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          <button
            onClick={handleExportCSV}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg shadow-2xs transition-colors cursor-pointer"
          >
            <Download className="w-3 h-3 text-slate-500" />
            <span>CSV</span>
          </button>
          <button
            onClick={() => onOpenFullModal(member)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Full Statement & PDF</span>
            <ExternalLink className="w-3 h-3 ml-0.5 opacity-80" />
          </button>
        </div>
      </div>

      {/* Inline Edit Form if active */}
      {editingTxn && (
        <div className="bg-amber-50/90 border-2 border-amber-300 rounded-xl p-3.5 mb-4 shadow-sm font-sans">
          <div className="flex items-center justify-between pb-2 mb-2.5 border-b border-amber-200">
            <div className="flex items-center gap-2 text-amber-950 font-bold text-xs">
              <Pencil className="w-3.5 h-3.5 text-amber-600" />
              <span>Edit Payment Receipt #{editingTxn.receiptVoucherNo || 'N/A'}</span>
            </div>
            <button
              type="button"
              onClick={() => setEditingTxn(null)}
              className="text-xs text-slate-500 hover:text-slate-700 underline cursor-pointer"
            >
              Cancel
            </button>
          </div>

          <form onSubmit={handleSaveEdit} className="space-y-2.5">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 text-xs">
              <div>
                <label className="block text-slate-700 font-medium mb-1">Date</label>
                <input
                  type="date"
                  required
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="w-full border border-slate-300 rounded-md p-1.5 bg-white font-mono"
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
                  className="w-full border border-slate-300 rounded-md p-1.5 bg-white font-mono font-bold text-emerald-800"
                />
              </div>
              <div>
                <label className="block text-slate-700 font-medium mb-1">Receipt #</label>
                <input
                  type="text"
                  value={editReceiptNo}
                  onChange={(e) => setEditReceiptNo(e.target.value)}
                  className="w-full border border-slate-300 rounded-md p-1.5 bg-white font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-700 font-medium mb-1">Fund Head</label>
                <select
                  value={editHead}
                  onChange={(e) => setEditHead(e.target.value)}
                  className="w-full border border-slate-300 rounded-md p-1.5 bg-white font-semibold text-slate-800 cursor-pointer"
                >
                  {INCOME_HEADS.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              <div>
                <label className="block text-slate-700 font-medium mb-1">For Month</label>
                <input
                  type="text"
                  value={editForMonth}
                  onChange={(e) => setEditForMonth(e.target.value)}
                  className="w-full border border-slate-300 rounded-md p-1.5 bg-white"
                />
              </div>
              <div>
                <label className="block text-slate-700 font-medium mb-1">Payment Mode</label>
                <select
                  value={editMode}
                  onChange={(e) => setEditMode(e.target.value)}
                  className="w-full border border-slate-300 rounded-md p-1.5 bg-white cursor-pointer"
                >
                  <option value="Cash">Cash</option>
                  <option value="UPI">UPI / GPay / PhonePe</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  <option value="Cheque">Cheque</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-700 font-medium mb-1">Remarks</label>
                <input
                  type="text"
                  value={editRemarks}
                  onChange={(e) => setEditRemarks(e.target.value)}
                  className="w-full border border-slate-300 rounded-md p-1.5 bg-white"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setEditingTxn(null)}
                className="px-3 py-1 bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 rounded text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1 px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-bold cursor-pointer"
              >
                <Save className="w-3 h-3" />
                <span>Save Entry</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filter / Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 mb-3">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          <input
            type="text"
            placeholder="Search receipt #, month, head..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-amber-500 bg-white"
          />
        </div>

        <div className="flex items-center gap-2">
          {availableYears.length > 0 && (
            <div className="flex items-center gap-1 bg-white border border-slate-200 px-2 py-1 rounded-lg text-xs">
              <Calendar className="w-3 h-3 text-slate-400" />
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

          {availableHeads.length > 0 && (
            <div className="flex items-center gap-1 bg-white border border-slate-200 px-2 py-1 rounded-lg text-xs">
              <Filter className="w-3 h-3 text-slate-400" />
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
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
        <div className="overflow-x-auto max-h-60 overflow-y-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-900 text-slate-200 uppercase tracking-wider text-[10px] sticky top-0 z-10">
              <tr>
                <th className="py-2 px-3">Date</th>
                <th className="py-2 px-3">Voucher #</th>
                <th className="py-2 px-3">Head</th>
                <th className="py-2 px-3">For Month</th>
                <th className="py-2 px-3">Mode</th>
                <th className="py-2 px-3 text-right">Amount (Rs.)</th>
                <th className="py-2 px-3 text-right">Cumulative Total</th>
                <th className="py-2 px-3 text-center min-w-[65px]">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filteredDisplayTxns.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-6 text-center text-slate-400 font-sans">
                    {searchQuery || selectedYear !== 'All' || selectedHead !== 'All'
                      ? 'No matching payment records.'
                      : 'No recorded payment contributions for this member yet.'}
                  </td>
                </tr>
              ) : (
                filteredDisplayTxns.map((t) => (
                  <tr
                    key={t.id}
                    className={`hover:bg-amber-50/50 transition-colors ${editingTxn?.id === t.id ? 'bg-amber-100/70 font-bold' : ''}`}
                  >
                    <td className="py-1.5 px-3 text-slate-700 whitespace-nowrap">{fmtDate(t.date)}</td>
                    <td className="py-1.5 px-3 text-slate-500 font-mono">{t.receiptVoucherNo || '—'}</td>
                    <td className="py-1.5 px-3 font-sans font-medium text-slate-900">{t.head}</td>
                    <td className="py-1.5 px-3 text-slate-600 font-sans">{t.forMonth || '—'}</td>
                    <td className="py-1.5 px-3 text-slate-500 font-sans">{t.mode || 'Cash'}</td>
                    <td className="py-1.5 px-3 text-right font-bold text-slate-900">{formatMoney(t.amount)}</td>
                    <td className="py-1.5 px-3 text-right font-bold text-emerald-800">{formatMoney(t.runningTotal)}</td>
                    <td className="py-1.5 px-3 text-center whitespace-nowrap font-sans">
                      <div className="flex items-center justify-center gap-1">
                        {onSaveTransaction && (
                          <button
                            onClick={() => handleStartEdit(t)}
                            title="Edit this payment entry"
                            className="p-1 text-slate-500 hover:text-amber-700 hover:bg-amber-100 rounded transition-colors cursor-pointer"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        )}
                        {onDeleteTransaction && (
                          <button
                            onClick={() => handleDelete(t)}
                            title="Delete this payment entry"
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
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
      </div>
    </div>
  );
};
