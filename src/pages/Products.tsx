import React, { useState, useMemo } from 'react';
import { Product, Brand, SerialItem, ViewMode, ProductCategory } from '../types';
import { formatCurrency, generateId, categoryLabel, getTodayStr } from '../utils/helpers';
import { Plus, Search, Edit, Trash2, Package, Grid, List, AlignJustify, ChevronDown, ChevronRight, QrCode } from 'lucide-react';
import ProductQRModal from '../components/ProductQRModal';

const CATEGORIES = ['phones', 'tablets', 'laptops', 'accessories', 'other'];
const CAT_SUB: Record<string, string[]> = {
  tablets: ['iPad Pro', 'iPad Air', 'iPad Mini'],
  laptops: ['MacBook Pro', 'MacBook Air', 'MacBook NEO'],
  accessories: ['DJI', 'RAY-BAN', 'Pencil', 'Watch', 'AirPods', 'Insta360', 'Magic Keyboard', 'Samsung', 'Others'],
};

interface Props {
  products: Product[];
  serials: SerialItem[];
  brands: Brand[];
  onAddProduct: (p: Product) => void;
  onUpdateProduct: (p: Product) => void;
  onDeleteProduct: (id: string) => void;
  onAddBrand: (b: Brand) => void;
}

const BLANK_PRODUCT: Omit<Product, 'id' | 'createdAt' | 'updatedAt'> = {
  name: '', description: '', sku: '', upc: '', barcode: '',
  category: 'phones', brand: 'Apple', productType: 'serial',
  costPrice: 0, salePrice: 0, stock: 0, minStock: 2,
};

export default function Products({ products, serials, brands, onAddProduct, onUpdateProduct, onDeleteProduct, onAddBrand }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>(() => (localStorage.getItem('products_view') as ViewMode) || 'grid');
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [filterSub, setFilterSub] = useState('');
  const [openCat, setOpenCat] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editProduct, setEditProduct] = useState<Product | null>(null);
  const [form, setForm] = useState({ ...BLANK_PRODUCT });
  const [newBrand, setNewBrand] = useState('');
  const [showJrard, setShowJrard] = useState(false);
  const [jrardData, setJrardData] = useState<Record<string, string>>({});
  const [qrProduct, setQrProduct] = useState<Product | null>(null);

  const setView = (v: ViewMode) => { setViewMode(v); localStorage.setItem('products_view', v); };

  const filtered = useMemo(() => {
    let list = products;
    if (filterCat !== 'all') list = list.filter(p => p.category === filterCat);
    if (filterSub) list = list.filter(p => p.name.toLowerCase().includes(filterSub.toLowerCase()));
    if (search) list = list.filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.sku.toLowerCase().includes(search.toLowerCase()) ||
      (p.upc || '').includes(search) ||
      p.brand.toLowerCase().includes(search.toLowerCase())
    );
    return list;
  }, [products, filterCat, filterSub, search]);

  const openAdd = () => { setEditProduct(null); setForm({ ...BLANK_PRODUCT }); setShowForm(true); };
  const openEdit = (p: Product) => { setEditProduct(p); setForm({ name: p.name, description: p.description || '', sku: p.sku, upc: p.upc || '', barcode: p.barcode || '', category: p.category, brand: p.brand, productType: p.productType, costPrice: p.costPrice, salePrice: p.salePrice, stock: p.stock, minStock: p.minStock || 2 }); setShowForm(true); };

  const handleSave = () => {
    if (!form.name || !form.sku) return;
    const now = new Date().toISOString();
    if (editProduct) {
      onUpdateProduct({ ...editProduct, ...form, updatedAt: now });
    } else {
      onAddProduct({ id: generateId(), ...form, stock: Number(form.stock), costPrice: Number(form.costPrice), salePrice: Number(form.salePrice), minStock: Number(form.minStock), createdAt: now, updatedAt: now });
    }
    setShowForm(false);
  };

  const handleAddBrand = () => {
    if (!newBrand.trim()) return;
    onAddBrand({ id: generateId(), name: newBrand.trim(), createdAt: new Date().toISOString() });
    setForm(p => ({ ...p, brand: newBrand.trim() }));
    setNewBrand('');
  };

  const availableSerials = (productId: string) => serials.filter(s => s.productId === productId && s.status === 'available').length;

  const catBtnClass = (id: string) =>
    `px-3 py-1.5 rounded-xl text-xs font-medium transition-colors border ${filterCat === id && !filterSub ? 'bg-violet-700/40 border-violet-500/50 text-violet-300' : 'border-white/10 text-gray-400 hover:text-gray-200 hover:border-white/20'}`;

  return (
    <div className="p-4 lg:p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">📦 المنتجات</h2>
          <p className="text-gray-500 text-sm">{products.length} منتج</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowJrard(!showJrard)} className="btn-secondary text-sm">📋 جرد المخزون</button>
          <button onClick={openAdd} className="btn-primary flex items-center gap-2"><Plus size={16} /> منتج جديد</button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-[#1a1a35] border border-violet-900/30 rounded-2xl p-4 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => { setFilterCat('all'); setFilterSub(''); setOpenCat(null); }} className={catBtnClass('all')}>🌐 الكل</button>
          <button onClick={() => { setFilterCat('phones'); setFilterSub(''); setOpenCat(null); }} className={catBtnClass('phones')}>📱 موبايلات</button>

          {/* Tablets with sub */}
          <div className="relative">
            <button
              onClick={() => setOpenCat(openCat === 'tablets' ? null : 'tablets')}
              className={catBtnClass('tablets') + ' flex items-center gap-1'}
            >
              📲 تابلت <ChevronDown size={12} />
            </button>
            {openCat === 'tablets' && (
              <div className="absolute top-full mt-1 right-0 bg-[#252545] border border-violet-900/40 rounded-xl p-2 z-20 min-w-[150px]">
                {CAT_SUB.tablets.map(sub => (
                  <button key={sub} onClick={() => { setFilterCat('tablets'); setFilterSub(sub); setOpenCat(null); }}
                    className="block w-full text-right px-3 py-1.5 text-xs text-gray-300 hover:bg-violet-700/20 rounded-lg">
                    {sub}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Laptops with sub */}
          <div className="relative">
            <button
              onClick={() => setOpenCat(openCat === 'laptops' ? null : 'laptops')}
              className={catBtnClass('laptops') + ' flex items-center gap-1'}
            >
              💻 لابتوب <ChevronDown size={12} />
            </button>
            {openCat === 'laptops' && (
              <div className="absolute top-full mt-1 right-0 bg-[#252545] border border-violet-900/40 rounded-xl p-2 z-20 min-w-[150px]">
                {CAT_SUB.laptops.map(sub => (
                  <button key={sub} onClick={() => { setFilterCat('laptops'); setFilterSub(sub); setOpenCat(null); }}
                    className="block w-full text-right px-3 py-1.5 text-xs text-gray-300 hover:bg-violet-700/20 rounded-lg">
                    {sub}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Accessories with sub */}
          <div className="relative">
            <button
              onClick={() => setOpenCat(openCat === 'accessories' ? null : 'accessories')}
              className={catBtnClass('accessories') + ' flex items-center gap-1'}
            >
              🎧 إكسسوارات <ChevronDown size={12} />
            </button>
            {openCat === 'accessories' && (
              <div className="absolute top-full mt-1 right-0 bg-[#252545] border border-violet-900/40 rounded-xl p-2 z-20 min-w-[170px]">
                {CAT_SUB.accessories.map(sub => (
                  <button key={sub} onClick={() => { setFilterCat('accessories'); setFilterSub(sub); setOpenCat(null); }}
                    className="block w-full text-right px-3 py-1.5 text-xs text-gray-300 hover:bg-violet-700/20 rounded-lg">
                    {sub}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button onClick={() => { setFilterCat('other'); setFilterSub(''); setOpenCat(null); }} className={catBtnClass('other')}>📦 أخرى</button>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="بحث بالاسم، SKU، UPC، أو البراند..."
              className="input-dark w-full pr-9"
            />
          </div>
          <div className="flex items-center gap-1 bg-[#252545] border border-violet-900/30 rounded-xl p-1">
            {(['grid', 'list', 'compact'] as ViewMode[]).map(v => (
              <button key={v} onClick={() => setView(v)} className={`p-2 rounded-lg transition-colors ${viewMode === v ? 'bg-violet-700/40 text-violet-300' : 'text-gray-500 hover:text-gray-300'}`}>
                {v === 'grid' ? <Grid size={15} /> : v === 'list' ? <List size={15} /> : <AlignJustify size={15} />}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Jrard Mode */}
      {showJrard && (
        <div className="bg-[#1a1a35] border border-yellow-700/30 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-yellow-300">📋 جرد المخزون</h3>
            <button onClick={() => window.print()} className="btn-secondary text-sm">🖨️ طباعة</button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 border-b border-white/10">
                  <th className="text-right py-2 px-3">المنتج</th>
                  <th className="text-center py-2 px-3">في النظام</th>
                  <th className="text-center py-2 px-3">المتبقي الحقيقي</th>
                  <th className="text-center py-2 px-3">الفرق</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const actual = jrardData[p.id] !== undefined ? parseInt(jrardData[p.id]) : NaN;
                  const diff = !isNaN(actual) ? actual - p.stock : NaN;
                  return (
                    <tr key={p.id} className="border-b border-white/5 hover:bg-white/5">
                      <td className="py-2 px-3">
                        <div className="font-medium text-white">{p.name}</div>
                        <div className="text-xs text-gray-500">{p.sku} • {p.brand}</div>
                      </td>
                      <td className="py-2 px-3 text-center font-bold text-white">{p.stock}</td>
                      <td className="py-2 px-3 text-center">
                        <input
                          type="number"
                          value={jrardData[p.id] || ''}
                          onChange={e => setJrardData(prev => ({ ...prev, [p.id]: e.target.value }))}
                          className="w-20 bg-[#252545] border border-violet-900/30 rounded-lg px-2 py-1 text-center text-white text-sm"
                          placeholder="?"
                        />
                      </td>
                      <td className="py-2 px-3 text-center">
                        {!isNaN(diff) ? (
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${diff === 0 ? 'bg-green-900/40 text-green-400' : diff < 0 ? 'bg-red-900/40 text-red-400' : 'bg-yellow-900/40 text-yellow-400'}`}>
                            {diff === 0 ? '✓ تطابق' : diff < 0 ? `⚠️ عجز ${Math.abs(diff)}` : `📈 زيادة ${diff}`}
                          </span>
                        ) : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Products Grid/List/Compact */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(p => (
            <ProductCard key={p.id} product={p} availableSerials={availableSerials(p.id)} onEdit={() => openEdit(p)} onDelete={() => onDeleteProduct(p.id)} onShowQR={() => setQrProduct(p)} />
          ))}
        </div>
      )}

      {viewMode === 'list' && (
        <div className="space-y-2">
          {filtered.map(p => (
            <ProductListRow key={p.id} product={p} availableSerials={availableSerials(p.id)} onEdit={() => openEdit(p)} onDelete={() => onDeleteProduct(p.id)} onShowQR={() => setQrProduct(p)} />
          ))}
        </div>
      )}

      {viewMode === 'compact' && (
        <div className="bg-[#1a1a35] border border-violet-900/30 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-violet-900/20">
              <tr>
                <th className="text-right py-3 px-4 text-gray-400 font-medium">المنتج</th>
                <th className="text-center py-3 px-3 text-gray-400 font-medium">المخزون</th>
                <th className="text-center py-3 px-3 text-gray-400 font-medium">سعر الشراء</th>
                <th className="text-center py-3 px-3 text-gray-400 font-medium">سعر البيع</th>
                <th className="text-center py-3 px-3 text-gray-400 font-medium">النوع</th>
                <th className="py-3 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} className="border-t border-white/5 hover:bg-white/5">
                  <td className="py-2.5 px-4">
                    <div className="font-medium text-white text-sm">{p.name}</div>
                    <div className="text-xs text-gray-500">{p.sku} • {p.brand}</div>
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${p.stock === 0 ? 'bg-red-900/40 text-red-400' : p.stock <= 2 ? 'bg-yellow-900/40 text-yellow-400' : 'bg-green-900/40 text-green-400'}`}>
                      {p.stock}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-center text-gray-300 text-xs">{p.costPrice.toLocaleString('ar-EG')}</td>
                  <td className="py-2.5 px-3 text-center text-white text-xs font-medium">{p.salePrice.toLocaleString('ar-EG')}</td>
                  <td className="py-2.5 px-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${p.productType === 'serial' ? 'bg-blue-900/40 text-blue-400' : 'bg-gray-800 text-gray-400'}`}>
                      {p.productType === 'serial' ? 'سيريال' : 'عادي'}
                    </span>
                  </td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => setQrProduct(p)} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-400 hover:bg-blue-900/20" title="ملصق QR"><QrCode size={13} /></button>
                      <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg text-gray-400 hover:text-violet-400 hover:bg-violet-900/20"><Edit size={13} /></button>
                      <button onClick={() => onDeleteProduct(p.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-900/20"><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filtered.length === 0 && <div className="text-center text-gray-500 py-16">لا توجد منتجات</div>}

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4 overflow-y-auto" onClick={() => setShowForm(false)}>
          <div className="bg-[#1a1a35] border border-violet-900/40 rounded-2xl p-6 w-full max-w-2xl my-4" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-white mb-5">{editProduct ? '✏️ تعديل منتج' : '➕ إضافة منتج جديد'}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="form-label">اسم المنتج *</label>
                <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="input-dark w-full" placeholder="مثال: iPhone 15 Pro Max 256GB" />
              </div>
              <div>
                <label className="form-label">كود المنتج (SKU) *</label>
                <input type="text" value={form.sku} onChange={e => setForm(p => ({ ...p, sku: e.target.value }))} className="input-dark w-full" placeholder="IP15PM-256" />
              </div>
              <div>
                <label className="form-label">UPC / Barcode</label>
                <input type="text" value={form.upc} onChange={e => setForm(p => ({ ...p, upc: e.target.value }))} className="input-dark w-full" placeholder="195949035951" />
              </div>
              <div>
                <label className="form-label">الفئة *</label>
                <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value as ProductCategory }))} className="input-dark w-full">
                  <option value="phones">📱 موبايلات</option>
                  <option value="tablets">📲 تابلت</option>
                  <option value="laptops">💻 لابتوب</option>
                  <option value="accessories">🎧 إكسسوارات</option>
                  <option value="other">📦 أخرى</option>
                </select>
              </div>
              <div>
                <label className="form-label">العلامة التجارية</label>
                <div className="flex gap-2">
                  <select value={form.brand} onChange={e => setForm(p => ({ ...p, brand: e.target.value }))} className="input-dark flex-1">
                    {brands.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                  </select>
                </div>
                <div className="flex gap-2 mt-2">
                  <input type="text" value={newBrand} onChange={e => setNewBrand(e.target.value)} className="input-dark flex-1" placeholder="إضافة براند جديد..." />
                  <button onClick={handleAddBrand} className="btn-secondary text-xs px-3">إضافة</button>
                </div>
              </div>
              <div>
                <label className="form-label">نوع المنتج *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setForm(p => ({ ...p, productType: 'normal' }))}
                    className={`py-2 px-3 rounded-xl border text-xs font-medium transition-colors ${form.productType === 'normal' ? 'bg-green-700/30 border-green-500/50 text-green-300' : 'border-white/10 text-gray-400'}`}
                  >
                    📦 عادي (بدون سيريال)
                  </button>
                  <button
                    onClick={() => setForm(p => ({ ...p, productType: 'serial' }))}
                    className={`py-2 px-3 rounded-xl border text-xs font-medium transition-colors ${form.productType === 'serial' ? 'bg-blue-700/30 border-blue-500/50 text-blue-300' : 'border-white/10 text-gray-400'}`}
                  >
                    🔢 بسيريال (IMEI)
                  </button>
                </div>
              </div>
              <div>
                <label className="form-label">سعر الشراء</label>
                <input type="number" value={form.costPrice} onChange={e => setForm(p => ({ ...p, costPrice: parseFloat(e.target.value) || 0 }))} className="input-dark w-full" />
              </div>
              <div>
                <label className="form-label">سعر البيع</label>
                <input type="number" value={form.salePrice} onChange={e => setForm(p => ({ ...p, salePrice: parseFloat(e.target.value) || 0 }))} className="input-dark w-full" />
              </div>
              <div>
                <label className="form-label">المخزون الحالي</label>
                <input type="number" value={form.stock} onChange={e => setForm(p => ({ ...p, stock: parseInt(e.target.value) || 0 }))} className="input-dark w-full" />
              </div>
              <div>
                <label className="form-label">حد التنبيه</label>
                <input type="number" value={form.minStock} onChange={e => setForm(p => ({ ...p, minStock: parseInt(e.target.value) || 0 }))} className="input-dark w-full" />
              </div>
              <div className="md:col-span-2">
                <label className="form-label">الوصف</label>
                <textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="input-dark w-full h-20 resize-none" placeholder="وصف المنتج..." />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={handleSave} className="btn-primary flex-1">💾 حفظ</button>
              <button onClick={() => setShowForm(false)} className="btn-secondary flex-1">إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* مودال طباعة ملصق QR للمنتج */}
      {qrProduct && <ProductQRModal product={qrProduct} onClose={() => setQrProduct(null)} />}
    </div>
  );
}

function ProductCard({ product, availableSerials, onEdit, onDelete, onShowQR }: { product: Product; availableSerials: number; onEdit: () => void; onDelete: () => void; onShowQR: () => void }) {
  const stockColor = product.stock === 0 ? 'text-red-400' : product.stock <= 2 ? 'text-yellow-400' : 'text-green-400';
  return (
    <div className="bg-[#1a1a35] border border-violet-900/30 rounded-2xl p-4 hover:border-violet-700/50 transition-all">
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-xl bg-violet-900/30 flex items-center justify-center text-xl">
          {product.category === 'phones' ? '📱' : product.category === 'tablets' ? '📲' : product.category === 'laptops' ? '💻' : product.category === 'accessories' ? '🎧' : '📦'}
        </div>
        <div className="flex gap-1">
          <button onClick={onShowQR} className="p-1.5 rounded-lg text-gray-500 hover:text-blue-400 hover:bg-blue-900/20" title="ملصق QR"><QrCode size={14} /></button>
          <button onClick={onEdit} className="p-1.5 rounded-lg text-gray-500 hover:text-violet-400 hover:bg-violet-900/20"><Edit size={14} /></button>
          <button onClick={onDelete} className="p-1.5 rounded-lg text-gray-500 hover:text-red-400 hover:bg-red-900/20"><Trash2 size={14} /></button>
        </div>
      </div>
      <h3 className="font-semibold text-white text-sm mb-1 line-clamp-2">{product.name}</h3>
      <div className="text-xs text-gray-500 mb-3">{product.sku} • {product.brand}</div>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-gray-500">سعر البيع</div>
          <div className="text-sm font-bold text-white">{formatCurrency(product.salePrice)}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500">المخزون</div>
          <div className={`text-lg font-black ${stockColor}`}>
            {product.productType === 'serial' ? availableSerials : product.stock}
          </div>
        </div>
      </div>
      <div className="mt-2 flex gap-2">
        <span className={`text-xs px-2 py-0.5 rounded-full ${product.productType === 'serial' ? 'bg-blue-900/40 text-blue-400' : 'bg-gray-800 text-gray-400'}`}>
          {product.productType === 'serial' ? 'سيريال' : 'عادي'}
        </span>
        <span className="text-xs px-2 py-0.5 rounded-full bg-violet-900/30 text-violet-400">{categoryLabel(product.category)}</span>
      </div>
    </div>
  );
}

function ProductListRow({ product, availableSerials, onEdit, onDelete, onShowQR }: { product: Product; availableSerials: number; onEdit: () => void; onDelete: () => void; onShowQR: () => void }) {
  const stockColor = product.stock === 0 ? 'text-red-400' : product.stock <= 2 ? 'text-yellow-400' : 'text-green-400';
  return (
    <div className="bg-[#1a1a35] border border-violet-900/30 rounded-xl px-4 py-3 flex items-center justify-between hover:border-violet-700/50 transition-all">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-violet-900/30 flex items-center justify-center text-lg">
          {product.category === 'phones' ? '📱' : product.category === 'tablets' ? '📲' : product.category === 'laptops' ? '💻' : '🎧'}
        </div>
        <div>
          <div className="font-medium text-white text-sm">{product.name}</div>
          <div className="text-xs text-gray-500">{product.sku} • {product.brand} • {categoryLabel(product.category)}</div>
        </div>
      </div>
      <div className="flex items-center gap-6">
        <div className="text-right hidden md:block">
          <div className="text-xs text-gray-500">شراء</div>
          <div className="text-sm text-gray-300">{product.costPrice.toLocaleString('ar-EG')}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-500">بيع</div>
          <div className="text-sm font-bold text-white">{product.salePrice.toLocaleString('ar-EG')}</div>
        </div>
        <div className="text-center">
          <div className={`text-xl font-black ${stockColor}`}>{product.productType === 'serial' ? availableSerials : product.stock}</div>
          <div className="text-xs text-gray-500">مخزون</div>
        </div>
        <div className="flex gap-1">
          <button onClick={onShowQR} className="p-1.5 rounded-lg text-gray-500 hover:text-blue-400" title="ملصق QR"><QrCode size={14} /></button>
          <button onClick={onEdit} className="p-1.5 rounded-lg text-gray-500 hover:text-violet-400"><Edit size={14} /></button>
          <button onClick={onDelete} className="p-1.5 rounded-lg text-gray-500 hover:text-red-400"><Trash2 size={14} /></button>
        </div>
      </div>
    </div>
  );
}
