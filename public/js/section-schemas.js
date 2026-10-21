// =============================================================================
// Ducks Unlimited — Section schema registry
// =============================================================================
// This is the single source of truth for what sections exist and what fields
// each one has. Shopify writes these schemas as JSON inside Liquid files; we
// write them as plain JS objects. Same idea, no templating language.
//
// Every section type has:
//
//   name       → shown in the "Add section" picker in /admin/design.html
//   settings   → the form the admin fills in. Each setting has a `type`
//                (text, richtext, textarea, image, color, select, range,
//                 url, number, toggle) and an `id` (the JSONB key).
//   blocks     → OPTIONAL. Repeatable sub-items with their own settings
//                (e.g. one tile in a category-tiles section).
//   defaults   → OPTIONAL. The starting values for a freshly-added section.
//
// To add a new section type: add an entry here, then (if needed) add a
// template function in /js/sections-render.js. No migration needed.
//
// Rendering lives in /js/sections-render.js. Keep this file DECLARATIVE —
// no DOM, no fetch, no Supabase — so the admin UI can introspect it to
// generate forms, and the renderer can introspect it to validate.
// =============================================================================


// Setting-type reference (what the admin UI should render for each):
//
//   text      → <input type="text">
//   textarea  → <textarea> (plain, multi-line)
//   richtext  → <textarea> whose value is treated as HTML (admin can paste <br>, <em>, etc.)
//   image     → image URL input + optional file upload (Supabase Storage)
//   color     → <input type="color">
//   url       → <input type="url"> for internal (/shop.html) or external links
//   number    → <input type="number">
//   range     → <input type="range"> with min/max/step/unit
//   select    → <select> whose options come from `options`
//   toggle    → <input type="checkbox"> (boolean)


export const SECTION_SCHEMAS = {

  // ────────────────────────────────────────────────────────────────────────
  // HERO — full-screen image with eyebrow / headline / sub / CTA.
  // The anchor section at the top of a page.
  // ────────────────────────────────────────────────────────────────────────
  hero: {
    name: 'Hero',
    description: 'A full-screen image with a headline and a call-to-action button. Leave the image empty to show a solid brand-color background.',
    settings: [
      { id: 'image_url', type: 'image',    label: 'Background image' },
      { id: 'eyebrow',   type: 'text',     label: 'Eyebrow (small label above headline)', default: '' },
      { id: 'headline',  type: 'richtext', label: 'Headline (HTML allowed — use <br> for a line break)', default: '' },
      { id: 'sub',       type: 'textarea', label: 'Sub-headline', default: '' },
      { id: 'cta_text',  type: 'text',     label: 'Button label', default: 'Shop the Collection' },
      { id: 'cta_link',  type: 'url',      label: 'Button link',  default: '/shop.html' },
      { id: 'overlay',   type: 'range',    label: 'Image darken (%)', default: 35,
        min: 0, max: 80, step: 5, unit: '%' }
    ]
  },


  // ────────────────────────────────────────────────────────────────────────
  // CATEGORY TILES — big image tiles linking to collections (Men / Women /
  // Kids on the homepage). Each tile is a BLOCK the admin can add/remove/
  // reorder.
  // ────────────────────────────────────────────────────────────────────────
  'category-tiles': {
    name: 'Category Tiles',
    description: 'Large image tiles linking to collection pages. Add up to 4 tiles.',
    settings: [
      { id: 'eyebrow', type: 'text', label: 'Eyebrow',         default: 'The Collection' },
      { id: 'heading', type: 'text', label: 'Section heading', default: 'Made for everyday elegance' }
    ],
    blocks: {
      name: 'Tile',
      max: 4,
      settings: [
        { id: 'image_url', type: 'image', label: 'Image' },
        { id: 'image_alt', type: 'text',  label: 'Image description (for screen readers)', default: '' },
        { id: 'label',     type: 'text',  label: 'Small label (e.g. "For Him")', default: '' },
        { id: 'name',      type: 'text',  label: 'Tile name',    default: 'Category' },
        { id: 'cta_text',  type: 'text',  label: 'Link text (e.g. "Shop Men")', default: 'Shop Now' },
        { id: 'link',      type: 'url',   label: 'Link target',  default: '/shop.html' }
      ],
      defaults: {
        image_url: '',
        image_alt: '',
        label:     '',
        name:      'New Category',
        cta_text:  'Shop Now',
        link:      '/shop.html'
      }
    }
  },


  // ────────────────────────────────────────────────────────────────────────
  // PRODUCT RAIL — pulls products from Supabase (products table) for the
  // brand being viewed. The admin picks a "collection" rather than
  // hand-picking products.
  // ────────────────────────────────────────────────────────────────────────
  'product-rail': {
    name: 'Product Grid',
    description: 'A grid of products pulled live from your catalog.',
    settings: [
      { id: 'eyebrow',      type: 'text', label: 'Eyebrow', default: 'Just In' },
      { id: 'heading',      type: 'text', label: 'Heading', default: 'New Arrivals' },
      { id: 'collection',   type: 'select', label: 'Which products?', default: 'new',
        options: [
          // Only "newest" exists today. Add "sale" / "featured" here once the
          // products table has columns to support them.
          { value: 'new', label: 'Newest products' }
        ]
      },
      { id: 'max_products', type: 'range', label: 'Max products', default: 8,
        min: 2, max: 16, step: 1 },
      { id: 'cta_text',     type: 'text', label: 'Button label (optional)', default: 'Shop All New' },
      { id: 'cta_link',     type: 'url',  label: 'Button link',  default: '/shop.html' }
    ]
  },


  // ────────────────────────────────────────────────────────────────────────
  // EDITORIAL BLOCK — large image + text block. Admin picks which side the
  // image is on. Stack two with opposite sides for the RL alternating look.
  // ────────────────────────────────────────────────────────────────────────
  'editorial-block': {
    name: 'Editorial Block',
    description: 'An image + text block for storytelling. Choose which side the image sits on.',
    settings: [
      { id: 'image_url', type: 'image',    label: 'Image' },
      { id: 'image_alt', type: 'text',     label: 'Image description (for screen readers)', default: '' },
      { id: 'eyebrow',   type: 'text',     label: 'Eyebrow',  default: '' },
      { id: 'headline',  type: 'text',     label: 'Headline', default: '' },
      { id: 'body',      type: 'richtext', label: 'Body (HTML allowed — wrap paragraphs in <p>…</p>)', default: '' },
      { id: 'cta_text',  type: 'text',     label: 'Button label', default: '' },
      { id: 'cta_link',  type: 'url',      label: 'Button link',  default: '' },
      { id: 'layout',    type: 'select',   label: 'Image side', default: 'image-left',
        options: [
          { value: 'image-left',  label: 'Image left, text right' },
          { value: 'image-right', label: 'Image right, text left' }
        ]
      }
    ]
  },


  // ────────────────────────────────────────────────────────────────────────
  // RICHTEXT — a plain text block (headline + body) with no image.
  // Useful for announcements and simple copy sections.
  // ────────────────────────────────────────────────────────────────────────
  richtext: {
    name: 'Text Block',
    description: 'A simple text block — heading + paragraph.',
    settings: [
      { id: 'heading', type: 'text',     label: 'Heading', default: '' },
      { id: 'body',    type: 'richtext', label: 'Body (HTML allowed)', default: '' },
      { id: 'align',   type: 'select',   label: 'Text alignment', default: 'center',
        options: [
          { value: 'left',   label: 'Left'   },
          { value: 'center', label: 'Center' },
          { value: 'right',  label: 'Right'  }
        ]
      }
    ]
  }
};


// Build a fresh draft blob for a brand-new section — populated with each
// setting's `default`, and with an empty blocks[] for sections that take
// blocks. Used by the admin "Add section" button.
export function buildDefaultSettings(type) {
  const schema = SECTION_SCHEMAS[type];
  if (!schema) throw new Error(`Unknown section type: ${type}`);

  const out = {};
  for (const s of schema.settings) {
    out[s.id] = s.default ?? '';
  }
  if (schema.blocks) {
    out.blocks = [];
  }
  return out;
}

// Build a default block for a section type that takes blocks.
export function buildDefaultBlock(type) {
  const schema = SECTION_SCHEMAS[type];
  if (!schema?.blocks) throw new Error(`${type} has no blocks`);

  // Each block carries its own stable id so reorder/remove is unambiguous.
  const id = `blk_${Math.random().toString(36).slice(2, 10)}`;
  return { id, ...schema.blocks.defaults };
}

// Admin "Add section" picker uses this to list every available type.
export function listSectionTypes() {
  return Object.entries(SECTION_SCHEMAS).map(([type, s]) => ({
    type,
    name: s.name,
    description: s.description
  }));
}
