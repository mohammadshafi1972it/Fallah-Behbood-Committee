import React, { useState, useMemo } from 'react';
import { Transaction, Member, TransactionType } from '../types';
import { 
  INCOME_HEADS, 
  EXPENDITURE_HEADS, 
  todayISO, 
  fmtDate, 
  formatMoney, 
  num, 
  uid, 
  normalizeName, 
  parseExcelDate, 
  parseUniversalFileImport, 
  findMember,
  getAvailableYears,
  BASE_START_YEAR
} from '../lib/ledgerUtils';
import * as XLSX from 'xlsx';
import { PlusCircle, Search, Filter, Download, FileSpreadsheet, Upload, Edit, Trash2, CheckCircle2, AlertCircle, X, Calendar } from 'lucide-react';

interface LedgerTabProps {
  transactions: Transaction[];
  members: Member[];
  onSaveTransaction: (txn: Transaction) => void;
  onDeleteTransaction: (id: string) => void;
  onBulkImportTransactions: (newTxns: Transaction[], newMembers: Member[]) => void;
  showToast: (msg: string) => void;
}

export const LedgerTab: React.FC<LedgerTabProps> = ({
  transactions,
  members,
  onSaveTransaction,
  onDeleteTransaction,
  onBulkImportTransactions,
  showToast,
}) => {
  const [txnType, setTxnType] = useState<TransactionType>('Income');
  const [date, setDate] = useState<string>(todayISO());
  const [amount, setAmount] = useState<string>('');
  const [head, setHead] = useState<string>(INCOME_HEADS[0]);
  const [ledgerNo, setLedgerNo] = useState<string>('');
  const [memberName, setMemberName] = useState<string>('');
  const [forMonth, setForMonth] = useState<string>(todayISO().slice(0, 7));
  const [paidTo, setPaidTo] = useState<string>('');
  const [receiptNo, setReceiptNo] = useState<string>('');
  const [mode, setMode] = useState<string>('Cash');
  const [remarks, setRemarks] = useState<string>('');
  const [editingId, setEditingId] = useState<string | null>(null);

  // Available Years starting from 2019
  const availableYears = useMemo(() => getAvailableYears(transactions, BASE_START_YEAR), [transactions]);

  // Filters
  const [selectedLedgerYear, setSelectedLedgerYear] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('');
  const [filterFrom, setFilterFrom] = useState<string>('');
  const [filterTo, setFilterTo] = useState<string>('');

  // Sorting
  const [sortKey, setSortKey] = useState<keyof Transaction>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Member Match
  const matchedMember = useMemo(() => {
    if (!ledgerNo.trim() && !memberName.trim()) return null;
    return findMember(members, ledgerNo) || findMember(members, memberName);
  }, [ledgerNo, memberName, members]);

  const handleTypeChange = (newType: TransactionType) => {
    setTxnType(newType);
    setHead(newType === 'Income' ? INCOME_HEADS[0] : EXPENDITURE_HEADS[0]);
  };

  const handleLedgerNoChange = (val: string) => {
    setLedgerNo(val);
    if (!val.trim()) return;
    const m = findMember(members, val);
    if (m) {
      setMemberName(m.name);
      if (!amount && m.monthlyDue) {
        setAmount(String(m.monthlyDue));
      }
    }
  };

  const handleMemberNameChange = (val: string) => {
    setMemberName(val);
    if (!val.trim()) return;
    const m = findMember(members, val);
    if (m) {
      setLedgerNo(m.ledgerNo);
      if (!amount && m.monthlyDue) {
        setAmount(String(m.monthlyDue));
      }
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setTxnType('Income');
    setDate(todayISO());
    setAmount('');
    setHead(INCOME_HEADS[0]);
    setLedgerNo('');
    setMemberName('');
    setForMonth(todayISO().slice(0, 7));
    setPaidTo('');
    setReceiptNo('');
    setMode('Cash');
    setRemarks('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = num(amount);

    if (!date) {
      showToast('Please select a valid date.');
      return;
    }
    if (!parsedAmount || parsedAmount <= 0) {
      showToast('Please enter a valid positive amount.');
      return;
    }
    if (txnType === 'Income' && !memberName.trim()) {
      showToast('Please enter a member name or ledger number.');
      return;
    }
    if (txnType === 'Expenditure' && !paidTo.trim()) {
      showToast('Please enter who the payment was made to.');
      return;
    }

    const record: Transaction = {
      id: editingId || uid(),
      type: txnType,
      date,
      amount: parsedAmount,
      head,
      ledgerNo: txnType === 'Income' ? ledgerNo.trim() : '',
      memberName: txnType === 'Income' ? memberName.trim() : '',
      forMonth: txnType === 'Income' ? forMonth : '',
      paidTo: txnType === 'Expenditure' ? paidTo.trim() : '',
      receiptVoucherNo: receiptNo.trim(),
      mode,
      remarks: remarks.trim(),
      createdAt: editingId
        ? transactions.find((t) => t.id === editingId)?.createdAt || new Date().toISOString()
        : new Date().toISOString(),
      updatedAt: editingId ? new Date().toISOString() : undefined,
    };

    onSaveTransaction(record);
    showToast(editingId ? 'Transaction updated successfully.' : 'Transaction recorded.');
    resetForm();
  };

  const handleEdit = (t: Transaction) => {
    setEditingId(t.id);
    setTxnType(t.type);
    setDate(t.date);
    setAmount(String(t.amount));
    setHead(t.head);
    setReceiptNo(t.receiptVoucherNo || '');
    setMode(t.mode || 'Cash');
    setRemarks(t.remarks || '');

    if (t.type === 'Income') {
      setLedgerNo(t.ledgerNo || '');
      setMemberName(t.memberName || '');
      setForMonth(t.forMonth || '');
      setPaidTo('');
    } else {
      setPaidTo(t.paidTo || '');
      setLedgerNo('');
      setMemberName('');
      setForMonth('');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Universal File Import parser (Excel / CSV / JSON)
  const handleCashBookImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const buffer = evt.target?.result as ArrayBuffer;
        if (!buffer) return;

        const result = parseUniversalFileImport(buffer, file.name);

        onBulkImportTransactions(result.transactions, result.members);

        showToast(
          `Imported ALL data successfully: ${result.transactions.length} entries & ${result.members.length} members from ${result.summary.sheetsParsed.join(', ')}`
        );
      } catch (err) {
        showToast('Error parsing file.');
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  // Filtered & Sorted Transactions
  const filteredTxns = useMemo(() => {
    return transactions
      .filter((t) => {
        if (selectedLedgerYear !== 'All' && (!t.date || !t.date.startsWith(selectedLedgerYear))) return false;
        if (filterType && t.type !== filterType) return false;
        if (filterFrom && t.date < filterFrom) return false;
        if (filterTo && t.date > filterTo) return false;
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          const hay = [t.memberName, t.ledgerNo, t.paidTo, t.receiptVoucherNo, t.remarks, t.head]
            .join(' ')
            .toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const dir = sortDir === 'asc' ? 1 : -1;
        let va: any = a[sortKey];
        let vb: any = b[sortKey];
        if (sortKey === 'amount') return (num(va) - num(vb)) * dir;
        va = String(va || '').toLowerCase();
        vb = String(vb || '').toLowerCase();
        return va.localeCompare(vb) * dir;
      });
  }, [transactions, selectedLedgerYear, filterType, filterFrom, filterTo, searchQuery, sortKey, sortDir]);

  const handleSort = (key: keyof Transaction) => {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  return (
    <div className="space-y-6">
      {/* Cashbook Excel Import Section */}
      <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
        <div>
          <h3 className="text-xs font-bold text-amber-900 flex items-center gap-1.5 uppercase tracking-wider">
            <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
            Bulk Import Cash Book (Excel)
          </h3>
          <p className="text-xs text-amber-800 mt-0.5">
            Import entries directly from Excel worksheets (Data Entry, Expenses & Members Ledger). Duplicates are automatically skipped.
          </p>
        </div>
        <label className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-emerald-800 bg-white border border-emerald-300 rounded-lg hover:bg-emerald-50 cursor-pointer shadow-xs transition-colors shrink-0">
          <Upload className="w-4 h-4 text-emerald-600" />
          <span>Select Excel Cashbook (.xlsx)</span>
          <input type="file" accept=".xlsx,.xls" onChange={handleCashBookImport} className="hidden" />
        </label>
      </div>

      {/* Entry Form */}
      <form onSubmit={handleSubmit} className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-sm font-serif font-bold text-slate-800 flex items-center gap-2">
            <PlusCircle className="w-4 h-4 text-emerald-600" />
            <span>{editingId ? 'Edit Entry' : 'New Ledger Entry'}</span>
          </h3>

          {/* Income / Expenditure Radio Switch */}
          <div className="inline-flex p-1 bg-slate-100 rounded-lg text-xs font-semibold">
            <button
              type="button"
              onClick={() => handleTypeChange('Income')}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                txnType === 'Income' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Income (+)
            </button>
            <button
              type="button"
              onClick={() => handleTypeChange('Expenditure')}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                txnType === 'Expenditure' ? 'bg-rose-600 text-white shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Expenditure (-)
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Date <span className="text-rose-500">*</span>
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full text-xs font-mono px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-800 bg-slate-50/50"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Amount (Rs.) <span className="text-rose-500">*</span>
            </label>
            <input
              type="number"
              step="any"
              placeholder="e.g. 300"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full text-xs font-mono px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-800 bg-slate-50/50"
              required
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Fund / Head</label>
            <select
              value={head}
              onChange={(e) => setHead(e.target.value)}
              className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-800 bg-slate-50/50 font-medium"
            >
              {(txnType === 'Income' ? INCOME_HEADS : EXPENDITURE_HEADS).map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Dynamic Fields for Income vs Expenditure */}
        {txnType === 'Income' ? (
          <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-100 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Ledger No. (Member)</label>
                <input
                  type="text"
                  placeholder="e.g. 41"
                  value={ledgerNo}
                  onChange={(e) => handleLedgerNoChange(e.target.value)}
                  list="ledger-no-list"
                  className="w-full text-xs font-mono px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-800 bg-white"
                />
                <datalist id="ledger-no-list">
                  {members.map((m) => (
                    <option key={m.ledgerNo} value={m.ledgerNo}>
                      {m.ledgerNo} — {m.name}
                    </option>
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Member Name</label>
                <input
                  type="text"
                  placeholder="e.g. Mohammad Shafi"
                  value={memberName}
                  onChange={(e) => handleMemberNameChange(e.target.value)}
                  list="member-name-list"
                  className="w-full text-xs font-medium px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-800 bg-white"
                />
                <datalist id="member-name-list">
                  {members.map((m) => (
                    <option key={m.ledgerNo} value={m.name}>
                      {m.name} (Ledger #{m.ledgerNo})
                    </option>
                  ))}
                </datalist>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">For Month</label>
                <input
                  type="month"
                  value={forMonth}
                  onChange={(e) => setForMonth(e.target.value)}
                  className="w-full text-xs font-mono px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-800 bg-white"
                />
              </div>
            </div>

            {matchedMember ? (
              <div className="flex flex-wrap items-center justify-between gap-2 bg-emerald-50/90 border border-emerald-200 rounded-lg p-2.5 text-xs text-emerald-950 font-medium">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    <strong>Autofetched Member:</strong> {matchedMember.name} (Ledger #{matchedMember.ledgerNo})
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2 py-0.5 rounded-md">
                    Monthly Subscription: {formatMoney(matchedMember.monthlyDue)}
                  </span>
                  {!amount && (
                    <button
                      type="button"
                      onClick={() => setAmount(String(matchedMember.monthlyDue))}
                      className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 underline cursor-pointer"
                    >
                      Fill Rs. {matchedMember.monthlyDue}
                    </button>
                  )}
                </div>
              </div>
            ) : ledgerNo ? (
              <p className="text-[11px] text-amber-700 flex items-center gap-1 font-medium">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                No existing member matched with ledger no. #{ledgerNo}. Type member name manually.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-100">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Paid To / Recipient</label>
              <input
                type="text"
                placeholder="e.g. Imam Sahib / PDD Electric Bill"
                value={paidTo}
                onChange={(e) => setPaidTo(e.target.value)}
                className="w-full text-xs font-medium px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-800 bg-white"
              />
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Receipt / Voucher No.</label>
            <input
              type="text"
              placeholder="e.g. REC-1024"
              value={receiptNo}
              onChange={(e) => setReceiptNo(e.target.value)}
              className="w-full text-xs font-mono px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-800 bg-slate-50/50"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Payment Mode</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-800 bg-slate-50/50 font-medium"
            >
              <option value="Cash">Cash</option>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="Online/UPI">Online/UPI</option>
              <option value="Cheque">Cheque</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Remarks / Details</label>
            <input
              type="text"
              placeholder="Additional comments..."
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-slate-800 bg-slate-50/50"
            />
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg transition-colors shadow-xs cursor-pointer"
          >
            {editingId ? 'Update Entry' : 'Save Entry'}
          </button>
          <button
            type="button"
            onClick={resetForm}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
          >
            Clear
          </button>
        </div>
      </form>

      {/* Toolbar & Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search by name, ledger no, receipt, head, remarks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-slate-800 bg-slate-50/50"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
              <Calendar className="w-3.5 h-3.5 text-emerald-700" />
              <select
                value={selectedLedgerYear}
                onChange={(e) => setSelectedLedgerYear(e.target.value)}
                className="text-xs bg-transparent font-bold text-slate-800 outline-none cursor-pointer"
              >
                <option value="All">All Years (2019+)</option>
                {availableYears.map((y) => (
                  <option key={y} value={y}>
                    Year {y}
                  </option>
                ))}
              </select>
            </div>

            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="text-xs px-3 py-2 border border-slate-200 rounded-lg bg-slate-50/50 font-medium"
            >
              <option value="">All Types</option>
              <option value="Income">Income Only</option>
              <option value="Expenditure">Expenditure Only</option>
            </select>

            <input
              type="date"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
              className="text-xs font-mono px-3 py-2 border border-slate-200 rounded-lg bg-slate-50/50"
              title="From Date"
            />
            <span className="text-slate-400 text-xs">to</span>
            <input
              type="date"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
              className="text-xs font-mono px-3 py-2 border border-slate-200 rounded-lg bg-slate-50/50"
              title="To Date"
            />

            {(selectedLedgerYear !== 'All' || filterType || filterFrom || filterTo || searchQuery) && (
              <button
                onClick={() => {
                  setSelectedLedgerYear('All');
                  setFilterType('');
                  setFilterFrom('');
                  setFilterTo('');
                  setSearchQuery('');
                }}
                className="p-2 text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100 cursor-pointer"
                title="Clear Filters"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
          <span>
            Showing <strong className="text-slate-800">{filteredTxns.length}</strong> of{' '}
            <strong className="text-slate-800">{transactions.length}</strong> entries
          </span>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-800 text-white font-serif uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4 cursor-pointer hover:bg-slate-700" onClick={() => handleSort('date')}>
                  Date
                </th>
                <th className="py-3 px-4 cursor-pointer hover:bg-slate-700" onClick={() => handleSort('type')}>
                  Type
                </th>
                <th className="py-3 px-4 cursor-pointer hover:bg-slate-700" onClick={() => handleSort('ledgerNo')}>
                  Ledger No
                </th>
                <th className="py-3 px-4 cursor-pointer hover:bg-slate-700" onClick={() => handleSort('memberName')}>
                  Name / Paid To
                </th>
                <th className="py-3 px-4 cursor-pointer hover:bg-slate-700" onClick={() => handleSort('head')}>
                  Head
                </th>
                <th className="py-3 px-4 cursor-pointer hover:bg-slate-700" onClick={() => handleSort('amount')}>
                  Amount
                </th>
                <th className="py-3 px-4">Receipt / Voucher</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {filteredTxns.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400 font-sans">
                    No transactions found. Record a new entry or adjust your search filters.
                  </td>
                </tr>
              ) : (
                filteredTxns.map((t) => (
                  <tr key={t.id} className="hover:bg-amber-50/30 transition-colors">
                    <td className="py-3 px-4 whitespace-nowrap">{fmtDate(t.date)}</td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-sans font-bold uppercase tracking-wider ${
                          t.type === 'Income'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {t.type}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-800">{t.ledgerNo || '—'}</td>
                    <td className="py-3 px-4 font-sans font-semibold text-slate-900">
                      {t.type === 'Income' ? t.memberName : t.paidTo}
                      {t.forMonth && (
                        <span className="block text-[10px] font-mono font-normal text-slate-400">
                          For: {t.forMonth}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 font-sans text-slate-600">{t.head}</td>
                    <td className="py-3 px-4 font-bold text-slate-900">{formatMoney(t.amount)}</td>
                    <td className="py-3 px-4 text-slate-500">{t.receiptVoucherNo || '—'}</td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleEdit(t)}
                          className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
                          title="Edit transaction"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onDeleteTransaction(t.id)}
                          className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-md transition-colors"
                          title="Delete transaction"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
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
