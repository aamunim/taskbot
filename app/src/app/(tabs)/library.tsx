import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View, useWindowDimensions } from 'react-native';
import { DocTile, FileListRow, LinkCard, LinkTile, PhotoTile, VoiceCard } from '@/components/library';
import { Chip, Empty, ErrorBanner, GlobalActions, Header, IconBtn, OptionGroup, RoleFilterBar, SectionHeader, Sheet, Skeleton, styles, type IconName } from '@/components/ui';
import * as api from '@/lib/api';
import { useData } from '@/lib/data';
import { dayHeading, fileExt, fileGroup, fileTitle, splitUrl } from '@/lib/format';
import { usePref } from '@/lib/prefs';
import { ROLE_LABEL, matchesRole } from '@/lib/roles';
import { space, useTheme } from '@/lib/theme';
import type { LibFile, LibLink, RoleFilter } from '@/lib/types';

type Section = 'photo' | 'document' | 'voice' | 'link';
type ViewMode = 'grid' | 'list';
type Sort = 'new' | 'old' | 'name';
type GroupBy = 'none' | 'date' | 'sender' | 'type';
type Entry = { key: string; name: string; type: string; starred: boolean } & ({ file: LibFile; link?: undefined } | { link: LibLink; file?: undefined });

const SECTIONS: { value: Section; label: string; icon: IconName }[] = [
  { value: 'photo', label: 'Photos', icon: 'image-outline' },
  { value: 'document', label: 'Documents', icon: 'document-text-outline' },
  { value: 'voice', label: 'Voice', icon: 'mic-outline' },
  { value: 'link', label: 'Links', icon: 'link-outline' },
];
const EMPTY: Record<Section, { icon: IconName; title: string }> = {
  photo: { icon: 'image-outline', title: 'No photos here' },
  document: { icon: 'document-text-outline', title: 'No documents here' },
  voice: { icon: 'mic-outline', title: 'No voice messages here' },
  link: { icon: 'link-outline', title: 'No links here' },
};

export default function Library() {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const { role, version } = useData();
  const [files, setFiles] = useState<LibFile[]>([]);
  const [links, setLinks] = useState<LibLink[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState(false);

  const [section, setSection] = usePref<Section>('lib:section', 'photo');
  const [who, setWho] = usePref<RoleFilter>('role:library', 'all');
  const [mode, setMode] = usePref<ViewMode>('lib:view', 'grid');
  const [sort, setSort] = usePref<Sort>('lib:sort', 'new');
  const [groupBy, setGroupBy] = usePref<GroupBy>('lib:group', 'none');
  const [starFirst, setStarFirst] = usePref<'on' | 'off'>('lib:starred', 'on');

  const load = useCallback(async () => {
    const res = await api.fetchLibrary();
    setLoading(false);
    setError(res.error);
    if (res.error) return;
    setFiles(res.data.files);
    setLinks(res.data.links);
    const paths = res.data.files
      .filter((f) => fileGroup(f) === 'photo' && f.status === 'stored' && f.storage_path)
      .slice(0, 120)
      .map((f) => f.storage_path!);
    setThumbs(await api.signedUrls(paths));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  useEffect(() => {
    if (version > 0) load();
  }, [version, load]);

  const star = async (table: 'files' | 'links', id: string, starred: boolean) => {
    const patch = <T extends { id: string; starred: boolean }>(rows: T[]) => rows.map((r) => (r.id === id ? { ...r, starred } : r));
    if (table === 'files') setFiles(patch);
    else setLinks(patch);
    const err = await api.setStar(table, id, starred);
    if (err) {
      setError(err);
      load();
    }
  };

  const visibleFiles = useMemo(() => files.filter((f) => matchesRole(role(f.sender_tg_id), who)), [files, role, who]);
  const visibleLinks = useMemo(() => links.filter((l) => matchesRole(role(l.sender_tg_id), who)), [links, role, who]);
  const counts: Record<Section, number> = useMemo(
    () => ({
      photo: visibleFiles.filter((f) => fileGroup(f) === 'photo').length,
      document: visibleFiles.filter((f) => fileGroup(f) === 'document').length,
      voice: visibleFiles.filter((f) => fileGroup(f) === 'voice').length,
      link: visibleLinks.length,
    }),
    [visibleFiles, visibleLinks],
  );

  const groups = useMemo(() => {
    const entries: Entry[] =
      section === 'link'
        ? visibleLinks.map((link) => ({ key: link.id, link, name: splitUrl(link.url, link.domain).host, type: splitUrl(link.url, link.domain).host, starred: link.starred }))
        : visibleFiles.filter((f) => fileGroup(f) === section).map((file) => ({ key: file.id, file, name: fileTitle(file), type: section === 'voice' ? 'Voice' : fileExt(file), starred: file.starred }));
    const at = (e: Entry) => (e.file ?? e.link).sent_at;
    entries.sort((a, b) => {
      if (starFirst === 'on' && a.starred !== b.starred) return a.starred ? -1 : 1;
      if (sort === 'name') return a.name.localeCompare(b.name);
      return sort === 'new' ? at(b).localeCompare(at(a)) : at(a).localeCompare(at(b));
    });
    const out = new Map<string, Entry[]>();
    for (const e of entries) {
      const src = e.file ?? e.link;
      const r = role(src.sender_tg_id);
      const key =
        groupBy === 'date' ? dayHeading(src.sent_at) : groupBy === 'sender' ? (r === 'other' ? (src.sender_name ?? ROLE_LABEL.other) : r === 'boss' ? 'From boss' : 'From me') : groupBy === 'type' ? e.type : '';
      out.set(key, [...(out.get(key) ?? []), e]);
    }
    return [...out.entries()];
  }, [section, visibleFiles, visibleLinks, sort, groupBy, starFirst, role]);

  const contentWidth = width - space.lg * 2;
  const photoSize = Math.floor((contentWidth - space.sm * 2) / 3);
  const tileWidth = Math.floor((contentWidth - space.md) / 2);
  const grid = mode === 'grid' && section !== 'voice';

  const renderEntry = (e: Entry) => {
    if (e.link) {
      const onStar = () => star('links', e.link.id, !e.link.starred);
      return grid ? <LinkTile key={e.key} link={e.link} onStar={onStar} width={tileWidth} /> : <LinkCard key={e.key} link={e.link} onStar={onStar} />;
    }
    const f = e.file;
    const onStar = () => star('files', f.id, !f.starred);
    const thumb = f.storage_path ? thumbs[f.storage_path] : undefined;
    if (section === 'voice') return <VoiceCard key={e.key} file={f} onStar={onStar} />;
    if (!grid) return <FileListRow key={e.key} file={f} thumb={section === 'photo' ? thumb : undefined} onStar={onStar} />;
    return section === 'photo' ? <PhotoTile key={e.key} file={f} thumb={thumb} onStar={onStar} size={photoSize} /> : <DocTile key={e.key} file={f} onStar={onStar} width={tileWidth} />;
  };

  return (
    <View style={{ flex: 1 }}>
      <Header
        title="Library"
        actions={
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <IconBtn icon="options-outline" label="Arrange library" onPress={() => setOptions(true)} bg={t.surface} />
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
              await load();
              setRefreshing(false);
            }}
          />
        }>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingHorizontal: space.lg }}>
          {SECTIONS.map((s) => <Chip key={s.value} icon={s.icon} label={s.label} count={counts[s.value]} active={section === s.value} onPress={() => setSection(s.value)} />)}
        </ScrollView>
        <View style={{ paddingHorizontal: space.lg, paddingTop: groupBy === 'none' ? space.lg : 0 }}>
          <ErrorBanner text={error} />
          {loading ? <Skeleton /> : null}
          {!loading && !groups.length ? <Empty icon={EMPTY[section].icon} title={EMPTY[section].title} text="Files and links shared in the group are collected here automatically." /> : null}
          {groups.map(([title, list]) => (
            <View key={title || 'all'}>
              {title ? <SectionHeader title={title} count={list.length} /> : null}
              <View style={grid ? { flexDirection: 'row', flexWrap: 'wrap', gap: section === 'photo' ? space.sm : space.md } : { gap: space.md }}>
                {list.map(renderEntry)}
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      <Sheet visible={options} onClose={() => setOptions(false)} title="Arrange library">
        <OptionGroup label="View" value={mode} onChange={setMode} options={[{ value: 'grid', label: 'Grid', icon: 'grid-outline' }, { value: 'list', label: 'List', icon: 'list-outline' }]} />
        <OptionGroup label="Sort" value={sort} onChange={setSort} options={[{ value: 'new', label: 'Newest' }, { value: 'old', label: 'Oldest' }, { value: 'name', label: 'Name' }]} />
        <OptionGroup label="Group by" value={groupBy} onChange={setGroupBy} options={[{ value: 'none', label: 'None' }, { value: 'date', label: 'Date' }, { value: 'sender', label: 'Sender' }, { value: 'type', label: 'Type' }]} />
        <OptionGroup label="Starred" value={starFirst} onChange={setStarFirst} options={[{ value: 'on', label: 'Starred first', icon: 'star' }, { value: 'off', label: 'Mixed in' }]} />
      </Sheet>
    </View>
  );
}
