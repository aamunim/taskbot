import { useMemo, useState } from 'react';
import { RefreshControl, SectionList, View } from 'react-native';
import { TaskCard } from '@/components/items';
import { Empty, ErrorBanner, GlobalActions, Header, RoleFilterBar, SectionHeader, Segments, Skeleton, styles } from '@/components/ui';
import { useData } from '@/lib/data';
import { PRIORITY_RANK, STATUS_LABEL, dayNumber, isOverdue, todayNumber } from '@/lib/format';
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

export default function Tasks() {
  const t = useTheme();
  const { items, loading, error, refresh, updateItem, role } = useData();
  const [status, setStatus] = useState<Status>('todo');
  const [who, setWho] = usePref<RoleFilter>('role:tasks', 'all');
  const [refreshing, setRefreshing] = useState(false);

  const tasks = useMemo(() => items.filter((i) => i.type === 'task' && matchesRole(role(i.source_sender_tg_id), who)), [items, role, who]);
  const counts = useMemo(() => ({ todo: 0, doing: 0, done: 0, ...Object.fromEntries((['todo', 'doing', 'done'] as Status[]).map((s) => [s, tasks.filter((i) => i.status === s).length])) }), [tasks]);

  const sections = useMemo(() => {
    const rows = tasks.filter((i) => i.status === status);
    if (status === 'done') {
      return rows.length ? [{ title: 'Completed', data: rows.sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? '')) }] : [];
    }
    const groups = new Map<string, Item[]>();
    for (const i of rows.sort(byDue)) groups.set(bucket(i), [...(groups.get(bucket(i)) ?? []), i]);
    return ORDER.filter((k) => groups.has(k)).map((k) => ({ title: k, data: groups.get(k)! }));
  }, [tasks, status]);

  return (
    <View style={{ flex: 1 }}>
      <Header title="Tasks" actions={<GlobalActions />}>
        <RoleFilterBar value={who} onChange={setWho} />
        <Segments
          value={status}
          onChange={setStatus}
          options={(['todo', 'doing', 'done'] as Status[]).map((s) => ({ value: s, label: STATUS_LABEL[s], count: counts[s] }))}
        />
      </Header>
      <SectionList
        sections={sections}
        keyExtractor={(i) => i.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: space.md }} />}
        refreshControl={
          <RefreshControl
            tintColor={t.primary}
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await refresh();
              setRefreshing(false);
            }}
          />
        }
        ListHeaderComponent={<ErrorBanner text={error} />}
        renderSectionHeader={({ section }) => (
          <SectionHeader title={section.title} count={section.data.length} color={section.title === 'Overdue' ? t.danger : undefined} />
        )}
        renderItem={({ item }) => (
          <TaskCard item={item} onStatus={(to) => updateItem(item.id, { status: to }, `Status changed to ${STATUS_LABEL[to]}`)} />
        )}
        ListEmptyComponent={
          loading ? (
            <Skeleton />
          ) : (
            <Empty
              icon={status === 'done' ? 'trophy-outline' : 'checkmark-done-outline'}
              title={status === 'todo' ? 'Nothing waiting' : status === 'doing' ? 'Nothing in progress' : 'Nothing finished yet'}
              text={who === 'all' ? 'Tasks appear here as soon as they are picked up from the group.' : `No ${STATUS_LABEL[status].toLowerCase()} tasks ${who === 'boss' ? 'from your boss' : 'of your own'}.`}
            />
          )
        }
      />
    </View>
  );
}
