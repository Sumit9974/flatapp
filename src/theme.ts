// Design tokens from the approved prototype (https://claude.ai/artifact/YHX8KU28NfrqyahChRMc3W).
export const colors = {
  background: '#F5F6FA',
  card: '#FFFFFF',
  border: '#E4E7EE',
  divider: '#EEF0F4',
  inputBorder: '#D5DAE5',
  text: '#111827',
  muted: '#5B6474',
  primary: '#2F5BEA',
  primaryDark: '#1E3FB5',
  primarySoft: '#EAF0FF',
  primaryTint: '#E3EAFF',
  onPrimary: '#FFFFFF',
  good: '#1E7F46',
  goodSoft: '#E6F4EC',
  warn: '#8A5300',
  warnSoft: '#FFF4E0',
  bad: '#C62828',
  badSoft: '#FDECEC',
  violet: '#6D28D9',
  violetSoft: '#F1EAFE',
  slate: '#4B5563',
  slateSoft: '#F0F1F4',
  switchOff: '#8A93A6',
  backdrop: 'rgba(17,24,39,0.45)',
  ink: '#111827',
  noticeBg: '#FFFBEB',
  noticeBorder: '#F3E2A9',
  // kept for the geofence test screen
  noticeBackground: '#EAF0FF',
  errorBackground: '#FDECEC',
  detected: '#2F5BEA',
  marked: '#1E7F46',
  info: '#8A93A6',
  onPrimaryMuted: 'rgba(255,255,255,0.85)',
} as const;

export const fonts = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  display: 'SpaceGrotesk_600SemiBold',
  displayBold: 'SpaceGrotesk_700Bold',
} as const;

export const radius = { card: 16, control: 12, chip: 18, small: 10 } as const;

export type Tone = 'good' | 'warn' | 'bad' | 'neutral' | 'muted';

export const toneColor: Record<Tone, string> = {
  good: colors.good,
  warn: colors.warn,
  bad: colors.bad,
  neutral: colors.text,
  muted: colors.muted,
};

/** Avatar colours, all with white text at 4.5:1 or better. */
const AVATAR_COLORS = ['#2F5BEA', '#0F766E', '#B4235A', '#7C3AED', '#B45309', '#475569', '#1D4ED8', '#9D174D'];

export function avatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length] ?? colors.primary;
}

export function initialOf(name: string): string {
  return (name.trim().charAt(0) || '?').toUpperCase();
}
