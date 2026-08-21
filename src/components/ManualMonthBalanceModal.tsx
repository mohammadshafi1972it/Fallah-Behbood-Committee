import React, { useState, useEffect } from 'react';
import { X, Check, Calculator, Edit3, AlertTriangle, CheckCircle2, ShieldCheck, Banknote, Building2, HelpCircle } from 'lucide-react';
import { MonthBalanceTableRow, MonthBalanceConfig } from '../types';
import { formatMoney, num, getMonthLabel } from '../lib/ledgerUtils';

interface ManualMonthBalanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  monthRow: MonthBalanceTableRow | null;
  onSave: (month: string, config: MonthBalanceConfig) => void;
  showToast: (msg: string) => void;
}

export const ManualMonthBalanceModal: React.FC<ManualMonthBalanceModalProps> = ({
  isOpen,
  onClose,
  monthRow,
  onSave,
  showToast,
}) => {
  if (!isOpen || !monthRow) return null;

  const [mode, setMode] = useState<'auto' | 'manual'>(monthRow.mode || 'auto');
  const [cashInHand, setCashInHand] = useState<string>(
    monthRow.cashInHand !== undefined ? String(monthRow.cashInHand) : ''
  );
  const [bankBalance, setBankBalance] = useState<string>(
    monthRow.bankBalance !== undefined ? String(monthRow.bankBalance) : ''
  );
  const [manualTotal, setManualTotal] = useState<string>(
    monthRow.mode === 'manual' && monthRow.effectiveBalance !== undefined
      ? String(monthRow.effectiveBalance)
      : String(monthRow.autoBalance)
  );
  const [useSplitFields, setUseSplitFields] = useState<boolean>(
    monthRow.cashInHand !== undefined || monthRow.bankBalance !== undefined
  );
  const [notes, setNotes] = useState<string>(monthRow.notes || '');
  const [verifiedBy, setVerifiedBy] = useState<string>(monthRow.verifiedBy || '');

  // Keep total in sync when cash/bank split changes
  useEffect(() => {
    if (useSplitFields) {
      const c = num(cashInHand);
      const b = num(bankBalance);
      setManualTotal(String(c + b));
    }
  }, [cashInHand, bankBalance, useSplitFields]);

  const calculatedAutoBalance = monthRow.autoBalance;
  const currentEffective = mode === 'manual' ? num(manualTotal) : calculatedAutoBalance;
  const currentVariance = currentEffective - calculatedAutoBalance;
  const isBalanced = Math.abs(currentVariance) < 0.01;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    const config: MonthBalanceConfig = {
      mode,
      manualBalance: mode === 'manual' ? num(manualTotal) : undefined,
      cashInHand: mode === 'manual' && useSplitFields ? num(cashInHand) : undefined,
      bankBalance: mode === 'manual' && useSplitFields ? num(bankBalance) : undefined,
      notes: notes.trim() || undefined,
      verifiedBy: verifiedBy.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };

    onSave(monthRow.month, config);
    showToast(
      mode === 'auto'
        ? `Month ${monthRow.monthLabel} set to Automatic calculation.`
        : `Manual month-end balance for ${monthRow.monthLabel} updated.`
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-lg w-full p-6 relative animate-in fade-in zoom-in duration-150 my-8">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 border-b border-slate-100 pb-4 mb-5">
          <div className="p-2.5 bg-amber-50 text-amber-700 rounded-xl">
            <Calculator className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Month-End Balance Setup — {monthRow.monthLabel}
            </h2>
            <p className="text-xs text-slate-500">
              Select between automatic ledger tracking or manual physical audit entry.
            </p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          {/* Mode Selection Tabs */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setMode('auto')}
              className={`py-2 px-3 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer ${
                mode === 'auto'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Calculator className="w-4 h-4 text-emerald-600" />
              <span>⚡ Automatic Update</span>
            </button>

            <button
              type="button"
              onClick={() => setMode('manual')}
              className={`py-2 px-3 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-all cursor-pointer ${
                mode === 'manual'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Edit3 className="w-4 h-4 text-amber-600" />
              <span>✍️ Manual Entry</span>
            </button>
          </div>

          {/* Month Financial Context Card */}
          <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-2">
            <div className="flex justify-between text-slate-600">
              <span>Opening Balance:</span>
              <span className="font-mono font-bold text-slate-800">{formatMoney(monthRow.openingBalance)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Total Income ({monthRow.incomeCount} entries):</span>
              <span className="font-mono font-bold text-emerald-700">+{formatMoney(monthRow.income)}</span>
            </div>
            <div className="flex justify-between text-slate-600">
              <span>Total Payments ({monthRow.expenditureCount} vouchers):</span>
              <span className="font-mono font-bold text-rose-700">-{formatMoney(monthRow.expenditure)}</span>
            </div>
            <div className="pt-2 border-t border-slate-200 flex justify-between font-bold text-slate-900">
              <span>Auto-Calculated Closing Balance:</span>
              <span className="font-mono text-emerald-800 text-sm">{formatMoney(calculatedAutoBalance)}</span>
            </div>
          </div>

          {/* Manual Entry Input Fields */}
          {mode === 'manual' ? (
            <div className="space-y-3 pt-1 animate-in fade-in">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800">
                  Physical / Verified Closing Balance (Rs.)
                </label>
                <button
                  type="button"
                  onClick={() => setUseSplitFields(!useSplitFields)}
                  className="text-[11px] text-blue-700 font-semibold hover:underline cursor-pointer"
                >
                  {useSplitFields ? 'Switch to Simple Total' : '+ Split Cash in Hand & Bank Account'}
                </button>
              </div>

              {useSplitFields ? (
                <div className="grid grid-cols-2 gap-3 p-3 bg-amber-50/50 border border-amber-200 rounded-xl">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 block mb-1 flex items-center gap-1">
                      <Banknote className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Cash in Hand (Rs.)</span>
                    </label>
                    <input
                      type="number"
                      step="any"
                      placeholder="0.00"
                      value={cashInHand}
                      onChange={(e) => setCashInHand(e.target.value)}
                      className="w-full text-xs font-mono font-bold px-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-emerald-600"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-slate-700 block mb-1 flex items-center gap-1">
                      <Building2 className="w-3.5 h-3.5 text-blue-700" />
                      <span>Bank Account (Rs.)</span>
                    </label>
                    <input
                      type="number"
                      step="any"
                      placeholder="0.00"
                      value={bankBalance}
                      onChange={(e) => setBankBalance(e.target.value)}
                      className="w-full text-xs font-mono font-bold px-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-blue-600"
                    />
                  </div>

                  <div className="col-span-2 pt-1 border-t border-amber-200/80 flex justify-between items-center text-xs font-bold text-slate-800">
                    <span>Combined Total Month-End Balance:</span>
                    <span className="font-mono text-amber-900">{formatMoney(num(manualTotal))}</span>
                  </div>
                </div>
              ) : (
                <div>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="e.g. 25000"
                    value={manualTotal}
                    onChange={(e) => setManualTotal(e.target.value)}
                    className="w-full text-sm font-mono font-bold px-3.5 py-2.5 border border-slate-300 rounded-lg bg-white focus:outline-amber-600"
                  />
                </div>
              )}

              {/* Variance Indicator */}
              <div
                className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                  isBalanced
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-amber-50 border-amber-200 text-amber-900'
                }`}
              >
                {isBalanced ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="font-bold">
                    {isBalanced
                      ? 'Reconciled: Manual balance matches ledger calculation.'
                      : `Variance Detected: ${currentVariance > 0 ? '+' : ''}${formatMoney(currentVariance)}`}
                  </p>
                  <p className="text-[11px] opacity-80 mt-0.5">
                    {isBalanced
                      ? 'No discrepancy between actual physical cash and recorded vouchers.'
                      : 'A note explaining the discrepancy (e.g. uncredited check, bank charges, cash transit) is recommended.'}
                  </p>
                </div>
              </div>

              {/* Notes / Reason */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Reconciliation Note / Reason for Adjustment (Optional):
                </label>
                <input
                  type="text"
                  placeholder="e.g. Physical cash verified with treasurer, Rs. 200 bank profit added"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-emerald-600"
                />
              </div>

              {/* Verified By */}
              <div>
                <label className="text-xs font-semibold text-slate-700 block mb-1">
                  Audited / Verified By (Optional):
                </label>
                <input
                  type="text"
                  placeholder="e.g. Haji Ghulam Mohammad (Treasurer)"
                  value={verifiedBy}
                  onChange={(e) => setVerifiedBy(e.target.value)}
                  className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-emerald-600"
                />
              </div>
            </div>
          ) : (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 space-y-1.5 animate-in fade-in">
              <div className="flex items-center gap-2 font-bold">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Automatic Update Active</span>
              </div>
              <p className="leading-relaxed">
                The Month-End Closing Balance for <strong>{monthRow.monthLabel}</strong> will automatically calculate and update whenever you add, edit, or delete income and expenditure ledger entries.
              </p>
            </div>
          )}

          {/* Form Actions */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-bold text-white bg-slate-800 hover:bg-slate-900 rounded-lg transition-colors shadow-xs cursor-pointer inline-flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>Save Month Balance Settings</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
