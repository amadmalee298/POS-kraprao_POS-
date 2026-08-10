import React, { useState, useEffect } from 'react';
import { X, Plus, Minus, ShoppingBag, Check, Egg, Calculator } from 'lucide-react';
import { MenuItem, AddOnOption } from '../../types';
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
  const [specialNotes, setSpecialNotes] = useState('');
  const [isNumpadOpen, setIsNumpadOpen] = useState(false);

  // Find featured topping (e.g. 'add-egg-fried' or 'เพิ่มไข่ดาว') or default to first topping
  const featuredAddon: AddOnOption | undefined = addOns?.find(a => 
    a.id === 'add-egg-fried' || a.name === 'เพิ่มไข่ดาว'
  );

  const primaryAddon: AddOnOption | null = featuredAddon || (addOns && addOns.length > 0 ? addOns[0] : null);

  useEffect(() => {
    if (menuItem) {
      setQuantity(1);
      setSpecialNotes('');
      setSelectedAddOns([]);
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

  // Other add-ons excluding the primary featured addon
  const otherAddOns = (addOns || []).filter(
    a => !primaryAddon || a.id !== primaryAddon.id
  );

  // Calculate Unit Price
  const basePrice = menuItem.price;
  const addOnsTotal = selectedAddOns.reduce((sum, a) => sum + a.price, 0);
  const unitPrice = basePrice + addOnsTotal;
  const totalPrice = unitPrice * quantity;

  const handleAddToCart = () => {
    addToCart(
      menuItem,
      quantity,
      undefined,
      undefined,
      selectedAddOns,
      specialNotes.trim()
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="relative h-40 overflow-hidden shrink-0">
          <img
            src={menuItem.image}
            alt={menuItem.name}
            className="w-full h-full object-cover filter brightness-90"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/60 to-transparent" />
          <button
            onClick={onClose}
            className="absolute top-3 right-3 p-2 bg-slate-950/70 hover:bg-slate-950 text-slate-200 rounded-full transition"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="absolute bottom-3 left-4 right-4">
            <h3 className="text-xl font-bold text-white leading-tight">{menuItem.name}</h3>
            <p className="text-xs text-slate-300 mt-0.5 line-clamp-1">{menuItem.description}</p>
          </div>
        </div>

        {/* Scrollable Body Options */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1 text-slate-200">
          
          {/* Prominent Featured Toggle: Primary/Featured Topping */}
          {primaryAddon && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center justify-between">
                <span>ตัวเลือกยอดนิยม (Featured Extra)</span>
              </label>
              <div
                onClick={() => handleToggleAddOn(primaryAddon)}
                className={`p-3.5 rounded-2xl border flex items-center justify-between cursor-pointer transition shadow-md select-none ${
                  isPrimarySelected
                    ? 'bg-gradient-to-r from-amber-950/60 via-amber-900/40 to-slate-900 border-amber-500 text-amber-200 ring-2 ring-amber-500/30'
                    : 'bg-slate-950/80 border-slate-800 text-slate-300 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <div className={`p-2.5 rounded-xl flex items-center justify-center transition ${
                    isPrimarySelected ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/30' : 'bg-slate-800 text-amber-400'
                  }`}>
                    <Egg className="w-5 h-5 stroke-[2.5]" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-100 flex items-center space-x-2">
                      <span>{primaryAddon.name}</span>
                      <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full border border-amber-500/30 font-black">
                        +{primaryAddon.price} ฿
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">ท็อปปิ้งยอดนิยม เพิ่มความอร่อยให้มื้ออาหาร</p>
                  </div>
                </div>

                {/* Toggle Switch Checkbox */}
                <div className="flex items-center space-x-2 shrink-0 ml-2">
                  <div
                    className={`w-6 h-6 rounded-lg border flex items-center justify-center transition-all ${
                      isPrimarySelected
                        ? 'bg-amber-500 border-amber-400 text-slate-950 scale-110 shadow-sm'
                        : 'bg-slate-900 border-slate-700 hover:border-slate-500'
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
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block mb-2">
                {primaryAddon ? 'ตัวเลือกเพิ่มเติมอื่นๆ' : 'รายการ Toppings / ท็อปปิ้งเสริม'} ({otherAddOns.length} รายการ)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {otherAddOns.map(addon => {
                  const isSelected = selectedAddOns.some(a => a.id === addon.id);
                  return (
                    <button
                      key={addon.id}
                      type="button"
                      onClick={() => handleToggleAddOn(addon)}
                      className={`p-2.5 rounded-xl border flex items-center justify-between transition ${
                        isSelected
                          ? 'bg-amber-950/40 border-amber-500/60 text-amber-300 ring-1 ring-amber-500/40'
                          : 'bg-slate-800/40 border-slate-700/60 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <div className="flex items-center space-x-2 truncate mr-2">
                        <div
                          className={`w-4 h-4 rounded border flex items-center justify-center transition shrink-0 ${
                            isSelected
                              ? 'bg-amber-500 border-amber-400 text-slate-950'
                              : 'border-slate-600 bg-slate-900'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                        <span className="text-xs font-medium text-slate-200 truncate">{addon.name}</span>
                      </div>
                      <span className="text-xs font-bold text-amber-400 shrink-0">+{addon.price} ฿</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Special Notes */}
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
              หมายเหตุพิเศษ (Special Request)
            </label>
            <input
              type="text"
              placeholder="เช่น ขอผัดแห้งๆ, ไม่ใส่ชูรส..."
              value={specialNotes}
              onChange={e => setSpecialNotes(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500/80 transition"
            />
          </div>
        </div>

        {/* Modal Footer: Quantity & Add to Cart */}
        <div className="p-4 bg-slate-950 border-t border-slate-800 flex items-center justify-between space-x-4">
          {/* Quantity Controls */}
          <div className="flex items-center space-x-2 bg-slate-900 border border-slate-800 rounded-xl p-1">
            <button
              onClick={() => setQuantity(prev => Math.max(1, prev - 1))}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition active:scale-95"
            >
              <Minus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setIsNumpadOpen(true)}
              className="px-3 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 font-black text-base rounded-lg border border-amber-500/30 flex items-center space-x-1 transition active:scale-95"
              title="แตะเพื่อคีย์ระบุจำนวนด้วย Touch Numpad"
            >
              <span>{quantity}</span>
              <Calculator className="w-3.5 h-3.5 text-amber-400" />
            </button>
            <button
              onClick={() => setQuantity(prev => prev + 1)}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg transition active:scale-95"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Add to cart CTA */}
          <button
            onClick={handleAddToCart}
            className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white font-bold text-sm rounded-xl shadow-lg shadow-emerald-950/60 flex items-center justify-between px-5 transition"
          >
            <div className="flex items-center space-x-2">
              <ShoppingBag className="w-4 h-4" />
              <span>เพิ่มลงตะกร้า</span>
            </div>
            <span className="text-amber-300 font-extrabold text-base">{totalPrice} ฿</span>
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
