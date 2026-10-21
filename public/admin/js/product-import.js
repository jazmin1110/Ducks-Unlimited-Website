// =============================================================================
// Product import/export — Oboda-style CSV
// =============================================================================
// Used by /admin/products.html.
//
// The file format copies Oboda's "products bulk import template" exactly, so a
// manager can export from Oboda and import here (and vice versa).
// Each row in the file is ONE VARIANT (one color + size). Rows with the same
// `name` are grouped into one product.
//
// Columns the website uses:
//   code            → SKU. THE MATCH KEY: an existing SKU is updated, a new one is created.
//   name            → product name (also groups rows into one product)
//   description     → product description
//   productTypeName → category (must be Polo, T-Shirt, Shorts, Pants or Others)
//   sellingPrice    → price
//   barcode         → variant barcode
//   Color, Size     → variant color and size
// Every other Oboda column is ignored on import and left blank on export.
//
// Rules (see docs/superpowers/specs/2026-10-21-bulk-import-export-design.md):
//   - A blank cell never erases anything — it means "leave as is".
//   - New products are created HIDDEN so photos can be added first.
//   - If ANY row has a problem, nothing is saved.
// =============================================================================

import { supabase } from '/lib/supabase.js';
import { parseCsv, toCsv } from '/admin/js/csv.js';
import { fetchAll, loadAllVariants, normalizeCode } from '/admin/js/bulk-data.js';


// Oboda's columns, in Oboda's order. Exports use exactly this header row.
export const PRODUCT_COLUMNS = [
  'name', 'code', 'buyingPrice', 'sellingPrice', 'suggestedRetailPrice',
  'description', 'barcode', 'supplierName', 'productTypeName',
  'minimumQuantity', 'maximumQuantity', 'reorderingQuantity', 'baseUnitName',
  'inventoryType', 'Color', 'Size', 'Material', 'Weight', 'Finish',
  'Country of Origin', 'Warranty', 'Quality Grade', 'Shape', 'Style',
];


// The categories the site knows (same list as the product form's dropdown).
// The file may say "Polo", "POLO", "T-Shirt", "tshirt", etc. — we squash
// spaces/dashes and lowercase it, then look it up here.
const CATEGORY_LOOKUP = {
  polo: 'polo',
  tshirt: 't-shirt', tee: 't-shirt', tees: 't-shirt', tshirts: 't-shirt',
  shorts: 'shorts', short: 'shorts',
  pants: 'pants', pant: 'pants', trousers: 'pants',
  others: 'others', other: 'others',
};
const CATEGORY_NAMES = 'Polo, T-Shirt, Shorts, Pants or Others';

function normalizeCategory(raw) {
  const key = raw.toLowerCase().replace(/[\s\-_]/g, '');
  return CATEGORY_LOOKUP[key] ?? null;
}


// "₱1,295.00" → 1295. Returns null if it isn't a valid non-negative number.
function parsePrice(raw) {
  const n = Number(String(raw).replace(/[₱,\s]/g, ''));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

// Prices are compared in centavos so 1295 and 1295.00 count as the same.
function samePrice(a, b) {
  if (a === null || b === null) return a === b;
  return Math.round(a * 100) === Math.round(b * 100);
}

// Price override rule: if the variant costs the same as the product's base
// price, store null ("use base price"); otherwise store its own price.
function overrideFor(price, basePrice) {
  return samePrice(price, basePrice) ? null : price;
}


// ─────────────────────────────────────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────────────────────────────────────

// Build the export CSV text. brandSlug = 'du' / 'rw', or null for all brands.
// Hidden products ARE included — the export is a full backup / round-trip.
export async function buildProductExport(brandSlug) {
  const variants = await loadAllVariants(brandSlug);

  const rows = variants.map(v => ({
    name:            v.productName,
    code:            v.sku,
    // The price a customer actually pays for this variant
    sellingPrice:    (v.priceOverride ?? v.basePrice).toFixed(2),
    description:     v.description ?? '',
    barcode:         v.barcode ?? '',
    productTypeName: v.category,
    Color:           v.color,
    Size:            v.size,
  }));

  return toCsv(PRODUCT_COLUMNS, rows);
}

// A header-only file the manager can fill in from scratch.
export function blankProductTemplate() {
  return toCsv(PRODUCT_COLUMNS, []);
}


// ─────────────────────────────────────────────────────────────────────────────
// IMPORT — step 1: check the file and build a plan (nothing is saved yet)
// ─────────────────────────────────────────────────────────────────────────────
//
// brand: { slug, id } of the brand picked in the top bar, or null when the
//        top bar says "All brands" (then only updates to existing SKUs work).
//
// Returns the shape /admin/js/import-modal.js expects:
//   { fatal, problems, warnings, summary, previewHeaders, previewRows,
//     changeCount, plan }
export async function analyzeProductFile(text, brand) {
  const { rows } = parseCsv(text);
  const result = {
    fatal: null, problems: [], warnings: [], summary: [],
    previewHeaders: ['Row', 'SKU', 'Product', 'Color / Size', 'What happens'],
    previewRows: [], changeCount: 0, plan: null,
  };

  if (rows.length === 0) {
    result.fatal = 'The file is empty.';
    return result;
  }
  if (!('code' in rows[0])) {
    result.fatal = 'This doesn\'t look like an Oboda product file — there is no "code" column. ' +
                   'Download the template to see the expected columns.';
    return result;
  }

  // ── Load what's already on the site ──
  // Every variant (all brands — SKUs are unique across the whole site)
  const existing = await loadAllVariants(null);
  const bySku     = new Map(existing.map(v => [normalizeCode(v.sku), v]));
  const byBarcode = new Map(existing.filter(v => v.barcode).map(v => [normalizeCode(v.barcode), v]));

  // Products in the selected brand, by lowercased name — so new sizes/colors
  // join an existing product instead of creating a duplicate.
  const productsByName = new Map();
  if (brand) {
    const products = await fetchAll(() => supabase
      .from('products').select('id, name, base_price')
      .eq('brand_id', brand.id).order('id'));
    for (const p of products) {
      productsByName.set(p.name.trim().toLowerCase(), { id: p.id, basePrice: Number(p.base_price) });
    }
  }

  // ── The plan we'll send to the database ──
  const newProducts    = new Map();  // lowercased name → { name, category, description, base_price, variants: [] }
  const newVariants    = [];         // new sizes/colors for existing products
  const productUpdates = new Map();  // product id → { id, ...changed fields }
  const productUpdateLine = new Map(); // product id → row number that set it (for warnings)
  const variantUpdates = [];

  const seenSkus     = new Map();    // SKU → first row number, to catch duplicates in the file
  const seenBarcodes = new Map();    // barcode → SKU that uses it in this file
  let unchanged = 0;

  const problem = (line, message) => result.problems.push({ line, message });
  const warn    = (line, message) => result.warnings.push({ line, message });
  const preview = (row, action) => result.previewRows.push([
    row._line, row.code, row.name || '—', [row.color, row.size].filter(Boolean).join(' / ') || '—', action,
  ]);

  for (const row of rows) {
    const line = row._line;
    const sku  = row.code;
    const skuKey = normalizeCode(sku);

    // ── Checks that apply to every row ──
    if (!sku) { problem(line, 'Missing "code" (the SKU).'); continue; }

    if (seenSkus.has(skuKey)) {
      problem(line, `SKU "${sku}" appears twice in the file (also on row ${seenSkus.get(skuKey)}).`);
      continue;
    }
    seenSkus.set(skuKey, line);

    let price = null;
    if (row.sellingprice) {
      price = parsePrice(row.sellingprice);
      if (price === null) { problem(line, `"${row.sellingprice}" isn't a valid price.`); continue; }
    }

    let category = null;
    if (row.producttypename) {
      category = normalizeCategory(row.producttypename);
      if (!category) {
        problem(line, `Unknown product type "${row.producttypename}". Use ${CATEGORY_NAMES}.`);
        continue;
      }
    }

    if (row.barcode) {
      const bcKey = normalizeCode(row.barcode);
      const owner = byBarcode.get(bcKey);
      if (owner && normalizeCode(owner.sku) !== skuKey) {
        problem(line, `Barcode ${row.barcode} already belongs to SKU ${owner.sku}.`);
        continue;
      }
      if (seenBarcodes.has(bcKey) && seenBarcodes.get(bcKey) !== skuKey) {
        problem(line, `Barcode ${row.barcode} is used by another row in this file.`);
        continue;
      }
      seenBarcodes.set(bcKey, skuKey);
    }

    const current = bySku.get(skuKey);

    // ─────────────────────────────────────────────────────────────────────
    // EXISTING SKU → update only what changed
    // ─────────────────────────────────────────────────────────────────────
    if (current) {
      const changes = [];

      // Product-level fields (shared by all of this product's variants)
      const pChange = {};
      if (row.name && row.name !== current.productName)               pChange.name = row.name;
      if (row.description && row.description !== (current.description ?? '')) pChange.description = row.description;
      if (category && category !== current.category)                  pChange.category = category;

      if (Object.keys(pChange).length > 0) {
        const already = productUpdates.get(current.productId);
        if (already) {
          // Another row already changed this product — first row wins.
          const differs = Object.keys(pChange).some(k => already[k] !== undefined && already[k] !== pChange[k]);
          if (differs) {
            warn(line, `Product "${current.productName}" has different name/description/type on row ` +
                       `${productUpdateLine.get(current.productId)}. Using row ${productUpdateLine.get(current.productId)}.`);
          }
        } else {
          productUpdates.set(current.productId, { id: current.productId, ...pChange });
          productUpdateLine.set(current.productId, line);
          if (pChange.name)        changes.push('name');
          if (pChange.description) changes.push('description');
          if (pChange.category)    changes.push('type');
        }
      }

      // Variant-level fields
      const vChange = {};
      if (row.color && row.color !== current.color) vChange.color = row.color;
      if (row.size  && row.size  !== current.size)  vChange.size  = row.size;
      if (row.barcode && row.barcode !== (current.barcode ?? '')) vChange.barcode = row.barcode;
      if (price !== null) {
        const newOverride = overrideFor(price, current.basePrice);
        if (!samePrice(newOverride, current.priceOverride)) vChange.price_override = newOverride;
      }
      if (Object.keys(vChange).length > 0) {
        variantUpdates.push({ id: current.id, ...vChange });
        if (vChange.color)   changes.push('color');
        if (vChange.size)    changes.push('size');
        if (vChange.barcode) changes.push('barcode');
        if ('price_override' in vChange) changes.push(`price → ₱${price.toLocaleString('en-PH')}`);
      }

      if (changes.length === 0) { unchanged++; continue; } // nothing to do — keep preview short
      preview({ ...row, name: row.name || current.productName }, `Update: ${changes.join(', ')}`);
      continue;
    }

    // ─────────────────────────────────────────────────────────────────────
    // NEW SKU → create a variant (and maybe a product)
    // ─────────────────────────────────────────────────────────────────────
    if (!brand) {
      problem(line, `SKU "${sku}" is new. Pick a brand (Ducks Unlimited or Rocwood) in the top bar so we know where to add it.`);
      continue;
    }

    const missing = [];
    if (!row.name)     missing.push('name');
    if (price === null) missing.push('sellingPrice');
    if (!row.color)    missing.push('Color');
    if (!row.size)     missing.push('Size');
    if (missing.length) {
      problem(line, `New SKU "${sku}" is missing: ${missing.join(', ')}.`);
      continue;
    }

    const nameKey = row.name.trim().toLowerCase();
    const variant = {
      sku,
      color:   row.color,
      size:    row.size,
      barcode: row.barcode || null,
    };

    // a) The product already exists on the site → add this size/color to it
    const existingProduct = productsByName.get(nameKey);
    if (existingProduct) {
      newVariants.push({
        ...variant,
        product_id: existingProduct.id,
        price_override: overrideFor(price, existingProduct.basePrice),
      });
      preview(row, 'New size/color for existing product');
      continue;
    }

    // b) Brand-new product (possibly started by an earlier row in this file)
    let group = newProducts.get(nameKey);
    if (!group) {
      if (!category) {
        problem(line, `"${row.name}" is a new product, so it needs a "productTypeName" (${CATEGORY_NAMES}).`);
        continue;
      }
      group = {
        name: row.name,
        category,
        description: row.description || null,
        base_price: price,                 // first row's price becomes the base price
        variants: [],
        firstLine: line,
      };
      newProducts.set(nameKey, group);
    } else if ((category && category !== group.category) ||
               (row.description && group.description && row.description !== group.description)) {
      warn(line, `"${row.name}" has a different type or description than row ${group.firstLine}. Using row ${group.firstLine}.`);
    }

    group.variants.push({ ...variant, price_override: overrideFor(price, group.base_price) });
    preview(row, group.variants.length === 1 ? 'New product (hidden until you show it)' : 'New size/color for new product');
  }

  // ── Summary numbers for the preview ──
  const newProductList = [...newProducts.values()].map(({ firstLine, ...p }) => p);
  const newVariantCount = newVariants.length + newProductList.reduce((n, p) => n + p.variants.length, 0);
  const updatedSkus = new Set(variantUpdates.map(v => v.id)).size;

  result.summary = [
    { label: 'New products',       value: newProductList.length },
    { label: 'New sizes/colors',   value: newVariantCount },
    { label: 'Products updated',   value: productUpdates.size },
    { label: 'Sizes/colors updated', value: updatedSkus },
    { label: 'Unchanged',          value: unchanged },
  ];

  result.changeCount = newProductList.length + newVariantCount + productUpdates.size + variantUpdates.length;
  result.plan = {
    new_products:    newProductList,
    new_variants:    newVariants,
    product_updates: [...productUpdates.values()],
    variant_updates: variantUpdates,
  };
  return result;
}


// ─────────────────────────────────────────────────────────────────────────────
// IMPORT — step 2: save the plan (only after the manager clicks Confirm)
// ─────────────────────────────────────────────────────────────────────────────
// Runs the database function from migration 020 — all or nothing.
// Returns a short message for the toast.
export async function applyProductPlan(plan, brand) {
  const { data, error } = await supabase.rpc('admin_apply_product_import', {
    p_brand_id: brand ? brand.id : null,
    p_plan: plan,
  });

  if (error) {
    // 23505 = "unique violation" — someone added the same SKU/barcode meanwhile
    if (error.code === '23505') {
      throw new Error('A SKU or barcode in the file was just added by someone else. Nothing was saved — please check the file and try again.');
    }
    throw error;
  }

  const parts = [];
  if (data.new_products)    parts.push(`${data.new_products} new product${data.new_products === 1 ? '' : 's'} (hidden)`);
  if (data.new_variants)    parts.push(`${data.new_variants} new size/color${data.new_variants === 1 ? '' : 's'}`);
  if (data.product_updates || data.variant_updates) parts.push(`${data.product_updates + data.variant_updates} update${data.product_updates + data.variant_updates === 1 ? '' : 's'}`);
  return `Import saved: ${parts.join(', ')}.`;
}
