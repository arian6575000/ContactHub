import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, StyleProp, Text, TextInput, TextInputProps,
  TextStyle, View, ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, router } from 'expo-router';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { C, R, SHADOW, STATUS_COLOR } from '../lib/theme';
import { Fmt } from '../lib/format';
import { subscribe } from '../db/repo';
import type { ContractStatus } from '../db/types';

export type IconName = React.ComponentProps<typeof Feather>['name'];

// ---- data loading ---------------------------------------------------------------
/** Runs `fn` whenever the screen gains focus or a sync replaces the data. */
export function useLoad<T>(fn: () => Promise<T>, deps: React.DependencyList = []): { data: T | null; reload: () => void; loading: boolean } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    fn().then((d) => { setData(d); setLoading(false); }).catch(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useFocusEffect(useCallback(() => { load(); }, [load]));
  useEffect(() => subscribe((s) => { if (s === 'sync') load(); }), [load]);
  return { data, reload: load, loading };
}

// ---- layout ---------------------------------------------------------------------
export function Screen({ children, scroll = true, bottomPad = 110 }: { children: React.ReactNode; scroll?: boolean; bottomPad?: number }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <LinearGradient colors={[C.bg, C.bg2]} style={{ position: 'absolute', inset: 0 } as ViewStyle} />
      <View style={{ position: 'absolute', top: -60, right: -60, width: 220, height: 220, borderRadius: 110, backgroundColor: C.blob1, opacity: 0.45 }} />
      <View style={{ position: 'absolute', top: 280, left: -90, width: 220, height: 220, borderRadius: 110, backgroundColor: C.blob2, opacity: 0.35 }} />
      <View style={{ position: 'absolute', bottom: 80, right: -70, width: 200, height: 200, borderRadius: 100, backgroundColor: C.blob3, opacity: 0.4 }} />
      <View style={{ flex: 1, paddingTop: insets.top }}>
        {scroll ? (
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: bottomPad }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        ) : children}
      </View>
    </View>
  );
}

export function TopBar({ title, subtitle, back, right }: { title: string; subtitle?: string; back?: boolean; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, gap: 12 }}>
      {back ? <IconBtn icon="arrow-left" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} /> : null}
      <View style={{ flex: 1 }}>
        {subtitle ? <Text style={{ color: C.faint, fontSize: 12.5, fontWeight: '600' }}>{subtitle}</Text> : null}
        <Text numberOfLines={1} style={{ color: C.ink, fontSize: 24, fontWeight: '800' }}>{title}</Text>
      </View>
      {right}
    </View>
  );
}

export function IconBtn({ icon, onPress, color = C.ink, bg }: { icon: IconName; onPress?: () => void; color?: string; bg?: string }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityRole="button"
      style={({ pressed }) => ({
        width: 40, height: 40, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
        backgroundColor: bg ?? C.glassStrong, borderWidth: 1, borderColor: C.glassBorder, opacity: pressed ? 0.6 : 1,
      })}>
      <Feather name={icon} size={19} color={color} />
    </Pressable>
  );
}

export function Card({ children, style, onPress, pad = 16 }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; pad?: number }) {
  const base: ViewStyle = {
    backgroundColor: C.glass, borderRadius: R.lg, borderWidth: 1, borderColor: C.glassBorder, padding: pad, marginBottom: 12, ...SHADOW,
  };
  if (onPress) return <Pressable onPress={onPress} style={({ pressed }) => [base, style, { opacity: pressed ? 0.8 : 1 }]}>{children}</Pressable>;
  return <View style={[base, style]}>{children}</View>;
}

export function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10, marginBottom: 8, paddingHorizontal: 4 }}>
      <Text style={{ color: C.faint, fontSize: 12, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' }}>{children}</Text>
      {right}
    </View>
  );
}

// ---- text + inputs ---------------------------------------------------------------
export function T({ children, style, size = 14, weight = '400', color = C.ink, lines }: {
  children: React.ReactNode; style?: StyleProp<TextStyle>; size?: number; weight?: TextStyle['fontWeight']; color?: string; lines?: number;
}) {
  return <Text numberOfLines={lines} style={[{ fontSize: size, fontWeight: weight, color }, style]}>{children}</Text>;
}

export function Field({ label, hint, style, multiline, ...rest }: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: C.soft, fontSize: 13, fontWeight: '700', marginBottom: 6, marginLeft: 2 }}>{label}</Text>
      <TextInput
        placeholderTextColor={C.faint}
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
        {...rest}
        style={[{
          backgroundColor: 'rgba(255,255,255,0.9)', borderWidth: 1, borderColor: C.line, borderRadius: R.sm,
          paddingHorizontal: 14, paddingVertical: Platform.OS === 'ios' ? 13 : 10, fontSize: 15, color: C.ink,
          minHeight: multiline ? 92 : undefined,
        }, style]}
      />
      {hint ? <Text style={{ color: C.faint, fontSize: 12, marginTop: 5, marginLeft: 2 }}>{hint}</Text> : null}
    </View>
  );
}

export function Btn({ title, onPress, icon, variant = 'primary', disabled, loading, small, style }: {
  title: string; onPress?: () => void; icon?: IconName; variant?: 'primary' | 'ghost' | 'danger' | 'subtle'; disabled?: boolean;
  loading?: boolean; small?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const bg = variant === 'primary' ? C.primary : variant === 'danger' ? C.danger : variant === 'subtle' ? 'rgba(62,107,255,0.12)' : C.glassStrong;
  const fg = variant === 'primary' || variant === 'danger' ? '#fff' : variant === 'subtle' ? C.primary : C.ink;
  return (
    <Pressable onPress={onPress} disabled={disabled || loading} accessibilityRole="button"
      style={({ pressed }) => [{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: bg,
        paddingVertical: small ? 9 : 15, paddingHorizontal: small ? 14 : 18, borderRadius: small ? 12 : R.md,
        borderWidth: variant === 'ghost' ? 1 : 0, borderColor: C.line, opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
        marginBottom: small ? 0 : 12,
      }, style]}>
      {loading ? <ActivityIndicator color={fg} /> : icon ? <Feather name={icon} size={small ? 15 : 18} color={fg} /> : null}
      <Text style={{ color: fg, fontWeight: '700', fontSize: small ? 13.5 : 15.5 }}>{title}</Text>
    </Pressable>
  );
}

export function Segmented<V extends string>({ value, options, onChange }: {
  value: V; options: { value: V; label: string }[]; onChange: (v: V) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', backgroundColor: 'rgba(20,22,31,0.06)', borderRadius: R.sm, padding: 3 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={{
            flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center', backgroundColor: on ? '#fff' : 'transparent',
          }}>
            <Text style={{ fontWeight: '700', fontSize: 13.5, color: on ? C.primary : C.soft }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chip({ label, on, onPress, color = C.primary }: { label: string; on?: boolean; onPress?: () => void; color?: string }) {
  return (
    <Pressable onPress={onPress} style={{
      paddingHorizontal: 13, paddingVertical: 8, borderRadius: 999, marginRight: 8, marginBottom: 8,
      backgroundColor: on ? color : 'rgba(255,255,255,0.85)', borderWidth: 1, borderColor: on ? color : C.line,
    }}>
      <Text style={{ color: on ? '#fff' : C.soft, fontWeight: '700', fontSize: 13 }}>{label}</Text>
    </Pressable>
  );
}

export function Badge({ status }: { status: ContractStatus }) {
  const c = STATUS_COLOR[status] ?? C.faint;
  return (
    <View style={{ backgroundColor: `${c}22`, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: 'flex-start' }}>
      <Text style={{ color: c, fontSize: 11.5, fontWeight: '800' }}>{Fmt.status(status)}</Text>
    </View>
  );
}

export function Avatar({ name, size = 44 }: { name?: string | null; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.3, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(62,107,255,0.14)' }}>
      <Text style={{ color: C.primary, fontWeight: '800', fontSize: size * 0.34 }}>{Fmt.initials(name)}</Text>
    </View>
  );
}

export function Row({ title, sub, trail, trailSub, avatar, onPress, last }: {
  title: string; sub?: string; trail?: React.ReactNode; trailSub?: React.ReactNode; avatar?: string; onPress?: () => void; last?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({
      flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, opacity: pressed && onPress ? 0.6 : 1,
      borderBottomWidth: last ? 0 : 1, borderBottomColor: C.line,
    })}>
      {avatar !== undefined ? <Avatar name={avatar} /> : null}
      <View style={{ flex: 1 }}>
        <Text numberOfLines={1} style={{ color: C.ink, fontWeight: '700', fontSize: 15 }}>{title}</Text>
        {sub ? <Text numberOfLines={1} style={{ color: C.faint, fontSize: 12.5, marginTop: 2 }}>{sub}</Text> : null}
      </View>
      {trail !== undefined || trailSub !== undefined ? (
        <View style={{ alignItems: 'flex-end', gap: 4 }}>
          {typeof trail === 'string' ? <Text style={{ color: C.ink, fontWeight: '800', fontSize: 13.5 }}>{trail}</Text> : trail}
          {trailSub}
        </View>
      ) : null}
    </Pressable>
  );
}

export function KV({ k, v }: { k: string; v: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, gap: 16, borderBottomWidth: 1, borderBottomColor: C.line }}>
      <Text style={{ color: C.faint, fontSize: 13.5 }}>{k}</Text>
      <Text style={{ color: C.ink, fontWeight: '600', fontSize: 13.5, flexShrink: 1, textAlign: 'right' }}>{v}</Text>
    </View>
  );
}

export function Empty({ icon, title, text, action }: { icon: IconName; title: string; text: string; action?: React.ReactNode }) {
  return (
    <Card style={{ alignItems: 'center', paddingVertical: 28 }}>
      <View style={{ width: 54, height: 54, borderRadius: 18, backgroundColor: 'rgba(62,107,255,0.12)', alignItems: 'center', justifyContent: 'center' }}>
        <Feather name={icon} size={24} color={C.primary} />
      </View>
      <Text style={{ fontWeight: '800', fontSize: 16, marginTop: 12, color: C.ink }}>{title}</Text>
      <Text style={{ color: C.faint, textAlign: 'center', marginTop: 4, marginBottom: action ? 14 : 0 }}>{text}</Text>
      {action}
    </Card>
  );
}

export function SearchBar({ value, onChangeText, placeholder }: { value: string; onChangeText: (s: string) => void; placeholder: string }) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.glass, borderRadius: R.md, borderWidth: 1,
      borderColor: C.glassBorder, paddingHorizontal: 14, marginBottom: 12,
    }}>
      <Feather name="search" size={18} color={C.faint} />
      <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={C.faint}
        style={{ flex: 1, paddingVertical: 12, fontSize: 15, color: C.ink }} />
    </View>
  );
}

export function Loading() {
  return <View style={{ paddingVertical: 60, alignItems: 'center' }}><ActivityIndicator color={C.primary} /></View>;
}

// ---- date field -------------------------------------------------------------------
export function DateField({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  const [iosOpen, setIosOpen] = useState(false);
  const open = () => {
    const current = new Date(value ?? Date.now());
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current, mode: 'date',
        onChange: (e, d) => { if (e.type === 'set' && d) onChange(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()); },
      });
    } else setIosOpen(true);
  };
  return (
    <View style={{ marginBottom: 14, flex: 1 }}>
      <Text style={{ color: C.soft, fontSize: 13, fontWeight: '700', marginBottom: 6, marginLeft: 2 }}>{label}</Text>
      <Pressable onPress={open} style={{
        backgroundColor: 'rgba(255,255,255,0.9)', borderWidth: 1, borderColor: C.line, borderRadius: R.sm,
        paddingHorizontal: 14, paddingVertical: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <Text style={{ color: value ? C.ink : C.faint, fontSize: 15 }}>{value ? Fmt.date(value, true) : 'Select date'}</Text>
        {value ? <Feather name="x" size={16} color={C.faint} onPress={() => onChange(null)} /> : <Feather name="calendar" size={16} color={C.faint} />}
      </Pressable>
      {iosOpen ? (
        <Modal transparent animationType="fade" onRequestClose={() => setIosOpen(false)}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }} onPress={() => setIosOpen(false)}>
            <View style={{ backgroundColor: '#fff', padding: 16, borderTopLeftRadius: 24, borderTopRightRadius: 24 }}>
              <DateTimePicker value={new Date(value ?? Date.now())} mode="date" display="inline"
                onChange={(_, d) => { if (d) onChange(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()); }} />
              <Btn title="Done" onPress={() => setIosOpen(false)} />
            </View>
          </Pressable>
        </Modal>
      ) : null}
    </View>
  );
}

// ---- dialogs ------------------------------------------------------------------------
export function confirmDialog(message: string, okLabel = 'Delete', title = 'Are you sure?'): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: okLabel, style: 'destructive', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
}

export function ActionSheet({ visible, title, onClose, actions }: {
  visible: boolean; title: string; onClose: () => void;
  actions: { label: string; icon: IconName; danger?: boolean; onPress: () => void }[];
}) {
  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }} onPress={onClose}>
        <View style={{ backgroundColor: '#fff', padding: 18, paddingBottom: 30, borderTopLeftRadius: 26, borderTopRightRadius: 26 }}>
          <Text style={{ fontWeight: '800', fontSize: 17, marginBottom: 6, color: C.ink }}>{title}</Text>
          {actions.map((a, i) => (
            <Pressable key={a.label} onPress={() => { onClose(); a.onPress(); }} style={{
              flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14,
              borderBottomWidth: i === actions.length - 1 ? 0 : 1, borderBottomColor: C.line,
            }}>
              <Feather name={a.icon} size={20} color={a.danger ? C.danger : C.primary} />
              <Text style={{ fontWeight: '700', fontSize: 15.5, color: a.danger ? C.danger : C.ink }}>{a.label}</Text>
            </Pressable>
          ))}
        </View>
      </Pressable>
    </Modal>
  );
}
