import * as XLSX from 'xlsx';
import { 
  Member, 
  Transaction, 
  AppSettings, 
  MonthlySummaryItem, 
  DailySummaryItem, 
  MemberTotals, 
  ContributionItem,
  MonthBalanceTableRow,
  MonthBalanceOverrides
} from '../types';

export const INCOME_HEADS = [
  'Imam Fund',
  'Eidan Fund',
  'Membership Subscription',
  'Donation',
  'Zakat',
  'Sadqa',
  'Other',
];

export const EXPENDITURE_HEADS = [
  'Imam Salary',
  'Electricity & Water',
  'Repairs & Maintenance',
  'Event / Function',
  'Stationery & Printing',
  'Charity / Relief',
  'Other',
];

export function uid(): string {
  if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
    return window.crypto.randomUUID();
  }
  return 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2);
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function fmtDate(iso: string): string {
  if (!iso) return '';
  const p = iso.split('-');
  return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : iso;
}

export function formatMoney(n: number | string): string {
  const num = typeof n === 'number' ? n : parseFloat(String(n || '0').replace(/[^0-9.-]/g, ''));
  const safeNum = isNaN(num) ? 0 : num;
  return 'Rs. ' + safeNum.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

export function num(v: any): number {
  if (typeof v === 'number') return isNaN(v) ? 0 : v;
  const parsed = parseFloat(String(v || '').replace(/[^0-9.-]/g, ''));
  return isNaN(parsed) ? 0 : parsed;
}

export function normalizeName(s: string): string {
  return String(s || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

export function findMember(members: Member[], query: string): Member | undefined {
  if (!query) return undefined;
  const q = String(query).trim().toLowerCase();
  if (!q) return undefined;

  // 1. Exact or case-insensitive string match on ledgerNo
  let match = members.find((m) => String(m.ledgerNo).trim().toLowerCase() === q);
  if (match) return match;

  // 2. Numeric match on ledgerNo (e.g. "041" vs "41")
  const numQ = parseInt(q, 10);
  if (!isNaN(numQ)) {
    match = members.find((m) => parseInt(String(m.ledgerNo).trim(), 10) === numQ);
    if (match) return match;
  }

  // 3. Match by member name
  match = members.find((m) => m.name.trim().toLowerCase() === q);
  if (match) return match;

  // 4. Match by normalized member name
  const normQ = normalizeName(q);
  if (normQ) {
    match = members.find((m) => normalizeName(m.name).toLowerCase() === normQ.toLowerCase());
    if (match) return match;
  }

  return undefined;
}

export function calculateMemberTotals(transactions: Transaction[], ledgerNo: string): MemberTotals {
  const v = String(ledgerNo || '').trim();
  const list = transactions.filter(t => t.type === 'Income' && String(t.ledgerNo).trim() === v);
  const totalPaid = list.reduce((s, t) => s + num(t.amount), 0);
  const lastPaymentDate = list.reduce((l, t) => (!l || t.date > l ? t.date : l), '');
  return { totalPaid, count: list.length, lastPaymentDate };
}

export function computeMonthlySummary(transactions: Transaction[], openingBalance: number): MonthlySummaryItem[] {
  const byMonth: Record<string, { income: number; expenditure: number }> = {};
  
  transactions.forEach(t => {
    if (!t.date) return;
    const m = t.date.slice(0, 7);
    if (!byMonth[m]) byMonth[m] = { income: 0, expenditure: 0 };
    if (t.type === 'Income') {
      byMonth[m].income += num(t.amount);
    } else {
      byMonth[m].expenditure += num(t.amount);
    }
  });

  const months = Object.keys(byMonth).sort();
  let running = num(openingBalance);

  return months.map(m => {
    const d = byMonth[m];
    running += d.income - d.expenditure;
    return {
      month: m,
      income: d.income,
      expenditure: d.expenditure,
      net: d.income - d.expenditure,
      balance: running,
    };
  });
}

export function getMonthLabel(mStr: string): string {
  if (!mStr) return 'Current Month';
  const [year, month] = mStr.split('-');
  if (!year || !month) return mStr;
  const date = new Date(parseInt(year, 10), parseInt(month, 10) - 1, 1);
  return date.toLocaleString('default', { month: 'long', year: 'numeric' });
}

export function computeMonthBalanceTable(
  transactions: Transaction[],
  initialOpeningBalance: number,
  overrides?: MonthBalanceOverrides
): MonthBalanceTableRow[] {
  // Collect all distinct months
  const monthSet = new Set<string>();

  transactions.forEach((t) => {
    if (t.date && t.date.length >= 7) {
      monthSet.add(t.date.slice(0, 7));
    }
    if (t.forMonth && t.forMonth.length >= 7) {
      monthSet.add(t.forMonth.slice(0, 7));
    }
  });

  if (overrides) {
    Object.keys(overrides).forEach((m) => monthSet.add(m));
  }

  // Ensure current month is present
  const currentMonth = new Date().toISOString().slice(0, 7);
  monthSet.add(currentMonth);

  const sortedMonths = Array.from(monthSet).sort();

  let runningOpening = num(initialOpeningBalance);
  const rows: MonthBalanceTableRow[] = [];

  for (const m of sortedMonths) {
    const monthTxns = transactions.filter((t) => (t.date && t.date.slice(0, 7) === m));
    const incomeTxns = monthTxns.filter((t) => t.type === 'Income');
    const expTxns = monthTxns.filter((t) => t.type === 'Expenditure');

    const income = incomeTxns.reduce((s, t) => s + num(t.amount), 0);
    const expenditure = expTxns.reduce((s, t) => s + num(t.amount), 0);
    const net = income - expenditure;
    const autoBalance = runningOpening + net;

    const conf = overrides?.[m];
    const mode = conf?.mode || 'auto';
    
    let effectiveBalance = autoBalance;
    if (mode === 'manual') {
      if (conf?.manualBalance !== undefined) {
        effectiveBalance = num(conf.manualBalance);
      } else if (conf?.cashInHand !== undefined || conf?.bankBalance !== undefined) {
        effectiveBalance = num(conf.cashInHand) + num(conf.bankBalance);
      }
    }

    const variance = effectiveBalance - autoBalance;
    const isReconciled = mode === 'auto' || Math.abs(variance) < 0.01;

    rows.push({
      month: m,
      monthLabel: getMonthLabel(m),
      openingBalance: runningOpening,
      income,
      incomeCount: incomeTxns.length,
      expenditure,
      expenditureCount: expTxns.length,
      net,
      autoBalance,
      effectiveBalance,
      mode,
      cashInHand: conf?.cashInHand,
      bankBalance: conf?.bankBalance,
      variance,
      isReconciled,
      notes: conf?.notes,
      verifiedBy: conf?.verifiedBy,
      updatedAt: conf?.updatedAt,
    });

    // Carry forward effective closing balance as next month's opening
    runningOpening = effectiveBalance;
  }

  return rows;
}

export interface WhatsAppReportParams {
  monthRow: MonthBalanceTableRow;
  transactions: Transaction[];
  members: Member[];
  settings: AppSettings;
  style: 'standard' | 'itemized' | 'urdu' | 'english';
  includeExpenses?: boolean;
  includeIncome?: boolean;
  includeMembers?: boolean;
  customNote?: string;
  signatoryName?: string;
}

export function buildWhatsAppMonthReport(params: WhatsAppReportParams): string {
  const {
    monthRow,
    transactions,
    members,
    settings,
    style,
    includeExpenses = true,
    includeIncome = true,
    includeMembers = true,
    customNote,
    signatoryName,
  } = params;

  const org = settings.organizationName || 'Fallah Behbood Committee';
  const sub = settings.subTitle || 'Pampore';
  const mLabel = monthRow.monthLabel;

  // Monthly transactions
  const monthTxns = transactions.filter((t) => t.date && t.date.slice(0, 7) === monthRow.month);
  const incomeTxns = monthTxns.filter((t) => t.type === 'Income');
  const expTxns = monthTxns.filter((t) => t.type === 'Expenditure');

  // Group Income by Head
  const incomeByHead: Record<string, number> = {};
  incomeTxns.forEach((t) => {
    const h = t.head || 'Other';
    incomeByHead[h] = (incomeByHead[h] || 0) + num(t.amount);
  });

  // Group Expenditure by Head
  const expByHead: Record<string, number> = {};
  expTxns.forEach((t) => {
    const h = t.head || 'Other';
    expByHead[h] = (expByHead[h] || 0) + num(t.amount);
  });

  // Member contribution stats
  const contribs = calculateContributionsForMonth(members, transactions, monthRow.month);
  const paidMembersCount = contribs.filter((c) => c.status === 'Paid').length;
  const dueMembersCount = contribs.filter((c) => c.status !== 'Paid').length;

  const sign = signatoryName || 'Management Committee';

  // 1. URDU VERSION
  if (style === 'urdu') {
    let msg = `السلام علیکم ورحمۃ اللہ وبرکاتہ\n\n`;
    msg += `🕌 *${org.toUpperCase()}* (${sub})\n`;
    msg += `📋 *ماہانہ مالیاتی گوشوارہ / آمد و خرچ رپورٹ*\n`;
    msg += `📅 *ماہ:* ${mLabel}\n`;
    msg += `─────────────────────────\n`;
    msg += `💰 *ابتدائی بقایا (Opening Balance):* ${formatMoney(monthRow.openingBalance)}\n`;
    msg += `📥 *کل آمدنی و وصولی (Total Collections):* ${formatMoney(monthRow.income)} (${monthRow.incomeCount} اندراجات)\n`;
    msg += `📤 *کل اخراجات (Total Payments):* ${formatMoney(monthRow.expenditure)} (${monthRow.expenditureCount} واؤچرز)\n`;
    msg += `📈 *ماہانہ بچت / نیٹ (Monthly Net):* ${monthRow.net >= 0 ? '+' : ''}${formatMoney(monthRow.net)}\n`;
    msg += `─────────────────────────\n`;
    msg += `🏦 *ماہ کے اختتام پر کل بقایا (Closing Balance):* ${formatMoney(monthRow.effectiveBalance)}\n`;

    if (monthRow.mode === 'manual') {
      msg += `  • نقد دستی رقم (Cash in Hand): ${formatMoney(monthRow.cashInHand || 0)}\n`;
      msg += `  • بینک اکاؤنٹ بقایا (Bank Balance): ${formatMoney(monthRow.bankBalance || 0)}\n`;
      if (monthRow.notes) {
        msg += `  • تفصیلی نوٹ: ${monthRow.notes}\n`;
      }
    }

    if (includeIncome && Object.keys(incomeByHead).length > 0) {
      msg += `\n📊 *آمدنی کی تفصیل (Income Breakdown):*\n`;
      Object.entries(incomeByHead).forEach(([head, amt]) => {
        msg += `  • ${head}: ${formatMoney(amt)}\n`;
      });
    }

    if (includeExpenses && Object.keys(expByHead).length > 0) {
      msg += `\n📑 *اخراجات کی تفصیل (Expenditures Breakdown):*\n`;
      Object.entries(expByHead).forEach(([head, amt]) => {
        msg += `  • ${head}: ${formatMoney(amt)}\n`;
      });
    }

    if (includeMembers && members.length > 0) {
      msg += `\n👥 *ممبران ماہانہ چندہ کی صورتحال:*\n`;
      msg += `  • ادا شدہ ممبران: ${paidMembersCount}\n`;
      msg += `  • واجب الادا / باقی ممبران: ${dueMembersCount}\n`;
    }

    if (customNote && customNote.trim()) {
      msg += `\n📢 *خصوصی اعلان / نوٹس:*\n${customNote.trim()}\n`;
    }

    msg += `\n─────────────────────────\n`;
    msg += `جزاکم اللہ خیراً و احسن الجزاء۔\n`;
    msg += `✍️ *منجانب:* ${sign}\n`;
    msg += `🗓️ بتاریخ: ${new Date().toLocaleDateString('en-GB')}`;

    return msg;
  }

  // 2. ENGLISH VERSION
  if (style === 'english') {
    let msg = `*${org.toUpperCase()}*\n`;
    msg += `_${sub}_\n\n`;
    msg += `📊 *MONTHLY FINANCIAL STATEMENT — ${mLabel.toUpperCase()}*\n`;
    msg += `==================================\n`;
    msg += `💰 *Opening Balance:* ${formatMoney(monthRow.openingBalance)}\n`;
    msg += `📥 *Total Collections:* ${formatMoney(monthRow.income)} (${monthRow.incomeCount} entries)\n`;
    msg += `📤 *Total Expenditures:* ${formatMoney(monthRow.expenditure)} (${monthRow.expenditureCount} vouchers)\n`;
    msg += `📈 *Net Monthly Movement:* ${monthRow.net >= 0 ? '+' : ''}${formatMoney(monthRow.net)}\n`;
    msg += `----------------------------------\n`;
    msg += `🏦 *Month-End Closing Balance:* ${formatMoney(monthRow.effectiveBalance)}\n`;

    if (monthRow.mode === 'manual') {
      msg += `  • Cash in Hand: ${formatMoney(monthRow.cashInHand || 0)}\n`;
      msg += `  • Bank Balance: ${formatMoney(monthRow.bankBalance || 0)}\n`;
      if (monthRow.notes) msg += `  • Note: ${monthRow.notes}\n`;
    }

    if (includeIncome && Object.keys(incomeByHead).length > 0) {
      msg += `\n📥 *Income Breakdown:*\n`;
      Object.entries(incomeByHead).forEach(([head, amt]) => {
        msg += `  • ${head}: ${formatMoney(amt)}\n`;
      });
    }

    if (includeExpenses && Object.keys(expByHead).length > 0) {
      msg += `\n📤 *Expenses Breakdown:*\n`;
      Object.entries(expByHead).forEach(([head, amt]) => {
        msg += `  • ${head}: ${formatMoney(amt)}\n`;
      });
    }

    if (includeMembers && members.length > 0) {
      msg += `\n👥 *Member Subscriptions:* ${paidMembersCount} Paid / ${dueMembersCount} Pending\n`;
    }

    if (customNote && customNote.trim()) {
      msg += `\n📌 *Important Note:* ${customNote.trim()}\n`;
    }

    msg += `==================================\n`;
    msg += `Thank you for your continuous support.\n`;
    msg += `— *${sign}*\n`;
    msg += `Date: ${new Date().toLocaleDateString('en-GB')}`;

    return msg;
  }

  // 3. ITEMIZED VERSION (Detailed line-by-line vouchers)
  if (style === 'itemized') {
    let msg = `السلام علیکم ورحمۃ اللہ وبرکاتہ\n\n`;
    msg += `🕌 *${org.toUpperCase()}*\n`;
    msg += `📑 *ITEMIZED MONTHLY FINANCIAL REPORT — ${mLabel.toUpperCase()}*\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `💰 *Opening Balance:* ${formatMoney(monthRow.openingBalance)}\n`;
    msg += `📥 *Total Income:* ${formatMoney(monthRow.income)}\n`;
    msg += `📤 *Total Expenditure:* ${formatMoney(monthRow.expenditure)}\n`;
    msg += `📈 *Net Surplus/Deficit:* ${monthRow.net >= 0 ? '+' : ''}${formatMoney(monthRow.net)}\n`;
    msg += `🏦 *Effective Month-End Closing:* ${formatMoney(monthRow.effectiveBalance)}\n`;
    msg += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;

    if (expTxns.length > 0) {
      msg += `\n📋 *EXPENDITURE VOUCHERS LIST:*\n`;
      expTxns.forEach((t, i) => {
        msg += `${i + 1}. ${fmtDate(t.date)} | ${t.paidTo || t.head} | *${formatMoney(t.amount)}* ${t.remarks ? `(${t.remarks})` : ''}\n`;
      });
    }

    if (incomeByHead && Object.keys(incomeByHead).length > 0) {
      msg += `\n📥 *INCOME BY HEAD:*\n`;
      Object.entries(incomeByHead).forEach(([head, amt]) => {
        msg += `• ${head}: *${formatMoney(amt)}*\n`;
      });
    }

    if (customNote && customNote.trim()) {
      msg += `\n📢 *Note:* ${customNote.trim()}\n`;
    }

    msg += `\n━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `✍️ *Issued by:* ${sign}\n`;
    return msg;
  }

  // 4. STANDARD BILINGUAL (Default recommended)
  let msg = `السلام علیکم ورحمۃ اللہ وبرکاتہ\n\n`;
  msg += `🕌 *${org.toUpperCase()}*\n`;
  msg += `📍 *${sub}*\n`;
  msg += `📊 *ماہانہ مالیاتی رپورٹ / MONTHLY FINANCIAL REPORT*\n`;
  msg += `🗓️ *ماہ / Month:* ${mLabel}\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `💰 *ابتدائی بقایا (Opening Balance):* ${formatMoney(monthRow.openingBalance)}\n`;
  msg += `📥 *کل آمدنی (Total Collections):* ${formatMoney(monthRow.income)}\n`;
  msg += `📤 *کل اخراجات (Total Payments):* ${formatMoney(monthRow.expenditure)}\n`;
  msg += `📈 *ماہانہ بچت (Monthly Net):* ${monthRow.net >= 0 ? '+' : ''}${formatMoney(monthRow.net)}\n`;
  msg += `─────────────────────────\n`;
  msg += `🏦 *ماہ کے اختتام پر کل رقم (Closing Balance):* *${formatMoney(monthRow.effectiveBalance)}*\n`;

  if (monthRow.mode === 'manual') {
    msg += `  ▫️ نقد کیش (Cash in Hand): ${formatMoney(monthRow.cashInHand || 0)}\n`;
    msg += `  ▫️ بینک بقایا (Bank Account): ${formatMoney(monthRow.bankBalance || 0)}\n`;
    if (monthRow.notes) {
      msg += `  ▫️ تصدیقی نوٹ: ${monthRow.notes}\n`;
    }
  }

  if (includeIncome && Object.keys(incomeByHead).length > 0) {
    msg += `\n📥 *آمدنی کے اہم ذرائع (Income Heads):*\n`;
    Object.entries(incomeByHead).forEach(([head, amt]) => {
      msg += `  • ${head}: ${formatMoney(amt)}\n`;
    });
  }

  if (includeExpenses && Object.keys(expByHead).length > 0) {
    msg += `\n📤 *اخراجات کی تفصیل (Major Expenses):*\n`;
    Object.entries(expByHead).forEach(([head, amt]) => {
      msg += `  • ${head}: ${formatMoney(amt)}\n`;
    });
  }

  if (includeMembers && members.length > 0) {
    msg += `\n👥 *ممبران چندہ رپورٹ (Subscriptions):*\n`;
    msg += `  • ادا شدہ ممبران (Cleared): ${paidMembersCount} ممبران\n`;
    msg += `  • زیر التواء چندہ (Pending): ${dueMembersCount} ممبران\n`;
  }

  if (customNote && customNote.trim()) {
    msg += `\n📢 *اہم اطلاع / Announcement:*\n${customNote.trim()}\n`;
  }

  msg += `\n━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  msg += `تمام اراکین کے تعاون کا شکریہ۔ جزاکم اللہ خیراً۔\n`;
  msg += `✍️ *منجانب انتظامیہ:* ${sign}\n`;
  msg += `📅 *تاریخ اجراء:* ${new Date().toLocaleDateString('en-GB')}`;

  return msg;
}

export function computeDailySummary(transactions: Transaction[], from?: string, to?: string): DailySummaryItem[] {
  const byDay: Record<string, { income: number; expenditure: number }> = {};
  
  transactions.forEach(t => {
    if (!t.date) return;
    if (from && t.date < from) return;
    if (to && t.date > to) return;
    if (!byDay[t.date]) byDay[t.date] = { income: 0, expenditure: 0 };
    if (t.type === 'Income') {
      byDay[t.date].income += num(t.amount);
    } else {
      byDay[t.date].expenditure += num(t.amount);
    }
  });

  return Object.keys(byDay).sort().map(d => ({
    date: d,
    income: byDay[d].income,
    expenditure: byDay[d].expenditure,
    net: byDay[d].income - byDay[d].expenditure,
  }));
}

export function calculateContributionsForMonth(
  members: Member[],
  transactions: Transaction[],
  month: string
): ContributionItem[] {
  const paidByLedger: Record<string, number> = {};
  if (month) {
    transactions.forEach(t => {
      if (t.type !== 'Income' || !t.ledgerNo) return;
      const m = t.forMonth || (t.date ? t.date.slice(0, 7) : '');
      if (m !== month) return;
      const k = String(t.ledgerNo).trim();
      paidByLedger[k] = (paidByLedger[k] || 0) + num(t.amount);
    });
  }

  const sorted = members.slice().sort((a, b) => (parseInt(a.ledgerNo, 10) || 0) - (parseInt(b.ledgerNo, 10) || 0));
  
  return sorted.map(m => {
    const expected = num(m.monthlyDue) || 150;
    const paid = paidByLedger[String(m.ledgerNo).trim()] || 0;
    const status: 'Paid' | 'Partial' | 'Due' = paid <= 0 ? 'Due' : paid < expected ? 'Partial' : 'Paid';
    return {
      ledgerNo: m.ledgerNo,
      name: m.name,
      expected,
      paid,
      status,
    };
  });
}

export function exportCsv(header: string[], rows: (string | number)[][], filename: string) {
  const allRows = [header, ...rows.map((row) => row.map((v) => (v === undefined || v === null ? '' : String(v))))];
  const csv = allRows
    .map((row) =>
      row
        .map((s) => (/[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s))
        .join(',')
    )
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Generate a complete multi-worksheet Excel workbook (.xlsx)
 */
export function exportExcelWorkbook(
  members: Member[],
  transactions: Transaction[],
  settings: AppSettings,
  filename: string = 'Fallah_Behbood_Committee_Ledger.xlsx'
) {
  const wb = XLSX.utils.book_new();

  // 1. Ledger Entries Sheet
  const ledgerData = [
    ['Date', 'Type', 'Ledger No.', 'Name / Paid To', 'Head / Fund', 'Amount (Rs.)', 'For Month', 'Receipt/Voucher No.', 'Mode', 'Remarks'],
    ...transactions.map(t => [
      fmtDate(t.date),
      t.type,
      t.ledgerNo || '',
      t.type === 'Income' ? t.memberName : t.paidTo,
      t.head,
      t.amount,
      t.forMonth || '',
      t.receiptVoucherNo || '',
      t.mode || 'Cash',
      t.remarks || '',
    ]),
  ];
  const wsLedger = XLSX.utils.aoa_to_sheet(ledgerData);
  XLSX.utils.book_append_sheet(wb, wsLedger, 'Ledger Entries');

  // 2. Members Directory Sheet
  const membersData = [
    ['Ledger No.', 'Member Name', 'Monthly Due (Rs.)', 'Total Paid (Rs.)', 'Total Entries', 'Last Payment Date'],
    ...members.map(m => {
      const totals = calculateMemberTotals(transactions, m.ledgerNo);
      return [
        m.ledgerNo,
        m.name,
        m.monthlyDue,
        totals.totalPaid,
        totals.count,
        totals.lastPaymentDate ? fmtDate(totals.lastPaymentDate) : '—',
      ];
    }),
  ];
  const wsMembers = XLSX.utils.aoa_to_sheet(membersData);
  XLSX.utils.book_append_sheet(wb, wsMembers, 'Members Directory');

  // 3. Month Balances & Audit Sheet
  const monthBalanceTable = computeMonthBalanceTable(transactions, settings.openingBalance, settings.monthBalances);
  const monthlyData = [
    ['Month ID', 'Month Name', 'Opening Balance (Rs.)', 'Income (Rs.)', 'Income Count', 'Expenditure (Rs.)', 'Expenditure Count', 'Net Movement (Rs.)', 'Auto Calculated (Rs.)', 'Mode', 'Effective Closing (Rs.)', 'Cash in Hand (Rs.)', 'Bank Account (Rs.)', 'Variance (Rs.)', 'Reconciliation Status', 'Audited By', 'Notes'],
    ...monthBalanceTable.map(m => [
      m.month,
      m.monthLabel,
      m.openingBalance,
      m.income,
      m.incomeCount,
      m.expenditure,
      m.expenditureCount,
      m.net,
      m.autoBalance,
      m.mode === 'manual' ? 'Manual Entry' : 'Automatic Update',
      m.effectiveBalance,
      m.cashInHand || '',
      m.bankBalance || '',
      m.variance,
      m.isReconciled ? 'Reconciled' : 'Discrepancy',
      m.verifiedBy || '',
      m.notes || '',
    ]),
  ];
  const wsMonthly = XLSX.utils.aoa_to_sheet(monthlyData);
  XLSX.utils.book_append_sheet(wb, wsMonthly, 'Month Balances & Audit');

  // Write file
  XLSX.writeFile(wb, filename);
}

/**
 * Excel date parser helper with support for multiple formats
 */
export function parseExcelDate(v: any): string {
  if (v === undefined || v === null || v === '') return '';
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10);
  if (typeof v === 'number') {
    if (v > 1000 && v < 100000) {
      const ms = Date.UTC(1899, 11, 30) + v * 86400000;
      const d = new Date(ms);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
  }
  const s = String(v).trim();
  if (!s) return '';

  // Try standard YYYY-MM-DD
  if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(s)) {
    const parts = s.split(/[-/.]/);
    const y = parts[0];
    const m = parts[1].padStart(2, '0');
    const d = parts[2].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Try DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
  if (/^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$/.test(s)) {
    const parts = s.split(/[-/.]/);
    const d = parts[0].padStart(2, '0');
    const m = parts[1].padStart(2, '0');
    let y = parts[2];
    if (y.length === 2) y = '20' + y;
    return `${y}-${m}-${d}`;
  }

  const parsed = new Date(s);
  return isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
}

export interface UniversalImportResult {
  transactions: Transaction[];
  members: Member[];
  summary: {
    totalRows: number;
    incomeCount: number;
    expenditureCount: number;
    memberCount: number;
    sheetsParsed: string[];
  };
}

export function parseUniversalFileImport(
  fileBuffer: ArrayBuffer,
  fileName: string
): UniversalImportResult {
  const newTxns: Transaction[] = [];
  const membersMap = new Map<string, Member>();
  const sheetsParsed: string[] = [];
  let totalRows = 0;

  const isJson = fileName.toLowerCase().endsWith('.json');

  if (isJson) {
    try {
      const decoder = new TextDecoder('utf-8');
      const text = decoder.decode(fileBuffer);
      const parsed = JSON.parse(text);

      let rawTxns: any[] = [];
      let rawMembers: any[] = [];

      if (Array.isArray(parsed)) {
        rawTxns = parsed;
      } else if (typeof parsed === 'object' && parsed !== null) {
        if (Array.isArray(parsed.transactions)) rawTxns = parsed.transactions;
        else if (Array.isArray(parsed.data)) rawTxns = parsed.data;
        else if (Array.isArray(parsed.records)) rawTxns = parsed.records;
        else if (Array.isArray(parsed.items)) rawTxns = parsed.items;

        if (Array.isArray(parsed.members)) rawMembers = parsed.members;
      }

      // Process Members array if present
      rawMembers.forEach((m: any, idx: number) => {
        if (!m || typeof m !== 'object') return;
        const lNo = String(m.ledgerNo || m.ledger_no || m.folio || m.sno || m.id || (idx + 1)).trim();
        const mName = normalizeName(m.name || m.memberName || m.member_name || m.particulars || `Member ${lNo}`);
        const due = num(m.monthlyDue || m.monthly_due || m.due || 150) || 150;
        if (mName || lNo) {
          membersMap.set(lNo, {
            ledgerNo: lNo,
            name: mName || `Member ${lNo}`,
            monthlyDue: due,
            phone: m.phone || m.mobile || '',
            address: m.address || '',
          });
        }
      });

      // Process Transactions / Records
      rawTxns.forEach((item: any, idx: number) => {
        if (!item || typeof item !== 'object') return;
        totalRows++;

        const rawType = String(item.type || item.kind || '').toLowerCase();
        const isExp = rawType.includes('exp') || rawType.includes('out') || rawType.includes('debit') || rawType.includes('pay');
        const type: 'Income' | 'Expenditure' = isExp ? 'Expenditure' : 'Income';

        const amt = num(item.amount || item.amt || item.rs || item.value || item.sum || item.total || 0);
        const rawDate = item.date || item.dt || item.created || item.timestamp;
        const dateStr = parseExcelDate(rawDate) || todayISO();

        const lNo = String(item.ledgerNo || item.ledger_no || item.folio || item.lno || '').trim();
        const mName = normalizeName(item.memberName || item.member_name || item.name || item.particulars || item.payer || '');
        const paidTo = normalizeName(item.paidTo || item.paid_to || item.payee || item.particulars || item.vendor || '');
        const head = String(item.head || item.fund || item.category || (type === 'Income' ? 'Membership Subscription' : 'Other'));
        const voucher = String(item.receiptVoucherNo || item.voucherNo || item.receiptNo || item.vno || '').trim();
        const month = String(item.forMonth || item.for_month || item.month || '');
        const mode = item.mode || 'Cash';
        const remarks = String(item.remarks || item.description || item.note || '').trim();

        newTxns.push({
          id: uid(),
          type,
          date: dateStr,
          amount: Math.abs(amt),
          ledgerNo: type === 'Income' ? lNo : '',
          memberName: type === 'Income' ? mName : '',
          paidTo: type === 'Expenditure' ? paidTo : '',
          head,
          forMonth: month,
          receiptVoucherNo: voucher,
          mode,
          remarks,
          createdAt: new Date().toISOString(),
          importRef: `json_import#${idx + 1}`,
        });

        if (type === 'Income' && (lNo || mName)) {
          const key = lNo || mName;
          if (!membersMap.has(key)) {
            membersMap.set(key, {
              ledgerNo: lNo || key,
              name: mName || `Member ${key}`,
              monthlyDue: 150,
            });
          }
        }
      });

      sheetsParsed.push('JSON Root');
    } catch (e) {
      console.error('JSON parsing error:', e);
    }

    return {
      transactions: newTxns,
      members: Array.from(membersMap.values()),
      summary: {
        totalRows,
        incomeCount: newTxns.filter((t) => t.type === 'Income').length,
        expenditureCount: newTxns.filter((t) => t.type === 'Expenditure').length,
        memberCount: membersMap.size,
        sheetsParsed,
      },
    };
  }

  // Handle Excel / CSV Workbooks
  try {
    const data = new Uint8Array(fileBuffer);
    const wb = XLSX.read(data, { type: 'array', cellDates: false });

    wb.SheetNames.forEach((sheetName) => {
      const ws = wb.Sheets[sheetName];
      if (!ws) return;
      sheetsParsed.push(sheetName);

      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      if (!rows || rows.length === 0) return;

      const lowerSheet = sheetName.toLowerCase();
      const isSheetExpenditure = lowerSheet.includes('expense') || lowerSheet.includes('expenditure') || lowerSheet.includes('payment') || lowerSheet.includes('debit');
      const isSheetMembers = lowerSheet.includes('member') || lowerSheet.includes('subscriber') || lowerSheet.includes('directory');

      // Detect header row index
      let headerIdx = -1;
      let dateCol = -1, voucherCol = -1, ledgerCol = -1, nameCol = -1, amountCol = -1, creditCol = -1, debitCol = -1, headCol = -1, monthCol = -1;

      for (let r = 0; r < Math.min(10, rows.length); r++) {
        const rowStr = rows[r].map((c) => String(c).toLowerCase()).join(' ');
        if (rowStr.includes('date') || rowStr.includes('particular') || rowStr.includes('amount') || rowStr.includes('s.no') || rowStr.includes('member') || rowStr.includes('ledger')) {
          headerIdx = r;
          rows[r].forEach((cellVal, cIdx) => {
            const cl = String(cellVal).toLowerCase().trim();
            if (/date|dt/.test(cl)) dateCol = cIdx;
            else if (/voucher|v\.no|vno|receipt|bill/.test(cl)) voucherCol = cIdx;
            else if (/ledger|folio|l\.no|lno|f\.no|folio\.no/.test(cl)) ledgerCol = cIdx;
            else if (/particular|name|member|payee|paid|subscriber|description/.test(cl)) nameCol = cIdx;
            else if (/credit|income|inflow/.test(cl)) creditCol = cIdx;
            else if (/debit|expense|expenditure|outflow/.test(cl)) debitCol = cIdx;
            else if (/amount|amt|rs|rupees|sum|total/.test(cl) && amountCol === -1) amountCol = cIdx;
            else if (/head|fund|category/.test(cl)) headCol = cIdx;
            else if (/month/.test(cl)) monthCol = cIdx;
          });
          break;
        }
      }

      let runningDate = todayISO();

      for (let r = headerIdx + 1; r < rows.length; r++) {
        const row = rows[r];
        if (!row || row.every((cell) => cell === '' || cell === null || cell === undefined)) continue;

        totalRows++;

        // If this is purely a Members sheet
        if (isSheetMembers) {
          let name = '', lNo = '', due = 150;
          row.forEach((cellVal) => {
            const str = String(cellVal).trim();
            if (!str) return;
            if (/^\d+$/.test(str) && !lNo) {
              lNo = str;
            } else if (isNaN(Number(str)) && str.length > 1 && !name) {
              name = normalizeName(str);
            }
          });
          if (!lNo && name) lNo = `L-${r}`;
          if (name) {
            membersMap.set(lNo || name, { ledgerNo: lNo || name, name, monthlyDue: due });
          }
          continue;
        }

        // General Transaction parsing from row
        let rowDate = '';
        let rowVoucher = '';
        let rowLedger = '';
        let rowName = '';
        let rowAmt = 0;
        let rowType: 'Income' | 'Expenditure' = isSheetExpenditure ? 'Expenditure' : 'Income';
        let rowHead = isSheetExpenditure ? 'Other' : 'Membership Subscription';
        let rowMonth = '';

        if (headerIdx !== -1) {
          if (dateCol !== -1) rowDate = parseExcelDate(row[dateCol]);
          if (voucherCol !== -1) rowVoucher = String(row[voucherCol] || '').trim();
          if (ledgerCol !== -1) rowLedger = String(row[ledgerCol] || '').trim();
          if (nameCol !== -1) rowName = normalizeName(String(row[nameCol] || ''));
          if (headCol !== -1 && row[headCol]) rowHead = String(row[headCol]).trim();
          if (monthCol !== -1 && row[monthCol]) rowMonth = String(row[monthCol]).trim();

          if (creditCol !== -1 && debitCol !== -1) {
            const credVal = num(row[creditCol]);
            const debVal = num(row[debitCol]);
            if (credVal > 0) {
              rowType = 'Income';
              rowAmt = credVal;
            } else if (debVal > 0) {
              rowType = 'Expenditure';
              rowAmt = debVal;
            }
          } else if (amountCol !== -1) {
            rowAmt = num(row[amountCol]);
          }
        }

        // Positional Fallback if header wasn't matched or values are missing
        if (rowAmt === 0 && headerIdx === -1) {
          row.forEach((cellVal) => {
            const val = num(cellVal);
            if (val > 0 && rowAmt === 0) rowAmt = val;
          });
        }

        if (!rowDate) {
          row.forEach((cellVal) => {
            const d = parseExcelDate(cellVal);
            if (d && !rowDate) rowDate = d;
          });
        }

        if (!rowName) {
          row.forEach((cellVal) => {
            const s = normalizeName(String(cellVal || ''));
            if (s && isNaN(Number(s)) && !/date|s\.no|total|subtotal/i.test(s) && !rowName) {
              rowName = s;
            }
          });
        }

        if (!rowLedger) {
          row.forEach((cellVal) => {
            const s = String(cellVal || '').trim();
            if (/^\d{1,4}$/.test(s) && s !== String(rowAmt) && !rowLedger) {
              rowLedger = s;
            }
          });
        }

        if (rowDate) runningDate = rowDate;

        // Skip rows that look like purely totals or grand totals
        if (rowName.toLowerCase().includes('grand total') || rowName.toLowerCase().includes('subtotal') || (rowAmt === 0 && !rowName && !rowLedger)) {
          continue;
        }

        // Ensure every row is preserved
        const finalType: 'Income' | 'Expenditure' = rowAmt < 0 ? 'Expenditure' : rowType;
        const finalAmt = Math.abs(rowAmt);

        newTxns.push({
          id: uid(),
          type: finalType,
          date: rowDate || runningDate || todayISO(),
          amount: finalAmt,
          ledgerNo: finalType === 'Income' ? rowLedger : '',
          memberName: finalType === 'Income' ? (rowName || `Entry #${r}`) : '',
          paidTo: finalType === 'Expenditure' ? (rowName || `Payment #${r}`) : '',
          head: rowHead,
          forMonth: rowMonth,
          receiptVoucherNo: rowVoucher,
          mode: 'Cash',
          remarks: `Imported from ${sheetName} (Row ${r + 1})`,
          createdAt: new Date().toISOString(),
          importRef: `file_import:${sheetName}#${r + 1}`,
        });

        // Collect Member from Income row
        if (finalType === 'Income' && (rowLedger || rowName)) {
          const key = rowLedger || rowName;
          if (!membersMap.has(key)) {
            membersMap.set(key, {
              ledgerNo: rowLedger || key,
              name: rowName || `Member ${key}`,
              monthlyDue: 150,
            });
          }
        }
      }
    });
  } catch (err) {
    console.error('Universal Excel/CSV import error:', err);
  }

  return {
    transactions: newTxns,
    members: Array.from(membersMap.values()),
    summary: {
      totalRows,
      incomeCount: newTxns.filter((t) => t.type === 'Income').length,
      expenditureCount: newTxns.filter((t) => t.type === 'Expenditure').length,
      memberCount: membersMap.size,
      sheetsParsed,
    },
  };
}

