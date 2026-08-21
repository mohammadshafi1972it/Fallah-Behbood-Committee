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
  openingBalance?: number; // Manual initial balance as on 31/08/2026: positive = Advance/Credit, negative = Starting Arrears/Due
  previousDue?: number; // Optional manual previous due / arrears as on 31/08/2026
  showNilBalanceWhenPaid?: boolean; // Optional: show balance as Nil when payment received >= due payment
  balanceNotes?: string;
  updatedAt?: string;
}

export interface MemberBalanceItem {
  member: Member;
  ledgerNo: string;
  name: string;
  monthlyDue: number; // e.g. 150/mo, or 300/mo for Haji Gh. Mohammad Mir (Ledger #131)
  annualDue: number; // 12 Months target from 01/09/2026: 12 * 150 = 1800, or 12 * 300 = 3600 for Haji Gh. Mohammad Mir
  phone?: string;
  address?: string;
  openingBalance: number; // Manual starting balance as on 31/08/2026 (+ for advance, - for arrears)
  previousDue: number; // Manual previous due / arrears amount as on 31/08/2026
  baselineAugust2026Balance: number; // Stored balance as on 31/08/2026
  baselineAugust2026Due: number; // Stored arrears due as on 31/08/2026
  accruedDueFromSept2026: number; // Accrued dues from 1st Sep 2026 to date
  totalDue: number; // Total expected due (previousDue + subscription dues)
  totalPaid: number; // Sum of all income payments recorded (automatically updated in real-time)
  subscriptionPaid: number; // Specific to subscription
  otherPaid: number; // Other funds/donations
  receiptsCount: number; // Number of payments made
  lastPaymentDate: string | null;
  effectiveBalance: number; // True mathematical balance: openingBalance + totalPaid
  balanceDue: number; // Outstanding due balance (0 / Nil when paid up and Nil option is active)
  monthsPaid: number; // Number of full months paid from Sep 2026 (e.g. 4.0 or 12.0)
  monthsPaidExact: number; // Exact months paid (totalPaid / monthlyDue)
  paidUptoText: string; // e.g. "Paid Upto: October 2026 (2 Months)" or "Paid Upto: Full Year (Aug 2027 — Nil)"
  paidUptoBadge: string; // e.g. "Oct 2026 (2 Mos)" or "12/12 Mos (Paid Up)"
  paidUptoMonthName: string; // e.g. "September 2026", "October 2026", "November 2026", "Full Session (Aug 2027)"
  remainingMonthsDue: number; // Remaining months due from 12-month session
  remainingAnnualDue: number; // annualDue - netPaid
  pendingDueAmount: number; // Total due pending (0 if paid up or in advance)
  isPaidUp: boolean; // True when payment received is greater than or equal to due payment
  isFullYearPaid: boolean; // True when payment received >= annual target (1800 or 3600 for Haji Gh. Mohammad Mir)
  showNilBalanceWhenPaid: boolean; // Whether the balance displays as Nil when paid up
  status: 'Paid Up (Nil)' | 'Advance' | 'Cleared' | 'Arrears' | 'Active';
  balanceNotes?: string;
}

export interface MonthEndMemberBalanceItem extends MemberBalanceItem {
  asOfMonth: string; // YYYY-MM
  asOfMonthLabel: string; // e.g. "September 2026"
  monthIndex: number; // 1 to 12 in the session (1 = Sep 2026, 2 = Oct 2026, etc.)
  cumulativeDueToDate: number; // Expected due up to this month end (monthIndex * monthlyDue + previousDue as on 31/08/2026)
  cumulativePaidToDate: number; // Total payments made up to the end of this month
  monthEndEffectiveBalance: number; // Balance as of month end: (openingBalance + cumulativePaidToDate - monthIndex * monthlyDue)
  monthEndPendingDue: number; // Outstanding due pending in favor of member as of this month end
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
  baselineOpeningDate?: string; // e.g. "2026-08-31" or custom baseline cutoff date
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

export interface MonthEndIntimationSlip {
  member: Member;
  ledgerNo: string;
  name: string;
  phone: string;
  address: string;
  monthlyRate: number;
  yearMonth: string; // YYYY-MM
  monthLabel: string;
  asOnDate: string; // YYYY-MM-DD
  baselineOpeningBalance: number;
  baselinePaidUptoMonth: string;
  subsequentPaymentsInMonth: number;
  subsequentPaymentsTotal: number;
  totalPaidToDate: number;
  currentPaidUpto: string;
  currentPaidUptoBadge: string;
  isPaidUp: boolean;
  isFullYearPaid: boolean;
  closingBalance: number; // Positive = Advance, Negative = Arrears, 0 = Nil/Cleared
  status: 'Paid Up (Nil)' | 'Advance' | 'Arrears' | 'Cleared' | 'Active';
  whatsappMessageText: string;
}

export interface YearSummaryItem {
  year: string; // e.g. "2019", "2020", "2026", or "2026-27"
  yearLabel: string;
  startDate: string;
  endDate: string;
  openingBalance: number;
  income: number;
  incomeCount: number;
  expenditure: number;
  expenditureCount: number;
  net: number;
  closingBalance: number;
}

export interface MemberYearlySummary {
  year: string;
  yearLabel: string;
  expectedDue: number;
  paid: number;
  outstanding: number;
  receiptsCount: number;
  status: 'Paid' | 'Partial' | 'Due';
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
