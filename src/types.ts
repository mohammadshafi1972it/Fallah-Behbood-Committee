export type TransactionType = 'Income' | 'Expenditure';

export interface Transaction {
  id: string;
  type: TransactionType;
  date: string; // YYYY-MM-DD
  amount: number;
  head: string;
  ledgerNo: string;
  memberName: string;
  forMonth: string; // YYYY-MM
  receiptVoucherNo: string;
  paidTo: string;
  mode: string;
  remarks: string;
  createdAt: string;
  updatedAt?: string;
  importRef?: string;
}

export interface Member {
  ledgerNo: string;
  name: string;
  monthlyDue: number;
  phone?: string;
  address?: string;
}

export interface MonthBalanceConfig {
  mode: 'auto' | 'manual';
  manualBalance?: number;
  cashInHand?: number;
  bankBalance?: number;
  notes?: string;
  verifiedBy?: string;
  updatedAt?: string;
}

export type MonthBalanceOverrides = Record<string, MonthBalanceConfig>;

export interface MonthBalanceTableRow {
  month: string; // YYYY-MM
  monthLabel: string;
  openingBalance: number;
  income: number;
  incomeCount: number;
  expenditure: number;
  expenditureCount: number;
  net: number;
  autoBalance: number;
  effectiveBalance: number;
  mode: 'auto' | 'manual';
  cashInHand?: number;
  bankBalance?: number;
  variance: number;
  isReconciled: boolean;
  notes?: string;
  verifiedBy?: string;
  updatedAt?: string;
}

export interface AppSettings {
  openingBalance: number;
  organizationName: string;
  subTitle: string;
  sessionTag: string;
  standardMonthlyDue: number;
  autoSyncGoogleDrive: boolean;
  linkedGoogleSheetId?: string;
  linkedGoogleSheetName?: string;
  lastSyncedAt?: string;
  monthBalances?: MonthBalanceOverrides;
}

export interface StorageStatus {
  mode: 'cloud_drive' | 'file' | 'localStorage' | 'none';
  connectedFileName?: string;
  isGoogleConnected: boolean;
  googleUserEmail?: string;
  lastSyncedAt?: string;
  syncing?: boolean;
}

export interface MonthlySummaryItem {
  month: string; // YYYY-MM
  income: number;
  expenditure: number;
  net: number;
  balance: number;
}

export interface DailySummaryItem {
  date: string; // YYYY-MM-DD
  income: number;
  expenditure: number;
  net: number;
}

export interface MemberTotals {
  totalPaid: number;
  count: number;
  lastPaymentDate: string;
}

export interface ContributionItem {
  ledgerNo: string;
  name: string;
  expected: number;
  paid: number;
  status: 'Paid' | 'Partial' | 'Due';
}

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  webViewLink?: string;
}
