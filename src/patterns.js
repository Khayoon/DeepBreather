/**
 * Breathing patterns as data.
 *
 * A pattern owns two things: a map of phases (what the screen shows, how long
 * it lasts, how the orb should move) and an `advance` function that decides
 * what comes next given the current context. Keeping the transition logic here
 * rather than inside the screen means a new pattern is a new object in this
 * file — the engine, orb and UI need no changes.
 *
 * Phase shape:
 *   key        stable id
 *   title      large text
 *   sub        instruction line
 *   motion     'expand' | 'contract' | 'holdLow' | 'holdHigh' | 'rest'
 *   duration   ms, or null for an open-ended phase the user ends themselves
 *   countdown  seconds to count DOWN from (mutually exclusive with duration)
 *   countUp    true to count UP for an open-ended phase
 *   haptic     'light' | 'medium' | 'warn' | null
 *   cue        short screen-reader/tone cue name
 */

/**
 * The end-to-end test drives a real build through every phase, and a real
 * session is minutes long. EXPO_PUBLIC_TEST_TIMINGS shrinks the numbers at
 * build time; the state machine, the wiring and the UI are untouched.
 * EXPO_PUBLIC_* variables are inlined by Metro, so this costs nothing at
 * runtime in a normal build.
 */
const TEST_TIMINGS = process.env.EXPO_PUBLIC_TEST_TIMINGS === '1';

export const TUMMO_DEFAULTS = TEST_TIMINGS
  ? {
      breathsPerRound: 3,
      powerInMs: 90,
      powerOutMs: 60,
      recoveryInMs: 300,
      recoveryHoldS: 2,
      releaseMs: 300,
    }
  : {
      breathsPerRound: 30,
      powerInMs: 3000, // unhurried inhale through the nose
      powerOutMs: 3000, // relaxed exhale (~6s per breath)
      recoveryInMs: 3000,
      recoveryHoldS: 15,
      releaseMs: 3000,
    };

const t = TUMMO_DEFAULTS;

export const TUMMO = {
  id: 'tummo',
  name: 'Tummo rounds',
  tagline: 'Wim Hof style: 30 power breaths, retention, recovery hold.',
  defaultRounds: 3,
  minRounds: 1,
  maxRounds: 10,
  /** Retention is the point of the practice, so it is never on a timer. */
  hasOpenRetention: true,

  phases: {
    idle: {
      key: 'idle',
      title: 'Deep Breather',
      sub: 'Tummo breathing — press start',
      motion: 'rest',
      duration: null,
      haptic: null,
    },
    powerIn: {
      key: 'powerIn',
      title: 'Breathe in',
      sub: 'slow and steady, through the nose',
      motion: 'expand',
      duration: t.powerInMs,
      haptic: 'light',
      cue: 'in',
    },
    powerOut: {
      key: 'powerOut',
      title: 'Let go',
      sub: 'relaxed exhale, through the mouth',
      motion: 'contract',
      duration: t.powerOutMs,
      haptic: 'light',
      cue: 'out',
    },
    retention: {
      key: 'retention',
      title: 'Hold — lungs empty',
      sub: 'tap Breathe whenever you need air',
      motion: 'holdLow',
      duration: null,
      countUp: true,
      haptic: 'warn',
      cue: 'hold',
    },
    recoveryIn: {
      key: 'recoveryIn',
      title: 'Deep breath in',
      sub: 'fill your lungs completely',
      motion: 'expand',
      duration: t.recoveryInMs,
      haptic: 'medium',
      cue: 'in',
    },
    recoveryHold: {
      key: 'recoveryHold',
      title: 'Hold — lungs full',
      sub: 'keep it in, chin slightly down',
      motion: 'holdHigh',
      countdown: t.recoveryHoldS,
      haptic: 'warn',
      cue: 'hold',
    },
    release: {
      key: 'release',
      title: 'Release',
      sub: 'slow exhale, let everything soften',
      motion: 'contract',
      duration: t.releaseMs,
      haptic: 'light',
      cue: 'out',
    },
    done: {
      key: 'done',
      title: 'Session complete',
      sub: 'sit for a moment and notice how you feel',
      motion: 'rest',
      duration: null,
      haptic: 'medium',
    },
  },

  firstPhase: 'powerIn',

  /**
   * Pure transition function.
   * @param {string} phase current phase key
   * @param {{breath:number, round:number, rounds:number}} ctx
   * @returns {{next:string, ctx:object}} next phase key ('done' ends the session)
   */
  advance(phase, ctx) {
    switch (phase) {
      case 'powerIn':
        return { next: 'powerOut', ctx };
      case 'powerOut':
        if (ctx.breath < t.breathsPerRound) {
          return { next: 'powerIn', ctx: { ...ctx, breath: ctx.breath + 1 } };
        }
        return { next: 'retention', ctx };
      case 'retention':
        return { next: 'recoveryIn', ctx };
      case 'recoveryIn':
        return { next: 'recoveryHold', ctx };
      case 'recoveryHold':
        return { next: 'release', ctx };
      case 'release':
        if (ctx.round < ctx.rounds) {
          return { next: 'powerIn', ctx: { ...ctx, round: ctx.round + 1, breath: 1 } };
        }
        return { next: 'done', ctx };
      default:
        return { next: 'done', ctx };
    }
  },

  /** Rough session length for the pre-start estimate (retention guessed at 60s). */
  estimateMs(rounds, avgRetentionS = 60) {
    const perRound =
      t.breathsPerRound * (t.powerInMs + t.powerOutMs) +
      avgRetentionS * 1000 +
      t.recoveryInMs +
      t.recoveryHoldS * 1000 +
      t.releaseMs;
    return perRound * rounds;
  },

  /** Progress 0..1 through the whole session, for the ring around the orb. */
  progress(phase, ctx) {
    const roundFrac = (() => {
      switch (phase) {
        case 'powerIn':
        case 'powerOut':
          return (ctx.breath / t.breathsPerRound) * 0.7;
        case 'retention':
          return 0.75;
        case 'recoveryIn':
          return 0.85;
        case 'recoveryHold':
          return 0.93;
        case 'release':
          return 1;
        default:
          return 0;
      }
    })();
    if (phase === 'idle') return 0;
    if (phase === 'done') return 1;
    return Math.min(1, ((ctx.round - 1) + roundFrac) / ctx.rounds);
  },
};

export const PATTERNS = [TUMMO];
export const getPattern = (id) => PATTERNS.find((p) => p.id === id) || TUMMO;
