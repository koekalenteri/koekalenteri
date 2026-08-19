import type { RenderOptions, RenderResult } from '@testing-library/react'
import type { Options } from '@testing-library/user-event/dist/types/options'
import type { UserEvent } from '@testing-library/user-event/dist/types/setup/setup'
import type { RouteObject, RouterInit } from 'react-router'
import type { RecoilValue } from 'recoil'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import mediaQuery from 'css-mediaquery'
import { act, useEffect } from 'react'
import { createMemoryRouter, createRoutesFromElements, RouterProvider } from 'react-router'
import { useRecoilValue } from 'recoil'

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

export const flushPromises = async (timers: boolean = true) => {
  const timeoutIsFaked = 'clock' in globalThis.setTimeout
  await act(async () => {
    for (let i = 0; i <= 7; i++) {
      if (timers && vi.isFakeTimers()) vi.runOnlyPendingTimers()
      await Promise.resolve()
    }
    if (timers && !timeoutIsFaked) await new Promise((resolve) => globalThis.setTimeout(resolve, 310))
  })
}

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

export function RecoilObserver<T>({
  node,
  onChange,
}: {
  readonly node: RecoilValue<T>
  readonly onChange: (value: T) => void
}) {
  const value = useRecoilValue(node)
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
      ...userEventOptions,
    }),
    ...render(ui, options),
  }
}
