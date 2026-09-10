import { describe, expect, it } from 'vitest';

import { resolveAppTabBarStyle } from '../app-tabs';

const palette = {
  card: '#111',
  border: '#222',
};

describe('resolveAppTabBarStyle', () => {
  it('keeps the tab bar shown while onboarding state is still loading', () => {
    expect(resolveAppTabBarStyle(null, palette).display).toBe('flex');
  });

  it('hides tabs only after onboarding is known to be incomplete', () => {
    expect(resolveAppTabBarStyle(false, palette)).toMatchObject({
      display: 'none',
      backgroundColor: palette.card,
      borderTopColor: palette.border,
    });
  });

  it('explicitly unhides the tab bar after it was hidden', () => {
    expect(resolveAppTabBarStyle(false, palette).display).toBe('none');
    expect(resolveAppTabBarStyle(true, palette).display).toBe('flex');
  });
});
