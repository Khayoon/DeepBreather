import { Platform } from 'react-native';
import { Asset } from 'expo-asset';
import { createAudioPlayer } from 'expo-audio';

/** The browser play() promise can reject asynchronously (permissions/decoding). */
export default function createLoopPlayer(source) {
  if (Platform.OS !== 'web') return createAudioPlayer(source);
  const audio = new Audio(Asset.fromModule(source).uri);
  const listeners = new Set();
  let released = false;
  const emit = (error = null) => {
    if (!released) listeners.forEach((listener) => listener({ playing: !audio.paused && !error, error }));
  };
  audio.onplay = () => emit();
  audio.onpause = () => emit();
  audio.onerror = () => emit('Unable to load this loop');
  return {
    get playing() { return !audio.paused; },
    set loop(value) { audio.loop = value; },
    set volume(value) { audio.volume = value; },
    play() {
      audio.play().catch(() => emit('Playback could not start'));
    },
    pause() { audio.pause(); },
    addListener(_event, listener) {
      listeners.add(listener);
      return { remove: () => listeners.delete(listener) };
    },
    remove() {
      released = true;
      listeners.clear();
      audio.pause();
      audio.onplay = audio.onpause = audio.onerror = null;
      audio.removeAttribute('src');
      audio.load();
    },
  };
}
