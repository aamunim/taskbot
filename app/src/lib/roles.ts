import type { AppConfig, Role, RoleFilter } from './types';
import type { Theme } from './theme';

type Who = Pick<AppConfig, 'owner_tg_id' | 'boss_tg_id'> | null;

/**
 * Whose is it? Mine if I sent it. The boss's if the configured boss sent it, or,
 * until a boss is chosen, if anyone other than me sent it.
 */
export function roleOf(senderId: number | null | undefined, cfg: Who): Role {
  if (senderId == null || !cfg) return 'other';
  if (cfg.owner_tg_id != null && senderId === cfg.owner_tg_id) return 'me';
  if (cfg.boss_tg_id != null) return senderId === cfg.boss_tg_id ? 'boss' : 'other';
  return 'boss';
}

export const matchesRole = (role: Role, filter: RoleFilter) => filter === 'all' || role === filter;

export const ROLE_LABEL: Record<Role, string> = { boss: 'Boss', me: 'Me', other: 'Other' };

export function roleColors(t: Theme, role: Role) {
  if (role === 'boss') return { fg: t.boss, bg: t.bossSoft, solid: t.bossSolid };
  if (role === 'me') return { fg: t.me, bg: t.meSoft, solid: t.meSolid };
  return { fg: t.sub, bg: t.surfaceAlt, solid: t.faint };
}
