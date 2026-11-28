import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import type { ReactNode } from 'react';

export const colors = { teal: '#136a65', dark: '#172d38', muted: '#49616a', background: '#f1f7f7', line: '#d1e1e3', danger: '#a52323' };

export function Screen({ children }: { children: ReactNode }) {
  return <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">{children}</ScrollView>;
}
export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}
export function Heading({ children }: { children: ReactNode }) {
  return <Text accessibilityRole="header" style={styles.heading}>{children}</Text>;
}
export function Title({ children }: { children: ReactNode }) {
  return <Text accessibilityRole="header" style={styles.title}>{children}</Text>;
}
export function Body({ children }: { children: ReactNode }) {
  return <Text style={styles.body}>{children}</Text>;
}
export function Problem({ message }: { message: string }) {
  return <Text accessibilityRole="alert" style={styles.problem}>{message}</Text>;
}
export function Loading() { return <ActivityIndicator color={colors.teal} accessibilityLabel="Loading" />; }
export function Button({ title, onPress, disabled, secondary }: {
  title: string; onPress: () => void; disabled?: boolean; secondary?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, secondary && styles.secondary, (disabled || pressed) && styles.dimmed]}>
    <Text style={[styles.buttonText, secondary && styles.secondaryText]}>{title}</Text>
  </Pressable>;
}
export function Input({ label, ...props }: TextInputProps & { label: string }) {
  return <View style={{ gap: 5 }}><Text style={styles.label}>{label}</Text>
    <TextInput accessibilityLabel={label} placeholderTextColor={colors.muted} {...props} style={styles.input} /></View>;
}
export const message = (error: unknown) => error instanceof Error ? error.message : 'The request could not be completed.';

const styles = StyleSheet.create({
  screen: { padding: 18, gap: 14, paddingBottom: 38, width: '100%', maxWidth: 620, alignSelf: 'center' },
  card: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 15, gap: 10 },
  heading: { color: colors.dark, fontSize: 30, fontWeight: '800' },
  title: { color: colors.dark, fontSize: 19, fontWeight: '700' },
  body: { color: colors.muted, fontSize: 16, lineHeight: 23 },
  label: { color: colors.dark, fontSize: 16, fontWeight: '600' },
  input: { color: colors.dark, backgroundColor: '#fff', fontSize: 16, borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 12, minHeight: 48 },
  button: { backgroundColor: colors.teal, borderRadius: 10, paddingHorizontal: 15, paddingVertical: 12, minHeight: 48, justifyContent: 'center', alignItems: 'center' },
  secondary: { backgroundColor: '#e8f4f3', borderColor: colors.line, borderWidth: 1 },
  dimmed: { opacity: 0.55 },
  buttonText: { color: 'white', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  secondaryText: { color: colors.teal },
  problem: { color: colors.danger, fontSize: 16, lineHeight: 22 },
});
