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
  MonthBalanceOverrides,
  MemberBalanceItem
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

/**
 * Computes live member balances incorporating manual opening/baseline balances
 * and dynamic real-time updates as payments are recorded in the ledger.
 */
export function computeMemberBalanceList(
  members: Member[],
  transactions: Transaction[],
  memberBalanceOverrides?: Record<string, { openingBalance?: number; notes?: string }>
): MemberBalanceItem[] {
  // Pre-filter Income transactions
  const incomeTxns = transactions.filter(t => t.type === 'Income');

  return members.map((m) => {
    const lNo = String(m.ledgerNo || '').trim();
    const memberTxns = incomeTxns.filter((t) => String(t.ledgerNo || '').trim() === lNo);

    // Manual opening balance (if set on member object or via overrides)
    const override = memberBalanceOverrides ? memberBalanceOverrides[lNo] : undefined;
    const openingBalance = num(m.openingBalance !== undefined ? m.openingBalance : override?.openingBalance || 0);

    // Sum all income transactions credited to this member
    const totalPaid = memberTxns.reduce((sum, t) => sum + num(t.amount), 0);

    // Differentiate subscription vs other heads
    const subscriptionPaid = memberTxns
      .filter((t) => (t.head || '').toLowerCase().includes('subscription'))
      .reduce((sum, t) => sum + num(t.amount), 0);
    const otherPaid = totalPaid - subscriptionPaid;

    // Find latest payment date
    let lastPaymentDate: string | null = null;
    if (memberTxns.length > 0) {
      const sorted = memberTxns.slice().sort((a, b) => b.date.localeCompare(a.date));
      lastPaymentDate = sorted[0].date;
    }

    // Effective live balance = (Manual Opening Balance) + (Total Paid to Date)
    const effectiveBalance = openingBalance + totalPaid;

    // Balance status classification
    let status: 'Advance' | 'Cleared' | 'Arrears' | 'Active' = 'Active';
    if (effectiveBalance > 0) {
      status = 'Advance';
    } else if (effectiveBalance === 0 && totalPaid > 0) {
      status = 'Cleared';
    } else if (effectiveBalance < 0) {
      status = 'Arrears';
    } else if (totalPaid > 0) {
      status = 'Active';
    }

    return {
      member: m,
      ledgerNo: m.ledgerNo,
      name: m.name,
      monthlyDue: num(m.monthlyDue) || 150,
      phone: m.phone || '',
      address: m.address || '',
      openingBalance,
      totalPaid,
      subscriptionPaid,
      otherPaid,
      receiptsCount: memberTxns.length,
      lastPaymentDate,
      effectiveBalance,
      status,
      balanceNotes: m.balanceNotes || override?.notes || '',
    };
  });
}

/**
 * Print & Export High-Fidelity All Members Balance PDF Statement
 */
export function printAllMembersBalancePDF(
  memberBalances: MemberBalanceItem[],
  organizationName: string,
  options?: {
    orientation?: 'portrait' | 'landscape';
    sessionTag?: string;
    subTitle?: string;
    filterLabel?: string;
  }
): void {
  if (!memberBalances || memberBalances.length === 0) return;

  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const orientation = options?.orientation || 'portrait';
  const sessionTag = options?.sessionTag || 'Session 2026–27';
  const subTitle = options?.subTitle || 'Income & Expenditure Ledger — Pampore';
  const filterLabel = options?.filterLabel || 'All Registered Members';

  // Compute Grand Summary
  let grandOpening = 0;
  let grandPaid = 0;
  let grandSubscription = 0;
  let grandOther = 0;
  let grandEffective = 0;
  let grandReceipts = 0;
  let activePayers = 0;

  memberBalances.forEach((item) => {
    grandOpening += item.openingBalance;
    grandPaid += item.totalPaid;
    grandSubscription += item.subscriptionPaid;
    grandOther += item.otherPaid;
    grandEffective += item.effectiveBalance;
    grandReceipts += item.receiptsCount;
    if (item.totalPaid > 0) activePayers++;
  });

  const rowsHtml = memberBalances
    .map((item, idx) => {
      const isPositive = item.effectiveBalance > 0;
      const isNegative = item.effectiveBalance < 0;
      const statusBadge =
        item.status === 'Advance'
          ? '<span style="background:#dcfce7; color:#166534; padding:2px 6px; border-radius:4px; font-weight:bold; font-size:8pt;">Advance</span>'
          : item.status === 'Arrears'
          ? '<span style="background:#fee2e2; color:#991b1b; padding:2px 6px; border-radius:4px; font-weight:bold; font-size:8pt;">Arrears Due</span>'
          : item.status === 'Cleared'
          ? '<span style="background:#f1f5f9; color:#475569; padding:2px 6px; border-radius:4px; font-weight:bold; font-size:8pt;">Cleared</span>'
          : '<span style="background:#e0f2fe; color:#0369a1; padding:2px 6px; border-radius:4px; font-weight:bold; font-size:8pt;">Active</span>';

      return `
        <tr>
          <td style="text-align:center; color:#64748b; font-size:8.5pt;">${idx + 1}</td>
          <td style="font-weight:bold; font-family:monospace; color:#0f172a;">#${item.ledgerNo}</td>
          <td style="font-weight:600; color:#0f172a;">
            ${item.name}
            ${item.phone ? `<div style="font-size:7.5pt; color:#64748b; font-weight:normal;">📱 ${item.phone}</div>` : ''}
          </td>
          <td style="text-align:right; font-family:monospace; color:#475569;">${formatMoney(item.monthlyDue)}</td>
          <td style="text-align:right; font-family:monospace; color:${item.openingBalance >= 0 ? '#047857' : '#b91c1c'}; font-weight:500;">
            ${item.openingBalance !== 0 ? formatMoney(item.openingBalance) : '—'}
          </td>
          <td style="text-align:right; font-family:monospace; font-weight:bold; color:#065f46;">
            ${formatMoney(item.totalPaid)}
          </td>
          <td style="text-align:center; font-family:monospace; font-size:8.5pt; color:#475569;">
            ${item.receiptsCount > 0 ? `${item.receiptsCount} entries` : '—'}
          </td>
          <td style="font-size:8pt; color:#64748b; white-space:nowrap;">
            ${item.lastPaymentDate ? fmtDate(item.lastPaymentDate) : 'No payment'}
          </td>
          <td style="text-align:right; font-family:monospace; font-weight:bold; font-size:9.5pt; color:${
            isPositive ? '#065f46' : isNegative ? '#b91c1c' : '#334155'
          }; background:${isPositive ? '#f0fdf4' : isNegative ? '#fef2f2' : 'transparent'};">
            ${formatMoney(item.effectiveBalance)}
          </td>
          <td style="text-align:center;">${statusBadge}</td>
        </tr>
      `;
    })
    .join('');

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8"/>
      <title>All Members Balance Statement — ${organizationName}</title>
      <style>
        @page { size: A4 ${orientation}; margin: 10mm; }
        body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #0f172a; margin: 0; padding: 10px; font-size: 9pt; line-height: 1.4; }
        .header { text-align: center; border-bottom: 2px solid #b8863b; padding-bottom: 8px; margin-bottom: 12px; }
        .header h1 { font-size: 16pt; margin: 0; color: #1F3A5F; font-family: Georgia, serif; text-transform: uppercase; letter-spacing: 0.5px; }
        .header p { margin: 2px 0 0; font-size: 9.5pt; color: #475569; }
        .header .meta { margin-top: 4px; font-size: 8.5pt; font-weight: bold; color: #b8863b; letter-spacing: 0.3px; }
        
        .kpi-container { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 12px; background: #f8fafc; padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 6px; }
        .kpi-box { flex: 1; text-align: center; }
        .kpi-box .val { font-size: 11pt; font-weight: bold; color: #0f172a; margin-top: 2px; font-family: monospace; }
        .kpi-box .lbl { font-size: 7.5pt; text-transform: uppercase; color: #64748b; font-weight: 600; }
        
        table { width: 100%; border-collapse: collapse; font-size: 8.5pt; margin-top: 5px; }
        th, td { border: 1px solid #cbd5e1; padding: 5px 6px; text-align: left; }
        th { background-color: #1e293b; color: #ffffff; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.5px; }
        tr:nth-child(even) { background-color: #f8fafc; }
        .total-row { background-color: #fef3c7 !important; font-weight: bold; font-size: 9pt; border-top: 2px solid #b8863b; }
        
        .audit-box { margin-top: 20px; display: flex; justify-content: space-between; gap: 20px; padding-top: 15px; border-top: 1px solid #cbd5e1; font-size: 8.5pt; }
        .sig-col { text-align: center; flex: 1; }
        .sig-line { border-top: 1px dashed #64748b; margin-top: 35px; padding-top: 4px; font-weight: 600; color: #334155; }
        .sig-role { font-size: 7.5pt; color: #64748b; }
        
        .footer { margin-top: 15px; display: flex; justify-content: space-between; font-size: 7.5pt; color: #64748b; border-top: 1px solid #f1f5f9; padding-top: 4px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>${organizationName || 'Fallah Behbood Committee'}</h1>
        <p>${subTitle} • Pampore, Kashmir</p>
        <div class="meta">ALL MEMBERS BALANCE & FINANCIAL AUDIT STATEMENT (${sessionTag})</div>
      </div>

      <div class="kpi-container">
        <div class="kpi-box">
          <div class="lbl">Total Members</div>
          <div class="val">${memberBalances.length}</div>
        </div>
        <div class="kpi-box">
          <div class="lbl">Active Payers</div>
          <div class="val" style="color:#0284c7;">${activePayers} / ${memberBalances.length}</div>
        </div>
        <div class="kpi-box">
          <div class="lbl">Manual Opening Balances</div>
          <div class="val" style="color:${grandOpening >= 0 ? '#047857' : '#b91c1c'};">${formatMoney(grandOpening)}</div>
        </div>
        <div class="kpi-box">
          <div class="lbl">Total Collections Paid</div>
          <div class="val" style="color:#047857;">${formatMoney(grandPaid)}</div>
        </div>
        <div class="kpi-box">
          <div class="lbl">Effective Live Balance</div>
          <div class="val" style="color:#0f172a; font-size:12pt;">${formatMoney(grandEffective)}</div>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width:25px; text-align:center;">#</th>
            <th style="width:65px;">Ledger #</th>
            <th>Member Name</th>
            <th style="text-align:right; width:70px;">Monthly Rate</th>
            <th style="text-align:right; width:85px;">Opening Bal. (Manual)</th>
            <th style="text-align:right; width:85px;">Total Paid (Auto)</th>
            <th style="text-align:center; width:60px;">Receipts</th>
            <th style="width:75px;">Last Paid</th>
            <th style="text-align:right; width:95px;">Effective Balance</th>
            <th style="text-align:center; width:65px;">Status</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
          <tr class="total-row">
            <td colspan="3" style="text-align:right; font-weight:bold; text-transform:uppercase;">
              GRAND TOTAL (${memberBalances.length} MEMBERS):
            </td>
            <td style="text-align:right; font-family:monospace;">—</td>
            <td style="text-align:right; font-family:monospace; color:${grandOpening >= 0 ? '#047857' : '#b91c1c'};">
              ${formatMoney(grandOpening)}
            </td>
            <td style="text-align:right; font-family:monospace; color:#065f46; font-size:9.5pt;">
              ${formatMoney(grandPaid)}
            </td>
            <td style="text-align:center; font-family:monospace;">${grandReceipts}</td>
            <td style="color:#64748b;">—</td>
            <td style="text-align:right; font-family:monospace; font-size:10pt; color:#0f172a;">
              ${formatMoney(grandEffective)}
            </td>
            <td style="text-align:center; font-size:8pt;">AUDITED</td>
          </tr>
        </tbody>
      </table>

      <div class="audit-box">
        <div class="sig-col">
          <div class="sig-line">Prepared By / Accountant</div>
          <div class="sig-role">Fallah Behbood Committee</div>
        </div>
        <div class="sig-col">
          <div class="sig-line">Treasurer / Cashier</div>
          <div class="sig-role">Verified Physical & Ledger Count</div>
        </div>
        <div class="sig-col">
          <div class="sig-line">Audited By / General Secretary</div>
          <div class="sig-role">Internal Audit Committee</div>
        </div>
        <div class="sig-col">
          <div class="sig-line">President / Chairman</div>
          <div class="sig-role">Approved & Sealed</div>
        </div>
      </div>

      <div class="footer">
        <div>Filter: ${filterLabel} • Report generated for ${organizationName}</div>
        <div>Statement Date: ${fmtDate(todayISO())} • Printed on: ${new Date().toLocaleString()}</div>
      </div>

      <script>
        window.onload = function() { window.print(); }
      </script>
    </body>
    </html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
}

/**
 * Export All Members Balance Spreadsheet to Excel (.xlsx)
 */
export function exportAllMembersBalanceExcel(
  memberBalances: MemberBalanceItem[],
  organizationName: string
): void {
  if (!memberBalances || memberBalances.length === 0) return;

  const wb = XLSX.utils.book_new();

  const data = [
    [
      'S.No',
      'Ledger No.',
      'Member Name',
      'Phone Number',
      'Address',
      'Monthly Subscription (Rs.)',
      'Manual Opening Balance (Rs.)',
      'Total Paid to Date (Rs.)',
      'Subscription Paid (Rs.)',
      'Other Funds / Donations (Rs.)',
      'Receipts Count',
      'Last Payment Date',
      'Effective Live Balance (Rs.)',
      'Balance Status',
      'Balance Notes / Remarks',
    ],
    ...memberBalances.map((m, idx) => [
      idx + 1,
      m.ledgerNo,
      m.name,
      m.phone || '',
      m.address || '',
      m.monthlyDue,
      m.openingBalance,
      m.totalPaid,
      m.subscriptionPaid,
      m.otherPaid,
      m.receiptsCount,
      m.lastPaymentDate ? fmtDate(m.lastPaymentDate) : '—',
      m.effectiveBalance,
      m.status,
      m.balanceNotes || '',
    ]),
  ];

  // Add Grand Total row
  let grandOpening = 0;
  let grandPaid = 0;
  let grandSub = 0;
  let grandOther = 0;
  let grandEffective = 0;
  let grandCount = 0;

  memberBalances.forEach((m) => {
    grandOpening += m.openingBalance;
    grandPaid += m.totalPaid;
    grandSub += m.subscriptionPaid;
    grandOther += m.otherPaid;
    grandEffective += m.effectiveBalance;
    grandCount += m.receiptsCount;
  });

  data.push([
    'TOTAL',
    '—',
    `Grand Total (${memberBalances.length} Members)`,
    '—',
    '—',
    '—',
    grandOpening,
    grandPaid,
    grandSub,
    grandOther,
    grandCount,
    '—',
    grandEffective,
    'Audited',
    'Consolidated Member Statement',
  ]);

  const ws = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, 'Member Balances Ledger');

  const filename = `All_Members_Balance_Report_${organizationName.replace(/\s+/g, '_')}_${todayISO()}.xlsx`;
  XLSX.writeFile(wb, filename);
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
  const memberBalances = computeMemberBalanceList(members, transactions, settings.memberBalanceOverrides);
  const membersData = [
    ['Ledger No.', 'Member Name', 'Phone', 'Monthly Due (Rs.)', 'Manual Opening Balance (Rs.)', 'Total Paid (Rs.)', 'Subscription (Rs.)', 'Other Funds (Rs.)', 'Payment Receipts', 'Last Payment Date', 'Effective Live Balance (Rs.)', 'Status'],
    ...memberBalances.map(m => [
      m.ledgerNo,
      m.name,
      m.phone || '',
      m.monthlyDue,
      m.openingBalance,
      m.totalPaid,
      m.subscriptionPaid,
      m.otherPaid,
      m.receiptsCount,
      m.lastPaymentDate ? fmtDate(m.lastPaymentDate) : '—',
      m.effectiveBalance,
      m.status,
    ]),
  ];
  const wsMembers = XLSX.utils.aoa_to_sheet(membersData);
  XLSX.utils.book_append_sheet(wb, wsMembers, 'Member Balances & Directory');

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

