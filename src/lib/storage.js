/**
 * Local persistence: preferences, the safety acknowledgement, and the session
 * log that powers stats and streaks.
 *
 * AsyncStorage is backed by SQLite/SharedPreferences on Android and by
 * localStorage on web, so the same calls work on both targets. Everything here
 * is defensive: storage can be full, disabled (private browsing), or hold
 * values written by an older version of the app, and none of that should stop
 * someone from breathing.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const K = {
  prefs: '@deep_breather/prefs/v1',
  history: '@deep_breather/history/v1',
  safety: '@deep_breather/safety_ack/v1',
};

/** Keep the log bounded — a year of daily practice sits well under this. */
const MAX_SESSIONS = 500;

const readJson = async (key, fallback) => {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch (e) {
    return fallback;
  }
};

const writeJson = async (key, value) => {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    return false;
  }
};

// ---- Preferences ------------------------------------------------------------

export const DEFAULT_PREFS = {
  rounds: 3,
  trackId: 'none',
  volume: 0.6,
  haptics: true,
  calmMode: false, // user-forced reduced motion
};

const finiteNumber = (value) => typeof value === 'number' && Number.isFinite(value);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const TRACK_IDS = ['none', 'calm', 'deep', 'flow', 'ember'];

export const loadPrefs = async () => {
  const stored = await readJson(K.prefs, {});
  const p = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
  return {
    ...DEFAULT_PREFS,
    ...p,
    rounds: finiteNumber(p.rounds) ? clamp(Math.round(p.rounds), 1, 10) : DEFAULT_PREFS.rounds,
    trackId: TRACK_IDS.includes(p.trackId) ? p.trackId : DEFAULT_PREFS.trackId,
    volume: finiteNumber(p.volume) ? clamp(p.volume, 0, 1) : DEFAULT_PREFS.volume,
    haptics: typeof p.haptics === 'boolean' ? p.haptics : DEFAULT_PREFS.haptics,
    calmMode: typeof p.calmMode === 'boolean' ? p.calmMode : DEFAULT_PREFS.calmMode,
  };
};

export const savePrefs = (prefs) => writeJson(K.prefs, prefs);

// ---- Safety acknowledgement -------------------------------------------------

export const loadSafetyAck = async () => {
  try {
    return (await AsyncStorage.getItem(K.safety)) === 'yes';
  } catch (e) {
    return false;
  }
};

export const saveSafetyAck = async () => {
  try {
    await AsyncStorage.setItem(K.safety, 'yes');
  } catch (e) {
    /* non-fatal: they will simply see the notice again next launch */
  }
};

// ---- Session history --------------------------------------------------------

/**
 * A logged session.
 * @typedef {{
 *   at: number,            // epoch ms, session end
 *   pattern: string,
 *   rounds: number,        // rounds actually completed
 *   plannedRounds: number,
 *   retentions: number[],  // seconds held per round, in order
 *   durationS: number,
 *   completed: boolean     // ran to the end vs. stopped early
 * }} SessionRecord
 */

const normalizeSession = (record) => {
  if (!record || !finiteNumber(record.at) || !Number.isFinite(new Date(record.at).getTime())) {
    return null;
  }
  const rounds = finiteNumber(record.rounds) ? clamp(Math.round(record.rounds), 0, 10) : 0;
  return {
    at: record.at,
    pattern: typeof record.pattern === 'string' ? record.pattern : 'tummo',
    rounds,
    plannedRounds: finiteNumber(record.plannedRounds)
      ? clamp(Math.round(record.plannedRounds), Math.max(1, rounds), 10)
      : Math.max(1, rounds),
    retentions: Array.isArray(record.retentions)
      ? record.retentions.filter((s) => finiteNumber(s) && s >= 0).slice(0, 10).map(Math.round)
      : [],
    durationS: finiteNumber(record.durationS) ? Math.max(0, Math.round(record.durationS)) : 0,
    completed: record.completed === true,
  };
};

export const loadHistory = async () => {
  const list = await readJson(K.history, []);
  return Array.isArray(list) ? list.map(normalizeSession).filter(Boolean).slice(-MAX_SESSIONS) : [];
};

export const appendSession = async (record) => {
  const list = await loadHistory();
  const next = [...list, record].slice(-MAX_SESSIONS);
  await writeJson(K.history, next);
  return next;
};

export const clearHistory = () => writeJson(K.history, []);

// ---- Derived stats ----------------------------------------------------------

const dayKey = (ms) => {
  const d = new Date(ms);
  // Local midnight, so "today" means the user's today, not UTC's.
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
};

const startOfLocalDay = (ms) => {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const DAY = 86400000;

// Calendar days are not always 24 hours long in the user's time zone.
const shiftLocalDay = (ms, offset) => {
  const d = new Date(ms);
  d.setDate(d.getDate() + offset);
  return d.getTime();
};

const calendarDayNumber = (ms) => {
  const d = new Date(ms);
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY;
};

/**
 * Current streak = consecutive local days with at least one session, counting
 * back from today. Practising yesterday but not yet today keeps the streak
 * alive (it only breaks once a full day is missed).
 */
export const computeStats = (history) => {
  if (!history.length) {
    return {
      total: 0,
      streak: 0,
      bestStreak: 0,
      bestRetention: 0,
      lastRetentions: [],
      totalMinutes: 0,
      last7: [],
    };
  }

  const days = new Set(history.map((s) => dayKey(s.at)));
  const today = startOfLocalDay(Date.now());

  let streak = 0;
  let cursor = days.has(dayKey(today)) ? today : shiftLocalDay(today, -1);
  if (days.has(dayKey(cursor))) {
    while (days.has(dayKey(cursor))) {
      streak += 1;
      cursor = shiftLocalDay(cursor, -1);
    }
  }

  // Best streak across the whole log.
  const sortedDays = [...days]
    .map((k) => {
      const [y, m, d] = k.split('-').map(Number);
      return new Date(y, m - 1, d).getTime();
    })
    .sort((a, b) => a - b);
  let bestStreak = sortedDays.length ? 1 : 0;
  let run = 1;
  for (let i = 1; i < sortedDays.length; i += 1) {
    run = calendarDayNumber(sortedDays[i]) - calendarDayNumber(sortedDays[i - 1]) === 1
      ? run + 1 : 1;
    if (run > bestStreak) bestStreak = run;
  }

  const allRetentions = history.flatMap((s) => s.retentions || []);
  const last = history[history.length - 1];

  // Sessions per day for the last 7 local days, oldest first.
  const last7 = Array.from({ length: 7 }, (_, i) => {
    const ms = shiftLocalDay(today, i - 6);
    const key = dayKey(ms);
    return {
      key,
      label: new Date(ms).toLocaleDateString(undefined, { weekday: 'narrow' }),
      count: history.filter((s) => dayKey(s.at) === key).length,
    };
  });

  return {
    total: history.length,
    streak,
    bestStreak,
    bestRetention: allRetentions.length ? Math.max(...allRetentions) : 0,
    lastRetentions: last?.retentions || [],
    totalMinutes: Math.round(history.reduce((sum, s) => sum + (s.durationS || 0), 0) / 60),
    last7,
  };
};

export const formatDuration = (secs) => {
  const s = Math.max(0, Math.round(secs));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}m ${String(s % 60).padStart(2, '0')}s` : `${s}s`;
};
