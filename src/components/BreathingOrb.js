import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { colors } from '../theme';

const MIN_SCALE = 0.62;
const MAX_SCALE = 1;

/** Golden lungs expand with each inhale. Transform animations use the native driver. */
export default function BreathingOrb({
  motion = 'rest',
  cycleKey = 0,
  duration = 800,
  remainingMs = duration,
  paused = false,
  reducedMotion = false,
  progress = 0,
  size = 260,
  children,
}) {
  const scale = useRef(new Animated.Value(MIN_SCALE)).current;
  const glow = useRef(new Animated.Value(0.5)).current;
  const anim = useRef(null);
  // Read the latest timer on phase changes/resume without restarting every tick.
  const remainingRef = useRef(remainingMs);
  remainingRef.current = remainingMs;

  useEffect(() => {
    if (anim.current) anim.current.stop();

    // Reduce-motion: hold the orb at a steady size and let the numbers and
    // colour carry the phase instead. No tweens, no looping pulse.
    if (reducedMotion) {
      scale.setValue(0.78);
      glow.setValue(motion === 'holdHigh' || motion === 'expand' ? 0.95 : 0.6);
      return undefined;
    }

    if (paused) {
      // Freeze in place; stopAnimation leaves the value where it is.
      scale.stopAnimation();
      glow.stopAnimation();
      return undefined;
    }

    const tween = (value, toValue, ms, easing) =>
      Animated.timing(value, { toValue, duration: ms, easing, useNativeDriver: true });

    const breathDuration = Math.max(0, remainingRef.current - 60);
    let next = null;
    switch (motion) {
      case 'expand':
        next = Animated.parallel([
          tween(scale, MAX_SCALE, breathDuration, Easing.out(Easing.quad)),
          tween(glow, 0.95, breathDuration, Easing.out(Easing.quad)),
        ]);
        break;
      case 'contract':
        next = Animated.parallel([
          tween(scale, MIN_SCALE, breathDuration, Easing.in(Easing.quad)),
          tween(glow, 0.65, breathDuration, Easing.in(Easing.quad)),
        ]);
        break;
      case 'holdLow':
        // Empty lungs. Stay small, with a barely-there drift so the screen
        // does not look frozen during a two-minute retention.
        next = Animated.loop(
          Animated.sequence([
            tween(scale, MIN_SCALE + 0.035, 3600, Easing.inOut(Easing.sin)),
            tween(scale, MIN_SCALE, 3600, Easing.inOut(Easing.sin)),
          ])
        );
        break;
      case 'holdHigh':
        // Full lungs. Sit near maximum and shimmer instead of moving.
        scale.setValue(MAX_SCALE);
        next = Animated.loop(
          Animated.sequence([
            tween(glow, 0.68, 1400, Easing.inOut(Easing.sin)),
            tween(glow, 1, 1400, Easing.inOut(Easing.sin)),
          ])
        );
        break;
      case 'rest':
      default:
        next = Animated.parallel([
          tween(scale, 0.68, 900, Easing.inOut(Easing.quad)),
          tween(glow, 0.6, 900, Easing.inOut(Easing.quad)),
        ]);
        break;
    }

    anim.current = next;
    next.start();
    return () => {
      if (anim.current) anim.current.stop();
    };
  }, [motion, cycleKey, duration, paused, reducedMotion, scale, glow]);

  // ---- Progress ring ---------------------------------------------------------
  const ring = useMemo(() => {
    const stroke = Math.max(2, size * 0.012);
    const r = size / 2 - stroke;
    const circumference = 2 * Math.PI * r;
    return {
      stroke,
      r,
      circumference,
      dash: `${circumference * Math.min(1, Math.max(0, progress))} ${circumference}`,
      c: size / 2,
    };
  }, [size, progress]);

  const orbSize = size * 0.94;

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      {/* Session progress, drawn from 12 o'clock clockwise */}
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle
          cx={ring.c}
          cy={ring.c}
          r={ring.r}
          stroke={colors.line}
          strokeWidth={ring.stroke}
          fill="none"
        />
        {progress > 0 && (
          <Circle
            cx={ring.c}
            cy={ring.c}
            r={ring.r}
            stroke="#f2b544"
            strokeWidth={ring.stroke}
            strokeLinecap="round"
            strokeDasharray={ring.dash}
            fill="none"
            opacity={0.65}
            transform={`rotate(-90 ${ring.c} ${ring.c})`}
          />
        )}
      </Svg>

      <Animated.View
        pointerEvents="none"
        style={[
          styles.orb,
          {
            width: orbSize,
            height: orbSize,
            transform: [{ scale }],
            opacity: glow,
          },
        ]}
      >
        <Svg width={orbSize} height={orbSize} viewBox="0 0 260 260">
          <Defs>
            <LinearGradient id="lungGold" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor="#fff0b0" />
              <Stop offset="40%" stopColor="#eebf58" />
              <Stop offset="75%" stopColor="#b87821" />
              <Stop offset="100%" stopColor="#f7d77f" />
            </LinearGradient>
          </Defs>
          <Path
            d="M113 48 C102 34 86 46 71 62 C46 88 26 132 24 179 C22 214 37 227 62 217 L104 200 C117 195 120 183 119 166 L117 65 Q117 53 113 48 Z M147 48 C158 34 174 46 189 62 C214 88 234 132 236 179 C238 214 223 227 198 217 L156 200 C143 195 140 183 141 166 L143 65 Q143 53 147 48 Z"
            fill="url(#lungGold)" stroke="#ffe3a0" strokeWidth="1.5"
          />
          <Path
            d="M130 28 L130 83 M130 78 Q114 100 88 115 M130 78 Q146 100 172 115 M88 115 L65 155 M88 115 L91 157 M172 115 L195 155 M172 115 L169 157 M65 155 L49 177 M65 155 L70 188 M195 155 L211 177 M195 155 L190 188"
            fill="none" stroke="#664319" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" opacity="0.55"
          />
        </Svg>
      </Animated.View>

      {/* Counters sit above the orb and never scale with it, so numbers stay
          the same size whether the orb is in or out. */}
      <View style={styles.overlay} pointerEvents="none">
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  orb: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
