import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, Platform, Pressable, View } from 'react-native';
import { useData } from '@/lib/data';
import { PRIORITY_LABEL, STATUSES, STATUS_LABEL, STATUS_SHORT, dueLabel, dueShort, fmtDate, fmtDateTime, isOverdue, todayNumber, waitingLabel } from '@/lib/format';
import { bump, success, tap } from '@/lib/haptics';
import { isDesktopNow, useLayout } from '@/lib/layout';
import { setPaneItem, usePaneItem } from '@/lib/pane';
import { roleColors } from '@/lib/roles';
import { radius, space, ui, useDensity, useTheme } from '@/lib/theme';
import type { Item, Priority, Status } from '@/lib/types';
import { reduceMotionNow } from './motion';
import { Card, Pill, Sheet, Txt, styles, type IconName } from './ui';

/** Opens a task or note: in the side pane on a desktop window, as its own screen on a phone. */
export const openItem = (id: string) => {
  if (isDesktopNow()) setPaneItem(id);
  else router.push({ pathname: '/item/[id]', params: { id } });
};

export function DuePill({ item }: { item: Pick<Item, 'due_at' | 'due_all_day' | 'status'> }) {
  const t = useTheme();
  const label = dueLabel(item);
  if (!label) return null;
  const late = isOverdue(item);
  return late ? (
    <Pill icon="alert-circle-outline" label={`Overdue · ${label}`} fg={t.danger} bg={t.dangerSoft} />
  ) : (
    <Pill icon="calendar-outline" label={label} fg={t.sub} bg={t.surfaceAlt} />
  );
}

export function PriorityPill({ priority }: { priority: Priority }) {
  const t = useTheme();
  if (priority === 'normal') return null;
  if (priority === 'urgent') return <Pill icon="flame-outline" label={PRIORITY_LABEL.urgent} fg="#FFFFFF" bg={t.dangerSolid} />;
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

/** "3/5" with a thin bar, for tasks that have a checklist. `inline` is the short form inside a card's meta row. */
export function StepsProgress({ done, total, inline }: { done: number; total: number; inline?: boolean }) {
  const t = useTheme();
  if (!total) return null;
  const all = done === total;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: inline ? 5 : space.sm }} accessibilityLabel={`${done} of ${total} steps done`}>
      <Ionicons name="list-outline" size={13} color={all ? t.success : t.sub} />
      <Txt variant="caption" color={all ? t.success : t.sub} strong>{done}/{total}</Txt>
      <View style={[{ height: 4, borderRadius: 2, backgroundColor: t.surfaceAlt, overflow: 'hidden' }, inline ? { width: 36 } : { flex: 1, maxWidth: 120 }]}>
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
  todo: { to: 'doing', label: 'Start', icon: 'play-outline' },
  doing: { to: 'waiting', label: 'Sent, waiting', icon: 'paper-plane-outline' },
  waiting: { to: 'doing', label: 'Resume', icon: 'refresh-outline' },
};

/** How far a card must be dragged before letting go triggers the action. */
const SWIPE_TRIGGER = 84;
const HOUR_MS = 3600_000;
/** 09:00 tomorrow in Dhaka (UTC+6). */
const tomorrowMorning = () => new Date((todayNumber() + 1) * 86400_000 + (9 - 6) * HOUR_MS);

type TaskCardProps = {
  item: Item;
  /** Enables the status controls (ring, quick action, swipe on a phone). */
  onStatus?: (to: Status) => void;
  /** Board column card: shows move-left / move-right controls. */
  board?: boolean;
  onOpen?: () => void;
  selected?: boolean;
  /** The list drops finished tasks, so the card folds away before it goes. */
  leaveOnDone?: boolean;
};

/**
 * A task in a list. Comfortable density is a short card; compact is one line.
 * On a phone, drag right to finish it or left to be reminded later.
 */
export function TaskCard({ item, onStatus, board, onOpen, selected, leaveOnDone }: TaskCardProps) {
  const t = useTheme();
  const compact = useDensity() === 'compact';
  const { desktop } = useLayout();
  const { role, updateItem } = useData();
  const open = usePaneItem() === item.id;
  const at = STATUSES.indexOf(item.status);
  const prev = board && at > 0 ? STATUSES[at - 1] : null;
  const after = board && at < STATUSES.length - 1 ? STATUSES[at + 1] : null;
  const r = role(item.source_sender_tg_id);
  const done = item.status === 'done';
  const next = QUICK[item.status];
  const late = isOverdue(item);
  const swipeable = !desktop && !!onStatus && !board;

  // Folding away: the card fades and its height closes, then the status change removes it.
  const leave = useRef(new Animated.Value(1)).current;
  const [leaving, setLeaving] = useState(false);
  const height = useRef(0);
  useEffect(() => {
    // Still here after the change (this list keeps finished tasks): show it again.
    leave.setValue(1);
    setLeaving(false);
    drag.setValue(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.status]);

  const change = (to: Status) => {
    statusFeedback(to);
    if (to === 'done' && leaveOnDone && height.current && !reduceMotionNow()) {
      setLeaving(true);
      Animated.timing(leave, { toValue: 0, duration: 230, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start(() => onStatus?.(to));
    } else {
      onStatus?.(to);
    }
  };

  // ---- swipe
  const drag = useRef(new Animated.Value(0)).current;
  const armed = useRef(0);
  // A drag must not also count as a tap on the card when the finger lifts.
  const dragged = useRef(false);
  const endDrag = () => setTimeout(() => (dragged.current = false), 250);
  const openCard = () => {
    if (dragged.current) return;
    (onOpen ?? (() => openItem(item.id)))();
  };
  const [remind, setRemind] = useState(false);
  const settle = () => Animated.spring(drag, { toValue: 0, speed: 22, bounciness: 5, useNativeDriver: false }).start();
  const pan = useMemo(
    () =>
      PanResponder.create({
        // Only a clearly sideways drag is taken, so scrolling the list keeps working.
        onMoveShouldSetPanResponder: (_e, g) => swipeable && Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: () => {
          dragged.current = true;
        },
        onPanResponderMove: (_e, g) => {
          // A finished task has nothing to finish: the right swipe only resists.
          const dx = g.dx > 0 && done ? g.dx * 0.15 : g.dx;
          drag.setValue(Math.max(-150, Math.min(150, dx)));
          const side = dx > SWIPE_TRIGGER ? 1 : dx < -SWIPE_TRIGGER ? -1 : 0;
          if (side !== armed.current) {
            armed.current = side;
            if (side) bump();
          }
        },
        onPanResponderRelease: (_e, g) => {
          armed.current = 0;
          endDrag();
          if (g.dx > SWIPE_TRIGGER && !done) {
            Animated.timing(drag, { toValue: 420, duration: 170, easing: Easing.in(Easing.quad), useNativeDriver: false }).start(() => change('done'));
          } else {
            if (g.dx < -SWIPE_TRIGGER) setRemind(true);
            settle();
          }
        },
        onPanResponderTerminate: () => {
          armed.current = 0;
          endDrag();
          settle();
        },
      }),
    // `change` closes over the current item; the responder is rebuilt when the task changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [swipeable, done, item.id, item.status, leaveOnDone, onStatus],
  );
  const remindAt = (at: Date | null) => {
    setRemind(false);
    tap();
    void updateItem(item.id, { remind_at: at ? at.toISOString() : null }, at ? `Reminder set for ${fmtDateTime(at)}` : 'Reminder cleared');
  };

  const ring = <StatusRing status={item.status} size={compact ? 22 : 26} onPress={onStatus ? () => change(done ? 'todo' : 'done') : undefined} />;
  const titleStyle = done ? ({ textDecorationLine: 'line-through', color: t.faint } as const) : undefined;
  const reminder = item.remind_at && new Date(item.remind_at).getTime() > Date.now() ? item.remind_at : null;
  const moves =
    onStatus && board ? (
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {prev ? <MoveBtn icon="arrow-back" label={`Move to ${STATUS_SHORT[prev]}`} onPress={() => change(prev)} /> : null}
        {after ? <MoveBtn icon="arrow-forward" label={`Move to ${STATUS_SHORT[after]}`} onPress={() => change(after)} /> : null}
      </View>
    ) : null;
  // The bar on the left already says boss or me; only an unfamiliar sender is named.
  const otherName = r === 'other' && item.source_sender_name ? item.source_sender_name : null;

  const body = compact ? (
    <Card onPress={openCard} selected={selected ?? open} style={{ overflow: 'hidden', paddingVertical: 10, paddingRight: space.md, paddingLeft: space.md + 4 }}>
      <RoleBar item={item} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm + 2 }}>
        {ring}
        <Txt content strong numberOfLines={1} style={[{ flex: 1 }, titleStyle]}>{item.title}</Txt>
        {item.needs_review ? <Ionicons name="help-circle-outline" size={16} color={t.boss} accessibilityLabel="Needs review" /> : null}
        {item.steps_total && !done && !board ? <Txt variant="caption" sub>{item.steps_done}/{item.steps_total}</Txt> : null}
        {item.priority === 'urgent' ? <Ionicons name="flame-outline" size={15} color={t.danger} accessibilityLabel="Urgent" /> : null}
        {item.priority === 'high' ? <Ionicons name="arrow-up" size={15} color={t.danger} accessibilityLabel="High priority" /> : null}
        {item.status === 'waiting' ? (
          board ? null : <Txt variant="caption" sub numberOfLines={1}>{capitalize(waitingLabel(item.waiting_since))}</Txt>
        ) : dueShort(item) && !done && (!board || late) ? (
          <Txt variant="caption" color={late ? t.danger : t.sub} style={late ? { fontFamily: ui.bold } : undefined} numberOfLines={1}>{dueShort(item)}</Txt>
        ) : null}
        {moves}
      </View>
    </Card>
  ) : (
    <Card onPress={openCard} selected={selected ?? open} style={{ overflow: 'hidden', paddingVertical: space.md + 2, paddingLeft: space.lg + 2 }}>
      <RoleBar item={item} />
      <View style={{ flexDirection: 'row', gap: space.md }}>
        <View style={{ paddingTop: 1 }}>{ring}</View>
        <View style={{ flex: 1, gap: 5 }}>
          <Txt content strong numberOfLines={2} style={titleStyle}>{item.title}</Txt>
          {item.details && !done ? <Txt variant="label" content sub numberOfLines={1}>{item.details}</Txt> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
            {item.status === 'waiting' ? <Pill icon="hourglass-outline" label={capitalize(waitingLabel(item.waiting_since))} fg={t.sub} bg={t.surfaceAlt} /> : <DuePill item={item} />}
            <PriorityPill priority={item.priority} />
            {!onStatus && item.status === 'doing' ? <Pill label={STATUS_LABEL.doing} fg={t.primary} bg={t.primarySoft} /> : null}
            {item.needs_review ? <Pill icon="help-circle-outline" label="Needs review" fg={t.boss} bg={t.bossSoft} /> : null}
            {reminder ? <Pill icon="alarm-outline" label={fmtDateTime(reminder)} fg={t.primary} bg={t.primarySoft} /> : null}
            {(!done && item.steps_total) || item.has_files ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {!done && item.steps_total ? <StepsProgress done={item.steps_done} total={item.steps_total} inline /> : null}
                {item.has_files ? <Ionicons name="attach" size={16} color={t.faint} accessibilityLabel="Has attachments" /> : null}
              </View>
            ) : null}
            {otherName ? <Txt variant="caption" content sub numberOfLines={1} style={{ flexShrink: 1 }}>{otherName}</Txt> : null}
          </View>
        </View>
        {moves ??
          (onStatus && next ? (
            <Pressable
              onPress={() => change(next.to)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={next.to === 'waiting' ? 'Mark as sent, waiting on boss' : next.label}
              {...({ title: next.label } as object)}
              style={({ pressed }) => [
                { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', height: 30, minWidth: 30, justifyContent: 'center', paddingHorizontal: desktop ? 10 : 0, borderRadius: radius.pill, backgroundColor: t.primarySoft },
                pressed && styles.pressed,
              ]}>
              <Ionicons name={next.icon} size={14} color={t.primary} />
              {desktop ? <Txt variant="caption" color={t.primary} strong>{next.label}</Txt> : null}
            </Pressable>
          ) : null)}
      </View>
    </Card>
  );

  const card = swipeable ? (
    <View>
      {/* What the drag reveals: finish on the left, remind on the right. */}
      <Animated.View pointerEvents="none" style={[swipe.under, { backgroundColor: t.success, opacity: drag.interpolate({ inputRange: [0, 24], outputRange: [0, 1], extrapolate: 'clamp' }) }]}>
        <Ionicons name="checkmark-circle-outline" size={22} color={t.dark ? '#0E0D1A' : '#FFFFFF'} />
        <Txt variant="label" strong color={t.dark ? '#0E0D1A' : '#FFFFFF'}>Done</Txt>
      </Animated.View>
      <Animated.View pointerEvents="none" style={[swipe.under, { justifyContent: 'flex-end', backgroundColor: t.primaryBg, opacity: drag.interpolate({ inputRange: [-24, 0], outputRange: [1, 0], extrapolate: 'clamp' }) }]}>
        <Txt variant="label" strong color={t.onPrimary}>Remind me</Txt>
        <Ionicons name="alarm-outline" size={22} color={t.onPrimary} />
      </Animated.View>
      <Animated.View style={[{ transform: [{ translateX: drag }] }, NO_SELECT]} {...pan.panHandlers}>{body}</Animated.View>
      <Sheet visible={remind} onClose={() => setRemind(false)} title="Remind me">
        <Txt variant="label" content sub numberOfLines={2}>{item.title}</Txt>
        <View style={{ gap: space.sm, marginTop: space.md }}>
          <RemindOption icon="time-outline" title="In 1 hour" hint={fmtDateTime(new Date(Date.now() + HOUR_MS))} onPress={() => remindAt(new Date(Date.now() + HOUR_MS))} />
          <RemindOption icon="sunny-outline" title="Tomorrow morning" hint={fmtDateTime(tomorrowMorning())} onPress={() => remindAt(tomorrowMorning())} />
          {reminder ? <RemindOption icon="close-circle-outline" title="Clear the reminder" hint={`Set for ${fmtDateTime(reminder)}`} onPress={() => remindAt(null)} /> : null}
        </View>
        <Txt variant="caption" sub style={{ marginTop: space.md }}>The bot sends the reminder in your private Telegram chat.</Txt>
      </Sheet>
    </View>
  ) : (
    body
  );

  return (
    <Animated.View
      onLayout={(e) => {
        if (!leaving) height.current = e.nativeEvent.layout.height;
      }}
      style={leaving ? { overflow: 'hidden', opacity: leave, height: leave.interpolate({ inputRange: [0, 1], outputRange: [0, height.current] }), marginBottom: leave.interpolate({ inputRange: [0, 1], outputRange: [-space.md, 0] }) } : undefined}>
      {card}
    </Animated.View>
  );
}

const NO_SELECT = Platform.OS === 'web' ? ({ userSelect: 'none' } as object) : null;

const swipe = {
  under: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, borderRadius: radius.lg, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.lg },
} as const;

function RemindOption({ icon, title, hint, onPress }: { icon: IconName; title: string; hint: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: t.border, backgroundColor: pressed ? t.surfaceAlt : t.surface }]}>
      <Ionicons name={icon} size={20} color={t.primary} />
      <View style={{ flex: 1 }}>
        <Txt variant="body" strong>{title}</Txt>
        <Txt variant="caption" sub>{hint}</Txt>
      </View>
    </Pressable>
  );
}

function MoveBtn({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={label}
      {...({ title: label } as object)}
      style={(s) => [{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: (s as { hovered?: boolean }).hovered ? t.primaryBg : t.primarySoft }, s.pressed && styles.pressed]}>
      {(s) => <Ionicons name={icon} size={14} color={(s as { hovered?: boolean }).hovered ? t.onPrimary : t.primary} />}
    </Pressable>
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
  const open = usePaneItem() === item.id;
  // The colour on the edge already says boss or me; only an unfamiliar sender is named.
  const otherName = r === 'other' && item.source_sender_name ? item.source_sender_name : null;
  if (compact) {
    return (
      <Card onPress={() => openItem(item.id)} selected={open} style={{ overflow: 'hidden', paddingVertical: space.md, paddingLeft: space.lg + 2 }}>
        <RoleBar item={item} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt content strong numberOfLines={1}>{item.title}</Txt>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
              <Txt variant="caption" sub>{fmtDate(item.created_at)}</Txt>
              {item.tags[0] ? <Txt variant="caption" content color={t.primary}>#{item.tags[0]}</Txt> : null}
              {otherName ? <Txt variant="caption" content sub numberOfLines={1} style={{ flexShrink: 1 }}>{otherName}</Txt> : null}
            </View>
          </View>
          {onPin ? <PinButton pinned={item.pinned} onPress={onPin} /> : null}
        </View>
      </Card>
    );
  }
  return (
    <Card onPress={() => openItem(item.id)} selected={open} style={{ gap: space.sm, padding: space.md + 2, borderTopWidth: 3, borderTopColor: roleColors(t, r).solid }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.sm }}>
        <Txt content strong numberOfLines={5} style={{ flex: 1 }}>{item.title}</Txt>
        {onPin ? <PinButton pinned={item.pinned} onPress={onPin} /> : null}
      </View>
      {item.details ? <Txt variant="label" content sub numberOfLines={3}>{item.details}</Txt> : null}
      <Tags tags={item.tags} max={2} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Txt variant="caption" sub numberOfLines={1} style={{ flex: 1 }}>{fmtDate(item.created_at)}{otherName ? ' · ' : ''}{otherName ? <Txt variant="caption" content sub>{otherName}</Txt> : null}</Txt>
        {item.has_files ? <Ionicons name="attach" size={14} color={t.faint} /> : null}
      </View>
    </Card>
  );
}

/** Splits notes into `count` columns, always adding to the shortest one. */
export function noteColumns(notes: Item[], count = 2): Item[][] {
  const cols: Item[][] = Array.from({ length: count }, () => []);
  const height = cols.map(() => 0);
  for (const n of notes) {
    const weight = 90 + Math.min(n.title.length, 110) * 0.9 + Math.min(n.details?.length ?? 0, 120) * 0.5 + (n.tags.length ? 28 : 0);
    const col = height.indexOf(Math.min(...height));
    cols[col].push(n);
    height[col] += weight;
  }
  return cols;
}
