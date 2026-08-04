import React, { useState, useMemo } from 'react';
import { Member, Transaction, ContributionItem } from '../types';
import { calculateMemberTotals, formatMoney, num, normalizeName, exportCsv, fmtDate, INCOME_HEADS, calculateContributionsForMonth, findMember, parseUniversalFileImport } from '../lib/ledgerUtils';
import { MemberHistoryModal } from './MemberHistoryModal';
import { SendReminderModal, OverdueMemberItem } from './SendReminderModal';
import * as XLSX from 'xlsx';
import { Users, UserPlus, Upload, Search, Download, Printer, History, Trash2, RefreshCw, CheckCircle2, AlertCircle, Bell, Filter } from 'lucide-react';

interface MembersTabProps {
  members: Member[];
  transactions: Transaction[];
  organizationName: string;
  onAddMember: (member: Member) => void;
  onRemoveMember: (ledgerNo: string) => void;
  onBulkImportMembers: (newMembers: Member[]) => void;
  showToast: (msg: string) => void;
}

export const MembersTab: React.FC<MembersTabProps> = ({
  members,
  transactions,
  organizationName,
  onAddMember,
  onRemoveMember,
  onBulkImportMembers,
  showToast,
}) => {
  const [ledgerNo, setLedgerNo] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [monthlyDue, setMonthlyDue] = useState<string>('150');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Paid' | 'Partial' | 'Due'>('All');

  // PDF orientation preference
  const [pdfOrientation, setPdfOrientation] = useState<'portrait' | 'landscape'>('portrait');

  // History modal state
  const [selectedHistoryMember, setSelectedHistoryMember] = useState<Member | null>(null);

  // Reminder modal state
  const [isReminderModalOpen, setIsReminderModalOpen] = useState(false);
  const [reminderMonth, setReminderMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [singleTargetMember, setSingleTargetMember] = useState<OverdueMemberItem | null>(null);

  // Dues status matrix filters
  const [duesFund, setDuesFund] = useState<string>('Imam Fund');
  const [duesMonthsCount, setDuesMonthsCount] = useState<number>(6);

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

    onAddMember({
      ledgerNo: cleanLNo,
      name: cleanName,
      monthlyDue: parsedDue,
    });

    showToast('New member added successfully.');
    setLedgerNo('');
    setName('');
    setMonthlyDue('150');
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

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
            <label className="block text-xs font-semibold text-slate-600 mb-1">Monthly Subscription Due (Rs.)</label>
            <input
              type="number"
              placeholder="150"
              value={monthlyDue}
              onChange={(e) => setMonthlyDue(e.target.value)}
              className="w-full text-xs font-mono px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-800 bg-slate-50/50"
              required
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
              onClick={handlePrintAllMembers}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-900 rounded-lg transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Download PDF</span>
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
                <th className="py-3 px-4">Ledger No</th>
                <th className="py-3 px-4">Member Name</th>
                <th className="py-3 px-4">Monthly Due</th>
                <th className="py-3 px-4">Payment Status</th>
                <th className="py-3 px-4">Total Paid</th>
                <th className="py-3 px-4">Entries</th>
                <th className="py-3 px-4">Last Payment</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {filteredMembers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 font-sans">
                    No members found. Import or add members above.
                  </td>
                </tr>
              ) : (
                filteredMembers.map((m) => {
                  const totals = calculateMemberTotals(transactions, m.ledgerNo);
                  const overdueItem = overdueMembersList.find((o) => o.ledgerNo === m.ledgerNo);
                  const contrib = currentMonthContributionsMap.get(String(m.ledgerNo).trim());
                  const st = contrib?.status || 'Due';

                  return (
                    <tr key={m.ledgerNo} className="hover:bg-amber-50/30 transition-colors">
                      <td className="py-3 px-4 font-bold text-slate-900">{m.ledgerNo}</td>
                      <td className="py-3 px-4 font-sans font-bold text-slate-900">{m.name}</td>
                      <td className="py-3 px-4 text-slate-600">{formatMoney(m.monthlyDue)}</td>
                      <td className="py-3 px-4 font-sans whitespace-nowrap">
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
                      <td className="py-3 px-4 font-bold text-emerald-800">{formatMoney(totals.totalPaid)}</td>
                      <td className="py-3 px-4 text-slate-600">{totals.count}</td>
                      <td className="py-3 px-4 text-slate-500">
                        {totals.lastPaymentDate ? fmtDate(totals.lastPaymentDate) : '—'}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap font-sans">
                        <div className="flex items-center justify-end gap-1">
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
                            onClick={() => setSelectedHistoryMember(m)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer"
                          >
                            <History className="w-3.5 h-3.5" />
                            <span>History</span>
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
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Monthly Dues Status Matrix */}
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

      {/* Member History Modal */}
      <MemberHistoryModal
        isOpen={!!selectedHistoryMember}
        onClose={() => setSelectedHistoryMember(null)}
        member={selectedHistoryMember}
        allMembers={members}
        onSelectMember={(m) => setSelectedHistoryMember(m)}
        transactions={transactions}
        organizationName={organizationName}
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
    </div>
  );
};
