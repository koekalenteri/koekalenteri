import type { RenderOptions, RenderResult } from '@testing-library/react'
import type { Options } from '@testing-library/user-event/dist/types/options'
import type { UserEvent } from '@testing-library/user-event/dist/types/setup/setup'
import type { RouteObject, RouterInit } from 'react-router'
import type { RecoilValue } from 'recoil'

import { act, useEffect } from 'react'
import { createMemoryRouter, createRoutesFromElements, RouterProvider } from 'react-router'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import mediaQuery from 'css-mediaquery'
import { useRecoilValue } from 'recoil'

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
  for (let i = 0; i <= 7; i++) {
    await act(async () => {
      if (timers) jest.runOnlyPendingTimers()
      await Promise.resolve()
    })
  }
}

export const createMatchMedia =
  (width: number) =>
  (query: string): MediaQueryList => ({
    matches: mediaQuery.match(query, { width }),
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
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
    user: userEvent.setup(userEventOptions),
    ...render(ui, options),
  }
}
