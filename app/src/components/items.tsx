import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useData } from '@/lib/data';
import { PRIORITY_LABEL, STATUS_LABEL, dueLabel, fmtDate, isOverdue } from '@/lib/format';
import { roleColors } from '@/lib/roles';
import { radius, space, useTheme } from '@/lib/theme';
import type { Item, Priority, Status } from '@/lib/types';
import { Card, Pill, RoleBadge, Txt, styles } from './ui';

export const openItem = (id: string) => router.push({ pathname: '/item/[id]', params: { id } });

export function DuePill({ item }: { item: Pick<Item, 'due_at' | 'due_all_day' | 'status'> }) {
  const t = useTheme();
  const label = dueLabel(item);
  if (!label) return null;
  const late = isOverdue(item);
  return late ? (
    <Pill icon="alert-circle" label={`Overdue · ${label}`} fg={t.danger} bg={t.dangerSoft} />
  ) : (
    <Pill icon="calendar-outline" label={label} fg={t.sub} bg={t.surfaceAlt} />
  );
}

export function PriorityPill({ priority }: { priority: Priority }) {
  const t = useTheme();
  if (priority === 'normal') return null;
  if (priority === 'urgent') return <Pill icon="flame" label={PRIORITY_LABEL.urgent} fg="#FFFFFF" bg={t.dangerSolid} />;
  if (priority === 'high') return <Pill icon="arrow-up" label={PRIORITY_LABEL.high} fg={t.danger} bg={t.dangerSoft} />;
  return <Pill icon="arrow-down" label={PRIORITY_LABEL.low} fg={t.sub} bg={t.surfaceAlt} />;
}

function StatusRing({ status, onPress }: { status: Status; onPress?: () => void }) {
  const t = useTheme();
  const ring =
    status === 'done' ? (
      <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: t.success, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="checkmark" size={17} color={t.dark ? '#0E0D1A' : '#FFFFFF'} />
      </View>
    ) : (
      <View style={{ width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: status === 'doing' ? t.primary : t.faint, alignItems: 'center', justifyContent: 'center' }}>
        {status === 'doing' ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.primary }} /> : null}
      </View>
    );
  if (!onPress) return ring;
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityRole="button" accessibilityLabel={status === 'done' ? 'Reopen task' : 'Mark as done'} style={({ pressed }) => pressed && styles.pressed}>
      {ring}
    </Pressable>
  );
}

/** Left edge coloured by who the item came from. */
function RoleBar({ item }: { item: Item }) {
  const t = useTheme();
  const { role } = useData();
  return <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: roleColors(t, role(item.source_sender_tg_id)).solid }} />;
}

/** A task row. `onStatus` enables the quick status controls. */
export function TaskCard({ item, onStatus }: { item: Item; onStatus?: (to: Status) => void }) {
  const t = useTheme();
  const { role } = useData();
  const done = item.status === 'done';
  const next: { to: Status; label: string; icon: 'play' | 'pause' } | null =
    item.status === 'todo' ? { to: 'doing', label: 'Start', icon: 'play' } : item.status === 'doing' ? { to: 'todo', label: 'Pause', icon: 'pause' } : null;
  return (
    <Card onPress={() => openItem(item.id)} style={{ overflow: 'hidden', paddingLeft: space.lg + 2 }}>
      <RoleBar item={item} />
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <View style={{ paddingTop: 1 }}>
          <StatusRing status={item.status} onPress={onStatus ? () => onStatus(done ? 'todo' : 'done') : undefined} />
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <Txt content strong numberOfLines={3} style={done ? { textDecorationLine: 'line-through', color: t.faint } : undefined}>{item.title}</Txt>
          {item.details && !done ? <Txt variant="label" content sub numberOfLines={1}>{item.details}</Txt> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            <DuePill item={item} />
            <PriorityPill priority={item.priority} />
            {!onStatus && item.status === 'doing' ? <Pill label={STATUS_LABEL.doing} fg={t.primary} bg={t.primarySoft} /> : null}
            {item.needs_review ? <Pill icon="help-circle" label="Needs review" fg={t.boss} bg={t.bossSoft} /> : null}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: 2 }}>
            <View style={{ flex: 1 }}>
              <RoleBadge role={role(item.source_sender_tg_id)} name={item.source_sender_name} />
            </View>
            {item.has_files ? <Ionicons name="attach" size={17} color={t.faint} accessibilityLabel="Has attachments" /> : null}
            {onStatus && next ? (
              <Pressable
                onPress={() => onStatus(next.to)}
                hitSlop={8}
                accessibilityRole="button"
                style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 5, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: t.primarySoft }, pressed && styles.pressed]}>
                <Ionicons name={next.icon} size={12} color={t.primary} />
                <Txt variant="caption" color={t.primary} strong>{next.label}</Txt>
              </Pressable>
            ) : null}
          </View>
        </View>
      </View>
    </Card>
  );
}

function Tags({ tags, max = 3 }: { tags: string[]; max?: number }) {
  const t = useTheme();
  if (!tags.length) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {tags.slice(0, max).map((g) => <Pill key={g} content label={`#${g}`} fg={t.primary} bg={t.primarySoft} />)}
    </View>
  );
}

function PinButton({ pinned, onPress }: { pinned: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityRole="button" accessibilityLabel={pinned ? 'Unpin' : 'Pin'} style={({ pressed }) => pressed && styles.pressed}>
      <Ionicons name={pinned ? 'bookmark' : 'bookmark-outline'} size={18} color={pinned ? t.primary : t.faint} />
    </Pressable>
  );
}

/** A note as a tile (two-column wall) or as a compact one-line row. */
export function NoteCard({ item, compact, onPin }: { item: Item; compact?: boolean; onPin?: () => void }) {
  const t = useTheme();
  const { role } = useData();
  const r = role(item.source_sender_tg_id);
  if (compact) {
    return (
      <Card onPress={() => openItem(item.id)} style={{ overflow: 'hidden', paddingVertical: space.md, paddingLeft: space.lg + 2 }}>
        <RoleBar item={item} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt content strong numberOfLines={1}>{item.title}</Txt>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <RoleBadge role={r} compact />
              <Txt variant="caption" sub>{fmtDate(item.created_at)}</Txt>
              {item.tags[0] ? <Txt variant="caption" content color={t.primary}>#{item.tags[0]}</Txt> : null}
            </View>
          </View>
          {onPin ? <PinButton pinned={item.pinned} onPress={onPin} /> : null}
        </View>
      </Card>
    );
  }
  return (
    <Card onPress={() => openItem(item.id)} style={{ gap: space.sm, padding: space.md + 2, borderTopWidth: 3, borderTopColor: roleColors(t, r).solid }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}><RoleBadge role={r} compact /></View>
        {onPin ? <PinButton pinned={item.pinned} onPress={onPin} /> : null}
      </View>
      <Txt content strong numberOfLines={5}>{item.title}</Txt>
      {item.details ? <Txt variant="label" content sub numberOfLines={4}>{item.details}</Txt> : null}
      <Tags tags={item.tags} max={2} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Txt variant="caption" sub style={{ flex: 1 }}>{fmtDate(item.created_at)}</Txt>
        {item.has_files ? <Ionicons name="attach" size={14} color={t.faint} /> : null}
      </View>
    </Card>
  );
}

/** Splits children into two columns, always adding to the shorter one. */
export function noteColumns(notes: Item[]): [Item[], Item[]] {
  const cols: [Item[], Item[]] = [[], []];
  const height = [0, 0];
  for (const n of notes) {
    const weight = 90 + Math.min(n.title.length, 110) * 0.9 + Math.min(n.details?.length ?? 0, 120) * 0.5 + (n.tags.length ? 28 : 0);
    const col = height[0] <= height[1] ? 0 : 1;
    cols[col].push(n);
    height[col] += weight;
  }
  return cols;
}
