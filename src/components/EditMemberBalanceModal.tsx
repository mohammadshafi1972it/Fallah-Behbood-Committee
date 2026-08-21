import React, { useState, useEffect } from 'react';
import { Member, Transaction } from '../types';
import { formatMoney, num, calculateMemberTotals, isLedger131, getMemberMonthlyDue } from '../lib/ledgerUtils';
import {
  X,
  Save,
  DollarSign,
  ArrowRight,
  ShieldCheck,
  History,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  RotateCcw,
} from 'lucide-react';

interface EditMemberBalanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  member: Member | null;
  transactions: Transaction[];
  onSaveMemberBalance: (
    ledgerNo: string,
    openingBalance: number,
    previousDue?: number,
    showNilBalanceWhenPaid?: boolean,
    notes?: string
  ) => void;
  showToast?: (msg: string) => void;
}

export const EditMemberBalanceModal: React.FC<EditMemberBalanceModalProps> = ({
  isOpen,
  onClose,
  member,
  transactions,
  onSaveMemberBalance,
  showToast,
}) => {
  // Mode: 'previous_due' (manual arrears) or 'advance_credit' (advance)
  const [balanceMode, setBalanceMode] = useState<'previous_due' | 'advance_credit'>('previous_due');
  const [amountInput, setAmountInput] = useState<string>('0');
  const [showNilWhenPaid, setShowNilWhenPaid] = useState<boolean>(true);
  const [notes, setNotes] = useState<string>('');

  useEffect(() => {
    if (member) {
      const prevDue = member.previousDue !== undefined ? member.previousDue : (member.openingBalance && member.openingBalance < 0 ? Math.abs(member.openingBalance) : 0);
      const openBal = member.openingBalance !== undefined ? member.openingBalance : 0;

      if (prevDue > 0) {
        setBalanceMode('previous_due');
        setAmountInput(String(prevDue));
      } else if (openBal > 0) {
        setBalanceMode('advance_credit');
        setAmountInput(String(openBal));
      } else {
        setBalanceMode('previous_due');
        setAmountInput('0');
      }

      setShowNilWhenPaid(
        member.showNilBalanceWhenPaid !== undefined ? member.showNilBalanceWhenPaid : true
      );
      setNotes(member.balanceNotes || '');
    }
  }, [member]);

  if (!isOpen || !member) return null;

  const is131 = isLedger131(member.ledgerNo);
  const memberMonthlyRate = getMemberMonthlyDue(member.ledgerNo, member.monthlyDue);
  const annualTarget = memberMonthlyRate * 12; // 1800 for 150, 3600 for 131

  // Auto-calculated totals from ledger for this member
  const memberTotals = calculateMemberTotals(transactions, member.ledgerNo);
  const totalPaid = memberTotals.totalPaid;
  const parsedAmt = Math.abs(num(amountInput));

  // Determine opening balance and previous due based on mode
  const previousDue = balanceMode === 'previous_due' ? parsedAmt : 0;
  const openingBalance = balanceMode === 'advance_credit' ? parsedAmt : -previousDue;

  // Mathematical live balance = opening balance + total paid
  const mathematicalBalance = openingBalance + totalPaid;

  // Effective due amount to compare against
  const expectedDue = previousDue > 0 ? previousDue : memberMonthlyRate;
  const isPaidUp = totalPaid > 0 && (previousDue > 0 ? totalPaid >= previousDue : (totalPaid >= annualTarget || mathematicalBalance >= 0));

  // Resulting displayed balance
  const isNilDisplay = isPaidUp && showNilWhenPaid && mathematicalBalance <= 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveMemberBalance(
      member.ledgerNo,
      openingBalance,
      previousDue,
      showNilWhenPaid,
      notes.trim()
    );
    if (showToast) {
      showToast(
        `Updated balance for ${member.name} (#${member.ledgerNo}): ${
          isNilDisplay ? 'Nil (Paid Up)' : formatMoney(mathematicalBalance)
        }`
      );
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 relative">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 cursor-pointer transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4 mb-5">
          <div className="p-2.5 bg-amber-500 text-white rounded-xl shadow-xs">
            <DollarSign className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <span>Manual Member Balance Configuration</span>
              {is131 ? (
                <span className="text-[10px] font-sans font-bold bg-amber-100 text-amber-900 border border-amber-300 px-2 py-0.5 rounded-full">
                  Special Rate: Rs. 300/mo (12M: Rs. 3,600)
                </span>
              ) : (
                <span className="text-[10px] font-sans font-bold bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded-full">
                  Standard Rate: Rs. 150/mo (12M: Rs. 1,800)
                </span>
              )}
            </h3>
            <p className="text-xs text-slate-500">
              Configure previous dues & automatic live balance for{' '}
              <strong className="text-slate-800">{member.name}</strong> (Ledger #{member.ledgerNo})
            </p>
          </div>
        </div>

        {/* Rule Explanation Banner */}
        <div className="bg-emerald-50/80 border border-emerald-200 rounded-xl p-3.5 mb-5 text-xs text-emerald-950 space-y-1.5 shadow-2xs">
          <div className="font-bold flex items-center gap-1.5 text-emerald-900">
            <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Automatic Live Balance & Nil Paid-Up Logic:</span>
          </div>
          <p className="text-[11px] text-emerald-800 leading-relaxed">
            • <strong>Monthly Due:</strong> Rs. {memberMonthlyRate}/month (12 Months target: Rs. {annualTarget.toLocaleString()}).<br />
            • <strong>Auto-Updating:</strong> Live balance automatically updates whenever a payment is received in the ledger.<br />
            • <strong>Nil on Paid-Up:</strong> When payment received is greater than or equal to due payment, the balance is shown as <strong>Nil (Paid Up)</strong>.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Previous / Opening Balance Mode Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              1. Manual Balance Setting Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setBalanceMode('previous_due')}
                className={`py-2 px-3 text-xs font-bold rounded-lg border text-left cursor-pointer transition-all flex items-center gap-2 ${
                  balanceMode === 'previous_due'
                    ? 'bg-rose-50 border-rose-300 text-rose-900 ring-2 ring-rose-200'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <div>
                  <div>Previous Due (Arrears)</div>
                  <div className="text-[10px] font-normal text-rose-700">Past unpaid dues</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setBalanceMode('advance_credit')}
                className={`py-2 px-3 text-xs font-bold rounded-lg border text-left cursor-pointer transition-all flex items-center gap-2 ${
                  balanceMode === 'advance_credit'
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-900 ring-2 ring-emerald-200'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
                <div>
                  <div>Advance / Credit</div>
                  <div className="text-[10px] font-normal text-emerald-700">Prepaid balance</div>
                </div>
              </button>
            </div>
          </div>

          {/* Amount input */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {balanceMode === 'previous_due'
                ? 'Manual Previous Due Amount (Rs.)'
                : 'Manual Advance / Credit Amount (Rs.)'}
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-xs font-mono font-bold text-slate-400">
                Rs.
              </span>
              <input
                type="number"
                min="0"
                step="any"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                placeholder="0"
                className="w-full text-sm font-mono font-bold pl-10 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                required
              />
            </div>

            {/* Quick preset buttons */}
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className="text-[10px] text-slate-400 font-medium mr-1">Quick:</span>
              <button
                type="button"
                onClick={() => setAmountInput('0')}
                className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-semibold rounded cursor-pointer transition-colors"
              >
                0 (Nil)
              </button>
              {is131 ? (
                <>
                  <button
                    type="button"
                    onClick={() => setAmountInput('300')}
                    className="px-2 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-[10px] font-semibold rounded cursor-pointer transition-colors"
                  >
                    300 (1 Mo)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAmountInput('600')}
                    className="px-2 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-[10px] font-semibold rounded cursor-pointer transition-colors"
                  >
                    600 (2 Mo)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAmountInput('900')}
                    className="px-2 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-[10px] font-semibold rounded cursor-pointer transition-colors"
                  >
                    900 (3 Mo)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAmountInput('3600')}
                    className="px-2 py-0.5 bg-amber-100 hover:bg-amber-200 text-amber-950 font-bold text-[10px] rounded cursor-pointer transition-colors"
                  >
                    3,600 (12 Mo)
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setAmountInput('150')}
                    className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-semibold rounded cursor-pointer transition-colors"
                  >
                    150 (1 Mo)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAmountInput('300')}
                    className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-semibold rounded cursor-pointer transition-colors"
                  >
                    300 (2 Mo)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAmountInput('450')}
                    className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-semibold rounded cursor-pointer transition-colors"
                  >
                    450 (3 Mo)
                  </button>
                  <button
                    type="button"
                    onClick={() => setAmountInput('1800')}
                    className="px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-bold border border-emerald-200 text-[10px] rounded cursor-pointer transition-colors"
                  >
                    1,800 (12 Mo)
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Nil Balance Rule Option (Checkbox) */}
          <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3.5">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={showNilWhenPaid}
                onChange={(e) => setShowNilWhenPaid(e.target.checked)}
                className="mt-0.5 rounded border-amber-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
              />
              <div className="text-xs">
                <span className="font-bold text-amber-950 block">
                  Show Balance as &quot;Nil&quot; when Paid Up
                </span>
                <span className="text-[11px] text-amber-800 block mt-0.5 leading-snug">
                  When total payments received ({formatMoney(totalPaid)}) are greater than or equal to due payment ({formatMoney(expectedDue)}), mark the outstanding balance as <strong>Nil</strong>.
                </span>
              </div>
            </label>
          </div>

          {/* Live Dynamic Calculation Preview Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2.5">
            <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Live Balance & Paid-Up Verification
            </div>

            <div className="flex items-center justify-between text-xs border-b border-slate-200 pb-1.5">
              <span className="text-slate-600">
                {balanceMode === 'previous_due' ? 'Manual Previous Due:' : 'Manual Advance / Credit:'}
              </span>
              <span className={`font-mono font-bold ${balanceMode === 'previous_due' ? 'text-rose-700' : 'text-emerald-700'}`}>
                {balanceMode === 'previous_due' ? `- ${formatMoney(previousDue)}` : `+ ${formatMoney(openingBalance)}`}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs border-b border-slate-200 pb-1.5">
              <span className="text-slate-600 flex items-center gap-1">
                <History className="w-3.5 h-3.5 text-slate-400" />
                <span>Total Recorded Payments (Auto):</span>
              </span>
              <span className="font-mono font-bold text-emerald-800">
                + {formatMoney(totalPaid)} <span className="text-[10px] text-slate-500 font-normal">({memberTotals.count} receipts)</span>
              </span>
            </div>

            {/* Live Display Balance Banner */}
            <div className={`p-3 rounded-lg border flex items-center justify-between ${
              isPaidUp
                ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                : 'bg-rose-50 border-rose-200 text-rose-950'
            }`}>
              <div className="space-y-0.5">
                <div className="text-xs font-bold flex items-center gap-1">
                  {isPaidUp ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>Status: Paid Up</span>
                    </>
                  ) : (
                    <>
                      <AlertCircle className="w-4 h-4 text-rose-600" />
                      <span>Status: Due Pending</span>
                    </>
                  )}
                </div>
                <div className="text-[10px] text-slate-600">
                  {isPaidUp
                    ? `Payment received (${formatMoney(totalPaid)}) ≥ Due (${formatMoney(expectedDue)})`
                    : `Remaining due: ${formatMoney(Math.abs(mathematicalBalance))}`}
                </div>
              </div>

              <div className="text-right">
                <div className="text-[10px] text-slate-500 font-semibold uppercase">Display Balance</div>
                <div className="font-mono font-extrabold text-sm">
                  {isNilDisplay ? (
                    <span className="text-emerald-700 px-2 py-0.5 bg-emerald-100 rounded-md">Nil (Paid Up)</span>
                  ) : mathematicalBalance > 0 ? (
                    <span className="text-emerald-700">+{formatMoney(mathematicalBalance)} (Adv)</span>
                  ) : (
                    <span className="text-rose-700">{formatMoney(mathematicalBalance)}</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Audit Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Audit Notes / Baseline Reason (Optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Carried forward previous register, 2025 arrears cleared..."
              className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg transition-colors shadow-xs cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Save & Update Balance</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
