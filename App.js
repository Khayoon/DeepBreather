import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import BreathingScreen from './src/screens/BreathingScreen';
import WebShell from './src/web/WebShell';

/**
 * One app, two targets. Android renders the session screen straight into the
 * window; web hands it to WebShell first, which decides between "the app is the
 * page" (phone-sized browsers) and a framed demo with a landing column beside
 * it (desktop). The session screen itself is identical either way.
 */
export default function App() {
  if (Platform.OS === 'web') {
    return (
      <WebShell>
        <BreathingScreen />
      </WebShell>
    );
  }
  return (
    <View style={styles.root}>
      <BreathingScreen />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#070d18' },
});
