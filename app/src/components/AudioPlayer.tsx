import { Ionicons } from '@expo/vector-icons';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { signedUrl } from '@/lib/api';
import { DEMO } from '@/lib/demo';
import { fmtDuration } from '@/lib/format';
import { tap } from '@/lib/haptics';
import { radius, space, ui, useTheme } from '@/lib/theme';
import type { TranscriptWord } from '@/lib/types';
import { Txt, styles } from './ui';

const BAR_COUNT = 34;
const RATES = [1, 1.5, 2] as const;

/**
 * Bar heights (0..1) for the waveform-style scrubber. With word timings, each
 * bar shows how much of its slice of time is covered by speech, so pauses read
 * as dips. This is speech density, not loudness: the bot never sees the audio's
 * amplitude. Without timings the bars are a neutral, even pattern.
 */
export function speechBars(words: TranscriptWord[] | null | undefined, duration: number, count = BAR_COUNT): number[] {
  if (!words?.length || !(duration > 0)) return Array.from({ length: count }, (_, i) => 0.42 + 0.1 * Math.sin(i * 0.9));
  const slice = duration / count;
  const raw = Array.from({ length: count }, (_, i) => {
    const from = i * slice;
    const to = from + slice;
    let covered = 0;
    for (const w of words) covered += Math.max(0, Math.min(w.e, to) - Math.max(w.s, from));
    return Math.min(1, covered / slice);
  });
  // Light smoothing so single-slice gaps do not look like dropouts.
  return raw.map((v, i) => 0.18 + 0.82 * (0.6 * v + 0.2 * (raw[i - 1] ?? v) + 0.2 * (raw[i + 1] ?? v)));
}

function Wave({ bars, progress, onSeek }: { bars: number[]; progress: number; onSeek: (fraction: number) => void }) {
  const t = useTheme();
  const width = useRef(0);
  return (
    <Pressable
      onLayout={(e) => (width.current = e.nativeEvent.layout.width)}
      onPress={(e) => width.current > 0 && onSeek(Math.max(0, Math.min(1, e.nativeEvent.locationX / width.current)))}
      accessibilityRole="adjustable"
      accessibilityLabel="Playback position"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(progress * 100) }}
      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 30 }}>
      {bars.map((h, i) => (
        <View key={i} style={{ width: 3, height: Math.max(4, Math.round(h * 28)), borderRadius: 2, backgroundColor: (i + 0.5) / bars.length <= progress ? t.primary : t.border }} />
      ))}
    </Pressable>
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

type ViewProps = {
  playing: boolean;
  time: number;
  total: number;
  rate: number;
  words?: TranscriptWord[] | null;
  transcript?: string | null;
  /** Clamp the transcript to a few lines while idle (lists). */
  clamp?: boolean;
  onToggle: () => void;
  onSeek: (seconds: number) => void;
  onRate: () => void;
};

function PlayerView({ playing, time, total, rate, words, transcript, clamp, onToggle, onSeek, onRate }: ViewProps) {
  const t = useTheme();
  const bars = useMemo(() => speechBars(words, total), [words, total]);
  const started = time > 0 || playing;
  // The word being spoken: the last one that has started.
  let active = -1;
  if (words && started) for (let i = 0; i < words.length && words[i].s <= time; i++) active = i;

  return (
    <View style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <PlayButton playing={playing} onPress={onToggle} />
        <Wave bars={bars} progress={total > 0 ? Math.min(1, time / total) : 0} onSeek={(f) => onSeek(f * total)} />
        <Txt variant="caption" sub style={{ minWidth: 34, textAlign: 'right', fontFamily: ui.semibold }}>{fmtDuration(started ? time : total)}</Txt>
        <Pressable
          onPress={onRate}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Playback speed ${rate} times. Tap to change.`}
          style={({ pressed }) => [{ minWidth: 42, alignItems: 'center', paddingVertical: 5, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: rate === 1 ? t.surfaceAlt : t.primarySoft }, pressed && styles.pressed]}>
          <Txt variant="caption" color={rate === 1 ? t.sub : t.primary} strong>{rate}×</Txt>
        </Pressable>
      </View>

      {transcript ? (
        <View style={{ borderLeftWidth: 3, borderLeftColor: t.border, paddingLeft: space.md, gap: 2 }}>
          {words?.length ? (
            <Txt content numberOfLines={clamp && !started ? 3 : undefined}>
              {words.map((w, i) => (
                <Text
                  key={i}
                  onPress={() => onSeek(w.s)}
                  suppressHighlighting
                  style={i === active ? { color: t.primary, backgroundColor: t.primarySoft, fontFamily: 'HindSiliguri_600SemiBold' } : { color: started && i > active ? t.sub : t.text }}>
                  {w.w}{i < words.length - 1 ? ' ' : ''}
                </Text>
              ))}
            </Txt>
          ) : (
            <Txt content selectable numberOfLines={clamp && !started ? 3 : undefined}>{transcript}</Txt>
          )}
          <Txt variant="caption" color={t.faint}>{words?.length ? 'Transcribed from voice, may contain mistakes. Tap a word to jump there.' : 'Transcribed from voice, may contain mistakes.'}</Txt>
        </View>
      ) : null}
    </View>
  );
}

type Loaded = { url: string; fallbackDuration: number | null; startAt: number | null } & Pick<ViewProps, 'words' | 'transcript' | 'clamp'>;

function RealPlayer({ url, fallbackDuration, startAt, ...view }: Loaded) {
  // Word highlighting needs a finer clock than the plain progress bar does.
  const player = useAudioPlayer(url, { updateInterval: view.words?.length ? 120 : 400 });
  const status = useAudioPlayerStatus(player);
  const [rate, setRate] = useState<number>(1);
  const total = status.duration > 0 ? status.duration : (fallbackDuration ?? 0);

  useEffect(() => {
    if (startAt == null) return;
    if (startAt > 0) player.seekTo(startAt).catch(() => {});
    player.play();
  }, [startAt, player]);

  const toggle = () => {
    if (status.playing) return player.pause();
    // After the clip ends the position stays at the end; rewind before replaying.
    if (total > 0 && status.currentTime >= total - 0.3) player.seekTo(0).catch(() => {});
    player.play();
  };
  const seek = (seconds: number) => {
    player.seekTo(Math.max(0, Math.min(seconds, Math.max(0, total - 0.1)))).catch(() => {});
    if (!status.playing) player.play();
  };
  const nextRate = () => {
    const next = RATES[(RATES.indexOf(rate as (typeof RATES)[number]) + 1) % RATES.length];
    tap();
    setRate(next);
    player.setPlaybackRate(next);
  };
  return <PlayerView {...view} playing={status.playing} time={status.currentTime} total={total} rate={rate} onToggle={toggle} onSeek={seek} onRate={nextRate} />;
}

/** Demo builds have no audio file; a timer stands in for the player so the UI can be reviewed. */
function DemoPlayer({ fallbackDuration, startAt, ...view }: Loaded) {
  const total = fallbackDuration ?? 30;
  const [time, setTime] = useState(startAt ?? 0);
  const [playing, setPlaying] = useState(startAt != null);
  const [rate, setRate] = useState<number>(1);
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      setTime((v) => {
        const next = v + 0.12 * rate;
        if (next >= total) {
          setPlaying(false);
          return total;
        }
        return next;
      });
    }, 120);
    return () => clearInterval(id);
  }, [playing, rate, total]);
  return (
    <PlayerView
      {...view}
      playing={playing}
      time={time}
      total={total}
      rate={rate}
      onToggle={() => {
        if (!playing && time >= total) setTime(0);
        setPlaying(!playing);
      }}
      onSeek={(s) => {
        setTime(Math.max(0, Math.min(s, total)));
        setPlaying(true);
      }}
      onRate={() => setRate(RATES[(RATES.indexOf(rate as (typeof RATES)[number]) + 1) % RATES.length])}
    />
  );
}

const Player = DEMO ? DemoPlayer : RealPlayer;

/**
 * Plays a voice/audio file from the private bucket via a short-lived signed URL.
 * With `lazy`, nothing is loaded until the user taps play, the scrubber or a
 * word (used in long lists).
 */
export function AudioPlayer({ storagePath, duration, lazy, words, transcript, clamp }: {
  storagePath: string;
  duration: number | null;
  lazy?: boolean;
  words?: TranscriptWord[] | null;
  transcript?: string | null;
  clamp?: boolean;
}) {
  const t = useTheme();
  // null = not started by the user yet; a number = where to start playing from.
  const [startAt, setStartAt] = useState<number | null>(null);
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

  const begin = (at: number) => {
    setStartAt(at);
    setActive(true);
  };
  const view = { words, transcript, clamp };

  if (failed) return <Txt variant="label" color={t.danger}>Audio could not be loaded</Txt>;
  if (!active || !url) {
    return (
      <View>
        <PlayerView {...view} playing={false} time={0} total={duration ?? 0} rate={1} onToggle={() => begin(0)} onSeek={begin} onRate={() => {}} />
        {active ? <ActivityIndicator color={t.primary} style={{ position: 'absolute', left: 10, top: 10 }} /> : null}
      </View>
    );
  }
  return <Player {...view} url={url} fallbackDuration={duration} startAt={startAt} />;
}
