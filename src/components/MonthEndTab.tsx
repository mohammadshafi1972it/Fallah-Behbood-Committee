import React, { useState, useMemo } from 'react';
import { Transaction, Member, AppSettings } from '../types';
import { computeMonthlySummary, calculateContributionsForMonth, formatMoney, num, exportCsv, fmtDate, findMember } from '../lib/ledgerUtils';
import { Calendar, Download, CheckCircle, AlertCircle, Wallet, Bell, Send } from 'lucide-react';
import { SendReminderModal, OverdueMemberItem } from './SendReminderModal';

interface MonthEndTabProps {
  transactions: Transaction[];
  members: Member[];
  settings: AppSettings;
  showToast: (msg: string) => void;
}

export const MonthEndTab: React.FC<MonthEndTabProps> = ({
  transactions,
  members,
  settings,
  showToast,
}) => {
  const monthlySummaries = useMemo(
    () => computeMonthlySummary(transactions, settings.openingBalance),
    [transactions, settings.openingBalance]
  );

  const availableMonths = useMemo(() => monthlySummaries.map((m) => m.month), [monthlySummaries]);

  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    return availableMonths.length > 0 ? availableMonths[availableMonths.length - 1] : new Date().toISOString().slice(0, 7);
  });

  const currentSummary = useMemo(() => {
    return monthlySummaries.find((m) => m.month === selectedMonth) || {
      month: selectedMonth,
      income: 0,
      expenditure: 0,
      net: 0,
      balance: num(settings.openingBalance),
    };
  }, [monthlySummaries, selectedMonth, settings.openingBalance]);

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

  return (
    <div className="space-y-6">
      {/* Month Selector Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-500" />
          <label className="text-xs font-semibold text-slate-700">Select Reporting Month:</label>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="text-xs font-mono font-bold px-3 py-1.5 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white"
          >
            {availableMonths.length === 0 ? (
              <option value={new Date().toISOString().slice(0, 7)}>{new Date().toISOString().slice(0, 7)}</option>
            ) : (
              availableMonths.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))
            )}
          </select>
        </div>
        <p className="text-xs text-slate-500">Comprehensive reconciliation statement for month-end audit.</p>
      </div>

      {/* Month-End KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs text-center">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Opening Balance</span>
          <span className="text-base sm:text-lg font-bold text-slate-900 font-mono">
            {formatMoney(currentSummary.balance - currentSummary.net)}
          </span>
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs text-center">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Income This Month</span>
          <span className="text-base sm:text-lg font-bold text-emerald-700 font-mono">
            {formatMoney(currentSummary.income)}
          </span>
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs text-center">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Payments This Month</span>
          <span className="text-base sm:text-lg font-bold text-rose-700 font-mono">
            {formatMoney(currentSummary.expenditure)}
          </span>
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs text-center">
          <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Month-End Balance</span>
          <span className="text-base sm:text-lg font-bold text-slate-900 font-mono">
            {formatMoney(currentSummary.balance)}
          </span>
        </div>
      </div>

      {/* Month-End Balance Summary Table */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-sm font-serif font-bold text-slate-800">Month-End Balances History</h3>
          <button
            onClick={() =>
              exportCsv(
                ['Month', 'Opening Balance', 'Income', 'Payments', 'Month-End Balance'],
                monthlySummaries.map((m) => [m.month, m.balance - m.net, m.income, m.expenditure, m.balance]),
                'Fallah_Behbood_Month_End_Balances.csv'
              )
            }
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export CSV</span>
          </button>
        </div>

        <div className="border border-slate-200 rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-800 text-white font-serif uppercase tracking-wider text-[10px]">
              <tr>
                <th className="py-2.5 px-3">Month</th>
                <th className="py-2.5 px-3">Opening Balance</th>
                <th className="py-2.5 px-3">Income</th>
                <th className="py-2.5 px-3">Payments</th>
                <th className="py-2.5 px-3">Month-End Closing Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {monthlySummaries.map((m) => (
                <tr
                  key={m.month}
                  className={`hover:bg-slate-50 ${m.month === selectedMonth ? 'bg-amber-50/50 font-bold' : ''}`}
                >
                  <td className="py-2 px-3">{m.month}</td>
                  <td className="py-2 px-3">{formatMoney(m.balance - m.net)}</td>
                  <td className="py-2 px-3 text-emerald-700">{formatMoney(m.income)}</td>
                  <td className="py-2 px-3 text-rose-700">{formatMoney(m.expenditure)}</td>
                  <td className="py-2 px-3 text-slate-900">{formatMoney(m.balance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Monthly Payments List */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-sm font-serif font-bold text-slate-800">
            Payments Made in {selectedMonth} ({monthlyPayments.length} Vouchers)
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

        <div className="border border-slate-200 rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-800 text-white font-serif uppercase tracking-wider text-[10px]">
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
                    No expenditure payments recorded for {selectedMonth}.
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

      {/* Member Contributions in Month */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <h3 className="text-sm font-serif font-bold text-slate-800">
            Member Subscriptions Reconciliation for {selectedMonth}
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

        <div className="border border-slate-200 rounded-xl overflow-hidden overflow-x-auto max-h-80 overflow-y-auto">
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

      {/* Send Reminder Modal */}
      <SendReminderModal
        isOpen={isReminderModalOpen}
        onClose={() => setIsReminderModalOpen(false)}
        overdueMembers={overdueMembersList}
        organizationName={settings.organizationName}
        selectedMonth={selectedMonth}
        singleTarget={singleTargetMember}
        showToast={showToast}
      />
    </div>
  );
};
