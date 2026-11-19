import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, View } from 'react-native';
import { Btn, Txt } from '@/components/ui';
import { isConfigured, pollLogin, startLogin, supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

type Pending = { code: string; secret: string; url: string };

export default function Login() {
  const t = useTheme();
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
          setMessage('লগইন সম্পূর্ণ করা যায়নি। আবার চেষ্টা করুন।');
        }
        // On success the auth listener swaps this screen out.
      } else if (res.status === 'expired') {
        setPending(null);
        setMessage('সময় শেষ হয়ে গেছে। আবার চেষ্টা করুন।');
      } else if (res.status === 'denied') {
        setPending(null);
        setMessage('এই Telegram অ্যাকাউন্টের অনুমতি নেই।');
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
    setBusy(true);
    setMessage(null);
    try {
      const p = await startLogin();
      setPending(p);
      await Linking.openURL(p.url);
    } catch {
      setMessage('সার্ভারের সাথে যোগাযোগ করা যায়নি। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, padding: 28, justifyContent: 'center', gap: 16 }}>
      <Ionicons name="checkbox-outline" size={56} color={t.primary} />
      <Txt bold size={28}>TaskBot</Txt>
      <Txt sub>বসের দেওয়া কাজ, নোট আর ফাইল এক জায়গায়।</Txt>
      <View style={{ height: 12 }} />
      {!isConfigured ? (
        <Txt color={t.danger}>অ্যাপ কনফিগার করা হয়নি: .env ফাইলে Supabase URL ও anon key দিন।</Txt>
      ) : pending ? (
        <>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <ActivityIndicator color={t.primary} />
            <Txt style={{ flex: 1 }}>Telegram-এ বটের চ্যাটে Start চাপুন, তারপর এখানে ফিরে আসুন।</Txt>
          </View>
          <Btn kind="plain" label="Telegram আবার খুলুন" onPress={() => Linking.openURL(pending.url)} />
          <Btn kind="plain" label="বাতিল" onPress={() => setPending(null)} />
        </>
      ) : (
        <Btn icon="paper-plane" label="Telegram দিয়ে লগইন" onPress={begin} disabled={busy} />
      )}
      {message ? <Txt color={t.danger}>{message}</Txt> : null}
    </View>
  );
}
