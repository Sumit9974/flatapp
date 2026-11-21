import { ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import { colors, fonts, radius, Tone, toneColor, avatarColor, initialOf } from '../theme';
import { Icon, IconName } from './Icon';

// Every Pressable below is collapsable={false}: a tappable view must always exist natively. A
// layout-only Pressable gets "flattened" away by Fabric and re-created when its pressed style
// changes, which is one route to the "child already has a parent" crash seen on Android.

export const type = StyleSheet.create({
  display: { fontFamily: fonts.display, fontSize: 24, color: colors.text, letterSpacing: -0.2 },
  title: { fontFamily: fonts.display, fontSize: 19, color: colors.text },
  h2: { fontFamily: fonts.semibold, fontSize: 16, color: colors.text },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.text },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 15, color: colors.text },
  small: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: colors.muted },
  smallStrong: { fontFamily: fonts.semibold, fontSize: 13, color: colors.text },
  tiny: { fontFamily: fonts.regular, fontSize: 12, color: colors.muted },
  overline: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.9, color: colors.muted, textTransform: 'uppercase' },
  num: { fontFamily: fonts.display, fontSize: 20, color: colors.text },
  big: { fontFamily: fonts.displayBold, fontSize: 34, color: colors.text },
});

// ---------------------------------------------------------------- layout

interface ScreenProps {
  children: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Leaves room under the content for a floating action button. */
  withFab?: boolean;
}

export function Screen({ children, onRefresh, refreshing = false, withFab = false }: ScreenProps) {
  return (
    <KeyboardAvoidingView style={styles.fill} behavior="padding">
      <ScrollView
        style={styles.fill}
        contentContainerStyle={[styles.screen, withFab && styles.screenFab]}
        keyboardShouldPersistTaps="handled"
        // Clipping detaches and re-attaches native children; with Fabric that path raised
        // "the specified child already has a parent", so it stays off.
        removeClippedSubviews={false}
        refreshControl={
          onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} /> : undefined
        }
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function Loading() {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );
}

type CardTone = 'default' | 'notice' | 'primary' | 'good' | 'warn' | 'bad' | 'danger';

const cardTone: Record<CardTone, ViewStyle> = {
  default: {},
  notice: { backgroundColor: colors.noticeBg, borderColor: colors.noticeBorder },
  primary: { backgroundColor: colors.primarySoft, borderColor: '#C9D6FF' },
  good: { backgroundColor: '#EEF8F2', borderColor: '#BFE3CC' },
  warn: { backgroundColor: '#FFF8EB', borderColor: '#F3DDA9' },
  bad: { backgroundColor: '#FDF1F1', borderColor: '#F1C4C4' },
  danger: { borderColor: '#F1C4C4' },
};

interface CardProps {
  title?: string;
  titleColor?: string;
  action?: ReactNode;
  tone?: CardTone;
  /** List cards: rows bring their own dividers and padding. */
  list?: boolean;
  children: ReactNode;
}

export function Card({ title, titleColor, action, tone = 'default', list = false, children }: CardProps) {
  return (
    <View style={[styles.card, cardTone[tone], list && styles.cardList]}>
      {title !== undefined || action !== undefined ? (
        <View style={[styles.between, list && styles.cardListHeader]}>
          {title !== undefined ? (
            <Text style={[type.h2, titleColor ? { color: titleColor } : null]} accessibilityRole="header">
              {title}
            </Text>
          ) : (
            <View />
          )}
          {action}
        </View>
      ) : null}
      {children}
    </View>
  );
}

export function Between({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.between, style]}>{children}</View>;
}

export function HStack({ children, gap = 12, style }: { children: ReactNode; gap?: number; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.row, { gap }, style]}>{children}</View>;
}

/** Equal-width columns; children fill rows left to right, the last row is padded. */
export function Grid({ children, columns = 2, gap = 8 }: { children: ReactNode[]; columns?: 2 | 3 | 4; gap?: number }) {
  const items = children.filter((c) => c !== null && c !== undefined && c !== false);
  const rows: ReactNode[][] = [];
  for (let i = 0; i < items.length; i += columns) rows.push(items.slice(i, i + columns));
  return (
    <View style={[styles.gridCol, { gap }]}>
      {rows.map((cells, r) => (
        <View key={r} style={[styles.gridRow, { gap }]}>
          {cells.map((cell, c) => (
            <View key={c} style={styles.gridCell}>
              {cell}
            </View>
          ))}
          {Array.from({ length: columns - cells.length }, (_, k) => (
            <View key={`pad-${k}`} style={styles.gridCell} />
          ))}
        </View>
      ))}
    </View>
  );
}

export function Row({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: Tone }) {
  return (
    <View style={styles.between}>
      <Text style={type.small}>{label}</Text>
      <Text style={[type.smallStrong, styles.rowValue, { color: toneColor[tone] }]}>{value}</Text>
    </View>
  );
}

export function Hint({ children, tone = 'muted', style }: { children: ReactNode; tone?: 'muted' | 'error'; style?: StyleProp<TextStyle> }) {
  return <Text style={[type.small, tone === 'error' && styles.errorText, style]}>{children}</Text>;
}

export function Body({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[type.body, style]}>{children}</Text>;
}

export function Notice({ message, tone = 'info', onDismiss }: { message: string; tone?: 'info' | 'error'; onDismiss: () => void }) {
  return (
    <Pressable
      collapsable={false}
      style={[styles.notice, tone === 'error' && styles.noticeError]}
      onPress={onDismiss}
      accessibilityRole="button"
      accessibilityHint="Dismisses this message"
    >
      <Text style={type.body}>{message}</Text>
    </Pressable>
  );
}

export function Empty({ icon, text, children }: { icon: IconName; text: string; children?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Icon name={icon} size={26} color={colors.primary} />
      </View>
      <Text style={[type.small, styles.center]}>{text}</Text>
      {children}
    </View>
  );
}

// ---------------------------------------------------------------- people and labels

export function Avatar({ id, name, size = 40, dot }: { id: string; name: string; size?: number; dot?: string }) {
  return (
    <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2, backgroundColor: avatarColor(id) }]}>
      <Text style={[styles.avatarText, { fontSize: size * 0.38 }]}>{initialOf(name)}</Text>
      {dot ? <View style={[styles.dot, { backgroundColor: dot }]} /> : null}
    </View>
  );
}

export function Pill({ text, bg, fg, icon, style }: { text: string; bg: string; fg: string; icon?: IconName; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }, style]}>
      {icon ? <Icon name={icon} size={13} color={fg} /> : null}
      <Text style={[styles.pillText, { color: fg }]}>{text}</Text>
    </View>
  );
}

export function Stat({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[type.tiny, styles.medium]}>{label}</Text>
      <Text style={[type.bodyStrong, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  );
}

export function BigStat({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[type.tiny, styles.medium]}>{label}</Text>
      <Text style={[type.num, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  );
}

export function Bar({ pct, color = colors.primary }: { pct: number; color?: string }) {
  return (
    <View style={styles.bar}>
      <View style={[styles.barFill, { width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: color }]} />
    </View>
  );
}

// ---------------------------------------------------------------- list rows

interface ListRowProps {
  title: string;
  subtitle?: string;
  subtitleColor?: string;
  right?: string;
  rightColor?: string;
  icon?: IconName;
  iconBg?: string;
  iconColor?: string;
  avatar?: { id: string; name: string; dot?: string };
  accessory?: ReactNode;
  chevron?: boolean;
  first?: boolean;
  bold?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
}

export function ListRow({
  title,
  subtitle,
  subtitleColor,
  right,
  rightColor,
  icon,
  iconBg = colors.slateSoft,
  iconColor = colors.slate,
  avatar,
  accessory,
  chevron = false,
  first = false,
  bold = true,
  onPress,
  onLongPress,
}: ListRowProps) {
  const content = (
    <>
      {icon ? (
        <View style={[styles.iconBox, { backgroundColor: iconBg }]}>
          <Icon name={icon} size={20} color={iconColor} />
        </View>
      ) : null}
      {avatar ? <Avatar id={avatar.id} name={avatar.name} dot={avatar.dot} /> : null}
      <View style={styles.listText}>
        <Text style={[bold ? type.bodyStrong : type.body]} numberOfLines={2}>
          {title}
        </Text>
        {subtitle ? <Text style={[type.small, subtitleColor ? { color: subtitleColor } : null]}>{subtitle}</Text> : null}
      </View>
      {right ? <Text style={[type.bodyStrong, rightColor ? { color: rightColor } : null]}>{right}</Text> : null}
      {accessory}
      {chevron ? <Icon name="next" size={18} color={colors.muted} /> : null}
    </>
  );
  const style = [styles.listRow, first && styles.listRowFirst];
  if (!onPress && !onLongPress) return <View style={style}>{content}</View>;
  return (
    <Pressable
      collapsable={false}
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={[title, subtitle, right].filter(Boolean).join(', ')}
      style={({ pressed }) => [style, pressed && styles.rowPressed]}
    >
      {content}
    </Pressable>
  );
}

// ---------------------------------------------------------------- inputs

interface FieldProps extends TextInputProps {
  label: string;
  error?: string | null;
  hint?: string;
  multiline?: boolean;
}

export function Field({ label, error, hint, style, multiline, ...input }: FieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor="#8A93A6"
        accessibilityLabel={label}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        style={[styles.input, multiline && styles.textArea, error ? styles.inputError : null, style]}
        {...input}
      />
      {error ? <Text style={[type.small, styles.errorText]}>{error}</Text> : hint ? <Text style={type.small}>{hint}</Text> : null}
    </View>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <Text style={styles.label}>{children}</Text>;
}

export function Chip({ label, selected, onPress, icon }: { label: string; selected: boolean; onPress: () => void; icon?: IconName }) {
  return (
    <Pressable
      collapsable={false}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [styles.chip, selected && styles.chipOn, pressed && styles.pressed]}
    >
      {icon ? <Icon name={icon} size={16} color={selected ? colors.onPrimary : colors.text} /> : null}
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

export function Chips({ children }: { children: ReactNode }) {
  return <View style={styles.chips}>{children}</View>;
}

export function Switch({ value, onValueChange, label, disabled = false }: { value: boolean; onValueChange: (v: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <Pressable
      collapsable={false}
      onPress={() => onValueChange(!value)}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      hitSlop={6}
      style={[styles.switch, { backgroundColor: value ? colors.primary : colors.switchOff, justifyContent: value ? 'flex-end' : 'flex-start' }, disabled && styles.inactive]}
    >
      <View style={styles.knob} />
    </Pressable>
  );
}

// ---------------------------------------------------------------- buttons

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'dangerGhost';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: 'md' | 'sm';
  icon?: IconName;
  busy?: boolean;
  disabled?: boolean;
  grow?: boolean;
  /** Custom colours for selected/unselected toggle buttons (votes). */
  colorsOverride?: { bg: string; fg: string; border: string };
  pressed?: boolean;
}

const buttonColors: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
  primary: { bg: colors.primary, fg: colors.onPrimary, border: colors.primary },
  secondary: { bg: colors.card, fg: colors.primary, border: colors.inputBorder },
  danger: { bg: colors.bad, fg: colors.onPrimary, border: colors.bad },
  dangerGhost: { bg: 'transparent', fg: colors.bad, border: '#F1C4C4' },
};

export function Button({ label, onPress, variant = 'primary', size = 'md', icon, busy = false, disabled = false, grow = false, colorsOverride, pressed: selected }: ButtonProps) {
  const inactive = disabled || busy;
  const c = colorsOverride ?? buttonColors[variant];
  return (
    <Pressable
      collapsable={false}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: inactive, busy, selected }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        size === 'sm' && styles.buttonSm,
        { backgroundColor: c.bg, borderColor: c.border },
        grow && styles.grow,
        inactive && styles.inactive,
        pressed && styles.pressed,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={c.fg} />
      ) : (
        <>
          {icon ? <Icon name={icon} size={size === 'sm' ? 17 : 19} color={c.fg} /> : null}
          <Text style={[styles.buttonText, size === 'sm' && styles.buttonTextSm, { color: c.fg }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

export function IconButton({ icon, label, onPress, color = colors.text, bg, size = 22, bordered = false }: { icon: IconName; label: string; onPress: () => void; color?: string; bg?: string; size?: number; bordered?: boolean }) {
  return (
    <Pressable
      collapsable={false}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      style={({ pressed }) => [styles.iconButton, bg ? { backgroundColor: bg } : null, bordered && styles.iconButtonBordered, pressed && styles.iconPressed]}
    >
      <Icon name={icon} size={size} color={color} />
    </Pressable>
  );
}

export function LinkButton({ label, onPress, color = colors.primary }: { label: string; onPress: () => void; color?: string }) {
  return (
    <Pressable collapsable={false} onPress={onPress} accessibilityRole="button" hitSlop={10} style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
      <Text style={[styles.linkText, { color }]}>{label}</Text>
    </Pressable>
  );
}

export function Fab({ label, icon = 'plus', onPress }: { label: string; icon?: IconName; onPress: () => void }) {
  return (
    <Pressable collapsable={false} onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}>
      <Icon name={icon} size={22} color={colors.onPrimary} />
      <Text style={styles.fabText}>{label}</Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------- styles

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.background },
  screen: { padding: 16, gap: 16, paddingBottom: 40 },
  screenFab: { paddingBottom: 104 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  card: { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: radius.card, padding: 16, gap: 12 },
  cardList: { gap: 0, paddingBottom: 4 },
  cardListHeader: { paddingBottom: 10 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center' },
  gridCol: { flexDirection: 'column' },
  gridRow: { flexDirection: 'row' },
  gridCell: { flex: 1, minWidth: 0 },
  rowValue: { flexShrink: 1, textAlign: 'right' },
  errorText: { color: colors.bad },
  medium: { fontFamily: fonts.medium },
  center: { textAlign: 'center' },
  notice: { backgroundColor: colors.primarySoft, borderRadius: radius.small, padding: 12 },
  noticeError: { backgroundColor: colors.badSoft },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 12 },
  emptyIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: fonts.semibold, color: '#FFFFFF' },
  dot: { position: 'absolute', right: -1, bottom: -1, width: 13, height: 13, borderRadius: 7, borderWidth: 2, borderColor: '#FFFFFF' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 24, paddingHorizontal: 10, borderRadius: 12, alignSelf: 'flex-start' },
  pillText: { fontFamily: fonts.semibold, fontSize: 12 },
  stat: { gap: 2, padding: 12, borderRadius: radius.control, backgroundColor: colors.background },
  bar: { height: 8, borderRadius: 4, backgroundColor: colors.divider, overflow: 'hidden' },
  barFill: { height: 8, borderRadius: 4 },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.divider, backgroundColor: colors.card },
  listRowFirst: { borderTopColor: 'transparent' },
  rowPressed: { backgroundColor: '#FAFBFD' },
  listText: { flex: 1, minWidth: 0, gap: 2 },
  iconBox: { width: 40, height: 40, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' },
  field: { gap: 6 },
  label: { fontFamily: fonts.medium, fontSize: 13, color: colors.muted },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.inputBorder, borderRadius: radius.control, paddingHorizontal: 14, fontFamily: fonts.regular, fontSize: 16, color: colors.text, backgroundColor: colors.card },
  textArea: { minHeight: 88, paddingTop: 12, paddingBottom: 12 },
  inputError: { borderColor: colors.bad },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 36, paddingHorizontal: 14, borderRadius: radius.chip, borderWidth: 1, borderColor: colors.inputBorder, backgroundColor: colors.card, flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontFamily: fonts.medium, fontSize: 14, color: colors.text },
  chipTextOn: { color: colors.onPrimary, fontFamily: fonts.semibold },
  switch: { width: 52, height: 32, borderRadius: 16, padding: 3, flexDirection: 'row', alignItems: 'center' },
  knob: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#FFFFFF', elevation: 2 },
  button: { minHeight: 48, borderRadius: radius.control, borderWidth: 1, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  buttonSm: { minHeight: 38, paddingHorizontal: 12, borderRadius: radius.small },
  buttonText: { fontFamily: fonts.semibold, fontSize: 15 },
  buttonTextSm: { fontSize: 14 },
  grow: { flex: 1 },
  inactive: { opacity: 0.45 },
  pressed: { opacity: 0.75 },
  iconButton: { width: 44, height: 44, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  iconButtonBordered: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
  iconPressed: { backgroundColor: '#F0F2F7' },
  link: { minHeight: 32, justifyContent: 'center' },
  linkText: { fontFamily: fonts.semibold, fontSize: 14 },
  fab: { position: 'absolute', right: 16, bottom: 16, height: 56, paddingLeft: 16, paddingRight: 20, borderRadius: 18, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', gap: 8, elevation: 6 },
  fabPressed: { backgroundColor: '#2449C7' },
  fabText: { fontFamily: fonts.semibold, fontSize: 15, color: colors.onPrimary },
});
