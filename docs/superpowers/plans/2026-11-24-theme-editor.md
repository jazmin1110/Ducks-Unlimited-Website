# Theme Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `/admin/design.html` into a Shopify-style theme editor: live in-editor preview with click-to-edit, drag/hide/duplicate/undo, formatting toolbar, font dropdowns, per-section style, 10 new section types, autosave, one-transaction publish and version history.

**Architecture:** Split the storefront renderer into a pure, Node-testable template module (`section-templates.js`) and a thin Supabase loader (`sections-render.js`). The editor posts its in-memory page state to a same-origin preview iframe that renders it with the same templates. Pure editor logic (history, page operations, autosave) lives in small modules with Node tests; Publish is a single `security definer` Postgres function that also writes a snapshot to `page_versions`.

**Tech Stack:** Plain HTML/CSS/vanilla JS ES modules, Supabase (Postgres + RLS + JS client already at `/lib/supabase.js`), Vercel serverless functions in `/api`, SortableJS 1.15.6 from cdnjs, Node 26 built-in test runner (`node --test`) for pure modules. No npm, no package.json.

**Spec:** `docs/superpowers/specs/2026-11-24-theme-editor-design.md` — read it before starting any task.

## Global Constraints

- No frameworks, no TypeScript, no package.json, no build step. ES modules imported by absolute path (`/js/...`), as the codebase does today.
- Every file gets plain-language comments — the owner is a beginner coder.
- Brand palette: primary `#1B4D2E`, accent `#C9A84C`, background `#F5F0E8`, text `#1A1A1A`. Fonts: Cormorant Garamond (headings), DM Sans (body).
- **Nothing changes on the live site until Publish** — including remove, hide, reorder, restore.
- Every section belongs to one brand; editing one brand never changes the other. Shared (`brand_id` NULL) sections are not shown or created by the editor.
- Labels are plain language ("Space above", not "padding-top"). No field asks the user to type HTML.
- Max 25 sections per page. Block limits as listed per type in Task 12–14.
- Pure modules (`safe-html.js`, `section-templates.js`, `section-style.js`, `theme-fonts.js`, `admin/js/editor/history.js`, `page-state.js`, `autosave.js`) must not import Supabase, `brand.js`, or touch `window`/`document` at import time, so `node --test` can import them.
- Laptop-first editor (≥1100px three panels; 900–1100px settings as drawer; <900px tabs).
- The live database is the only database. Migrations are applied to it only after the owner says yes in chat (ask at Task 4). All schema changes are additive so the currently deployed site keeps working.
- Admin pages need a signed-in admin. For browser checks, start the `site-api` preview (`node scripts/dev-server.mjs`, port 3000) and ask the owner to sign in at `http://localhost:3000/admin/` in the browser pane. Never type a password.
- Work on branch `theme-editor`; do not push or merge without the owner's say-so.

## Review Focus

1. **Returning visitors with a day-old cached `/js/` file** (Vercel caches `/js/*` for 1 day + 7 days stale) must never see hidden or removed sections → entry imports carry a version query string (Task 2 test greps for it).
2. **Pasting from Word / Google Docs / a web page into a rich-text box** must keep only bold/italic/links/paragraphs and never keep `<script>`, `style=`, `onclick=`, or `javascript:` links (Task 1 tests).
3. **The connection drops or the tab closes mid-edit** → autosave retries, keeps changes in memory, and the browser warns before leaving (Task 5 tests + Task 8 check).
4. **Publish pressed twice, or published from two tabs/people** → button disabled while publishing, one transaction, warning if someone else published since the editor opened (Task 4 + Task 8).
5. **Publishing a page with every section removed or hidden** → blocked with "Your homepage would be empty. Add or show at least one section before publishing." (Task 5 test + Task 8).

---

### Task 1: Test runner + HTML sanitiser

**Files:**
- Create: `public/js/safe-html.js`
- Create: `tests/safe-html.test.mjs`
- Create: `tests/README.md` (two lines: how to run `node --test tests/`)

**Interfaces:**
- Produces: `sanitizeHtml(html: string): string` and `htmlToPlainText(html: string): string` from `/js/safe-html.js`.

Approach: string tokenizer, **not** DOMParser (must run in Node). Walk the input; text is HTML-escaped; tags are matched by name only and re-emitted fresh from an allowlist (`p, br, strong, b, em, i, a`) with no attributes except `a[href]`. Never copy original tag text through. `b`→`strong`, `i`→`em`. Allowed `href`: starts with `/`, `#`, `http://`, `https://`, `mailto:`, `tel:` (case-insensitive, after trimming and removing control characters); otherwise drop the `<a>` but keep its text. Close any unclosed allowed tags at the end; drop stray closing tags. `<script>`/`<style>` drop their contents too. External links get `rel="noopener"` and `target="_blank"`.

- [ ] **Step 1: Write failing tests** in `tests/safe-html.test.mjs` (`node:test` + `node:assert/strict`), importing `../public/js/safe-html.js`:
  - `sanitizeHtml('Hello<br>World')` → `'Hello<br>World'`
  - `sanitizeHtml('<p>One</p><p>Two</p>')` → unchanged
  - `sanitizeHtml('<b>x</b><i>y</i>')` → `'<strong>x</strong><em>y</em>'`
  - `sanitizeHtml('<script>alert(1)</script>Hi')` → `'Hi'`
  - `sanitizeHtml('<p style="color:red" onclick="x()">Hi</p>')` → `'<p>Hi</p>'`
  - `sanitizeHtml('<a href="javascript:alert(1)">x</a>')` → `'x'`
  - `sanitizeHtml('<a href=" JaVaScRiPt:alert(1)">x</a>')` → `'x'`
  - `sanitizeHtml('<a href="/shop.html">Shop</a>')` → `'<a href="/shop.html">Shop</a>'`
  - `sanitizeHtml('<a href="https://x.com">X</a>')` → `'<a href="https://x.com" rel="noopener" target="_blank">X</a>'`
  - `sanitizeHtml('<span class="MsoNormal"><font face="Arial">Word</font></span>')` → `'Word'`
  - `sanitizeHtml('<strong>open')` → `'<strong>open</strong>'`
  - `sanitizeHtml('a < b & c')` → `'a &lt; b &amp; c'`
  - `sanitizeHtml('<img src=x onerror=alert(1)>')` → `''`
  - `sanitizeHtml(null)` → `''`
  - `htmlToPlainText('<p>Made in</p><p>PH</p>')` → `'Made in PH'`
- [ ] **Step 2:** Run `node --test tests/` → FAIL (module not found).
- [ ] **Step 3:** Implement `public/js/safe-html.js` as above.
- [ ] **Step 4:** Run `node --test tests/` → all PASS.
- [ ] **Step 5:** Commit `feat(editor): shared HTML sanitiser with tests`.

---

### Task 2: Pure section templates + renderer split

**Files:**
- Create: `public/js/section-templates.js`
- Modify: `public/js/sections-render.js` (move `TEMPLATES`, `introHtml`, `imgHtml`, `tileHtml`, `productCardHtml`, `formatPrice`, `esc*` out; keep loaders)
- Modify: `public/home.html`, `public/preview-home.html` (import `/js/sections-render.js?v=20261124`)
- Create: `tests/section-templates.test.mjs`

**Interfaces:**
- Consumes: `sanitizeHtml` (Task 1).
- Produces:
  - `renderSectionsHtml(sections: Array<{id, section_type, settings}>, ctx: RenderCtx): string` from `/js/section-templates.js`.
  - `RenderCtx = { brandSlug: 'du'|'rw', productsByCollection: {[key]: Product[]}, storesById: {[id]: Store}, lookbooksById: {[id]: Lookbook}, theme: object|null, editor: boolean }`.
  - `TEMPLATES` (exported object: type → `(settings, ctx) => string`) so later tasks add types.
  - `renderSectionsFromData(container: Element, sections, theme, ctx): void` exported from `/js/sections-render.js` (applies theme vars + font link, sets `innerHTML`, dispatches `sections:rendered`).
  - `loadRenderContext(sections, brandId): Promise<RenderCtx-without-editor>` exported from `/js/sections-render.js` (products now; stores/lookbooks added in Task 13).

Rules for `renderSectionsHtml`: skip sections whose settings have `_hidden: true` or `_removed: true`; skip unknown types with an HTML comment (as today); a template that throws renders a comment (as today). In editor mode wrap each section's HTML in `<div data-editor-section-id="<id>" data-editor-section-name="<schema name>">…</div>`; outside editor mode no wrapper. Templates get the brand slug from `ctx.brandSlug` instead of calling `getCurrentBrand()`. Every `richtext` field is passed through `sanitizeHtml` at render time.

Renderer fix (spec "Brand ownership"): in `loadSections()`, a brand "has its own page" only if at least one of its rows has non-null `published` (preview: `draft || published`) — a brand-new never-published row must not hide the shared fallback.

- [ ] **Step 1: Write failing tests** in `tests/section-templates.test.mjs`:
  - a `richtext` section `{heading:'Hi', body:'<p>x</p><script>y</script>'}` renders `<h2` with `Hi` and contains `<p>x</p>` and not `<script>`
  - a section with `settings._hidden = true` renders `''`
  - a section with `settings._removed = true` renders `''`
  - unknown type renders `<!-- unknown section type: nope -->`
  - `editor: true` output contains `data-editor-section-id="s1"`; `editor: false` output does not contain `data-editor-section-id`
  - hero with empty `image_url` and `ctx.brandSlug = 'rw'` renders without throwing (uses `homePhoto`; import `/js/stock-photos.js` only if it is pure — it is today)
  - `grep` test: read `public/home.html` and `public/preview-home.html` as text and assert each contains `/js/sections-render.js?v=`
- [ ] **Step 2:** `node --test tests/` → new tests FAIL.
- [ ] **Step 3:** Create `section-templates.js`, slim `sections-render.js`, add the version query to both HTML entry points and to the `section-templates.js` import inside `sections-render.js`. Keep `renderPageSections(pageKey, container, options)` working with the same signature (it now calls `loadSections` → `loadRenderContext` → `renderSectionsFromData`).
- [ ] **Step 4:** `node --test tests/` → PASS. Start `site-api` preview, open `http://localhost:3000/du/` and `/rw/`; confirm both homepages look identical to production (`https://` live site) and the console has no errors.
- [ ] **Step 5:** Commit `refactor(storefront): pure section templates shared by site and editor`.

---

### Task 3: Per-section style + theme fonts and button shape

**Files:**
- Create: `public/js/section-style.js`, `public/js/theme-fonts.js`
- Modify: `public/js/section-schemas.js` (merge `STYLE_FIELDS` into every schema; add `allowFullWidth: true` to `hero`, `image-banner`, `slideshow`, `image-gallery`, `video`; remove HTML instructions from labels: hero headline → "Headline", editorial/richtext body → "Text")
- Modify: `public/js/section-templates.js` (wrap each section's output with style), `public/js/sections-render.js` (`applyThemeVars` uses `themeCssVars`; inject font link)
- Modify: `public/css/home.css` (style classes), `public/css/style.css` (`.btn` uses `var(--btn-radius, var(--radius))`)
- Create: `tests/section-style.test.mjs`, `tests/theme-fonts.test.mjs`

**Interfaces:**
- Produces from `/js/section-style.js`:
  - `STYLE_FIELDS` — settings: `space_above` and `space_below` (select: `none|sm|md|lg`, default `md`, labels "None/Small/Medium/Large"), `background` (select: `page|white|brand|accent|custom`, default `page`, labels "Page colour/White/Brand colour/Accent colour/Custom colour"), `background_custom` (color, default `#FFFFFF`, shown only when background = custom), `width` (select `normal|full`, default `normal`, only for schemas with `allowFullWidth`).
  - `sectionWrapperAttrs(settings, theme): { className: string, style: string }` — classes `sec sec--above-<v> sec--below-<v> sec--bg-<v>` plus `sec--dark` when the resolved background is dark, `sec--full` for full width; `style` sets `--sec-bg:<hex>` only for `custom`.
  - `isDarkColor(hex: string): boolean` — relative luminance < 0.4; invalid hex → `false`.
- Produces from `/js/theme-fonts.js`:
  - `HEADING_FONTS = ['Cormorant Garamond','Playfair Display','EB Garamond','Libre Baskerville','Lora','DM Serif Display']`, `BODY_FONTS = ['DM Sans','Inter','Lato','Work Sans','Nunito Sans','Karla']`.
  - `fontStylesheetUrl(theme): string|null` — Google Fonts css2 URL with `display=swap` for any chosen font that is not a default; `null` when both are defaults or unknown (unknown names are ignored, never put in a URL).
  - `themeCssVars(theme): {[cssVar]: string}` — the existing 6 variables plus `--btn-radius`: `square`→`0`, `rounded`→`6px`, `pill`→`999px`.
- `buildDefaultSettings(type)` now includes the style defaults.

Spacing CSS: `sm/md/lg` = `var(--space-lg)/var(--space-2xl)/var(--space-3xl)` on desktop; one step smaller under 768px. `sec--dark` sets light text and switches `.btn-outline-dark` to light.

- [ ] **Step 1: Failing tests:** `isDarkColor('#1B4D2E') === true`, `isDarkColor('#F5F0E8') === false`, `isDarkColor('nope') === false`; `sectionWrapperAttrs({space_above:'lg', background:'brand'}, {brand_color:'#1B4D2E'}).className` includes `sec--above-lg` and `sec--dark`; custom bg `#000000` → style contains `--sec-bg:#000000` and class `sec--dark`; missing settings → `sec--above-md sec--below-md sec--bg-page`; `fontStylesheetUrl({heading_font:'Lora', body_font:'DM Sans'})` contains `family=Lora` and `display=swap` and not `DM+Sans`; `fontStylesheetUrl({heading_font:'<script>'})` is `null`; `themeCssVars({button_shape:'pill'})['--btn-radius'] === '999px'`; every schema in `SECTION_SCHEMAS` has a `space_above` setting; `buildDefaultSettings('hero').background === 'page'`.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run → PASS. Browser: `/du/` unchanged by default (all sections `md`/`page`); temporarily set a section's draft background to `brand` and view `/preview-home.html?preview=1` signed in → green band with light text. Revert the draft.
- [ ] **Step 5:** Commit `feat(storefront): per-section spacing/background and theme fonts`.

---

### Task 4: Database — draft order, versions, publish function, newsletter table

**Files:**
- Create: `database/migrations/034_theme_editor.sql`

**Interfaces:**
- Produces:
  - `page_sections.draft_position integer null` (null = order unchanged).
  - Table `page_versions (id uuid pk default gen_random_uuid(), page_key text not null, brand_id uuid not null references brands(id) on delete cascade, snapshot jsonb not null, published_at timestamptz not null default now(), published_by uuid, published_by_email text)`, index on `(page_key, brand_id, published_at desc)`, RLS: admins (`is_admin()`) select only; no insert/update/delete policies (only the function writes).
  - Function `publish_page(p_page_key text, p_brand_id uuid) returns uuid` (the new version id), `security definer`, `set search_path = public`. Raises `'not allowed'` unless `is_admin()`. In one transaction, for rows of that page + brand with `deleted_at is null`:
    1. rows whose `draft->>'_removed' = 'true'` → `deleted_at = now(), draft = null, draft_position = null`;
    2. other rows with `draft is not null` → `published = draft - '_removed'`, `draft = null`;
    3. rows with `draft_position is not null` → `position = draft_position, draft_position = null`;
    4. `theme_settings` for the brand: if `draft is not null` → `published = draft, draft = null`;
    5. insert into `page_versions` a snapshot `{ "sections": [ {id, section_type, position, settings: published} ... ordered by position, only non-deleted rows with published not null ], "theme": <published theme or null> }`, with `auth.uid()` and the JWT email;
    6. `perform log_admin_change('page_sections', <new version id>, 'publish', jsonb_build_object('page', p_page_key, 'brand_id', p_brand_id))`.
    `grant execute on function publish_page to authenticated`.
  - Table `newsletter_signups (id uuid pk default gen_random_uuid(), email text not null, brand_id uuid references brands(id), consented_at timestamptz not null, created_at timestamptz not null default now(), unique (lower(email), brand_id))` — unique via a unique index on `(lower(email), brand_id)`. RLS on; admins select; **no** anon/authenticated insert (the `/api` function uses the service role).
  - `theme_settings` JSON gains `button_shape` (`square|rounded|pill`, default `rounded`) — no column change.

- [ ] **Step 1:** Write the migration following the style and comments of `015_page_sections.sql`, `016_lock_cms_to_admins.sql`, `033_*.sql` (idempotent: `if not exists`, `create or replace`, `drop policy if exists`).
- [ ] **Step 2: Ask the owner in chat** to approve applying migration 034 to the live Ducks Unlimited database, explaining it only adds things (a column, two tables, one function) and the current site keeps working. Wait for a yes.
- [ ] **Step 3:** Apply via the Supabase MCP `apply_migration` (project `qrtfgqscpaghtxnhtoyp`).
- [ ] **Step 4: Verify** with `execute_sql`:
  - `select to_regclass('public.page_versions'), to_regclass('public.newsletter_signups')` → both non-null.
  - `select column_name from information_schema.columns where table_name='page_sections' and column_name='draft_position'` → 1 row.
  - `select count(*) from page_sections where draft is not null or draft_position is not null` → 0 (so nothing is waiting to publish yet).
  - Through `execute_sql` (no signed-in admin, so `auth.uid()` is null), `select publish_page('home', (select id from brands where slug='du'))` → error `not allowed` (proves the admin check; nothing changed).
  - `get_advisors` (security) → no new warnings for the new tables/function.
- [ ] **Step 5:** Commit `feat(db): page versions, transactional publish, newsletter signups (034)`.

---

### Task 5: Pure editor logic — history, page operations, autosave

**Files:**
- Create: `public/admin/js/editor/history.js`, `public/admin/js/editor/page-state.js`, `public/admin/js/editor/autosave.js`
- Create: `tests/editor-history.test.mjs`, `tests/editor-page-state.test.mjs`, `tests/editor-autosave.test.mjs`

**Interfaces:**
- Editor section shape used everywhere from here on: `EditorSection = { id: string, section_type: string, position: number, settings: object, isNew: boolean }` (`settings` = draft || published; `_hidden` / `_removed` live inside `settings`). Page state: `EditorPage = { sections: EditorSection[], theme: object }`.
- `history.js`: `createHistory({ limit = 50, groupMs = 600 } = {})` → `{ record(page: EditorPage, groupKey?: string): void, undo(): EditorPage|null, redo(): EditorPage|null, canUndo(): boolean, canRedo(): boolean, reset(page): void }`. `record` stores a deep clone; two records with the same `groupKey` within `groupMs` merge into one step; a new record clears the redo stack. `now` is injectable via `createHistory({ now: () => number })` for tests.
- `page-state.js` (all return a **new** `EditorPage`, never mutate):
  - `moveSection(page, fromIndex, toIndex)` — reorders and restamps `position` as `(i+1)*10`.
  - `duplicateSection(page, id, newId)` — deep copy of settings (block ids regenerated with prefix `blk_`), inserted right after, `isNew: true`.
  - `setHidden(page, id, hidden: boolean)`; `markRemoved(page, id)`; `unmarkRemoved(page, id)`.
  - `addSection(page, section: EditorSection)` — throws `Error('A page can have at most 25 sections.')` when 25 non-removed sections exist.
  - `visibleSections(page): EditorSection[]` — not hidden, not removed.
  - `canPublish(page): { ok: boolean, message?: string }` — `ok:false` with message `'Your homepage would be empty. Add or show at least one section before publishing.'` when `visibleSections` is empty.
  - `restoreSnapshot(page, snapshot, makeId: () => string)` — returns the page the editor should show: for each snapshot section whose `id` is a current, non-removed section → that section with snapshot settings/position; for snapshot sections whose row no longer exists in `page` → new section `{ id: makeId(), isNew: true }` with snapshot settings; current sections absent from the snapshot → `_removed: true`. Theme = snapshot theme (or current theme if snapshot theme is null).
- `autosave.js`: `createAutosave({ save: () => Promise<void>, delayMs = 2000, retryMs = [2000, 5000, 15000, 30000], onStatus: (s: 'idle'|'saving'|'saved'|'error') => void, setTimer = setTimeout, clearTimer = clearTimeout })` → `{ schedule(): void, flushNow(): Promise<void>, hasPending(): boolean }`. Debounces; on failure reports `'error'` and retries using the next delay (last value repeats); a `schedule()` during a save queues one more save after it finishes.

- [ ] **Step 1: Failing tests:**
  - history: record A, B, C → undo → B, undo → A, redo → B; record D after undo clears redo (`canRedo() === false`); typing grouped: record(x,'f1') at t=0 and t=300 → one undo step; at t=0 and t=900 → two steps; limit 3 keeps only last 3; mutating a returned page does not change history.
  - page-state: `moveSection` of 3 sections 0→2 gives order [b,c,a] with positions 10,20,30 and original page unchanged; `duplicateSection` places copy at index+1 with different block ids; `addSection` on 25 → throws the exact message; `canPublish` with all hidden → exact message; `restoreSnapshot` where snapshot contains a deleted row → new id from `makeId`, `isNew: true`; current section missing from snapshot → `_removed: true`.
  - autosave (fake timers via injected `setTimer`): three `schedule()` calls within 2s → `save` called once; `save` rejecting once → statuses `saving, error, saving, saved` and a second call after 2000ms; `hasPending()` true between schedule and successful save.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(editor): undo history, page operations and autosave logic`.

---

### Task 6: Three-panel layout + live preview bridge

**Files:**
- Modify: `public/admin/design.html` (new layout markup + CSS; top bar: brand/page title, undo, redo, device toggle, save status, History, Publish)
- Create: `public/admin/js/editor/preview-bridge.js` (editor side)
- Create: `public/js/editor-preview.js` (iframe side)
- Modify: `public/preview-home.html` (when `?editor=1`: load `editor-preview.js` instead of `renderPageSections`; hide the preview banner)
- Modify: `public/admin/js/design.js` (controller: load into `EditorPage`, mount bridge; keep existing form rendering for now)

**Interfaces:**
- Consumes: `renderSectionsFromData`, `loadRenderContext` (Task 2); `EditorPage` (Task 5).
- Messages (all `postMessage(msg, location.origin)`; receivers ignore `event.origin !== location.origin` and unknown `type`s):
  - preview → editor `{ type: 'du-editor:ready' }` once loaded.
  - editor → preview `{ type: 'du-editor:render', page: EditorPage, brandSlug, brandId, selectedId }`.
  - editor → preview `{ type: 'du-editor:scroll-to', id }`.
  - preview → editor `{ type: 'du-editor:select', id }`.
- `createPreviewBridge(iframe: HTMLIFrameElement, { onSelect(id), onReady() })` → `{ render(page, { brandSlug, brandId, selectedId }): void /* debounced 150ms */, scrollTo(id): void, setDevice('phone'|'desktop'): void }`. Phone sets iframe width `390px` centred with a device-frame class; desktop `100%`.
- `editor-preview.js`: keeps a cache of render context by collection key; re-fetches products only when the set of `(collection, max_products)` changes. In editor mode: outline on hover with a label showing `data-editor-section-name`; click → select message; clicks on links/buttons/forms inside the preview are `preventDefault`ed; the selected section has a persistent outline.

- [ ] **Step 1:** Build the layout per spec "Layout (laptop, ≥ 1100px)" (260px list, flexible preview, 340px settings). Panels scroll independently; the top bar is sticky.
- [ ] **Step 2:** Implement the bridge and iframe script.
- [ ] **Step 3: Browser check** (owner signed in, `site-api` on :3000, `/admin/design.html`): preview shows the Ducks homepage; typing in the hero headline updates the preview within ~0.5s without saving; clicking the editorial block in the preview selects it in the list and opens its form; selecting "Tiles" in the list scrolls the preview to it; phone toggle shows a 390px-wide page; switching the admin brand filter to Rocwood shows the Rocwood page. Console: no errors on either frame.
- [ ] **Step 4:** Commit `feat(editor): three-panel layout with live click-to-edit preview`.

---

### Task 7: Section list — drag, hide, duplicate, remove, add picker, undo/redo

**Files:**
- Modify: `public/admin/design.html` (SortableJS script tag: `https://cdnjs.cloudflare.com/ajax/libs/Sortable/1.15.6/Sortable.min.js` with SRI `integrity` + `crossorigin="anonymous"` — confirm that exact version exists on cdnjs and copy its SRI hash from there; list row markup; add-section picker dialog)
- Modify: `public/admin/js/design.js`
- Create: `public/admin/images/sections/<type>.png` — one small thumbnail (≈320×180) per section type for the picker (simple static screenshots of each type rendered in the preview)

**Interfaces:**
- Consumes: `createHistory`, `moveSection`, `duplicateSection`, `setHidden`, `markRemoved`, `unmarkRemoved`, `addSection` (Task 5); `listSectionTypes`, `buildDefaultSettings` (existing).

Behaviour: drag only by the `⠿` handle; row shows name + headline hint (existing `sectionHint`), `👁` toggle (hidden rows greyed, "Hidden" tag), `⋯` menu with Duplicate / Move up / Move down / Remove. Remove shows a toast "Section removed. **Undo**" for 8s (Undo = `unmarkRemoved`). Removed sections disappear from the list. Picker: `<dialog>` grid of cards (thumbnail, name, description), adding inserts after the selected section (or at the end) and selects it. Undo/redo buttons + `Ctrl/Cmd+Z`, `Shift+Ctrl/Cmd+Z`, `Ctrl+Y`; shortcuts ignored while focus is in a text field **unless** that field is in the settings panel (browser-native undo handles in-field typing first). Every change → `history.record(...)`, `bridge.render(...)`, `autosave.schedule()` (autosave wired in Task 8; call a no-op until then). Remove the "Both brands" label and any code path that creates `brand_id: null` rows.

- [ ] **Step 1:** Implement.
- [ ] **Step 2: Browser check:** drag Tiles above Hero → preview order changes, live `/du/` (open in another tab, signed out or private) unchanged; hide a section → greyed + gone from preview; duplicate → copy appears below; remove → toast, Undo brings it back; Ctrl+Z ×3 walks back the drag, hide and duplicate; add "Rich text" via picker → appears after selected; 26th section → message from `addSection`.
- [ ] **Step 3:** Commit `feat(editor): drag, hide, duplicate, remove, add picker, undo/redo`.

---

### Task 8: Autosave drafts + one-click transactional Publish

**Files:**
- Modify: `public/admin/js/design.js`, `public/admin/design.html` (remove Save Draft button; status text element)

**Interfaces:**
- Consumes: `createAutosave`, `canPublish` (Task 5); `publish_page` RPC + `page_versions` (Task 4).
- `saveDraft(): Promise<void>` (the `save` passed to autosave): for every dirty section — `isNew` → `insert` (`page_key`, `brand_id` = current brand, `section_type`, `position` = a high number e.g. 100000 + position so it can't collide, `draft_position` = position, `published = null`, `draft` = settings) then set `isNew:false`; existing → `update({ draft: settings, draft_position: position })`. Theme dirty → `upsert` `theme_settings.draft`. Throws on any error (autosave retries).
- Status texts: `'Saving…'`, `'Saved ✓'`, `"Couldn't save — retrying"`; plus a separate badge `'Unpublished changes'` whenever any section or the theme differs from published (any draft / draft_position / new row).
- Publish flow: run `canPublish(page)` → show its message and stop if not ok; `await autosave.flushNow()`; read the newest `page_versions.published_at` for this page+brand; if newer than the one noted at load → `confirm('Someone else published this page at <time>. Publishing now will replace their changes. Publish anyway?')`; then `confirm('Make these changes live on the <Brand name> homepage?')`; disable Publish; `supabase.rpc('publish_page', { p_page_key: 'home', p_brand_id })`; on success reload state from DB, `history.reset(page)`, status `'Published ✓ <time>'`, note the new version time; on error `alert('Publish failed: ' + message)` and nothing else changes. Re-enable the button in `finally`.
- `beforeunload` warning while `autosave.hasPending()` or a save is failing.

- [ ] **Step 1:** Implement.
- [ ] **Step 2: Browser check:** edit text → "Saving…" then "Saved ✓" within ~3s, reload page → edit still there, live `/du/` unchanged; DevTools offline → edit → "Couldn't save — retrying", back online → "Saved ✓"; close tab while offline-pending → browser warning; Publish → confirm → live `/du/` shows the change after refresh; `select count(*) from page_versions` increased by 1; a removed section is gone live and has `deleted_at`; double-clicking Publish sends one RPC (Network panel). Hide every section → Publish shows the empty-page message.
- [ ] **Step 3:** Commit `feat(editor): autosave drafts and transactional publish`.

---

### Task 9: Rich-text box with formatting toolbar

**Files:**
- Create: `public/admin/js/editor/richtext.js`
- Modify: `public/admin/js/design.js` (`fieldHtml` / form wiring for `type: 'richtext'`), `public/admin/design.html` (toolbar CSS)

**Interfaces:**
- Consumes: `sanitizeHtml` (Task 1).
- `mountRichText(host: Element, { value: string, onChange(html: string): void, singleLine?: boolean }) → { setValue(html): void, destroy(): void }`. Toolbar buttons (with `aria-label` and `title`): Bold, Italic, Link, New line, Clear formatting. Enter → new paragraph (`singleLine` fields such as hero headline: Enter → `<br>`), Shift+Enter → `<br>`. Paste → read `text/html` (fallback `text/plain`), `sanitizeHtml`, insert. Link button opens a small popover: a text box for the address plus quick picks `Shop` `/shop.html`, `Men` `/shop.html?category=men`, `Women` `/shop.html?category=women`, `Stores` `/stores.html`, `Track order` `/track-order.html`, `Size guide` `/size-guide.html`, and "Remove link". `onChange` always receives sanitised HTML.
- Hero `headline` gets `singleLine: true`.

- [ ] **Step 1:** Implement (use `document.execCommand` for bold/italic/link — deprecated but universally supported and the simplest beginner-readable option; note that in a comment).
- [ ] **Step 2: Browser check:** select a word in the hero headline → Bold → preview shows it bold; paste a paragraph copied from a Google Doc with colours and fonts → only text + bold/italic remain; add a link via "Shop" quick pick → preview link goes to `/shop.html` (navigation blocked in editor); existing hero headline with `<br>` loads with the line break intact; no label anywhere mentions `<br>` or `<p>`.
- [ ] **Step 3:** Commit `feat(editor): rich-text formatting toolbar`.

---

### Task 10: Theme form — font dropdowns, colours, button shape

**Files:**
- Modify: `public/admin/js/design.js` (`THEME_FIELDS`, theme form), `public/admin/design.html` (font list CSS)

**Interfaces:**
- Consumes: `HEADING_FONTS`, `BODY_FONTS`, `fontStylesheetUrl` (Task 3).
- Theme form: four colour pickers each with "Reset to brand default" (defaults: Ducks Unlimited `#1B4D2E/#C9A84C/#F5F0E8/#1A1A1A`; Rocwood: its current published theme values or, if none, these); two font dropdowns rendered as an accessible listbox where each option is drawn in its own font (load all 12 fonts once in the admin page via one Google Fonts link); button shape as three visual radio buttons (Square / Rounded / Pill). Changes go through the same history/preview/autosave path as sections.

- [ ] **Step 1:** Implement.
- [ ] **Step 2: Browser check:** choose "Playfair Display" for headings → preview headings change; publish → live `/du/` loads the Playfair stylesheet (Network) and shows it; pick Pill → preview buttons are pill-shaped; Reset brand colour → `#1B4D2E`; the free-text font fields are gone.
- [ ] **Step 3:** Commit `feat(editor): font dropdowns, colour resets and button shape`.

---

### Task 11: Version history panel — preview and restore

**Files:**
- Create: `public/admin/js/editor/versions.js`
- Modify: `public/admin/js/design.js`, `public/admin/design.html`

**Interfaces:**
- Consumes: `restoreSnapshot` (Task 5); bridge `render` (Task 6); `page_versions` (Task 4).
- `openVersionsPanel({ pageKey, brandId, onPreview(snapshot), onRestore(snapshot), onClose() })` — side panel listing versions newest first: `"24 Nov 2026, 3:12 pm · staff@…"`, the newest labelled "Live now". "Preview" renders that snapshot in the preview iframe (a banner in the editor says "Previewing a saved version — Back to your draft"); "Restore" → `confirm('Replace your current draft with this version? It goes live only when you press Publish.')` → `restoreSnapshot` → `history.record` (one undo step) → autosave.

- [ ] **Step 1:** Implement.
- [ ] **Step 2: Browser check:** publish twice with different hero text; open History → two entries; Preview the older → preview shows old text, Back returns to draft; Restore older → editor shows old text, "Unpublished changes" badge on, live `/du/` still shows newer text until Publish; Ctrl+Z undoes the restore. Restore a version that contained a since-removed section → it comes back as a new section, and the live page is unchanged until Publish.
- [ ] **Step 3:** Commit `feat(editor): version history with preview and restore`.

---

### Task 12: New content sections and block editing

**Files:**
- Modify: `public/js/section-schemas.js`, `public/js/section-templates.js`, `public/css/home.css`, `public/admin/js/design.js` (block list: drag handle via SortableJS, add/remove, per-type `max`)
- Modify: `tests/section-templates.test.mjs`

**Interfaces:**
- Consumes: `TEMPLATES` (Task 2), `STYLE_FIELDS` (Task 3).
- Adds types (schemas with `name`, plain-language `description`, `settings`, `blocks: { name, max, settings, defaults }` as existing schemas do):
  - `image-banner` — `image_url`, `image_alt`, `heading`, `text` (richtext), `cta_text`, `cta_link`, `text_position` (`left|center`, default `center`), `height` (`short|medium|tall`, default `medium`). `allowFullWidth`.
  - `slideshow` — `autoplay` (toggle, default true), `seconds` (range 3–10, default 5); blocks "Slide" max 6: `image_url`, `image_alt`, `heading`, `text`, `cta_text`, `cta_link`. Markup: slides stacked, first visible; a tiny inline script in the template output is **not** allowed — rotation is done by `/js/slideshow.js` (new, loaded by `home.html` and `preview-home.html`) that finds `[data-slideshow]`, respects `prefers-reduced-motion`, has prev/next buttons and dots. Without JS the first slide shows. `allowFullWidth`.
  - `multicolumn` — `heading`, `columns` (`2|3|4`, default `3`); blocks "Column" max 8: `image_url`, `image_alt`, `heading`, `text` (richtext), `link`. Phone: 1 column (2 when `columns` = 4).
  - `testimonials` — `heading`; blocks "Quote" max 6: `quote` (textarea), `name`, `place`.
  - `image-gallery` — `heading`, `columns` (`3|4`, default `4`); blocks "Image" max 12: `image_url`, `image_alt`, `link`. Phone: 2 columns. `allowFullWidth`.
  - `faq` — `heading`; blocks "Question" max 20: `question`, `answer` (richtext). Renders `<details><summary>`.
- Block UI shows "N of max" and disables Add at the max.

- [ ] **Step 1: Failing tests:** each new type renders with its defaults without throwing and contains its heading; `faq` with one block contains `<details` and `<summary>`; `slideshow` with 2 blocks contains `data-slideshow` and two slides with only the first lacking `hidden`; `multicolumn` with `columns: '4'` contains class `multicolumn--4`; a block text containing `<script>` is not in the output; `listSectionTypes()` includes all 11 previous+new types so far.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement schemas, templates, CSS (mobile-first, brand classes, reuse `.btn` variants), block UI, thumbnails for the picker. **Step 4:** Run → PASS.
- [ ] **Step 5: Browser check:** add one of each new type in the editor, fill a few fields, check desktop and phone preview; nothing overflows horizontally at 390px; slideshow rotates and stops on hover; FAQ opens/closes with JS disabled.
- [ ] **Step 6:** Commit `feat(sections): image banner, slideshow, multicolumn, testimonials, gallery, FAQ`.

---

### Task 13: Data-backed sections — store visit, lookbook feature, YouTube video

**Files:**
- Modify: `public/js/section-schemas.js`, `public/js/section-templates.js`, `public/js/sections-render.js` (`loadRenderContext` loads referenced stores/lookbooks), `public/js/editor-preview.js` (same), `public/admin/js/design.js` (new setting type `ref`), `public/css/home.css`, `vercel.json` (CSP `frame-src` add `https://www.youtube-nocookie.com`)
- Create: `public/js/video-embed.js` (click-to-load player)
- Modify: `tests/section-templates.test.mjs`

**Interfaces:**
- New setting type `ref` with `source: 'stores' | 'lookbooks'`: admin renders a `<select>` filled from `stores` (`is_active = true`, label = `name`) or `lookbooks` (`published_at is not null`, label = `title`).
- `store-visit` — `heading`, `store_id` (ref stores), `show_map` (toggle, default true). Renders name, address, city, phone, hours table from `hours` JSON, and when `show_map` and `lat/lng` exist a Google Maps embed iframe (`https://www.google.com/maps?q=<lat>,<lng>&output=embed`, `loading="lazy"`); missing store → section renders `''`.
- `lookbook-feature` — `lookbook_id` (ref lookbooks), `heading` (default: lookbook title), `cta_text` (default "View the lookbook"). Renders `hero_image`, title/subtitle, link to `/lookbooks/view.html?slug=<slug>`; missing/unpublished lookbook → `''`.
- `video` — `youtube_url`, `cover_image_url`, `heading`. Exported `youtubeId(url: string): string|null` in `section-templates.js` accepting `youtube.com/watch?v=`, `youtu.be/`, `youtube.com/shorts/`, `youtube.com/embed/`; anything else → `null` → section renders `''` (and the admin field shows "That doesn't look like a YouTube link"). Renders a cover (custom image, else `https://i.ytimg.com/vi/<id>/hqdefault.jpg`) with a play button; `/js/video-embed.js` swaps in `https://www.youtube-nocookie.com/embed/<id>?autoplay=1` on click. Without JS the cover links to the YouTube page. `allowFullWidth`.
- `RenderCtx.storesById` / `lookbooksById` filled only for ids referenced by the page's sections.

- [ ] **Step 1: Failing tests:** `youtubeId('https://youtu.be/dQw4w9WgXcQ') === 'dQw4w9WgXcQ'`, `youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3') === 'dQw4w9WgXcQ'`, `youtubeId('https://vimeo.com/1') === null`, `youtubeId('javascript:alert(1)') === null`; `video` with a valid URL contains `data-video-id="dQw4w9WgXcQ"` and no `<iframe`; `store-visit` with a ctx store renders its address and, with `show_map:false`, no `<iframe`; `store-visit` with unknown id renders `''`; `lookbook-feature` renders `/lookbooks/view.html?slug=holiday-2026` for a ctx lookbook with that slug.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5: Browser check:** add each in the editor; Greenhills store shows with map; a lookbook feature links correctly; a YouTube link plays only after clicking (Network: no youtube request before the click); console shows no CSP errors locally (check `scripts/dev-server.mjs` applies `vercel.json` headers; if it doesn't, note that CSP is verified on the Vercel preview deploy instead).
- [ ] **Step 6:** Commit `feat(sections): store visit, lookbook feature, click-to-play YouTube video`.

---

### Task 14: Email sign-up section, API and admin list

**Files:**
- Create: `api/newsletter-signup.js`
- Modify: `public/js/section-schemas.js`, `public/js/section-templates.js`, `public/css/home.css`, `public/home.html` (show `?subscribed=1` / `?subscribe_error=1` message), `public/admin/customers.html` (new "Email sign-ups" tab/section with list + CSV export using `/admin/js/csv.js`)
- Modify: `tests/section-templates.test.mjs`
- Create: `tests/newsletter-signup.test.mjs`

**Interfaces:**
- `email-signup` schema — `heading` (default "Stay in touch"), `text`, `button_label` (default "Sign up"), `success_message` (default "Thanks — you're on the list."). Template: `<form method="post" action="/api/newsletter-signup">` with `email` (type email, required), hidden `brand` (= `ctx.brandSlug`), hidden `return_to` (`/<brandSlug>/`), a honeypot input `website` hidden from people (`aria-hidden`, off-screen, `tabindex="-1"`, `autocomplete="off"`), and the consent line exactly: `By signing up you agree to receive emails from <Brand name>. See our <a href="/customer-service/privacy.html">Privacy Policy</a>.` (`Ducks Unlimited` / `Rocwood`). Enhancement script (optional) may submit via `fetch` and show `success_message` inline.
- `api/newsletter-signup.js` default export `handler(req, res)` (same style as `api/track-order.js`): POST only (405 otherwise); accepts form-encoded or JSON; `allowRequest(req, res, { limit: 5, windowMs: 3_600_000, key: 'newsletter' })`; honeypot filled → respond as success without saving; validate email with exported `isValidEmail(s: string): boolean` (trimmed, ≤254 chars, one `@`, a dot in the domain, no spaces); brand slug must be `du` or `rw` → look up `brands.id`; insert via `supabaseAdmin` with `consented_at = now()`, on unique conflict do nothing; form posts → `303` redirect to `return_to` (only if it starts with `/` and not `//`, else `/`) + `?subscribed=1` or `?subscribe_error=1`; JSON posts → `{ ok: true }` / `{ ok: false, error }` with 400.
- Admin list: email, brand, signed up date, newest first; "Export CSV" downloads `email,brand,signed_up`.

- [ ] **Step 1: Failing tests:** `isValidEmail('a@b.co')` true; `'a@b'`, `'a b@c.com'`, `''`, 255-char address → false; `email-signup` template contains `action="/api/newsletter-signup"`, the exact consent sentence for `brandSlug:'rw'` with "Rocwood", and an input named `website`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5: Browser + API check** (`site-api` on :3000): submit the form with JS off → redirected back with the thank-you message, row in `newsletter_signups`; same email again → no duplicate row; honeypot filled via DevTools → success shown, no row; 6th submit within an hour → 429; admin Customers page lists the row and CSV downloads. Delete the test rows afterwards (ask the owner first, naming the rows).
- [ ] **Step 6:** Commit `feat(sections): email sign-up with consent, bot guard and admin export`.

---

### Task 15: Smaller screens, nav rename, final pass

**Files:**
- Modify: `public/admin/design.html` (900–1100px: settings panel as a right drawer over the preview, opened when a section is selected; <900px: tab bar Sections · Settings · Preview, one panel visible, drag handles hidden, ↑/↓ shown in rows)
- Modify: `public/components/admin-nav.html` ("Homepage builder" → "Design"; "Site text" → "Site text (old)" with `title="Being replaced by Design — announcement bar and shop heading still live here"`)
- Modify: `public/home.html` fallback comment noting the known no-JS gap (spec Non-goals) — no behaviour change

- [ ] **Step 1:** Implement.
- [ ] **Step 2: Browser check** at 1280, 1000 and 390px widths (`resize_window`): every panel reachable; at 390px change the hero photo and a headline, publish, and confirm live. Run `node --test tests/` → all PASS.
- [ ] **Step 3: Success walk-through from the spec** ("Success looks like"), in order, on Ducks Unlimited, then spot-check Rocwood is untouched. Note anything that needed explaining.
- [ ] **Step 4:** Commit `feat(editor): drawer and phone modes; rename Design in admin nav`.
- [ ] **Step 5:** Tell the owner the branch is ready; deploying (merge to `main` → Vercel) is their call.
