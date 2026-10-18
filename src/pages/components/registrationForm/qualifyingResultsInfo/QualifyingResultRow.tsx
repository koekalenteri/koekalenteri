import type { DayKey, EventResultRequirementsByDate, ManualTestResult, QualifyingResult, TestResult } from '@/types'
import DeleteOutline from '@mui/icons-material/DeleteOutlined'
import Button from '@mui/material/Button'
import FormControl from '@mui/material/FormControl'
import Grid from '@mui/material/Grid'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import { DatePicker } from '@mui/x-date-pickers'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { localDateOf } from '@/lib/day'
import { earliestResultDay } from '@/lib/dog'
import { lastResultDay } from '@/lib/resultDay'
import AutocompleteSingle from '../../AutocompleteSingle'
import { useDayField } from '../../dayPicker'
import RankingPoints from '../../RankingPoints'
import { useLocalStateGroup } from '../hooks/useLocalStateGroup'
import { availableResults, availableTypes, resultBorderColor } from './utils'

interface Props {
  readonly eventType?: string
  readonly dob?: DayKey
  readonly result: QualifyingResult | ManualTestResult
  readonly manualResults?: ManualTestResult[]
  readonly disabled?: boolean
  readonly rankingPeriod?: { min?: Date; max?: Date }
  readonly requirements?: EventResultRequirementsByDate
  readonly onChange?: (result: ManualTestResult, props: Partial<ManualTestResult>) => void
  readonly onRemove?: (result: ManualTestResult) => void
}

interface ResultFormValues {
  readonly date: DayKey | undefined
  readonly judge: string
  readonly location: string
  readonly result: string
  readonly type: (QualifyingResult | ManualTestResult)['type']
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

/**
 * The earliest day the result date picker offers: nine months after the dog's birth day, never after
 * `lastDay`. Without a birth day (none given, or Kennelliitto's empty date) it offers only `lastDay`.
 */
const firstResultDay = (dob: DayKey | undefined, lastDay: DayKey): DayKey => {
  if (!dob) return lastDay
  const earliest = earliestResultDay(dob)
  return earliest < lastDay ? earliest : lastDay
}

export default function QualifyingResultRow({
  eventType,
  dob,
  result,
  manualResults,
  disabled,
  rankingPeriod,
  requirements,
  onChange,
  onRemove,
}: Props) {
  const { t } = useTranslation()
  // Don't let the picker offer dates the rules will silently drop (KOE-1270, KOE-1548).
  // The last day is a Finnish day, today or the period's last; the picker shows it as its own day.
  const lastDay = lastResultDay(rankingPeriod?.max)

  // Group local state for all form fields with a single debounced update
  // A cleared picker leaves no date, so the field may be empty while the result's own date is not.
  const [formValues, updateField] = useLocalStateGroup<ResultFormValues>(
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

  const dateField = useDayField(formValues.date, (day) => updateField('date', day))

  const handleRemove = useCallback(() => {
    if (isManualResult(result)) onRemove?.(result)
  }, [onRemove, result])

  return (
    <Grid
      container
      spacing={1}
      sx={{
        alignItems: 'center',
        width: '100%',
      }}
    >
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
            maxDate={localDateOf(lastDay)}
            minDate={localDateOf(firstResultDay(dob, lastDay))}
            onChange={dateField.onChange}
            slotProps={{
              textField: { error: !formValues.date },
            }}
            value={dateField.value}
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
      <Grid
        sx={{
          flex: 1,
        }}
      >
        <Stack
          direction="row"
          sx={{
            alignItems: 'center',
            gap: 1,
            justifyContent: 'end',
          }}
        >
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
