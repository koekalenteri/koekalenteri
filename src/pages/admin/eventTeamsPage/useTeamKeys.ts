import { useCallback, useState } from 'react'

interface TeamKeys {
  /** The number of teams the keys were last made for. */
  readonly count: number
  readonly keys: readonly number[]
  /** The next key a team added at the end gets. */
  readonly next: number
}

const keysFor = (state: TeamKeys, count: number): TeamKeys => {
  if (state.keys.length >= count) return { ...state, count, keys: state.keys.slice(0, count) }
  const added = Array.from({ length: count - state.keys.length }, (_, at) => state.next + at)
  return { count, keys: [...state.keys, ...added], next: state.next + added.length }
}

/**
 * A key for each team's card that stays with the team while the teams before it are removed (KOE-1763).
 * A team is its place in the list, so its number cannot key its card: once team 1 is removed, team 2
 * would take over team 1's card. Teams added at the end get keys never used before, and `remove` drops
 * the key of a team removed, along with the update that removes the team.
 */
export function useTeamKeys(count: number) {
  const [state, setState] = useState<TeamKeys>(() => keysFor({ count: 0, keys: [], next: 0 }, count))
  // The teams come and go outside this hook too (a new team, a suggestion), so the keys follow the count
  // as the render finds it: React's way of state derived from a prop. A removal has already dropped its
  // key, so the count that follows it changes nothing more.
  let current = state
  if (state.count !== count) {
    current = keysFor(state, count)
    setState(current)
  }

  const remove = useCallback((index: number) => {
    setState((before) => ({ ...before, keys: before.keys.filter((_, at) => at !== index) }))
  }, [])

  return { keys: current.keys, remove }
}
