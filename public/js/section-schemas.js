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


import { STYLE_FIELDS } from './section-style.js';


export const SECTION_SCHEMAS = {

  // ────────────────────────────────────────────────────────────────────────
  // HERO — full-screen image with eyebrow / headline / sub / CTA.
  // The anchor section at the top of a page.
  // ────────────────────────────────────────────────────────────────────────
  hero: {
    name: 'Hero',
    allowFullWidth: true,
    description: 'A full-screen image with a headline and a call-to-action button. Leave the image empty to show a solid brand-color background.',
    settings: [
      { id: 'image_url', type: 'image',    label: 'Background image' },
      { id: 'eyebrow',   type: 'text',     label: 'Small label above the headline', default: '' },
      // singleLine: Enter adds a line break, not a new paragraph
      { id: 'headline',  type: 'richtext', label: 'Headline', default: '', singleLine: true },
      { id: 'sub',       type: 'textarea', label: 'Sub-headline', default: '' },
      { id: 'cta_text',  type: 'text',     label: 'Button label', default: 'Shop the Collection' },
      { id: 'cta_link',  type: 'url',      label: 'Page the button opens',  default: '/shop.html' },
      { id: 'overlay',   type: 'range',    label: 'Darken the photo so the words are easier to read (%)', default: 35,
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
      { id: 'eyebrow', type: 'text', label: 'Small label above the heading',         default: 'The Collection' },
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
        { id: 'link',      type: 'url',   label: 'Page the tile opens',  default: '/shop.html' }
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
      { id: 'eyebrow',      type: 'text', label: 'Small label above the heading', default: 'Just In' },
      { id: 'heading',      type: 'text', label: 'Heading', default: 'New Arrivals' },
      { id: 'collection',   type: 'select', label: 'Which products?', default: 'new',
        options: [
          { value: 'new',      label: 'Newest products' },
          // "Featured" = products ticked "Feature on homepage" in Admin → Products
          { value: 'featured', label: 'Featured (hand-picked in Products)' }
        ]
      },
      { id: 'max_products', type: 'range', label: 'How many products to show', default: 8,
        min: 2, max: 16, step: 1 },
      { id: 'cta_text',     type: 'text', label: 'Button label (optional)', default: 'Shop All New' },
      { id: 'cta_link',     type: 'url',  label: 'Page the button opens',  default: '/shop.html' }
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
      { id: 'eyebrow',   type: 'text',     label: 'Small label above the heading',  default: '' },
      { id: 'headline',  type: 'text',     label: 'Headline', default: '' },
      { id: 'body',      type: 'richtext', label: 'Text', default: '' },
      { id: 'cta_text',  type: 'text',     label: 'Button label', default: '' },
      { id: 'cta_link',  type: 'url',      label: 'Page the button opens',  default: '' },
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
      { id: 'body',    type: 'richtext', label: 'Text', default: '' },
      { id: 'align',   type: 'select',   label: 'Text alignment', default: 'center',
        options: [
          { value: 'left',   label: 'Left'   },
          { value: 'center', label: 'Center' },
          { value: 'right',  label: 'Right'  }
        ]
      }
    ]
  },

  // ────────────────────────────────────────────────────────────────────────
  // IMAGE BANNER — one wide photo with words and a button on top.
  // ────────────────────────────────────────────────────────────────────────
  'image-banner': {
    name: 'Image Banner',
    allowFullWidth: true,
    description: 'A wide photo with a heading, a little text and a button on top of it.',
    settings: [
      { id: 'image_url', type: 'image',    label: 'Photo' },
      { id: 'image_alt', type: 'text',     label: 'Photo description (for screen readers)', default: '' },
      { id: 'heading',   type: 'text',     label: 'Heading', default: 'A new season of classics' },
      { id: 'text',      type: 'richtext', label: 'Text', default: '' },
      { id: 'cta_text',  type: 'text',     label: 'Button label', default: 'Shop now' },
      { id: 'cta_link',  type: 'url',      label: 'Page the button opens', default: '/shop.html' },
      { id: 'text_position', type: 'select', label: 'Where the words sit', default: 'center',
        options: [{ value: 'left', label: 'Left' }, { value: 'center', label: 'Middle' }] },
      { id: 'height', type: 'select', label: 'Banner height', default: 'medium',
        options: [{ value: 'short', label: 'Short' }, { value: 'medium', label: 'Medium' }, { value: 'tall', label: 'Tall' }] }
    ]
  },


  // ────────────────────────────────────────────────────────────────────────
  // SLIDESHOW — photos that change every few seconds (/js/slideshow.js).
  // Without JavaScript, the first slide shows.
  // ────────────────────────────────────────────────────────────────────────
  slideshow: {
    name: 'Slideshow',
    allowFullWidth: true,
    description: 'Up to 6 photos that change every few seconds, each with its own words and button.',
    settings: [
      { id: 'autoplay', type: 'toggle', label: 'Change slides automatically', default: true },
      { id: 'seconds',  type: 'range',  label: 'Seconds per slide', default: 5, min: 3, max: 10, step: 1 }
    ],
    blocks: {
      name: 'Slide',
      max: 6,
      starter: 2,
      settings: [
        { id: 'image_url', type: 'image', label: 'Photo' },
        { id: 'image_alt', type: 'text',  label: 'Photo description (for screen readers)', default: '' },
        { id: 'heading',   type: 'text',  label: 'Heading', default: '' },
        { id: 'text',      type: 'textarea', label: 'Text', default: '' },
        { id: 'cta_text',  type: 'text',  label: 'Button label', default: '' },
        { id: 'cta_link',  type: 'url',   label: 'Page the button opens', default: '/shop.html' }
      ],
      defaults: { image_url: '', image_alt: '', heading: 'Slide heading', text: '', cta_text: 'Shop now', cta_link: '/shop.html' }
    }
  },


  // ────────────────────────────────────────────────────────────────────────
  // MULTICOLUMN — 2 to 4 columns side by side, each with a picture and text.
  // ────────────────────────────────────────────────────────────────────────
  multicolumn: {
    name: 'Columns',
    description: 'Two to four columns side by side, each with an optional picture, a heading and text. Good for "Why shop with us".',
    settings: [
      { id: 'heading', type: 'text', label: 'Heading', default: 'Why shop with us' },
      { id: 'columns', type: 'select', label: 'Columns on a computer screen', default: '3',
        options: [{ value: '2', label: '2' }, { value: '3', label: '3' }, { value: '4', label: '4' }] }
    ],
    blocks: {
      name: 'Column',
      max: 8,
      starter: 3,
      settings: [
        { id: 'image_url', type: 'image',    label: 'Picture (optional)' },
        { id: 'image_alt', type: 'text',     label: 'Picture description (for screen readers)', default: '' },
        { id: 'heading',   type: 'text',     label: 'Heading', default: '' },
        { id: 'text',      type: 'richtext', label: 'Text', default: '' },
        { id: 'link',      type: 'url',      label: 'Page it links to (optional)', default: '' }
      ],
      defaults: { image_url: '', image_alt: '', heading: 'Column heading', text: '<p>A sentence or two about this.</p>', link: '' }
    }
  },


  // ────────────────────────────────────────────────────────────────────────
  // TESTIMONIALS — what customers say.
  // ────────────────────────────────────────────────────────────────────────
  testimonials: {
    name: 'Testimonials',
    description: 'Quotes from happy customers, with their name and where they are from.',
    settings: [
      { id: 'heading', type: 'text', label: 'Heading', default: 'What our customers say' }
    ],
    blocks: {
      name: 'Quote',
      max: 6,
      starter: 2,
      settings: [
        { id: 'quote', type: 'textarea', label: 'What they said', default: '' },
        { id: 'name',  type: 'text',     label: 'Name', default: '' },
        { id: 'place', type: 'text',     label: 'Where they are from (optional)', default: '' }
      ],
      defaults: { quote: 'The softest polo I own.', name: 'Customer name', place: 'Manila' }
    }
  },


  // ────────────────────────────────────────────────────────────────────────
  // IMAGE GALLERY — a grid of photos, each optionally a link.
  // ────────────────────────────────────────────────────────────────────────
  'image-gallery': {
    name: 'Photo Gallery',
    allowFullWidth: true,
    description: 'A grid of up to 12 photos. Each one can link to a page.',
    settings: [
      { id: 'heading', type: 'text', label: 'Heading', default: '' },
      { id: 'columns', type: 'select', label: 'Photos per row on a computer screen', default: '4',
        options: [{ value: '3', label: '3' }, { value: '4', label: '4' }] }
    ],
    blocks: {
      name: 'Photo',
      max: 12,
      starter: 4,
      settings: [
        { id: 'image_url', type: 'image', label: 'Photo' },
        { id: 'image_alt', type: 'text',  label: 'Photo description (for screen readers)', default: '' },
        { id: 'link',      type: 'url',   label: 'Page it links to (optional)', default: '' }
      ],
      defaults: { image_url: '', image_alt: '', link: '' }
    }
  },


  // ────────────────────────────────────────────────────────────────────────
  // FAQ — questions that open to show their answer (works without JS).
  // ────────────────────────────────────────────────────────────────────────
  faq: {
    name: 'FAQ',
    description: 'Questions that open to show the answer when tapped.',
    settings: [
      { id: 'heading', type: 'text', label: 'Heading', default: 'Frequently asked questions' }
    ],
    blocks: {
      name: 'Question',
      max: 20,
      starter: 2,
      settings: [
        { id: 'question', type: 'text',     label: 'Question', default: '' },
        { id: 'answer',   type: 'richtext', label: 'Answer', default: '' }
      ],
      defaults: { question: 'Your question here?', answer: '<p>The answer goes here.</p>' }
    }
  },


  // ────────────────────────────────────────────────────────────────────────
  // STORE VISIT — one of our shops (from Admin → Stores) with address,
  // opening hours and a map.
  // ────────────────────────────────────────────────────────────────────────
  'store-visit': {
    name: 'Visit Our Store',
    description: 'One of your shops from Admin → Stores: address, phone, opening hours and a map.',
    settings: [
      { id: 'heading',  type: 'text',   label: 'Heading', default: 'Visit our store' },
      // type 'ref' → a dropdown filled from the stores table
      { id: 'store_id', type: 'ref',    source: 'stores', label: 'Which store?', default: '' },
      { id: 'show_map', type: 'toggle', label: 'Show a map', default: true }
    ]
  },


  // ────────────────────────────────────────────────────────────────────────
  // LOOKBOOK FEATURE — a big link to one published lookbook.
  // ────────────────────────────────────────────────────────────────────────
  'lookbook-feature': {
    name: 'Lookbook',
    description: 'A large picture linking to one of your published lookbooks.',
    settings: [
      { id: 'lookbook_id', type: 'ref',  source: 'lookbooks', label: 'Which lookbook?', default: '' },
      { id: 'heading',     type: 'text', label: 'Heading (leave empty to use the lookbook\'s title)', default: '' },
      { id: 'cta_text',    type: 'text', label: 'Button label', default: 'View the lookbook' }
    ]
  },


  // ────────────────────────────────────────────────────────────────────────
  // VIDEO — a YouTube video. Shows a picture with a play button; the video
  // only loads when someone presses play (/js/video-embed.js).
  // ────────────────────────────────────────────────────────────────────────
  video: {
    name: 'Video',
    allowFullWidth: true,
    description: 'A YouTube video. It only loads when someone presses play, so the page stays fast.',
    settings: [
      { id: 'heading',         type: 'text',  label: 'Heading (optional)', default: '' },
      { id: 'youtube_url',     type: 'url',   label: 'YouTube link (e.g. https://youtu.be/…)', default: '' },
      { id: 'cover_image_url', type: 'image', label: 'Cover picture (optional — YouTube\'s own is used otherwise)' }
    ]
  },


  // ────────────────────────────────────────────────────────────────────────
  // EMAIL SIGN-UP — collects email addresses (with a consent line) for a
  // future newsletter. Saved by /api/newsletter-signup; listed in
  // Admin → Customers → Email sign-ups.
  // ────────────────────────────────────────────────────────────────────────
  'email-signup': {
    name: 'Email Sign-up',
    description: 'A box where visitors leave their email address for news and offers. You can see the list in Admin → Customers.',
    settings: [
      { id: 'heading',         type: 'text',     label: 'Heading', default: 'Stay in touch' },
      { id: 'text',            type: 'textarea', label: 'Text', default: 'New arrivals, store events and members-only offers. No spam.' },
      { id: 'button_label',    type: 'text',     label: 'Button label', default: 'Sign up' },
      { id: 'success_message', type: 'text',     label: 'Message after signing up', default: "Thanks — you're on the list." }
    ]
  }
};


// Add the shared "Style" fields (space above/below, background, width) to
// the end of every section type's settings. See /js/section-style.js.
// "Width" is only added to types marked `allowFullWidth: true`.
for (const schema of Object.values(SECTION_SCHEMAS)) {
  schema.settings.push(
    ...STYLE_FIELDS.filter((f) => !f.onlyIfFullWidth || schema.allowFullWidth)
  );
}


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
    // Newer section types start with a few example blocks (`starter`), so a
    // freshly added section already looks like something.
    out.blocks = [];
    for (let i = 0; i < (schema.blocks.starter || 0); i++) out.blocks.push(buildDefaultBlock(type));
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
