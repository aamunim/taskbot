import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { signedUrl } from '@/lib/api';
import { notify } from '@/lib/dialog';
import { useData } from '@/lib/data';
import { fileExt, fileGroup, fileStatusText, fileTitle, fmtDate, fmtDateTime, fmtSize, splitUrl } from '@/lib/format';
import { tap } from '@/lib/haptics';
import { roleColors } from '@/lib/roles';
import { radius, space, ui, useTheme } from '@/lib/theme';
import type { FileRow, LibFile, LibLink, LinkRow as LinkRecord, Role } from '@/lib/types';
import { AudioPlayer } from './AudioPlayer';
import { openGallery } from './Gallery';
import { openItem } from './items';
import { Card, RoleBadge, Txt, styles } from './ui';

/** Opens a stored file in the phone's viewer/browser through a signed URL. */
export async function openFile(f: Pick<FileRow, 'storage_path' | 'status'>) {
  if (f.status !== 'stored' || !f.storage_path) return;
  const url = await signedUrl(f.storage_path);
  if (url) await Linking.openURL(url);
  else notify('Could not open file', 'Please try again in a moment.');
}

const EXT_COLOR: Record<string, string> = {
  PDF: '#D92D3A',
  XLS: '#17803D',
  XLSX: '#17803D',
  CSV: '#17803D',
  DOC: '#2563EB',
  DOCX: '#2563EB',
  PPT: '#D4500F',
  PPTX: '#D4500F',
  VIDEO: '#7C3AED',
  MP4: '#7C3AED',
};
const TILE_COLORS = ['#4338CA', '#0E7490', '#B4236A', '#17803D', '#B45309', '#6D28D9'];
const hashColor = (s: string) => TILE_COLORS[[...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % TILE_COLORS.length];

export function ExtBadge({ file, size = 44 }: { file: Pick<FileRow, 'file_name' | 'mime_type' | 'kind'>; size?: number }) {
  const ext = fileExt(file);
  const group = fileGroup(file);
  const color = group === 'voice' ? '#0E7490' : group === 'photo' ? '#B4236A' : (EXT_COLOR[ext] ?? '#5C5977');
  return (
    <View style={{ width: size, height: size, borderRadius: Math.round(size * 0.28), backgroundColor: color, alignItems: 'center', justifyContent: 'center' }}>
      {group === 'document' ? (
        <Text style={{ color: '#FFFFFF', fontFamily: ui.extrabold, fontSize: ext.length > 3 ? size * 0.22 : size * 0.27, letterSpacing: 0.3 }}>{ext}</Text>
      ) : (
        <Ionicons name={group === 'voice' ? 'mic' : 'image'} size={size * 0.46} color="#FFFFFF" />
      )}
    </View>
  );
}

export function StarButton({ starred, onPress, onImage }: { starred: boolean; onPress: () => void; onImage?: boolean }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={() => {
        tap();
        onPress();
      }}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={starred ? 'Remove star' : 'Add star'}
      style={({ pressed }) => [onImage && { width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(15,12,40,0.55)', alignItems: 'center', justifyContent: 'center' }, pressed && styles.pressed]}>
      <Ionicons name={starred ? 'star' : 'star-outline'} size={onImage ? 15 : 19} color={starred ? t.star : onImage ? '#FFFFFF' : t.faint} />
    </Pressable>
  );
}

function ItemLink({ id }: { id: string | null }) {
  const t = useTheme();
  if (!id) return null;
  return (
    <Pressable onPress={() => openItem(id)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Open related task or note" style={({ pressed }) => pressed && styles.pressed}>
      <Ionicons name="arrow-forward-circle-outline" size={20} color={t.primary} />
    </Pressable>
  );
}

/** `onOpen` replaces the default action (photos open the in-app gallery). */
type FileProps = { file: LibFile; thumb?: string; onStar: () => void; onOpen?: () => void };

export function PhotoTile({ file, thumb, onStar, onOpen, size }: FileProps & { size: number }) {
  const t = useTheme();
  const { role } = useData();
  return (
    <Pressable
      onPress={onOpen ?? (() => openFile(file))}
      onLongPress={file.item_id ? () => openItem(file.item_id!) : undefined}
      accessibilityLabel={fileTitle(file)}
      style={({ pressed }) => [{ width: size, height: size, borderRadius: radius.md, overflow: 'hidden', backgroundColor: t.surfaceAlt, alignItems: 'center', justifyContent: 'center' }, pressed && styles.pressed]}>
      {thumb ? (
        <Image source={{ uri: thumb }} style={{ width: size, height: size }} resizeMode="cover" />
      ) : (
        <Txt variant="caption" sub style={{ textAlign: 'center', padding: 8 }}>{fileStatusText(file) ?? 'Photo'}</Txt>
      )}
      <View style={{ position: 'absolute', top: 6, right: 6 }}>
        <StarButton starred={file.starred} onPress={onStar} onImage />
      </View>
      <View style={{ position: 'absolute', left: 8, bottom: 8, width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: '#FFFFFF', backgroundColor: roleColors(t, role(file.sender_tg_id)).solid }} />
    </Pressable>
  );
}

/** List row for a photo or document. */
export function FileListRow({ file, thumb, onStar, onOpen }: FileProps) {
  const t = useTheme();
  const { role } = useData();
  const problem = fileStatusText(file);
  return (
    <Card onPress={file.status === 'stored' ? (onOpen ?? (() => openFile(file))) : undefined} style={{ padding: space.md }}>
      <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
        {thumb ? <Image source={{ uri: thumb }} style={{ width: 48, height: 48, borderRadius: radius.sm }} /> : <ExtBadge file={file} size={48} />}
        <View style={{ flex: 1, gap: 3 }}>
          <Txt content strong numberOfLines={1}>{fileTitle(file)}</Txt>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <RoleBadge role={role(file.sender_tg_id)} compact />
            <Txt variant="caption" sub numberOfLines={1} style={{ flexShrink: 1 }}>{[fmtSize(file.size_bytes), fmtDate(file.sent_at)].filter(Boolean).join(' · ')}</Txt>
          </View>
          {problem ? <Txt variant="caption" color={file.status === 'pending' ? t.sub : t.danger}>{problem}</Txt> : null}
        </View>
        <ItemLink id={file.item_id} />
        <StarButton starred={file.starred} onPress={onStar} />
      </View>
    </Card>
  );
}

export function DocTile({ file, onStar, width }: FileProps & { width: number }) {
  const t = useTheme();
  const { role } = useData();
  const problem = fileStatusText(file);
  return (
    <Card onPress={file.status === 'stored' ? () => openFile(file) : undefined} style={{ width, padding: space.md, gap: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}><ExtBadge file={file} size={46} /></View>
        <StarButton starred={file.starred} onPress={onStar} />
      </View>
      <Txt content strong numberOfLines={2} style={{ minHeight: 48 }}>{fileTitle(file)}</Txt>
      {problem ? <Txt variant="caption" color={t.danger} numberOfLines={2}>{problem}</Txt> : <Txt variant="caption" sub>{[fmtSize(file.size_bytes), fmtDate(file.sent_at)].filter(Boolean).join(' · ')}</Txt>}
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}><RoleBadge role={role(file.sender_tg_id)} compact /></View>
        <ItemLink id={file.item_id} />
      </View>
    </Card>
  );
}

export function VoiceCard({ file, onStar }: FileProps) {
  const t = useTheme();
  const { role } = useData();
  const problem = fileStatusText(file);
  return (
    <Card style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
        <View style={{ flex: 1 }}><RoleBadge role={role(file.sender_tg_id)} name={file.sender_name} /></View>
        <Txt variant="caption" sub>{fmtDate(file.sent_at)}</Txt>
        <ItemLink id={file.item_id} />
        <StarButton starred={file.starred} onPress={onStar} />
      </View>
      {file.status === 'stored' && file.storage_path ? (
        <AudioPlayer lazy clamp storagePath={file.storage_path} duration={file.duration_seconds} words={file.transcript_words} transcript={file.transcript} />
      ) : (
        <Txt variant="label" color={t.danger}>{problem ?? 'Unavailable'}</Txt>
      )}
    </Card>
  );
}

function DomainTile({ host, size = 44 }: { host: string; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: Math.round(size * 0.28), backgroundColor: hashColor(host), alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#FFFFFF', fontFamily: ui.extrabold, fontSize: size * 0.42 }}>{host.charAt(0).toUpperCase()}</Text>
    </View>
  );
}

type Previewed = Pick<LinkRecord, 'url' | 'domain' | 'favicon_url' | 'image_url'>;

/** The site's own icon when the bot found one and it loads; otherwise the letter tile. */
export function SiteIcon({ link, size = 44 }: { link: Previewed; size?: number }) {
  const t = useTheme();
  const [failed, setFailed] = useState(false);
  const { host } = splitUrl(link.url, link.domain);
  if (!link.favicon_url || failed) return <DomainTile host={host} size={size} />;
  return (
    <View style={{ width: size, height: size, borderRadius: Math.round(size * 0.28), backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      <Image source={{ uri: link.favicon_url }} style={{ width: size * 0.62, height: size * 0.62 }} resizeMode="contain" onError={() => setFailed(true)} />
    </View>
  );
}

/** The page's preview picture, or nothing at all if there is none or it fails to load. */
function PreviewImage({ link, height }: { link: Previewed; height: number }) {
  const t = useTheme();
  const [failed, setFailed] = useState(false);
  if (!link.image_url || failed) return null;
  return <Image source={{ uri: link.image_url }} style={{ width: '100%', height, backgroundColor: t.surfaceAlt }} resizeMode="cover" onError={() => setFailed(true)} accessibilityIgnoresInvertColors />;
}

type LinkProps = { link: LibLink; onStar: () => void };

function useCopy(url: string) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await Clipboard.setStringAsync(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return { copied, copy };
}

/** What the sender wrote around the link, without the link itself. */
export function linkSaid(link: Pick<LibLink, 'text' | 'url'>): string {
  return link.text?.replace(link.url, '').replace(/\s+/g, ' ').trim() ?? '';
}

/** What the link is: the page's own title, else the sender's words, else the address. */
export function linkLabel(link: LibLink): string {
  const { host, rest } = splitUrl(link.url, link.domain);
  return link.title?.trim() || linkSaid(link) || (rest ? host + rest : host);
}

/**
 * One line per link for scanning a long list: tap anywhere to open it,
 * hold to copy. `showHost` is off when the list is already grouped by site.
 */
export function LinkRow({ link, onStar, showHost = true, last }: LinkProps & { showHost?: boolean; last?: boolean }) {
  const t = useTheme();
  const { role } = useData();
  const { host } = splitUrl(link.url, link.domain);
  const { copied, copy } = useCopy(link.url);
  const r = role(link.sender_tg_id);
  const who = r === 'boss' ? 'Boss' : r === 'me' ? 'Me' : (link.sender_name ?? 'Other');
  return (
    <Pressable
      onPress={() => Linking.openURL(link.url)}
      onLongPress={copy}
      accessibilityRole="link"
      accessibilityLabel={`Open ${linkLabel(link)}`}
      accessibilityHint="Hold to copy the link"
      style={({ pressed }) => [
        { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: 11, paddingHorizontal: space.md, minHeight: 60 },
        !last && { borderBottomWidth: 1, borderBottomColor: t.border },
        pressed && { backgroundColor: t.surfaceAlt },
      ]}>
      <SiteIcon link={link} size={36} />
      <View style={{ flex: 1 }}>
        <Txt variant="body" content strong numberOfLines={1}>{linkLabel(link)}</Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: roleColors(t, r).solid }} />
          <Txt variant="caption" sub numberOfLines={1} style={{ flexShrink: 1 }}>
            {copied ? 'Link copied' : [who, showHost ? host : null, fmtDate(link.sent_at)].filter(Boolean).join(' · ')}
          </Txt>
        </View>
      </View>
      <StarButton starred={link.starred} onPress={onStar} />
      <Ionicons name="open-outline" size={18} color={t.primary} />
    </Pressable>
  );
}

/** Desktop: links as a table (what, site, who, when) with one row per link. Click a row to open it. */
export function LinkTable({ links, onStar }: { links: LibLink[]; onStar: (link: LibLink) => void }) {
  const t = useTheme();
  const { role } = useData();
  const cell = { site: { width: 190 }, from: { width: 170 }, date: { width: 110 } } as const;
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.lg, paddingVertical: space.sm, paddingHorizontal: space.lg, backgroundColor: t.surfaceAlt }}>
        <Txt variant="overline" sub style={{ flex: 1 }}>Link</Txt>
        <Txt variant="overline" sub style={cell.site}>Site</Txt>
        <Txt variant="overline" sub style={cell.from}>From</Txt>
        <Txt variant="overline" sub style={cell.date}>Shared</Txt>
        <View style={{ width: 64 }} />
      </View>
      {links.map((link) => {
        const { host } = splitUrl(link.url, link.domain);
        const said = linkSaid(link);
        const label = linkLabel(link);
        return (
          <Pressable
            key={link.id}
            onPress={() => Linking.openURL(link.url)}
            accessibilityRole="link"
            accessibilityLabel={`Open ${label}`}
            style={(s) => [{ flexDirection: 'row', alignItems: 'center', gap: space.lg, paddingVertical: 10, paddingHorizontal: space.lg, borderTopWidth: 1, borderTopColor: t.border }, (s as { hovered?: boolean }).hovered && { backgroundColor: t.surfaceAlt }]}>
            <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: space.md }}>
              <SiteIcon link={link} size={34} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Txt variant="body" content strong numberOfLines={1}>{label}</Txt>
                {said && said !== label ? <Txt variant="caption" content sub numberOfLines={1}>{said}</Txt> : null}
              </View>
            </View>
            <Txt variant="label" sub numberOfLines={1} style={cell.site}>{host}</Txt>
            <View style={cell.from}><RoleBadge role={role(link.sender_tg_id)} name={link.sender_name} /></View>
            <Txt variant="label" sub style={cell.date}>{fmtDate(link.sent_at)}</Txt>
            <View style={{ width: 64, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: space.md }}>
              <StarButton starred={link.starred} onPress={() => onStar(link)} />
              <Ionicons name="open-outline" size={18} color={t.primary} />
            </View>
          </Pressable>
        );
      })}
    </Card>
  );
}

export function LinkCard({ link, onStar }: LinkProps) {
  const t = useTheme();
  const { role } = useData();
  const { host, rest } = splitUrl(link.url, link.domain);
  const { copied, copy } = useCopy(link.url);
  const said = linkSaid(link);
  return (
    <Card onPress={() => Linking.openURL(link.url)} style={{ padding: 0, overflow: 'hidden' }}>
      <PreviewImage link={link} height={132} />
      <View style={{ padding: space.lg, gap: space.md }}>
        <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
          <SiteIcon link={link} />
          <View style={{ flex: 1 }}>
            <Txt variant="body" content strong numberOfLines={2}>{link.title?.trim() || host}</Txt>
            <Txt variant="caption" sub numberOfLines={1}>{link.title ? host : rest || host}</Txt>
          </View>
          <StarButton starred={link.starred} onPress={onStar} />
        </View>
        {link.description ? <Txt variant="label" sub numberOfLines={2}>{link.description}</Txt> : null}
        {said ? (
          <View style={{ borderLeftWidth: 3, borderLeftColor: t.border, paddingLeft: space.md }}>
            <Txt variant="label" content sub numberOfLines={2}>{said}</Txt>
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
            <RoleBadge role={role(link.sender_tg_id)} name={link.sender_name} />
            <Txt variant="caption" sub>· {fmtDate(link.sent_at)}</Txt>
          </View>
          <ItemLink id={link.item_id} />
          <Pressable onPress={copy} hitSlop={10} accessibilityRole="button" accessibilityLabel="Copy link" style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 4 }, pressed && styles.pressed]}>
            <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={17} color={copied ? t.success : t.sub} />
            <Txt variant="caption" color={copied ? t.success : t.sub} strong>{copied ? 'Copied' : 'Copy'}</Txt>
          </Pressable>
          <Ionicons name="open-outline" size={18} color={t.primary} />
        </View>
      </View>
    </Card>
  );
}

export function LinkTile({ link, onStar, width }: LinkProps & { width: number }) {
  const { role } = useData();
  const { host } = splitUrl(link.url, link.domain);
  return (
    <Card onPress={() => Linking.openURL(link.url)} style={{ width, padding: 0, overflow: 'hidden' }}>
      <PreviewImage link={link} height={84} />
      <View style={{ padding: space.md, gap: space.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <View style={{ flex: 1 }}><SiteIcon link={link} size={link.image_url ? 30 : 46} /></View>
          <StarButton starred={link.starred} onPress={onStar} />
        </View>
        <Txt variant="body" content strong numberOfLines={2}>{linkLabel(link)}</Txt>
        <Txt variant="caption" sub numberOfLines={1}>{host}</Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}><RoleBadge role={role(link.sender_tg_id)} compact /></View>
          <ItemLink id={link.item_id} />
        </View>
      </View>
    </Card>
  );
}

/** A link inside a message card: icon, title, site. */
export function LinkChip({ link }: { link: LinkRecord }) {
  const t = useTheme();
  const { host, rest } = splitUrl(link.url, link.domain);
  return (
    <Pressable
      onPress={() => Linking.openURL(link.url)}
      accessibilityRole="link"
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: t.surface, borderRadius: radius.md, padding: space.sm }, pressed && styles.pressed]}>
      <SiteIcon link={link} size={38} />
      <View style={{ flex: 1 }}>
        <Txt variant="label" content numberOfLines={1}>{link.title?.trim() || `${host}${rest}`}</Txt>
        <Txt variant="caption" sub numberOfLines={1}>{host}</Txt>
      </View>
      <Ionicons name="open-outline" size={16} color={t.primary} />
    </Pressable>
  );
}

/** Opens a stored photo in the in-app viewer; anything else in the phone's own viewer. */
export async function openAttachment(file: FileRow, meta: { sender: string | null; role: Role; sentAt: string }) {
  if (fileGroup(file) !== 'photo' || file.status !== 'stored' || !file.storage_path) return openFile(file);
  const uri = await signedUrl(file.storage_path);
  if (!uri) return notify('Could not open photo', 'Please try again in a moment.');
  openGallery([{ key: file.id, uri, title: fileTitle(file), sender: meta.sender, role: meta.role, date: fmtDateTime(meta.sentAt) }]);
}

export function AttachmentRow({ file, onOpen }: { file: FileRow; onOpen?: () => void }) {
  const t = useTheme();
  const problem = fileStatusText(file);
  return (
    <Pressable onPress={onOpen ?? (() => openFile(file))} disabled={file.status !== 'stored'} style={({ pressed }) => [{ flexDirection: 'row', gap: space.md, alignItems: 'center', padding: space.sm, borderRadius: radius.md, backgroundColor: t.surface }, pressed && styles.pressed]}>
      <ExtBadge file={file} size={38} />
      <View style={{ flex: 1 }}>
        <Txt variant="label" content numberOfLines={1}>{fileTitle(file)}</Txt>
        <Txt variant="caption" color={problem && file.status !== 'pending' ? t.danger : t.sub}>{problem ?? fmtSize(file.size_bytes)}</Txt>
      </View>
      {file.status === 'stored' ? <Ionicons name="open-outline" size={17} color={t.sub} /> : null}
    </Pressable>
  );
}
