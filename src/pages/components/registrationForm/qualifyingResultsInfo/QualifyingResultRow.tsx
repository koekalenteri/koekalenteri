import type { EventResultRequirementsByDate } from '../../../../rules'
import type { ManualTestResult, TestResult } from '../../../../types'

import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import DeleteOutline from '@mui/icons-material/DeleteOutline'
import Button from '@mui/material/Button'
import FormControl from '@mui/material/FormControl'
import Grid from '@mui/material/Grid'
import TextField from '@mui/material/TextField'
import { DatePicker } from '@mui/x-date-pickers'
import { addMonths } from 'date-fns'

import AutocompleteSingle from '../../AutocompleteSingle'

import { availableResults, availableTypes, resultBorderColor } from './utils'

interface Props {
  readonly dob?: Date
  readonly result: ManualTestResult
  readonly disabled?: boolean
  readonly requirements?: EventResultRequirementsByDate
  readonly onChange?: (result: ManualTestResult, props: Partial<TestResult>) => void
  readonly onRemove?: (result: ManualTestResult) => void
}

export default function QualifyingResultRow({ dob, result, disabled, requirements, onChange, onRemove }: Props) {
  const { t } = useTranslation()
  const handleChange = useCallback(
    (result: ManualTestResult, props: Partial<TestResult>) => {
      onChange?.(result, props)
    },
    [onChange]
  )
  const handleRemove = useCallback(() => onRemove?.(result), [onRemove, result])
  const maxDate = new Date()
  const date9Months = dob ? addMonths(dob, 9) : maxDate
  const minDate = date9Months < maxDate ? date9Months : maxDate

  return (
    <Grid item container spacing={1} alignItems="center">
      <Grid item xs={6} sm={4} md={2}>
        <AutocompleteSingle
          disabled={result.official || disabled}
          disableClearable
          options={availableTypes(requirements)}
          label={t('testResult.eventType')}
          onChange={(value) => handleChange(result, { type: value, result: availableResults(requirements, value)[0] })}
          value={result.type}
        />
      </Grid>
      <Grid item xs={6} sm={4} md={2}>
        <AutocompleteSingle
          disabled={result.official || disabled}
          disableClearable
          options={availableResults(requirements, result.type)}
          label={t('testResult.result')}
          onChange={(value) =>
            handleChange(result, {
              result: value === 'CERT' ? 'VOI1' : value,
              cert: value === 'CERT',
              class: value.slice(0, -1),
            })
          }
          sx={{
            '& fieldset': {
              borderColor: resultBorderColor(result.qualifying),
              borderWidth: !result.result || result.qualifying === undefined ? undefined : 2,
            },
            '&.Mui-disabled .MuiOutlinedInput-notchedOutline': {
              borderColor: resultBorderColor(result.qualifying),
            },
          }}
          value={result.cert ? 'CERT' : result.result}
        />
      </Grid>
      <Grid item xs={6} sm={4} md={2}>
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
      <Grid item xs={6} sm={4} md={2}>
        <TextField
          disabled={result.official || disabled}
          error={!result.location}
          fullWidth
          label={t('testResult.location')}
          onChange={(e) => handleChange(result, { location: e.target.value })}
          value={result.location}
        />
      </Grid>
      <Grid item xs={12} sm={4} md={2.5}>
        <TextField
          disabled={result.official || disabled}
          error={!result.judge}
          fullWidth
          label={t('testResult.judge')}
          onChange={(e) => handleChange(result, { judge: e.target.value })}
          value={result.judge}
        />
      </Grid>
      <Grid item sx={{ display: result.official ? 'none' : 'block' }} xs={12} sm={4} md={1.5}>
        <Button disabled={disabled} startIcon={<DeleteOutline />} onClick={handleRemove}>
          {t('registration.cta.deleteResult')}
        </Button>
      </Grid>
    </Grid>
  )
}
