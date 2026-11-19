import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { fmtDuration } from '@/lib/format';
import { signedUrl } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import { Txt } from './ui';

function Player({ url, fallbackDuration, autoPlay }: { url: string; fallbackDuration: number | null; autoPlay: boolean }) {
  const t = useTheme();
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
      <Pressable onPress={toggle} hitSlop={8} accessibilityLabel={status.playing ? 'থামান' : 'চালান'}>
        <Ionicons name={status.playing ? 'pause-circle' : 'play-circle'} size={40} color={t.primary} />
      </Pressable>
      <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: t.chip }}>
        <View style={{ height: 4, borderRadius: 2, backgroundColor: t.primary, width: `${total > 0 ? Math.min(100, (status.currentTime / total) * 100) : 0}%` }} />
      </View>
      <Txt size={13} sub>{fmtDuration(status.currentTime)} / {fmtDuration(total)}</Txt>
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
        <Pressable onPress={() => setActive(true)} hitSlop={8} accessibilityLabel="চালান">
          <Ionicons name="play-circle" size={40} color={t.primary} />
        </Pressable>
        <Txt size={13} sub>{duration ? fmtDuration(duration) : 'ভয়েস মেসেজ'}</Txt>
      </View>
    );
  }
  if (failed) return <Txt size={13} color={t.danger}>অডিও লোড করা যায়নি</Txt>;
  if (!url) return <ActivityIndicator color={t.primary} style={{ alignSelf: 'flex-start' }} />;
  return <Player url={url} fallbackDuration={duration} autoPlay={!!lazy} />;
}
