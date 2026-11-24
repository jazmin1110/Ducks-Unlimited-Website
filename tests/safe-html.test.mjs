// Tests for /js/safe-html.js — the cleaner that keeps only safe formatting
// (bold, italic, links, paragraphs, line breaks) in text people type or paste.
// Run all tests with:  node --test tests/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeHtml, htmlToPlainText } from '../public/js/safe-html.js';

test('keeps line breaks', () => {
  assert.equal(sanitizeHtml('Hello<br>World'), 'Hello<br>World');
});

test('keeps paragraphs', () => {
  assert.equal(sanitizeHtml('<p>One</p><p>Two</p>'), '<p>One</p><p>Two</p>');
});

test('turns <b>/<i> into <strong>/<em>', () => {
  assert.equal(sanitizeHtml('<b>x</b><i>y</i>'), '<strong>x</strong><em>y</em>');
});

test('drops scripts and what is inside them', () => {
  assert.equal(sanitizeHtml('<script>alert(1)</script>Hi'), 'Hi');
});

test('drops style and onclick attributes', () => {
  assert.equal(sanitizeHtml('<p style="color:red" onclick="x()">Hi</p>'), '<p>Hi</p>');
});

test('drops javascript: links but keeps the words', () => {
  assert.equal(sanitizeHtml('<a href="javascript:alert(1)">x</a>'), 'x');
});

test('drops disguised javascript: links', () => {
  assert.equal(sanitizeHtml('<a href=" JaVaScRiPt:alert(1)">x</a>'), 'x');
  assert.equal(sanitizeHtml('<a href="java\tscript:alert(1)">x</a>'), 'x');
});

test('keeps links to our own pages', () => {
  assert.equal(sanitizeHtml('<a href="/shop.html">Shop</a>'), '<a href="/shop.html">Shop</a>');
});

test('outside links open in a new tab safely', () => {
  assert.equal(
    sanitizeHtml('<a href="https://x.com">X</a>'),
    '<a href="https://x.com" rel="noopener" target="_blank">X</a>'
  );
});

test('strips Word / Google Docs wrappers', () => {
  assert.equal(sanitizeHtml('<span class="MsoNormal"><font face="Arial">Word</font></span>'), 'Word');
});

test('closes tags left open', () => {
  assert.equal(sanitizeHtml('<strong>open'), '<strong>open</strong>');
});

test('escapes stray < and &', () => {
  assert.equal(sanitizeHtml('a < b & c'), 'a &lt; b &amp; c');
});

test('drops images with event handlers', () => {
  assert.equal(sanitizeHtml('<img src=x onerror=alert(1)>'), '');
});

test('empty input gives empty string', () => {
  assert.equal(sanitizeHtml(null), '');
  assert.equal(sanitizeHtml(undefined), '');
});

test('quotes in a link address cannot break out', () => {
  assert.equal(
    sanitizeHtml('<a href="/x&quot; onclick=&quot;y">a</a>'),
    '<a href="/x&quot; onclick=&quot;y">a</a>'
  );
});

test('htmlToPlainText joins paragraphs with spaces', () => {
  assert.equal(htmlToPlainText('<p>Made in</p><p>PH</p>'), 'Made in PH');
});

test('cleaning twice gives the same result as once', () => {
  const messy = '<p style="x">Tom &amp; Jerry <b>bold</b> <a href="https://a.com/?x=1&y=2">link</a> a < b';
  const once = sanitizeHtml(messy);
  assert.equal(sanitizeHtml(once), once);
});
