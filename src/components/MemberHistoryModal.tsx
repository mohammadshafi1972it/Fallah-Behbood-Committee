import React, { useState } from 'react';
import { Member, Transaction } from '../types';
import { fmtDate, formatMoney, calculateMemberTotals } from '../lib/ledgerUtils';
import { X, Printer, Download, FileText } from 'lucide-react';

interface MemberHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  member: Member | null;
  transactions: Transaction[];
  organizationName: string;
}

export const MemberHistoryModal: React.FC<MemberHistoryModalProps> = ({
  isOpen,
  onClose,
  member,
  transactions,
  organizationName,
}) => {
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');

  if (!isOpen || !member) return null;

  const memberTxns = transactions
    .filter((t) => t.type === 'Income' && String(t.ledgerNo).trim() === String(member.ledgerNo).trim())
    .sort((a, b) => b.date.localeCompare(a.date));

  const totals = calculateMemberTotals(transactions, member.ledgerNo);

  const handlePrintPDF = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const rows = memberTxns
      .map(
        (t) => `
      <tr>
        <td>${fmtDate(t.date)}</td>
        <td>${t.head}</td>
        <td>${t.forMonth || '—'}</td>
        <td>${formatMoney(t.amount)}</td>
        <td>${t.receiptVoucherNo || '—'}</td>
        <td>${t.mode || 'Cash'}</td>
      </tr>
    `
      )
      .join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Member History — ${member.name}</title>
        <style>
          @page { size: A4 ${orientation}; margin: 15mm; }
          body { font-family: 'Times New Roman', serif; color: #111; margin: 0; padding: 10px; }
          h1 { font-size: 18pt; text-align: center; margin: 0 0 4px; color: #1F3A5F; }
          .sub { text-align: center; font-size: 11pt; color: #555; margin-bottom: 20px; }
          .meta { font-size: 11pt; margin-bottom: 15px; line-height: 1.6; border-bottom: 1px solid #ddd; padding-bottom: 10px; }
          table { width: 100%; border-collapse: collapse; font-size: 10pt; margin-top: 10px; }
          th, td { border: 1px solid #999; padding: 6px 8px; text-align: left; }
          th { background-color: #f2f2f2; }
          .footer { margin-top: 25px; text-align: right; font-size: 8.5pt; color: #777; }
        </style>
      </head>
      <body>
        <h1>${organizationName || 'Fallah Behbood Committee'}</h1>
        <div class="sub">Member Payment History Ledger</div>
        <div class="meta">
          <strong>Ledger No:</strong> ${member.ledgerNo} &nbsp;&nbsp;&nbsp;
          <strong>Member Name:</strong> ${member.name}<br/>
          <strong>Monthly Due Rate:</strong> ${formatMoney(member.monthlyDue)} &nbsp;&nbsp;&nbsp;
          <strong>Total Paid:</strong> ${formatMoney(totals.totalPaid)} &nbsp;&nbsp;&nbsp;
          <strong>Total Payment Entries:</strong> ${totals.count}
        </div>
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Fund / Head</th>
              <th>For Month</th>
              <th>Amount</th>
              <th>Receipt No</th>
              <th>Mode</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="6" style="text-align:center;">No payment records found.</td></tr>'}
          </tbody>
        </table>
        <div class="footer">Generated on ${fmtDate(new Date().toISOString().slice(0, 10))}</div>
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-2xl w-full p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 border-b border-slate-100 pb-4 mb-4">
          <div className="p-2.5 bg-amber-50 text-amber-800 rounded-xl">
            <FileText className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">{member.name}</h2>
            <p className="text-xs text-slate-500 font-mono">Ledger No. {member.ledgerNo}</p>
          </div>
        </div>

        {/* Member Summary Card */}
        <div className="grid grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-100 text-center mb-4">
          <div>
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Monthly Rate</span>
            <span className="text-sm font-bold text-slate-800 font-mono">{formatMoney(member.monthlyDue)}</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Total Paid</span>
            <span className="text-sm font-bold text-emerald-700 font-mono">{formatMoney(totals.totalPaid)}</span>
          </div>
          <div>
            <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Entries</span>
            <span className="text-sm font-bold text-slate-800 font-mono">{totals.count}</span>
          </div>
        </div>

        {/* History Table */}
        <div className="border border-slate-200 rounded-xl overflow-hidden max-h-64 overflow-y-auto mb-4">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-800 text-white font-serif uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3">Fund / Head</th>
                <th className="py-2.5 px-3">Amount</th>
                <th className="py-2.5 px-3">For Month</th>
                <th className="py-2.5 px-3">Receipt No</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {memberTxns.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400 font-sans">
                    No subscription entries recorded for this member yet.
                  </td>
                </tr>
              ) : (
                memberTxns.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="py-2 px-3">{fmtDate(t.date)}</td>
                    <td className="py-2 px-3 font-sans text-slate-700">{t.head}</td>
                    <td className="py-2 px-3 font-bold text-slate-900">{formatMoney(t.amount)}</td>
                    <td className="py-2 px-3 text-slate-500">{t.forMonth || '—'}</td>
                    <td className="py-2 px-3 text-slate-500">{t.receiptVoucherNo || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Modal Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <div className="flex items-center gap-3 text-xs">
            <span className="text-slate-500 font-medium">Page Orientation:</span>
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
              onClick={handlePrintPDF}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / Download PDF</span>
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
