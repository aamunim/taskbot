import { dayNumber, todayNumber } from './format';
import type { Item } from './types';

/** A task counts as finished on time if it was completed no later than its deadline. */
function onTime(i: Item): boolean {
  if (i.status !== 'done' || !i.completed_at || !i.due_at) return false;
  if (i.due_all_day) return dayNumber(i.completed_at) <= dayNumber(i.due_at);
  return new Date(i.completed_at).getTime() <= new Date(i.due_at).getTime();
}

/**
 * Streak: the number of days in a row, counting back from today, on which every
 * task due that day was finished on time.
 *  - A day with nothing due neither adds to the streak nor breaks it.
 *  - A past day with any task that was late, or is still open, ends the streak.
 *  - Today adds a day once everything due today is done; until then it is simply
 *    not counted yet (the day is not over).
 *  - Tasks handed over and waiting on the boss are not held against the owner.
 */
export function streak(items: Item[]): number {
  const today = todayNumber();
  const byDay = new Map<number, Item[]>();
  for (const i of items) {
    if (i.type !== 'task' || !i.due_at || i.status === 'waiting') continue;
    const d = dayNumber(i.due_at);
    byDay.set(d, [...(byDay.get(d) ?? []), i]);
  }
  let count = 0;
  for (let d = today; d > today - 90; d--) {
    const due = byDay.get(d);
    if (!due) continue;
    const allOnTime = due.every(onTime);
    if (allOnTime) count++;
    else if (d === today) continue;
    else break;
  }
  return count;
}

export type DayStat = { day: number; received: number; completed: number };

/** Tasks received (created) and completed on each of the last seven days, oldest first. */
export function lastWeek(items: Item[]): DayStat[] {
  const today = todayNumber();
  const days: DayStat[] = Array.from({ length: 7 }, (_, k) => ({ day: today - 6 + k, received: 0, completed: 0 }));
  for (const i of items) {
    if (i.type !== 'task') continue;
    const created = dayNumber(i.created_at) - (today - 6);
    if (created >= 0 && created < 7) days[created].received++;
    if (i.completed_at) {
      const done = dayNumber(i.completed_at) - (today - 6);
      if (done >= 0 && done < 7) days[done].completed++;
    }
  }
  return days;
}

export type Project = { tag: string; total: number; open: number; notes: number; lastActivity: string };

/** Projects are the tags the AI puts on items: one project per tag. */
export function projects(items: Item[]): Project[] {
  const map = new Map<string, Project>();
  for (const i of items) {
    if (i.needs_review) continue;
    for (const tag of i.tags) {
      const p = map.get(tag) ?? { tag, total: 0, open: 0, notes: 0, lastActivity: i.updated_at };
      p.total++;
      if (i.type === 'task' && i.status !== 'done') p.open++;
      if (i.type === 'note') p.notes++;
      if (i.updated_at > p.lastActivity) p.lastActivity = i.updated_at;
      map.set(tag, p);
    }
  }
  return [...map.values()].sort((a, b) => b.open - a.open || b.lastActivity.localeCompare(a.lastActivity));
}
