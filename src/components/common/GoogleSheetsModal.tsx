import React, { useState, useEffect } from 'react';
import {
  X,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  Plus,
  Table,
  Package,
  BookOpen,
  History,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  LogOut,
  FolderOpen
} from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import {
  initGoogleAuth,
  googleSignIn,
  googleSignOut,
  getGoogleAccessToken,
  getGoogleUser,
  listUserSpreadsheets,
  createGoogleSpreadsheet,
  syncAllDatasetsToSpreadsheet,
  syncSalesToGoogleSheets,
  syncInventoryToGoogleSheets,
  syncRecipeCostingToGoogleSheets,
  syncMovementsToGoogleSheets,
  GoogleDriveFile
} from '../../services/googleSheetsService';
import { User } from 'firebase/auth';

interface GoogleSheetsModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultDataset?: 'all' | 'sales' | 'inventory' | 'recipes' | 'movements';
}

export const GoogleSheetsModal: React.FC<GoogleSheetsModalProps> = ({
  isOpen,
  onClose,
  defaultDataset = 'all'
}) => {
  const {
    orders,
    ingredients,
    menuItems,
    stockAdjustmentLogs,
    wasteLogs,
    currentBranch
  } = usePOS();

  const [googleUser, setGoogleUser] = useState<User | null>(getGoogleUser());
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Spreadsheets list & target selection
  const [spreadsheets, setSpreadsheets] = useState<GoogleDriveFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [targetMode, setTargetMode] = useState<'new' | 'existing'>('new');
  const [selectedSpreadsheetId, setSelectedSpreadsheetId] = useState<string>('');
  const [newSheetTitle, setNewSheetTitle] = useState<string>(
    `ครัวกะเพรา POS - ${currentBranch.name} (${new Date().toLocaleDateString('th-TH')})`
  );

  // Dataset toggles
  const [syncSales, setSyncSales] = useState(true);
  const [syncInventory, setSyncInventory] = useState(true);
  const [syncRecipes, setSyncRecipes] = useState(true);
  const [syncMovements, setSyncMovements] = useState(true);

  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    success: boolean;
    url?: string;
    message?: string;
    details?: string[];
  } | null>(null);

  // Confirmation dialog for overwriting data (Workspace guideline compliance)
  const [showConfirmOverwrite, setShowConfirmOverwrite] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    // Initialize Auth listener
    const unsubscribe = initGoogleAuth(
      (user, token) => {
        setGoogleUser(user);
        setAccessToken(token);
        fetchSpreadsheets(token);
      },
      () => {
        setGoogleUser(null);
        setAccessToken(null);
      }
    );

    // Check cached token
    getGoogleAccessToken().then(token => {
      if (token) {
        setAccessToken(token);
        setGoogleUser(getGoogleUser());
        fetchSpreadsheets(token);
      }
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, [isOpen]);

  const fetchSpreadsheets = async (token: string) => {
    setIsLoadingFiles(true);
    try {
      const files = await listUserSpreadsheets(token);
      setSpreadsheets(files);
      if (files.length > 0 && !selectedSpreadsheetId) {
        setSelectedSpreadsheetId(files[0].id);
      }
    } catch (err: any) {
      console.warn('Failed to load user spreadsheets:', err);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const handleSignIn = async () => {
    setIsAuthenticating(true);
    setAuthError(null);
    try {
      const res = await googleSignIn();
      if (res) {
        setGoogleUser(res.user);
        setAccessToken(res.accessToken);
        await fetchSpreadsheets(res.accessToken);
      }
    } catch (err: any) {
      console.error('Sign-in error:', err);
      setAuthError(err.message || 'การเชื่อมต่อ Google ผิดพลาด กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsAuthenticating(false);
    }
  };

  const handleSignOut = async () => {
    await googleSignOut();
    setGoogleUser(null);
    setAccessToken(null);
    setSpreadsheets([]);
    setSyncResult(null);
  };

  const startSyncProcess = () => {
    if (targetMode === 'existing') {
      setShowConfirmOverwrite(true);
    } else {
      executeSync();
    }
  };

  const executeSync = async () => {
    setShowConfirmOverwrite(false);
    if (!accessToken) {
      setAuthError('กรุณาลงชื่อเข้าใช้ Google ก่อนทำการซิงค์');
      return;
    }

    setIsSyncing(true);
    setSyncResult(null);
    const syncLogs: string[] = [];

    try {
      let targetId = selectedSpreadsheetId;
      let sheetUrl = '';

      if (targetMode === 'new') {
        const titleToUse = newSheetTitle.trim() || `ครัวกะเพรา POS - ${new Date().toLocaleDateString('th-TH')}`;
        const newSheet = await createGoogleSpreadsheet(accessToken, titleToUse);
        targetId = newSheet.spreadsheetId;
        sheetUrl = newSheet.spreadsheetUrl;
        syncLogs.push(`✅ สร้างไฟล์ Google Spreadsheet ใหม่สำเร็จ: "${titleToUse}"`);
      } else {
        sheetUrl = `https://docs.google.com/spreadsheets/d/${targetId}/edit`;
      }

      // Sync datasets according to checkboxes
      if (syncSales) {
        const count = await syncSalesToGoogleSheets(accessToken, targetId, orders, currentBranch);
        syncLogs.push(`📊 ส่งออกรายการบิลขาย (Sales): ${count} บิล`);
      }

      if (syncInventory) {
        const count = await syncInventoryToGoogleSheets(accessToken, targetId, ingredients, currentBranch);
        syncLogs.push(`📦 ส่งออกข้อมูลสต็อกและมูลค่า (Inventory): ${count} รายการ`);
      }

      if (syncRecipes) {
        const count = await syncRecipeCostingToGoogleSheets(accessToken, targetId, menuItems, ingredients);
        syncLogs.push(`🍲 ส่งออกโครงสร้างต้นทุนและกำไร (Recipes): ${count} เมนู`);
      }

      if (syncMovements) {
        const count = await syncMovementsToGoogleSheets(accessToken, targetId, stockAdjustmentLogs, wasteLogs);
        syncLogs.push(`📝 ส่งออกประวัติสต็อกและของเสีย (Movements): ${count} รายการ`);
      }

      setSyncResult({
        success: true,
        url: sheetUrl,
        message: 'ส่งออกข้อมูลไปยัง Google Sheets สำเร็จเรียบร้อย!',
        details: syncLogs
      });

      // Refresh recent spreadsheets
      fetchSpreadsheets(accessToken);
    } catch (err: any) {
      console.error('Export to Google Sheets failed:', err);
      setSyncResult({
        success: false,
        message: `เกิดข้อผิดพลาดในการส่งออกข้อมูล: ${err.message || 'กรุณาลองใหม่อีกครั้ง'}`
      });
    } finally {
      setIsSyncing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in">
      <div className="bg-[#0e1626] border border-slate-800 rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-800/80 bg-slate-900/60 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-950/40">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-slate-100 text-base">Google Sheets Auto-Sync & Export</h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 border border-emerald-500/30 text-emerald-400">
                  Google Workspace
                </span>
              </div>
              <p className="text-xs text-slate-400">
                ส่งออกยอดขาย สต็อกวัตถุดิบ โครงสร้างต้นทุน และประวัติการตัดสต็อกไปยัง Google Sheets
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-xs">
          
          {/* Section 1: Google Account Connection Status */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                  สถานะการเชื่อมต่อบัญชี Google
                </span>
                {googleUser ? (
                  <div className="flex items-center space-x-3">
                    {googleUser.photoURL ? (
                      <img
                        src={googleUser.photoURL}
                        alt={googleUser.displayName || 'Google Account'}
                        className="w-8 h-8 rounded-full border border-emerald-500/40"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-emerald-700 text-white font-bold flex items-center justify-center text-xs">
                        {googleUser.email?.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="font-bold text-slate-100 text-sm flex items-center space-x-1.5">
                        <span>{googleUser.displayName || 'Google User'}</span>
                        <ShieldCheck className="w-4 h-4 text-emerald-400" />
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">{googleUser.email}</div>
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-300 text-xs">
                    ยังไม่ได้เชื่อมต่อบัญชี Google โปรดกดปุ่ม Sign in เพื่ออนุญาตการสร้างและอัปเดตไฟล์ Google Sheets
                  </p>
                )}
              </div>

              <div>
                {googleUser ? (
                  <button
                    onClick={handleSignOut}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-rose-950/60 hover:text-rose-400 text-slate-300 rounded-xl transition flex items-center space-x-1 font-semibold text-xs border border-slate-700"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>ออกจากระบบ</span>
                  </button>
                ) : (
                  /* Official Google Sign-in Styled Button */
                  <button
                    onClick={handleSignIn}
                    disabled={isAuthenticating}
                    className="inline-flex items-center justify-center space-x-2.5 px-4 py-2 bg-white hover:bg-slate-100 text-slate-900 font-bold rounded-xl shadow-md transition active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 48 48">
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
                    </svg>
                    <span>{isAuthenticating ? 'กำลังเชื่อมต่อ...' : 'Sign in with Google'}</span>
                  </button>
                )}
              </div>
            </div>

            {authError && (
              <div className="mt-3 p-3 rounded-xl bg-rose-950/40 border border-rose-500/40 text-rose-300 flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{authError}</span>
              </div>
            )}
          </div>

          {/* Section 2: Target Spreadsheet Setup */}
          {googleUser && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-200 text-sm">1. เลือกปลายทาง Google Spreadsheet</span>
                <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-xl border border-slate-800">
                  <button
                    onClick={() => setTargetMode('new')}
                    className={`px-3 py-1 rounded-lg font-bold transition ${
                      targetMode === 'new'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    + สร้างไฟล์ใหม่
                  </button>
                  <button
                    onClick={() => setTargetMode('existing')}
                    className={`px-3 py-1 rounded-lg font-bold transition ${
                      targetMode === 'existing'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    📁 ใช้ไฟล์เดิมใน Drive
                  </button>
                </div>
              </div>

              {targetMode === 'new' ? (
                <div className="space-y-2 bg-slate-950/60 border border-slate-800 p-4 rounded-2xl">
                  <label className="block text-slate-300 font-bold">ชื่อไฟล์ Google Spreadsheet ใหม่</label>
                  <input
                    type="text"
                    value={newSheetTitle}
                    onChange={e => setNewSheetTitle(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 font-semibold focus:outline-none focus:border-emerald-500 text-xs"
                    placeholder="เช่น ครัวกะเพรา POS - รายงานประจำเดือน..."
                  />
                  <p className="text-[11px] text-slate-500">
                    * ระบบจะสร้างไฟล์ใหม่ใน Google Drive ของคุณ พร้อมแยกแท็บข้อมูลอัตโนมัติ 4 หมวดหมู่
                  </p>
                </div>
              ) : (
                <div className="space-y-2 bg-slate-950/60 border border-slate-800 p-4 rounded-2xl">
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-slate-300 font-bold">เลือกไฟล์ Google Sheets ใน Drive ของคุณ</label>
                    <button
                      onClick={() => accessToken && fetchSpreadsheets(accessToken)}
                      className="text-emerald-400 hover:text-emerald-300 underline text-[11px] font-semibold flex items-center space-x-1"
                    >
                      <RefreshCw className={`w-3 h-3 ${isLoadingFiles ? 'animate-spin' : ''}`} />
                      <span>รีเฟรชรายการ</span>
                    </button>
                  </div>

                  {spreadsheets.length > 0 ? (
                    <select
                      value={selectedSpreadsheetId}
                      onChange={e => setSelectedSpreadsheetId(e.target.value)}
                      className="w-full px-3 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 font-medium focus:outline-none focus:border-emerald-500 text-xs"
                    >
                      {spreadsheets.map(file => (
                        <option key={file.id} value={file.id}>
                          📄 {file.name} ({new Date(file.modifiedTime || '').toLocaleDateString('th-TH')})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl text-slate-400 text-center">
                      {isLoadingFiles ? 'กำลังค้นหาไฟล์ Google Sheets...' : 'ไม่พบไฟล์ Spreadsheet เดิม (แนะนำให้เลือกสร้างไฟล์ใหม่)'}
                    </div>
                  )}
                </div>
              )}

              {/* Section 3: Select Datasets to Export */}
              <div className="space-y-3">
                <span className="font-bold text-slate-200 text-sm block">2. เลือกชุดข้อมูลที่ต้องการซิงค์ (Datasets)</span>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="flex items-start space-x-3 p-3 rounded-2xl bg-slate-950/80 border border-slate-800/80 hover:border-slate-700 cursor-pointer transition">
                    <input
                      type="checkbox"
                      checked={syncSales}
                      onChange={e => setSyncSales(e.target.checked)}
                      className="mt-0.5 rounded border-slate-700 text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                    />
                    <div className="flex-1">
                      <div className="font-bold text-slate-100 flex items-center space-x-1.5">
                        <Table className="w-3.5 h-3.5 text-blue-400" />
                        <span>ยอดขายและประวัติบิล ({orders.length} บิล)</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        แท็บ: <code className="text-emerald-400 font-mono">ยอดขาย (Sales)</code>
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start space-x-3 p-3 rounded-2xl bg-slate-950/80 border border-slate-800/80 hover:border-slate-700 cursor-pointer transition">
                    <input
                      type="checkbox"
                      checked={syncInventory}
                      onChange={e => setSyncInventory(e.target.checked)}
                      className="mt-0.5 rounded border-slate-700 text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                    />
                    <div className="flex-1">
                      <div className="font-bold text-slate-100 flex items-center space-x-1.5">
                        <Package className="w-3.5 h-3.5 text-amber-400" />
                        <span>สต็อกและมูลค่าสินค้า ({ingredients.length} รายการ)</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        แท็บ: <code className="text-emerald-400 font-mono">สต็อกวัตถุดิบ (Inventory)</code>
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start space-x-3 p-3 rounded-2xl bg-slate-950/80 border border-slate-800/80 hover:border-slate-700 cursor-pointer transition">
                    <input
                      type="checkbox"
                      checked={syncRecipes}
                      onChange={e => setSyncRecipes(e.target.checked)}
                      className="mt-0.5 rounded border-slate-700 text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                    />
                    <div className="flex-1">
                      <div className="font-bold text-slate-100 flex items-center space-x-1.5">
                        <BookOpen className="w-3.5 h-3.5 text-purple-400" />
                        <span>โครงสร้างต้นทุนและกำไร ({menuItems.length} เมนู)</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        แท็บ: <code className="text-emerald-400 font-mono">ต้นทุนเมนู (Recipes)</code>
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start space-x-3 p-3 rounded-2xl bg-slate-950/80 border border-slate-800/80 hover:border-slate-700 cursor-pointer transition">
                    <input
                      type="checkbox"
                      checked={syncMovements}
                      onChange={e => setSyncMovements(e.target.checked)}
                      className="mt-0.5 rounded border-slate-700 text-emerald-600 focus:ring-emerald-500 w-4 h-4"
                    />
                    <div className="flex-1">
                      <div className="font-bold text-slate-100 flex items-center space-x-1.5">
                        <History className="w-3.5 h-3.5 text-rose-400" />
                        <span>ประวัติการเติมสต็อกและของเสีย</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        แท็บ: <code className="text-emerald-400 font-mono">ประวัติสต็อก (Movements)</code>
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Sync Result Box */}
              {syncResult && (
                <div
                  className={`p-4 rounded-2xl border ${
                    syncResult.success
                      ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                      : 'bg-rose-950/40 border-rose-500/40 text-rose-200'
                  } space-y-2.5 animate-fadeIn`}
                >
                  <div className="flex items-center space-x-2 font-bold text-sm">
                    {syncResult.success ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-rose-400" />
                    )}
                    <span>{syncResult.message}</span>
                  </div>

                  {syncResult.details && syncResult.details.length > 0 && (
                    <ul className="space-y-1 text-[11px] text-slate-300 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800 font-mono">
                      {syncResult.details.map((detail, idx) => (
                        <li key={idx}>{detail}</li>
                      ))}
                    </ul>
                  )}

                  {syncResult.url && (
                    <div className="pt-1 flex items-center space-x-2">
                      <a
                        href={syncResult.url}
                        target="_blank"
                        rel="noreferrer"
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl transition flex items-center space-x-1.5 shadow-lg shadow-emerald-950/60"
                      >
                        <span>เปิดดูใน Google Sheets</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-950/80 flex items-center justify-between">
          <div className="text-[11px] text-slate-400">
            {googleUser ? (
              <span className="text-emerald-400 font-medium">✓ เชื่อมต่อกับ Google Workspace สำเร็จ</span>
            ) : (
              <span>โปรดเข้าสู่ระบบ Google เพื่อดำเนินการ</span>
            )}
          </div>

          <div className="flex items-center space-x-2.5">
            <button
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition cursor-pointer"
            >
              ปิดหน้าต่าง
            </button>

            {googleUser && (
              <button
                onClick={startSyncProcess}
                disabled={isSyncing || (!syncSales && !syncInventory && !syncRecipes && !syncMovements)}
                className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-950/50 transition active:scale-95 disabled:opacity-50 flex items-center space-x-2 cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>{isSyncing ? 'กำลังส่งออกข้อมูลไปยัง Google...' : 'ซิงค์ข้อมูลเดี๋ยวนี้'}</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Overwrite Modal (Workspace Guideline Safety Mandate) */}
      {showConfirmOverwrite && (
        <div className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center space-x-3 text-amber-400">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h4 className="font-bold text-slate-100 text-base">ยืนยันการเขียนทับข้อมูลใน Google Sheets</h4>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              คุณกำลังเลือกเขียนข้อมูลลงในไฟล์ Google Sheets เดิมในบัญชีของคุณ ข้อมูลในแท็บที่เลือกจะถูกอัปเดตและเขียนทับด้วยข้อมูลล่าสุดจากระบบ POS
            </p>
            <div className="flex items-center justify-end space-x-2 pt-2">
              <button
                onClick={() => setShowConfirmOverwrite(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl"
              >
                ยกเลิก
              </button>
              <button
                onClick={executeSync}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg"
              >
                ยืนยันการเขียนข้อมูล
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
