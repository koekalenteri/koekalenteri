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
import { dayOf, localDateOf, TIME_ZONE } from '@/lib/day'
import { earliestResultDate } from '@/lib/dog'
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
  readonly rankingPeriod?: { min?: Date; max?: Date }
  readonly requirements?: EventResultRequirementsByDate
  readonly onChange?: (result: ManualTestResult, props: Partial<ManualTestResult>) => void
  readonly onRemove?: (result: ManualTestResult) => void
}

interface ResultFormValues {
  readonly date: Date | undefined
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

/** The last day a result can have: today in Finland, or the ranking period's last Finnish day if that is earlier. */
const lastResultDay = (periodEnd: Date | undefined): DayKey => {
  const today = dayOf(new Date(), TIME_ZONE)
  if (!periodEnd) return today
  const periodLastDay = dayOf(periodEnd, TIME_ZONE)
  return periodLastDay < today ? periodLastDay : today
}

/**
 * The earliest day the result date picker offers: nine months after the dog's birth, never after
 * `maxDate`. A birth date that is there but has no day (Kennelliitto's empty date, a half-typed value)
 * sets no lower bound; without a birth date the picker offers only `maxDate`.
 */
const resultMinDate = (dob: Date | undefined, maxDate: Date): Date | undefined => {
  if (!dob) return maxDate
  const earliest = earliestResultDate(dob)
  if (!earliest) return undefined
  return earliest < maxDate ? earliest : maxDate
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
  // A result after the qualification period can never count (rules window ends at entry end), so
  // don't let the picker offer dates the rules will silently drop (KOE-1270). The period's end is a
  // Finnish day: given to the picker as its instant, it was the day after east of Finland (KOE-1548).
  const maxDate = localDateOf(lastResultDay(rankingPeriod?.max))
  const minDate = resultMinDate(dob, maxDate)

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
            maxDate={maxDate}
            minDate={minDate}
            onChange={(value: Date | null) => updateField('date', value ?? undefined)}
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
