import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { colors, radius, space, fonts } from '../theme';
import { tapSelection } from '../lib/haptics';

/**
 * How many rounds to run. A stepper rather than a picker: the range is 1–10,
 * it is reachable one-handed, and it stays legible at large font sizes.
 * Disabled while a session is in progress.
 */
export default function RoundSelector({ rounds, min, max, onChange, disabled, estimate }) {
  const bump = (delta) => {
    if (disabled) return;
    const next = Math.min(max, Math.max(min, rounds + delta));
    if (next !== rounds) {
      tapSelection();
      onChange(next);
    }
  };

  return (
    <View style={[styles.wrap, disabled && styles.disabled]}>
      <View style={styles.row}>
        <Text style={styles.label}>Rounds</Text>
        <View
          style={styles.stepper}
          accessible
          accessibilityRole="adjustable"
          accessibilityLabel="Number of rounds"
          accessibilityValue={{ min, max, now: rounds }}
          accessibilityState={{ disabled: !!disabled }}
          accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
          onAccessibilityAction={(e) =>
            bump(e.nativeEvent.actionName === 'increment' ? 1 : -1)
          }
        >
          <Pressable
            onPress={() => bump(-1)}
            disabled={disabled || rounds <= min}
            style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="One fewer round"
          >
            <Text style={styles.btnText}>−</Text>
          </Pressable>
          <Text style={styles.value}>{rounds}</Text>
          <Pressable
            onPress={() => bump(1)}
            disabled={disabled || rounds >= max}
            style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="One more round"
          >
            <Text style={styles.btnText}>+</Text>
          </Pressable>
        </View>
      </View>
      {estimate ? <Text style={styles.estimate}>{estimate}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: space(1) },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space(4) },
  disabled: { opacity: 0.35 },
  label: { color: colors.textDim, fontSize: 16, fontFamily: fonts.body },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.line,
    borderRadius: radius.pill,
    paddingHorizontal: space(1.5),
    paddingVertical: space(1),
  },
  btn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  btnPressed: { backgroundColor: colors.lineStrong },
  btnText: { color: colors.text, fontSize: 22, lineHeight: 26, fontFamily: fonts.body },
  value: {
    color: colors.text,
    fontSize: 18,
    fontVariant: ['tabular-nums'],
    minWidth: 34,
    textAlign: 'center',
    fontFamily: fonts.body,
  },
  estimate: { color: colors.textFaint, fontSize: 12.5, fontFamily: fonts.body },
});
