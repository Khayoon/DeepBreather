import React, { useRef } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { colors, radius, space, type, fonts } from '../theme';
import useDialogFocus from '../lib/useDialogFocus';

const POINTS = [
  {
    head: 'Never in or near water',
    body:
      'No baths, pools, showers or open water — before, during or after a session. Shallow-water blackout is the way this practice actually hurts people.',
  },
  {
    head: 'Never while driving',
    body: 'Or on a bike, on stairs, or operating anything with moving parts.',
  },
  {
    head: 'Sit or lie down first',
    body:
      'This breathing can cause fainting. Use a safe, dry place where a loss of balance cannot cause a fall or injury. Never try to make yourself faint.',
  },
  {
    head: 'Tingling is expected',
    body:
      'Light-headedness and tingling in the hands and face are ordinary. Sharp pain, chest tightness or real distress are not — stop and breathe normally.',
  },
  {
    head: 'Check with a doctor first',
    body:
      'This style of breathing is not for everyone. Talk to a doctor first if you are pregnant, or have a heart condition, high blood pressure, epilepsy, or a history of fainting.',
  },
];

/** Full safety details, opened voluntarily from the Safety button. */
export default function SafetyGate({ onClose }) {
  const dialogRef = useRef(null);
  useDialogFocus(dialogRef);
  return (
    <View style={styles.backdrop}>
      <View ref={dialogRef} style={styles.card} accessibilityViewIsModal role="dialog" aria-modal={true} accessibilityLabel="Safety information">
        <Text style={styles.kicker}>Before you start</Text>
        <Text style={styles.title}>Breath holding has real risks</Text>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollInner}
          showsVerticalScrollIndicator
        >
          {POINTS.map((p) => (
            <View key={p.head} style={styles.point}>
              <View style={styles.bullet} />
              <View style={styles.pointText}>
                <Text style={styles.pointHead}>{p.head}</Text>
                <Text style={styles.pointBody}>{p.body}</Text>
              </View>
            </View>
          ))}
          <Text style={styles.disclaimer}>
            Deep Breather is a timer and a visual guide. It is not medical advice and it
            cannot tell how you are doing — you are the only one watching that.
          </Text>
        </ScrollView>

        <Pressable
          style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close safety notice"
        >
          <Text style={styles.ctaText}>Close</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(3,7,15,0.86)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space(5),
    zIndex: 50,
  },
  card: {
    width: '100%',
    maxWidth: 520,
    maxHeight: '92%',
    backgroundColor: colors.bgElevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: space(6),
    paddingVertical: space(5),
  },
  kicker: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    fontFamily: fonts.body,
  },
  title: {
    ...type.display,
    fontSize: 25,
    color: colors.text,
    marginTop: space(2),
    marginBottom: space(3),
    fontFamily: fonts.body,
  },
  scroll: { flexGrow: 0, flexShrink: 1 },
  scrollInner: { paddingBottom: space(2) },
  point: {
    flexDirection: 'row',
    marginBottom: space(3.5),
    gap: space(3),
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
    marginTop: 7,
  },
  pointText: { flex: 1 },
  pointHead: {
    color: colors.text,
    fontSize: 15.5,
    fontWeight: '700',
    marginBottom: 3,
    fontFamily: fonts.body,
  },
  pointBody: {
    color: colors.textDim,
    fontSize: 14.5,
    lineHeight: 21,
    fontFamily: fonts.body,
  },
  disclaimer: {
    color: colors.textFaint,
    fontSize: 13,
    lineHeight: 19,
    marginTop: space(1),
    fontFamily: fonts.body,
  },
  cta: {
    marginTop: space(5),
    backgroundColor: colors.accent,
    borderRadius: radius.pill,
    paddingVertical: space(4),
    alignItems: 'center',
  },
  ctaPressed: { opacity: 0.85 },
  ctaText: {
    color: colors.accentInk,
    fontSize: 17,
    fontWeight: '700',
    fontFamily: fonts.body,
  },
});
