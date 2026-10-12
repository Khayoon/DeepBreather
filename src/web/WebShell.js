import React from 'react';
import {
  View,
  Text,
  Pressable,
  Linking,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { colors, radius, space, fonts } from '../theme';
import { AppSizeProvider } from '../lib/useAppSize';
import { GITHUB_URL, APK_URL, PLAY_URL } from './links';

/**
 * Web-only chrome.
 *
 * On a phone-sized browser the app simply fills the viewport — it is the same
 * app, and nothing should get between someone and a breathing session. On a
 * desktop viewport a full-bleed breathing app would be strange, so the app is
 * framed as a device and given a short landing column beside it. The frame
 * publishes its own dimensions through AppSizeProvider so the app inside lays
 * out against the frame rather than the browser window.
 */

const FEATURES = [
  {
    title: 'Timing you can close your eyes for',
    body:
      'Thirty breaths at three seconds in and three seconds out, a hold you end yourself, then a fifteen-second recovery hold. Follow the golden lungs at your own comfort level.',
  },
  {
    title: 'Retention is never on a timer',
    body:
      'Deep Breather counts up and waits for you to tap Breathe. You decide when to end the hold; there is no target to beat.',
  },
  {
    title: 'Ambient loops, generated not licensed',
    body:
      'Four seamless drones synthesised from scratch and bundled in the app. No network, no attribution to get wrong, works on a plane.',
  },
  {
    title: 'Your practice, stored on your device',
    body:
      'Streaks, session count and how long you held each round — kept locally, sent nowhere.',
  },
];

function LinkButton({ label, url, primary }) {
  if (!url) return null;
  return (
    <Pressable
      onPress={() => Linking.openURL(url)}
      style={({ pressed, hovered }) => [
        styles.linkBtn,
        primary && styles.linkBtnPrimary,
        (pressed || hovered) && styles.linkBtnHover,
      ]}
      accessibilityRole="link"
      accessibilityLabel={label}
    >
      <Text style={[styles.linkText, primary && styles.linkTextPrimary]}>{label}</Text>
    </Pressable>
  );
}

export default function WebShell({ children }) {
  const { width, height } = useWindowDimensions();
  const wide = width >= 1040 && height >= 620;

  // Device frame sized to the viewport, in roughly a modern phone's ratio.
  const frameH = Math.min(820, height - 96);
  const frameW = Math.min(400, Math.round(frameH * 0.48));
  const inner = wide ? { width: frameW - 16, height: frameH - 16 } : { width, height };

  return (
    <ScrollView style={styles.page} contentContainerStyle={wide ? styles.pageInner : styles.mobilePage} scrollEnabled={wide}>
      <View style={wide ? styles.columns : styles.mobileColumn}>
        <View style={[styles.copy, !wide && styles.hidden]}>
          <Text style={styles.wordmark}>Deep Breather</Text>
          <Text style={styles.headline}>
            Guided Tummo breathing that keeps time so you don&apos;t have to.
          </Text>
          <Text style={styles.lede}>
            A breathing session runs on a rhythm that is easy to lose the moment you
            relax into it. Follow the golden lungs, find an unhurried rhythm, and
            take a few minutes for yourself.
          </Text>

          <View style={styles.featureList}>
            {FEATURES.map((f) => (
              <View key={f.title} style={styles.feature}>
                <Text style={styles.featureTitle}>{f.title}</Text>
                <Text style={styles.featureBody}>{f.body}</Text>
              </View>
            ))}
          </View>

          <View style={styles.ctaRow}>
            <LinkButton label="Get the Android build" url={APK_URL || PLAY_URL} primary />
            <LinkButton label="Source on GitHub" url={GITHUB_URL} />
          </View>

          <Text style={styles.colophon}>
            No account needed. Your settings and practice history stay on this device.
          </Text>
          <Text style={styles.safetyNote}>
            Breath retention carries real risks — never practise in water or while
            driving. Full guidance is available under Safety.
          </Text>
        </View>

        <View style={wide ? styles.stage : styles.mobileColumn}>
          <View style={wide ? [styles.frame, { width: frameW, height: frameH }] : styles.mobileColumn}>
            <View style={[wide ? styles.screen : styles.mobileScreen, inner]}>
              <AppSizeProvider size={inner}>{children}</AppSizeProvider>
            </View>
          </View>
          <Text style={[styles.stageHint, !wide && styles.hidden]}>Live — press Start</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  mobilePage: { flexGrow: 1 },
  mobileColumn: { flex: 1 },
  mobileScreen: { flexShrink: 0, overflow: 'hidden', backgroundColor: colors.bg },
  hidden: { display: 'none' },
  pageInner: {
    minHeight: '100%',
    justifyContent: 'center',
    paddingVertical: space(10),
    paddingHorizontal: space(8),
  },
  columns: {
    flexDirection: 'row',
    gap: space(14),
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 1180,
    alignSelf: 'center',
    width: '100%',
  },

  copy: { flex: 1, maxWidth: 560 },
  wordmark: {
    color: colors.textFaint,
    fontSize: 12,
    letterSpacing: 2.4,
    fontWeight: '700',
    textTransform: 'uppercase',
    fontFamily: fonts.body,
  },
  headline: {
    color: colors.text,
    fontSize: 40,
    lineHeight: 47,
    fontWeight: '700',
    letterSpacing: -0.8,
    marginTop: space(3),
    fontFamily: fonts.body,
  },
  lede: {
    color: colors.textDim,
    fontSize: 17,
    lineHeight: 26,
    marginTop: space(4),
    fontFamily: fonts.body,
  },

  featureList: { marginTop: space(8), gap: space(5) },
  feature: { borderLeftWidth: 2, borderLeftColor: colors.line, paddingLeft: space(4) },
  featureTitle: {
    color: colors.text,
    fontSize: 15.5,
    fontWeight: '700',
    fontFamily: fonts.body,
  },
  featureBody: {
    color: colors.textDim,
    fontSize: 14.5,
    lineHeight: 21,
    marginTop: 3,
    fontFamily: fonts.body,
  },

  ctaRow: { flexDirection: 'row', gap: space(3), marginTop: space(8), flexWrap: 'wrap' },
  linkBtn: {
    paddingVertical: space(3.5),
    paddingHorizontal: space(6),
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.lineStrong,
  },
  linkBtnPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
  linkBtnHover: { opacity: 0.85 },
  linkText: { color: colors.text, fontSize: 15, fontWeight: '600', fontFamily: fonts.body },
  linkTextPrimary: { color: '#fff' },

  colophon: {
    color: colors.textFaint,
    fontSize: 13,
    lineHeight: 20,
    marginTop: space(8),
    fontFamily: fonts.body,
  },
  safetyNote: {
    color: colors.accent,
    fontSize: 12.5,
    lineHeight: 19,
    marginTop: space(2),
    opacity: 0.8,
    fontFamily: fonts.body,
  },

  stage: { alignItems: 'center', gap: space(3) },
  frame: {
    padding: 8,
    borderRadius: 42,
    backgroundColor: '#0d1524',
    borderWidth: 1,
    borderColor: colors.lineStrong,
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 24 },
  },
  screen: { borderRadius: 34, overflow: 'hidden', backgroundColor: colors.bg },
  stageHint: { color: colors.textFaint, fontSize: 12.5, fontFamily: fonts.body },
});
