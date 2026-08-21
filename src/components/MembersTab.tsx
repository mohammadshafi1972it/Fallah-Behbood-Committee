import React, { useState, useMemo } from 'react';
import { Member, Transaction, ContributionItem, AppSettings, MemberBalanceItem } from '../types';
import {
  calculateMemberTotals,
  formatMoney,
  num,
  normalizeName,
  exportCsv,
  fmtDate,
  INCOME_HEADS,
  calculateContributionsForMonth,
  findMember,
  parseUniversalFileImport,
  computeMemberBalanceList,
  printAllMembersBalancePDF,
  exportAllMembersBalanceExcel,
} from '../lib/ledgerUtils';
import { MemberHistoryModal } from './MemberHistoryModal';
import { SendReminderModal, OverdueMemberItem } from './SendReminderModal';
import { MemberCollapsibleHistory } from './MemberCollapsibleHistory';
import { EditMemberBalanceModal } from './EditMemberBalanceModal';
import { AllMembersBalancePdfModal } from './AllMembersBalancePdfModal';
import { MonthEndIntimationModal } from './MonthEndIntimationModal';
import * as XLSX from 'xlsx';
import {
  Users,
  UserPlus,
  Upload,
  Search,
  Download,
  Printer,
  History,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Bell,
  MessageSquare,
  Filter,
  ChevronDown,
  ChevronUp,
  DollarSign,
  ArrowUpDown,
  Award,
  TrendingUp,
  BarChart3,
  PieChart,
  FileSpreadsheet,
  Pencil,
  FileText,
  ShieldCheck,
} from 'lucide-react';

interface MembersTabProps {
  members: Member[];
  transactions: Transaction[];
  organizationName: string;
  settings?: AppSettings;
  onAddMember: (member: Member) => void;
  onUpdateMember?: (member: Member) => void;
  onUpdateMemberBalance?: (
    ledgerNo: string,
    openingBalance: number,
    previousDue?: number,
    showNilBalanceWhenPaid?: boolean,
    notes?: string
  ) => void;
  onRemoveMember: (ledgerNo: string) => void;
  onBulkImportMembers: (newMembers: Member[]) => void;
  onSaveTransaction?: (txn: Transaction) => void;
  onDeleteTransaction?: (id: string) => void;
  showToast: (msg: string) => void;
}

export const MembersTab: React.FC<MembersTabProps> = ({
  members,
  transactions,
  organizationName,
  settings,
  onAddMember,
  onUpdateMember,
  onUpdateMemberBalance,
  onRemoveMember,
  onBulkImportMembers,
  onSaveTransaction,
  onDeleteTransaction,
  showToast,
}) => {
  const [ledgerNo, setLedgerNo] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [monthlyDue, setMonthlyDue] = useState<string>('150');
  const [initialOpeningBalance, setInitialOpeningBalance] = useState<string>('0');
  const [phone, setPhone] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Paid' | 'Partial' | 'Due'>('All');

  // PDF orientation preference
  const [pdfOrientation, setPdfOrientation] = useState<'portrait' | 'landscape'>('portrait');

  // History modal state
  const [selectedHistoryMember, setSelectedHistoryMember] = useState<Member | null>(null);

  // Edit Member Balance modal state
  const [isEditBalanceModalOpen, setIsEditBalanceModalOpen] = useState(false);
  const [selectedBalanceMember, setSelectedBalanceMember] = useState<Member | null>(null);

  // All Members Balance PDF statement modal state
  const [isAllMembersBalancePdfModalOpen, setIsAllMembersBalancePdfModalOpen] = useState(false);

  // Month-End Member Intimations Modal state
  const [isMonthEndIntimationModalOpen, setIsMonthEndIntimationModalOpen] = useState(false);

  // Collapsible inline history state
  const [expandedLedgers, setExpandedLedgers] = useState<Record<string, boolean>>({});

  const toggleExpandMember = (lNo: string) => {
    setExpandedLedgers((prev) => ({
      ...prev,
      [lNo]: !prev[lNo],
    }));
  };

  // Reminder modal state
  const [isReminderModalOpen, setIsReminderModalOpen] = useState(false);
  const [reminderMonth, setReminderMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [singleTargetMember, setSingleTargetMember] = useState<OverdueMemberItem | null>(null);

  // Dues status matrix filters
  const [duesFund, setDuesFund] = useState<string>('Imam Fund');
  const [duesMonthsCount, setDuesMonthsCount] = useState<number>(6);

  // Active view mode in Members Tab: 'directory' | 'memberwise_totals' | 'matrix'
  const [activeViewMode, setActiveViewMode] = useState<'directory' | 'memberwise_totals' | 'matrix'>('directory');

  // Memberwise Totals sorting and filtering
  const [memberwiseSortBy, setMemberwiseSortBy] = useState<'total_desc' | 'total_asc' | 'ledger_asc' | 'ledger_desc' | 'count_desc' | 'name_asc'>('total_desc');
  const [memberwiseHeadFilter, setMemberwiseHeadFilter] = useState<string>('All');

  // Detailed Memberwise Total Payments Data
  const memberwisePaymentData = useMemo(() => {
    // Filter transactions by head if selected
    const filteredTxns = transactions.filter((t) => {
      if (t.type !== 'Income') return false;
      if (memberwiseHeadFilter !== 'All' && t.head !== memberwiseHeadFilter) return false;
      return true;
    });

    const list = members.map((m) => {
      const memberTxns = filteredTxns.filter(
        (t) => String(t.ledgerNo).trim() === String(m.ledgerNo).trim()
      );

      const totalPaid = memberTxns.reduce((sum, t) => sum + (t.amount || 0), 0);
      const count = memberTxns.length;

      // Subscription portion vs Other Funds/Donations portion
      const subscriptionPaid = memberTxns
        .filter((t) => (t.head || '').toLowerCase().includes('subscription'))
        .reduce((sum, t) => sum + (t.amount || 0), 0);
      const otherPaid = totalPaid - subscriptionPaid;

      // Find latest date
      let lastPaymentDate: string | null = null;
      if (memberTxns.length > 0) {
        const sorted = memberTxns.slice().sort((a, b) => b.date.localeCompare(a.date));
        lastPaymentDate = sorted[0].date;
      }

      return {
        member: m,
        ledgerNo: m.ledgerNo,
        name: m.name,
        monthlyDue: m.monthlyDue,
        totalPaid,
        subscriptionPaid,
        otherPaid,
        count,
        lastPaymentDate,
      };
    });

    // Apply search query filter if typed
    let result = list;
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(
        (item) => item.name.toLowerCase().includes(q) || item.ledgerNo.toLowerCase().includes(q)
      );
    }

    // Apply sorting
    result.sort((a, b) => {
      if (memberwiseSortBy === 'total_desc') return b.totalPaid - a.totalPaid || (parseInt(a.ledgerNo, 10) || 0) - (parseInt(b.ledgerNo, 10) || 0);
      if (memberwiseSortBy === 'total_asc') return a.totalPaid - b.totalPaid || (parseInt(a.ledgerNo, 10) || 0) - (parseInt(b.ledgerNo, 10) || 0);
      if (memberwiseSortBy === 'ledger_asc') return (parseInt(a.ledgerNo, 10) || 0) - (parseInt(b.ledgerNo, 10) || 0);
      if (memberwiseSortBy === 'ledger_desc') return (parseInt(b.ledgerNo, 10) || 0) - (parseInt(a.ledgerNo, 10) || 0);
      if (memberwiseSortBy === 'count_desc') return b.count - a.count || b.totalPaid - a.totalPaid;
      if (memberwiseSortBy === 'name_asc') return a.name.localeCompare(b.name);
      return 0;
    });

    return result;
  }, [members, transactions, memberwiseHeadFilter, searchQuery, memberwiseSortBy]);

  // Overall memberwise total sums
  const memberwiseGrandTotals = useMemo(() => {
    let grandTotalPaid = 0;
    let grandSubscriptionPaid = 0;
    let grandOtherPaid = 0;
    let grandTxCount = 0;
    let activeContributorsCount = 0;

    memberwisePaymentData.forEach((item) => {
      grandTotalPaid += item.totalPaid;
      grandSubscriptionPaid += item.subscriptionPaid;
      grandOtherPaid += item.otherPaid;
      grandTxCount += item.count;
      if (item.totalPaid > 0) activeContributorsCount++;
    });

    const topContributor = memberwisePaymentData.length > 0 ? memberwisePaymentData[0] : null;

    return {
      grandTotalPaid,
      grandSubscriptionPaid,
      grandOtherPaid,
      grandTxCount,
      activeContributorsCount,
      totalMembersCount: memberwisePaymentData.length,
      averagePerMember: memberwisePaymentData.length > 0 ? grandTotalPaid / memberwisePaymentData.length : 0,
      topContributor,
    };
  }, [memberwisePaymentData]);

  // Compute live member balances (Manual Opening Balance + Auto-updated Live Payments)
  const memberBalanceList = useMemo(() => {
    return computeMemberBalanceList(members, transactions, settings?.memberBalanceOverrides);
  }, [members, transactions, settings?.memberBalanceOverrides]);

  const memberBalanceMap = useMemo(() => {
    const map = new Map<string, MemberBalanceItem>();
    memberBalanceList.forEach((b) => map.set(b.ledgerNo, b));
    return map;
  }, [memberBalanceList]);

  // Export Memberwise Total Payments CSV
  const handleExportMemberwiseTotalsCSV = () => {
    if (!memberwisePaymentData.length) {
      showToast('No memberwise payment data to export.');
      return;
    }
    const headers = [
      'S.No',
      'Ledger No.',
      'Member Name',
      'Monthly Due (Rs.)',
      'Subscription Paid (Rs.)',
      'Other Funds / Donations (Rs.)',
      'Grand Total Paid (Rs.)',
      'Payment Count',
      'Last Payment Date',
    ];
    const rows = memberwisePaymentData.map((item, idx) => [
      idx + 1,
      item.ledgerNo,
      item.name,
      item.monthlyDue,
      item.subscriptionPaid,
      item.otherPaid,
      item.totalPaid,
      item.count,
      item.lastPaymentDate ? fmtDate(item.lastPaymentDate) : '—',
    ]);

    // Append summary row
    rows.push([
      'TOTAL',
      '—',
      `All ${memberwisePaymentData.length} Members`,
      '—',
      memberwiseGrandTotals.grandSubscriptionPaid,
      memberwiseGrandTotals.grandOtherPaid,
      memberwiseGrandTotals.grandTotalPaid,
      memberwiseGrandTotals.grandTxCount,
      '—',
    ]);

    exportCsv(headers, rows, `Memberwise_Total_Payments_Report_${organizationName.replace(/\s+/g, '_')}.csv`);
    showToast('Memberwise Total Payment Statement exported as CSV.');
  };

  // Export / Print Memberwise Total Payments PDF Report
  const handlePrintMemberwiseTotalsPDF = () => {
    if (!memberwisePaymentData.length) {
      showToast('No memberwise payment data to print.');
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const rowsHtml = memberwisePaymentData
      .map(
        (item, idx) => `
        <tr>
          <td style="text-align:center;">${idx + 1}</td>
          <td><strong>#${item.ledgerNo}</strong></td>
          <td style="font-weight:600;">${item.name}</td>
          <td>${formatMoney(item.monthlyDue)}</td>
          <td>${formatMoney(item.subscriptionPaid)}</td>
          <td>${formatMoney(item.otherPaid)}</td>
          <td style="font-weight:700; color:#065f46;">${formatMoney(item.totalPaid)}</td>
          <td style="text-align:center;">${item.count}</td>
          <td>${item.lastPaymentDate ? fmtDate(item.lastPaymentDate) : '—'}</td>
        </tr>
      `
      )
      .join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Memberwise Total Payments Report — ${organizationName}</title>
        <style>
          @page { size: A4 ${pdfOrientation}; margin: 10mm; }
          body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #0f172a; margin: 0; padding: 10px; font-size: 10pt; }
          .header { text-align: center; border-bottom: 2px solid #b8863b; padding-bottom: 8px; margin-bottom: 12px; }
          .header h1 { font-size: 16pt; margin: 0; color: #1F3A5F; font-family: Georgia, serif; }
          .header p { margin: 2px 0 0; font-size: 10pt; color: #64748b; }
          .kpi-container { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 14px; background: #f8fafc; padding: 8px 12px; border: 1px solid #e2e8f0; border-radius: 6px; }
          .kpi-box { flex: 1; text-align: center; }
          .kpi-box .val { font-size: 11pt; font-weight: bold; color: #0f172a; margin-top: 2px; }
          .kpi-box .lbl { font-size: 8pt; text-transform: uppercase; color: #64748b; font-weight: 600; }
          table { width: 100%; border-collapse: collapse; font-size: 9pt; }
          th, td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
          th { background-color: #1e293b; color: #ffffff; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.5px; }
          tr:nth-child(even) { background-color: #f8fafc; }
          .total-row { background-color: #fef3c7 !important; font-weight: bold; font-size: 9.5pt; border-top: 2px solid #b8863b; }
          .footer { margin-top: 15px; display: flex; justify-content: space-between; font-size: 8pt; color: #64748b; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>${organizationName || 'Fallah Behbood Committee'}</h1>
          <p>Memberwise Total Payments & Contributions Report (${memberwiseHeadFilter === 'All' ? 'All Funds' : memberwiseHeadFilter})</p>
        </div>

        <div class="kpi-container">
          <div class="kpi-box">
            <div class="lbl">Total Collected</div>
            <div class="val" style="color: #047857;">${formatMoney(memberwiseGrandTotals.grandTotalPaid)}</div>
          </div>
          <div class="kpi-box">
            <div class="lbl">Active Members</div>
            <div class="val">${memberwiseGrandTotals.activeContributorsCount} / ${memberwiseGrandTotals.totalMembersCount}</div>
          </div>
          <div class="kpi-box">
            <div class="lbl">Subscriptions Paid</div>
            <div class="val">${formatMoney(memberwiseGrandTotals.grandSubscriptionPaid)}</div>
          </div>
          <div class="kpi-box">
            <div class="lbl">Total Payment Receipts</div>
            <div class="val">${memberwiseGrandTotals.grandTxCount}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width:30px; text-align:center;">#</th>
              <th>Ledger #</th>
              <th>Member Name</th>
              <th>Monthly Due</th>
              <th>Subscription</th>
              <th>Other / Donations</th>
              <th>Total Paid</th>
              <th style="text-align:center;">Receipts</th>
              <th>Last Payment</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
            <tr class="total-row">
              <td colspan="3" style="text-align:right; font-weight:bold;">GRAND TOTAL (${memberwisePaymentData.length} Members):</td>
              <td>—</td>
              <td>${formatMoney(memberwiseGrandTotals.grandSubscriptionPaid)}</td>
              <td>${formatMoney(memberwiseGrandTotals.grandOtherPaid)}</td>
              <td style="color:#065f46; font-size:10pt;">${formatMoney(memberwiseGrandTotals.grandTotalPaid)}</td>
              <td style="text-align:center;">${memberwiseGrandTotals.grandTxCount}</td>
              <td>—</td>
            </tr>
          </tbody>
        </table>

        <div class="footer">
          <div>Report generated for ${organizationName}</div>
          <div>Printed on: ${fmtDate(new Date().toISOString().slice(0, 10))}</div>
        </div>

        <script>window.onload = function() { window.print(); }</script>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  const handleSuggestLedgerNo = () => {
    const maxNo = members.reduce((max, m) => {
      const parsed = parseInt(m.ledgerNo, 10);
      return !isNaN(parsed) && parsed > max ? parsed : max;
    }, 0);
    setLedgerNo(String(maxNo + 1));
  };

  const handleAddMemberSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanLNo = ledgerNo.trim();
    const cleanName = normalizeName(name);
    const parsedDue = num(monthlyDue) || 150;

    if (!cleanLNo || !cleanName) {
      showToast('Please enter both Ledger Number and Member Name.');
      return;
    }

    if (members.some((m) => String(m.ledgerNo).trim() === cleanLNo)) {
      showToast('A member with this Ledger Number already exists.');
      return;
    }

    const parsedInitialBalance = num(initialOpeningBalance) || 0;

    onAddMember({
      ledgerNo: cleanLNo,
      name: cleanName,
      monthlyDue: parsedDue,
      openingBalance: parsedInitialBalance,
      phone: phone.trim() || undefined,
    });

    if (parsedInitialBalance !== 0 && onUpdateMemberBalance) {
      onUpdateMemberBalance(cleanLNo, parsedInitialBalance, 'Initial balance on registration');
    }

    showToast('New member added successfully.');
    setLedgerNo('');
    setName('');
    setMonthlyDue('150');
    setInitialOpeningBalance('0');
    setPhone('');
  };

  // Bulk import members from Excel / CSV / JSON
  const handleImportMembers = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const buffer = evt.target?.result as ArrayBuffer;
        if (!buffer) return;

        const result = parseUniversalFileImport(buffer, file.name);

        onBulkImportMembers(result.members);
        showToast(`Imported ALL ${result.members.length} members from file irrespective of layout discrepancies.`);
      } catch (err) {
        showToast('Failed to parse file.');
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  // Current Month Overdue Contributions Calculation
  const currentMonth = useMemo(() => new Date().toISOString().slice(0, 7), []);

  const currentMonthContributions = useMemo(() => {
    return calculateContributionsForMonth(members, transactions, reminderMonth || currentMonth);
  }, [members, transactions, reminderMonth, currentMonth]);

  const currentMonthContributionsMap = useMemo(() => {
    const map = new Map<string, ContributionItem>();
    currentMonthContributions.forEach((c) => {
      map.set(String(c.ledgerNo).trim(), c);
    });
    return map;
  }, [currentMonthContributions]);

  // Filtered members
  const filteredMembers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = members.slice().sort((a, b) => (parseInt(a.ledgerNo, 10) || 0) - (parseInt(b.ledgerNo, 10) || 0));

    if (q) {
      list = list.filter((m) => (m.name + ' ' + m.ledgerNo).toLowerCase().includes(q));
    }

    if (statusFilter !== 'All') {
      list = list.filter((m) => {
        const contrib = currentMonthContributionsMap.get(String(m.ledgerNo).trim());
        const st = contrib?.status || 'Due';
        return st === statusFilter;
      });
    }

    return list;
  }, [members, searchQuery, statusFilter, currentMonthContributionsMap]);

  const overdueMembersList = useMemo<OverdueMemberItem[]>(() => {
    return currentMonthContributions
      .filter((c) => c.status !== 'Paid')
      .map((c) => {
        const m = findMember(members, c.ledgerNo);
        return {
          ledgerNo: c.ledgerNo,
          name: c.name,
          outstanding: Math.max(0, c.expected - c.paid),
          month: reminderMonth || currentMonth,
          phone: m?.phone,
          status: c.status === 'Partial' ? 'Partial' : 'Due',
        };
      });
  }, [currentMonthContributions, members, reminderMonth, currentMonth]);

  // Export CSV
  const handleExportCSV = () => {
    if (!members.length) {
      showToast('No members to export.');
      return;
    }
    exportCsv(
      ['Ledger No.', 'Member Name', 'Monthly Due (Rs.)', 'Payment Status', 'Total Paid (Rs.)', 'Payment Count', 'Last Payment Date'],
      filteredMembers.map((m) => {
        const t = calculateMemberTotals(transactions, m.ledgerNo);
        const contrib = currentMonthContributionsMap.get(String(m.ledgerNo).trim());
        const st = contrib?.status || 'Due';
        const statusText = st === 'Paid' ? 'Fully Paid' : st === 'Partial' ? `Partial (${formatMoney(contrib?.paid || 0)})` : 'Overdue';
        return [m.ledgerNo, m.name, m.monthlyDue, statusText, t.totalPaid, t.count, t.lastPaymentDate ? fmtDate(t.lastPaymentDate) : '—'];
      }),
      'Fallah_Behbood_Members_Directory.csv'
    );
  };

  // Export PDF (All members)
  const handlePrintAllMembers = () => {
    if (!members.length) {
      showToast('No members to print.');
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const rows = filteredMembers
      .map((m) => {
        const t = calculateMemberTotals(transactions, m.ledgerNo);
        const contrib = currentMonthContributionsMap.get(String(m.ledgerNo).trim());
        const st = contrib?.status || 'Due';
        const statusText = st === 'Paid' ? 'Fully Paid' : st === 'Partial' ? `Partial (${formatMoney(contrib?.paid || 0)})` : 'Overdue';
        return `
        <tr>
          <td>${m.ledgerNo}</td>
          <td style="font-weight:600;">${m.name}</td>
          <td>${formatMoney(m.monthlyDue)}</td>
          <td>${statusText}</td>
          <td>${formatMoney(t.totalPaid)}</td>
          <td>${t.count}</td>
          <td>${t.lastPaymentDate ? fmtDate(t.lastPaymentDate) : '—'}</td>
        </tr>
      `;
      })
      .join('');

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Members Directory — ${organizationName}</title>
        <style>
          @page { size: A4 ${pdfOrientation}; margin: 12mm; }
          body { font-family: 'Times New Roman', serif; color: #111; margin: 0; padding: 10px; }
          h1 { font-size: 16pt; text-align: center; margin: 0 0 4px; color: #1F3A5F; }
          .sub { text-align: center; font-size: 10.5pt; color: #555; margin-bottom: 16px; }
          table { width: 100%; border-collapse: collapse; font-size: 9.5pt; }
          th, td { border: 1px solid #999; padding: 5px 7px; text-align: left; }
          th { background-color: #eee; }
          .footer { margin-top: 15px; text-align: right; font-size: 8.5pt; color: #777; }
        </style>
      </head>
      <body>
        <h1>${organizationName || 'Fallah Behbood Committee'}</h1>
        <div class="sub">Members Directory & Payment Summary (${filteredMembers.length} Members)</div>
        <table>
          <thead>
            <tr>
              <th>Ledger No</th>
              <th>Member Name</th>
              <th>Monthly Due</th>
              <th>Payment Status</th>
              <th>Total Paid</th>
              <th>Entries</th>
              <th>Last Payment</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
        <div class="footer">Generated on ${fmtDate(new Date().toISOString().slice(0, 10))}</div>
        <script>window.onload = function() { window.print(); }</script>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
  };

  // Dues status matrix generator
  const recentMonths = useMemo(() => {
    const list: string[] = [];
    const d = new Date();
    d.setDate(1);
    for (let i = 0; i < duesMonthsCount; i++) {
      list.unshift(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      d.setMonth(d.getMonth() - 1);
    }
    return list;
  }, [duesMonthsCount]);

  const duesMatrix = useMemo(() => {
    const paidSet = new Set<string>();
    transactions.forEach((t) => {
      if (t.type !== 'Income') return;
      if (duesFund !== 'All' && t.head !== duesFund) return;
      const m = t.forMonth || (t.date ? t.date.slice(0, 7) : '');
      if (!m) return;
      paidSet.add(`${String(t.ledgerNo).trim()}|${m}`);
    });

    return filteredMembers.map((m) => {
      const statuses = recentMonths.map((month) => {
        const isPaid = paidSet.has(`${String(m.ledgerNo).trim()}|${month}`);
        return { month, isPaid };
      });
      return { member: m, statuses };
    });
  }, [filteredMembers, transactions, duesFund, recentMonths]);

  return (
    <div className="space-y-6">
      {/* Import Member List Panel */}
      <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
        <div>
          <h3 className="text-xs font-bold text-amber-900 flex items-center gap-1.5 uppercase tracking-wider">
            <Users className="w-4 h-4 text-emerald-700" />
            Import Member List
          </h3>
          <p className="text-xs text-amber-800 mt-0.5">
            Load existing member directory from Excel (.xlsx), CSV, or JSON backup file.
          </p>
        </div>
        <label className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-emerald-800 bg-white border border-emerald-300 rounded-lg hover:bg-emerald-50 cursor-pointer shadow-xs transition-colors shrink-0">
          <Upload className="w-4 h-4 text-emerald-600" />
          <span>Import Member Directory</span>
          <input type="file" accept=".xlsx,.xls,.csv,.json" onChange={handleImportMembers} className="hidden" />
        </label>
      </div>

      {/* Add Member Form */}
      <form onSubmit={handleAddMemberSubmit} className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <h3 className="text-sm font-serif font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
          <UserPlus className="w-4 h-4 text-emerald-600" />
          <span>Add New Member</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Ledger No.</label>
            <div className="flex gap-1.5">
              <input
                type="text"
                placeholder="e.g. 371"
                value={ledgerNo}
                onChange={(e) => setLedgerNo(e.target.value)}
                className="w-full text-xs font-mono px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-800 bg-slate-50/50"
                required
              />
              <button
                type="button"
                onClick={handleSuggestLedgerNo}
                className="px-2.5 py-2 text-[10px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap"
                title="Suggest next sequential ledger number"
              >
                Next No.
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Member Name</label>
            <input
              type="text"
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full text-xs font-medium px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-800 bg-slate-50/50"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Monthly Due (Rs.)</label>
            <input
              type="number"
              placeholder="150"
              value={monthlyDue}
              onChange={(e) => setMonthlyDue(e.target.value)}
              className="w-full text-xs font-mono px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-800 bg-slate-50/50"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1 flex items-center justify-between">
              <span>Manual Opening Bal. (Rs.)</span>
            </label>
            <input
              type="number"
              placeholder="0 (or negative for arrears)"
              value={initialOpeningBalance}
              onChange={(e) => setInitialOpeningBalance(e.target.value)}
              className="w-full text-xs font-mono px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-800 bg-slate-50/50"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">WhatsApp / Phone</label>
            <input
              type="tel"
              placeholder="e.g. 9419000000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full text-xs font-mono px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-800 bg-slate-50/50"
            />
          </div>
        </div>

        <div className="mt-4 pt-2 flex justify-end">
          <button
            type="submit"
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg transition-colors shadow-xs cursor-pointer"
          >
            Add Member
          </button>
        </div>
      </form>

      {/* Quick Member Payment History Lookup Card */}
      <div className="bg-slate-900 text-white border border-slate-800 rounded-xl p-4 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold flex items-center gap-2 font-serif text-amber-400">
            <History className="w-4 h-4 text-amber-400" />
            <span>Member Payment History Lookup</span>
          </h3>
          <p className="text-xs text-slate-300 mt-0.5">
            Select any member to inspect their complete payment history, running balances, receipts, and print PDF statements.
          </p>
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <select
            onChange={(e) => {
              const m = findMember(members, e.target.value);
              if (m) setSelectedHistoryMember(m);
            }}
            defaultValue=""
            className="w-full md:w-64 bg-slate-800 text-slate-100 border border-slate-700 rounded-lg px-3 py-2 text-xs font-medium focus:outline-none focus:border-amber-400 cursor-pointer"
          >
            <option value="" disabled>-- Select Member to View History --</option>
            {members
              .slice()
              .sort((a, b) => (parseInt(a.ledgerNo, 10) || 0) - (parseInt(b.ledgerNo, 10) || 0))
              .map((m) => (
                <option key={m.ledgerNo} value={m.ledgerNo}>
                  #{m.ledgerNo} - {m.name}
                </option>
              ))}
          </select>
        </div>
      </div>

      {/* View Switcher Navigation Bar */}
      <div className="bg-slate-100 p-1.5 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shadow-2xs">
        <div className="flex flex-wrap items-center gap-1 bg-white p-1 rounded-lg border border-slate-200 shadow-2xs">
          <button
            type="button"
            onClick={() => setActiveViewMode('directory')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-bold transition-all cursor-pointer ${
              activeViewMode === 'directory'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Directory & Status</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveViewMode('memberwise_totals')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-bold transition-all cursor-pointer ${
              activeViewMode === 'memberwise_totals'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-slate-700 hover:text-amber-900 hover:bg-amber-50'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5 text-amber-200" />
            <span>Memberwise Total Payments</span>
            <span className="bg-amber-100 text-amber-900 text-[10px] font-mono px-1.5 py-0.5 rounded-full border border-amber-300 font-bold ml-1">
              {members.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveViewMode('matrix')}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-bold transition-all cursor-pointer ${
              activeViewMode === 'matrix'
                ? 'bg-slate-900 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Monthly Dues Matrix</span>
          </button>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-2 px-3 py-1 bg-white sm:bg-transparent rounded-lg border sm:border-0 border-slate-200 text-xs">
          <span className="text-slate-500 font-medium">Grand Memberwise Collection:</span>
          <span className="text-emerald-800 font-mono font-bold text-sm bg-emerald-50 sm:bg-white px-2.5 py-0.5 rounded-md border border-emerald-200 sm:border-slate-200">
            {formatMoney(memberwiseGrandTotals.grandTotalPaid)}
          </span>
        </div>
      </div>

      {/* VIEW 1: Directory & Payment Status */}
      {activeViewMode === 'directory' && (
        <>
          {/* Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by member name or ledger no..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-slate-800 bg-slate-50/50"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-500 font-medium">Status:</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="bg-transparent font-semibold text-slate-800 focus:outline-none cursor-pointer"
              >
                <option value="All">All Statuses</option>
                <option value="Paid">Fully Paid</option>
                <option value="Partial">Partial</option>
                <option value="Due">Pending / Overdue</option>
              </select>
            </div>

            {overdueMembersList.length > 0 && (
              <button
                onClick={() => {
                  setSingleTargetMember(null);
                  setIsReminderModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors cursor-pointer shadow-xs"
              >
                <Bell className="w-3.5 h-3.5" />
                <span>Send Reminders ({overdueMembersList.length})</span>
              </button>
            )}

            <button
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>

            <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs">
              <span className="text-slate-500 font-medium">Layout:</span>
              <label className="inline-flex items-center gap-1 cursor-pointer">
                <input
                  type="radio"
                  name="main-pdf-orientation"
                  value="portrait"
                  checked={pdfOrientation === 'portrait'}
                  onChange={() => setPdfOrientation('portrait')}
                  className="accent-slate-800"
                />
                <span className="text-slate-700 font-medium">Portrait</span>
              </label>
              <label className="inline-flex items-center gap-1 cursor-pointer">
                <input
                  type="radio"
                  name="main-pdf-orientation"
                  value="landscape"
                  checked={pdfOrientation === 'landscape'}
                  onChange={() => setPdfOrientation('landscape')}
                  className="accent-slate-800"
                />
                <span className="text-slate-700 font-medium">Landscape</span>
              </label>
            </div>

            <button
              onClick={() => setIsMonthEndIntimationModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-slate-900 hover:bg-black rounded-lg transition-colors cursor-pointer shadow-xs"
              title="Month-End Intimation Notice & WhatsApp Dispatcher"
            >
              <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
              <span>Month-End Intimations</span>
            </button>

            <button
              onClick={() => setIsAllMembersBalancePdfModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors cursor-pointer shadow-xs"
              title="View full balance statement of all members & print PDF"
            >
              <FileText className="w-3.5 h-3.5 text-emerald-200" />
              <span>All Members Balance (PDF)</span>
            </button>

            <button
              onClick={handlePrintAllMembers}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Directory PDF</span>
            </button>
          </div>
        </div>

        <p className="text-xs text-slate-500">
          Showing <strong className="text-slate-800">{filteredMembers.length}</strong> of{' '}
          <strong className="text-slate-800">{members.length}</strong> members
        </p>
      </div>

      {/* Members Directory Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-800 text-white font-serif uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-3">Ledger No</th>
                <th className="py-3 px-3">Member Name</th>
                <th className="py-3 px-3">Monthly Due</th>
                <th className="py-3 px-3">Payment Status</th>
                <th className="py-3 px-3">Manual Opening Bal.</th>
                <th className="py-3 px-3">Paid to Date (Auto)</th>
                <th className="py-3 px-3 font-bold text-amber-300">Live Balance</th>
                <th className="py-3 px-3">Entries</th>
                <th className="py-3 px-3">Last Payment</th>
                <th className="py-3 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {filteredMembers.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400 font-sans">
                    No members found. Import or add members above.
                  </td>
                </tr>
              ) : (
                filteredMembers.map((m) => {
                  const totals = calculateMemberTotals(transactions, m.ledgerNo);
                  const balItem = memberBalanceMap.get(m.ledgerNo);
                  const previousDue = balItem ? balItem.previousDue : (m.previousDue || 0);
                  const openingBal = balItem ? balItem.openingBalance : (m.openingBalance || 0);
                  const liveEffectiveBal = balItem ? balItem.effectiveBalance : (openingBal + totals.totalPaid);
                  const isNil = balItem ? (balItem.isPaidUp && balItem.showNilBalanceWhenPaid && liveEffectiveBal <= 0) : false;
                  const overdueItem = overdueMembersList.find((o) => o.ledgerNo === m.ledgerNo);
                  const contrib = currentMonthContributionsMap.get(String(m.ledgerNo).trim());
                  const st = contrib?.status || 'Due';
                  const isExpanded = !!expandedLedgers[m.ledgerNo];

                  return (
                    <React.Fragment key={m.ledgerNo}>
                      <tr className={`hover:bg-amber-50/40 transition-colors ${isExpanded ? 'bg-amber-50/60 border-l-4 border-l-amber-500' : ''}`}>
                        <td className="py-3 px-3 font-bold text-slate-900">
                          <button
                            onClick={() => toggleExpandMember(m.ledgerNo)}
                            className="inline-flex items-center gap-1.5 hover:text-amber-700 cursor-pointer font-bold focus:outline-none"
                            title="Click to toggle payment history"
                          >
                            <span>#{m.ledgerNo}</span>
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5 text-amber-600" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5 text-slate-400 hover:text-amber-600" />
                            )}
                          </button>
                        </td>
                        <td className="py-3 px-3 font-sans font-bold text-slate-900">
                          <button
                            onClick={() => toggleExpandMember(m.ledgerNo)}
                            className="hover:text-amber-800 text-left cursor-pointer focus:outline-none"
                            title="Click to view payment history"
                          >
                            {m.name}
                          </button>
                        </td>
                        <td className="py-3 px-3 text-slate-600">{formatMoney(m.monthlyDue)}</td>
                        <td className="py-3 px-3 font-sans whitespace-nowrap">
                          {st === 'Paid' ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-bold rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>Fully Paid</span>
                            </span>
                          ) : st === 'Partial' ? (
                            <span
                              className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-bold rounded-full bg-amber-100 text-amber-900 border border-amber-200"
                              title={`Paid Rs. ${contrib?.paid || 0} of Rs. ${contrib?.expected || m.monthlyDue}`}
                            >
                              <AlertCircle className="w-3 h-3 text-amber-600" />
                              <span>Partial ({formatMoney(contrib?.paid || 0)})</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 text-[11px] font-bold rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                              <AlertCircle className="w-3 h-3 text-rose-600" />
                              <span>Overdue</span>
                            </span>
                          )}
                        </td>

                        {/* Manual Previous Due / Opening Balance */}
                        <td className="py-3 px-3">
                          <button
                            onClick={() => {
                              setSelectedBalanceMember(m);
                              setIsEditBalanceModalOpen(true);
                            }}
                            className="group inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-slate-100 hover:bg-amber-100 text-slate-700 hover:text-amber-900 border border-slate-200 hover:border-amber-300 transition-colors cursor-pointer"
                            title="Click to manually update previous due or starting balance"
                          >
                            {previousDue > 0 ? (
                              <span className="text-rose-700 font-bold">
                                {formatMoney(previousDue)} <span className="text-[9px] font-normal">(Due)</span>
                              </span>
                            ) : openingBal > 0 ? (
                              <span className="text-emerald-700 font-bold">
                                {formatMoney(openingBal)} <span className="text-[9px] font-normal">(Adv)</span>
                              </span>
                            ) : (
                              <span>{formatMoney(openingBal)}</span>
                            )}
                            <Pencil className="w-2.5 h-2.5 opacity-40 group-hover:opacity-100 text-amber-700" />
                          </button>
                        </td>

                        {/* Total Paid (Auto from Transactions) */}
                        <td className="py-3 px-3 font-bold text-emerald-800">
                          {formatMoney(totals.totalPaid)}
                        </td>

                        {/* Effective Live Balance / Nil Status */}
                        <td className="py-3 px-3 font-bold font-sans">
                          {isNil ? (
                            <span className="inline-block px-2 py-0.5 rounded text-xs font-mono font-bold bg-teal-50 text-teal-800 border border-teal-300">
                              Nil (Paid Up)
                            </span>
                          ) : (
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-xs font-mono font-bold ${
                                liveEffectiveBal > 0
                                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                  : liveEffectiveBal < 0
                                  ? 'bg-rose-50 text-rose-800 border border-rose-200'
                                  : 'bg-slate-100 text-slate-700'
                              }`}
                            >
                              {formatMoney(liveEffectiveBal)}
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-3 text-slate-600">{totals.count}</td>
                        <td className="py-3 px-3 text-slate-500">
                          {totals.lastPaymentDate ? fmtDate(totals.lastPaymentDate) : '—'}
                        </td>
                        <td className="py-3 px-3 text-right whitespace-nowrap font-sans">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => {
                                setSelectedBalanceMember(m);
                                setIsEditBalanceModalOpen(true);
                              }}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md transition-colors cursor-pointer"
                              title="Set or update member manual balance"
                            >
                              <Pencil className="w-3 h-3 text-emerald-700" />
                              <span>Balance</span>
                            </button>

                            {overdueItem && (
                              <button
                                onClick={() => {
                                  setReminderMonth(currentMonth);
                                  setSingleTargetMember(overdueItem);
                                  setIsReminderModalOpen(true);
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-md transition-colors cursor-pointer"
                                title={`Send dues reminder for ${currentMonth}`}
                              >
                                <Bell className="w-3.5 h-3.5 text-amber-600" />
                                <span>Remind</span>
                              </button>
                            )}
                            <button
                              onClick={() => toggleExpandMember(m.ledgerNo)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                                isExpanded
                                  ? 'bg-amber-600 text-white shadow-2xs'
                                  : 'text-slate-700 bg-slate-100 hover:bg-slate-200'
                              }`}
                              title="Toggle individual payment contribution history"
                            >
                              <History className="w-3.5 h-3.5" />
                              <span>History</span>
                              {isExpanded ? (
                                <ChevronUp className="w-3 h-3 ml-0.5" />
                              ) : (
                                <ChevronDown className="w-3 h-3 ml-0.5 opacity-70" />
                              )}
                            </button>
                            <button
                              onClick={() => onRemoveMember(m.ledgerNo)}
                              className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                              title="Remove member"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>

                      {/* Collapsible Individual Payment History Table */}
                      {isExpanded && (
                        <tr className="bg-slate-50/80">
                          <td colSpan={10} className="p-2 sm:p-3">
                            <MemberCollapsibleHistory
                              member={m}
                              transactions={transactions}
                              onOpenFullModal={(memberToOpen) => setSelectedHistoryMember(memberToOpen)}
                              onSaveTransaction={onSaveTransaction}
                              onDeleteTransaction={onDeleteTransaction}
                              showToast={showToast}
                            />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      </>
      )}

      {/* VIEW 2: Memberwise Total Payments Dashboard & Table */}
      {activeViewMode === 'memberwise_totals' && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-xs font-bold uppercase tracking-wider">Total Memberwise Income</span>
                <DollarSign className="w-4 h-4 text-emerald-600" />
              </div>
              <p className="text-xl font-bold font-mono text-emerald-700">
                {formatMoney(memberwiseGrandTotals.grandTotalPaid)}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Cumulative contributions from all {memberwiseGrandTotals.totalMembersCount} members
              </p>
            </div>

            <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-xs font-bold uppercase tracking-wider">Active Contributors</span>
                <Users className="w-4 h-4 text-blue-600" />
              </div>
              <p className="text-xl font-bold font-mono text-slate-900">
                {memberwiseGrandTotals.activeContributorsCount}{' '}
                <span className="text-xs font-normal text-slate-500">
                  / {memberwiseGrandTotals.totalMembersCount}
                </span>
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                {memberwiseGrandTotals.totalMembersCount > 0
                  ? Math.round((memberwiseGrandTotals.activeContributorsCount / memberwiseGrandTotals.totalMembersCount) * 100)
                  : 0}% participation rate
              </p>
            </div>

            <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-xs font-bold uppercase tracking-wider">Subscription Total</span>
                <TrendingUp className="w-4 h-4 text-amber-600" />
              </div>
              <p className="text-xl font-bold font-mono text-amber-800">
                {formatMoney(memberwiseGrandTotals.grandSubscriptionPaid)}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Monthly membership dues collected
              </p>
            </div>

            <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs">
              <div className="flex items-center justify-between text-slate-500 mb-1">
                <span className="text-xs font-bold uppercase tracking-wider">Top Member Contributor</span>
                <Award className="w-4 h-4 text-amber-500" />
              </div>
              <p className="text-sm font-bold text-slate-900 truncate">
                {memberwiseGrandTotals.topContributor ? memberwiseGrandTotals.topContributor.name : '—'}
              </p>
              <p className="text-xs font-bold font-mono text-emerald-700 mt-0.5">
                {memberwiseGrandTotals.topContributor ? formatMoney(memberwiseGrandTotals.topContributor.totalPaid) : 'Rs. 0'}
              </p>
            </div>
          </div>

          {/* Memberwise Toolbar & Filter */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
              {/* Search */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search member by name or ledger no..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-slate-800 bg-slate-50/50"
                />
              </div>

              {/* Fund Head Filter */}
              <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-slate-500 font-medium whitespace-nowrap">Fund Head:</span>
                <select
                  value={memberwiseHeadFilter}
                  onChange={(e) => setMemberwiseHeadFilter(e.target.value)}
                  className="bg-transparent font-semibold text-slate-800 focus:outline-none cursor-pointer text-xs"
                >
                  <option value="All">All Funds & Dues</option>
                  {INCOME_HEADS.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              {/* Sort By Dropdown */}
              <div className="flex items-center gap-1.5 bg-slate-50 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs">
                <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-slate-500 font-medium whitespace-nowrap">Sort By:</span>
                <select
                  value={memberwiseSortBy}
                  onChange={(e) => setMemberwiseSortBy(e.target.value as any)}
                  className="bg-transparent font-semibold text-slate-800 focus:outline-none cursor-pointer text-xs"
                >
                  <option value="total_desc">Highest Total Paid</option>
                  <option value="total_asc">Lowest Total Paid</option>
                  <option value="ledger_asc">Ledger No. (1, 2, 3...)</option>
                  <option value="ledger_desc">Ledger No. (Desc)</option>
                  <option value="count_desc">Most Receipts Count</option>
                  <option value="name_asc">Member Name (A-Z)</option>
                </select>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setIsAllMembersBalancePdfModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors cursor-pointer shadow-xs"
                title="Generate & print official PDF statement of all member balances"
              >
                <FileText className="w-3.5 h-3.5 text-emerald-200" />
                <span>All Members Balance (PDF)</span>
              </button>

              <button
                onClick={handleExportMemberwiseTotalsCSV}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                title="Export memberwise totals as CSV spreadsheet"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>

              <button
                onClick={handlePrintMemberwiseTotalsPDF}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                title="Print clean memberwise payment report PDF"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Payments PDF</span>
              </button>
            </div>
          </div>

          {/* Memberwise Total Payment Table */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-amber-600" />
                <span>Memberwise Total Payments Breakdown</span>
              </h3>
              <span className="text-xs font-mono text-slate-500">
                Showing {memberwisePaymentData.length} member records
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-800 text-white font-serif uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-3 px-3 text-center w-10">Rank</th>
                    <th className="py-3 px-4">Ledger #</th>
                    <th className="py-3 px-4">Member Name</th>
                    <th className="py-3 px-4 text-right">Monthly Rate</th>
                    <th className="py-3 px-4 text-right">Subscription Paid</th>
                    <th className="py-3 px-4 text-right">Other Funds</th>
                    <th className="py-3 px-4 text-right bg-slate-900 text-amber-300">Grand Total Paid</th>
                    <th className="py-3 px-4 text-center">Receipts</th>
                    <th className="py-3 px-4">Last Payment</th>
                    <th className="py-3 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-sans">
                  {memberwisePaymentData.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-10 text-center text-slate-400">
                        No memberwise payment records match your filters.
                      </td>
                    </tr>
                  ) : (
                    memberwisePaymentData.map((item, idx) => (
                      <tr key={item.ledgerNo} className="hover:bg-amber-50/30 transition-colors">
                        <td className="py-3 px-3 text-center font-bold font-mono text-slate-400">
                          #{idx + 1}
                        </td>
                        <td className="py-3 px-4 font-bold font-mono text-slate-900">
                          {item.ledgerNo}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900">
                          {item.name}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-600">
                          {formatMoney(item.monthlyDue)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-700">
                          {formatMoney(item.subscriptionPaid)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-700">
                          {formatMoney(item.otherPaid)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-emerald-800 bg-emerald-50/50">
                          {formatMoney(item.totalPaid)}
                        </td>
                        <td className="py-3 px-4 text-center font-mono">
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold">
                            {item.count} {item.count === 1 ? 'receipt' : 'receipts'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-500 font-mono text-[11px]">
                          {item.lastPaymentDate ? fmtDate(item.lastPaymentDate) : '—'}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => setSelectedHistoryMember(item.member)}
                            className="px-2.5 py-1 text-[11px] font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 rounded-md transition-colors cursor-pointer inline-flex items-center gap-1"
                          >
                            <History className="w-3 h-3 text-amber-700" />
                            <span>Statement</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {/* Grand Total Summary Footer Row */}
                {memberwisePaymentData.length > 0 && (
                  <tfoot className="bg-amber-100/80 border-t-2 border-amber-300 text-slate-900 font-bold font-mono text-xs">
                    <tr>
                      <td colSpan={3} className="py-3.5 px-4 font-serif text-slate-900 font-bold text-right uppercase tracking-wider">
                        GRAND TOTAL SUMMARY ({memberwisePaymentData.length} MEMBERS):
                      </td>
                      <td className="py-3.5 px-4 text-right text-slate-600">—</td>
                      <td className="py-3.5 px-4 text-right text-slate-800">
                        {formatMoney(memberwiseGrandTotals.grandSubscriptionPaid)}
                      </td>
                      <td className="py-3.5 px-4 text-right text-slate-800">
                        {formatMoney(memberwiseGrandTotals.grandOtherPaid)}
                      </td>
                      <td className="py-3.5 px-4 text-right text-emerald-900 font-extrabold text-sm bg-emerald-200/60">
                        {formatMoney(memberwiseGrandTotals.grandTotalPaid)}
                      </td>
                      <td className="py-3.5 px-4 text-center text-slate-800">
                        {memberwiseGrandTotals.grandTxCount}
                      </td>
                      <td colSpan={2} className="py-3.5 px-4 text-slate-500 font-sans font-normal text-[11px]">
                        Computed across selected filter
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 3: Monthly Dues Status Matrix */}
      {activeViewMode === 'matrix' && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div>
            <h3 className="text-sm font-serif font-bold text-slate-800">Monthly Dues Status Matrix</h3>
            <p className="text-xs text-slate-500">Track monthly member subscription payment status across months. Click 'DUE' to send reminder.</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div>
              <label className="text-[11px] font-semibold text-slate-500 mr-1.5">Fund / Head:</label>
              <select
                value={duesFund}
                onChange={(e) => setDuesFund(e.target.value)}
                className="text-xs px-2.5 py-1.5 border border-slate-200 rounded-lg bg-slate-50/50 font-medium"
              >
                <option value="All">All Funds</option>
                {INCOME_HEADS.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[11px] font-semibold text-slate-500 mr-1.5">Months:</label>
              <input
                type="number"
                min={1}
                max={24}
                value={duesMonthsCount}
                onChange={(e) => setDuesMonthsCount(Math.max(1, Math.min(24, parseInt(e.target.value, 10) || 6)))}
                className="w-14 text-xs font-mono px-2 py-1.5 border border-slate-200 rounded-lg text-center"
              />
            </div>
          </div>
        </div>

        <div className="border border-slate-200 rounded-xl overflow-hidden overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-800 text-white uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-2.5 px-3">Ledger No</th>
                <th className="py-2.5 px-3">Member Name</th>
                {recentMonths.map((m) => (
                  <th key={m} className="py-2.5 px-3 text-center">
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {duesMatrix.length === 0 ? (
                <tr>
                  <td colSpan={2 + recentMonths.length} className="py-8 text-center text-slate-400 font-sans">
                    No members available.
                  </td>
                </tr>
              ) : (
                duesMatrix.map(({ member, statuses }) => (
                  <tr key={member.ledgerNo} className="hover:bg-slate-50">
                    <td className="py-2 px-3 font-bold text-slate-800">{member.ledgerNo}</td>
                    <td className="py-2 px-3 font-sans font-semibold text-slate-900 whitespace-nowrap">
                      {member.name}
                    </td>
                    {statuses.map(({ month, isPaid }) => (
                      <td key={month} className="py-2 px-3 text-center text-[10px] font-bold">
                        {isPaid ? (
                          <span className="inline-block px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold">
                            PAID
                          </span>
                        ) : (
                          <button
                            onClick={() => {
                              setReminderMonth(month);
                              setSingleTargetMember({
                                ledgerNo: member.ledgerNo,
                                name: member.name,
                                outstanding: member.monthlyDue || 150,
                                month: month,
                                phone: member.phone,
                                status: 'Due',
                              });
                              setIsReminderModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-100 hover:bg-rose-200 text-rose-800 font-bold transition-colors cursor-pointer"
                            title={`Click to send reminder for ${month}`}
                          >
                            <Bell className="w-2.5 h-2.5 text-rose-700" />
                            <span>DUE</span>
                          </button>
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* Member History Modal */}
      <MemberHistoryModal
        isOpen={!!selectedHistoryMember}
        onClose={() => setSelectedHistoryMember(null)}
        member={selectedHistoryMember}
        allMembers={members}
        onSelectMember={(m) => setSelectedHistoryMember(m)}
        transactions={transactions}
        organizationName={organizationName}
        onSaveTransaction={onSaveTransaction}
        onDeleteTransaction={onDeleteTransaction}
        showToast={showToast}
      />

      {/* Send Reminder Modal */}
      <SendReminderModal
        isOpen={isReminderModalOpen}
        onClose={() => setIsReminderModalOpen(false)}
        overdueMembers={overdueMembersList}
        organizationName={organizationName}
        selectedMonth={reminderMonth}
        singleTarget={singleTargetMember}
        showToast={showToast}
      />

      {/* Edit Member Manual Balance Modal */}
      <EditMemberBalanceModal
        isOpen={isEditBalanceModalOpen}
        onClose={() => {
          setIsEditBalanceModalOpen(false);
          setSelectedBalanceMember(null);
        }}
        member={selectedBalanceMember}
        transactions={transactions}
        onSaveMemberBalance={(ledgerNo, openingBal, prevDue, showNil, notes) => {
          if (onUpdateMemberBalance) {
            onUpdateMemberBalance(ledgerNo, openingBal, prevDue, showNil, notes);
          }
          showToast(`Balance settings updated for Ledger #${ledgerNo}`);
        }}
      />

      {/* All Members Consolidated Balance Statement & PDF Modal */}
      <AllMembersBalancePdfModal
        isOpen={isAllMembersBalancePdfModalOpen}
        onClose={() => setIsAllMembersBalancePdfModalOpen(false)}
        members={members}
        transactions={transactions}
        settings={settings}
        organizationName={organizationName}
        onEditMemberBalance={(member) => {
          setSelectedBalanceMember(member);
          setIsEditBalanceModalOpen(true);
        }}
        showToast={showToast}
      />

      {/* Month-End Member Intimation & Dispatcher Modal */}
      <MonthEndIntimationModal
        isOpen={isMonthEndIntimationModalOpen}
        onClose={() => setIsMonthEndIntimationModalOpen(false)}
        members={members}
        transactions={transactions}
        settings={settings || { organizationName }}
        showToast={showToast}
      />
    </div>
  );
};
