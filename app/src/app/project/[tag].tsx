import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { openGallery } from '@/components/Gallery';
import { NoteCard, TaskCard } from '@/components/items';
import { FileListRow, LinkRow, VoiceCard } from '@/components/library';
import { Appear } from '@/components/motion';
import { Card, Empty, ErrorBanner, RoleFilterBar, SectionHeader, Skeleton, TopBar, Txt, styles } from '@/components/ui';
import * as api from '@/lib/api';
import { useData } from '@/lib/data';
import { PRIORITY_RANK, STATUS_LABEL, fileGroup, fileTitle, fmtDateTime, plural } from '@/lib/format';
import { usePref } from '@/lib/prefs';
import { matchesRole } from '@/lib/roles';
import { space } from '@/lib/theme';
import type { Item, LibFile, LibLink, RoleFilter, Status } from '@/lib/types';

const byDue = (a: Item, b: Item) => (a.due_at ?? '9999').localeCompare(b.due_at ?? '9999') || PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];

/** Everything that carries one tag: its tasks, notes, files and links together. */
export default function Project() {
  const { tag } = useLocalSearchParams<{ tag: string }>();
  const { items, loading, updateItem, role, version } = useData();
  const [files, setFiles] = useState<LibFile[]>([]);
  const [links, setLinks] = useState<LibLink[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [who, setWho] = usePref<RoleFilter>('role:project', 'all');

  const mine = useMemo(() => items.filter((i) => !i.needs_review && i.tags.includes(tag ?? '') && matchesRole(role(i.source_sender_tg_id), who)), [items, tag, role, who]);
  const ids = useMemo(() => new Set(items.filter((i) => i.tags.includes(tag ?? '')).map((i) => i.id)), [items, tag]);

  const load = useCallback(async () => {
    const res = await api.fetchLibrary();
    setError(res.error);
    if (res.error) return;
    setFiles(res.data.files);
    setLinks(res.data.links);
    const paths = res.data.files.filter((f) => fileGroup(f) === 'photo' && f.status === 'stored' && f.storage_path).map((f) => f.storage_path!);
    setThumbs(await api.signedUrls(paths));
  }, []);
  useEffect(() => {
    load();
  }, [load, version]);

  const open = mine.filter((i) => i.type === 'task' && i.status !== 'done').sort(byDue);
  const done = mine.filter((i) => i.type === 'task' && i.status === 'done').sort((a, b) => (b.completed_at ?? '').localeCompare(a.completed_at ?? ''));
  const notes = mine.filter((i) => i.type === 'note').sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.created_at.localeCompare(a.created_at));
  const inProject = <T extends { item_id: string | null; sender_tg_id: number | null }>(x: T) => !!x.item_id && ids.has(x.item_id) && matchesRole(role(x.sender_tg_id), who);
  const myFiles = files.filter(inProject);
  const myLinks = links.filter(inProject);
  const voices = myFiles.filter((f) => fileGroup(f) === 'voice');
  const others = myFiles.filter((f) => fileGroup(f) !== 'voice');
  const photos = others.filter((f) => fileGroup(f) === 'photo' && f.storage_path && thumbs[f.storage_path]);

  const change = (i: Item) => (to: Status) => updateItem(i.id, { status: to }, `Status changed to ${STATUS_LABEL[to]}`);
  const star = async (table: 'files' | 'links', id: string, starred: boolean) => {
    if (table === 'files') setFiles((l) => l.map((x) => (x.id === id ? { ...x, starred } : x)));
    else setLinks((l) => l.map((x) => (x.id === id ? { ...x, starred } : x)));
    const err = await api.setStar(table, id, starred);
    if (err) setError(err);
  };
  const openPhoto = (f: LibFile) =>
    openGallery(
      photos.map((p) => ({ key: p.id, uri: thumbs[p.storage_path!], title: fileTitle(p), sender: p.sender_name, role: role(p.sender_tg_id), date: fmtDateTime(p.sent_at) })),
      Math.max(0, photos.findIndex((p) => p.id === f.id)),
    );
  const empty = !mine.length && !myFiles.length && !myLinks.length;

  return (
    <View style={{ flex: 1 }}>
      <TopBar title={`#${tag ?? ''}`}>
        <RoleFilterBar value={who} onChange={setWho} />
      </TopBar>
      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: 48 }]}>
        <ErrorBanner text={error} />
        {loading ? <Skeleton /> : null}
        {!loading && empty ? <Empty icon="folder-open-outline" title="Nothing here" text={who === 'all' ? 'No tasks or notes carry this tag any more.' : 'Nothing in this project matches the filter.'} /> : null}
        {!empty ? (
          <Txt variant="label" sub style={{ paddingHorizontal: 2 }}>
            {[open.length ? `${open.length} open` : null, done.length ? `${done.length} done` : null, notes.length ? plural(notes.length, 'note') : null, myFiles.length ? plural(myFiles.length, 'file') : null, myLinks.length ? plural(myLinks.length, 'link') : null].filter(Boolean).join(' · ')}
          </Txt>
        ) : null}

        {open.length ? <SectionHeader title="Open tasks" count={open.length} /> : null}
        <View style={{ gap: space.md }}>{open.map((i, k) => <Appear key={i.id} index={k}><TaskCard item={i} onStatus={change(i)} /></Appear>)}</View>

        {notes.length ? <SectionHeader title="Notes" count={notes.length} /> : null}
        <View style={{ gap: space.sm }}>{notes.map((i) => <NoteCard key={i.id} item={i} compact />)}</View>

        {others.length ? <SectionHeader title="Files" count={others.length} /> : null}
        <View style={{ gap: space.sm }}>
          {others.map((f) => {
            const thumb = f.storage_path ? thumbs[f.storage_path] : undefined;
            return <FileListRow key={f.id} file={f} thumb={fileGroup(f) === 'photo' ? thumb : undefined} onStar={() => star('files', f.id, !f.starred)} onOpen={fileGroup(f) === 'photo' && thumb ? () => openPhoto(f) : undefined} />;
          })}
        </View>

        {voices.length ? <SectionHeader title="Voice" count={voices.length} /> : null}
        <View style={{ gap: space.md }}>{voices.map((f) => <VoiceCard key={f.id} file={f} onStar={() => star('files', f.id, !f.starred)} />)}</View>

        {myLinks.length ? <SectionHeader title="Links" count={myLinks.length} /> : null}
        {myLinks.length ? (
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            {myLinks.map((l, i) => <LinkRow key={l.id} link={l} onStar={() => star('links', l.id, !l.starred)} last={i === myLinks.length - 1} />)}
          </Card>
        ) : null}

        {done.length ? <SectionHeader title="Completed" count={done.length} /> : null}
        <View style={{ gap: space.md }}>{done.map((i) => <TaskCard key={i.id} item={i} onStatus={change(i)} />)}</View>
      </ScrollView>
    </View>
  );
}
