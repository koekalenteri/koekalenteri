import type { ParseKeys, TFunction } from 'i18next'
import type { PublicDogEvent } from '../types'

import { unique } from './utils'

export interface Priority {
  group: Extract<ParseKeys<'translation'>, `priorityGroup.${string}`>
  name: Extract<ParseKeys<'translation'>, `priority.${string}`> | `breed:${ParseKeys<'breed'>}`
  value: string
}

export const PRIORITY_MEMBER = 'member'
export const PRIORITY_INVITED = 'invited'
export const PRIORIZED_BREED_CODES = ['110', '111', '121', '122', '263', '312'] as const

export const PRIORITY: Priority[] = [
  { group: 'priorityGroup.members', name: 'priority.members', value: 'member' },
  { group: 'priorityGroup.breed', name: 'breed:110', value: '110' },
  { group: 'priorityGroup.breed', name: 'breed:111', value: '111' },
  { group: 'priorityGroup.breed', name: 'breed:121', value: '121' },
  { group: 'priorityGroup.breed', name: 'breed:122', value: '122' },
  { group: 'priorityGroup.breed', name: 'breed:263', value: '263' },
  { group: 'priorityGroup.breed', name: 'breed:312', value: '312' },
  { group: 'priorityGroup.invited', name: 'priority.invited', value: 'invited' },
]

export const priorityValuesToPriority = (values: Partial<PublicDogEvent['priority']> = []) => {
  const result: Priority[] = []
  if (!Array.isArray(values)) return result

  for (const value of unique(values)) {
    const priority = PRIORITY.find((p) => p.value === value)
    if (priority) result.push(priority)
  }
  return result
}

export const getPrioritySort =
  (t: TFunction<['translation', 'breed']>) =>
  (a: Priority, b: Priority): number => {
    const group = t(a.group).localeCompare(t(b.group))
    return group === 0 ? t(a.name).localeCompare(t(b.name)) : group
  }
