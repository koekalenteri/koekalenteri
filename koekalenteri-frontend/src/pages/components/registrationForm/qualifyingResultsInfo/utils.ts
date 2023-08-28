import type { ManualTestResult, QualifyingResult } from 'koekalenteri-shared/model'
import type { EventResultRequirement, EventResultRequirements, EventResultRequirementsByDate } from '../../../../rules'

import { nanoid } from 'nanoid'

import { unique } from '../../../../utils'
import { objectContains } from '../validation'

const asArray = (v: EventResultRequirements | EventResultRequirement) => (Array.isArray(v) ? v : [v])

function findFirstMissing(requirements: EventResultRequirementsByDate | undefined, results: QualifyingResult[]) {
  if (!requirements) {
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

export function availableTypes(requirements?: EventResultRequirementsByDate) {
  if (!requirements) {
    return []
  }
  return unique(requirements.rules.flatMap((rule) => asArray(rule).map((opt) => opt.type)))
}

export function availableResults(requirements?: EventResultRequirementsByDate, type?: string) {
  if (!requirements) {
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
  results: ManualTestResult[],
  regNo: string
): ManualTestResult {
  const rule = findFirstMissing(requirements, results)
  return {
    id: nanoid(10),
    regNo,
    date: new Date(),
    official: false,
    qualifying: true,
    type: '',
    judge: '',
    location: '',
    result: '',
    class: '',
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
