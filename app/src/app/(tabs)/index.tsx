import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { Card, Empty, ErrorBanner, ItemRow, SectionTitle, Txt, styles } from '@/components/ui';
import { useItems } from '@/lib/data';
import { PRIORITY_RANK, bn, dayNumber, isOverdue, todayNumber } from '@/lib/format';
import { useTheme } from '@/lib/theme';
import type { Item } from '@/lib/types';

const byDue = (a: Item, b: Item) =>
  (a.due_at ?? '').localeCompare(b.due_at ?? '') || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];

export default function Today() {
  const t = useTheme();
  const { items, loading, error, refresh } = useItems();
  const [refreshing, setRefreshing] = useState(false);

  const view = useMemo(() => {
    const today = todayNumber();
    const open = items.filter((i) => i.type === 'task' && i.status !== 'done');
    const overdue = open.filter(isOverdue).sort(byDue);
    const late = new Set(overdue.map((i) => i.id));
    const dated = open.filter((i) => i.due_at && !late.has(i.id));
    return {
      overdue,
      today: dated.filter((i) => dayNumber(i.due_at!) === today).sort(byDue),
      week: dated.filter((i) => dayNumber(i.due_at!) > today && dayNumber(i.due_at!) <= today + 7).sort(byDue),
      undated: open.filter((i) => !i.due_at).length,
      notes: items.filter((i) => i.type === 'note').slice(0, 4),
      inbox: items.filter((i) => i.needs_review).length,
    };
  }, [items]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  if (loading) return <Empty text="" loading />;
  const nothing = !view.overdue.length && !view.today.length && !view.week.length;

  return (
    <ScrollView contentContainerStyle={styles.list} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      <ErrorBanner text={error} />
      {view.inbox > 0 ? (
        <Card onPress={() => router.push('/inbox')} style={{ borderColor: t.warn }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Ionicons name="file-tray-full-outline" size={22} color={t.warn} />
            <Txt style={{ flex: 1 }}>{bn(view.inbox)}টি আইটেম যাচাইয়ের অপেক্ষায়</Txt>
            <Ionicons name="chevron-forward" size={18} color={t.sub} />
          </View>
        </Card>
      ) : null}

      {view.overdue.length ? <SectionTitle color={t.danger}>মেয়াদ পেরিয়েছে ({bn(view.overdue.length)})</SectionTitle> : null}
      {view.overdue.map((i) => <ItemRow key={i.id} item={i} />)}

      <SectionTitle>আজকের কাজ</SectionTitle>
      {view.today.length ? view.today.map((i) => <ItemRow key={i.id} item={i} />) : <Txt sub style={{ marginHorizontal: 4 }}>আজ কোনো ডেডলাইন নেই।</Txt>}

      {view.week.length ? <SectionTitle>আগামী ৭ দিন</SectionTitle> : null}
      {view.week.map((i) => <ItemRow key={i.id} item={i} />)}

      {view.undated > 0 ? (
        <Txt sub size={13} style={{ marginTop: 12, marginHorizontal: 4 }}>
          ডেডলাইন ছাড়া আরও {bn(view.undated)}টি কাজ বাকি আছে ("কাজ" ট্যাবে দেখুন)।
        </Txt>
      ) : null}

      {view.notes.length ? <SectionTitle>সর্বশেষ নির্দেশনা</SectionTitle> : null}
      {view.notes.map((i) => <ItemRow key={i.id} item={i} />)}

      {nothing && !view.notes.length && !view.undated ? <Empty text="এখনো কিছু নেই। বস গ্রুপে মেসেজ দিলে এখানে দেখা যাবে।" /> : null}
    </ScrollView>
  );
}
