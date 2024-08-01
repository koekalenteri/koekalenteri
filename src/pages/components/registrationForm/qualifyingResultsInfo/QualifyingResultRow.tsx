import type { EventResultRequirementsByDate } from '../../../../rules'
import type { ManualTestResult, QualifyingResult, TestResult } from '../../../../types'

import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import DeleteOutline from '@mui/icons-material/DeleteOutline'
import Button from '@mui/material/Button'
import FormControl from '@mui/material/FormControl'
import Grid from '@mui/material/Grid'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import { DatePicker } from '@mui/x-date-pickers'
import { addMonths } from 'date-fns'

import AutocompleteSingle from '../../AutocompleteSingle'
import RankingPoints from '../../RankingPoints'

import { availableResults, availableTypes, resultBorderColor } from './utils'

interface Props {
  readonly eventType?: string
  readonly dob?: Date
  readonly result: QualifyingResult | ManualTestResult
  readonly manualResults?: ManualTestResult[]
  readonly disabled?: boolean
  readonly requirements?: EventResultRequirementsByDate
  readonly onChange?: (result: ManualTestResult, props: Partial<TestResult>) => void
  readonly onRemove?: (result: ManualTestResult) => void
}

const isManualResult = (result: QualifyingResult | ManualTestResult): result is ManualTestResult => !result.official
const getSuffix = (
  result: QualifyingResult | ManualTestResult
): ' CERT' | ' CACIT' | ' RES-CERT' | ' RES-CACIT' | '' => {
  if (result.cacit) return ' CACIT'
  if (result.cert) return ' CERT'
  if (result.resCacit) return ' RES-CACIT'
  if (result.resCert) return ' RES-CERT'
  return ''
}

const parseResult = (result?: string): Partial<TestResult> => {
  if (!result) return {}

  if (result === 'FI KVA-B') return { result: 'FI KVA-B', class: 'VOI' }
  if (result === 'FI KVA-WT') return { result: 'FI KVA-WT', class: 'VOI' }
  if (result === 'FI KVA-FT') return { result: 'FI KVA-FT' }

  const resCert = result.includes('RES-CERT')
  const cert = !resCert && result.includes('CERT')
  const resCacit = result.includes('RES-CACIT')
  const cacit = !resCacit && result.includes('CACIT')
  const realResult = result.replace(/(RES-CERT|CERT|RES-CACIT|CACIT)/, '').trim()
  const testClass = realResult.length === 4 ? realResult.slice(0, -1) : undefined

  return {
    result: realResult,
    cert,
    resCert,
    cacit,
    resCacit,
    class: testClass,
  }
}

export default function QualifyingResultRow({
  eventType,
  dob,
  result,
  manualResults,
  disabled,
  requirements,
  onChange,
  onRemove,
}: Props) {
  const { t } = useTranslation()
  const handleChange = useCallback(
    (result: QualifyingResult | ManualTestResult, props: Partial<TestResult>) => {
      if (isManualResult(result)) onChange?.(result, { ...props, points: undefined })
    },
    [onChange]
  )
  const handleRemove = useCallback(() => {
    if (isManualResult(result)) onRemove?.(result)
  }, [onRemove, result])
  const maxDate = new Date()
  const date9Months = dob ? addMonths(dob, 9) : maxDate
  const minDate = date9Months < maxDate ? date9Months : maxDate

  return (
    <Grid item container spacing={1} alignItems="center">
      <Grid item xs={6} sm={3.5} md={2}>
        <AutocompleteSingle
          disabled={result.official || disabled}
          disableClearable
          options={availableTypes(requirements, eventType)}
          label={t('testResult.eventType')}
          onChange={(value) => {
            const testResult = availableResults(requirements, value, eventType, manualResults)[0]
            handleChange(result, { type: value, ...parseResult(testResult) })
          }}
          value={result.type}
        />
      </Grid>
      <Grid item xs={6} sm={4} md={2.5} lg={2}>
        <AutocompleteSingle
          disabled={result.official || disabled}
          disableClearable
          options={availableResults(requirements, result.type, eventType, manualResults)}
          label={t('testResult.result')}
          onChange={(value) => {
            handleChange(result, {
              ...parseResult(value),
            })
          }}
          sx={{
            '& fieldset': {
              borderColor: resultBorderColor(result.qualifying),
              borderWidth: !result.result || result.qualifying === undefined ? undefined : 2,
            },
            '& .Mui-disabled .MuiOutlinedInput-notchedOutline': {
              borderColor: resultBorderColor(result.qualifying),
            },
          }}
          value={`${result.result}${getSuffix(result)}`}
        />
      </Grid>
      <Grid item xs={6} sm={4} md={2.5} lg={2}>
        <FormControl fullWidth>
          <DatePicker
            disabled={result.official || disabled}
            format={t('dateFormatString.long')}
            label={t('testResult.date')}
            maxDate={maxDate}
            minDate={minDate}
            onChange={(value: any) => handleChange(result, { date: value || undefined })}
            slotProps={{
              textField: { error: !result.date },
            }}
            value={result.date || null}
          />
        </FormControl>
      </Grid>
      <Grid item xs={6} sm={3.5} md={2}>
        <TextField
          disabled={result.official || disabled}
          error={!result.location}
          fullWidth
          label={t('testResult.location')}
          onChange={(e) => handleChange(result, { location: e.target.value })}
          value={result.location}
        />
      </Grid>
      <Grid item xs={12} sm={4} md={3} lg={2}>
        <TextField
          disabled={result.official || disabled}
          error={!result.judge}
          fullWidth
          label={t('testResult.judge')}
          onChange={(e) => handleChange(result, { judge: e.target.value })}
          value={result.judge}
        />
      </Grid>
      <Grid item flex={1}>
        <Stack direction="row" gap={1} justifyContent="end" alignItems="center">
          <Button
            sx={{ display: result.official ? 'none' : undefined }}
            disabled={disabled}
            startIcon={<DeleteOutline />}
            onClick={handleRemove}
            variant="outlined"
          >
            {t('registration.cta.deleteResult')}
          </Button>
          <RankingPoints points={result.points} />
        </Stack>
      </Grid>
    </Grid>
  )
}
