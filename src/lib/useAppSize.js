/**
 * The size the app should lay itself out against.
 *
 * On Android that is simply the window. On the web landing page the app is
 * rendered inside a phone frame, so the window is much larger than the app —
 * components that sized themselves off `useWindowDimensions` there would spill
 * out of the frame. This context lets the frame publish its own size, and
 * falls back to the window everywhere else.
 */
import React, { createContext, useContext } from 'react';
import { useWindowDimensions } from 'react-native';

const AppSizeContext = createContext(null);

export function AppSizeProvider({ size, children }) {
  return <AppSizeContext.Provider value={size}>{children}</AppSizeContext.Provider>;
}

export default function useAppSize() {
  const override = useContext(AppSizeContext);
  const window = useWindowDimensions();
  return override || window;
}
