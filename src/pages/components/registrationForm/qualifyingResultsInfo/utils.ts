import type {
  EventResultRequirement,
  EventResultRequirements,
  EventResultRequirementsByDate,
  ManualTestResult,
  QualifyingResult,
} from '../../../../types'
import { nanoid } from 'nanoid'
import { unique } from '../../../../lib/utils'
import { objectContains } from '../validation'

const asArray = (v: EventResultRequirements | EventResultRequirement) => (Array.isArray(v) ? v : [v])

function findFirstMissing(requirements: EventResultRequirementsByDate | undefined, results: QualifyingResult[]) {
  if (!requirements || typeof requirements.rules === 'function') {
    return []
  }
  for (const rule of requirements.rules) {
    for (const opt of asArray(rule)) {
      const { count, ...rest } = opt
      if (results.filter((r) => objectContains(r, rest)).length < count) {
        return rest
      }
    }
  }
}

export function availableTypes(requirements?: EventResultRequirementsByDate, eventType?: string) {
  if (!requirements || typeof requirements.rules === 'function') {
    switch (eventType) {
      case 'NOME-B SM':
        return ['NOME-B']
      case 'NOME-A SM':
        return ['NOME-A', 'NOME-A KV']
      case 'NOWT SM':
        return ['NOWT']
    }
    return []
  }
  return unique(requirements.rules.flatMap((rule) => asArray(rule).map((opt) => opt.type)))
}

const availableSMResults = (type?: string, eventType?: string, hasKVA?: boolean) => {
  switch (eventType) {
    case 'NOME-B SM':
      return [hasKVA ? undefined : 'FI KVA-B', 'VOI1', 'VOI2', 'VOI3'].filter(Boolean)
    case 'NOWT SM':
      return [hasKVA ? undefined : 'FI KVA-WT', 'VOI1', 'VOI2', 'VOI3'].filter(Boolean)
    case 'NOME-A SM':
      if (type === 'NOME-A')
        return [hasKVA ? undefined : 'FI KVA-FT', 'A1 CERT', 'A1 RES-CERT', 'A1', 'A2', 'A3'].filter(Boolean)

      if (type === 'NOME-A KV') return ['EXC CACIT', 'EXC RES-CACIT', 'EXC', 'VG', 'G']
  }
  return []
}

export function availableResults(
  requirements?: EventResultRequirementsByDate,
  type?: string,
  eventType?: string,
  existingResults?: ManualTestResult[]
) {
  if (!requirements || typeof requirements.rules === 'function') {
    if (eventType?.includes(' SM')) {
      const hasKVA = existingResults?.some((r) => r.result.startsWith('FI KVA'))

      return availableSMResults(type, eventType, hasKVA)
    }
    return []
  }
  return unique(
    requirements.rules.flatMap((rule) =>
      asArray(rule)
        .filter((opt) => !type || opt.type === type)
        .map((opt) => (opt.cert ? 'CERT' : opt.result))
    )
  )
}

export function createMissingResult(
  requirements: EventResultRequirementsByDate | undefined,
  results: Array<QualifyingResult | ManualTestResult>,
  regNo: string
): ManualTestResult {
  const rule = findFirstMissing(requirements, results)
  return {
    class: '',
    date: new Date(),
    id: nanoid(10),
    judge: '',
    location: '',
    official: false,
    qualifying: true,
    regNo,
    result: '',
    type: '',
    ...rule,
  }
}

export function resultBorderColor(qualifying: boolean | undefined) {
  if (qualifying === true) {
    return 'success.light'
  }
  if (qualifying === false) {
    return 'error.main'
  }
}

export function getResultId(result: ManualTestResult | QualifyingResult) {
  if ('id' in result) {
    return result.id
  }
  return result.type + result.class + result.date.toISOString()
}
