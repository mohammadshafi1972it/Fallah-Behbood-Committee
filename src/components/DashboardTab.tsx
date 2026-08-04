import React, { useState, useMemo } from 'react';
import { Transaction, Member, AppSettings } from '../types';
import { computeMonthlySummary, computeDailySummary, formatMoney, num, exportCsv, fmtDate } from '../lib/ledgerUtils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, TrendingDown, Wallet, Users, FileText, Download, RefreshCw, Calendar } from 'lucide-react';

interface DashboardTabProps {
  transactions: Transaction[];
  members: Member[];
  settings: AppSettings;
  onUpdateOpeningBalance: (bal: number) => void;
  showToast: (msg: string) => void;
}

const COLORS = ['#1F3A5F', '#A63D40', '#2E6E4E', '#B8863B', '#7a6fa6', '#5c8a99', '#c98a4b'];

export const DashboardTab: React.FC<DashboardTabProps> = ({
  transactions,
  members,
  settings,
  onUpdateOpeningBalance,
  showToast,
}) => {
  const [openingBal, setOpeningBal] = useState<string>(String(settings.openingBalance || 0));
  const [dailyFrom, setDailyFrom] = useState<string>('');
  const [dailyTo, setDailyTo] = useState<string>('');

  const totalIncome = useMemo(
    () => transactions.filter((t) => t.type === 'Income').reduce((s, t) => s + num(t.amount), 0),
    [transactions]
  );

  const totalExpenditure = useMemo(
    () => transactions.filter((t) => t.type === 'Expenditure').reduce((s, t) => s + num(t.amount), 0),
    [transactions]
  );

  const netBalance = useMemo(
    () => num(settings.openingBalance) + totalIncome - totalExpenditure,
    [settings.openingBalance, totalIncome, totalExpenditure]
  );

  const monthlySummaries = useMemo(
    () => computeMonthlySummary(transactions, settings.openingBalance),
    [transactions, settings.openingBalance]
  );

  const dailySummaries = useMemo(
    () => computeDailySummary(transactions, dailyFrom, dailyTo),
    [transactions, dailyFrom, dailyTo]
  );

  const last30Days = useMemo(() => dailySummaries.slice(-30), [dailySummaries]);

  // Head breakdowns
  const incomeByHead = useMemo(() => {
    const map: Record<string, number> = {};
    transactions
      .filter((t) => t.type === 'Income')
      .forEach((t) => {
        const k = t.head || 'Other';
        map[k] = (map[k] || 0) + num(t.amount);
      });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [transactions]);

  const expenditureByHead = useMemo(() => {
    const map: Record<string, number> = {};
    transactions
      .filter((t) => t.type === 'Expenditure')
      .forEach((t) => {
        const k = t.head || 'Other';
        map[k] = (map[k] || 0) + num(t.amount);
      });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [transactions]);

  const handleOpeningBalChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setOpeningBal(val);
    onUpdateOpeningBalance(num(val));
  };

  return (
    <div className="space-y-6">
      {/* Top Controls & KPI Grid */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs font-semibold text-slate-700">Opening Balance (Rs.):</label>
          <input
            type="number"
            value={openingBal}
            onChange={handleOpeningBalChange}
            className="w-32 text-xs font-mono px-3 py-1.5 border border-slate-200 rounded-lg font-bold bg-slate-50 focus:bg-white"
          />
        </div>
        <p className="text-xs text-slate-500">Live dashboard updates as transactions are recorded.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs text-center">
          <TrendingUp className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
          <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Total Income</span>
          <span className="text-base sm:text-lg font-bold text-emerald-700 font-mono">{formatMoney(totalIncome)}</span>
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs text-center">
          <TrendingDown className="w-5 h-5 text-rose-600 mx-auto mb-1" />
          <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Total Expenditure</span>
          <span className="text-base sm:text-lg font-bold text-rose-700 font-mono">{formatMoney(totalExpenditure)}</span>
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs text-center">
          <Wallet className="w-5 h-5 text-amber-600 mx-auto mb-1" />
          <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Net Balance</span>
          <span
            className={`text-base sm:text-lg font-bold font-mono ${
              netBalance < 0 ? 'text-rose-600' : 'text-slate-900'
            }`}
          >
            {formatMoney(netBalance)}
          </span>
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs text-center">
          <Users className="w-5 h-5 text-blue-600 mx-auto mb-1" />
          <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Active Members</span>
          <span className="text-base sm:text-lg font-bold text-slate-900 font-mono">{members.length}</span>
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs text-center">
          <FileText className="w-5 h-5 text-purple-600 mx-auto mb-1" />
          <span className="text-[10px] text-slate-500 uppercase tracking-wider block">Total Entries</span>
          <span className="text-base sm:text-lg font-bold text-slate-900 font-mono">{transactions.length}</span>
        </div>
      </div>

      {/* Recharts Analytics Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Month-wise Comparison */}
        <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-xs">
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-4">Month-Wise Income vs Expenditure</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlySummaries}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => formatMoney(Number(value))} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="income" name="Income" fill="#2E6E4E" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenditure" name="Expenditure" fill="#A63D40" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Day-wise Last 30 Days */}
        <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-xs">
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-4">Day-Wise Ledger Trend (Last 30 Days)</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={last30Days}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d) => fmtDate(d).slice(0, 5)} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(value) => formatMoney(Number(value))} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="income" name="Income" fill="#2E6E4E" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expenditure" name="Expenditure" fill="#A63D40" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Income by Head Pie */}
        <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-xs">
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-4">Income Distribution by Fund / Head</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={incomeByHead}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                >
                  {incomeByHead.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatMoney(Number(value))} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Expenditure by Head Pie */}
        <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-xs">
          <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-4">Expenditure Breakdown by Category</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={expenditureByHead}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                >
                  {expenditureByHead.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[(index + 2) % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatMoney(Number(value))} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Month-Wise Statement Table */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-sm font-serif font-bold text-slate-800">Month-Wise Financial Statement</h3>
          <button
            onClick={() =>
              exportCsv(
                ['Month', 'Income', 'Expenditure', 'Net', 'Running Balance'],
                monthlySummaries.map((m) => [m.month, m.income, m.expenditure, m.net, m.balance]),
                'Fallah_Behbood_Monthly_Statement.csv'
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
                <th className="py-2.5 px-3">Income</th>
                <th className="py-2.5 px-3">Expenditure</th>
                <th className="py-2.5 px-3">Net Savings</th>
                <th className="py-2.5 px-3">Running Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {monthlySummaries.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400 font-sans">
                    No records available yet.
                  </td>
                </tr>
              ) : (
                monthlySummaries.map((m) => (
                  <tr key={m.month} className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-bold text-slate-800">{m.month}</td>
                    <td className="py-2 px-3 text-emerald-700">{formatMoney(m.income)}</td>
                    <td className="py-2 px-3 text-rose-700">{formatMoney(m.expenditure)}</td>
                    <td className="py-2 px-3 font-semibold">{formatMoney(m.net)}</td>
                    <td className="py-2 px-3 font-bold text-slate-900">{formatMoney(m.balance)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Day-Wise Statement Table */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <h3 className="text-sm font-serif font-bold text-slate-800">Day-Wise Statement</h3>

          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dailyFrom}
              onChange={(e) => setDailyFrom(e.target.value)}
              className="text-xs font-mono px-2.5 py-1.5 border border-slate-200 rounded-lg bg-slate-50"
            />
            <span className="text-xs text-slate-400">to</span>
            <input
              type="date"
              value={dailyTo}
              onChange={(e) => setDailyTo(e.target.value)}
              className="text-xs font-mono px-2.5 py-1.5 border border-slate-200 rounded-lg bg-slate-50"
            />

            <button
              onClick={() =>
                exportCsv(
                  ['Date', 'Income', 'Expenditure', 'Net'],
                  dailySummaries.map((d) => [fmtDate(d.date), d.income, d.expenditure, d.net]),
                  'Fallah_Behbood_Daily_Statement.csv'
                )
              }
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        <div className="border border-slate-200 rounded-xl overflow-hidden overflow-x-auto max-h-80 overflow-y-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-800 text-white font-serif uppercase tracking-wider text-[10px] sticky top-0">
              <tr>
                <th className="py-2.5 px-3">Date</th>
                <th className="py-2.5 px-3">Income</th>
                <th className="py-2.5 px-3">Expenditure</th>
                <th className="py-2.5 px-3">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {dailySummaries.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-400 font-sans">
                    No entries in selected date range.
                  </td>
                </tr>
              ) : (
                dailySummaries.map((d) => (
                  <tr key={d.date} className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-bold text-slate-800">{fmtDate(d.date)}</td>
                    <td className="py-2 px-3 text-emerald-700">{formatMoney(d.income)}</td>
                    <td className="py-2 px-3 text-rose-700">{formatMoney(d.expenditure)}</td>
                    <td className="py-2 px-3 font-bold text-slate-900">{formatMoney(d.net)}</td>
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
