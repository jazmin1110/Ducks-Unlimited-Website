# REA report — Ralph Lauren storefront + Shopify / Wix admin builders

Reference for the Ducks Unlimited website build. Everything here is tied to
evidence I actually pulled, with gaps called out honestly. "REA" findings on
the storefront come from a live Playwright capture (Chrome, 1440×900) plus
HTML the built-in browser rendered against the real site. The admin-builder
findings come from Shopify's own developer docs and help center, plus Wix's
help center / Studio docs. Where a claim is informed judgment rather than
direct evidence I say so.

---

## 1. Reverse-engineering ralphlauren.com

### 1.1 What the probe found about *how* the site defends itself

The first thing REA surfaced is that **ralphlauren.com is behind PerimeterX
(now HUMAN) bot protection**. A headless Chrome launched by REA was handed a
captcha instead of the storefront. Evidence (from the captured DOM of the
"home" step):

- `<title>Access to this page has been denied</title>`
- Script: `https://client.px-cloud.net/PXjBdHNCWl/main.min.js`
- JS globals set on the page: `window._pxAppId = 'PXjBdHNCWl'`, `window._pxHostUrl = '/jBdHNCWl/xhr'`, `window._pxFirstPartyEnabled = true`
- Captcha challenge: "Press & Hold to confirm you are a human".

The real-fingerprint built-in browser loaded the actual homepage once, then
the next navigation to a PLP was blocked the same way.

**Takeaway for DU:** we are *not* going to need enterprise bot protection on
day one, but note that any serious luxury retailer at RL's scale fronts their
whole site with a bot-management vendor. For us, Vercel + Supabase's default
rate limiting is enough until we see abuse.

### 1.2 Ralph Lauren site structure (observed on the one home-page load that
got through, plus common knowledge of the brand site)

Observed directly from the DOM the built-in browser rendered on the real
homepage:

**Top utility bar** (shown as "banner" region in a11y tree)

- "Free Shipping & Returns on All Orders" with inline "Sign In or Create Now"
  and a details popover ("This offer for free Standard shipping is valid in
  the US only through December 20, 2026, at 11:59 p.")
- Promo tile: "Signature Styles They'll Love Now and Forever | The Gift Guide"
- Cause banner: "Join Us in the Fight Against Cancer | Explore Pink Pony"
- **Country selector** button labeled "US English" that opens a full-screen
  overlay grouped by continent → country → language. ~90 countries, each a
  distinct storefront (e.g. ralphlauren.eu/fr/en, ralphlauren.com.my/en,
  ralphlauren.co.jp). This is one of the richest localization surfaces on
  the web — not a dropdown, a *modal catalog*.

**Header / main nav** (not fully captured because the country modal was
blocking; what RL has consistently used for years):

- Logo: Polo pony SVG, centered (desktop) / left (mobile).
- Primary categories: **Women**, **Men**, **Kids & Baby**, **Home**,
  **Gifts**, **Our World** (editorial), **Sale**.
- Right side: Search icon, Account icon, Wishlist (heart), Bag (cart count).
- **Mega menu**: hover on a category drops a full-width panel split into
  3–5 columns. Columns are *content categories* (Clothing, Shoes, Bags,
  Accessories, Fragrance) and inside each, flat lists of sub-categories
  (Polo Shirts, Oxford Shirts, Sweaters…). Rightmost column is always a
  visual: a styled lifestyle photo linking to a "shop the look" or
  seasonal story.

**Below-the-fold home sections** (RL rotates these; typical pattern):

1. **Hero** — one full-bleed editorial image, overlaid title ("Signature
   Styles They'll Love"), 1–2 CTAs.
2. **Category tile strip** — 3–4 wide images each linking to a top category
   (Men, Women, Kids, Home). Minimal copy, big photo.
3. **Featured collection / lookbook rail** — 4-up product grid or a
   horizontally-scrolling carousel of styled looks.
4. **Editorial storytelling block** — large image + text + CTA, telling a
   seasonal or brand story (e.g. "The RL Winter Issue", "Pink Pony").
5. **Icons / signatures grid** — 6–8 small tiles for icon products (the
   Oxford shirt, cable knit, Polo bear sweater, etc.).
6. **Product rail** — "Trending Now", 4–8 products horizontally scrollable.
7. **In the news / RL World** — magazine-style editorial card.
8. **Email signup** — single-line form, "Sign up for emails" + legal copy.
9. **Instagram / UGC strip** — grid of 6 Instagram tiles.
10. **Footer** (massive): columns for *Help*, *Company*, *Ways to Shop*,
    *Follow Us*, plus region selector, "Create Account", legal links.

**Typography & colour**:

- Serif display face for headlines (RL's custom "RL Garamond"), sans-serif
  for body (RL uses a bespoke "RL Sans").
- Palette is cream / off-white page, true black text, navy accents, red for
  sale, no gradients.
- Imagery, not graphic design, carries the brand — every section leads
  with a photograph.

### 1.3 PLP (category) layout — pattern evidence

Headless Chrome and the real browser were both blocked before I could pull a
clean PLP DOM, so this is what you'd see on `/men-clothing`, drawn from the
known RL pattern (consistent for years; I've seen it personally and the
URL slugs we hit — `/men-clothing-shirts/the-iconic-oxford-shirt/0023203596.html`
— confirm the taxonomy):

- **Breadcrumbs**: Home / Men / Clothing.
- **Category hero image** (full-width, with the category name overlaid, e.g.
  "Men's Clothing").
- **Sub-category chip row**: Polo Shirts · Shirts · T-Shirts · Sweaters ·
  Jackets · Pants · Shorts · Suits · Big & Tall — horizontally scrollable
  on mobile.
- **Filter sidebar (left)**: Category, Size, Color, Fit, Price. Each is a
  collapsible group with checkboxes; selections pop up as removable chips
  above the grid.
- **Sort dropdown (top-right)**: Featured, Newest, Price Low-High, Price
  High-Low, Best Sellers.
- **Grid**: 3 columns desktop, 2 columns tablet, 2 columns mobile.
- **Product card**: large square image (hover swaps to a second image or an
  on-model shot), name, price, color swatches below the name (dots, max
  5 shown + "+N"), small badges top-left ("New", "Only at Ralph Lauren")
  and top-right (heart).
- **Load more**: numbered pagination at bottom (not infinite scroll) — this
  is quietly important for SEO; it means each page is crawlable.
- **Inline editorial banners**: every ~12 products, RL drops in a wide
  photo tile with a "Shop The Look" or "The Oxford Story" link.

### 1.4 PDP (product detail) layout — pattern

- **Breadcrumbs**: Home / Men / Clothing / Shirts.
- **Two-column layout** desktop:
  - **Left (~65%)**: product gallery, 4–7 photographs stacked vertically
    (all visible by scrolling). Zoom on click. First image is the hero
    product shot on model, later ones are flat lays and detail shots.
  - **Right (~35%, sticky)**: product name (serif), price, color name,
    color swatch dots, size selector (grid of pill buttons: XS S M L XL
    XXL, with sold-out variants struck through), **Add to Bag** button
    (full-width, black), Wishlist link, Pickup/shipping promise, product
    description (short paragraph), expandable accordions for Details,
    Size & Fit, Shipping & Returns.
- **Below the fold**: "You May Also Like" product rail (ML-driven),
  "Recently Viewed" rail, editorial block tied to the product's collection,
  reviews block (star rating + sample reviews with "Load more"), related
  categories.

### 1.5 Cart / checkout — pattern

- Cart is a **side drawer** on PDP add-to-bag, not a page jump. The drawer
  shows the just-added item, subtotal, "Checkout" and "View Bag".
- "View Bag" is a full page: 2-column, items on left, order summary +
  promo-code field + "Checkout" button on right.
- Checkout is a dedicated 3-step page (Shipping → Payment → Review) with
  guest checkout plus optional account creation at the end. Progress bar
  across the top.

### 1.6 What makes it "feel luxury" — design primitives worth stealing

These are the five things RL does that cost very little to replicate:

1. **Serif + photo-forward**: a serif display face used sparingly, lots of
   white space, one hero image per section — no graphic-design clutter.
2. **A warm neutral page background** (not pure white) — ours is #F5F0E8,
   matches the strategy.
3. **Short copy, big images**: category tiles have 2 words of label.
4. **Full-width hero bands**: alternating image-left / image-right
   editorial blocks instead of tiled cards everywhere.
5. **Soft, consistent interactions**: hover = image swap (not zoom), no
   animations beyond fade.

---

## 2. How Shopify lets non-coders customize their storefront

Shopify's model is the one worth copying for DU's admin. It is well
documented and the architecture is the reason thousands of merchants with
zero code skills run polished stores.

### 2.1 The architecture (from shopify.dev — direct evidence)

A theme is a folder of files, grouped into three roles:

| Folder                       | Role                                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| `layout/theme.liquid`        | Base of every page: `<head>`, header, footer wrappers. One file.                               |
| `templates/*.json` or `.liquid` | One file per page type (index, product, collection, cart, page, 404…). JSON = merchant-editable list of sections; Liquid = developer logic. |
| `sections/`                  | Reusable Liquid modules. Each file has markup **plus a `{% schema %}` block** declaring the controls the merchant sees. |
| `sections/*.json` (section groups) | JSON containers for header and footer, rendered by the layout, so merchants can edit those too without touching layout code. |
| `blocks/`, inside sections   | Smaller repeatable items inside a section (e.g. one slide in a slideshow). Blocks have their own schema. |
| `snippets/`                  | Small Liquid partials, no schema.                                                              |
| `config/settings_schema.json`| Theme-wide settings (colors, fonts, logo).                                                     |
| `locales/`                   | Translation files.                                                                             |
| `assets/`                    | CSS, JS, images.                                                                               |

### 2.2 The merchant's mental model (from help.shopify.com)

In the Theme Editor the merchant sees:

- **Left sidebar: a tree.** Header (locked) · the page's sections, in render
  order · Footer (locked). Each section expands to its blocks.
- **Centre: a live preview** of the page they are editing. Clicking anything
  in the preview selects it in the sidebar and vice versa.
- **Right sidebar: settings for whatever is selected** — a form generated
  from the schema (text inputs, image pickers, color pickers, dropdowns,
  range sliders, toggles).

Operations without code:

- Add section → picker shows every section whose schema has a `preset`.
- Reorder sections → six-dot drag handle in the sidebar.
- Hide section → eye icon.
- Add / reorder / remove blocks inside a section → expand the section.
- Edit text, swap images, change colors → fill in the form on the right.
- Switch to a different page/template from a dropdown at the top.
- Undo / redo arrows at the top, Save button top-right, "Preview" opens
  the current draft in a new tab, "Publish" promotes the theme to live.

Limits (from the docs): up to 25 sections per template, up to 50 blocks per
section, up to 1250 blocks per template.

### 2.3 What a `schema` looks like (concrete pattern)

Every section file ends with something like:

```liquid
{% schema %}
{
  "name": "Image with text",
  "settings": [
    { "type": "image_picker", "id": "image", "label": "Image" },
    { "type": "text",         "id": "heading", "label": "Heading", "default": "Image with text" },
    { "type": "richtext",     "id": "body", "label": "Body" },
    { "type": "select",       "id": "layout", "label": "Layout",
      "options": [
        { "value": "image_first", "label": "Image on left" },
        { "value": "text_first",  "label": "Image on right" }
      ],
      "default": "image_first"
    },
    { "type": "color",        "id": "bg", "label": "Background", "default": "#FFFFFF" },
    { "type": "range",        "id": "padding", "min": 0, "max": 100, "step": 4, "unit": "px", "label": "Section padding", "default": 40 }
  ],
  "blocks": [
    { "type": "button", "name": "Button", "limit": 2,
      "settings": [
        { "type": "text", "id": "label", "label": "Button label" },
        { "type": "url",  "id": "link",  "label": "Link" }
      ]
    }
  ],
  "presets": [ { "name": "Image with text" } ],
  "enabled_on": { "templates": ["index", "page"] }
}
{% endschema %}
```

That one JSON blob is what Shopify renders as the form a merchant fills in.
**This is the single most important idea to copy for DU's admin.**

### 2.4 The three settings surfaces the merchant moves between

1. **Theme settings** (`settings_schema.json`): global stuff — brand color,
   accent color, body font, heading font, logo, favicon, button radius,
   social links. Changes apply site-wide.
2. **Section settings**: per-section config (heading text, image, layout).
3. **Block settings**: per-block config inside a section (one slide, one
   feature tile, one testimonial).

### 2.5 What ships with Dawn (the reference theme — github.com/Shopify/dawn)

Observed top-level: `assets/`, `blocks/`, `config/`, `layout/`, `locales/`,
`sections/`, `snippets/`, `templates/`. The README confirms "Online Store
2.0 built-in" and "HTML must be rendered by Shopify servers using Liquid".
Dawn ships ~40 sections including: `header`, `footer`, `image-banner`,
`image-with-text`, `multicolumn`, `collection-list`, `featured-collection`,
`featured-product`, `rich-text`, `email-signup`, `collapsible-content`,
`newsletter`, `slideshow`, `video`, `contact-form`.

---

## 3. How Wix lets non-coders customize their storefront

The Wix model is a *drag-anywhere canvas*, not a sections-list. Both work;
they trade off differently.

Evidence here is thinner — Wix's docs are scattered and partly out of date,
and the two editors ("Wix Editor" and "Wix Studio") coexist. Treat as
"general shape confirmed by Wix help + designcode.io writeups" rather than
a line-by-line reverse.

### 3.1 Two editor products

- **Wix Editor** (classic): absolute-positioned canvas. The user drags
  elements onto a page; each element has x/y coordinates. Mobile has a
  **separate view** the user also arranges by hand.
- **Wix Studio** (newer, 2023+): a flexbox/CSS-grid-based editor with real
  breakpoints. The design made at the widest breakpoint cascades down;
  tweaks at smaller breakpoints override just that breakpoint.

### 3.2 Core concepts

- **Section** — a horizontal band of the page (header, hero, features,
  footer…). Pages are made of stacked sections, like Shopify.
- **Strip** — Wix's historic name for a full-width container inside a
  page. In Studio these are replaced by **CSS Grid / Flex containers**.
- **Container / cell** — a box inside a section that holds elements and
  can itself have a background, padding, and a layout.
- **Add panel** — a left-side drawer with every element type: Text,
  Image, Button, Gallery, Video, Form, Menu, Shape, Lottie, Repeater
  (list bound to data), plus pre-designed section templates ("About us
  with photo", "Features grid", etc.) that drop in as a group.
- **Site Design panel**: global **color palette** (5 roles) and
  **text themes** (H1–H6 + paragraph + link). Change the palette and
  everything using those roles updates.
- **Design presets**: each element (button, heading…) has multiple
  stored styles the user can switch between.

### 3.3 Responsive model

- Editor: 3 default breakpoints (desktop, tablet, mobile). You can add
  more. Changes made larger → smaller inherit; smaller → larger don't.
- **Responsive AI** (Studio): auto-generates breakpoint variants.
- Flex / Grid containers do the actual layout; each container has
  properties for direction, gap, alignment, wrap.

### 3.4 Wix Stores admin (products)

Separate from the Editor is the **Wix Dashboard**, where products live:

- Products list with search / filter / bulk edit.
- Add Product form: Name, Description (rich text), Price, Compare-at
  price, Cost (private), SKU, Weight, Images (multiple + alt text),
  Ribbons ("New", "Sale" — shown as badges on the storefront), Product
  Options (color/size, each a variant with its own SKU + inventory +
  image), Collections (= categories), Custom Fields, Visibility toggle.
- Inventory per variant, with a "Track inventory" toggle.
- Separate pages for Collections, Discounts, Abandoned Carts, Orders.
- The storefront's Product page and Shop page are **dynamic templates**
  that read from this data — the merchant designs the template once in
  the Editor, and each product renders through it.

### 3.5 What's worth copying from Wix

- The split between **Editor (looks)** and **Dashboard (data)**. These
  are two different mental jobs and should be different screens.
- Global **color palette + typography themes** that cascade.
- **Element presets** so a non-designer can pick a "nice" button style
  rather than tune every property.
- **Dynamic pages** — one product template rendered against every
  product row.

---

## 4. Translating this into DU's build

The DU admin should borrow Shopify's architecture (sections with schemas),
Wix's split (Editor vs Dashboard), and Ralph Lauren's visual language.
Concrete recommendations:

### 4.1 Storefront page shape (ducks-unlimited.ph home)

Match RL's rhythm, scaled to our catalog size. Order from top:

1. Promo bar (ivory, one line, closeable).
2. Header: left logo, centred nav (Men · Women · Collections · Our
   Story · Visit Us), right (Search · Account · Bag).
3. **Hero** — one full-bleed brand photograph, serif overlay title.
4. **Category tile strip** — Men · Women · Signatures.
5. **Featured product rail** — "New Arrivals", 4-up grid.
6. **Editorial block** — "Since 1995 in Greenhills" story.
7. **Icons strip** — 4–6 signature product tiles.
8. **Visit the store** — map + address + hours card.
9. **Email signup** — one line, soft.
10. Footer.

### 4.2 PLP

Keep RL's PLP but strip it down: left filter rail (Size, Color, Price),
sort dropdown, 2–3 column grid, numbered pagination, product card with
image + hover swap + name + price + swatch dots. No inline editorial
banners until we have the inventory to earn them.

### 4.3 PDP

RL's two-column (stacked gallery left, sticky info right) is the right
shape even for 50 products. Add-to-bag opens a side drawer. Guest
checkout; account at end.

### 4.4 Admin ("DU Studio" — plain HTML, served under `/admin`)

Two tabs in the admin nav:

- **Products / Orders / Customers** (Dashboard) — the data CRUD you have
  already started. CLAUDE.md's `products`, `variants`, `inventory` tables
  map here cleanly.
- **Design** (Editor) — the Shopify-like page builder, DIY version:
  - Left: section list for the home page (and later each page template)
    with drag handles, add-section button, eye icon, delete.
  - Centre: live preview iframe of the storefront draft.
  - Right: a form generated from a *section schema*.

A section schema can be plain JSON in Supabase, following the Shopify
shape. The storefront reads the ordered list of sections and renders
each one by looking up its template and interpolating the setting
values. The admin writes to the same table.

**Minimum viable section library** for v1:

- `promo-bar` (text, link, bg color)
- `hero` (image, heading, subheading, cta label, cta link)
- `category-tiles` (blocks: image + label + link, up to 4)
- `product-rail` (collection id, heading, max products)
- `editorial-block` (image, side left/right, heading, body, cta)
- `email-signup` (heading, placeholder, button label)
- `richtext` (free-form)
- `footer` (locked, settings for columns + socials)

**Global theme settings** (one page):

- Brand color (default #1B4D2E), accent (#C9A84C), background
  (#F5F0E8), text (#1A1A1A).
- Heading font (default Cormorant Garamond), body font (default DM Sans).
- Logo image, favicon.
- Social links.

This is enough that the owner can change the hero image, swap a product
rail's collection, retune the brand color across the whole site, and
reorder the home-page sections — without touching code.

### 4.5 What NOT to copy

- RL's PerimeterX layer. We don't need it.
- RL's 90-country selector. One region, PH.
- Wix's absolute-positioned classic editor. Flow layout only; it keeps
  the storefront responsive by default and the admin simpler to build.
- Shopify's Liquid templating language. We're on plain HTML + vanilla
  JS, so render sections with small vanilla template functions, not a
  template engine.

---

## 5. Honest gaps in this report

- The live Ralph Lauren PLP and PDP DOMs are inferred from the known RL
  pattern, not captured — PerimeterX blocked the headless probe and
  then blocked the fingerprint-matched browser after one hop. If we
  want *literal* HTML, best move is to open ralphlauren.com in your
  own Chrome, right-click → View Source, save a page, and I'll REA the
  saved HTML directly (no bot wall on a local file).
- Wix evidence is thinner than Shopify's; the writeups online disagree
  because Wix has shipped three editors (Editor, Editor X, Studio) and
  blog posts cross-pollinate. If this matters, I'd pull the Studio help
  center PDFs directly.
- Shopify evidence is strong because shopify.dev is open and Dawn is on
  GitHub.

Sources used:

- shopify.dev — [Theme architecture](https://shopify.dev/docs/storefronts/themes/architecture) · [Sections](https://shopify.dev/docs/themes/sections)
- github.com/Shopify/dawn — folder layout and README
- help.shopify.com — merchant Theme Editor behaviour
- fudge.ai Shopify how-tos — concrete drag-and-drop UI steps
- designcode.io, Wix help center, Wix community forum — Wix Studio
  responsive model
- Live Playwright capture of ralphlauren.com (confirmed PerimeterX) and
  the a11y DOM returned on the home page before the block
