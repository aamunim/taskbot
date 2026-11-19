import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, TextInput, View } from 'react-native';
import { Card, Chip, Empty, ErrorBanner, Txt, styles } from '@/components/ui';
import { fmtDateTime } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import type { SearchResult } from '@/lib/types';

const KIND: Record<SearchResult['kind'], { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
  task: { label: 'কাজ', icon: 'checkmark-done-outline' },
  note: { label: 'নোট', icon: 'document-text-outline' },
  message: { label: 'মেসেজ', icon: 'chatbubble-outline' },
  file: { label: 'ফাইল', icon: 'attach' },
};
type Filter = 'all' | SearchResult['kind'];
const FILTERS: Filter[] = ['all', 'task', 'note', 'message', 'file'];

export default function Search() {
  const t = useTheme();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    const timer = setTimeout(async () => {
      const { data, error: err } = await supabase.rpc('search_all', { q: term });
      if (!alive) return;
      setLoading(false);
      setError(err?.message ?? null);
      setResults((data ?? []) as SearchResult[]);
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [q]);

  const list = results.filter((r) => filter === 'all' || r.kind === filter);

  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: 14, paddingBottom: 0, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.card, borderColor: t.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12 }}>
          <Ionicons name="search" size={18} color={t.sub} />
          <TextInput
            value={q}
            onChangeText={setQ}
            autoFocus
            placeholder="কাজ, নোট, ফাইল বা মেসেজ খুঁজুন"
            placeholderTextColor={t.sub}
            returnKeyType="search"
            style={{ flex: 1, color: t.text, fontSize: 16, paddingVertical: 10 }}
          />
        </View>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {FILTERS.map((f) => <Chip key={f} label={f === 'all' ? 'সব' : KIND[f].label} active={filter === f} onPress={() => setFilter(f)} />)}
        </View>
        <ErrorBanner text={error} />
      </View>
      <FlatList
        data={list}
        keyExtractor={(r, i) => `${r.kind}-${r.item_id}-${r.message_id}-${i}`}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item: r }) => {
          const k = KIND[r.kind] ?? KIND.message;
          const id = r.item_id;
          return (
            <Card onPress={id ? () => router.push({ pathname: '/item/[id]', params: { id } }) : undefined}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <Ionicons name={k.icon} size={16} color={t.sub} />
                <Txt size={12} sub style={{ flex: 1 }}>{k.label} · {fmtDateTime(r.at)}</Txt>
                {id ? <Ionicons name="chevron-forward" size={16} color={t.sub} /> : null}
              </View>
              {r.title ? <Txt bold style={{ marginTop: 4 }}>{r.title}</Txt> : null}
              {r.snippet && r.kind !== 'file' ? <Txt selectable={!id} size={14} sub={!!r.title} numberOfLines={id ? 3 : undefined} style={{ marginTop: 2 }}>{r.snippet}</Txt> : null}
              {!id ? <Txt size={12} sub style={{ marginTop: 6 }}>এই মেসেজ থেকে কোনো কাজ বা নোট তৈরি হয়নি।</Txt> : null}
            </Card>
          );
        }}
        ListEmptyComponent={
          <Empty loading={loading} text={q.trim().length < 2 ? 'খুঁজতে অন্তত দুটি অক্ষর লিখুন। বাংলা, ইংরেজি বা বাংলিশ যেভাবে লেখা আছে সেভাবে খুঁজুন।' : 'কিছু পাওয়া যায়নি।'} />
        }
      />
    </View>
  );
}
