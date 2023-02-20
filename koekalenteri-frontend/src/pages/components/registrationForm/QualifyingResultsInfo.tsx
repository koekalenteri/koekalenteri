import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { AddOutlined, DeleteOutline } from '@mui/icons-material'
import { Button, debounce, FormControl, Grid, TextField, TextFieldProps } from '@mui/material'
import { DatePicker } from '@mui/x-date-pickers'
import { subYears } from 'date-fns'
import { ManualTestResult, QualifyingResult, Registration, TestResult } from 'koekalenteri-shared/model'
import { v4 as uuidv4 } from 'uuid'

import { EventResultRequirement, EventResultRequirements, EventResultRequirementsByDate, getRequirements, RegistrationClass } from '../../../rules'
import { unique } from '../../../utils'
import AutocompleteSingle from '../AutocompleteSingle'
import CollapsibleSection from '../CollapsibleSection'

import { objectContains } from './validation'

type QualifyingResultsInfoProps = {
  reg: Partial<Registration>
  error?: boolean
  helperText?: string
  onChange?: (props: Partial<Registration>) => void
  onOpenChange?: (value: boolean) => void
  open?: boolean
}

const asArray = (v: EventResultRequirements | EventResultRequirement) => Array.isArray(v) ? v : [v]

export default function QualifyingResultsInfo({ reg, error, helperText, onChange, onOpenChange, open }: QualifyingResultsInfoProps) {
  const { t } = useTranslation()
  const requirements = useMemo(() => getRequirements(reg.eventType ?? '', reg.class as RegistrationClass, reg.dates && reg.dates.length ? reg.dates[0].date : new Date()), [reg.eventType, reg.class, reg.dates])
  const disableResultInput = !requirements?.rules.length || !reg.dog?.regNo
  const sendChange = useMemo(() => onChange && debounce(onChange, 300), [onChange])

  const results = useMemo(() => {
    const regNo = reg.dog?.regNo
    if (!regNo) {
      return []
    }
    const newResults: Array<ManualTestResult> = (reg.qualifyingResults || []).map(r => ({ ...r, id: getResultId(r), regNo }))
    if (reg.results) {
      for (const result of reg.results) {
        if (!newResults.find(r => !r.official && r.id && r.id === result.id)) {
          newResults.push({ ...result, official: false })
        }
      }
    }
    return newResults
  }, [reg.qualifyingResults, reg.results, reg.dog])

  const handleChange = (result: ManualTestResult, props: Partial<TestResult>) => {
    const index = results.findIndex(r => !r.official && r.id && r.id === result.id)
    if (index >= 0) {
      const newResults: ManualTestResult[] = results.slice(0)
      newResults.splice(index, 1, { ...result, ...props })
      sendChange?.({ results: newResults.filter(r => !r.official) })
    }
  }
  const handleAddResult = () => onChange?.({ results: (reg.results || []).concat([createMissingResult(requirements, results, reg.dog?.regNo ?? '')]) })

  return (
    <CollapsibleSection title={t('registration.qualifyingResults')} error={error} helperText={helperText} open={open} onOpenChange={onOpenChange}>
      <Grid item container spacing={1}>
        {results.map(result =>
          <Grid key={getResultId(result)} item container spacing={1} alignItems="center">
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
              <Button startIcon={<DeleteOutline />} onClick={() => onChange?.({
                results: (reg.results || []).filter(r => r.id !== result.id),
              })}>{t('registration.cta.deleteResult')}</Button>
            </Grid>
          </Grid>,
        )}
        <Button startIcon={<AddOutlined />} disabled={disableResultInput} onClick={handleAddResult}>{t('registration.cta.addResult')}</Button>
      </Grid>
    </CollapsibleSection>
  )
}

function findFirstMissing(requirements: EventResultRequirementsByDate | undefined, results: QualifyingResult[]) {
  if (!requirements) {
    return []
  }
  for (const rule of requirements.rules) {
    for (const opt of asArray(rule)) {
      const { count, ...rest } = opt
      if (results.filter(r => objectContains(r, rest)).length < count) {
        return rest
      }
    }
  }
}

function availableTypes(requirements?: EventResultRequirementsByDate) {
  if (!requirements) {
    return []
  }
  return unique(requirements.rules.flatMap(rule => asArray(rule).map(opt => opt.type)))
}

function availableResults(requirements?: EventResultRequirementsByDate) {
  if (!requirements) {
    return []
  }
  return unique(requirements.rules.flatMap(rule => asArray(rule).map(opt => opt.cert ? 'CERT' : opt.result)))
}

function createMissingResult(requirements: EventResultRequirementsByDate | undefined, results: ManualTestResult[], regNo: string): ManualTestResult {
  const rule = findFirstMissing(requirements, results)
  return {
    id: uuidv4(),
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

function resultBorderColor(qualifying: boolean | undefined) {
  if (qualifying === true) {
    return 'success.light'
  }
  if (qualifying === false) {
    return 'error.main'
  }
}

function getResultId(result: ManualTestResult | QualifyingResult) {
  if ('id' in result) {
    return result.id
  }
  return uuidv4()
}
