import '@/global.css';

import { NAV_THEME, readStoredColorScheme, usePalette } from '@/lib/theme';
import { AppShellProvider, useAppShell } from '@/src/features/budget/app-shell';
import { resolveAppTabBarStyle } from '@/src/features/budget/app-tabs';
import { ThemeProvider } from '@react-navigation/native';
import { PortalHost } from '@rn-primitives/portal';
import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ChartColumn, Inbox, List, Settings, Wallet } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import * as React from 'react';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export default function RootLayout() {
  const { colorScheme, setColorScheme } = useColorScheme();

  React.useEffect(() => {
    const stored = readStoredColorScheme();
    if (stored) {
      setColorScheme(stored);
    }
  }, [setColorScheme]);

  return (
    <ThemeProvider value={NAV_THEME[colorScheme ?? 'light']}>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <AppShellProvider>
        <AppTabs />
      </AppShellProvider>
      <PortalHost />
    </ThemeProvider>
  );
}

function AppTabs() {
  const { inboxCount, isOnboarded } = useAppShell();
  const palette = usePalette();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.primary,
        tabBarInactiveTintColor: palette.mutedForeground,
        tabBarLabelStyle: { fontWeight: '600' },
        tabBarStyle: resolveAppTabBarStyle(isOnboarded, palette),
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Budget',
          tabBarIcon: ({ color, size }) => <Wallet color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: 'Inbox',
          tabBarBadge: inboxCount > 0 ? inboxCount : undefined,
          tabBarIcon: ({ color, size }) => <Inbox color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="transactions"
        options={{
          title: 'Activity',
          tabBarIcon: ({ color, size }) => <List color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: 'Reports',
          tabBarIcon: ({ color, size }) => <ChartColumn color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => <Settings color={color} size={size} />,
        }}
      />
      <Tabs.Screen name="+not-found" options={{ href: null }} />
    </Tabs>
  );
}
