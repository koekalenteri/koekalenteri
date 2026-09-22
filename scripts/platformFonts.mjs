/**
 * The vitest browser command: `commands.platformFonts('cm-line')` from the test iframe.
 *
 * Which font file Chromium actually drew a node with, from the DevTools protocol; the computed
 * `font-family` only says what was asked for. Used to see why the editor's screenshots differ
 * between the CI runner and the Playwright image (KOE-1434).
 */
export const platformFonts = async (ctx, className) => {
  const cdp = await ctx.page.context().newCDPSession(ctx.page)
  await cdp.send('DOM.enable')
  await cdp.send('CSS.enable')
  const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true })

  const found = []
  const walk = (node) => {
    const attrs = node.attributes ?? []
    for (let i = 0; i < attrs.length; i += 2) {
      if (attrs[i] === 'class' && attrs[i + 1].split(' ').includes(className)) found.push(node.nodeId)
    }
    const children = [...(node.children ?? []), ...(node.shadowRoots ?? [])]
    if (node.contentDocument) children.push(node.contentDocument)
    for (const child of children) walk(child)
  }
  walk(root)

  const result = []
  for (const nodeId of found.slice(0, 2)) {
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId })
    result.push(fonts)
  }
  await cdp.detach()
  return result
}
