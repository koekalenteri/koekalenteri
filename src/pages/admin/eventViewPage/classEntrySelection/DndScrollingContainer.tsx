import type { HTMLAttributes } from 'react'
import { useEffect, useRef } from 'react'
import { useDragDropManager } from 'react-dnd'

const SCROLL_BUFFER_PX = 150
const SCROLL_SPEED_PX = 30

export const scrollStrength = (position: number, start: number, size: number) => {
  const buffer = Math.min(size / 2, SCROLL_BUFFER_PX)
  if (position < start || position > start + size) return 0
  if (position < start + buffer) return (position - start - buffer) / buffer
  if (position > start + size - buffer) return (position - (start + size - buffer)) / buffer
  return 0
}

const eventCoordinates = (event: DragEvent | TouchEvent) => {
  if ('changedTouches' in event) {
    const touch = event.changedTouches[0]
    return touch ? { x: touch.clientX, y: touch.clientY } : undefined
  }
  return { x: event.clientX, y: event.clientY }
}

const DndScrollingContainer = (props: HTMLAttributes<HTMLDivElement>) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<number | undefined>(undefined)
  const strengthRef = useRef({ x: 0, y: 0 })
  const manager = useDragDropManager()

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const stopScrolling = () => {
      strengthRef.current = { x: 0, y: 0 }
      if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current)
      frameRef.current = undefined
    }

    const scroll = () => {
      const { x, y } = strengthRef.current
      if (x === 0 && y === 0) {
        frameRef.current = undefined
        return
      }
      container.scrollBy(x * SCROLL_SPEED_PX, y * SCROLL_SPEED_PX)
      frameRef.current = requestAnimationFrame(scroll)
    }

    const updateScrolling = (event: DragEvent | TouchEvent) => {
      const coordinates = eventCoordinates(event)
      if (!coordinates) return
      const bounds = container.getBoundingClientRect()
      strengthRef.current = {
        x: scrollStrength(coordinates.x, bounds.left, bounds.width),
        y: scrollStrength(coordinates.y, bounds.top, bounds.height),
      }
      if (frameRef.current === undefined && (strengthRef.current.x !== 0 || strengthRef.current.y !== 0)) {
        frameRef.current = requestAnimationFrame(scroll)
      }
    }

    const body = container.ownerDocument.body
    const monitor = manager.getMonitor()
    let listening = false
    const setListening = (next: boolean) => {
      if (next === listening) return
      listening = next
      if (next) {
        body.addEventListener('dragover', updateScrolling)
        body.addEventListener('touchmove', updateScrolling)
      } else {
        body.removeEventListener('dragover', updateScrolling)
        body.removeEventListener('touchmove', updateScrolling)
        stopScrolling()
      }
    }

    const unsubscribe = monitor.subscribeToStateChange(() => setListening(monitor.isDragging()))
    setListening(monitor.isDragging())

    return () => {
      unsubscribe()
      setListening(false)
    }
  }, [manager])

  return <div {...props} ref={containerRef} />
}

export default DndScrollingContainer
