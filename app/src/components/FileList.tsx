import { Ionicons } from '@expo/vector-icons';
import * as Linking from 'expo-linking';
import { Alert, Pressable, View } from 'react-native';
import { fileGroup, fileStatusText, fileTitle, fmtSize } from '@/lib/format';
import { signedUrl } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import type { FileRow } from '@/lib/types';
import { Txt } from './ui';

/** Opens a stored file in the phone's viewer/browser through a signed URL. */
export async function openFile(f: Pick<FileRow, 'storage_path' | 'status'>) {
  if (f.status !== 'stored' || !f.storage_path) return;
  const url = await signedUrl(f.storage_path);
  if (url) await Linking.openURL(url);
  else Alert.alert('ফাইল খোলা যায়নি', 'একটু পরে আবার চেষ্টা করুন।');
}

const ICONS = { photo: 'image-outline', voice: 'mic-outline', document: 'document-outline' } as const;

export function FileLine({ file, caption }: { file: FileRow; caption?: string }) {
  const t = useTheme();
  const problem = fileStatusText(file);
  return (
    <Pressable onPress={() => openFile(file)} disabled={file.status !== 'stored'} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 8 }}>
      <Ionicons name={ICONS[fileGroup(file)]} size={24} color={file.status === 'stored' ? t.primary : t.sub} />
      <View style={{ flex: 1 }}>
        <Txt numberOfLines={1}>{fileTitle(file)}</Txt>
        <Txt size={12} sub>{[fmtSize(file.size_bytes), caption].filter(Boolean).join(' · ')}</Txt>
        {problem ? <Txt size={12} color={file.status === 'pending' ? t.sub : t.warn}>{problem}</Txt> : null}
      </View>
      {file.status === 'stored' ? <Ionicons name="open-outline" size={18} color={t.sub} /> : null}
    </Pressable>
  );
}
