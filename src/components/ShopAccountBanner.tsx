import React, { useEffect, useState } from 'react';
import { CloudOff, Cloud, X, Loader2 } from 'lucide-react';
import { FirebaseUserInfo, onFirebaseUserChange, signInShopAccount, signOutShopAccount } from '../services/firebaseService';

const DISMISS_KEY = 'shop_account_banner_dismissed';

/** Sign-in dialog for the shop's cloud account (one account shared by the shop's devices). */
export const ShopAccountDialog: React.FC<{ user: FirebaseUserInfo | null; onClose: () => void }> = ({ user, onClose }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const signedIn = !!user && !user.isAnonymous;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await signInShopAccount(email, password);
    setBusy(false);
    if (!res.ok) {
      setError(res.error || 'เข้าสู่ระบบไม่สำเร็จ');
      return;
    }
    // Restart so every cloud listener reconnects with the shop account's permissions
    window.location.reload();
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/75 flex items-center justify-center p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="บัญชีร้าน"
        onClick={e => e.stopPropagation()}
        className="w-full max-w-md rounded-3xl bg-[#160e09] border border-[#3a2517] p-6 flex flex-col gap-4 text-[#f6efe7]"
      >
        <div className="flex items-center justify-between">
          <div className="text-lg font-semibold">บัญชีร้าน (Cloud)</div>
          <button type="button" onClick={onClose} aria-label="ปิด" className="w-10 h-10 rounded-xl border border-[#3a2517] bg-[#1d130c] flex items-center justify-center">
            <X className="w-5 h-5" />
          </button>
        </div>

        {signedIn ? (
          <>
            <p className="text-sm text-[#d9c7b5]">
              เครื่องนี้เชื่อมกับบัญชี <span className="font-semibold text-[#ffb07a]">{user?.email}</span> แล้ว
            </p>
            <button
              type="button"
              onClick={async () => {
                await signOutShopAccount();
                window.location.reload();
              }}
              className="h-12 rounded-xl border border-[#4a2718] text-[#ff9b85] font-semibold"
            >
              ยกเลิกการเชื่อมบัญชีบนเครื่องนี้
            </button>
          </>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <p className="text-sm text-[#b3a393] leading-relaxed">
              ใช้บัญชีร้านที่เจ้าของสร้างไว้ใน Firebase (ทำครั้งเดียวต่อเครื่อง) พนักงานแต่ละคนยังล็อกอินด้วย PIN ตามปกติ
            </p>
            <label className="flex flex-col gap-1.5 text-sm">
              อีเมลบัญชีร้าน
              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="h-12 px-3 rounded-xl bg-[#1d130c] border border-[#3a2517] outline-none text-base"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              รหัสผ่าน
              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="h-12 px-3 rounded-xl bg-[#1d130c] border border-[#3a2517] outline-none text-base"
              />
            </label>
            {error && (
              <div role="alert" className="p-3 rounded-xl bg-[#2a150f] border border-[#4a2718] text-[#ffb4a0] text-sm">
                {error}
              </div>
            )}
            <button type="submit" disabled={busy} className="h-12 rounded-xl bg-[#ff6a13] text-[#1a0d05] font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              เชื่อมบัญชีร้าน
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

/**
 * Shown on staff devices that are not signed in with the shop account: under the security
 * rules such a device cannot sync with the cloud.
 */
export const ShopAccountBanner: React.FC = () => {
  const [user, setUser] = useState<FirebaseUserInfo | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => onFirebaseUserChange(setUser), []);

  const needsAccount = user !== undefined && (!user || user.isAnonymous);

  return (
    <>
      {needsAccount && !dismissed && (
        <div className="shrink-0 bg-[#2a170d] border-b border-[#6b3a1a] text-[#ffd3b0] px-3 py-2 text-sm flex items-center gap-2">
          <CloudOff className="w-4 h-4 shrink-0 text-[#ff8a3d]" />
          <span className="flex-1 min-w-0">เครื่องนี้ยังไม่ได้เชื่อมบัญชีร้าน ข้อมูลอาจไม่ซิงค์ขึ้น cloud</span>
          <button type="button" onClick={() => setOpen(true)} className="h-9 px-3 rounded-lg bg-[#ff6a13] text-[#1a0d05] font-semibold shrink-0">
            เชื่อมบัญชีร้าน
          </button>
          <button
            type="button"
            aria-label="ซ่อนจนกว่าจะเปิดแอปใหม่"
            onClick={() => {
              setDismissed(true);
              try {
                sessionStorage.setItem(DISMISS_KEY, '1');
              } catch {
                // ignore
              }
            }}
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      {open && <ShopAccountDialog user={user || null} onClose={() => setOpen(false)} />}
    </>
  );
};

/** Small status button for menus: shows the connected shop account and opens the dialog. */
export const ShopAccountStatusButton: React.FC<{ className?: string }> = ({ className }) => {
  const [user, setUser] = useState<FirebaseUserInfo | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  useEffect(() => onFirebaseUserChange(setUser), []);
  const signedIn = !!user && !user.isAnonymous;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {signedIn ? <Cloud className="w-4 h-4 text-emerald-400" /> : <CloudOff className="w-4 h-4 text-[#ff8a3d]" />}
        <span className="truncate">{signedIn ? `บัญชีร้าน: ${user?.email}` : 'เชื่อมบัญชีร้าน (Cloud)'}</span>
      </button>
      {open && <ShopAccountDialog user={user || null} onClose={() => setOpen(false)} />}
    </>
  );
};
