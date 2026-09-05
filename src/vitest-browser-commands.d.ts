/** The custom browser commands vitest.config.mts registers for the visual project; implemented under scripts/. */
declare module 'vitest/internal/browser' {
  interface BrowserCommands {
    /** Compares one screenshot's axe violations with scripts/a11y-baseline.json; see scripts/a11yRatchet.mjs. */
    a11yRatchet(
      screenshot: string,
      found: Record<string, number>
    ): Promise<{ allowed: number; found: number; rule: string }[]>
  }
}
