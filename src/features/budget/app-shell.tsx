import * as React from 'react';

import { AppState } from 'react-native';

import { budgetAppStore } from '@/src/features/budget/app-store';
import { countInboxItems } from '@/src/features/budget/app-helpers';
import { requestNativeSmsPermission } from '@/src/features/budget/sms-permissions';

type AppShellValue = {
  isOnboarded: boolean | null;
  inboxCount: number;
  setOnboarded: (value: boolean) => void;
  refreshInboxCount: () => Promise<void>;
};

const AppShellContext = React.createContext<AppShellValue | null>(null);

export function AppShellProvider({ children }: { children: React.ReactNode }) {
  const [isOnboarded, setOnboarded] = React.useState<boolean | null>(null);
  const [inboxCount, setInboxCount] = React.useState(0);

  const refreshInboxCount = React.useCallback(async () => {
    const screenData = await budgetAppStore.drainQueuedSms(new Date());
    setOnboarded(screenData.budgetView !== null);
    setInboxCount(countInboxItems(screenData));
  }, []);

  React.useEffect(() => {
    void (async () => {
      await requestNativeSmsPermission();
      await refreshInboxCount();
    })().catch(() => {
      setOnboarded(false);
      setInboxCount(0);
    });
  }, [refreshInboxCount]);

  React.useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        return;
      }

      void refreshInboxCount().catch(() => undefined);
    });

    return () => subscription.remove();
  }, [refreshInboxCount]);

  const value = React.useMemo(
    () => ({
      isOnboarded,
      inboxCount,
      setOnboarded,
      refreshInboxCount,
    }),
    [inboxCount, isOnboarded, refreshInboxCount]
  );

  return <AppShellContext.Provider value={value}>{children}</AppShellContext.Provider>;
}

export function useAppShell() {
  const value = React.useContext(AppShellContext);

  if (!value) {
    throw new Error('useAppShell must be used inside AppShellProvider.');
  }

  return value;
}
