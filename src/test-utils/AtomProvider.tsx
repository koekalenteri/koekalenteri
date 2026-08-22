import { createStore, Provider as JotaiProvider } from 'jotai'
import { useRef } from 'react'

export type TestStore = ReturnType<typeof createStore>

export function TestProvider({
  children,
  initializeState,
}: {
  readonly children?: React.ReactNode
  readonly initializeState?: (store: TestStore) => void
}) {
  const storeRef = useRef<TestStore | undefined>(undefined)

  if (!storeRef.current) {
    storeRef.current = createStore()
    initializeState?.(storeRef.current)
  }

  return <JotaiProvider store={storeRef.current}>{children}</JotaiProvider>
}
