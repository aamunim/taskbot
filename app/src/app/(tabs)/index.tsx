import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { setStatusBarStyle } from 'expo-status-bar';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NoteCard, StatusRing, TaskCard, openItem } from '@/components/items';
import { Appear, reduceMotionNow } from '@/components/motion';
import { WeekChart } from '@/components/WeekChart';
import { Avatar, Card, Empty, ErrorBanner, Header, IconBtn, RoleBadge, SectionHeader, Skeleton, Txt, styles, type IconName } from '@/components/ui';
import { Page, Panel, Quiet } from '@/components/desktop';
import { useData } from '@/lib/data';
import { useLayout } from '@/lib/layout';
import { PRIORITY_RANK, STATUS_LABEL, dayNumber, fmtLongDate, greeting, isOverdue, plural, todayNumber, waitingLabel } from '@/lib/format';
import { success } from '@/lib/haptics';
import { setPref } from '@/lib/prefs';
import { roleColors } from '@/lib/roles';
import { lastWeek, streak } from '@/lib/stats';
import { radius, space, ui, useTheme } from '@/lib/theme';
import type { Item, Role, Status } from '@/lib/types';

const byDue = (a: Item, b: Item) =>
  (a.due_at ?? '').localeCompare(b.due_at ?? '') || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
const GLASS = 'rgba(255,255,255,0.16)';

export default function Today() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { items, config, loading, error, refresh, updateItem, role } = useData();
  const [refreshing, setRefreshing] = useState(false);
  const { desktop, pageWidth } = useLayout();

  // The header is dark in both themes, so the status bar icons must be light while this tab is showing.
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle(t.dark ? 'light' : 'dark');
    }, [t.dark]),
  );

  const view = useMemo(() => {
    const today = todayNumber();
    const tasks = items.filter((i) => i.type === 'task');
    // "Open" is what is still the owner's to do; tasks waiting on the boss get their own block.
    const open = tasks.filter((i) => i.status === 'todo' || i.status === 'doing');
    const waiting = tasks.filter((i) => i.status === 'waiting').sort((a, b) => (a.waiting_since ?? '').localeCompare(b.waiting_since ?? ''));
    const overdue = open.filter(isOverdue).sort(byDue);
    const late = new Set(overdue.map((i) => i.id));
    const dated = open.filter((i) => i.due_at && !late.has(i.id));
    const dueToday = tasks.filter((i) => i.due_at && dayNumber(i.due_at) === today);
    const split = (r: Role) => ({
      tasks: open.filter((i) => role(i.source_sender_tg_id) === r).length,
      notes: items.filter((i) => i.type === 'note' && role(i.source_sender_tg_id) === r).length,
    });
    return {
      overdue,
      today: dated.filter((i) => dayNumber(i.due_at!) === today).sort(byDue),
      week: dated.filter((i) => dayNumber(i.due_at!) > today && dayNumber(i.due_at!) <= today + 7).sort(byDue),
      undated: open.filter((i) => !i.due_at).length,
      notes: items.filter((i) => i.type === 'note' && !i.needs_review).slice(0, 3),
      inbox: items.filter((i) => i.needs_review).length,
      dueTotal: dueToday.length,
      dueDone: dueToday.filter((i) => i.status === 'done' || i.status === 'waiting').length,
      waiting,
      streak: streak(items),
      stats: lastWeek(items),
      boss: split('boss'),
      me: split('me'),
    };
  }, [items, role]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };
  const setStatus = (item: Item) => (to: Status) => updateItem(item.id, { status: to }, `Status changed to ${STATUS_LABEL[to]}`);
  const openTasks = (filter: 'boss' | 'me') => {
    setPref('role:tasks', filter);
    router.push('/tasks');
  };

  const nothing = !view.overdue.length && !view.today.length && !view.week.length && !view.notes.length && !view.undated;
  const progress = view.dueTotal ? view.dueDone / view.dueTotal : 0;
  const allDone = view.dueTotal > 0 && view.dueDone === view.dueTotal && !view.overdue.length;


  const inboxBanner = view.inbox > 0 ? (
    <Card onPress={() => router.push('/inbox')} style={[{ flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: t.bossSoft, borderColor: 'transparent', marginBottom: desktop ? 0 : space.md }, desktop && { flex: 1 }]} flat>
                <Ionicons name="help-buoy" size={22} color={t.boss} />
                <View style={{ flex: 1 }}>
                  <Txt variant="body" strong color={t.boss}>{plural(view.inbox, 'item')} to review</Txt>
                  <Txt variant="caption" color={t.boss}>The AI was not sure about {view.inbox === 1 ? 'it' : 'these'}</Txt>
                </View>
                <Ionicons name="chevron-forward" size={18} color={t.boss} />
              </Card>
  ) : null;
  const waitingCard = (
                <Card style={{ padding: 0, overflow: 'hidden' }}>
                  {view.waiting.map((i, k) => (
                    <Pressable
                      key={i.id}
                      onPress={() => openItem(i.id)}
                      accessibilityRole="button"
                      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.lg, borderTopWidth: k ? 1 : 0, borderTopColor: t.border }, pressed && { backgroundColor: t.surfaceAlt }]}>
                      <StatusRing status="waiting" size={24} />
                      <View style={{ flex: 1, gap: 2 }}>
                        <Txt content strong numberOfLines={2}>{i.title}</Txt>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                          <RoleBadge role={role(i.source_sender_tg_id)} compact />
                          <Txt variant="caption" sub>Sent · {waitingLabel(i.waiting_since)}</Txt>
                        </View>
                      </View>
                      <Pressable
                        onPress={() => { success(); setStatus(i)('done'); }}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel="Boss replied, mark as done"
                        style={({ pressed }) => [{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: t.successSoft }, pressed && styles.pressed]}>
                        <Txt variant="caption" color={t.success} strong>Settled</Txt>
                      </Pressable>
                    </Pressable>
                  ))}
                </Card>
  );
  const weekCard = (
            <Card style={{ gap: space.lg }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: view.streak ? t.bossSoft : t.surfaceAlt, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="flame" size={24} color={view.streak ? t.bossSolid : t.faint} />
                </View>
                <View style={{ flex: 1 }}>
                  <Txt variant="heading">{view.streak ? `${view.streak}-day on-time streak` : 'No streak yet'}</Txt>
                  <Txt variant="caption" sub>Days in a row with everything due finished on time. Days with nothing due do not count.</Txt>
                </View>
              </View>
              <View style={{ height: 1, backgroundColor: t.border }} />
              <WeekChart days={view.stats} />
            </Card>
  );

  if (desktop) {
    // Dashboard across the window: a summary strip, then columns of panels.
    const tasks = (list: Item[]) => list.map((i) => <TaskCard key={i.id} item={i} onStatus={setStatus(i)} />);
    const first = (
      <>
        {view.overdue.length ? <Panel title="Overdue" count={view.overdue.length} color={t.danger}><List>{tasks(view.overdue)}</List></Panel> : null}
        <Panel title="Today" count={view.today.length || undefined}>
          {view.today.length ? <List>{tasks(view.today)}</List> : <Quiet>{view.dueTotal ? 'Everything due today is done.' : 'No deadlines today.'}</Quiet>}
        </Panel>
      </>
    );
    const second = (
      <>
        <Panel title="Next 7 days" count={view.week.length || undefined}>
          {view.week.length ? <List>{tasks(view.week)}</List> : <Quiet>Nothing else is due this week.</Quiet>}
          {view.undated > 0 ? (
            <Pressable onPress={() => router.push('/tasks')} accessibilityRole="link" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.md, paddingHorizontal: space.xs }}>
              <Txt variant="label" color={t.primary}>{plural(view.undated, 'more open task')} without a deadline</Txt>
              <Ionicons name="arrow-forward" size={14} color={t.primary} />
            </Pressable>
          ) : null}
        </Panel>
        {view.waiting.length ? <Panel title="Waiting on boss" count={view.waiting.length}>{waitingCard}</Panel> : null}
      </>
    );
    const third = (
      <>
        <View style={{ flexDirection: 'row', gap: space.md }}>
          <SplitCard role="boss" title="From boss" name={config?.boss_name ?? null} counts={view.boss} onPress={() => openTasks('boss')} />
          <SplitCard role="me" title="My own" name={null} counts={view.me} onPress={() => openTasks('me')} />
        </View>
        <Panel title="This week">{weekCard}</Panel>
        {view.notes.length ? <Panel title="Latest notes"><List>{view.notes.map((i) => <NoteCard key={i.id} item={i} compact />)}</List></Panel> : null}
      </>
    );
    const col = { flex: 1, minWidth: 0, gap: space.lg } as const;
    const three = pageWidth >= 1180;
    return (
      <View style={{ flex: 1 }}>
        <Header title="Today" subtitle={fmtLongDate(new Date())} />
        <Page contentStyle={{ gap: space.lg }}>
          <ErrorBanner text={error} />
          <LinearGradient colors={t.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ borderRadius: radius.xl, paddingVertical: space.xl, paddingHorizontal: space.xxl, flexDirection: 'row', alignItems: 'center', gap: space.xxl }}>
            <View style={{ flex: 1, minWidth: 0, gap: space.md }}>
              <Txt variant="display" color="#FFFFFF">{greeting()}</Txt>
              <View style={{ gap: space.sm, maxWidth: 520 }}>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
                  {view.dueTotal ? (
                    <>
                      <Txt variant="title" color="#FFFFFF">{view.dueDone} of {view.dueTotal}</Txt>
                      <Txt variant="label" color="rgba(255,255,255,0.85)">due today done</Txt>
                    </>
                  ) : (
                    <Txt variant="label" color="rgba(255,255,255,0.85)">Nothing is due today</Txt>
                  )}
                </View>
                <View style={{ height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.22)' }}>
                  <View style={{ height: 8, borderRadius: 4, backgroundColor: '#FFFFFF', width: `${Math.round(progress * 100)}%` }} />
                </View>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: space.sm, width: three ? 480 : 390 }}>
              <Stat value={view.overdue.length} label="Overdue" alert={view.overdue.length > 0} />
              <Stat value={view.today.length} label="Left today" />
              <Stat value={view.week.length} label="Next 7 days" />
            </View>
          </LinearGradient>

          {loading ? (
            <Skeleton />
          ) : (
            <>
              {inboxBanner || allDone ? (
                <View style={{ flexDirection: 'row', gap: space.lg }}>
                  {inboxBanner}
                  {allDone ? <View style={{ flex: 1 }}><Celebration count={view.dueTotal} /></View> : null}
                </View>
              ) : null}
              {nothing ? <Empty icon="chatbubbles-outline" title="Nothing here yet" text="When your boss writes in the group, tasks and notes show up here on their own." /> : null}
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.lg }}>
                <View style={col}>{first}{three ? null : second}</View>
                {three ? <View style={col}>{second}</View> : null}
                <View style={col}>{third}</View>
              </View>
            </>
          )}
        </Page>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {/* Fixed header: stays put (and keeps the status bar clear) while the page scrolls under it.
          Both gradient pieces run left to right, so the join with the scrolling part is invisible. */}
      <LinearGradient
        colors={t.hero}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ paddingTop: insets.top + space.lg, paddingHorizontal: space.xl, paddingBottom: space.md, zIndex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
          <View style={{ flex: 1 }}>
            <Txt variant="overline" color="rgba(255,255,255,0.78)">{fmtLongDate(new Date())}</Txt>
            <Txt variant="display" color="#FFFFFF">{greeting()}</Txt>
          </View>
          <IconBtn icon="search" label="Search" onPress={() => router.push('/search')} color="#FFFFFF" bg={GLASS} />
          <IconBtn icon="settings-outline" label="Settings" onPress={() => router.push('/settings')} color="#FFFFFF" bg={GLASS} />
        </View>
      </LinearGradient>

    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 120 }}
      overScrollMode="never"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.primary} />}>
      <LinearGradient
        colors={t.hero}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ paddingTop: space.sm, paddingHorizontal: space.xl, paddingBottom: space.xl, borderBottomLeftRadius: radius.xl, borderBottomRightRadius: radius.xl, gap: space.lg }}>
        <View style={{ gap: space.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            {view.dueTotal ? (
              <>
                <Txt variant="title" color="#FFFFFF">{view.dueDone} of {view.dueTotal}</Txt>
                <Txt variant="label" color="rgba(255,255,255,0.85)">due today done</Txt>
              </>
            ) : (
              <Txt variant="label" color="rgba(255,255,255,0.85)">Nothing is due today</Txt>
            )}
          </View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.22)' }}>
            <View style={{ height: 8, borderRadius: 4, backgroundColor: '#FFFFFF', width: `${Math.round(progress * 100)}%` }} />
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Stat value={view.overdue.length} label="Overdue" alert={view.overdue.length > 0} />
          <Stat value={view.today.length} label="Left today" />
          <Stat value={view.week.length} label="Next 7 days" />
        </View>
      </LinearGradient>

      <View style={{ paddingHorizontal: space.lg, paddingTop: space.lg }}>
        <ErrorBanner text={error} />
        {loading ? (
          <Skeleton />
        ) : (
          <>
            {inboxBanner}

            {allDone ? <Celebration count={view.dueTotal} /> : null}

            <View style={{ flexDirection: 'row', gap: space.md }}>
              <SplitCard role="boss" title="From boss" name={config?.boss_name ?? null} counts={view.boss} onPress={() => openTasks('boss')} />
              <SplitCard role="me" title="My own" name={null} counts={view.me} onPress={() => openTasks('me')} />
            </View>

            <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
              <Shortcut icon="calendar-outline" label="Calendar" onPress={() => { setPref('tasks:view', 'calendar'); router.push('/tasks'); }} />
              <Shortcut icon="time-outline" label="Timeline" onPress={() => router.push('/timeline')} />
              <Shortcut icon="folder-open-outline" label="Projects" onPress={() => router.push('/projects')} />
            </View>

            {view.overdue.length ? <SectionHeader title="Overdue" count={view.overdue.length} color={t.danger} /> : null}
            <List>{view.overdue.map((i, k) => <Appear key={i.id} index={k}><TaskCard item={i} onStatus={setStatus(i)} /></Appear>)}</List>

            <SectionHeader title="Today" count={view.today.length || undefined} />
            {view.today.length ? (
              <List>{view.today.map((i, k) => <Appear key={i.id} index={k + view.overdue.length}><TaskCard item={i} onStatus={setStatus(i)} /></Appear>)}</List>
            ) : (
              <Txt variant="label" sub style={{ paddingHorizontal: 2 }}>{view.dueTotal ? 'Everything due today is done.' : 'No deadlines today.'}</Txt>
            )}

            {view.waiting.length ? (
              <>
                <SectionHeader title="Waiting on boss" count={view.waiting.length} />
                {waitingCard}
              </>
            ) : null}

            {view.week.length ? <SectionHeader title="Next 7 days" count={view.week.length} /> : null}
            <List>{view.week.map((i) => <TaskCard key={i.id} item={i} onStatus={setStatus(i)} />)}</List>

            {view.undated > 0 ? (
              <Pressable onPress={() => router.push('/tasks')} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.lg, paddingHorizontal: 2 }, pressed && styles.pressed]}>
                <Txt variant="label" color={t.primary}>{plural(view.undated, 'more open task')} without a deadline</Txt>
                <Ionicons name="arrow-forward" size={14} color={t.primary} />
              </Pressable>
            ) : null}

            <SectionHeader title="This week" />
            {weekCard}

            {view.notes.length ? <SectionHeader title="Latest notes" /> : null}
            <List>{view.notes.map((i) => <NoteCard key={i.id} item={i} compact />)}</List>

            {nothing ? <Empty icon="chatbubbles-outline" title="Nothing here yet" text="When your boss writes in the group, tasks and notes show up here on their own." /> : null}
          </>
        )}
      </View>
    </ScrollView>
    </View>
  );
}

const List = ({ children }: { children: React.ReactNode }) => <View style={{ gap: space.md }}>{children}</View>;

function Shortcut({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 11, borderRadius: radius.md, backgroundColor: t.primarySoft }, pressed && styles.pressed]}>
      <Ionicons name={icon} size={16} color={t.primary} />
      <Txt variant="label" color={t.primary} strong>{label}</Txt>
    </Pressable>
  );
}

const SPARKS = [
  { x: -30, y: -22 }, { x: 26, y: -28 }, { x: 38, y: 4 }, { x: -40, y: 6 }, { x: -14, y: -36 }, { x: 12, y: 30 }, { x: -24, y: 26 }, { x: 34, y: 24 },
];

/** Shown once everything due today is handled: a trophy that pops while a few sparks fly out. */
function Celebration({ count }: { count: number }) {
  const t = useTheme();
  const pop = useRef(new Animated.Value(reduceMotionNow() ? 1 : 0)).current;
  const burst = useRef(new Animated.Value(reduceMotionNow() ? 1 : 0)).current;
  useEffect(() => {
    if (reduceMotionNow()) return;
    success();
    Animated.parallel([
      Animated.spring(pop, { toValue: 1, friction: 4, tension: 160, useNativeDriver: true }),
      Animated.timing(burst, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [pop, burst]);
  const colors = [t.bossSolid, t.meSolid, t.primaryBg, t.success];
  return (
    <Card flat style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: t.successSoft, borderColor: 'transparent', marginBottom: space.md, overflow: 'hidden' }}>
      <View style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
        {SPARKS.map((p, i) => (
          <Animated.View
            key={i}
            style={{ position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: colors[i % colors.length], opacity: burst.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0] }), transform: [{ translateX: burst.interpolate({ inputRange: [0, 1], outputRange: [0, p.x] }) }, { translateY: burst.interpolate({ inputRange: [0, 1], outputRange: [0, p.y] }) }] }}
          />
        ))}
        <Animated.View style={{ transform: [{ scale: pop }] }}>
          <Ionicons name="trophy" size={30} color={t.success} />
        </Animated.View>
      </View>
      <View style={{ flex: 1 }}>
        <Txt variant="body" strong color={t.success}>All done for today</Txt>
        <Txt variant="caption" color={t.success}>{count === 1 ? 'The one task due today is handled.' : `All ${count} tasks due today are handled.`}</Txt>
      </View>
    </Card>
  );
}

function Stat({ value, label, alert }: { value: number; label: string; alert?: boolean }) {
  return (
    <View style={{ flex: 1, backgroundColor: GLASS, borderRadius: radius.md, paddingVertical: space.md, paddingHorizontal: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Txt variant="title" color="#FFFFFF">{value}</Txt>
        {alert ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#FDA4AF' }} /> : null}
      </View>
      <Txt variant="caption" color="rgba(255,255,255,0.85)" style={{ fontFamily: ui.semibold }}>{label}</Txt>
    </View>
  );
}

function SplitCard({ role, title, name, counts, onPress }: { role: Role; title: string; name: string | null; counts: { tasks: number; notes: number }; onPress: () => void }) {
  const t = useTheme();
  const c = roleColors(t, role);
  return (
    <Card onPress={onPress} style={{ flex: 1, gap: space.sm, padding: space.md + 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Avatar role={role} name={name ?? (role === 'me' ? 'Me' : 'B')} size={32} />
        <View style={{ flex: 1 }}>
          <Txt variant="label" color={c.fg} strong>{title}</Txt>
          {name ? <Txt variant="caption" content sub numberOfLines={1}>{name}</Txt> : null}
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
        <Txt variant="display">{counts.tasks}</Txt>
        <Txt variant="label" sub>open {counts.tasks === 1 ? 'task' : 'tasks'}</Txt>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Txt variant="caption" sub style={{ flex: 1 }}>{plural(counts.notes, 'note')}</Txt>
        <Ionicons name="arrow-forward" size={15} color={c.fg} />
      </View>
    </Card>
  );
}
