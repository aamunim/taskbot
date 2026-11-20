import { Ionicons } from '@expo/vector-icons';
import { confirmAction } from '@/lib/dialog';
import { pickDateTime } from '@/lib/pick';
import Constants from 'expo-constants';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Avatar, Btn, Card, Chip, ErrorBanner, SectionHeader, Sheet, Skeleton, Toggle, TopBar, Txt, styles } from '@/components/ui';
import * as api from '@/lib/api';
import { useData } from '@/lib/data';
import { DEMO } from '@/lib/demo';
import { fmtDateTime, plural } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { tap } from '@/lib/haptics';
import { usePref } from '@/lib/prefs';
import { ACCENTS, APPEARANCES, PREF_ACCENT, PREF_APPEARANCE, PREF_TEXT_SIZE, TEXT_SIZES, radius, space, useTheme, type Accent, type Appearance, type TextSize } from '@/lib/theme';
import { checkForUpdate, restartToUpdate, runningVersion, showUpdatePrompt, useUpdateState } from '@/lib/updates';
import type { Sender } from '@/lib/types';

const REMIND: { minutes: number; label: string }[] = [
  { minutes: 30, label: '30 min' },
  { minutes: 60, label: '1 hour' },
  { minutes: 120, label: '2 hours' },
  { minutes: 360, label: '6 hours' },
  { minutes: 1440, label: '1 day' },
];

// morning_time is a plain wall-clock "HH:MM:SS" in the configured zone, no conversion needed.
function timeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

export default function SettingsScreen() {
  const t = useTheme();
  const { config: cfg, error, refresh, saveConfig } = useData();
  const [senders, setSenders] = useState<Sender[]>([]);
  const [picking, setPicking] = useState(false);
  const { signOut } = useAuth();
  const [accent, setAccent] = usePref<Accent>(PREF_ACCENT, 'indigo');
  const [appearance, setAppearance] = usePref<Appearance>(PREF_APPEARANCE, 'system');
  const [textSize, setTextSize] = usePref<TextSize>(PREF_TEXT_SIZE, 'default');
  const update = useUpdateState();
  const running = runningVersion();

  useFocusEffect(
    useCallback(() => {
      refresh();
      api.listSenders().then(setSenders);
    }, [refresh]),
  );

  const pickMorning = () => {
    if (!cfg) return;
    const [h, m] = cfg.morning_time.split(':').map(Number);
    const value = new Date();
    value.setHours(h, m, 0, 0);
    pickDateTime({
      value,
      mode: 'time',
      onChange: (d) =>
        saveConfig({ morning_time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00` }),
    });
  };

  const logout = () => {
    confirmAction('Sign out', 'Do you want to sign out?', 'Sign out', signOut);
  };

  if (!cfg) {
    return (
      <View style={{ flex: 1 }}>
        <TopBar title="Settings" />
        <View style={{ padding: space.lg }}>
          <ErrorBanner text={error} />
          <Skeleton rows={3} height={120} />
        </View>
      </View>
    );
  }

  // An error older than the last successful run is no longer the current state.
  const errorIsCurrent = !!cfg.last_error && (!cfg.last_processed_at || !cfg.last_error_at || cfg.last_error_at > cfg.last_processed_at);
  const me = senders.find((s) => s.tg_id === cfg.owner_tg_id);
  const others = senders.filter((s) => s.tg_id !== cfg.owner_tg_id);
  const chooseBoss = async (s: Sender | null) => {
    setPicking(false);
    await saveConfig({ boss_tg_id: s?.tg_id ?? null, boss_name: s?.name ?? null });
  };

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Settings" />
      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: 48 }]}>
        <ErrorBanner text={error} />
        {DEMO ? (
          <Card flat style={{ backgroundColor: t.primarySoft, borderColor: 'transparent', flexDirection: 'row', gap: space.sm }}>
            <Ionicons name="flask" size={18} color={t.primary} />
            <Txt variant="label" color={t.primary} style={{ flex: 1 }}>Demo build with sample data. Nothing here is saved.</Txt>
          </Card>
        ) : null}

        <SectionHeader title="People" />
        <Card style={{ gap: space.lg }}>
          <Pressable onPress={() => setPicking(true)} accessibilityRole="button" style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: space.md }, pressed && styles.pressed]}>
            <Avatar role="boss" name={cfg.boss_name ?? 'B'} size={44} />
            <View style={{ flex: 1 }}>
              <Txt variant="label" color={t.boss} strong>Boss</Txt>
              {cfg.boss_tg_id ? <Txt content strong numberOfLines={1}>{cfg.boss_name ?? 'Unnamed'}</Txt> : <Txt variant="body" strong>Not chosen yet</Txt>}
              {!cfg.boss_tg_id ? <Txt variant="caption" sub>Until then, everyone except you counts as the boss.</Txt> : null}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <Txt variant="label" color={t.primary} strong>Change</Txt>
              <Ionicons name="chevron-forward" size={16} color={t.primary} />
            </View>
          </Pressable>
          <View style={{ height: 1, backgroundColor: t.border }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <Avatar role="me" name={me?.name ?? 'M'} size={44} />
            <View style={{ flex: 1 }}>
              <Txt variant="label" color={t.me} strong>Me</Txt>
              {me?.name ? <Txt content strong numberOfLines={1}>{me.name}</Txt> : <Txt variant="body" strong>You</Txt>}
              <Txt variant="caption" sub>The Telegram account you signed in with.</Txt>
            </View>
          </View>
        </Card>

        <SectionHeader title="Appearance" />
        <Card style={{ gap: space.lg }}>
          <View style={{ gap: space.sm }}>
            <Txt variant="body" strong>Colour</Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {ACCENTS.map((a) => <Chip key={a.value} label={a.label} dot={a.swatch} active={accent === a.value} onPress={() => { tap(); setAccent(a.value); }} />)}
            </View>
          </View>
          <View style={{ gap: space.sm }}>
            <Txt variant="body" strong>Mode</Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {APPEARANCES.map((a) => <Chip key={a.value} label={a.label} active={appearance === a.value} onPress={() => { tap(); setAppearance(a.value); }} />)}
            </View>
            <Txt variant="caption" sub>Black is a dark mode with true black backgrounds, for OLED screens.</Txt>
          </View>
          <View style={{ gap: space.sm }}>
            <Txt variant="body" strong>Text size</Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {TEXT_SIZES.map((a) => <Chip key={a.value} label={a.label} active={textSize === a.value} onPress={() => { tap(); setTextSize(a.value); }} />)}
            </View>
            <Txt variant="caption" sub>Boss and Me keep their amber and teal in every colour.</Txt>
          </View>
        </Card>

        <SectionHeader title="Reminders" />
        <Card style={{ gap: space.lg }}>
          <Txt variant="caption" sub>Reminders arrive as private Telegram messages from the bot.</Txt>
          <Row label="Morning summary" hint="Today's tasks, once a day">
            <Toggle label="Morning summary" value={cfg.digest_enabled} onChange={(v) => void saveConfig({ digest_enabled: v })} />
          </Row>
          {cfg.digest_enabled ? (
            <Row label="Summary time">
              <Btn small kind="soft" icon="time-outline" label={timeLabel(cfg.morning_time)} onPress={pickMorning} />
            </Row>
          ) : null}
          <Row label="New items" hint="A message as soon as something new is picked up">
            <Toggle label="New items" value={cfg.notify_new_items} onChange={(v) => void saveConfig({ notify_new_items: v })} />
          </Row>
          <View style={{ gap: space.sm }}>
            <Txt variant="body" strong>Warn me before a deadline</Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {REMIND.map((r) => <Chip key={r.minutes} label={r.label} active={cfg.remind_before_minutes === r.minutes} onPress={() => saveConfig({ remind_before_minutes: r.minutes })} />)}
            </View>
          </View>
          <Txt variant="caption" sub>Time zone: {cfg.timezone}</Txt>
        </Card>

        <SectionHeader title="Bot status" />
        <Card style={{ gap: space.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: errorIsCurrent ? t.dangerSolid : t.success }} />
            <Txt variant="body" strong color={errorIsCurrent ? t.danger : t.success}>{errorIsCurrent ? 'Something needs attention' : 'Running normally'}</Txt>
          </View>
          <Fact label="Last message received" value={cfg.last_webhook_at ? fmtDateTime(cfg.last_webhook_at) : 'None yet'} />
          <Fact label="Last analysis" value={cfg.last_processed_at ? fmtDateTime(cfg.last_processed_at) : 'None yet'} />
          {cfg.last_error ? (
            <View style={{ backgroundColor: errorIsCurrent ? t.dangerSoft : t.surfaceAlt, borderRadius: radius.md, padding: space.md, gap: 2 }}>
              <Txt variant="caption" color={errorIsCurrent ? t.danger : t.sub} strong>
                {errorIsCurrent ? 'Error' : 'Earlier error (it has run fine since)'}{cfg.last_error_at ? ` · ${fmtDateTime(cfg.last_error_at)}` : ''}
              </Txt>
              <Txt variant="caption" sub selectable>{cfg.last_error}</Txt>
            </View>
          ) : null}
        </Card>

        <SectionHeader title="App" />
        <Card style={{ gap: space.md }}>
          <Fact label="Version" value={`${Constants.expoConfig?.version ?? '–'} · ${running.update}`} />
          {running.channel ? <Fact label="Update channel" value={running.channel} /> : null}
          <View style={{ height: 1, backgroundColor: t.border }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <View style={{ flex: 1 }}>
              <Txt variant="body" strong>
                {update.phase === 'checking' ? 'Checking for updates…'
                  : update.phase === 'downloading' ? `Downloading update${update.progress != null ? ` · ${Math.round(update.progress * 100)}%` : '…'}`
                  : update.phase === 'ready' ? 'Update ready'
                  : update.phase === 'current' ? 'You have the latest version'
                  : update.phase === 'error' ? 'Could not check for updates'
                  : 'App updates'}
              </Txt>
              <Txt variant="caption" color={update.phase === 'error' ? t.danger : t.sub}>
                {update.phase === 'ready' ? 'Restart the app to start using it.'
                  : update.phase === 'error' ? (update.error ?? 'Please try again later.')
                  : 'Updates download on their own when you open the app.'}
              </Txt>
            </View>
            {update.phase === 'ready' ? (
              <Btn small icon="refresh" label="Restart" onPress={() => (DEMO ? showUpdatePrompt() : restartToUpdate())} />
            ) : (
              <Btn small kind="soft" label="Check" disabled={update.phase === 'checking' || update.phase === 'downloading'} onPress={() => checkForUpdate(true)} />
            )}
          </View>
        </Card>

        <Btn kind="danger" icon="log-out-outline" label="Sign out" onPress={logout} style={{ marginTop: space.xxl }} />
      </ScrollView>

      <Sheet visible={picking} onClose={() => setPicking(false)} title="Who is your boss?">
        <Txt variant="label" sub>Pick the person whose messages count as coming from your boss. Telegram does not share phone numbers with bots, so choose by name.</Txt>
        <View style={{ gap: space.sm, marginTop: space.lg }}>
          {others.map((s) => (
            <Choice key={s.tg_id} selected={cfg.boss_tg_id === s.tg_id} onPress={() => chooseBoss(s)} title={s.name ?? `User ${s.tg_id}`} subtitle={`${plural(s.message_count, 'message')} · last ${fmtDateTime(s.last_seen)}`} avatar={<Avatar role={cfg.boss_tg_id === s.tg_id ? 'boss' : 'other'} name={s.name} size={40} />} contentTitle />
          ))}
          {!others.length ? <Txt variant="label" sub>Nobody else has written in the group yet.</Txt> : null}
          <Txt variant="caption" sub>Only people whose messages the bot has seen appear here. If your boss is missing, ask them to send any message in the group, or forward one of their messages into it, then open this list again.</Txt>
          <Choice selected={cfg.boss_tg_id == null} onPress={() => chooseBoss(null)} title="Everyone except me" subtitle="Treat all other senders as the boss" avatar={<View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="people" size={20} color={t.sub} /></View>} />
        </View>
      </Sheet>
    </View>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
      <View style={{ flex: 1 }}>
        <Txt variant="body" strong>{label}</Txt>
        {hint ? <Txt variant="caption" sub>{hint}</Txt> : null}
      </View>
      {children}
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: space.md }}>
      <Txt variant="label" sub style={{ flex: 1 }}>{label}</Txt>
      <Txt variant="label">{value}</Txt>
    </View>
  );
}

function Choice({ selected, onPress, title, subtitle, avatar, contentTitle }: { selected: boolean; onPress: () => void; title: string; subtitle: string; avatar: ReactNode; contentTitle?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.lg, borderWidth: 1.5, borderColor: selected ? t.primary : t.border, backgroundColor: selected ? t.primarySoft : t.surface }, pressed && styles.pressed]}>
      {avatar}
      <View style={{ flex: 1 }}>
        <Txt variant="body" content={contentTitle} strong numberOfLines={1}>{title}</Txt>
        <Txt variant="caption" sub>{subtitle}</Txt>
      </View>
      <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={22} color={selected ? t.primary : t.faint} />
    </Pressable>
  );
}
