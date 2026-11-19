import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { STATUS_LABEL, PRIORITY_LABEL, dueLabel, isOverdue } from '@/lib/format';
import { useTheme } from '@/lib/theme';
import type { Item, Status } from '@/lib/types';

export function Txt({ style, sub, bold, size = 15, color, ...rest }: TextProps & { sub?: boolean; bold?: boolean; size?: number; color?: string }) {
  const t = useTheme();
  return (
    <Text
      {...rest}
      style={[{ color: color ?? (sub ? t.sub : t.text), fontSize: size, lineHeight: Math.round(size * 1.5), fontWeight: bold ? '600' : '400' }, style]}
    />
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const t = useTheme();
  const base = [styles.card, { backgroundColor: t.card, borderColor: t.border }, style];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable onPress={onPress} android_ripple={{ color: t.chip }} style={base}>
      {children}
    </Pressable>
  );
}

export function Btn({ label, onPress, kind = 'primary', disabled, small, icon }: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'plain' | 'danger';
  disabled?: boolean;
  small?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  const t = useTheme();
  const bg = kind === 'primary' ? t.primary : kind === 'danger' ? t.dangerBg : t.chip;
  const fg = kind === 'primary' ? t.onPrimary : kind === 'danger' ? t.danger : t.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      android_ripple={{ color: '#00000022' }}
      style={[styles.btn, small && styles.btnSmall, { backgroundColor: bg, opacity: disabled ? 0.5 : 1 }]}>
      {icon ? <Ionicons name={icon} size={small ? 15 : 18} color={fg} /> : null}
      <Text style={{ color: fg, fontWeight: '600', fontSize: small ? 13 : 15 }}>{label}</Text>
    </Pressable>
  );
}

export function Chip({ label, active, onPress, color }: { label: string; active?: boolean; onPress?: () => void; color?: string }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[styles.chip, { backgroundColor: active ? t.primary : t.chip }]}>
      <Text style={{ color: active ? t.onPrimary : (color ?? t.text), fontSize: 13, fontWeight: active ? '600' : '400' }}>{label}</Text>
    </Pressable>
  );
}

export function Segments<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const t = useTheme();
  return (
    <View style={[styles.segments, { backgroundColor: t.chip }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={[styles.segment, on && { backgroundColor: t.card }]}>
            <Text style={{ color: on ? t.text : t.sub, fontWeight: on ? '600' : '400', fontSize: 14 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SectionTitle({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <Txt bold size={13} sub={!color} color={color} style={{ marginTop: 18, marginBottom: 8, marginHorizontal: 4 }}>
      {children}
    </Txt>
  );
}

export function Empty({ text, loading }: { text: string; loading?: boolean }) {
  const t = useTheme();
  return (
    <View style={{ padding: 40, alignItems: 'center' }}>
      {loading ? <ActivityIndicator color={t.primary} /> : <Txt sub style={{ textAlign: 'center' }}>{text}</Txt>}
    </View>
  );
}

export function ErrorBanner({ text }: { text: string | null }) {
  const t = useTheme();
  if (!text) return null;
  return (
    <View style={{ backgroundColor: t.dangerBg, padding: 10, borderRadius: 10, marginBottom: 10 }}>
      <Txt size={13} color={t.danger}>সমস্যা হয়েছে: {text}</Txt>
    </View>
  );
}

const NEXT_STATUS: Record<Status, { to: Status; label: string }[]> = {
  todo: [{ to: 'doing', label: 'চলছে' }, { to: 'done', label: 'শেষ' }],
  doing: [{ to: 'todo', label: 'বাকি' }, { to: 'done', label: 'শেষ' }],
  done: [{ to: 'todo', label: 'আবার খুলুন' }],
};

/** One row for a task or note. `onStatus` adds the quick status buttons. */
export function ItemRow({ item, onStatus }: { item: Item; onStatus?: (to: Status) => void }) {
  const t = useTheme();
  const overdue = item.type === 'task' && isOverdue(item);
  const due = dueLabel(item);
  const done = item.status === 'done';
  return (
    <Card onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })} style={overdue ? { borderColor: t.danger } : undefined}>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
        <Txt bold style={[{ flex: 1 }, done && { textDecorationLine: 'line-through', color: t.sub }]}>{item.title}</Txt>
        {item.has_files ? <Ionicons name="attach" size={18} color={t.sub} /> : null}
        {item.pinned ? <Ionicons name="pin" size={16} color={t.primary} /> : null}
      </View>
      <View style={styles.meta}>
        {due ? (
          <Txt size={13} color={overdue ? t.danger : t.sub}>
            {overdue ? 'মেয়াদ পেরিয়েছে · ' : ''}{due}
          </Txt>
        ) : null}
        {item.type === 'task' && item.priority !== 'normal' ? (
          <Txt size={13} color={item.priority === 'low' ? t.sub : t.warn}>{PRIORITY_LABEL[item.priority]}</Txt>
        ) : null}
        {item.type === 'task' && !onStatus ? <Txt size={13} sub>{STATUS_LABEL[item.status]}</Txt> : null}
        {item.needs_review ? <Txt size={13} color={t.warn}>যাচাই দরকার</Txt> : null}
      </View>
      {onStatus ? (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
          {NEXT_STATUS[item.status].map((n) => (
            <Btn key={n.to} small kind={n.to === 'done' ? 'primary' : 'plain'} label={n.label} onPress={() => onStatus(n.to)} />
          ))}
        </View>
      ) : null}
    </Card>
  );
}

export function HeaderIcons() {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 18, marginRight: 14 }}>
      <Pressable hitSlop={10} onPress={() => router.push('/search')} accessibilityLabel="সার্চ">
        <Ionicons name="search" size={22} color={t.text} />
      </Pressable>
      <Pressable hitSlop={10} onPress={() => router.push('/settings')} accessibilityLabel="সেটিংস">
        <Ionicons name="settings-outline" size={22} color={t.text} />
      </Pressable>
    </View>
  );
}

export const styles = StyleSheet.create({
  list: { padding: 14, paddingBottom: 40 },
  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 14, marginBottom: 10, overflow: 'hidden' },
  meta: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 12, marginTop: 4 },
  btn: { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: 12, paddingHorizontal: 18, borderRadius: 12 },
  btnSmall: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 9 },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999 },
  segments: { flexDirection: 'row', borderRadius: 12, padding: 3, marginBottom: 12 },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10 },
});
