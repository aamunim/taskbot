import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { setStatusBarStyle } from 'expo-status-bar';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NoteCard, TaskCard } from '@/components/items';
import { Avatar, Card, Empty, ErrorBanner, IconBtn, SectionHeader, Skeleton, Txt, styles } from '@/components/ui';
import { useData } from '@/lib/data';
import { PRIORITY_RANK, STATUS_LABEL, dayNumber, fmtLongDate, greeting, isOverdue, plural, todayNumber } from '@/lib/format';
import { setPref } from '@/lib/prefs';
import { roleColors } from '@/lib/roles';
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

  // The header is dark in both themes, so the status bar icons must be light while this tab is showing.
  useFocusEffect(
    useCallback(() => {
      setStatusBarStyle('light');
      return () => setStatusBarStyle('auto');
    }, []),
  );

  const view = useMemo(() => {
    const today = todayNumber();
    const tasks = items.filter((i) => i.type === 'task');
    const open = tasks.filter((i) => i.status !== 'done');
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
      dueDone: dueToday.filter((i) => i.status === 'done').length,
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
            {view.inbox > 0 ? (
              <Card onPress={() => router.push('/inbox')} style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: t.bossSoft, borderColor: 'transparent', marginBottom: space.md }} flat>
                <Ionicons name="help-buoy" size={22} color={t.boss} />
                <View style={{ flex: 1 }}>
                  <Txt variant="body" strong color={t.boss}>{plural(view.inbox, 'item')} to review</Txt>
                  <Txt variant="caption" color={t.boss}>The AI was not sure about {view.inbox === 1 ? 'it' : 'these'}</Txt>
                </View>
                <Ionicons name="chevron-forward" size={18} color={t.boss} />
              </Card>
            ) : null}

            <View style={{ flexDirection: 'row', gap: space.md }}>
              <SplitCard role="boss" title="From boss" name={config?.boss_name ?? null} counts={view.boss} onPress={() => openTasks('boss')} />
              <SplitCard role="me" title="My own" name={null} counts={view.me} onPress={() => openTasks('me')} />
            </View>

            {view.overdue.length ? <SectionHeader title="Overdue" count={view.overdue.length} color={t.danger} /> : null}
            <List>{view.overdue.map((i) => <TaskCard key={i.id} item={i} onStatus={setStatus(i)} />)}</List>

            <SectionHeader title="Today" count={view.today.length || undefined} />
            {view.today.length ? (
              <List>{view.today.map((i) => <TaskCard key={i.id} item={i} onStatus={setStatus(i)} />)}</List>
            ) : (
              <Txt variant="label" sub style={{ paddingHorizontal: 2 }}>{view.dueTotal ? 'Everything due today is done.' : 'No deadlines today.'}</Txt>
            )}

            {view.week.length ? <SectionHeader title="Next 7 days" count={view.week.length} /> : null}
            <List>{view.week.map((i) => <TaskCard key={i.id} item={i} onStatus={setStatus(i)} />)}</List>

            {view.undated > 0 ? (
              <Pressable onPress={() => router.push('/tasks')} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: space.lg, paddingHorizontal: 2 }, pressed && styles.pressed]}>
                <Txt variant="label" color={t.primary}>{plural(view.undated, 'more open task')} without a deadline</Txt>
                <Ionicons name="arrow-forward" size={14} color={t.primary} />
              </Pressable>
            ) : null}

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
