import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { Btn, Card, Empty, ErrorBanner, Txt, styles } from '@/components/ui';
import { useItems } from '@/lib/data';
import { bn, dueLabel, fmtDateTime } from '@/lib/format';

export default function Inbox() {
  const { items, loading, error, refresh, updateItem } = useItems();
  const [refreshing, setRefreshing] = useState(false);
  const list = useMemo(() => items.filter((i) => i.needs_review), [items]);

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
          {list.length ? <Txt sub size={13} style={{ marginBottom: 10, marginHorizontal: 4 }}>AI এগুলো নিয়ে নিশ্চিত নয়। ঠিক ভাগটি বেছে নিন।</Txt> : null}
        </View>
      }
      renderItem={({ item }) => {
        const due = dueLabel(item);
        return (
          <Card onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}>
            <Txt bold>{item.title}</Txt>
            {item.details ? <Txt sub size={14} numberOfLines={4} style={{ marginTop: 4 }}>{item.details}</Txt> : null}
            <Txt size={13} sub style={{ marginTop: 6 }}>
              AI-এর অনুমান: {item.type === 'task' ? 'কাজ' : 'নোট'}
              {item.confidence != null ? ` (${bn(Math.round(item.confidence * 100))}% নিশ্চিত)` : ''}
              {due ? ` · ডেডলাইন ${due}` : ''}
            </Txt>
            <Txt size={12} sub>{fmtDateTime(item.created_at)}</Txt>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
              <Btn small kind={item.type === 'task' ? 'primary' : 'plain'} label="কাজ" onPress={() => updateItem(item.id, { type: 'task', needs_review: false }, 'Inbox থেকে "কাজ" হিসেবে নিশ্চিত করা হয়েছে')} />
              <Btn small kind={item.type === 'note' ? 'primary' : 'plain'} label="নোট" onPress={() => updateItem(item.id, { type: 'note', needs_review: false }, 'Inbox থেকে "নোট" হিসেবে নিশ্চিত করা হয়েছে')} />
              <View style={{ flex: 1 }} />
              <Btn small kind="danger" label="বাদ দিন" onPress={() => updateItem(item.id, { dismissed: true }, 'Inbox থেকে বাদ দেওয়া হয়েছে')} />
            </View>
          </Card>
        );
      }}
      ListEmptyComponent={<Empty loading={loading} text="যাচাই করার মতো কিছু নেই।" />}
      ListFooterComponent={list.length ? <Txt sub size={12} style={{ textAlign: 'center' }}>বাদ দিলেও বসের মূল মেসেজ মুছে যায় না।</Txt> : undefined}
    />
  );
}
