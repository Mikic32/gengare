export function resolveAppTabBarStyle(
  isOnboarded: boolean | null,
  palette: { card: string; border: string }
) {
  return {
    backgroundColor: palette.card,
    borderTopColor: palette.border,
    display: isOnboarded === false ? ('none' as const) : ('flex' as const),
  };
}
