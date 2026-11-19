import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, Switch, TextInput, View } from 'react-native';
import { AudioPlayer } from '@/components/AudioPlayer';
import { FileLine } from '@/components/FileList';
import { Btn, Card, Chip, Empty, ErrorBanner, SectionTitle, Txt, styles } from '@/components/ui';
import { useItems } from '@/lib/data';
import {
  PRIORITY_LABEL,
  STATUS_LABEL,
  fileGroup,
  fmtDate,
  fmtDateTime,
  fmtTime,
  fromPickerDate,
  telegramLink,
  toPickerDate,
} from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import type { Item, ItemEvent, Message, Priority, Status } from '@/lib/types';

type Draft = Pick<Item, 'title' | 'details' | 'type' | 'status' | 'priority' | 'due_at' | 'due_all_day' | 'user_note'>;
const FIELD_LABEL: Record<keyof Draft, string> = {
  title: 'শিরোনাম',
  details: 'বিবরণ',
  type: 'ধরন',
  status: 'স্ট্যাটাস',
  priority: 'অগ্রাধিকার',
  due_at: 'ডেডলাইন',
  due_all_day: 'ডেডলাইন',
  user_note: 'আমার মন্তব্য',
};
const STATUSES: Status[] = ['todo', 'doing', 'done'];
const PRIORITIES: Priority[] = ['low', 'normal', 'high', 'urgent'];

const draftOf = (i: Item): Draft => ({
  title: i.title,
  details: i.details,
  type: i.type,
  status: i.status,
  priority: i.priority,
  due_at: i.due_at,
  due_all_day: i.due_all_day,
  user_note: i.user_note,
});
const same = (a: unknown, b: unknown) => (a ?? '') === (b ?? '');

export default function ItemDetail() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { items, updateItem } = useItems();
  const fromList = items.find((i) => i.id === id);
  const [fetched, setFetched] = useState<Item | null>(null);
  const [missing, setMissing] = useState(false);
  const item = fromList ?? fetched;

  const [draft, setDraft] = useState<Draft | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [events, setEvents] = useState<ItemEvent[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dismissed items are not in the shared list (e.g. opened from search).
  useEffect(() => {
    if (fromList || !id) return;
    supabase
      .from('items')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setFetched({ ...(data as Omit<Item, 'has_files'>), has_files: false });
        else setMissing(true);
      });
  }, [fromList, id]);

  // Start editing from the stored values; do not clobber unsaved edits on realtime refreshes.
  useEffect(() => {
    if (item && !draft) setDraft(draftOf(item));
  }, [item, draft]);

  const loadExtras = useCallback(async () => {
    if (!id) return;
    const [m, e] = await Promise.all([
      supabase
        .from('item_messages')
        .select('messages(id,chat_id,tg_message_id,sender_name,sent_at,edited_at,kind,text,transcript,files(id,message_id,kind,file_name,mime_type,size_bytes,duration_seconds,storage_path,status,created_at))')
        .eq('item_id', id)
        .overrideTypes<{ messages: Message | null }[], { merge: false }>(),
      supabase.from('item_events').select('id,item_id,actor,summary,created_at').eq('item_id', id).order('created_at', { ascending: false }).limit(50),
    ]);
    if (m.error) setError(m.error.message);
    setMessages(
      (m.data ?? [])
        .map((r) => r.messages)
        .filter((x): x is Message => !!x)
        .sort((a, b) => a.sent_at.localeCompare(b.sent_at)),
    );
    setEvents((e.data ?? []) as ItemEvent[]);
  }, [id]);

  useEffect(() => {
    loadExtras();
  }, [loadExtras, item?.updated_at]);

  const changed = useMemo(() => {
    if (!item || !draft) return [] as (keyof Draft)[];
    const base = draftOf(item);
    return (Object.keys(base) as (keyof Draft)[]).filter((k) => !same(base[k], draft[k]));
  }, [item, draft]);

  if (missing) return <Empty text="আইটেমটি পাওয়া যায়নি।" />;
  if (!item || !draft) return <Empty text="" loading />;

  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const inputStyle = { color: t.text, backgroundColor: t.card, borderColor: t.border, borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 15, lineHeight: 22 };

  const pick = (mode: 'date' | 'time') =>
    DateTimePickerAndroid.open({
      value: toPickerDate(draft.due_at),
      mode,
      is24Hour: false,
      onValueChange: (_event, date) => {
        if (mode === 'date') {
          if (draft.due_all_day || !draft.due_at) date.setHours(23, 59, 0, 0);
          set({ due_at: fromPickerDate(date), due_all_day: draft.due_at ? draft.due_all_day : true });
        } else {
          set({ due_at: fromPickerDate(date), due_all_day: false });
        }
      },
    });

  const setAllDay = (on: boolean) => {
    if (!draft.due_at) return;
    const d = toPickerDate(draft.due_at);
    if (on) d.setHours(23, 59, 0, 0);
    else d.setHours(18, 0, 0, 0);
    set({ due_at: fromPickerDate(d), due_all_day: on });
  };

  const save = async () => {
    if (!draft.title.trim()) return setError('শিরোনাম খালি রাখা যাবে না।');
    setSaving(true);
    setError(null);
    const patch: Partial<Item> = {};
    for (const k of changed) Object.assign(patch, { [k]: k === 'title' ? draft.title.trim() : draft[k] });
    const labels = [...new Set(changed.map((k) => FIELD_LABEL[k]))];
    const ok = await updateItem(item.id, patch, `আপনি পরিবর্তন করেছেন: ${labels.join(', ')}`);
    setSaving(false);
    if (!ok) return setError('সংরক্ষণ করা যায়নি। আবার চেষ্টা করুন।');
    if (fetched) setFetched({ ...fetched, ...patch });
    setDraft({ ...draft, title: draft.title.trim() });
    loadExtras();
  };

  const setDismissed = async (dismissed: boolean) => {
    const ok = await updateItem(item.id, { dismissed }, dismissed ? 'বাদ দেওয়া হয়েছে' : 'ফিরিয়ে আনা হয়েছে');
    if (ok && dismissed) router.back();
    else if (ok && fetched) setFetched({ ...fetched, dismissed });
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding" keyboardVerticalOffset={90}>
      <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
        <ErrorBanner text={error} />
        {item.needs_review ? (
          <Card style={{ borderColor: t.warn }}>
            <Txt size={13} color={t.warn}>AI এটি নিয়ে নিশ্চিত নয়। ঠিক থাকলে নিশ্চিত করুন, নইলে নিচে সম্পাদনা করুন।</Txt>
            <View style={{ alignItems: 'flex-start', marginTop: 8 }}>
              <Btn small label="ঠিক আছে, নিশ্চিত করুন" onPress={() => updateItem(item.id, { needs_review: false }, 'যাচাই করে নিশ্চিত করা হয়েছে')} />
            </View>
          </Card>
        ) : null}
        {item.dismissed ? (
          <Card>
            <Txt sub size={13}>এই আইটেমটি বাদ দেওয়া হয়েছে।</Txt>
            <View style={{ alignItems: 'flex-start', marginTop: 8 }}>
              <Btn small kind="plain" label="ফিরিয়ে আনুন" onPress={() => setDismissed(false)} />
            </View>
          </Card>
        ) : null}

        <TextInput value={draft.title} onChangeText={(title) => set({ title })} multiline placeholder="শিরোনাম" placeholderTextColor={t.sub} style={[inputStyle, { fontSize: 18, fontWeight: '600', lineHeight: 26 }]} />
        <TextInput value={draft.details ?? ''} onChangeText={(details) => set({ details: details || null })} multiline placeholder="বিবরণ" placeholderTextColor={t.sub} style={[inputStyle, { marginTop: 10, minHeight: 80, textAlignVertical: 'top' }]} />

        <SectionTitle>ধরন</SectionTitle>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Chip label="কাজ" active={draft.type === 'task'} onPress={() => set({ type: 'task' })} />
          <Chip label="নোট" active={draft.type === 'note'} onPress={() => set({ type: 'note' })} />
        </View>

        {draft.type === 'task' ? (
          <>
            <SectionTitle>স্ট্যাটাস</SectionTitle>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {STATUSES.map((s) => <Chip key={s} label={STATUS_LABEL[s]} active={draft.status === s} onPress={() => set({ status: s })} />)}
            </View>

            <SectionTitle>অগ্রাধিকার</SectionTitle>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              {PRIORITIES.map((p) => <Chip key={p} label={PRIORITY_LABEL[p]} active={draft.priority === p} onPress={() => set({ priority: p })} />)}
            </View>

            <SectionTitle>ডেডলাইন</SectionTitle>
            <Card>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                <Btn small kind="plain" icon="calendar-outline" label={draft.due_at ? fmtDate(draft.due_at) : 'তারিখ দিন'} onPress={() => pick('date')} />
                {draft.due_at && !draft.due_all_day ? <Btn small kind="plain" icon="time-outline" label={fmtTime(draft.due_at)} onPress={() => pick('time')} /> : null}
                {draft.due_at ? <Btn small kind="danger" label="মুছুন" onPress={() => set({ due_at: null, due_all_day: false })} /> : null}
              </View>
              {draft.due_at ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
                  <Txt size={14}>নির্দিষ্ট সময় ছাড়া (সারাদিন)</Txt>
                  <Switch value={draft.due_all_day} onValueChange={setAllDay} />
                </View>
              ) : null}
              {item.due_text ? <Txt size={12} sub style={{ marginTop: 6 }}>বসের ভাষায়: "{item.due_text}"</Txt> : null}
            </Card>
          </>
        ) : null}

        <SectionTitle>আমার মন্তব্য</SectionTitle>
        <TextInput value={draft.user_note ?? ''} onChangeText={(v) => set({ user_note: v || null })} multiline placeholder="নিজের জন্য নোট লিখুন (বস দেখবেন না)" placeholderTextColor={t.sub} style={[inputStyle, { minHeight: 60, textAlignVertical: 'top' }]} />

        {item.tags.length ? (
          <View style={[styles.meta, { marginTop: 12, marginHorizontal: 4 }]}>
            {item.tags.map((g) => <Txt key={g} size={13} color={t.primary}>#{g}</Txt>)}
          </View>
        ) : null}

        {changed.length ? (
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
            <View style={{ flex: 1 }}><Btn label={saving ? 'সংরক্ষণ হচ্ছে…' : 'সংরক্ষণ করুন'} onPress={save} disabled={saving} /></View>
            <Btn kind="plain" label="বাতিল" onPress={() => setDraft(draftOf(item))} disabled={saving} />
          </View>
        ) : null}

        <SectionTitle>বসের মূল মেসেজ</SectionTitle>
        {!messages.length ? <Txt sub size={13} style={{ marginHorizontal: 4 }}>কোনো মেসেজ যুক্ত নেই।</Txt> : null}
        {messages.map((m) => {
          const link = telegramLink(m.chat_id, m.tg_message_id);
          return (
            <Card key={m.id}>
              <Txt size={12} sub>
                {m.sender_name ?? 'অজানা'} · {fmtDateTime(m.sent_at)}{m.edited_at ? ' · সম্পাদিত' : ''}
              </Txt>
              {m.text ? <Txt selectable style={{ marginTop: 6 }}>{m.text}</Txt> : null}
              {m.files.map((f) =>
                fileGroup(f) === 'voice' && f.status === 'stored' && f.storage_path ? (
                  <View key={f.id} style={{ marginTop: 8 }}>
                    <AudioPlayer storagePath={f.storage_path} duration={f.duration_seconds} />
                  </View>
                ) : (
                  <FileLine key={f.id} file={f} />
                ),
              )}
              {m.transcript ? (
                <View style={{ marginTop: 8, paddingLeft: 10, borderLeftWidth: 3, borderLeftColor: t.border }}>
                  <Txt size={12} sub>ভয়েস থেকে লেখা (ভুল থাকতে পারে)</Txt>
                  <Txt selectable>{m.transcript}</Txt>
                </View>
              ) : null}
              {link ? (
                <View style={{ alignItems: 'flex-start', marginTop: 10 }}>
                  <Btn small kind="plain" icon="paper-plane-outline" label="Telegram-এ দেখুন" onPress={() => Linking.openURL(link)} />
                </View>
              ) : null}
            </Card>
          );
        })}

        {events.length ? <SectionTitle>পরিবর্তনের ইতিহাস</SectionTitle> : null}
        {events.map((e) => (
          <View key={e.id} style={{ marginHorizontal: 4, marginBottom: 8 }}>
            <Txt size={14}>{e.summary}</Txt>
            <Txt size={12} sub>{e.actor === 'ai' ? 'বট' : 'আপনি'} · {fmtDateTime(e.created_at)}</Txt>
          </View>
        ))}

        {!item.dismissed ? (
          <View style={{ marginTop: 20, alignItems: 'flex-start' }}>
            <Btn small kind="danger" icon="trash-outline" label="এই আইটেম বাদ দিন" onPress={() => setDismissed(true)} />
          </View>
        ) : null}
        <Txt size={12} sub style={{ marginTop: 8, marginHorizontal: 4 }}>তৈরি: {fmtDateTime(item.created_at)}</Txt>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
