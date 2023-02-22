import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { DeleteOutline } from '@mui/icons-material'
import { Button, FormControl, Grid, TextField, TextFieldProps } from '@mui/material'
import { DatePicker } from '@mui/x-date-pickers'
import { subYears } from 'date-fns'
import { ManualTestResult, TestResult } from 'koekalenteri-shared/model'

import { EventResultRequirementsByDate } from '../../../../rules'
import AutocompleteSingle from '../../AutocompleteSingle'

import { availableResults, availableTypes, resultBorderColor } from './utils'


interface Props {
  result: ManualTestResult
  requirements?: EventResultRequirementsByDate
  onChange?: (result: ManualTestResult, props: Partial<TestResult>) => void
  onRemove?: (result: ManualTestResult) => void
}

export default function QualifyingResultRow({result, requirements, onChange, onRemove}: Props) {
  const { t } = useTranslation()
  const handleChange = useCallback((result: ManualTestResult, props: Partial<TestResult>) => {
    onChange?.(result, props)
  }, [onChange])
  const handleRemove = useCallback(() => onRemove?.(result), [onRemove, result])

  return (
    <Grid item container spacing={1} alignItems="center">
      <Grid item>
        <AutocompleteSingle
          disabled={result.official}
          disableClearable
          options={availableTypes(requirements)}
          label={t('testResult.eventType')}
          onChange={(value) => handleChange(result, { type: value })}
          value={result.type}
          sx={{ width: 128 }}
        />
      </Grid>
      <Grid item>
        <AutocompleteSingle
          disabled={result.official}
          disableClearable
          options={availableResults(requirements)}
          label={t('testResult.result')}
          onChange={(value) => handleChange(result, { result: value === 'CERT' ? 'VOI1' : value, cert: value === 'CERT', class: value.slice(0, -1) })}
          sx={{
            width: 128,
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
      <Grid item>
        <FormControl sx={{ width: 150 }}>
          <DatePicker
            disabled={result.official}
            inputFormat={t('dateFormat.long')}
            label={t('testResult.date')}
            mask={t('datemask')}
            maxDate={new Date()}
            minDate={subYears(new Date(), 15)}
            onChange={(value: any) => handleChange(result, { date: value || undefined })}
            renderInput={(params: JSX.IntrinsicAttributes & TextFieldProps) => <TextField {...params} error={!result.date} />}
            value={result.date || null}
          />
        </FormControl>
      </Grid>
      <Grid item>
        <TextField
          disabled={result.official}
          error={!result.location}
          label={t('testResult.location')}
          sx={{ width: 170 }}
          onChange={(e) => handleChange(result, { location: e.target.value })}
          value={result.location}
        />
      </Grid>
      <Grid item>
        <TextField
          disabled={result.official}
          error={!result.judge}
          label={t('testResult.judge')}
          sx={{ width: 180 }}
          onChange={(e) => handleChange(result, { judge: e.target.value })}
          value={result.judge}
        />
      </Grid>
      <Grid item sx={{ display: result.official ? 'none' : 'block' }}>
        <Button
          startIcon={<DeleteOutline />}
          onClick={handleRemove}
        >
          {t('registration.cta.deleteResult')}
        </Button>
      </Grid>
    </Grid>
  )
}

