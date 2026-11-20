import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Pressable, View } from 'react-native';
import { useData } from '@/lib/data';
import { MONTH_NAMES, WEEKDAY_SHORT, dayNumber, dayOf, dayParts, fmtDayLong, isOverdue, todayNumber } from '@/lib/format';
import { tap } from '@/lib/haptics';
import { roleColors } from '@/lib/roles';
import { radius, space, useTheme } from '@/lib/theme';
import type { Item, Role } from '@/lib/types';
import { Card, IconBtn, Txt, styles } from './ui';

const ROLE_ORDER: Role[] = ['boss', 'me', 'other'];

/**
 * A month of deadlines. Each day shows up to three dots, one per kind of sender
 * with something due (boss, me, other); a filled red corner marks a day that has
 * an overdue task. `month` is the Dhaka day number of the first of the month.
 */
export function MonthCalendar({ tasks, month, onMonth, selected, onSelect }: {
  tasks: Item[];
  month: { year: number; month: number };
  onMonth: (m: { year: number; month: number }) => void;
  selected: number;
  onSelect: (day: number) => void;
}) {
  const t = useTheme();
  const { role } = useData();
  const today = todayNumber();

  const byDay = useMemo(() => {
    const map = new Map<number, { roles: Set<Role>; open: number; late: boolean }>();
    for (const i of tasks) {
      if (!i.due_at) continue;
      const d = dayNumber(i.due_at);
      const e = map.get(d) ?? { roles: new Set<Role>(), open: 0, late: false };
      const isOpen = i.status === 'todo' || i.status === 'doing';
      if (isOpen) {
        e.roles.add(role(i.source_sender_tg_id));
        e.open++;
        if (isOverdue(i)) e.late = true;
      }
      map.set(d, e);
    }
    return map;
  }, [tasks, role, today]);

  const first = dayOf(month.year, month.month, 1);
  const lead = dayParts(first).weekday;
  const count = dayParts(dayOf(month.year, month.month + 1, 0)).date;
  const cells: (number | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: count }, (_, k) => first + k)];
  while (cells.length % 7) cells.push(null);
  const shift = (by: number) => {
    const d = new Date(Date.UTC(month.year, month.month + by, 1));
    onMonth({ year: d.getUTCFullYear(), month: d.getUTCMonth() });
  };
  const thisMonth = dayParts(today);

  return (
    <Card style={{ padding: space.md, gap: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <Txt variant="heading" style={{ flex: 1, paddingLeft: 4 }}>{MONTH_NAMES[month.month]} {month.year}</Txt>
        {month.year !== thisMonth.year || month.month !== thisMonth.month ? (
          <Pressable
            onPress={() => {
              onMonth({ year: thisMonth.year, month: thisMonth.month });
              onSelect(today);
            }}
            accessibilityRole="button"
            style={({ pressed }) => [{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: t.primarySoft }, pressed && styles.pressed]}>
            <Txt variant="caption" color={t.primary} strong>Today</Txt>
          </Pressable>
        ) : null}
        <IconBtn icon="chevron-back" label="Previous month" onPress={() => shift(-1)} size={34} />
        <IconBtn icon="chevron-forward" label="Next month" onPress={() => shift(1)} size={34} />
      </View>

      <View style={{ flexDirection: 'row' }}>
        {WEEKDAY_SHORT.map((d) => (
          <View key={d} style={{ flex: 1, alignItems: 'center', paddingVertical: 4 }}>
            <Txt variant="overline" color={t.faint}>{d}</Txt>
          </View>
        ))}
      </View>

      {Array.from({ length: cells.length / 7 }, (_, row) => (
        <View key={row} style={{ flexDirection: 'row' }}>
          {cells.slice(row * 7, row * 7 + 7).map((day, col) => {
            if (day == null) return <View key={col} style={{ flex: 1, height: 46 }} />;
            const info = byDay.get(day);
            const isSel = day === selected;
            const isToday = day === today;
            const label = `${fmtDayLong(day)}${info?.open ? `, ${info.open} due` : ''}`;
            return (
              <Pressable
                key={col}
                onPress={() => {
                  tap();
                  onSelect(day);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: isSel }}
                accessibilityLabel={label}
                style={{ flex: 1, height: 46, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: isSel ? t.primaryBg : 'transparent', borderWidth: isToday && !isSel ? 1.5 : 0, borderColor: t.primary }}>
                  <Txt variant="label" color={isSel ? t.onPrimary : isToday ? t.primary : day < today ? t.faint : t.text} strong={isToday || isSel}>{dayParts(day).date}</Txt>
                </View>
                <View style={{ position: 'absolute', bottom: 0, flexDirection: 'row', gap: 3, height: 6 }}>
                  {info ? ROLE_ORDER.filter((r) => info.roles.has(r)).map((r) => <View key={r} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: roleColors(t, r).solid }} />) : null}
                </View>
                {info?.late ? <Ionicons name="alert-circle-outline" size={11} color={t.dangerSolid} style={{ position: 'absolute', top: 2, right: '14%' }} /> : null}
              </Pressable>
            );
          })}
        </View>
      ))}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.md, paddingTop: space.xs, paddingHorizontal: 4 }}>
        <Legend color={t.bossSolid} label="Boss" />
        <Legend color={t.meSolid} label="Me" />
        <Legend color={t.faint} label="Other" />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Ionicons name="alert-circle-outline" size={11} color={t.dangerSolid} />
          <Txt variant="caption" sub>Overdue</Txt>
        </View>
      </View>
    </Card>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
      <Txt variant="caption" sub>{label}</Txt>
    </View>
  );
}
