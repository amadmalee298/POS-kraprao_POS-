export type MenuCategory = string;

export interface CategoryItem {
  id: string;
  name: string;
  icon?: string;
}

export type SpiceLevel = 'ไม่เผ็ด' | 'เผ็ดน้อย' | 'เผ็ดปานกลาง' | 'เผ็ดมาก' | 'เผ็ดหูดับ';

/** Protein name offered on a dish, e.g. 'หมูสับ', 'หมูกรอบ' (shops define their own). */
export type ProteinChoice = string;

/** A protein choice on a menu item, with what it does to the recipe. */
export interface ProteinOption {
  name: ProteinChoice;
  extraPrice: number;
  /** Ingredients this protein adds per dish */
  recipe?: RecipeIngredient[];
  /** Base recipe ingredients it replaces (e.g. minced pork when crispy pork is chosen) */
  replacesIngredientIds?: string[];
  /** Cost difference against the base recipe; kept up to date when recipes or prices change */
  costDelta?: number;
}

export interface AddOnOption {
  id: string;
  name: string;
  price: number;
  ingredientId?: string;
  ingredientAmount?: number;
  recipe?: RecipeIngredient[];
}

export interface RecipeIngredient {
  ingredientId: string;
  amountNeeded: number; // in unit specified in Ingredient or recipeUnit
  recipeUnit?: string; // e.g. 'g', 'kg', 'ml', 'l', 'pcs'
}

export interface MenuItem {
  id: string;
  name: string;
  nameEn: string;
  category: MenuCategory;
  price: number;
  costPrice: number;
  description: string;
  image: string;
  isPopular?: boolean;
  isFrequent?: boolean; // รายการใช้บ่อย (หมุดปักให้อยู่ด้านบน)
  recipe: RecipeIngredient[];
  availableSpiceLevels?: SpiceLevel[];
  availableProteins?: ProteinOption[];
  /** Taken off sale by staff (sold out today) */
  isSoldOut?: boolean;
  allowAddOns?: boolean; // When true or undefined, toppings can be selected for this item; if false, toppings are disabled
  allowedAddOnIds?: string[]; // Optional specific list of enabled topping IDs for this menu item
}

export interface CartItem {
  cartItemId: string;
  menuItem: MenuItem;
  quantity: number;
  spiceLevel?: SpiceLevel;
  proteinChoice?: { name: ProteinChoice; extraPrice: number };
  selectedAddOns: AddOnOption[];
  specialNotes?: string;
  unitPrice: number;
  totalPrice: number;
}

export type PaymentMethod = 'cash' | 'promptpay' | 'transfer' | 'credit' | 'truemoney';

export type OrderStatus = 'pending-qr' | 'pending' | 'cooking' | 'ready' | 'served' | 'cancelled';

export type OrderType = 'dine-in' | 'takeaway' | 'delivery';

export interface CustomerTaxInfo {
  taxId: string;
  companyName: string;
  address: string;
  branchCode: string; // e.g. '00000' (สำนักงานใหญ่) or '00001'
  email?: string;
  phone?: string;
}

export interface CancelledInfo {
  userId?: string;
  userName: string;
  role: string;
  cancelledAt: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  branchId: string;
  orderType: OrderType;
  tableNumber?: string;
  items: CartItem[];
  subtotal: number;
  discountAmount: number;
  discountType?: 'fixed' | 'percent';
  discountNote?: string;
  vatAmount: number;
  grandTotal: number;
  paymentMethod: PaymentMethod;
  tenderedAmount: number;
  changeAmount: number;
  status: OrderStatus;
  createdAt: string; // ISO string
  updatedAt: string;
  completedAt?: string;
  customerTaxInfo?: CustomerTaxInfo;
  isFullTaxInvoiceRequested?: boolean;
  isOfflineOrder?: boolean;
  isSynced?: boolean;
  syncedAt?: string;
  checksum?: string;
  cancelledBy?: CancelledInfo;
  cancelReason?: string;
  cancelNote?: string;
  /**
   * Cancelled after its ingredients left the stock and they were not put back (the food was
   * made). The stock card still counts its usage. Missing on older cancelled bills = not counted.
   */
  cancelStockUsed?: boolean;
  /** When the ingredients of this cancelled bill went back to stock (shown as "คืนเข้า" on the stock card) */
  stockReturnedAt?: string;
  isQrOrder?: boolean;
  /** 'unpaid' for orders placed before payment (customer QR orders). Missing = paid. */
  paymentStatus?: 'paid' | 'unpaid';
  paidAt?: string;
  /** Coupon code used on this bill */
  couponCode?: string;
  /** CRM member the bill was credited to */
  memberId?: string;
  memberName?: string;
  /** Running number of the full tax invoice issued for this sale (e.g. INV202609-0003) */
  taxInvoiceNo?: string;
  /** Withholding tax the customer deducted when paying (บาท) */
  withholdingTax?: number;
  /** When staff accepted a customer's QR order into the kitchen (the kitchen timer starts here). */
  acceptedAt?: string;
  orderSource?: 'pos' | 'qr';
}

export function isQrOrderCheck(order: Order): boolean {
  if (order.isQrOrder === true || order.orderSource === 'qr') return true;
  if (order.discountNote?.includes('QR') || order.discountNote?.includes('ลูกค้า') || order.discountNote?.includes('สแกน') || order.discountNote?.includes('คิวอาร์')) return true;
  return false;
}

export interface IngredientCategory {
  id: string;
  name: string;
  icon?: string;
}

export interface IngredientUnitItem {
  id: string;
  name: string; // เช่น 'กิโลกรัม', 'กรัม', 'ขวด'
  symbol: string; // เช่น 'kg', 'g', 'bottle'
  label: string; // เช่น 'กิโลกรัม (kg)'
  isDefault?: boolean;
}

export interface Ingredient {
  id: string;
  name: string;
  unit: 'g' | 'kg' | 'ml' | 'l' | 'pcs' | 'pack' | string;
  currentStock: number;
  minStockAlert: number;
  unitCost: number; // cost per unit
  category: string;
  barcode?: string;
  packageUnit?: string; // เช่น 'ขวด', 'ลัง', 'ถุง', 'แพ็ค', 'กล่อง', 'กระป๋อง'
  packageSize?: number; // เช่น 680 (1 packageUnit = 680 ของหน่วย unit หลัก เช่น 1 ขวด = 680 ml)
  /**
   * Counting by the piece for something bought by weight or volume (or the other way round):
   * 1 countBase ≈ countPerBase countUnit, e.g. 1 kg of shrimp ≈ 40 ตัว. Recipes, stock issues
   * and bills may then use either unit and are converted into the stock unit.
   */
  countUnit?: string;
  countPerBase?: number;
  countBase?: 'kg' | 'l';
  isFrequent?: boolean; // รายการใช้บ่อย (หมุดปักให้อยู่ด้านบน)
  /**
   * What kind of stock this is (accounting): food and packaging sold with it are inventory
   * (IAS 2), cleaning and kitchen consumables are supplies (expensed when bought), kitchen tools and
   * machines are equipment (IAS 16). Missing = decided from the category.
   */
  stockType?: StockType;
}

export type StockType = 'inventory' | 'supplies' | 'equipment';

export interface SmartAuditItem {
  ingredientId: string;
  ingredientName: string;
  unit: string;
  unitCost: number;
  digitalStock: number;
  physicalStock: number;
  variance: number; // physicalStock - digitalStock
  varianceCost: number; // variance * unitCost
  barcodeScanned?: string;
  scannedAt: string;
  notes?: string;
  status: 'matched' | 'discrepancy' | 'overstock';
}

export interface StockLot {
  id: string;
  ingredientId: string;
  lotNumber: string;
  quantity: number;
  unitCost: number;
  receivedDate: string; // ISO date
  expiryDate: string; // ISO date
  supplier: string;
  notes?: string;
  packageQty?: number;
  packageUnit?: string;
  packageSize?: number;
}

export type WasteReason = 'expired' | 'spoiled' | 'damaged' | 'overcooked' | 'trimming' | 'other';

export type StockAdjustmentReason =
  | 'waste'
  | 'spoilage'
  | 'restock'
  | 'expired'
  | 'damaged'
  | 'audit_correction'
  | 'manual_adjustment'
  | 'cooking_prep'
  | 'prep_output'
  | 'issue'
  | 'other';

export interface StockAdjustmentLog {
  id: string;
  ingredientId: string;
  ingredientName: string;
  previousStock: number;
  newStock: number;
  changeQty: number; // Positive for restock/add, negative for deduction/waste
  unit: string;
  reason: StockAdjustmentReason | string;
  notes?: string;
  userName: string;
  userRole?: string;
  timestamp: string; // ISO date string
}

export interface WasteLog {
  id: string;
  ingredientId: string;
  ingredientName: string;
  quantity: number;
  unit: string;
  unitCost: number;
  totalCostLoss: number;
  reason: WasteReason;
  loggedDate: string; // YYYY-MM-DD
  notes?: string;
  reportedBy?: string;
}

export type ExpenseCategory = 'rent' | 'salary' | 'utilities' | 'raw_material' | 'supplies' | 'equipment' | 'marketing' | 'other';

export type IncomeCategory = 'catering' | 'ad_sponsor' | 'recycling' | 'interest' | 'rental' | 'asset_sale' | 'subsidy' | 'delivery_subsidy' | 'other';

export interface OtherIncome {
  id: string;
  branchId: string;
  date: string; // ISO Date YYYY-MM-DD
  category: IncomeCategory;
  title: string;
  amount: number;
  paymentMethod?: 'cash' | 'bank_transfer' | 'promptpay' | 'credit_card' | 'other';
  refNumber?: string;
  payerName?: string;
  note?: string;
  slipImage?: string;
  slipImageName?: string;
  createdAt?: string;
}

export interface Expense {
  id: string;
  branchId: string;
  date: string; // ISO Date YYYY-MM-DD
  category: ExpenseCategory;
  title: string;
  amount: number; // Include VAT if applicable or base
  includeVat: boolean;
  vatAmount: number;
  netAmount: number;
  refNumber?: string;
  note?: string;
  receiptImage?: string; // Base64 data URL or URL of receipt / slip / transfer proof
  receiptImageName?: string;
  /**
   * No receipt from the seller (market stalls, street vendors): the shop issues its own
   * ใบรับรองแทนใบเสร็จรับเงิน, signed by the person who paid and the approver.
   */
  substituteReceipt?: {
    docNo: string;
    spender: string;
    approver?: string;
    payee?: string;
    /** Signatures drawn in the app (small PNG data URLs) */
    spenderSignature?: string;
    approverSignature?: string;
    approvedAt?: string;
  };
  /** Photos showing what was bought (the goods, the stall's price board...), besides the payment proof */
  purchaseImages?: { name: string; dataUrl: string }[];
  /** Copies of this expense's documents saved in the shop's Google Drive */
  driveFiles?: { name: string; url: string; savedAt: string }[];
  /** How it was paid (for the books): bank transfer/QR/card, cash outside the drawer, or the drawer. Missing = bank */
  paidFrom?: 'bank' | 'cash' | 'drawer';
}

export interface PaymentRecord {
  id: string;
  date: string; // YYYY-MM-DD
  amount: number;
  paymentMethod: 'promptpay' | 'cash' | 'bank_transfer' | 'credit_card';
  note?: string;
}

export interface AccountsReceivableItem {
  id: string;
  branchId: string;
  customerName: string;
  taxIdOrPhone?: string;
  invoiceNumber: string;
  issueDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  originalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  status: 'unpaid' | 'partial' | 'paid' | 'overdue';
  description: string;
  note?: string;
  payments: PaymentRecord[];
}

export interface AccountsPayableItem {
  id: string;
  branchId: string;
  supplierName: string;
  taxIdOrPhone?: string;
  billNumber: string;
  issueDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
  originalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  status: 'unpaid' | 'partial' | 'paid' | 'overdue';
  category?: string;
  description: string;
  note?: string;
  payments: PaymentRecord[];
}

export interface CashFlowEntry {
  id: string;
  branchId: string;
  date: string; // YYYY-MM-DD
  activityType: 'investing' | 'financing';
  flowType: 'inflow' | 'outflow';
  title: string;
  amount: number;
  category: string;
  note?: string;
}

export interface Branch {
  id: string;
  name: string;
  nameEn: string;
  address: string;
  phone: string;
  taxId: string;
  promptpayMobileOrTaxId: string;
  isMainBranch?: boolean;
}

export type UserRole = 'admin' | 'manager' | 'cashier' | 'staff' | 'kitchen';

export type ActiveTab =
  | 'dashboard'
  | 'pos'
  | 'qr'
  | 'kds'
  | 'inventory'
  | 'recipes'
  | 'po'
  | 'accounting'
  | 'quotation'
  | 'tax_receipt'
  | 'order_history'
  | 'crm'
  | 'line_notify'
  | 'analytics'
  | 'settings';

export interface User {
  id: string;
  name: string;
  role: UserRole;
  pin: string;
  branchId?: string; // empty means all branches
  avatarColor: string;
  permissions?: StaffPermissions;
}

export interface MerchantConnectionSettings {
  /** Bills paid by PromptPay use a gateway QR (exact amount, confirmed by the gateway) */
  isConnected: boolean;
  provider: 'opn' | 'bbl_merchant_pro' | 'promptpay_dynamic' | 'scb_merchant' | 'kbank_merchant' | 'delivery_merchant';
  /** Site that runs api/payment/promptpay (the shop's Vercel deploy); empty = this site */
  serverUrl?: string;
  /** Close the bill by itself once the gateway reports the payment */
  autoConfirmPayment: boolean;
  /** Last successful connection test */
  lastConnectedAt?: string;
  livemode?: boolean;
  accountEmail?: string;
  // Earlier fields, kept so old saved settings still load
  merchantName?: string;
  merchantId?: string;
  terminalId?: string;
  apiKey?: string;
}

export interface QrPaymentOption {
  id: string;
  name: string;
  type: 'promptpay' | 'truemoney' | 'linepay' | 'cash' | 'credit' | 'custom';
  enabled: boolean;
  accountNumber?: string;
  accountName?: string;
  instructions?: string;
  iconName?: string;
}

export interface SheetsScriptSettings {
  url: string; // the web app URL of the deployed script (…/exec)
  secret: string; // written into the script; requests without it are refused
  /** Save expense documents (receipts, ใบรับรองแทนใบเสร็จ) into Google Drive through the script */
  saveDocsToDrive?: boolean;
}

export interface SystemSettings {
  autoBackupFreq: 'daily' | 'weekly' | 'off';
  lastBackupDate?: string;
  vatRate: number; // default 7
  vatType?: 'inclusive' | 'exclusive' | 'none'; // tax calculation method
  enableVat?: boolean; // toggle automatic tax calculations
  autoSyncEnabled?: boolean; // toggle automatic background sync for offline transactions
  syncIntervalSeconds?: number; // frequency of background sync interval in seconds
  realtimeCloudSync?: boolean; // toggle instant real-time sync to Firebase Firestore for all modifications and deletions
  cloudPurgeDeletions?: boolean; // automatically purge/delete obsolete and removed items from Firestore so cloud never has stale data
  promptpayMobileOrTaxId: string;
  shopName: string;
  shopLogoUrl?: string;
  shopTaxId: string;
  shopAddress: string;
  shopPhone: string;
  enableKitchenSound: boolean;
  kdsWarningMinutes: number; // yellow after X mins, red after 2X mins
  kdsOrderSourceFilter?: 'all' | 'qr_only'; // filter orders shown in kitchen (all vs qr_only)
  promptPayId?: string;
  taxId?: string;
  receiptHeader?: string;
  receiptFooter?: string;
  adminPin?: string;
  managerPin?: string;
  qrPaymentMethods?: QrPaymentOption[];
  receiptPaperWidth?: '80mm' | '58mm';
  receiptFontSize?: 'sm' | 'md' | 'lg';
  receiptShowLogo?: boolean;
  receiptShowTaxId?: boolean;
  receiptShowItemDetails?: boolean;
  receiptUseMonospace?: boolean;
  receiptFooterNote?: string;
  merchantSettings?: MerchantConnectionSettings;
  /** Google Sheets through an Apps Script in the shop's spreadsheet: no Google sign-in on the devices */
  sheetsScript?: SheetsScriptSettings;
  payroll?: PayrollSettings;
  attendance?: AttendanceSettings;
  /** Years over which equipment bought is depreciated (straight line); default 5 */
  equipmentUsefulLifeYears?: number;
  requirePinOnEveryLogin?: boolean; // บังคับใส่รหัสพนักงานทุกครั้งที่เข้าสู่ระบบ
  autoLockAfterPayment?: boolean; // ล็อคหน้าจออัตโนมัติเมื่อปิดบิลการขาย
  autoLockMinutes?: number; // ล็อคหน้าจออัตโนมัติเมื่อไม่มีการใช้งาน (0 = ปิด)
}

export interface StaffPermissions {
  canAccessPOS?: boolean;
  canAccessKDS?: boolean;
  canAccessInventory?: boolean;
  canAccessAccounting?: boolean;
  canAccessSettings?: boolean;
  canVoidOrder?: boolean;
  canGiveDiscount?: boolean;
  canEditRecipe?: boolean;
  canManageShifts?: boolean;
}

export interface StaffMember {
  id: string;
  name: string;
  role: 'เชฟใหญ่' | 'ผู้ช่วยกุ๊ก' | 'แคชเชียร์' | 'พนักงานเสิร์ฟ' | 'ผู้จัดการ' | string;
  hourlyRate: number; // THB per hour, e.g. 75
  otRateMultiplier: number; // e.g. 1.5
  phone?: string;
  branchId?: string;
  status: 'active' | 'inactive';
  pin?: string;
  permissions?: StaffPermissions;
  /** How the person is paid (missing = by the hour, using hourlyRate) */
  payType?: 'hourly' | 'daily' | 'monthly';
  dailyRate?: number; // THB per day worked
  monthlySalary?: number; // THB per month
  /** Social security (ประกันสังคม) is taken from the pay */
  socialSecurity?: boolean;
  /** Overtime is paid (missing = yes); off = hours past the shift earn no OT rate */
  otEnabled?: boolean;
  /** For payslips and the withholding tax certificate (50 ทวิ) */
  taxId?: string; // 13-digit ID card / tax number
  address?: string;
  bankAccount?: string; // where the pay goes, e.g. "กสิกร 123-4-56789-0"
  /** Income tax is withheld from the pay (ภ.ง.ด.1, estimated by the Revenue Department's method) */
  withholdTax?: boolean;
}

/** A bonus or deduction for one person in one month (e.g. ค่าเบิกล่วงหน้า) */
export interface PayrollAdjustment {
  id: string;
  staffId: string;
  month: string; // YYYY-MM
  kind: 'bonus' | 'deduction';
  amount: number;
  note: string;
}

export interface PayrollSettings {
  ssoRate: number; // % of wage, e.g. 5
  ssoMaxWage: number; // wage ceiling the rate applies to
  ssoMinWage: number; // wage floor
  lateGraceMinutes: number;
}

export type ShiftType = 'morning' | 'evening' | 'fullday' | 'night' | 'off' | 'custom';

export interface ShiftEntry {
  id: string;
  staffId: string;
  staffName: string;
  date: string; // YYYY-MM-DD
  dayOfWeek: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
  shiftType: ShiftType;
  scheduledStart: string; // e.g. "08:00"
  scheduledEnd: string;   // e.g. "16:00"
  scheduledHours: number; // e.g. 8.0

  // Actual clock-in/out tracking
  clockInTime?: string;   // e.g. "08:02"
  clockOutTime?: string;  // e.g. "17:30"
  actualHours?: number;   // e.g. 9.5
  status: 'scheduled' | 'clocked_in' | 'completed' | 'absent' | 'late';
  notes?: string;
  /** Where and how the person clocked in / out from their own phone */
  clockInCheck?: ClockCheck;
  clockOutCheck?: ClockCheck;
}

export interface ClockCheck {
  method: 'mobile';
  lat?: number;
  lng?: number;
  accuracy?: number; // metres
  distance?: number; // metres from the shop
  qr?: boolean; // the shop's live QR was scanned
}

/** Clocking in from staff phones: where the shop is and what must be proven */
export interface AttendanceSettings {
  mode: 'off' | 'gps' | 'qr' | 'gps_qr';
  /** The PIN timeclock screen can clock people in/out (missing = on) */
  pinTerminal?: boolean;
  /** Logging in to the POS with a PIN also clocks in (missing = off: signing in and clocking in are separate) */
  clockInOnLogin?: boolean;
  lat?: number;
  lng?: number;
  radius: number; // metres
  qrSecret: string;
}

export interface PayrollSummary {
  staffId: string;
  staffName: string;
  role: string;
  hourlyRate: number;
  otMultiplier: number;
  totalScheduledHours: number;
  totalActualHours: number;
  regularHours: number;
  otHours: number;
  regularPay: number;
  otPay: number;
  deductions: number;
  netPayrollPay: number;
  shiftCount: number;
}

export type ShiftRequestType = 'swap' | 'cover' | 'time_off';

export interface ShiftSwapRequest {
  id: string;
  requestType: ShiftRequestType;
  requestorStaffId: string;
  requestorStaffName: string;
  requestorShiftId?: string;
  requestorShiftDate: string; // YYYY-MM-DD
  
  targetStaffId?: string;
  targetStaffName?: string;
  targetShiftId?: string;
  targetShiftDate?: string;

  reason: string;
  createdAt: string;
  status: 'pending' | 'approved' | 'rejected';
  managerComment?: string;
  approvedAt?: string;
}

export interface CashMovement {
  id: string;
  time: string; // ISO string
  type: 'cash_in' | 'cash_out';
  amount: number;
  reason: string;
  recordedBy: string;
}

export interface CashShift {
  id: string;
  shiftNumber: string; // e.g. "SHIFT-101"
  branchId: string;
  openedBy: string; // Name of manager/cashier
  openedById?: string;
  openedAt: string; // ISO timestamp
  startingFloat: number; // เงินทอนตั้งต้น (Starting cash float)
  status: 'open' | 'closed';
  closedBy?: string;
  closedById?: string;
  closedAt?: string; // ISO timestamp
  
  // Tracked balances & sales
  actualCashBalance?: number; // เงินสดที่นับจริงตอนปิดกะ
  expectedCashBalance?: number; // Starting Float + Cash Sales + Cash In - Cash Out
  cashDifference?: number; // actualCashBalance - expectedCashBalance (> 0 is over, < 0 is short)
  totalCashSales?: number;
  totalPromptPaySales?: number;
  totalCreditSales?: number;
  totalSales?: number;
  orderCount?: number;
  
  cashMovements: CashMovement[];
  notes?: string;
  closingNotes?: string;
}

export interface SecurityLogEntry {
  id: string;
  timestamp: string; // ISO string
  userId?: string;
  userName: string;
  userRole?: string;
  action: string; // e.g. "PIN Login", "Manager Override", "System Reset Attempt", etc.
  status: 'SUCCESS' | 'FAILED';
  pinMasked?: string;
  details?: string;
  ipAddress?: string;
}

export interface CentralBranchLiveStats {
  branchId: string;
  branchName: string;
  lastActiveAt: string;
  totalSalesToday: number;
  orderCountToday: number;
  lowStockCount: number;
  isOnline: boolean;
  lastSyncedOrderNo?: string;
  lastOrderAmount?: number;
}

export interface FirebaseSyncState {
  status: 'connected' | 'syncing' | 'offline' | 'error';
  lastSyncedAt: string | null;
  pendingSyncCount: number;
  totalSyncedOrders: number;
  errorMessage?: string;
  lastSyncedBranch?: string;
  realtimeSyncActive?: boolean;
  lastPurgedCount?: number;
  lastPurgedDetails?: {
    menuDeleted: number;
    inventoryDeleted: number;
    menuSynced: number;
    inventorySynced: number;
    categoriesSynced: number;
    tablesSynced: number;
    lastCleanedAt: string;
  };
}

export type ConflictResolutionChoice = 'local' | 'cloud' | 'skip';

export type ConflictType = 'mismatch' | 'local_only' | 'cloud_only';

export interface DataFieldDiff {
  fieldName: string;
  fieldLabel: string;
  localValue: any;
  cloudValue: any;
  formattedLocal: string;
  formattedCloud: string;
}

export interface MenuConflictItem {
  id: string;
  type: ConflictType;
  title: string;
  localItem?: MenuItem;
  cloudItem?: MenuItem;
  diffs: DataFieldDiff[];
  choice: ConflictResolutionChoice;
}

export interface IngredientConflictItem {
  id: string;
  type: ConflictType;
  title: string;
  localIngredient?: Ingredient;
  cloudIngredient?: Ingredient;
  diffs: DataFieldDiff[];
  choice: ConflictResolutionChoice;
}

export interface SyncConflictReport {
  hasConflicts: boolean;
  totalConflicts: number;
  menuConflicts: MenuConflictItem[];
  ingredientConflicts: IngredientConflictItem[];
  detectedAt: string;
}




/** A receipt or cash bill photo sent to the shop's Telegram bot, waiting for a manager's approval */
export interface PendingReceipt {
  id: string; // tg-<chatId>-<messageId>
  source: 'telegram';
  chatId: string;
  messageId: number;
  fileId: string;
  senderName: string;
  caption: string;
  receivedAt: string; // ISO
  kind: 'expense' | 'income';
  status: 'reading' | 'pending' | 'failed' | 'approved' | 'rejected';
  data?: {
    title: string;
    vendorName: string;
    date: string; // YYYY-MM-DD
    category: ExpenseCategory;
    amount: number;
    includeVat: boolean;
    vatAmount: number;
    netAmount: number;
    refNumber: string;
    note: string;
    warnings: string[];
    verified: boolean;
    confidenceScore: number;
    /** Lines read from the bill (used to receive the goods into stock) */
    lineItems?: { name: string; quantity?: number; amount: number }[];
  };
  error?: string;
  /** Stock lots created when the bill was approved */
  stockAdded?: { ingredientId: string; quantity: number; cost: number }[];
  decidedBy?: string;
  decidedAt?: string;
  recordId?: string; // expense or income created on approval
  /** A smaller copy of the photo, kept with the entry (Telegram keeps several sizes) */
  storeFileId?: string;
  /** The bot's card about this entry in the chat (updated when the entry changes) */
  cardMessageId?: number;
  /** Recorded by the bot as a purchase of goods: waits for a manager to receive it into stock */
  stockPending?: boolean;
}

/** A kitchen prep recipe: raw ingredients drawn from stock and cooked into a stocked item (e.g. ซอสกะเพรา, เนื้อบดปรุงสุก) */
export interface PrepRecipe {
  id: string;
  outputIngredientId: string;
  /** Quantity one batch makes, in the output ingredient's unit */
  outputQty: number;
  /** Quantities one batch uses, in each ingredient's unit */
  inputs: { ingredientId: string; quantity: number }[];
  note?: string;
}

/** One production run: what was drawn, what came out and what it cost */
export interface PrepBatch {
  id: string;
  recipeId: string;
  outputIngredientId: string;
  outputName: string;
  outputUnit: string;
  batches: number;
  expectedQty: number;
  outputQty: number; // actual yield
  inputs: { ingredientId: string; name: string; unit: string; quantity: number; cost: number }[];
  cost: number;
  unitCost: number;
  producedAt: string; // ISO
  producedBy: string;
  note?: string;
}
