// Tests for /js/section-templates.js — turns a list of homepage sections into
// HTML. The live site and the editor's preview both use this same file.
// Run with:  node --test tests/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderSectionsHtml } from '../public/js/section-templates.js';

// A minimal "render context" — what the page knows while drawing sections.
const ctx = (extra = {}) => ({
  brandSlug: 'du',
  brandName: 'Ducks Unlimited',
  brandTagline: '',
  productsByCollection: {},
  storesById: {},
  lookbooksById: {},
  theme: null,
  editor: false,
  ...extra
});

const section = (id, section_type, settings) => ({ id, section_type, settings });

test('rich text is cleaned: headings show, scripts do not', () => {
  const html = renderSectionsHtml(
    [section('s1', 'richtext', { heading: 'Hi', body: '<p>x</p><script>y</script>' })],
    ctx()
  );
  assert.match(html, /<h2[^>]*>Hi<\/h2>/);
  assert.ok(html.includes('<p>x</p>'));
  assert.ok(!html.includes('<script'));
});

test('hidden sections are not drawn', () => {
  const html = renderSectionsHtml([section('s1', 'richtext', { heading: 'Hi', _hidden: true })], ctx());
  assert.equal(html.trim(), '');
});

test('removed sections are not drawn', () => {
  const html = renderSectionsHtml([section('s1', 'richtext', { heading: 'Hi', _removed: true })], ctx());
  assert.equal(html.trim(), '');
});

test('unknown section types leave a comment instead of breaking', () => {
  const html = renderSectionsHtml([section('s1', 'nope', {})], ctx());
  assert.ok(html.includes('<!-- unknown section type: nope -->'));
});

test('editor mode tags each section so it can be clicked', () => {
  const sections = [section('s1', 'richtext', { heading: 'Hi' })];
  assert.ok(renderSectionsHtml(sections, ctx({ editor: true })).includes('data-editor-section-id="s1"'));
  assert.ok(!renderSectionsHtml(sections, ctx({ editor: false })).includes('data-editor-section-id'));
});

test('hero without a photo still draws for Rocwood', () => {
  const html = renderSectionsHtml(
    [section('s1', 'hero', { headline: 'Rugged<br>basics', image_url: '' })],
    ctx({ brandSlug: 'rw', brandName: 'Rocwood' })
  );
  assert.ok(html.includes('Rugged<br>basics'));
});

test('product rail shows brand name on cards with no photo', () => {
  const html = renderSectionsHtml(
    [section('s1', 'product-rail', { heading: 'New', collection: 'new', max_products: 4 })],
    ctx({ productsByCollection: { new: [{ id: 'p1', name: 'Polo', price: 1250, image_url: '' }] } })
  );
  assert.ok(html.includes('Polo'));
  assert.ok(html.includes('₱1,250.00'));
  assert.ok(html.includes('Ducks Unlimited'));
});

test('homepage and preview load the renderer with a version number (beats day-old caches)', () => {
  for (const file of ['public/home.html', 'public/preview-home.html']) {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.ok(text.includes('/js/sections-render.js?v='), `${file} must import /js/sections-render.js?v=…`);
  }
});


// ── Task 12: new content sections ───────────────────────────────────────────
import { buildDefaultSettings, listSectionTypes } from '../public/js/section-schemas.js';

const NEW_TYPES = ['image-banner', 'slideshow', 'multicolumn', 'testimonials', 'image-gallery', 'faq'];

test('each new section type renders from its defaults and shows its heading', () => {
  for (const type of NEW_TYPES) {
    const settings = buildDefaultSettings(type);
    // Slideshows have no section heading — their slides do.
    if (type === 'slideshow') settings.blocks[0].heading = `H-${type}`;
    else settings.heading = `H-${type}`;
    const html = renderSectionsHtml([section('s1', type, settings)], ctx());
    assert.ok(html.includes(`H-${type}`), `${type} should show its heading`);
  }
});

test('new sections with blocks start with a few example blocks', () => {
  for (const type of ['slideshow', 'multicolumn', 'testimonials', 'image-gallery', 'faq']) {
    assert.ok(buildDefaultSettings(type).blocks.length >= 2, `${type} starter blocks`);
  }
  // Existing type keeps starting empty, as before.
  assert.equal(buildDefaultSettings('category-tiles').blocks.length, 0);
});

test('faq uses <details> and <summary> so it opens without JavaScript', () => {
  const html = renderSectionsHtml([section('s1', 'faq', {
    heading: 'FAQ', blocks: [{ id: 'b1', question: 'Do you ship?', answer: '<p>Yes.</p>' }]
  })], ctx());
  assert.ok(html.includes('<details'));
  assert.ok(html.includes('<summary'));
  assert.ok(html.includes('Do you ship?'));
});

test('slideshow: only the first slide is visible without JavaScript', () => {
  const html = renderSectionsHtml([section('s1', 'slideshow', {
    autoplay: true, seconds: 5,
    blocks: [{ id: 'a', heading: 'One' }, { id: 'b', heading: 'Two' }]
  })], ctx());
  assert.ok(html.includes('data-slideshow'));
  const slides = html.match(/<div class="slideshow__slide[^"]*"[^>]*>/g) || [];
  assert.equal(slides.length, 2);
  assert.ok(!slides[0].includes('hidden'));
  assert.ok(slides[1].includes('hidden'));
});

test('multicolumn: the column count becomes a class', () => {
  const html = renderSectionsHtml([section('s1', 'multicolumn', {
    heading: 'Why us', columns: '4', blocks: [{ id: 'a', heading: 'A' }]
  })], ctx());
  assert.ok(html.includes('multicolumn--4'));
});

test('text typed into a block can never become a script', () => {
  const evil = '<script>alert(1)</script>';
  const all = [
    section('a', 'testimonials', { heading: 'x', blocks: [{ id: 'b', quote: evil, name: evil, place: evil }] }),
    section('b', 'faq',          { heading: 'x', blocks: [{ id: 'b', question: evil, answer: evil }] }),
    section('c', 'multicolumn',  { heading: 'x', columns: '3', blocks: [{ id: 'b', heading: evil, text: evil }] }),
    section('d', 'slideshow',    { blocks: [{ id: 'b', heading: evil, text: evil, cta_text: evil, cta_link: '/x' }] }),
    section('e', 'image-banner', { heading: evil, text: evil }),
    section('f', 'image-gallery',{ heading: evil, columns: '4', blocks: [{ id: 'b', image_alt: evil, image_url: '' }] })
  ];
  const html = renderSectionsHtml(all, ctx());
  assert.ok(!html.includes('<script'));
});

test('the Add section picker lists all 11 section types', () => {
  const types = listSectionTypes().map((t) => t.type);
  for (const t of ['hero', 'category-tiles', 'product-rail', 'editorial-block', 'richtext', ...NEW_TYPES]) {
    assert.ok(types.includes(t), `missing ${t}`);
  }
});


// ── Task 13: store visit, lookbook feature, YouTube video ───────────────────
import { youtubeId } from '../public/js/section-templates.js';

test('youtubeId understands the usual YouTube links and nothing else', () => {
  assert.equal(youtubeId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3'), 'dQw4w9WgXcQ');
  assert.equal(youtubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(youtubeId('https://www.youtube.com/embed/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(youtubeId('https://vimeo.com/1'), null);
  assert.equal(youtubeId('javascript:alert(1)'), null);
  assert.equal(youtubeId(''), null);
});

test('video shows a cover with the video id, and no player until clicked', () => {
  const html = renderSectionsHtml([section('v', 'video', {
    heading: 'Watch', youtube_url: 'https://youtu.be/dQw4w9WgXcQ'
  })], ctx());
  assert.ok(html.includes('data-video-id="dQw4w9WgXcQ"'));
  assert.ok(!html.includes('<iframe'));
});

test('video with a link that is not YouTube shows nothing', () => {
  const html = renderSectionsHtml([section('v', 'video', { youtube_url: 'https://vimeo.com/1' })], ctx());
  assert.ok(!html.includes('data-video-id'));
});

const GREENHILLS = {
  id: 'st1', name: 'Greenhills Shopping Center', address: 'Ortigas Ave', city: 'San Juan',
  phone: '0917 530 5428', hours: { Mon: '10:00 – 20:00', Sun: '11:00 – 19:00' }, lat: 14.6047, lng: 121.0411
};

test('store visit shows the address, and the map only when asked', () => {
  const withMap = renderSectionsHtml([section('s', 'store-visit', { heading: 'Visit us', store_id: 'st1', show_map: true })],
    ctx({ storesById: { st1: GREENHILLS } }));
  assert.ok(withMap.includes('Ortigas Ave'));
  assert.ok(withMap.includes('<iframe'));
  const noMap = renderSectionsHtml([section('s', 'store-visit', { heading: 'Visit us', store_id: 'st1', show_map: false })],
    ctx({ storesById: { st1: GREENHILLS } }));
  assert.ok(noMap.includes('Ortigas Ave'));
  assert.ok(!noMap.includes('<iframe'));
});

test('store visit for a store that no longer exists shows nothing', () => {
  const html = renderSectionsHtml([section('s', 'store-visit', { heading: 'Visit us', store_id: 'gone' })], ctx());
  assert.ok(!html.includes('Visit us'));
});

test('lookbook feature links to the lookbook page', () => {
  const html = renderSectionsHtml([section('l', 'lookbook-feature', { lookbook_id: 'lb1' })],
    ctx({ lookbooksById: { lb1: { id: 'lb1', slug: 'holiday-2026', title: 'Holiday 2026', subtitle: '', hero_image: '' } } }));
  assert.ok(html.includes('/lookbooks/view.html?slug=holiday-2026'));
  assert.ok(html.includes('Holiday 2026'));
});


// ── Task 14: email sign-up ──────────────────────────────────────────────────
test('email sign-up: posts to the API, has the consent line and a bot trap', () => {
  const html = renderSectionsHtml([section('e', 'email-signup', { heading: 'Stay in touch' })],
    ctx({ brandSlug: 'rw', brandName: 'Rocwood' }));
  assert.ok(html.includes('action="/api/newsletter-signup"'));
  assert.ok(html.includes('method="post"'));
  assert.ok(html.includes('By signing up you agree to receive emails from Rocwood. See our <a href="/customer-service/privacy.html">Privacy Policy</a>.'));
  assert.ok(/<input[^>]*name="website"/.test(html));
  assert.ok(html.includes('value="rw"'));
  assert.ok(html.includes('value="/rw/"'));
});


// ── Review fix: addresses typed into link and photo fields ─────────────────
test('a javascript: address in any link field never reaches the page', () => {
  const bad = 'javascript:alert(1)';
  const html = renderSectionsHtml([
    section('a', 'hero', { headline: 'x', cta_text: 'Go', cta_link: bad }),
    section('b', 'category-tiles', { heading: 'x', blocks: [{ id: 't', name: 'T', link: bad }] }),
    section('c', 'image-banner', { heading: 'x', cta_text: 'Go', cta_link: bad }),
    section('d', 'multicolumn', { heading: 'x', columns: '3', blocks: [{ id: 'm', heading: 'M', link: bad }] }),
    section('e', 'image-gallery', { heading: 'x', columns: '4', blocks: [{ id: 'g', image_url: bad, link: bad }] }),
    section('f', 'slideshow', { blocks: [{ id: 's', heading: 'S', cta_text: 'Go', cta_link: bad, image_url: bad }] }),
    section('g', 'editorial-block', { headline: 'x', cta_text: 'Go', cta_link: bad, image_url: bad }),
    section('h', 'product-rail', { heading: 'x', collection: 'new', cta_text: 'Go', cta_link: bad })
  ], ctx());
  assert.ok(!/javascript:/i.test(html));
});

test('a photo address with a quote in it cannot add attributes', () => {
  const html = renderSectionsHtml([
    section('a', 'hero', { headline: 'x', image_url: 'https://x/a.jpg" onmouseover="alert(1)' }),
    section('b', 'image-banner', { heading: 'x', image_url: 'https://x/a.jpg" onerror="alert(1)' })
  ], ctx());
  // A real new attribute = a closing quote, then a space, then on…=
  assert.ok(!/"\s+on[a-z]+=/i.test(html));
});
