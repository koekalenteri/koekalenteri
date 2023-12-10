import { unique } from './utils'

export interface Priority {
  group: string
  name: string
  value: string
}

export const PRIORITY: Priority[] = [
  { group: 'Järjestävän yhdistyksen jäsen', name: 'Jäsenet', value: 'member' },
  { group: 'Etusija nimetyillä roduilla', name: 'Kultaisetnoutajat', value: '111' },
  { group: 'Etusija nimetyillä roduilla', name: 'Labradorit', value: '122' },
  { group: 'Etusija nimetyillä roduilla', name: 'Sileäkarvaiset noutajat', value: '121' },
  { group: 'Etusija nimetyillä roduilla', name: 'Chesapeakenlahdennoutajat', value: '263' },
  { group: 'Etusija nimetyillä roduilla', name: 'Novascotiannoutajat', value: '312' },
  { group: 'Etusija nimetyillä roduilla', name: 'Kiharakarvaiset noutajat', value: '110' },
  { group: 'Järjestäjän kutsumat koirat', name: 'Kutsutut', value: 'invited' },
]

export const priorityValuesToPriority = (values: Array<string | undefined> = []) => {
  const result: Priority[] = []
  if (!Array.isArray(values)) return result

  for (const value of unique(values)) {
    const priority = PRIORITY.find((p) => p.value === value)
    if (priority) {
      result.push(priority)
    }
  }
  return result
}
