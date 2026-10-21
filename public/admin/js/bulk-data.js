// =============================================================================
// Bulk import/export — shared data loading
// =============================================================================
// Both the product import/export (Products page) and the stock import/export
// (Inventory page) need the same thing first: a full list of every variant,
// with its product and its stock counts. This file loads that list.
// =============================================================================

import { supabase } from '/lib/supabase.js';

// Supabase returns at most 1000 rows per request. To get everything we ask
// for rows 0–999, then 1000–1999, and so on until a page comes back short.
//
// `buildQuery` is a function that returns a fresh query each time it's
// called (a Supabase query can only be run once).
export async function fetchAll(buildQuery) {
  const PAGE = 1000;
  const all = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await buildQuery().range(from, from + PAGE - 1);
    if (error) throw error;
    all.push(...data);
    if (data.length < PAGE) break;
  }
  return all;
}


// Apparel size order, so exports list S before M before L (not alphabetical).
export const SIZE_ORDER = {
  XS: 0, S: 1, M: 2, L: 3, XL: 4, XXL: 5, '2XL': 5, XXXL: 6, '3XL': 6,
};


// Load every variant (optionally only one brand's), flattened to simple objects:
//   { id, sku, barcode, color, size, priceOverride,
//     productId, productName, description, category, basePrice, brandId,
//     online, store }        ← stock counts per channel (0 if no row yet)
//
// brandSlug: 'du' / 'rw' to limit to one brand, or null for all brands.
export async function loadAllVariants(brandSlug = null) {
  const rows = await fetchAll(() => {
    let q = supabase
      .from('variants')
      .select(`
        id, sku, barcode, color, size, price_override,
        products!inner ( id, name, description, category, base_price, brand_id,
                         brands!inner ( slug ) ),
        inventory ( channel, quantity )
      `)
      .order('id');                       // stable order so paging doesn't skip rows
    if (brandSlug) q = q.eq('products.brands.slug', brandSlug);
    return q;
  });

  const variants = rows.map(v => {
    const inv = v.inventory || [];
    return {
      id:            v.id,
      sku:           v.sku,
      barcode:       v.barcode,
      color:         v.color,
      size:          v.size,
      priceOverride: v.price_override === null ? null : Number(v.price_override),
      productId:     v.products.id,
      productName:   v.products.name,
      description:   v.products.description,
      category:      v.products.category,
      basePrice:     Number(v.products.base_price),
      brandId:       v.products.brand_id,
      online:        inv.find(i => i.channel === 'online')?.quantity ?? 0,
      store:         inv.find(i => i.channel === 'greenhills_store')?.quantity ?? 0,
    };
  });

  // Sort by product name, then color, then size — the way a person reads a list
  variants.sort((a, b) => {
    if (a.productName !== b.productName) return a.productName.localeCompare(b.productName);
    if (a.color !== b.color) return a.color.localeCompare(b.color);
    return (SIZE_ORDER[a.size?.toUpperCase()] ?? 99) - (SIZE_ORDER[b.size?.toUpperCase()] ?? 99);
  });

  return variants;
}


// SKUs and barcodes are compared ignoring upper/lower case and extra spaces,
// so "du-polo-m" in a file matches "DU-POLO-M" on the site.
export function normalizeCode(s) {
  return String(s ?? '').trim().toUpperCase();
}
