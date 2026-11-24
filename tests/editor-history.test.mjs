// Tests for /admin/js/editor/history.js — the editor's Undo / Redo memory.
// Run with:  node --test tests/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHistory } from '../public/admin/js/editor/history.js';

const page = (label) => ({ sections: [{ id: 's1', section_type: 'richtext', position: 10, settings: { heading: label }, isNew: false }], theme: {} });
const heading = (p) => p.sections[0].settings.heading;

// A fake clock we can move by hand.
function clock() {
  let t = 0;
  return { now: () => t, set: (v) => { t = v; } };
}

test('undo walks back and redo walks forward', () => {
  const c = clock();
  const h = createHistory({ now: c.now });
  h.reset(page('A'));
  c.set(1000); h.record(page('B'));
  c.set(2000); h.record(page('C'));
  assert.equal(heading(h.undo()), 'B');
  assert.equal(heading(h.undo()), 'A');
  assert.equal(h.canUndo(), false);
  assert.equal(heading(h.redo()), 'B');
});

test('a new change after undo clears redo', () => {
  const c = clock();
  const h = createHistory({ now: c.now });
  h.reset(page('A'));
  c.set(1000); h.record(page('B'));
  h.undo();
  c.set(2000); h.record(page('D'));
  assert.equal(h.canRedo(), false);
  assert.equal(heading(h.undo()), 'A');
});

test('typing in one field quickly is one undo step', () => {
  const c = clock();
  const h = createHistory({ now: c.now, groupMs: 600 });
  h.reset(page('A'));
  c.set(1000); h.record(page('Ab'), 'hero.headline');
  c.set(1300); h.record(page('Abc'), 'hero.headline');
  assert.equal(heading(h.undo()), 'A');
});

test('a pause in typing starts a new undo step', () => {
  const c = clock();
  const h = createHistory({ now: c.now, groupMs: 600 });
  h.reset(page('A'));
  c.set(1000); h.record(page('Ab'), 'hero.headline');
  c.set(1900); h.record(page('Abc'), 'hero.headline');
  assert.equal(heading(h.undo()), 'Ab');
});

test('different fields are different steps even when fast', () => {
  const c = clock();
  const h = createHistory({ now: c.now, groupMs: 600 });
  h.reset(page('A'));
  c.set(1000); h.record(page('B'), 'f1');
  c.set(1100); h.record(page('C'), 'f2');
  assert.equal(heading(h.undo()), 'B');
});

test('only the last N steps are kept', () => {
  const c = clock();
  const h = createHistory({ now: c.now, limit: 3 });
  h.reset(page('0'));
  for (let i = 1; i <= 5; i++) { c.set(i * 1000); h.record(page(String(i))); }
  assert.equal(heading(h.undo()), '4');
  assert.equal(heading(h.undo()), '3');
  assert.equal(heading(h.undo()), '2');
  assert.equal(h.undo(), null);
});

test('changing a page after recording does not change history', () => {
  const c = clock();
  const h = createHistory({ now: c.now });
  const a = page('A');
  h.reset(a);
  a.sections[0].settings.heading = 'changed';
  c.set(1000); h.record(page('B'));
  const back = h.undo();
  assert.equal(heading(back), 'A');
  back.sections[0].settings.heading = 'x';
  h.redo();
  assert.equal(heading(h.undo()), 'A');
});

test('nothing to undo returns null', () => {
  const h = createHistory();
  h.reset(page('A'));
  assert.equal(h.undo(), null);
  assert.equal(h.redo(), null);
});
