import { Ionicons } from '@expo/vector-icons';
import type { ColorValue } from 'react-native';
import { Tabs } from 'expo-router/js-tabs';
import { HeaderIcons } from '@/components/ui';
import { useItems } from '@/lib/data';
import { useTheme } from '@/lib/theme';

type IconName = keyof typeof Ionicons.glyphMap;
const icon = (name: IconName) =>
  function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Ionicons name={name} size={size} color={color as string} />;
  };

export default function TabsLayout() {
  const t = useTheme();
  const { items } = useItems();
  const inbox = items.filter((i) => i.needs_review).length;
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: t.card },
        headerTintColor: t.text,
        headerRight: () => <HeaderIcons />,
        tabBarStyle: { backgroundColor: t.card, borderTopColor: t.border },
        tabBarActiveTintColor: t.primary,
        tabBarInactiveTintColor: t.sub,
        sceneStyle: { backgroundColor: t.bg },
      }}>
      <Tabs.Screen name="index" options={{ title: 'আজ', tabBarIcon: icon('today-outline') }} />
      <Tabs.Screen name="tasks" options={{ title: 'কাজ', tabBarIcon: icon('checkmark-done-outline') }} />
      <Tabs.Screen
        name="inbox"
        options={{ title: 'Inbox', tabBarIcon: icon('file-tray-outline'), tabBarBadge: inbox > 0 ? inbox : undefined }}
      />
      <Tabs.Screen name="notes" options={{ title: 'নোট', tabBarIcon: icon('document-text-outline') }} />
      <Tabs.Screen name="files" options={{ title: 'ফাইল', tabBarIcon: icon('folder-outline') }} />
    </Tabs>
  );
}
