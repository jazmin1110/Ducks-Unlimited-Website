// Tests for /js/section-style.js — the "Style" settings every section has
// (space above/below, background, width) and how they become CSS classes.
// Run with:  node --test tests/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDarkColor, sectionWrapperAttrs } from '../public/js/section-style.js';
import { SECTION_SCHEMAS, buildDefaultSettings } from '../public/js/section-schemas.js';
import { renderSectionsHtml } from '../public/js/section-templates.js';

test('forest green is dark, ivory is not', () => {
  assert.equal(isDarkColor('#1B4D2E'), true);
  assert.equal(isDarkColor('#F5F0E8'), false);
  assert.equal(isDarkColor('#000'), true);
});

test('gold accent counts as light (dark text reads better on it)', () => {
  assert.equal(isDarkColor('#C9A84C'), false);
});

test('a broken colour is treated as light', () => {
  assert.equal(isDarkColor('nope'), false);
  assert.equal(isDarkColor(''), false);
});

test('large space and brand background give dark-section classes', () => {
  const { className } = sectionWrapperAttrs({ space_above: 'lg', background: 'brand' }, { brand_color: '#1B4D2E' });
  assert.ok(className.includes('sec--above-lg'));
  assert.ok(className.includes('sec--dark'));
});

test('custom background sets a colour variable', () => {
  const { className, style } = sectionWrapperAttrs({ background: 'custom', background_custom: '#000000' }, null);
  assert.ok(style.includes('--sec-bg:#000000'));
  assert.ok(className.includes('sec--dark'));
});

test('custom background that is not a real colour is ignored', () => {
  const { style } = sectionWrapperAttrs({ background: 'custom', background_custom: 'red;}body{display:none' }, null);
  assert.equal(style, '');
});

test('no style settings give the defaults (no visible change)', () => {
  const { className, style } = sectionWrapperAttrs({}, null);
  assert.equal(className, 'sec sec--above-md sec--below-md sec--bg-page');
  assert.equal(style, '');
});

test('unknown choices fall back to defaults', () => {
  const { className } = sectionWrapperAttrs({ space_above: 'huge', background: 'pink' }, null);
  assert.equal(className, 'sec sec--above-md sec--below-md sec--bg-page');
});

test('full width only when chosen', () => {
  assert.ok(sectionWrapperAttrs({ width: 'full' }, null).className.includes('sec--full'));
});

test('every section type has the Style settings', () => {
  for (const [type, schema] of Object.entries(SECTION_SCHEMAS)) {
    assert.ok(schema.settings.some((f) => f.id === 'space_above'), `${type} is missing space_above`);
  }
});

test('new sections start with page background', () => {
  assert.equal(buildDefaultSettings('hero').background, 'page');
});

test('only some section types offer full width', () => {
  const has = (t) => SECTION_SCHEMAS[t].settings.some((f) => f.id === 'width');
  assert.equal(has('hero'), true);
  assert.equal(has('richtext'), false);
});

test('rendered sections are wrapped with their style classes', () => {
  const html = renderSectionsHtml(
    [{ id: 's1', section_type: 'richtext', settings: { heading: 'Hi', space_above: 'sm' } }],
    { brandSlug: 'du', editor: false }
  );
  assert.match(html, /<div class="sec [^"]*sec--above-sm/);
});

test('no form label asks people to type HTML', () => {
  for (const schema of Object.values(SECTION_SCHEMAS)) {
    for (const f of schema.settings) {
      assert.ok(!/<br>|<p>/.test(f.label), `label "${f.label}" mentions HTML`);
    }
  }
});
