import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { Order, Ingredient, MenuItem, Branch, StockAdjustmentLog, WasteLog } from '../types';

// Reuse initialized Firebase App
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

// All Google Workspace OAuth Scopes configured for Sheets and Drive
export const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/spreadsheets.readonly'
];

const provider = new GoogleAuthProvider();
SCOPES.forEach(scope => provider.addScope(scope));

// In-memory token & user caching (Crucial: NEVER store in localStorage/sessionStorage)
let isSigningIn = false;
let cachedAccessToken: string | null = null;
let cachedGoogleUser: any | null = null;

export const getCurrentDomain = (): string => {
  if (typeof window !== 'undefined') {
    return window.location.hostname;
  }
  return '';
};

export const loadGisScript = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return resolve();
    if ((window as any).google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const existing = document.getElementById('google-gsi-script');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Identity Services')));
      return;
    }
    const script = document.createElement('script');
    script.id = 'google-gsi-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(script);
  });
};

/**
 * Request Access Token directly using Google Identity Services (GIS Token Client)
 * Bypasses Firebase Auth domain authorization restriction on custom domains (e.g. github.io)
 */
export const requestAccessTokenViaGis = async (): Promise<{ user: any; accessToken: string }> => {
  await loadGisScript();

  return new Promise((resolve, reject) => {
    try {
      const google = (window as any).google;
      if (!google?.accounts?.oauth2) {
        throw new Error('Google Identity Services library is not available');
      }

      const client = google.accounts.oauth2.initTokenClient({
        client_id: firebaseConfig.oAuthClientId,
        scope: [
          ...SCOPES,
          'https://www.googleapis.com/auth/userinfo.email',
          'https://www.googleapis.com/auth/userinfo.profile'
        ].join(' '),
        callback: async (tokenResponse: any) => {
          if (tokenResponse.error) {
            console.error('[GIS OAuth] Error:', tokenResponse);
            reject(new Error(tokenResponse.error_description || tokenResponse.error || 'Google Sign-in failed'));
            return;
          }

          const token = tokenResponse.access_token;
          cachedAccessToken = token;

          // Fetch user info from Google OAuth2 Userinfo endpoint
          let userInfo: any = { name: 'Google User', email: '' };
          try {
            const uRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
              headers: { Authorization: `Bearer ${token}` }
            });
            if (uRes.ok) {
              userInfo = await uRes.json();
            }
          } catch (e) {
            console.warn('[GIS OAuth] Could not fetch userinfo:', e);
          }

          const userObj = {
            uid: userInfo.sub || 'gis-user',
            displayName: userInfo.name || userInfo.email?.split('@')[0] || 'Google User',
            email: userInfo.email || '',
            photoURL: userInfo.picture || '',
            providerId: 'google.com'
          };

          cachedGoogleUser = userObj;
          resolve({ user: userObj, accessToken: token });
        },
        error_callback: (err: any) => {
          console.error('[GIS OAuth] error_callback:', err);
          reject(new Error(err.message || 'Google OAuth authorization was cancelled or failed'));
        }
      });

      client.requestAccessToken({ prompt: 'consent' });
    } catch (err) {
      console.error('[GIS OAuth] initTokenClient failed:', err);
      reject(err);
    }
  });
};

export const initGoogleAuth = (
  onAuthSuccess?: (user: any, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      cachedGoogleUser = user;
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        if (onAuthFailure) onAuthFailure();
      }
    } else if (!cachedAccessToken) {
      cachedGoogleUser = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (forceGis = false): Promise<{ user: any; accessToken: string } | null> => {
  try {
    isSigningIn = true;

    // If direct GIS requested, skip Firebase popup
    if (forceGis) {
      console.log('[Google OAuth] Direct GIS sign-in initiated...');
      return await requestAccessTokenViaGis();
    }

    try {
      const result = await signInWithPopup(auth, provider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (!credential?.accessToken) {
        throw new Error('ไม่สามารถรับ Access Token จาก Google OAuth ได้');
      }

      cachedAccessToken = credential.accessToken;
      cachedGoogleUser = result.user;
      return { user: result.user, accessToken: cachedAccessToken };
    } catch (firebaseErr: any) {
      console.warn('[Google OAuth] Firebase popup error:', firebaseErr?.code, firebaseErr?.message);

      // If domain is unauthorized on Firebase console or blocked, transparently attempt GIS
      if (
        firebaseErr?.code === 'auth/unauthorized-domain' ||
        firebaseErr?.message?.includes('unauthorized-domain')
      ) {
        console.log('[Google OAuth] Unauthorized domain detected on Firebase. Falling back to Google Identity Services (GIS)...');
        return await requestAccessTokenViaGis();
      }

      throw firebaseErr;
    }
  } catch (error: any) {
    console.error('[Google OAuth] Error during Sign-In:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const setManualAccessToken = (token: string, email?: string) => {
  cachedAccessToken = token.trim();
  cachedGoogleUser = {
    uid: 'manual-token-user',
    displayName: email ? email.split('@')[0] : 'Authorized Google User',
    email: email || 'user@gmail.com',
    photoURL: ''
  };
};

export const getGoogleAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const getGoogleUser = (): any | null => {
  return cachedGoogleUser;
};

export const googleSignOut = async () => {
  try {
    await signOut(auth);
  } catch (e) {
    // Ignore if not signed into Firebase
  }
  cachedAccessToken = null;
  cachedGoogleUser = null;
};

export interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  webViewLink?: string;
}

/**
 * List existing spreadsheets created or accessed by the user
 */
export async function listUserSpreadsheets(accessToken: string): Promise<GoogleDriveFile[]> {
  try {
    const q = encodeURIComponent("mimeType = 'application/vnd.google-apps.spreadsheet' and trashed = false");
    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,modifiedTime,webViewLink)&orderBy=modifiedTime desc&pageSize=15`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || 'Failed to list spreadsheets');
    }

    const data = await response.json();
    return data.files || [];
  } catch (error) {
    console.error('[Google Drive] listUserSpreadsheets error:', error);
    throw error;
  }
}

/**
 * Create a new Google Spreadsheet with default sheets
 */
export async function createGoogleSpreadsheet(
  accessToken: string,
  title: string,
  sheetTitles: string[] = ['ยอดขาย (Sales)', 'สต็อกวัตถุดิบ (Inventory)', 'ต้นทุนเมนู (Recipes)', 'ประวัติสต็อก (Movements)']
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  try {
    const requestBody = {
      properties: {
        title: title
      },
      sheets: sheetTitles.map(name => ({
        properties: {
          title: name,
          gridProperties: {
            frozenRowCount: 1
          }
        }
      }))
    };

    const response = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.error?.message || 'Failed to create spreadsheet');
    }

    const data = await response.json();
    return {
      spreadsheetId: data.spreadsheetId,
      spreadsheetUrl: data.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${data.spreadsheetId}/edit`
    };
  } catch (error) {
    console.error('[Google Sheets] createGoogleSpreadsheet error:', error);
    throw error;
  }
}

/**
 * Fetch spreadsheet metadata to get existing sheet names
 */
export async function getSpreadsheetDetails(accessToken: string, spreadsheetId: string): Promise<{ title: string; sheets: string[] }> {
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || 'Failed to get spreadsheet details');
  }

  const data = await response.json();
  const sheets = (data.sheets || []).map((s: any) => s.properties?.title as string).filter(Boolean);
  return {
    title: data.properties?.title || 'Spreadsheet',
    sheets
  };
}

/**
 * Add a sheet/tab if it does not exist
 */
export async function ensureSheetExists(accessToken: string, spreadsheetId: string, sheetTitle: string): Promise<void> {
  const details = await getSpreadsheetDetails(accessToken, spreadsheetId);
  if (details.sheets.includes(sheetTitle)) {
    return;
  }

  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      requests: [
        {
          addSheet: {
            properties: {
              title: sheetTitle,
              gridProperties: {
                frozenRowCount: 1
              }
            }
          }
        }
      ]
    })
  });

  if (!response.ok) {
    console.warn(`[Google Sheets] Could not add sheet "${sheetTitle}":`, await response.text());
  }
}

/**
 * Update values in a specific sheet range
 */
export async function writeSheetValues(
  accessToken: string,
  spreadsheetId: string,
  range: string,
  values: any[][]
): Promise<any> {
  const encodedRange = encodeURIComponent(range);
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}?valueInputOption=USER_ENTERED`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        range,
        majorDimension: 'ROWS',
        values
      })
    }
  );

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || 'Failed to update sheet values');
  }

  return response.json();
}

/**
 * Clear values in a sheet
 */
export async function clearSheetValues(
  accessToken: string,
  spreadsheetId: string,
  range: string
): Promise<any> {
  const encodedRange = encodeURIComponent(range);
  const response = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}:clear`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    }
  );

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || 'Failed to clear sheet values');
  }

  return response.json();
}

/**
 * Format and export Orders / Sales to Google Sheets
 */
export async function syncSalesToGoogleSheets(
  accessToken: string,
  spreadsheetId: string,
  orders: Order[],
  branch: Branch,
  sheetTitle: string = 'ยอดขาย (Sales)'
): Promise<number> {
  await ensureSheetExists(accessToken, spreadsheetId, sheetTitle);

  const headers = [
    'เลขที่บิล (Order No)',
    'วัน-เวลาทำรายการ (Date & Time)',
    'สาขา (Branch)',
    'ประเภทออเดอร์ (Type)',
    'โต๊ะ / แชนแนล (Table)',
    'รายการอาหาร (Items Detail)',
    'จำนวนรวม (Qty)',
    'ยอดรวมก่อนลด (Subtotal THB)',
    'ส่วนลด (Discount THB)',
    'ภาษีมูลค่าเพิ่ม (VAT 7% THB)',
    'ยอดสุทธิ (Grand Total THB)',
    'วิธีชำระเงิน (Payment)',
    'สถานะออเดอร์ (Status)',
    'หมายเหตุ / ใบกำกับภาษี (Notes)'
  ];

  const rows = orders.map(ord => {
    const itemsSummary = (ord.items || [])
      .map(item => `${item.menuItem?.name || 'อาหาร'} x${item.quantity}${item.proteinChoice ? ` (${item.proteinChoice.name})` : ''}${item.spiceLevel ? ` [${item.spiceLevel}]` : ''}`)
      .join(', ');

    const totalQty = (ord.items || []).reduce((sum, item) => sum + (item.quantity || 1), 0);

    const paymentLabel =
      ord.paymentMethod === 'promptpay'
        ? 'พร้อมเพย์ QR'
        : ord.paymentMethod === 'cash'
        ? 'เงินสด'
        : ord.paymentMethod === 'transfer'
        ? 'โอนเงิน'
        : ord.paymentMethod === 'credit'
        ? 'บัตรเครดิต'
        : ord.paymentMethod;

    const statusLabel =
      ord.status === 'served'
        ? 'เสร็จสมบูรณ์'
        : ord.status === 'ready'
        ? 'พร้อมเสิร์ฟ'
        : ord.status === 'cooking'
        ? 'กำลังปรุง'
        : ord.status === 'cancelled'
        ? 'ยกเลิกบิล'
        : ord.status;

    const dateFormatted = new Date(ord.createdAt).toLocaleString('th-TH');

    let notes = ord.discountNote || '';
    if (ord.isFullTaxInvoiceRequested && ord.customerTaxInfo) {
      notes += ` [ใบกำกับภาษี: ${ord.customerTaxInfo.companyName} (${ord.customerTaxInfo.taxId})]`;
    }
    if (ord.cancelledBy) {
      notes += ` [ยกเลิกโดย: ${ord.cancelledBy.userName} เหตุผล: ${ord.cancelReason || '-'}]`;
    }

    return [
      ord.orderNumber,
      dateFormatted,
      branch.name,
      ord.orderType === 'dine-in' ? 'ทานที่ร้าน' : ord.orderType === 'takeaway' ? 'สั่งกลับบ้าน' : 'เดลิเวอรี',
      ord.tableNumber || '-',
      itemsSummary,
      totalQty,
      ord.subtotal,
      ord.discountAmount || 0,
      ord.vatAmount || 0,
      ord.grandTotal,
      paymentLabel,
      statusLabel,
      notes
    ];
  });

  // Clear previous content and write new
  await clearSheetValues(accessToken, spreadsheetId, `'${sheetTitle}'!A1:Z5000`);
  await writeSheetValues(accessToken, spreadsheetId, `'${sheetTitle}'!A1`, [headers, ...rows]);

  return rows.length;
}

/**
 * Format and export Inventory / Stock to Google Sheets
 */
export async function syncInventoryToGoogleSheets(
  accessToken: string,
  spreadsheetId: string,
  ingredients: Ingredient[],
  branch: Branch,
  sheetTitle: string = 'สต็อกวัตถุดิบ (Inventory)'
): Promise<number> {
  await ensureSheetExists(accessToken, spreadsheetId, sheetTitle);

  const headers = [
    'รหัสวัตถุดิบ (ID)',
    'ชื่อวัตถุดิบ (Ingredient Name)',
    'หมวดหมู่วัตถุดิบ (Category)',
    'สต็อกคงเหลือ (Current Stock)',
    'หน่วยนับ (Unit)',
    'เกณฑ์เตือนสต็อกต่ำ (Min Alert)',
    'ราคาทุน/หน่วย (Unit Cost THB)',
    'มูลค่าสต็อกรวม (Total Valuation THB)',
    'สถานะสต็อก (Stock Status)',
    'บาร์โค้ด (Barcode)',
    'สาขา (Branch)',
    'อัปเดตล่าสุด (Last Synced)'
  ];

  const nowStr = new Date().toLocaleString('th-TH');

  const rows = ingredients.map(ing => {
    const isLow = ing.currentStock <= ing.minStockAlert;
    const isOut = ing.currentStock <= 0;
    const totalVal = Math.round(ing.currentStock * ing.unitCost * 100) / 100;
    const statusText = isOut ? '🚨 สต็อกหมด' : isLow ? '⚠️ สต็อกต่ำกว่าเกณฑ์' : '✅ สต็อกปกติ';

    return [
      ing.id,
      ing.name,
      ing.category,
      ing.currentStock,
      ing.unit,
      ing.minStockAlert,
      ing.unitCost,
      totalVal,
      statusText,
      ing.barcode || '-',
      branch.name,
      nowStr
    ];
  });

  // Clear previous content and write new
  await clearSheetValues(accessToken, spreadsheetId, `'${sheetTitle}'!A1:Z5000`);
  await writeSheetValues(accessToken, spreadsheetId, `'${sheetTitle}'!A1`, [headers, ...rows]);

  return rows.length;
}

/**
 * Format and export Menu Recipe Costing & Margin Analysis to Google Sheets
 */
export async function syncRecipeCostingToGoogleSheets(
  accessToken: string,
  spreadsheetId: string,
  menuItems: MenuItem[],
  ingredients: Ingredient[],
  sheetTitle: string = 'ต้นทุนเมนู (Recipes)'
): Promise<number> {
  await ensureSheetExists(accessToken, spreadsheetId, sheetTitle);

  const headers = [
    'รหัสเมนู (Item ID)',
    'ชื่อเมนู (Menu Name)',
    'หมวดหมู่ (Category)',
    'ราคาขายหน้าร้าน (Selling Price THB)',
    'ต้นทุนวัตถุดิบเฉลี่ย (Food Cost THB)',
    'กำไรขั้นต้น (Gross Profit THB)',
    'อัตรากำไร (Margin %)',
    'สัดส่วนต้นทุน (Food Cost %)',
    'สถานะความคุ้มค่า (Profitability)',
    'ส่วนประกอบในสูตร (Recipe Ingredients)'
  ];

  const ingMap = new Map(ingredients.map(i => [i.id, i]));

  const rows = menuItems.map(item => {
    let calculatedCost = 0;
    const recipeDetails: string[] = [];

    (item.recipe || []).forEach(r => {
      const ing = ingMap.get(r.ingredientId);
      if (ing) {
        let costPart = 0;
        if (ing.unit === 'kg' && r.recipeUnit === 'g') {
          costPart = (r.amountNeeded / 1000) * ing.unitCost;
        } else if (ing.unit === 'l' && r.recipeUnit === 'ml') {
          costPart = (r.amountNeeded / 1000) * ing.unitCost;
        } else {
          costPart = r.amountNeeded * ing.unitCost;
        }
        calculatedCost += costPart;
        recipeDetails.push(`${ing.name}: ${r.amountNeeded} ${r.recipeUnit || ing.unit} (~${costPart.toFixed(1)}บ.)`);
      }
    });

    const finalCost = calculatedCost > 0 ? calculatedCost : item.costPrice || 0;
    const grossProfit = item.price - finalCost;
    const marginPct = item.price > 0 ? Math.round((grossProfit / item.price) * 100) : 0;
    const foodCostPct = item.price > 0 ? Math.round((finalCost / item.price) * 100) : 0;

    let profitStatus = '⭐⭐⭐ กำไรดีเยี่ยม';
    if (foodCostPct > 45) {
      profitStatus = '⚠️ ต้นทุนสูงเกินเกณฑ์';
    } else if (foodCostPct > 35) {
      profitStatus = '⭐ กำไรปานกลาง';
    }

    return [
      item.id,
      item.name,
      item.category,
      item.price,
      Math.round(finalCost * 100) / 100,
      Math.round(grossProfit * 100) / 100,
      `${marginPct}%`,
      `${foodCostPct}%`,
      profitStatus,
      recipeDetails.join(' | ') || 'ยังไม่ได้กำหนดสูตร'
    ];
  });

  await clearSheetValues(accessToken, spreadsheetId, `'${sheetTitle}'!A1:Z5000`);
  await writeSheetValues(accessToken, spreadsheetId, `'${sheetTitle}'!A1`, [headers, ...rows]);

  return rows.length;
}

/**
 * Format and export Stock Adjustments & Waste Logs to Google Sheets
 */
export async function syncMovementsToGoogleSheets(
  accessToken: string,
  spreadsheetId: string,
  adjustments: StockAdjustmentLog[],
  wasteLogs: WasteLog[],
  sheetTitle: string = 'ประวัติสต็อก (Movements)'
): Promise<number> {
  await ensureSheetExists(accessToken, spreadsheetId, sheetTitle);

  const headers = [
    'วัน-เวลา (Timestamp)',
    'ประเภทรายการ (Movement Type)',
    'ชื่อวัตถุดิบ (Ingredient)',
    'จำนวนเปลี่ยนแปลง (Change Qty)',
    'หน่วยนับ (Unit)',
    'สต็อกก่อนหน้า (Previous)',
    'สต็อกคงเหลือใหม่ (New Stock)',
    'มูลค่าความสูญเสีย (Loss Cost THB)',
    'สาเหตุ / เหตุผล (Reason)',
    'ผู้บันทึกรายการ (Staff)',
    'หมายเหตุเพิ่มเติม (Notes)'
  ];

  const adjRows = adjustments.map(adj => {
    const isAdd = adj.changeQty > 0;
    return [
      new Date(adj.timestamp).toLocaleString('th-TH'),
      isAdd ? '➕ เติมสต็อก (Restock)' : '✏️ ปรับปรุงยอดสต็อก (Adjustment)',
      adj.ingredientName,
      adj.changeQty > 0 ? `+${adj.changeQty}` : adj.changeQty,
      adj.unit,
      adj.previousStock,
      adj.newStock,
      '-',
      adj.reason,
      adj.userName || 'พนักงาน',
      adj.notes || '-'
    ];
  });

  const wasteRows = wasteLogs.map(w => {
    return [
      new Date(w.loggedDate).toLocaleDateString('th-TH'),
      '🗑️ ขยะ/ของเสีย (Waste Log)',
      w.ingredientName,
      `-${w.quantity}`,
      w.unit,
      '-',
      '-',
      w.totalCostLoss,
      w.reason,
      w.reportedBy || 'พนักงาน',
      w.notes || '-'
    ];
  });

  const allRows = [...adjRows, ...wasteRows];

  await clearSheetValues(accessToken, spreadsheetId, `'${sheetTitle}'!A1:Z5000`);
  await writeSheetValues(accessToken, spreadsheetId, `'${sheetTitle}'!A1`, [headers, ...allRows]);

  return allRows.length;
}

/**
 * Master One-Click All Datasets Sync
 */
export async function syncAllDatasetsToSpreadsheet(
  accessToken: string,
  spreadsheetId: string,
  data: {
    orders: Order[];
    ingredients: Ingredient[];
    menuItems: MenuItem[];
    adjustments: StockAdjustmentLog[];
    wasteLogs: WasteLog[];
    branch: Branch;
  }
): Promise<{
  salesCount: number;
  inventoryCount: number;
  recipeCount: number;
  movementsCount: number;
  url: string;
}> {
  const salesCount = await syncSalesToGoogleSheets(accessToken, spreadsheetId, data.orders, data.branch);
  const inventoryCount = await syncInventoryToGoogleSheets(accessToken, spreadsheetId, data.ingredients, data.branch);
  const recipeCount = await syncRecipeCostingToGoogleSheets(accessToken, spreadsheetId, data.menuItems, data.ingredients);
  const movementsCount = await syncMovementsToGoogleSheets(accessToken, spreadsheetId, data.adjustments, data.wasteLogs);

  return {
    salesCount,
    inventoryCount,
    recipeCount,
    movementsCount,
    url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
  };
}

/**
 * Utility to convert 2D array to CSV formatted string with UTF-8 BOM for Excel support
 */
function convertToCSVString(rows: any[][]): string {
  const processRow = (row: any[]) => {
    return row
      .map(val => {
        if (val === null || val === undefined) return '""';
        const str = String(val).replace(/"/g, '""');
        return `"${str}"`;
      })
      .join(',');
  };
  return '\uFEFF' + rows.map(processRow).join('\r\n');
}

function triggerFileDownload(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadSalesCsv(orders: Order[], branch: Branch) {
  const headers = [
    'เลขที่บิล (Order No)',
    'วัน-เวลาทำรายการ (Date & Time)',
    'สาขา (Branch)',
    'ประเภทออเดอร์ (Type)',
    'โต๊ะ / แชนแนล (Table)',
    'รายการอาหาร (Items Detail)',
    'จำนวนรวม (Qty)',
    'ยอดรวมก่อนลด (Subtotal THB)',
    'ส่วนลด (Discount THB)',
    'ภาษีมูลค่าเพิ่ม (VAT 7% THB)',
    'ยอดสุทธิ (Grand Total THB)',
    'วิธีชำระเงิน (Payment)',
    'สถานะออเดอร์ (Status)',
    'หมายเหตุ / ใบกำกับภาษี (Notes)'
  ];

  const rows = orders.map(ord => {
    const itemsSummary = (ord.items || [])
      .map(item => `${item.menuItem?.name || 'อาหาร'} x${item.quantity}`)
      .join('; ');
    const totalQty = (ord.items || []).reduce((sum, item) => sum + (item.quantity || 1), 0);

    return [
      ord.orderNumber,
      new Date(ord.createdAt).toLocaleString('th-TH'),
      branch.name,
      ord.orderType,
      ord.tableNumber || '-',
      itemsSummary,
      totalQty,
      ord.subtotal,
      ord.discountAmount || 0,
      ord.vatAmount || 0,
      ord.grandTotal,
      ord.paymentMethod,
      ord.status,
      ord.discountNote || ''
    ];
  });

  const csv = convertToCSVString([headers, ...rows]);
  triggerFileDownload(csv, `sales_${branch.id}_${new Date().toISOString().slice(0, 10)}.csv`);
}

export function downloadInventoryCsv(ingredients: Ingredient[], branch: Branch) {
  const headers = [
    'รหัสวัตถุดิบ (ID)',
    'ชื่อวัตถุดิบ (Ingredient Name)',
    'หมวดหมู่วัตถุดิบ (Category)',
    'สต็อกคงเหลือ (Current Stock)',
    'หน่วยนับ (Unit)',
    'เกณฑ์เตือนสต็อกต่ำ (Min Alert)',
    'ราคาทุน/หน่วย (Unit Cost THB)',
    'มูลค่าสต็อกรวม (Total Valuation THB)',
    'สถานะสต็อก (Stock Status)',
    'บาร์โค้ด (Barcode)',
    'สาขา (Branch)'
  ];

  const rows = ingredients.map(ing => {
    const isLow = ing.currentStock <= ing.minStockAlert;
    const isOut = ing.currentStock <= 0;
    const totalVal = Math.round(ing.currentStock * ing.unitCost * 100) / 100;
    const statusText = isOut ? 'สต็อกหมด' : isLow ? 'สต็อกต่ำกว่าเกณฑ์' : 'สต็อกปกติ';

    return [
      ing.id,
      ing.name,
      ing.category,
      ing.currentStock,
      ing.unit,
      ing.minStockAlert,
      ing.unitCost,
      totalVal,
      statusText,
      ing.barcode || '-',
      branch.name
    ];
  });

  const csv = convertToCSVString([headers, ...rows]);
  triggerFileDownload(csv, `inventory_${branch.id}_${new Date().toISOString().slice(0, 10)}.csv`);
}

