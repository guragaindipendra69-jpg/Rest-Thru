export interface MenuItemData {
  id: string;
  name: string;
  description: string;
  price: number;
  imageUrl?: string | null;
  category: string;
  tags?: string[];
  details?: string[];
  featured?: boolean;
}

export interface DrinkItemData {
  id: string;
  name: string;
  description?: string;
  price: number;
  group: "wine" | "cocktail";
  featured?: boolean;
  imageUrl?: string | null;
}

// A renderable menu section (built client-side from MenuData.categories —
// empty categories are dropped so they never produce blank pages).
export interface SectionData {
  id: string;
  title: string;
  kicker?: string;
  // The owner-uploaded category photo, when the section maps to a category that
  // has one. Null for sections built purely from an item's `menuSection`.
  imageUrl?: string | null;
  items: MenuItemData[];
  tint?: boolean;
}

export interface MenuData {
  restaurant: {
    name: string;
    tagline: string;
    established: string;
    address: string;
    hours: string;
    phone: string;
    website: string;
    social: string;
  };
  categories: {
    id: string;
    name: string;
    slug: string;
    imageUrl?: string | null;
    items: MenuItemData[];
  }[];
  drinks: DrinkItemData[];
}
