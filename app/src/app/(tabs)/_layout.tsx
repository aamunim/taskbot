import { Tabs } from 'expo-router/js-tabs';
import { TabBar } from '@/components/TabBar';
import { useData } from '@/lib/data';
import { useTheme } from '@/lib/theme';

export default function TabsLayout() {
  const t = useTheme();
  const { items } = useData();
  const inbox = items.filter((i) => i.needs_review).length;
  return (
    <Tabs tabBar={(props) => <TabBar {...props} inboxCount={inbox} />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: t.bg } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="tasks" />
      <Tabs.Screen name="inbox" />
      <Tabs.Screen name="notes" />
      <Tabs.Screen name="library" />
    </Tabs>
  );
}
