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
  useWindowDimensions,
} from 'react-native';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import AsyncStorage from '@react-native-async-storage/async-storage';

/*
 * LIBRARY CHOICE (called out per spec): this uses expo-audio.
 * - expo-audio is the successor to expo-av, which was fully REMOVED in
 *   Expo SDK 55 — expo-av no longer works in current Expo Go at all.
 *   With shouldPlayInBackground + the iOS "audio" UIBackgroundMode (see
 *   app.json) music keeps playing when the app is backgrounded mid-session.
 * - react-native-track-player: pick this instead if you want lock-screen /
 *   notification transport controls. Costs you Expo Go (needs a dev build)
 *   and native setup.
 */

// Preset ambient tracks. The URIs below are stable public test MP3s so the
// component works out of the box — replace with bundled ambient loops, e.g.:
//   source: require('../../assets/audio/rain.mp3')
const TRACKS = [
  { id: 'none', name: 'None', source: null },
  {
    id: 'calm',
    name: 'Calm Drift',
    source: { uri: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3' },
  },
  {
    id: 'deep',
    name: 'Deep Space',
    source: { uri: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3' },
  },
  {
    id: 'flow',
    name: 'Slow Flow',
    source: { uri: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3' },
  },
];

const STORAGE_KEY = '@deep_breather/music_prefs';

/**
 * Dependency-free volume slider: a plain View track with a PanResponder.
 * Replaces @react-native-community/slider (native module, breaks in Snack
 * and adds an install step) — tap or drag anywhere on the track.
 */
function VolumeBar({ volume, onChange, onCommit }) {
  const widthRef = useRef(1);
  // Keep latest callbacks in refs so the once-created PanResponder never
  // calls stale closures.
  const cbRef = useRef({ onChange, onCommit });
  cbRef.current = { onChange, onCommit };

  const setFromX = (x) => {
    const v = Math.max(0, Math.min(1, x / widthRef.current));
    cbRef.current.onChange(v);
    return v;
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => setFromX(e.nativeEvent.locationX),
      onPanResponderMove: (e) => setFromX(e.nativeEvent.locationX),
      onPanResponderRelease: (e) =>
        cbRef.current.onCommit(setFromX(e.nativeEvent.locationX)),
    })
  ).current;

  return (
    <View
      style={styles.volTrackHit}
      onLayout={(e) => {
        widthRef.current = e.nativeEvent.layout.width || 1;
      }}
      {...pan.panHandlers}
    >
      <View style={styles.volTrack}>
        <View style={[styles.volFill, { width: `${Math.round(volume * 100)}%` }]} />
      </View>
      <View
        pointerEvents="none"
        style={[styles.volThumb, { left: `${Math.round(volume * 100)}%` }]}
      />
    </View>
  );
}

/**
 * Slide-up drawer (native bottom sheet pattern, not a web modal) managing
 * background audio. Fully independent of the breathing timer; the parent
 * calls stopMusic() on session reset via the ref.
 *
 * ref API: open(), close(), stopMusic()
 */
const MusicManager = forwardRef(function MusicManager(_props, ref) {
  const { height } = useWindowDimensions();
  const sheetHeight = Math.min(height * 0.5, 420); // responsive, capped for tablets

  const [visible, setVisible] = useState(false);
  const [trackId, setTrackId] = useState('none');
  const [volume, setVolume] = useState(0.6);
  const [playing, setPlaying] = useState(false);

  const soundRef = useRef(null);
  const translateY = useRef(new Animated.Value(0)).current; // 0=hidden offset applied below
  const shown = useRef(false);

  // ---- Audio session --------------------------------------------------------
  useEffect(() => {
    setAudioModeAsync({
      // iOS: without this, audio dies the moment the app backgrounds. Also
      // requires "UIBackgroundModes": ["audio"] in app.json (ios.infoPlist).
      shouldPlayInBackground: true,
      // iOS: play even when the mute switch is on — expected for a session app.
      playsInSilentMode: true,
      interruptionMode: 'doNotMix',
      // Android: duck other audio (e.g. a navigation prompt) rather than stop.
      interruptionModeAndroid: 'duckOthers',
      shouldRouteThroughEarpiece: false,
    }).catch(() => {});
  }, []);

  // ---- Load persisted prefs on mount ---------------------------------------
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const prefs = JSON.parse(raw);
          if (typeof prefs.volume === 'number') setVolume(prefs.volume);
          if (TRACKS.some((t) => t.id === prefs.trackId)) setTrackId(prefs.trackId);
          // Deliberately do NOT autoplay on launch — just restore selection.
        }
      } catch (e) {
        /* corrupted prefs: fall back to defaults */
      }
    })();
    return () => {
      // Release the native player on unmount to free the audio session.
      if (soundRef.current) {
        try {
          soundRef.current.remove();
        } catch (e) {
          /* already released */
        }
      }
    };
  }, []);

  const persist = useCallback((next) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  // ---- Playback -------------------------------------------------------------
  const unload = useCallback(async () => {
    if (soundRef.current) {
      try {
        soundRef.current.pause();
        soundRef.current.remove(); // releases the native player
      } catch (e) {
        /* already released */
      }
      soundRef.current = null;
    }
    setPlaying(false);
  }, []);

  const playTrack = useCallback(
    async (id, vol) => {
      const track = TRACKS.find((t) => t.id === id);
      await unload();
      if (!track || !track.source) return;
      try {
        const player = createAudioPlayer(track.source);
        player.loop = true;
        player.volume = vol;
        player.play();
        soundRef.current = player;
        setPlaying(true);
      } catch (e) {
        // Network/decode failure: stay silent rather than crash the session.
        setPlaying(false);
      }
    },
    [unload]
  );

  const selectTrack = async (id) => {
    setTrackId(id);
    persist({ trackId: id, volume });
    if (id === 'none') {
      await unload();
    } else {
      await playTrack(id, volume);
    }
  };

  const togglePlay = async () => {
    if (!soundRef.current) {
      if (trackId !== 'none') await playTrack(trackId, volume);
      return;
    }
    const p = soundRef.current;
    if (p.playing) {
      p.pause();
      setPlaying(false);
    } else {
      p.play();
      setPlaying(true);
    }
  };

  const onVolume = (v) => {
    setVolume(v);
    if (soundRef.current) soundRef.current.volume = v;
  };
  const onVolumeDone = (v) => persist({ trackId, volume: v });

  // ---- Sheet open/close animation ------------------------------------------
  const animateTo = useCallback(
    (open) => {
      shown.current = open;
      Animated.timing(translateY, {
        toValue: open ? -sheetHeight : 0,
        duration: 260,
        easing: open ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && !open) setVisible(false);
      });
    },
    [sheetHeight, translateY]
  );

  const open = useCallback(() => {
    setVisible(true);
    // Let the sheet mount at its hidden position first.
    requestAnimationFrame(() => animateTo(true));
  }, [animateTo]);

  const close = useCallback(() => animateTo(false), [animateTo]);

  useImperativeHandle(ref, () => ({
    open,
    close,
    // Called by BreathingScreen on session reset.
    stopMusic: () => {
      unload();
    },
  }));

  // Drag-to-dismiss on the grab handle (native gesture, replaces the web
  // modal's close button).
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 6,
      onPanResponderMove: (_e, g) => {
        if (g.dy > 0) translateY.setValue(-sheetHeight + g.dy);
      },
      onPanResponderRelease: (_e, g) => {
        if (g.dy > sheetHeight * 0.25 || g.vy > 0.8) {
          animateTo(false);
        } else {
          animateTo(true);
        }
      },
    })
  ).current;

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Backdrop */}
      <Pressable style={styles.backdrop} onPress={close} />

      {/* Sheet sits just below the screen edge, slides up by sheetHeight */}
      <Animated.View
        style={[
          styles.sheet,
          {
            height: sheetHeight,
            bottom: -sheetHeight,
            transform: [{ translateY }],
          },
        ]}
      >
        <View style={styles.handleArea} {...pan.panHandlers}>
          <View style={styles.handle} />
        </View>

        <Text style={styles.sheetTitle}>Background music</Text>

        <View style={styles.trackList}>
          {TRACKS.map((t) => (
            <Pressable
              key={t.id}
              onPress={() => selectTrack(t.id)}
              style={[styles.trackBtn, trackId === t.id && styles.trackBtnActive]}
            >
              <Text
                style={[
                  styles.trackText,
                  trackId === t.id && styles.trackTextActive,
                ]}
              >
                {t.name}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.row}>
          <Pressable
            style={[styles.playBtn, trackId === 'none' && styles.playBtnDisabled]}
            onPress={togglePlay}
            disabled={trackId === 'none'}
          >
            <Text style={styles.playBtnText}>{playing ? '❚❚' : '▶'}</Text>
          </Pressable>

          <Text style={styles.volLabel}>Vol</Text>
          <VolumeBar volume={volume} onChange={onVolume} onCommit={onVolumeDone} />
        </View>

        <Text style={styles.hint}>
          Music keeps playing if you switch apps mid-session; it stops when you
          reset the session.
        </Text>
      </Animated.View>
    </View>
  );
});

export default MusicManager;

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: '#141d30',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: '6%',
    // iOS shadow / Android elevation for sheet lift-off
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: -6 },
    elevation: 20,
  },
  handleArea: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  handle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  sheetTitle: {
    color: '#eaf2ff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 14,
  },
  trackList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 20,
  },
  trackBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  trackBtnActive: {
    backgroundColor: '#2f7fe0',
  },
  trackText: {
    color: '#cfe0f5',
    fontSize: 15,
  },
  trackTextActive: {
    color: '#fff',
    fontWeight: '700',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  playBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#2f7fe0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtnDisabled: {
    opacity: 0.35,
  },
  playBtnText: {
    color: '#fff',
    fontSize: 16,
  },
  volLabel: {
    color: '#9fb6d4',
    fontSize: 14,
  },
  volTrackHit: {
    flex: 1,
    height: 40,
    justifyContent: 'center',
  },
  volTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
    overflow: 'hidden',
  },
  volFill: {
    height: '100%',
    backgroundColor: '#2f7fe0',
    borderRadius: 3,
  },
  volThumb: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    marginLeft: -9,
    backgroundColor: '#5aa9ff',
  },
  hint: {
    color: '#7f95b5',
    fontSize: 12.5,
    marginTop: 16,
    lineHeight: 18,
  },
});
