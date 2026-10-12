/**
 * Reduce-motion detection that works on both targets.
 *
 * - iOS/Android: AccessibilityInfo.isReduceMotionEnabled() plus its change
 *   event, so toggling the OS setting takes effect without an app restart.
 * - Web: react-native-web does not wire AccessibilityInfo up to the media
 *   query, so we read `prefers-reduced-motion` directly.
 *
 * A user override (Settings → "Calm mode") is layered on top by the caller.
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';

const MQ = '(prefers-reduced-motion: reduce)';

export default function useReducedMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let alive = true;

    if (Platform.OS === 'web') {
      if (typeof window === 'undefined' || !window.matchMedia) return undefined;
      const mq = window.matchMedia(MQ);
      const apply = () => alive && setReduced(mq.matches);
      apply();
      // Safari < 14 only has the deprecated addListener form.
      if (mq.addEventListener) mq.addEventListener('change', apply);
      else mq.addListener(apply);
      return () => {
        alive = false;
        if (mq.removeEventListener) mq.removeEventListener('change', apply);
        else mq.removeListener(apply);
      };
    }

    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setReduced(!!v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) =>
      alive ? setReduced(!!v) : undefined
    );
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);

  return reduced;
}
