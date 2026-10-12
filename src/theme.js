/**
 * Design tokens. Everything visual references this file so the palette can be
 * retuned in one place (and so the web build and the Android build cannot
 * drift apart).
 */
import { Platform } from 'react-native';

export const colors = {
  bg: '#070d18',
  bgElevated: '#101a2c',
  sheet: '#141d30',
  line: 'rgba(255,255,255,0.08)',
  lineStrong: 'rgba(255,255,255,0.16)',

  text: '#eaf2ff',
  textDim: '#9fb6d4',
  textFaint: '#6f86a6',

  primary: '#2f7fe0',
  primaryBright: '#5aa9ff',
  primarySoft: '#7db8f7',

  accent: '#f2b544',
  accentInk: '#241a05',

  danger: '#ff6b6b',
  good: '#4ade80',
};

export const radius = {
  sm: 10,
  md: 16,
  lg: 22,
  pill: 999,
};

export const space = (n) => n * 4;

/**
 * System font stacks. On web, react-native-web maps `fontFamily: 'System'` to
 * a generic sans that renders inconsistently across platforms, so we pin an
 * explicit stack there instead.
 */
export const fonts = Platform.select({
  web: {
    body: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  default: { body: undefined },
});

export const type = {
  display: { fontSize: 30, fontWeight: '700', letterSpacing: -0.4 },
  title: { fontSize: 20, fontWeight: '700' },
  body: { fontSize: 16, fontWeight: '400' },
  small: { fontSize: 13.5, fontWeight: '400' },
  mono: { fontVariant: ['tabular-nums'] },
};
