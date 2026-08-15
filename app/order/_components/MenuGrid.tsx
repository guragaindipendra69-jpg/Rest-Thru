'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Minus, Info, LayoutGrid, List } from 'lucide-react';
import { useWaiterOrderStore } from '@/store/waiter-order-store';
import { MenuItem, SpiceLevel } from '@/types';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';

type LayoutMode = 'grid' | 'list';

const LAYOUT_STORAGE_KEY = 'order-menu-layout';

export default function MenuGrid({ menuItems }: { menuItems: MenuItem[] }) {
  const { searchQuery, selectedCategory, draftItems, addItem, updateQuantity, orderState } = useWaiterOrderStore();
  const [longPressTimeout, setLongPressTimeout] = useState<NodeJS.Timeout | null>(null);
  const [layout, setLayout] = useState<LayoutMode>('grid');

  // Restore the station's preferred layout (grid by default).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LAYOUT_STORAGE_KEY);
      if (saved === 'grid' || saved === 'list') setLayout(saved);
    } catch {
      // localStorage may be unavailable (private mode) — keep grid.
    }
  }, []);

  const changeLayout = (mode: LayoutMode) => {
    setLayout(mode);
    try {
      localStorage.setItem(LAYOUT_STORAGE_KEY, mode);
    } catch {
      // Persistence is a nicety, not a requirement.
    }
  };

  // Filter & sort logic
  const filteredMenu = useMemo(() => {
    const items = menuItems.filter((item) => {
      const matchesSearch = 
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        item.id.includes(searchQuery);
      
      const matchesCategory = selectedCategory && selectedCategory !== "__popular__"
        ? item.categoryId === selectedCategory
        : true;
      
      return matchesSearch && matchesCategory;
    });

    if (selectedCategory === "__popular__") {
      items.sort((a, b) => (b.totalOrders ?? 0) - (a.totalOrders ?? 0));
    } else {
      items.sort((a, b) => a.name.localeCompare(b.name));
    }

    return items;
  }, [searchQuery, selectedCategory, menuItems]);

  const handleTouchStart = (item: MenuItem) => {
    // If order is locked, don't allow modifiers
    if (orderState !== 'DRAFT') return;

    const timeout = setTimeout(() => {
      window.dispatchEvent(new CustomEvent('open-item-modifier', { detail: item }));
    }, 500); // 500ms for long press
    setLongPressTimeout(timeout);
  };

  const handleTouchEnd = () => {
    if (longPressTimeout) {
      clearTimeout(longPressTimeout);
      setLongPressTimeout(null);
    }
  };

  // Quantity controls shared by both layouts. compact shrinks them to fit a card.
  const renderControls = (item: MenuItem, compact: boolean) => {
    // Find if item is in draft (for simplicity, we sum up quantities of this menu item regardless of notes)
    const draftItemsForThisMenu = draftItems.filter(d => d.menuItem.id === item.id);
    const totalQuantity = draftItemsForThisMenu.reduce((sum, d) => sum + d.quantity, 0);
    
    // For simple inc/dec, we act on the first draft item we find for this menu item, 
    // or just add a new one if none exists.
    const firstDraftItemId = draftItemsForThisMenu.length > 0 ? draftItemsForThisMenu[0].id : null;

    const hasMultipleEntries = draftItemsForThisMenu.length > 1;

    if (totalQuantity > 0 && !hasMultipleEntries) {
      return (
        <div className={cn("flex items-center bg-muted rounded-full border border-border", compact ? "flex-shrink-0 w-fit" : "")}>
          <button 
            onClick={(e) => { e.stopPropagation(); if (firstDraftItemId) updateQuantity(firstDraftItemId, draftItemsForThisMenu[0].quantity - 1); }}
            className={cn("flex items-center justify-center text-muted-foreground hover:text-primary active:bg-muted/80 rounded-l-full transition-colors", compact ? "w-7 h-7" : "w-10 h-10")}
            disabled={orderState !== 'DRAFT'}
          >
            <Minus size={compact ? 13 : 18} />
          </button>
          <span className={cn("text-center font-bold text-foreground", compact ? "w-5 text-xs" : "w-8")}>
            {totalQuantity}
          </span>
          <button 
            onClick={(e) => { e.stopPropagation(); addItem(item); }}
            className={cn("flex items-center justify-center text-muted-foreground hover:text-primary active:bg-muted/80 rounded-r-full transition-colors", compact ? "w-7 h-7" : "w-10 h-10")}
            disabled={orderState !== 'DRAFT'}
          >
            <Plus size={compact ? 13 : 18} />
          </button>
        </div>
      );
    }

    if (totalQuantity > 0 && hasMultipleEntries) {
      return (
        <div className={cn("flex items-center gap-2", compact && "flex-shrink-0")}>
          <span className={cn("text-sm font-bold text-muted-foreground bg-muted rounded-full", compact ? "px-2 py-0.5 text-[11px]" : "px-3 py-1.5")}>
            x{totalQuantity}
          </span>
          <button 
            onClick={(e) => { e.stopPropagation(); addItem(item); }}
            className={cn("flex items-center justify-center text-muted-foreground hover:text-primary rounded-full transition-colors bg-muted", compact ? "w-7 h-7" : "w-10 h-10")}
            disabled={orderState !== 'DRAFT'}
          >
            <Plus size={compact ? 13 : 18} />
          </button>
        </div>
      );
    }

    return (
      <button 
        onClick={(e) => { e.stopPropagation(); addItem(item); }}
        disabled={orderState !== 'DRAFT'}
        className={cn(
          "bg-primary/10 text-primary rounded-full flex items-center justify-center hover:bg-primary/20 active:bg-primary/30 transition-colors disabled:opacity-50 flex-shrink-0",
          compact ? "w-8 h-8" : "w-12 h-12"
        )}
      >
        <Plus size={compact ? 16 : 24} />
      </button>
    );
  };

  return (
    <div className="p-4">
      {/* Layout toggle */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-muted-foreground">
          {filteredMenu.length} {filteredMenu.length === 1 ? 'item' : 'items'}
        </span>
        <div className="flex items-center rounded-full bg-muted border border-border p-0.5 gap-0.5">
          <button
            onClick={() => changeLayout('grid')}
            aria-label="Grid layout"
            title="Grid view"
            className={cn(
              "flex items-center justify-center w-8 h-8 rounded-full transition-colors",
              layout === 'grid'
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <LayoutGrid size={14} />
          </button>
          <button
            onClick={() => changeLayout('list')}
            aria-label="List layout"
            title="List view"
            className={cn(
              "flex items-center justify-center w-8 h-8 rounded-full transition-colors",
              layout === 'list'
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <List size={14} />
          </button>
        </div>
      </div>

      {layout === 'grid' ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2.5">
          {filteredMenu.map((item) => (
            <div 
              key={item.id} 
              className={cn(
                "bg-card rounded-xl shadow-sm border border-border overflow-hidden flex flex-col active:scale-[0.98] transition-transform select-none",
                orderState === 'DRAFT' && "cursor-pointer"
              )}
              onTouchStart={() => handleTouchStart(item)}
              onTouchEnd={handleTouchEnd}
              onMouseDown={() => handleTouchStart(item)}
              onMouseUp={handleTouchEnd}
              onMouseLeave={handleTouchEnd}
            >
              {item.imageUrl ? (
                <div className="relative w-full aspect-[4/3] bg-muted overflow-hidden">
                  <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                  {item.spiceLevel === SpiceLevel.HOT && <span className="absolute top-1 right-1 text-xs">🌶️</span>}
                </div>
              ) : (
                <div className="w-full aspect-[4/3] bg-muted flex items-center justify-center">
                  {item.spiceLevel === SpiceLevel.HOT && <span className="text-base">🌶️</span>}
                </div>
              )}

              <div className="p-2.5 flex flex-col flex-1 gap-1">
                <h3 className="text-[13px] font-semibold text-foreground leading-snug line-clamp-1">{item.name}</h3>
                {item.description && (
                  <p className="text-[11px] text-muted-foreground line-clamp-1">{item.description}</p>
                )}
                <div className="mt-auto pt-1 flex items-center justify-between gap-1.5">
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-bold text-primary truncate">
                      {formatCurrency(item.discountPrice ?? item.price)}
                    </span>
                    {item.discountPrice != null && item.discountPrice < item.price && (
                      <span className="text-[10px] text-muted-foreground line-through font-normal">
                        {formatCurrency(item.price)}
                      </span>
                    )}
                  </div>
                  {renderControls(item, true)}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredMenu.map((item) => (
            <div 
              key={item.id} 
              className={cn(
                "bg-card rounded-2xl p-4 shadow-sm border border-border flex justify-between items-center active:scale-[0.98] transition-transform select-none",
                orderState === 'DRAFT' && "cursor-pointer"
              )}
              onTouchStart={() => handleTouchStart(item)}
              onTouchEnd={handleTouchEnd}
              onMouseDown={() => handleTouchStart(item)}
              onMouseUp={handleTouchEnd}
              onMouseLeave={handleTouchEnd}
            >
              {item.imageUrl && (
                <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 mr-3 bg-muted">
                  <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                </div>
              )}
              <div className="flex-1 pr-4">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-bold text-foreground leading-tight">{item.name}</h3>
                  {item.spiceLevel === SpiceLevel.HOT && <span className="text-destructive text-xs">🌶️</span>}
                  {orderState === 'DRAFT' && (
                    <span title="Long-press for modifiers &amp; notes">
                      <Info className="w-3.5 h-3.5 text-muted-foreground" />
                    </span>
                  )}
                </div>
                {item.description && (
                  <p className="text-sm text-muted-foreground line-clamp-1 mb-2">{item.description}</p>
                )}
                <div className="font-semibold text-primary flex items-center gap-2">
                  {formatCurrency(item.discountPrice ?? item.price)}
                  {item.discountPrice != null && item.discountPrice < item.price && (
                    <span className="text-xs text-muted-foreground line-through font-normal">
                      {formatCurrency(item.price)}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex-shrink-0">
                {renderControls(item, false)}
              </div>
            </div>
          ))}
        </div>
      )}

      {filteredMenu.length === 0 && (
        <div className="text-center text-muted-foreground py-10">
          No items found.
        </div>
      )}
    </div>
  );
}