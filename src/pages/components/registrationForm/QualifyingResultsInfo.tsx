import type { EventResultRequirementsByDate } from '../../../rules'
import type { ManualTestResult, QualifyingResult, Registration, TestResult } from '../../../types'

import { useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import AddOutlined from '@mui/icons-material/AddOutlined'
import Button from '@mui/material/Button'
import Grid2 from '@mui/material/Grid2'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'

import CollapsibleSection from '../CollapsibleSection'
import RankingPoints from '../RankingPoints'

import QualifyingResultRow from './qualifyingResultsInfo/QualifyingResultRow'
import { createMissingResult, getResultId } from './qualifyingResultsInfo/utils'

interface Props {
  readonly eventType?: string
  readonly regNo?: string
  readonly dob?: Date
  readonly rankingPeriod?: { min?: Date; max?: Date }
  readonly results?: ManualTestResult[]
  readonly requirements?: EventResultRequirementsByDate
  readonly qualifyingResults?: QualifyingResult[]
  readonly disabled?: boolean
  readonly error?: boolean
  readonly helperText?: string
  readonly onChange?: (props: Partial<Registration>) => void
  readonly onOpenChange?: (value: boolean) => void
  readonly open?: boolean
}

export default function QualifyingResultsInfo({
  eventType,
  regNo,
  dob,
  rankingPeriod,
  results,
  requirements,
  qualifyingResults,
  disabled,
  error,
  helperText,
  onChange,
  onOpenChange,
  open,
}: Props) {
  const { t } = useTranslation()
  const disableResultInput = disabled || !requirements?.rules.length || !regNo

  const qualifying = useMemo(() => {
    if (!regNo) {
      return []
    }
    const newResults: Array<QualifyingResult | ManualTestResult> = (qualifyingResults ?? []).map((r) => ({
      ...r,
      id: getResultId(r),
      regNo,
    }))
    if (results) {
      for (const result of results) {
        if (!newResults.find((r) => !r.official && r.id && r.id === result.id)) {
          newResults.push({ ...result, official: false, qualifying: undefined })
        }
      }
    }
    return newResults
  }, [qualifyingResults, results, regNo])

  const handleChange = useCallback(
    (result: QualifyingResult | ManualTestResult, props: Partial<TestResult>) => {
      const index = qualifying.findIndex((r) => !r.official && r.id && r.id === result.id)
      if (index >= 0) {
        const newResults = qualifying.slice(0)
        newResults.splice(index, 1, { ...result, ...props })
        onChange?.({ results: newResults.filter((r): r is ManualTestResult => !r.official) })
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

  const totalPoints = useMemo(() => qualifying.reduce((acc, r) => acc + (r.points ?? 0), 0), [qualifying])

  return (
    <CollapsibleSection
      title={t('registration.qualifyingResults')}
      error={error}
      helperText={helperText}
      open={open && !!regNo}
      onOpenChange={onOpenChange}
    >
      <Grid2 container spacing={1}>
        <Grid2 display={rankingPeriod?.min ? undefined : 'none'}>
          <Typography variant="caption">{`${t('registration.rankingTime')}: ${t('dateFormat.datespan', { start: rankingPeriod?.min, end: rankingPeriod?.max })}`}</Typography>
        </Grid2>
        {qualifying.map((result) => (
          <QualifyingResultRow
            eventType={eventType}
            dob={dob}
            key={getResultId(result)}
            disabled={disabled}
            result={result}
            manualResults={results}
            requirements={requirements}
            onChange={handleChange}
            onRemove={handleRemoveResult}
          />
        ))}
        <Stack direction="row" mt={1} ml={1} justifyContent="space-between" width="100%">
          <Button
            startIcon={<AddOutlined />}
            disabled={disableResultInput}
            onClick={handleAddResult}
            variant="outlined"
          >
            {t('registration.cta.addResult')}
          </Button>
          <Stack
            display={totalPoints ? undefined : 'none'}
            direction="row"
            gap={1}
            justifyContent="end"
            alignItems="center"
          >
            <Typography variant="caption">Karsintapisteet yht.:</Typography>
            <RankingPoints points={totalPoints} />
          </Stack>
        </Stack>
      </Grid2>
    </CollapsibleSection>
  )
}
