import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { DuePill, openItem } from '@/components/items';
import { Appear } from '@/components/motion';
import { bump } from '@/lib/haptics';
import { Btn, Card, Empty, ErrorBanner, GlobalActions, Header, RoleBadge, Skeleton, Txt, styles } from '@/components/ui';
import { useData } from '@/lib/data';
import { fmtDateTime, plural } from '@/lib/format';
import { radius, space, useTheme } from '@/lib/theme';

export default function Inbox() {
  const t = useTheme();
  const { items, loading, error, refresh, updateItem, role } = useData();
  const [refreshing, setRefreshing] = useState(false);
  const list = useMemo(() => items.filter((i) => i.needs_review), [items]);

  return (
    <View style={{ flex: 1 }}>
      <Header title="Inbox" subtitle={list.length ? `${plural(list.length, 'item')} the AI was unsure about` : 'Things the AI was unsure about'} actions={<GlobalActions />} />
      <FlatList
        data={list}
        keyExtractor={(i) => i.id}
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
        renderItem={({ item, index }) => {
          const confidence = item.confidence != null ? Math.round(item.confidence * 100) : null;
          return (
            <Appear index={index}>
            <Card onPress={() => openItem(item.id)} style={{ gap: space.md }}>
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
                <Btn small icon="checkmark-circle" label="Task" style={{ flex: 1 }} onPress={() => updateItem(item.id, { type: 'task', needs_review: false }, 'Confirmed as a task')} />
                <Btn small kind="soft" icon="reader" label="Note" style={{ flex: 1 }} onPress={() => updateItem(item.id, { type: 'note', needs_review: false }, 'Confirmed as a note')} />
                <Btn small kind="danger" icon="close" label="Dismiss" style={{ flex: 1 }} onPress={() => updateItem(item.id, { dismissed: true }, 'Dismissed')} />
              </View>
            </Card>
            </Appear>
          );
        }}
        ListEmptyComponent={loading ? <Skeleton height={180} rows={2} /> : <Empty icon="shield-checkmark-outline" title="All reviewed" text="Anything the AI is not sure about will wait here for you to confirm." />}
      />
    </View>
  );
}
