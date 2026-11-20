import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { Children, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLayout } from '@/lib/layout';
import { ROLE_LABEL, roleColors } from '@/lib/roles';
import { content, elevation, noOutline, radius, space, ui, useTheme } from '@/lib/theme';
import type { Role, RoleFilter } from '@/lib/types';

export type IconName = keyof typeof Ionicons.glyphMap;

// ------------------------------------------------------------------ text

const VARIANTS = {
  display: { size: 28, line: 34, font: ui.extrabold },
  title: { size: 22, line: 28, font: ui.bold },
  heading: { size: 17, line: 24, font: ui.bold },
  body: { size: 15, line: 22, font: ui.medium },
  label: { size: 13, line: 18, font: ui.semibold },
  caption: { size: 12, line: 16, font: ui.medium },
  overline: { size: 11, line: 14, font: ui.bold },
} as const;
const CONTENT_FONT = { display: content.semibold, title: content.semibold, heading: content.semibold, body: content.regular, label: content.medium, caption: content.regular, overline: content.semibold };

type TxtProps = TextProps & {
  variant?: keyof typeof VARIANTS;
  /** Text written by people (titles, messages, names): uses the Bengali-capable face. */
  content?: boolean;
  sub?: boolean;
  color?: string;
  strong?: boolean;
};

export function Txt({ style, variant = 'body', content: isContent, sub, color, strong, ...rest }: TxtProps) {
  const t = useTheme();
  const v = VARIANTS[variant];
  // Hind Siliguri sets smaller and needs more leading than the Latin face.
  // The text-size setting scales every piece of text through this one component.
  const k = t.scale;
  const base: TextStyle = isContent
    ? { fontFamily: strong ? content.semibold : CONTENT_FONT[variant], fontSize: (v.size + 1) * k, lineHeight: Math.round((v.size + 1) * 1.5 * k) }
    : { fontFamily: strong ? ui.bold : v.font, fontSize: v.size * k, lineHeight: Math.round(v.line * k) };
  const overline: TextStyle = variant === 'overline' ? { textTransform: 'uppercase', letterSpacing: 0.9 } : {};
  return <Text {...rest} style={[base, overline, { color: color ?? (sub ? t.sub : t.text) }, style]} />;
}

// ------------------------------------------------------------------ surfaces

/** Pressable state on the web also reports the pointer hovering. */
export const isHovered = (state: object) => !!(state as { hovered?: boolean }).hovered;

export function Card({ children, style, onPress, onLongPress, flat, selected }: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  onLongPress?: () => void;
  flat?: boolean;
  /** Marks the card whose detail is open beside the list (desktop). */
  selected?: boolean;
}) {
  const t = useTheme();
  const base: StyleProp<ViewStyle> = [styles.card, { backgroundColor: t.surface, borderColor: t.border }, !flat && elevation(t), style];
  const ring = selected ? ({ boxShadow: `0 0 0 2px ${t.primary}` } as object) : null;
  if (!onPress) return <View style={[base, ring]}>{children}</View>;
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} style={(s) => [base, isHovered(s) && !flat && [elevation(t, 2), { borderColor: t.faint }], ring, s.pressed && styles.pressed]}>
      {children}
    </Pressable>
  );
}

// ------------------------------------------------------------------ buttons

export function Btn({ label, onPress, kind = 'primary', disabled, small, icon, style }: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'soft' | 'ghost' | 'danger' | 'inverse';
  disabled?: boolean;
  small?: boolean;
  icon?: IconName;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const bg = { primary: t.primaryBg, soft: t.primarySoft, ghost: t.surfaceAlt, danger: t.dangerSoft, inverse: '#FFFFFF' }[kind];
  const fg = { primary: t.onPrimary, soft: t.primary, ghost: t.text, danger: t.danger, inverse: t.hero[0] }[kind];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={(s) => [styles.btn, small && styles.btnSmall, { backgroundColor: bg, opacity: disabled ? 0.45 : isHovered(s) ? 0.88 : 1 }, s.pressed && styles.pressed, style]}>
      {icon ? <Ionicons name={icon} size={small ? 15 : 18} color={fg} /> : null}
      <Text style={{ color: fg, fontFamily: ui.bold, fontSize: (small ? 13 : 15) * t.scale, lineHeight: Math.round((small ? 18 : 20) * t.scale) }}>{label}</Text>
    </Pressable>
  );
}

export function IconBtn({ icon, onPress, label, color, bg, size = 40 }: {
  icon: IconName;
  onPress: () => void;
  label: string;
  color?: string;
  bg?: string;
  size?: number;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      {...({ title: label } as object)}
      style={(s) => [{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: bg ?? t.surfaceAlt }, isHovered(s) && ({ boxShadow: `0 0 0 2px ${t.border}` } as object), s.pressed && styles.pressed]}>
      <Ionicons name={icon} size={Math.round(size * 0.5)} color={color ?? t.text} />
    </Pressable>
  );
}

export function Chip({ label, active, onPress, icon, count, content: isContent, dot }: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  icon?: IconName;
  count?: number;
  content?: boolean;
  /** A colour sample shown before the label (theme choices). */
  dot?: string;
}) {
  const t = useTheme();
  const fg = active ? t.onPrimary : t.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      style={(s) => [styles.chip, { backgroundColor: active ? t.primaryBg : isHovered(s) ? t.surfaceAlt : t.surface, borderColor: active ? t.primaryBg : t.border }, s.pressed && styles.pressed]}>
      {dot ? <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: dot, borderWidth: 1.5, borderColor: active ? t.onPrimary : 'transparent' }} /> : null}
      {icon ? <Ionicons name={icon} size={15} color={active ? t.onPrimary : t.sub} /> : null}
      <Txt variant="label" content={isContent} color={fg}>{label}</Txt>
      {count != null ? <Txt variant="caption" color={active ? t.onPrimary : t.faint}>{count}</Txt> : null}
    </Pressable>
  );
}

/** Small static coloured label. */
export function Pill({ label, fg, bg, icon, content: isContent }: { label: string; fg: string; bg: string; icon?: IconName; content?: boolean }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      {icon ? <Ionicons name={icon} size={12} color={fg} /> : null}
      <Txt variant="caption" content={isContent} color={fg} style={isContent ? undefined : { fontFamily: ui.semibold }} numberOfLines={1}>{label}</Txt>
    </View>
  );
}

export function Segments<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string; count?: number; dot?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const t = useTheme();
  const { desktop } = useLayout();
  return (
    <View style={[styles.segments, { backgroundColor: t.surfaceAlt }]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={(s) => [styles.segment, desktop && { paddingHorizontal: 14, flexBasis: 'auto', flexShrink: 0 }, on ? [{ backgroundColor: t.surface }, elevation(t)] : isHovered(s) && { backgroundColor: t.border }]}>
            {o.dot ? <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: o.dot }} /> : null}
            <Txt variant="label" color={on ? t.text : t.sub} numberOfLines={1}>{o.label}</Txt>
            {o.count != null ? <Txt variant="caption" color={on ? t.primary : t.faint}>{o.count}</Txt> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

// ------------------------------------------------------------------ roles

export function Avatar({ name, role, size = 28, solid }: { name: string | null; role: Role; size?: number; solid?: boolean }) {
  const t = useTheme();
  const rc = roleColors(t, role);
  // `solid` keeps the avatar visible on a card already tinted with the role colour.
  const c = solid ? { bg: rc.solid, fg: '#FFFFFF' } : rc;
  const initial = (name ?? '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: c.fg, fontFamily: content.semibold, fontSize: Math.round(size * 0.46), lineHeight: Math.round(size * 0.72) }}>{initial}</Text>
    </View>
  );
}

/** Who it came from: coloured role tag plus the sender's name. */
export function RoleBadge({ role, name, compact }: { role: Role; name?: string | null; compact?: boolean }) {
  const t = useTheme();
  const c = roleColors(t, role);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 }}>
      <View style={[styles.pill, { backgroundColor: c.bg }]}>
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.solid }} />
        <Txt variant="caption" color={c.fg} style={{ fontFamily: ui.bold }}>{ROLE_LABEL[role]}</Txt>
      </View>
      {!compact && name ? <Txt variant="caption" content sub numberOfLines={1} style={{ flexShrink: 1 }}>{name}</Txt> : null}
    </View>
  );
}

export function RoleFilterBar({ value, onChange, counts }: {
  value: RoleFilter;
  onChange: (v: RoleFilter) => void;
  counts?: Partial<Record<RoleFilter, number>>;
}) {
  const t = useTheme();
  return (
    <Segments
      value={value}
      onChange={onChange}
      options={[
        { value: 'all', label: 'All', count: counts?.all },
        { value: 'boss', label: 'Boss', count: counts?.boss, dot: t.bossSolid },
        { value: 'me', label: 'Me', count: counts?.me, dot: t.meSolid },
      ]}
    />
  );
}

export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  const t = useTheme();
  // activeThumbColor is react-native-web only; without it the web thumb turns teal.
  const web = Platform.OS === 'web' ? ({ activeThumbColor: '#FFFFFF' } as object) : {};
  return <Switch value={value} onValueChange={onChange} accessibilityLabel={label} trackColor={{ true: t.primaryBg, false: t.border }} thumbColor="#FFFFFF" {...web} />;
}

// ------------------------------------------------------------------ layout

/** Search box in the desktop top bar: Enter opens the search page with the words typed. */
export function SearchField({ width = 250 }: { width?: number }) {
  const t = useTheme();
  const [q, setQ] = useState('');
  const go = () => {
    router.push({ pathname: '/search', params: q.trim() ? { q: q.trim() } : {} });
    setQ('');
  };
  return (
    <View style={{ width, flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: t.surface, borderColor: t.border, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md }}>
      <Ionicons name="search" size={16} color={t.faint} />
      <TextInput
        value={q}
        onChangeText={setQ}
        onSubmitEditing={go}
        placeholder="Search everything"
        placeholderTextColor={t.faint}
        returnKeyType="search"
        accessibilityLabel="Search everything"
        style={[{ flex: 1, minWidth: 0, color: t.text, fontFamily: content.regular, fontSize: 15 * t.scale, paddingVertical: 8 }, noOutline]}
      />
    </View>
  );
}

/** Desktop page header: title, filters inline, actions and search on the right. */
function DesktopBar({ title, subtitle, back, actions, children }: { title?: string; subtitle?: string; back?: boolean; actions?: ReactNode; children?: ReactNode }) {
  const t = useTheme();
  const onSearch = usePathname() === '/search';
  // On a narrow desktop window the bar keeps its room for the filters; Search stays in the sidebar.
  const { pageWidth } = useLayout();
  const showSearch = !onSearch && pageWidth >= 900;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: space.lg, rowGap: space.md, paddingHorizontal: space.xxl, paddingTop: space.xl, paddingBottom: space.md }}>
      {back ? <IconBtn icon="chevron-back" label="Back" size={36} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} bg={t.surface} /> : null}
      {title ? (
        <View style={{ marginRight: space.sm, flexShrink: 1 }}>
          <Txt variant="title" style={{ fontFamily: ui.extrabold }} numberOfLines={1}>{title}</Txt>
          {subtitle ? <Txt variant="caption" sub>{subtitle}</Txt> : null}
        </View>
      ) : null}
      {Children.map(children, (child) => (child ? <View style={{ flexShrink: 0 }}>{child}</View> : null))}
      <View style={{ flex: 1 }} />
      {actions}
      {showSearch ? <SearchField /> : null}
    </View>
  );
}

/** Large in-screen header used by the tab screens. */
export function Header({ title, subtitle, actions, children }: { title: string; subtitle?: string; actions?: ReactNode; children?: ReactNode }) {
  const insets = useSafeAreaInsets();
  const { desktop } = useLayout();
  if (desktop) return <DesktopBar title={title} subtitle={subtitle} actions={actions}>{children}</DesktopBar>;
  return (
    <View style={{ paddingTop: insets.top + space.lg, paddingHorizontal: space.lg, paddingBottom: space.sm, gap: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <View style={{ flex: 1 }}>
          <Txt variant="display">{title}</Txt>
          {subtitle ? <Txt variant="label" sub>{subtitle}</Txt> : null}
        </View>
        {actions}
      </View>
      {children}
    </View>
  );
}

/** Compact header with a back button for pushed screens. */
export function TopBar({ title, right, children, noBack }: { title?: string; right?: ReactNode; children?: ReactNode; /** Desktop: a page reached from the sidebar needs no back button. */ noBack?: boolean }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { desktop } = useLayout();
  if (desktop) return <DesktopBar title={title} back={!noBack} actions={right}>{children}</DesktopBar>;
  return (
    <View style={{ paddingTop: insets.top + space.sm, paddingHorizontal: space.lg, paddingBottom: space.sm, gap: space.md, backgroundColor: t.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <IconBtn icon="chevron-back" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} bg={t.surface} />
        <View style={{ flex: 1 }}>{title ? <Txt variant="heading">{title}</Txt> : null}</View>
        {right}
      </View>
      {children}
    </View>
  );
}

/** Search and Settings shortcuts in a phone header; on desktop they live in the sidebar and top bar. */
export function GlobalActions() {
  const t = useTheme();
  const { desktop } = useLayout();
  if (desktop) return null;
  return (
    <View style={{ flexDirection: 'row', gap: space.sm }}>
      <IconBtn icon="search" label="Search" onPress={() => router.push('/search')} bg={t.surface} />
      <IconBtn icon="settings-outline" label="Settings" onPress={() => router.push('/settings')} bg={t.surface} />
    </View>
  );
}

export function SectionHeader({ title, count, color, action }: { title: string; count?: number; color?: string; action?: ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.xl, marginBottom: space.sm + 2, paddingHorizontal: 2 }}>
      <Txt variant="overline" color={color ?? t.sub}>{title}</Txt>
      {count != null ? (
        <View style={{ paddingHorizontal: 7, paddingVertical: 1, borderRadius: radius.pill, backgroundColor: t.surfaceAlt }}>
          <Txt variant="caption" color={color ?? t.sub} style={{ fontFamily: ui.bold }}>{count}</Txt>
        </View>
      ) : null}
      <View style={{ flex: 1 }} />
      {action}
    </View>
  );
}

export function Empty({ icon = 'sparkles-outline', title, text }: { icon?: IconName; title: string; text?: string }) {
  const t = useTheme();
  return (
    <View style={{ paddingVertical: 48, paddingHorizontal: 32, alignItems: 'center', gap: space.sm }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: t.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm }}>
        <Ionicons name={icon} size={32} color={t.primary} />
      </View>
      <Txt variant="heading" style={{ textAlign: 'center' }}>{title}</Txt>
      {text ? <Txt variant="body" sub style={{ textAlign: 'center' }}>{text}</Txt> : null}
    </View>
  );
}

export function ErrorBanner({ text }: { text: string | null }) {
  const t = useTheme();
  if (!text) return null;
  return (
    <View style={{ flexDirection: 'row', gap: space.sm, backgroundColor: t.dangerSoft, padding: space.md, borderRadius: radius.md, marginBottom: space.md }}>
      <Ionicons name="alert-circle" size={18} color={t.danger} />
      <Txt variant="label" color={t.danger} style={{ flex: 1 }}>Something went wrong: {text}</Txt>
    </View>
  );
}

/** Pulsing placeholders shown while the first load is in flight. */
export function Skeleton({ rows = 4, height = 84 }: { rows?: number; height?: number }) {
  const t = useTheme();
  const pulse = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <View style={{ gap: space.md }} accessibilityLabel="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Animated.View key={i} style={{ height, borderRadius: radius.lg, backgroundColor: t.surfaceAlt, opacity: pulse }} />
      ))}
    </View>
  );
}

// ------------------------------------------------------------------ sheet

export function Sheet({ visible, onClose, title, children }: { visible: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { desktop } = useLayout();
  if (desktop) {
    // A centred dialog instead of a full-width bottom sheet. Esc closes it (onRequestClose).
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xxl }}>
          <Pressable accessibilityLabel="Close" onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: t.overlay }, { cursor: 'default' } as object]} />
          <View style={[{ width: '100%', maxWidth: 520, maxHeight: '86%', backgroundColor: t.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: t.border, paddingVertical: space.xl }, elevation(t, 2)]} accessibilityRole={'dialog' as never}>
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.xxl, marginBottom: space.sm }}>
              <Txt variant="title" style={{ flex: 1 }}>{title}</Txt>
              <IconBtn icon="close" label="Close" onPress={onClose} size={36} />
            </View>
            <ScrollView contentContainerStyle={{ paddingHorizontal: space.xxl, paddingBottom: space.sm }}>{children}</ScrollView>
          </View>
        </View>
      </Modal>
    );
  }
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable accessibilityLabel="Close" onPress={onClose} style={[StyleSheet.absoluteFill, { backgroundColor: t.overlay }]} />
        <View style={{ backgroundColor: t.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingTop: space.md, paddingBottom: insets.bottom + space.xl, maxHeight: '82%' }}>
          <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: t.border, marginBottom: space.md }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.xl, marginBottom: space.sm }}>
            <Txt variant="title" style={{ flex: 1 }}>{title}</Txt>
            <IconBtn icon="close" label="Close" onPress={onClose} size={36} />
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: space.xl, paddingBottom: space.sm }}>{children}</ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** One labelled row of mutually exclusive choices inside a sheet. */
export function OptionGroup<T extends string>({ label, options, value, onChange }: {
  label: string;
  options: { value: T; label: string; icon?: IconName; dot?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <View style={{ marginTop: space.lg }}>
      <Txt variant="overline" sub style={{ marginBottom: space.sm }}>{label}</Txt>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {options.map((o) => <Chip key={o.value} label={o.label} icon={o.icon} dot={o.dot} active={o.value === value} onPress={() => onChange(o.value)} />)}
      </View>
    </View>
  );
}

export const styles = StyleSheet.create({
  list: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: 120 },
  card: { borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, padding: space.lg },
  pressed: { opacity: 0.82, transform: [{ scale: 0.985 }] },
  btn: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingVertical: 14, paddingHorizontal: 20, borderRadius: radius.md },
  btnSmall: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: radius.sm, gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 3, paddingHorizontal: 8, borderRadius: radius.pill, alignSelf: 'flex-start' },
  segments: { flexDirection: 'row', borderRadius: radius.md, padding: 4 },
  segment: { flex: 1, flexDirection: 'row', gap: 5, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 2, borderRadius: radius.sm },
});
