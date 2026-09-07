/**
 * The vitest browser command: `commands.resetMouse()` from the test iframe.
 *
 * Test files that share a browser page run one after another in it, and Playwright's mouse stays
 * where the previous file last clicked. Chromium gives whatever the next file renders under that
 * stationary cursor its :hover state, so a data grid row or a button came out highlighted in a
 * screenshot depending on which file happened to run before it (KOE-1387). Moving the cursor
 * outside the viewport clears the hover; nothing short of that does, since Chromium re-hovers
 * new content under a cursor that has not moved.
 */
export const resetMouse = (ctx) => ctx.page.mouse.move(-1, -1)
