import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';

/** The design's icon set, mapped to Feather (line icons) and a few Material Community glyphs. */
const ICONS = {
  menu: ['f', 'menu'],
  back: ['f', 'chevron-left'],
  next: ['f', 'chevron-right'],
  down: ['f', 'chevron-down'],
  bell: ['f', 'bell'],
  home: ['f', 'home'],
  receipt: ['f', 'file-text'],
  utensils: ['m', 'silverware-fork-knife'],
  cart: ['f', 'shopping-cart'],
  bag: ['f', 'shopping-bag'],
  x: ['f', 'x'],
  plus: ['f', 'plus'],
  check: ['f', 'check'],
  users: ['f', 'users'],
  pin: ['f', 'map-pin'],
  building: ['m', 'home-city-outline'],
  megaphone: ['m', 'bullhorn-outline'],
  poll: ['f', 'bar-chart-2'],
  wrench: ['f', 'tool'],
  gear: ['f', 'settings'],
  wifi: ['f', 'wifi'],
  phone: ['f', 'phone'],
  logout: ['f', 'log-out'],
  share: ['f', 'share-2'],
  copy: ['f', 'copy'],
  eye: ['f', 'eye'],
  eyeOff: ['f', 'eye-off'],
  file: ['f', 'file'],
  repeat: ['f', 'repeat'],
  flame: ['m', 'fire'],
  zap: ['f', 'zap'],
  drop: ['f', 'droplet'],
  pushpin: ['m', 'pin-outline'],
  edit: ['f', 'edit-2'],
  fingerprint: ['m', 'fingerprint'],
  lock: ['f', 'lock'],
  trash: ['f', 'trash-2'],
  userPlus: ['f', 'user-plus'],
  clock: ['f', 'clock'],
  upload: ['f', 'upload'],
  tag: ['f', 'tag'],
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 22, color }: { name: IconName; size?: number; color: string }) {
  const [family, glyph] = ICONS[name];
  if (family === 'm') {
    return <MaterialCommunityIcons name={glyph as keyof typeof MaterialCommunityIcons.glyphMap} size={size} color={color} />;
  }
  return <Feather name={glyph as keyof typeof Feather.glyphMap} size={size} color={color} />;
}
