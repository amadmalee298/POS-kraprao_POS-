import React, { useState, useEffect } from 'react';
import { Search, X, Plus, Flame, Sparkles } from 'lucide-react';
import { usePOS } from '../../context/POSContext';
import { MenuItem } from '../../types';

interface QuickAddModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectItem: (item: MenuItem) => void;
}

export const QuickAddModal: React.FC<QuickAddModalProps> = ({ isOpen, onClose, onSelectItem }) => {
  const { menuItems, addToCart } = usePOS();
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        // Toggle quick search
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!isOpen) return null;

  const filteredItems = menuItems.filter(
    item =>
      item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.nameEn.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[80vh]">
        {/* Search Input Bar */}
        <div className="p-4 bg-slate-800/80 border-b border-slate-700/60 flex items-center space-x-3">
          <Search className="w-5 h-5 text-amber-400 shrink-0" />
          <input
            type="text"
            placeholder="ค้นหาเมนูด่วน (พิมพ์ชื่อเมนู, กะเพรา, ชาไทย, หรือรหัส)..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            autoFocus
            className="w-full bg-transparent border-none focus:outline-none text-slate-100 placeholder-slate-400 text-base font-medium"
          />
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Results List */}
        <div className="p-4 overflow-y-auto space-y-2 flex-1">
          {filteredItems.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <p className="text-sm">ไม่พบเมนูที่ตรงกับ "{searchTerm}"</p>
            </div>
          ) : (
            filteredItems.map(item => (
              <div
                key={item.id}
                onClick={() => {
                  onSelectItem(item);
                  onClose();
                }}
                className="flex items-center justify-between p-3 bg-slate-800/40 hover:bg-slate-800 border border-slate-700/40 rounded-xl cursor-pointer transition group"
              >
                <div className="flex items-center space-x-3">
                  <img
                    src={item.image}
                    alt={item.name}
                    className="w-12 h-12 object-cover rounded-lg border border-slate-700 shrink-0"
                  />
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold text-slate-100 text-sm group-hover:text-amber-300 transition">
                        {item.name}
                      </span>
                      {item.isPopular && (
                        <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 text-[10px] font-bold rounded-md flex items-center space-x-0.5 border border-amber-500/30">
                          <Flame className="w-3 h-3" />
                          <span>ยอดฮิต</span>
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 line-clamp-1">{item.description}</p>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <span className="font-bold text-emerald-400 text-base">{item.price} ฿</span>
                  <button
                    onClick={e => {
                      e.stopPropagation();
                      if (item.availableSpiceLevels || item.availableProteins) {
                        onSelectItem(item);
                      } else {
                        addToCart(item);
                      }
                      onClose();
                    }}
                    className="p-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg shadow transition active:scale-95"
                    title="เพิ่มลงตะกร้า"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer Hint */}
        <div className="px-4 py-2.5 bg-slate-950/80 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-between">
          <span className="flex items-center space-x-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>กดปุ่มสั่งด่วนเพื่อเลือกระดับความเผ็ดและเครื่องท็อปปิ้ง</span>
          </span>
          <span className="font-mono text-[10px] bg-slate-800 px-1.5 py-0.5 rounded text-slate-300">
            Esc ปิด
          </span>
        </div>
      </div>
    </div>
  );
};
