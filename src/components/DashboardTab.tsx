import React, { useState, useMemo } from 'react';
import { Transaction, Member, AppSettings } from '../types';
import { computeMonthlySummary, computeDailySummary, formatMoney, num, exportCsv, fmtDate, calculateMemberTotals, calculateContributionsForMonth } from '../lib/ledgerUtils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { 
  TrendingUp, 
  TrendingDown, 
  Wallet, 
  Users, 
  FileText, 
  Download, 
  Calendar, 
  Award, 
  MessageSquare, 
  Send, 
  Copy, 
  Printer, 
  Search, 
  Filter, 
  ArrowUpDown, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Share2, 
  Phone 
} from 'lucide-react';
import { SendReminderModal, OverdueMemberItem } from './SendReminderModal';

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

  // Monthly Dues Report States
  const currentMonthStr = useMemo(() => new Date().toISOString().slice(0, 7), []);
  const [selectedDueMonth, setSelectedDueMonth] = useState<string>(currentMonthStr);
  const [dueSearchQuery, setDueSearchQuery] = useState<string>('');
  const [dueStatusFilter, setDueStatusFilter] = useState<'All' | 'Due' | 'Partial' | 'Paid'>('All');
  const [dueSortBy, setDueSortBy] = useState<'outstanding_desc' | 'outstanding_asc' | 'ledger_asc' | 'name_asc'>('outstanding_desc');

  // WhatsApp Reminder Modal States
  const [isReminderModalOpen, setIsReminderModalOpen] = useState(false);
  const [singleReminderTarget, setSingleReminderTarget] = useState<OverdueMemberItem | null>(null);

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

  // Top 5 Contributing Members
  const topContributors = useMemo(() => {
    const list = members.map((m) => {
      const totals = calculateMemberTotals(transactions, m.ledgerNo);
      const shortName = m.name.length > 15 ? m.name.slice(0, 15) + '…' : m.name;
      return {
        ledgerNo: m.ledgerNo,
        name: m.name,
        displayName: `#${m.ledgerNo} ${shortName}`,
        totalPaid: totals.totalPaid,
        txCount: totals.count,
      };
    });

    list.sort((a, b) => b.totalPaid - a.totalPaid || b.txCount - a.txCount);
    return list.slice(0, 5);
  }, [members, transactions]);

  // Available unique months list from transactions
  const availableMonths = useMemo(() => {
    const monthsSet = new Set<string>();
    monthsSet.add(currentMonthStr);
    transactions.forEach((t) => {
      if (t.forMonth) monthsSet.add(t.forMonth);
      if (t.date) monthsSet.add(t.date.slice(0, 7));
    });
    return Array.from(monthsSet).sort().reverse();
  }, [transactions, currentMonthStr]);

  // Format month name e.g. "2026-08" -> "August 2026"
  const getMonthLabel = (mStr: string) => {
    if (!mStr) return 'Current Month';
    const [year, month] = mStr.split('-');
    if (!year || !month) return mStr;
    const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
    return date.toLocaleString('default', { month: 'long', year: 'numeric' });
  };

  const selectedMonthLabel = getMonthLabel(selectedDueMonth);

  // Calculate monthly dues status for all members for selectedDueMonth
  const monthlyDuesData = useMemo(() => {
    const contributions = calculateContributionsForMonth(members, transactions, selectedDueMonth);
    const map = new Map(contributions.map((c) => [String(c.ledgerNo).trim(), c]));

    const list = members.map((m) => {
      const c = map.get(String(m.ledgerNo).trim());
      const expected = c?.expected || num(m.monthlyDue) || 150;
      const paid = c?.paid || 0;
      const outstanding = Math.max(0, expected - paid);
      const status: 'Paid' | 'Partial' | 'Due' = c?.status || (paid <= 0 ? 'Due' : paid < expected ? 'Partial' : 'Paid');

      return {
        member: m,
        ledgerNo: m.ledgerNo,
        name: m.name,
        phone: m.phone,
        monthlyDue: expected,
        paid,
        outstanding,
        status,
      };
    });

    return list;
  }, [members, transactions, selectedDueMonth]);

  // Filtered & Sorted monthly dues list
  const filteredDueList = useMemo(() => {
    let result = monthlyDuesData.slice();

    if (dueSearchQuery.trim()) {
      const q = dueSearchQuery.trim().toLowerCase();
      result = result.filter(
        (item) => item.name.toLowerCase().includes(q) || item.ledgerNo.toLowerCase().includes(q)
      );
    }

    if (dueStatusFilter !== 'All') {
      result = result.filter((item) => item.status === dueStatusFilter);
    }

    result.sort((a, b) => {
      if (dueSortBy === 'outstanding_desc') return b.outstanding - a.outstanding || (parseInt(a.ledgerNo, 10) || 0) - (parseInt(b.ledgerNo, 10) || 0);
      if (dueSortBy === 'outstanding_asc') return a.outstanding - b.outstanding || (parseInt(a.ledgerNo, 10) || 0) - (parseInt(b.ledgerNo, 10) || 0);
      if (dueSortBy === 'ledger_asc') return (parseInt(a.ledgerNo, 10) || 0) - (parseInt(b.ledgerNo, 10) || 0);
      if (dueSortBy === 'name_asc') return a.name.localeCompare(b.name);
      return 0;
    });

    return result;
  }, [monthlyDuesData, dueSearchQuery, dueStatusFilter, dueSortBy]);

  // Dues Summary KPIs
  const duesSummary = useMemo(() => {
    let totalExpected = 0;
    let totalCollected = 0;
    let totalOutstanding = 0;
    let paidCount = 0;
    let partialCount = 0;
    let dueCount = 0;

    monthlyDuesData.forEach((item) => {
      totalExpected += item.monthlyDue;
      totalCollected += item.paid;
      totalOutstanding += item.outstanding;
      if (item.status === 'Paid') paidCount++;
      else if (item.status === 'Partial') partialCount++;
      else dueCount++;
    });

    const collectionRate = totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0;

    return {
      totalExpected,
      totalCollected,
      totalOutstanding,
      paidCount,
      partialCount,
      dueCount,
      totalMembers: monthlyDuesData.length,
      collectionRate,
    };
  }, [monthlyDuesData]);

  // Overdue members list for SendReminderModal
  const overdueMembersForModal = useMemo<OverdueMemberItem[]>(() => {
    return monthlyDuesData
      .filter((item) => item.status !== 'Paid')
      .map((item) => ({
        ledgerNo: item.ledgerNo,
        name: item.name,
        outstanding: item.outstanding,
        month: selectedDueMonth,
        phone: item.phone,
        status: item.status,
        monthlyDue: item.monthlyDue,
        paid: item.paid,
      }));
  }, [monthlyDuesData, selectedDueMonth]);

  // Clean phone number helper
  const cleanPhone = (phone?: string) => {
    if (!phone) return '';
    let clean = phone.replace(/[^0-9]/g, '');
    if (clean.startsWith('0') && clean.length === 11) {
      clean = '92' + clean.slice(1);
    }
    return clean;
  };

  // Generate 1-Click WhatsApp reminder message
  const generateWhatsAppMessage = (item: typeof monthlyDuesData[0]) => {
    const org = settings.organizationName || 'Fallah Behbood Committee';
    return `السلام علیکم ورحمۃ اللہ وبرکاتہ
محترم ${item.name} صاحب (لیجر نمبر: ${item.ledgerNo})،

امید ہے آپ بخیر ہوں گے۔ ${org} کی طرف سے یاد دہانی کہ ماہ ${selectedMonthLabel} کی ماہانہ فلاحی فیس / چندہ مبلغ Rs. ${item.outstanding}/- ابھی تک واجب الادا ہے۔

براہ کرم فلاحی امور کی انجام دہی کے لیے اپنے بقایا جات جلد از جلد جمع فرما دیں۔
جزاکم اللہ خیراً۔
— انتظامیہ: ${org}`;
  };

  // Direct 1-Click WhatsApp Trigger
  const handleDirectWhatsApp = (item: typeof monthlyDuesData[0]) => {
    const text = encodeURIComponent(generateWhatsAppMessage(item));
    const phone = cleanPhone(item.phone);
    let url = '';
    if (phone && phone.length >= 10) {
      url = `https://wa.me/${phone}?text=${text}`;
    } else {
      url = `https://api.whatsapp.com/send?text=${text}`;
    }
    window.open(url, '_blank');
    showToast(`WhatsApp reminder opened for ${item.name}!`);
  };

  // Copy Reminder Text
  const handleCopyReminder = (item: typeof monthlyDuesData[0]) => {
    const msg = generateWhatsAppMessage(item);
    navigator.clipboard.writeText(msg);
    showToast(`WhatsApp reminder message for ${item.name} copied to clipboard!`);
  };

  // Open Full Reminder Modal for single member
  const handleOpenReminderModal = (item: typeof monthlyDuesData[0]) => {
    setSingleReminderTarget({
      ledgerNo: item.ledgerNo,
      name: item.name,
      outstanding: item.outstanding,
      month: selectedDueMonth,
      phone: item.phone,
      status: item.status,
      monthlyDue: item.monthlyDue,
      paid: item.paid,
    });
    setIsReminderModalOpen(true);
  };

  // Export Monthly Dues CSV
  const handleExportDuesCSV = () => {
    if (!monthlyDuesData.length) {
      showToast('No member dues data to export.');
      return;
    }
    const headers = [
      'S.No',
      'Ledger No.',
      'Member Name',
      'Phone / WhatsApp',
      'Billing Month',
      'Standard Due (Rs.)',
      'Paid So Far (Rs.)',
      'Outstanding Due (Rs.)',
      'Status',
    ];
    const rows = filteredDueList.map((item, idx) => [
      idx + 1,
      item.ledgerNo,
      item.name,
      item.phone || '—',
      selectedMonthLabel,
      item.monthlyDue,
      item.paid,
      item.outstanding,
      item.status,
    ]);

    rows.push([
      'TOTAL',
      '—',
      `All ${filteredDueList.length} Listed Members`,
      '—',
      selectedMonthLabel,
      duesSummary.totalExpected,
      duesSummary.totalCollected,
      duesSummary.totalOutstanding,
      `${duesSummary.collectionRate}% Cleared`,
    ]);

    exportCsv(headers, rows, `Monthly_Dues_Report_${selectedDueMonth}.csv`);
    showToast(`Monthly dues report for ${selectedMonthLabel} exported as CSV.`);
  };

  // Print Monthly Due Statement PDF
  const handlePrintDuesPDF = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showToast('Please allow popups to print monthly dues statement.');
      return;
    }

    const org = settings.organizationName || 'Fallah Behbood Committee';
    const sub = settings.subTitle || 'Income & Expenditure Ledger';

    const rowsHtml = filteredDueList
      .map((item, idx) => `
        <tr style="${item.status === 'Due' ? 'background-color: #fff1f2;' : item.status === 'Partial' ? 'background-color: #fffbeb;' : ''}">
          <td style="text-align: center; font-weight: bold;">${idx + 1}</td>
          <td style="font-family: monospace; font-weight: bold;">${item.ledgerNo}</td>
          <td><strong>${item.name}</strong></td>
          <td style="font-family: monospace;">${item.phone || '—'}</td>
          <td style="text-align: right; font-family: monospace;">${formatMoney(item.monthlyDue)}</td>
          <td style="text-align: right; font-family: monospace; color: #047857;">${formatMoney(item.paid)}</td>
          <td style="text-align: right; font-family: monospace; font-weight: bold; color: ${item.outstanding > 0 ? '#b91c1c' : '#047857'};">
            ${formatMoney(item.outstanding)}
          </td>
          <td style="text-align: center; font-weight: bold; font-size: 8pt;">
            <span style="padding: 2px 6px; border-radius: 4px; ${
              item.status === 'Paid'
                ? 'background: #d1fae5; color: #065f46;'
                : item.status === 'Partial'
                ? 'background: #fef3c7; color: #92400e;'
                : 'background: #fee2e2; color: #991b1b;'
            }">
              ${item.status.toUpperCase()}
            </span>
          </td>
        </tr>
      `)
      .join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Monthly Due Report - ${selectedMonthLabel}</title>
        <style>
          @page { size: A4 portrait; margin: 12mm; }
          body { font-family: 'Times New Roman', serif; color: #1e293b; margin: 0; padding: 10px; }
          .header { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 16px; }
          .title { font-size: 18pt; font-weight: bold; text-transform: uppercase; margin: 0; }
          .subtitle { font-size: 10pt; color: #475569; margin: 4px 0 0 0; }
          .badge { display: inline-block; padding: 4px 12px; background: #0f172a; color: white; font-size: 9pt; font-family: monospace; font-weight: bold; border-radius: 4px; margin-top: 6px; }
          
          .kpi-grid { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 16px; }
          .kpi-box { flex: 1; border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px; text-align: center; background: #f8fafc; }
          .kpi-label { font-size: 7.5pt; text-transform: uppercase; color: #64748b; font-weight: bold; }
          .kpi-val { font-size: 13pt; font-weight: bold; font-family: monospace; margin-top: 2px; }
          
          table { width: 100%; border-collapse: collapse; font-size: 9pt; }
          th { background: #0f172a; color: white; padding: 6px 8px; text-align: left; font-size: 8pt; text-transform: uppercase; }
          td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; }
          .total-row { background: #f1f5f9; font-weight: bold; border-top: 2px solid #0f172a; }
          
          .footer { margin-top: 25px; display: flex; justify-content: space-between; font-size: 8pt; color: #64748b; border-top: 1px solid #cbd5e1; padding-top: 8px; }
          .sig-box { margin-top: 35px; display: flex; justify-content: space-between; text-align: center; font-size: 9pt; font-weight: bold; }
          .sig-line { width: 180px; border-top: 1px solid #334155; padding-top: 4px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">${org}</div>
          <div class="subtitle">${sub}</div>
          <div class="badge">MONTHLY DUES & OUTSTANDING REPORT — ${selectedMonthLabel.toUpperCase()}</div>
        </div>

        <div class="kpi-grid">
          <div class="kpi-box">
            <div class="kpi-label">Total Expected Dues</div>
            <div class="kpi-val">${formatMoney(duesSummary.totalExpected)}</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-label">Total Collected</div>
            <div class="kpi-val" style="color: #047857;">${formatMoney(duesSummary.totalCollected)}</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-label">Total Outstanding</div>
            <div class="kpi-val" style="color: #b91c1c;">${formatMoney(duesSummary.totalOutstanding)}</div>
          </div>
          <div class="kpi-box">
            <div class="kpi-label">Status Summary</div>
            <div class="kpi-val" style="font-size: 10pt;">
              ${duesSummary.paidCount} Paid / ${duesSummary.dueCount + duesSummary.partialCount} Pending (${duesSummary.collectionRate}%)
            </div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 30px; text-align: center;">#</th>
              <th style="width: 60px;">Ledger #</th>
              <th>Member Name</th>
              <th>Phone</th>
              <th style="text-align: right;">Standard Due</th>
              <th style="text-align: right;">Paid So Far</th>
              <th style="text-align: right;">Outstanding</th>
              <th style="text-align: center; width: 70px;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
            <tr class="total-row">
              <td colspan="4" style="text-align: right; font-weight: bold;">TOTAL SUMMARY (${filteredDueList.length} MEMBERS):</td>
              <td style="text-align: right; font-family: monospace;">${formatMoney(duesSummary.totalExpected)}</td>
              <td style="text-align: right; font-family: monospace; color: #047857;">${formatMoney(duesSummary.totalCollected)}</td>
              <td style="text-align: right; font-family: monospace; color: #b91c1c; font-size: 10pt;">${formatMoney(duesSummary.totalOutstanding)}</td>
              <td style="text-align: center;">${duesSummary.collectionRate}% Cleared</td>
            </tr>
          </tbody>
        </table>

        <div class="sig-box">
          <div class="sig-line">Prepared By (Cashier)</div>
          <div class="sig-line">Audited By (Gen. Secretary)</div>
          <div class="sig-line">President / Chairman</div>
        </div>

        <div class="footer">
          <div>Report generated for ${org}</div>
          <div>Printed on: ${fmtDate(new Date().toISOString().slice(0, 10))}</div>
        </div>

        <script>window.onload = function() { window.print(); }</script>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

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
        <p className="text-xs text-slate-500">Live dashboard updates as transactions and payments are recorded.</p>
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

      {/* ========================================================================= */}
      {/* FEATURE: MONTHLY DUE REPORT & WHATSAPP MESSAGING DASHBOARD SECTION        */}
      {/* ========================================================================= */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-5">
        {/* Section Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h3 className="text-base font-serif font-bold text-slate-900 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-emerald-600" />
              <span>Monthly Dues & Outstanding Payments Report</span>
              <span className="px-2 py-0.5 text-[11px] bg-emerald-100 text-emerald-800 rounded-full font-sans font-bold">
                WhatsApp Enabled
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Calculates member dues vs paid subscriptions for <span className="font-bold text-slate-700">{selectedMonthLabel}</span> with 1-click personalized WhatsApp notifications.
            </p>
          </div>

          {/* Month Selector & Global Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {/* Month Select Dropdown */}
            <div className="flex items-center gap-1.5 bg-slate-50 px-3 py-1.5 border border-slate-200 rounded-lg text-xs">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              <span className="text-slate-500 font-medium whitespace-nowrap">Month:</span>
              <select
                value={selectedDueMonth}
                onChange={(e) => setSelectedDueMonth(e.target.value)}
                className="bg-transparent font-bold text-slate-900 focus:outline-none cursor-pointer text-xs"
              >
                {availableMonths.map((m) => (
                  <option key={m} value={m}>
                    {getMonthLabel(m)} ({m})
                  </option>
                ))}
              </select>
            </div>

            {/* Custom Month Picker */}
            <input
              type="month"
              value={selectedDueMonth}
              onChange={(e) => {
                if (e.target.value) setSelectedDueMonth(e.target.value);
              }}
              className="text-xs font-mono px-2 py-1.5 border border-slate-200 rounded-lg bg-slate-50 cursor-pointer"
              title="Pick custom month"
            />

            {/* Batch WhatsApp Announcement Button */}
            <button
              onClick={() => {
                setSingleReminderTarget(null);
                setIsReminderModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors cursor-pointer shadow-xs"
              title="Send batch announcement of all overdue members to WhatsApp group"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Batch WhatsApp ({duesSummary.dueCount + duesSummary.partialCount})</span>
            </button>

            {/* Export CSV */}
            <button
              onClick={handleExportDuesCSV}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              title="Export dues report as CSV"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>

            {/* Print PDF */}
            <button
              onClick={handlePrintDuesPDF}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-900 rounded-lg transition-colors cursor-pointer shadow-xs"
              title="Print formatted dues statement PDF"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print PDF</span>
            </button>
          </div>
        </div>

        {/* 4 Dues KPI Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          <div className="bg-slate-50/80 border border-slate-200 p-3.5 rounded-xl">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Total Expected Dues</span>
              <Calendar className="w-4 h-4 text-slate-400" />
            </div>
            <p className="text-xl font-bold font-mono text-slate-900">
              {formatMoney(duesSummary.totalExpected)}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              Calculated for {duesSummary.totalMembers} registered members @ standard due
            </p>
          </div>

          <div className="bg-emerald-50/60 border border-emerald-200 p-3.5 rounded-xl">
            <div className="flex items-center justify-between text-emerald-700 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Collected This Month</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-xl font-bold font-mono text-emerald-800">
              {formatMoney(duesSummary.totalCollected)}
            </p>
            <p className="text-[11px] text-emerald-700 font-semibold mt-1">
              {duesSummary.paidCount} Fully Paid • {duesSummary.collectionRate}% Cleared
            </p>
          </div>

          <div className="bg-rose-50/60 border border-rose-200 p-3.5 rounded-xl">
            <div className="flex items-center justify-between text-rose-700 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Total Outstanding</span>
              <AlertTriangle className="w-4 h-4 text-rose-600" />
            </div>
            <p className="text-xl font-bold font-mono text-rose-700">
              {formatMoney(duesSummary.totalOutstanding)}
            </p>
            <p className="text-[11px] text-rose-700 font-semibold mt-1">
              {duesSummary.dueCount + duesSummary.partialCount} Members with Pending Dues
            </p>
          </div>

          <div className="bg-blue-50/60 border border-blue-200 p-3.5 rounded-xl">
            <div className="flex items-center justify-between text-blue-700 mb-1">
              <span className="text-[11px] font-bold uppercase tracking-wider">Collection Progress</span>
              <Clock className="w-4 h-4 text-blue-600" />
            </div>
            <div className="flex items-center justify-between mt-0.5">
              <span className="text-lg font-bold font-mono text-blue-900">{duesSummary.collectionRate}%</span>
              <span className="text-xs font-mono text-slate-500">{duesSummary.paidCount}/{duesSummary.totalMembers} Members</span>
            </div>
            {/* Progress bar */}
            <div className="w-full bg-blue-200/70 h-2 rounded-full mt-2 overflow-hidden">
              <div
                className="bg-emerald-600 h-full rounded-full transition-all duration-300"
                style={{ width: `${Math.min(100, duesSummary.collectionRate)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Toolbar: Search, Status Filter & Sorter */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-1">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Search member by name or ledger #..."
                value={dueSearchQuery}
                onChange={(e) => setDueSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-slate-800 bg-white"
              />
            </div>

            {/* Status Filter Tabs */}
            <div className="flex items-center gap-1 bg-white p-1 border border-slate-200 rounded-lg text-xs shrink-0">
              <Filter className="w-3.5 h-3.5 text-slate-400 ml-1" />
              <button
                onClick={() => setDueStatusFilter('All')}
                className={`px-2 py-0.5 rounded font-semibold transition-colors cursor-pointer ${
                  dueStatusFilter === 'All'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All ({duesSummary.totalMembers})
              </button>
              <button
                onClick={() => setDueStatusFilter('Due')}
                className={`px-2 py-0.5 rounded font-semibold transition-colors cursor-pointer ${
                  dueStatusFilter === 'Due'
                    ? 'bg-rose-600 text-white'
                    : 'text-rose-700 hover:bg-rose-50'
                }`}
              >
                Unpaid ({duesSummary.dueCount})
              </button>
              <button
                onClick={() => setDueStatusFilter('Partial')}
                className={`px-2 py-0.5 rounded font-semibold transition-colors cursor-pointer ${
                  dueStatusFilter === 'Partial'
                    ? 'bg-amber-600 text-white'
                    : 'text-amber-700 hover:bg-amber-50'
                }`}
              >
                Partial ({duesSummary.partialCount})
              </button>
              <button
                onClick={() => setDueStatusFilter('Paid')}
                className={`px-2 py-0.5 rounded font-semibold transition-colors cursor-pointer ${
                  dueStatusFilter === 'Paid'
                    ? 'bg-emerald-600 text-white'
                    : 'text-emerald-700 hover:bg-emerald-50'
                }`}
              >
                Paid ({duesSummary.paidCount})
              </button>
            </div>

            {/* Sorter */}
            <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs shrink-0">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-500 font-medium">Sort:</span>
              <select
                value={dueSortBy}
                onChange={(e) => setDueSortBy(e.target.value as any)}
                className="bg-transparent font-semibold text-slate-800 focus:outline-none cursor-pointer text-xs"
              >
                <option value="outstanding_desc">Highest Outstanding</option>
                <option value="outstanding_asc">Lowest Outstanding</option>
                <option value="ledger_asc">Ledger No. (Asc)</option>
                <option value="name_asc">Member Name (A-Z)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Dues & WhatsApp Action Table */}
        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-900 text-white font-serif uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-3 text-center w-10">#</th>
                  <th className="py-3 px-3 w-20">Ledger #</th>
                  <th className="py-3 px-4">Member Name</th>
                  <th className="py-3 px-3 text-right">Standard Due</th>
                  <th className="py-3 px-3 text-right">Paid So Far</th>
                  <th className="py-3 px-4 text-right bg-slate-950 text-amber-300">Outstanding</th>
                  <th className="py-3 px-3 text-center">Status</th>
                  <th className="py-3 px-4 text-center">WhatsApp Due Notification</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-sans">
                {filteredDueList.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-10 text-center text-slate-400">
                      No member records match the selected filter.
                    </td>
                  </tr>
                ) : (
                  filteredDueList.map((item, idx) => (
                    <tr 
                      key={item.ledgerNo} 
                      className={`hover:bg-slate-50/80 transition-colors ${
                        item.status === 'Due' ? 'bg-rose-50/20' : item.status === 'Partial' ? 'bg-amber-50/20' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3 text-center font-bold font-mono text-slate-400">
                        {idx + 1}
                      </td>
                      <td className="py-2.5 px-3 font-bold font-mono text-slate-900">
                        {item.ledgerNo}
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="font-bold text-slate-900">{item.name}</div>
                        {item.phone && (
                          <div className="text-[10px] text-slate-500 font-mono flex items-center gap-1 mt-0.5">
                            <Phone className="w-2.5 h-2.5 text-slate-400" />
                            <span>{item.phone}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-600">
                        {formatMoney(item.monthlyDue)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-emerald-700">
                        {formatMoney(item.paid)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-sm bg-amber-50/40">
                        <span className={item.outstanding > 0 ? 'text-rose-700' : 'text-emerald-700'}>
                          {formatMoney(item.outstanding)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            item.status === 'Paid'
                              ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              : item.status === 'Partial'
                              ? 'bg-amber-100 text-amber-800 border border-amber-200'
                              : 'bg-rose-100 text-rose-800 border border-rose-200'
                          }`}
                        >
                          {item.status === 'Paid' && <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-600" />}
                          {item.status === 'Partial' && <Clock className="w-3 h-3 mr-1 text-amber-600" />}
                          {item.status === 'Due' && <AlertTriangle className="w-3 h-3 mr-1 text-rose-600" />}
                          {item.status === 'Paid' ? 'Paid' : item.status === 'Partial' ? 'Partial' : 'Unpaid'}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        {item.status === 'Paid' ? (
                          <span className="text-[11px] text-emerald-700 font-medium flex items-center justify-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Cleared</span>
                          </span>
                        ) : (
                          <div className="flex items-center justify-center gap-1.5">
                            {/* Direct 1-Click WhatsApp Button */}
                            <button
                              onClick={() => handleDirectWhatsApp(item)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors cursor-pointer shadow-xs"
                              title={`Send WhatsApp reminder to ${item.name}`}
                            >
                              <Send className="w-3 h-3" />
                              <span>WhatsApp</span>
                            </button>

                            {/* Copy Text Button */}
                            <button
                              onClick={() => handleCopyReminder(item)}
                              className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                              title="Copy reminder message to clipboard"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>

                            {/* Customize & Send Modal Button */}
                            <button
                              onClick={() => handleOpenReminderModal(item)}
                              className="px-2 py-1 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer"
                              title="Open reminder customizer modal"
                            >
                              <span>Customize</span>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {/* Footer Summary Row */}
              {filteredDueList.length > 0 && (
                <tfoot className="bg-slate-100 border-t-2 border-slate-300 text-slate-900 font-bold font-mono text-xs">
                  <tr>
                    <td colSpan={3} className="py-3 px-4 font-serif font-bold text-right uppercase tracking-wider">
                      TOTAL ({filteredDueList.length} MEMBERS):
                    </td>
                    <td className="py-3 px-3 text-right">
                      {formatMoney(duesSummary.totalExpected)}
                    </td>
                    <td className="py-3 px-3 text-right text-emerald-800">
                      {formatMoney(duesSummary.totalCollected)}
                    </td>
                    <td className="py-3 px-4 text-right text-rose-700 font-extrabold text-sm bg-rose-100/50">
                      {formatMoney(duesSummary.totalOutstanding)}
                    </td>
                    <td className="py-3 px-3 text-center text-[11px] text-slate-700">
                      {duesSummary.collectionRate}% Cleared
                    </td>
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={() => {
                          setSingleReminderTarget(null);
                          setIsReminderModalOpen(true);
                        }}
                        className="text-[11px] font-bold text-emerald-800 hover:underline cursor-pointer"
                      >
                        Send All Due Reminders
                      </button>
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>

      {/* Recharts Analytics Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top 5 Contributing Members Bar Chart Card */}
        <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-xs col-span-1 lg:col-span-2">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-sm font-serif font-bold text-slate-800 flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-500" />
                <span>Top 5 Contributing Members</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Highest contributing members by cumulative recorded contributions and subscriptions
              </p>
            </div>
            <span className="text-[11px] font-bold px-2.5 py-1 bg-amber-50 text-amber-900 border border-amber-200 rounded-full font-mono">
              High-Engagement Committee Insight
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
            {/* Bar Chart View */}
            <div className="lg:col-span-2 h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topContributors} margin={{ top: 10, right: 10, left: 10, bottom: 15 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="displayName" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value) => formatMoney(Number(value))} />
                  <Bar dataKey="totalPaid" name="Total Paid (Rs.)" fill="#B8863B" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Leaderboard List */}
            <div className="space-y-2 font-sans border-t lg:border-t-0 lg:border-l border-slate-100 pt-4 lg:pt-0 lg:pl-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Leaderboard Summary</h4>
              {topContributors.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No member contribution records available.</p>
              ) : (
                topContributors.map((m, idx) => (
                  <div
                    key={m.ledgerNo}
                    className="flex items-center justify-between p-2 rounded-lg bg-slate-50 border border-slate-100 hover:bg-amber-50/50 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`w-5 h-5 rounded-full text-[10px] font-extrabold flex items-center justify-center shrink-0 ${
                          idx === 0
                            ? 'bg-amber-500 text-white shadow-2xs'
                            : idx === 1
                            ? 'bg-emerald-600 text-white'
                            : idx === 2
                            ? 'bg-slate-600 text-white'
                            : 'bg-slate-200 text-slate-700'
                        }`}
                      >
                        #{idx + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate">{m.name}</p>
                        <p className="text-[10px] text-slate-500 font-mono">
                          Ledger #{m.ledgerNo} • {m.txCount} {m.txCount === 1 ? 'payment' : 'payments'}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-emerald-800 font-mono ml-2 shrink-0">
                      {formatMoney(m.totalPaid)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

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

      {/* WhatsApp Reminder Modal */}
      <SendReminderModal
        isOpen={isReminderModalOpen}
        onClose={() => {
          setIsReminderModalOpen(false);
          setSingleReminderTarget(null);
        }}
        overdueMembers={overdueMembersForModal}
        organizationName={settings.organizationName}
        selectedMonth={selectedDueMonth}
        singleTarget={singleReminderTarget}
        showToast={showToast}
      />
    </div>
  );
};
