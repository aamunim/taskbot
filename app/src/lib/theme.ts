import { useColorScheme } from 'react-native';

/** Latin UI face. */
export const ui = {
  medium: 'PlusJakartaSans_500Medium',
  semibold: 'PlusJakartaSans_600SemiBold',
  bold: 'PlusJakartaSans_700Bold',
  extrabold: 'PlusJakartaSans_800ExtraBold',
} as const;

/** Content face: covers Bengali and Latin, used for anything people wrote. */
export const content = {
  regular: 'HindSiliguri_400Regular',
  medium: 'HindSiliguri_500Medium',
  semibold: 'HindSiliguri_600SemiBold',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 } as const;
export const radius = { sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;

const light = {
  dark: false,
  bg: '#F4F3FA',
  surface: '#FFFFFF',
  surfaceAlt: '#ECEAF6',
  text: '#16142B',
  sub: '#5C5977',
  faint: '#8B88A3',
  border: '#E3E1EF',
  primary: '#4338CA',
  primaryBg: '#4338CA',
  primarySoft: '#E8E6FB',
  onPrimary: '#FFFFFF',
  boss: '#A64B05',
  bossSolid: '#F59E0B',
  bossSoft: '#FDEFD6',
  me: '#0B6B63',
  meSolid: '#14B8A6',
  meSoft: '#D8F3EF',
  danger: '#C01C3C',
  dangerSolid: '#E11D48',
  dangerSoft: '#FCE7EC',
  success: '#157A3E',
  successSoft: '#DFF5E6',
  star: '#E5A100',
  shadow: '#2A2466',
  hero: ['#2E2A86', '#4A3FDB', '#7B4BE8'] as [string, string, string],
  overlay: 'rgba(15, 12, 40, 0.45)',
};

const dark: typeof light = {
  dark: true,
  bg: '#0E0D1A',
  surface: '#19172D',
  surfaceAlt: '#24213F',
  text: '#F3F2FB',
  sub: '#ACA9C6',
  faint: '#807D9C',
  border: '#2E2B4B',
  primary: '#AFB8FF',
  primaryBg: '#5548E6',
  primarySoft: '#27244F',
  onPrimary: '#FFFFFF',
  boss: '#FBBF4A',
  bossSolid: '#F59E0B',
  bossSoft: '#3A2A0E',
  me: '#5FE3D0',
  meSolid: '#14B8A6',
  meSoft: '#0F3632',
  danger: '#FF8096',
  dangerSolid: '#F43F5E',
  dangerSoft: '#40141F',
  success: '#6EDC96',
  successSoft: '#12351F',
  star: '#F5C445',
  shadow: '#000000',
  hero: ['#1F1B5E', '#3B31B8', '#6B3FD0'] as [string, string, string],
  overlay: 'rgba(0, 0, 0, 0.6)',
};

export type Theme = typeof light;
export const useTheme = (): Theme => (useColorScheme() === 'dark' ? dark : light);

/** Soft card elevation; borders carry the edge in dark mode where shadows vanish. */
export const elevation = (t: Theme, level: 1 | 2 = 1) =>
  ({
    shadowColor: t.shadow,
    shadowOpacity: t.dark ? 0 : level === 1 ? 0.06 : 0.12,
    shadowRadius: level === 1 ? 10 : 20,
    shadowOffset: { width: 0, height: level === 1 ? 3 : 8 },
    elevation: t.dark ? 0 : level === 1 ? 2 : 6,
  }) as const;

export const SPLASH_BG = { light: '#3B32C4', dark: '#0E0D1A' } as const;

/** Removes the browser focus ring from text inputs on web (the field's own border shows focus). */
export const noOutline = { outlineStyle: 'none' } as object;
