import { HindSiliguri_400Regular, HindSiliguri_500Medium, HindSiliguri_600SemiBold } from '@expo-google-fonts/hind-siliguri';
import {
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
} from '@expo-google-fonts/plus-jakarta-sans';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GalleryHost } from '@/components/Gallery';
import { Intro } from '@/components/Intro';
import { DesktopStyles, DetailPane, Sidebar } from '@/components/desktop';
import { MAX_APP_WIDTH, useLayout } from '@/lib/layout';
import { UpdateGate } from '@/components/UpdateGate';
import { AuthProvider, useAuth } from '@/lib/auth';
import { DataProvider } from '@/lib/data';
import { preloadPrefs } from '@/lib/prefs';
import { THEME_PREF_KEYS, useTheme } from '@/lib/theme';

// Keep the native splash up until fonts and the saved session are known, so the
// login screen never flashes for someone who is already signed in.
SplashScreen.preventAutoHideAsync().catch(() => {});

function Routes({ ready }: { ready: boolean }) {
  const { signedIn, loading } = useAuth();
  const t = useTheme();
  const [intro, setIntro] = useState(true);
  const hideNative = useCallback(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);
  const finish = useCallback(() => setIntro(false), []);
  const { desktop } = useLayout();
  // Desktop: sidebar, page, detail pane across the whole window. Otherwise one phone-width column.
  const shell = desktop && signedIn;

  if (!ready || loading) return null;
  return (
    <View style={[{ flex: 1, backgroundColor: t.surfaceAlt }, desktop ? { flexDirection: 'row' } : { alignItems: 'center' }]}>
    {shell ? <Sidebar /> : null}
    <View style={[{ flex: 1, backgroundColor: t.bg, overflow: 'hidden' }, desktop ? { minWidth: 0 } : { width: '100%', maxWidth: MAX_APP_WIDTH }]}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg }, animation: 'slide_from_right', animationDuration: 220 }}>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
          {/* A card opens into its detail: the detail rises and fades in over the list. */}
          <Stack.Screen name="item/[id]" options={{ animation: 'fade_from_bottom' }} />
          <Stack.Screen name="project/[tag]" options={{ animation: 'fade_from_bottom' }} />
          <Stack.Screen name="projects" />
          <Stack.Screen name="timeline" />
          <Stack.Screen name="search" options={{ animation: 'fade' }} />
          <Stack.Screen name="settings" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="login" />
        </Stack.Protected>
      </Stack>
      <GalleryHost />
    </View>
      {shell ? <DetailPane /> : null}
      {desktop ? <DesktopStyles /> : null}
      <UpdateGate />
      {intro ? <Intro onReady={hideNative} onDone={finish} /> : null}
    </View>
  );
}

export default function RootLayout() {
  const t = useTheme();
  const [prefsReady, setPrefsReady] = useState(false);
  const [loaded, fontError] = useFonts({
    HindSiliguri_400Regular,
    HindSiliguri_500Medium,
    HindSiliguri_600SemiBold,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });

  // The chosen theme and text size are read before the first screen shows, so it never flashes the defaults.
  useEffect(() => {
    preloadPrefs(THEME_PREF_KEYS).finally(() => setPrefsReady(true));
  }, []);
  // The window behind the screens matches the theme (visible during transitions and overscroll).
  useEffect(() => {
    SystemUI.setBackgroundColorAsync(t.bg).catch(() => {});
  }, [t.bg]);

  const navTheme = useMemo(() => {
    const base = t.dark ? DarkTheme : DefaultTheme;
    return { ...base, colors: { ...base.colors, background: t.bg, card: t.surface, text: t.text, border: t.border, primary: t.primary } };
  }, [t]);

  return (
    <SafeAreaProvider>
      <ThemeProvider value={navTheme}>
        <AuthProvider>
          <DataProvider>
            {/* A font that fails to load must not strand the user on the splash. */}
            <Routes ready={(loaded || !!fontError) && prefsReady} />
            <StatusBar style={t.dark ? 'light' : 'dark'} />
          </DataProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
