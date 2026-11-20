import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import * as api from '@/lib/api';
import { useData } from '@/lib/data';
import { success, tap } from '@/lib/haptics';
import { content, noOutline, space, useTheme } from '@/lib/theme';
import type { Subtask } from '@/lib/types';
import { StepsProgress } from './items';
import { Card, Txt, styles } from './ui';

/**
 * The steps inside a task. Every change is saved straight away (it is not part
 * of the "Save changes" draft), and the task's card count is kept in step.
 */
export function Checklist({ itemId, refreshKey }: { itemId: string; refreshKey?: string }) {
  const t = useTheme();
  const { patchLocal, version } = useData();
  const [steps, setSteps] = useState<Subtask[]>([]);
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await api.fetchSubtasks(itemId);
    if (res.error) setError(res.error);
    else setSteps(res.data);
  }, [itemId]);

  // Reload when the bot adds suggested steps or another device changes them.
  useEffect(() => {
    load();
  }, [load, version, refreshKey]);

  const apply = (next: Subtask[]) => {
    setSteps(next);
    patchLocal(itemId, { steps_total: next.length, steps_done: next.filter((x) => x.done).length });
  };
  const fail = (err: string | null) => {
    if (!err) return;
    setError(err);
    load();
  };

  const toggle = async (s: Subtask) => {
    if (!s.done) success();
    else tap();
    apply(steps.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)));
    fail(await api.updateSubtask(s.id, { done: !s.done }));
  };
  const rename = async () => {
    if (!editing) return;
    const title = editing.title.trim();
    const before = steps.find((x) => x.id === editing.id);
    setEditing(null);
    if (!before || !title || title === before.title) return;
    apply(steps.map((x) => (x.id === before.id ? { ...x, title } : x)));
    fail(await api.updateSubtask(before.id, { title }));
  };
  const remove = async (s: Subtask) => {
    tap();
    apply(steps.filter((x) => x.id !== s.id));
    fail(await api.deleteSubtask(s.id));
  };
  const move = async (index: number, by: -1 | 1) => {
    const other = index + by;
    if (other < 0 || other >= steps.length) return;
    tap();
    const next = [...steps];
    [next[index], next[other]] = [next[other], next[index]];
    // Renumber so positions are always distinct, then save the rows that changed.
    const renumbered = next.map((x, i) => ({ ...x, position: i }));
    apply(renumbered);
    const changed = renumbered.filter((x) => steps.find((y) => y.id === x.id)?.position !== x.position);
    const results = await Promise.all(changed.map((x) => api.updateSubtask(x.id, { position: x.position })));
    fail(results.find((r) => r) ?? null);
  };
  const add = async () => {
    const title = draft.trim();
    if (!title) return;
    setDraft('');
    const position = steps.length ? Math.max(...steps.map((x) => x.position)) + 1 : 0;
    const res = await api.addSubtask(itemId, title, position);
    if (res.error || !res.data) return fail(res.error ?? 'Could not add the step');
    apply([...steps, res.data]);
  };

  const input = { flex: 1, color: t.text, fontFamily: content.regular, fontSize: 16 * t.scale, lineHeight: 24 * t.scale, padding: 0, ...noOutline } as const;
  const done = steps.filter((x) => x.done).length;

  return (
    <Card style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <Txt variant="overline" sub style={{ flex: 1 }}>Checklist</Txt>
        {steps.length ? <View style={{ width: 150 }}><StepsProgress done={done} total={steps.length} /></View> : null}
      </View>
      {error ? <Txt variant="caption" color={t.danger}>Could not save: {error}</Txt> : null}

      {steps.map((s, i) => (
        <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, minHeight: 36 }}>
          <Pressable onPress={() => toggle(s)} hitSlop={8} accessibilityRole="checkbox" accessibilityState={{ checked: s.done }} accessibilityLabel={s.title} style={({ pressed }) => pressed && styles.pressed}>
            <View style={{ width: 24, height: 24, borderRadius: 8, borderWidth: s.done ? 0 : 2, borderColor: t.faint, backgroundColor: s.done ? t.success : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
              {s.done ? <Ionicons name="checkmark" size={16} color={t.dark ? '#0E0D1A' : '#FFFFFF'} /> : null}
            </View>
          </Pressable>
          {editing?.id === s.id ? (
            <TextInput value={editing.title} onChangeText={(title) => setEditing({ id: s.id, title })} onBlur={rename} onSubmitEditing={rename} autoFocus returnKeyType="done" style={input} />
          ) : (
            <Pressable onPress={() => setEditing({ id: s.id, title: s.title })} style={{ flex: 1 }} accessibilityRole="button" accessibilityLabel={`Rename step: ${s.title}`}>
              <Txt content style={s.done ? { textDecorationLine: 'line-through', color: t.faint } : undefined}>{s.title}</Txt>
            </Pressable>
          )}
          <StepBtn icon="chevron-up" label="Move step up" disabled={i === 0} onPress={() => move(i, -1)} />
          <StepBtn icon="chevron-down" label="Move step down" disabled={i === steps.length - 1} onPress={() => move(i, 1)} />
          <StepBtn icon="close" label="Delete step" onPress={() => remove(s)} />
        </View>
      ))}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, borderTopWidth: steps.length ? 1 : 0, borderTopColor: t.border, paddingTop: steps.length ? space.md : 0 }}>
        <Ionicons name="add" size={22} color={t.primary} />
        <TextInput value={draft} onChangeText={setDraft} onSubmitEditing={add} blurOnSubmit={false} placeholder="Add a step" placeholderTextColor={t.faint} returnKeyType="done" style={input} />
        {draft.trim() ? (
          <Pressable onPress={add} hitSlop={8} accessibilityRole="button" accessibilityLabel="Add step" style={({ pressed }) => pressed && styles.pressed}>
            <Txt variant="label" color={t.primary} strong>Add</Txt>
          </Pressable>
        ) : null}
      </View>
    </Card>
  );
}

function StepBtn({ icon, label, onPress, disabled }: { icon: 'chevron-up' | 'chevron-down' | 'close'; label: string; onPress: () => void; disabled?: boolean }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={6} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.25 : 1 }, pressed && styles.pressed]}>
      <Ionicons name={icon} size={17} color={t.sub} />
    </Pressable>
  );
}
