import { useWindowDimensions } from 'react-native';

/** On a wide browser window the app sits in a centred column of at most this width. */
export const MAX_APP_WIDTH = 760;

/** Width of the app's own column: the window on a phone, capped on a desktop browser. */
export function useAppWidth(): number {
  return Math.min(useWindowDimensions().width, MAX_APP_WIDTH);
}
