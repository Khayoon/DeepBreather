import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  AppState,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar,
  BackHandler,
} from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import BreathingOrb from '../components/BreathingOrb';
import RoundSelector from '../components/RoundSelector';
import SoundSheet from '../components/SoundSheet';
import SafetyGate from '../components/SafetyGate';
import StatsPanel from '../components/StatsPanel';

import { TUMMO, TUMMO_DEFAULTS } from '../patterns';
import useSession from '../lib/useSession';
import useReducedMotion from '../lib/useReducedMotion';
import useAppSize from '../lib/useAppSize';
import { setHapticsEnabled } from '../lib/haptics';
import {
  DEFAULT_PREFS,
  loadPrefs,
  savePrefs,
  loadHistory,
  appendSession,
  clearHistory,
  computeStats,
  formatDuration,
} from '../lib/storage';

const KEEP_AWAKE_TAG = 'deep-breather-session';

export default function BreathingScreen() {
  const { width, height } = useAppSize();
  const isWide = width >= 700;

  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const [prefsReady, setPrefsReady] = useState(false);
  const [safetyState, setSafetyState] = useState('ok'); // ok | info
  const [history, setHistory] = useState([]);
  const [showStats, setShowStats] = useState(false);
  const [showSound, setShowSound] = useState(false);

  const soundRef = useRef(null);
  const osReducedMotion = useReducedMotion();
  const reducedMotion = osReducedMotion || prefs.calmMode;

  // ---- Persisted state ------------------------------------------------------
  useEffect(() => {
    let alive = true;
    (async () => {
      const [p, h] = await Promise.all([loadPrefs(), loadHistory()]);
      if (!alive) return;
      setPrefs(p);
      setPrefsReady(true);
      setHistory(h);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const updatePrefs = useCallback((patch) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      savePrefs(next);
      return next;
    });
  }, []);

  useEffect(() => {
    setHapticsEnabled(prefs.haptics);
  }, [prefs.haptics]);

  // ---- Session engine -------------------------------------------------------
  const onComplete = useCallback(async (record) => {
    const next = await appendSession(record);
    setHistory(next);
  }, []);

  const session = useSession(TUMMO, prefs.rounds, { onComplete });
  const { status, phase, phaseDef, phaseKey, ctx, holdSecs, remainingMs, inSession } = session;
  const overlayOpen = showStats || showSound || safetyState === 'info';
  const handleReset = useCallback(() => {
    session.reset();
    soundRef.current?.stopMusic();
  }, [session.reset]);

  const openPanel = (panel) => {
    session.pause();
    if (panel === 'stats') setShowStats(true);
    else if (panel === 'safety') setSafetyState('info');
    else soundRef.current?.open();
  };

  // ---- Keep the screen awake while practising -------------------------------
  useEffect(() => {
    if (inSession) {
      // Android: FLAG_KEEP_SCREEN_ON. iOS: disables the idle timer.
      // Web: the Screen Wake Lock API, which needs no permission prompt.
      activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => {});
    } else {
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    }
    return () => {
      deactivateKeepAwake(KEEP_AWAKE_TAG).catch(() => {});
    };
  }, [inSession]);

  // ---- Pause when the app or tab goes away ----------------------------------
  // Timers are throttled in the background on every platform this ships to, so
  // a session left running would drift out of sync with the person's actual
  // breathing. Pausing is the honest behaviour.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') session.pause();
    });
    return () => sub.remove();
  }, [session]);

  // ---- Android hardware back ------------------------------------------------
  // Back should dismiss whatever is on top before it considers leaving the app,
  // and it should never end a session by surprise — while one is running it
  // pauses instead.
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (safetyState === 'info') {
        setSafetyState('ok');
        return true;
      }
      if (showStats) {
        setShowStats(false);
        return true;
      }
      if (status === 'running') {
        session.pause();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [safetyState, showStats, status, session]);

  // ---- Keyboard shortcuts (web) ---------------------------------------------
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return undefined;
    const onKey = (e) => {
      if (e.repeat || e.defaultPrevented || e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.code === 'Escape') {
        if (safetyState === 'info') setSafetyState('ok');
        else if (showStats) setShowStats(false);
        else if (showSound) soundRef.current?.close();
        else if (inSession) handleReset();
        else return;
        e.preventDefault();
        return;
      }
      if (!prefsReady || overlayOpen) return;
      // Focused controls own Enter/Space, including switches and steppers.
      if (e.target?.closest?.('button, a, input, textarea, select, [role="button"], [role="switch"], [role="radio"], [role="slider"], [contenteditable="true"]')) return;
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        if (phase === 'retention' && status === 'running') session.endHold();
        else if (status === 'running') session.pause();
        else if (status === 'paused') session.resume();
        else session.start();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [session, phase, status, inSession, prefsReady, overlayOpen, safetyState, showStats, showSound, handleReset]);

  // ---- Derived --------------------------------------------------------------
  const stats = useMemo(() => computeStats(history), [history]);

  const orbSize = Math.min(
    Math.min(width, height) * (isWide ? 0.46 : 0.72),
    isWide ? 360 : 320
  );

  const orbDuration = phaseDef.duration || 800;
  const isPowerPhase = phase === 'powerIn' || phase === 'powerOut';
  const isHold = phase === 'retention' || phase === 'recoveryHold';

  const estimate = useMemo(() => {
    const mins = Math.round(TUMMO.estimateMs(prefs.rounds) / 60000);
    return `about ${mins} min · ${TUMMO_DEFAULTS.breathsPerRound} breaths per round`;
  }, [prefs.rounds]);

  const handleClearHistory = async () => {
    await clearHistory();
    setHistory([]);
  };

  // Live announcement for screen readers: one short sentence per phase change.
  const announcement = inSession
    ? `${phaseDef.title}. ${
        isPowerPhase ? `Breath ${ctx.breath} of ${TUMMO_DEFAULTS.breathsPerRound}. ` : ''
      }Round ${ctx.round} of ${ctx.rounds}.`
    : '';

  if (!prefsReady) {
    return <View style={styles.safe} />;
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar barStyle="light-content" backgroundColor="#070d18" />

      <ScrollView style={styles.mainScroll} contentContainerStyle={styles.container}>
        {/* --- Top bar --- */}
        <View style={styles.topBar}>
          <Text style={styles.brand}>DEEP BREATHER</Text>
          <View style={styles.topActions}>
            <Pressable
              onPress={() => openPanel('stats')}
              style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Practice history"
            >
              <Text style={styles.iconText}>
                {stats.streak > 0 ? `${stats.streak}🔥` : 'Stats'}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => openPanel('safety')}
              style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Safety information"
            >
              <Text style={styles.iconText}>Safety</Text>
            </Pressable>
          </View>
        </View>

        {/* --- Phase text --- */}
        <View style={styles.header}>
          <Text
            style={[styles.title, { fontSize: isWide ? 38 : 28 }]}
            accessibilityRole="header"
          >
            {phaseDef.title}
          </Text>
          <Text style={styles.subtitle}>{phaseDef.sub}</Text>
          <Text
            style={styles.srOnly}
            accessibilityLiveRegion="polite"
            accessibilityElementsHidden={false}
          >
            {announcement}
          </Text>
        </View>

        {/* --- Orb --- */}
        <View style={[styles.orbArea, { minHeight: orbSize + 24 }]}>
          <BreathingOrb
            motion={phaseDef.motion}
            cycleKey={phaseKey}
            duration={orbDuration}
            remainingMs={remainingMs}
            paused={status === 'paused'}
            reducedMotion={reducedMotion}
            progress={session.progress}
            size={orbSize}
          >
            {inSession && (
              <View style={styles.orbOverlay} pointerEvents="none">
                {isHold ? (
                  <>
                    <Text style={styles.holdNumber}>{holdSecs}</Text>
                    <Text style={styles.orbCaption}>
                      {phase === 'retention' ? 'holding' : 'seconds left'}
                    </Text>
                  </>
                ) : isPowerPhase ? (
                  <>
                    <Text style={styles.breathNumber}>{ctx.breath}</Text>
                    <Text style={styles.orbCaption}>
                      of {TUMMO_DEFAULTS.breathsPerRound}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.orbCaption}>
                    {reducedMotion ? `${Math.ceil(remainingMs / 1000)}s` : ''}
                  </Text>
                )}
              </View>
            )}
            {status === 'done' && (
              <View style={styles.orbOverlay} pointerEvents="none">
                <Text style={styles.doneCheck}>✓</Text>
              </View>
            )}
          </BreathingOrb>
        </View>

        {/* --- Round / status line --- */}
        <View style={styles.statusLine}>
          {inSession ? (
            <>
              <Text style={styles.counter}>
                Round {ctx.round}/{ctx.rounds}
              </Text>
              {status === 'paused' && <Text style={styles.pausedTag}>PAUSED</Text>}
            </>
          ) : status === 'done' ? (
            <Text style={styles.counter}>
              {session.retentions.length
                ? `Longest hold ${formatDuration(Math.max(...session.retentions))}`
                : ''}
            </Text>
          ) : null}
        </View>

        {/* --- Retention escape hatch --- */}
        <View style={styles.breatheSlot}>
          {phase === 'retention' && status === 'running' && (
            <Pressable
              style={({ pressed }) => [styles.breatheBtn, pressed && styles.pressed]}
              onPress={session.endHold}
              accessibilityRole="button"
              accessibilityLabel="I need to breathe — end the hold and start recovery"
            >
              <Text style={styles.breatheBtnText}>Breathe</Text>
            </Pressable>
          )}
        </View>

        {/* --- Footer --- */}
        <View style={styles.footer}>
          <RoundSelector
            rounds={prefs.rounds}
            min={TUMMO.minRounds}
            max={TUMMO.maxRounds}
            onChange={(r) => updatePrefs({ rounds: r })}
            disabled={inSession}
            estimate={!inSession ? estimate : null}
          />

          {!inSession && (
            <Text style={styles.safetyNote}>
              Practise seated or lying down, never in water or while driving.
              Stop if you feel unwell. See Safety for details.
            </Text>
          )}
          <View style={styles.controlsRow}>
            {!inSession ? (
              <Pressable
                style={({ pressed }) => [styles.ctrl, styles.ctrlPrimary, pressed && styles.pressed]}
                onPress={session.start}
                accessibilityRole="button"
                accessibilityLabel={status === 'done' ? 'Start another session' : 'Start session'}
              >
                <Text style={styles.ctrlPrimaryText}>
                  {status === 'done' ? 'Go again' : 'Start'}
                </Text>
              </Pressable>
            ) : (
              <>
                <Pressable
                  style={({ pressed }) => [
                    styles.ctrl,
                    styles.ctrlPrimary,
                    pressed && styles.pressed,
                  ]}
                  onPress={status === 'running' ? session.pause : session.resume}
                  accessibilityRole="button"
                  accessibilityLabel={status === 'running' ? 'Pause session' : 'Resume session'}
                >
                  <Text style={styles.ctrlPrimaryText}>
                    {status === 'running' ? 'Pause' : 'Resume'}
                  </Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [styles.ctrl, pressed && styles.pressed]}
                  onPress={handleReset}
                  accessibilityRole="button"
                  accessibilityLabel="Reset session"
                >
                  <Text style={styles.ctrlText}>Reset</Text>
                </Pressable>
              </>
            )}
            <Pressable
              style={({ pressed }) => [styles.ctrl, pressed && styles.pressed]}
              onPress={() => openPanel('sound')}
              accessibilityRole="button"
              accessibilityLabel="Sound and motion settings"
            >
              <Text style={styles.ctrlText}>♫ Sound</Text>
            </Pressable>
          </View>

          {Platform.OS === 'web' && !inSession && (
            <Text style={styles.kbdHint}>Space to start · Esc to reset</Text>
          )}
        </View>
      </ScrollView>

      <SoundSheet
        ref={soundRef}
        prefs={prefs}
        onPrefs={updatePrefs}
        reducedMotionOS={osReducedMotion}
        onVisibilityChange={setShowSound}
      />

      {showStats && (
        <StatsPanel
          stats={stats}
          onClose={() => setShowStats(false)}
          onClear={handleClearHistory}
        />
      )}

      {safetyState === 'info' && (
        <SafetyGate onClose={() => setSafetyState('ok')} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#070d18' },
  mainScroll: { flex: 1 },
  container: {
    flexGrow: 1,
    // SafeAreaView is a plain View on Android, so pad past the status bar.
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight || 24) : 0,
    paddingHorizontal: '6%',
    paddingBottom: 24,
    width: '100%',
    maxWidth: 640,
    alignSelf: 'center',
  },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
  },
  brand: {
    color: '#6f86a6',
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 2,
  },
  topActions: { flexDirection: 'row', gap: 6 },
  iconBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    minHeight: 36,
    justifyContent: 'center',
  },
  iconText: { color: '#9fb6d4', fontSize: 13.5, fontWeight: '600' },
  pressed: { opacity: 0.7 },

  header: { alignItems: 'center', paddingTop: 14, minHeight: 96 },
  title: { color: '#eaf2ff', fontWeight: '700', textAlign: 'center', letterSpacing: -0.4 },
  subtitle: {
    color: '#9fb6d4',
    fontSize: 15.5,
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 21,
  },
  // Present to assistive tech, invisible on screen.
  srOnly: { height: 0, opacity: 0, fontSize: 1 },

  orbArea: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 200 },
  orbOverlay: { alignItems: 'center', justifyContent: 'center' },
  breathNumber: {
    color: '#eaf2ff',
    fontSize: 52,
    fontWeight: '300',
    fontVariant: ['tabular-nums'],
  },
  holdNumber: {
    color: '#eaf2ff',
    fontSize: 56,
    fontWeight: '300',
    fontVariant: ['tabular-nums'],
  },
  orbCaption: { color: '#cfe0f5', fontSize: 13.5, marginTop: 2, opacity: 0.85 },
  doneCheck: { color: '#eaf2ff', fontSize: 54, fontWeight: '300' },

  statusLine: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 14,
    minHeight: 24,
  },
  counter: { color: '#6f86a6', fontSize: 14.5, fontVariant: ['tabular-nums'] },
  pausedTag: { color: '#f2b544', fontSize: 12.5, fontWeight: '700', letterSpacing: 1.5 },

  breatheSlot: { minHeight: 72, justifyContent: 'center' },
  breatheBtn: {
    alignSelf: 'center',
    backgroundColor: '#f2b544',
    paddingVertical: 15,
    paddingHorizontal: 48,
    borderRadius: 999,
    minHeight: 52,
  },
  breatheBtnText: { color: '#241a05', fontSize: 18, fontWeight: '700' },

  footer: { gap: 12 },
  safetyNote: { color: '#9fb6d4', fontSize: 12, lineHeight: 17, textAlign: 'center' },
  controlsRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, flexWrap: 'wrap' },
  ctrl: {
    paddingVertical: 14,
    paddingHorizontal: 26,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    minHeight: 50,
    justifyContent: 'center',
  },
  ctrlPrimary: { backgroundColor: '#2f7fe0', paddingHorizontal: 38 },
  ctrlPrimaryText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  ctrlText: { color: '#cfe0f5', fontSize: 16 },
  kbdHint: { color: '#4d6180', fontSize: 12, textAlign: 'center' },
});
