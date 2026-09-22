/** The custom browser commands vitest.config.mts registers for the visual project; implemented under scripts/. */
declare module 'vitest/internal/browser' {
  interface BrowserCommands {
    /** Compares one screenshot's axe violations with scripts/a11y-baseline.json; see scripts/a11yRatchet.mjs. */
    a11yRatchet(
      screenshot: string,
      found: Record<string, number>
    ): Promise<{ allowed: number; found: number; rule: string }[]>
    /** The font files Chromium drew the nodes of a class with; see scripts/platformFonts.mjs. */
    platformFonts(
      className: string
    ): Promise<Array<Array<{ familyName: string; isCustomFont: boolean; glyphCount: number }>>>
    /** Moves the mouse out of the viewport so nothing renders hovered; see scripts/resetMouse.mjs. */
    resetMouse(): Promise<void>
  }
}
