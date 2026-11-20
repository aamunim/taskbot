import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform } from 'react-native';

type PickOptions = { value: Date; mode: 'date' | 'time'; onChange: (picked: Date) => void };

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Opens the platform's date or time picker. `value` and the picked Date use
 * local fields (year, month, day, hours, minutes), the same on every platform.
 */
export function pickDateTime({ value, mode, onChange }: PickOptions) {
  if (Platform.OS === 'android') {
    DateTimePickerAndroid.open({ value, mode, is24Hour: false, onValueChange: (_event, date) => onChange(date) });
    return;
  }
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;

  // The browser's own picker, through a temporary off-screen input.
  const input = document.createElement('input');
  input.type = mode;
  input.value =
    mode === 'date'
      ? `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`
      : `${pad(value.getHours())}:${pad(value.getMinutes())}`;
  Object.assign(input.style, { position: 'fixed', left: '50%', top: '40%', opacity: '0', width: '1px', height: '1px' });
  const cleanup = () => input.remove();
  input.addEventListener('change', () => {
    const picked = new Date(value);
    if (mode === 'date') {
      const [y, m, d] = input.value.split('-').map(Number);
      if (y && m && d) picked.setFullYear(y, m - 1, d);
    } else {
      const [h, min] = input.value.split(':').map(Number);
      if (!Number.isNaN(h) && !Number.isNaN(min)) picked.setHours(h, min, 0, 0);
    }
    if (input.value) onChange(picked);
    cleanup();
  });
  input.addEventListener('blur', () => setTimeout(cleanup, 300));
  document.body.appendChild(input);
  try {
    input.showPicker();
  } catch {
    input.focus();
    input.click();
  }
}
