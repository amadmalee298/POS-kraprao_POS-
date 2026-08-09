import React, { useState, useEffect } from 'react';
import { compressImageFile } from '../../utils/imageCompressor';
import {
  Settings,
  Store,
  Key,
  Database,
  Printer,
  Bell,
  Save,
  RotateCcw,
  CheckCircle2,
  Download,
  Upload,
  Camera,
  QrCode,
  ShieldAlert,
  Building2,
  Receipt,
  Percent,
  Calculator,
  Info,
  Calendar,
  Users,
  RefreshCw,
  Wifi,
  WifiOff,
  Clock,
  Activity,
  Zap,
  Sliders,
  Radio,
  HardDrive,
  Type,
  Eye,
  EyeOff,
  CreditCard,
  Wallet,
  Landmark,
  Banknote,
  Plus,
  Trash2,
  Edit2,
  X,
  Lock,
  Unlock,
  ShieldCheck,
  UserCheck,
  UserX,
  UserPlus,
  Phone,
  Shuffle,
  FileJson,
  Copy,
  Check,
  AlertTriangle,
  FileUp,
  FileText
} from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { calculateOrderTotals } from '../../utils/tax';
import { StaffSchedulingPanel } from './StaffSchedulingPanel';
import { StaffPinClockTerminal } from './StaffPinClockTerminal';
import { CashShiftManagementPanel } from './CashShiftManagementPanel';
import { SecurityLogPanel } from './SecurityLogPanel';
import { QrPaymentOption, StaffMember, StaffPermissions } from '../../types';
import { SHOP_LOGO_URL } from '../../assets/logo';

const DEFAULT_QR_METHODS: QrPaymentOption[] = [
  {
    id: 'promptpay',
    name: 'พร้อมเพย์ QR Code',
    type: 'promptpay',
    accountNumber: '081-234-5678',
    accountName: 'ร้านครัวกะเพรา POS',
    instructions: 'สแกน QR Code ด้วยแอปธนาคารทุกธนาคารเพื่อชำระเงิน',
    enabled: true
  },
  {
    id: 'truemoney',
    name: 'TrueMoney Wallet',
    type: 'truemoney',
    accountNumber: '081-234-5678',
    accountName: 'ร้านครัวกะเพรา POS',
    instructions: 'โอนผ่านแอป TrueMoney Wallet เข้าเบอร์ร้าน',
    enabled: true
  },
  {
    id: 'linepay',
    name: 'Rabbit LINE Pay',
    type: 'linepay',
    accountNumber: 'MERCHANT-KAPRAO-99',
    accountName: 'ครัวกะเพรา POS',
    instructions: 'ชำระผ่าน Rabbit LINE Pay สแกนที่หน้าร้านหรือในแอป',
    enabled: false
  },
  {
    id: 'cash',
    name: 'ชำระเงินสด / จ่ายที่เคาน์เตอร์',
    type: 'cash',
    instructions: 'สั่งอาหารล่วงหน้า และนำหมายเลขออเดอร์ชำระเงินสดที่เคาน์เตอร์แคชเชียร์หลังรับประทานเสร็จ',
    enabled: true
  },
  {
    id: 'credit',
    name: 'บัตรเครดิต / เดบิต',
    type: 'credit',
    instructions: 'พนักงานจะนำเครื่องแตะบัตร EDC มาให้บริการที่โต๊ะ',
    enabled: true
  }
];

export const SettingsView: React.FC = () => {
  const {
    settings,
    updateSettings,
    currentBranch,
    branches,
    setCurrentBranch,
    updateBranch,
    addBranch,
    deleteBranch,
    resetToDefaultData,
    isOffline,
    forceOfflineMode,
    lastSyncedAt,
    pendingOfflineCount,
    syncOfflineQueue,
    staffMembers,
    addStaffMember,
    updateStaffMember,
    deleteStaffMember,
    exportStateJSON,
    importStateJSON,
    menuItems,
    orders,
    ingredients,
    expenses,
    logSecurityEvent,
    cleanSlateForProduction
  } = usePOS();

  const [settingsTab, setSettingsTab] = useState<'general' | 'scheduling' | 'timeclock' | 'shifts' | 'sync' | 'pins' | 'security_logs' | 'backup'>('general');

  // Backup & Restore State
  const [backupCopySuccess, setBackupCopySuccess] = useState(false);
  const [importedJsonText, setImportedJsonText] = useState('');
  const [parsedBackupPreview, setParsedBackupPreview] = useState<any>(null);
  const [restoreError, setRestoreError] = useState('');
  const [restoreSuccess, setRestoreSuccess] = useState('');
  const [isResetConfirmModalOpen, setIsResetConfirmModalOpen] = useState(false);
  const [resetPinInput, setResetPinInput] = useState('');
  const [resetPinError, setResetPinError] = useState('');
  const [branchName, setBranchName] = useState(currentBranch?.name || '');
  const [branchAddress, setBranchAddress] = useState(currentBranch?.address || '');
  const [branchPhone, setBranchPhone] = useState(currentBranch?.phone || '');
  const [promptPay, setPromptPay] = useState(currentBranch?.promptpayMobileOrTaxId || settings.promptPayId || settings.promptpayMobileOrTaxId || '');
  const [taxId, setTaxId] = useState(currentBranch?.taxId || settings.taxId || settings.shopTaxId || '');

  useEffect(() => {
    if (currentBranch) {
      setBranchName(currentBranch.name || '');
      setBranchAddress(currentBranch.address || '');
      setBranchPhone(currentBranch.phone || '');
      setPromptPay(currentBranch.promptpayMobileOrTaxId || settings.promptpayMobileOrTaxId || settings.promptPayId || '');
      setTaxId(currentBranch.taxId || settings.taxId || settings.shopTaxId || '');
    }
  }, [currentBranch.id]);
  const [receiptHeader, setReceiptHeader] = useState(settings.receiptHeader || settings.shopName || '');
  const [receiptFooter, setReceiptFooter] = useState(settings.receiptFooter || '');
  const [receiptPaperWidth, setReceiptPaperWidth] = useState<'80mm' | '58mm'>(settings.receiptPaperWidth || '80mm');
  const [receiptFontSize, setReceiptFontSize] = useState<'sm' | 'md' | 'lg'>(settings.receiptFontSize || 'md');
  const [shopLogoUrl, setShopLogoUrl] = useState<string>(settings.shopLogoUrl || '');
  const [receiptShowLogo, setReceiptShowLogo] = useState<boolean>(settings.receiptShowLogo !== false);
  const [receiptShowTaxId, setReceiptShowTaxId] = useState<boolean>(settings.receiptShowTaxId !== false);
  const [receiptShowItemDetails, setReceiptShowItemDetails] = useState<boolean>(settings.receiptShowItemDetails !== false);
  const [receiptUseMonospace, setReceiptUseMonospace] = useState<boolean>(!!settings.receiptUseMonospace);
  const [receiptFooterNote, setReceiptFooterNote] = useState<string>(settings.receiptFooterNote || settings.receiptFooter || '*** ขอบพระคุณที่อุดหนุน ***');
  const [enableVat, setEnableVat] = useState(settings.enableVat !== false);
  const [vatRate, setVatRate] = useState<number>(settings.vatRate ?? 7);
  const [vatType, setVatType] = useState<'inclusive' | 'exclusive' | 'none'>(settings.vatType || 'inclusive');
  const [kdsWarnMin, setKdsWarnMin] = useState(settings.kdsWarningMinutes || 10);
  const [adminPin, setAdminPin] = useState(settings.adminPin || '1234');
  const [managerPin, setManagerPin] = useState(settings.managerPin || '5555');

  // Manager Role Authorization State
  const [isManagerAuthorized, setIsManagerAuthorized] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authPinInput, setAuthPinInput] = useState('');
  const [authError, setAuthError] = useState('');

  // Employee PIN Management State
  const [staffPinMask, setStaffPinMask] = useState<Record<string, boolean>>({});
  const [pinStatusFilter, setPinStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Employee Modal State (for creating / editing employee PIN & permissions)
  const [isEmployeePinModalOpen, setIsEmployeePinModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<{
    id?: string;
    name: string;
    role: string;
    phone: string;
    pin: string;
    status: 'active' | 'inactive';
    permissions: StaffPermissions;
  }>({
    name: '',
    role: 'พนักงานเสิร์ฟ',
    phone: '',
    pin: '1234',
    status: 'active',
    permissions: {
      canAccessPOS: true,
      canAccessKDS: true,
      canAccessInventory: false,
      canAccessAccounting: false,
      canAccessSettings: false,
      canVoidOrder: false,
      canGiveDiscount: false,
      canEditRecipe: false
    }
  });

  const checkManagerAuth = () => {
    if (!isManagerAuthorized) {
      setIsAuthModalOpen(true);
      return false;
    }
    return true;
  };

  const handleVerifyManagerPin = (e: React.FormEvent) => {
    e.preventDefault();
    const validManagerPin = managerPin || settings.managerPin || '5555';
    const validAdminPin = adminPin || settings.adminPin || '1234';

    if (authPinInput === validManagerPin || authPinInput === validAdminPin) {
      logSecurityEvent({
        userName: 'ผู้จัดการ / เจ้าของร้าน',
        userRole: 'manager',
        action: 'Manager PIN Authorization',
        status: 'SUCCESS',
        details: 'ยืนยันรหัส PIN ปลดล็อกเมนูการตั้งค่าระดับสูงสำเร็จ'
      });
      setIsManagerAuthorized(true);
      setIsAuthModalOpen(false);
      setAuthPinInput('');
      setAuthError('');
    } else {
      logSecurityEvent({
        userName: 'ผู้ใช้งาน',
        userRole: 'unknown',
        action: 'Manager PIN Authorization',
        status: 'FAILED',
        details: 'ป้อนรหัส Manager/Admin PIN ไม่ถูกต้องในหน้าตั้งค่า'
      });
      setAuthError('รหัส PIN ไม่ถูกต้อง! กรุณากรอกรหัส Manager PIN (5555) หรือ Admin PIN (1234)');
    }
  };

  const handleOpenAddEmployeePin = () => {
    if (!checkManagerAuth()) return;
    setEditingEmployee({
      name: '',
      role: 'พนักงานเสิร์ฟ',
      phone: '',
      pin: '1234',
      status: 'active',
      permissions: {
        canAccessPOS: true,
        canAccessKDS: true,
        canAccessInventory: false,
        canAccessAccounting: false,
        canAccessSettings: false,
        canVoidOrder: false,
        canGiveDiscount: false,
        canEditRecipe: false
      }
    });
    setIsEmployeePinModalOpen(true);
  };

  const handleOpenEditEmployeePin = (staff: StaffMember) => {
    if (!checkManagerAuth()) return;
    setEditingEmployee({
      id: staff.id,
      name: staff.name,
      role: staff.role,
      phone: staff.phone || '',
      pin: staff.pin || '1234',
      status: staff.status || 'active',
      permissions: staff.permissions || {
        canAccessPOS: true,
        canAccessKDS: true
      }
    });
    setIsEmployeePinModalOpen(true);
  };

  const handleToggleRevokeAccess = (staff: StaffMember) => {
    if (!checkManagerAuth()) return;
    const newStatus = staff.status === 'active' ? 'inactive' : 'active';
    updateStaffMember({
      ...staff,
      status: newStatus
    });
  };

  const handleGenerateRandomPinForStaff = (staff: StaffMember) => {
    if (!checkManagerAuth()) return;
    const randomPin = Math.floor(1000 + Math.random() * 9000).toString();
    updateStaffMember({
      ...staff,
      pin: randomPin
    });
    setStaffPinMask(prev => ({ ...prev, [staff.id]: true }));
  };

  const handleSaveEmployeeForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee.name.trim()) return;

    const pinToSave = editingEmployee.pin.trim() || '1234';

    if (editingEmployee.id) {
      const existing = staffMembers.find(s => s.id === editingEmployee.id);
      updateStaffMember({
        id: editingEmployee.id,
        name: editingEmployee.name.trim(),
        role: editingEmployee.role,
        hourlyRate: existing?.hourlyRate || 75,
        otRateMultiplier: existing?.otRateMultiplier || 1.5,
        phone: editingEmployee.phone.trim(),
        status: editingEmployee.status,
        branchId: existing?.branchId || currentBranch.id,
        pin: pinToSave,
        permissions: editingEmployee.permissions
      });
    } else {
      addStaffMember({
        name: editingEmployee.name.trim(),
        role: editingEmployee.role,
        hourlyRate: 75,
        otRateMultiplier: 1.5,
        phone: editingEmployee.phone.trim(),
        status: editingEmployee.status,
        branchId: currentBranch.id,
        pin: pinToSave,
        permissions: editingEmployee.permissions
      });
    }

    setIsEmployeePinModalOpen(false);
  };

  // Backup & Restore Handlers
  const handleExportBackupFile = () => {
    try {
      const jsonStr = exportStateJSON();
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const timeStr = new Date().toISOString().slice(0, 10);
      link.href = url;
      link.download = `Kaprao_POS_Backup_${timeStr}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to export backup file:', err);
    }
  };

  const handleCopyBackupToClipboard = () => {
    try {
      const jsonStr = exportStateJSON();
      navigator.clipboard.writeText(jsonStr);
      setBackupCopySuccess(true);
      setTimeout(() => setBackupCopySuccess(false), 3000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  const handleJsonFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setRestoreError('');
    setRestoreSuccess('');

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setImportedJsonText(text);
      try {
        const parsed = JSON.parse(text);
        if (typeof parsed === 'object' && parsed !== null) {
          setParsedBackupPreview(parsed);
        } else {
          setRestoreError('รูปแบบไฟล์ JSON ไม่ถูกต้อง');
          setParsedBackupPreview(null);
        }
      } catch {
        setRestoreError('ไม่สามารถอ่านไฟล์ JSON ได้ กรุณาตรวจสอบไวยากรณ์ไฟล์');
        setParsedBackupPreview(null);
      }
    };
    reader.readAsText(file);
  };

  const handleJsonTextareaChange = (text: string) => {
    setImportedJsonText(text);
    setRestoreError('');
    setRestoreSuccess('');
    if (!text.trim()) {
      setParsedBackupPreview(null);
      return;
    }
    try {
      const parsed = JSON.parse(text);
      if (typeof parsed === 'object' && parsed !== null) {
        setParsedBackupPreview(parsed);
      } else {
        setParsedBackupPreview(null);
      }
    } catch {
      setParsedBackupPreview(null);
    }
  };

  const handleExecuteRestore = () => {
    if (!checkManagerAuth()) return;
    if (!importedJsonText.trim()) {
      setRestoreError('กรุณาเลือกไฟล์ JSON หรือวางข้อความ JSON สำรองข้อมูลก่อน');
      return;
    }

    const success = importStateJSON(importedJsonText);
    if (success) {
      setRestoreSuccess('กู้คืนข้อมูล POS สำเร็จเรียบร้อยแล้ว! ระบบได้โหลดข้อมูลล่าสุดเข้าสู่ Local Storage แล้ว');
      setRestoreError('');
      setImportedJsonText('');
      setParsedBackupPreview(null);
    } else {
      setRestoreError('การกู้คืนข้อมูลล้มเหลว กรุณาตรวจสอบว่าโครงสร้างไฟล์ JSON ถูกต้อง');
    }
  };

  const handleExecuteFactoryReset = (e: React.FormEvent) => {
    e.preventDefault();
    const validManagerPin = managerPin || settings.managerPin || '5555';
    const validAdminPin = adminPin || settings.adminPin || '1234';

    if (resetPinInput === validManagerPin || resetPinInput === validAdminPin) {
      logSecurityEvent({
        userName: 'ผู้จัดการ / เจ้าของร้าน',
        userRole: 'manager',
        action: 'Factory Reset System',
        status: 'SUCCESS',
        details: 'ยืนยันรหัส PIN และรีเซ็ตคืนค่าเริ่มต้นของระบบทั้งหมด'
      });
      resetToDefaultData();
      setIsResetConfirmModalOpen(false);
      setResetPinInput('');
      setResetPinError('');
      setRestoreSuccess('ล้างข้อมูลและคืนค่าเริ่มต้นของระบบเรียบร้อยแล้ว!');
    } else {
      logSecurityEvent({
        userName: 'ผู้ใช้งาน',
        userRole: 'unknown',
        action: 'Factory Reset System',
        status: 'FAILED',
        details: 'ป้อนรหัส PIN ผิดพลาดขณะพยายามทำ Factory Reset'
      });
      setResetPinError('รหัส PIN ไม่ถูกต้อง! กรุณากรอก Manager PIN (5555) หรือ Admin PIN (1234)');
    }
  };

  // QR Payment Methods State
  const [configuredPaymentMethods, setConfiguredPaymentMethods] = useState<QrPaymentOption[]>(
    settings.qrPaymentMethods && settings.qrPaymentMethods.length > 0
      ? settings.qrPaymentMethods
      : DEFAULT_QR_METHODS
  );
  const [editingPaymentMethod, setEditingPaymentMethod] = useState<QrPaymentOption | null>(null);
  const [isPaymentMethodModalOpen, setIsPaymentMethodModalOpen] = useState(false);
  const [paymentMethodForm, setPaymentMethodForm] = useState<Partial<QrPaymentOption>>({
    name: '',
    type: 'promptpay',
    accountNumber: '',
    accountName: '',
    instructions: '',
    enabled: true
  });

  const handleTogglePaymentMethod = (id: string) => {
    const updated = configuredPaymentMethods.map(m => (m.id === id ? { ...m, enabled: !m.enabled } : m));
    setConfiguredPaymentMethods(updated);
    updateSettings({ qrPaymentMethods: updated });
  };

  const handleOpenAddPaymentMethod = () => {
    setPaymentMethodForm({
      name: '',
      type: 'promptpay',
      accountNumber: '',
      accountName: '',
      instructions: '',
      enabled: true
    });
    setEditingPaymentMethod(null);
    setIsPaymentMethodModalOpen(true);
  };

  const handleOpenEditPaymentMethod = (method: QrPaymentOption) => {
    setEditingPaymentMethod(method);
    setPaymentMethodForm({ ...method });
    setIsPaymentMethodModalOpen(true);
  };

  const handleDeletePaymentMethod = (id: string) => {
    if (confirm('ต้องการลบช่องทางการชำระเงินนี้หรือไม่?')) {
      const updatedList = configuredPaymentMethods.filter(m => m.id !== id);
      setConfiguredPaymentMethods(updatedList);
      updateSettings({ qrPaymentMethods: updatedList });
    }
  };

  const handleSavePaymentMethodForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentMethodForm.name || !paymentMethodForm.name.trim()) {
      alert('กรุณากรอกชื่อช่องทางการชำระเงิน');
      return;
    }

    let updated: QrPaymentOption[];
    if (editingPaymentMethod) {
      updated = configuredPaymentMethods.map(m =>
        m.id === editingPaymentMethod.id
          ? {
              ...m,
              name: paymentMethodForm.name!.trim(),
              type: paymentMethodForm.type || 'promptpay',
              accountNumber: paymentMethodForm.accountNumber || '',
              accountName: paymentMethodForm.accountName || '',
              instructions: paymentMethodForm.instructions || '',
              enabled: paymentMethodForm.enabled !== false
            }
          : m
      );
    } else {
      const newMethod: QrPaymentOption = {
        id: `custom-${Date.now()}`,
        name: paymentMethodForm.name.trim(),
        type: paymentMethodForm.type || 'promptpay',
        accountNumber: paymentMethodForm.accountNumber || '',
        accountName: paymentMethodForm.accountName || '',
        instructions: paymentMethodForm.instructions || '',
        enabled: paymentMethodForm.enabled !== false
      };
      updated = [...configuredPaymentMethods, newMethod];
    }

    setConfiguredPaymentMethods(updated);
    updateSettings({ qrPaymentMethods: updated });
    setEditingPaymentMethod(null);
    setIsPaymentMethodModalOpen(false);
  };

  // Sync Settings State
  const [autoSyncEnabled, setAutoSyncEnabled] = useState<boolean>(settings.autoSyncEnabled !== false);
  const [syncIntervalSeconds, setSyncIntervalSeconds] = useState<number>(settings.syncIntervalSeconds || 30);
  const [isSyncingNow, setIsSyncingNow] = useState(false);
  const [syncSuccessToast, setSyncSuccessToast] = useState<string | null>(null);

  const [isSavedAlert, setIsSavedAlert] = useState(false);
  const [showResetConfirmModal, setShowResetConfirmModal] = useState(false);

  const handleSaveSyncSettings = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings({
      autoSyncEnabled: autoSyncEnabled,
      syncIntervalSeconds: Number(syncIntervalSeconds)
    });

    setIsSavedAlert(true);
    setTimeout(() => setIsSavedAlert(false), 3000);
  };

  const handleManualSyncNow = () => {
    setIsSyncingNow(true);
    setSyncSuccessToast(null);
    setTimeout(() => {
      syncOfflineQueue();
      setIsSyncingNow(false);
      setSyncSuccessToast('ซิงค์ข้อมูลรายการสั่งซื้อออฟไลน์สำเร็จแล้ว!');
      setTimeout(() => setSyncSuccessToast(null), 3500);
    }, 800);
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();

    // 1. Update Current Branch Details
    if (currentBranch) {
      updateBranch({
        ...currentBranch,
        name: branchName.trim() || currentBranch.name,
        address: branchAddress.trim() || currentBranch.address,
        phone: branchPhone.trim() || currentBranch.phone,
        promptpayMobileOrTaxId: promptPay.trim(),
        taxId: taxId.trim()
      });
    }

    // 2. Update System Settings & Payment Methods
    const updatedPaymentMethods = configuredPaymentMethods.map(m =>
      m.type === 'promptpay' ? { ...m, accountNumber: promptPay.trim() } : m
    );

    updateSettings({
      shopName: branchName.trim() || currentBranch?.name || 'ร้านค้า POS',
      promptPayId: promptPay.trim(),
      promptpayMobileOrTaxId: promptPay.trim(),
      taxId: taxId.trim(),
      shopTaxId: taxId.trim(),
      shopAddress: branchAddress.trim(),
      shopPhone: branchPhone.trim(),
      shopLogoUrl: shopLogoUrl,
      receiptHeader: receiptHeader || branchName.trim(),
      receiptFooter: receiptFooterNote,
      receiptFooterNote: receiptFooterNote,
      receiptPaperWidth: receiptPaperWidth,
      receiptFontSize: receiptFontSize,
      receiptShowLogo: receiptShowLogo,
      receiptShowTaxId: receiptShowTaxId,
      receiptShowItemDetails: receiptShowItemDetails,
      receiptUseMonospace: receiptUseMonospace,
      enableVat: enableVat,
      vatRate: Number(vatRate),
      vatType: vatType,
      kdsWarningMinutes: kdsWarnMin,
      adminPin: adminPin,
      managerPin: managerPin,
      qrPaymentMethods: updatedPaymentMethods
    });

    setIsSavedAlert(true);
    setTimeout(() => setIsSavedAlert(false), 3000);
  };

  const handleExportJSON = () => {
    const backupData = {
      timestamp: new Date().toISOString(),
      localStorage: { ...localStorage }
    };

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(backupData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `KapraoPOS_Backup_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleImportJSON = (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    if (event.target.files && event.target.files[0]) {
      fileReader.readAsText(event.target.files[0], 'UTF-8');
      fileReader.onload = e => {
        try {
          const parsed = JSON.parse(e.target?.result as string);
          if (parsed && parsed.localStorage) {
            Object.keys(parsed.localStorage).forEach(key => {
              localStorage.setItem(key, parsed.localStorage[key]);
            });
            alert('นำเข้าข้อมูลสำเร็จ! ระบบจะทำการรีโหลดหน้าจอ');
            window.location.reload();
          }
        } catch (err) {
          alert('ไฟล์สำรองไม่ถูกต้อง ไม่สามารถนำเข้าได้');
        }
      };
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] bg-slate-950 text-slate-100 overflow-hidden">
      {/* Top Header */}
      <div className="p-4 bg-slate-900 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-gradient-to-tr from-slate-600 to-slate-800 border border-slate-700 rounded-xl shadow-lg text-white">
            <Settings className="w-6 h-6" />
          </div>
          <div>
            <h2 className="font-bold text-lg text-slate-100">การตั้งค่าระบบ (System Settings & Config)</h2>
            <p className="text-xs text-slate-400">ตั้งค่าใบเสร็จ PromptPay, ตารางงานพนักงาน, PIN Code อนุมัติ และการสำรองข้อมูล</p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center space-x-2 bg-slate-950 p-1.5 rounded-2xl border border-slate-800 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setSettingsTab('general')}
            className={`px-4 py-2 rounded-xl font-bold text-xs transition flex items-center space-x-2 shrink-0 ${
              settingsTab === 'general'
                ? 'bg-slate-800 text-amber-400 shadow-md border border-slate-700'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span>⚙️ ตั้งค่าทั่วไป (General Config)</span>
          </button>

          <button
            onClick={() => setSettingsTab('pins')}
            className={`px-4 py-2 rounded-xl font-bold text-xs transition flex items-center space-x-2 shrink-0 ${
              settingsTab === 'pins'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Key className="w-4 h-4" />
            <span>🔑 รหัส PIN & สิทธิ์พนักงาน (Employee PINs)</span>
          </button>

          <button
            onClick={() => setSettingsTab('scheduling')}
            className={`px-4 py-2 rounded-xl font-bold text-xs transition flex items-center space-x-2 shrink-0 ${
              settingsTab === 'scheduling'
                ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Calendar className="w-4 h-4" />
            <span>🗓️ จัดตารางงาน & คิดเงินเดือน (Staff Scheduling)</span>
          </button>

          <button
            onClick={() => setSettingsTab('timeclock')}
            className={`px-4 py-2 rounded-xl font-bold text-xs transition flex items-center space-x-2 shrink-0 ${
              settingsTab === 'timeclock'
                ? 'bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="w-4 h-4 text-emerald-300" />
            <span>📌 ตู้บันทึกเวลาเข้า-ออกงาน (PIN Timeclock)</span>
          </button>

          <button
            onClick={() => setSettingsTab('shifts')}
            className={`px-4 py-2 rounded-xl font-bold text-xs transition flex items-center space-x-2 shrink-0 ${
              settingsTab === 'shifts'
                ? 'bg-gradient-to-r from-amber-500 to-orange-600 text-white shadow-lg'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Wallet className="w-4 h-4 text-amber-300" />
            <span>💰 เปิด-ปิดกะ & ลิ้นชักเงินสด (Cash Shifts)</span>
          </button>

          <button
            onClick={() => setSettingsTab('sync')}
            className={`px-4 py-2 rounded-xl font-bold text-xs transition flex items-center space-x-2 shrink-0 ${
              settingsTab === 'sync'
                ? 'bg-gradient-to-r from-teal-600 to-emerald-600 text-white shadow-lg'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <RefreshCw className="w-4 h-4" />
            <span>🔄 ตั้งค่าการซิงค์ข้อมูล (Sync Settings)</span>
          </button>

          <button
            onClick={() => setSettingsTab('security_logs')}
            className={`px-4 py-2 rounded-xl font-bold text-xs transition flex items-center space-x-2 shrink-0 ${
              settingsTab === 'security_logs'
                ? 'bg-gradient-to-r from-rose-600 to-amber-600 text-white shadow-lg'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldAlert className="w-4 h-4 text-rose-300" />
            <span>🛡️ ประวัติความปลอดภัย (Security Log)</span>
          </button>

          <button
            onClick={() => setSettingsTab('backup')}
            className={`px-4 py-2 rounded-xl font-bold text-xs transition flex items-center space-x-2 shrink-0 ${
              settingsTab === 'backup'
                ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-lg'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Database className="w-4 h-4" />
            <span>💾 สำรอง & กู้คืนข้อมูล (Backup & Restore)</span>
          </button>
        </div>

        {/* Save Confirmation Toast */}
        {isSavedAlert && (
          <div className="flex items-center space-x-2 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 px-4 py-2 rounded-xl text-xs font-bold animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>บันทึกการตั้งค่าเรียบร้อยแล้ว</span>
          </div>
        )}
      </div>

      {/* Settings Body */}
      <div className="flex-1 p-6 overflow-y-auto space-y-6">
        {settingsTab === 'pins' ? (
          <div className="max-w-5xl space-y-6 animate-in fade-in">
            {/* MANAGER AUTHORIZATION STATUS BANNER */}
            <div className={`p-4 rounded-2xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xl ${
              isManagerAuthorized
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                : 'bg-amber-950/40 border-amber-500/40 text-amber-200'
            }`}>
              <div className="flex items-center space-x-3">
                <div className={`p-3 rounded-xl border ${
                  isManagerAuthorized
                    ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
                    : 'bg-amber-500/20 border-amber-500/30 text-amber-400'
                }`}>
                  {isManagerAuthorized ? <Unlock className="w-6 h-6" /> : <Lock className="w-6 h-6" />}
                </div>
                <div>
                  <h3 className="font-extrabold text-sm flex items-center space-x-2">
                    <span>{isManagerAuthorized ? '🔓 ยืนยันสิทธิ์ผู้จัดการแล้ว (Manager Authorized Session)' : '🔒 ต้องยืนยันรหัส Manager PIN เพื่อจัดการสิทธิ์'}</span>
                  </h3>
                  <p className="text-xs text-slate-300 mt-0.5">
                    {isManagerAuthorized
                      ? 'คุณมีสิทธิ์ในการสร้าง เปลี่ยนแปลงรหัส PIN สุ่มรหัสใหม่ และระงับสิทธิ์การใช้งานของพนักงานทุกคน'
                      : 'กรุณายืนยันรหัส Manager PIN (5555) หรือ Admin PIN (1234) เพื่อรับสิทธิ์สร้าง แก้ไข หรือระงับรหัสผ่านพนักงาน'}
                  </p>
                </div>
              </div>

              {isManagerAuthorized ? (
                <button
                  type="button"
                  onClick={() => setIsManagerAuthorized(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl border border-slate-700 transition shrink-0"
                >
                  🔒 ล็อกสิทธิ์ผู้จัดการ
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsAuthModalOpen(true)}
                  className="px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-extrabold text-xs rounded-xl shadow-lg transition shrink-0 flex items-center space-x-1.5 active:scale-95"
                >
                  <Key className="w-4 h-4" />
                  <span>ปลดล็อกสิทธิ์ผู้จัดการ (Verify Manager PIN)</span>
                </button>
              )}
            </div>

            {/* MASTER SYSTEM PINS (ADMIN & MANAGER) PANEL */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
              <div className="flex items-center space-x-2 text-orange-400 border-b border-slate-800 pb-3">
                <Key className="w-5 h-5 text-orange-400" />
                <div>
                  <h3 className="font-bold text-slate-100 text-sm">รหัสผ่านหลักร้านค้า (System Master PINs)</h3>
                  <p className="text-[11px] text-slate-400">สำหรับอนุมัติการยกเลิกบิล ให้ส่วนลดพิเศษ และยืนยันสิทธิ์ผู้จัดการ</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="block text-slate-400 font-bold mb-1">รหัส Admin PIN (ยกเลิกบิล / ส่วนลดพิเศษ)</label>
                  <input
                    type="password"
                    maxLength={4}
                    value={adminPin}
                    onChange={e => setAdminPin(e.target.value)}
                    placeholder="1234"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-amber-400 font-mono font-bold text-center tracking-widest text-base focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-400 font-bold mb-1">รหัส Manager PIN (เข้าถึงตั้งค่า / กู้คืนระบบ)</label>
                  <input
                    type="password"
                    maxLength={4}
                    value={managerPin}
                    onChange={e => setManagerPin(e.target.value)}
                    placeholder="5555"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-amber-400 font-mono font-bold text-center tracking-widest text-base focus:border-amber-500"
                  />
                </div>
              </div>
            </div>

            {/* OVERVIEW STATS METRICS */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl shadow-md space-y-1">
                <span className="text-slate-400 text-[11px] block">พนักงานทั้งหมด</span>
                <span className="text-xl font-extrabold font-mono text-slate-100">{staffMembers.length} คน</span>
              </div>

              <div className="p-4 bg-slate-900 border border-emerald-500/30 rounded-2xl shadow-md space-y-1">
                <span className="text-emerald-400 text-[11px] block">สิทธิ์ใช้งานปกติ (Active)</span>
                <span className="text-xl font-extrabold font-mono text-emerald-400">
                  {staffMembers.filter(s => s.status === 'active').length} คน
                </span>
              </div>

              <div className="p-4 bg-slate-900 border border-rose-500/30 rounded-2xl shadow-md space-y-1">
                <span className="text-rose-400 text-[11px] block">ถูกระงับสิทธิ์ (Revoked)</span>
                <span className="text-xl font-extrabold font-mono text-rose-400">
                  {staffMembers.filter(s => s.status === 'inactive').length} คน
                </span>
              </div>

              <div className="p-4 bg-slate-900 border border-indigo-500/30 rounded-2xl shadow-md space-y-1">
                <span className="text-indigo-400 text-[11px] block">รหัสผ่านที่ตั้งไว้</span>
                <span className="text-xl font-extrabold font-mono text-indigo-300">
                  {staffMembers.filter(s => !!s.pin).length} บัญชี
                </span>
              </div>
            </div>

            {/* MAIN CREDENTIALS MANAGEMENT PANEL */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-4">
                <div>
                  <h3 className="font-extrabold text-slate-100 text-base flex items-center space-x-2">
                    <ShieldCheck className="w-5 h-5 text-purple-400" />
                    <span>รายการรหัส PIN และสิทธิ์เข้าถึงของพนักงานทั้งหมด</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    ผู้จัดการสามารถสร้างพนักงานใหม่ ปรับเปลี่ยนรหัส PIN สุ่มรหัส และสั่งระงับสิทธิ์การใช้งาน (Revoke Access) ได้ทันที
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
                    <button
                      type="button"
                      onClick={() => setPinStatusFilter('all')}
                      className={`px-2.5 py-1 rounded-lg font-bold transition ${pinStatusFilter === 'all' ? 'bg-purple-600 text-white' : 'text-slate-400'}`}
                    >
                      ทั้งหมด ({staffMembers.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPinStatusFilter('active')}
                      className={`px-2.5 py-1 rounded-lg font-bold transition ${pinStatusFilter === 'active' ? 'bg-emerald-600 text-white' : 'text-slate-400'}`}
                    >
                      ใช้งานได้ ({staffMembers.filter(s => s.status === 'active').length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setPinStatusFilter('inactive')}
                      className={`px-2.5 py-1 rounded-lg font-bold transition ${pinStatusFilter === 'inactive' ? 'bg-rose-600 text-white' : 'text-slate-400'}`}
                    >
                      ระงับสิทธิ์ ({staffMembers.filter(s => s.status === 'inactive').length})
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleOpenAddEmployeePin}
                    className="px-3.5 py-2 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-400 hover:to-indigo-500 text-white font-extrabold text-xs rounded-xl shadow-lg transition flex items-center space-x-1.5 active:scale-95"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>เพิ่มพนักงาน & PIN ใหม่</span>
                  </button>
                </div>
              </div>

              {/* STAFF CREDENTIAL CARDS GRID */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {staffMembers
                  .filter(staff => {
                    if (pinStatusFilter === 'active') return staff.status === 'active';
                    if (pinStatusFilter === 'inactive') return staff.status === 'inactive';
                    return true;
                  })
                  .map(staff => {
                    const isRevoked = staff.status === 'inactive';
                    const showPin = !!staffPinMask[staff.id];

                    return (
                      <div
                        key={staff.id}
                        className={`p-4 rounded-2xl border transition-all flex flex-col justify-between space-y-3 relative ${
                          isRevoked
                            ? 'bg-rose-950/20 border-rose-500/30 opacity-75'
                            : 'bg-slate-950/80 border-slate-800 hover:border-slate-700 shadow-xl'
                        }`}
                      >
                        <div className="space-y-3">
                          <div className="flex items-start justify-between">
                            <div className="flex items-center space-x-3">
                              <div className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-white text-base shadow-md ${
                                isRevoked ? 'bg-rose-800' : 'bg-gradient-to-tr from-purple-500 to-indigo-600'
                              }`}>
                                {staff.name.charAt(0)}
                              </div>
                              <div>
                                <h4 className="font-extrabold text-slate-100 text-sm flex items-center space-x-1.5">
                                  <span>{staff.name}</span>
                                </h4>
                                <div className="flex items-center space-x-1.5 mt-0.5">
                                  <span className="text-[10px] text-amber-300 font-bold px-2 py-0.5 bg-amber-500/10 rounded-md border border-amber-500/20">
                                    {staff.role}
                                  </span>
                                  <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-md border ${
                                    isRevoked
                                      ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                                      : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                  }`}>
                                    {isRevoked ? '🚫 ระงับสิทธิ์' : '🟢 ปกติ'}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleOpenEditEmployeePin(staff)}
                              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition"
                              title="แก้ไขข้อมูลพนักงานและสิทธิ์"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {/* PIN Display Box */}
                          <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-between text-xs">
                            <div>
                              <span className="text-[10px] text-slate-400 block font-medium">รหัส PIN 4 หลัก</span>
                              <div className="flex items-center space-x-1.5 mt-0.5">
                                <span className="font-mono font-extrabold text-amber-300 text-base tracking-widest">
                                  {showPin ? (staff.pin || '1234') : '••••'}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setStaffPinMask(prev => ({ ...prev, [staff.id]: !prev[staff.id] }))}
                                  className="p-1 text-slate-400 hover:text-amber-300 transition"
                                  title={showPin ? 'ซ่อน PIN' : 'แสดง PIN'}
                                >
                                  {showPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                </button>
                              </div>
                            </div>

                            <div className="flex items-center space-x-1">
                              <button
                                type="button"
                                onClick={() => handleGenerateRandomPinForStaff(staff)}
                                className="px-2 py-1 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-lg text-[10px] font-bold transition flex items-center space-x-1"
                                title="สุ่มรหัส PIN ใหม่"
                              >
                                <Shuffle className="w-3 h-3" />
                                <span>สุ่ม PIN</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleOpenEditEmployeePin(staff)}
                                className="px-2 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg text-[10px] font-bold transition flex items-center space-x-1"
                              >
                                <Key className="w-3 h-3" />
                                <span>เปลี่ยน</span>
                              </button>
                            </div>
                          </div>

                          {/* Permissions Tag Badges */}
                          <div className="space-y-1">
                            <span className="text-[10px] font-bold text-slate-400 block">สิทธิ์การเข้าถึงเมนู:</span>
                            <div className="flex flex-wrap gap-1">
                              {staff.permissions?.canAccessPOS !== false && (
                                <span className="px-2 py-0.5 bg-blue-500/10 text-blue-300 border border-blue-500/20 text-[10px] rounded-md font-medium">
                                  🛒 POS
                                </span>
                              )}
                              {staff.permissions?.canAccessKDS !== false && (
                                <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-[10px] rounded-md font-medium">
                                  🍳 KDS ครัว
                                </span>
                              )}
                              {staff.permissions?.canAccessInventory && (
                                <span className="px-2 py-0.5 bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[10px] rounded-md font-medium">
                                  📦 สต็อก
                                </span>
                              )}
                              {staff.permissions?.canAccessAccounting && (
                                <span className="px-2 py-0.5 bg-purple-500/10 text-purple-300 border border-purple-500/20 text-[10px] rounded-md font-medium">
                                  📊 บัญชี
                                </span>
                              )}
                              {staff.permissions?.canAccessSettings && (
                                <span className="px-2 py-0.5 bg-rose-500/10 text-rose-300 border border-rose-500/20 text-[10px] rounded-md font-medium">
                                  ⚙️ ตั้งค่า
                                </span>
                              )}
                              {staff.permissions?.canVoidOrder && (
                                <span className="px-2 py-0.5 bg-orange-500/10 text-orange-300 border border-orange-500/20 text-[10px] rounded-md font-medium">
                                  ❌ ยกเลิกบิล
                                </span>
                              )}
                              {staff.permissions?.canGiveDiscount && (
                                <span className="px-2 py-0.5 bg-teal-500/10 text-teal-300 border border-teal-500/20 text-[10px] rounded-md font-medium">
                                  🏷️ ส่วนลด
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Card Action Footer */}
                        <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                          {staff.phone ? (
                            <span className="text-[11px] text-slate-400 flex items-center space-x-1">
                              <Phone className="w-3 h-3 text-slate-500" />
                              <span>{staff.phone}</span>
                            </span>
                          ) : (
                            <span className="text-[11px] text-slate-600">ไม่มีเบอร์โทร</span>
                          )}

                          <button
                            type="button"
                            onClick={() => handleToggleRevokeAccess(staff)}
                            className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition flex items-center space-x-1 border ${
                              isRevoked
                                ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                : 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border-rose-500/30'
                            }`}
                          >
                            {isRevoked ? (
                              <>
                                <UserCheck className="w-3.5 h-3.5" />
                                <span>คืนสิทธิ์ใช้งาน</span>
                              </>
                            ) : (
                              <>
                                <UserX className="w-3.5 h-3.5" />
                                <span>ระงับสิทธิ์ (Revoke)</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>
        ) : settingsTab === 'scheduling' ? (
          <StaffSchedulingPanel />
        ) : settingsTab === 'timeclock' ? (
          <StaffPinClockTerminal />
        ) : settingsTab === 'shifts' ? (
          <CashShiftManagementPanel />
        ) : settingsTab === 'sync' ? (
          <div className="max-w-4xl space-y-6">
            <form onSubmit={handleSaveSyncSettings} className="space-y-6">
              {/* SECTION 1: AUTOMATIC BACKGROUND SYNC TOGGLE */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center space-x-2.5 text-emerald-400">
                    <RefreshCw className="w-5 h-5 text-emerald-400" />
                    <h3 className="font-bold text-slate-100 text-sm">การซิงค์ข้อมูลอัตโนมัติในพื้นหลัง (Automatic Background Sync)</h3>
                  </div>
                  <span
                    className={`text-[11px] font-bold px-3 py-1 rounded-full border flex items-center space-x-1.5 ${
                      autoSyncEnabled
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        autoSyncEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
                      }`}
                    />
                    <span>{autoSyncEnabled ? 'เปิดใช้งานซิงค์อัตโนมัติ' : 'ปิดการซิงค์อัตโนมัติ'}</span>
                  </span>
                </div>

                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between gap-4">
                  <div className="space-y-1">
                    <label htmlFor="autoSyncToggle" className="font-bold text-slate-200 block text-sm cursor-pointer">
                      เปิดการซิงค์ข้อมูลออฟไลน์อัตโนมัติ (Automatic Background Sync for Offline Transactions)
                    </label>
                    <p className="text-xs text-slate-400 leading-relaxed">
                      เมื่อเปิดใช้งาน ระบบจะตรวจหาและส่งข้อมูลออเดอร์และรายการขายออฟไลน์ไปยังเซิร์ฟเวอร์คลาวด์ให้อัตโนมัติในพื้นหลังตามรอบเวลาที่กำหนด โดยไม่ต้องคอยเปิดหน้าต่างซิงค์หรือกดซิงค์เอง
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    id="autoSyncToggle"
                    checked={autoSyncEnabled}
                    onChange={e => setAutoSyncEnabled(e.target.checked)}
                    className="w-6 h-6 rounded-lg border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500 cursor-pointer shrink-0"
                  />
                </div>
              </div>

              {/* SECTION 2: SYNC INTERVAL FREQUENCY ADJUSTMENT */}
              <div
                className={`bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4 transition ${
                  !autoSyncEnabled ? 'opacity-50 pointer-events-none' : ''
                }`}
              >
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center space-x-2.5 text-teal-400">
                    <Clock className="w-5 h-5" />
                    <h3 className="font-bold text-slate-100 text-sm">ความถี่ในการซิงค์ข้อมูล (Sync Interval Frequency)</h3>
                  </div>
                  <span className="text-xs font-mono font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-3 py-1 rounded-lg">
                    ทุกๆ {syncIntervalSeconds} วินาที
                  </span>
                </div>

                <p className="text-xs text-slate-400">
                  เลือกความถี่ระยะเวลาที่ระบบ Background Worker จะทำการสแกนและซิงค์บิลออฟไลน์โดยอัตโนมัติ:
                </p>

                {/* Preset Selector Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  {[
                    { sec: 10, label: '10 วินาที', desc: '⚡ เร็วที่สุด (Real-time Sync)' },
                    { sec: 15, label: '15 วินาที', desc: '🚀 รวดเร็วมาก' },
                    { sec: 30, label: '30 วินาที', desc: '✨ แนะนำ (สมดุลและเสถียรที่สุด)' },
                    { sec: 60, label: '1 นาที (60s)', desc: '🕐 มาตรฐาน' },
                    { sec: 120, label: '2 นาที (120s)', desc: '⏱️ เสถียรสูง' },
                    { sec: 300, label: '5 นาที (300s)', desc: '🔋 ประหยัดแบนด์วิธ / เน็ตมือถือ' }
                  ].map(item => (
                    <button
                      type="button"
                      key={item.sec}
                      onClick={() => setSyncIntervalSeconds(item.sec)}
                      className={`p-3.5 rounded-xl border text-left transition flex flex-col justify-between ${
                        syncIntervalSeconds === item.sec
                          ? 'bg-teal-500/10 border-teal-500/60 text-teal-200 ring-2 ring-teal-500/30 shadow-lg'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <span className="font-bold text-sm text-slate-100">{item.label}</span>
                        {syncIntervalSeconds === item.sec && (
                          <CheckCircle2 className="w-4 h-4 text-teal-400" />
                        )}
                      </div>
                      <span className="text-[11px] text-slate-400">{item.desc}</span>
                    </button>
                  ))}
                </div>

                {/* Manual Range / Numeric Input slider */}
                <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3 pt-3">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                    <span>ปรับแต่งความถี่อิสระ (5 - 300 วินาที)</span>
                    <span className="text-teal-400 font-mono text-sm">{syncIntervalSeconds} วินาที</span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={300}
                    step={5}
                    value={syncIntervalSeconds}
                    onChange={e => setSyncIntervalSeconds(Number(e.target.value))}
                    className="w-full accent-teal-500 bg-slate-800 h-2 rounded-lg cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 font-mono">
                    <span>5s (เร็วสุด)</span>
                    <span>60s (1 นาที)</span>
                    <span>180s (3 นาที)</span>
                    <span>300s (5 นาที)</span>
                  </div>
                </div>
              </div>

              {/* SECTION 3: SYNC QUEUE STATUS & MANUAL TEST */}
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                  <div className="flex items-center space-x-2.5 text-sky-400">
                    <Activity className="w-5 h-5" />
                    <h3 className="font-bold text-slate-100 text-sm">สถานะคิวออฟไลน์และการเชื่อมต่อปัจจุบัน (Sync Status)</h3>
                  </div>
                  {syncSuccessToast && (
                    <div className="text-xs font-bold text-emerald-400 bg-emerald-500/20 border border-emerald-500/40 px-3 py-1 rounded-lg animate-in fade-in">
                      {syncSuccessToast}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                    <span className="text-slate-400 text-[11px] block">สถานะการเชื่อมต่อ (Network)</span>
                    <div className="flex items-center space-x-2 pt-0.5">
                      {isOffline || forceOfflineMode ? (
                        <>
                          <WifiOff className="w-4 h-4 text-amber-400" />
                          <span className="font-bold text-amber-400 text-sm">ออฟไลน์ (Offline)</span>
                        </>
                      ) : (
                        <>
                          <Wifi className="w-4 h-4 text-emerald-400" />
                          <span className="font-bold text-emerald-400 text-sm">ออนไลน์ (Online)</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                    <span className="text-slate-400 text-[11px] block">รายการออฟไลน์รอซิงค์ (Pending Queue)</span>
                    <div className="flex items-center space-x-2 pt-0.5">
                      <Zap className="w-4 h-4 text-amber-400" />
                      <span className="font-bold text-slate-100 text-sm font-mono">{pendingOfflineCount} รายการ</span>
                    </div>
                  </div>

                  <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                    <span className="text-slate-400 text-[11px] block">ซิงค์ครั้งล่าสุดเมื่อ (Last Synced)</span>
                    <div className="flex items-center space-x-1.5 pt-0.5">
                      <Clock className="w-4 h-4 text-slate-400" />
                      <span className="font-bold text-slate-200 text-xs truncate">
                        {lastSyncedAt ? new Date(lastSyncedAt).toLocaleTimeString('th-TH') : 'ยังไม่มีข้อมูล'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2">
                  <p className="text-xs text-slate-400">
                    คุณสามารถกดปุ่มทดสอบการซิงค์ข้อมูลด้วยตนเองทันทีเพื่อตรวจสอบคิวออฟไลน์
                  </p>
                  <button
                    type="button"
                    onClick={handleManualSyncNow}
                    disabled={isSyncingNow}
                    className="px-4 py-2.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-lg transition flex items-center space-x-2 shrink-0 active:scale-95"
                  >
                    <RefreshCw className={`w-4 h-4 ${isSyncingNow ? 'animate-spin' : ''}`} />
                    <span>{isSyncingNow ? 'กำลังซิงค์ข้อมูล...' : 'ซิงค์ข้อมูลทันที (Sync Now)'}</span>
                  </button>
                </div>
              </div>

              {/* SAVE SYNC SETTINGS BUTTON */}
              <button
                type="submit"
                className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-sm rounded-2xl shadow-xl transition flex items-center justify-center space-x-2 active:scale-98"
              >
                <Save className="w-5 h-5" />
                <span>บันทึกการตั้งค่าการซิงค์ข้อมูล (Save Sync Settings)</span>
              </button>
            </form>
          </div>
        ) : settingsTab === 'backup' ? (
          <div className="max-w-4xl space-y-6 animate-in fade-in">
            {/* MANAGER AUTHORIZATION STATUS BANNER */}
            <div className={`p-4 rounded-2xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xl ${
              isManagerAuthorized
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                : 'bg-amber-950/40 border-amber-500/40 text-amber-200'
            }`}>
              <div className="flex items-center space-x-3">
                <div className={`p-3 rounded-xl border ${
                  isManagerAuthorized
                    ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
                    : 'bg-amber-500/20 border-amber-500/30 text-amber-400'
                }`}>
                  {isManagerAuthorized ? <Unlock className="w-6 h-6" /> : <Lock className="w-6 h-6" />}
                </div>
                <div>
                  <h3 className="font-extrabold text-sm flex items-center space-x-2">
                    <span>{isManagerAuthorized ? '🔓 ยืนยันสิทธิ์ผู้จัดการแล้ว (Manager Authorized Session)' : '🔒 ต้องยืนยันรหัส Manager PIN เพื่อกู้คืนข้อมูล (Restore Access)'}</span>
                  </h3>
                  <p className="text-xs text-slate-300 mt-0.5">
                    {isManagerAuthorized
                      ? 'คุณมีสิทธิ์ในการส่งออก (Export) กู้คืนข้อมูล (Restore) และล้างระบบ (Factory Reset)'
                      : 'คุณสามารถดาวน์โหลดไฟล์สำรองได้ทันที แต่ต้องยืนยัน PIN ผู้จัดการ (5555) ก่อนทำการกู้คืนข้อมูล'}
                  </p>
                </div>
              </div>

              {isManagerAuthorized ? (
                <button
                  type="button"
                  onClick={() => setIsManagerAuthorized(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl border border-slate-700 transition shrink-0"
                >
                  🔒 ล็อกสิทธิ์ผู้จัดการ
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsAuthModalOpen(true)}
                  className="px-4 py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-extrabold text-xs rounded-xl shadow-lg transition shrink-0 flex items-center space-x-1.5 active:scale-95"
                >
                  <Key className="w-4 h-4" />
                  <span>ปลดล็อกสิทธิ์ผู้จัดการ (Verify Manager PIN)</span>
                </button>
              )}
            </div>

            {/* SECTION 1: EXPORT SYSTEM DATA */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center space-x-2.5 text-blue-400">
                  <Download className="w-5 h-5" />
                  <h3 className="font-bold text-slate-100 text-sm">ส่งออกไฟล์สำรองข้อมูล (Export Backup Utility)</h3>
                </div>
                <span className="text-[11px] font-mono text-cyan-300 bg-cyan-500/10 border border-cyan-500/30 px-3 py-1 rounded-lg font-bold">
                  Format: Standard JSON (v1.0.0)
                </span>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed">
                ส่งออกข้อมูลทั้งหมดใน Local Storage ของระบบ POS (รายการอาหาร, ออเดอร์ขาย, วัตถุดิบ, สต็อก, พนักงาน, ค่าใช้จ่าย และตั้งค่าระบบ) เป็นไฟล์ <span className="text-amber-300 font-mono font-bold">.json</span> เพื่อเก็บสำรองหรือย้ายไปใช้งานในเครื่องอื่น
              </p>

              {/* LIVE BACKUP METRICS PREVIEW */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                  <span className="text-slate-400 text-[10px] block">รายการอาหาร (Menu)</span>
                  <span className="text-base font-extrabold font-mono text-amber-300">{menuItems.length} เมนู</span>
                </div>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                  <span className="text-slate-400 text-[10px] block">ออเดอร์ขาย (Orders)</span>
                  <span className="text-base font-extrabold font-mono text-emerald-400">{orders.length} บิล</span>
                </div>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                  <span className="text-slate-400 text-[10px] block">พนักงาน (Staff)</span>
                  <span className="text-base font-extrabold font-mono text-purple-400">{staffMembers.length} คน</span>
                </div>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
                  <span className="text-slate-400 text-[10px] block">วัตถุดิบ (Ingredients)</span>
                  <span className="text-base font-extrabold font-mono text-sky-400">{ingredients.length} รายการ</span>
                </div>
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1 col-span-2 sm:col-span-1">
                  <span className="text-slate-400 text-[10px] block">รายจ่าย (Expenses)</span>
                  <span className="text-base font-extrabold font-mono text-rose-400">{expenses.length} รายการ</span>
                </div>
              </div>

              {/* ACTION BUTTONS */}
              <div className="flex flex-col sm:flex-row items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleExportBackupFile}
                  className="w-full sm:w-auto px-5 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-extrabold text-xs rounded-xl shadow-lg transition flex items-center justify-center space-x-2 active:scale-95"
                >
                  <Download className="w-4 h-4" />
                  <span>ดาวน์โหลดไฟล์สำรองข้อมูล JSON (Download .json)</span>
                </button>

                <button
                  type="button"
                  onClick={handleCopyBackupToClipboard}
                  className="w-full sm:w-auto px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl border border-slate-700 transition flex items-center justify-center space-x-2 shrink-0 active:scale-95"
                >
                  {backupCopySuccess ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  <span>{backupCopySuccess ? 'คัดลอกข้อความ JSON แล้ว!' : 'คัดลอก JSON (Copy to Clipboard)'}</span>
                </button>
              </div>
            </div>

            {/* SECTION 2: IMPORT & RESTORE BACKUP DATA */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div className="flex items-center space-x-2.5 text-teal-400">
                  <Upload className="w-5 h-5" />
                  <h3 className="font-bold text-slate-100 text-sm">นำเข้า & กู้คืนข้อมูลระบบ (Import & Restore POS State)</h3>
                </div>
                <span className="text-xs text-slate-400">
                  ไฟล์ชนิด <code className="text-amber-400 font-mono">.json</code>
                </span>
              </div>

              {restoreSuccess && (
                <div className="p-3.5 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 rounded-xl text-xs font-bold flex items-center space-x-2 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{restoreSuccess}</span>
                </div>
              )}

              {restoreError && (
                <div className="p-3.5 bg-rose-500/20 border border-rose-500/40 text-rose-300 rounded-xl text-xs font-bold flex items-center space-x-2 animate-in fade-in">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{restoreError}</span>
                </div>
              )}

              {/* FILE UPLOADER & INPUT */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Option A: Upload File */}
                <div className="p-4 bg-slate-950 border-2 border-dashed border-slate-800 hover:border-teal-500/50 rounded-2xl flex flex-col items-center justify-center text-center space-y-2 transition group">
                  <div className="p-3 bg-slate-900 group-hover:bg-teal-500/10 rounded-xl text-teal-400 transition">
                    <FileUp className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="font-bold text-slate-200 text-xs block">คลิกเลือกไฟล์สำรองข้อมูล (.json)</span>
                    <span className="text-[11px] text-slate-500">หรือลากไฟล์มาวางในช่องนี้</span>
                  </div>
                  <input
                    type="file"
                    accept=".json,application/json"
                    onChange={handleJsonFileUpload}
                    className="mt-2 text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-teal-600 file:text-white hover:file:bg-teal-500 cursor-pointer"
                  />
                </div>

                {/* Option B: Direct JSON Text Area */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-300">
                    หรือวางข้อความ JSON สำรองข้อมูลโดยตรง:
                  </label>
                  <textarea
                    rows={4}
                    value={importedJsonText}
                    onChange={e => handleJsonTextareaChange(e.target.value)}
                    placeholder='{"appName": "Kaprao POS Enterprise", "menuItems": [...]}'
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-amber-300 font-mono focus:border-teal-500 resize-none"
                  />
                </div>
              </div>

              {/* PREVIEW OF IMPORTED BACKUP PAYLOAD */}
              {parsedBackupPreview && (
                <div className="p-4 bg-teal-950/30 border border-teal-500/40 rounded-2xl space-y-3 animate-in fade-in">
                  <div className="flex items-center justify-between border-b border-teal-500/30 pb-2">
                    <h4 className="font-extrabold text-teal-300 text-xs flex items-center space-x-1.5">
                      <FileJson className="w-4 h-4" />
                      <span>ตรวจสอบโครงสร้างข้อมูลที่จะกู้คืน (Backup Preview Validation)</span>
                    </h4>
                    <span className="text-[10px] font-mono text-slate-300">
                      Exported: {parsedBackupPreview.exportedAt ? new Date(parsedBackupPreview.exportedAt).toLocaleString('th-TH') : 'ไม่ทราบวันที่'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                    <div className="p-2 bg-slate-950/80 rounded-lg">
                      <span className="text-slate-400 block text-[10px]">สาขา:</span>
                      <span className="font-bold text-slate-200">{parsedBackupPreview.branch?.name || 'สาขาหลัก'}</span>
                    </div>
                    <div className="p-2 bg-slate-950/80 rounded-lg">
                      <span className="text-slate-400 block text-[10px]">เมนูอาหาร:</span>
                      <span className="font-bold text-amber-300 font-mono">{parsedBackupPreview.menuItems?.length || 0} รายการ</span>
                    </div>
                    <div className="p-2 bg-slate-950/80 rounded-lg">
                      <span className="text-slate-400 block text-[10px]">ออเดอร์ขาย:</span>
                      <span className="font-bold text-emerald-300 font-mono">{parsedBackupPreview.orders?.length || 0} รายการ</span>
                    </div>
                    <div className="p-2 bg-slate-950/80 rounded-lg">
                      <span className="text-slate-400 block text-[10px]">พนักงาน:</span>
                      <span className="font-bold text-purple-300 font-mono">{parsedBackupPreview.staffMembers?.length || 0} บัญชี</span>
                    </div>
                  </div>
                </div>
              )}

              {/* RESTORE TRIGGER BUTTON */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleExecuteRestore}
                  disabled={!importedJsonText.trim()}
                  className="w-full py-3 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 disabled:opacity-40 text-white font-extrabold text-xs rounded-xl shadow-lg transition flex items-center justify-center space-x-2 active:scale-95"
                >
                  <Upload className="w-4 h-4" />
                  <span>กู้คืนข้อมูลเข้าสู่ระบบ POS (Execute State Restore)</span>
                </button>
              </div>
            </div>

            {/* SECTION 3: DANGER ZONE - FACTORY RESET */}
            <div className="bg-slate-900 border border-rose-500/30 rounded-2xl p-5 shadow-xl space-y-4">
              <div className="flex items-center space-x-2.5 text-rose-400 border-b border-slate-800 pb-3">
                <AlertTriangle className="w-5 h-5 text-rose-400" />
                <h3 className="font-bold text-slate-100 text-sm">ล้างข้อมูลทั้งหมด & คืนค่าเริ่มต้น (Factory Reset Area)</h3>
              </div>

              <div className="p-4 bg-rose-950/20 border border-rose-500/30 rounded-xl space-y-1 text-xs text-rose-200">
                <span className="font-bold block">⚠️ คำเตือนสำคัญ (Danger Zone):</span>
                <p className="text-slate-300 leading-relaxed text-[11px]">
                  การล้างข้อมูลจะทำการลบ Local Storage ทั้งหมดในเบราว์เซอร์ และรีเซ็ตข้อมูลเมนู, สต็อก, ออเดอร์, และพนักงานกลับเป็นค่าเริ่มต้นเริ่มต้นของร้าน (Default Template Data) การดำเนินการนี้ไม่สามารถย้อนกลับได้ กรุณาส่งออกไฟล์สำรองข้อมูลก่อนล้างระบบ
                </p>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => {
                    if (!checkManagerAuth()) return;
                    setIsResetConfirmModalOpen(true);
                  }}
                  className="px-4 py-2.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 font-extrabold text-xs rounded-xl transition flex items-center space-x-1.5 active:scale-95"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>ล้างข้อมูลและรีเซ็ตค่าเริ่มต้น (Factory Reset)</span>
                </button>
              </div>
            </div>
          </div>
        ) : settingsTab === 'security_logs' ? (
          <SecurityLogPanel />
        ) : (
          <>
            <form onSubmit={handleSaveSettings} className="max-w-4xl space-y-6">
              {/* QUICK SETUP BANNER: Clean Slate & Ready to Use */}
              <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-rose-950/40 border border-rose-500/30 rounded-2xl p-5 shadow-xl flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="flex items-start space-x-3.5">
                  <div className="w-11 h-11 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0 border border-rose-500/30">
                    <RotateCcw className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-100 text-sm flex items-center space-x-2">
                      <span>ล้างข้อมูลเพื่อเริ่มต้นใช้งานแอป (Clean Slate / Initial Setup)</span>
                      <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                        พร้อมใช้จริง
                      </span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-1">
                      รีเซ็ตบิลออเดอร์ ประวัติกะการขาย และยอดขายทดสอบทั้งหมด เพื่อเริ่มต้นเปิดร้านจริงในสภาพแวดล้อมที่สะอาดพร้อมใช้งาน
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!checkManagerAuth()) return;
                    setIsResetConfirmModalOpen(true);
                  }}
                  className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-extrabold text-xs rounded-xl shadow-lg shadow-rose-600/20 transition flex items-center justify-center space-x-2 shrink-0 active:scale-95"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>ล้างข้อมูลเริ่มต้นใช้งาน (Reset App)</span>
                </button>
              </div>

          {/* SECTION 1: STORE & BRANCH SELECTOR */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2 text-amber-400">
                <Store className="w-5 h-5" />
                <div>
                  <h3 className="font-bold text-slate-100 text-sm">ข้อมูลร้านค้า และการจัดการสาขา</h3>
                  <p className="text-[11px] text-slate-400">กำหนดชื่อร้านค้า, สาขาปัจจุบัน, ที่อยู่, เลขผู้เสียภาษี และเบอร์ PromptPay สำหรับสร้าง QR Code</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const newBranchName = prompt('ระบุชื่อสาขาใหม่:');
                  if (!newBranchName || !newBranchName.trim()) return;
                  const newAddress = prompt('ระบุที่อยู่สาขา:') || '';
                  const newPhone = prompt('ระบุเบอร์โทรสาขา:') || '';
                  const newPromptPay = prompt('ระบุเบอร์ PromptPay:') || promptPay;
                  addBranch({
                    name: newBranchName.trim(),
                    nameEn: newBranchName.trim(),
                    address: newAddress.trim(),
                    phone: newPhone.trim(),
                    taxId: taxId.trim(),
                    promptpayMobileOrTaxId: newPromptPay.trim()
                  });
                  alert('เพิ่มสาขาใหม่เรียบร้อยแล้ว!');
                }}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-slate-950 font-extrabold text-xs rounded-xl shadow transition flex items-center space-x-1 shrink-0 self-start sm:self-auto"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ เพิ่มสาขาใหม่</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <label className="block text-slate-400 mb-1 font-semibold">เลือกสาขาปัจจุบันที่กำลังใช้งาน</label>
                <select
                  value={currentBranch.id}
                  onChange={e => {
                    const b = branches.find(branch => branch.id === e.target.value);
                    if (b) setCurrentBranch(b);
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-slate-200 font-bold focus:border-amber-500"
                >
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.address || 'ไม่ระบุที่อยู่'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-semibold">ชื่อร้านค้า / ชื่อสาขาปัจจุบัน</label>
                <input
                  type="text"
                  value={branchName}
                  onChange={e => setBranchName(e.target.value)}
                  placeholder="เช่น สาขาสยาม"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-bold focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-semibold">เบอร์โทรศัพท์ PromptPay (สำหรับสร้าง QR Code ชำระเงิน)</label>
                <div className="relative">
                  <QrCode className="w-4 h-4 text-sky-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={promptPay}
                    onChange={e => setPromptPay(e.target.value)}
                    placeholder="เช่น 0812345678 หรือ 0105550000000"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-slate-200 font-mono focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-semibold">เลขประจำตัวผู้เสียภาษี (Tax ID)</label>
                <input
                  type="text"
                  value={taxId}
                  onChange={e => setTaxId(e.target.value)}
                  placeholder="0105550000000"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-mono focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-semibold">เบอร์โทรศัพท์สาขา</label>
                <input
                  type="text"
                  value={branchPhone}
                  onChange={e => setBranchPhone(e.target.value)}
                  placeholder="02-123-4567"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-slate-400 mb-1 font-semibold">ที่อยู่สาขา (แสดงในใบเสร็จ)</label>
                <input
                  type="text"
                  value={branchAddress}
                  onChange={e => setBranchAddress(e.target.value)}
                  placeholder="เลขที่... ถนน... แขวง... เขต..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 focus:border-amber-500"
                />
              </div>
            </div>
          </div>

          {/* SECTION: QR ORDERING PAYMENT METHODS CONFIGURATION */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2 text-emerald-400">
                <QrCode className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="font-bold text-slate-100 text-sm">
                    ตั้งค่าช่องทางการชำระเงินสำหรับ QR Ordering & Checkout
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    เปิด/ปิด และกำหนดตัวเลือกชำระเงินที่แสดงให้ลูกค้าเห็นเมื่อสแกนสั่งอาหารผ่าน QR Code หรือชำระที่เคาน์เตอร์
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleOpenAddPaymentMethod}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg transition flex items-center space-x-1.5 shrink-0 active:scale-95"
              >
                <Plus className="w-4 h-4" />
                <span>เพิ่มช่องทางชำระเงิน</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
              {configuredPaymentMethods.map((method) => {
                const isPromptPay = method.type === 'promptpay';
                const isTrueMoney = method.type === 'truemoney';
                const isLinePay = method.type === 'linepay';
                const isCash = method.type === 'cash';
                const isCredit = method.type === 'credit';

                return (
                  <div
                    key={method.id}
                    className={`p-3.5 rounded-2xl border transition-all flex flex-col justify-between ${
                      method.enabled
                        ? 'bg-slate-950/80 border-emerald-500/30 shadow-md'
                        : 'bg-slate-950/30 border-slate-800/80 opacity-60'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2.5">
                          <div
                            className={`p-2 rounded-xl text-white font-bold text-xs flex items-center justify-center ${
                              isPromptPay
                                ? 'bg-blue-600'
                                : isTrueMoney
                                ? 'bg-orange-500'
                                : isLinePay
                                ? 'bg-emerald-500'
                                : isCash
                                ? 'bg-amber-600'
                                : isCredit
                                ? 'bg-indigo-600'
                                : 'bg-slate-700'
                            }`}
                          >
                            {isPromptPay && <QrCode className="w-4 h-4" />}
                            {isTrueMoney && <Wallet className="w-4 h-4" />}
                            {isLinePay && <Landmark className="w-4 h-4" />}
                            {isCash && <Banknote className="w-4 h-4" />}
                            {isCredit && <CreditCard className="w-4 h-4" />}
                            {!isPromptPay && !isTrueMoney && !isLinePay && !isCash && !isCredit && <QrCode className="w-4 h-4" />}
                          </div>
                          <div>
                            <h4 className="font-bold text-slate-100 text-xs flex items-center space-x-1.5">
                              <span>{method.name}</span>
                              <span
                                className={`text-[9px] px-2 py-0.5 rounded-full font-bold border ${
                                  method.enabled
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                    : 'bg-slate-800 text-slate-500 border-slate-700'
                                }`}
                              >
                                {method.enabled ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}
                              </span>
                            </h4>
                            {method.accountNumber && (
                              <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                                เลขบัญชี/เบอร์: <span className="text-amber-300 font-bold">{method.accountNumber}</span>
                                {method.accountName && <span className="text-slate-400"> ({method.accountName})</span>}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Toggle switch */}
                        <button
                          type="button"
                          onClick={() => handleTogglePaymentMethod(method.id)}
                          className={`w-11 h-6 rounded-full transition-colors relative p-1 shrink-0 ${
                            method.enabled ? 'bg-emerald-500' : 'bg-slate-800'
                          }`}
                        >
                          <div
                            className={`w-4 h-4 rounded-full bg-white transition-transform ${
                              method.enabled ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                      </div>

                      {method.instructions && (
                        <p className="text-[11px] text-slate-400 bg-slate-900/60 p-2 rounded-xl border border-slate-800/60 leading-relaxed">
                          {method.instructions}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-800/60 mt-2 text-[11px]">
                      <button
                        type="button"
                        onClick={() => handleOpenEditPaymentMethod(method)}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-amber-300 rounded-lg transition flex items-center space-x-1 font-medium"
                      >
                        <Edit2 className="w-3 h-3" />
                        <span>แก้ไข</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeletePaymentMethod(method.id)}
                        className="px-2.5 py-1 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg transition flex items-center space-x-1 font-medium"
                      >
                        <Trash2 className="w-3 h-3" />
                        <span>ลบ</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* SECTION 2: TAX & VAT CONFIGURATION */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2 text-amber-400">
                <Receipt className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-slate-100 text-sm">การตั้งค่าภาษีมูลค่าเพิ่ม (Tax & VAT Rate Configuration)</h3>
              </div>
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/30">
                คำนวณอัตโนมัติในหน้าขาย POS
              </span>
            </div>

            <div className="space-y-4 text-xs">
              {/* Enable / Disable VAT Toggle */}
              <div className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-xl">
                <div>
                  <label htmlFor="enableVatToggle" className="font-bold text-slate-200 block text-sm cursor-pointer">
                    เปิดใช้งานการคำนวณภาษีมูลค่าเพิ่ม (VAT / Tax Calculation)
                  </label>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    เมื่อเปิดใช้งาน ระบบ POS จะคำนวณภาษีและแสดงยอดภาษีในบิล สรุปยอดขาย และใบเสร็จให้อัตโนมัติ
                  </p>
                </div>
                <input
                  type="checkbox"
                  id="enableVatToggle"
                  checked={enableVat}
                  onChange={e => setEnableVat(e.target.checked)}
                  className="w-5 h-5 rounded border-slate-800 bg-slate-900 text-amber-500 focus:ring-amber-500 cursor-pointer"
                />
              </div>

              {enableVat && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  {/* VAT Rate Input */}
                  <div>
                    <label className="block text-slate-400 font-medium mb-1">
                      อัตราภาษีมูลค่าเพิ่ม (Tax Rate %)
                    </label>
                    <div className="relative">
                      <Percent className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.1"
                        value={vatRate}
                        onChange={e => setVatRate(Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-12 py-2.5 text-slate-100 font-mono font-bold focus:border-amber-500 text-sm"
                        placeholder="7"
                      />
                      <span className="absolute right-3 top-2.5 text-slate-400 font-bold text-xs">
                        %
                      </span>
                    </div>
                  </div>

                  {/* VAT Type Choice */}
                  <div>
                    <label className="block text-slate-400 font-medium mb-1">
                      วิธีการคำนวณภาษี (Tax Calculation Method)
                    </label>
                    <select
                      value={vatType}
                      onChange={e => setVatType(e.target.value as 'inclusive' | 'exclusive' | 'none')}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-slate-100 font-semibold focus:border-amber-500 text-xs"
                    >
                      <option value="inclusive">
                        ราคารวมภาษีแล้ว (VAT Inclusive) - ถอด VAT ออกจากราคาสินค้า
                      </option>
                      <option value="exclusive">
                        ราคาไม่รวมภาษี (VAT Exclusive) - บวก VAT เพิ่มจากราคาสินค้า
                      </option>
                      <option value="none">
                        ยกเว้นภาษี (No VAT / 0%) - ไม่คิดภาษีในบิล
                      </option>
                    </select>
                  </div>
                </div>
              )}

              {/* Real-time Calculation Preview Box */}
              {enableVat && vatType !== 'none' && (
                <div className="p-4 bg-amber-950/20 border border-amber-500/30 rounded-xl space-y-2">
                  {(() => {
                    const sampleCalc = calculateOrderTotals(100, 0, { vatRate, vatType, enableVat });
                    return (
                      <>
                        <div className="flex items-center space-x-2 text-amber-400 font-bold text-xs">
                          <Calculator className="w-4 h-4" />
                          <span>ตัวอย่างการคำนวณภาษีจริงตามการตั้งค่า (Live Tax Calculation Preview)</span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs pt-1">
                          <div className="p-2 bg-slate-950/80 rounded-lg border border-slate-800">
                            <span className="text-[10px] text-slate-400 block">ราคาสินค้าตั้งต้น</span>
                            <span className="font-mono font-bold text-slate-200">฿100.00</span>
                          </div>
                          <div className="p-2 bg-slate-950/80 rounded-lg border border-slate-800">
                            <span className="text-[10px] text-slate-400 block">มูลค่าสินค้าก่อนภาษี</span>
                            <span className="font-mono font-bold text-slate-200">
                              ฿{(sampleCalc.grandTotal - sampleCalc.vatAmount).toFixed(2)}
                            </span>
                          </div>
                          <div className="p-2 bg-amber-500/10 rounded-lg border border-amber-500/30">
                            <span className="text-[10px] text-amber-300 block">ภาษี VAT ({vatRate}%)</span>
                            <span className="font-mono font-extrabold text-amber-400">
                              ฿{sampleCalc.vatAmount.toFixed(2)}
                            </span>
                          </div>
                          <div className="p-2 bg-emerald-950/50 rounded-lg border border-emerald-500/30">
                            <span className="text-[10px] text-emerald-300 block">ยอดรวมเก็บเงินลูกค้า</span>
                            <span className="font-mono font-extrabold text-emerald-400">
                              ฿{sampleCalc.grandTotal.toFixed(2)}
                            </span>
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-400 pt-1 flex items-center space-x-1">
                          <Info className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                          <span>
                            {vatType === 'inclusive'
                              ? `ราคาสินค้า 100 บาท รวมภาษี VAT ${vatRate}% แล้ว (ภาษีคือ ฿${sampleCalc.vatAmount.toFixed(2)} ยอดเก็บลูกค้าคือ ฿100)`
                              : `ราคาสินค้า 100 บาท ยังไม่รวมภาษี VAT ${vatRate}% (บวกภาษีเพิ่ม ฿${sampleCalc.vatAmount.toFixed(2)} ยอดเก็บลูกค้าคือ ฿${sampleCalc.grandTotal.toFixed(2)})`}
                          </span>
                        </p>
                      </>
                    );
                  })()}
                </div>
              )}
            </div>
          </div>

          {/* SECTION 2: RECEIPT & PRINT FORMATTING CONFIGURATION */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2 text-emerald-400">
                <Printer className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="font-bold text-slate-100 text-sm">
                    ตั้งค่ารูปแบบการพิมพ์ใบเสร็จ (Receipt & Printer Print Configuration)
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    กำหนดขนาดตัวอักษร ขนาดกระดาษ สวิตช์การแสดงผล และข้อความท้ายใบเสร็จเริ่มต้นของร้าน
                  </p>
                </div>
              </div>
              <span className="px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 font-bold text-[10px] rounded-full shrink-0">
                ส่งผลทันทีที่หน้าพิมพ์ใบเสร็จ
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs">
              {/* Left Column: Form Controls */}
              <div className="space-y-4">
                {/* 0. Shop Logo Customization */}
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                  <label className="block text-slate-300 font-bold text-xs flex items-center justify-between">
                    <span>ตั้งค่าและปรับเปลี่ยนโลโก้ร้าน (Store Logo)</span>
                    <span className="text-[10px] text-emerald-400 font-normal">แสดงบนใบเสร็จ & บิล</span>
                  </label>
                  <div className="flex items-center space-x-3">
                    <div className="w-12 h-12 rounded-full border-2 border-slate-700 overflow-hidden bg-white shrink-0 flex items-center justify-center shadow-inner">
                      <img
                        src={shopLogoUrl || SHOP_LOGO_URL}
                        alt="Store Logo"
                        className="w-10 h-10 object-cover rounded-full"
                      />
                    </div>
                    <div className="flex-1 flex flex-wrap items-center gap-2">
                      <label className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 font-bold text-xs rounded-lg cursor-pointer transition flex items-center space-x-1 shadow-sm active:scale-95">
                        <Upload className="w-3.5 h-3.5" />
                        <span>เลือกรูปโลโก้จากเครื่อง / คลังภาพ</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            if (f) {
                              const base64 = await compressImageFile(f, 600, 0.85);
                              setShopLogoUrl(base64);
                            }
                          }}
                        />
                      </label>

                      <label className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs rounded-lg cursor-pointer transition flex items-center space-x-1 active:scale-95">
                        <Camera className="w-3.5 h-3.5 text-emerald-400" />
                        <span>ถ่ายภาพ</span>
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            if (f) {
                              const base64 = await compressImageFile(f, 600, 0.85);
                              setShopLogoUrl(base64);
                            }
                          }}
                        />
                      </label>

                      {shopLogoUrl && (
                        <button
                          type="button"
                          onClick={() => setShopLogoUrl('')}
                          className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-lg transition"
                        >
                          ใช้โลโก้เริ่มต้น
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* 1. Header & Shop Name */}
                <div>
                  <label className="block text-slate-300 font-bold mb-1">
                    ชื่อร้าน / ข้อความส่วนหัวใบเสร็จ (Receipt Header)
                  </label>
                  <input
                    type="text"
                    value={receiptHeader}
                    onChange={e => setReceiptHeader(e.target.value)}
                    placeholder="เช่น ครัวกะเพรา POS (สำนักงานใหญ่)"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-medium focus:border-emerald-500"
                  />
                </div>

                {/* 2. Font Size & Paper Size Selection */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-950 border border-slate-800 rounded-xl">
                  {/* Font Size */}
                  <div className="space-y-1.5">
                    <label className="text-slate-300 font-bold text-[11px] flex items-center space-x-1">
                      <Type className="w-3.5 h-3.5 text-amber-400" />
                      <span>ขนาดอักษร:</span>
                    </label>
                    <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800">
                      <button
                        type="button"
                        onClick={() => setReceiptFontSize('sm')}
                        className={`flex-1 py-1 rounded font-bold text-[10px] transition ${
                          receiptFontSize === 'sm' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        เล็ก (10px)
                      </button>
                      <button
                        type="button"
                        onClick={() => setReceiptFontSize('md')}
                        className={`flex-1 py-1 rounded font-bold text-[10px] transition ${
                          receiptFontSize === 'md' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        ปกติ (11.5px)
                      </button>
                      <button
                        type="button"
                        onClick={() => setReceiptFontSize('lg')}
                        className={`flex-1 py-1 rounded font-bold text-[10px] transition ${
                          receiptFontSize === 'lg' ? 'bg-amber-500 text-slate-950 shadow' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        ใหญ่ (13px)
                      </button>
                    </div>
                  </div>

                  {/* Paper Size */}
                  <div className="space-y-1.5">
                    <label className="text-slate-300 font-bold text-[11px] flex items-center space-x-1">
                      <Printer className="w-3.5 h-3.5 text-emerald-400" />
                      <span>ขนาดกระดาษ:</span>
                    </label>
                    <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-800">
                      <button
                        type="button"
                        onClick={() => setReceiptPaperWidth('80mm')}
                        className={`flex-1 py-1 rounded font-bold text-[10px] transition ${
                          receiptPaperWidth === '80mm' ? 'bg-emerald-500 text-slate-950 shadow' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        80 mm
                      </button>
                      <button
                        type="button"
                        onClick={() => setReceiptPaperWidth('58mm')}
                        className={`flex-1 py-1 rounded font-bold text-[10px] transition ${
                          receiptPaperWidth === '58mm' ? 'bg-emerald-500 text-slate-950 shadow' : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        58 mm
                      </button>
                    </div>
                  </div>
                </div>

                {/* 3. Display Toggles */}
                <div className="space-y-1.5">
                  <label className="block text-slate-300 font-bold text-[11px]">
                    เปิด/ปิด การแสดงองค์ประกอบในบิล (Visibility Controls):
                  </label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setReceiptShowLogo(!receiptShowLogo)}
                      className={`px-3 py-1.5 rounded-xl border text-[11px] font-bold transition flex items-center space-x-1 ${
                        receiptShowLogo
                          ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                          : 'bg-slate-950 border-slate-800 text-slate-500 line-through'
                      }`}
                    >
                      <span>🔥 โลโก้ร้าน</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setReceiptShowTaxId(!receiptShowTaxId)}
                      className={`px-3 py-1.5 rounded-xl border text-[11px] font-bold transition flex items-center space-x-1 ${
                        receiptShowTaxId
                          ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                          : 'bg-slate-950 border-slate-800 text-slate-500 line-through'
                      }`}
                    >
                      <span>🏢 เลขภาษี/ที่อยู่</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setReceiptShowItemDetails(!receiptShowItemDetails)}
                      className={`px-3 py-1.5 rounded-xl border text-[11px] font-bold transition flex items-center space-x-1 ${
                        receiptShowItemDetails
                          ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                          : 'bg-slate-950 border-slate-800 text-slate-500 line-through'
                      }`}
                    >
                      <span>📝 ท็อปปิ้ง/หมายเหตุ</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setReceiptUseMonospace(!receiptUseMonospace)}
                      className={`px-3 py-1.5 rounded-xl border text-[11px] font-bold transition flex items-center space-x-1 ${
                        receiptUseMonospace
                          ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300 font-mono'
                          : 'bg-slate-950 border-slate-800 text-slate-400'
                      }`}
                    >
                      <span>🔤 ฟอนต์ Monospace</span>
                    </button>
                  </div>
                </div>

                {/* 4. Custom Footer Note */}
                <div className="space-y-2">
                  <label className="block text-slate-300 font-bold text-[11px]">
                    ข้อความท้ายใบเสร็จ (Custom Footer Note):
                  </label>
                  <input
                    type="text"
                    value={receiptFooterNote}
                    onChange={e => setReceiptFooterNote(e.target.value)}
                    placeholder="พิมพ์ข้อความท้ายใบเสร็จ..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-medium focus:border-amber-500"
                  />

                  {/* Quick Preset Buttons */}
                  <div className="flex items-center space-x-1.5 pt-0.5 overflow-x-auto text-[10px]">
                    <span className="text-slate-500 shrink-0 font-medium">ตัวอย่าง:</span>
                    <button
                      type="button"
                      onClick={() => setReceiptFooterNote('*** ขอบพระคุณที่อุดหนุน ***')}
                      className="px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-amber-300 border border-slate-800 shrink-0 transition"
                    >
                      ขอบคุณ
                    </button>
                    <button
                      type="button"
                      onClick={() => setReceiptFooterNote('สะสมแต้มผ่าน Line: @kapraopos')}
                      className="px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-amber-300 border border-slate-800 shrink-0 transition"
                    >
                      สะสมแต้ม Line
                    </button>
                    <button
                      type="button"
                      onClick={() => setReceiptFooterNote('กรุณาเก็บใบเสร็จไว้เป็นหลักฐาน')}
                      className="px-2.5 py-1 rounded-lg bg-slate-950 hover:bg-slate-800 text-slate-300 hover:text-amber-300 border border-slate-800 shrink-0 transition"
                    >
                      เก็บหลักฐาน
                    </button>
                  </div>
                </div>
              </div>

              {/* Right Column: Live Receipt Preview Box */}
              <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 space-y-3 flex flex-col justify-between">
                <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                  <span className="font-bold text-amber-400 text-xs flex items-center space-x-1.5">
                    <Eye className="w-4 h-4" />
                    <span>ตัวอย่างการแสดงผลบนกระดาษใบเสร็จจริง (Live Receipt Preview)</span>
                  </span>
                  <span className="text-[10px] font-mono text-slate-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                    {receiptPaperWidth}
                  </span>
                </div>

                {/* Simulated Thermal Paper Slip */}
                <div className="flex-1 flex justify-center items-start py-2">
                  <div
                    className={`bg-white text-slate-900 p-4 rounded-lg shadow-xl border border-slate-300 transition-all ${
                      receiptPaperWidth === '58mm' ? 'w-56' : 'w-72'
                    } ${
                      receiptFontSize === 'sm'
                        ? 'text-[10px] leading-tight'
                        : receiptFontSize === 'lg'
                        ? 'text-[12.5px] leading-snug'
                        : 'text-[11px] leading-snug'
                    } ${receiptUseMonospace ? 'font-mono' : 'font-sans'}`}
                  >
                    {/* Header / Logo */}
                    {receiptShowLogo && (
                      <div className="flex justify-center mb-1 text-amber-600 font-black text-lg">
                        🔥
                      </div>
                    )}
                    <div className="text-center font-bold text-slate-900 border-b border-dashed border-slate-300 pb-1.5 mb-2">
                      <div>{receiptHeader || settings.shopName}</div>
                      {receiptShowTaxId && (
                        <div className="text-[9px] text-slate-600 font-normal mt-0.5">
                          เลขภาษี: {taxId || settings.shopTaxId || '0105562089123'}
                        </div>
                      )}
                    </div>

                    {/* Order Details */}
                    <div className="space-y-1 mb-2">
                      <div className="flex justify-between font-bold">
                        <span>1. กะเพราเนื้อสับไข่ดาว</span>
                        <span>฿85.00</span>
                      </div>
                      {receiptShowItemDetails && (
                        <div className="text-[9px] text-slate-500 pl-2">
                          + เผ็ดมาก / ไข่ดาวสุก
                        </div>
                      )}

                      <div className="flex justify-between font-bold">
                        <span>2. ชาเย็นโบราณ</span>
                        <span>฿40.00</span>
                      </div>
                    </div>

                    {/* Totals */}
                    <div className="border-t border-b border-dashed border-slate-300 py-1.5 space-y-0.5 mb-2 font-mono text-right">
                      <div className="flex justify-between">
                        <span>รวมเงิน:</span>
                        <span>฿125.00</span>
                      </div>
                      <div className="flex justify-between font-bold text-slate-900">
                        <span>สุทธิ:</span>
                        <span>฿125.00</span>
                      </div>
                    </div>

                    {/* Footer Note */}
                    <div className="text-center text-[10px] font-bold text-slate-700 italic pt-1">
                      {receiptFooterNote}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 3: KDS CONFIG */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center space-x-2 text-sky-400 border-b border-slate-800 pb-3">
              <Bell className="w-5 h-5" />
              <h3 className="font-bold text-slate-100 text-sm">ตั้งค่าระบบห้องครัว KDS Timer</h3>
            </div>

            <div className="text-xs space-y-2">
              <label className="block text-slate-400">เกณฑ์นาทีในการเตือนออเดอร์ช้า (KDS Warning Minutes)</label>
              <input
                type="number"
                min={1}
                max={60}
                value={kdsWarnMin}
                onChange={e => setKdsWarnMin(Number(e.target.value))}
                className="w-32 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-mono font-bold"
              />
              <p className="text-[11px] text-slate-500">
                เมื่อออเดอร์ในครัวรอนานเกิน {kdsWarnMin} นาที การ์ดออเดอร์จะเปลี่ยนเป็นสีแดงและกะพริบแจ้งเตือน
              </p>
            </div>
          </div>

          {/* SAVE BUTTON */}
          <button
            type="submit"
            className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-extrabold text-sm rounded-2xl shadow-xl transition flex items-center justify-center space-x-2 active:scale-98"
          >
            <Save className="w-5 h-5" />
            <span>บันทึกการตั้งค่าทั้งหมด</span>
          </button>
        </form>
        </>
        )}
      </div>

      {/* ADD / EDIT QR PAYMENT METHOD MODAL */}
      {isPaymentMethodModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4 text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2.5 text-emerald-400">
                <div className="p-2 bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                  <QrCode className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-100 text-base">
                    {editingPaymentMethod ? 'แก้ไขช่องทางการชำระเงิน' : 'เพิ่มช่องทางการชำระเงินใหม่'}
                  </h3>
                  <p className="text-xs text-slate-400">กำหนดรายละเอียดเลขบัญชีและคำแนะนำสำหรับลูกค้า</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPaymentMethodModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-100 bg-slate-800 hover:bg-slate-700 rounded-xl transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePaymentMethodForm} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-bold mb-1">
                  ประเภทช่องทางการชำระเงิน (Payment Type)
                </label>
                <select
                  value={paymentMethodForm.type || 'promptpay'}
                  onChange={e =>
                    setPaymentMethodForm({
                      ...paymentMethodForm,
                      type: e.target.value as QrPaymentOption['type']
                    })
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 font-bold focus:border-emerald-500"
                >
                  <option value="promptpay">พร้อมเพย์ (PromptPay QR)</option>
                  <option value="truemoney">TrueMoney Wallet</option>
                  <option value="linepay">Rabbit LINE Pay</option>
                  <option value="cash">เงินสด / จ่ายที่เคาน์เตอร์</option>
                  <option value="credit">บัตรเครดิต / เดบิต</option>
                  <option value="custom">โอนเงินธนาคาร / อื่นๆ (Custom)</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">
                  ชื่อช่องทางชำระเงินที่แสดงให้ลูกค้าเห็น *
                </label>
                <input
                  type="text"
                  required
                  value={paymentMethodForm.name || ''}
                  onChange={e => setPaymentMethodForm({ ...paymentMethodForm, name: e.target.value })}
                  placeholder="เช่น พร้อมเพย์ QR Code (ครัวกะเพรา)"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-medium focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">
                    หมายเลขบัญชี / เบอร์โทรศัพท์ / Merchant ID
                  </label>
                  <input
                    type="text"
                    value={paymentMethodForm.accountNumber || ''}
                    onChange={e =>
                      setPaymentMethodForm({ ...paymentMethodForm, accountNumber: e.target.value })
                    }
                    placeholder="เช่น 081-234-5678"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">
                    ชื่อบัญชี / ชื่อร้านค้า
                  </label>
                  <input
                    type="text"
                    value={paymentMethodForm.accountName || ''}
                    onChange={e =>
                      setPaymentMethodForm({ ...paymentMethodForm, accountName: e.target.value })
                    }
                    placeholder="เช่น ร้านครัวกะเพรา POS"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-medium focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1">
                  คำแนะนำในการชำระเงินสำหรับลูกค้า (Payment Instructions)
                </label>
                <textarea
                  rows={2}
                  value={paymentMethodForm.instructions || ''}
                  onChange={e =>
                    setPaymentMethodForm({ ...paymentMethodForm, instructions: e.target.value })
                  }
                  placeholder="เช่น สแกน QR Code เพื่อชำระเงินผ่านแอปธนาคารทุกธนาคาร"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-medium focus:border-emerald-500"
                />
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="enablePaymentMethodCheck"
                  checked={paymentMethodForm.enabled !== false}
                  onChange={e =>
                    setPaymentMethodForm({ ...paymentMethodForm, enabled: e.target.checked })
                  }
                  className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                />
                <label htmlFor="enablePaymentMethodCheck" className="text-slate-200 font-bold cursor-pointer">
                  เปิดใช้งานช่องทางนี้ในหน้าสั่งซื้อทันที
                </label>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsPaymentMethodModalOpen(false)}
                  className="py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow-lg transition"
                >
                  บันทึกช่องทางชำระเงิน
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RESET CONFIRMATION MODAL */}
      {showResetConfirmModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 text-slate-100">
            <div className="flex items-center space-x-3 text-rose-500 border-b border-slate-800 pb-3">
              <div className="p-3 bg-rose-500/10 rounded-2xl border border-rose-500/20">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-100 text-base">ล้างข้อมูลระบบทั้งหมด?</h3>
                <p className="text-xs text-rose-400 mt-0.5">การกระทำนี้ไม่สามารถย้อนกลับได้</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 bg-slate-950 p-3 rounded-xl border border-slate-800">
              คุณแน่ใจหรือไม่ที่จะล้างข้อมูลยอดขาย สต๊อก ประวัติ และโต๊ะทั้งหมดในระบบกลับสู่ค่าเริ่มต้น?
            </p>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => setShowResetConfirmModal(false)}
                className="py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition"
              >
                ยกเลิก
              </button>
              <button
                onClick={() => {
                  resetToDefaultData();
                  setShowResetConfirmModal(false);
                }}
                className="py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-lg transition"
              >
                ยืนยันล้างข้อมูล
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MANAGER AUTHORIZATION VERIFICATION MODAL */}
      {isAuthModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4 text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2.5 text-amber-400">
                <div className="p-2 bg-amber-500/10 rounded-xl border border-amber-500/20">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-100 text-base">ยืนยันสิทธิ์ผู้จัดการ (Manager Auth)</h3>
                  <p className="text-xs text-slate-400">กรอก Manager PIN เพื่อเข้าสู่โหมดจัดการรหัสผ่าน</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsAuthModalOpen(false);
                  setAuthError('');
                  setAuthPinInput('');
                }}
                className="p-1.5 text-slate-400 hover:text-slate-100 bg-slate-800 rounded-xl transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleVerifyManagerPin} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-bold mb-1.5 text-center">
                  ป้อนรหัส Manager PIN (4 หลัก)
                </label>
                <input
                  type="password"
                  autoFocus
                  maxLength={4}
                  value={authPinInput}
                  onChange={e => {
                    setAuthPinInput(e.target.value);
                    if (authError) setAuthError('');
                  }}
                  placeholder="••••"
                  className="w-full bg-slate-950 border border-amber-500/50 rounded-2xl px-3 py-3 text-amber-400 font-mono font-black text-center text-2xl tracking-widest focus:ring-2 focus:ring-amber-500"
                />
                <p className="text-[10px] text-slate-500 text-center mt-1">
                  (รหัสผ่านเริ่มต้น Manager PIN คือ <span className="text-amber-400 font-bold font-mono">5555</span> หรือ Admin PIN <span className="text-amber-400 font-bold font-mono">1234</span>)
                </p>
              </div>

              {authError && (
                <div className="p-2.5 bg-rose-500/20 border border-rose-500/40 text-rose-300 rounded-xl text-center font-bold text-[11px]">
                  {authError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsAuthModalOpen(false);
                    setAuthError('');
                    setAuthPinInput('');
                  }}
                  className="py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="py-2.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-extrabold rounded-xl shadow-lg transition active:scale-95"
                >
                  ยืนยันสิทธิ์
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE / EDIT EMPLOYEE PIN & PERMISSIONS MODAL */}
      {isEmployeePinModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4 text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2.5 text-purple-400">
                <div className="p-2 bg-purple-500/10 rounded-xl border border-purple-500/20">
                  <Key className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-100 text-base">
                    {editingEmployee.id ? 'แก้ไขรหัส PIN & สิทธิ์พนักงาน' : 'เพิ่มพนักงานและกำหนดรหัส PIN ใหม่'}
                  </h3>
                  <p className="text-xs text-slate-400">กำหนดชื่อ ตำแหน่ง รหัสผ่าน 4 หลัก และสิทธิ์ใช้งานในระบบ</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsEmployeePinModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-100 bg-slate-800 rounded-xl transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEmployeeForm} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">ชื่อ-นามสกุล พนักงาน *</label>
                  <input
                    type="text"
                    required
                    value={editingEmployee.name}
                    onChange={e => setEditingEmployee({ ...editingEmployee, name: e.target.value })}
                    placeholder="เช่น สมชาย สายดี"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-medium focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">ตำแหน่ง (Role)</label>
                  <select
                    value={editingEmployee.role}
                    onChange={e => setEditingEmployee({ ...editingEmployee, role: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-bold focus:border-purple-500"
                  >
                    <option value="แคชเชียร์">แคชเชียร์ (Cashier)</option>
                    <option value="พนักงานเสิร์ฟ">พนักงานเสิร์ฟ (Server / Waiter)</option>
                    <option value="ผู้จัดการร้าน">ผู้จัดการร้าน (Store Manager)</option>
                    <option value="เชฟ / แม่ครัว">เชฟ / แม่ครัว (Chef / Kitchen)</option>
                    <option value="บาริสต้า">บาริสต้า (Barista)</option>
                    <option value="พนักงานทั่วไป">พนักงานทั่วไป (Staff)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-bold mb-1">เบอร์โทรศัพท์ติดต่อ</label>
                  <input
                    type="text"
                    value={editingEmployee.phone}
                    onChange={e => setEditingEmployee({ ...editingEmployee, phone: e.target.value })}
                    placeholder="081-234-5678"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-100 font-mono focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-bold mb-1">รหัส PIN 4 หลัก *</label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      required
                      maxLength={4}
                      value={editingEmployee.pin}
                      onChange={e => setEditingEmployee({ ...editingEmployee, pin: e.target.value })}
                      placeholder="1234"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-amber-300 font-mono font-bold text-center tracking-widest text-base focus:border-purple-500"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const randomPin = Math.floor(1000 + Math.random() * 9000).toString();
                        setEditingEmployee({ ...editingEmployee, pin: randomPin });
                      }}
                      className="px-2.5 py-2 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 font-bold rounded-xl shrink-0 transition"
                      title="สุ่ม PIN ใหม่"
                    >
                      <Shuffle className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Access Status Toggle */}
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between">
                <div>
                  <span className="font-bold text-slate-200 block">สถานะสิทธิ์เข้าถึงระบบ (Access Status)</span>
                  <span className="text-[11px] text-slate-400">
                    {editingEmployee.status === 'active' ? '🟢 ปกติ (สามารถใช้ PIN เข้าสู่ระบบได้)' : '🔴 ระงับสิทธิ์ (ไม่สามารถใช้ PIN เข้าสู่ระบบได้)'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setEditingEmployee({
                      ...editingEmployee,
                      status: editingEmployee.status === 'active' ? 'inactive' : 'active'
                    })
                  }
                  className={`px-3 py-1.5 rounded-xl font-bold text-xs border transition ${
                    editingEmployee.status === 'active'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                      : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  }`}
                >
                  {editingEmployee.status === 'active' ? 'ใช้งานได้' : 'ระงับสิทธิ์'}
                </button>
              </div>

              {/* Permissions Checkboxes Grid */}
              <div className="space-y-2 pt-1">
                <label className="block text-slate-300 font-bold">กำหนดสิทธิ์การเข้าใช้งานเมนูต่างๆ (Granular Permissions):</label>
                <div className="grid grid-cols-2 gap-2 p-3 bg-slate-950 border border-slate-800 rounded-xl text-[11px]">
                  <label className="flex items-center space-x-2 cursor-pointer hover:text-amber-300 transition">
                    <input
                      type="checkbox"
                      checked={editingEmployee.permissions?.canAccessPOS !== false}
                      onChange={e => setEditingEmployee({
                        ...editingEmployee,
                        permissions: { ...editingEmployee.permissions, canAccessPOS: e.target.checked }
                      })}
                      className="rounded border-slate-700 bg-slate-900 text-purple-600"
                    />
                    <span>🛒 POS หน้าขาย</span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer hover:text-amber-300 transition">
                    <input
                      type="checkbox"
                      checked={editingEmployee.permissions?.canAccessKDS !== false}
                      onChange={e => setEditingEmployee({
                        ...editingEmployee,
                        permissions: { ...editingEmployee.permissions, canAccessKDS: e.target.checked }
                      })}
                      className="rounded border-slate-700 bg-slate-900 text-purple-600"
                    />
                    <span>🍳 KDS หน้าครัว</span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer hover:text-amber-300 transition">
                    <input
                      type="checkbox"
                      checked={!!editingEmployee.permissions?.canAccessInventory}
                      onChange={e => setEditingEmployee({
                        ...editingEmployee,
                        permissions: { ...editingEmployee.permissions, canAccessInventory: e.target.checked }
                      })}
                      className="rounded border-slate-700 bg-slate-900 text-purple-600"
                    />
                    <span>📦 จัดการสต็อก</span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer hover:text-amber-300 transition">
                    <input
                      type="checkbox"
                      checked={!!editingEmployee.permissions?.canAccessAccounting}
                      onChange={e => setEditingEmployee({
                        ...editingEmployee,
                        permissions: { ...editingEmployee.permissions, canAccessAccounting: e.target.checked }
                      })}
                      className="rounded border-slate-700 bg-slate-900 text-purple-600"
                    />
                    <span>📊 บัญชี/ยอดขาย</span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer hover:text-amber-300 transition">
                    <input
                      type="checkbox"
                      checked={!!editingEmployee.permissions?.canAccessSettings}
                      onChange={e => setEditingEmployee({
                        ...editingEmployee,
                        permissions: { ...editingEmployee.permissions, canAccessSettings: e.target.checked }
                      })}
                      className="rounded border-slate-700 bg-slate-900 text-purple-600"
                    />
                    <span>⚙️ ตั้งค่าระบบ</span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer hover:text-amber-300 transition">
                    <input
                      type="checkbox"
                      checked={!!editingEmployee.permissions?.canVoidOrder}
                      onChange={e => setEditingEmployee({
                        ...editingEmployee,
                        permissions: { ...editingEmployee.permissions, canVoidOrder: e.target.checked }
                      })}
                      className="rounded border-slate-700 bg-slate-900 text-purple-600"
                    />
                    <span>❌ สิทธิ์ยกเลิกบิล</span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer hover:text-amber-300 transition">
                    <input
                      type="checkbox"
                      checked={!!editingEmployee.permissions?.canGiveDiscount}
                      onChange={e => setEditingEmployee({
                        ...editingEmployee,
                        permissions: { ...editingEmployee.permissions, canGiveDiscount: e.target.checked }
                      })}
                      className="rounded border-slate-700 bg-slate-900 text-purple-600"
                    />
                    <span>🏷️ สิทธิ์ให้ส่วนลด</span>
                  </label>

                  <label className="flex items-center space-x-2 cursor-pointer hover:text-amber-300 transition">
                    <input
                      type="checkbox"
                      checked={!!editingEmployee.permissions?.canEditRecipe}
                      onChange={e => setEditingEmployee({
                        ...editingEmployee,
                        permissions: { ...editingEmployee.permissions, canEditRecipe: e.target.checked }
                      })}
                      className="rounded border-slate-700 bg-slate-900 text-purple-600"
                    />
                    <span>🍲 สิทธิ์แก้ไขสูตร BOM</span>
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEmployeePinModalOpen(false)}
                  className="py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-extrabold text-xs rounded-xl shadow-lg transition active:scale-95"
                >
                  บันทึกข้อมูลพนักงาน
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FACTORY RESET CONFIRMATION MODAL */}
      {isResetConfirmModalOpen && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-rose-500/40 rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4 text-slate-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2.5 text-rose-400">
                <div className="p-2 bg-rose-500/10 rounded-xl border border-rose-500/20">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-slate-100 text-base">ยืนยันการล้างข้อมูลระบบ</h3>
                  <p className="text-xs text-rose-300">กรอก Manager PIN เพื่อล้างข้อมูลเบราว์เซอร์</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsResetConfirmModalOpen(false);
                  setResetPinError('');
                  setResetPinInput('');
                }}
                className="p-1.5 text-slate-400 hover:text-slate-100 bg-slate-800 rounded-xl transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleExecuteFactoryReset} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-bold mb-1.5 text-center">
                  ป้อนรหัส Manager PIN (5555) เพื่อยืนยัน
                </label>
                <input
                  type="password"
                  autoFocus
                  maxLength={4}
                  value={resetPinInput}
                  onChange={e => {
                    setResetPinInput(e.target.value);
                    if (resetPinError) setResetPinError('');
                  }}
                  placeholder="••••"
                  className="w-full bg-slate-950 border border-rose-500/50 rounded-2xl px-3 py-3 text-rose-400 font-mono font-black text-center text-2xl tracking-widest focus:ring-2 focus:ring-rose-500"
                />
              </div>

              {resetPinError && (
                <div className="p-2.5 bg-rose-500/20 border border-rose-500/40 text-rose-300 rounded-xl text-center font-bold text-[11px]">
                  {resetPinError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsResetConfirmModalOpen(false);
                    setResetPinError('');
                    setResetPinInput('');
                  }}
                  className="py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="py-2.5 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-extrabold rounded-xl shadow-lg transition active:scale-95"
                >
                  ยืนยันล้างข้อมูล
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
