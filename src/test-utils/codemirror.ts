/**
 * CodeMirror measures the DOM to lay out its lines, and jsdom measures nothing: every rectangle is
 * empty and there is no element under a point. Called in `beforeAll` by a test that mounts an
 * editor, so it can be typed into and linted without the layout code throwing.
 */
export const shimCodeMirrorLayout = () => {
  function getBoundingClientRect(): DOMRect {
    const rec = {
      bottom: 0,
      height: 0,
      left: 0,
      right: 0,
      top: 0,
      width: 0,
      x: 0,
      y: 0,
    }
    return { ...rec, toJSON: () => rec }
  }

  class FakeDOMRectList extends Array<DOMRect> implements DOMRectList {
    item(index: number): DOMRect | null {
      return this[index]
    }
  }

  document.elementFromPoint = (): null => null
  HTMLElement.prototype.getBoundingClientRect = getBoundingClientRect
  HTMLElement.prototype.getClientRects = (): DOMRectList => new FakeDOMRectList()
  Range.prototype.getBoundingClientRect = getBoundingClientRect
  Range.prototype.getClientRects = (): DOMRectList => new FakeDOMRectList()
}
