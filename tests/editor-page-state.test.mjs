// Tests for /admin/js/editor/page-state.js — moving, copying, hiding,
// removing and restoring sections in the editor (without touching the database).
// Run with:  node --test tests/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  moveSection, duplicateSection, setHidden, markRemoved, unmarkRemoved,
  addSection, visibleSections, canPublish, restoreSnapshot
} from '../public/admin/js/editor/page-state.js';

const sec = (id, settings = {}) => ({ id, section_type: 'richtext', position: 0, settings: { heading: id, ...settings }, isNew: false });
const pageOf = (...ids) => ({ sections: ids.map((id, i) => ({ ...sec(id), position: (i + 1) * 10 })), theme: { brand_color: '#1B4D2E' } });
const ids = (p) => p.sections.map((s) => s.id);

test('moveSection reorders and renumbers without changing the original', () => {
  const p = pageOf('a', 'b', 'c');
  const q = moveSection(p, 0, 2);
  assert.deepEqual(ids(q), ['b', 'c', 'a']);
  assert.deepEqual(q.sections.map((s) => s.position), [10, 20, 30]);
  assert.deepEqual(ids(p), ['a', 'b', 'c']);
});

test('duplicateSection puts a copy right after, with new block ids', () => {
  const p = pageOf('a', 'b');
  p.sections[0].settings.blocks = [{ id: 'blk_1', name: 'Tile' }];
  const q = duplicateSection(p, 'a', 'a2');
  assert.deepEqual(ids(q), ['a', 'a2', 'b']);
  assert.equal(q.sections[1].isNew, true);
  assert.equal(q.sections[1].settings.blocks[0].name, 'Tile');
  assert.notEqual(q.sections[1].settings.blocks[0].id, 'blk_1');
  assert.ok(q.sections[1].settings.blocks[0].id.startsWith('blk_'));
  // the copy is independent of the original
  q.sections[1].settings.heading = 'changed';
  assert.equal(q.sections[0].settings.heading, 'a');
});

test('setHidden and markRemoved set the draft flags', () => {
  const p = pageOf('a', 'b');
  assert.equal(setHidden(p, 'a', true).sections[0].settings._hidden, true);
  assert.equal(setHidden(setHidden(p, 'a', true), 'a', false).sections[0].settings._hidden, undefined);
  const r = markRemoved(p, 'b');
  assert.equal(r.sections[1].settings._removed, true);
  assert.equal(unmarkRemoved(r, 'b').sections[1].settings._removed, undefined);
});

test('a page can have at most 25 sections', () => {
  const p = pageOf(...Array.from({ length: 25 }, (_, i) => `s${i}`));
  assert.throws(() => addSection(p, sec('extra')), { message: 'A page can have at most 25 sections.' });
});

test('removed sections do not count toward the 25', () => {
  let p = pageOf(...Array.from({ length: 25 }, (_, i) => `s${i}`));
  p = markRemoved(p, 's0');
  assert.equal(addSection(p, sec('extra')).sections.length, 26);
});

test('addSection after a given section', () => {
  const p = pageOf('a', 'b');
  assert.deepEqual(ids(addSection(p, sec('n'), 'a')), ['a', 'n', 'b']);
  assert.deepEqual(ids(addSection(p, sec('n'))), ['a', 'b', 'n']);
});

test('visibleSections skips hidden and removed', () => {
  let p = pageOf('a', 'b', 'c');
  p = setHidden(p, 'a', true);
  p = markRemoved(p, 'b');
  assert.deepEqual(visibleSections(p).map((s) => s.id), ['c']);
});

test('an empty homepage cannot be published', () => {
  const p = setHidden(pageOf('a'), 'a', true);
  assert.deepEqual(canPublish(p), {
    ok: false,
    message: 'Your homepage would be empty. Add or show at least one section before publishing.'
  });
  assert.deepEqual(canPublish(pageOf('a')), { ok: true });
});

test('restoreSnapshot: kept, brought back and removed sections', () => {
  // Now: a (changed), c. Snapshot had: a (old text), b (since deleted).
  const current = pageOf('a', 'c');
  current.sections[0].settings.heading = 'new text';
  const snapshot = {
    sections: [
      { id: 'a', section_type: 'richtext', position: 10, settings: { heading: 'old text' } },
      { id: 'b', section_type: 'hero',     position: 20, settings: { headline: 'gone' } }
    ],
    theme: { brand_color: '#000000' }
  };
  let n = 0;
  const q = restoreSnapshot(current, snapshot, () => `new${++n}`);

  const a = q.sections.find((s) => s.id === 'a');
  assert.equal(a.settings.heading, 'old text');
  assert.equal(a.isNew, false);

  const back = q.sections.find((s) => s.id === 'new1');
  assert.equal(back.section_type, 'hero');
  assert.equal(back.isNew, true);
  assert.equal(back.settings.headline, 'gone');

  const c = q.sections.find((s) => s.id === 'c');
  assert.equal(c.settings._removed, true);

  // Order follows the snapshot; removed ones go last.
  assert.deepEqual(ids(q), ['a', 'new1', 'c']);
  assert.equal(q.theme.brand_color, '#000000');
});

test('restoreSnapshot keeps the current theme when the snapshot has none', () => {
  const q = restoreSnapshot(pageOf('a'), { sections: [], theme: null }, () => 'x');
  assert.equal(q.theme.brand_color, '#1B4D2E');
});
