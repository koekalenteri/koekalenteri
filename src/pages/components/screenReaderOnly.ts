import type { CSSProperties } from 'react'

/** Text for a screen reader that takes up no room on screen; the standard clip rectangle. */
export const SCREEN_READER_ONLY: CSSProperties = {
  border: 0,
  clipPath: 'inset(50%)',
  height: 1,
  overflow: 'hidden',
  padding: 0,
  position: 'absolute',
  whiteSpace: 'nowrap',
  width: 1,
}
