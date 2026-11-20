import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Logo } from '@/components/Logo';
import { Btn, Txt, type IconName } from '@/components/ui';
import { useAuth } from '@/lib/auth';
import { DEMO } from '@/lib/demo';
import { isConfigured, pollLogin, startLogin, supabase } from '@/lib/supabase';
import { radius, space, useTheme } from '@/lib/theme';

type Pending = { code: string; secret: string; url: string };
const GLASS = 'rgba(255,255,255,0.14)';
const SOFT = 'rgba(255,255,255,0.82)';

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  { icon: 'chatbubbles', title: 'Nothing gets lost', text: 'Every message, file and voice note from the group is kept.' },
  { icon: 'sparkles', title: 'Sorted for you', text: 'Tasks, deadlines and notes are picked out automatically.' },
  { icon: 'people', title: 'Boss and you, apart', text: 'See what was asked of you and what you promised.' },
];

export default function Login() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { demoSignIn } = useAuth();
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const checking = useRef(false);

  const check = useCallback(async (p: Pending) => {
    if (checking.current) return;
    checking.current = true;
    try {
      const res = await pollLogin(p.code, p.secret);
      if (res.status === 'ok') {
        const { error } = await supabase.auth.verifyOtp({ token_hash: res.token_hash, type: 'email' });
        if (error) {
          setPending(null);
          setMessage('Sign-in could not be completed. Please try again.');
        }
        // On success the auth listener swaps this screen out.
      } else if (res.status === 'expired') {
        setPending(null);
        setMessage('That took too long. Please try again.');
      } else if (res.status === 'denied') {
        setPending(null);
        setMessage('This Telegram account is not allowed to use this app.');
      }
    } catch {
      // Network hiccup: keep polling.
    } finally {
      checking.current = false;
    }
  }, []);

  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => check(pending), 2000);
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') check(pending);
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [pending, check]);

  const begin = async () => {
    if (DEMO) return demoSignIn();
    setBusy(true);
    setMessage(null);
    // A browser only allows a new tab opened directly by the click, so open it before the request.
    const tab = Platform.OS === 'web' ? window.open('', '_blank') : null;
    try {
      const p = await startLogin();
      setPending(p);
      if (tab) tab.location.href = p.url;
      else await Linking.openURL(p.url);
    } catch {
      tab?.close();
      setMessage('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <LinearGradient colors={t.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.xl, paddingHorizontal: space.xl + 4 }}>
      <View style={{ flex: 1, justifyContent: 'center', gap: space.xxl }}>
        <View style={{ gap: space.md }}>
          <Logo size={88} cut={t.hero[1]} />
          <Txt variant="display" color="#FFFFFF" style={{ fontSize: 36, lineHeight: 42 }}>TaskBot</Txt>
          <Txt variant="body" color={SOFT} style={{ fontSize: 17, lineHeight: 25 }}>Everything your boss asks for, kept in one place.</Txt>
        </View>
        <View style={{ gap: space.md }}>
          {FEATURES.map((f) => (
            <View key={f.title} style={{ flexDirection: 'row', gap: space.md, alignItems: 'center', backgroundColor: GLASS, borderRadius: radius.lg, padding: space.md + 2 }}>
              <View style={{ width: 40, height: 40, borderRadius: 14, backgroundColor: GLASS, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={f.icon} size={20} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1 }}>
                <Txt variant="body" color="#FFFFFF" strong>{f.title}</Txt>
                <Txt variant="label" color={SOFT}>{f.text}</Txt>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={{ gap: space.md }}>
        {message ? (
          <View style={{ flexDirection: 'row', gap: space.sm, backgroundColor: 'rgba(0,0,0,0.28)', borderRadius: radius.md, padding: space.md }}>
            <Ionicons name="alert-circle" size={18} color="#FFD0D8" />
            <Txt variant="label" color="#FFFFFF" style={{ flex: 1 }}>{message}</Txt>
          </View>
        ) : null}
        {!isConfigured ? (
          <View style={{ backgroundColor: 'rgba(0,0,0,0.28)', borderRadius: radius.md, padding: space.md }}>
            <Txt variant="label" color="#FFFFFF">The app is not configured: the Supabase URL and anon key are missing from this build.</Txt>
          </View>
        ) : pending ? (
          <>
            <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center', backgroundColor: GLASS, borderRadius: radius.lg, padding: space.lg }}>
              <ActivityIndicator color="#FFFFFF" />
              <Txt variant="label" color="#FFFFFF" style={{ flex: 1 }}>Press Start in the bot's chat in Telegram, then come back here.</Txt>
            </View>
            <Btn kind="inverse" icon="paper-plane" label="Open Telegram again" onPress={() => Linking.openURL(pending.url)} />
            <Btn kind="ghost" label="Cancel" onPress={() => setPending(null)} style={{ backgroundColor: GLASS }} />
          </>
        ) : (
          <>
            <Btn kind="inverse" icon="paper-plane" label={busy ? 'Opening Telegram…' : 'Continue with Telegram'} onPress={begin} disabled={busy} />
            <Txt variant="caption" color={SOFT} style={{ textAlign: 'center' }}>No password. You confirm once inside Telegram.</Txt>
          </>
        )}
      </View>
    </LinearGradient>
  );
}
