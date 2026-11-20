import { useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { usePref } from './prefs';

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

// ------------------------------------------------------------------ settings

export type Accent = 'indigo' | 'ocean' | 'forest';
export type Appearance = 'system' | 'light' | 'dark' | 'black';
export type TextSize = 'small' | 'default' | 'large';

export const PREF_ACCENT = 'theme:accent';
export const PREF_APPEARANCE = 'theme:appearance';
export const PREF_TEXT_SIZE = 'theme:textSize';
export const PREF_DENSITY = 'theme:density';
export const THEME_PREF_KEYS = [PREF_ACCENT, PREF_APPEARANCE, PREF_TEXT_SIZE, PREF_DENSITY];

/** How much room a task takes in a list: a full card, or one line. */
export type Density = 'comfortable' | 'compact';
export const DENSITIES: { value: Density; label: string }[] = [
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'compact', label: 'Compact' },
];
export const useDensity = (): Density => usePref<Density>(PREF_DENSITY, 'comfortable')[0];

export const ACCENTS: { value: Accent; label: string; swatch: string }[] = [
  { value: 'indigo', label: 'Indigo', swatch: '#4338CA' },
  { value: 'ocean', label: 'Ocean', swatch: '#1D4ED8' },
  { value: 'forest', label: 'Forest', swatch: '#1E7A34' },
];
export const APPEARANCES: { value: Appearance; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'black', label: 'Black' },
];
export const TEXT_SIZES: { value: TextSize; label: string }[] = [
  { value: 'small', label: 'Small' },
  { value: 'default', label: 'Default' },
  { value: 'large', label: 'Large' },
];
const SCALE: Record<TextSize, number> = { small: 0.92, default: 1, large: 1.14 };

// ------------------------------------------------------------------ palettes

/** Colours that do not depend on the accent. Role colours are the same in every theme. */
const lightBase = {
  dark: false,
  text: '#16142B',
  sub: '#5C5977',
  faint: '#8B88A3',
  surface: '#FFFFFF',
  onPrimary: '#FFFFFF',
  /** Top edge of a card: a faint highlight in dark modes, where shadows cannot be seen. */
  edge: 'transparent',
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
  overlay: 'rgba(15, 12, 40, 0.45)',
};
const darkBase: typeof lightBase = {
  dark: true,
  text: '#F3F2FB',
  sub: '#ACA9C6',
  faint: '#807D9C',
  surface: '#19172D',
  onPrimary: '#FFFFFF',
  edge: 'rgba(255, 255, 255, 0.09)',
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
  overlay: 'rgba(0, 0, 0, 0.68)',
};

type Tint = {
  bg: string;
  surface: string;
  /** Things that float above cards: sheets, dialogs, the tab bar, toasts. */
  raised: string;
  surfaceAlt: string;
  border: string;
  primary: string;
  primaryBg: string;
  primarySoft: string;
  shadow: string;
  hero: [string, string, string];
};

const TINTS: Record<Accent, { light: Tint; dark: Tint }> = {
  indigo: {
    light: { bg: '#F4F3FA', surface: '#FFFFFF', raised: '#FFFFFF', surfaceAlt: '#ECEAF6', border: '#E3E1EF', primary: '#4338CA', primaryBg: '#4338CA', primarySoft: '#E8E6FB', shadow: '#2A2466', hero: ['#2E2A86', '#4A3FDB', '#7B4BE8'] },
    dark: { bg: '#0B0A16', surface: '#1A1831', raised: '#24213F', surfaceAlt: '#2A2749', border: '#3A3760', primary: '#AFB8FF', primaryBg: '#5548E6', primarySoft: '#27244F', shadow: '#000000', hero: ['#1F1B5E', '#3B31B8', '#6B3FD0'] },
  },
  ocean: {
    light: { bg: '#F1F5FB', surface: '#FFFFFF', raised: '#FFFFFF', surfaceAlt: '#E6EDF8', border: '#DCE4F1', primary: '#1D4ED8', primaryBg: '#1D4ED8', primarySoft: '#E0EAFF', shadow: '#16306B', hero: ['#1B3A8C', '#2563EB', '#3B9BF2'] },
    dark: { bg: '#070C19', surface: '#141C33', raised: '#1D2742', surfaceAlt: '#232E4C', border: '#33405F', primary: '#9CC2FF', primaryBg: '#2F6BEB', primarySoft: '#17294F', shadow: '#000000', hero: ['#12255C', '#1D4ED8', '#2B86DE'] },
  },
  forest: {
    light: { bg: '#F2F6F2', surface: '#FFFFFF', raised: '#FFFFFF', surfaceAlt: '#E6EFE7', border: '#DAE5DC', primary: '#1E7A34', primaryBg: '#1E7A34', primarySoft: '#E0F2E3', shadow: '#17402A', hero: ['#14532D', '#1E7A34', '#43A655'] },
    dark: { bg: '#070E0A', surface: '#15211A', raised: '#1E2D24', surfaceAlt: '#24352A', border: '#34483A', primary: '#8BE0A3', primaryBg: '#2A8F45', primarySoft: '#143220', shadow: '#000000', hero: ['#0E3B20', '#1E7A34', '#2F9A4A'] },
  },
};

/** True black for OLED screens: the accent's dark colours on black surfaces. */
const BLACK = { bg: '#000000', surface: '#111116', raised: '#1B1B22', surfaceAlt: '#202029', border: '#32323D' };

function build(accent: Accent, appearance: Exclude<Appearance, 'system'>, scale: number) {
  const dark = appearance !== 'light';
  const tint = TINTS[accent][dark ? 'dark' : 'light'];
  return { ...(dark ? darkBase : lightBase), ...tint, ...(appearance === 'black' ? BLACK : {}), scale, accent, appearance };
}

export type Theme = ReturnType<typeof build>;

export function useTheme(): Theme {
  const system = useColorScheme() === 'dark' ? 'dark' : 'light';
  const [accent] = usePref<Accent>(PREF_ACCENT, 'indigo');
  const [appearance] = usePref<Appearance>(PREF_APPEARANCE, 'system');
  const [size] = usePref<TextSize>(PREF_TEXT_SIZE, 'default');
  return useMemo(
    () => build(TINTS[accent] ? accent : 'indigo', appearance === 'system' ? system : appearance, SCALE[size] ?? 1),
    [accent, appearance, size, system],
  );
}

/**
 * Soft card elevation. In dark modes a shadow cannot be seen against the
 * background, so depth comes from the layered surface shades, a visible
 * hairline and a faint highlight along the top edge instead.
 */
export const elevation = (t: Theme, level: 1 | 2 = 1) =>
  t.dark
    ? ({ shadowOpacity: 0, elevation: 0, borderWidth: 1, borderColor: t.border, borderTopColor: t.edge } as const)
    : ({
        shadowColor: t.shadow,
        shadowOpacity: level === 1 ? 0.06 : 0.12,
        shadowRadius: level === 1 ? 10 : 20,
        shadowOffset: { width: 0, height: level === 1 ? 3 : 8 },
        elevation: level === 1 ? 2 : 6,
      } as const);

export const SPLASH_BG = { light: '#3B32C4', dark: '#0E0D1A' } as const;

/** Removes the browser focus ring from text inputs on web (the field's own border shows focus). */
export const noOutline = { outlineStyle: 'none' } as object;
