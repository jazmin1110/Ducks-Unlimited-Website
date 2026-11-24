// Tests for /admin/js/editor/save.js — creating a brand-new section's row
// in a way that is safe to retry after a dropped connection.
// Run with:  node --test tests/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { insertNewSection } from '../public/admin/js/editor/save.js';

// A pretend Supabase client that records what it was asked to do.
function fakeClient({ insertError = null, updateError = null } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      return {
        insert(row) { calls.push(['insert', table, row]); return Promise.resolve({ error: insertError }); },
        update(values) {
          return { eq(col, val) { calls.push(['update', table, values, col, val]); return Promise.resolve({ error: updateError }); } };
        }
      };
    }
  };
}

const row = { id: 'n1', page_key: 'home', brand_id: 'b', section_type: 'faq', position: 100010, draft_position: 10, published: null, draft: { heading: 'x' } };

test('a new section is inserted once', async () => {
  const c = fakeClient();
  await insertNewSection(c, row);
  assert.deepEqual(c.calls.map((x) => x[0]), ['insert']);
});

test('if an earlier try already created the row, it is updated instead of failing forever', async () => {
  // 23505 = "that id already exists" (the first insert reached the server
  // but its answer was lost).
  const c = fakeClient({ insertError: { code: '23505', message: 'duplicate key' } });
  await insertNewSection(c, row);
  assert.deepEqual(c.calls.map((x) => x[0]), ['insert', 'update']);
  const [, , values, col, val] = c.calls[1];
  assert.deepEqual(values, { draft: row.draft, draft_position: 10 });
  assert.equal(col, 'id');
  assert.equal(val, 'n1');
});

test('other errors are reported so autosave retries', async () => {
  const c = fakeClient({ insertError: { code: '500', message: 'offline' } });
  await assert.rejects(() => insertNewSection(c, row), /offline/);
});
