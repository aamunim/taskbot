import { useColorScheme } from 'react-native';

const light = {
  bg: '#F4F5F7',
  card: '#FFFFFF',
  text: '#16181D',
  sub: '#667085',
  border: '#E3E6EB',
  primary: '#1F6FEB',
  onPrimary: '#FFFFFF',
  danger: '#D92D20',
  dangerBg: '#FEECEB',
  warn: '#B54708',
  success: '#12805C',
  chip: '#EDF0F4',
};

const dark: typeof light = {
  bg: '#0E1013',
  card: '#191C21',
  text: '#F1F3F5',
  sub: '#98A2B3',
  border: '#2A2E36',
  primary: '#5B9DFF',
  onPrimary: '#0B1220',
  danger: '#FF6B5E',
  dangerBg: '#3A1614',
  warn: '#F5A524',
  success: '#3DD9A0',
  chip: '#252930',
};

export type Theme = typeof light;
export const useTheme = (): Theme => (useColorScheme() === 'dark' ? dark : light);
