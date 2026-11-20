import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View, type TextInputProps } from 'react-native';
import { pickDateTime } from '@/lib/pick';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AudioPlayer } from './AudioPlayer';
import { Checklist } from '@/components/Checklist';
import { TagPill, statusFeedback } from '@/components/items';
import { AttachmentRow, LinkChip, openAttachment } from '@/components/library';
import { Appear } from '@/components/motion';
import { Avatar, Btn, Card, Chip, Empty, ErrorBanner, IconBtn, SectionHeader, Segments, Skeleton, Toggle, TopBar, Txt } from '@/components/ui';
import * as api from '@/lib/api';
import { useData } from '@/lib/data';
import { PRIORITY_LABEL, STATUSES, STATUS_LABEL, STATUS_SHORT, dayNumber, fileGroup, fmtDate, fmtDateTime, fmtDayLong, fmtTime, fromPickerDate, telegramLink, todayNumber, toPickerDate, waitingLabel } from '@/lib/format';
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

type Mode = 'screen' | 'pane' | 'page';

/**
 * A task or note with everything attached to it.
 * - `screen`: the phone screen.
 * - `pane`: the desktop side pane beside a list (`onClose` closes it).
 * - `page`: the desktop full page (a direct link), in two columns.
 */
export function ItemDetailView({ id, mode = 'screen', onClose }: { id: string; mode?: Mode; onClose?: () => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
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

  const paneHead = (title: string, actions?: ReactNode) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.sm }}>
      <Txt variant="heading" style={{ flex: 1 }}>{title}</Txt>
      {actions}
      <IconBtn icon="close" label="Close (Esc)" size={36} onPress={() => onClose?.()} bg={t.surfaceAlt} />
    </View>
  );
  if (missing) {
    return (
      <View style={{ flex: 1 }}>
        {mode === 'pane' ? paneHead('Not found') : <TopBar />}
        <Empty icon="search-outline" title="Not found" text="This item no longer exists." />
      </View>
    );
  }
  if (!item || !draft) {
    return (
      <View style={{ flex: 1 }}>
        {mode === 'pane' ? paneHead('') : <TopBar />}
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
    if (ok && dismissed) {
      if (onClose) onClose();
      else if (router.canGoBack()) router.back();
      else router.replace('/');
    }
    else if (ok && fetched) setFetched({ ...fetched, dismissed });
  };

  const input = { color: t.text, fontFamily: content.regular, fontSize: 16 * t.scale, lineHeight: 24 * t.scale, padding: 0, ...noOutline } as const;
  const typeOptions: { value: ItemType; label: string }[] = [{ value: 'task', label: 'Task' }, { value: 'note', label: 'Note' }];

  const editor = (
    <>
        <ErrorBanner text={error} />

        {item.needs_review ? (
          <Card flat style={{ backgroundColor: t.bossSoft, borderColor: 'transparent', gap: space.md }}>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              <Ionicons name="help-buoy-outline" size={20} color={t.boss} />
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
          <GrowInput value={draft.title} onChangeText={(title) => set({ title })} placeholder="Title" placeholderTextColor={t.faint} style={[input, { fontFamily: content.semibold, fontSize: 21 * t.scale, lineHeight: 31 * t.scale }]} />
          <View style={{ height: 1, backgroundColor: t.border }} />
          <GrowInput value={draft.details ?? ''} onChangeText={(details) => set({ details: details || null })} placeholder="Add details" placeholderTextColor={t.faint} style={[input, { minHeight: 48, textAlignVertical: 'top' }]} />
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
            <Ionicons name="lock-closed-outline" size={13} color={t.faint} />
            <Txt variant="overline" sub>My private note</Txt>
          </View>
          <GrowInput value={draft.user_note ?? ''} onChangeText={(v) => set({ user_note: v || null })} placeholder="Only you can see this" placeholderTextColor={t.faint} style={[input, { minHeight: 44, textAlignVertical: 'top' }]} />
        </Card>
    </>
  );
  // One stream, oldest first: what was said about this item and what happened to it.
  type Entry = { key: string; at: string; message?: Message; event?: ItemEvent };
  const stream: Entry[] = [
    ...messages.map((m) => ({ key: `m-${m.id}`, at: m.sent_at, message: m })),
    ...events.map((e) => ({ key: `e-${e.id}`, at: e.created_at, event: e })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const bubble = (m: Message) => {
    const link = telegramLink(m.chat_id, m.tg_message_id);
    const mr = role(m.sender_tg_id);
    const mc = roleColors(t, mr);
    const mine = mr === 'me';
    // The first voice file carries the transcript; later files (rare) play without it.
    let transcriptShown = false;
    const attachments = m.files.map((f) => {
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
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.sm, justifyContent: mine ? 'flex-end' : 'flex-start' }}>
        {mine ? null : <Avatar role={mr} name={m.sender_name} size={28} solid />}
        <View style={{ maxWidth: '86%', flexShrink: 1, gap: space.sm, paddingVertical: space.md, paddingHorizontal: space.md + 2, backgroundColor: mc.bg, borderRadius: radius.lg, borderBottomLeftRadius: mine ? radius.lg : 6, borderBottomRightRadius: mine ? 6 : radius.lg }}>
          {mine ? null : <Txt variant="caption" content color={mc.fg} strong numberOfLines={1}>{m.sender_name ?? 'Unknown'}</Txt>}
          {m.forwarded_by_tg_id != null || m.forwarded_by_name ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="arrow-redo-outline" size={13} color={mc.fg} />
              <Txt variant="caption" color={mc.fg}>
                {m.forwarded_by_tg_id != null && m.forwarded_by_tg_id === config?.owner_tg_id ? 'Forwarded by you' : <>Forwarded by <Txt variant="caption" content color={mc.fg}>{m.forwarded_by_name ?? 'someone'}</Txt></>}
              </Txt>
            </View>
          ) : null}
          {m.text ? <Txt content selectable>{m.text}</Txt> : null}
          {attachments}
          {m.transcript && !transcriptShown ? (
            <View style={{ gap: 2 }}>
              <Txt variant="caption" color={mc.fg}>Transcribed from voice, may contain mistakes</Txt>
              <Txt content selectable>{m.transcript}</Txt>
            </View>
          ) : null}
          {m.links.map((l) => <LinkChip key={l.id} link={l} />)}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, justifyContent: mine ? 'flex-end' : 'flex-start' }}>
            <Txt variant="caption" color={mc.fg} style={{ opacity: 0.85 }}>{fmtTime(m.sent_at)}{m.edited_at ? ' · edited' : ''}</Txt>
            {link ? (
              <Pressable onPress={() => Linking.openURL(link)} hitSlop={8} accessibilityRole="link" accessibilityLabel="Open in Telegram" style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 4 }, pressed && { opacity: 0.6 }]}>
                <Ionicons name="paper-plane-outline" size={12} color={mc.fg} />
                <Txt variant="caption" color={mc.fg} strong>Telegram</Txt>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    );
  };

  const context = (
    <View>
      <SectionHeader title="Conversation" count={messages.length || undefined} />
      {!stream.length ? <Txt variant="label" sub style={{ paddingHorizontal: 2 }}>No message is linked to this item.</Txt> : null}
      <View style={{ gap: space.md }}>
        {stream.map((e, i) => {
          const newDay = i === 0 || dayNumber(stream[i - 1].at) !== dayNumber(e.at);
          return (
            <View key={e.key} style={{ gap: space.md }}>
              {newDay ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: i ? space.sm : 0 }}>
                  <View style={{ flex: 1, height: 1, backgroundColor: t.border }} />
                  <Txt variant="caption" sub strong>{dayNumber(e.at) === todayNumber() ? 'Today' : fmtDayLong(dayNumber(e.at))}</Txt>
                  <View style={{ flex: 1, height: 1, backgroundColor: t.border }} />
                </View>
              ) : null}
              {e.message ? bubble(e.message) : null}
              {e.event ? (
                <View style={{ alignSelf: 'center', maxWidth: '92%', flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 5, paddingHorizontal: space.md, borderRadius: radius.pill, backgroundColor: t.surfaceAlt }}>
                  <Ionicons name={e.event.actor === 'ai' ? 'sparkles-outline' : 'person-outline'} size={12} color={t.sub} />
                  <Txt variant="caption" sub numberOfLines={2} style={{ flexShrink: 1 }}>
                    <Txt variant="caption" content sub strong>{e.event.summary}</Txt> · {e.event.actor === 'ai' ? 'Bot' : 'You'} · {fmtTime(e.event.created_at)}
                  </Txt>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    </View>
  );
  const title = draft.type === 'task' ? 'Task' : 'Note';
  const trash = !item.dismissed ? <IconBtn icon="trash-outline" label="Dismiss this item" size={mode === 'screen' ? 40 : 36} onPress={() => setDismissed(true)} bg={mode === 'pane' ? t.surfaceAlt : t.surface} color={t.danger} /> : undefined;
  const buttons = (
    <>
      <Btn kind="ghost" label="Discard" onPress={() => setDraft(draftOf(item))} disabled={saving} />
      <Btn icon="checkmark" label={saving ? 'Saving…' : 'Save changes'} onPress={save} disabled={saving} style={mode === 'screen' ? { flex: 1 } : { minWidth: 200 }} />
    </>
  );
  // Desktop: the save bar is a footer of the pane or page, not a floating sheet.
  const footer = changed.length ? (
    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: space.md, paddingVertical: space.md, paddingHorizontal: mode === 'page' ? space.xxl : space.lg, backgroundColor: t.surface, borderTopWidth: 1, borderTopColor: t.border }}>{buttons}</View>
  ) : null;

  if (mode === 'pane') {
    return (
      <View style={{ flex: 1 }}>
        {paneHead(title, trash)}
        <ScrollView contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.md }} keyboardShouldPersistTaps="handled">
          {editor}
          {context}
        </ScrollView>
        {footer}
      </View>
    );
  }
  if (mode === 'page') {
    return (
      <View style={{ flex: 1 }}>
        <TopBar title={title} right={trash} />
        <ScrollView contentContainerStyle={{ paddingHorizontal: space.xxl, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.xxl, width: '100%', maxWidth: 1400, alignSelf: 'center' }}>
            <View style={{ flex: 1.1, minWidth: 0, gap: space.md }}>{editor}</View>
            <View style={{ flex: 1, minWidth: 0, gap: space.md }}>{context}</View>
          </View>
        </ScrollView>
        {footer}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <TopBar title={title} right={trash} />
      <ScrollView contentContainerStyle={{ paddingBottom: changed.length ? 140 : 48 }} keyboardShouldPersistTaps="handled">
        <Appear style={{ paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.md }} distance={18}>
          {editor}
          {context}
        </Appear>
      </ScrollView>

      {changed.length ? (
        <View style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', gap: space.md, padding: space.lg, paddingBottom: insets.bottom + space.lg, backgroundColor: t.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, borderWidth: 1, borderColor: t.border }, elevation(t, 2)]}>
          {buttons}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

/**
 * Multi-line field that is as tall as its text. Native inputs do this on their own;
 * a browser textarea needs its height set from the measured content.
 */
function GrowInput({ style, ...rest }: TextInputProps) {
  const [height, setHeight] = useState<number | undefined>(undefined);
  if (Platform.OS !== 'web') return <TextInput multiline style={style} {...rest} />;
  return (
    <TextInput
      multiline
      {...({ rows: 1 } as object)}
      onContentSizeChange={(e) => setHeight(Math.ceil(e.nativeEvent.contentSize.height))}
      style={[style, height ? { height, minHeight: undefined } : null]}
      {...rest}
    />
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
