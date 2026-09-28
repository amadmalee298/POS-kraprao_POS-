import { initializeApp, getApps } from 'firebase/app';
import {
  Auth,
  browserPopupRedirectResolver,
  getAuth,
  GoogleAuthProvider,
  inMemoryPersistence,
  initializeAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  User
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { Order, Ingredient, MenuItem, Branch, StockAdjustmentLog, WasteLog } from '../types';
import { countsAsRevenue, isUnpaid, orderVatBreakdown } from '../utils/orderUtils';
import { effectiveUnitCost, recipeCost } from '../utils/recipeUtils';
import { reasonLabel } from '../utils/stockHistory';
import { stockTypeLabel, stockTypeOf } from '../utils/stockTypes';

/**
 * Google sign-in for Sheets runs in its own Firebase app instance. Signing in with a Google account
 * on the shop's own auth would replace the shop account (and its access to the shop's data), and
 * signing out of Google would sign the shop out. Kept in memory only: nothing stays on the device.
 */
const SHEETS_APP_NAME = 'google-sheets';
const sheetsApp = getApps().find(a => a.name === SHEETS_APP_NAME) || initializeApp(firebaseConfig, SHEETS_APP_NAME);
function sheetsAuth(): Auth {
  try {
    return initializeAuth(sheetsApp, { persistence: inMemoryPersistence, popupRedirectResolver: browserPopupRedirectResolver });
  } catch {
    // Already initialised (e.g. hot reload)
    return getAuth(sheetsApp);
  }
}
export const auth = sheetsAuth();

/**
 * Only files this app creates or the user opens with it (drive.file). The Sheets API works with
 * it; access to the rest of the user's Drive is not needed.
 */
export const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

// The first sign-in always shows the permission screen (a skipped screen can hand back a token
// without Drive access); after the shop has granted it, reconnecting is one tap on the account.
const GRANTED_KEY = 'POS_GSHEETS_GRANTED';
const SESSION_KEY = 'POS_GSHEETS_SESSION';

const readStore = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const writeStore = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // kept for this page only
  }
};

const makeProvider = () => {
  const provider = new GoogleAuthProvider();
  SCOPES.forEach(scope => provider.addScope(scope));
  const email = readStore(GRANTED_KEY);
  provider.setCustomParameters(email ? { prompt: 'select_account', login_hint: email } : { prompt: 'consent select_account' });
  return provider;
};

/** What to tell the user when Google gave a token without permission to write the file */
export const MISSING_SCOPE_MESSAGE =
  'Google ยังไม่ได้ให้สิทธิ์เขียนไฟล์: กดออกจากระบบ Google แล้ว Sign in ใหม่ ในหน้าขออนุญาตของ Google ให้ติ๊กช่อง “ดู แก้ไข สร้าง และลบไฟล์ Google ไดรฟ์ที่คุณใช้กับแอปนี้” (See, edit, create and delete only the specific Google Drive files you use with this app) แล้วกด Continue';

/** True when the token carries the Drive permission the export needs */
export async function hasDriveFileScope(accessToken: string): Promise<boolean> {
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`);
    if (!res.ok) return true; // cannot tell: let the API call report it
    const info = await res.json();
    return String(info.scope || '').split(' ').some((sc: string) => SCOPES.includes(sc) || sc === 'https://www.googleapis.com/auth/drive');
  } catch {
    return true;
  }
}

/** Google's "insufficient scopes" API error */
export const isScopeError = (message: string) => /insufficient authentication scopes|insufficientPermissions|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(message || '');

/*
 * The Google token is kept on this device until it expires (Google gives it for one hour), so a
 * page reload or the phone reopening the tab does not sign the shop out. It only reaches the
 * spreadsheets this app created (drive.file) and is removed on sign-out.
 */
let isSigningIn = false;
let cachedAccessToken: string | null = null;
let cachedGoogleUser: any | null = null;
let tokenExpiresAt = 0;

const TOKEN_MARGIN_MS = 2 * 60 * 1000;

function rememberSession(token: string, user: any, expiresInSec = 3600) {
  cachedAccessToken = token;
  cachedGoogleUser = user ? { uid: user.uid, displayName: user.displayName, email: user.email, photoURL: user.photoURL } : null;
  tokenExpiresAt = Date.now() + expiresInSec * 1000 - TOKEN_MARGIN_MS;
  writeStore(SESSION_KEY, JSON.stringify({ token, user: cachedGoogleUser, expiresAt: tokenExpiresAt }));
  if (cachedGoogleUser?.email) writeStore(GRANTED_KEY, cachedGoogleUser.email);
}

function forgetSession() {
  cachedAccessToken = null;
  cachedGoogleUser = null;
  tokenExpiresAt = 0;
  writeStore(SESSION_KEY, null);
}

// Pick up the session this device already has
(() => {
  try {
    const saved = JSON.parse(readStore(SESSION_KEY) || 'null');
    if (saved?.token && saved.expiresAt > Date.now()) {
      cachedAccessToken = saved.token;
      cachedGoogleUser = saved.user;
      tokenExpiresAt = saved.expiresAt;
    } else if (saved) {
      writeStore(SESSION_KEY, null);
    }
  } catch {
    writeStore(SESSION_KEY, null);
  }
})();

const tokenValid = () => !!cachedAccessToken && Date.now() < tokenExpiresAt;

/** The Google account this device connected before (to offer a one-tap reconnect) */
export const getRememberedGoogleEmail = (): string | null => readStore(GRANTED_KEY);

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
  if (!firebaseConfig.oAuthClientId) {
    throw new Error(
      'ยังไม่ได้เพิ่มโดเมนนี้ใน Firebase: Firebase Console → Authentication → Settings → Authorized domains แล้วเพิ่มโดเมนของเว็บ (วิธีสำรองต้องใช้ OAuth Client ID ซึ่งยังไม่ได้ตั้ง)'
    );
  }
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
          if (!(await hasDriveFileScope(token))) {
            writeStore(GRANTED_KEY, null);
            reject(new Error(MISSING_SCOPE_MESSAGE));
            return;
          }

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

          rememberSession(token, userObj, Number(tokenResponse.expires_in) || 3600);
          resolve({ user: userObj, accessToken: token });
        },
        error_callback: (err: any) => {
          console.error('[GIS OAuth] error_callback:', err);
          reject(new Error(err.message || 'Google OAuth authorization was cancelled or failed'));
        }
      });

      const email = readStore(GRANTED_KEY);
      client.requestAccessToken(email ? { prompt: '', login_hint: email } : { prompt: 'consent' });
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
      if (tokenValid()) {
        if (onAuthSuccess) onAuthSuccess(cachedGoogleUser || user, cachedAccessToken!);
      } else if (!isSigningIn) {
        if (onAuthFailure) onAuthFailure();
      }
    } else if (!tokenValid()) {
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
      const result = await signInWithPopup(auth, makeProvider());
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (!credential?.accessToken) {
        throw new Error('ไม่สามารถรับ Access Token จาก Google OAuth ได้');
      }

      if (!(await hasDriveFileScope(credential.accessToken))) {
        await signOut(auth).catch(() => {});
        // Ask with the permission screen next time
        writeStore(GRANTED_KEY, null);
        throw new Error(MISSING_SCOPE_MESSAGE);
      }
      rememberSession(credential.accessToken, result.user);
      return { user: cachedGoogleUser, accessToken: credential.accessToken };
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

      if (firebaseErr?.code === 'auth/operation-not-allowed') {
        throw new Error('ยังไม่ได้เปิดการเข้าสู่ระบบด้วย Google: Firebase Console → Authentication → Sign-in method → Google → Enable');
      }
      if (firebaseErr?.code === 'auth/popup-blocked') {
        throw new Error('เบราว์เซอร์บล็อกหน้าต่างเข้าสู่ระบบ: อนุญาต pop-up ของเว็บนี้แล้วลองใหม่');
      }
      if (firebaseErr?.code === 'auth/popup-closed-by-user' || firebaseErr?.code === 'auth/cancelled-popup-request') {
        throw new Error('ปิดหน้าต่างเข้าสู่ระบบก่อนเสร็จ ลองใหม่อีกครั้ง');
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
  rememberSession(token.trim(), {
    uid: 'manual-token-user',
    displayName: email ? email.split('@')[0] : 'Authorized Google User',
    email: email || '',
    photoURL: ''
  });
};

/** The token while it is still valid (null once Google's hour is up) */
export const getGoogleAccessToken = async (): Promise<string | null> => {
  if (tokenValid()) return cachedAccessToken;
  if (cachedAccessToken) forgetSession();
  return null;
};

export const getGoogleUser = (): any | null => (tokenValid() ? cachedGoogleUser : null);

export const googleSignOut = async () => {
  try {
    await signOut(auth);
  } catch (e) {
    // Ignore if not signed into Firebase
  }
  forgetSession();
  writeStore(GRANTED_KEY, null);
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
  sheetTitles: string[] = ['ยอดขาย (Sales)', 'สต็อก (Inventory)', 'ต้นทุนเมนู (Recipes)', 'ประวัติสต็อก (Movements)']
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
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodedRange}?valueInputOption=RAW`,
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

// ---------------------------------------------------------------------------------------------
// Rows shared by the Google Sheets export and the CSV downloads
// ---------------------------------------------------------------------------------------------

const ORDER_STATUS_TH: Record<string, string> = {
  'pending-qr': 'QR รออนุมัติ',
  pending: 'รอทำ',
  cooking: 'กำลังปรุง',
  ready: 'พร้อมเสิร์ฟ',
  served: 'เสิร์ฟแล้ว',
  cancelled: 'ยกเลิก'
};
const ORDER_TYPE_TH: Record<string, string> = { 'dine-in': 'ทานที่ร้าน', takeaway: 'กลับบ้าน', delivery: 'เดลิเวอรี' };
const PAYMENT_TH: Record<string, string> = { cash: 'เงินสด', promptpay: 'พร้อมเพย์', transfer: 'โอนเงิน', credit: 'บัตร', truemoney: 'TrueMoney' };

/** Sortable local date-time, e.g. 2026-09-28 11:42 */
const stamp = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso || '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};
const money2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

function salesSheet(orders: Order[], branch: Branch, vatRate: number): (string | number)[][] {
  const headers = [
    'เลขที่บิล',
    'วันเวลา',
    'สาขา',
    'ประเภท',
    'โต๊ะ',
    'รายการอาหาร',
    'จำนวน',
    'ยอดก่อนส่วนลด',
    'ส่วนลด',
    'ยอดก่อน VAT',
    `VAT ${vatRate}%`,
    'ยอดรวม',
    'วิธีชำระ',
    'การชำระเงิน',
    'สถานะออเดอร์',
    'นับเป็นรายได้',
    'หมายเหตุ'
  ];
  const rows = [...orders]
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
    .map(ord => {
      const { base, vat } = orderVatBreakdown(ord);
      let notes = ord.discountNote || '';
      if (ord.isFullTaxInvoiceRequested && ord.customerTaxInfo) notes += ` [ใบกำกับภาษี: ${ord.customerTaxInfo.companyName} (${ord.customerTaxInfo.taxId})]`;
      if (ord.cancelledBy) notes += ` [ยกเลิกโดย ${ord.cancelledBy.userName}: ${ord.cancelReason || '-'}]`;
      return [
        ord.orderNumber,
        stamp(ord.createdAt),
        branch.name,
        ORDER_TYPE_TH[ord.orderType] || ord.orderType,
        ord.tableNumber || '-',
        (ord.items || [])
          .map(i => `${i.menuItem?.name || 'อาหาร'} x${i.quantity}${i.proteinChoice ? ` (${i.proteinChoice.name})` : ''}`)
          .join(', '),
        (ord.items || []).reduce((sum, i) => sum + (i.quantity || 1), 0),
        money2(ord.subtotal),
        money2(ord.discountAmount || 0),
        base,
        vat,
        money2(ord.grandTotal),
        PAYMENT_TH[ord.paymentMethod] || ord.paymentMethod || '-',
        isUnpaid(ord) ? 'ค้างชำระ' : 'ชำระแล้ว',
        ORDER_STATUS_TH[ord.status] || ord.status,
        countsAsRevenue(ord) ? 'ใช่' : 'ไม่',
        notes.trim()
      ];
    });
  return [headers, ...rows];
}

function inventorySheet(ingredients: Ingredient[], branch: Branch): (string | number)[][] {
  const headers = ['รหัส', 'ชื่อ', 'ประเภทบัญชี', 'หมวดหมู่', 'คงเหลือ', 'หน่วย', 'จุดเตือน', 'ต้นทุน/หน่วย', 'มูลค่าคงเหลือ', 'สถานะ', 'บาร์โค้ด', 'สาขา'];
  const rows = ingredients.map(ing => {
    const cost = effectiveUnitCost(ing);
    const status = ing.currentStock <= 0 ? 'หมด' : ing.currentStock <= ing.minStockAlert ? 'ต่ำกว่าจุดเตือน' : 'ปกติ';
    return [
      ing.id,
      ing.name,
      stockTypeLabel(stockTypeOf(ing)),
      ing.category,
      ing.currentStock,
      ing.unit,
      ing.minStockAlert,
      Math.round(cost * 10000) / 10000,
      money2(ing.currentStock * cost),
      status,
      ing.barcode || '-',
      branch.name
    ];
  });
  return [headers, ...rows];
}

function recipeSheet(menuItems: MenuItem[], ingredients: Ingredient[]): (string | number)[][] {
  const headers = ['รหัสเมนู', 'เมนู', 'หมวดหมู่', 'ราคาขาย', 'ต้นทุนวัตถุดิบ', 'กำไรขั้นต้น', 'อัตรากำไร %', 'Food cost %', 'ประเมิน', 'ส่วนประกอบ'];
  const byId = new Map(ingredients.map(i => [i.id, i]));
  const rows = menuItems.map(item => {
    // Same costing as the menu and accounting pages (unit conversion, per-unit cost)
    const fromRecipe = recipeCost(item.recipe, ingredients);
    const cost = fromRecipe > 0 ? fromRecipe : item.costPrice || 0;
    const profit = item.price - cost;
    const foodCostPct = item.price > 0 ? Math.round((cost / item.price) * 1000) / 10 : 0;
    return [
      item.id,
      item.name,
      item.category,
      item.price,
      money2(cost),
      money2(profit),
      item.price > 0 ? Math.round((profit / item.price) * 1000) / 10 : 0,
      foodCostPct,
      !cost ? 'ยังไม่มีต้นทุน' : foodCostPct > 45 ? 'ต้นทุนสูงเกินเกณฑ์' : foodCostPct > 35 ? 'ปานกลาง' : 'ดี',
      (item.recipe || [])
        .map(r => `${byId.get(r.ingredientId)?.name || 'วัตถุดิบที่ถูกลบ'} ${r.amountNeeded} ${r.recipeUnit || byId.get(r.ingredientId)?.unit || ''}`)
        .join(' | ') || 'ยังไม่ได้กำหนดสูตร'
    ];
  });
  return [headers, ...rows];
}

function movementSheet(adjustments: StockAdjustmentLog[], wasteLogs: WasteLog[]): (string | number)[][] {
  const headers = ['วันเวลา', 'ประเภท', 'วัตถุดิบ', 'เปลี่ยนแปลง', 'หน่วย', 'ก่อน', 'หลัง', 'มูลค่าที่เสีย', 'เหตุผล', 'ผู้บันทึก', 'หมายเหตุ'];
  const adj = adjustments.map(a => [
    stamp(a.timestamp),
    a.changeQty > 0 ? 'รับเข้า/เพิ่ม' : 'ปรับลด',
    a.ingredientName,
    a.changeQty,
    a.unit,
    a.previousStock,
    a.newStock,
    '',
    reasonLabel(String(a.reason)),
    a.userName || '-',
    a.notes || ''
  ]);
  const waste = wasteLogs.map(w => [
    stamp(w.loggedDate),
    'ของเสีย',
    w.ingredientName,
    -Math.abs(w.quantity),
    w.unit,
    '',
    '',
    money2(w.totalCostLoss),
    reasonLabel(String(w.reason)),
    w.reportedBy || '-',
    w.notes || ''
  ]);
  return [headers, ...[...adj, ...waste].sort((a, b) => String(a[0]).localeCompare(String(b[0])))];
}

/** Replace a tab's content (the whole tab is cleared first, so no old rows are left behind) */
async function replaceSheet(accessToken: string, spreadsheetId: string, sheetTitle: string, values: (string | number)[][]) {
  await ensureSheetExists(accessToken, spreadsheetId, sheetTitle);
  await clearSheetValues(accessToken, spreadsheetId, `'${sheetTitle}'`);
  await writeSheetValues(accessToken, spreadsheetId, `'${sheetTitle}'!A1`, values);
  return values.length - 1;
}

export const syncSalesToGoogleSheets = (accessToken: string, spreadsheetId: string, orders: Order[], branch: Branch, vatRate = 7, sheetTitle = 'ยอดขาย (Sales)') =>
  replaceSheet(accessToken, spreadsheetId, sheetTitle, salesSheet(orders, branch, vatRate));

export const syncInventoryToGoogleSheets = (accessToken: string, spreadsheetId: string, ingredients: Ingredient[], branch: Branch, sheetTitle = 'สต็อก (Inventory)') =>
  replaceSheet(accessToken, spreadsheetId, sheetTitle, inventorySheet(ingredients, branch));

export const syncRecipeCostingToGoogleSheets = (accessToken: string, spreadsheetId: string, menuItems: MenuItem[], ingredients: Ingredient[], sheetTitle = 'ต้นทุนเมนู (Recipes)') =>
  replaceSheet(accessToken, spreadsheetId, sheetTitle, recipeSheet(menuItems, ingredients));

export const syncMovementsToGoogleSheets = (
  accessToken: string,
  spreadsheetId: string,
  adjustments: StockAdjustmentLog[],
  wasteLogs: WasteLog[],
  sheetTitle = 'ประวัติสต็อก (Movements)'
) => replaceSheet(accessToken, spreadsheetId, sheetTitle, movementSheet(adjustments, wasteLogs));

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
    vatRate?: number;
  }
) {
  const salesCount = await syncSalesToGoogleSheets(accessToken, spreadsheetId, data.orders, data.branch, data.vatRate);
  const inventoryCount = await syncInventoryToGoogleSheets(accessToken, spreadsheetId, data.ingredients, data.branch);
  const recipeCount = await syncRecipeCostingToGoogleSheets(accessToken, spreadsheetId, data.menuItems, data.ingredients);
  const movementsCount = await syncMovementsToGoogleSheets(accessToken, spreadsheetId, data.adjustments, data.wasteLogs);
  return { salesCount, inventoryCount, recipeCount, movementsCount, url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` };
}

/** Every sheet the shop's spreadsheet gets, as rows */
export function buildAllSheets(data: {
  orders: Order[];
  ingredients: Ingredient[];
  menuItems: MenuItem[];
  adjustments: StockAdjustmentLog[];
  wasteLogs: WasteLog[];
  branch: Branch;
  vatRate?: number;
}): { title: string; values: (string | number)[][] }[] {
  return [
    { title: 'ยอดขาย (Sales)', values: salesSheet(data.orders, data.branch, data.vatRate ?? 7) },
    { title: 'สต็อก (Inventory)', values: inventorySheet(data.ingredients, data.branch) },
    { title: 'ต้นทุนเมนู (Recipes)', values: recipeSheet(data.menuItems, data.ingredients) },
    { title: 'ประวัติสต็อก (Movements)', values: movementSheet(data.adjustments, data.wasteLogs) }
  ];
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

export function downloadSalesCsv(orders: Order[], branch: Branch, vatRate = 7) {
  triggerFileDownload(convertToCSVString(salesSheet(orders, branch, vatRate)), `sales_${branch.id}_${new Date().toISOString().slice(0, 10)}.csv`);
}

export function downloadInventoryCsv(ingredients: Ingredient[], branch: Branch) {
  triggerFileDownload(convertToCSVString(inventorySheet(ingredients, branch)), `inventory_${branch.id}_${new Date().toISOString().slice(0, 10)}.csv`);
}
