// Run: node --experimental-vm-modules --test tests/session-storage.test.mjs
// Execute the actual app modules with a deterministic clock and in-memory storage.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

process.env.TZ = 'America/Toronto';
const ROOT = new URL('../', import.meta.url);
const PREFS = '@deep_breather/prefs/v1';
const HISTORY = '@deep_breather/history/v1';
const plain = (value) => JSON.parse(JSON.stringify(value));

function clockContext(now = new Date('2026-09-10T12:00:00-04:00').getTime()) {
  const clock = { now };
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock.now])); }
    static now() { return clock.now; }
  }
  return { clock, context: vm.createContext({ Date: ClockDate, process: { env: {} } }) };
}

async function appModule(path, context, imports = {}) {
  const module = new vm.SourceTextModule(await readFile(new URL(path, ROOT), 'utf8'), {
    context, identifier: path,
  });
  await module.link((name) => {
    assert(name in imports, `Unexpected dependency: ${name}`);
    const exports = imports[name];
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  });
  await module.evaluate();
  return module.namespace;
}

async function storageHarness(now) {
  const { clock, context } = clockContext(now);
  const data = new Map();
  const storage = await appModule('src/lib/storage.js', context, {
    '@react-native-async-storage/async-storage': { default: {
      getItem: async (key) => data.get(key) ?? null,
      setItem: async (key, value) => { data.set(key, value); },
    } },
  });
  return { ...storage, data, clock };
}

// This hook host supplies React's state/effect lifecycle, without a DOM, to
// exercise the real session callbacks and ticker through complete rounds.
async function sessionHarness(rounds = 1, testTimings = false) {
  const { clock, context } = clockContext();
  if (testTimings) context.process.env.EXPO_PUBLIC_TEST_TIMINGS = '1';
  const slots = [];
  const timers = new Map();
  let nextTimer = 1;
  let cursor = 0;
  let dirty = false;
  let pendingEffects = [];
  let session;
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    useState(initial) {
      const i = cursor++;
      if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[i].value, (update) => {
        const value = typeof update === 'function' ? update(slots[i].value) : update;
        if (!Object.is(value, slots[i].value)) { slots[i].value = value; dirty = true; }
      }];
    },
    useRef(value) { const i = cursor++; return slots[i] ||= { current: value }; },
    useCallback(fn, deps) {
      const i = cursor++;
      if (!same(slots[i]?.deps, deps)) slots[i] = { fn, deps };
      return slots[i].fn;
    },
    useEffect(fn, deps) {
      const i = cursor++;
      if (!same(slots[i]?.deps, deps)) {
        pendingEffects.push(() => {
          slots[i]?.cleanup?.();
          slots[i] = { deps, cleanup: fn() };
        });
      }
    },
  };
  context.setInterval = (fn, period) => {
    const id = nextTimer++;
    timers.set(id, { fn, period, at: clock.now + period });
    return id;
  };
  context.clearInterval = (id) => timers.delete(id);
  const { TUMMO } = await appModule('src/patterns.js', context);
  const { default: useSession } = await appModule('src/lib/useSession.js', context, {
    react, './haptics': { fire() {} },
  });
  const records = [];
  const onComplete = (record) => records.push(plain(record));
  const render = () => {
    let renders = 0;
    do {
      assert(renders++ < 20, 'Hook renders settle');
      cursor = 0; dirty = false; pendingEffects = [];
      session = useSession(TUMMO, rounds, { onComplete });
      for (const effect of pendingEffects) effect();
    } while (dirty);
  };
  render();
  return {
    get session() { return session; }, records,
    act(control) { session[control](); render(); },
    advance(ms) {
      const target = clock.now + ms;
      while (true) {
        const next = [...timers.values()].sort((a, b) => a.at - b.at)[0];
        if (!next || next.at > target) break;
        clock.now = next.at;
        next.at += next.period;
        next.fn();
        render();
      }
      clock.now = target;
    },
  };
}

test('completed duration excludes pauses in breathing, retention, and recovery', async () => {
  const h = await sessionHarness();
  h.act('start');
  h.advance(1000);
  h.act('pause');
  assert.equal(h.session.remainingMs, 2000);
  h.advance(3600000);
  assert.equal(h.session.phase, 'powerIn');
  h.act('resume');
  h.advance(179000);
  assert.equal(h.session.phase, 'retention');
  h.advance(10000);
  h.act('pause');
  h.advance(120000);
  h.act('resume');
  h.advance(5000);
  h.act('endHold');
  h.advance(7000); // 3s recovery inhale, 4s of the full-lung hold
  h.act('pause');
  assert.equal(h.session.remainingMs, 11000);
  h.advance(1800000);
  h.act('resume');
  h.advance(14000);
  assert.equal(h.session.status, 'done');
  assert.equal(h.records.length, 1);
  assert.deepEqual(h.records[0].retentions, [15]);
  assert.equal(h.records[0].durationS, 216);
  assert.equal(h.records[0].rounds, 1);
  assert.equal(h.records[0].completed, true);
});

test('reset during a paused retention keeps only actual practice and logs once', async () => {
  const h = await sessionHarness(3);
  h.act('start');
  h.advance(188000);
  assert.equal(h.session.phase, 'retention');
  h.act('pause');
  h.advance(3600000);
  h.act('reset');
  h.act('reset');
  assert.equal(h.records.length, 1);
  assert.deepEqual(h.records[0].retentions, [8]);
  assert.equal(h.records[0].durationS, 188);
  assert.equal(h.records[0].rounds, 0);
  assert.equal(h.records[0].plannedRounds, 3);
  assert.equal(h.records[0].completed, false);
  assert.equal(h.session.status, 'idle');
});

test('leaving a just-started session paused for hours does not log practice', async () => {
  const h = await sessionHarness();
  h.act('start');
  h.advance(1000);
  h.act('pause');
  h.advance(10800000);
  h.act('reset');
  assert.deepEqual(h.records, []);
  h.act('start');
  h.advance(3000);
  assert.equal(h.session.phase, 'powerOut');
});

test('paused time cannot make a short retention meet the logging threshold', async () => {
  const h = await sessionHarness(1, true);
  h.act('start');
  h.advance(1600);
  assert.equal(h.session.phase, 'retention');
  h.act('pause');
  h.advance(3600000);
  h.act('reset');
  assert.deepEqual(h.records, []);
});

test('invalid saved preferences recover to usable controls', async () => {
  const h = await storageHarness();
  h.data.set(PREFS, JSON.stringify({ rounds: 'many', trackId: 'missing', volume: -2, haptics: 'no', calmMode: null }));
  assert.deepEqual(plain(await h.loadPrefs()), { rounds: 3, trackId: 'none', volume: 0, haptics: true, calmMode: false });
  h.data.set(PREFS, JSON.stringify({ rounds: 100.6, volume: 7 }));
  assert.equal((await h.loadPrefs()).rounds, 10);
  assert.equal((await h.loadPrefs()).volume, 1);
  h.data.set(PREFS, '{bad JSON');
  assert.deepEqual(plain(await h.loadPrefs()), plain(h.DEFAULT_PREFS));
});

test('malformed history fields cannot break retention charts or totals', async () => {
  const h = await storageHarness();
  h.data.set(HISTORY, JSON.stringify([
    null, { at: 'yesterday' }, { at: 1e20 },
    { at: h.clock.now, retentions: 'broken', durationS: 'many', rounds: -9 },
    { at: h.clock.now, retentions: [12, '20', -1, null, 15.7], durationS: 90, rounds: 2, plannedRounds: 1 },
  ]));
  const history = await h.loadHistory();
  assert.equal(history.length, 2);
  assert.deepEqual(plain(history[0].retentions), []);
  assert.deepEqual(plain(history[1].retentions), [12, 16]);
  assert.equal(history[1].plannedRounds, 2);
  const stats = h.computeStats(history);
  assert.equal(stats.bestRetention, 16);
  assert.equal(stats.totalMinutes, 2);
});

for (const [label, today, dates] of [
  ['spring forward', '2026-03-10', ['2026-03-06', '2026-03-07', '2026-03-08', '2026-03-09', '2026-03-10']],
  ['fall back', '2026-11-03', ['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03']],
]) {
  test(`streaks and seven-day chart follow local dates across ${label}`, async () => {
    const h = await storageHarness(new Date(`${today}T12:00:00`).getTime());
    const history = dates.map((date) => ({ at: new Date(`${date}T12:00:00`).getTime(), durationS: 60, retentions: [10] }));
    const stats = h.computeStats(history);
    assert.equal(stats.streak, 5);
    assert.equal(stats.bestStreak, 5);
    assert.equal(stats.last7.length, 7);
    assert.equal(new Set(stats.last7.map((d) => d.key)).size, 7);
    assert.deepEqual(plain(stats.last7.map((d) => d.count)), [0, 0, 1, 1, 1, 1, 1]);
    assert.equal(h.computeStats(history.slice(0, -1)).streak, 4, 'Yesterday preserves the streak');
  });
}
