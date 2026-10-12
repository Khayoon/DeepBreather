import { useEffect } from 'react';
import { Platform } from 'react-native';

/** Keep keyboard focus inside the open panel, then return to its opener. */
export default function useDialogFocus(ref, visible = true) {
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return undefined;
    const panel = ref.current;
    if (!panel?.querySelectorAll) return undefined;
    const previous = document.activeElement;
    const controls = () => [...panel.querySelectorAll('button, a[href], input, select, textarea, [tabindex]')]
      .filter((el) => !el.disabled && el.tabIndex >= 0 && el.getClientRects().length);
    const frame = requestAnimationFrame(() => controls()[0]?.focus());
    const onKey = (event) => {
      if (event.key !== 'Tab') return;
      const items = controls();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKey);
      if (previous?.isConnected) previous.focus();
    };
  }, [ref, visible]);
}
