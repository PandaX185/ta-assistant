/// True on phones/tablets (the Tauri Android/iOS targets), where desktop-only
/// features like the global search hotkey don't exist. Synchronous on
/// purpose so first-render UI (e.g. the onboarding wizard) can branch on it.
export function isMobilePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent ?? "");
}
