/**
 * Haptics wrapper.
 *
 * expo-haptics is a native module: on web it resolves to a stub whose calls
 * reject, and on Android devices with haptics disabled (battery saver, some
 * OEM builds) the underlying Vibrator call throws. Every call site wants
 * "buzz if you can, never crash", so that policy lives here once.
 */
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

const supported = Platform.OS === 'ios' || Platform.OS === 'android';

let enabled = true;
export const setHapticsEnabled = (v) => {
  enabled = !!v;
};
export const hapticsSupported = supported;

const safe = (fn) => {
  if (!supported || !enabled) return;
  try {
    const r = fn();
    if (r && typeof r.catch === 'function') r.catch(() => {});
  } catch (e) {
    /* device has no haptic engine, or it is switched off */
  }
};

export const tapLight = () =>
  safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));

export const tapMedium = () =>
  safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));

export const tapSelection = () => safe(() => Haptics.selectionAsync());

/** Stronger pulse for entering or leaving a breath hold. */
export const pulseWarn = () =>
  safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));

export const pulseSuccess = () =>
  safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));

export const fire = (kind) => {
  switch (kind) {
    case 'light':
      return tapLight();
    case 'medium':
      return tapMedium();
    case 'warn':
      return pulseWarn();
    case 'success':
      return pulseSuccess();
    default:
      return undefined;
  }
};
