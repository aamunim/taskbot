import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useLocalSearchParams } from 'expo-router';
import { createElement, useEffect, useMemo, useState } from 'react';
import { Image, Platform, Pressable, ScrollView, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { openGallery } from '@/components/Gallery';
import { ExtBadge, FileName, SiteIcon } from '@/components/library';
import { Card, Chip, Empty, SectionHeader, Skeleton, Txt, styles, type IconName } from '@/components/ui';
import * as api from '@/lib/api';
import type { SharedFile, SharedLibrary, SharedLink } from '@/lib/api';
import { dayHeading, fileGroup, fileTitle, fmtDate, fmtDateTime, fmtDuration, fmtSize, splitUrl } from '@/lib/format';
import { content, noOutline, radius, space, useTheme } from '@/lib/theme';

// The boss's page: a read-only view of the files and links the boss sent, opened
// through a private link. No sign-in, nothing here can change anything.

type Section = 'photo' | 'document' | 'voice' | 'link';
const SECTIONS: { value: Section; label: string; icon: IconName }[] = [
  { value: 'photo', label: 'Photos', icon: 'image-outline' },
  { value: 'document', label: 'Documents', icon: 'document-text-outline' },
  { value: 'voice', label: 'Voice', icon: 'mic-outline' },
  { value: 'link', label: 'Links', icon: 'link-outline' },
];

/** Supabase serves the file as a download, under its real name, when asked to. */
const downloadUrl = (f: SharedFile) => (f.url ? `${f.url}&download=${encodeURIComponent(fileTitle(f))}` : null);
const open = (url: string) => void Linking.openURL(url);

function groupByDay<T extends { sent_at: string }>(rows: T[]): [string, T[]][] {
  const out = new Map<string, T[]>();
  for (const row of rows) out.set(dayHeading(row.sent_at), [...(out.get(dayHeading(row.sent_at)) ?? []), row]);
  return [...out.entries()];
}

function DownloadButton({ file, onImage }: { file: SharedFile; onImage?: boolean }) {
  const t = useTheme();
  // On a phone the label would squeeze the file name out; the icon alone is enough there.
  const compact = useWindowDimensions().width < 560;
  const url = downloadUrl(file);
  if (!url) return null;
  return (
    <Pressable
      onPress={() => open(url)}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={`Download ${fileTitle(file)}`}
      style={({ pressed }) => [
        onImage
          ? { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(15,12,40,0.6)', alignItems: 'center', justifyContent: 'center' }
          : { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: compact ? 10 : space.md, borderRadius: radius.pill, backgroundColor: t.primarySoft },
        pressed && styles.pressed,
      ]}>
      <Ionicons name="download-outline" size={onImage ? 17 : compact ? 20 : 16} color={onImage ? '#FFFFFF' : t.primary} />
      {onImage || compact ? null : <Txt variant="label" strong color={t.primary}>Download</Txt>}
    </Pressable>
  );
}

function FileRowView({ file, last }: { file: SharedFile; last: boolean }) {
  const t = useTheme();
  const meta = [file.size_bytes ? fmtSize(file.size_bytes) : null, fmtDateTime(file.sent_at)].filter(Boolean).join(' · ');
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, minHeight: 68 }, !last && { borderBottomWidth: 1, borderBottomColor: t.border }]}>
      <ExtBadge file={file} size={44} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <FileName name={fileTitle(file)} strong />
        <Txt variant="caption" sub numberOfLines={1}>{file.url ? meta : `Too large to keep a copy · ${fmtDate(file.sent_at)}`}</Txt>
        {file.caption ? <Txt variant="caption" content sub numberOfLines={1}>{file.caption}</Txt> : null}
      </View>
      {file.url ? (
        <Pressable onPress={() => open(file.url!)} hitSlop={8} accessibilityRole="button" accessibilityLabel={`Open ${fileTitle(file)}`} style={({ pressed }) => [{ padding: 8 }, pressed && styles.pressed]}>
          <Ionicons name="eye-outline" size={20} color={t.sub} />
        </Pressable>
      ) : null}
      <DownloadButton file={file} />
    </View>
  );
}

function VoiceRow({ file, last }: { file: SharedFile; last: boolean }) {
  const t = useTheme();
  return (
    <View style={[{ gap: space.sm, padding: space.md }, !last && { borderBottomWidth: 1, borderBottomColor: t.border }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="mic-outline" size={20} color={t.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Txt variant="body" strong>Voice message</Txt>
          <Txt variant="caption" sub>{[file.duration_seconds ? fmtDuration(file.duration_seconds) : null, fmtDateTime(file.sent_at)].filter(Boolean).join(' · ')}</Txt>
        </View>
        <DownloadButton file={file} />
      </View>
      {/* The browser's own player: this page is made for the web. */}
      {file.url && Platform.OS === 'web' ? createElement('audio', { src: file.url, controls: true, preload: 'none', style: { width: '100%', height: 40 } }) : null}
      {file.transcript ? <Txt variant="label" content sub>{file.transcript}</Txt> : null}
    </View>
  );
}

function LinkRowView({ link, last }: { link: SharedLink; last: boolean }) {
  const t = useTheme();
  const { host, rest } = splitUrl(link.url, link.domain);
  const said = link.said?.replace(link.url, '').replace(/\s+/g, ' ').trim();
  return (
    <Pressable
      onPress={() => open(link.url)}
      accessibilityRole="link"
      accessibilityLabel={`Open ${link.title ?? host}`}
      style={({ pressed }) => [
        { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, minHeight: 68 },
        !last && { borderBottomWidth: 1, borderBottomColor: t.border },
        pressed && { backgroundColor: t.surfaceAlt },
      ]}>
      <SiteIcon link={link} size={44} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt variant="body" content strong numberOfLines={1}>{link.title || said || `${host}${rest}`}</Txt>
        <Txt variant="caption" sub numberOfLines={1}>{host} · {fmtDate(link.sent_at)}</Txt>
        {link.title && said ? <Txt variant="caption" content sub numberOfLines={1}>{said}</Txt> : null}
      </View>
      <Ionicons name="open-outline" size={18} color={t.primary} />
    </Pressable>
  );
}

export default function SharedLibraryPage() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const { token } = useLocalSearchParams<{ token: string }>();
  const [data, setData] = useState<SharedLibrary | null>(null);
  const [error, setError] = useState<'invalid' | 'failed' | null>(null);
  const [section, setSection] = useState<Section>('photo');
  const [query, setQuery] = useState('');

  useEffect(() => {
    // Keep the private address out of the Referer header of every link opened from here.
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const meta = document.createElement('meta');
    meta.name = 'referrer';
    meta.content = 'no-referrer';
    const robots = document.createElement('meta');
    robots.name = 'robots';
    robots.content = 'noindex, nofollow';
    document.head.append(meta, robots);
    const title = document.title;
    document.title = 'Shared files';
    return () => {
      meta.remove();
      robots.remove();
      document.title = title;
    };
  }, []);

  useEffect(() => {
    let live = true;
    setData(null);
    setError(null);
    api.fetchShared(String(token ?? '')).then((res) => {
      if (!live) return;
      setData(res.data);
      setError(res.error);
      // Start on the first section that has something in it.
      const files = res.data?.files ?? [];
      const first = SECTIONS.find((s) => (s.value === 'link' ? (res.data?.links.length ?? 0) > 0 : files.some((f) => fileGroup(f) === s.value)));
      if (first) setSection(first.value);
    });
    return () => {
      live = false;
    };
  }, [token]);

  const q = query.trim().toLowerCase();
  const files = useMemo(
    () => (data?.files ?? []).filter((f) => !q || `${fileTitle(f)} ${f.caption ?? ''} ${f.transcript ?? ''}`.toLowerCase().includes(q)),
    [data, q],
  );
  const links = useMemo(
    () => (data?.links ?? []).filter((l) => !q || `${l.url} ${l.title ?? ''} ${l.said ?? ''}`.toLowerCase().includes(q)),
    [data, q],
  );
  const counts: Record<Section, number> = {
    photo: files.filter((f) => fileGroup(f) === 'photo').length,
    document: files.filter((f) => fileGroup(f) === 'document').length,
    voice: files.filter((f) => fileGroup(f) === 'voice').length,
    link: links.length,
  };
  const shown = files.filter((f) => fileGroup(f) === section);

  const pageWidth = Math.min(windowWidth, 1080);
  const inner = pageWidth - space.lg * 2;
  const columns = inner >= 900 ? 6 : inner >= 640 ? 4 : 3;
  const tile = Math.floor((inner - space.sm * (columns - 1)) / columns);
  const photos = shown.filter((f) => f.url);
  const openPhoto = (file: SharedFile) =>
    openGallery(
      photos.map((p) => ({ key: p.id, uri: p.url!, title: fileTitle(p), sender: data?.boss_name ?? null, role: 'boss' as const, date: fmtDateTime(p.sent_at) })),
      Math.max(0, photos.findIndex((p) => p.id === file.id)),
    );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ alignItems: 'center', paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + 64 }}>
      <View style={{ width: '100%', maxWidth: 1080, paddingHorizontal: space.lg, gap: space.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <Image source={require('../../../assets/icon.png')} style={{ width: 44, height: 44, borderRadius: 12 }} accessibilityIgnoresInvertColors />
          <View style={{ flex: 1 }}>
            <Txt variant="title">{data?.boss_name ? <>Files from <Txt variant="title" content>{data.boss_name}</Txt></> : 'Shared files'}</Txt>
            <Txt variant="label" sub>Everything you sent in the group, in one place. View only.</Txt>
          </View>
        </View>

        {error ? (
          <Card style={{ alignItems: 'center', gap: space.sm, paddingVertical: space.xxl }}>
            <Ionicons name={error === 'invalid' ? 'lock-closed-outline' : 'cloud-offline-outline'} size={36} color={t.sub} />
            <Txt variant="heading">{error === 'invalid' ? 'This link no longer works' : 'Could not load the files'}</Txt>
            <Txt variant="label" sub style={{ textAlign: 'center', maxWidth: 420 }}>
              {error === 'invalid' ? 'It may have been replaced or has expired. Ask for a new link.' : 'Check your connection and reload the page.'}
            </Txt>
          </Card>
        ) : !data ? (
          <Skeleton rows={4} height={72} />
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: t.surface, borderColor: t.border, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md }}>
              <Ionicons name="search-outline" size={18} color={t.faint} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search files and links"
                placeholderTextColor={t.faint}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="Search files and links"
                style={[{ flex: 1, color: t.text, fontFamily: content.regular, fontSize: 16, paddingVertical: 11 }, noOutline]}
              />
              {query ? <Ionicons name="close-circle" size={18} color={t.faint} onPress={() => setQuery('')} accessibilityLabel="Clear search" /> : null}
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm }}>
              {SECTIONS.map((s) => <Chip key={s.value} icon={s.icon} label={s.label} count={counts[s.value]} active={section === s.value} onPress={() => setSection(s.value)} />)}
            </ScrollView>

            {section === 'link' ? (
              links.length ? (
                groupByDay(links).map(([day, rows]) => (
                  <View key={day}>
                    <SectionHeader title={day} count={rows.length} />
                    <Card style={{ padding: 0, overflow: 'hidden' }}>{rows.map((l, i) => <LinkRowView key={l.id} link={l} last={i === rows.length - 1} />)}</Card>
                  </View>
                ))
              ) : (
                <Empty icon="link-outline" title={q ? 'No matching links' : 'No links yet'} />
              )
            ) : !shown.length ? (
              <Empty icon={SECTIONS.find((s) => s.value === section)!.icon} title={q ? 'Nothing matches' : 'Nothing here yet'} />
            ) : section === 'photo' ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm }}>
                {shown.map((f) => (
                  <Pressable
                    key={f.id}
                    onPress={f.url ? () => openPhoto(f) : undefined}
                    accessibilityRole="button"
                    accessibilityLabel={`View ${fileTitle(f)}, sent ${fmtDate(f.sent_at)}`}
                    style={({ pressed }) => [{ width: tile, height: tile, borderRadius: radius.md, overflow: 'hidden', backgroundColor: t.surfaceAlt, alignItems: 'center', justifyContent: 'center' }, pressed && styles.pressed]}>
                    {f.url ? <Image source={{ uri: f.url }} style={{ width: tile, height: tile }} resizeMode="cover" /> : <Txt variant="caption" sub style={{ textAlign: 'center', padding: 8 }}>Not kept</Txt>}
                    <View style={{ position: 'absolute', left: 6, bottom: 6, paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: 'rgba(15,12,40,0.6)' }}>
                      <Txt variant="caption" color="#FFFFFF">{fmtDate(f.sent_at)}</Txt>
                    </View>
                    <View style={{ position: 'absolute', right: 6, bottom: 6 }}><DownloadButton file={f} onImage /></View>
                  </Pressable>
                ))}
              </View>
            ) : (
              groupByDay(shown).map(([day, rows]) => (
                <View key={day}>
                  <SectionHeader title={day} count={rows.length} />
                  <Card style={{ padding: 0, overflow: 'hidden' }}>
                    {rows.map((f, i) => (section === 'voice' ? <VoiceRow key={f.id} file={f} last={i === rows.length - 1} /> : <FileRowView key={f.id} file={f} last={i === rows.length - 1} />))}
                  </Card>
                </View>
              ))
            )}
            <Txt variant="caption" sub style={{ textAlign: 'center', marginTop: space.lg }}>Download links stay valid for an hour. Reload the page if one stops working.</Txt>
          </>
        )}
      </View>
    </ScrollView>
  );
}
