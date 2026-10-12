import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Animated,
  Easing,
  PanResponder,
  Platform,
  BackHandler,
  ScrollView,
} from 'react-native';
import { setAudioModeAsync } from 'expo-audio';
import { colors, radius, space, type, fonts } from '../theme';
import { hapticsSupported, tapSelection } from '../lib/haptics';
import useAppSize from '../lib/useAppSize';
import useDialogFocus from '../lib/useDialogFocus';
import createLoopPlayer from '../lib/createLoopPlayer';

/*
 * AUDIO LIBRARY: expo-audio.
 *
 * expo-av was removed in SDK 55, so it is not an option on SDK 57 — expo-audio
 * is its replacement and is the one that still works in Expo Go. With
 * shouldPlayInBackground plus the iOS "audio" UIBackgroundMode declared in
 * app.json, music survives the app being backgrounded mid-session. On web it
 * maps onto the standard audio element.
 *
 * Native lock-screen controls keep background playback active on Android and
 * let the listener pause the loop without reopening the app.
 *
 * The loops themselves are synthesised (see tools/generate-audio.py) rather
 * than licensed: no attribution to get wrong, no network fetch, and they work
 * offline on both targets.
 */
const TRACKS = [
  { id: 'none', name: 'None', source: null },
  { id: 'calm', name: 'Calm Drift', source: require('../../assets/audio/calm-drift.mp3') },
  { id: 'deep', name: 'Deep Space', source: require('../../assets/audio/deep-space.mp3') },
  { id: 'flow', name: 'Slow Flow', source: require('../../assets/audio/slow-flow.mp3') },
  { id: 'ember', name: 'Ember', source: require('../../assets/audio/ember.mp3') },
];

export const TRACK_IDS = TRACKS.map((t) => t.id);

/** Dependency-free volume slider — a track plus a PanResponder. */
function VolumeBar({ volume, onChange, onCommit }) {
  const widthRef = useRef(1);
  const cb = useRef({ onChange, onCommit });
  cb.current = { onChange, onCommit };

  const setFromX = (x) => {
    const v = Math.max(0, Math.min(1, x / widthRef.current));
    cb.current.onChange(v);
    return v;
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => setFromX(e.nativeEvent.locationX),
      onPanResponderMove: (e) => setFromX(e.nativeEvent.locationX),
      onPanResponderRelease: (e) => cb.current.onCommit(setFromX(e.nativeEvent.locationX)),
    })
  ).current;

  const pct = Math.round(volume * 100);
  if (Platform.OS === 'web') {
    return React.createElement('input', {
      type: 'range', min: 0, max: 100, step: 1, value: pct,
      'aria-label': 'Music volume',
      style: { flex: 1, minWidth: 0, height: 44, accentColor: colors.primaryBright },
      onChange: (event) => {
        const value = Number(event.target.value) / 100;
        onChange(value);
        onCommit(value);
      },
    });
  }
  return (
    <View
      style={styles.volHit}
      onLayout={(e) => {
        widthRef.current = e.nativeEvent.layout.width || 1;
      }}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Music volume"
      accessibilityValue={{ min: 0, max: 100, now: pct }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        const delta = e.nativeEvent.actionName === 'increment' ? 0.1 : -0.1;
        const v = Math.max(0, Math.min(1, volume + delta));
        cb.current.onChange(v);
        cb.current.onCommit(v);
      }}
      {...pan.panHandlers}
    >
      <View style={styles.volTrack}>
        <View style={[styles.volFill, { width: `${pct}%` }]} />
      </View>
      <View pointerEvents="none" style={[styles.volThumb, { left: `${pct}%` }]} />
    </View>
  );
}

function Toggle({ label, hint, value, onChange, disabled }) {
  const toggle = () => {
    if (disabled) return;
    tapSelection();
    onChange(!value);
  };
  return (
    <Pressable
      onPress={toggle}
      onKeyDown={Platform.OS === 'web' ? (event) => {
        if (event.key === ' ') {
          event.preventDefault();
          if (!event.repeat) toggle();
        }
      } : undefined}
      disabled={disabled}
      style={({ pressed }) => [styles.toggleRow, pressed && !disabled && styles.rowPressed]}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled: !!disabled }}
      aria-checked={value}
      accessibilityLabel={label}
      accessibilityHint={hint}
    >
      <View style={styles.toggleText}>
        <Text style={[styles.toggleLabel, disabled && styles.dim]}>{label}</Text>
        {hint ? <Text style={styles.toggleHint}>{hint}</Text> : null}
      </View>
      <View style={[styles.switchTrack, value && styles.switchTrackOn, disabled && styles.dim]}>
        <View style={[styles.switchKnob, value && styles.switchKnobOn]} />
      </View>
    </Pressable>
  );
}

/**
 * Bottom sheet for everything that is not the breath itself: background audio,
 * haptics and calm mode. Audio is fully independent of the session timer; the
 * screen calls stopMusic() through the ref when a session is reset.
 *
 * ref API: open(), close(), stopMusic()
 */
const SoundSheet = forwardRef(function SoundSheet({ prefs, onPrefs, reducedMotionOS, onVisibilityChange }, ref) {
  const { height } = useAppSize();
  const sheetHeight = Math.min(height * 0.92, 560);

  const [visible, setVisible] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const playerRef = useRef(null);
  const statusListener = useRef(null);
  const dialogRef = useRef(null);
  useDialogFocus(dialogRef, visible);
  const translateY = useRef(new Animated.Value(0)).current;
  const openIntent = useRef(false);
  const previousSheetHeight = useRef(sheetHeight);

  const { trackId, volume, haptics, calmMode } = prefs;
  useEffect(() => onVisibilityChange?.(visible), [visible, onVisibilityChange]);

  // ---- Audio session --------------------------------------------------------
  useEffect(() => {
    // No-ops or throws on web depending on browser; the session app still works
    // without it, so failures are swallowed.
    Promise.resolve(
      setAudioModeAsync({
        shouldPlayInBackground: true,
        playsInSilentMode: true,
        interruptionMode: 'doNotMix',
        shouldRouteThroughEarpiece: false,
      })
    ).catch(() => {});
  }, []);

  const unload = useCallback(() => {
    statusListener.current?.remove();
    statusListener.current = null;
    if (playerRef.current) {
      try {
        playerRef.current.pause();
        if (Platform.OS !== 'web') playerRef.current.setActiveForLockScreen(false);
        playerRef.current.remove();
      } catch (e) {
        /* already released */
      }
      playerRef.current = null;
    }
    setPlaying(false);
  }, []);

  useEffect(() => unload, [unload]);

  const playTrack = useCallback(
    (id, vol) => {
      const track = TRACKS.find((t) => t.id === id);
      unload();
      setAudioError(false);
      if (!track || !track.source) return;
      try {
        const player = createLoopPlayer(track.source);
        playerRef.current = player;
        statusListener.current = player.addListener('playbackStatusUpdate', (status) => {
          setPlaying(status.playing);
          setAudioError(!!status.error);
        });
        player.loop = true;
        player.volume = vol;
        if (Platform.OS !== 'web') {
          player.setActiveForLockScreen(true, { title: track.name, artist: 'Deep Breather' });
        }
        player.play();
      } catch (e) {
        // Decode failure or a browser blocking playback: stay silent rather
        // than take the session down with it.
        unload();
        setAudioError(true);
      }
    },
    [unload]
  );

  const selectTrack = (id) => {
    tapSelection();
    onPrefs({ trackId: id });
    if (id === 'none') unload();
    else playTrack(id, volume);
  };

  const togglePlay = () => {
    setAudioError(false);
    if (!playerRef.current) {
      if (trackId !== 'none') playTrack(trackId, volume);
      return;
    }
    const p = playerRef.current;
    try {
      if (p.playing) {
        p.pause();
        setPlaying(false);
      } else {
        p.play();
        setPlaying(true);
      }
    } catch (e) {
      setPlaying(false);
      setAudioError(true);
    }
  };

  const onVolume = (v) => {
    onPrefs({ volume: v });
    if (playerRef.current) {
      try {
        playerRef.current.volume = v;
      } catch (e) {
        /* player was released mid-drag */
      }
    }
  };

  // ---- Sheet animation ------------------------------------------------------
  const animateTo = useCallback(
    (open) => {
      openIntent.current = open;
      Animated.timing(translateY, {
        toValue: open ? -sheetHeight : 0,
        duration: reducedMotionOS || calmMode ? 0 : 260,
        easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && !open) setVisible(false);
      });
    },
    [sheetHeight, translateY, reducedMotionOS, calmMode]
  );

  useEffect(() => {
    if (visible && previousSheetHeight.current !== sheetHeight) {
      if (openIntent.current) translateY.setValue(-sheetHeight);
      else animateTo(false);
    }
    previousSheetHeight.current = sheetHeight;
  }, [sheetHeight, visible, translateY, animateTo]);

  const open = useCallback(() => {
    setVisible(true);
    requestAnimationFrame(() => animateTo(true));
  }, [animateTo]);

  const close = useCallback(() => animateTo(false), [animateTo]);

  useImperativeHandle(ref, () => ({ open, close, stopMusic: unload }));

  // Android hardware back: close the sheet rather than leaving the app. The
  // handler is only registered while the sheet is up, so back behaves normally
  // everywhere else. No-op on web.
  useEffect(() => {
    if (!visible || Platform.OS !== 'android') return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, [visible, close]);

  const sheetMotion = useRef({ sheetHeight, animateTo });
  sheetMotion.current = { sheetHeight, animateTo };
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 6,
      onPanResponderMove: (_e, g) => {
        if (g.dy > 0) translateY.setValue(-sheetMotion.current.sheetHeight + g.dy);
      },
      onPanResponderRelease: (_e, g) => {
        const current = sheetMotion.current;
        current.animateTo(!(g.dy > current.sheetHeight * 0.25 || g.vy > 0.8));
      },
    })
  ).current;

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Pressable
        style={styles.backdrop}
        onPress={close}
        accessibilityRole="button"
        accessibilityLabel="Dismiss sound and motion settings"
      />

      <Animated.View
        ref={dialogRef}
        style={[
          styles.sheet,
          { height: sheetHeight, bottom: -sheetHeight, transform: [{ translateY }] },
        ]}
        accessibilityViewIsModal
        role="dialog"
        accessibilityLabel="Sound and motion settings"
        aria-modal={true}
      >
        <View style={styles.handleArea} {...pan.panHandlers}>
          <View style={styles.handle} />
        </View>

        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Sound &amp; motion</Text>
          <Pressable
            onPress={close}
            hitSlop={14}
            style={({ pressed }) => [styles.doneBtn, pressed && styles.rowPressed]}
            accessibilityRole="button"
            accessibilityLabel="Close sound and motion settings"
          >
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 28 }}>
        <Text style={styles.groupLabel}>Background loop</Text>
        <View style={styles.trackList}>
          {TRACKS.map((t) => {
            const active = trackId === t.id;
            return (
              <Pressable
                key={t.id}
                onPress={() => selectTrack(t.id)}
                onKeyDown={Platform.OS === 'web' ? (event) => {
                  if (event.key === ' ') {
                    event.preventDefault();
                    if (!event.repeat) selectTrack(t.id);
                  }
                } : undefined}
                style={({ pressed }) => [
                  styles.trackBtn,
                  active && styles.trackBtnActive,
                  pressed && styles.rowPressed,
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                aria-checked={active}
                accessibilityLabel={`${t.name} background loop`}
              >
                <Text style={[styles.trackText, active && styles.trackTextActive]}>
                  {t.name}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={styles.row}>
          <Pressable
            style={[styles.playBtn, trackId === 'none' && styles.disabled]}
            onPress={togglePlay}
            disabled={trackId === 'none'}
            accessibilityRole="button"
            accessibilityLabel={playing ? 'Pause music' : 'Play music'}
          >
            <Text style={styles.playBtnText}>{playing ? '❚❚' : '▶'}</Text>
          </Pressable>
          <Text style={styles.volLabel}>Vol</Text>
          <VolumeBar volume={volume} onChange={onVolume} onCommit={() => {}} />
        </View>
        {audioError && <Text style={styles.hint} accessibilityRole="alert">Music could not play. Tap Play to try again or choose another loop.</Text>}

        <View style={styles.divider} />

        <Toggle
          label="Haptic cues"
          hint={
            hapticsSupported
              ? 'a tap on every phase change'
              : 'not available in the browser'
          }
          value={haptics && hapticsSupported}
          onChange={(v) => onPrefs({ haptics: v })}
          disabled={!hapticsSupported}
        />

        <Toggle
          label="Calm mode"
          hint={
            reducedMotionOS
              ? 'already on — your system asks for reduced motion'
              : 'keep the lungs still and follow the numbers'
          }
          value={calmMode || reducedMotionOS}
          onChange={(v) => onPrefs({ calmMode: v })}
          disabled={reducedMotionOS}
        />

        <Text style={styles.hint}>
          Music keeps playing if you switch away mid-session
          {Platform.OS === 'web' ? ' (as long as the tab stays open)' : ''}; it stops when
          you reset.
        </Text>
        </ScrollView>
      </Animated.View>
    </View>
  );
});

export default SoundSheet;

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(3,7,15,0.55)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 560,
    backgroundColor: colors.sheet,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: space(6),
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: -6 },
    elevation: 20,
  },
  handleArea: { alignItems: 'center', paddingVertical: space(3) },
  handle: { width: 44, height: 5, borderRadius: 3, backgroundColor: colors.lineStrong },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space(4),
  },
  sheetTitle: { ...type.title, color: colors.text, fontFamily: fonts.body },
  doneBtn: { paddingVertical: space(2), paddingHorizontal: space(2) },
  doneText: {
    color: colors.primaryBright,
    fontSize: 16,
    fontWeight: '600',
    fontFamily: fonts.body,
  },
  groupLabel: {
    color: colors.textFaint,
    fontSize: 11.5,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontWeight: '700',
    marginBottom: space(2),
    fontFamily: fonts.body,
  },
  trackList: { flexDirection: 'row', flexWrap: 'wrap', gap: space(2), marginBottom: space(4) },
  trackBtn: {
    paddingVertical: space(2.5),
    paddingHorizontal: space(4),
    borderRadius: radius.pill,
    backgroundColor: colors.line,
    minHeight: 40,
    justifyContent: 'center',
  },
  trackBtnActive: { backgroundColor: colors.primary },
  trackText: { color: '#cfe0f5', fontSize: 15, fontFamily: fonts.body },
  trackTextActive: { color: '#fff', fontWeight: '700' },
  rowPressed: { opacity: 0.75 },

  row: { flexDirection: 'row', alignItems: 'center', gap: space(3) },
  playBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtnText: { color: '#fff', fontSize: 16 },
  disabled: { opacity: 0.35 },
  volLabel: { color: colors.textDim, fontSize: 14, fontFamily: fonts.body },
  volHit: { flex: 1, height: 44, justifyContent: 'center' },
  volTrack: { height: 6, borderRadius: 3, backgroundColor: colors.lineStrong, overflow: 'hidden' },
  volFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 3 },
  volThumb: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    marginLeft: -9,
    backgroundColor: colors.primaryBright,
  },

  divider: { height: 1, backgroundColor: colors.line, marginVertical: space(4) },

  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space(2.5),
    minHeight: 48,
    gap: space(4),
  },
  toggleText: { flex: 1 },
  toggleLabel: { color: colors.text, fontSize: 15.5, fontFamily: fonts.body },
  toggleHint: { color: colors.textFaint, fontSize: 12.5, marginTop: 2, fontFamily: fonts.body },
  dim: { opacity: 0.45 },
  switchTrack: {
    width: 48,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.lineStrong,
    padding: 3,
    justifyContent: 'center',
  },
  switchTrackOn: { backgroundColor: colors.primary },
  switchKnob: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#dbe7f7' },
  switchKnobOn: { alignSelf: 'flex-end', backgroundColor: '#fff' },

  hint: {
    color: colors.textFaint,
    fontSize: 12.5,
    marginTop: space(4),
    lineHeight: 18,
    fontFamily: fonts.body,
  },
});
