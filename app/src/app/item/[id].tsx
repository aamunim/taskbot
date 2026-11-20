import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from 'react-native';
import { pickDateTime } from '@/lib/pick';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AudioPlayer } from '@/components/AudioPlayer';
import { Checklist } from '@/components/Checklist';
import { TagPill, statusFeedback } from '@/components/items';
import { AttachmentRow, LinkChip, openAttachment } from '@/components/library';
import { Appear } from '@/components/motion';
import { Avatar, Btn, Card, Chip, Empty, ErrorBanner, IconBtn, SectionHeader, Segments, Skeleton, Toggle, TopBar, Txt } from '@/components/ui';
import * as api from '@/lib/api';
import { useData } from '@/lib/data';
import { PRIORITY_LABEL, STATUSES, STATUS_LABEL, STATUS_SHORT, fileGroup, fmtDate, fmtDateTime, fmtTime, fromPickerDate, telegramLink, toPickerDate, waitingLabel } from '@/lib/format';
import { ROLE_LABEL, roleColors } from '@/lib/roles';
import { content, elevation, noOutline, radius, space, useTheme } from '@/lib/theme';
import type { Item, ItemEvent, ItemType, Message, Priority } from '@/lib/types';

type Draft = Pick<Item, 'title' | 'details' | 'type' | 'status' | 'priority' | 'due_at' | 'due_all_day' | 'user_note'>;
const FIELD_LABEL: Record<keyof Draft, string> = {
  title: 'Title',
  details: 'Details',
  type: 'Type',
  status: 'Status',
  priority: 'Priority',
  due_at: 'Deadline',
  due_all_day: 'Deadline',
  user_note: 'My note',
};
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
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { items, config, updateItem, role } = useData();
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
    api.fetchItem(id).then((data) => {
      if (data) setFetched(data);
      else setMissing(true);
    });
  }, [fromList, id]);

  // Start editing from the stored values; do not clobber unsaved edits on realtime refreshes.
  useEffect(() => {
    if (item && !draft) setDraft(draftOf(item));
  }, [item, draft]);

  const loadExtras = useCallback(async () => {
    if (!id) return;
    const res = await api.fetchItemExtras(id);
    if (res.error) setError(res.error);
    setMessages(res.data.messages);
    setEvents(res.data.events);
  }, [id]);

  useEffect(() => {
    loadExtras();
  }, [loadExtras, item?.updated_at]);

  const changed = useMemo(() => {
    if (!item || !draft) return [] as (keyof Draft)[];
    const base = draftOf(item);
    return (Object.keys(base) as (keyof Draft)[]).filter((k) => !same(base[k], draft[k]));
  }, [item, draft]);

  if (missing) {
    return (
      <View style={{ flex: 1 }}>
        <TopBar />
        <Empty icon="search-outline" title="Not found" text="This item no longer exists." />
      </View>
    );
  }
  if (!item || !draft) {
    return (
      <View style={{ flex: 1 }}>
        <TopBar />
        <View style={{ padding: space.lg }}><Skeleton height={120} rows={3} /></View>
      </View>
    );
  }

  const r = role(item.source_sender_tg_id);
  const rc = roleColors(t, r);
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });

  const pick = (mode: 'date' | 'time') => {
    pickDateTime({
      value: toPickerDate(draft.due_at),
      mode,
      onChange: (date) => {
        if (mode === 'date') {
          if (draft.due_all_day || !draft.due_at) date.setHours(23, 59, 0, 0);
          set({ due_at: fromPickerDate(date), due_all_day: draft.due_at ? draft.due_all_day : true });
        } else {
          set({ due_at: fromPickerDate(date), due_all_day: false });
        }
      },
    });
  };

  const setAllDay = (on: boolean) => {
    if (!draft.due_at) return;
    const d = toPickerDate(draft.due_at);
    if (on) d.setHours(23, 59, 0, 0);
    else d.setHours(18, 0, 0, 0);
    set({ due_at: fromPickerDate(d), due_all_day: on });
  };

  const save = async () => {
    if (!draft.title.trim()) return setError('The title cannot be empty.');
    setSaving(true);
    setError(null);
    const patch: Partial<Item> = {};
    for (const k of changed) Object.assign(patch, { [k]: k === 'title' ? draft.title.trim() : draft[k] });
    const labels = [...new Set(changed.map((k) => FIELD_LABEL[k]))];
    if (patch.status) statusFeedback(patch.status);
    const ok = await updateItem(item.id, patch, `You changed: ${labels.join(', ')}`);
    setSaving(false);
    if (!ok) return setError('Could not save. Please try again.');
    if (fetched) setFetched({ ...fetched, ...patch });
    setDraft({ ...draft, title: draft.title.trim() });
    loadExtras();
  };

  const setDismissed = async (dismissed: boolean) => {
    const ok = await updateItem(item.id, { dismissed }, dismissed ? 'Dismissed' : 'Restored');
    if (ok && dismissed) router.back();
    else if (ok && fetched) setFetched({ ...fetched, dismissed });
  };

  const input = { color: t.text, fontFamily: content.regular, fontSize: 16 * t.scale, lineHeight: 24 * t.scale, padding: 0, ...noOutline } as const;
  const typeOptions: { value: ItemType; label: string }[] = [{ value: 'task', label: 'Task' }, { value: 'note', label: 'Note' }];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <TopBar
        title={draft.type === 'task' ? 'Task' : 'Note'}
        right={!item.dismissed ? <IconBtn icon="trash-outline" label="Dismiss this item" onPress={() => setDismissed(true)} bg={t.surface} color={t.danger} /> : undefined}
      />
      <ScrollView contentContainerStyle={{ paddingBottom: changed.length ? 140 : 48 }} keyboardShouldPersistTaps="handled">
        <Appear style={{ paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.md }} distance={18}>
        <ErrorBanner text={error} />

        {item.needs_review ? (
          <Card flat style={{ backgroundColor: t.bossSoft, borderColor: 'transparent', gap: space.md }}>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Ionicons name="help-buoy" size={20} color={t.boss} />
              <Txt variant="label" color={t.boss} style={{ flex: 1 }}>The AI was not sure about this one. Confirm it if it looks right, or edit it below.</Txt>
            </View>
            <Btn small icon="checkmark" label="Looks right" onPress={() => updateItem(item.id, { needs_review: false }, 'Reviewed and confirmed')} style={{ alignSelf: 'flex-start' }} />
          </Card>
        ) : null}
        {item.dismissed ? (
          <Card flat style={{ backgroundColor: t.surfaceAlt, borderColor: 'transparent', flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <Txt variant="label" sub style={{ flex: 1 }}>This item was dismissed.</Txt>
            <Btn small kind="soft" label="Restore" onPress={() => setDismissed(false)} />
          </Card>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: 2 }}>
          <Avatar role={r} name={item.source_sender_name} size={40} />
          <View style={{ flex: 1 }}>
            <Txt variant="label" color={rc.fg} strong>{r === 'boss' ? 'From boss' : r === 'me' ? 'From me' : `From ${ROLE_LABEL.other.toLowerCase()}`}</Txt>
            <Txt variant="caption" sub numberOfLines={1}>
              <Txt variant="caption" content sub>{item.source_sender_name ?? 'Unknown'}</Txt> · {fmtDateTime(item.created_at)}
            </Txt>
          </View>
          {item.pinned ? <Ionicons name="bookmark" size={18} color={t.primary} /> : null}
        </View>

        <Card style={{ gap: space.md, borderLeftWidth: 4, borderLeftColor: rc.solid }}>
          <TextInput value={draft.title} onChangeText={(title) => set({ title })} multiline placeholder="Title" placeholderTextColor={t.faint} style={[input, { fontFamily: content.semibold, fontSize: 21 * t.scale, lineHeight: 31 * t.scale }]} />
          <View style={{ height: 1, backgroundColor: t.border }} />
          <TextInput value={draft.details ?? ''} onChangeText={(details) => set({ details: details || null })} multiline placeholder="Add details" placeholderTextColor={t.faint} style={[input, { minHeight: 48, textAlignVertical: 'top' }]} />
          {item.tags.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {item.tags.map((g) => <TagPill key={g} tag={g} />)}
            </View>
          ) : null}
        </Card>

        <Card style={{ gap: space.lg }}>
          <Field label="Type">
            <Segments options={typeOptions} value={draft.type} onChange={(type) => set({ type })} />
          </Field>
          {draft.type === 'task' ? (
            <>
              <Field label="Status">
                <Segments options={STATUSES.map((s) => ({ value: s, label: STATUS_SHORT[s] }))} value={draft.status} onChange={(status) => set({ status })} />
                {draft.status === 'waiting' ? (
                  <View style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start' }}>
                    <Ionicons name="hourglass-outline" size={14} color={t.faint} style={{ marginTop: 2 }} />
                    <Txt variant="caption" sub style={{ flex: 1 }}>
                      {STATUS_LABEL.waiting}: you have delivered this and need a reply.{item.status === 'waiting' ? ` Sent, ${waitingLabel(item.waiting_since)}.` : ''}
                    </Txt>
                  </View>
                ) : null}
              </Field>
              <Field label="Priority">
                <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
                  {PRIORITIES.map((p) => <Chip key={p} label={PRIORITY_LABEL[p]} active={draft.priority === p} onPress={() => set({ priority: p })} />)}
                </View>
              </Field>
              <Field label="Deadline">
                <View style={{ flexDirection: 'row', gap: space.sm, flexWrap: 'wrap' }}>
                  <Btn small kind="soft" icon="calendar-outline" label={draft.due_at ? fmtDate(draft.due_at) : 'Set a date'} onPress={() => pick('date')} />
                  {draft.due_at && !draft.due_all_day ? <Btn small kind="soft" icon="time-outline" label={fmtTime(draft.due_at)} onPress={() => pick('time')} /> : null}
                  {draft.due_at ? <Btn small kind="danger" icon="close" label="Clear" onPress={() => set({ due_at: null, due_all_day: false })} /> : null}
                </View>
                {draft.due_at ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: space.sm }}>
                    <Txt variant="label" sub style={{ flex: 1 }}>All day, no set time</Txt>
                    <Toggle label="All day" value={draft.due_all_day} onChange={setAllDay} />
                  </View>
                ) : null}
                {item.due_text ? (
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: space.sm, alignItems: 'flex-start' }}>
                    <Ionicons name="chatbubble-ellipses-outline" size={14} color={t.faint} style={{ marginTop: 3 }} />
                    <Txt variant="caption" sub style={{ flex: 1 }}>As written: <Txt variant="caption" content sub>“{item.due_text}”</Txt></Txt>
                  </View>
                ) : null}
              </Field>
            </>
          ) : null}
        </Card>

        {draft.type === 'task' ? <Checklist itemId={item.id} /> : null}

        <Card style={{ gap: space.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="lock-closed" size={13} color={t.faint} />
            <Txt variant="overline" sub>My private note</Txt>
          </View>
          <TextInput value={draft.user_note ?? ''} onChangeText={(v) => set({ user_note: v || null })} multiline placeholder="Only you can see this" placeholderTextColor={t.faint} style={[input, { minHeight: 44, textAlignVertical: 'top' }]} />
        </Card>

        <View>
          <SectionHeader title={messages.length > 1 ? 'Original messages' : 'Original message'} />
          {!messages.length ? <Txt variant="label" sub style={{ paddingHorizontal: 2 }}>No message is linked to this item.</Txt> : null}
          <View style={{ gap: space.md }}>
            {messages.map((m) => {
              const link = telegramLink(m.chat_id, m.tg_message_id);
              const mr = role(m.sender_tg_id);
              const mc = roleColors(t, mr);
              return (
                <Card key={m.id} style={{ gap: space.md, backgroundColor: mc.bg, borderColor: 'transparent' }} flat>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
                    <Avatar role={mr} name={m.sender_name} size={26} solid />
                    <Txt variant="label" content color={mc.fg} strong style={{ flex: 1 }} numberOfLines={1}>{m.sender_name ?? 'Unknown'}</Txt>
                    <Txt variant="caption" color={mc.fg}>{fmtDateTime(m.sent_at)}{m.edited_at ? ' · edited' : ''}</Txt>
                  </View>
                  {m.forwarded_by_tg_id != null || m.forwarded_by_name ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="arrow-redo" size={13} color={mc.fg} />
                      <Txt variant="caption" color={mc.fg}>
                        {m.forwarded_by_tg_id != null && m.forwarded_by_tg_id === config?.owner_tg_id ? 'Forwarded by you' : <>Forwarded by <Txt variant="caption" content color={mc.fg}>{m.forwarded_by_name ?? 'someone'}</Txt></>}
                      </Txt>
                    </View>
                  ) : null}
                  {m.text ? <Txt content selectable>{m.text}</Txt> : null}
                  {(() => {
                    // The first voice file carries the transcript; later files (rare) play without it.
                    let transcriptShown = false;
                    const rows = m.files.map((f) => {
                      if (fileGroup(f) === 'voice' && f.status === 'stored' && f.storage_path) {
                        const withText = !transcriptShown;
                        transcriptShown = true;
                        return (
                          <View key={f.id} style={{ backgroundColor: t.surface, borderRadius: radius.md, padding: space.md }}>
                            <AudioPlayer storagePath={f.storage_path} duration={f.duration_seconds} words={withText ? m.transcript_words : null} transcript={withText ? m.transcript : null} />
                          </View>
                        );
                      }
                      return <AttachmentRow key={f.id} file={f} onOpen={() => openAttachment(f, { sender: m.sender_name, role: mr, sentAt: m.sent_at })} />;
                    });
                    return (
                      <>
                        {rows}
                        {m.transcript && !transcriptShown ? (
                          <View style={{ gap: 2 }}>
                            <Txt variant="caption" color={mc.fg}>Transcribed from voice, may contain mistakes</Txt>
                            <Txt content selectable>{m.transcript}</Txt>
                          </View>
                        ) : null}
                      </>
                    );
                  })()}
                  {m.links.map((l) => <LinkChip key={l.id} link={l} />)}
                  {link ? <Btn small kind="inverse" icon="paper-plane" label="Open in Telegram" onPress={() => Linking.openURL(link)} style={{ alignSelf: 'flex-start' }} /> : null}
                </Card>
              );
            })}
          </View>
        </View>

        {events.length ? (
          <View>
            <SectionHeader title="History" />
            <Card style={{ gap: 0 }}>
              {events.map((e, i) => (
                <View key={e.id} style={{ flexDirection: 'row', gap: space.md }}>
                  <View style={{ alignItems: 'center', width: 12 }}>
                    <View style={{ width: 10, height: 10, borderRadius: 5, marginTop: 6, backgroundColor: e.actor === 'ai' ? t.primary : t.meSolid }} />
                    {i < events.length - 1 ? <View style={{ flex: 1, width: 2, backgroundColor: t.border, marginVertical: 2 }} /> : null}
                  </View>
                  <View style={{ flex: 1, paddingBottom: i < events.length - 1 ? space.md : 0 }}>
                    <Txt variant="label" content>{e.summary}</Txt>
                    <Txt variant="caption" sub>{e.actor === 'ai' ? 'Bot' : 'You'} · {fmtDateTime(e.created_at)}</Txt>
                  </View>
                </View>
              ))}
            </Card>
          </View>
        ) : null}
        </Appear>
      </ScrollView>

      {changed.length ? (
        <View style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: space.md, padding: space.lg, paddingBottom: insets.bottom + space.lg, backgroundColor: t.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderWidth: 1, borderColor: t.border }, elevation(t, 2)]}>
          <Btn kind="ghost" label="Discard" onPress={() => setDraft(draftOf(item))} disabled={saving} />
          <Btn icon="checkmark" label={saving ? 'Saving…' : 'Save changes'} onPress={save} disabled={saving} style={{ flex: 1 }} />
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ gap: space.sm }}>
      <Txt variant="overline" sub>{label}</Txt>
      {children}
    </View>
  );
}
