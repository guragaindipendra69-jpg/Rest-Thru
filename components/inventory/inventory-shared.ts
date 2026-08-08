'use client';

/** Types and tokens shared by the inventory table, cards and dialogs. */

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  currentStock: number;
  unit: string;
  minThreshold: number;
  lastUpdated: Date;
  status: string;
}

export type HistoryEntry = {
  id: string;
  movementType: string;
  quantity: number;
  reason: string | null;
  createdAt: string | Date;
};

export const statusColors: { [key: string]: string } = {
  Healthy:        'bg-primary-light text-primary',
  Low:            'bg-warning-surface text-warning-strong',
  'Out of Stock': 'bg-destructive/10 text-destructive',
};

export const UNITS = ['kg', 'pcs', 'liters', 'grams', 'dozen'];

export function getItemStatus(currentStock: number, minThreshold: number): string {
  if (currentStock <= 0) return 'Out of Stock';
  if (currentStock <= minThreshold) return 'Low';
  return 'Healthy';
}
