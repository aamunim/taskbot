import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, SectionList, View } from 'react-native';
import { MonthCalendar } from '@/components/Calendar';
import { TaskCard } from '@/components/items';
import { Appear } from '@/components/motion';
import { Empty, ErrorBanner, GlobalActions, Header, IconBtn, RoleFilterBar, SectionHeader, Segments, Skeleton, Txt, styles } from '@/components/ui';
import { Grid, Page, Panel, Quiet, TASKS_DESK_PREF, type TasksDeskView } from '@/components/desktop';
import { useData } from '@/lib/data';
import { useLayout } from '@/lib/layout';
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
  const { desktop, pageWidth } = useLayout();
  const [desk, setDesk] = usePref<TasksDeskView>(TASKS_DESK_PREF, 'board');
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

  if (desktop) {
    // Board: one column per status, each scrolling on its own. List and calendar are alternatives.
    const column = (st: Status) => {
      const rows = tasks.filter((i) => i.status === st);
      if (st === 'done') return rows.sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''));
      if (st === 'waiting') return rows.sort((a, b) => (a.waiting_since ?? '').localeCompare(b.waiting_since ?? ''));
      return rows.sort((a, b) => Number(isOverdue(b)) - Number(isOverdue(a)) || byDue(a, b));
    };
    // Four columns share the page; on a narrow window they keep a readable width and the board scrolls sideways.
    const columnWidth = Math.max(264, Math.min(460, Math.floor((pageWidth - space.xxl * 2 - space.lg * 3) / 4)));
    return (
      <View style={{ flex: 1 }}>
        <Header title={desk === 'calendar' ? 'Calendar' : 'Tasks'}>
          <RoleFilterBar value={who} onChange={setWho} />
          <Segments value={desk} onChange={setDesk} options={[{ value: 'board', label: 'Board' }, { value: 'list', label: 'List' }, { value: 'calendar', label: 'Calendar' }]} />
          {desk === 'list' ? <Segments value={status} onChange={setStatus} options={STATUSES.map((s) => ({ value: s, label: STATUS_SHORT[s], count: counts[s] }))} /> : null}
        </Header>
        {error ? <View style={{ paddingHorizontal: space.xxl }}><ErrorBanner text={error} /></View> : null}
        {desk === 'board' ? (
          <ScrollView horizontal style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: space.xxl, paddingBottom: space.xl, paddingTop: space.xs, gap: space.lg }}>
            {STATUSES.map((st) => {
              const rows = column(st);
              return (
                <Panel key={st} scroll title={STATUS_LABEL[st]} count={rows.length} style={{ width: columnWidth }}>
                  {loading ? <Skeleton rows={2} /> : null}
                  {!loading && !rows.length ? <Quiet>{EMPTY_TITLE[st]}</Quiet> : null}
                  {rows.map((i) => <TaskCard key={i.id} item={i} board onStatus={change(i)} />)}
                </Panel>
              );
            })}
          </ScrollView>
        ) : desk === 'calendar' ? (
          <View style={{ flex: 1, flexDirection: 'row', gap: space.xl, paddingHorizontal: space.xxl, paddingBottom: space.xl }}>
            <ScrollView style={{ width: Math.min(460, pageWidth * 0.45), flexGrow: 0 }} showsVerticalScrollIndicator={false}>
              <MonthCalendar tasks={tasks} month={month} onMonth={setMonth} selected={selected} onSelect={setSelected} />
            </ScrollView>
            <Panel scroll title={fmtDayLong(selected)} count={onDay.length || undefined} style={{ flex: 1 }}>
              {onDay.length ? onDay.map((i) => <TaskCard key={i.id} item={i} onStatus={change(i)} />) : <Quiet>No deadlines on this day.</Quiet>}
            </Panel>
          </View>
        ) : (
          <Page>
            {loading ? <Skeleton /> : null}
            {!loading && !sections.length ? <Empty icon="checkmark-done-outline" title={EMPTY_TITLE[status]} text="Tasks appear here as soon as they are picked up from the group." /> : null}
            {sections.map((sec) => (
              <View key={sec.title}>
                <SectionHeader title={sec.title} count={sec.data.length} color={sec.title === 'Overdue' ? t.danger : undefined} />
                <Grid min={360}>{sec.data.map((i) => <TaskCard key={i.id} item={i} onStatus={change(i)} />)}</Grid>
              </View>
            ))}
          </Page>
        )}
      </View>
    );
  }

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
