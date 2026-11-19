import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, Switch, View } from 'react-native';
import { Btn, Card, Chip, Empty, ErrorBanner, SectionTitle, Txt, styles } from '@/components/ui';
import { bn, fmtDateTime } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import type { AppConfig } from '@/lib/types';

const REMIND: { minutes: number; label: string }[] = [
  { minutes: 30, label: '৩০ মিনিট' },
  { minutes: 60, label: '১ ঘণ্টা' },
  { minutes: 120, label: '২ ঘণ্টা' },
  { minutes: 360, label: '৬ ঘণ্টা' },
  { minutes: 1440, label: '১ দিন' },
];

// morning_time is a plain wall-clock "HH:MM:SS" in the configured zone, no conversion needed.
function timeLabel(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const period = h < 12 ? 'সকাল' : h < 16 ? 'দুপুর' : h < 18 ? 'বিকাল' : 'রাত';
  return `${period} ${bn(h % 12 === 0 ? 12 : h % 12)}:${bn(String(m).padStart(2, '0'))}`;
}

type Settings = Pick<AppConfig, 'morning_time' | 'remind_before_minutes' | 'digest_enabled' | 'notify_new_items'>;

export default function SettingsScreen() {
  const t = useTheme();
  const [cfg, setCfg] = useState<AppConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('app_config')
      .select('timezone,morning_time,remind_before_minutes,digest_enabled,notify_new_items,last_webhook_at,last_processed_at,last_error,last_error_at')
      .eq('id', 1)
      .maybeSingle();
    if (err) setError(err.message);
    else setCfg(data as AppConfig | null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const save = async (patch: Partial<Settings>) => {
    if (!cfg) return;
    const before = cfg;
    setCfg({ ...cfg, ...patch });
    const { error: err } = await supabase.from('app_config').update(patch).eq('id', 1);
    if (err) {
      setCfg(before);
      setError(err.message);
    } else {
      setError(null);
    }
  };

  const pickMorning = () => {
    if (!cfg) return;
    const [h, m] = cfg.morning_time.split(':').map(Number);
    const value = new Date();
    value.setHours(h, m, 0, 0);
    DateTimePickerAndroid.open({
      value,
      mode: 'time',
      is24Hour: false,
      onValueChange: (_e, d) =>
        save({ morning_time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00` }),
    });
  };

  const logout = () =>
    Alert.alert('লগআউট', 'আপনি কি লগআউট করতে চান?', [
      { text: 'না', style: 'cancel' },
      { text: 'লগআউট', style: 'destructive', onPress: () => supabase.auth.signOut() },
    ]);

  if (!cfg) return error ? <View style={styles.list}><ErrorBanner text={error} /></View> : <Empty text="" loading />;

  // An error older than the last successful run is no longer the current state.
  const errorIsCurrent = !!cfg.last_error && (!cfg.last_processed_at || !cfg.last_error_at || cfg.last_error_at > cfg.last_processed_at);

  return (
    <ScrollView contentContainerStyle={styles.list}>
      <ErrorBanner text={error} />

      <SectionTitle>রিমাইন্ডার (Telegram-এ বটের মেসেজে আসবে)</SectionTitle>
      <Card>
        <Row label="সকালের সারাংশ" hint="প্রতিদিন আজকের কাজের তালিকা">
          <Switch value={cfg.digest_enabled} onValueChange={(v) => save({ digest_enabled: v })} />
        </Row>
        {cfg.digest_enabled ? (
          <Row label="সারাংশের সময়">
            <Btn small kind="plain" icon="time-outline" label={timeLabel(cfg.morning_time)} onPress={pickMorning} />
          </Row>
        ) : null}
        <Row label="নতুন কাজ এলে জানান" hint="বস নতুন কাজ দিলে সাথে সাথে মেসেজ">
          <Switch value={cfg.notify_new_items} onValueChange={(v) => save({ notify_new_items: v })} />
        </Row>
        <Txt style={{ marginTop: 12 }}>ডেডলাইনের কত আগে সতর্ক করবে</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {REMIND.map((r) => (
            <Chip key={r.minutes} label={r.label} active={cfg.remind_before_minutes === r.minutes} onPress={() => save({ remind_before_minutes: r.minutes })} />
          ))}
        </View>
        <Txt size={12} sub style={{ marginTop: 10 }}>সময় অঞ্চল: {cfg.timezone}</Txt>
      </Card>

      <SectionTitle>বটের অবস্থা</SectionTitle>
      <Card>
        <Txt size={14}>সর্বশেষ মেসেজ পেয়েছে: {cfg.last_webhook_at ? fmtDateTime(cfg.last_webhook_at) : 'এখনো পায়নি'}</Txt>
        <Txt size={14}>সর্বশেষ বিশ্লেষণ: {cfg.last_processed_at ? fmtDateTime(cfg.last_processed_at) : 'এখনো হয়নি'}</Txt>
        {cfg.last_error ? (
          <View style={{ marginTop: 8 }}>
            <Txt size={13} color={errorIsCurrent ? t.danger : t.sub}>
              {errorIsCurrent ? 'ত্রুটি' : 'আগের ত্রুটি (এরপর ঠিকভাবে চলেছে)'}
              {cfg.last_error_at ? ` · ${fmtDateTime(cfg.last_error_at)}` : ''}
            </Txt>
            <Txt size={13} sub selectable>{cfg.last_error}</Txt>
          </View>
        ) : (
          <Txt size={13} color={t.success} style={{ marginTop: 8 }}>কোনো ত্রুটি নেই</Txt>
        )}
      </Card>

      <View style={{ marginTop: 20 }}>
        <Btn kind="danger" icon="log-out-outline" label="লগআউট" onPress={logout} />
      </View>
    </ScrollView>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 }}>
      <View style={{ flex: 1 }}>
        <Txt>{label}</Txt>
        {hint ? <Txt size={12} sub>{hint}</Txt> : null}
      </View>
      {children}
    </View>
  );
}
