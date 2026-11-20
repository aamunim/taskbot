import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { openItem } from '@/components/items';
import { Appear } from '@/components/motion';
import { Avatar, Empty, ErrorBanner, RoleFilterBar, Skeleton, TopBar, Txt, styles } from '@/components/ui';
import * as api from '@/lib/api';
import { useData } from '@/lib/data';
import { dayNumber, fileGroup, fmtDayLong, fmtTime, plural, todayNumber } from '@/lib/format';
import { usePref } from '@/lib/prefs';
import { matchesRole, roleColors } from '@/lib/roles';
import { radius, space, useTheme } from '@/lib/theme';
import type { RoleFilter, TimelineMessage } from '@/lib/types';

function dayTitle(day: number): string {
  const diff = day - todayNumber();
  if (diff === 0) return `Today · ${fmtDayLong(day)}`;
  if (diff === -1) return `Yesterday · ${fmtDayLong(day)}`;
  return fmtDayLong(day);
}

/** What was said, day by day: every saved message with the tasks and notes made from it. */
export default function Timeline() {
  const t = useTheme();
  const { role, config, version } = useData();
  const [messages, setMessages] = useState<TimelineMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [who, setWho] = usePref<RoleFilter>('role:timeline', 'all');

  const load = useCallback(async () => {
    const res = await api.fetchTimeline();
    setLoading(false);
    setError(res.error);
    if (!res.error) setMessages(res.data);
  }, []);
  useEffect(() => {
    load();
  }, [load, version]);

  const days = useMemo(() => {
    const out = new Map<number, TimelineMessage[]>();
    for (const m of messages) {
      if (!matchesRole(role(m.sender_tg_id), who)) continue;
      const d = dayNumber(m.sent_at);
      out.set(d, [...(out.get(d) ?? []), m]);
    }
    return [...out.entries()];
  }, [messages, role, who]);

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Timeline">
        <RoleFilterBar value={who} onChange={setWho} />
      </TopBar>
      <ScrollView
        contentContainerStyle={[styles.list, { paddingBottom: 48 }]}
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
        <ErrorBanner text={error} />
        {loading ? <Skeleton /> : null}
        {!loading && !days.length ? <Empty icon="time-outline" title="Nothing said yet" text="Every message from the group is kept here in order, with the tasks and notes made from it." /> : null}
        {days.map(([day, list], di) => (
          <Appear key={day} index={di}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: di ? space.xl : space.sm, marginBottom: space.md }}>
              <Txt variant="overline" sub>{dayTitle(day)}</Txt>
              <View style={{ flex: 1, height: 1, backgroundColor: t.border }} />
              <Txt variant="caption" color={t.faint}>{plural(list.length, 'message')}</Txt>
            </View>
            {list.map((m, i) => {
              const r = role(m.sender_tg_id);
              const c = roleColors(t, r);
              const body = m.text ?? m.transcript;
              const photos = m.files.filter((f) => fileGroup(f) === 'photo').length;
              const voice = m.files.some((f) => fileGroup(f) === 'voice');
              const docs = m.files.filter((f) => fileGroup(f) === 'document').length;
              const forwardedByMe = m.forwarded_by_tg_id != null && m.forwarded_by_tg_id === config?.owner_tg_id;
              return (
                <View key={m.id} style={{ flexDirection: 'row', gap: space.md }}>
                  <View style={{ alignItems: 'center', width: 30 }}>
                    <Avatar role={r} name={m.sender_name} size={30} />
                    {i < list.length - 1 ? <View style={{ flex: 1, width: 2, backgroundColor: t.border, marginVertical: 4 }} /> : null}
                  </View>
                  <View style={{ flex: 1, paddingBottom: i < list.length - 1 ? space.lg : 0, gap: 6 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm }}>
                      <Txt variant="label" content color={c.fg} strong numberOfLines={1} style={{ flexShrink: 1 }}>{m.sender_name ?? 'Unknown'}</Txt>
                      <Txt variant="caption" color={t.faint}>{fmtTime(m.sent_at)}</Txt>
                    </View>
                    {m.forwarded_by_tg_id != null || m.forwarded_by_name ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <Ionicons name="arrow-redo" size={12} color={t.sub} />
                        <Txt variant="caption" sub>
                          {forwardedByMe ? 'Forwarded by you' : <>Forwarded by <Txt variant="caption" content sub>{m.forwarded_by_name ?? 'someone'}</Txt></>}
                        </Txt>
                      </View>
                    ) : null}
                    {body ? (
                      <View style={{ backgroundColor: c.bg, borderRadius: radius.md, borderTopLeftRadius: 4, paddingVertical: space.sm, paddingHorizontal: space.md, alignSelf: 'flex-start', maxWidth: '100%' }}>
                        {m.transcript && !m.text ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                            <Ionicons name="mic" size={12} color={c.fg} />
                            <Txt variant="caption" color={c.fg}>Voice, transcribed</Txt>
                          </View>
                        ) : null}
                        <Txt content numberOfLines={5}>{body}</Txt>
                      </View>
                    ) : null}
                    {m.files.length ? (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md }}>
                        {photos ? <Attach icon="image-outline" label={plural(photos, 'photo')} /> : null}
                        {voice && m.text ? <Attach icon="mic-outline" label="Voice" /> : null}
                        {docs ? <Attach icon="document-text-outline" label={plural(docs, 'file')} /> : null}
                      </View>
                    ) : null}
                    {m.items.map((it) => (
                      <Pressable
                        key={it.id}
                        onPress={() => openItem(it.id)}
                        accessibilityRole="button"
                        style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: space.sm, alignSelf: 'flex-start', maxWidth: '100%', paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.pill, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface }, pressed && styles.pressed]}>
                        <Ionicons name={it.type === 'task' ? 'checkmark-circle-outline' : 'reader-outline'} size={14} color={t.primary} />
                        <Txt variant="caption" content color={t.primary} numberOfLines={1} style={{ flexShrink: 1 }}>{it.title}</Txt>
                        <Ionicons name="chevron-forward" size={12} color={t.primary} />
                      </Pressable>
                    ))}
                  </View>
                </View>
              );
            })}
          </Appear>
        ))}
      </ScrollView>
    </View>
  );
}

function Attach({ icon, label }: { icon: 'image-outline' | 'mic-outline' | 'document-text-outline'; label: string }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Ionicons name={icon} size={13} color={t.sub} />
      <Txt variant="caption" sub>{label}</Txt>
    </View>
  );
}
