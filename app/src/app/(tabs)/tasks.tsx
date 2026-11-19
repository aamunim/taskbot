import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, View } from 'react-native';
import { Chip, Empty, ErrorBanner, ItemRow, Segments, styles } from '@/components/ui';
import { useItems } from '@/lib/data';
import { PRIORITY_RANK, STATUS_LABEL } from '@/lib/format';
import type { Item, Status } from '@/lib/types';

type Sort = 'due' | 'priority' | 'new';
const SORTS: { value: Sort; label: string }[] = [
  { value: 'due', label: 'ডেডলাইন অনুযায়ী' },
  { value: 'priority', label: 'অগ্রাধিকার অনুযায়ী' },
  { value: 'new', label: 'নতুন আগে' },
];
const STATUSES: { value: Status; label: string }[] = [
  { value: 'todo', label: STATUS_LABEL.todo },
  { value: 'doing', label: STATUS_LABEL.doing },
  { value: 'done', label: STATUS_LABEL.done },
];

// Tasks without a deadline go after the dated ones.
const dueKey = (i: Item) => i.due_at ?? '9999';

export default function Tasks() {
  const { items, loading, error, refresh, updateItem } = useItems();
  const [status, setStatus] = useState<Status>('todo');
  const [sort, setSort] = useState<Sort>('due');
  const [refreshing, setRefreshing] = useState(false);

  const list = useMemo(() => {
    const rows = items.filter((i) => i.type === 'task' && i.status === status);
    if (status === 'done') return rows.sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''));
    if (sort === 'due') return rows.sort((a, b) => dueKey(a).localeCompare(dueKey(b)));
    if (sort === 'priority') return rows.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || dueKey(a).localeCompare(dueKey(b)));
    return rows;
  }, [items, status, sort]);

  return (
    <FlatList
      data={list}
      keyExtractor={(i) => i.id}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await refresh();
            setRefreshing(false);
          }}
        />
      }
      ListHeaderComponent={
        <View>
          <ErrorBanner text={error} />
          <Segments options={STATUSES} value={status} onChange={setStatus} />
          {status !== 'done' ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 12 }}>
              {SORTS.map((s) => <Chip key={s.value} label={s.label} active={sort === s.value} onPress={() => setSort(s.value)} />)}
            </ScrollView>
          ) : null}
        </View>
      }
      renderItem={({ item }) => (
        <ItemRow item={item} onStatus={(to) => updateItem(item.id, { status: to }, `স্ট্যাটাস: ${STATUS_LABEL[item.status]} → ${STATUS_LABEL[to]}`)} />
      )}
      ListEmptyComponent={<Empty loading={loading} text={`"${STATUS_LABEL[status]}" ভাগে কোনো কাজ নেই।`} />}
    />
  );
}
