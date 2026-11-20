import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { tap } from '@/lib/haptics';
import {
  FILE_LINK_DAYS, canShareFiles, copyShareLink, shareFileWithApps, shareLinkWithApps, shareToMessenger, shareToWhatsApp, type ShareTarget,
} from '@/lib/share';
import { radius, space, useTheme } from '@/lib/theme';
import { Sheet, Txt, styles } from './ui';

// One share sheet for the whole app, opened from anywhere without threading props.
let show: ((target: ShareTarget) => void) | null = null;
export const openShare = (target: ShareTarget) => show?.(target);

const WHATSAPP = '#128C4A';
const MESSENGER = '#0A66E4';

/** Small share icon used on library rows, cards and tiles. */
export function ShareButton({ target, onImage }: { target: ShareTarget; onImage?: boolean }) {
  const t = useTheme();
  // A file that was never stored (too large, or the download failed) has nothing to send.
  if (target.kind === 'file' && !target.storagePath) return null;
  return (
    <Pressable
      onPress={() => {
        tap();
        openShare(target);
      }}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={`Share ${target.title}`}
      style={({ pressed }) => [onImage && { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(15,12,40,0.55)', alignItems: 'center', justifyContent: 'center' }, pressed && styles.pressed]}>
      <Ionicons name="share-social-outline" size={onImage ? 15 : 19} color={onImage ? '#FFFFFF' : t.sub} />
    </Pressable>
  );
}

function Option({ icon, title, hint, busy, onPress }: { icon: ReactNode; title: string; hint?: string; busy?: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [
        { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, minHeight: 60, borderRadius: radius.md, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface },
        pressed && { backgroundColor: t.surfaceAlt },
      ]}>
      <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: t.surfaceAlt }}>
        {busy ? <ActivityIndicator color={t.primary} /> : icon}
      </View>
      <View style={{ flex: 1 }}>
        <Txt variant="body" strong>{title}</Txt>
        {hint ? <Txt variant="caption" sub>{hint}</Txt> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={t.faint} />
    </Pressable>
  );
}

/** Mount once near the root. Shows the share options when `openShare` is called. */
export function ShareHost() {
  const t = useTheme();
  const [target, setTarget] = useState<ShareTarget | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    show = (next) => {
      setCopied(false);
      setBusy(null);
      setTarget(next);
    };
    return () => {
      show = null;
    };
  }, []);

  const close = () => setTarget(null);
  // Runs one action at a time; the sheet closes once the other app has been handed the item.
  const run = (key: string, action: (target: ShareTarget) => Promise<unknown>, keepOpen = false) => async () => {
    if (!target || busy) return;
    setBusy(key);
    try {
      await action(target);
    } finally {
      setBusy(null);
      if (!keepOpen) close();
    }
  };

  const isFile = target?.kind === 'file';
  return (
    <Sheet visible={!!target} onClose={close} title="Share">
      {target ? (
        <View style={{ gap: space.sm }}>
          <Txt variant="label" content sub numberOfLines={2} style={{ marginBottom: space.xs }}>{target.title}</Txt>
          {isFile && canShareFiles ? (
            <Option
              icon={<Ionicons name="paper-plane-outline" size={20} color={t.primary} />}
              title="Send the file"
              hint="WhatsApp, Messenger or any other app"
              busy={busy === 'file'}
              onPress={run('file', shareFileWithApps)}
            />
          ) : null}
          <Option
            icon={<Ionicons name="logo-whatsapp" size={22} color={WHATSAPP} />}
            title={isFile ? 'WhatsApp, as a link' : 'WhatsApp'}
            busy={busy === 'whatsapp'}
            onPress={run('whatsapp', shareToWhatsApp)}
          />
          <Option
            icon={<MaterialCommunityIcons name="facebook-messenger" size={22} color={MESSENGER} />}
            title={isFile ? 'Messenger, as a link' : 'Messenger'}
            busy={busy === 'messenger'}
            onPress={run('messenger', shareToMessenger)}
          />
          {!isFile ? (
            <Option
              icon={<Ionicons name="apps-outline" size={20} color={t.primary} />}
              title="More apps"
              busy={busy === 'more'}
              onPress={run('more', shareLinkWithApps)}
            />
          ) : null}
          <Option
            icon={<Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={20} color={copied ? t.success : t.primary} />}
            title={copied ? 'Link copied' : 'Copy link'}
            busy={busy === 'copy'}
            onPress={run('copy', async (x) => setCopied(await copyShareLink(x)), true)}
          />
          {isFile ? (
            <Txt variant="caption" sub style={{ marginTop: space.xs }}>
              A link to a file works for {FILE_LINK_DAYS} days, and anyone who has the link can open the file.
            </Txt>
          ) : null}
        </View>
      ) : null}
    </Sheet>
  );
}
