export type MenuCategory = string;

export interface CategoryItem {
  id: string;
  name: string;
  icon?: string;
}

export type SpiceLevel = 'ไม่เผ็ด' | 'เผ็ดน้อย' | 'เผ็ดปานกลาง' | 'เผ็ดมาก' | 'เผ็ดหูดับ';

export type ProteinChoice = 'หมูสับ' | 'หมูกรอบ' | 'เนื้อสไลส์' | 'ไก่ชิ้น' | 'กุ้ง+หมึก' | 'เป็ดกรอบ' | 'เต้าหู้ไข่';

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
  recipe: RecipeIngredient[];
  availableSpiceLevels?: SpiceLevel[];
  availableProteins?: { name: ProteinChoice; extraPrice: number }[];
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
  isQrOrder?: boolean;
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

export interface Ingredient {
  id: string;
  name: string;
  unit: 'g' | 'kg' | 'ml' | 'l' | 'pcs' | 'pack';
  currentStock: number;
  minStockAlert: number;
  unitCost: number; // cost per unit
  category: string;
  barcode?: string;
}

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

export type ExpenseCategory = 'rent' | 'salary' | 'utilities' | 'raw_material' | 'marketing' | 'other';

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
  isConnected: boolean;
  merchantName: string;
  merchantId: string;
  terminalId: string;
  apiKey?: string;
  provider: 'bbl_merchant_pro' | 'promptpay_dynamic' | 'scb_merchant' | 'kbank_merchant' | 'delivery_merchant';
  autoConfirmPayment: boolean;
  lastConnectedAt?: string;
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

export interface SystemSettings {
  autoBackupFreq: 'daily' | 'weekly' | 'off';
  lastBackupDate?: string;
  vatRate: number; // default 7
  vatType?: 'inclusive' | 'exclusive' | 'none'; // tax calculation method
  enableVat?: boolean; // toggle automatic tax calculations
  autoSyncEnabled?: boolean; // toggle automatic background sync for offline transactions
  syncIntervalSeconds?: number; // frequency of background sync interval in seconds
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


