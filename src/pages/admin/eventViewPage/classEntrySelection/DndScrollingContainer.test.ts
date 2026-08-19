import { scrollStrength } from './DndScrollingContainer'

describe('scrollStrength', () => {
  it('scrolls towards the start near the leading edge', () => {
    expect(scrollStrength(100, 100, 400)).toBe(-1)
    expect(scrollStrength(175, 100, 400)).toBe(-0.5)
  })

  it('does not scroll in the center or outside the container', () => {
    expect(scrollStrength(300, 100, 400)).toBe(0)
    expect(scrollStrength(99, 100, 400)).toBe(0)
    expect(scrollStrength(501, 100, 400)).toBe(0)
  })

  it('scrolls towards the end near the trailing edge', () => {
    expect(scrollStrength(425, 100, 400)).toBe(0.5)
    expect(scrollStrength(500, 100, 400)).toBe(1)
  })

  it('limits the edge buffer to half of a small container', () => {
    expect(scrollStrength(125, 100, 100)).toBe(-0.5)
    expect(scrollStrength(175, 100, 100)).toBe(0.5)
  })
})
