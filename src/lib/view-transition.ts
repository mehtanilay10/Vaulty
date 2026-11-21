/**
 * View Transitions API Helper
 * Enables smooth morphing and cross-fading of UI states.
 * Automatically respects `prefers-reduced-motion` and provides instant execution in unsupported browsers.
 */

export function startViewTransition(callback: () => void | Promise<void>): void {
  if (
    typeof document !== "undefined" &&
    "startViewTransition" in document &&
    typeof (document as unknown as { startViewTransition?: (cb: () => void) => void })
      .startViewTransition === "function" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    (document as unknown as { startViewTransition: (cb: () => void) => void }).startViewTransition(
      () => {
        void callback();
      },
    );
    return;
  }
  void callback();
}
