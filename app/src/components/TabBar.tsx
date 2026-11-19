import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Tabs } from 'expo-router/js-tabs';
import { elevation, radius, ui, useTheme } from '@/lib/theme';
import { Txt, styles, type IconName } from './ui';

type Props = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const TABS: Record<string, { label: string; icon: IconName; active: IconName }> = {
  index: { label: 'Today', icon: 'sunny-outline', active: 'sunny' },
  tasks: { label: 'Tasks', icon: 'checkmark-circle-outline', active: 'checkmark-circle' },
  inbox: { label: 'Inbox', icon: 'file-tray-outline', active: 'file-tray' },
  notes: { label: 'Notes', icon: 'reader-outline', active: 'reader' },
  library: { label: 'Library', icon: 'albums-outline', active: 'albums' },
};

/** Floating pill tab bar. */
export function TabBar({ state, emitter, navigateToTab, inboxCount }: Props & { inboxCount: number }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 14, paddingBottom: Math.max(insets.bottom, 12) }}>
      <View style={[{ flexDirection: 'row', backgroundColor: t.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: t.border, padding: 6 }, elevation(t, 2)]}>
        {state.routes.map((route, index) => {
          const tab = TABS[route.name];
          if (!tab) return null;
          const focused = state.index === index;
          const onPress = () => {
            const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!focused && !event.defaultPrevented) navigateToTab(route.key);
          };
          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={tab.label}
              style={({ pressed }) => [{ flex: 1, alignItems: 'center', gap: 2, paddingVertical: 7, borderRadius: radius.lg, backgroundColor: focused ? t.primarySoft : 'transparent' }, pressed && styles.pressed]}>
              <View>
                <Ionicons name={focused ? tab.active : tab.icon} size={22} color={focused ? t.primary : t.faint} />
                {route.name === 'inbox' && inboxCount > 0 ? (
                  <View style={{ position: 'absolute', top: -5, right: -11, minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 4, backgroundColor: t.dangerSolid, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: t.surface }}>
                    <Txt variant="overline" color="#FFFFFF" style={{ fontSize: 10, lineHeight: 12, letterSpacing: 0 }}>{inboxCount > 9 ? '9+' : inboxCount}</Txt>
                  </View>
                ) : null}
              </View>
              <Txt variant="caption" color={focused ? t.primary : t.sub} style={{ fontFamily: focused ? ui.bold : ui.semibold, fontSize: 11 }}>{tab.label}</Txt>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
