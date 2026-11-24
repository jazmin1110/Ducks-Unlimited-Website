// Tests for /js/theme-fonts.js — the font menu and theme CSS variables.
// Run with:  node --test tests/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HEADING_FONTS, BODY_FONTS, fontStylesheetUrl, themeCssVars } from '../public/js/theme-fonts.js';

test('font menus start with the brand fonts', () => {
  assert.equal(HEADING_FONTS[0], 'Cormorant Garamond');
  assert.equal(BODY_FONTS[0], 'DM Sans');
  assert.equal(HEADING_FONTS.length, 6);
  assert.equal(BODY_FONTS.length, 6);
});

test('a non-default heading font gets a Google Fonts link', () => {
  const url = fontStylesheetUrl({ heading_font: 'Lora', body_font: 'DM Sans' });
  assert.ok(url.startsWith('https://fonts.googleapis.com/css2?'));
  assert.ok(url.includes('family=Lora'));
  assert.ok(url.includes('display=swap'));
  assert.ok(!url.includes('DM+Sans'));
});

test('two-word fonts use + in the link', () => {
  assert.ok(fontStylesheetUrl({ body_font: 'Work Sans' }).includes('family=Work+Sans'));
});

test('default fonts need no extra link', () => {
  assert.equal(fontStylesheetUrl({ heading_font: 'Cormorant Garamond', body_font: 'DM Sans' }), null);
  assert.equal(fontStylesheetUrl(null), null);
});

test('fonts not on the menu are never put in a link', () => {
  assert.equal(fontStylesheetUrl({ heading_font: '<script>' }), null);
});

test('button shapes', () => {
  assert.equal(themeCssVars({ button_shape: 'pill' })['--btn-radius'], '999px');
  assert.equal(themeCssVars({ button_shape: 'square' })['--btn-radius'], '0');
  assert.equal(themeCssVars({ button_shape: 'rounded' })['--btn-radius'], '6px');
  assert.equal(themeCssVars({})['--btn-radius'], undefined);
});

test('colours and fonts become CSS variables', () => {
  const v = themeCssVars({ brand_color: '#1B4D2E', heading_font: 'Lora' });
  assert.equal(v['--color-primary'], '#1B4D2E');
  assert.ok(v['--font-heading'].startsWith("'Lora'"));
});

test('broken colours and unknown fonts are skipped', () => {
  const v = themeCssVars({ brand_color: 'red;}', heading_font: 'Comic Sans' });
  assert.equal(v['--color-primary'], undefined);
  assert.equal(v['--font-heading'], undefined);
});
