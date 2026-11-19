import { Image, View } from 'react-native';

/** The app mark (bubble, tick, dot). `cut` is the colour showing through the tick. */
export function Logo({ size, cut }: { size: number; cut: string }) {
  const layer = { position: 'absolute', width: size, height: size } as const;
  return (
    <View style={{ width: size, height: size }} accessibilityRole="image" accessibilityLabel="TaskBot">
      <Image source={require('../../assets/mark-bubble.png')} style={layer} />
      <Image source={require('../../assets/mark-check.png')} style={[layer, { tintColor: cut }]} />
      <Image source={require('../../assets/mark-ring.png')} style={[layer, { tintColor: cut }]} />
      <Image source={require('../../assets/mark-dot.png')} style={layer} />
    </View>
  );
}
