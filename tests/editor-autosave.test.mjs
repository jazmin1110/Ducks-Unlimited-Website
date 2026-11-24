// Tests for /admin/js/editor/autosave.js — saves the draft a moment after
// the last change, and keeps retrying if the internet drops.
// Run with:  node --test tests/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAutosave } from '../public/admin/js/editor/autosave.js';

// Fake timers we can fire by hand.
function fakeTimers() {
  let nextId = 1;
  const timers = new Map();
  return {
    setTimer: (fn, ms) => { const id = nextId++; timers.set(id, { fn, ms }); return id; },
    clearTimer: (id) => { timers.delete(id); },
    pending: () => [...timers.values()],
    async fireAll() {
      const list = [...timers.entries()];
      timers.clear();
      for (const [, t] of list) await t.fn();
      // let promise callbacks settle
      await new Promise((r) => setImmediate(r));
    }
  };
}

test('several quick changes are saved once', async () => {
  const t = fakeTimers();
  let saves = 0;
  const a = createAutosave({ save: async () => { saves++; }, setTimer: t.setTimer, clearTimer: t.clearTimer });
  a.schedule(); a.schedule(); a.schedule();
  assert.equal(t.pending().length, 1);
  assert.equal(t.pending()[0].ms, 2000);
  await t.fireAll();
  assert.equal(saves, 1);
});

test('a failed save says so and tries again', async () => {
  const t = fakeTimers();
  const statuses = [];
  let calls = 0;
  const a = createAutosave({
    save: async () => { calls++; if (calls === 1) throw new Error('offline'); },
    onStatus: (s) => statuses.push(s),
    setTimer: t.setTimer, clearTimer: t.clearTimer
  });
  a.schedule();
  await t.fireAll();                   // first try fails
  assert.equal(t.pending()[0].ms, 2000); // retry waits 2s
  await t.fireAll();                   // second try works
  assert.equal(calls, 2);
  assert.deepEqual(statuses, ['saving', 'error', 'saving', 'saved']);
});

test('retries wait longer each time, then stay at the longest wait', async () => {
  const t = fakeTimers();
  const a = createAutosave({
    save: async () => { throw new Error('offline'); },
    retryMs: [2000, 5000],
    setTimer: t.setTimer, clearTimer: t.clearTimer
  });
  a.schedule();
  await t.fireAll(); assert.equal(t.pending()[0].ms, 2000);
  await t.fireAll(); assert.equal(t.pending()[0].ms, 5000);
  await t.fireAll(); assert.equal(t.pending()[0].ms, 5000);
});

test('hasPending is true until a save succeeds', async () => {
  const t = fakeTimers();
  const a = createAutosave({ save: async () => {}, setTimer: t.setTimer, clearTimer: t.clearTimer });
  assert.equal(a.hasPending(), false);
  a.schedule();
  assert.equal(a.hasPending(), true);
  await t.fireAll();
  assert.equal(a.hasPending(), false);
});

test('a change made during a save is saved afterwards', async () => {
  const t = fakeTimers();
  let saves = 0;
  let a;
  a = createAutosave({
    save: async () => { saves++; if (saves === 1) a.schedule(); },
    setTimer: t.setTimer, clearTimer: t.clearTimer
  });
  a.schedule();
  await t.fireAll();
  assert.equal(a.hasPending(), true);
  await t.fireAll();
  assert.equal(saves, 2);
  assert.equal(a.hasPending(), false);
});

test('flushNow saves straight away', async () => {
  const t = fakeTimers();
  let saves = 0;
  const a = createAutosave({ save: async () => { saves++; }, setTimer: t.setTimer, clearTimer: t.clearTimer });
  a.schedule();
  await a.flushNow();
  assert.equal(saves, 1);
  assert.equal(t.pending().length, 0);
});

test('flushNow with nothing to save does nothing', async () => {
  let saves = 0;
  const a = createAutosave({ save: async () => { saves++; } });
  await a.flushNow();
  assert.equal(saves, 0);
});

test('flushNow reports a failure to the caller', async () => {
  const t = fakeTimers();
  const a = createAutosave({ save: async () => { throw new Error('offline'); }, setTimer: t.setTimer, clearTimer: t.clearTimer });
  a.schedule();
  await assert.rejects(() => a.flushNow(), /offline/);
});
