import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, StyleSheet, useColorScheme } from 'react-native';
import { SPLASH_BG } from '@/lib/theme';

const SIZE = 160; // must match imageWidth of the expo-splash-screen plugin in app.json
const layer = { position: 'absolute', width: SIZE, height: SIZE } as const;

/**
 * The animated half of the splash. It starts as an exact copy of the native
 * splash (same colour, same mark, same size), so the hand-off is invisible;
 * then the tick lands, the dot pops, and the whole thing lifts away to reveal
 * the app. Mounted once by the root layout, so it only ever plays on cold start.
 */
export function Intro({ onReady, onDone }: { onReady: () => void; onDone: () => void }) {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const bg = SPLASH_BG[scheme];
  const tick = useRef(new Animated.Value(0)).current;
  const dot = useRef(new Animated.Value(0)).current;
  const exit = useRef(new Animated.Value(0)).current;
  const [reduce, setReduce] = useState<boolean | null>(null);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduce)
      .catch(() => setReduce(false));
  }, []);

  useEffect(() => {
    if (reduce === null) return;
    const leave = Animated.timing(exit, { toValue: 1, duration: reduce ? 180 : 380, easing: Easing.in(Easing.cubic), useNativeDriver: true });
    const sequence = reduce
      ? leave
      : Animated.sequence([
          Animated.delay(120),
          Animated.parallel([
            Animated.timing(tick, { toValue: 1, duration: 420, easing: Easing.out(Easing.back(2.2)), useNativeDriver: true }),
            Animated.sequence([
              Animated.delay(160),
              Animated.timing(dot, { toValue: 1, duration: 360, easing: Easing.out(Easing.back(3)), useNativeDriver: true }),
            ]),
          ]),
          Animated.delay(140),
          leave,
        ]);
    sequence.start(() => onDone());
    return () => sequence.stop();
  }, [reduce, tick, dot, exit, onDone]);

  // The tick dips then settles; the dot swells then settles. Both rest at the native splash's pose.
  const tickScale = tick.interpolate({ inputRange: [0, 0.35, 1], outputRange: [1, 0.72, 1] });
  const dotScale = dot.interpolate({ inputRange: [0, 0.4, 1], outputRange: [1, 0.55, 1] });
  const markScale = exit.interpolate({ inputRange: [0, 1], outputRange: [1, 1.5] });
  const opacity = exit.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  // Scale the dot around its own centre (top right of the mark), not the mark's centre.
  const dotShift = SIZE * 0.34;

  return (
    <Animated.View pointerEvents="none" onLayout={onReady} style={[StyleSheet.absoluteFill, { backgroundColor: bg, alignItems: 'center', justifyContent: 'center', opacity }]}>
      <Animated.View style={{ width: SIZE, height: SIZE, transform: [{ scale: markScale }] }}>
        <Image source={require('../../assets/mark-bubble.png')} style={layer} />
        <Animated.Image source={require('../../assets/mark-check.png')} style={[layer, { tintColor: bg, transform: [{ scale: tickScale }] }]} />
        <Animated.View style={[layer, { transform: [{ translateX: dotShift }, { translateY: -dotShift }, { scale: dotScale }, { translateX: -dotShift }, { translateY: dotShift }] }]}>
          <Image source={require('../../assets/mark-ring.png')} style={[layer, { tintColor: bg }]} />
          <Image source={require('../../assets/mark-dot.png')} style={layer} />
        </Animated.View>
      </Animated.View>
    </Animated.View>
  );
}
