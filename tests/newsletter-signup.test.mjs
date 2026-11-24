// Tests for /api/newsletter-signup.js — the "Email sign-up" section's form.
// Run with:  node --test tests/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidEmail, safeReturnPath } from '../api/newsletter-signup.js';

test('isValidEmail accepts a normal address', () => {
  assert.equal(isValidEmail('a@b.co'), true);
  assert.equal(isValidEmail('  juan.dela.cruz@gmail.com  '), true);
});

test('isValidEmail refuses broken addresses', () => {
  assert.equal(isValidEmail('a@b'), false);           // no dot in the domain
  assert.equal(isValidEmail('a b@c.com'), false);     // space
  assert.equal(isValidEmail(''), false);
  assert.equal(isValidEmail('a@@b.com'), false);      // two @
  assert.equal(isValidEmail('@b.com'), false);        // nothing before @
  assert.equal(isValidEmail('a'.repeat(250) + '@b.co'), false); // 255 characters
  assert.equal(isValidEmail(null), false);
});

test('safeReturnPath only allows pages on this website', () => {
  assert.equal(safeReturnPath('/du/'), '/du/');
  assert.equal(safeReturnPath('//evil.com/'), '/');
  assert.equal(safeReturnPath('https://evil.com/'), '/');
  assert.equal(safeReturnPath('/\\evil.com'), '/');
  assert.equal(safeReturnPath(''), '/');
});
