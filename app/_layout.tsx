import '@/global.css';

import { NAV_THEME, THEME } from '@/lib/theme';
import { AppShellProvider, useAppShell } from '@/src/features/budget/app-shell';
import { ThemeProvider } from '@react-navigation/native';
import { PortalHost } from '@rn-primitives/portal';
import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ChartColumn, Inbox, List, Wallet } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export default function RootLayout() {
  const { colorScheme } = useColorScheme();

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
  const { colorScheme } = useColorScheme();
  const { inboxCount, isOnboarded } = useAppShell();
  const palette = THEME[colorScheme ?? 'light'];
  const showTabs = isOnboarded === true;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.primary,
        tabBarInactiveTintColor: palette.mutedForeground,
        tabBarStyle: showTabs
          ? {
              backgroundColor: palette.card,
              borderTopColor: palette.border,
            }
          : { display: 'none' },
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
      <Tabs.Screen name="+not-found" options={{ href: null }} />
    </Tabs>
  );
}
