import type { AddOnOption, Branch, CategoryItem, MenuItem, SystemSettings } from '../types';

/**
 * The menu as customers may see it (QR ordering). Stored as one document
 * `public_menu/{branchId}` that anyone can read, so it must never contain cost prices,
 * recipes, stock, staff or payment-provider secrets.
 */
export interface PublicMenu {
  branch: { id: string; name: string; promptpayMobileOrTaxId: string };
  menuItems: Pick<
    MenuItem,
    | 'id'
    | 'name'
    | 'nameEn'
    | 'category'
    | 'price'
    | 'description'
    | 'image'
    | 'isPopular'
    | 'availableSpiceLevels'
    | 'availableProteins'
    | 'allowAddOns'
    | 'allowedAddOnIds'
  >[];
  categories: Pick<CategoryItem, 'id' | 'name'>[];
  addOns: Pick<AddOnOption, 'id' | 'name' | 'price'>[];
  settings: Pick<SystemSettings, 'shopName' | 'enableVat' | 'vatRate' | 'vatType'> & { shopLogoUrl?: string };
  publishedAt: string;
}

const clean = <T extends Record<string, unknown>>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;

export function buildPublicMenu(
  menuItems: MenuItem[],
  categories: CategoryItem[],
  addOns: AddOnOption[],
  settings: Partial<SystemSettings>,
  branch: Pick<Branch, 'id' | 'name' | 'promptpayMobileOrTaxId'>,
  promptPayId: string
): PublicMenu {
  const logo = settings.shopLogoUrl;
  return {
    branch: { id: branch.id, name: branch.name || settings.shopName || '', promptpayMobileOrTaxId: promptPayId || '' },
    menuItems: menuItems.map(m =>
      clean({
        id: m.id,
        name: m.name,
        nameEn: m.nameEn,
        category: m.category,
        price: m.price,
        description: m.description,
        // Embedded (data:) images can be megabytes; only linked images are published
        image: m.image && !m.image.startsWith('data:') ? m.image : '',
        isPopular: !!m.isPopular,
        availableSpiceLevels: m.availableSpiceLevels,
        availableProteins: m.availableProteins,
        allowAddOns: m.allowAddOns,
        allowedAddOnIds: m.allowedAddOnIds
      })
    ),
    categories: categories.map(c => ({ id: c.id, name: c.name })),
    addOns: addOns.map(a => ({ id: a.id, name: a.name, price: a.price })),
    settings: clean({
      shopName: settings.shopName,
      enableVat: settings.enableVat,
      vatRate: settings.vatRate,
      vatType: settings.vatType,
      shopLogoUrl: logo && /^https?:\/\//.test(logo) ? logo : undefined
    }),
    publishedAt: new Date().toISOString()
  };
}
