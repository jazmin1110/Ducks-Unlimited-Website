// =============================================================================
// Stock import/export — Oboda-style CSV
// =============================================================================
// Used by /admin/inventory.html.
//
// The file format copies Oboda's "product inventory import template":
//
//   Branch name, Product name or Product code or Barcode, Quantity, Inventory location
//
// Two import modes, like Oboda's "Stocked Inventory" menu:
//   'add' — Add Stock:    file quantity is ADDED to current stock (a delivery arrived)
//   'set' — Update Stock: file quantity REPLACES current stock (after a physical count)
//
// Which item?  The product column is matched by SKU first, then barcode.
//              A product NAME isn't accepted — one name covers many sizes/colors.
// Which pile?  Online stock IS the warehouse stock. So we read "Branch name" and
//              "Inventory location" together:
//                mentions "warehouse"  → online
//                mentions "greenhills" → greenhills_store
//                neither / both        → problem (we won't guess)
//
// If ANY row has a problem, nothing is saved.
// =============================================================================

import { supabase } from '/lib/supabase.js';
import { parseCsv, toCsv } from '/admin/js/csv.js';
import { loadAllVariants, normalizeCode } from '/admin/js/bulk-data.js';


// Oboda's columns, in Oboda's order.
export const STOCK_COLUMNS = [
  'Branch name', 'Product name or Product code or Barcode', 'Quantity', 'Inventory location',
];

// What we write in "Branch name" on export, per channel. Re-importing these
// works because they contain the keywords "warehouse" / "greenhills".
const BRANCH_LABEL  = { online: 'Warehouse', greenhills_store: 'Greenhills' };
const CHANNEL_LABEL = { online: 'Online (warehouse)', greenhills_store: 'Greenhills' };


// Work out the channel from the branch + location text. Returns
// 'online', 'greenhills_store', or null if it can't tell.
function channelFor(branch, location) {
  const text = `${branch} ${location}`.toLowerCase();
  const isWarehouse  = text.includes('warehouse');
  const isGreenhills = text.includes('greenhills');
  if (isWarehouse && !isGreenhills) return 'online';
  if (isGreenhills && !isWarehouse) return 'greenhills_store';
  return null;
}


// ─────────────────────────────────────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────────────────────────────────────

// One row per variant per channel, so the file can be edited and re-imported
// with Update Stock. brandSlug = 'du' / 'rw', or null for all brands.
export async function buildStockExport(brandSlug) {
  const variants = await loadAllVariants(brandSlug);
  const rows = [];
  for (const v of variants) {
    for (const channel of ['online', 'greenhills_store']) {
      rows.push({
        'Branch name': BRANCH_LABEL[channel],
        'Product name or Product code or Barcode': v.sku,
        'Quantity': channel === 'online' ? v.online : v.store,
        'Inventory location': '',
      });
    }
  }
  return toCsv(STOCK_COLUMNS, rows);
}

// A header-only file with one example row per branch.
export function blankStockTemplate() {
  return toCsv(STOCK_COLUMNS, [
    { 'Branch name': 'Warehouse',  'Product name or Product code or Barcode': 'YOUR-SKU-HERE', 'Quantity': 10, 'Inventory location': '' },
    { 'Branch name': 'Greenhills', 'Product name or Product code or Barcode': 'YOUR-SKU-HERE', 'Quantity': 5,  'Inventory location': '' },
  ]);
}


// ─────────────────────────────────────────────────────────────────────────────
// IMPORT — step 1: check the file and build a plan (nothing is saved yet)
// ─────────────────────────────────────────────────────────────────────────────
// mode: 'add' or 'set'. Returns the shape /admin/js/import-modal.js expects.
export async function analyzeStockFile(text, mode) {
  const { headers, rows } = parseCsv(text);
  const result = {
    fatal: null, problems: [], warnings: [], summary: [],
    previewHeaders: ['Row', 'SKU', 'Item', 'Where', 'Stock'],
    previewRows: [], changeCount: 0, plan: null,
  };

  if (rows.length === 0) {
    result.fatal = 'The file is empty.';
    return result;
  }

  // Find the columns by name (case-insensitive). The product column has a
  // long name in Oboda, so accept anything mentioning "product", "code" or "barcode".
  const keys = headers.map(h => h.toLowerCase());
  const productKey  = keys.find(k => k.includes('product') || k.includes('code') || k.includes('barcode'));
  const quantityKey = keys.find(k => k.includes('quantity') || k === 'qty');
  const branchKey   = keys.find(k => k.includes('branch'));
  const locationKey = keys.find(k => k.includes('location'));

  if (!productKey || !quantityKey) {
    result.fatal = 'This doesn\'t look like an Oboda stock file — it needs a product/code column and a "Quantity" column. ' +
                   'Download the template to see the expected columns.';
    return result;
  }

  // ── Load every variant on the site (all brands — SKUs are unique site-wide) ──
  const variants  = await loadAllVariants(null);
  const bySku     = new Map(variants.map(v => [normalizeCode(v.sku), v]));
  const byBarcode = new Map(variants.filter(v => v.barcode).map(v => [normalizeCode(v.barcode), v]));
  const productNames = new Set(variants.map(v => v.productName.trim().toLowerCase()));

  // One entry per variant + channel. In Add mode, repeats are summed.
  const changes  = new Map();   // "variantId|channel" → { variant, channel, quantity, line }
  const problem = (line, message) => result.problems.push({ line, message });

  for (const row of rows) {
    const line = row._line;
    const ident = row[productKey];

    // ── Which item? ──
    if (!ident) { problem(line, 'Missing the product code or barcode.'); continue; }
    const variant = bySku.get(normalizeCode(ident)) ?? byBarcode.get(normalizeCode(ident));
    if (!variant) {
      if (productNames.has(ident.trim().toLowerCase())) {
        problem(line, `"${ident}" is a product name. Use the SKU code or barcode so we know which size and color.`);
      } else {
        problem(line, `No item on the website has the code or barcode "${ident}".`);
      }
      continue;
    }

    // ── Which pile? ──
    const branch   = branchKey   ? row[branchKey]   : '';
    const location = locationKey ? row[locationKey] : '';
    const channel  = channelFor(branch, location);
    if (!channel) {
      problem(line, `Can't tell if this is warehouse or Greenhills stock (branch "${branch || '—'}", location "${location || '—'}"). ` +
                    'The branch or location must mention "Warehouse" or "Greenhills".');
      continue;
    }

    // ── How many? ──
    const rawQty = row[quantityKey];
    const qty = Number(rawQty);
    if (rawQty === '' || !Number.isInteger(qty) || qty < 0) {
      problem(line, `Quantity "${rawQty}" must be a whole number, 0 or more.`);
      continue;
    }

    // ── Same item + pile twice in the file ──
    const key = `${variant.id}|${channel}`;
    const prev = changes.get(key);
    if (prev) {
      if (mode === 'add') {
        prev.quantity += qty;          // two deliveries of the same item → add both
        continue;
      }
      problem(line, `${variant.sku} (${CHANNEL_LABEL[channel]}) is also on row ${prev.line}. ` +
                    'For Update Stock each item can only appear once per branch.');
      continue;
    }
    changes.set(key, { variant, channel, quantity: qty, line });
  }

  // ── Build the preview and the plan ──
  const planRows = [];
  let unchanged = 0;
  for (const c of changes.values()) {
    const current = c.channel === 'online' ? c.variant.online : c.variant.store;
    const next    = mode === 'add' ? current + c.quantity : c.quantity;
    if (next === current) { unchanged++; continue; }

    planRows.push({ variant_id: c.variant.id, channel: c.channel, quantity: c.quantity });
    result.previewRows.push([
      c.line,
      c.variant.sku,
      `${c.variant.productName} — ${c.variant.color} / ${c.variant.size}`,
      CHANNEL_LABEL[c.channel],
      `${current} → ${next}`,
    ]);
  }

  result.summary = [
    { label: mode === 'add' ? 'Items getting stock' : 'Stock counts changing', value: planRows.length },
    { label: 'Unchanged', value: unchanged },
  ];
  result.changeCount = planRows.length;
  result.plan = planRows;
  return result;
}


// ─────────────────────────────────────────────────────────────────────────────
// IMPORT — step 2: save (only after the manager clicks Confirm)
// ─────────────────────────────────────────────────────────────────────────────
// Runs the database function from migration 020 — all or nothing.
export async function applyStockPlan(plan, mode) {
  const { data, error } = await supabase.rpc('admin_apply_stock_import', {
    p_mode: mode,
    p_rows: plan,
  });
  if (error) throw error;
  return `Stock saved for ${data.rows} item${data.rows === 1 ? '' : 's'}.`;
}
