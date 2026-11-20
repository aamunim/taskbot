import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useUpdates } from 'expo-updates';
import { useEffect } from 'react';
import { AppState, Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { checkForUpdate, dismissUpdate, restartToUpdate, setDownloadProgress, updatesEnabled, useUpdateState } from '@/lib/updates';
import { radius, space, ui, useTheme } from '@/lib/theme';
import { Txt, styles } from './ui';

/** Feeds the platform's download progress into the shared store. Only mounted in real builds. */
function ProgressBridge() {
  const { downloadProgress, isDownloading } = useUpdates();
  useEffect(() => {
    if (isDownloading) setDownloadProgress(downloadProgress ?? null);
  }, [downloadProgress, isDownloading]);
  return null;
}

/**
 * Checks for an app update on launch and whenever the app comes back to the
 * foreground, downloads it in the background, then asks, full screen, to restart.
 */
export function UpdateGate() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const s = useUpdateState();

  useEffect(() => {
    if (!updatesEnabled) return;
    checkForUpdate();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') checkForUpdate();
    });
    return () => sub.remove();
  }, []);

  const downloading = s.phase === 'downloading';
  const ready = s.phase === 'ready' && !s.later;
  const pct = s.progress != null ? Math.round(s.progress * 100) : null;

  return (
    <>
      {updatesEnabled ? <ProgressBridge /> : null}

      {/* A quiet pill while the update downloads; it never blocks the app. */}
      {downloading ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 104, alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: t.text }}>
            <Ionicons name="cloud-download-outline" size={15} color={t.bg} />
            <Txt variant="caption" color={t.bg} strong>Downloading update{pct != null ? ` · ${pct}%` : '…'}</Txt>
          </View>
        </View>
      ) : null}

      <Modal visible={ready} animationType="fade" onRequestClose={dismissUpdate} statusBarTranslucent>
        <LinearGradient colors={t.hero} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ flex: 1, paddingTop: insets.top + space.xxl, paddingBottom: insets.bottom + space.xl, paddingHorizontal: space.xxl }}>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.lg }}>
            <View style={{ width: 112, height: 112, borderRadius: 56, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="sparkles-outline" size={52} color="#FFFFFF" />
            </View>
            <Txt variant="display" color="#FFFFFF" style={{ textAlign: 'center', fontSize: 32 * t.scale, lineHeight: 40 * t.scale }}>Update ready</Txt>
            <Txt variant="body" color="rgba(255,255,255,0.88)" style={{ textAlign: 'center', maxWidth: 300 }}>
              A new version of TaskBot has been downloaded. Restart to start using it. It only takes a moment and nothing is lost.
            </Txt>
          </View>
          {/* On a wide window the button keeps a button's width instead of spanning the screen. */}
          <View style={{ gap: space.md, width: '100%', maxWidth: 440, alignSelf: 'center' }}>
            <Pressable
              onPress={restartToUpdate}
              accessibilityRole="button"
              accessibilityLabel="Restart now"
              style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.md, height: 68, borderRadius: radius.lg, backgroundColor: '#FFFFFF' }, pressed && styles.pressed]}>
              <Ionicons name="refresh-outline" size={26} color={t.hero[0]} />
              <Txt color={t.hero[0]} style={{ fontFamily: ui.extrabold, fontSize: 21 * t.scale, lineHeight: 28 * t.scale }}>Restart now</Txt>
            </Pressable>
            <Pressable onPress={dismissUpdate} accessibilityRole="button" style={({ pressed }) => [{ alignItems: 'center', paddingVertical: space.md }, pressed && styles.pressed]}>
              <Txt variant="label" color="rgba(255,255,255,0.85)">Later</Txt>
            </Pressable>
          </View>
        </LinearGradient>
      </Modal>
    </>
  );
}
