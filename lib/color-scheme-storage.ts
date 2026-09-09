export const COLOR_SCHEME_STORAGE_KEY = 'gengare-color-scheme';

export type AppColorScheme = 'light' | 'dark';

export function readStoredColorScheme(): AppColorScheme | null {
  try {
    if (typeof localStorage === 'undefined') {
      return null;
    }

    const value = localStorage.getItem(COLOR_SCHEME_STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}

export function storeColorScheme(scheme: AppColorScheme) {
  try {
    if (typeof localStorage === 'undefined') {
      return;
    }

    localStorage.setItem(COLOR_SCHEME_STORAGE_KEY, scheme);
  } catch {
    // Ignore quota / private-mode failures.
  }
}
