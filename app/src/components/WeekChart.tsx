import { View } from 'react-native';
import { WEEKDAY_SHORT, dayParts, todayNumber } from '@/lib/format';
import type { DayStat } from '@/lib/stats';
import { space, useTheme } from '@/lib/theme';
import { Txt } from './ui';

const HEIGHT = 84;

/**
 * Tasks received vs completed for each of the last seven days. The two series
 * differ in shape as well as colour: received is an outlined bar, completed a
 * solid one, so the chart reads without relying on colour.
 */
export function WeekChart({ days }: { days: DayStat[] }) {
  const t = useTheme();
  const max = Math.max(1, ...days.map((d) => Math.max(d.received, d.completed)));
  const totals = days.reduce((a, d) => ({ received: a.received + d.received, completed: a.completed + d.completed }), { received: 0, completed: 0 });
  const today = todayNumber();
  const bar = (n: number) => (n === 0 ? 3 : Math.max(8, Math.round((n / max) * HEIGHT)));

  return (
    <View
      style={{ gap: space.sm }}
      accessible
      accessibilityLabel={`Last 7 days: ${totals.received} tasks received, ${totals.completed} completed. ${days.map((d) => `${WEEKDAY_SHORT[dayParts(d.day).weekday]} ${d.received} received, ${d.completed} completed`).join('; ')}`}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 10, height: 10, borderRadius: 3, borderWidth: 2, borderColor: t.sub }} />
          <Txt variant="caption" sub>Received <Txt variant="caption" strong>{totals.received}</Txt></Txt>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: t.primaryBg }} />
          <Txt variant="caption" sub>Completed <Txt variant="caption" strong>{totals.completed}</Txt></Txt>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.sm }}>
        {days.map((d) => (
          <View key={d.day} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: HEIGHT + 16 }}>
              <View style={{ alignItems: 'center', gap: 2 }}>
                <Txt variant="caption" color={t.faint} style={{ fontSize: 10 * t.scale, lineHeight: 12 * t.scale }}>{d.received || ''}</Txt>
                <View style={{ width: 11, height: bar(d.received), borderRadius: 4, borderWidth: d.received ? 2 : 0, borderColor: t.sub, backgroundColor: d.received ? 'transparent' : t.border }} />
              </View>
              <View style={{ alignItems: 'center', gap: 2 }}>
                <Txt variant="caption" color={t.primary} strong style={{ fontSize: 10 * t.scale, lineHeight: 12 * t.scale }}>{d.completed || ''}</Txt>
                <View style={{ width: 11, height: bar(d.completed), borderRadius: 4, backgroundColor: d.completed ? t.primaryBg : t.border }} />
              </View>
            </View>
            <Txt variant="caption" color={d.day === today ? t.primary : t.faint} strong={d.day === today}>{d.day === today ? 'Today' : WEEKDAY_SHORT[dayParts(d.day).weekday]}</Txt>
          </View>
        ))}
      </View>
    </View>
  );
}
