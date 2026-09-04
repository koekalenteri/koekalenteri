import type { RenderOptions, RenderResult } from '@testing-library/react'
import type { Options } from '@testing-library/user-event/dist/types/options'
import type { UserEvent } from '@testing-library/user-event/dist/types/setup/setup'
import type { Atom } from 'jotai'
import type { RouteObject, RouterInit } from 'react-router'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import mediaQuery from 'css-mediaquery'
import { useAtomValue } from 'jotai'
import { act, useEffect } from 'react'
import { createMemoryRouter, createRoutesFromElements, RouterProvider } from 'react-router'

export const TEST_ID_TOKEN = 'header.eyJleHAiOjQxMDI0NDQ4MDB9.signature'

/**
 * Abstraction to avoid re-writing all tests for the time being
 * @see https://github.com/remix-run/react-router/blob/main/packages/react-router/__tests__/data-memory-router-test.tsx
 */
export function DataMemoryRouter({
  basename,
  children,
  hydrationData,
  initialEntries,
  initialIndex,
  routes,
}: {
  readonly basename?: RouterInit['basename']
  readonly children?: React.ReactNode | React.ReactNode[]
  readonly fallbackElement?: React.ReactNode
  readonly hydrationData?: RouterInit['hydrationData']
  readonly initialEntries?: string[]
  readonly initialIndex?: number
  readonly routes?: RouteObject[]
}) {
  const router = createMemoryRouter(routes ?? createRoutesFromElements(children), {
    basename,
    hydrationData,
    initialEntries,
    initialIndex,
  })
  return <RouterProvider router={router} />
}

/**
 * React 19 drops the work of a component that suspends inside a *synchronous* `act` scope: the
 * boundary keeps its fallback and the retry is never flushed, so a page behind `Suspense` rendered
 * with Testing Library's `render` alone stays on "loading" forever. Awaiting the render inside
 * `act` keeps the retry, so anything behind a boundary is rendered through these.
 */
const awaitingAct = async <T,>(renderTree: () => T): Promise<T> => {
  let result: T | undefined
  await act(async () => {
    result = renderTree()
  })
  if (result === undefined) throw new Error('the render produced no result')
  return result
}

/** `render` for a tree behind `Suspense`. */
export const renderSuspended = (ui: React.ReactElement, options?: Omit<RenderOptions, 'queries'>) =>
  awaitingAct(() => render(ui, options))

/** `renderWithUserEvents` for a tree behind `Suspense`. */
export const renderSuspendedWithUserEvents = (
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'queries'>,
  userEventOptions?: Options
) => awaitingAct(() => renderWithUserEvents(ui, options, userEventOptions))

/**
 * Lets the rendered tree settle: React work, resolved promises and roughly 300 ms of clock time, enough
 * for a debounced change or a MUI transition but not for a snackbar to hide itself. Under a faked clock
 * that time passes instantly, in rounds so React flushes the effects a fired timer queued before the
 * next round runs the timers those effects scheduled.
 */
export const flushPromises = async (timers: boolean = true) => {
  const timeoutIsFaked = 'clock' in globalThis.setTimeout
  for (let i = 0; i < SETTLE_ROUNDS; i++) {
    await act(async () => {
      if (timers && timeoutIsFaked) vi.advanceTimersByTime(SETTLE_MS / SETTLE_ROUNDS)
      await Promise.resolve()
    })
  }
  if (timers && !timeoutIsFaked) await act(() => new Promise((resolve) => globalThis.setTimeout(resolve, SETTLE_MS)))
}
const SETTLE_MS = 320
const SETTLE_ROUNDS = 8

export const createMatchMedia =
  (width: number) =>
  (query: string): MediaQueryList => ({
    addEventListener: vi.fn(),
    addListener: vi.fn(), // deprecated
    dispatchEvent: vi.fn(),
    matches: mediaQuery.match(query, { width }),
    media: query,
    onchange: null,
    removeEventListener: vi.fn(),
    removeListener: vi.fn(), // deprecated
  })

export function AtomObserver<T>({ node, onChange }: { readonly node: Atom<T>; readonly onChange: (value: T) => void }) {
  const value = useAtomValue(node)
  useEffect(() => onChange(value), [onChange, value])
  return null
}

export function renderWithUserEvents(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'queries'>,
  userEventOptions?: Options
): RenderResult & { user: UserEvent } {
  return {
    user: userEvent.setup({
      // user-event waits between actions on a setTimeout; under a faked clock that timer has to be
      // advanced by hand or the action never completes.
      advanceTimers: (ms) => {
        if (vi.isFakeTimers()) vi.advanceTimersByTime(ms)
      },
      ...userEventOptions,
    }),
    ...render(ui, options),
  }
}
