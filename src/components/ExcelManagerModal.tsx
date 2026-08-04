import React, { useRef } from 'react';
import { Transaction, Member, AppSettings } from '../types';
import { exportExcelWorkbook, parseUniversalFileImport } from '../lib/ledgerUtils';
import { FileSpreadsheet, Download, Upload, X, HelpCircle, CheckCircle2 } from 'lucide-react';

interface ExcelManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  transactions: Transaction[];
  members: Member[];
  settings: AppSettings;
  onBulkImportTransactions?: (newTxns: Transaction[], newMembers: Member[]) => void;
  showToast: (msg: string) => void;
}

export const ExcelManagerModal: React.FC<ExcelManagerModalProps> = ({
  isOpen,
  onClose,
  transactions,
  members,
  settings,
  onBulkImportTransactions,
  showToast,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleExportFullWorkbook = () => {
    try {
      exportExcelWorkbook(members, transactions, settings, 'Fallah_Behbood_Committee_Ledger_Full.xlsx');
      showToast('Generated multi-sheet Excel Workbook (.xlsx)');
    } catch (err) {
      showToast('Error exporting Excel file.');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const buffer = evt.target?.result as ArrayBuffer;
        if (!buffer) return;

        const result = parseUniversalFileImport(buffer, file.name);

        if (onBulkImportTransactions) {
          onBulkImportTransactions(result.transactions, result.members);
        }

        showToast(
          `Imported ALL data: ${result.transactions.length} entries & ${result.members.length} members from ${result.summary.sheetsParsed.join(', ')}.`
        );
        onClose();
      } catch (err) {
        showToast('Error importing file.');
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-lg w-full p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 border-b border-slate-100 pb-4 mb-4">
          <div className="p-2.5 bg-emerald-50 text-emerald-800 rounded-xl">
            <FileSpreadsheet className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">Excel & File Data Manager</h2>
            <p className="text-xs text-slate-500">Import or export data irrespective of layout, header, or formatting mismatches.</p>
          </div>
        </div>

        <div className="space-y-4">
          {/* Universal Import Section */}
          <div className="bg-emerald-50/60 p-4 rounded-xl border border-emerald-200/80 space-y-2">
            <h3 className="text-xs font-bold text-emerald-950 uppercase tracking-wider flex items-center gap-1.5">
              <Upload className="w-4 h-4 text-emerald-700" />
              <span>Universal Bulk Data Import</span>
            </h3>
            <p className="text-xs text-emerald-900/90">
              Upload any Excel (<strong className="text-emerald-950">.xlsx / .xls</strong>), CSV, or JSON file. All rows, sheets, and transactions will be auto-parsed and imported regardless of column order or header mismatches.
            </p>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept=".xlsx,.xls,.csv,.json"
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full mt-2 py-2.5 px-4 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold rounded-lg transition-colors shadow-xs flex items-center justify-center gap-2 cursor-pointer"
            >
              <Upload className="w-4 h-4" />
              <span>Select File to Import All Data</span>
            </button>
          </div>

          {/* Export Section */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2">
            <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Download className="w-4 h-4 text-emerald-600" />
              <span>Full Multi-Sheet Excel Export</span>
            </h3>
            <p className="text-xs text-slate-600">
              Exports all {transactions.length} ledger transactions, {members.length} member profiles, and monthly balance summaries into a formatted <strong className="text-slate-800">.xlsx</strong> file.
            </p>
            <button
              onClick={handleExportFullWorkbook}
              className="w-full mt-2 py-2.5 px-4 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg transition-colors shadow-xs flex items-center justify-center gap-2 cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Download Excel Workbook (.xlsx)</span>
            </button>
          </div>

          {/* Guidelines */}
          <div className="bg-amber-50/70 p-4 rounded-xl border border-amber-200/70 text-xs text-amber-900 space-y-1.5">
            <h4 className="font-bold flex items-center gap-1.5 text-amber-950">
              <HelpCircle className="w-4 h-4 text-amber-700" />
              <span>Flexible Multi-Format Parser</span>
            </h4>
            <p className="text-[11px] text-amber-900/90 leading-relaxed">
              Handles single & multi-sheet workbooks, bank statements, cash books, custom column headers (e.g. S.No, Date, Particulars, Folio, Credit, Debit), messy date strings, and JSON backups.
            </p>
          </div>
        </div>

        <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
