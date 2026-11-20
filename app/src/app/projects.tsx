import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { openProject } from '@/components/items';
import { Appear } from '@/components/motion';
import { Card, Empty, Skeleton, TopBar, Txt, styles } from '@/components/ui';
import { Grid, Page } from '@/components/desktop';
import { useData } from '@/lib/data';
import { useLayout } from '@/lib/layout';
import { fmtDate, plural } from '@/lib/format';
import { projects } from '@/lib/stats';
import { space, useTheme } from '@/lib/theme';

/** One project per tag the AI gave to tasks and notes. */
export default function Projects() {
  const t = useTheme();
  const { items, loading } = useData();
  const list = useMemo(() => projects(items), [items]);
  const { desktop } = useLayout();

  const projectCard = (p: (typeof list)[number]) => {
          const tasks = p.total - p.notes;
          const done = tasks - p.open;
    return (
      <Card onPress={() => openProject(p.tag)} style={{ gap: space.md }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                  <View style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: t.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="folder-open" size={21} color={t.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Txt variant="heading" content numberOfLines={1}>#{p.tag}</Txt>
                    <Txt variant="caption" sub>Last activity {fmtDate(p.lastActivity).toLowerCase()}</Txt>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={t.faint} />
                </View>
                <View style={{ flexDirection: 'row', gap: space.lg, alignItems: 'center' }}>
                  <Txt variant="label" color={p.open ? t.text : t.sub} strong={p.open > 0}>{p.open ? `${p.open} open` : 'Nothing open'}</Txt>
                  {tasks ? <Txt variant="label" sub>{done} of {plural(tasks, 'task')} done</Txt> : null}
                  {p.notes ? <Txt variant="label" sub>{plural(p.notes, 'note')}</Txt> : null}
                </View>
                {tasks ? (
                  <View style={{ height: 5, borderRadius: 3, backgroundColor: t.surfaceAlt, overflow: 'hidden' }} accessibilityLabel={`${done} of ${tasks} tasks done`}>
                    <View style={{ width: `${Math.round((done / tasks) * 100)}%`, height: 5, borderRadius: 3, backgroundColor: done === tasks ? t.success : t.primaryBg }} />
                  </View>
                ) : null}
              </Card>
    );
  };

  if (desktop) {
    return (
      <View style={{ flex: 1 }}>
        <TopBar title="Projects" noBack />
        <Page contentStyle={{ gap: space.lg }}>
          <Txt variant="label" sub>Tasks, notes, files and links grouped by the topic tags the AI gives them.</Txt>
          {loading ? <Skeleton /> : null}
          {!loading && !list.length ? <Empty icon="folder-open-outline" title="No projects yet" text="Projects appear once tasks and notes have topic tags." /> : null}
          <Grid min={340} gap={space.lg}>{list.map((p) => <View key={p.tag}>{projectCard(p)}</View>)}</Grid>
        </Page>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <TopBar title="Projects" />
      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: 48, gap: space.md }]}>
        <Txt variant="label" sub style={{ paddingHorizontal: 2 }}>Tasks, notes, files and links grouped by the topic tags the AI gives them.</Txt>
        {loading ? <Skeleton /> : null}
        {!loading && !list.length ? <Empty icon="folder-open-outline" title="No projects yet" text="Projects appear once tasks and notes have topic tags." /> : null}
        {list.map((p, i) => <Appear key={p.tag} index={i}>{projectCard(p)}</Appear>)}
      </ScrollView>
    </View>
  );
}
