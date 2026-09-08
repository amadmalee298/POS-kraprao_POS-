import React, { useState, useEffect, useMemo } from 'react';
import { X, Plus, Minus, ShoppingBag, Check, Egg, Calculator, Flame, Ban } from 'lucide-react';
import { MenuItem, AddOnOption, SpiceLevel, ProteinChoice } from '../../types';
import { usePOS } from '../../context/POSContext';
import { TouchNumpadModal } from './TouchNumpad';

interface CustomizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  menuItem: MenuItem | null;
}

export const CustomizationModal: React.FC<CustomizationModalProps> = ({
  isOpen,
  onClose,
  menuItem
}) => {
  const { addToCart, addOns } = usePOS();

  const [quantity, setQuantity] = useState(1);
  const [selectedAddOns, setSelectedAddOns] = useState<AddOnOption[]>([]);
  const [selectedSpiceLevel, setSelectedSpiceLevel] = useState<SpiceLevel | undefined>(undefined);
  const [selectedProtein, setSelectedProtein] = useState<{ name: ProteinChoice; extraPrice: number } | undefined>(undefined);
  const [specialNotes, setSpecialNotes] = useState('');
  const [isNumpadOpen, setIsNumpadOpen] = useState(false);

  // Check whether toppings are enabled for this menu item (default true)
  const isAddOnsAllowed = menuItem?.allowAddOns !== false;

  // Filter allowed add-ons if menuItem.allowedAddOnIds is defined and non-empty
  const availableAddOns = useMemo(() => {
    if (!isAddOnsAllowed) return [];
    if (menuItem?.allowedAddOnIds && menuItem.allowedAddOnIds.length > 0) {
      return (addOns || []).filter(a => menuItem.allowedAddOnIds?.includes(a.id));
    }
    return addOns || [];
  }, [isAddOnsAllowed, menuItem, addOns]);

  // Find featured topping (e.g. 'add-egg-fried' or 'เพิ่มไข่ดาว') or default to first topping
  const featuredAddon: AddOnOption | undefined = availableAddOns.find(a => 
    a.id === 'add-egg-fried' || a.name === 'เพิ่มไข่ดาว'
  );

  const primaryAddon: AddOnOption | null = featuredAddon || (availableAddOns.length > 0 ? availableAddOns[0] : null);

  // Other add-ons excluding the primary featured addon
  const otherAddOns = availableAddOns.filter(
    a => !primaryAddon || a.id !== primaryAddon.id
  );

  useEffect(() => {
    if (menuItem) {
      setQuantity(1);
      setSpecialNotes('');
      setSelectedAddOns([]);
      setSelectedSpiceLevel(menuItem.availableSpiceLevels?.[0]);
      setSelectedProtein(menuItem.availableProteins?.[0]);
    }
  }, [menuItem]);

  if (!isOpen || !menuItem) return null;

  const handleToggleAddOn = (addon: AddOnOption) => {
    setSelectedAddOns(prev => {
      const exists = prev.some(a => a.id === addon.id);
      if (exists) {
        return prev.filter(a => a.id !== addon.id);
      }
      return [...prev, addon];
    });
  };

  const isPrimarySelected = primaryAddon ? selectedAddOns.some(
    a => a.id === primaryAddon.id
  ) : false;

  // Calculate Unit Price
  const basePrice = menuItem.price;
  const addOnsTotal = isAddOnsAllowed ? selectedAddOns.reduce((sum, a) => sum + a.price, 0) : 0;
  const proteinExtra = selectedProtein?.extraPrice || 0;
  const unitPrice = basePrice + addOnsTotal + proteinExtra;
  const totalPrice = unitPrice * quantity;

  const handleAddToCart = () => {
    addToCart(
      menuItem,
      quantity,
      selectedSpiceLevel,
      selectedProtein,
      isAddOnsAllowed ? selectedAddOns : [],
      specialNotes.trim()
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-3 sm:p-4 animate-in fade-in duration-200 font-sans">
      <div className="bg-[#130c08] border border-[#26160e] rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[92vh]">
        {/* Modal Header with Food Image */}
        <div className="relative h-36 sm:h-44 overflow-hidden shrink-0 bg-[#180f0a]">
          <img
            src={menuItem.image}
            alt={menuItem.name}
            className="w-full h-full object-cover filter brightness-90"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#130c08] via-[#130c08]/60 to-transparent" />
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-2 bg-[#0d0704]/80 hover:bg-[#0d0704] text-amber-100 rounded-full transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="absolute bottom-3 left-4 right-4 flex items-end justify-between gap-2">
            <div>
              <div className="flex items-center space-x-2 mb-0.5">
                <span className="text-[10px] uppercase px-2 py-0.5 rounded-full bg-[#ff6600]/20 text-orange-400 font-bold border border-[#ff6600]/30">
                  {isAddOnsAllowed ? 'เลือกท็อปปิ้งได้' : 'ไม่มีท็อปปิ้ง'}
                </span>
                <span className="text-[10px] text-stone-400 font-mono">฿{menuItem.price}</span>
              </div>
              <h3 className="text-lg sm:text-xl font-black text-amber-50 leading-tight">{menuItem.name}</h3>
              {menuItem.description && (
                <p className="text-xs text-stone-400 mt-0.5 line-clamp-1">{menuItem.description}</p>
              )}
            </div>
          </div>
        </div>

        {/* Scrollable Body Options */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1 text-amber-50 no-scrollbar">

          {/* Protein Selection (if applicable) */}
          {menuItem.availableProteins && menuItem.availableProteins.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-orange-400 uppercase tracking-wider block">
                เลือกเนื้อสัตว์ / โปรตีน
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {menuItem.availableProteins.map(p => {
                  const isSelected = selectedProtein?.name === p.name;
                  return (
                    <button
                      key={p.name}
                      type="button"
                      onClick={() => setSelectedProtein(p)}
                      className={`py-2 px-2.5 rounded-xl border text-xs font-bold transition flex items-center justify-center cursor-pointer ${
                        isSelected
                          ? 'bg-[#ff6600] text-black border-orange-400 shadow-sm'
                          : 'bg-[#180f0a] border-[#26160e] text-stone-300 hover:text-white hover:bg-[#20120a]'
                      }`}
                    >
                      <span>{p.name}</span>
                      {p.extraPrice > 0 && (
                        <span className={`text-[10px] font-mono ml-1 ${isSelected ? 'text-black/80 font-black' : 'text-orange-400'}`}>
                          (+฿{p.extraPrice})
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* TOPPINGS SECTION */}
          {isAddOnsAllowed ? (
            <div className="space-y-3 pt-1">
              {/* Prominent Featured Toggle: Primary/Featured Topping */}
              {primaryAddon && (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-orange-400 uppercase tracking-wider flex items-center justify-between">
                    <span>ท็อปปิ้งยอดนิยม (Featured Extra)</span>
                  </label>
                  <div
                    onClick={() => handleToggleAddOn(primaryAddon)}
                    className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition shadow-md select-none ${
                      isPrimarySelected
                        ? 'bg-[#26150b] border-[#ff6600] text-orange-200 ring-1 ring-[#ff6600]/40'
                        : 'bg-[#180f0a] border-[#26160e] text-stone-300 hover:border-[#382013]'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className={`p-2.5 rounded-xl flex items-center justify-center transition ${
                        isPrimarySelected ? 'bg-[#ff6600] text-black shadow-md shadow-orange-950/50' : 'bg-[#22130b] text-orange-400'
                      }`}>
                        <Egg className="w-5 h-5 stroke-[2.5]" />
                      </div>
                      <div>
                        <div className="text-sm font-black text-amber-50 flex items-center space-x-2">
                          <span>{primaryAddon.name}</span>
                          <span className="text-[10px] bg-[#ff6600]/20 text-orange-300 px-2 py-0.5 rounded-full border border-[#ff6600]/40 font-mono font-bold">
                            +{primaryAddon.price} ฿
                          </span>
                        </div>
                        <p className="text-xs text-stone-400 mt-0.5">ท็อปปิ้งยอดนิยม เพิ่มความอร่อยให้มื้ออาหาร</p>
                      </div>
                    </div>

                    {/* Toggle Switch Checkbox */}
                    <div className="flex items-center space-x-2 shrink-0 ml-2">
                      <div
                        className={`w-6 h-6 rounded-lg border flex items-center justify-center transition-all ${
                          isPrimarySelected
                            ? 'bg-[#ff6600] border-orange-400 text-black scale-105 shadow-sm'
                            : 'bg-[#180f0a] border-[#331d12] hover:border-stone-500'
                        }`}
                      >
                        {isPrimarySelected && <Check className="w-4 h-4 stroke-[3]" />}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Other Add-on Toppings Section */}
              {otherAddOns.length > 0 && (
                <div>
                  <span className="text-xs font-bold text-stone-300 uppercase tracking-wider block mb-2">
                    {primaryAddon ? 'ตัวเลือกท็อปปิ้งอื่นๆ' : 'รายการ Toppings / ท็อปปิ้งเสริม'} ({otherAddOns.length} รายการ)
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {otherAddOns.map(addon => {
                      const isSelected = selectedAddOns.some(a => a.id === addon.id);
                      return (
                        <button
                          key={addon.id}
                          type="button"
                          onClick={() => handleToggleAddOn(addon)}
                          className={`p-2.5 rounded-xl border flex items-center justify-between transition cursor-pointer ${
                            isSelected
                              ? 'bg-[#26150b] border-[#ff6600] text-orange-200 ring-1 ring-[#ff6600]/40'
                              : 'bg-[#180f0a] border-[#26160e] text-stone-300 hover:bg-[#20120a]'
                          }`}
                        >
                          <div className="flex items-center space-x-2 truncate mr-2">
                            <div
                              className={`w-4 h-4 rounded border flex items-center justify-center transition shrink-0 ${
                                isSelected
                                  ? 'bg-[#ff6600] border-orange-400 text-black'
                                  : 'border-[#331d12] bg-[#120a06]'
                              }`}
                            >
                              {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                            </div>
                            <span className="text-xs font-medium text-amber-50 truncate">{addon.name}</span>
                          </div>
                          <span className="text-xs font-black text-orange-400 font-mono shrink-0">+{addon.price} ฿</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Toppings Disabled Notice */
            <div className="p-3.5 rounded-2xl bg-[#180f0a] border border-[#2e1a10] flex items-center space-x-3 text-stone-400 my-1">
              <div className="p-2 rounded-xl bg-[#24140b] text-orange-400/80 shrink-0">
                <Ban className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs font-bold text-amber-200">เมนูนี้ปิดการเลือกท็อปปิ้ง (Topping Disabled)</p>
                <p className="text-[11px] text-stone-400 mt-0.5">
                  เมนูนี้ถูกตั้งค่าปิดการเลือกท็อปปิ้งไว้ในระบบจัดการเมนู สามารถปรับเปิดได้ที่เมนูตั้งค่า
                </p>
              </div>
            </div>
          )}

          {/* Special Notes */}
          <div>
            <label className="block text-xs font-bold text-stone-300 uppercase tracking-wider mb-1">
              หมายเหตุพิเศษ (Special Request)
            </label>
            <input
              type="text"
              placeholder="เช่น ขอผัดแห้งๆ, ไม่ใส่ชูรส, ขอใบกะเพราเยอะๆ..."
              value={specialNotes}
              onChange={e => setSpecialNotes(e.target.value)}
              className="w-full bg-[#180f0a] border border-[#26160e] rounded-xl px-3 py-2 text-xs text-amber-50 placeholder-stone-500 focus:outline-none focus:border-[#ff6600] transition"
            />
          </div>
        </div>

        {/* Modal Footer: Quantity & Add to Cart */}
        <div className="p-3.5 sm:p-4 bg-[#100804] border-t border-[#26160e] flex items-center justify-between space-x-3">
          {/* Quantity Controls */}
          <div className="flex items-center space-x-1.5 bg-[#180f0a] border border-[#26160e] rounded-xl p-1 shrink-0">
            <button
              onClick={() => setQuantity(prev => Math.max(1, prev - 1))}
              className="p-2 bg-[#22150e] hover:bg-[#2c1a11] text-amber-50 rounded-lg transition active:scale-95 cursor-pointer"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setIsNumpadOpen(true)}
              className="px-3 py-1 bg-[#2a170d] hover:bg-[#341d11] text-orange-300 font-mono font-black text-sm rounded-lg border border-[#ff6600]/30 flex items-center space-x-1 transition active:scale-95 cursor-pointer"
              title="แตะเพื่อคีย์ระบุจำนวนด้วย Touch Numpad"
            >
              <span>{quantity}</span>
              <Calculator className="w-3 h-3 text-orange-400" />
            </button>
            <button
              onClick={() => setQuantity(prev => prev + 1)}
              className="p-2 bg-[#22150e] hover:bg-[#2c1a11] text-amber-50 rounded-lg transition active:scale-95 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Add to cart CTA */}
          <button
            onClick={handleAddToCart}
            className="flex-1 py-3 bg-[#ff6600] hover:bg-[#ff7711] active:bg-[#e05a00] text-black font-black text-xs sm:text-sm rounded-xl shadow-lg shadow-orange-950/60 flex items-center justify-between px-4 transition active:scale-[0.98] cursor-pointer"
          >
            <div className="flex items-center space-x-1.5">
              <ShoppingBag className="w-4 h-4 stroke-[2.5]" />
              <span>เพิ่มลงออเดอร์</span>
            </div>
            <span className="font-mono text-sm sm:text-base font-black">฿{totalPrice}</span>
          </button>
        </div>
      </div>

      {/* Touch Numpad Modal for Customization Quantity */}
      <TouchNumpadModal
        isOpen={isNumpadOpen}
        onClose={() => setIsNumpadOpen(false)}
        title={`ระบุจำนวน: ${menuItem.name}`}
        subtitle={`ราคาต่อหน่วย: ฿${unitPrice.toLocaleString('th-TH')}`}
        initialValue={quantity}
        mode="quantity"
        unitLabel="ชิ้น"
        unitPrice={unitPrice}
        onConfirm={(val) => setQuantity(Math.max(1, val))}
      />
    </div>
  );
};
