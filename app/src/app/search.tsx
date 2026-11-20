import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, ScrollView, TextInput, View } from 'react-native';
import { openItem } from '@/components/items';
import { Card, Chip, Empty, ErrorBanner, RoleBadge, RoleFilterBar, Skeleton, TopBar, Txt, styles, type IconName } from '@/components/ui';
import * as api from '@/lib/api';
import { Grid, Page, Panel } from '@/components/desktop';
import { useData } from '@/lib/data';
import { useLayout } from '@/lib/layout';
import { fmtDateTime } from '@/lib/format';
import { usePref } from '@/lib/prefs';
import { matchesRole } from '@/lib/roles';
import { content, noOutline, radius, space, useTheme } from '@/lib/theme';
import type { RoleFilter, SearchResult } from '@/lib/types';

const KIND: Record<SearchResult['kind'], { label: string; icon: IconName }> = {
  task: { label: 'Task', icon: 'checkmark-circle' },
  note: { label: 'Note', icon: 'reader' },
  message: { label: 'Message', icon: 'chatbubble-ellipses' },
  file: { label: 'File', icon: 'document-attach' },
};
type Filter = 'all' | SearchResult['kind'];
const FILTERS: Filter[] = ['all', 'task', 'note', 'message', 'file'];

export default function Search() {
  const t = useTheme();
  const { role } = useData();
  const params = useLocalSearchParams<{ q?: string }>();
  const [q, setQ] = useState(params.q ?? '');
  const { desktop } = useLayout();
  // Words typed into the top-bar search box on another page arrive as a parameter.
  useEffect(() => {
    if (params.q) setQ(params.q);
  }, [params.q]);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [who, setWho] = usePref<RoleFilter>('role:search', 'all');
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
      const res = await api.search(term);
      if (!alive) return;
      setLoading(false);
      setError(res.error);
      setResults(res.data);
    }, 300);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [q]);

  const list = results.filter((r) => (filter === 'all' || r.kind === filter) && matchesRole(role(r.sender_tg_id), who));
  const short = q.trim().length < 2;

  const resultCard = (r: SearchResult) => {
          const k = KIND[r.kind] ?? KIND.message;
          const id = r.item_id;
          return (
            <Card onPress={id ? () => openItem(id) : undefined} style={{ gap: space.sm }}>
              <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
                <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: t.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={k.icon} size={16} color={t.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Txt variant="label" strong>{k.label}</Txt>
                  <Txt variant="caption" sub>{fmtDateTime(r.at)}</Txt>
                </View>
                {id ? <Ionicons name="chevron-forward" size={16} color={t.faint} /> : null}
              </View>
              {r.title && r.kind !== 'message' ? <Txt content strong numberOfLines={2}>{r.title}</Txt> : null}
              {r.snippet && r.kind !== 'file' ? <Txt variant="label" content sub={r.kind !== 'message'} selectable={!id} numberOfLines={id ? 3 : 8}>{r.snippet}</Txt> : null}
              <RoleBadge role={role(r.sender_tg_id)} name={r.sender_name} />
              {!id ? <Txt variant="caption" sub>No task or note was made from this message.</Txt> : null}
            </Card>
          );
  };
  const emptyState = (
          loading ? (
            <Skeleton rows={3} />
          ) : short ? (
            <Empty icon="search-outline" title="Find anything" text="Type at least two letters. Search the way it was written: Bangla, English or Banglish." />
          ) : (
            <Empty icon="file-tray-outline" title="No matches" text="Try another spelling, or switch the filter back to All." />
          )
  );

  if (desktop) {
    const field = (
      <View style={{ width: 440, flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: t.surface, borderColor: t.border, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md }}>
        <Ionicons name="search" size={18} color={t.faint} />
        <TextInput value={q} onChangeText={setQ} autoFocus placeholder="Tasks, notes, files, messages" placeholderTextColor={t.faint} accessibilityLabel="Search" style={[{ flex: 1, minWidth: 0, color: t.text, fontFamily: content.regular, fontSize: 16 * t.scale, paddingVertical: 9 }, noOutline]} />
        {q ? <Ionicons name="close-circle" size={18} color={t.faint} onPress={() => setQ('')} accessibilityLabel="Clear search" /> : null}
      </View>
    );
    const kinds = (['task', 'note', 'message', 'file'] as const).map((k) => ({ kind: k, rows: list.filter((r) => r.kind === k) }));
    return (
      <View style={{ flex: 1 }}>
        <TopBar title="Search" noBack>
          {field}
          <RoleFilterBar value={who} onChange={setWho} />
        </TopBar>
        <Page contentStyle={{ gap: space.lg }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {FILTERS.map((f) => <Chip key={f} label={f === 'all' ? 'Everything' : `${KIND[f].label}s`} active={filter === f} onPress={() => setFilter(f)} />)}
          </View>
          <ErrorBanner text={error} />
          {!list.length ? (
            emptyState
          ) : filter === 'all' ? (
            // Everything: one column per kind, so tasks, notes, messages and files can be scanned side by side.
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.lg }}>
              {kinds.filter((k) => k.rows.length).map((k) => (
                <Panel key={k.kind} title={`${KIND[k.kind].label}s`} count={k.rows.length} style={{ flex: 1, maxWidth: 560 }}>
                  <View style={{ gap: space.md }}>{k.rows.map((r, i) => <View key={`${r.item_id}-${r.message_id}-${i}`}>{resultCard(r)}</View>)}</View>
                </Panel>
              ))}
            </View>
          ) : (
            <Grid min={380}>{list.map((r, i) => <View key={`${r.item_id}-${r.message_id}-${i}`}>{resultCard(r)}</View>)}</Grid>
          )}
        </Page>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Search">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: t.surface, borderColor: t.border, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md }}>
          <Ionicons name="search" size={18} color={t.faint} />
          <TextInput
            value={q}
            onChangeText={setQ}
            autoFocus
            placeholder="Tasks, notes, files, messages"
            placeholderTextColor={t.faint}
            returnKeyType="search"
            style={[{ flex: 1, color: t.text, fontFamily: content.regular, fontSize: 16 * t.scale, paddingVertical: 11 }, noOutline]}
          />
          {q ? <Ionicons name="close-circle" size={18} color={t.faint} onPress={() => setQ('')} accessibilityLabel="Clear search" /> : null}
        </View>
        <RoleFilterBar value={who} onChange={setWho} />
      </TopBar>
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.xs }}>
          {FILTERS.map((f) => <Chip key={f} label={f === 'all' ? 'Everything' : `${KIND[f].label}s`} active={filter === f} onPress={() => setFilter(f)} />)}
        </ScrollView>
      </View>
      <FlatList
        data={list}
        keyExtractor={(r, i) => `${r.kind}-${r.item_id}-${r.message_id}-${i}`}
        contentContainerStyle={[styles.list, { paddingBottom: 48 }]}
        ItemSeparatorComponent={() => <View style={{ height: space.md }} />}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={<ErrorBanner text={error} />}
        renderItem={({ item: r }) => resultCard(r)}
        ListEmptyComponent={emptyState}
      />
    </View>
  );
}
