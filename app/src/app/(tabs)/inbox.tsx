import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, ScrollView, View } from 'react-native';
import { ItemDetailView } from '@/components/ItemDetail';
import { DuePill, openItem } from '@/components/items';
import { Appear } from '@/components/motion';
import { bump } from '@/lib/haptics';
import { Btn, Card, Empty, ErrorBanner, GlobalActions, Header, RoleBadge, Skeleton, Txt, styles } from '@/components/ui';
import { useData } from '@/lib/data';
import { useLayout } from '@/lib/layout';
import type { Item } from '@/lib/types';
import { fmtDateTime, plural } from '@/lib/format';
import { radius, space, useTheme } from '@/lib/theme';

export default function Inbox() {
  const t = useTheme();
  const { items, loading, error, refresh, updateItem, role } = useData();
  const [refreshing, setRefreshing] = useState(false);
  const list = useMemo(() => items.filter((i) => i.needs_review), [items]);
  const { desktop, pageWidth } = useLayout();
  const [picked, setPicked] = useState<string | null>(null);
  // Desktop always shows one item in full: the chosen one, or the first in the queue.
  const current = list.find((i) => i.id === picked) ?? list[0] ?? null;

  const reviewCard = (item: Item) => {
    const confidence = item.confidence != null ? Math.round(item.confidence * 100) : null;
    return (
            <Card onPress={() => (desktop ? setPicked(item.id) : openItem(item.id))} selected={desktop && item.id === current?.id} style={{ gap: space.md }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                <View style={{ flex: 1 }}>
                  <RoleBadge role={role(item.source_sender_tg_id)} name={item.source_sender_name} />
                </View>
                <Txt variant="caption" sub>{fmtDateTime(item.created_at)}</Txt>
              </View>
              <View style={{ gap: 4 }}>
                <Txt content strong>{item.title}</Txt>
                {item.details ? <Txt variant="label" content sub numberOfLines={3}>{item.details}</Txt> : null}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 3, paddingHorizontal: 8, borderRadius: radius.pill, backgroundColor: t.surfaceAlt }}>
                  <Ionicons name={item.type === 'task' ? 'checkmark-circle-outline' : 'reader-outline'} size={13} color={t.sub} />
                  <Txt variant="caption" sub strong>AI guess: {item.type === 'task' ? 'Task' : 'Note'}</Txt>
                </View>
                <DuePill item={item} />
              </View>
              {confidence != null ? (
                <View style={{ gap: 4 }}>
                  <View style={{ flexDirection: 'row' }}>
                    <Txt variant="caption" sub style={{ flex: 1 }}>AI confidence</Txt>
                    <Txt variant="caption" color={t.boss} strong>{confidence}%</Txt>
                  </View>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: t.surfaceAlt }}>
                    <View style={{ height: 6, borderRadius: 3, width: `${confidence}%`, backgroundColor: t.bossSolid }} />
                  </View>
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <Btn small icon="checkmark-circle-outline" label="Task" style={{ flex: 1 }} onPress={() => updateItem(item.id, { type: 'task', needs_review: false }, 'Confirmed as a task')} />
                <Btn small kind="soft" icon="reader" label="Note" style={{ flex: 1 }} onPress={() => updateItem(item.id, { type: 'note', needs_review: false }, 'Confirmed as a note')} />
                <Btn small kind="danger" icon="close" label="Dismiss" style={{ flex: 1 }} onPress={() => updateItem(item.id, { dismissed: true }, 'Dismissed')} />
              </View>
            </Card>
    );
  };
  const empty = loading ? <Skeleton height={180} rows={2} /> : <Empty icon="shield-checkmark-outline" title="All reviewed" text="Anything the AI is not sure about will wait here for you to confirm." />;
  const subtitle = list.length ? `${plural(list.length, 'item')} the AI was unsure about` : 'Things the AI was unsure about';

  if (desktop) {
    // Master–detail: the queue on the left, the chosen item in full on the right.
    return (
      <View style={{ flex: 1 }}>
        <Header title="Inbox" subtitle={subtitle} />
        {error ? <View style={{ paddingHorizontal: space.xxl }}><ErrorBanner text={error} /></View> : null}
        {!list.length ? (
          empty
        ) : (
          <View style={{ flex: 1, flexDirection: 'row', gap: space.xl, paddingHorizontal: space.xxl, paddingBottom: space.xl }}>
            <ScrollView style={{ width: Math.min(460, pageWidth * 0.42), flexGrow: 0 }} contentContainerStyle={{ gap: space.md, padding: 3 }} showsVerticalScrollIndicator={false}>
              {list.map((i) => <View key={i.id}>{reviewCard(i)}</View>)}
            </ScrollView>
            <View style={{ flex: 1, minWidth: 0, borderRadius: radius.lg, borderWidth: 1, borderColor: t.border, backgroundColor: t.surfaceAlt, overflow: 'hidden' }}>
              {current ? <ItemDetailView key={current.id} id={current.id} mode="pane" onClose={() => setPicked(null)} /> : null}
            </View>
          </View>
        )}
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Header title="Inbox" subtitle={subtitle} actions={<GlobalActions />} />
      <FlatList
        data={list}
        keyExtractor={(i) => i.id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: space.md }} />}
        refreshControl={
          <RefreshControl
            tintColor={t.primary} colors={[t.primaryBg, t.bossSolid, t.meSolid]} progressBackgroundColor={t.raised}
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              await refresh();
              setRefreshing(false);
            }}
          />
        }
        ListHeaderComponent={<ErrorBanner text={error} />}
        renderItem={({ item, index }) => <Appear index={index}>{reviewCard(item)}</Appear>}
        ListEmptyComponent={empty}
      />
    </View>
  );
}
