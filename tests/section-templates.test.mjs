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
