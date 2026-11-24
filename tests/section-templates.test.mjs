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
