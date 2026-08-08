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
  CashShift
} from '../types';

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
    id: 'usr-mgr',
    name: 'คุณนภา (ผู้จัดการสาขา)',
    role: 'manager',
    pin: '5555',
    avatarColor: 'from-emerald-500 to-teal-600',
  },
  {
    id: 'usr-cashier',
    name: 'น้องมายด์ (แคชเชียร์)',
    role: 'cashier',
    pin: '0000',
    avatarColor: 'from-sky-500 to-blue-600',
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
  { id: 'ing-pork-minced', name: 'หมูบดอนามัย CP', unit: 'g', currentStock: 8500, minStockAlert: 2000, unitCost: 0.18, category: 'meat', barcode: '885100000001' },
  { id: 'ing-crispy-pork', name: 'หมูกรอบสูตรพิเศษ', unit: 'g', currentStock: 3200, minStockAlert: 1500, unitCost: 0.38, category: 'meat', barcode: '885100000002' },
  { id: 'ing-beef-wagyu', name: 'เนื้อสไลส์วากิว A5', unit: 'g', currentStock: 1800, minStockAlert: 1000, unitCost: 0.75, category: 'meat', barcode: '885100000003' },
  { id: 'ing-shrimp', name: 'กุ้งแม่น้ำแกะเปลือก', unit: 'g', currentStock: 2200, minStockAlert: 1000, unitCost: 0.45, category: 'meat', barcode: '885100000004' },
  { id: 'ing-squid', name: 'ปลาหมึกสดหั่นชิ้น', unit: 'g', currentStock: 1900, minStockAlert: 1000, unitCost: 0.32, category: 'meat', barcode: '885100000005' },
  { id: 'ing-duck', name: 'เป็ดร่อนทอดกรอบ', unit: 'g', currentStock: 1400, minStockAlert: 800, unitCost: 0.40, category: 'meat', barcode: '885100000006' },
  { id: 'ing-basil', name: 'ใบกะเพราป่าแท้', unit: 'g', currentStock: 1200, minStockAlert: 500, unitCost: 0.12, category: 'vegetable', barcode: '885100000007' },
  { id: 'ing-chili', name: 'พริกขี้หนูสวนสด', unit: 'g', currentStock: 950, minStockAlert: 400, unitCost: 0.15, category: 'vegetable', barcode: '885100000008' },
  { id: 'ing-garlic', name: 'กระเทียมไทยแกะกลีบ', unit: 'g', currentStock: 1800, minStockAlert: 500, unitCost: 0.09, category: 'vegetable', barcode: '885100000009' },
  { id: 'ing-egg', name: 'ไข่ไก่สด เบอร์ 0', unit: 'pcs', currentStock: 140, minStockAlert: 30, unitCost: 4.20, category: 'egg', barcode: '885100000010' },
  { id: 'ing-century-egg', name: 'ไข่เยี่ยวม้า', unit: 'pcs', currentStock: 45, minStockAlert: 15, unitCost: 8.00, category: 'egg', barcode: '885100000011' },
  { id: 'ing-rice', name: 'ข้าวหอมมะลิแท้ 100%', unit: 'g', currentStock: 25000, minStockAlert: 5000, unitCost: 0.04, category: 'dry_good', barcode: '885100000012' },
  { id: 'ing-sauce', name: 'ซอสผัดกะเพราสูตรลับ', unit: 'ml', currentStock: 4500, minStockAlert: 1000, unitCost: 0.08, category: 'sauce', barcode: '885100000013' },
];

export const INITIAL_STOCK_LOTS: StockLot[] = [
  {
    id: 'lot-101',
    ingredientId: 'ing-pork-minced',
    lotNumber: 'LOT-20260720-01',
    quantity: 10000,
    unitCost: 0.18,
    receivedDate: '2026-07-20',
    expiryDate: '2026-07-26',
    supplier: 'CP Food Chain Ltd.',
    notes: 'แช่เย็นควบคุมอุณหภูมิ 2-4 C'
  },
  {
    id: 'lot-102',
    ingredientId: 'ing-beef-wagyu',
    lotNumber: 'LOT-20260721-02',
    quantity: 3000,
    unitCost: 0.75,
    receivedDate: '2026-07-21',
    expiryDate: '2026-07-28',
    supplier: 'Pon Yang Kham Premium Beef',
    notes: 'เกรดพรีเมียม สไลส์บาง 1.5mm'
  },
  {
    id: 'lot-103',
    ingredientId: 'ing-crispy-pork',
    lotNumber: 'LOT-20260722-01',
    quantity: 5000,
    unitCost: 0.38,
    receivedDate: '2026-07-22',
    expiryDate: '2026-07-25',
    supplier: 'ครัวกลาง Kaprao Enterprise',
    notes: 'ทอดสดใหม่เมื่อเช้า'
  },
  {
    id: 'lot-104',
    ingredientId: 'ing-egg',
    lotNumber: 'LOT-20260718-05',
    quantity: 200,
    unitCost: 4.20,
    receivedDate: '2026-07-18',
    expiryDate: '2026-08-01',
    supplier: 'ฟาร์มไก่สดเบทาโกร',
    notes: 'เบอร์ 0 สดสะอาด'
  }
];

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

export const INITIAL_EXPENSES: Expense[] = [
  {
    id: 'exp-201',
    branchId: 'branch-siam',
    date: '2026-07-01',
    category: 'rent',
    title: 'ค่าเช่าพื้นที่ Siam Paragon ประจำเดือนกรกฎาคม',
    amount: 45000,
    includeVat: true,
    vatAmount: 2943.93,
    netAmount: 42056.07,
    refNumber: 'INV-SP-202607-01',
    note: 'จ่ายผ่านโอนธนาคารกสิกร'
  },
  {
    id: 'exp-202',
    branchId: 'branch-siam',
    date: '2026-07-05',
    category: 'salary',
    title: 'เงินเดือนพนักงานประจำสาขา (3 คน)',
    amount: 62000,
    includeVat: false,
    vatAmount: 0,
    netAmount: 62000,
    refNumber: 'SAL-2026-07',
    note: 'ผ่านระบบ PayRoll'
  },
  {
    id: 'exp-203',
    branchId: 'branch-siam',
    date: '2026-07-10',
    category: 'utilities',
    title: 'ค่าน้ำ-ค่าไฟฟ้า และค่าแก๊สหุงต้ม',
    amount: 12800,
    includeVat: true,
    vatAmount: 837.38,
    netAmount: 11962.62,
    refNumber: 'UTIL-MEA-88219'
  },
  {
    id: 'exp-204',
    branchId: 'branch-siam',
    date: '2026-07-15',
    category: 'marketing',
    title: 'โฆษณา TikTok & Facebook Ads กะเพราถาด',
    amount: 6000,
    includeVat: false,
    vatAmount: 0,
    netAmount: 6000,
    refNumber: 'FB-ADS-9912'
  },
  {
    id: 'exp-205',
    branchId: 'branch-siam',
    date: '2026-07-20',
    category: 'raw_material',
    title: 'สั่งซื้อหมูสด CP และเนื้อวากิวนำเข้า Lot ใหญ่',
    amount: 18500,
    includeVat: true,
    vatAmount: 1210.28,
    netAmount: 17289.72,
    refNumber: 'CP-BILL-4410'
  }
];

export const INITIAL_ORDERS: Order[] = [
  {
    id: 'ord-1001',
    orderNumber: '#KAP-1001',
    branchId: 'branch-siam',
    orderType: 'dine-in',
    tableNumber: 'T-04',
    items: [
      {
        cartItemId: 'c-1',
        menuItem: INITIAL_MENU_ITEMS[0], // กะเพราหมูสับ
        quantity: 2,
        spiceLevel: 'เผ็ดปานกลาง',
        selectedAddOns: [STANDARD_ADD_ONS[0]], // ไข่ดาว
        unitPrice: 77, // 65 + 12
        totalPrice: 154
      },
      {
        cartItemId: 'c-2',
        menuItem: INITIAL_MENU_ITEMS[8], // ชาไทย
        quantity: 2,
        selectedAddOns: [],
        unitPrice: 45,
        totalPrice: 90
      }
    ],
    subtotal: 244,
    discountAmount: 0,
    vatAmount: 15.96,
    grandTotal: 244,
    paymentMethod: 'promptpay',
    tenderedAmount: 244,
    changeAmount: 0,
    status: 'served',
    createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    updatedAt: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
    completedAt: new Date(Date.now() - 1000 * 60 * 25).toISOString()
  },
  {
    id: 'ord-1002',
    orderNumber: '#KAP-1002',
    branchId: 'branch-siam',
    orderType: 'takeaway',
    items: [
      {
        cartItemId: 'c-3',
        menuItem: INITIAL_MENU_ITEMS[1], // กะเพราหมูกรอบ
        quantity: 1,
        spiceLevel: 'เผ็ดมาก',
        selectedAddOns: [STANDARD_ADD_ONS[0], STANDARD_ADD_ONS[2]], // ไข่ดาว + เพิ่มข้าว
        unitPrice: 107, // 85 + 12 + 10
        totalPrice: 107,
        specialNotes: 'แยกน้ำราด ขอกระเทียมเจียวเยอะๆ'
      },
      {
        cartItemId: 'c-4',
        menuItem: INITIAL_MENU_ITEMS[9], // ชามะนาว
        quantity: 1,
        selectedAddOns: [],
        unitPrice: 40,
        totalPrice: 40
      }
    ],
    subtotal: 147,
    discountAmount: 10,
    discountType: 'fixed',
    discountNote: 'ส่วนลดสมาชิก VIP',
    vatAmount: 8.96,
    grandTotal: 137,
    paymentMethod: 'cash',
    tenderedAmount: 500,
    changeAmount: 363,
    status: 'cooking',
    createdAt: new Date(Date.now() - 1000 * 60 * 8).toISOString(), // 8 mins ago
    updatedAt: new Date(Date.now() - 1000 * 60 * 8).toISOString()
  },
  {
    id: 'ord-1003',
    orderNumber: '#KAP-1003',
    branchId: 'branch-siam',
    orderType: 'dine-in',
    tableNumber: 'T-01',
    items: [
      {
        cartItemId: 'c-5',
        menuItem: INITIAL_MENU_ITEMS[2], // กะเพราเนื้อวากิว
        quantity: 1,
        spiceLevel: 'เผ็ดหูดับ',
        selectedAddOns: [STANDARD_ADD_ONS[0]], // ไข่ดาว
        unitPrice: 171, // 159 + 12
        totalPrice: 171
      },
      {
        cartItemId: 'c-6',
        menuItem: INITIAL_MENU_ITEMS[5], // กะเพราถาดโฮมเมดยักษ์
        quantity: 1,
        spiceLevel: 'เผ็ดปานกลาง',
        selectedAddOns: [],
        unitPrice: 289,
        totalPrice: 289
      }
    ],
    subtotal: 460,
    discountAmount: 0,
    vatAmount: 30.09,
    grandTotal: 460,
    paymentMethod: 'cash',
    tenderedAmount: 500,
    changeAmount: 40,
    status: 'pending',
    createdAt: new Date(Date.now() - 1000 * 60 * 2).toISOString(), // 2 mins ago
    updatedAt: new Date(Date.now() - 1000 * 60 * 2).toISOString()
  }
];

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
  shopTaxId: '0105562089123',
  shopAddress: '991 อาคารสยามพารากอน ชั้น G ถ.พระราม 1 ปทุมวัน กรุงเทพมหานคร 10330',
  shopPhone: '02-123-4567',
  enableKitchenSound: true,
  kdsWarningMinutes: 10,
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

export const INITIAL_WASTE_LOGS: WasteLog[] = [
  {
    id: 'waste-101',
    ingredientId: 'ing-basil',
    ingredientName: 'ใบกะเพราป่าแท้',
    quantity: 350,
    unit: 'g',
    unitCost: 0.12,
    totalCostLoss: 42,
    reason: 'expired',
    loggedDate: new Date(Date.now() - 86400000 * 1).toISOString().split('T')[0],
    notes: 'เน่าเหี่ยวเหลืองในตู้เย็น สั่งรอบละ 2.5 กิโลกรัม ใบช้ำจากการซ้อนทับกันแน่น',
    reportedBy: 'เชฟวิชัย'
  },
  {
    id: 'waste-102',
    ingredientId: 'ing-shrimp',
    ingredientName: 'กุ้งแม่น้ำแกะเปลือก',
    quantity: 400,
    unit: 'g',
    unitCost: 0.45,
    totalCostLoss: 180,
    reason: 'spoiled',
    loggedDate: new Date(Date.now() - 86400000 * 1).toISOString().split('T')[0],
    notes: 'เนื้อกุ้งเริ่มเละและมีกลิ่น ไม่ได้เกณฑ์ความสด สั่งซื้อรอบละใหญ่เกินไปวันต้นสัปดาห์',
    reportedBy: 'ผู้ช่วยกุ๊ก'
  },
  {
    id: 'waste-103',
    ingredientId: 'ing-egg',
    ingredientName: 'ไข่ไก่สด เบอร์ 0',
    quantity: 12,
    unit: 'pcs',
    unitCost: 4.20,
    totalCostLoss: 50.4,
    reason: 'damaged',
    loggedDate: new Date(Date.now() - 86400000 * 2).toISOString().split('T')[0],
    notes: 'เปลือกแตกชำรุดระหว่างยกถาดไข่ย้ายเข้าสเตชันทอด',
    reportedBy: 'พนักงานคลัง'
  },
  {
    id: 'waste-104',
    ingredientId: 'ing-crispy-pork',
    ingredientName: 'หมูกรอบสูตรพิเศษ',
    quantity: 250,
    unit: 'g',
    unitCost: 0.38,
    totalCostLoss: 95,
    reason: 'overcooked',
    loggedDate: new Date(Date.now() - 86400000 * 3).toISOString().split('T')[0],
    notes: 'หมูกรอบไหม้ดำจากการทอดความร้อนสูงเกินไประหว่างช่วงออเดอร์หนาแน่น',
    reportedBy: 'เชฟวิชัย'
  },
  {
    id: 'waste-105',
    ingredientId: 'ing-chili',
    ingredientName: 'พริกขี้หนูสวนสด',
    quantity: 180,
    unit: 'g',
    unitCost: 0.15,
    totalCostLoss: 27,
    reason: 'trimming',
    loggedDate: new Date(Date.now() - 86400000 * 4).toISOString().split('T')[0],
    notes: 'ขั้วพริกเน่าเปื่อยช้ำจากการคัดแยกวัตถุดิบต้นสัปดาห์',
    reportedBy: 'พนักงานเตรียมวัตถุดิบ'
  }
];

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

// Generate initial week's roster shift entries
const getDatesOfCurrentWeek = (): { dayOfWeek: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'; dateStr: string }[] => {
  const now = new Date();
  const day = now.getDay(); // 0 is Sun, 1 is Mon
  const diffToMon = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMon);

  const days: ('Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun')[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  return days.map((d, index) => {
    const dt = new Date(monday);
    dt.setDate(monday.getDate() + index);
    return {
      dayOfWeek: d,
      dateStr: dt.toISOString().split('T')[0]
    };
  });
};

const currentWeekDays = getDatesOfCurrentWeek();

export const INITIAL_SHIFTS: ShiftEntry[] = [
  // เชฟวิชัย (Mon-Fri morning, Sat fullday, Sun off)
  {
    id: 'shift-101',
    staffId: 'staff-1',
    staffName: 'เชฟวิชัย (หัวหน้าเชฟ)',
    date: currentWeekDays[0].dateStr,
    dayOfWeek: 'Mon',
    shiftType: 'morning',
    scheduledStart: '08:00',
    scheduledEnd: '16:00',
    scheduledHours: 8,
    clockInTime: '07:55',
    clockOutTime: '16:15',
    actualHours: 8.33,
    status: 'completed',
    notes: 'ตรงเวลาดีมาก'
  },
  {
    id: 'shift-102',
    staffId: 'staff-1',
    staffName: 'เชฟวิชัย (หัวหน้าเชฟ)',
    date: currentWeekDays[1].dateStr,
    dayOfWeek: 'Tue',
    shiftType: 'morning',
    scheduledStart: '08:00',
    scheduledEnd: '16:00',
    scheduledHours: 8,
    clockInTime: '08:00',
    clockOutTime: '18:30',
    actualHours: 10.5,
    status: 'completed',
    notes: 'ทำ OT 2.5 ชม. ช่วยเคลียร์วัตถุดิบส่งมอบกะเย็น'
  },
  {
    id: 'shift-103',
    staffId: 'staff-1',
    staffName: 'เชฟวิชัย (หัวหน้าเชฟ)',
    date: currentWeekDays[2].dateStr,
    dayOfWeek: 'Wed',
    shiftType: 'morning',
    scheduledStart: '08:00',
    scheduledEnd: '16:00',
    scheduledHours: 8,
    clockInTime: '07:58',
    clockOutTime: '16:05',
    actualHours: 8.1,
    status: 'completed'
  },
  {
    id: 'shift-104',
    staffId: 'staff-1',
    staffName: 'เชฟวิชัย (หัวหน้าเชฟ)',
    date: currentWeekDays[3].dateStr,
    dayOfWeek: 'Thu',
    shiftType: 'morning',
    scheduledStart: '08:00',
    scheduledEnd: '16:00',
    scheduledHours: 8,
    clockInTime: '08:00',
    clockOutTime: '16:00',
    actualHours: 8.0,
    status: 'completed'
  },
  {
    id: 'shift-105',
    staffId: 'staff-1',
    staffName: 'เชฟวิชัย (หัวหน้าเชฟ)',
    date: currentWeekDays[4].dateStr,
    dayOfWeek: 'Fri',
    shiftType: 'morning',
    scheduledStart: '08:00',
    scheduledEnd: '16:00',
    scheduledHours: 8,
    clockInTime: '07:50',
    clockOutTime: '18:00',
    actualHours: 10.16,
    status: 'completed',
    notes: 'OT 2 ชั่วโมง คุมสเตชันเตรียมพีควันศุกร์'
  },
  {
    id: 'shift-106',
    staffId: 'staff-1',
    staffName: 'เชฟวิชัย (หัวหน้าเชฟ)',
    date: currentWeekDays[5].dateStr,
    dayOfWeek: 'Sat',
    shiftType: 'fullday',
    scheduledStart: '09:00',
    scheduledEnd: '21:00',
    scheduledHours: 12,
    status: 'scheduled'
  },
  {
    id: 'shift-107',
    staffId: 'staff-1',
    staffName: 'เชฟวิชัย (หัวหน้าเชฟ)',
    date: currentWeekDays[6].dateStr,
    dayOfWeek: 'Sun',
    shiftType: 'off',
    scheduledStart: '00:00',
    scheduledEnd: '00:00',
    scheduledHours: 0,
    status: 'scheduled'
  },

  // กุ๊กต้น (Mon evening, Tue-Fri evening, Sat-Sun fullday)
  {
    id: 'shift-201',
    staffId: 'staff-2',
    staffName: 'กุ๊กต้น (ผู้ช่วยเชฟกระทะร้อน)',
    date: currentWeekDays[0].dateStr,
    dayOfWeek: 'Mon',
    shiftType: 'evening',
    scheduledStart: '16:00',
    scheduledEnd: '00:00',
    scheduledHours: 8,
    clockInTime: '15:55',
    clockOutTime: '00:15',
    actualHours: 8.33,
    status: 'completed'
  },
  {
    id: 'shift-202',
    staffId: 'staff-2',
    staffName: 'กุ๊กต้น (ผู้ช่วยเชฟกระทะร้อน)',
    date: currentWeekDays[1].dateStr,
    dayOfWeek: 'Tue',
    shiftType: 'evening',
    scheduledStart: '16:00',
    scheduledEnd: '00:00',
    scheduledHours: 8,
    clockInTime: '16:15',
    clockOutTime: '00:30',
    actualHours: 8.25,
    status: 'completed',
    notes: 'เข้าสาย 15 นาทีเนื่องจากจราจรติดขัด'
  },
  {
    id: 'shift-203',
    staffId: 'staff-2',
    staffName: 'กุ๊กต้น (ผู้ช่วยเชฟกระทะร้อน)',
    date: currentWeekDays[2].dateStr,
    dayOfWeek: 'Wed',
    shiftType: 'evening',
    scheduledStart: '16:00',
    scheduledEnd: '00:00',
    scheduledHours: 8,
    clockInTime: '15:58',
    clockOutTime: '01:00',
    actualHours: 9.0,
    status: 'completed',
    notes: 'ทำ OT 1 ชม. เก็บครัวรอบดึก'
  },

  // น้องมายด์
  {
    id: 'shift-301',
    staffId: 'staff-4',
    staffName: 'น้องมายด์ (แคชเชียร์/การเงิน)',
    date: currentWeekDays[0].dateStr,
    dayOfWeek: 'Mon',
    shiftType: 'morning',
    scheduledStart: '08:00',
    scheduledEnd: '16:00',
    scheduledHours: 8,
    clockInTime: '07:50',
    clockOutTime: '16:10',
    actualHours: 8.33,
    status: 'completed'
  },
  {
    id: 'shift-302',
    staffId: 'staff-4',
    staffName: 'น้องมายด์ (แคชเชียร์/การเงิน)',
    date: currentWeekDays[1].dateStr,
    dayOfWeek: 'Tue',
    shiftType: 'morning',
    scheduledStart: '08:00',
    scheduledEnd: '16:00',
    scheduledHours: 8,
    clockInTime: '07:55',
    clockOutTime: '16:00',
    actualHours: 8.0,
    status: 'completed'
  }
];

export const INITIAL_SHIFT_SWAP_REQUESTS: ShiftSwapRequest[] = [
  {
    id: 'swap-001',
    requestType: 'swap',
    requestorStaffId: 'staff-2',
    requestorStaffName: 'กุ๊กต้น (ผู้ช่วยเชฟกระทะร้อน)',
    requestorShiftDate: currentWeekDays[4]?.dateStr || '2026-07-31',
    targetStaffId: 'staff-1',
    targetStaffName: 'เชฟวิชัย (หัวหน้าเชฟ)',
    targetShiftDate: currentWeekDays[5]?.dateStr || '2026-08-01',
    reason: 'ติดภารกิจส่วนตัวช่วงเย็นวันศุกร์ ขอลกไปเข้ากะเสาร์แทนครับ',
    createdAt: '2026-07-25 09:30',
    status: 'pending'
  },
  {
    id: 'swap-002',
    requestType: 'time_off',
    requestorStaffId: 'staff-5',
    requestorStaffName: 'น้องแพรว (พนักงานต้อนรับ/เสิร์ฟ)',
    requestorShiftDate: currentWeekDays[6]?.dateStr || '2026-08-02',
    reason: 'ขอสลับวันหยุด ลากิจเนื่องจากสอบวัดระดับภาษา',
    createdAt: '2026-07-24 14:15',
    status: 'pending'
  }
];

export const INITIAL_CASH_SHIFTS: CashShift[] = [
  {
    id: 'shift-103',
    shiftNumber: 'SHIFT-103',
    branchId: 'branch-siam',
    openedBy: 'ผู้จัดการ สมชาย',
    openedById: 'user-1',
    openedAt: new Date(new Date().setHours(8, 0, 0, 0)).toISOString(),
    startingFloat: 2000,
    status: 'open',
    cashMovements: [
      {
        id: 'mov-001',
        time: new Date(new Date().setHours(11, 30, 0, 0)).toISOString(),
        type: 'cash_out',
        amount: 80,
        reason: 'จ่ายค่าน้ำแข็งส่งหน้าร้าน (บิลเงินสด)',
        recordedBy: 'ผู้จัดการ สมชาย'
      }
    ],
    notes: 'เปิดกะเช้า เตรียมเงินทอนใบย่อย 2,000 บาทครบถ้วน'
  },
  {
    id: 'shift-102',
    shiftNumber: 'SHIFT-102',
    branchId: 'branch-siam',
    openedBy: 'แคชเชียร์ ฝน',
    openedById: 'user-2',
    openedAt: new Date(new Date().setDate(new Date().getDate() - 1)).toISOString().replace(/T.*/, 'T16:00:00.000Z'),
    startingFloat: 2000,
    status: 'closed',
    closedBy: 'ผู้จัดการ สมชาย',
    closedById: 'user-1',
    closedAt: new Date(new Date().setDate(new Date().getDate() - 1)).toISOString().replace(/T.*/, 'T22:30:00.000Z'),
    actualCashBalance: 8450,
    expectedCashBalance: 8450,
    cashDifference: 0,
    totalCashSales: 6450,
    totalPromptPaySales: 4120,
    totalCreditSales: 2100,
    totalSales: 12670,
    orderCount: 42,
    cashMovements: [],
    notes: 'เปิดกะเย็น สภาพเงินทอนปกติ',
    closingNotes: 'ปิดกะประจำวัน นับยอดเงินสดตรงตามระบบ 8,450 บาท (ตรงกันเป๊ะ)'
  },
  {
    id: 'shift-101',
    shiftNumber: 'SHIFT-101',
    branchId: 'branch-siam',
    openedBy: 'ผู้จัดการ สมชาย',
    openedById: 'user-1',
    openedAt: new Date(new Date().setDate(new Date().getDate() - 1)).toISOString().replace(/T.*/, 'T08:00:00.000Z'),
    startingFloat: 2000,
    status: 'closed',
    closedBy: 'ผู้จัดการ สมชาย',
    closedById: 'user-1',
    closedAt: new Date(new Date().setDate(new Date().getDate() - 1)).toISOString().replace(/T.*/, 'T16:00:00.000Z'),
    actualCashBalance: 7180,
    expectedCashBalance: 7200,
    cashDifference: -20,
    totalCashSales: 5200,
    totalPromptPaySales: 3890,
    totalCreditSales: 1500,
    totalSales: 10590,
    orderCount: 38,
    cashMovements: [],
    notes: 'เปิดกะเช้า เงินทอน 2,000 บาท',
    closingNotes: 'นับเงินปิดกะเช้า ขาด 20 บาท ตรวจสอบพบทอนเงินเกินลูกค้ารายการสั่งกลับบ้าน'
  }
];


