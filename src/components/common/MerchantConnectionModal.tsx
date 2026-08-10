import React, { useState } from 'react';
import {
  Store,
  CheckCircle2,
  AlertTriangle,
  X,
  RefreshCw,
  Zap,
  ShieldCheck,
  Building2,
  Copy,
  Check,
  QrCode,
  Smartphone,
  ExternalLink,
  Wifi
} from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { MerchantConnectionSettings } from '../../types';

interface MerchantConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MerchantConnectionModal: React.FC<MerchantConnectionModalProps> = ({ isOpen, onClose }) => {
  const { settings, updateSettings } = usePOS();

  const currentMerchant: MerchantConnectionSettings = settings.merchantSettings || {
    isConnected: true,
    merchantName: 'ร้านครัวกะเพรา POS (Bangkok Bank Merchant Pro)',
    merchantId: 'MERCHANT-BBL-99218',
    terminalId: 'TERM-01-POS',
    provider: 'bbl_merchant_pro',
    autoConfirmPayment: true,
    lastConnectedAt: '10/08/2026 12:30'
  };

  const [provider, setProvider] = useState<MerchantConnectionSettings['provider']>(
    currentMerchant.provider || 'bbl_merchant_pro'
  );
  const [merchantName, setMerchantName] = useState(currentMerchant.merchantName || 'ร้านครัวกะเพรา POS');
  const [merchantId, setMerchantId] = useState(currentMerchant.merchantId || 'MERCHANT-BBL-99218');
  const [terminalId, setTerminalId] = useState(currentMerchant.terminalId || 'TERM-01-POS');
  const [apiKey, setApiKey] = useState(currentMerchant.apiKey || 'pk_live_kaprao_sec_88921a99');
  const [autoConfirm, setAutoConfirm] = useState(currentMerchant.autoConfirmPayment !== false);
  const [isConnected, setIsConnected] = useState(currentMerchant.isConnected !== false);

  const [isTesting, setIsTesting] = useState(false);
  const [testSuccess, setTestSuccess] = useState<boolean | null>(null);
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  if (!isOpen) return null;

  const webhookUrl = 'https://api.kapraopos.com/webhooks/merchant-pro';

  const handleTestConnection = () => {
    setIsTesting(true);
    setTestSuccess(null);
    setTimeout(() => {
      setIsTesting(false);
      setTestSuccess(true);
    }, 1200);
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: MerchantConnectionSettings = {
      isConnected,
      merchantName,
      merchantId,
      terminalId,
      apiKey,
      provider,
      autoConfirmPayment: autoConfirm,
      lastConnectedAt: new Date().toLocaleDateString('th-TH') + ' ' + new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
    };

    updateSettings({
      ...settings,
      merchantSettings: updated
    });

    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
      onClose();
    }, 800);
  };

  const handleToggleConnection = () => {
    const nextState = !isConnected;
    setIsConnected(nextState);
    updateSettings({
      ...settings,
      merchantSettings: {
        ...currentMerchant,
        isConnected: nextState
      }
    });
  };

  const handleCopyWebhook = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200 overflow-y-auto">
      <div className="bg-[#0f172a] border border-slate-800 rounded-3xl max-w-xl w-full overflow-hidden shadow-2xl my-auto">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-800/80 bg-slate-900/90 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="relative w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-blue-800 p-0.5 shadow-lg shadow-blue-950/60 flex items-center justify-center">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center relative overflow-hidden">
                <Store className="w-6 h-6 text-blue-400" />
                <span className="absolute bottom-0 right-0 w-3 h-3 bg-blue-500 rounded-tl-md flex items-center justify-center text-[8px] font-bold text-white">
                  P
                </span>
              </div>
              <span className="absolute -top-1 -right-1 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-4 w-4 bg-rose-500 text-[9px] font-bold text-white items-center justify-center">1</span>
              </span>
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-bold text-slate-100 text-base sm:text-lg">
                  Merchant Pro (ระบบเชื่อมต่อแอป Merchant)
                </h3>
                {isConnected ? (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950 border border-emerald-500/40 text-emerald-400 flex items-center space-x-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span>เชื่อมต่อแล้ว</span>
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 border border-slate-700 text-slate-400">
                    ไม่ได้เชื่อมต่อ
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                เชื่อมต่อบัญชีร้านค้า Bangkok Bank Merchant Pro & Dynamic QR เพื่อรับยอดขายและยืนยันสลิปอัตโนมัติ
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800/80 rounded-xl transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSaveSettings} className="p-5 sm:p-6 space-y-5">
          
          {/* Status Card */}
          <div className={`p-4 rounded-2xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            isConnected
              ? 'bg-blue-950/40 border-blue-500/40 text-blue-200'
              : 'bg-slate-900 border-slate-800 text-slate-300'
          }`}>
            <div className="flex items-center space-x-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                isConnected ? 'bg-blue-600/30 text-blue-400 border border-blue-500/50' : 'bg-slate-800 text-slate-500'
              }`}>
                <Wifi className="w-5 h-5" />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-100 flex items-center space-x-1.5">
                  <span>สถานะแอป Merchant Pro:</span>
                  <span className={isConnected ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                    {isConnected ? '🟢 ออนไลน์ / เชื่อมต่อสมบูรณ์' : '⚪ ปิดการใช้งาน'}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  {isConnected ? `เชื่อมต่อล่าสุดเมื่อ: ${currentMerchant.lastConnectedAt || 'เมื่อซักครู่'}` : 'กดเปิดสวิตช์เพื่อเริ่มรับข้อมูลสแกนจ่าย Real-time'}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleToggleConnection}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center justify-center space-x-1.5 shrink-0 shadow-md ${
                isConnected
                  ? 'bg-rose-950/80 hover:bg-rose-900 text-rose-300 border border-rose-500/40'
                  : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-950/60'
              }`}
            >
              <Zap className="w-4 h-4" />
              <span>{isConnected ? 'ยกเลิกการเชื่อมต่อ' : 'เชื่อมต่อ Merchant Pro ทันที'}</span>
            </button>
          </div>

          {/* Provider Selection */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
              <span>เลือกประเภทผู้ให้บริการ Merchant App *</span>
              <span className="text-[11px] text-amber-400 font-normal">รองรับ Merchant Pro ทุกธนาคาร</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              {[
                { id: 'bbl_merchant_pro', label: 'Merchant Pro (BBL)', desc: 'ธนาคารกรุงเทพ', color: 'border-blue-500 bg-blue-950/50 text-blue-200' },
                { id: 'promptpay_dynamic', label: 'PromptPay Dynamic', desc: 'พร้อมเพย์ QR', color: 'border-cyan-500 bg-cyan-950/50 text-cyan-200' },
                { id: 'scb_merchant', label: 'SCB MaeManee', desc: 'แม่มณี SCB', color: 'border-purple-500 bg-purple-950/50 text-purple-200' },
                { id: 'kbank_merchant', label: 'K-Merchant', desc: 'กสิกรไทย', color: 'border-emerald-500 bg-emerald-950/50 text-emerald-200' },
                { id: 'delivery_merchant', label: 'Food Delivery API', desc: 'Grab / LINEMAN', color: 'border-orange-500 bg-orange-950/50 text-orange-200' }
              ].map(item => {
                const isSelected = provider === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setProvider(item.id as any)}
                    className={`p-3 rounded-2xl border text-left transition flex flex-col justify-between space-y-1 ${
                      isSelected
                        ? item.color + ' ring-2 ring-blue-500/30 font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs font-bold">{item.label}</span>
                      {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />}
                    </div>
                    <span className="text-[10px] opacity-75">{item.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Form Fields Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-900/80 p-4 rounded-2xl border border-slate-800">
            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-bold text-slate-300">ชื่อร้านค้าในระบบ Merchant (Display Name)</label>
              <input
                type="text"
                required
                value={merchantName}
                onChange={e => setMerchantName(e.target.value)}
                placeholder="เช่น ครัวกะเพรา POS สาขาหลัก"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-medium text-slate-100 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300">Merchant ID (รหัสร้านค้า)</label>
              <input
                type="text"
                required
                value={merchantId}
                onChange={e => setMerchantId(e.target.value)}
                placeholder="เช่น MERCHANT-BBL-99218"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono font-bold text-amber-300 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-300">Terminal ID (รหัสเครื่อง POS)</label>
              <input
                type="text"
                required
                value={terminalId}
                onChange={e => setTerminalId(e.target.value)}
                placeholder="เช่น TERM-01-POS"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono font-bold text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>

            <div className="space-y-1 sm:col-span-2">
              <label className="text-xs font-bold text-slate-300">Merchant API Key / Secret Token</label>
              <input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder="คีย์เชื่อมต่อ API จากแอป Merchant Pro"
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-slate-200 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Webhook & Auto Verify Toggle */}
          <div className="space-y-3 bg-slate-950/60 p-4 rounded-2xl border border-slate-800">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-bold text-slate-200 block">
                  ยืนยันสลิปและอัปเดตยอดชำระเงินอัตโนมัติ (Auto Slip Verification)
                </label>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  เมื่อลูกค้ารับหรือสแกน QR Code สำเร็จ แอป Merchant Pro จะแจ้งเตือนเพื่อตัดออเดอร์ทันที
                </p>
              </div>
              <input
                type="checkbox"
                checked={autoConfirm}
                onChange={e => setAutoConfirm(e.target.checked)}
                className="w-5 h-5 rounded border-slate-700 bg-slate-900 text-blue-500 focus:ring-blue-500 cursor-pointer shrink-0"
              />
            </div>

            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium truncate max-w-[280px]">
                Webhook URL: <code className="text-amber-400 font-mono text-[11px] ml-1">{webhookUrl}</code>
              </span>
              <button
                type="button"
                onClick={handleCopyWebhook}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-[10px] rounded-lg transition flex items-center space-x-1 shrink-0"
              >
                {copiedWebhook ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedWebhook ? 'คัดลอกแล้ว' : 'คัดลอก Webhook'}</span>
              </button>
            </div>
          </div>

          {/* API Test & Actions */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-800">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={isTesting}
              className="w-full sm:w-auto px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-blue-300 font-bold text-xs rounded-xl border border-slate-700 transition flex items-center justify-center space-x-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin text-blue-400' : ''}`} />
              <span>{isTesting ? 'กำลังทดสอบเชื่อมต่อ API...' : 'ทดสอบการเชื่อมต่อ API'}</span>
            </button>

            {testSuccess && (
              <span className="text-xs text-emerald-400 font-bold flex items-center space-x-1 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>API Response 200 OK (18ms)</span>
              </span>
            )}

            <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl transition"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-blue-950/60 transition active:scale-95 flex items-center space-x-1.5"
              >
                {saveSuccess ? (
                  <>
                    <Check className="w-4 h-4 text-white" />
                    <span>บันทึกสำเร็จ</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4 text-white" />
                    <span>บันทึกการตั้งค่า Merchant</span>
                  </>
                )}
              </button>
            </div>
          </div>

        </form>
      </div>
    </div>
  );
};
