/**
 * The breathing session engine.
 *
 * Design notes
 * ------------
 * Timing is deadline-based, not `setTimeout`-chained: every tick recomputes
 * elapsed time from a wall-clock start stamp minus however long the session
 * spent paused. Chained timeouts accumulate drift over 30 breaths × N rounds,
 * and they make pause/resume awkward; a single 100ms ticker over timestamps
 * stays accurate and makes pausing a matter of bookkeeping.
 *
 * The engine deliberately does NOT keep running in the background. JS timers
 * are throttled or suspended when an app is backgrounded on Android and when a
 * browser tab is hidden on web, so a "still running" session would silently
 * fall behind the user's actual breathing. Instead the caller pauses on
 * AppState change; music is separate and keeps playing.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { fire } from './haptics';

const TICK_MS = 100;

const initialCtx = (rounds) => ({ breath: 1, round: 1, rounds });

export default function useSession(pattern, rounds, { onComplete } = {}) {
  const [status, setStatus] = useState('idle'); // idle | running | paused | done
  const [phase, setPhase] = useState('idle');
  const [phaseKey, setPhaseKey] = useState(0); // bumps per segment so the orb re-fires
  const [ctx, setCtx] = useState(() => initialCtx(rounds));
  const [holdSecs, setHoldSecs] = useState(0);
  const [remainingMs, setRemainingMs] = useState(0);

  // Mutable mirror of everything the ticker needs, so it never reads stale
  // state out of a closure.
  const m = useRef({
    status: 'idle',
    phase: 'idle',
    ctx: initialCtx(rounds),
    phaseStart: 0,
    pausedAccum: 0,
    sessionPausedAccum: 0,
    pauseStart: 0,
    retentions: [],
    sessionStart: 0,
  });

  const tickRef = useRef(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const stopTicker = () => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = null;
  };

  const def = (key) => pattern.phases[key] || pattern.phases.idle;

  const currentPauseMs = (now) =>
    m.current.status === 'paused' ? Math.max(0, now - m.current.pauseStart) : 0;

  const phaseElapsedMs = (now) =>
    Math.max(0, now - m.current.phaseStart - m.current.pausedAccum - currentPauseMs(now));

  const enter = useCallback(
    (key) => {
      const d = def(key);
      m.current.phase = key;
      m.current.phaseStart = Date.now();
      m.current.pausedAccum = 0;
      setPhase(key);
      setPhaseKey((k) => k + 1);

      if (d.countdown) {
        setHoldSecs(d.countdown);
        setRemainingMs(d.countdown * 1000);
      } else {
        setHoldSecs(0);
        setRemainingMs(d.duration || 0);
      }

      if (d.haptic) fire(d.haptic);
    },
    [pattern]
  );

  const finish = useCallback(
    (completed) => {
      stopTicker();
      const now = Date.now();
      const started = m.current.sessionStart || now;
      // Reset can end a retention before the Breathe control does. Keep that
      // practice, excluding any time spent paused during the hold.
      if (!completed && def(m.current.phase).countUp) {
        m.current.retentions.push(Math.floor(phaseElapsedMs(now) / 1000));
      }
      const record = {
        at: now,
        pattern: pattern.id,
        rounds: completed ? m.current.ctx.rounds : Math.max(0, m.current.ctx.round - 1),
        plannedRounds: m.current.ctx.rounds,
        retentions: [...m.current.retentions],
        durationS: Math.max(0, Math.round(
          (now - started - m.current.sessionPausedAccum - currentPauseMs(now)) / 1000
        )),
        completed,
      };
      m.current.status = 'done';
      setStatus('done');
      if (completed) {
        m.current.phase = 'done';
        setPhase('done');
        setPhaseKey((k) => k + 1);
        fire('success');
      }
      // Only log something the user actually practised.
      if (record.durationS >= 20 && (record.rounds > 0 || record.retentions.length)) {
        onCompleteRef.current?.(record);
      }
      return record;
    },
    [pattern]
  );

  const step = useCallback(() => {
    const from = m.current.phase;
    // Retention time is the number worth keeping, so capture it on the way out.
    if (def(from).countUp) {
      const held = Math.floor(phaseElapsedMs(Date.now()) / 1000);
      m.current.retentions.push(Math.max(0, held));
    }
    const { next, ctx: nextCtx } = pattern.advance(from, m.current.ctx);
    m.current.ctx = nextCtx;
    setCtx(nextCtx);
    if (next === 'done') {
      finish(true);
      return;
    }
    enter(next);
  }, [pattern, enter, finish]);

  // ---- Ticker ---------------------------------------------------------------
  useEffect(() => {
    if (status !== 'running') {
      stopTicker();
      return undefined;
    }
    tickRef.current = setInterval(() => {
      if (m.current.status !== 'running') return;
      const d = def(m.current.phase);
      const elapsed = phaseElapsedMs(Date.now());

      if (d.countUp) {
        setHoldSecs(Math.max(0, Math.floor(elapsed / 1000)));
        return;
      }
      if (d.countdown) {
        const left = d.countdown * 1000 - elapsed;
        setRemainingMs(Math.max(0, left));
        setHoldSecs(Math.max(0, Math.ceil(left / 1000)));
        if (left <= 0) step();
        return;
      }
      if (d.duration) {
        const left = d.duration - elapsed;
        setRemainingMs(Math.max(0, left));
        if (left <= 0) step();
      }
    }, TICK_MS);
    return stopTicker;
  }, [status, step, pattern]);

  // ---- Controls -------------------------------------------------------------
  const start = useCallback(() => {
    if (m.current.status === 'running' || m.current.status === 'paused') return;
    stopTicker();
    const fresh = initialCtx(rounds);
    m.current = {
      status: 'running',
      phase: 'idle',
      ctx: fresh,
      phaseStart: Date.now(),
      pausedAccum: 0,
      sessionPausedAccum: 0,
      pauseStart: 0,
      retentions: [],
      sessionStart: Date.now(),
    };
    setCtx(fresh);
    setStatus('running');
    enter(pattern.firstPhase);
  }, [rounds, enter, pattern]);

  const pause = useCallback(() => {
    if (m.current.status !== 'running') return;
    stopTicker();
    const d = def(m.current.phase);
    const duration = d.duration || (d.countdown || 0) * 1000;
    setRemainingMs(Math.max(0, duration - phaseElapsedMs(Date.now())));
    m.current.status = 'paused';
    m.current.pauseStart = Date.now();
    setStatus('paused');
  }, [pattern]);

  const resume = useCallback(() => {
    if (m.current.status !== 'paused') return;
    const pausedMs = Math.max(0, Date.now() - m.current.pauseStart);
    m.current.pausedAccum += pausedMs;
    m.current.sessionPausedAccum += pausedMs;
    m.current.status = 'running';
    setStatus('running');
  }, []);

  const reset = useCallback(() => {
    // Stopping mid-session still counts as practice, so log what happened.
    if (m.current.status === 'running' || m.current.status === 'paused') {
      finish(false);
    }
    stopTicker();
    const fresh = initialCtx(rounds);
    m.current = {
      status: 'idle',
      phase: 'idle',
      ctx: fresh,
      phaseStart: 0,
      pausedAccum: 0,
      sessionPausedAccum: 0,
      pauseStart: 0,
      retentions: [],
      sessionStart: 0,
    };
    setStatus('idle');
    setPhase('idle');
    setCtx(fresh);
    setHoldSecs(0);
    setRemainingMs(0);
    setPhaseKey((k) => k + 1);
  }, [rounds, finish]);

  /** Ends an open-ended phase (the retention hold). */
  const endHold = useCallback(() => {
    if (m.current.status !== 'running') return;
    if (!def(m.current.phase).countUp) return;
    step();
  }, [step]);

  // Keep the engine's round target in sync while idle.
  useEffect(() => {
    if (m.current.status === 'idle') {
      const fresh = initialCtx(rounds);
      m.current.ctx = fresh;
      setCtx(fresh);
    }
  }, [rounds]);

  useEffect(() => stopTicker, []);

  const phaseDef = def(phase);
  return {
    status,
    phase,
    phaseDef,
    phaseKey,
    ctx,
    holdSecs,
    remainingMs,
    retentions: m.current.retentions,
    inSession: status === 'running' || status === 'paused',
    progress: pattern.progress(phase, ctx),
    start,
    pause,
    resume,
    reset,
    endHold,
  };
}
