import { useLocalSearchParams } from 'expo-router';
import { ItemDetailView } from '@/components/ItemDetail';
import { useLayout } from '@/lib/layout';

/** A task or note opened as its own screen (phone) or page (desktop direct link). */
export default function ItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { desktop } = useLayout();
  return <ItemDetailView key={id} id={id} mode={desktop ? 'page' : 'screen'} />;
}
