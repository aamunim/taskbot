import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { NoteCard, noteColumns } from '@/components/items';
import { Appear } from '@/components/motion';
import { Chip, Empty, ErrorBanner, GlobalActions, Header, IconBtn, OptionGroup, RoleFilterBar, SectionHeader, Segments, Sheet, Skeleton, styles } from '@/components/ui';
import { Grid, Page } from '@/components/desktop';
import { useData } from '@/lib/data';
import { useLayout } from '@/lib/layout';
import { dayHeading } from '@/lib/format';
import { usePref } from '@/lib/prefs';
import { matchesRole } from '@/lib/roles';
import { space, useTheme } from '@/lib/theme';
import type { Item, RoleFilter } from '@/lib/types';

type ViewMode = 'cards' | 'compact';
type GroupBy = 'none' | 'tag' | 'date';

export default function Notes() {
  const t = useTheme();
  const { items, loading, error, refresh, updateItem, role } = useData();
  const [who, setWho] = usePref<RoleFilter>('role:notes', 'all');
  const [mode, setMode] = usePref<ViewMode>('notes:view', 'cards');
  const [groupBy, setGroupBy] = usePref<GroupBy>('notes:group', 'none');
  const [tag, setTag] = useState<string | null>(null);
  const [options, setOptions] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const { desktop, pageWidth } = useLayout();

  const notes = useMemo(
    () => items.filter((i) => i.type === 'note' && !i.needs_review && matchesRole(role(i.source_sender_tg_id), who)),
    [items, role, who],
  );
  const tags = useMemo(() => {
    const count = new Map<string, number>();
    for (const n of notes) for (const g of n.tags) count.set(g, (count.get(g) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]);
  }, [notes]);
  // A tag chosen under one filter may not exist under another.
  const activeTag = tag && tags.some(([g]) => g === tag) ? tag : null;

  const groups = useMemo(() => {
    const list = notes
      .filter((n) => !activeTag || n.tags.includes(activeTag))
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.created_at.localeCompare(a.created_at));
    const out = new Map<string, Item[]>();
    const add = (k: string, n: Item) => out.set(k, [...(out.get(k) ?? []), n]);
    for (const n of list) {
      if (groupBy === 'tag') add(n.tags[0] ? `#${n.tags[0]}` : 'Untagged', n);
      else if (groupBy === 'date') add(dayHeading(n.created_at), n);
      else add(n.pinned ? 'Pinned' : 'All notes', n);
    }
    return [...out.entries()];
  }, [notes, activeTag, groupBy]);

  const togglePin = (n: Item) => updateItem(n.id, { pinned: !n.pinned }, n.pinned ? 'Unpinned' : 'Pinned');
  const isEmpty = !groups.length;

  if (desktop) {
    // A wall of notes across the window: as many columns as fit.
    const columns = Math.max(2, Math.min(5, Math.floor((pageWidth - 56) / 290)));
    return (
      <View style={{ flex: 1 }}>
        <Header
          title="Notes"
          actions={
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <IconBtn icon="options-outline" label="Arrange notes" size={36} onPress={() => setOptions(true)} bg={t.surface} />
            </View>
          }>
          <RoleFilterBar value={who} onChange={setWho} />
          <Segments value={mode} onChange={setMode} options={[{ value: 'cards', label: 'Cards' }, { value: 'compact', label: 'Compact' }]} />
        </Header>
        <Page>
          {tags.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              <Chip label="All" active={!activeTag} onPress={() => setTag(null)} />
              {tags.map(([g, n]) => <Chip key={g} content label={`#${g}`} count={n} active={activeTag === g} onPress={() => setTag(activeTag === g ? null : g)} />)}
            </View>
          ) : null}
          <ErrorBanner text={error} />
          {loading ? <View style={{ marginTop: space.lg }}><Skeleton /></View> : null}
          {!loading && isEmpty ? <Empty icon="reader-outline" title="No notes yet" text="Decisions, standing instructions and facts from the chat are kept here." /> : null}
          {groups.map(([title, list]) => (
            <View key={title}>
              <SectionHeader title={title} count={list.length} />
              {mode === 'compact' ? (
                <Grid min={340} gap={space.sm}>{list.map((n) => <NoteCard key={n.id} item={n} compact onPin={() => togglePin(n)} />)}</Grid>
              ) : (
                <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
                  {noteColumns(list, columns).map((col, i) => (
                    <View key={i} style={{ flex: 1, minWidth: 0, gap: space.md }}>
                      {col.map((n) => <NoteCard key={n.id} item={n} onPin={() => togglePin(n)} />)}
                    </View>
                  ))}
                </View>
              )}
            </View>
          ))}
        </Page>
        <Sheet visible={options} onClose={() => setOptions(false)} title="Arrange notes">
          <OptionGroup label="View" value={mode} onChange={setMode} options={[{ value: 'cards', label: 'Cards', icon: 'grid-outline' }, { value: 'compact', label: 'Compact', icon: 'list-outline' }]} />
          <OptionGroup label="Group by" value={groupBy} onChange={setGroupBy} options={[{ value: 'none', label: 'Pinned first' }, { value: 'tag', label: 'Tag' }, { value: 'date', label: 'Date' }]} />
        </Sheet>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Header
        title="Notes"
        actions={
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <IconBtn icon="folder-open-outline" label="Projects" onPress={() => router.push('/projects')} bg={t.surface} />
            <IconBtn icon="options-outline" label="Arrange notes" onPress={() => setOptions(true)} bg={t.surface} />
            <GlobalActions />
          </View>
        }>
        <RoleFilterBar value={who} onChange={setWho} />
      </Header>
      <ScrollView
        contentContainerStyle={[styles.list, { paddingHorizontal: 0 }]}
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
        }>
        {tags.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.lg }}>
            <Chip label="All" active={!activeTag} onPress={() => setTag(null)} />
            {tags.map(([g, n]) => <Chip key={g} content label={`#${g}`} count={n} active={activeTag === g} onPress={() => setTag(activeTag === g ? null : g)} />)}
          </ScrollView>
        ) : null}
        <View style={{ paddingHorizontal: space.lg }}>
          <ErrorBanner text={error} />
          {loading ? <View style={{ marginTop: space.lg }}><Skeleton /></View> : null}
          {!loading && isEmpty ? <Empty icon="reader-outline" title="No notes yet" text="Decisions, standing instructions and facts from the chat are kept here." /> : null}
          {groups.map(([title, list]) => (
            <View key={title}>
              <SectionHeader title={title} count={list.length} />
              {mode === 'compact' ? (
                <View style={{ gap: space.sm }}>{list.map((n, k) => <Appear key={n.id} index={k}><NoteCard item={n} compact onPin={() => togglePin(n)} /></Appear>)}</View>
              ) : (
                <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'flex-start' }}>
                  {noteColumns(list).map((col, i) => (
                    <View key={i} style={{ flex: 1, gap: space.md }}>
                      {col.map((n, k) => <Appear key={n.id} index={k * 2 + i}><NoteCard item={n} onPin={() => togglePin(n)} /></Appear>)}
                    </View>
                  ))}
                </View>
              )}
            </View>
          ))}
        </View>
      </ScrollView>

      <Sheet visible={options} onClose={() => setOptions(false)} title="Arrange notes">
        <OptionGroup label="View" value={mode} onChange={setMode} options={[{ value: 'cards', label: 'Cards', icon: 'grid-outline' }, { value: 'compact', label: 'Compact', icon: 'list-outline' }]} />
        <OptionGroup label="Group by" value={groupBy} onChange={setGroupBy} options={[{ value: 'none', label: 'Pinned first' }, { value: 'tag', label: 'Tag' }, { value: 'date', label: 'Date' }]} />
      </Sheet>
    </View>
  );
}
