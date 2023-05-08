import { useEffect } from 'react'
import { createMemoryRouter, createRoutesFromElements, RouteObject, RouterProvider } from 'react-router-dom'
import { RouterInit } from '@remix-run/router'
import { act, render, RenderOptions, RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Options } from '@testing-library/user-event/dist/types/options'
import { UserEvent } from '@testing-library/user-event/dist/types/setup/setup'
import mediaQuery from 'css-mediaquery'
import { RecoilValue, useRecoilValue } from 'recoil'

/**
 * Abstraction to avoid re-writing all tests for the time being
 * @see https://github.com/remix-run/react-router/blob/main/packages/react-router/__tests__/data-memory-router-test.tsx
 */
export function DataMemoryRouter({
  basename,
  children,
  fallbackElement,
  hydrationData,
  initialEntries,
  initialIndex,
  routes,
}: {
  basename?: RouterInit['basename']
  children?: React.ReactNode | React.ReactNode[]
  fallbackElement?: React.ReactNode
  hydrationData?: RouterInit['hydrationData']
  initialEntries?: string[]
  initialIndex?: number
  routes?: RouteObject[]
}) {
  const router = createMemoryRouter(routes || createRoutesFromElements(children), {
    basename,
    hydrationData,
    initialEntries,
    initialIndex,
  })
  return <RouterProvider router={router} fallbackElement={fallbackElement} />
}

export function flushPromisesAndTimers(): Promise<void> {
  return act(
    () =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, 0)
        jest.runAllTimers()
      })
  )
}

export function waitForDebounce() {
  return act(() => new Promise((resolve) => setTimeout(resolve, 150)))
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

export function RecoilObserver<T>({ node, onChange }: { node: RecoilValue<T>; onChange: (value: T) => void }) {
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
