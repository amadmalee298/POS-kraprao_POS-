import React, { useEffect, useMemo, useState } from 'react';
import { Search, X, Plus, Minus, ShoppingBag, Check, Clock, ChefHat, BellRing, AlertCircle, Loader2 } from 'lucide-react';
import {
  AddOnOption,
  CartItem,
  MenuItem,
  Order,
  OrderStatus,
  PaymentMethod,
  ProteinChoice,
  SpiceLevel
} from '../../types';
import {
  fetchCustomerCatalog,
  subscribeToOrderStatus,
  submitCustomerQrOrder,
  CustomerCatalog
} from '../../services/firebaseService';
import { calculateOrderTotals } from '../../utils/tax';
import { defaultSpiceLevel, generateOrderId, generateQrOrderNumber } from '../../utils/orderUtils';
import { isValidPromptPayId } from '../../utils/promptpay';
import { SHOP_LOGO_URL, FALLBACK_SVG_LOGO, normalizeShopLogoUrl } from '../../assets/logo';
import { PromptPayQR } from '../common/PromptPayQR';

const ORDER_COOLDOWN_MS = 30_000;
const MAX_ITEMS_PER_ORDER = 40;
const LAST_ORDER_KEY = 'qr_last_order_at';

const baht = (n: number) =>
  n.toLocaleString('th-TH', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });

const STATUS_STEPS: { status: OrderStatus; label: string; icon: React.ElementType }[] = [
  { status: 'pending-qr', label: 'รอร้านยืนยัน', icon: Clock },
  { status: 'pending', label: 'ร้านรับออเดอร์แล้ว', icon: Check },
  { status: 'cooking', label: 'กำลังทำอาหาร', icon: ChefHat },
  { status: 'ready', label: 'พร้อมเสิร์ฟ', icon: BellRing }
];

interface PlacedOrder {
  id: string;
  orderNumber: string;
  total: number;
  payment: PaymentMethod;
  status: OrderStatus | null;
}

interface Draft {
  item: MenuItem;
  qty: number;
  spice?: SpiceLevel;
  protein?: { name: ProteinChoice; extraPrice: number };
  addOns: AddOnOption[];
  note: string;
}

/**
 * The page a customer sees after scanning a table QR code: the menu, a cart, and the status of
 * their order. No login, no staff screens, and it only reads the menu from the cloud.
 * Orders arrive at the shop as "waiting for approval"; staff (or the auto-approve device)
 * send them to the kitchen.
 */
export const CustomerOrderPage: React.FC<{ table: string; branchId: string }> = ({ table, branchId }) => {
  const [catalog, setCatalog] = useState<CustomerCatalog | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [nickname, setNickname] = useState('');
  const [payment, setPayment] = useState<PaymentMethod>('cash');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);

  const load = () => {
    setLoadState('loading');
    fetchCustomerCatalog(branchId).then(c => {
      if (c && c.menuItems.length > 0) {
        setCatalog(c);
        setLoadState('ready');
      } else {
        setLoadState('error');
      }
    });
  };

  useEffect(load, [branchId]);

  useEffect(() => {
    document.title = catalog?.branch.name ? `สั่งอาหาร · ${catalog.branch.name}` : 'สั่งอาหาร';
  }, [catalog]);

  // Live status of the last order
  useEffect(() => {
    if (!placed) return;
    return subscribeToOrderStatus(placed.id, status =>
      setPlaced(p => (p && status ? { ...p, status } : p))
    );
  }, [placed?.id]);

  const menuItems = catalog?.menuItems || [];
  const addOns = catalog?.addOns || [];
  const settings = catalog?.settings || {};
  const shopName = catalog?.branch.name || settings.shopName || 'ครัวกะเพรา';
  const promptPayId = catalog?.branch.promptpayMobileOrTaxId || settings.promptpayMobileOrTaxId || '';
  const canPayPromptPay = isValidPromptPayId(promptPayId);

  const categoryTabs = useMemo(() => {
    const used = new Set(menuItems.map(m => m.category));
    return [
      { id: 'all', name: 'ทั้งหมด' },
      ...(catalog?.categories || []).filter(c => used.has(c.id)).map(c => ({ id: c.id, name: c.name }))
    ];
  }, [menuItems, catalog?.categories]);

  const q = search.trim().toLowerCase();
  const visible = menuItems
    .filter(m => (q ? m.name.toLowerCase().includes(q) : category === 'all' || m.category === category))
    .sort((a, b) => Number(!!b.isPopular) - Number(!!a.isPopular));

  const subtotal = cart.reduce((s, c) => s + c.totalPrice, 0);
  const itemCount = cart.reduce((s, c) => s + c.quantity, 0);
  const totals = calculateOrderTotals(subtotal, 0, settings);

  const allowedAddOns = (item: MenuItem) =>
    item.allowAddOns === false
      ? []
      : item.allowedAddOnIds?.length
        ? addOns.filter(a => item.allowedAddOnIds!.includes(a.id))
        : addOns;

  const openDraft = (item: MenuItem) =>
    setDraft({ item, qty: 1, spice: defaultSpiceLevel(item), protein: item.availableProteins?.[0], addOns: [], note: '' });

  const draftUnit = draft
    ? draft.item.price + (draft.protein?.extraPrice || 0) + draft.addOns.reduce((s, a) => s + a.price, 0)
    : 0;

  const addDraftToCart = () => {
    if (!draft) return;
    const key = [
      draft.item.id,
      draft.spice || '',
      draft.protein?.name || '',
      draft.addOns.map(a => a.id).sort().join('+'),
      draft.note.trim()
    ].join('|');
    setCart(prev => {
      const i = prev.findIndex(c => c.cartItemId === key);
      if (i >= 0) {
        const next = [...prev];
        const qty = next[i].quantity + draft.qty;
        next[i] = { ...next[i], quantity: qty, totalPrice: qty * next[i].unitPrice };
        return next;
      }
      return [
        ...prev,
        {
          cartItemId: key,
          menuItem: draft.item,
          quantity: draft.qty,
          spiceLevel: draft.spice,
          proteinChoice: draft.protein,
          selectedAddOns: draft.addOns,
          specialNotes: draft.note.trim() || undefined,
          unitPrice: draftUnit,
          totalPrice: draftUnit * draft.qty
        }
      ];
    });
    setDraft(null);
  };

  const changeQty = (id: string, delta: number) =>
    setCart(prev =>
      prev
        .map(c => (c.cartItemId === id ? { ...c, quantity: c.quantity + delta, totalPrice: (c.quantity + delta) * c.unitPrice } : c))
        .filter(c => c.quantity > 0)
    );

  const submit = async () => {
    if (!catalog || cart.length === 0 || submitting) return;
    setSubmitError('');
    if (itemCount > MAX_ITEMS_PER_ORDER) {
      setSubmitError(`สั่งได้ไม่เกิน ${MAX_ITEMS_PER_ORDER} รายการต่อครั้ง`);
      return;
    }
    let last = 0;
    try {
      last = Number(localStorage.getItem(LAST_ORDER_KEY) || 0);
    } catch {
      last = 0;
    }
    const waitMs = ORDER_COOLDOWN_MS - (Date.now() - last);
    if (waitMs > 0) {
      setSubmitError(`เพิ่งส่งออเดอร์ไป กรุณารอ ${Math.ceil(waitMs / 1000)} วินาที`);
      return;
    }

    setSubmitting(true);
    const now = new Date().toISOString();
    const name = nickname.trim().slice(0, 40);
    const order: Order = {
      id: generateOrderId(),
      orderNumber: generateQrOrderNumber(table),
      branchId: catalog.branch.id,
      orderType: 'dine-in',
      tableNumber: table,
      items: cart,
      subtotal,
      discountAmount: 0,
      discountType: 'fixed',
      discountNote: name ? `ชื่อลูกค้า: ${name}` : 'สั่งผ่าน QR โต๊ะ',
      vatAmount: totals.vatAmount,
      grandTotal: totals.grandTotal,
      paymentMethod: payment,
      paymentStatus: 'unpaid',
      tenderedAmount: 0,
      changeAmount: 0,
      status: 'pending-qr',
      createdAt: now,
      updatedAt: now,
      isQrOrder: true,
      orderSource: 'qr'
    };
    const ok = await submitCustomerQrOrder(order, { id: catalog.branch.id, name: shopName });
    setSubmitting(false);
    if (!ok) {
      setSubmitError('ส่งออเดอร์ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่ หรือแจ้งพนักงาน');
      return;
    }
    try {
      localStorage.setItem(LAST_ORDER_KEY, String(Date.now()));
    } catch {
      // private mode: cooldown only for this page view
    }
    setPlaced({ id: order.id, orderNumber: order.orderNumber, total: order.grandTotal, payment, status: 'pending-qr' });
    setCart([]);
    setIsCartOpen(false);
  };

  const logo = normalizeShopLogoUrl(settings.shopLogoUrl) || SHOP_LOGO_URL;

  if (loadState !== 'ready') {
    return (
      <div className="min-h-[100dvh] bg-[#0d0704] text-[#f6efe7] flex flex-col items-center justify-center gap-4 p-8 text-center">
        {loadState === 'loading' ? (
          <>
            <Loader2 className="w-10 h-10 animate-spin text-[#ff8a3d]" />
            <div className="text-lg">กำลังโหลดเมนู…</div>
          </>
        ) : (
          <>
            <AlertCircle className="w-10 h-10 text-[#ff8a3d]" />
            <div className="text-lg font-semibold">ยังสั่งผ่าน QR ไม่ได้ในขณะนี้</div>
            <p className="text-[#b3a393]">กรุณาสั่งกับพนักงาน หรือลองใหม่อีกครั้ง (โต๊ะ {table})</p>
            <button type="button" onClick={load} className="h-12 px-6 rounded-2xl bg-[#ff6a13] text-[#1a0d05] font-semibold">
              ลองใหม่
            </button>
          </>
        )}
      </div>
    );
  }

  const currentStep = placed?.status ? STATUS_STEPS.findIndex(s => s.status === placed.status) : -1;

  return (
    <div className="min-h-[100dvh] bg-[#0d0704] text-[#f6efe7] pb-28">
      <header className="sticky top-0 z-20 bg-[#120a06]/95 backdrop-blur border-b border-[#2d1c12] px-4 pt-3 pb-2.5 flex flex-col gap-2.5">
        <div className="flex items-center gap-3">
          <img
            src={logo}
            alt=""
            className="w-10 h-10 rounded-xl object-cover bg-white"
            onError={e => {
              if (e.currentTarget.src !== FALLBACK_SVG_LOGO) e.currentTarget.src = FALLBACK_SVG_LOGO;
            }}
          />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-lg truncate">{shopName}</div>
            <div className="text-sm text-[#b3a393]">สั่งอาหารจากโต๊ะ</div>
          </div>
          <div className="px-3 h-10 rounded-xl bg-[#ff6a13] text-[#1a0d05] font-num text-lg font-bold flex items-center">
            โต๊ะ {table}
          </div>
        </div>
        <label className="h-11 px-3 rounded-xl bg-[#1d130c] border border-[#2d1c12] flex items-center gap-2">
          <Search className="w-[18px] h-[18px] text-[#b3a393]" />
          <span className="sr-only">ค้นหาเมนู</span>
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="ค้นหาเมนู"
            className="flex-1 min-w-0 bg-transparent outline-none text-base placeholder:text-[#8c7968]"
          />
        </label>
        <nav aria-label="หมวดหมู่" className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
          {categoryTabs.map(c => {
            const active = !q && category === c.id;
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setCategory(c.id);
                  setSearch('');
                }}
                className={`h-10 px-4 rounded-xl border text-[15px] font-semibold whitespace-nowrap shrink-0 ${
                  active ? 'bg-[#ff6a13] border-[#ff6a13] text-[#1a0d05]' : 'bg-[#1d130c] border-[#3a2517]'
                }`}
              >
                {c.name}
              </button>
            );
          })}
        </nav>
      </header>

      {placed && (
        <section aria-live="polite" className="mx-4 mt-4 p-4 rounded-2xl bg-[#160e09] border border-[#245c43] flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-semibold">ส่งออเดอร์แล้ว {placed.orderNumber}</div>
              <div className="text-sm text-[#b3a393]">ยอด ฿{baht(placed.total)} · {placed.payment === 'promptpay' ? 'โอนพร้อมเพย์' : 'ชำระกับพนักงาน'}</div>
            </div>
            <button type="button" onClick={() => setPlaced(null)} aria-label="ซ่อน" className="w-10 h-10 rounded-xl flex items-center justify-center text-[#b3a393]">
              <X className="w-5 h-5" />
            </button>
          </div>
          {placed.status === 'cancelled' ? (
            <div className="p-3 rounded-xl bg-[#2a150f] border border-[#4a2718] text-[#ffb4a0]">ร้านยกเลิกออเดอร์นี้ กรุณาติดต่อพนักงาน</div>
          ) : placed.status === 'served' ? (
            <div className="p-3 rounded-xl bg-[#133a29] text-[#7ff0b8]">เสิร์ฟแล้ว ขอให้อร่อยครับ</div>
          ) : (
            <ol className="grid grid-cols-4 gap-1.5">
              {STATUS_STEPS.map((s, i) => {
                const done = i <= currentStep;
                const Icon = s.icon;
                return (
                  <li key={s.status} className={`flex flex-col items-center gap-1 text-center text-[12px] ${done ? 'text-[#7ff0b8]' : 'text-[#8c7968]'}`}>
                    <span className={`w-9 h-9 rounded-full flex items-center justify-center ${done ? 'bg-[#133a29]' : 'bg-[#1d130c]'}`}>
                      <Icon className="w-5 h-5" />
                    </span>
                    {s.label}
                  </li>
                );
              })}
            </ol>
          )}
          {placed.payment === 'promptpay' && placed.status !== 'cancelled' && (
            <div className="flex flex-col items-center gap-2">
              <PromptPayQR promptPayId={promptPayId} amount={placed.total} branchName={shopName} size={200} />
              <p className="text-sm text-[#b3a393] text-center">สแกนจ่ายแล้วแสดงสลิปกับพนักงาน</p>
            </div>
          )}
        </section>
      )}

      <main className="px-4 pt-2">
        {visible.length === 0 && <p className="text-center text-[#b3a393] mt-10">ไม่พบเมนู</p>}
        {visible.map(item => {
          const inCart = cart.filter(c => c.menuItem.id === item.id).reduce((s, c) => s + c.quantity, 0);
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => openDraft(item)}
              className="w-full text-left flex items-center gap-3 py-3 border-b border-[#22150d]"
            >
              <span className="flex-1 min-w-0">
                <span className="block text-base font-semibold leading-snug">{item.name}</span>
                {item.description && <span className="block text-[13px] text-[#b3a393] line-clamp-2">{item.description}</span>}
                {item.isPopular && <span className="text-[12px] font-bold text-[#ffb07a]">ขายดี</span>}
              </span>
              <span className="font-num text-lg font-semibold text-[#ff8a3d]">฿{baht(item.price)}</span>
              <span
                aria-hidden="true"
                className={`w-11 h-11 shrink-0 rounded-xl flex items-center justify-center font-num text-lg font-bold ${
                  inCart ? 'bg-[#ff6a13] text-[#1a0d05]' : 'bg-[#24160d] border border-[#4a2c18] text-[#ff8a3d]'
                }`}
              >
                {inCart || <Plus className="w-5 h-5" />}
              </span>
            </button>
          );
        })}
      </main>

      {/* Cart bar */}
      {cart.length > 0 && !isCartOpen && !draft && (
        <div className="fixed left-3 right-3 bottom-4 z-30">
          <button
            type="button"
            onClick={() => setIsCartOpen(true)}
            className="w-full h-16 rounded-2xl px-4 flex items-center gap-3 bg-[#ff6a13] text-[#1a0d05] shadow-[0_8px_24px_rgba(0,0,0,0.5)]"
          >
            <span className="min-w-[32px] h-8 rounded-full bg-[#1a0d05] text-[#ff8a3d] font-bold flex items-center justify-center">{itemCount}</span>
            <span className="flex-1 text-left text-[17px] font-semibold">ดูตะกร้า · ส่งออเดอร์</span>
            <span className="font-num text-[22px] font-bold">฿{baht(totals.grandTotal)}</span>
          </button>
        </div>
      )}

      {/* Options sheet */}
      {draft && (
        <div className="fixed inset-0 z-40 bg-black/70 flex flex-col justify-end" onClick={() => setDraft(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={draft.item.name}
            onClick={e => e.stopPropagation()}
            className="max-h-[88dvh] overflow-y-auto bg-[#160e09] border-t border-[#3a2517] rounded-t-3xl p-4 flex flex-col gap-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-xl font-semibold">{draft.item.name}</div>
                <div className="text-sm text-[#b3a393]">฿{baht(draft.item.price)}</div>
              </div>
              <button type="button" onClick={() => setDraft(null)} aria-label="ปิด" className="w-11 h-11 rounded-xl border border-[#3a2517] bg-[#1d130c] flex items-center justify-center">
                <X className="w-5 h-5" />
              </button>
            </div>

            {!!draft.item.availableSpiceLevels?.length && (
              <fieldset>
                <legend className="text-sm text-[#b3a393] mb-2">ความเผ็ด</legend>
                <div className="flex flex-wrap gap-2">
                  {draft.item.availableSpiceLevels.map(s => (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={draft.spice === s}
                      onClick={() => setDraft({ ...draft, spice: s })}
                      className={`h-11 px-3 rounded-xl border font-semibold ${draft.spice === s ? 'bg-[#ff6a13] border-[#ff6a13] text-[#1a0d05]' : 'bg-[#1d130c] border-[#3a2517]'}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}

            {!!draft.item.availableProteins?.length && (
              <fieldset>
                <legend className="text-sm text-[#b3a393] mb-2">เนื้อสัตว์</legend>
                <div className="flex flex-wrap gap-2">
                  {draft.item.availableProteins.map(p => (
                    <button
                      key={p.name}
                      type="button"
                      aria-pressed={draft.protein?.name === p.name}
                      onClick={() => setDraft({ ...draft, protein: p })}
                      className={`h-11 px-3 rounded-xl border font-semibold ${draft.protein?.name === p.name ? 'bg-[#ff6a13] border-[#ff6a13] text-[#1a0d05]' : 'bg-[#1d130c] border-[#3a2517]'}`}
                    >
                      {p.name}
                      {p.extraPrice ? ` +${p.extraPrice}` : ''}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}

            {allowedAddOns(draft.item).length > 0 && (
              <fieldset>
                <legend className="text-sm text-[#b3a393] mb-2">ท็อปปิ้ง</legend>
                <div className="flex flex-wrap gap-2">
                  {allowedAddOns(draft.item).map(a => {
                    const on = draft.addOns.some(x => x.id === a.id);
                    return (
                      <button
                        key={a.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          setDraft({ ...draft, addOns: on ? draft.addOns.filter(x => x.id !== a.id) : [...draft.addOns, a] })
                        }
                        className={`h-11 px-3 rounded-xl border font-semibold ${on ? 'bg-[#ff6a13] border-[#ff6a13] text-[#1a0d05]' : 'bg-[#1d130c] border-[#3a2517]'}`}
                      >
                        {a.name.replace(/^เพิ่ม/, '')} +{a.price}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            )}

            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-[#b3a393]">หมายเหตุถึงครัว (ถ้ามี)</span>
              <input
                type="text"
                maxLength={80}
                value={draft.note}
                onChange={e => setDraft({ ...draft, note: e.target.value })}
                placeholder="เช่น ไม่ใส่ถั่วฝักยาว"
                className="h-11 px-3 rounded-xl bg-[#1d130c] border border-[#3a2517] outline-none"
              />
            </label>

            <div className="flex items-center gap-3">
              <button type="button" aria-label="ลดจำนวน" onClick={() => draft.qty > 1 && setDraft({ ...draft, qty: draft.qty - 1 })} className="w-12 h-14 rounded-xl border border-[#3a2517] bg-[#1d130c] flex items-center justify-center">
                <Minus className="w-5 h-5" />
              </button>
              <span className="min-w-[28px] text-center font-num text-2xl font-semibold">{draft.qty}</span>
              <button type="button" aria-label="เพิ่มจำนวน" onClick={() => draft.qty < 20 && setDraft({ ...draft, qty: draft.qty + 1 })} className="w-12 h-14 rounded-xl border border-[#3a2517] bg-[#1d130c] flex items-center justify-center">
                <Plus className="w-5 h-5" />
              </button>
              <button type="button" onClick={addDraftToCart} className="flex-1 h-14 rounded-2xl bg-[#ff6a13] text-[#1a0d05] font-semibold text-lg">
                ใส่ตะกร้า · ฿{baht(draftUnit * draft.qty)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cart sheet */}
      {isCartOpen && (
        <div className="fixed inset-0 z-40 bg-black/70 flex flex-col justify-end" onClick={() => setIsCartOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="ตะกร้า"
            onClick={e => e.stopPropagation()}
            className="max-h-[92dvh] overflow-y-auto bg-[#160e09] border-t border-[#3a2517] rounded-t-3xl p-4 flex flex-col gap-3"
          >
            <div className="flex items-center justify-between">
              <div className="text-xl font-semibold">ตะกร้า · โต๊ะ {table}</div>
              <button type="button" onClick={() => setIsCartOpen(false)} aria-label="ปิด" className="w-11 h-11 rounded-xl border border-[#3a2517] bg-[#1d130c] flex items-center justify-center">
                <X className="w-5 h-5" />
              </button>
            </div>

            {cart.length === 0 ? (
              <div className="py-8 flex flex-col items-center gap-2 text-[#b3a393]">
                <ShoppingBag className="w-10 h-10" />
                ยังไม่มีรายการ
              </div>
            ) : (
              cart.map(c => (
                <div key={c.cartItemId} className="flex items-center gap-2 py-2 border-b border-[#22150d]">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold">{c.menuItem.name}</div>
                    <div className="text-[13px] text-[#d9a77e]">
                      {[c.spiceLevel, c.proteinChoice?.name, ...c.selectedAddOns.map(a => `+${a.name.replace(/^เพิ่ม/, '')}`), c.specialNotes]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </div>
                  <button type="button" aria-label={`ลด ${c.menuItem.name}`} onClick={() => changeQty(c.cartItemId, -1)} className="w-10 h-10 rounded-xl border border-[#3a2517] bg-[#1d130c] flex items-center justify-center">
                    <Minus className="w-4 h-4" />
                  </button>
                  <span className="min-w-[22px] text-center font-semibold">{c.quantity}</span>
                  <button type="button" aria-label={`เพิ่ม ${c.menuItem.name}`} onClick={() => changeQty(c.cartItemId, 1)} className="w-10 h-10 rounded-xl border border-[#3a2517] bg-[#1d130c] flex items-center justify-center">
                    <Plus className="w-4 h-4" />
                  </button>
                  <span className="w-16 text-right font-num font-semibold">฿{baht(c.totalPrice)}</span>
                </div>
              ))
            )}

            <label className="flex flex-col gap-1.5">
              <span className="text-sm text-[#b3a393]">ชื่อเล่น (ให้พนักงานเรียกได้ ไม่บังคับ)</span>
              <input
                type="text"
                maxLength={40}
                value={nickname}
                onChange={e => setNickname(e.target.value)}
                className="h-11 px-3 rounded-xl bg-[#1d130c] border border-[#3a2517] outline-none"
              />
            </label>

            <fieldset>
              <legend className="text-sm text-[#b3a393] mb-2">ชำระเงิน</legend>
              <div className={`grid gap-2 ${canPayPromptPay ? 'grid-cols-2' : 'grid-cols-1'}`}>
                <button
                  type="button"
                  aria-pressed={payment === 'cash'}
                  onClick={() => setPayment('cash')}
                  className={`h-12 rounded-xl border font-semibold ${payment === 'cash' ? 'bg-[#ff6a13] border-[#ff6a13] text-[#1a0d05]' : 'bg-[#1d130c] border-[#3a2517]'}`}
                >
                  ชำระกับพนักงาน
                </button>
                {canPayPromptPay && (
                  <button
                    type="button"
                    aria-pressed={payment === 'promptpay'}
                    onClick={() => setPayment('promptpay')}
                    className={`h-12 rounded-xl border font-semibold ${payment === 'promptpay' ? 'bg-[#ff6a13] border-[#ff6a13] text-[#1a0d05]' : 'bg-[#1d130c] border-[#3a2517]'}`}
                  >
                    โอนพร้อมเพย์
                  </button>
                )}
              </div>
            </fieldset>

            <div className="flex items-baseline justify-between pt-1">
              <span className="text-[#b3a393]">{totals.enableVat && totals.vatAmount > 0 ? `รวม VAT ฿${baht(totals.vatAmount)}` : `${itemCount} รายการ`}</span>
              <span className="font-num text-3xl font-bold text-[#ff8a3d]">฿{baht(totals.grandTotal)}</span>
            </div>

            {submitError && (
              <div role="alert" className="p-3 rounded-xl bg-[#2a150f] border border-[#4a2718] text-[#ffb4a0] text-sm">
                {submitError}
              </div>
            )}

            <button
              type="button"
              onClick={submit}
              disabled={cart.length === 0 || submitting}
              className="h-16 rounded-2xl bg-[#3ecf8e] text-[#062a1a] text-xl font-semibold disabled:bg-[#2a1b12] disabled:text-[#7d6a5a] flex items-center justify-center gap-2"
            >
              {submitting && <Loader2 className="w-5 h-5 animate-spin" />}
              ส่งออเดอร์เข้าร้าน
            </button>
            <p className="text-center text-[13px] text-[#8c7968]">ร้านจะยืนยันออเดอร์ก่อนเริ่มทำ</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default CustomerOrderPage;
