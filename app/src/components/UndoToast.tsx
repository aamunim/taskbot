import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLayout } from '@/lib/layout';
import { radius, space, useTheme } from '@/lib/theme';
import { Txt } from './ui';

type Toast = { text: string; seconds: number; onUndo: () => void; onExpire: () => void };

// One toast for the whole app, shown from anywhere without threading props.
let show: ((toast: Toast) => void) | null = null;
/** Shows a message with an Undo button; `onExpire` runs if it was not undone in time. */
export const showUndoToast = (toast: Toast) => (show ? show(toast) : toast.onExpire());

/** Mount once near the root. */
export function UndoToastHost() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { desktop } = useLayout();
  const [toast, setToast] = useState<Toast | null>(null);
  const current = useRef<Toast | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progress = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const finish = (run: 'undo' | 'expire' | null) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      const done = current.current;
      current.current = null;
      setToast(null);
      if (done && run === 'undo') done.onUndo();
      if (done && run === 'expire') done.onExpire();
    };
    show = (next) => {
      // A newer toast lets the previous action go ahead rather than dropping it.
      finish('expire');
      current.current = next;
      setToast(next);
      progress.setValue(1);
      Animated.timing(progress, { toValue: 0, duration: next.seconds * 1000, useNativeDriver: false }).start();
      timer.current = setTimeout(() => finish('expire'), next.seconds * 1000);
    };
    undoCurrent = () => finish('undo');
    return () => {
      show = null;
      finish('expire');
    };
  }, [progress]);

  if (!toast) return null;
  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: (desktop ? 0 : 84) + insets.bottom + space.lg, alignItems: 'center', paddingHorizontal: space.lg }}>
      <View
        accessibilityRole="alert"
        style={{ width: '100%', maxWidth: 460, borderRadius: radius.lg, backgroundColor: t.text, overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingLeft: space.lg, paddingRight: space.sm }}>
          <Ionicons name="paper-plane" size={18} color={t.bg} />
          <Txt variant="label" color={t.bg} style={{ flex: 1 }}>{toast.text}</Txt>
          <Pressable
            onPress={() => undoCurrent()}
            accessibilityRole="button"
            accessibilityLabel="Undo"
            hitSlop={8}
            style={({ pressed }) => [{ paddingVertical: 8, paddingHorizontal: space.md, borderRadius: radius.md }, pressed && { opacity: 0.6 }]}>
            <Txt variant="label" strong color={t.bg}>Undo</Txt>
          </Pressable>
        </View>
        <Animated.View style={{ height: 3, backgroundColor: t.bg, opacity: 0.45, width: progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} />
      </View>
    </View>
  );
}

let undoCurrent: () => void = () => {};
