import { Dimensions, Platform, useWindowDimensions } from 'react-native';
import { usePaneItem } from './pane';

/** Below the desktop breakpoint the web app sits in a centred column of at most this width. */
export const MAX_APP_WIDTH = 760;
/** A browser window at least this wide gets the desktop layout (sidebar, full-width pages). */
export const DESKTOP_MIN = 1024;
export const SIDEBAR_WIDTH = 236;
export const PANE_WIDTH = 480;
/** From this window width the detail pane sits beside the page; below it, it slides over it. */
export const PANE_DOCK_MIN = 1500;

const desktopAt = (width: number) => Platform.OS === 'web' && width >= DESKTOP_MIN;

/** For code outside React (navigation helpers). Native apps are never "desktop". */
export const isDesktopNow = () => desktopAt(Dimensions.get('window').width);

/**
 * The one place that decides the layout.
 * - `desktop`: wide browser window. Phone-size windows and the native app get the phone layout.
 * - `pageWidth`: width available to the page itself (window minus sidebar and a docked detail pane).
 */
export function useLayout() {
  const { width, height } = useWindowDimensions();
  const paneOpen = usePaneItem() !== null;
  const desktop = desktopAt(width);
  const paneDocked = desktop && width >= PANE_DOCK_MIN;
  const pageWidth = desktop ? width - SIDEBAR_WIDTH - (paneDocked && paneOpen ? PANE_WIDTH : 0) : Math.min(width, MAX_APP_WIDTH);
  return { desktop, paneDocked, pageWidth, windowWidth: width, windowHeight: height };
}

/** Width of the app's own column on a phone layout (the window, capped in a browser). */
export function useAppWidth(): number {
  return useLayout().pageWidth;
}
