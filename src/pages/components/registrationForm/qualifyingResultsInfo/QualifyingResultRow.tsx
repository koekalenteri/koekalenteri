import type { EventResultRequirementsByDate, ManualTestResult, QualifyingResult, TestResult } from '../../../../types'
import DeleteOutline from '@mui/icons-material/DeleteOutline'
import Button from '@mui/material/Button'
import FormControl from '@mui/material/FormControl'
import Grid from '@mui/material/Grid'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import { DatePicker } from '@mui/x-date-pickers'
import { addMonths } from 'date-fns'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
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

  if (result === 'FI KVA-B') return { class: 'VOI', result: 'FI KVA-B' }
  if (result === 'FI KVA-WT') return { class: 'VOI', result: 'FI KVA-WT' }
  if (result === 'FI KVA-FT') return { result: 'FI KVA-FT' }

  const resCert = result.includes('RES-CERT')
  const cert = !resCert && result.includes('CERT')
  const resCacit = result.includes('RES-CACIT')
  const cacit = !resCacit && result.includes('CACIT')
  const realResult = result.replace(/(RES-CERT|CERT|RES-CACIT|CACIT)/, '').trim()
  const testClass = realResult.length === 4 ? realResult.slice(0, -1) : undefined

  return {
    cacit,
    cert,
    class: testClass,
    resCacit,
    resCert,
    result: realResult,
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
      date: result.date,
      judge: result.judge || '',
      location: result.location || '',
      result: `${result.result}${getSuffix(result)}`,
      type: result.type,
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
          judge: values.judge,
          location: values.location,
          rankingPoints: undefined,
        })
      }
    }
  )

  const handleRemove = useCallback(() => {
    if (isManualResult(result)) onRemove?.(result)
  }, [onRemove, result])

  return (
    <Grid container spacing={1} alignItems="center" width="100%">
      <Grid size={{ md: 2, sm: 3.5, xs: 6 }}>
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
      </Grid>
      <Grid size={{ lg: 2, md: 2.5, sm: 4, xs: 6 }}>
        <AutocompleteSingle
          disabled={result.official || disabled}
          disableClearable
          options={availableResults(requirements, formValues.type, eventType, manualResults)}
          label={t('testResult.result')}
          onChange={(value) => {
            updateField('result', value)
          }}
          sx={{
            '& .Mui-disabled .MuiOutlinedInput-notchedOutline': {
              borderColor: resultBorderColor(result.qualifying),
            },
            '& fieldset': {
              borderColor: resultBorderColor(result.qualifying),
              borderWidth: !result.result || result.qualifying === undefined ? undefined : 2,
            },
          }}
          value={formValues.result}
        />
      </Grid>
      <Grid size={{ lg: 2, md: 2.5, sm: 4, xs: 6 }}>
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
      </Grid>
      <Grid size={{ md: 2, sm: 3.5, xs: 6 }}>
        <TextField
          disabled={result.official || disabled}
          error={!formValues.location}
          fullWidth
          label={t('testResult.location')}
          onChange={(e) => updateField('location', e.target.value)}
          value={formValues.location}
        />
      </Grid>
      <Grid size={{ lg: 2, md: 3, sm: 4, xs: 12 }}>
        <TextField
          disabled={result.official || disabled}
          error={!formValues.judge}
          fullWidth
          label={t('testResult.judge')}
          onChange={(e) => updateField('judge', e.target.value)}
          value={formValues.judge}
        />
      </Grid>
      <Grid flex={1}>
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
      </Grid>
    </Grid>
  )
}
