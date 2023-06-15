import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { AddOutlined } from '@mui/icons-material'
import { Button, Grid } from '@mui/material'
import { ManualTestResult, QualifyingResult, Registration, TestResult } from 'koekalenteri-shared/model'

import { EventResultRequirementsByDate } from '../../../rules'
import CollapsibleSection from '../CollapsibleSection'

import QualifyingResultRow from './qualifyingResultsInfo/QualifyingResultRow'
import { createMissingResult, getResultId } from './qualifyingResultsInfo/utils'

type QualifyingResultsInfoProps = {
  regNo?: string
  results?: ManualTestResult[]
  requirements?: EventResultRequirementsByDate
  qualifyingResults?: QualifyingResult[]
  error?: boolean
  helperText?: string
  onChange?: (props: Partial<Registration>) => void
  onOpenChange?: (value: boolean) => void
  open?: boolean
}

export default function QualifyingResultsInfo({
  regNo,
  results,
  requirements,
  qualifyingResults,
  error,
  helperText,
  onChange,
  onOpenChange,
  open,
}: QualifyingResultsInfoProps) {
  const { t } = useTranslation()
  const disableResultInput = !requirements?.rules.length || !regNo

  const qualifying = useMemo(() => {
    if (!regNo) {
      return []
    }
    const newResults: Array<ManualTestResult> = (qualifyingResults ?? []).map((r) => ({
      ...r,
      id: getResultId(r),
      regNo,
    }))
    if (results) {
      for (const result of results) {
        if (!newResults.find((r) => !r.official && r.id && r.id === result.id)) {
          newResults.push({ ...result, official: false })
        }
      }
    }
    return newResults
  }, [qualifyingResults, results, regNo])

  const handleChange = useCallback(
    (result: ManualTestResult, props: Partial<TestResult>) => {
      const index = qualifying.findIndex((r) => !r.official && r.id && r.id === result.id)
      if (index >= 0) {
        const newResults: ManualTestResult[] = qualifying.slice(0)
        newResults.splice(index, 1, { ...result, ...props })
        onChange?.({ results: newResults.filter((r) => !r.official) })
      }
    },
    [onChange, qualifying]
  )

  const handleAddResult = useCallback(
    () =>
      onChange?.({
        results: [...(results ?? []), createMissingResult(requirements, qualifying, regNo ?? '')],
      }),
    [onChange, results, requirements, qualifying, regNo]
  )

  const handleRemoveResult = useCallback(
    (result: ManualTestResult) => {
      onChange?.({
        results: (results ?? []).filter((r) => r.id !== result.id),
      })
    },
    [onChange, results]
  )

  return (
    <CollapsibleSection
      title={t('registration.qualifyingResults')}
      error={error}
      helperText={helperText}
      open={open && !!regNo}
      onOpenChange={onOpenChange}
    >
      <Grid item container spacing={1}>
        {qualifying.map((result, index) => (
          <QualifyingResultRow
            key={getResultId(result)}
            result={result}
            requirements={requirements}
            onChange={handleChange}
            onRemove={handleRemoveResult}
          />
        ))}
        <Button startIcon={<AddOutlined />} disabled={disableResultInput} onClick={handleAddResult}>
          {t('registration.cta.addResult')}
        </Button>
      </Grid>
    </CollapsibleSection>
  )
}
