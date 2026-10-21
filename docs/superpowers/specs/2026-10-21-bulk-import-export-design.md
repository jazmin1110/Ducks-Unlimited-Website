# Bulk Import/Export + Hide from Customers — Design

Date: 2026-10-21
Status: Draft, awaiting owner approval

## Why

Managers already keep products and stock in **Oboda** (their all-in-one inventory/POS).
Oboda has bulk import and export via CSV. Today, getting products and stock onto the
website means typing them in one by one in the admin panel. The goal is to mimic
Oboda's bulk import/export so a manager can move a file between Oboda and the website
instead of retyping.

Separately, managers need a quick way to hide a product from customers without
deleting it.

## Goals

1. **Product import/export** on the admin Products page, using Oboda's product template
   columns (`products_bulk_import_template.csv`).
2. **Stock import/export** on the admin Inventory page, using Oboda's stock template
   columns (`product_inventory_import_template.csv`), with two modes copied from Oboda's
   "Stocked Inventory" menu:
   - **Add Stock**: file quantities are *added* to current stock (a delivery arrived).
   - **Update Stock**: file quantities *replace* current stock (after a physical count).
3. **Preview before saving.** Every import shows a summary (new / updated / problems,
   with row numbers and reasons) and saves nothing until the manager confirms.
4. **Hide/show from customers**: a one-click toggle on each row of the admin product
   list, plus checkboxes to hide/show several products at once.

## Non-goals

- Live/automatic sync with Oboda (files only).
- Oboda's Batched and Serialized inventory (not relevant for clothing).
- Importing images. Photos are still added per product in the admin.
- Storing Oboda fields the site doesn't use: buyingPrice, suggestedRetailPrice,
  supplierName, min/max/reordering quantity, baseUnitName, inventoryType, Material,
  Weight, Finish, Country of Origin, Warranty, Quality Grade, Shape, Style.
- Deleting via import. A product or SKU missing from the file is left alone.
- Excel (.xlsx) files. CSV only, which is what Oboda's templates are.

## Anti-goals (would be a failure even if it "works")

- An import that **half-saves** (some rows written, then an error) — a bad file must
  change nothing.
- An import that **blanks out** existing data because a cell was empty.
- An import that **creates duplicate products** for something that already exists.
- Stock landing in the wrong pile (online vs Greenhills) without the manager noticing.

## Constraints

- Plain HTML/CSS/vanilla JS, Supabase, no frameworks (see CLAUDE.md).
- Code must be clearly commented — the owner is a beginner coder.
- Mobile-first, but import/export is realistically used on a laptop; it must still be
  usable on a phone.
- Admin-only. All writes must respect the existing `admin_users` security
  (see migration 016).
- Products belong to a brand (Ducks Unlimited or Rocwood). The admin top bar has a
  brand filter; the existing "new product" flow refuses to run on "All brands".

## Data model mapping (current schema)

- `products`: name, description, category, base_price, is_active, brand_id
- `variants`: product_id, color, size, sku (unique), price_override
- `inventory`: variant_id, channel (`online` | `greenhills_store`), quantity,
  low_stock_threshold — one row per variant + channel

**One schema change:** add an optional `barcode` column to `variants`
(text, unique when present). Oboda files carry barcodes and its stock template lets you
identify an item by barcode, so the site needs to store it. *(Builder's-call level; owner
was told.)*

## Part 1 — Product import/export (Products page)

### File shape

Exactly Oboda's columns, in Oboda's order:

```
name,code,buyingPrice,sellingPrice,suggestedRetailPrice,description,barcode,
supplierName,productTypeName,minimumQuantity,maximumQuantity,reorderingQuantity,
baseUnitName,inventoryType,Color,Size,Material,Weight,Finish,Country of Origin,
Warranty,Quality Grade,Shape,Style
```

Each row is **one variant** (one color + size).

| Oboda column      | Website field                                    |
|-------------------|--------------------------------------------------|
| `code`            | `variants.sku` — **the match key**               |
| `name`            | `products.name` — also used to group rows        |
| `description`     | `products.description`                           |
| `productTypeName` | `products.category`                              |
| `sellingPrice`    | price (see Prices below)                         |
| `barcode`         | `variants.barcode`                               |
| `Color`           | `variants.color`                                 |
| `Size`            | `variants.size`                                  |
| everything else   | ignored on import; written blank on export       |

Column matching is by header name (case-insensitive, trimmed), not position, so a file
with extra or reordered columns still works.

### Import rules

- **Matching:** a row whose `code` already exists as a SKU **updates** that variant and
  its product. A new `code` **creates** a variant.
- **Grouping new variants into products:** rows with the same `name` (case-insensitive,
  trimmed) become one product. If a product with that name already exists **in the
  current brand**, new variants are added to it instead of creating a duplicate.
- **Brand:** new products go to the brand selected in the admin top bar. Import is
  blocked on "All brands" with the same message the "new product" form uses.
- **Updating an existing SKU:** `name`, `description` and `productTypeName` update the
  variant's *product*; `Color`, `Size`, `barcode` update the variant; `sellingPrice` sets
  `price_override` (or clears it if equal to the product's `base_price`). A variant is
  never moved to a different product by import. If rows of the same product disagree on
  name/description/category, the first row wins and the preview shows a warning.
  *(My call.)*
- **Empty cells never erase data.** On an update, a blank cell means "leave as is".
- **Required for a new SKU:** `code`, `name`, `sellingPrice`, `Color`, `Size`, and
  `productTypeName` if it would create a new product. Missing → row is a problem.
- **Category** must be one of the site's categories (Polo, T-Shirt, Shorts, Pants,
  Others; spelling variants like "tshirt" are accepted) and is stored as the site's
  value (`polo`, `t-shirt`…). Anything else is a problem, so the product form's
  category dropdown never shows a blank. *(My call.)*
- **Prices:** a new product's `base_price` = the `sellingPrice` of its first row in the
  file. Each variant gets `price_override` only if its `sellingPrice` differs from the
  product's `base_price`; otherwise `price_override` is null. *(My call.)*
- **New products start hidden** (`is_active = false`) so the manager can add photos
  before customers see them. Updates never change visibility. *(My call — confirm with
  owner.)*
- **Problems flagged in preview** (each with row number + plain-English reason):
  missing required field, price not a number or negative, same `code` twice in one file,
  `barcode` already used by a different SKU, same `name` rows that disagree on
  category/description (first one wins, shown as a warning, not a blocker).
- **Confirm:** if there are blocking problems, the Confirm button is disabled and the
  manager fixes the file and re-uploads. No partial imports.

### Export

- Downloads `products-<brand>-<YYYY-MM-DD>.csv` in the exact Oboda column order.
- One row per variant. `sellingPrice` = the variant's effective price
  (`price_override` if set, else `base_price`). Unused Oboda columns are blank.
- Respects the top-bar brand filter ("All brands" exports everything).
- Includes hidden products (export is a backup/round-trip, not a storefront view).
- Also offer **"Download blank template"** (header row only).

## Part 2 — Stock import/export (Inventory page)

### File shape

Oboda's stock template columns:

```
Branch name,Product name or Product code or Barcode,Quantity,Inventory location
```

Two buttons: **Add Stock (import)** and **Update Stock (import)**. Same file shape;
only the meaning of Quantity differs.

### Import rules

- **Which item:** the `Product name or Product code or Barcode` value is matched to a
  variant by **SKU first, then barcode**. A product *name* is **not accepted** — it
  covers many sizes/colors — and is flagged as a problem.
- **Which pile (channel):** look at `Branch name` and `Inventory location` together:
  - contains "warehouse" (any case) → `online`
  - contains "greenhills" (any case) → `greenhills_store`
  - neither, or both → problem: "Can't tell if this is warehouse or Greenhills stock."
  *(Owner's rule: online stock = warehouse stock.)*
- **Quantity:** must be a whole number ≥ 0. Decimals (e.g. `5.5`) and negatives are
  problems.
  - Add Stock: new quantity = current + file quantity.
  - Update Stock: new quantity = file quantity.
- If a variant has no inventory row yet for that channel, one is created
  (default low-stock threshold).
- Same item + same channel appearing twice in one file: Add Stock sums them;
  Update Stock flags it as a problem.
- Stock import works across both brands (SKUs are unique site-wide), regardless of the
  top-bar brand filter.
- Preview shows each change as "SKU · channel · 12 → 32" before confirming.

### Export

- Downloads `stock-<YYYY-MM-DD>.csv` in the same 4-column shape, one row per variant per
  channel, so it can be edited and re-imported with Update Stock.
- `Branch name` written as `Warehouse` or `Greenhills`, `Inventory location` blank,
  product column = SKU.
- Respects the top-bar brand filter.

## Part 3 — Hide from customers (Products page)

- `products.is_active` already exists and the storefront already hides inactive products
  (RLS policy + queries). Today it is only changeable inside the edit form.
- Add a **Visible / Hidden toggle** in each row of the product list; one click saves.
- Add **checkboxes** on each row plus a "select all" and two actions:
  **Hide selected** / **Show selected**.
- Wording in the UI: "Visible to customers" / "Hidden", not "active/inactive".

## Technical direction (builder's latitude within these)

- **All-or-nothing saves:** do the actual writes in one Postgres function per import
  type (called via `supabase.rpc`), which runs as a single transaction and checks the
  caller is in `admin_users`. The browser parses and validates for the preview; the
  function re-checks and applies. Ship the function + `barcode` column as migration
  `020_bulk_import.sql`.
- **CSV parsing/writing:** must handle quoted fields with commas and newlines
  (descriptions often have commas) and a UTF-8 BOM (Excel adds one). A small
  hand-written parser in a shared `public/admin/js/csv.js` is fine; no new framework.
- Exported CSVs should open cleanly in Excel (include a BOM, quote fields as needed).
- UI: an import opens a panel/modal: choose file → preview table → Confirm / Cancel.
  Reuse the existing admin panel styling in `products.html` / `inventory.html`.

## Left to the builder

- Exact layout of buttons and the preview panel.
- How many preview rows to show before "and 40 more…".
- Whether to stream big files in chunks (expected size: hundreds of rows, not thousands).

## Open with owner

- Exact branch names in Oboda, to make the stock export's `Branch name` column match
  what Oboda expects when re-imported there.
- Oboda's **Update Stock** template wasn't available; assumed identical columns to
  Add Stock.
