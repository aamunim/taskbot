import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

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

// ------------------------------------------------------------------ press feedback

export const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/**
 * A surface that presses in slightly under the finger and springs back.
 * Spread `handlers` on a Pressable and put `scale` in its transform.
 */
export function usePressScale(to = 0.97) {
  const scale = useRef(new Animated.Value(1)).current;
  const go = (toValue: number) => {
    if (reduceMotionNow()) return;
    Animated.spring(scale, { toValue, speed: 40, bounciness: toValue === 1 ? 7 : 0, useNativeDriver: true }).start();
  };
  return { scale, handlers: { onPressIn: () => go(to), onPressOut: () => go(1) } };
}

// ------------------------------------------------------------------ numbers

/** Counts from the previous value to the new one whenever `value` changes. */
export function useCountUp(value: number, duration = 450): number {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    from.current = value;
    if (start === value || reduceMotionNow()) {
      setShown(value);
      return;
    }
    const v = new Animated.Value(start);
    const id = v.addListener(({ value: x }) => setShown(Math.round(x)));
    Animated.timing(v, { toValue: value, duration, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(() => setShown(value));
    return () => {
      v.removeListener(id);
      v.stopAnimation();
    };
  }, [value, duration]);
  return shown;
}

// ------------------------------------------------------------------ progress ring

/**
 * A circular progress ring drawn with plain views (two clipped half rings that
 * rotate into place), so it needs no drawing library. Fills clockwise from the top.
 */
export function ProgressRing({ size, stroke, progress, color, track, children }: { size: number; stroke: number; progress: number; color: string; track: string; children?: ReactNode }) {
  const clamped = Math.max(0, Math.min(1, progress));
  const p = useRef(new Animated.Value(reduceMotionNow() ? clamped : 0)).current;
  useEffect(() => {
    if (reduceMotionNow()) {
      p.setValue(clamped);
      return;
    }
    const anim = Animated.timing(p, { toValue: clamped, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    anim.start();
    return () => anim.stop();
  }, [clamped, p]);

  const half = size / 2;
  const circle = { width: size, height: size, borderRadius: half, borderWidth: stroke, borderColor: color } as const;
  const first = p.interpolate({ inputRange: [0, 0.5], outputRange: ['0deg', '180deg'], extrapolate: 'clamp' });
  const second = p.interpolate({ inputRange: [0.5, 1], outputRange: ['0deg', '180deg'], extrapolate: 'clamp' });
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}>
      <View style={[circle, { position: 'absolute', borderColor: track }]} />
      {/* 0 to 50%: the left half of a ring turns into the right half of the circle. */}
      <View style={{ position: 'absolute', left: half, width: half, height: size, overflow: 'hidden' }}>
        <Animated.View style={{ position: 'absolute', left: -half, width: size, height: size, transform: [{ rotate: first }] }}>
          <View style={{ position: 'absolute', left: 0, width: half, height: size, overflow: 'hidden' }}>
            <View style={circle} />
          </View>
        </Animated.View>
      </View>
      {/* 50 to 100%: the right half of a ring turns into the left half of the circle. */}
      <View style={{ position: 'absolute', left: 0, width: half, height: size, overflow: 'hidden' }}>
        <Animated.View style={{ position: 'absolute', left: 0, width: size, height: size, transform: [{ rotate: second }] }}>
          <View style={{ position: 'absolute', left: half, width: half, height: size, overflow: 'hidden' }}>
            <View style={[circle, { marginLeft: -half }]} />
          </View>
        </Animated.View>
      </View>
      {children}
    </View>
  );
}
