import type { EventResultRequirementsByDate, ManualTestResult, QualifyingResult, TestResult } from '../../../../types'

import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import DeleteOutline from '@mui/icons-material/DeleteOutline'
import Button from '@mui/material/Button'
import FormControl from '@mui/material/FormControl'
import Grid2 from '@mui/material/Grid2'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import { DatePicker } from '@mui/x-date-pickers'
import { addMonths } from 'date-fns'

import AutocompleteSingle from '../../AutocompleteSingle'
import RankingPoints from '../../RankingPoints'
import { useLocalStateGroup } from '../hooks/useLocalStateGroup'

import { availableResults, availableTypes, resultBorderColor } from './utils'

interface Props {
  readonly eventType?: string
  readonly dob?: Date
  readonly result: QualifyingResult | ManualTestResult
  readonly manualResults?: ManualTestResult[]
  readonly disabled?: boolean
  readonly requirements?: EventResultRequirementsByDate
  readonly onChange?: (result: ManualTestResult, props: Partial<ManualTestResult>) => void
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
  const maxDate = new Date()
  const date9Months = dob ? addMonths(dob, 9) : maxDate
  const minDate = date9Months < maxDate ? date9Months : maxDate

  // Group local state for all form fields with a single debounced update
  const [formValues, updateField] = useLocalStateGroup(
    {
      type: result.type,
      result: `${result.result}${getSuffix(result)}`,
      date: result.date,
      location: result.location || '',
      judge: result.judge || '',
    },
    (values) => {
      if (isManualResult(result)) {
        // Extract result properties from the combined result string
        const resultProps = parseResult(values.result)

        // Create a single update object with all changed fields
        onChange?.(result, {
          type: values.type,
          ...resultProps,
          date: values.date,
          location: values.location,
          judge: values.judge,
          rankingPoints: undefined,
        })
      }
    }
  )

  const handleRemove = useCallback(() => {
    if (isManualResult(result)) onRemove?.(result)
  }, [onRemove, result])

  return (
    <Grid2 container spacing={1} alignItems="center" width="100%">
      <Grid2 size={{ xs: 6, sm: 3.5, md: 2 }}>
        <AutocompleteSingle
          disabled={result.official || disabled}
          disableClearable
          options={availableTypes(requirements, eventType)}
          label={t('testResult.eventType')}
          onChange={(value) => {
            updateField('type', value)
            const testResult = availableResults(requirements, value, eventType, manualResults)[0]
            // Update result field when type changes
            if (testResult) {
              updateField('result', testResult)
            }
          }}
          value={formValues.type}
        />
      </Grid2>
      <Grid2 size={{ xs: 6, sm: 4, md: 2.5, lg: 2 }}>
        <AutocompleteSingle
          disabled={result.official || disabled}
          disableClearable
          options={availableResults(requirements, formValues.type, eventType, manualResults)}
          label={t('testResult.result')}
          onChange={(value) => {
            updateField('result', value)
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
          value={formValues.result}
        />
      </Grid2>
      <Grid2 size={{ xs: 6, sm: 4, md: 2.5, lg: 2 }}>
        <FormControl fullWidth>
          <DatePicker
            disabled={result.official || disabled}
            format={t('dateFormatString.long')}
            label={t('testResult.date')}
            maxDate={maxDate}
            minDate={minDate}
            onChange={(value: any) => updateField('date', value || undefined)}
            slotProps={{
              textField: { error: !formValues.date },
            }}
            value={formValues.date || null}
          />
        </FormControl>
      </Grid2>
      <Grid2 size={{ xs: 6, sm: 3.5, md: 2 }}>
        <TextField
          disabled={result.official || disabled}
          error={!formValues.location}
          fullWidth
          label={t('testResult.location')}
          onChange={(e) => updateField('location', e.target.value)}
          value={formValues.location}
        />
      </Grid2>
      <Grid2 size={{ xs: 12, sm: 4, md: 3, lg: 2 }}>
        <TextField
          disabled={result.official || disabled}
          error={!formValues.judge}
          fullWidth
          label={t('testResult.judge')}
          onChange={(e) => updateField('judge', e.target.value)}
          value={formValues.judge}
        />
      </Grid2>
      <Grid2 flex={1}>
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
          <RankingPoints points={result.rankingPoints} />
        </Stack>
      </Grid2>
    </Grid2>
  )
}
