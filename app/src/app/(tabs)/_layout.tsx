import { Tabs } from 'expo-router/js-tabs';
import { TabBar } from '@/components/TabBar';
import { useData } from '@/lib/data';
import { useLayout } from '@/lib/layout';
import { useTheme } from '@/lib/theme';

export default function TabsLayout() {
  const t = useTheme();
  const { items } = useData();
  const inbox = items.filter((i) => i.needs_review).length;
  const { desktop } = useLayout();
  return (
    <Tabs tabBar={(props) => (desktop ? null : <TabBar {...props} inboxCount={inbox} />)} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: t.bg } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="tasks" />
      <Tabs.Screen name="inbox" />
      <Tabs.Screen name="notes" />
      <Tabs.Screen name="library" />
    </Tabs>
  );
}
