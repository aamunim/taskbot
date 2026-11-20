import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, Image, Modal, PanResponder, Pressable, View, useWindowDimensions, type GestureResponderEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { roleColors } from '@/lib/roles';
import { space, useTheme } from '@/lib/theme';
import type { Role } from '@/lib/types';
import { Txt } from './ui';

export type GalleryImage = { key: string; uri: string; title: string; sender: string | null; role: Role; date: string };

// One viewer for the whole app, opened from anywhere without threading props.
let show: ((images: GalleryImage[], index: number) => void) | null = null;
export const openGallery = (images: GalleryImage[], index = 0) => show?.(images, index);

const MAX_SCALE = 4;
const distance = (e: GestureResponderEvent) => {
  const [a, b] = e.nativeEvent.touches;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
};

/**
 * One zoomable photo. Pinch to zoom, drag to pan while zoomed, double-tap to
 * zoom in and out, and drag down (when not zoomed) to close. Built on the core
 * responder system so it adds no native module.
 */
function ZoomImage({ image, width, height, onZoom, onClose, onTap, onDrag }: {
  image: GalleryImage;
  width: number;
  height: number;
  onZoom: (zoomed: boolean) => void;
  onClose: () => void;
  onTap: () => void;
  onDrag: (progress: number) => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;
  // Plain numbers mirror the animated values so gesture maths never reads them back asynchronously.
  const s = useRef({ scale: 1, x: 0, y: 0, startScale: 1, startDist: 0, startX: 0, startY: 0, pinching: false, lastTap: 0 }).current;
  const [failed, setFailed] = useState(false);

  const settle = (toScale: number, x: number, y: number) => {
    s.scale = toScale;
    s.x = x;
    s.y = y;
    onZoom(toScale > 1.02);
    Animated.parallel([
      Animated.spring(scale, { toValue: toScale, friction: 8, useNativeDriver: false }),
      Animated.spring(tx, { toValue: x, friction: 8, useNativeDriver: false }),
      Animated.spring(ty, { toValue: y, friction: 8, useNativeDriver: false }),
    ]).start();
  };
  const clamp = (v: number, limit: number) => Math.max(-limit, Math.min(limit, v));
  const bounds = (k: number) => ({ x: (width * (k - 1)) / 2, y: (height * (k - 1)) / 2 });

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        // Two fingers, a zoomed photo, or a mostly vertical drag belong to the photo;
        // a sideways swipe at normal size is left for the pager.
        onMoveShouldSetPanResponder: (e, g) => e.nativeEvent.touches.length === 2 || s.scale > 1.02 || (Math.abs(g.dy) > 10 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5),
        onMoveShouldSetPanResponderCapture: (e) => e.nativeEvent.touches.length === 2,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          s.startX = s.x;
          s.startY = s.y;
          s.pinching = false;
        },
        onPanResponderMove: (e, g) => {
          if (e.nativeEvent.touches.length === 2) {
            const d = distance(e);
            if (!s.pinching) {
              s.pinching = true;
              s.startDist = d;
              s.startScale = s.scale;
            }
            const next = Math.max(1, Math.min(MAX_SCALE, (s.startScale * d) / Math.max(1, s.startDist)));
            s.scale = next;
            scale.setValue(next);
            const b = bounds(next);
            s.x = clamp(s.x, b.x);
            s.y = clamp(s.y, b.y);
            tx.setValue(s.x);
            ty.setValue(s.y);
            return;
          }
          if (s.pinching) return; // one finger lifted mid-pinch: ignore until release
          if (s.scale > 1.02) {
            const b = bounds(s.scale);
            s.x = clamp(s.startX + g.dx, b.x);
            s.y = clamp(s.startY + g.dy, b.y);
            tx.setValue(s.x);
            ty.setValue(s.y);
          } else {
            ty.setValue(g.dy);
            onDrag(Math.min(1, Math.abs(g.dy) / 300));
          }
        },
        onPanResponderRelease: (_e, g) => {
          if (s.pinching || s.scale > 1.02) {
            s.pinching = false;
            if (s.scale < 1.08) settle(1, 0, 0);
            else onZoom(true);
            return;
          }
          if (Math.abs(g.dy) > 110 || Math.abs(g.vy) > 1.1) return onClose();
          onDrag(0);
          settle(1, 0, 0);
        },
        onPanResponderTerminate: () => {
          s.pinching = false;
          onDrag(0);
          if (s.scale < 1.08) settle(1, 0, 0);
        },
      }),
    // The handlers read the mutable `s`; only the frame size changes their maths.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [width, height],
  );

  const press = (e: GestureResponderEvent) => {
    const now = Date.now();
    if (now - s.lastTap < 280) {
      s.lastTap = 0;
      if (s.scale > 1.02) return settle(1, 0, 0);
      // Zoom towards the tapped point.
      const k = 2.5;
      const b = bounds(k);
      const px = e.nativeEvent.locationX - width / 2;
      const py = e.nativeEvent.locationY - height / 2;
      return settle(k, clamp(-px * (k - 1), b.x), clamp(-py * (k - 1), b.y));
    }
    s.lastTap = now;
    setTimeout(() => {
      if (s.lastTap === now) onTap();
    }, 290);
  };

  return (
    <View style={{ width, height }} {...responder.panHandlers}>
      <Pressable onPress={press} style={{ width, height }} accessibilityLabel={`${image.title}. Double tap to zoom.`}>
        {failed ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm }}>
            <Ionicons name="image-outline" size={40} color="rgba(255,255,255,0.6)" />
            <Txt variant="label" color="rgba(255,255,255,0.75)">This photo could not be loaded</Txt>
          </View>
        ) : (
          <Animated.View style={{ width, height, transform: [{ translateX: tx }, { translateY: ty }, { scale }] }}>
            <Image source={{ uri: image.uri }} style={{ width, height }} resizeMode="contain" onError={() => setFailed(true)} />
          </Animated.View>
        )}
      </Pressable>
    </View>
  );
}

/** Mount once near the root. Shows the full-screen viewer when `openGallery` is called. */
export function GalleryHost() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [state, setState] = useState<{ images: GalleryImage[]; index: number } | null>(null);
  const [index, setIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const [chrome, setChrome] = useState(true);
  const fade = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    show = (images, at) => {
      if (!images.length) return;
      setIndex(at);
      setZoomed(false);
      setChrome(true);
      fade.setValue(1);
      setState({ images, index: at });
    };
    return () => {
      show = null;
    };
  }, [fade]);

  const close = () => setState(null);
  if (!state) return null;
  const current = state.images[Math.min(index, state.images.length - 1)];

  return (
    <Modal visible transparent animationType="fade" onRequestClose={close} statusBarTranslucent>
      <Animated.View style={{ flex: 1, backgroundColor: '#000000', opacity: fade }}>
        <FlatList
          data={state.images}
          keyExtractor={(i) => i.key}
          horizontal
          pagingEnabled
          scrollEnabled={!zoomed}
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={state.index}
          getItemLayout={(_d, i) => ({ length: width, offset: width * i, index: i })}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
          renderItem={({ item }) => (
            <ZoomImage
              image={item}
              width={width}
              height={height}
              onZoom={setZoomed}
              onClose={close}
              onTap={() => setChrome((c) => !c)}
              onDrag={(p) => fade.setValue(1 - p * 0.6)}
            />
          )}
        />

        {chrome ? (
          <>
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, paddingTop: insets.top + space.sm, paddingHorizontal: space.lg, paddingBottom: space.md, flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: 'rgba(0,0,0,0.45)' }}>
              <Pressable onPress={close} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close" style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="close" size={22} color="#FFFFFF" />
              </Pressable>
              <View style={{ flex: 1 }} />
              {state.images.length > 1 ? <Txt variant="label" color="#FFFFFF">{index + 1} of {state.images.length}</Txt> : null}
            </View>
            <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingBottom: insets.bottom + space.lg, paddingTop: space.md, paddingHorizontal: space.xl, backgroundColor: 'rgba(0,0,0,0.45)', gap: 4 }}>
              <Txt content strong color="#FFFFFF" numberOfLines={1}>{current.title}</Txt>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: roleColors(t, current.role).solid }} />
                <Txt variant="caption" content color="rgba(255,255,255,0.85)" numberOfLines={1} style={{ flexShrink: 1 }}>{current.sender ?? 'Unknown'}</Txt>
                <Txt variant="caption" color="rgba(255,255,255,0.7)">· {current.date}</Txt>
              </View>
            </View>
          </>
        ) : null}
      </Animated.View>
    </Modal>
  );
}
