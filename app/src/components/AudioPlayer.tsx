import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { signedUrl } from '@/lib/api';
import { fmtDuration } from '@/lib/format';
import { useTheme } from '@/lib/theme';
import { Txt, styles } from './ui';

// A fixed "waveform" so the player reads as audio at a glance; progress fills it.
const BARS = [5, 9, 14, 8, 12, 18, 10, 6, 13, 17, 9, 12, 7, 15, 11, 6, 10, 16, 8, 12, 5, 9, 14, 7];

function Wave({ progress }: { progress: number }) {
  const t = useTheme();
  return (
    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3, height: 24, overflow: 'hidden' }}>
      {BARS.map((h, i) => (
        <View key={i} style={{ width: 3, height: h, borderRadius: 2, backgroundColor: i / BARS.length < progress ? t.primary : t.border }} />
      ))}
    </View>
  );
}

function PlayButton({ playing, onPress }: { playing: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={playing ? 'Pause' : 'Play'}
      style={({ pressed }) => [{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.primaryBg, alignItems: 'center', justifyContent: 'center' }, pressed && styles.pressed]}>
      <Ionicons name={playing ? 'pause' : 'play'} size={18} color={t.onPrimary} style={playing ? undefined : { marginLeft: 2 }} />
    </Pressable>
  );
}

function Player({ url, fallbackDuration, autoPlay }: { url: string; fallbackDuration: number | null; autoPlay: boolean }) {
  const player = useAudioPlayer(url, { updateInterval: 500 });
  const status = useAudioPlayerStatus(player);

  useEffect(() => {
    if (autoPlay) player.play();
  }, [autoPlay, player]);
  const total = status.duration > 0 ? status.duration : (fallbackDuration ?? 0);

  const toggle = () => {
    if (status.playing) return player.pause();
    // After the clip ends the position stays at the end; rewind before replaying.
    if (total > 0 && status.currentTime >= total - 0.3) player.seekTo(0);
    player.play();
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <PlayButton playing={status.playing} onPress={toggle} />
      <Wave progress={total > 0 ? Math.min(1, status.currentTime / total) : 0} />
      <Txt variant="caption" sub>{status.currentTime > 0 ? `${fmtDuration(status.currentTime)} / ` : ''}{fmtDuration(total)}</Txt>
    </View>
  );
}

/**
 * Plays a voice/audio file from the private bucket via a short-lived signed URL.
 * With `lazy`, nothing is loaded until the user taps play (used in long lists).
 */
export function AudioPlayer({ storagePath, duration, lazy }: { storagePath: string; duration: number | null; lazy?: boolean }) {
  const t = useTheme();
  const [active, setActive] = useState(!lazy);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!active) return;
    let alive = true;
    signedUrl(storagePath).then((u) => {
      if (!alive) return;
      if (u) setUrl(u);
      else setFailed(true);
    });
    return () => {
      alive = false;
    };
  }, [storagePath, active]);

  if (!active) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <PlayButton playing={false} onPress={() => setActive(true)} />
        <Wave progress={0} />
        <Txt variant="caption" sub>{duration ? fmtDuration(duration) : 'Voice'}</Txt>
      </View>
    );
  }
  if (failed) return <Txt variant="label" color={t.danger}>Audio could not be loaded</Txt>;
  if (!url) return <ActivityIndicator color={t.primary} style={{ alignSelf: 'flex-start' }} />;
  return <Player url={url} fallbackDuration={duration} autoPlay={!!lazy} />;
}
