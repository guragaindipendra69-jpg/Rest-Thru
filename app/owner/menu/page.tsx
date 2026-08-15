'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Search, LayoutGrid, List, Eye, Edit2, Trash2,
  Upload, X, QrCode, Palette, Download, FileImage,
  UtensilsCrossed, Package, CupSoda, Percent,
  Coffee, Snowflake, IceCream, ListChecks, Tags, Info,
  MoreHorizontal, AlertCircle,
} from 'lucide-react';
import QRCode from 'react-qr-code';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogDescription,
  DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem,
  SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { FOOD_SUB_TYPES, SPICE_LEVELS, ALLERGENS } from '@/lib/constants';
import { formatCurrency } from '@/lib/format';
import { uploadFile } from '@/lib/upload';
import {
  DOCUMENT_ACCEPT,
  IMAGE_ACCEPT,
  MAX_UPLOAD_LABEL,
  validateUpload,
  type UploadKind,
} from '@/lib/upload-limits';
import { useAuthStore } from '@/store/auth-store';
import { portalBase } from '@/lib/portal';
import {
  updateCategory, deleteCategory as deleteCategoryAction,
  toggleCategoryActive as toggleCategoryActiveAction,
  getMenuItems, updateMenuItem,
  deleteMenuItem as deleteMenuItemAction,
  toggleMenuItemAvailable as toggleMenuItemAvailableAction,
  getCategories, getMenuSettings, updateMenuSettings,
  bulkUpdateItemsAvailable, bulkAdjustItemPrices,
} from '@/lib/actions/menu';

/**
 * Validate a picked file against the shared 5 MB / format rule and report the
 * reason immediately, returning null when it is rejected.
 *
 * The three pickers on this page hold a `File` in state and only upload it when
 * the dialog is saved, which is deliberate — an abandoned dialog should not leave
 * an orphan in public/uploads. But it meant nothing checked the file at pick
 * time, so an oversized one was accepted into state and failed later at save;
 * the custom-menu dropzone even advertised "up to 20 MB" against a 5 MB server
 * limit. Clearing `value` lets the same file be re-picked after a fix.
 */
function acceptPicked(
  event: React.ChangeEvent<HTMLInputElement>,
  kind: UploadKind = 'image'
): File | null {
  const file = event.target.files?.[0];
  if (!file) return null;
  const check = validateUpload(file, kind);
  event.target.value = '';
  if (!check.ok) {
    toast.error(check.error);
    return null;
  }
  return file;
}

const ITEM_TYPES = [
  { value: 'food', label: 'Food', icon: 'UtensilsCrossed', description: 'Cooked dishes, meals, snacks' },
  { value: 'item', label: 'Items', icon: 'Package', description: 'General items, merchandise, packaged goods' },
  { value: 'beverage', label: 'Beverages', icon: 'CupSoda', description: 'Drinks, juices, tea, coffee' },
];

// Renders the lucide icon for an item type — single source instead of the
// same ternary being copy-pasted at every place an item-type icon is shown.
function ItemTypeIcon({ itemType, className }: { itemType: string; className?: string }) {
  if (itemType === 'beverage') return <CupSoda className={className} />;
  if (itemType === 'item') return <Package className={className} />;
  return <UtensilsCrossed className={className} />;
}

const TEMPERATURE_OPTIONS = [
  { value: 'hot', label: 'Hot', icon: Coffee },
  { value: 'cold', label: 'Cold', icon: Snowflake },
  { value: 'iced', label: 'Iced', icon: IceCream },
];

// Food sub-type badge colors — mapped onto the app's existing semantic
// tokens instead of the per-subtype inline hex from lib/constants.ts
// (FOOD_SUB_TYPES.color), so this respects dark mode / theme changes.
// The foreground is picked per token rather than hardcoded white, because the
// light fills (--warning amber, --brand coral) need dark text to clear AA.
const SUBTYPE_BADGE_STYLES: Record<string, string> = {
  veg: 'bg-success text-white',
  chicken: 'bg-warning text-black/80',
  buff: 'bg-destructive text-destructive-foreground',
  pork: 'bg-brand text-brand-foreground',
  mutton: 'bg-info text-white',
};

/**
 * The one badge that says what kind of thing this row is — temperature for a
 * drink, veg/chicken/buff for a dish, a plain "Item" otherwise. Previously this
 * was three inline conditionals duplicated between the grid and the list, which
 * is how the two views drifted apart.
 */
function TypeBadge({ item, className }: { item: MenuItem; className?: string }) {
  const base = `inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${className ?? ''}`;

  if (item.itemType === 'beverage') {
    const temp = TEMPERATURE_OPTIONS.find(t => t.value === item.temperature);
    const TempIcon = temp?.icon;
    return (
      <span className={`${base} bg-info text-white`}>
        {TempIcon && <TempIcon className="w-3 h-3" />} {temp?.label ?? 'Drink'}
      </span>
    );
  }

  if (item.itemType === 'item') {
    return (
      <span className={`${base} bg-accent text-accent-foreground`}>
        <Package className="w-3 h-3" /> Item
      </span>
    );
  }

  const sub = FOOD_SUB_TYPES.find(t => t.value === item.subType);
  if (!sub) return null;
  return (
    <span className={`${base} ${SUBTYPE_BADGE_STYLES[item.subType] || 'bg-muted text-muted-foreground'}`}>
      {sub.label}
    </span>
  );
}

const DEFAULT_SIZE_OPTIONS: SizeOption[] = [
  { name: 'Small', price: 0 },
  { name: 'Medium', price: 0 },
  { name: 'Large', price: 0 },
];

// ── Types ────────────────────────────────────────────────────────────────────
interface SizeOption {
  name: string;
  price: number;
}

// Mirrors the columns that model MenuItem actually has. Fields the form used to
// collect but the schema never stored (Nepali name, Popular, New, per-item
// emoji) are gone: they took input, showed "Item updated", and dropped the value
// on the floor. If those become real columns, add them back here and in
// lib/actions/menu.ts together.
interface MenuItem {
  id: string;
  nameEn: string;
  category: string;       // category id
  description: string;
  price: number;
  discountPrice?: number;
  menuSection: string;
  itemType: 'food' | 'item' | 'beverage';
  foodType: 'veg' | 'non_veg' | 'vegan' | 'fish';
  subType: 'veg' | 'chicken' | 'buff' | 'pork' | 'mutton';
  spiceLevel: 'none' | 'mild' | 'medium' | 'hot' | 'extra_hot';
  prepTime: number;
  available: boolean;
  allergens: string[];
  image?: string;
  temperature?: 'hot' | 'cold' | 'iced';
  volume?: number;
  sizeOptions?: SizeOption[];
}

interface Category {
  id: string;
  name: string;
  active: boolean;
  sortOrder: number;
}

interface MenuSettings {
  bgUrl: string | null;
  customMenuUrl: string | null;
}

const EMPTY_FORM: Partial<MenuItem> = {
  nameEn: '', description: '',
  price: 0, discountPrice: undefined,
  menuSection: 'Appetizers',
  itemType: 'food',
  foodType: 'veg', subType: 'veg',
  spiceLevel: 'none', prepTime: 15,
  available: true,
  allergens: [],
  temperature: 'cold', volume: undefined,
  sizeOptions: DEFAULT_SIZE_OPTIONS,
};

// ── Main Component ────────────────────────────────────────────────────────────
export default function MenuPage() {
  const { restaurant } = useAuthStore();
  const restaurantId = restaurant?.id;
  const qrRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // ── State ─────────────────────────────────────────────────────────────────
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddItemOpen, setIsAddItemOpen] = useState(false);
  const [isAddCategoryOpen, setIsAddCategoryOpen] = useState(false);
  const [isEditMenuOpen, setIsEditMenuOpen] = useState(false);
  const [isQrOpen, setIsQrOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isSavingItem, setIsSavingItem] = useState(false);
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const [isLoadingItems, setIsLoadingItems] = useState(false);
  const [menuSettings, setMenuSettings] = useState<MenuSettings>({ bgUrl: null, customMenuUrl: null });
  const [bgFile, setBgFile] = useState<File | null>(null);
  const [bgPreview, setBgPreview] = useState<string | null>(null);
  const [customMenuFile, setCustomMenuFile] = useState<File | null>(null);
  const [customMenuName, setCustomMenuName] = useState<string | null>(null);
  const [isSavingMenu, setIsSavingMenu] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'item' | 'category'; id: string; name: string } | null>(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [bulkPriceAdjust, setBulkPriceAdjust] = useState(0);
  const [bulkPriceMode, setBulkPriceMode] = useState<'set' | 'percent'>('set');

  const [formData, setFormData] = useState<Partial<MenuItem>>(EMPTY_FORM);
  const [categoryFormData, setCategoryFormData] = useState<Partial<Category>>({
    name: '', sortOrder: 0, active: true,
  });

  // ── Load categories & items from server actions ───────────────────────────
  const loadData = useCallback(async () => {
    if (!restaurantId) return;
    setIsLoadingItems(true);
    try {
      const [catRes, itemRes, settingRes] = await Promise.all([
        getCategories(restaurantId),
        getMenuItems(restaurantId),
        getMenuSettings(restaurantId),
      ]);

      if (catRes.data) {
        const cats: Category[] = catRes.data.map((c: any) => ({
          id: c.id, name: c.name,
          active: c.isActive, sortOrder: c.displayOrder ?? 0,
        }));
        setCategories(cats);
        // Read the current selection through the setter rather than closing over
        // it, so loadData does not have to list selectedCategory as a dependency
        // and get rebuilt (and re-fetch the whole menu) on every rail click.
        setSelectedCategory(prev => (prev ? prev : cats[0]?.id ?? ''));
      }

      if (itemRes.data) {
        const mapped: MenuItem[] = itemRes.data.map((i: any) => ({
          id: i.id, nameEn: i.name,
          category: i.categoryId, description: i.description || '',
          price: i.price, discountPrice: i.discountPrice,
          menuSection: i.menuSection || 'Appetizers',
          itemType: (i.itemType || 'FOOD').toLowerCase() as MenuItem['itemType'],
          foodType: (i.foodType || 'VEG').toLowerCase() as MenuItem['foodType'],
          subType: (i.subType || 'VEG').toLowerCase() as MenuItem['subType'],
          spiceLevel: (i.spiceLevel || 'NONE').toLowerCase() as MenuItem['spiceLevel'],
          prepTime: i.prepTime || 15,
          available: i.isAvailable,
          allergens: i.allergens || [],
          image: i.imageUrl,
          temperature: (i.temperature || 'COLD').toLowerCase() as MenuItem['temperature'],
          volume: i.volume || undefined,
          sizeOptions: (i.sizeOptions || DEFAULT_SIZE_OPTIONS) as unknown as SizeOption[],
        }));
        setItems(mapped);
      }

      if (settingRes.data) {
        setMenuSettings({
          bgUrl: settingRes.data.menuBgUrl || null,
          customMenuUrl: settingRes.data.menuCustomUrl || null,
        });
        setBgPreview(settingRes.data.menuBgUrl || null);
      }
    } finally {
      setIsLoadingItems(false);
    }
  }, [restaurantId]);

  useEffect(() => { loadData(); }, [loadData]);

  // ── Filtered items ─────────────────────────────────────────────────────────
  const query = searchQuery.trim().toLowerCase();
  const isSearching = query.length > 0;

  const categoryNameById = useMemo(
    () => new Map(categories.map(c => [c.id, c.name])),
    [categories]
  );

  // Counted once per render of the list rather than re-filtering every item for
  // every row in the rail. Counting from `items` also means the rail cannot
  // disagree with the grid: there is one source for both.
  const countByCategory = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of items) counts.set(i.category, (counts.get(i.category) ?? 0) + 1);
    return counts;
  }, [items]);

  /**
   * A search spans the whole menu, not just the open category. Scoping it to
   * one category meant typing a dish you knew existed and getting "no items" —
   * the category rail on the left is a browse control, and it should not double
   * as a hidden filter on the thing you explicitly asked for.
   */
  const filteredItems = useMemo(() => {
    if (!isSearching) return items.filter(i => i.category === selectedCategory);
    return items.filter(i =>
      i.nameEn.toLowerCase().includes(query) ||
      i.description.toLowerCase().includes(query) ||
      (categoryNameById.get(i.category) ?? '').toLowerCase().includes(query)
    );
  }, [items, selectedCategory, query, isSearching, categoryNameById]);

  // ── Item handlers ──────────────────────────────────────────────────────────
  // There is no "add" path here: new dishes are created on the dedicated
  // Menu > Dishes > Create page, which collects more than this dialog can.
  const handleEditItem = (item: MenuItem) => {
    setEditingItem(item); setFormData(item);
    setImageFile(null); setImagePreview(item.image || null);
    setIsAddItemOpen(true);
  };

  /**
   * Why the form validates in render rather than inside the save handler: the
   * old code opened with `if (!formData.nameEn) return`, so the Save button
   * stayed enabled, the click did nothing, and no message ever appeared. The
   * only feedback for a missing name was that the dialog refused to close.
   */
  const itemFormError = (() => {
    if (!formData.nameEn?.trim()) return 'Give the item a name before saving.';
    if ((formData.price ?? 0) < 0) return 'Price cannot be negative.';
    const discount = formData.discountPrice;
    if (discount != null && discount > 0 && discount >= (formData.price ?? 0)) {
      return 'The discount price has to be lower than the regular price.';
    }
    return null;
  })();

  const handleSaveItem = async () => {
    if (itemFormError || !editingItem || !restaurantId) return;
    setIsSavingItem(true);
    try {
      let imageUrl = formData.image;
      if (imageFile) {
        // Reports the reason instead of quietly keeping the old image: the
        // previous `if (url) imageUrl = url` meant a rejected upload saved the
        // dish with its former photo and said nothing about it.
        const res = await uploadFile(imageFile, 'menu-items', 'image');
        if ('error' in res) { toast.error(res.error); return; }
        imageUrl = res.url;
      }

      const result = await updateMenuItem(editingItem.id, {
        name: formData.nameEn!.trim(),
        categoryId: formData.category || selectedCategory,
        description: formData.description || null,
        price: formData.price || 0,
        discountPrice: formData.discountPrice || null,
        menuSection: formData.menuSection || 'Appetizers',
        itemType: formData.itemType || 'food',
        foodType: formData.foodType || 'veg',
        subType: formData.subType || 'veg',
        spiceLevel: formData.spiceLevel || 'none',
        prepTime: formData.prepTime || 15,
        isAvailable: formData.available ?? true,
        allergens: formData.allergens || [],
        imageUrl,
        temperature: formData.temperature || null,
        volume: formData.volume || null,
        sizeOptions: formData.sizeOptions || null,
      });
      if (result.error) { toast.error(result.error); return; }
      setItems(items.map(i => i.id === editingItem.id
        ? { ...editingItem, ...formData, nameEn: formData.nameEn!.trim(), image: imageUrl || undefined } : i));
      toast.success(`${formData.nameEn!.trim()} saved`);
      setIsAddItemOpen(false);
    } finally { setIsSavingItem(false); }
  };

  const handleDeleteItem = async (id: string) => {
    const result = await deleteMenuItemAction(id);
    if (result.error) { toast.error(result.error); return; }
    setItems(items.filter(i => i.id !== id));
    toast.success('Item deleted');
  };

  const handleToggleAvailable = async (id: string, val: boolean) => {
    const result = await toggleMenuItemAvailableAction(id, val);
    if (result.error) { toast.error(result.error); return; }
    setItems(items.map(i => i.id === id ? { ...i, available: val } : i));
  };

  // ── Category handlers ──────────────────────────────────────────────────────
  // Category editing only — new categories are created on the dedicated
  // Menu → Category page, so there is no add path here anymore.
  const handleSaveCategory = async () => {
    if (!editingCategory) return;
    if (!categoryFormData.name) { toast.error('Category name is required'); return; }
    if (!restaurantId) { toast.error('Restaurant not loaded — try refreshing'); return; }
    setIsSavingCategory(true);
    try {
      const result = await updateCategory(editingCategory.id, {
        name: categoryFormData.name,
        sortOrder: categoryFormData.sortOrder,
        active: categoryFormData.active,
      });
      if (result.error) { toast.error(result.error); return; }
      setCategories(categories.map(c => c.id === editingCategory.id
        ? { ...editingCategory, ...categoryFormData } as Category : c));
      toast.success('Category updated');
      setIsAddCategoryOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to save category');
    } finally {
      setIsSavingCategory(false);
    }
  };

  const handleDeleteCategory = async (id: string) => {
    const result = await deleteCategoryAction(id);
    if (result.error) { toast.error(result.error); return; }
    setCategories(categories.filter(c => c.id !== id));
    setItems(items.filter(i => i.category !== id));
    if (selectedCategory === id) setSelectedCategory(categories[0]?.id || '');
  };

  const toggleCategoryActive = async (id: string) => {
    const cat = categories.find(c => c.id === id);
    if (!cat) return;
    const result = await toggleCategoryActiveAction(id, !cat.active);
    if (result.error) { toast.error(result.error); return; }
    setCategories(categories.map(c => c.id === id ? { ...c, active: !c.active } : c));
  };

  // ── Delete confirmation (item + category share one AlertDialog) ───────────
  const [isDeleting, setIsDeleting] = useState(false);

  // Deleting a category takes its dishes with it, so the confirmation says how
  // many rather than leaving the user to guess.
  const categoryItemCount =
    deleteConfirm?.type === 'category' ? countByCategory.get(deleteConfirm.id) ?? 0 : 0;

  const handleConfirmDelete = async () => {
    if (!deleteConfirm) return;
    setIsDeleting(true);
    try {
      if (deleteConfirm.type === 'item') {
        await handleDeleteItem(deleteConfirm.id);
      } else {
        await handleDeleteCategory(deleteConfirm.id);
      }
      setDeleteConfirm(null);
    } finally {
      setIsDeleting(false);
    }
  };

  // ── Bulk actions ────────────────────────────────────────────────────────
  const toggleBulkSelect = (id: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const exitBulkMode = () => { setBulkMode(false); setSelectedItems(new Set()); };

  // "All" means all currently shown, not all in the menu — the checkbox sits in a
  // toolbar above a filtered list, so anything else would silently reprice dishes
  // the user cannot see.
  const allVisibleSelected =
    filteredItems.length > 0 && filteredItems.every(i => selectedItems.has(i.id));

  const toggleSelectAllVisible = () => {
    setSelectedItems(prev => {
      if (allVisibleSelected) {
        const next = new Set(prev);
        for (const i of filteredItems) next.delete(i.id);
        return next;
      }
      const next = new Set(prev);
      for (const i of filteredItems) next.add(i.id);
      return next;
    });
  };

  const handleBulkAvailability = async (available: boolean) => {
    if (selectedItems.size === 0) { toast.error('Select at least one item'); return; }
    const ids = Array.from(selectedItems);
    const result = await bulkUpdateItemsAvailable(ids, available);
    if (result.error) { toast.error(result.error); return; }
    setItems(items.map(i => ids.includes(i.id) ? { ...i, available } : i));
    toast.success(`${ids.length} item${ids.length === 1 ? '' : 's'} marked ${available ? 'available' : 'unavailable'}`);
    exitBulkMode();
  };

  const handleBulkPriceAdjust = async () => {
    if (selectedItems.size === 0) { toast.error('Select at least one item'); return; }
    if (!bulkPriceAdjust) { toast.error('Enter a price or percentage'); return; }
    const ids = Array.from(selectedItems);
    const result = await bulkAdjustItemPrices(ids, bulkPriceMode, bulkPriceAdjust);
    if (result.error) { toast.error(result.error); return; }
    setItems(items.map(i => {
      if (!ids.includes(i.id)) return i;
      const price = bulkPriceMode === 'set'
        ? bulkPriceAdjust
        : Math.max(0, Math.round(i.price * (1 + bulkPriceAdjust / 100) * 100) / 100);
      return { ...i, price };
    }));
    toast.success(`Updated price for ${ids.length} item${ids.length === 1 ? '' : 's'}`);
    setBulkPriceAdjust(0);
    exitBulkMode();
  };

  // ── Edit Menu (appearance) save ───────────────────────────────────────────
  const handleSaveMenuAppearance = async () => {
    if (!restaurantId) return;
    setIsSavingMenu(true);
    try {
      const updates: Record<string, string | null> = {};
      if (bgFile) {
        const res = await uploadFile(bgFile, 'menu-bg', 'image');
        if ('error' in res) { toast.error(res.error); return; }
        updates.menu_bg_url = res.url;
        setMenuSettings(s => ({ ...s, bgUrl: res.url }));
      }
      if (customMenuFile) {
        // 'document', not 'image': this dropzone offers "image or PDF" and used
        // to go through an image-only upload helper. A PDF was rejected server
        // side and the null return was swallowed by an `if (url)`, so saving a
        // PDF menu silently did nothing.
        const res = await uploadFile(customMenuFile, 'menu-custom', 'document');
        if ('error' in res) { toast.error(res.error); return; }
        updates.menu_custom_url = res.url;
        setMenuSettings(s => ({ ...s, customMenuUrl: res.url }));
      }
      if (Object.keys(updates).length > 0) {
        const result = await updateMenuSettings(restaurantId, updates);
        if (result.error) { toast.error(result.error); return; }
        toast.success('Menu appearance saved');
      }
      setIsEditMenuOpen(false);
    } finally { setIsSavingMenu(false); }
  };

  // ── QR download ──────────────────────────────────────────────────────────
  const handleDownloadQr = () => {
    const svg = qrRef.current?.querySelector('svg');
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'menu-qr.svg'; a.click();
    URL.revokeObjectURL(url);
  };

  // Read after mount, not during render. `typeof window !== 'undefined'` in the
  // render body gives the server '' and the client a real URL, so React discards
  // the markup it just streamed and warns about it. The configured public origin
  // wins where it is set, because that is the host the printed QR must point at
  // even when staff open the dashboard on localhost or a preview domain.
  const [origin, setOrigin] = useState('');
  useEffect(() => {
    setOrigin(
      (process.env.NEXT_PUBLIC_APP_URL || window.location.origin).replace(/\/$/, '')
    );
  }, []);

  const qrUrl = origin && restaurantId ? `${origin}/r/${restaurantId}` : '';

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    // The owner/reception shell already wraps every page in p-6, so this used to
    // be `flex h-screen` inside that padding — a viewport-tall child in a padded
    // box, which produced a second scrollbar and clipped the last row of dishes.
    // Height now comes from content, and the rail sticks instead of scrolling
    // in its own pane.
    <div className="space-y-6">
      {/* ── Page header ──
          One primary action and an overflow menu, instead of the five
          competing buttons that used to sit here. Adding a dish is what this
          screen is for; previewing, restyling and printing a QR are occasional
          jobs, and giving each of them equal weight made none of them findable.
          Bulk Edit moved down to the list toolbar, next to the rows it acts on. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">Menu</h2>
          <p className="text-sm text-muted-foreground">
            {isSearching
              ? `${filteredItems.length} match${filteredItems.length === 1 ? '' : 'es'} across every category`
              : `${categories.find(c => c.id === selectedCategory)?.name || 'Select a category'} · ${items.length} item${items.length === 1 ? '' : 's'} on the menu`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button className="gap-2" onClick={() => router.push(`${portalBase()}/menu/dishes/create`)}>
            <Plus className="w-4 h-4" /> Add dish
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="More menu actions">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => router.push(`${portalBase()}/menu/category`)}>
                <Tags className="mr-2 h-4 w-4" /> Manage categories
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsEditMenuOpen(true)}>
                <Palette className="mr-2 h-4 w-4" /> Menu appearance
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                disabled={!restaurantId}
                onClick={() => window.open(`/r/${restaurantId}`, '_blank')}
              >
                <Eye className="mr-2 h-4 w-4" /> Preview public menu
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setIsQrOpen(true)}>
                <QrCode className="mr-2 h-4 w-4" /> Menu QR code
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        {/* ── Category rail: a row of chips on small screens, a sticky column on desktop ── */}
        <aside className="rounded-2xl border bg-card lg:sticky lg:top-6 lg:w-64 lg:flex-shrink-0 lg:self-start xl:w-72">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="font-semibold">Categories</h3>
            <span className="text-xs text-muted-foreground">{categories.length}</span>
          </div>
          {/* Category creation lives on the dedicated Menu → Category page. */}
          <div className="flex gap-2 overflow-x-auto p-3 lg:max-h-[calc(100vh-15rem)] lg:flex-col lg:gap-1 lg:overflow-x-visible lg:overflow-y-auto">
            <AnimatePresence initial={false}>
              {categories.map(cat => {
                const active = selectedCategory === cat.id;
                return (
                  <motion.div key={cat.id}
                    initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }}
                    className={`group flex flex-shrink-0 items-center gap-1 rounded-lg pr-1 transition-colors lg:flex-shrink ${
                      active ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
                  >
                    {/* A real button, so the rail is reachable by keyboard and
                        announces its selected state. */}
                    <button
                      type="button"
                      onClick={() => setSelectedCategory(cat.id)}
                      aria-pressed={active}
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-2.5 text-left"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{cat.name}</span>
                        <span className={`block text-xs ${active ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                          {countByCategory.get(cat.id) ?? 0} items
                        </span>
                      </span>
                    </button>
                    {/* Revealed on hover on desktop, always present on touch —
                        an action you cannot hover is an action you cannot reach. */}
                    <div className="flex gap-1 lg:opacity-0 lg:transition-opacity lg:group-hover:opacity-100 lg:group-focus-within:opacity-100">
                      <Button size="sm" variant={active ? 'secondary' : 'ghost'}
                        className="h-6 w-6 p-0"
                        aria-label={`Edit ${cat.name}`}
                        onClick={() => { setEditingCategory(cat); setCategoryFormData(cat); setIsAddCategoryOpen(true); }}>
                        <Edit2 className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant={active ? 'secondary' : 'ghost'}
                        className={`h-6 w-6 p-0 ${active ? '' : 'text-destructive'}`}
                        aria-label={`Delete ${cat.name}`}
                        onClick={() => setDeleteConfirm({ type: 'category', id: cat.id, name: cat.name })}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
            {categories.length === 0 && (
              <div className="w-full py-8 text-center">
                <p className="text-sm text-muted-foreground">No categories yet.</p>
                <Button
                  variant="link"
                  className="h-auto p-0 text-sm"
                  onClick={() => router.push(`${portalBase()}/menu/category`)}
                >
                  Add your first one
                </Button>
              </div>
            )}
          </div>
        </aside>

      {/* ── Items ── */}
      <div className="min-w-0 flex-1">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search every category..."
                className="pl-10 pr-9"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                aria-label="Search menu items"
              />
              {isSearching && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label="Clear search"
                  className="absolute right-2 top-2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            <Button
              variant={bulkMode ? 'secondary' : 'outline'}
              className="flex-shrink-0 gap-2"
              onClick={() => (bulkMode ? exitBulkMode() : setBulkMode(true))}
            >
              <ListChecks className="w-4 h-4" />
              <span className="hidden sm:inline">{bulkMode ? 'Cancel' : 'Bulk edit'}</span>
            </Button>
            <div className="flex flex-shrink-0 items-center gap-1 border rounded-lg p-1 bg-muted">
              <Button size="sm" variant={viewMode === 'grid' ? 'default' : 'ghost'} onClick={() => setViewMode('grid')} className="h-8 w-9" aria-label="Grid view" aria-pressed={viewMode === 'grid'}><LayoutGrid className="w-4 h-4" /></Button>
              <Button size="sm" variant={viewMode === 'list' ? 'default' : 'ghost'} onClick={() => setViewMode('list')} className="h-8 w-9" aria-label="List view" aria-pressed={viewMode === 'list'}><List className="w-4 h-4" /></Button>
            </div>
          </div>

          {/* ── Bulk action toolbar — appears once at least Bulk Edit mode is on ── */}
          {bulkMode && (
            <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg border bg-muted/40">
              {/* Selecting the 40 dishes in a category one checkbox at a time was
                  the slowest part of a seasonal price change. */}
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                <Checkbox
                  checked={allVisibleSelected}
                  onCheckedChange={toggleSelectAllVisible}
                  aria-label={allVisibleSelected ? 'Clear selection' : 'Select all shown items'}
                />
                {selectedItems.size > 0
                  ? `${selectedItems.size} selected`
                  : `Select all ${filteredItems.length}`}
              </label>
              <Separator orientation="vertical" className="h-6" />
              <div className="flex items-center gap-1.5">
                <Select value={bulkPriceMode} onValueChange={v => setBulkPriceMode(v as 'set' | 'percent')}>
                  <SelectTrigger className="h-8 w-[110px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="set">Set price</SelectItem>
                    <SelectItem value="percent">Adjust %</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  className="h-8 w-24 text-xs"
                  placeholder={bulkPriceMode === 'set' ? 'NPR' : '+/- %'}
                  value={bulkPriceAdjust || ''}
                  onChange={e => setBulkPriceAdjust(parseFloat(e.target.value) || 0)}
                />
                <Button size="sm" variant="outline" className="h-8 gap-1" onClick={handleBulkPriceAdjust}>
                  <Percent className="w-3.5 h-3.5" /> Apply
                </Button>
              </div>
              <Separator orientation="vertical" className="h-6" />
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="outline" className="h-8" onClick={() => handleBulkAvailability(true)}>Mark Available</Button>
                <Button size="sm" variant="outline" className="h-8" onClick={() => handleBulkAvailability(false)}>Mark Unavailable</Button>
              </div>
              <Button size="sm" variant="ghost" className="h-8 ml-auto" onClick={exitBulkMode}>Done</Button>
            </div>
          )}
        </div>

        <div className="mt-4">
          {isLoadingItems ? (
            // Skeletons in the shape of the cards they replace, so the list does
            // not jump when the data lands.
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="overflow-hidden rounded-xl border bg-card">
                  <Skeleton className="h-36 w-full rounded-none" />
                  <div className="space-y-2 p-3">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                </div>
              ))}
            </div>
          ) : filteredItems.length === 0 ? (
            // Three different reasons for an empty list, three different things
            // the user needs to do next. The old copy said "No items yet" even
            // when the menu was full and the search simply had no match.
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-20 text-center">
              {isSearching ? (
                <>
                  <Search className="mb-3 h-8 w-8 text-muted-foreground" />
                  <p className="font-medium">No dish matches &ldquo;{searchQuery.trim()}&rdquo;</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Searched every category, name and description.
                  </p>
                  <Button variant="outline" className="mt-4" onClick={() => setSearchQuery('')}>
                    Clear search
                  </Button>
                </>
              ) : categories.length === 0 ? (
                <>
                  <Tags className="mb-3 h-8 w-8 text-muted-foreground" />
                  <p className="font-medium">Start with a category</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Dishes live inside categories, so add one first.
                  </p>
                  <Button className="mt-4" onClick={() => router.push(`${portalBase()}/menu/category`)}>
                    <Tags className="mr-2 h-4 w-4" /> Add category
                  </Button>
                </>
              ) : (
                <>
                  <UtensilsCrossed className="mb-3 h-8 w-8 text-muted-foreground" />
                  <p className="font-medium">
                    Nothing in {categoryNameById.get(selectedCategory) || 'this category'} yet
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Add your first dish and it will show up here.
                  </p>
                  <Button className="mt-4" onClick={() => router.push(`${portalBase()}/menu/dishes/create`)}>
                    <Plus className="mr-2 h-4 w-4" /> Add dishes
                  </Button>
                </>
              )}
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              <AnimatePresence initial={false}>
                {filteredItems.map(item => {
                  const picked = bulkMode && selectedItems.has(item.id);
                  return (
                    <motion.div key={item.id}
                      initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }}>
                      <Card className={`group relative h-full overflow-hidden transition-shadow hover:shadow-soft-lg ${picked ? 'ring-2 ring-primary' : ''}`}>
                        {bulkMode && (
                          <div className="absolute left-2 top-2 z-10 rounded bg-background/90 p-0.5 shadow-sm">
                            <Checkbox checked={selectedItems.has(item.id)} onCheckedChange={() => toggleBulkSelect(item.id)} aria-label={`Select ${item.nameEn}`} />
                          </div>
                        )}
                        <div className="relative flex h-36 items-center justify-center overflow-hidden bg-gradient-to-br from-muted to-muted/50">
                          {item.image
                            ? <img src={item.image} alt="" className={`h-full w-full object-cover ${item.available ? '' : 'grayscale'}`} />
                            : <ItemTypeIcon itemType={item.itemType} className="h-10 w-10 text-muted-foreground" />}
                          <div className={`absolute top-2 flex flex-wrap gap-1 ${bulkMode ? 'left-10' : 'left-2'}`}>
                            <TypeBadge item={item} />
                            {/* A hit from another category is confusing without
                                a label saying which one it came from. */}
                            {isSearching && categoryNameById.get(item.category) && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-background/90 px-2 py-0.5 text-xs font-medium text-foreground shadow-sm">
                                <Tags className="h-3 w-3" /> {categoryNameById.get(item.category)}
                              </span>
                            )}
                          </div>
                          <div className="absolute right-2 top-2 flex gap-1 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                            <Button size="sm" variant="secondary" className="h-7 w-7 p-0" aria-label={`Edit ${item.nameEn}`} onClick={() => handleEditItem(item)}><Edit2 className="h-3 w-3" /></Button>
                            <Button size="sm" variant="destructive" className="h-7 w-7 p-0" aria-label={`Delete ${item.nameEn}`} onClick={() => setDeleteConfirm({ type: 'item', id: item.id, name: item.nameEn })}><Trash2 className="h-3 w-3" /></Button>
                          </div>
                        </div>
                        <CardContent
                          className="space-y-1 p-3"
                          onClick={() => bulkMode && toggleBulkSelect(item.id)}
                          role={bulkMode ? 'button' : undefined}
                        >
                          <p className="truncate text-sm font-bold">{item.nameEn}</p>
                          <p className="line-clamp-2 min-h-[2rem] text-xs text-muted-foreground">
                            {item.description || 'No description'}
                          </p>
                          <div className="flex items-center gap-1.5">
                            {item.discountPrice
                              ? <><span className="text-sm font-bold text-primary">{formatCurrency(item.discountPrice)}</span><span className="text-xs text-muted-foreground line-through">{formatCurrency(item.price)}</span></>
                              : <span className="text-sm font-bold text-primary">{formatCurrency(item.price)}</span>}
                          </div>
                          <div className="flex items-center justify-between border-t pt-1">
                            <span className={`text-xs ${item.available ? 'text-muted-foreground' : 'font-medium text-destructive'}`}>
                              {item.available ? 'Available' : 'Unavailable'}
                            </span>
                            <Switch
                              checked={item.available}
                              onCheckedChange={v => handleToggleAvailable(item.id, v)}
                              aria-label={`${item.nameEn} availability`}
                            />
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredItems.map(item => (
                <div
                  key={item.id}
                  className={`group flex flex-wrap items-center gap-3 rounded-lg border p-3 hover:bg-muted/40 sm:flex-nowrap sm:gap-4 ${bulkMode && selectedItems.has(item.id) ? 'bg-primary/5 ring-2 ring-primary' : ''}`}
                  onClick={() => bulkMode && toggleBulkSelect(item.id)}
                  role={bulkMode ? 'button' : undefined}
                >
                  {bulkMode && (
                    <Checkbox checked={selectedItems.has(item.id)} onCheckedChange={() => toggleBulkSelect(item.id)} onClick={e => e.stopPropagation()} aria-label={`Select ${item.nameEn}`} />
                  )}
                  <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                    {item.image
                      ? <img src={item.image} alt="" className={`h-full w-full rounded-lg object-cover ${item.available ? '' : 'grayscale'}`} />
                      : <ItemTypeIcon itemType={item.itemType} className="h-6 w-6 text-muted-foreground" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.nameEn}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {isSearching && categoryNameById.get(item.category)
                        ? `${categoryNameById.get(item.category)}${item.description ? ` · ${item.description}` : ''}`
                        : item.description}
                    </p>
                  </div>
                  <TypeBadge item={item} className="flex-shrink-0" />
                  <p className="flex-shrink-0 text-sm font-bold text-primary">
                    {item.discountPrice ? formatCurrency(item.discountPrice) : formatCurrency(item.price)}
                  </p>
                  <Switch
                    checked={item.available}
                    onCheckedChange={v => handleToggleAvailable(item.id, v)}
                    onClick={e => e.stopPropagation()}
                    aria-label={`${item.nameEn} availability`}
                  />
                  <div className="flex flex-shrink-0 gap-1 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" aria-label={`Edit ${item.nameEn}`} onClick={e => { e.stopPropagation(); handleEditItem(item); }}><Edit2 className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive" aria-label={`Delete ${item.nameEn}`} onClick={e => { e.stopPropagation(); setDeleteConfirm({ type: 'item', id: item.id, name: item.nameEn }); }}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>

      {/* ═══════════════════════════════════════════════
          Add / Edit Item Dialog
      ═══════════════════════════════════════════════ */}
      <Dialog open={isAddItemOpen} onOpenChange={setIsAddItemOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit {editingItem?.nameEn || 'item'}</DialogTitle>
            <DialogDescription>Changes go live on your public menu as soon as you save.</DialogDescription>
          </DialogHeader>

          {/* Item Type Selector — a button group, so the choice is reachable by
              keyboard and announces which option is picked. */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Item type</label>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Item type">
              {ITEM_TYPES.map(type => (
                <button key={type.value}
                  type="button"
                  role="radio"
                  aria-checked={formData.itemType === type.value}
                  className={`flex flex-col items-center gap-1 rounded-lg border-2 p-3 text-center transition-all ${
                    formData.itemType === type.value
                      ? 'border-primary bg-primary/5 shadow-sm'
                      : 'border-border hover:border-primary/50'
                  }`}
                  onClick={() => setFormData({ ...formData, itemType: type.value as any })}>
                  {type.icon === 'UtensilsCrossed' ? <UtensilsCrossed className="w-6 h-6" /> : type.icon === 'Package' ? <Package className="w-6 h-6" /> : <CupSoda className="w-6 h-6" />}
                  <span className="text-sm font-medium">{type.label}</span>
                  <span className="hidden text-xs text-muted-foreground sm:block">{type.description}</span>
                </button>
              ))}
            </div>
          </div>

          {/* One column until there is room for two. `grid-cols-2` with no
              breakpoint put two ~150px columns side by side on a phone, which is
              how this form was being filled in on the floor. */}
          <div className="grid grid-cols-1 gap-6 py-4 sm:grid-cols-2">
            {/* Left */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold flex items-center gap-1.5 text-muted-foreground">
                <Info className="w-3.5 h-3.5" /> BASICS
              </h3>
              {/* Image */}
              <div>
                <label className="text-sm font-medium mb-2 block">
                  {formData.itemType === 'beverage' ? 'Drink Image' : formData.itemType === 'item' ? 'Item Image' : 'Food Image'}
                </label>
                <label className="block border-2 border-dashed rounded-lg p-4 text-center cursor-pointer hover:bg-muted/40 transition-colors">
                  {imagePreview
                    ? <div className="flex flex-col items-center gap-1"><img src={imagePreview} alt="preview" className="h-28 w-full object-cover rounded-md" /><p className="text-xs text-muted-foreground">Click to change</p></div>
                    : <><Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" /><p className="text-sm text-muted-foreground">Drop image here or click</p></>}
                  <input type="file" accept={IMAGE_ACCEPT} className="hidden" onChange={e => { const f = acceptPicked(e); if (f) { setImageFile(f); setImagePreview(URL.createObjectURL(f)); } }} />
                </label>
              </div>

              <div>
                <label htmlFor="item-name" className="text-sm font-medium mb-1.5 block">Name <span className="text-destructive">*</span></label>
                <Input
                  id="item-name"
                  placeholder={formData.itemType === 'beverage' ? 'e.g., Masala Tea' : formData.itemType === 'item' ? 'e.g., T-Shirt' : 'e.g., Momo'}
                  value={formData.nameEn || ''}
                  aria-invalid={!formData.nameEn?.trim()}
                  onChange={e => setFormData({ ...formData, nameEn: e.target.value })}
                />
              </div>

              <div><label className="text-sm font-medium mb-1.5 block">Category</label>
                <Select value={formData.category || selectedCategory} onValueChange={v => setFormData({ ...formData, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                </Select></div>

              {/* A second, fixed grouping that sits alongside your own
                  categories — it is what orders the sections of the printed and
                  public menu. */}
              <div><label className="text-sm font-medium mb-1.5 block">Menu section</label>
                <Select value={formData.menuSection || 'Appetizers'} onValueChange={v => setFormData({ ...formData, menuSection: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Appetizers">Appetizers</SelectItem>
                    <SelectItem value="Main Courses">Main Courses</SelectItem>
                    <SelectItem value="Desserts">Desserts</SelectItem>
                    <SelectItem value="Beverages">Beverages</SelectItem>
                    <SelectItem value="Extra">Extra</SelectItem>
                  </SelectContent>
                </Select>
                <p className="mt-1 text-xs text-muted-foreground">Where this sits on the printed menu, independent of the category.</p>
              </div>

              <div><label className="text-sm font-medium mb-1.5 block">Description</label>
                <Textarea placeholder="Describe your item..." className="resize-none" rows={3} value={formData.description || ''} onChange={e => setFormData({ ...formData, description: e.target.value })} /></div>

              <Separator />
              <h3 className="text-sm font-semibold flex items-center gap-1.5 text-muted-foreground">
                <Percent className="w-3.5 h-3.5" /> PRICING
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div><label htmlFor="item-price" className="text-sm font-medium mb-1.5 block">Price (NPR) <span className="text-destructive">*</span></label>
                  <Input id="item-price" type="number" min={0} placeholder="0" value={formData.price || 0} onChange={e => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })} /></div>
                <div><label htmlFor="item-discount" className="text-sm font-medium mb-1.5 block">Discount price</label>
                  <Input id="item-discount" type="number" min={0} placeholder="Optional" value={formData.discountPrice || ''} onChange={e => setFormData({ ...formData, discountPrice: e.target.value ? parseFloat(e.target.value) : undefined })} /></div>
              </div>
            </div>

            {/* Right - Conditional based on item type */}
            <div className="space-y-4">
              {formData.itemType === 'food' && (
                <>
                  <h3 className="text-sm font-semibold flex items-center gap-1.5 text-muted-foreground">
                    <Tags className="w-3.5 h-3.5" /> DIETARY & ALLERGEN INFO
                  </h3>
                  {/* Food Sub-type */}
                  <div>
                    <label className="text-sm font-medium mb-2 block">Food Sub-type</label>
                    <div className="grid grid-cols-1 gap-1.5">
                      {FOOD_SUB_TYPES.map(st => (
                        <div key={st.value}
                          className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border-2 cursor-pointer transition-all ${formData.subType === st.value ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}`}
                          onClick={() => setFormData({ ...formData, subType: st.value as any, foodType: st.value === 'veg' ? 'veg' : 'non_veg' })}>
                          <span className="text-sm font-medium flex-1">{st.label}</span>
                          <div className={`h-3 w-3 rounded-full flex-shrink-0 ${(SUBTYPE_BADGE_STYLES[st.value] || 'bg-muted').split(' ')[0]}`} />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Spice Level */}
                  <div>
                    <label className="text-sm font-medium mb-2 block">Spice Level</label>
                    <div className="flex flex-wrap gap-1.5">
                      {SPICE_LEVELS.map(lv => (
                        <Button key={lv.value} variant={formData.spiceLevel === lv.value ? 'default' : 'outline'} size="sm"
                          onClick={() => setFormData({ ...formData, spiceLevel: lv.value as any })} className="text-xs">
                          {lv.icon} {lv.label}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div><label className="text-sm font-medium mb-1.5 block">Prep Time (min)</label>
                    <Input type="number" value={formData.prepTime || 15} onChange={e => setFormData({ ...formData, prepTime: parseInt(e.target.value) || 15 })} /></div>

                  {/* Allergens */}
                  <div>
                    <label className="text-sm font-medium mb-2 block">Allergens</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {ALLERGENS.map(a => (
                        <label key={a} className="flex items-center gap-2 cursor-pointer text-sm">
                          <input type="checkbox" checked={(formData.allergens || []).includes(a)}
                            onChange={e => setFormData({ ...formData, allergens: e.target.checked
                              ? [...(formData.allergens || []), a]
                              : (formData.allergens || []).filter(x => x !== a) })}
                            className="rounded" />
                          {a}
                        </label>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {formData.itemType === 'beverage' && (
                <>
                  <h3 className="text-sm font-semibold flex items-center gap-1.5 text-muted-foreground">
                    <Tags className="w-3.5 h-3.5" /> ADD-ONS & SIZES
                  </h3>
                  {/* Temperature */}
                  <div>
                    <label className="text-sm font-medium mb-2 block">Temperature</label>
                    <div className="grid grid-cols-3 gap-2">
                      {TEMPERATURE_OPTIONS.map(temp => (
                        <div key={temp.value}
                          className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                            formData.temperature === temp.value
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:border-primary/50'
                          }`}
                          onClick={() => setFormData({ ...formData, temperature: temp.value as any })}>
                          <temp.icon className="w-5 h-5" />
                          <span className="text-xs font-medium">{temp.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Volume */}
                  <div>
                    <label className="text-sm font-medium mb-1.5 block">Volume (ml)</label>
                    <Input type="number" placeholder="e.g., 250" value={formData.volume || ''} onChange={e => setFormData({ ...formData, volume: parseInt(e.target.value) || undefined })} />
                  </div>

                  {/* Size Options */}
                  <div>
                    <label className="text-sm font-medium mb-2 block">Size Options</label>
                    <p className="text-xs text-muted-foreground mb-2">Set prices for different sizes (leave base price as default)</p>
                    <div className="space-y-2">
                      {(formData.sizeOptions || DEFAULT_SIZE_OPTIONS).map((size, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <Input
                            placeholder="Size name"
                            value={size.name}
                            onChange={e => {
                              const newSizes = [...(formData.sizeOptions || DEFAULT_SIZE_OPTIONS)];
                              newSizes[idx] = { ...newSizes[idx], name: e.target.value };
                              setFormData({ ...formData, sizeOptions: newSizes });
                            }}
                            className="flex-1"
                          />
                          <Input
                            type="number"
                            placeholder="Price"
                            value={size.price || ''}
                            onChange={e => {
                              const newSizes = [...(formData.sizeOptions || DEFAULT_SIZE_OPTIONS)];
                              newSizes[idx] = { ...newSizes[idx], price: parseFloat(e.target.value) || 0 };
                              setFormData({ ...formData, sizeOptions: newSizes });
                            }}
                            className="w-24"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-destructive"
                            onClick={() => {
                              const newSizes = (formData.sizeOptions || DEFAULT_SIZE_OPTIONS).filter((_, i) => i !== idx);
                              setFormData({ ...formData, sizeOptions: newSizes });
                            }}>
                            <X className="w-4 h-4" />
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const newSizes = [...(formData.sizeOptions || DEFAULT_SIZE_OPTIONS), { name: '', price: 0 }];
                          setFormData({ ...formData, sizeOptions: newSizes });
                        }}>
                        <Plus className="w-3 h-3 mr-1" /> Add Size
                      </Button>
                    </div>
                  </div>
                </>
              )}

              {formData.itemType === 'item' && (
                <>
                  <h3 className="text-sm font-semibold flex items-center gap-1.5 text-muted-foreground">
                    <Tags className="w-3.5 h-3.5" /> DETAILS
                  </h3>
                  {/* A plain item carries nothing beyond the basics on the left.
                      There used to be "SKU / Code" and "Stock Quantity" here,
                      both of them writing into columns meant for something else:
                      the SKU went into subType (the veg/chicken/buff field, which
                      the action uppercases) and the stock count into volume, the
                      millilitres of a drink. Stock lives in Inventory. */}
                  <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                    Items only need a name, a category and a price. Track stock
                    levels under Inventory.
                  </p>
                </>
              )}

              {/* Common toggle for all types */}
              <h3 className="text-sm font-semibold flex items-center gap-1.5 text-muted-foreground pt-2 border-t">
                <Eye className="w-3.5 h-3.5" /> VISIBILITY
              </h3>
              {/* "Mark as Popular" and "Mark as New" used to sit here beside
                  Available. Neither is a column on MenuItem, so both took the
                  toggle, reported success and changed nothing. */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <label htmlFor="item-available" className="text-sm font-medium">Available</label>
                  <p className="text-xs text-muted-foreground">
                    Turn off to keep it on the menu but stop guests ordering it.
                  </p>
                </div>
                <Switch
                  id="item-available"
                  checked={formData.available ?? true}
                  onCheckedChange={v => setFormData({ ...formData, available: v })}
                />
              </div>
            </div>
          </div>

          <DialogFooter className="flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-end">
            {/* The reason the button is disabled, said out loud. Previously the
                save handler returned early on a bad form and nothing at all
                happened on click. */}
            {itemFormError && (
              <p className="flex items-center gap-1.5 text-sm text-destructive sm:mr-auto">
                <AlertCircle className="h-4 w-4 flex-shrink-0" /> {itemFormError}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsAddItemOpen(false)} disabled={isSavingItem}>Cancel</Button>
              <Button onClick={handleSaveItem} disabled={isSavingItem || !!itemFormError}>
                {isSavingItem ? 'Saving...' : 'Save changes'}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════
          Edit Category Dialog — editing only. New categories are created on
          the dedicated Menu > Category page. The Nepali name and emoji fields
          that used to be here were never stored: updateCategory takes them as
          arguments but its SQL only writes name, order and active.
      ═══════════════════════════════════════════════ */}
      <Dialog open={isAddCategoryOpen} onOpenChange={setIsAddCategoryOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit {editingCategory?.name || 'category'}</DialogTitle>
            <DialogDescription>Rename it, change where it sits in the list, or hide it from guests.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div><label htmlFor="cat-name" className="text-sm font-medium mb-1.5 block">Name <span className="text-destructive">*</span></label>
              <Input id="cat-name" placeholder="e.g., Starters" value={categoryFormData.name || ''} onChange={e => setCategoryFormData({ ...categoryFormData, name: e.target.value })} /></div>
            <div><label htmlFor="cat-order" className="text-sm font-medium mb-1.5 block">Sort order</label>
              <Input id="cat-order" type="number" value={categoryFormData.sortOrder || 0} onChange={e => setCategoryFormData({ ...categoryFormData, sortOrder: parseInt(e.target.value) || 0 })} />
              <p className="mt-1 text-xs text-muted-foreground">Lower numbers come first in the category list.</p></div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <label htmlFor="cat-active" className="text-sm font-medium">Active</label>
                <p className="text-xs text-muted-foreground">Hidden categories stay here but not on the public menu.</p>
              </div>
              <Switch id="cat-active" checked={categoryFormData.active ?? true} onCheckedChange={v => setCategoryFormData({ ...categoryFormData, active: v })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddCategoryOpen(false)} disabled={isSavingCategory}>Cancel</Button>
            <Button onClick={handleSaveCategory} disabled={isSavingCategory || !categoryFormData.name?.trim()}>
              {isSavingCategory ? 'Saving...' : 'Save changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════
          Edit Menu Appearance Dialog
      ═══════════════════════════════════════════════ */}
      <Dialog open={isEditMenuOpen} onOpenChange={setIsEditMenuOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Menu</DialogTitle>
            <DialogDescription>Customise how your public menu looks to customers.</DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Background image */}
            <div>
              <label className="text-sm font-medium mb-2 block">Menu Background Image</label>
              <label className="block cursor-pointer rounded-xl border-2 border-dashed hover:border-primary transition-colors overflow-hidden">
                {bgPreview
                  ? <div className="relative h-44 w-full">
                      <img src={bgPreview} alt="bg" className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                        <p className="text-white text-sm font-medium">Click to change</p>
                      </div>
                    </div>
                  : <div className="h-44 flex flex-col items-center justify-center gap-2 text-muted-foreground bg-muted/30">
                      <FileImage className="w-10 h-10 opacity-40" />
                      <p className="text-sm">Upload background image</p>
                      <p className="text-xs opacity-60">Recommended: 1200×400px</p>
                    </div>}
                <input type="file" accept={IMAGE_ACCEPT} className="hidden"
                  onChange={e => { const f = acceptPicked(e); if (f) { setBgFile(f); setBgPreview(URL.createObjectURL(f)); } }} />
              </label>
            </div>

            <Separator />

            {/* Custom menu upload */}
            <div>
              <label className="text-sm font-medium mb-1 block">Custom Menu Upload</label>
              <p className="text-xs text-muted-foreground mb-3">Upload your own designed menu as an image or PDF. When set, customers will see this instead of the auto-generated menu.</p>
              <label className="flex items-center gap-4 border-2 border-dashed rounded-xl p-5 cursor-pointer hover:border-primary transition-colors">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Upload className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  {customMenuName || menuSettings.customMenuUrl
                    ? <>
                        <p className="font-medium text-sm truncate">{customMenuName || 'Custom menu uploaded'}</p>
                        <p className="text-xs text-muted-foreground">Click to replace</p>
                      </>
                    : <>
                        <p className="font-medium text-sm">Click to upload image or PDF</p>
                        <p className="text-xs text-muted-foreground">PNG, JPG, PDF — up to {MAX_UPLOAD_LABEL}</p>
                      </>}
                </div>
                {(customMenuName || menuSettings.customMenuUrl) && (
                  <Button type="button" size="icon" variant="ghost" className="text-destructive flex-shrink-0"
                    onClick={e => { e.preventDefault(); setCustomMenuFile(null); setCustomMenuName(null); setMenuSettings(s => ({ ...s, customMenuUrl: null })); }}>
                    <X className="w-4 h-4" />
                  </Button>
                )}
                <input type="file" accept={DOCUMENT_ACCEPT} className="hidden"
                  onChange={e => { const f = acceptPicked(e, 'document'); if (f) { setCustomMenuFile(f); setCustomMenuName(f.name); } }} />
              </label>
              {menuSettings.customMenuUrl && !customMenuFile && (
                <a href={menuSettings.customMenuUrl} target="_blank" rel="noreferrer"
                  className="text-xs text-primary underline mt-2 inline-block">View current custom menu</a>
              )}
            </div>
          </div>

          {/* A full, unsearchable list of every dish used to sit below this,
              duplicating the availability toggle and edit button that the main
              grid already offers with search and bulk edit behind them. A
              dialog about how the menu looks is the wrong place to scroll a
              hundred dishes. */}

          <DialogFooter className="border-t pt-4">
            <Button variant="outline" onClick={() => setIsEditMenuOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveMenuAppearance} disabled={isSavingMenu}>
              {isSavingMenu ? 'Saving...' : 'Save changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════
          QR Code Dialog
      ═══════════════════════════════════════════════ */}
      <Dialog open={isQrOpen} onOpenChange={setIsQrOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Menu QR Code</DialogTitle>
            <DialogDescription>
              Place this QR code on every table. Customers scan it to view your menu and place orders.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col items-center gap-4 py-4">
            {restaurantId ? (
              <>
                <div ref={qrRef} className="p-4 bg-white rounded-2xl shadow-lg border">
                  <QRCode value={qrUrl} size={200} bgColor="#ffffff" fgColor="#0f172a" level="H" />
                </div>
                <div className="w-full bg-muted rounded-lg px-3 py-2 text-center">
                  <p className="text-xs text-muted-foreground break-all">{qrUrl}</p>
                </div>
                <p className="text-xs text-muted-foreground text-center">
                  Scan with any camera app to open the menu page
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground py-8">Restaurant not loaded yet. Please refresh.</p>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsQrOpen(false)}>Close</Button>
            <Button onClick={handleDownloadQr} disabled={!restaurantId} className="gap-2">
              <Download className="w-4 h-4" /> Download QR
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════════════════════════════════════════
          Delete Confirmation (item or category)
      ═══════════════════════════════════════════════ */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete {deleteConfirm?.type === 'category' ? 'category' : 'item'} &ldquo;{deleteConfirm?.name}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteConfirm?.type === 'category'
                ? `This also deletes every item inside it${categoryItemCount > 0 ? ` — ${categoryItemCount} right now` : ''}. This cannot be undone.`
                : 'This permanently removes the item from your menu. This cannot be undone.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
