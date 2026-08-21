import React, { useState, useEffect } from 'react';
import { Member, Transaction } from '../types';
import { formatMoney, num, calculateMemberTotals } from '../lib/ledgerUtils';
import { X, Save, DollarSign, ArrowRight, ShieldCheck, HelpCircle, History } from 'lucide-react';

interface EditMemberBalanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  member: Member | null;
  transactions: Transaction[];
  onSaveMemberBalance: (ledgerNo: string, openingBalance: number, notes?: string) => void;
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
  const [openingBalance, setOpeningBalance] = useState<string>('0');
  const [notes, setNotes] = useState<string>('');

  useEffect(() => {
    if (member) {
      setOpeningBalance(String(member.openingBalance ?? 0));
      setNotes(member.balanceNotes || '');
    }
  }, [member]);

  if (!isOpen || !member) return null;

  // Auto-calculated totals from ledger
  const memberTotals = calculateMemberTotals(transactions, member.ledgerNo);
  const parsedOpening = num(openingBalance);
  const effectiveLiveBalance = parsedOpening + memberTotals.totalPaid;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveMemberBalance(member.ledgerNo, parsedOpening, notes.trim());
    if (showToast) {
      showToast(`Updated balance for ${member.name} (#${member.ledgerNo}) to ${formatMoney(effectiveLiveBalance)}`);
    }
    onClose();
  };

  const handleSetQuickAmount = (amt: number) => {
    setOpeningBalance(String(amt));
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
            <h3 className="text-base font-bold text-slate-900">
              Manual Member Balance Configuration
            </h3>
            <p className="text-xs text-slate-500">
              Set initial baseline balance for <strong className="text-slate-800">{member.name}</strong> (Ledger #{member.ledgerNo})
            </p>
          </div>
        </div>

        {/* Real-time Calculation Explanation Box */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3.5 mb-5 text-xs text-blue-900 space-y-1.5">
          <div className="font-bold flex items-center gap-1.5 text-blue-950">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            <span>Automatic Real-time Update Formula:</span>
          </div>
          <p className="text-[11px] text-blue-800 leading-relaxed">
            <strong>Effective Live Balance</strong> = <em>(Manual Opening Balance)</em> + <em>(Total Paid in Ledger)</em>.
            When new payment vouchers are entered for this member, their live balance will automatically increment!
          </p>
        </div>

        {/* Live Calculation Preview Card */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mb-5 space-y-3">
          <div className="flex items-center justify-between text-xs border-b border-slate-200 pb-2">
            <span className="text-slate-600">Manual Opening / Baseline Balance:</span>
            <span className={`font-mono font-bold ${parsedOpening >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
              {formatMoney(parsedOpening)}
            </span>
          </div>

          <div className="flex items-center justify-between text-xs border-b border-slate-200 pb-2">
            <span className="text-slate-600 flex items-center gap-1">
              <History className="w-3.5 h-3.5 text-slate-400" />
              <span>Total Recorded Payments (Auto):</span>
            </span>
            <span className="font-mono font-bold text-emerald-800">
              + {formatMoney(memberTotals.totalPaid)} <span className="text-[10px] text-slate-500 font-normal">({memberTotals.count} receipts)</span>
            </span>
          </div>

          <div className="flex items-center justify-between text-xs pt-1 bg-amber-100/60 p-2.5 rounded-lg border border-amber-200">
            <span className="font-bold text-amber-950 flex items-center gap-1">
              <ArrowRight className="w-3.5 h-3.5 text-amber-700" />
              <span>Effective Live Balance:</span>
            </span>
            <span className={`font-mono font-extrabold text-sm ${effectiveLiveBalance >= 0 ? 'text-emerald-800' : 'text-rose-800'}`}>
              {formatMoney(effectiveLiveBalance)}
              {effectiveLiveBalance > 0 && <span className="text-[10px] ml-1 px-1.5 py-0.5 bg-emerald-200 text-emerald-900 rounded-full font-bold">Advance</span>}
              {effectiveLiveBalance < 0 && <span className="text-[10px] ml-1 px-1.5 py-0.5 bg-rose-200 text-rose-900 rounded-full font-bold">Arrears</span>}
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Manual Opening / Starting Balance (Rs.)
            </label>
            <input
              type="number"
              step="any"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
              placeholder="e.g. 0 or 1000 for advance, -500 for arrears"
              className="w-full text-sm font-mono font-bold px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
              required
            />
            <p className="text-[10px] text-slate-500 mt-1">
              Use positive value for starting Advance / Credit (e.g. +1000) or negative for Opening Arrears / Dues (e.g. -500).
            </p>

            {/* Quick preset buttons */}
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className="text-[10px] text-slate-400 font-medium mr-1">Quick:</span>
              <button
                type="button"
                onClick={() => handleSetQuickAmount(0)}
                className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-semibold rounded cursor-pointer transition-colors"
              >
                0 (Zero)
              </button>
              <button
                type="button"
                onClick={() => handleSetQuickAmount(150)}
                className="px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[10px] font-semibold rounded cursor-pointer transition-colors"
              >
                +150 (1 Mo Adv)
              </button>
              <button
                type="button"
                onClick={() => handleSetQuickAmount(450)}
                className="px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[10px] font-semibold rounded cursor-pointer transition-colors"
              >
                +450 (3 Mo Adv)
              </button>
              <button
                type="button"
                onClick={() => handleSetQuickAmount(1000)}
                className="px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-[10px] font-semibold rounded cursor-pointer transition-colors"
              >
                +1000 Advance
              </button>
              <button
                type="button"
                onClick={() => handleSetQuickAmount(-300)}
                className="px-2 py-0.5 bg-rose-50 hover:bg-rose-100 text-rose-800 text-[10px] font-semibold rounded cursor-pointer transition-colors"
              >
                -300 Due
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Audit Notes / Baseline Reason (Optional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Carried forward from previous register, 2025 advance..."
              className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
            />
          </div>

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
