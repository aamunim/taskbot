import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

// Touch feedback. Silent on web and wherever the device has no haptic engine.
const run = (fn: () => Promise<void>) => {
  if (Platform.OS === 'web') return;
  fn().catch(() => {});
};

/** A light tick for toggles, stars and selections. */
export const tap = () => run(() => Haptics.selectionAsync());
/** A firmer bump for starting or moving something. */
export const bump = () => run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
/** The "done" pattern for completing a task or step. */
export const success = () => run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
