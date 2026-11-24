# Theme Editor — Design

Date: 2026-11-24
Status: Draft, awaiting owner approval
Step 1 of 5 in the admin handover plan (theme editor → every page editable →
settings screen → admin redesign → Shopify features worth copying).

## Why

The owner will hand the website over to someone who does not code. That
person should be able to **redesign each brand's homepage** — change photos,
words, fonts, colours, section order, add new kinds of sections — without
touching code and without breaking how the site looks on a phone (most PH
shoppers are on phones).

The owner stays the technical owner (fixes payments, database, deploys). The
new person runs the site day to day.

The model to copy is **Shopify's theme editor**: a stack of sections, each
with a settings form, a live preview in the middle, nothing goes live until
Publish. Wix's drag-anywhere canvas was ruled out because non-designers break
phone layouts with it.

## What exists today (build on this, don't rewrite)

- `/admin/design.html` + `/admin/js/design.js` — the "Homepage builder".
  Left: section list with ↑/↓ reorder, delete, add. Right: a settings form
  **generated from** `/js/section-schemas.js`. Save Draft + Publish. A
  "Theme" form with 4 colours and 2 fonts (fonts typed by name).
  Preview opens `/preview-home.html` in a **new tab**.
- `/js/section-schemas.js` — declarative schemas for 5 section types:
  `hero`, `category-tiles` (with blocks), `product-rail`, `editorial-block`,
  `richtext`. Setting types: text, textarea, richtext, image, color, url,
  number, range, select, toggle.
- `/js/sections-render.js` — storefront renderer; one template function per
  type returning an HTML string. Used by `/home.html` (served at `/du/` and
  `/rw/`) and `/preview-home.html`. Preview mode (`?preview=1` + admin
  session) reads `draft || published`.
- Tables (migration 015): `page_sections` (page_key, brand_id, section_type,
  position, published jsonb, draft jsonb, deleted_at) and `theme_settings`
  (one row per brand, published/draft). Admin-only writes via `is_admin()`
  (migration 016). `admin_log` table exists (migration 033).
- Two brands (Ducks Unlimited, Rocwood); the admin-nav brand filter picks
  which brand's homepage is being edited.
- CSP already allows same-origin iframes (`frame-ancestors 'self'`), scripts
  from cdnjs/jsdelivr, and Google Fonts.

Problems with today's editor this design fixes:
- No preview inside the editor; you save, switch tabs, refresh.
- Formatting means typing `<br>` and `<p>` by hand.
- Fonts are free-typed names (typo = broken font).
- No hide, duplicate, undo, or per-section spacing/background.
- **Delete goes live immediately** (sets `deleted_at`), unlike every other
  change, which waits for Publish.
- Publish is a loop of separate updates — a failure halfway leaves the live
  site half-published. No history; a bad publish can't be rolled back.

## Goals

1. **Live preview inside the editor.** The real homepage renders in the
   centre panel and updates as you type, from unsaved changes, using the same
   renderer the live site uses.
2. **Click-to-edit.** Click a section in the preview → it's selected in the
   list and its settings open. Hovering a section in the preview outlines it.
3. **Phone / desktop toggle** above the preview (phone = 390px wide frame).
4. **Section list operations:** drag to reorder, hide/show (eye), duplicate,
   remove, add. Max 25 sections per page.
5. **Undo / redo** (buttons + Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z) for every change
   in the session.
6. **Formatting toolbar** on rich-text fields: Bold, Italic, Link, new line,
   clear formatting. No HTML typing anywhere.
7. **Theme:** font dropdowns (curated list, each option shown in its own
   font), the 4 colours, and button shape (square / rounded / pill).
8. **Per-section style settings** on every section: spacing above/below and
   background.
9. **About 10 new section types** (list below).
10. **Version history:** every Publish saves a snapshot; any snapshot can be
    restored into the editor (as a draft — it goes live only on Publish).
11. **Nothing changes on the live site until Publish.** That includes
    removing, hiding and reordering sections.
12. **Autosave drafts** so work is never lost; Publish stays an explicit,
    confirmed button.
13. Plain-language labels and short help text on every control. No jargon
    ("Background image", not "image_url"; "Space above", not "padding-top").

## Non-goals (this step)

- Header menu, footer, shop page, product page, new custom pages (About,
  policies) — **step 2**. The "Site text" screen stays until then because it
  still controls the announcement bar and the shop page intro.
- Staff roles / who may publish — **step 3** (settings screen). For now any
  admin can publish, as today.
- Applying the theme to the nav and footer — step 2 (today the theme only
  recolours the sections area; keep that).
- Server-rendering the homepage for no-JavaScript visitors. Today `/home.html`
  carries a hand-written fallback copy that will drift from what's in the
  editor. Known gap; revisit with step 2.
- Two people editing the same page at once (see "Concurrency" for the
  minimal guard).
- A full phone editing experience (see "Phone").

## Anti-goals (failure even if it "works")

- A non-coder can make a layout that looks broken on a phone.
- A change reaches the live site without the person pressing Publish.
- Someone loses an hour of edits to a closed tab or a failed save.
- The editor needs the owner on the phone to explain it.
- The preview shows something different from what goes live.

## Approaches considered

1. **Upgrade the existing builder (chosen by the owner).** Keep the section
   schemas, tables, renderer and brand handling; add an in-editor preview
   iframe fed by `postMessage`, SortableJS for drag, a version table and a
   publish function in the database. Most to build, but stays in the
   plain-HTML/Supabase stack, no monthly cost, nothing to migrate.
2. **Hosted visual CMS (Builder.io, Storyblok).** Less to build, polished
   editor. Rejected: monthly fee, another account to hand over, content
   leaves Supabase, two-brand setup and existing sections must be rebuilt.
3. **Open-source drag-anywhere builder (GrapesJS).** Rejected: it's the
   free-canvas model that breaks phone layouts, and it doesn't fit the
   sections model already in place.

## The design

### Layout (laptop, ≥ 1100px)

```
┌ top bar ─────────────────────────────────────────────────────────────────┐
│ Ducks Unlimited · Homepage   ↶ ↷   📱 🖥   Saved ✓   History  [Publish] │
├ Sections (260px) ┬ Preview (flex) ────────────────┬ Settings (340px) ───┤
│ 🎨 Theme         │                                │ Hero                │
│ ⠿ Hero       👁 ⋯│   <iframe: real homepage,      │ Background image    │
│ ⠿ Tiles      👁 ⋯│    draft, editor mode>         │ Headline [B I 🔗 ↵] │
│ ⠿ New in     👁 ⋯│                                │ ...                 │
│ + Add section    │                                │ ─ Style ─           │
│                  │                                │ Space above [M ▾]   │
└──────────────────┴────────────────────────────────┴─────────────────────┘
```

- `⠿` drag handle; `👁` hide/show; `⋯` menu: Duplicate, Move up, Move down,
  Remove. Hidden sections show greyed in the list and are skipped in preview.
- "+ Add section" opens a picker: each type with a name, one-line
  description and a small static thumbnail image.
- "Theme" at the top of the list opens the theme form in the right panel
  (as today).
- Between 900px and 1100px the settings panel overlays the preview as a
  drawer. Below 900px see "Phone".

### Live preview mechanics

- The centre is an `<iframe src="/preview-home.html?preview=1&editor=1&brand=<slug>">`.
- `sections-render.js` gains an exported
  `renderSectionsFromData(container, sections, theme, ctx)` that renders an
  in-memory list (the existing `renderPageSections` becomes: load → call it).
  The editor and the live site therefore share one renderer.
- Editor → preview: on every change (debounced ~150ms) the editor posts
  `{ type: 'du-editor:render', sections, theme, selectedId }`. The preview
  re-renders. Product rails need product data: the preview fetches products
  for the rail's collection and caches per collection, re-fetching only when
  a rail's collection or count changes.
- Preview → editor: in editor mode each rendered section is wrapped with
  `data-editor-section-id`. Hover adds an outline + type label; click posts
  `{ type: 'du-editor:select', id }`. Links inside the preview do not
  navigate in editor mode.
- Both sides check `event.origin === location.origin`.
- Selecting a section in the list scrolls the preview to it.
- Phone/desktop toggle sets the iframe width to 390px (centred, with a
  subtle device frame) or 100%.

### Section list operations

- **Drag reorder:** SortableJS from cdnjs (pinned exact version), on the
  drag handle only. ↑/↓ stay available in the `⋯` menu for keyboard users.
- **Hide:** a flag in the section's draft settings (`_hidden: true`);
  renderer skips hidden sections. Goes live on Publish.
- **Duplicate:** new row, same type, copy of the settings, placed right
  after the original.
- **Remove:** marks the section removed in the draft (`_removed: true`);
  it disappears from the list with an "Undo" toast. Publish sets
  `deleted_at` on removed rows. (Replaces today's immediate delete.)
- **Add:** inserts a new row with `published = null` (already invisible to
  the live site, as today).
- **Order:** position changes are saved to the draft and applied on
  Publish. (Builder's call how to store a draft position — e.g. a
  `draft_position` column, or `_position` in the draft JSON. The live site
  must keep using the published order until Publish.)

### Undo / redo

- A stack of whole-page snapshots (`sections` + `theme`) in memory, max 50.
- Typing in one field is grouped into one undo step (new step after ~600ms
  pause or when focus leaves the field).
- Covers every edit, reorder, hide, duplicate, remove, add and theme change
  in the session. Clears on page reload (version history covers the longer
  term).

### Autosave and Publish

- Draft autosaves ~2s after the last change, with a status: "Saving…" /
  "Saved ✓" / "Couldn't save — retrying" (retry with backoff; keep the
  changes in memory). Warn before closing the tab if there are unsaved
  changes. The old "Save Draft" button goes away.
- **Publish** asks for confirmation ("Make these changes live on the Ducks
  Unlimited homepage?"), then calls one database function
  `publish_page(p_page_key, p_brand_id)` that, **in one transaction**:
  1. copies each section's draft into published (and draft order into the
     published position), clears drafts;
  2. sets `deleted_at` on sections marked removed;
  3. promotes the theme draft;
  4. writes a snapshot to `page_versions`;
  5. writes an `admin_log` row ("published homepage").
  The function is `security definer` and checks `is_admin()` first.
- Top bar shows "Unpublished changes" whenever draft ≠ published.

### Version history

- New table `page_versions`: `id, page_key, brand_id, snapshot jsonb
  ({ sections: [{ section_type, position, settings }], theme }),
  published_at, published_by, published_by_email`. Admin-only RLS. Keep all
  versions (they're small).
- "History" opens a side panel: list of publishes ("24 Nov, 3:12 pm ·
  staff@…"), newest first, with "Preview" (renders that snapshot in the
  preview iframe) and "Restore".
- **Restore** replaces the editor's current draft with the snapshot (one
  undo step, autosaved as draft). It goes live only when they press Publish.
  Restoring recreates sections as needed; it never touches the live site
  directly.

### Rich text

- Rich-text fields become a small editable box (`contenteditable`) with a
  toolbar: **B**, *I*, Link (asks for the address; internal pages offered
  from a short list: Shop, Men, Women, Stores, Track order…), New line,
  Clear formatting. Enter makes a new paragraph; Shift+Enter a line break.
  Pasting strips formatting except the allowed tags.
- One shared sanitiser `/js/safe-html.js` used **both** when saving and when
  rendering: allows `p, br, strong, b, em, i, a[href]` only; `href` must be
  relative, `http(s):`, `mailto:` or `tel:`. Everything else is removed.
- Existing content (hero headline with `<br>`, editorial bodies with `<p>`)
  is already in this format and loads unchanged.
- Label text loses the "type `<br>`" / "put each paragraph between `<p>`"
  instructions.

### Theme settings

- **Colours:** brand, accent, background, text (as today), with a "Reset to
  brand default" link each.
- **Fonts:** two dropdowns (headings, body). Curated Google Fonts, each
  option rendered in its own font:
  - Headings: Cormorant Garamond (default), Playfair Display, EB Garamond,
    Libre Baskerville, Lora, DM Serif Display.
  - Body: DM Sans (default), Inter, Lato, Work Sans, Nunito Sans, Karla.
  When a non-default font is chosen, the renderer adds the matching Google
  Fonts stylesheet link (`display=swap`) to the page.
- **Button shape:** Square / Rounded / Pill → a CSS variable for
  `border-radius` on `.btn` within the sections area.

### Per-section style settings (every section type)

Shown under a "Style" heading at the bottom of each section's form. Choices,
not sliders, so nothing can be set to an ugly value:

- **Space above / Space below:** None / Small / Medium / Large (maps to
  existing spacing tokens; smaller values on phones automatically).
- **Background:** Page colour (default) / White / Brand colour / Accent
  colour / Custom colour. Text colour switches to light automatically on
  dark backgrounds (contrast check).
- **Width:** Normal / Full width — only on types where it makes sense
  (declared per schema).

These live in a shared `STYLE_FIELDS` list in `section-schemas.js`, merged
into every schema, and are applied by a wrapper around each template's
output, so templates don't each re-implement them.

### New section types (10)

All flow-layout, mobile-first, styled in `/css/home.css` with the existing
brand classes. Blocks have their own add / remove / drag-reorder inside the
section form.

| Type | Settings | Blocks |
|---|---|---|
| `image-banner` | image, heading, text, button, text position (left/centre), height (short/medium/tall) | — |
| `slideshow` | auto-advance on/off, seconds per slide | slide: image, heading, text, button (max 6) |
| `multicolumn` | heading, columns per row on desktop (2/3/4) | column: image or icon, heading, text, link (max 8) |
| `testimonials` | heading | quote: text, name, place (max 6) |
| `video` | YouTube link, cover image, heading | — |
| `image-gallery` | heading, columns (3/4) | image: image, link (max 12) |
| `faq` | heading | question: question, answer (rich text) (max 20) — uses `<details>`, works without JS |
| `store-visit` | heading, which store (from `stores` table), show map on/off | — |
| `lookbook-feature` | which lookbook (from `lookbooks` table), heading, button label | — |
| `email-signup` | heading, text, button label, success message | — |

Notes for these:
- `video` is **YouTube only** (Claude's call, see "Calls made").
  Needs `https://www.youtube-nocookie.com` added to CSP `frame-src`. Shows
  the cover image with a play button; the YouTube player loads only on
  click, so visitors who don't play it don't download it. No uploaded video
  files: on Supabase's free plan, one homepage video watched by every
  visitor could use up the month's download allowance and take every
  product photo down with it.
- `slideshow` without JS shows the first slide only.
- `email-signup` **collects addresses only — nothing is sent to them in this
  step.** New table `newsletter_signups` (email, brand_id, consented_at,
  created_at; only admins may read; **no public insert**). The form posts to
  a new `/api/newsletter-signup` function that checks the email format,
  ignores duplicates, rejects bots with a hidden honeypot field, and limits
  repeat submissions from the same IP (e.g. 5 per hour). The form shows a
  consent line under the button — "By signing up you agree to receive
  emails from <brand>. See our Privacy Policy." linking to
  `/customer-service/privacy.html` (Data Privacy Act) — and the function
  records `consented_at`. Admin: a simple list + CSV export (can sit on the
  Customers page). Works without JS (plain form POST, redirect back with a
  thank-you message).
- `store-visit` and `lookbook-feature` read their data at render time, the
  same way `product-rail` reads products.

### Brand ownership of sections

- Today the code supports "shared" sections (`brand_id` NULL, labelled
  "Both brands") but the live database has none: Ducks Unlimited and
  Rocwood each own 5 sections (checked 24 Nov 2026).
- The new editor drops "shared" sections. **Every section belongs to one
  brand**; editing Ducks Unlimited can never change Rocwood. The publish
  function, snapshots and history are all per brand.
- Renderer fix: `loadSections()` currently switches from the shared set to
  the brand set as soon as the brand has *any* row — including a brand-new,
  never-published one. Change it to count only rows that have published
  content, so adding a section can never change the live page before
  Publish. (Keep the shared fallback in the renderer itself, harmless.)

### Phone (< 900px)

- The editor shows tabs: **Sections · Settings · Preview** — one panel at a
  time. No drag (use ↑/↓ in the `⋯` menu). Everything else works, so quick
  text and photo swaps are easy; full redesigns are expected on a laptop.

### Concurrency (minimal guard)

- When the editor opens, it remembers the latest `page_versions.published_at`.
  Before Publish, if a newer version exists, warn: "Someone else published
  this page at 3:12 pm. Publishing now will replace their changes." Proceed
  or cancel. Last write wins otherwise.

### Admin nav

- Rename "Homepage builder" → "Design". "Site text" stays (renamed
  "Site text (old)" or similar is the builder's call) until step 2 removes it.

## Success looks like

A non-coder, with no help, can on a laptop: swap the hero photo and
headline; make a word bold; reorder sections by dragging; hide one; add an
FAQ and a testimonial section; change the heading font and brand colour;
check it on the phone view; publish; then roll back to yesterday's version
and publish that. And the phone layout still looks right after all of it.

## Calls made (by Claude, for the owner to check)

- Video is YouTube-only; no video uploads while on the free Supabase plan.
- Email sign-up only collects addresses (with a consent line); sending
  newsletters is a later decision.
- "Shared by both brands" sections are dropped from the editor.
- Autosave replaces the Save Draft button.
- Spacing and backgrounds are fixed choices, not sliders.
- The 12 fonts listed above are the whole font menu.

## Left to the builder

- File structure (e.g. splitting `design.js` into state / preview / rich
  text / history modules — `design.js` is already 645 lines).
- How draft order is stored (column vs JSON), as long as the live site keeps
  the published order until Publish.
- Exact spacing token values and the thumbnail images for the picker.
- Migration number(s) (next is 034) and RLS details, following migrations
  015/016/033.
- How to verify (there is no test framework or package.json; the site is
  plain files). Browser verification against the local preview is fine.
- Code comments throughout in plain language — the owner is a beginner.
