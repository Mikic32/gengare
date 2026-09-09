import { DarkTheme, DefaultTheme, type Theme } from '@react-navigation/native';
import { useColorScheme } from 'nativewind';

export {
  COLOR_SCHEME_STORAGE_KEY,
  readStoredColorScheme,
  storeColorScheme,
  type AppColorScheme,
} from '@/lib/color-scheme-storage';

// Icon / splash green: #1A3B28
export const THEME = {
  light: {
    background: 'hsl(140 22% 96%)',
    foreground: 'hsl(146 28% 10%)',
    card: 'hsl(48 33% 99%)',
    cardForeground: 'hsl(146 28% 10%)',
    popover: 'hsl(48 33% 99%)',
    popoverForeground: 'hsl(146 28% 10%)',
    primary: 'hsl(146 39% 17%)',
    primaryForeground: 'hsl(45 30% 96%)',
    secondary: 'hsl(146 16% 92%)',
    secondaryForeground: 'hsl(146 28% 12%)',
    muted: 'hsl(140 16% 92%)',
    mutedForeground: 'hsl(146 10% 38%)',
    accent: 'hsl(146 18% 90%)',
    accentForeground: 'hsl(146 39% 17%)',
    destructive: 'hsl(336 64% 50%)',
    border: 'hsl(146 14% 84%)',
    input: 'hsl(146 14% 84%)',
    ring: 'hsl(146 39% 28%)',
    radius: '0.75rem',
    chart1: 'hsl(146 39% 28%)',
    chart2: 'hsl(146 32% 45%)',
    chart3: 'hsl(40 42% 52%)',
    chart4: 'hsl(336 64% 50%)',
    chart5: 'hsl(146 20% 62%)',
  },
  dark: {
    background: 'hsl(146 28% 6%)',
    foreground: 'hsl(45 20% 95%)',
    card: 'hsl(146 22% 9%)',
    cardForeground: 'hsl(45 20% 95%)',
    popover: 'hsl(146 22% 9%)',
    popoverForeground: 'hsl(45 20% 95%)',
    primary: 'hsl(146 36% 58%)',
    primaryForeground: 'hsl(146 32% 8%)',
    secondary: 'hsl(146 16% 14%)',
    secondaryForeground: 'hsl(45 20% 95%)',
    muted: 'hsl(146 14% 14%)',
    mutedForeground: 'hsl(140 10% 68%)',
    accent: 'hsl(146 16% 16%)',
    accentForeground: 'hsl(45 20% 95%)',
    destructive: 'hsl(336 62% 66%)',
    border: 'hsl(146 14% 16%)',
    input: 'hsl(146 14% 16%)',
    ring: 'hsl(146 36% 48%)',
    radius: '0.75rem',
    chart1: 'hsl(146 36% 52%)',
    chart2: 'hsl(146 28% 38%)',
    chart3: 'hsl(40 42% 58%)',
    chart4: 'hsl(336 62% 66%)',
    chart5: 'hsl(146 18% 70%)',
  },
};

export function usePalette() {
  const { colorScheme } = useColorScheme();
  return THEME[colorScheme ?? 'light'];
}

export const NAV_THEME: Record<'light' | 'dark', Theme> = {
  light: {
    ...DefaultTheme,
    colors: {
      background: THEME.light.background,
      border: THEME.light.border,
      card: THEME.light.card,
      notification: THEME.light.destructive,
      primary: THEME.light.primary,
      text: THEME.light.foreground,
    },
  },
  dark: {
    ...DarkTheme,
    colors: {
      background: THEME.dark.background,
      border: THEME.dark.border,
      card: THEME.dark.card,
      notification: THEME.dark.destructive,
      primary: THEME.dark.primary,
      text: THEME.dark.foreground,
    },
  },
};
