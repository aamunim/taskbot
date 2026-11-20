import { Ionicons } from '@expo/vector-icons';
import { router, usePathname } from 'expo-router';
import { useEffect, type ReactNode } from 'react';
import { Platform, Pressable, ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';
import { useData } from '@/lib/data';
import { PANE_WIDTH, SIDEBAR_WIDTH, useLayout } from '@/lib/layout';
import { setPaneItem, usePaneItem } from '@/lib/pane';
import { setPref, usePref } from '@/lib/prefs';
import { elevation, radius, space, ui, useTheme } from '@/lib/theme';
import { ItemDetailView } from './ItemDetail';
import { Logo } from './Logo';
import { Avatar, Txt, isHovered, type IconName } from './ui';

// Everything in this file is only rendered in the desktop layout of the web build.

export type TasksDeskView = 'board' | 'list' | 'calendar';
export const TASKS_DESK_PREF = 'tasks:desk';

const TAB_PATHS = ['/', '/tasks', '/inbox', '/notes', '/library'];

/** Sidebar navigation: tabs switch in place; other pages replace each other instead of piling up. */
function go(path: string, from: string) {
  setPaneItem(null);
  if (path === from) return;
  const toTab = TAB_PATHS.includes(path);
  const onTab = TAB_PATHS.includes(from);
  if (toTab) {
    if (!onTab && router.canDismiss()) router.dismissAll();
    router.navigate(path as never);
  } else if (onTab) router.push(path as never);
  else router.replace(path as never);
}

function NavItem({ icon, active: activeIcon, label, selected, onPress, badge }: { icon: IconName; active?: IconName; label: string; selected: boolean; onPress: () => void; badge?: number }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      accessibilityState={{ selected }}
      accessibilityLabel={badge ? `${label}, ${badge} waiting` : label}
      style={(s) => [{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 9, paddingHorizontal: space.md, borderRadius: radius.md, backgroundColor: selected ? t.primarySoft : isHovered(s) ? t.surfaceAlt : 'transparent' }]}>
      <Ionicons name={selected && activeIcon ? activeIcon : icon} size={19} color={selected ? t.primary : t.sub} />
      <Txt variant="label" color={selected ? t.primary : t.text} style={{ flex: 1, fontFamily: selected ? ui.bold : ui.semibold, fontSize: 14 * t.scale }}>{label}</Txt>
      {badge ? (
        <View style={{ minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 6, backgroundColor: t.dangerSolid, alignItems: 'center', justifyContent: 'center' }}>
          <Txt variant="caption" color="#FFFFFF" style={{ fontFamily: ui.bold, fontSize: 11, lineHeight: 14 }}>{badge > 99 ? '99+' : badge}</Txt>
        </View>
      ) : null}
    </Pressable>
  );
}

const Group = ({ label }: { label: string }) => (
  <Txt variant="overline" sub style={{ paddingHorizontal: space.md, marginTop: space.lg, marginBottom: space.xs }}>{label}</Txt>
);

/** Persistent left navigation of the desktop layout. */
export function Sidebar() {
  const t = useTheme();
  const path = usePathname();
  const { items, config } = useData();
  const [desk] = usePref<TasksDeskView>(TASKS_DESK_PREF, 'board');
  const inbox = items.filter((i) => i.needs_review).length;
  const onCalendar = path === '/tasks' && desk === 'calendar';
  const nav = (p: string) => () => go(p, path);
  return (
    <View style={{ width: SIDEBAR_WIDTH, backgroundColor: t.surface, borderRightWidth: 1, borderRightColor: t.border, paddingVertical: space.lg, paddingHorizontal: space.md }} accessibilityRole={'navigation' as never}>
      <Pressable onPress={nav('/')} accessibilityRole="link" accessibilityLabel="TaskBot, go to Today" style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.sm, marginBottom: space.md }}>
        <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: t.hero[1], alignItems: 'center', justifyContent: 'center' }}>
          <Logo size={30} cut={t.hero[1]} />
        </View>
        <Txt variant="heading" style={{ fontFamily: ui.extrabold, fontSize: 19 * t.scale }}>TaskBot</Txt>
      </Pressable>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 2 }} style={{ flex: 1 }}>
        <NavItem icon="sunny-outline" active="sunny" label="Today" selected={path === '/'} onPress={nav('/')} />
        <NavItem
          icon="checkmark-circle-outline"
          active="checkmark-circle"
          label="Tasks"
          selected={path === '/tasks' && !onCalendar}
          onPress={() => {
            if (desk === 'calendar') setPref<TasksDeskView>(TASKS_DESK_PREF, 'board');
            go('/tasks', path);
          }}
        />
        <NavItem icon="file-tray-outline" active="file-tray" label="Inbox" selected={path === '/inbox'} onPress={nav('/inbox')} badge={inbox} />
        <NavItem icon="reader-outline" active="reader" label="Notes" selected={path === '/notes'} onPress={nav('/notes')} />
        <NavItem icon="albums-outline" active="albums" label="Library" selected={path === '/library'} onPress={nav('/library')} />

        <Group label="Views" />
        <NavItem
          icon="calendar-outline"
          active="calendar"
          label="Calendar"
          selected={onCalendar}
          onPress={() => {
            setPref<TasksDeskView>(TASKS_DESK_PREF, 'calendar');
            go('/tasks', path);
          }}
        />
        <NavItem icon="time-outline" active="time" label="Timeline" selected={path === '/timeline'} onPress={nav('/timeline')} />
        <NavItem icon="folder-open-outline" active="folder-open" label="Projects" selected={path === '/projects' || path.startsWith('/project/')} onPress={nav('/projects')} />
      </ScrollView>

      <View style={{ gap: 2 }}>
        {config ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md, marginBottom: space.sm, borderRadius: radius.md, backgroundColor: t.bossSoft }}>
            <Avatar role="boss" name={config.boss_name ?? 'B'} size={30} solid />
            <View style={{ flex: 1 }}>
              <Txt variant="caption" color={t.boss} style={{ fontFamily: ui.bold }}>Boss</Txt>
              <Txt variant="caption" content color={t.boss} numberOfLines={1}>{config.boss_tg_id ? (config.boss_name ?? 'Unnamed') : 'Everyone except me'}</Txt>
            </View>
          </View>
        ) : null}
        <NavItem icon="search-outline" active="search" label="Search" selected={path === '/search'} onPress={nav('/search')} />
        <NavItem icon="settings-outline" active="settings" label="Settings" selected={path === '/settings'} onPress={nav('/settings')} />
      </View>
    </View>
  );
}

/** The open task or note beside the page (docked on very wide windows, sliding over it otherwise). */
export function DetailPane() {
  const t = useTheme();
  const id = usePaneItem();
  const path = usePathname();
  const { desktop, paneDocked } = useLayout();

  // Esc closes the pane; moving to another page or leaving the desktop layout does too.
  useEffect(() => {
    if (Platform.OS !== 'web' || !id) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) setPaneItem(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [id]);
  useEffect(() => {
    setPaneItem(null);
  }, [path, desktop]);

  if (!desktop || !id) return null;
  const pane = (
    <View style={[{ width: PANE_WIDTH, maxWidth: '100%', backgroundColor: t.bg, borderLeftWidth: 1, borderLeftColor: t.border }, !paneDocked && elevation(t, 2)]} accessibilityRole={'complementary' as never}>
      <ItemDetailView key={id} id={id} mode="pane" onClose={() => setPaneItem(null)} />
    </View>
  );
  if (paneDocked) return pane;
  return (
    <View style={{ position: 'absolute', top: 0, bottom: 0, right: 0, left: SIDEBAR_WIDTH, flexDirection: 'row', justifyContent: 'flex-end' }}>
      <Pressable accessibilityLabel="Close details" onPress={() => setPaneItem(null)} style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: t.overlay }, { cursor: 'default' } as object]} />
      {pane}
    </View>
  );
}

/** Keyboard focus ring and slim scrollbars for the desktop layout. */
export function DesktopStyles() {
  const t = useTheme();
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const el = document.createElement('style');
    el.textContent = `
      :focus-visible:not(input):not(textarea) { outline: 2px solid ${t.primary} !important; outline-offset: 2px; }
      * { scrollbar-width: thin; scrollbar-color: ${t.border} transparent; }
    `;
    document.head.appendChild(el);
    return () => el.remove();
  }, [t.primary, t.border]);
  return null;
}

// ------------------------------------------------------------------ page building blocks

/** The scrolling body of a desktop page. */
export function Page({ children, contentStyle }: { children: ReactNode; contentStyle?: StyleProp<ViewStyle> }) {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={[{ paddingHorizontal: space.xxl, paddingTop: space.xs, paddingBottom: 40 }, contentStyle]}>
      {children}
    </ScrollView>
  );
}

/** Responsive grid: as many columns of at least `min` px as fit. */
export function Grid({ min, gap = space.md, children, style }: { min: number; gap?: number; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))`, gap, alignItems: 'start' } as object, style]}>{children}</View>;
}

/** A titled block of a dashboard or board. */
export function Panel({ title, count, color, action, children, style, scroll }: { title: string; count?: number; color?: string; action?: ReactNode; children: ReactNode; style?: StyleProp<ViewStyle>; /** The body scrolls on its own (board columns). */ scroll?: boolean }) {
  const t = useTheme();
  const head = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.xs, marginBottom: space.md, minHeight: 24 }}>
      <Txt variant="overline" color={color ?? t.sub}>{title}</Txt>
      {count != null ? (
        <View style={{ paddingHorizontal: 7, paddingVertical: 1, borderRadius: radius.pill, backgroundColor: t.surface }}>
          <Txt variant="caption" color={color ?? t.sub} style={{ fontFamily: ui.bold }}>{count}</Txt>
        </View>
      ) : null}
      <View style={{ flex: 1 }} />
      {action}
    </View>
  );
  const box: StyleProp<ViewStyle> = [{ backgroundColor: t.surfaceAlt, borderRadius: radius.lg, padding: space.md, minWidth: 0 }, style];
  if (!scroll) return <View style={box}>{head}{children}</View>;
  return (
    <View style={box}>
      {head}
      <ScrollView style={{ flex: 1, marginHorizontal: -space.xs }} contentContainerStyle={{ gap: space.md, paddingHorizontal: space.xs, paddingBottom: space.xs }} showsVerticalScrollIndicator={false}>
        {children}
      </ScrollView>
    </View>
  );
}

/** Quiet line for an empty panel. */
export function Quiet({ children }: { children: ReactNode }) {
  return <Txt variant="label" sub style={{ paddingHorizontal: space.xs, paddingVertical: space.sm }}>{children}</Txt>;
}
