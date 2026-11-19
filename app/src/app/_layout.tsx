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
import { useCallback, useState } from 'react';
import { View, useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Intro } from '@/components/Intro';
import { AuthProvider, useAuth } from '@/lib/auth';
import { DataProvider } from '@/lib/data';
import { useTheme } from '@/lib/theme';

// Keep the native splash up until fonts and the saved session are known, so the
// login screen never flashes for someone who is already signed in.
SplashScreen.preventAutoHideAsync().catch(() => {});

function Routes({ fontsReady }: { fontsReady: boolean }) {
  const { signedIn, loading } = useAuth();
  const t = useTheme();
  const [intro, setIntro] = useState(true);
  const hideNative = useCallback(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);
  const finish = useCallback(() => setIntro(false), []);

  if (!fontsReady || loading) return null;
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }}>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="item/[id]" />
          <Stack.Screen name="search" />
          <Stack.Screen name="settings" />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="login" />
        </Stack.Protected>
      </Stack>
      {intro ? <Intro onReady={hideNative} onDone={finish} /> : null}
    </View>
  );
}

export default function RootLayout() {
  const scheme = useColorScheme();
  const [loaded, fontError] = useFonts({
    HindSiliguri_400Regular,
    HindSiliguri_500Medium,
    HindSiliguri_600SemiBold,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
  });
  return (
    <SafeAreaProvider>
      <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AuthProvider>
          <DataProvider>
            {/* A font that fails to load must not strand the user on the splash. */}
            <Routes fontsReady={loaded || !!fontError} />
            <StatusBar style="auto" />
          </DataProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
