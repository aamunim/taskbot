import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, View, useWindowDimensions } from 'react-native';
import { AudioPlayer } from '@/components/AudioPlayer';
import { FileLine, openFile } from '@/components/FileList';
import { Btn, Card, Empty, ErrorBanner, Segments, Txt, styles } from '@/components/ui';
import { fileGroup, fileStatusText, fmtDateTime, type FileGroup } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import type { FileRow } from '@/lib/types';

type Row = FileRow & {
  messages: { sender_name: string | null; sent_at: string; item_messages: { item_id: string }[] } | null;
};

const GROUPS: { value: FileGroup; label: string }[] = [
  { value: 'photo', label: 'ছবি' },
  { value: 'document', label: 'ডকুমেন্ট' },
  { value: 'voice', label: 'ভয়েস' },
];

export default function Files() {
  const t = useTheme();
  const { width } = useWindowDimensions();
  const [rows, setRows] = useState<Row[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [group, setGroup] = useState<FileGroup>('photo');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('files')
      .select('id,message_id,kind,file_name,mime_type,size_bytes,duration_seconds,storage_path,status,created_at,messages(sender_name,sent_at,item_messages(item_id))')
      .order('created_at', { ascending: false })
      .limit(300)
      .overrideTypes<Row[], { merge: false }>();
    setLoading(false);
    if (err) return setError(err.message);
    setError(null);
    setRows(data ?? []);
    const paths = (data ?? [])
      .filter((f) => fileGroup(f) === 'photo' && f.status === 'stored' && f.storage_path)
      .slice(0, 90)
      .map((f) => f.storage_path!);
    if (paths.length) {
      const signed = await supabase.storage.from('files').createSignedUrls(paths, 3600);
      const map: Record<string, string> = {};
      for (const s of signed.data ?? []) if (s.path && s.signedUrl) map[s.path] = s.signedUrl;
      setThumbs(map);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const list = useMemo(() => rows.filter((f) => fileGroup(f) === group), [rows, group]);
  const itemOf = (f: Row) => f.messages?.item_messages[0]?.item_id ?? null;
  const caption = (f: Row) => [f.messages?.sender_name, fmtDateTime(f.messages?.sent_at ?? f.created_at)].filter(Boolean).join(' · ');
  const cell = Math.floor((width - 28 - 12) / 3);

  return (
    <ScrollView
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }>
      <ErrorBanner text={error} />
      <Segments options={GROUPS} value={group} onChange={setGroup} />
      {!list.length ? <Empty loading={loading} text="এই ভাগে কোনো ফাইল নেই।" /> : null}

      {group === 'photo' ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {list.map((f) => {
            const uri = f.storage_path ? thumbs[f.storage_path] : undefined;
            return (
              <Pressable
                key={f.id}
                onPress={() => openFile(f)}
                onLongPress={() => {
                  const id = itemOf(f);
                  if (id) router.push({ pathname: '/item/[id]', params: { id } });
                }}
                style={{ width: cell, height: cell, borderRadius: 10, overflow: 'hidden', backgroundColor: t.chip, alignItems: 'center', justifyContent: 'center' }}>
                {uri ? (
                  <Image source={{ uri }} style={{ width: cell, height: cell }} resizeMode="cover" />
                ) : (
                  <Txt size={11} sub style={{ textAlign: 'center', padding: 6 }}>{fileStatusText(f) ?? 'ছবি'}</Txt>
                )}
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {group === 'photo' && list.length ? (
        <Txt size={12} sub style={{ marginTop: 10, textAlign: 'center' }}>ছবিতে চাপলে খুলবে, চেপে ধরলে সংশ্লিষ্ট কাজ বা নোট দেখাবে।</Txt>
      ) : null}

      {group !== 'photo'
        ? list.map((f) => {
            const id = itemOf(f);
            return (
              <Card key={f.id}>
                {group === 'voice' && f.status === 'stored' && f.storage_path ? (
                  <>
                    <Txt size={12} sub style={{ marginBottom: 6 }}>{caption(f)}</Txt>
                    <AudioPlayer lazy storagePath={f.storage_path} duration={f.duration_seconds} />
                  </>
                ) : (
                  <FileLine file={f} caption={caption(f)} />
                )}
                {id ? (
                  <View style={{ alignItems: 'flex-start', marginTop: 8 }}>
                    <Btn small kind="plain" label="সংশ্লিষ্ট কাজ/নোট দেখুন" onPress={() => router.push({ pathname: '/item/[id]', params: { id } })} />
                  </View>
                ) : null}
              </Card>
            );
          })
        : null}
    </ScrollView>
  );
}
