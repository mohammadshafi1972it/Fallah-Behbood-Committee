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
  openingBalance?: number; // Manual initial balance: positive = Advance/Credit, negative = Starting Arrears/Due
  previousDue?: number; // Optional manual previous due / arrears from earlier periods
  showNilBalanceWhenPaid?: boolean; // Optional: show balance as Nil when payment received >= due payment
  balanceNotes?: string;
  updatedAt?: string;
}

export interface MemberBalanceItem {
  member: Member;
  ledgerNo: string;
  name: string;
  monthlyDue: number; // e.g. 150/mo, or 300/mo for Ledger 131
  annualDue: number; // 12 Months target: 12 * 150 = 1800, or 12 * 300 = 3600 for Ledger 131
  phone?: string;
  address?: string;
  openingBalance: number; // Manual starting balance (+ for advance, - for arrears)
  previousDue: number; // Manual previous due / arrears amount
  totalDue: number; // Total expected due (previousDue + subscription dues)
  totalPaid: number; // Sum of all income payments recorded (automatically updated in real-time)
  subscriptionPaid: number; // Specific to subscription
  otherPaid: number; // Other funds/donations
  receiptsCount: number; // Number of payments made
  lastPaymentDate: string | null;
  effectiveBalance: number; // True mathematical balance: openingBalance + totalPaid
  balanceDue: number; // Outstanding due balance (0 / Nil when paid up and Nil option is active)
  monthsPaid: number; // Number of full months paid (e.g. 4.0 or 12.0)
  monthsPaidExact: number; // Exact months paid (totalPaid / monthlyDue)
  paidUptoText: string; // e.g. "Paid Upto: Full Year (12/12 Months - Nil)" or "Paid Upto: 4 Months (Rs. 600 / 1800)"
  paidUptoBadge: string; // e.g. "12/12 Mos (Paid Up)" or "4/12 Mos"
  paidUptoMonthName?: string; // e.g. "Month 12 (Full Year)" or "Month 4 (Jul)"
  remainingMonthsDue: number; // 12 - monthsPaid (0 when paid up)
  remainingAnnualDue: number; // annualDue - totalPaid (0 when paid up)
  isPaidUp: boolean; // True when payment received is greater than or equal to due payment
  isFullYearPaid: boolean; // True when payment received >= annual target (1800 or 3600 for #131)
  showNilBalanceWhenPaid: boolean; // Whether the balance displays as Nil when paid up
  status: 'Paid Up (Nil)' | 'Advance' | 'Cleared' | 'Arrears' | 'Active';
  balanceNotes?: string;
}

export interface MonthEndMemberBalanceItem extends MemberBalanceItem {
  asOfMonth: string; // YYYY-MM
  asOfMonthLabel: string; // e.g. "June 2026"
  monthIndex: number; // 1 to 12 in the session
  cumulativeDueToDate: number; // Expected due up to this month end (monthIndex * monthlyDue + previousDue)
  cumulativePaidToDate: number; // Total payments made up to the end of this month
  monthEndEffectiveBalance: number; // Balance as of month end: (cumulativePaidToDate - cumulativeDueToDate)
  monthEndStatus: 'Paid Up (Nil)' | 'Advance' | 'Arrears' | 'Cleared' | 'Active';
  monthEndPaidUptoText: string;
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
  defaultShowNilBalanceWhenPaid?: boolean;
  memberBalanceOverrides?: Record<
    string,
    {
      openingBalance?: number;
      previousDue?: number;
      showNilBalanceWhenPaid?: boolean;
      notes?: string;
    }
  >;
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
