import * as Clipboard from 'expo-clipboard';
import { File, Paths } from 'expo-file-system';
import * as Linking from 'expo-linking';
import * as Sharing from 'expo-sharing';
import { Platform, Share } from 'react-native';
import { signedUrl } from './api';
import { notify } from './dialog';

/** Something from the library that can be sent to another app. */
export type ShareTarget =
  | { kind: 'link'; title: string; url: string }
  | { kind: 'file'; title: string; storagePath: string | null; fileName: string; mimeType: string | null };

/** How long a shared link to a stored file keeps working. */
export const FILE_LINK_DAYS = 7;

export const canShareFiles = Platform.OS !== 'web';

/** The address to send: the link itself, or a temporary download link for a stored file. */
export async function shareUrl(target: ShareTarget): Promise<string | null> {
  if (target.kind === 'link') return target.url;
  if (!target.storagePath) return null;
  return signedUrl(target.storagePath, FILE_LINK_DAYS * 86400);
}

const withTitle = (target: ShareTarget, url: string) => (target.kind === 'file' ? `${target.title}\n${url}` : url);
const isPhoneBrowser = () => typeof navigator !== 'undefined' && /Android|iPhone|iPad/i.test(navigator.userAgent);
const unavailable = () => notify('Cannot share this file', 'The file is not stored yet. Please try again later.');

export async function shareToWhatsApp(target: ShareTarget) {
  const url = await shareUrl(target);
  if (!url) return unavailable();
  const text = encodeURIComponent(withTitle(target, url));
  const web = `https://wa.me/?text=${text}`;
  if (Platform.OS === 'web') {
    window.open(web, '_blank', 'noopener');
    return;
  }
  // Straight into the app when it is installed, otherwise WhatsApp's own web hand-off.
  await Linking.openURL(`whatsapp://send?text=${text}`).catch(() => Linking.openURL(web));
}

export async function shareToMessenger(target: ShareTarget) {
  const url = await shareUrl(target);
  if (!url) return unavailable();
  if (Platform.OS === 'web' && !isPhoneBrowser()) {
    // Messenger has no public share page for desktop browsers.
    await Clipboard.setStringAsync(withTitle(target, url));
    notify('Link copied', 'Open Messenger and paste it into the chat.');
    return;
  }
  try {
    await Linking.openURL(`fb-messenger://share/?link=${encodeURIComponent(url)}`);
  } catch {
    await Clipboard.setStringAsync(withTitle(target, url));
    notify('Messenger did not open', 'The link was copied instead. Paste it into the chat.');
  }
}

export async function copyShareLink(target: ShareTarget): Promise<boolean> {
  const url = await shareUrl(target);
  if (!url) {
    unavailable();
    return false;
  }
  await Clipboard.setStringAsync(url);
  return true;
}

/** The phone's own share menu, with the link as text. */
export async function shareLinkWithApps(target: ShareTarget) {
  const url = await shareUrl(target);
  if (!url) return unavailable();
  const message = withTitle(target, url);
  if (Platform.OS === 'web') {
    if (typeof navigator !== 'undefined' && navigator.share) await navigator.share({ title: target.title, text: message }).catch(() => {});
    else {
      await Clipboard.setStringAsync(message);
      notify('Link copied', 'Paste it wherever you want to share it.');
    }
    return;
  }
  await Share.share({ message }).catch(() => {});
}

/**
 * Sends the file itself (not a link) through the phone's share menu, where
 * WhatsApp, Messenger and every other app that accepts files appear.
 */
export async function shareFileWithApps(target: ShareTarget) {
  if (target.kind !== 'file' || !canShareFiles) return;
  if (!target.storagePath) return unavailable();
  try {
    const url = await signedUrl(target.storagePath);
    if (!url || !(await Sharing.isAvailableAsync())) throw new Error('sharing unavailable');
    const name = target.fileName.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80) || 'file';
    const destination = new File(Paths.cache, name);
    if (destination.exists) destination.delete();
    const saved = await File.downloadFileAsync(url, destination);
    await Sharing.shareAsync(saved.uri, { mimeType: target.mimeType ?? undefined, dialogTitle: target.title });
  } catch {
    notify('Could not share the file', 'Check your connection and try again, or share it as a link instead.');
  }
}
