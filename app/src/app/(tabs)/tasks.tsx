import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, SectionList, View } from 'react-native';
import { MonthCalendar } from '@/components/Calendar';
import { TaskCard } from '@/components/items';
import { Appear } from '@/components/motion';
import { Empty, ErrorBanner, GlobalActions, Header, IconBtn, RoleFilterBar, SectionHeader, Segments, Skeleton, Txt, styles } from '@/components/ui';
import { useData } from '@/lib/data';
import { PRIORITY_RANK, STATUSES, STATUS_LABEL, STATUS_SHORT, dayNumber, dayParts, fmtDayLong, isOverdue, todayNumber } from '@/lib/format';
import { tap } from '@/lib/haptics';
import { usePref } from '@/lib/prefs';
import { matchesRole } from '@/lib/roles';
import { space, useTheme } from '@/lib/theme';
import type { Item, RoleFilter, Status } from '@/lib/types';

const dueKey = (i: Item) => i.due_at ?? '9999';
const byDue = (a: Item, b: Item) => dueKey(a).localeCompare(dueKey(b)) || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];

/** Buckets open tasks by how soon they are due. */
function bucket(i: Item): string {
  if (isOverdue(i)) return 'Overdue';
  if (!i.due_at) return 'No deadline';
  const diff = dayNumber(i.due_at) - todayNumber();
  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff <= 7) return 'This week';
  return 'Later';
}
const ORDER = ['Overdue', 'Today', 'Tomorrow', 'This week', 'Later', 'No deadline'];
const EMPTY_TITLE: Record<Status, string> = { todo: 'Nothing waiting', doing: 'Nothing in progress', waiting: 'Not waiting on anything', done: 'Nothing finished yet' };

export default function Tasks() {
  const t = useTheme();
  const { items, loading, error, refresh, updateItem, role } = useData();
  const [status, setStatus] = useState<Status>('todo');
  const [who, setWho] = usePref<RoleFilter>('role:tasks', 'all');
  const [view, setView] = usePref<'list' | 'calendar'>('tasks:view', 'list');
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState(todayNumber);
  const [month, setMonth] = useState(() => {
    const p = dayParts(todayNumber());
    return { year: p.year, month: p.month };
  });

  const tasks = useMemo(() => items.filter((i) => i.type === 'task' && matchesRole(role(i.source_sender_tg_id), who)), [items, role, who]);
  const counts = useMemo(() => Object.fromEntries(STATUSES.map((s) => [s, tasks.filter((i) => i.status === s).length])) as Record<Status, number>, [tasks]);

  const sections = useMemo(() => {
    const rows = tasks.filter((i) => i.status === status);
    if (status === 'done') {
      return rows.length ? [{ title: 'Completed', data: rows.sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? '')) }] : [];
    }
    if (status === 'waiting') {
      return rows.length ? [{ title: 'Sent, waiting for a reply', data: rows.sort((a, b) => (a.waiting_since ?? '').localeCompare(b.waiting_since ?? '')) }] : [];
    }
    const groups = new Map<string, Item[]>();
    for (const i of rows.sort(byDue)) groups.set(bucket(i), [...(groups.get(bucket(i)) ?? []), i]);
    return ORDER.filter((k) => groups.has(k)).map((k) => ({ title: k, data: groups.get(k)! }));
  }, [tasks, status]);

  const onDay = useMemo(() => tasks.filter((i) => i.due_at && dayNumber(i.due_at) === selected).sort(byDue), [tasks, selected]);
  const change = (item: Item) => (to: Status) => updateItem(item.id, { status: to }, `Status changed to ${STATUS_LABEL[to]}`);
  const refreshControl = (
    <RefreshControl
      tintColor={t.primary}
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await refresh();
        setRefreshing(false);
      }}
    />
  );

  return (
    <View style={{ flex: 1 }}>
      <Header
        title="Tasks"
        actions={
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <IconBtn
              icon={view === 'calendar' ? 'list-outline' : 'calendar-outline'}
              label={view === 'calendar' ? 'Show as list' : 'Show as calendar'}
              onPress={() => {
                tap();
                setView(view === 'calendar' ? 'list' : 'calendar');
              }}
              bg={view === 'calendar' ? t.primarySoft : t.surface}
              color={view === 'calendar' ? t.primary : undefined}
            />
            <GlobalActions />
          </View>
        }>
        <RoleFilterBar value={who} onChange={setWho} />
        {view === 'list' ? (
          <Segments value={status} onChange={setStatus} options={STATUSES.map((s) => ({ value: s, label: STATUS_SHORT[s], count: counts[s] }))} />
        ) : null}
      </Header>

      {view === 'calendar' ? (
        <ScrollView contentContainerStyle={styles.list} refreshControl={refreshControl}>
          <ErrorBanner text={error} />
          <MonthCalendar tasks={tasks} month={month} onMonth={setMonth} selected={selected} onSelect={setSelected} />
          <SectionHeader title={fmtDayLong(selected)} count={onDay.length || undefined} />
          {onDay.length ? (
            <View style={{ gap: space.md }}>
              {onDay.map((i, k) => (
                <Appear key={i.id} index={k}>
                  <TaskCard item={i} onStatus={change(i)} />
                </Appear>
              ))}
            </View>
          ) : (
            <Txt variant="label" sub style={{ paddingHorizontal: 2 }}>No deadlines on this day.</Txt>
          )}
        </ScrollView>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(i) => i.id}
          stickySectionHeadersEnabled={false}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={{ height: space.md }} />}
          refreshControl={refreshControl}
          ListHeaderComponent={<ErrorBanner text={error} />}
          renderSectionHeader={({ section }) => (
            <SectionHeader title={section.title} count={section.data.length} color={section.title === 'Overdue' ? t.danger : undefined} />
          )}
          renderItem={({ item, index }) => (
            <Appear index={index}>
              <TaskCard item={item} onStatus={change(item)} />
            </Appear>
          )}
          ListEmptyComponent={
            loading ? (
              <Skeleton />
            ) : (
              <Empty
                icon={status === 'done' ? 'trophy-outline' : status === 'waiting' ? 'hourglass-outline' : 'checkmark-done-outline'}
                title={EMPTY_TITLE[status]}
                text={
                  status === 'waiting'
                    ? 'When you have delivered a task and need the boss to reply, mark it “Sent, waiting”. It stays here until it is settled.'
                    : who === 'all'
                      ? 'Tasks appear here as soon as they are picked up from the group.'
                      : `No ${STATUS_LABEL[status].toLowerCase()} tasks ${who === 'boss' ? 'from your boss' : 'of your own'}.`
                }
              />
            )
          }
        />
      )}
    </View>
  );
}
