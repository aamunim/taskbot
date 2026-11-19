import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useState } from 'react';
import { Alert, Image, Pressable, Text, View } from 'react-native';
import { signedUrl } from '@/lib/api';
import { useData } from '@/lib/data';
import { fileExt, fileGroup, fileStatusText, fileTitle, fmtDate, fmtSize, splitUrl } from '@/lib/format';
import { roleColors } from '@/lib/roles';
import { radius, space, ui, useTheme } from '@/lib/theme';
import type { FileRow, LibFile, LibLink } from '@/lib/types';
import { AudioPlayer } from './AudioPlayer';
import { openItem } from './items';
import { Card, RoleBadge, Txt, styles } from './ui';

/** Opens a stored file in the phone's viewer/browser through a signed URL. */
export async function openFile(f: Pick<FileRow, 'storage_path' | 'status'>) {
  if (f.status !== 'stored' || !f.storage_path) return;
  const url = await signedUrl(f.storage_path);
  if (url) await Linking.openURL(url);
  else Alert.alert('Could not open file', 'Please try again in a moment.');
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
      onPress={onPress}
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

type FileProps = { file: LibFile; thumb?: string; onStar: () => void };

export function PhotoTile({ file, thumb, onStar, size }: FileProps & { size: number }) {
  const t = useTheme();
  const { role } = useData();
  return (
    <Pressable
      onPress={() => openFile(file)}
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
export function FileListRow({ file, thumb, onStar }: FileProps) {
  const t = useTheme();
  const { role } = useData();
  const problem = fileStatusText(file);
  return (
    <Card onPress={file.status === 'stored' ? () => openFile(file) : undefined} style={{ padding: space.md }}>
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
        <AudioPlayer lazy storagePath={file.storage_path} duration={file.duration_seconds} />
      ) : (
        <Txt variant="label" color={t.danger}>{problem ?? 'Unavailable'}</Txt>
      )}
      {file.transcript ? (
        <View style={{ borderLeftWidth: 3, borderLeftColor: t.border, paddingLeft: space.md }}>
          <Txt variant="label" content sub numberOfLines={3}>{file.transcript}</Txt>
        </View>
      ) : null}
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

export function LinkCard({ link, onStar }: LinkProps) {
  const t = useTheme();
  const { role } = useData();
  const { host, rest } = splitUrl(link.url, link.domain);
  const { copied, copy } = useCopy(link.url);
  return (
    <Card onPress={() => Linking.openURL(link.url)} style={{ gap: space.md }}>
      <View style={{ flexDirection: 'row', gap: space.md, alignItems: 'center' }}>
        <DomainTile host={host} />
        <View style={{ flex: 1 }}>
          <Txt variant="body" strong numberOfLines={1}>{host}</Txt>
          {rest ? <Txt variant="caption" sub numberOfLines={1}>{rest}</Txt> : null}
        </View>
        <StarButton starred={link.starred} onPress={onStar} />
      </View>
      {link.text ? <Txt variant="label" content sub numberOfLines={2}>{link.text.replace(link.url, '').trim() || link.text}</Txt> : null}
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
    </Card>
  );
}

export function LinkTile({ link, onStar, width }: LinkProps & { width: number }) {
  const { role } = useData();
  const { host, rest } = splitUrl(link.url, link.domain);
  return (
    <Card onPress={() => Linking.openURL(link.url)} style={{ width, padding: space.md, gap: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <View style={{ flex: 1 }}><DomainTile host={host} size={46} /></View>
        <StarButton starred={link.starred} onPress={onStar} />
      </View>
      <Txt variant="body" strong numberOfLines={1}>{host}</Txt>
      <Txt variant="label" content sub numberOfLines={2} style={{ minHeight: 42 }}>{link.text?.replace(link.url, '').trim() || rest || link.url}</Txt>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1 }}><RoleBadge role={role(link.sender_tg_id)} compact /></View>
        <ItemLink id={link.item_id} />
      </View>
    </Card>
  );
}

/** A file attached to a message, shown inline on the item screen. */
export function AttachmentRow({ file }: { file: FileRow }) {
  const t = useTheme();
  const problem = fileStatusText(file);
  return (
    <Pressable onPress={() => openFile(file)} disabled={file.status !== 'stored'} style={({ pressed }) => [{ flexDirection: 'row', gap: space.md, alignItems: 'center', padding: space.sm, borderRadius: radius.md, backgroundColor: t.surface }, pressed && styles.pressed]}>
      <ExtBadge file={file} size={38} />
      <View style={{ flex: 1 }}>
        <Txt variant="label" content numberOfLines={1}>{fileTitle(file)}</Txt>
        <Txt variant="caption" color={problem && file.status !== 'pending' ? t.danger : t.sub}>{problem ?? fmtSize(file.size_bytes)}</Txt>
      </View>
      {file.status === 'stored' ? <Ionicons name="open-outline" size={17} color={t.sub} /> : null}
    </Pressable>
  );
}
