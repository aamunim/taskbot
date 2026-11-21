import { Ionicons } from '@expo/vector-icons';
import { confirmAction } from '@/lib/dialog';
import { pickDateTime } from '@/lib/pick';
import Constants from 'expo-constants';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { Avatar, Btn, Card, Chip, ErrorBanner, SectionHeader, Sheet, Skeleton, Toggle, TopBar, Txt, styles } from '@/components/ui';
import * as api from '@/lib/api';
import { Page } from '@/components/desktop';
import { useData } from '@/lib/data';
import { useLayout, webBaseUrl } from '@/lib/layout';
import { openShare } from '@/components/ShareSheet';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { DEMO } from '@/lib/demo';
import { fmtDateTime, plural } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { tap } from '@/lib/haptics';
import { usePref } from '@/lib/prefs';
import { ACCENTS, APPEARANCES, DENSITIES, PREF_ACCENT, PREF_APPEARANCE, PREF_DENSITY, PREF_TEXT_SIZE, TEXT_SIZES, content, noOutline, radius, space, useTheme, type Accent, type Appearance, type Density, type TextSize } from '@/lib/theme';
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
  const { desktop } = useLayout();
  const [accent, setAccent] = usePref<Accent>(PREF_ACCENT, 'indigo');
  const [appearance, setAppearance] = usePref<Appearance>(PREF_APPEARANCE, 'system');
  const [textSize, setTextSize] = usePref<TextSize>(PREF_TEXT_SIZE, 'default');
  const [density, setDensity] = usePref<Density>(PREF_DENSITY, 'comfortable');
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

  const people = (
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
  );
  const appearanceCard = (
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
          <View style={{ gap: space.sm }}>
            <Txt variant="body" strong>Task lists</Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {DENSITIES.map((a) => <Chip key={a.value} label={a.label} icon={a.value === 'compact' ? 'reorder-four-outline' : 'albums-outline'} active={density === a.value} onPress={() => { tap(); setDensity(a.value); }} />)}
            </View>
            <Txt variant="caption" sub>{density === 'compact' ? 'One line per task, so more fit on the screen.' : 'A card per task, with its details and deadline.'}</Txt>
          </View>
        </Card>
  );
  const tellBoss = (
        <Card style={{ gap: space.lg }}>
          <Txt variant="caption" sub>When you finish a task your boss gave you, the bot can reply to their original message in the group. You get a few seconds to undo it first.</Txt>
          <Row label="When I mark it done" hint="Only for tasks from your boss">
            <Toggle label="Tell boss when done" value={cfg.notify_boss_done} onChange={(v) => void saveConfig({ notify_boss_done: v })} />
          </Row>
          {cfg.notify_boss_done ? <MessageField label="Done message" value={cfg.boss_done_message} fallback="✅ Done: {task}" onSave={(v) => void saveConfig({ boss_done_message: v })} /> : null}
          <Row label="When I mark it sent" hint="Status “Waiting on boss”">
            <Toggle label="Tell boss when sent" value={cfg.notify_boss_waiting} onChange={(v) => void saveConfig({ notify_boss_waiting: v })} />
          </Row>
          {cfg.notify_boss_waiting ? <MessageField label="Sent message" value={cfg.boss_waiting_message} fallback="📨 Sent for your review: {task}" onSave={(v) => void saveConfig({ boss_waiting_message: v })} /> : null}
        </Card>
  );
  const [share, setShare] = useState<api.ShareLink | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  useFocusEffect(
    useCallback(() => {
      api.fetchShareLink().then(setShare);
    }, []),
  );
  const base = webBaseUrl();
  const shareUrl = share && base ? `${base}/shared/${share.token}` : null;
  const makeShare = async (days: number | null) => {
    setShareBusy(true);
    setShare(await api.createShareLink(days));
    setShareBusy(false);
    setShareCopied(false);
  };
  const bossPage = (
        <Card style={{ gap: space.lg }}>
          <Txt variant="caption" sub>A private web page where your boss can browse and download every file and link in the library, yours and everyone else's included. Tasks, notes and your private notes are never shown, and nothing can be changed. Anyone who has the link can open it, so share it only with your boss.</Txt>
          {share ? (
            <>
              <View style={{ gap: 4 }}>
                <Txt variant="body" strong>Link is active</Txt>
                <Txt variant="caption" sub>
                  {share.expires_at ? `Expires ${fmtDateTime(share.expires_at)}` : 'Does not expire'} · {share.open_count ? `opened ${plural(share.open_count, 'time')}, last ${fmtDateTime(share.last_opened_at ?? share.created_at)}` : 'not opened yet'}
                </Txt>
                {shareUrl ? <Txt variant="caption" sub numberOfLines={1} selectable>{shareUrl}</Txt> : <Txt variant="caption" color={t.danger}>The web address is not set in this build, so the link cannot be shown here. Open Settings in the web version to copy it.</Txt>}
              </View>
              {shareUrl ? (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                  <Btn small kind="soft" icon={shareCopied ? 'checkmark' : 'copy-outline'} label={shareCopied ? 'Copied' : 'Copy link'} onPress={async () => { await Clipboard.setStringAsync(shareUrl); setShareCopied(true); }} />
                  <Btn small kind="soft" icon="share-social-outline" label="Send to boss" onPress={() => openShare({ kind: 'link', title: 'Your files page', url: shareUrl })} />
                  <Btn small kind="soft" icon="open-outline" label="Preview" onPress={() => void Linking.openURL(shareUrl)} />
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                <Btn small kind="ghost" icon="refresh-outline" label="Replace with a new link" disabled={shareBusy} onPress={() => confirmAction('Replace link', 'The current link will stop working at once. Create a new one?', 'Replace', () => void makeShare(null))} />
                <Btn small kind="danger" icon="close-circle-outline" label="Turn off" disabled={shareBusy} onPress={() => confirmAction('Turn off the page', 'Your boss will no longer be able to open the page. Turn it off?', 'Turn off', async () => { await api.revokeShareLinks(); setShare(null); })} />
              </View>
            </>
          ) : (
            <View style={{ gap: space.sm }}>
              <Txt variant="body" strong>Create a link that</Txt>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                <Btn small icon="link-outline" label="Never expires" disabled={shareBusy} onPress={() => void makeShare(null)} />
                <Btn small kind="soft" label="Lasts 30 days" disabled={shareBusy} onPress={() => void makeShare(30)} />
                <Btn small kind="soft" label="Lasts 7 days" disabled={shareBusy} onPress={() => void makeShare(7)} />
              </View>
            </View>
          )}
        </Card>
  );
  const [usage, setUsage] = useState<api.UsagePeriod[]>([]);
  useFocusEffect(
    useCallback(() => {
      api.fetchAiUsage().then(setUsage);
    }, []),
  );
  const USAGE_LABEL = { today: 'Today', last_7_days: 'Last 7 days', this_month: 'This month' } as const;
  const aiUsage = (
        <Card style={{ gap: space.lg }}>
          <Txt variant="caption" sub>What the bot's AI calls cost, counted by the bot itself from the day this was added. Voice transcription is billed separately by ElevenLabs.</Txt>
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            {(['today', 'last_7_days', 'this_month'] as const).map((key) => {
              const u = usage.find((x) => x.period === key);
              return (
                <View key={key} style={{ flex: 1, padding: space.md, borderRadius: radius.md, backgroundColor: t.surfaceAlt, gap: 2 }}>
                  <Txt variant="caption" sub>{USAGE_LABEL[key]}</Txt>
                  <Txt variant="heading">{u ? `$${u.cost_usd.toFixed(2)}` : '…'}</Txt>
                  <Txt variant="caption" sub>{u ? plural(u.calls, 'call') : ' '}</Txt>
                </View>
              );
            })}
          </View>
          <Row label="Economy mode" hint="A small, cheap model first checks whether new messages are only small talk, and the main model is called only when they are not. Saves most in a chatty group. It is told to pass anything doubtful along, but a wrongly skipped message would not become a task.">
            <Toggle label="Economy mode" value={cfg.economy_mode} onChange={(v) => void saveConfig({ economy_mode: v })} />
          </Row>
        </Card>
  );
  const pickReportTime = () => {
    if (!cfg) return;
    const [h, m] = cfg.weekly_report_time.split(':').map(Number);
    const value = new Date();
    value.setHours(h, m, 0, 0);
    pickDateTime({
      value,
      mode: 'time',
      onChange: (d) => saveConfig({ weekly_report_time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00` }),
    });
  };
  const automation = (
        <Card style={{ gap: space.lg }}>
          <Txt variant="caption" sub>The bot prepares these messages for the group and asks you first, in your private Telegram chat with it. Nothing is posted until you tap “Send to group”, except follow-ups when you choose Automatic.</Txt>
          <Row label="Ask about unclear instructions" hint="Suggests a question for your boss when a task cannot be started as written">
            <Toggle label="Ask about unclear instructions" value={cfg.clarify_enabled} onChange={(v) => void saveConfig({ clarify_enabled: v })} />
          </Row>
          <Row label="Read photos sent without a message" hint="Off: a bare photo or screenshot is only saved to the library. On: the AI also looks for tasks in it.">
            <Toggle label="Read photos sent without a message" value={cfg.read_silent_photos} onChange={(v) => void saveConfig({ read_silent_photos: v })} />
          </Row>
          <View style={{ gap: space.sm }}>
            <Txt variant="body" strong>Follow up when your boss has not replied</Txt>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {FOLLOWUP_MODES.map((m) => <Chip key={m.value} label={m.label} active={cfg.followup_mode === m.value} onPress={() => saveConfig({ followup_mode: m.value })} />)}
            </View>
            <Txt variant="caption" sub>{FOLLOWUP_MODES.find((m) => m.value === cfg.followup_mode)?.hint}</Txt>
          </View>
          {cfg.followup_mode !== 'off' ? (
            <>
              <View style={{ gap: space.sm }}>
                <Txt variant="body" strong>After waiting</Txt>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                  {FOLLOWUP_DAYS.map((d) => <Chip key={d} label={plural(d, 'day')} active={cfg.followup_days === d} onPress={() => saveConfig({ followup_days: d })} />)}
                </View>
              </View>
              <MessageField label="Follow-up message" value={cfg.followup_message} fallback="⏳ A gentle reminder about this: {task}" onSave={(v) => void saveConfig({ followup_message: v })} />
            </>
          ) : null}
          <Row label="Weekly report for your boss" hint="Done, in progress and waiting, for the last 7 days">
            <Toggle label="Weekly report" value={cfg.weekly_report_enabled} onChange={(v) => void saveConfig({ weekly_report_enabled: v })} />
          </Row>
          {cfg.weekly_report_enabled ? (
            <View style={{ gap: space.sm }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
                {WEEKDAYS.map((d, i) => <Chip key={d} label={d} active={cfg.weekly_report_day === i} onPress={() => saveConfig({ weekly_report_day: i })} />)}
              </View>
              <Row label="Report time">
                <Btn small kind="soft" icon="time-outline" label={timeLabel(cfg.weekly_report_time)} onPress={pickReportTime} />
              </Row>
            </View>
          ) : null}
        </Card>
  );
  const reminders = (
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
  );
  const botStatus = (
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
  );
  const appInfo = (
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
              <Btn small icon="refresh-outline" label="Restart" onPress={() => (DEMO ? showUpdatePrompt() : restartToUpdate())} />
            ) : (
              <Btn small kind="soft" label="Check" disabled={update.phase === 'checking' || update.phase === 'downloading'} onPress={() => checkForUpdate(true)} />
            )}
          </View>
        </Card>
  );

  const bossPicker = (
      <Sheet visible={picking} onClose={() => setPicking(false)} title="Who is your boss?">
        <Txt variant="label" sub>Pick the person whose messages count as coming from your boss. Telegram does not share phone numbers with bots, so choose by name.</Txt>
        <View style={{ gap: space.sm, marginTop: space.lg }}>
          {others.map((s) => (
            <Choice key={s.tg_id} selected={cfg.boss_tg_id === s.tg_id} onPress={() => chooseBoss(s)} title={s.name ?? `User ${s.tg_id}`} subtitle={`${plural(s.message_count, 'message')} · last ${fmtDateTime(s.last_seen)}`} avatar={<Avatar role={cfg.boss_tg_id === s.tg_id ? 'boss' : 'other'} name={s.name} size={40} />} contentTitle />
          ))}
          {!others.length ? <Txt variant="label" sub>Nobody else has written in the group yet.</Txt> : null}
          <Txt variant="caption" sub>Only people whose messages the bot has seen appear here. If your boss is missing, ask them to send any message in the group, or forward one of their messages into it, then open this list again.</Txt>
          <Choice selected={cfg.boss_tg_id == null} onPress={() => chooseBoss(null)} title="Everyone except me" subtitle="Treat all other senders as the boss" avatar={<View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="people-outline" size={20} color={t.sub} /></View>} />
        </View>
      </Sheet>
  );

  if (desktop) {
    const col = { flex: 1, minWidth: 0, maxWidth: 620 } as const;
    return (
      <View style={{ flex: 1 }}>
        <TopBar title="Settings" noBack />
        <Page>
          <ErrorBanner text={error} />
          {DEMO ? (
            <Card flat style={{ backgroundColor: t.primarySoft, borderColor: 'transparent', flexDirection: 'row', gap: space.sm, maxWidth: 1260 }}>
              <Ionicons name="flask-outline" size={18} color={t.primary} />
              <Txt variant="label" color={t.primary} style={{ flex: 1 }}>Demo build with sample data. Nothing here is saved.</Txt>
            </Card>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.xxl }}>
            <View style={col}>
              <SectionHeader title="People" />
              {people}
              <SectionHeader title="Tell your boss" />
              {tellBoss}
              <SectionHeader title="Automation" />
              {automation}
              <SectionHeader title="Page for your boss" />
              {bossPage}
              <SectionHeader title="AI usage" />
              {aiUsage}
              <SectionHeader title="Reminders" />
              {reminders}
            </View>
            <View style={col}>
              <SectionHeader title="Appearance" />
              {appearanceCard}
              <SectionHeader title="Bot status" />
              {botStatus}
              <SectionHeader title="App" />
              {appInfo}
              <Btn kind="danger" icon="log-out-outline" label="Sign out" onPress={logout} style={{ marginTop: space.xxl, alignSelf: 'flex-start', minWidth: 200 }} />
            </View>
          </View>
        </Page>
        {bossPicker}
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Settings" />
      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: 48 }]}>
        <ErrorBanner text={error} />
        {DEMO ? (
          <Card flat style={{ backgroundColor: t.primarySoft, borderColor: 'transparent', flexDirection: 'row', gap: space.sm }}>
            <Ionicons name="flask-outline" size={18} color={t.primary} />
            <Txt variant="label" color={t.primary} style={{ flex: 1 }}>Demo build with sample data. Nothing here is saved.</Txt>
          </Card>
        ) : null}

        <SectionHeader title="People" />
        {people}
        <SectionHeader title="Tell your boss" />
        {tellBoss}
        <SectionHeader title="Automation" />
        {automation}
        <SectionHeader title="Page for your boss" />
        {bossPage}
        <SectionHeader title="AI usage" />
        {aiUsage}
        <SectionHeader title="Appearance" />
        {appearanceCard}
        <SectionHeader title="Reminders" />
        {reminders}
        <SectionHeader title="Bot status" />
        {botStatus}
        <SectionHeader title="App" />
        {appInfo}

        <Btn kind="danger" icon="log-out-outline" label="Sign out" onPress={logout} style={{ marginTop: space.xxl }} />
      </ScrollView>

      {bossPicker}
    </View>
  );
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const FOLLOWUP_DAYS = [1, 2, 3, 5, 7];
const FOLLOWUP_MODES: { value: 'off' | 'ask' | 'auto'; label: string; hint: string }[] = [
  { value: 'off', label: 'Off', hint: 'The bot only reminds you privately; you follow up yourself.' },
  { value: 'ask', label: 'Ask me first', hint: 'The bot shows you the reminder and posts it only if you approve.' },
  { value: 'auto', label: 'Automatic', hint: 'The bot posts the reminder in the group by itself and tells you afterwards.' },
];

/** Editable message text; `{task}` is replaced by the task's title. Saved when the field loses focus. */
function MessageField({ label, value, fallback, onSave }: { label: string; value: string; fallback: string; onSave: (v: string) => void }) {
  const t = useTheme();
  const [text, setText] = useState(value);
  const commit = () => {
    const next = text.trim() || fallback;
    setText(next);
    if (next !== value) onSave(next);
  };
  return (
    <View style={{ gap: 6 }}>
      <TextInput
        value={text}
        onChangeText={setText}
        onBlur={commit}
        onSubmitEditing={commit}
        accessibilityLabel={label}
        placeholder={fallback}
        placeholderTextColor={t.faint}
        maxLength={300}
        style={[{ color: t.text, fontFamily: content.regular, fontSize: 16, paddingVertical: 10, paddingHorizontal: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: t.border, backgroundColor: t.surfaceAlt }, noOutline]}
      />
      <Txt variant="caption" sub>Your boss will see: <Txt variant="caption" content>{(text.trim() || fallback).replace('{task}', 'Monthly sales report')}</Txt></Txt>
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
