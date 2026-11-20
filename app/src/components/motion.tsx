import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';

let reduceCached: boolean | null = null;
const listeners = new Set<(v: boolean) => void>();
AccessibilityInfo.isReduceMotionEnabled()
  .then((v) => {
    reduceCached = v;
    listeners.forEach((l) => l(v));
  })
  .catch(() => {
    reduceCached = false;
  });
AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => {
  reduceCached = v;
  listeners.forEach((l) => l(v));
});

/** Whether the person asked the system for less motion. Animations become instant when true. */
export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(reduceCached ?? false);
  useEffect(() => {
    listeners.add(setReduce);
    if (reduceCached != null) setReduce(reduceCached);
    return () => {
      listeners.delete(setReduce);
    };
  }, []);
  return reduce;
}
export const reduceMotionNow = () => reduceCached ?? false;

/**
 * Fades and lifts its children in once, when first mounted. `index` staggers a
 * list: each row starts a little after the one above (capped, so a long list
 * never waits).
 */
export function Appear({ children, index = 0, style, distance = 10 }: { children: ReactNode; index?: number; style?: StyleProp<ViewStyle>; distance?: number }) {
  const reduce = reduceMotionNow();
  const v = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) return;
    const anim = Animated.timing(v, { toValue: 1, duration: 260, delay: Math.min(index, 7) * 38, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    anim.start();
    return () => anim.stop();
    // Mount-only: later re-renders must not replay the entrance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}
