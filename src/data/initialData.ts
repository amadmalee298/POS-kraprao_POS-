import {
  MenuItem,
  Ingredient,
  StockLot,
  Branch,
  User,
  Expense,
  Order,
  AddOnOption,
  SystemSettings,
  WasteLog,
  StaffMember,
  ShiftEntry,
  ShiftSwapRequest,
  CashShift,
  SecurityLogEntry,
  StockAdjustmentLog,
  CategoryItem
} from '../types';
import { SHOP_LOGO_URL } from '../assets/logo';

export const DEFAULT_CATEGORIES: CategoryItem[] = [
  { id: 'kaprao', name: 'กะเพราโบราณ', icon: 'Flame' },
  { id: 'fry_soup', name: 'เมนูผัด/ต้ม', icon: 'Utensils' },
  { id: 'drinks_dessert', name: 'เครื่องดื่ม & ขนม', icon: 'CupSoda' },
  { id: 'special', name: 'เมนูพิเศษ', icon: 'Sparkles' }
];

export const INITIAL_BRANCHES: Branch[] = [
  {
    id: 'branch-siam',
    name: 'สาขาสยาม (Siam Paragon)',
    nameEn: 'Siam Paragon Branch',
    address: '991 อาคารสยามพารากอน ชั้น G ถ.พระราม 1 ปทุมวัน กรุงเทพฯ 10330',
    phone: '02-123-4567',
    taxId: '0105562089123',
    promptpayMobileOrTaxId: '0812345678',
    isMainBranch: true,
  },
  {
    id: 'branch-asoke',
    name: 'สาขาอโศก (Asoke Tower)',
    nameEn: 'Asoke Tower Branch',
    address: '209 อาคารอโศกทาวเวอร์ ชั้น 1 ถ.สุขุมวิท 21 วัฒนา กรุงเทพฯ 10110',
    phone: '02-987-6543',
    taxId: '0105562089124',
    promptpayMobileOrTaxId: '0812345678',
  },
  {
    id: 'branch-nimman',
    name: 'สาขาเชียงใหม่ (นิมมาน)',
    nameEn: 'Chiang Mai Nimman Branch',
    address: '12 ถนนนิมมานเหามินท์ ซอย 9 ต.สุเทพ อ.เมือง จ.เชียงใหม่ 50200',
    phone: '053-111-222',
    taxId: '0105562089125',
    promptpayMobileOrTaxId: '0812345678',
  },
];

export const INITIAL_USERS: User[] = [
  {
    id: 'usr-admin',
    name: 'คุณสมศักดิ์ (เจ้าของร้าน)',
    role: 'admin',
    pin: '1234',
    avatarColor: 'from-amber-500 to-orange-600',
  },
  {
    id: 'staff-3',
    name: 'คุณนภา (ผู้จัดการสาขา)',
    role: 'manager',
    pin: '5555',
    avatarColor: 'from-emerald-500 to-teal-600',
  },
  {
    id: 'staff-4',
    name: 'น้องมายด์ (แคชเชียร์)',
    role: 'cashier',
    pin: '0000',
    avatarColor: 'from-sky-500 to-blue-600',
  },
  {
    id: 'staff-5',
    name: 'น้องแพรว (พนักงานต้อนรับ/เสิร์ฟ)',
    role: 'staff',
    pin: '4444',
    avatarColor: 'from-rose-500 to-pink-600',
  },
  {
    id: 'staff-1',
    name: 'เชฟวิชัย (หัวหน้าเชฟ)',
    role: 'staff',
    pin: '1111',
    avatarColor: 'from-purple-500 to-indigo-600',
  },
  {
    id: 'staff-2',
    name: 'กุ๊กต้น (ผู้ช่วยเชฟ)',
    role: 'staff',
    pin: '2222',
    avatarColor: 'from-teal-500 to-emerald-600',
  },
];

export const STANDARD_ADD_ONS: AddOnOption[] = [
  { id: 'add-egg-fried', name: 'เพิ่มไข่ดาว', price: 10, ingredientId: 'ing-egg', ingredientAmount: 1 },
  { id: 'add-egg-omelet', name: 'เพิ่มไข่เจียว', price: 10, ingredientId: 'ing-egg', ingredientAmount: 1 },
  { id: 'add-egg-century', name: 'เพิ่มไข่เยี่ยวม้า', price: 15, ingredientId: 'ing-century-egg', ingredientAmount: 1 },
  { id: 'add-crispy-pork', name: 'เพิ่มหมูกรอบ', price: 25, ingredientId: 'ing-crispy-pork', ingredientAmount: 50 },
  { id: 'add-extra-rice', name: 'เพิ่มข้าวหอมมะลิ', price: 10, ingredientId: 'ing-rice', ingredientAmount: 100 },
];

export const INITIAL_INGREDIENTS: Ingredient[] = [
  { id: 'ing-pork-minced', name: 'หมูบดอนามัย CP', unit: 'g', currentStock: 0, minStockAlert: 2000, unitCost: 0.18, category: 'meat', barcode: '885100000001' },
  { id: 'ing-crispy-pork', name: 'หมูกรอบสูตรพิเศษ', unit: 'g', currentStock: 0, minStockAlert: 1500, unitCost: 0.38, category: 'meat', barcode: '885100000002' },
  { id: 'ing-beef-wagyu', name: 'เนื้อสไลส์วากิว A5', unit: 'g', currentStock: 0, minStockAlert: 1000, unitCost: 0.75, category: 'meat', barcode: '885100000003' },
  { id: 'ing-shrimp', name: 'กุ้งแม่น้ำแกะเปลือก', unit: 'g', currentStock: 0, minStockAlert: 1000, unitCost: 0.45, category: 'meat', barcode: '885100000004' },
  { id: 'ing-squid', name: 'ปลาหมึกสดหั่นชิ้น', unit: 'g', currentStock: 0, minStockAlert: 1000, unitCost: 0.32, category: 'meat', barcode: '885100000005' },
  { id: 'ing-duck', name: 'เป็ดร่อนทอดกรอบ', unit: 'g', currentStock: 0, minStockAlert: 800, unitCost: 0.40, category: 'meat', barcode: '885100000006' },
  { id: 'ing-basil', name: 'ใบกะเพราป่าแท้', unit: 'g', currentStock: 0, minStockAlert: 500, unitCost: 0.12, category: 'vegetable', barcode: '885100000007' },
  { id: 'ing-chili', name: 'พริกขี้หนูสวนสด', unit: 'g', currentStock: 0, minStockAlert: 400, unitCost: 0.15, category: 'vegetable', barcode: '885100000008' },
  { id: 'ing-garlic', name: 'กระเทียมไทยแกะกลีบ', unit: 'g', currentStock: 0, minStockAlert: 500, unitCost: 0.09, category: 'vegetable', barcode: '885100000009' },
  { id: 'ing-egg', name: 'ไข่ไก่สด เบอร์ 0', unit: 'pcs', currentStock: 0, minStockAlert: 30, unitCost: 4.20, category: 'egg', barcode: '885100000010' },
  { id: 'ing-century-egg', name: 'ไข่เยี่ยวม้า', unit: 'pcs', currentStock: 0, minStockAlert: 15, unitCost: 8.00, category: 'egg', barcode: '885100000011' },
  { id: 'ing-rice', name: 'ข้าวหอมมะลิแท้ 100%', unit: 'g', currentStock: 0, minStockAlert: 5000, unitCost: 0.04, category: 'dry_good', barcode: '885100000012' },
  { id: 'ing-sauce', name: 'ซอสผัดกะเพราสูตรลับ', unit: 'ml', currentStock: 0, minStockAlert: 1000, unitCost: 0.08, category: 'sauce', barcode: '885100000013' },
];

export const INITIAL_STOCK_LOTS: StockLot[] = [];

export const INITIAL_MENU_ITEMS: MenuItem[] = [
  {
    id: 'menu-kaprao-pork',
    name: 'กะเพราหมูสับโบราณ',
    nameEn: 'Traditional Minced Pork Holy Basil',
    category: 'kaprao',
    price: 65,
    costPrice: 28,
    description: 'หมูสับสดผัดพริกแห้งและกระเทียมไทย พร้อมใบกะเพราป่าหอมเข้มข้น รสชาติเผ็ดร้อนถึงใจ',
    image: 'https://images.unsplash.com/photo-1589301760014-d929f3979dbc?w=500&q=80',
    isPopular: true,
    recipe: [
      { ingredientId: 'ing-pork-minced', amountNeeded: 150 },
      { ingredientId: 'ing-basil', amountNeeded: 20 },
      { ingredientId: 'ing-chili', amountNeeded: 15 },
      { ingredientId: 'ing-garlic', amountNeeded: 15 },
      { ingredientId: 'ing-sauce', amountNeeded: 30 },
      { ingredientId: 'ing-rice', amountNeeded: 180 },
    ],
    availableSpiceLevels: ['ไม่เผ็ด', 'เผ็ดน้อย', 'เผ็ดปานกลาง', 'เผ็ดมาก', 'เผ็ดหูดับ'],
    availableProteins: [
      { name: 'หมูสับ', extraPrice: 0 },
      { name: 'หมูกรอบ', extraPrice: 20 },
      { name: 'เนื้อสไลส์', extraPrice: 30 },
      { name: 'ไก่ชิ้น', extraPrice: 0 },
    ]
  },
  {
    id: 'menu-kaprao-crispy-pork',
    name: 'กะเพราหมูกรอบคริสปี้',
    nameEn: 'Crispy Pork Belly Holy Basil',
    category: 'kaprao',
    price: 85,
    costPrice: 38,
    description: 'หมูกรอบหนังกรอบกร๊วบ เนื้อนุ่มฉ่ำ ผัดเข้าเนื้อด้วยซอสผัดกะเพราสูตรเข้มข้น',
    image: 'https://images.unsplash.com/photo-1626777552726-4a6b54c97e46?w=500&q=80',
    isPopular: true,
    recipe: [
      { ingredientId: 'ing-crispy-pork', amountNeeded: 140 },
      { ingredientId: 'ing-basil', amountNeeded: 20 },
      { ingredientId: 'ing-chili', amountNeeded: 15 },
      { ingredientId: 'ing-garlic', amountNeeded: 15 },
      { ingredientId: 'ing-sauce', amountNeeded: 30 },
      { ingredientId: 'ing-rice', amountNeeded: 180 },
    ],
    availableSpiceLevels: ['ไม่เผ็ด', 'เผ็ดน้อย', 'เผ็ดปานกลาง', 'เผ็ดมาก', 'เผ็ดหูดับ'],
  },
  {
    id: 'menu-kaprao-wagyu',
    name: 'กะเพราเนื้อวากิวสไลส์ A5',
    nameEn: 'Premium A5 Wagyu Beef Holy Basil',
    category: 'kaprao',
    price: 159,
    costPrice: 72,
    description: 'เนื้อวากิวนำเข้าสไลส์บาง ลายไขมันแทรกสวย ผัดไฟแรงหอมกลิ่นกระทะกะเพรา',
    image: 'https://images.unsplash.com/photo-1544025162-d76694265947?w=500&q=80',
    isPopular: true,
    recipe: [
      { ingredientId: 'ing-beef-wagyu', amountNeeded: 130 },
      { ingredientId: 'ing-basil', amountNeeded: 20 },
      { ingredientId: 'ing-chili', amountNeeded: 15 },
      { ingredientId: 'ing-garlic', amountNeeded: 15 },
      { ingredientId: 'ing-sauce', amountNeeded: 30 },
      { ingredientId: 'ing-rice', amountNeeded: 180 },
    ],
    availableSpiceLevels: ['ไม่เผ็ด', 'เผ็ดน้อย', 'เผ็ดปานกลาง', 'เผ็ดมาก', 'เผ็ดหูดับ'],
  },
  {
    id: 'menu-kaprao-seafood',
    name: 'กะเพราทะเลเดือด (กุ้ง+หมึก)',
    nameEn: 'Spicy Seafood Holy Basil (Shrimp & Squid)',
    category: 'kaprao',
    price: 99,
    costPrice: 45,
    description: 'กุ้งสดตัวใหญ่ และปลาหมึกสดเนื้อเด้ง ผัดซอสกะเพราแซ่บสะใจ',
    image: 'https://images.unsplash.com/photo-1559847844-5315695dadae?w=500&q=80',
    recipe: [
      { ingredientId: 'ing-shrimp', amountNeeded: 80 },
      { ingredientId: 'ing-squid', amountNeeded: 80 },
      { ingredientId: 'ing-basil', amountNeeded: 20 },
      { ingredientId: 'ing-chili', amountNeeded: 15 },
      { ingredientId: 'ing-sauce', amountNeeded: 30 },
      { ingredientId: 'ing-rice', amountNeeded: 180 },
    ],
    availableSpiceLevels: ['ไม่เผ็ด', 'เผ็ดน้อย', 'เผ็ดปานกลาง', 'เผ็ดมาก', 'เผ็ดหูดับ'],
  },
  {
    id: 'menu-kaprao-duck',
    name: 'กะเพราเป็ดทอดกรอบซอสเข้ม',
    nameEn: 'Crispy Duck Holy Basil',
    category: 'kaprao',
    price: 95,
    costPrice: 42,
    description: 'เนื้อเป็ดร่อนทอดกรอบหนังเป็ดหอมๆ คลุกซอสกะเพราสูตรพิเศษ',
    image: 'https://images.unsplash.com/photo-1514944288352-fffac99f0bdf?w=500&q=80',
    recipe: [
      { ingredientId: 'ing-duck', amountNeeded: 130 },
      { ingredientId: 'ing-basil', amountNeeded: 20 },
      { ingredientId: 'ing-sauce', amountNeeded: 30 },
      { ingredientId: 'ing-rice', amountNeeded: 180 },
    ],
  },
  {
    id: 'menu-special-giant',
    name: 'กะเพราถาดโฮมเมดยักษ์ (สำหรับ 2-3 ท่าน)',
    nameEn: 'Giant Tray Kaprao Combo (2-3 Persons)',
    category: 'special',
    price: 289,
    costPrice: 110,
    description: 'รวมมิตรหมูสับ หมูกรอบ กุ้งสด พร้อมไข่ดาว 3 ฟอง และข้าวหอมมะลิถาดพูน',
    image: 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=500&q=80',
    isPopular: true,
    recipe: [
      { ingredientId: 'ing-pork-minced', amountNeeded: 150 },
      { ingredientId: 'ing-crispy-pork', amountNeeded: 100 },
      { ingredientId: 'ing-shrimp', amountNeeded: 80 },
      { ingredientId: 'ing-egg', amountNeeded: 3 },
      { ingredientId: 'ing-rice', amountNeeded: 450 },
      { ingredientId: 'ing-basil', amountNeeded: 40 },
    ],
  },
  {
    id: 'menu-tom-yum',
    name: 'ต้มยำกุ้งแม่น้ำน้ำข้น',
    nameEn: 'Creamy Tom Yum River Prawn Soup',
    category: 'fry_soup',
    price: 135,
    costPrice: 55,
    description: 'ต้มยำน้ำข้นครบรสต้มยำไทยแท้ สมุนไพรหอมกะทิและพริกเผา',
    image: 'https://images.unsplash.com/photo-1548943487-a2e4e43b4853?w=500&q=80',
    recipe: [
      { ingredientId: 'ing-shrimp', amountNeeded: 120 },
      { ingredientId: 'ing-chili', amountNeeded: 15 },
    ],
  },
  {
    id: 'menu-garlic-pork',
    name: 'ข้าวหมูกระเทียมพริกไทยอ่อน',
    nameEn: 'Stir-fried Pork with Garlic & Black Pepper',
    category: 'fry_soup',
    price: 65,
    costPrice: 26,
    description: 'หมูชิ้นนุ่มหมักกระเทียมพริกไทย ผัดหอมกรุ่นราดข้าวหอมมะลิ',
    image: 'https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=500&q=80',
    recipe: [
      { ingredientId: 'ing-pork-minced', amountNeeded: 140 },
      { ingredientId: 'ing-garlic', amountNeeded: 25 },
      { ingredientId: 'ing-rice', amountNeeded: 180 },
    ],
  },
  {
    id: 'menu-drink-thaitea',
    name: 'ชาไทยตรามือเข้มข้นเย็น (หวานน้อย/ปกติ)',
    nameEn: 'Traditional Thai Iced Milk Tea',
    category: 'drinks_dessert',
    price: 45,
    costPrice: 12,
    description: 'ชาไทยชงสด หอมใบชาตรามือ ใส่นมสดแท้หวานมันลงตัว',
    image: 'https://images.unsplash.com/photo-1558857563-b371033873b8?w=500&q=80',
    recipe: [],
  },
  {
    id: 'menu-drink-lemontea',
    name: 'ชามะนาวสดเย็นดับเผ็ด',
    nameEn: 'Iced Fresh Lemon Black Tea',
    category: 'drinks_dessert',
    price: 40,
    costPrice: 10,
    description: 'ชาดำคั้นมะนาวสดแท้ 100% เปรี้ยวหวานสดชื่น แก้เผ็ดดีเยี่ยม',
    image: 'https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=500&q=80',
    recipe: [],
  },
  {
    id: 'menu-dessert-coconut-ice',
    name: 'ไอศกรีมกะทิสดทรงเครื่อง',
    nameEn: 'Fresh Coconut Ice Cream with Toppings',
    category: 'drinks_dessert',
    price: 50,
    costPrice: 18,
    description: 'ไอศกรีมกะทิสดมะพร้าวอ่อน โรยถั่วลิงทอด ถั่วแดง และข้าวเหนียวลืมผัว',
    image: 'https://images.unsplash.com/photo-1563805042-7684c019e1cb?w=500&q=80',
    recipe: [],
  }
];

export const INITIAL_EXPENSES: Expense[] = [];

export const INITIAL_ORDERS: Order[] = [];

export const INITIAL_SETTINGS: SystemSettings = {
  autoBackupFreq: 'daily',
  lastBackupDate: new Date().toISOString().split('T')[0],
  vatRate: 7,
  vatType: 'inclusive',
  enableVat: true,
  autoSyncEnabled: true,
  syncIntervalSeconds: 30,
  promptpayMobileOrTaxId: '0812345678',
  shopName: 'บริษัท กะเพรา เอ็นเตอร์ไพรส์ จำกัด (สำนักงานใหญ่)',
  shopLogoUrl: SHOP_LOGO_URL,
  shopTaxId: '0105562089123',
  shopAddress: '991 อาคารสยามพารากอน ชั้น G ถ.พระราม 1 ปทุมวัน กรุงเทพมหานคร 10330',
  shopPhone: '02-123-4567',
  enableKitchenSound: true,
  kdsWarningMinutes: 10,
  kdsOrderSourceFilter: 'all',
  receiptPaperWidth: '80mm',
  receiptFontSize: 'md',
  receiptShowLogo: true,
  receiptShowTaxId: true,
  receiptShowItemDetails: true,
  receiptUseMonospace: false,
  receiptFooterNote: '*** ขอบพระคุณที่อุดหนุน ***',
  qrPaymentMethods: [
    {
      id: 'promptpay',
      name: 'พร้อมเพย์ QR',
      type: 'promptpay',
      enabled: true,
      accountNumber: '081-234-5678',
      accountName: 'ร้านครัวกะเพรา POS',
      instructions: 'สแกนคิวอาร์โค้ดเพื่อโอนชำระเงินได้ทุกแอปพลิเคชันธนาคาร'
    },
    {
      id: 'truemoney',
      name: 'TrueMoney Wallet',
      type: 'truemoney',
      enabled: true,
      accountNumber: '081-234-5678',
      accountName: 'ร้านครัวกะเพรา POS',
      instructions: 'โอนชำระเงินผ่านแอป TrueMoney Wallet'
    },
    {
      id: 'linepay',
      name: 'Rabbit LINE Pay',
      type: 'linepay',
      enabled: true,
      accountNumber: 'RLP-987654321',
      accountName: 'ร้านครัวกะเพรา POS',
      instructions: 'สแกนชำระเงินผ่าน Rabbit LINE Pay หรือ LINE App'
    },
    {
      id: 'cash',
      name: 'ชำระที่เคาน์เตอร์',
      type: 'cash',
      enabled: true,
      accountNumber: '',
      accountName: '',
      instructions: 'สั่งเข้าครัวได้เลย แจ้งหมายเลขโต๊ะเพื่อชำระเงินสดหรือสแกนจ่ายที่เคาน์เตอร์'
    },
    {
      id: 'credit',
      name: 'บัตรเครดิต/เดบิต',
      type: 'credit',
      enabled: false,
      accountNumber: '',
      accountName: '',
      instructions: 'รองรับ Visa, Mastercard, JCB พนักงานจะนำเครื่องแตะบัตรมาให้บริการที่โต๊ะ'
    }
  ]
};

export const INITIAL_WASTE_LOGS: WasteLog[] = [];

export const INITIAL_STAFF_MEMBERS: StaffMember[] = [
  {
    id: 'staff-1',
    name: 'เชฟวิชัย (หัวหน้าเชฟ)',
    role: 'เชฟใหญ่',
    hourlyRate: 120,
    otRateMultiplier: 1.5,
    phone: '081-999-8811',
    branchId: 'branch-siam',
    status: 'active',
    pin: '1111',
    permissions: { canAccessKDS: true, canAccessInventory: true, canEditRecipe: true }
  },
  {
    id: 'staff-2',
    name: 'กุ๊กต้น (ผู้ช่วยเชฟกระทะร้อน)',
    role: 'ผู้ช่วยกุ๊ก',
    hourlyRate: 85,
    otRateMultiplier: 1.5,
    phone: '082-777-6622',
    branchId: 'branch-siam',
    status: 'active',
    pin: '2222',
    permissions: { canAccessKDS: true, canAccessInventory: true }
  },
  {
    id: 'staff-3',
    name: 'คุณนภา (ผู้จัดการสาขา)',
    role: 'ผู้จัดการ',
    hourlyRate: 150,
    otRateMultiplier: 1.5,
    phone: '089-111-2233',
    branchId: 'branch-siam',
    status: 'active',
    pin: '5555',
    permissions: {
      canAccessPOS: true,
      canAccessKDS: true,
      canAccessInventory: true,
      canAccessAccounting: true,
      canAccessSettings: true,
      canVoidOrder: true,
      canGiveDiscount: true,
      canEditRecipe: true
    }
  },
  {
    id: 'staff-4',
    name: 'น้องมายด์ (แคชเชียร์/การเงิน)',
    role: 'แคชเชียร์',
    hourlyRate: 75,
    otRateMultiplier: 1.5,
    phone: '083-444-5566',
    branchId: 'branch-siam',
    status: 'active',
    pin: '0000',
    permissions: {
      canAccessPOS: true,
      canAccessKDS: true,
      canGiveDiscount: true,
      canVoidOrder: true
    }
  },
  {
    id: 'staff-5',
    name: 'น้องแพรว (พนักงานต้อนรับ/เสิร์ฟ)',
    role: 'พนักงานเสิร์ฟ',
    hourlyRate: 65,
    otRateMultiplier: 1.5,
    phone: '084-555-6677',
    branchId: 'branch-siam',
    status: 'active',
    pin: '4444',
    permissions: { canAccessPOS: true, canAccessKDS: true }
  }
];

export const INITIAL_SHIFTS: ShiftEntry[] = [];

export const INITIAL_SHIFT_SWAP_REQUESTS: ShiftSwapRequest[] = [];

export const INITIAL_CASH_SHIFTS: CashShift[] = [];

export const INITIAL_SECURITY_LOGS: SecurityLogEntry[] = [];

export const INITIAL_STOCK_ADJUSTMENT_LOGS: StockAdjustmentLog[] = [];
