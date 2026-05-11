import { Children, Fragment, ReactNode, isValidElement } from 'react';
import {
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
  ViewStyle,
  type StyleProp,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';

export const SettingsTokens = {
  cardBg: '#252528',
  cardBorder: '#38383A',
  iconAccent: '#8DC5D8',
  labelColor: '#FFFFFF',
  metaColor: '#787878',
  destructive: '#FF453A',
  rowPaddingV: 14,
  rowPaddingH: 16,
  rowGap: 14,
  cardRadius: 16,
  iconSize: 18,
  chevronSize: 16,
  labelFontSize: 14,
  descriptionFontSize: 12,
} as const;

type IoniconName = keyof typeof Ionicons.glyphMap;

export function SettingsHeader({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      {onBack ? (
        <Pressable onPress={onBack} style={styles.backButton} hitSlop={8}>
          <Ionicons name="arrow-back" size={22} color={SettingsTokens.labelColor} />
        </Pressable>
      ) : null}
      <View style={styles.headerTextWrap}>
        <Text style={styles.headerTitle}>{title}</Text>
        {subtitle ? <Text style={styles.headerSubtitle}>{subtitle}</Text> : null}
      </View>
      {right ? <View>{right}</View> : null}
    </View>
  );
}

export function SettingsSection({
  title,
  children,
  style,
}: {
  title?: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const items = Children.toArray(children).filter(
    (child) => isValidElement(child) && child.props && (child.props as { hidden?: boolean }).hidden !== true
  );
  return (
    <View style={style}>
      {title ? <Text style={styles.sectionTitle}>{title}</Text> : null}
      <View style={styles.card}>
        {items.map((child, idx) => (
          <Fragment key={idx}>
            {child}
            {idx < items.length - 1 ? <View style={styles.separator} /> : null}
          </Fragment>
        ))}
      </View>
    </View>
  );
}

function RowShell({
  onPress,
  children,
  disabled,
}: {
  onPress?: () => void;
  children: ReactNode;
  disabled?: boolean;
}) {
  if (onPress) {
    return (
      <Pressable
        disabled={disabled}
        onPress={onPress}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
        {children}
      </Pressable>
    );
  }
  return <View style={styles.row}>{children}</View>;
}

export function SettingsRow({
  icon,
  iconColor,
  label,
  description,
  value,
  destructive,
  onPress,
  right,
  trailing,
  hidden: _hidden,
}: {
  icon: IoniconName;
  iconColor?: string;
  label: string;
  description?: string;
  value?: string;
  destructive?: boolean;
  onPress?: () => void;
  right?: ReactNode;
  trailing?: 'chevron' | 'none';
  hidden?: boolean;
}) {
  const accent = destructive
    ? SettingsTokens.destructive
    : iconColor ?? SettingsTokens.iconAccent;
  const labelColor = destructive ? SettingsTokens.destructive : SettingsTokens.labelColor;
  const showChevron = (trailing ?? (onPress ? 'chevron' : 'none')) === 'chevron';

  return (
    <RowShell onPress={onPress}>
      <View style={styles.rowLeft}>
        <Ionicons name={icon} size={SettingsTokens.iconSize} color={accent} />
        <View style={styles.rowText}>
          <Text style={[styles.rowLabel, { color: labelColor }]} numberOfLines={1}>
            {label}
          </Text>
          {description ? (
            <Text style={styles.rowDescription} numberOfLines={2}>
              {description}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.rowRight}>
        {value ? <Text style={styles.rowValue}>{value}</Text> : null}
        {right}
        {showChevron ? (
          <Ionicons
            name="chevron-forward"
            size={SettingsTokens.chevronSize}
            color={SettingsTokens.metaColor}
          />
        ) : null}
      </View>
    </RowShell>
  );
}

export function SettingsSwitchRow({
  icon,
  iconColor,
  label,
  description,
  value,
  onValueChange,
  trackColor,
  thumbColor,
  hidden: _hidden,
}: {
  icon: IoniconName;
  iconColor?: string;
  label: string;
  description?: string;
  value: boolean;
  onValueChange: (next: boolean) => void;
  trackColor?: { false: string; true: string };
  thumbColor?: string;
  hidden?: boolean;
}) {
  return (
    <RowShell>
      <View style={styles.rowLeft}>
        <Ionicons
          name={icon}
          size={SettingsTokens.iconSize}
          color={iconColor ?? SettingsTokens.iconAccent}
        />
        <View style={styles.rowText}>
          <Text style={styles.rowLabel} numberOfLines={1}>
            {label}
          </Text>
          {description ? (
            <Text style={styles.rowDescription} numberOfLines={2}>
              {description}
            </Text>
          ) : null}
        </View>
      </View>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={trackColor ?? { false: '#333', true: SettingsTokens.iconAccent }}
        thumbColor={thumbColor ?? SettingsTokens.labelColor}
      />
    </RowShell>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 9999,
  },
  headerTextWrap: {
    flex: 1,
    gap: 2,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '800',
  },
  headerSubtitle: {
    color: SettingsTokens.metaColor,
    fontSize: 14,
  },
  sectionTitle: {
    color: SettingsTokens.metaColor,
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: SettingsTokens.cardBg,
    borderRadius: SettingsTokens.cardRadius,
    borderWidth: 1,
    borderColor: SettingsTokens.cardBorder,
    overflow: 'hidden',
  },
  separator: {
    height: 1,
    backgroundColor: SettingsTokens.cardBorder,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SettingsTokens.rowPaddingV,
    paddingHorizontal: SettingsTokens.rowPaddingH,
    gap: SettingsTokens.rowGap,
  },
  rowPressed: {
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  rowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SettingsTokens.rowGap,
    flex: 1,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  rowLabel: {
    color: SettingsTokens.labelColor,
    fontSize: SettingsTokens.labelFontSize,
    fontWeight: '600',
  },
  rowDescription: {
    color: SettingsTokens.metaColor,
    fontSize: SettingsTokens.descriptionFontSize,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rowValue: {
    color: SettingsTokens.metaColor,
    fontSize: 13,
    fontWeight: '500',
  },
});
