import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, View } from 'react-native';
import { useData } from '@/lib/data';
import { PRIORITY_LABEL, STATUS_LABEL, dueLabel, fmtDate, isOverdue, waitingLabel } from '@/lib/format';
import { bump, success, tap } from '@/lib/haptics';
import { roleColors } from '@/lib/roles';
import { radius, space, useTheme } from '@/lib/theme';
import type { Item, Priority, Status } from '@/lib/types';
import { reduceMotionNow } from './motion';
import { Card, Pill, RoleBadge, Txt, styles, type IconName } from './ui';

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

/**
 * The round status control. Completing a task plays a short tick: the ring pops
 * and a soft halo expands and fades. Skipped when reduced motion is on.
 */
export function StatusRing({ status, onPress, size = 26 }: { status: Status; onPress?: () => void; size?: number }) {
  const t = useTheme();
  const pop = useRef(new Animated.Value(1)).current;
  const halo = useRef(new Animated.Value(0)).current;
  const was = useRef(status);
  useEffect(() => {
    const before = was.current;
    was.current = status;
    if (status !== 'done' || before === 'done' || reduceMotionNow()) return;
    pop.setValue(0.55);
    halo.setValue(0);
    Animated.parallel([
      Animated.spring(pop, { toValue: 1, friction: 4, tension: 220, useNativeDriver: true }),
      Animated.timing(halo, { toValue: 1, duration: 520, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [status, pop, halo]);

  const r = size / 2;
  const ring =
    status === 'done' ? (
      <View style={{ width: size, height: size, borderRadius: r, backgroundColor: t.success, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="checkmark" size={Math.round(size * 0.66)} color={t.dark ? '#0E0D1A' : '#FFFFFF'} />
      </View>
    ) : status === 'waiting' ? (
      <View style={{ width: size, height: size, borderRadius: r, borderWidth: 2, borderColor: t.faint, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons name="hourglass-outline" size={Math.round(size * 0.5)} color={t.sub} />
      </View>
    ) : (
      <View style={{ width: size, height: size, borderRadius: r, borderWidth: 2, borderColor: status === 'doing' ? t.primary : t.faint, alignItems: 'center', justifyContent: 'center' }}>
        {status === 'doing' ? <View style={{ width: size * 0.38, height: size * 0.38, borderRadius: size * 0.19, backgroundColor: t.primary }} /> : null}
      </View>
    );
  const animated = (
    <View style={{ width: size, height: size }}>
      <Animated.View
        pointerEvents="none"
        style={{ position: 'absolute', width: size, height: size, borderRadius: r, backgroundColor: t.success, opacity: halo.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.35, 0] }), transform: [{ scale: halo.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] }) }] }}
      />
      <Animated.View style={{ transform: [{ scale: pop }] }}>{ring}</Animated.View>
    </View>
  );
  if (!onPress) return animated;
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityRole="button" accessibilityLabel={status === 'done' ? 'Reopen task' : 'Mark as done'} style={({ pressed }) => pressed && styles.pressed}>
      {animated}
    </Pressable>
  );
}

/** Left edge coloured by who the item came from. */
function RoleBar({ item }: { item: Item }) {
  const t = useTheme();
  const { role } = useData();
  return <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: roleColors(t, role(item.source_sender_tg_id)).solid }} />;
}

/** "3/5" with a thin bar, for tasks that have a checklist. */
export function StepsProgress({ done, total }: { done: number; total: number }) {
  const t = useTheme();
  if (!total) return null;
  const all = done === total;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }} accessibilityLabel={`${done} of ${total} steps done`}>
      <Ionicons name="list" size={13} color={all ? t.success : t.sub} />
      <Txt variant="caption" color={all ? t.success : t.sub} strong>{done}/{total}</Txt>
      <View style={{ flex: 1, maxWidth: 120, height: 4, borderRadius: 2, backgroundColor: t.surfaceAlt, overflow: 'hidden' }}>
        <View style={{ width: `${Math.round((done / total) * 100)}%`, height: 4, borderRadius: 2, backgroundColor: all ? t.success : t.primary }} />
      </View>
    </View>
  );
}

/** Changes a task's status with the matching touch feedback. */
export function statusFeedback(to: Status) {
  if (to === 'done') success();
  else bump();
}

type Quick = { to: Status; label: string; icon: IconName };
const QUICK: Partial<Record<Status, Quick>> = {
  todo: { to: 'doing', label: 'Start', icon: 'play' },
  doing: { to: 'waiting', label: 'Sent, waiting', icon: 'paper-plane' },
  waiting: { to: 'doing', label: 'Resume', icon: 'refresh' },
};

/** A task row. `onStatus` enables the quick status controls. */
export function TaskCard({ item, onStatus }: { item: Item; onStatus?: (to: Status) => void }) {
  const t = useTheme();
  const { role } = useData();
  const done = item.status === 'done';
  const next = QUICK[item.status];
  const change = (to: Status) => {
    statusFeedback(to);
    onStatus?.(to);
  };
  return (
    <Card onPress={() => openItem(item.id)} style={{ overflow: 'hidden', paddingLeft: space.lg + 2 }}>
      <RoleBar item={item} />
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <View style={{ paddingTop: 1 }}>
          <StatusRing status={item.status} onPress={onStatus ? () => change(done ? 'todo' : 'done') : undefined} />
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <Txt content strong numberOfLines={3} style={done ? { textDecorationLine: 'line-through', color: t.faint } : undefined}>{item.title}</Txt>
          {item.details && !done ? <Txt variant="label" content sub numberOfLines={1}>{item.details}</Txt> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            {item.status === 'waiting' ? <Pill icon="hourglass-outline" label={capitalize(waitingLabel(item.waiting_since))} fg={t.sub} bg={t.surfaceAlt} /> : <DuePill item={item} />}
            <PriorityPill priority={item.priority} />
            {!onStatus && item.status === 'doing' ? <Pill label={STATUS_LABEL.doing} fg={t.primary} bg={t.primarySoft} /> : null}
            {item.needs_review ? <Pill icon="help-circle" label="Needs review" fg={t.boss} bg={t.bossSoft} /> : null}
          </View>
          {!done ? <StepsProgress done={item.steps_done} total={item.steps_total} /> : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: 2 }}>
            <View style={{ flex: 1 }}>
              <RoleBadge role={role(item.source_sender_tg_id)} name={item.source_sender_name} />
            </View>
            {item.has_files ? <Ionicons name="attach" size={17} color={t.faint} accessibilityLabel="Has attachments" /> : null}
            {onStatus && next ? (
              <Pressable
                onPress={() => change(next.to)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={next.to === 'waiting' ? 'Mark as sent, waiting on boss' : next.label}
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

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export const openProject = (tag: string) => router.push({ pathname: '/project/[tag]', params: { tag } });

/** A tag that opens its project page. */
export function TagPill({ tag }: { tag: string }) {
  const t = useTheme();
  return (
    <Pressable onPress={() => openProject(tag)} hitSlop={6} accessibilityRole="link" accessibilityLabel={`Open project ${tag}`} style={({ pressed }) => pressed && styles.pressed}>
      <Pill content label={`#${tag}`} fg={t.primary} bg={t.primarySoft} />
    </Pressable>
  );
}

export function Tags({ tags, max = 3 }: { tags: string[]; max?: number }) {
  if (!tags.length) return null;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {tags.slice(0, max).map((g) => <TagPill key={g} tag={g} />)}
    </View>
  );
}

function PinButton({ pinned, onPress }: { pinned: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={() => { tap(); onPress(); }} hitSlop={10} accessibilityRole="button" accessibilityLabel={pinned ? 'Unpin' : 'Pin'} style={({ pressed }) => pressed && styles.pressed}>
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
