import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { Card, Chip, Empty, ErrorBanner, Txt, styles } from '@/components/ui';
import { useItems } from '@/lib/data';
import { fmtDateTime } from '@/lib/format';
import { useTheme } from '@/lib/theme';

export default function Notes() {
  const t = useTheme();
  const { items, loading, error, refresh, updateItem } = useItems();
  const [tag, setTag] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const notes = useMemo(() => items.filter((i) => i.type === 'note'), [items]);
  const tags = useMemo(() => {
    const count = new Map<string, number>();
    for (const n of notes) for (const g of n.tags) count.set(g, (count.get(g) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([g]) => g);
  }, [notes]);
  const list = useMemo(
    () =>
      notes
        .filter((n) => !tag || n.tags.includes(tag))
        .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.created_at.localeCompare(a.created_at)),
    [notes, tag],
  );

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
          {tags.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, marginBottom: 12 }}>
              <Chip label="সব" active={!tag} onPress={() => setTag(null)} />
              {tags.map((g) => <Chip key={g} label={`#${g}`} active={tag === g} onPress={() => setTag(tag === g ? null : g)} />)}
            </ScrollView>
          ) : null}
        </View>
      }
      renderItem={({ item }) => (
        <Card onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
            <Txt bold style={{ flex: 1 }}>{item.title}</Txt>
            {item.has_files ? <Ionicons name="attach" size={18} color={t.sub} /> : null}
            <Pressable
              hitSlop={10}
              accessibilityLabel={item.pinned ? 'পিন সরান' : 'পিন করুন'}
              onPress={() => updateItem(item.id, { pinned: !item.pinned }, item.pinned ? 'পিন সরানো হয়েছে' : 'পিন করা হয়েছে')}>
              <Ionicons name={item.pinned ? 'pin' : 'pin-outline'} size={20} color={item.pinned ? t.primary : t.sub} />
            </Pressable>
          </View>
          {item.details ? <Txt sub size={14} numberOfLines={3} style={{ marginTop: 4 }}>{item.details}</Txt> : null}
          <View style={styles.meta}>
            <Txt size={12} sub>{fmtDateTime(item.created_at)}</Txt>
            {item.tags.map((g) => <Txt key={g} size={12} color={t.primary}>#{g}</Txt>)}
            {item.needs_review ? <Txt size={12} color={t.warn}>যাচাই দরকার</Txt> : null}
          </View>
        </Card>
      )}
      ListEmptyComponent={<Empty loading={loading} text={tag ? 'এই ট্যাগে কোনো নোট নেই।' : 'এখনো কোনো নোট নেই।'} />}
    />
  );
}
