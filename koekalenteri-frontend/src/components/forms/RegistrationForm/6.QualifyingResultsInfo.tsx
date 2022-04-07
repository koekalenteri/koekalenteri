import { AddOutlined, DeleteOutline } from '@mui/icons-material';
import { DatePicker } from '@mui/lab';
import { Button, debounce, FormControl, Grid, InputLabel, MenuItem, Select, TextField } from '@mui/material';
import { subYears } from 'date-fns';
import { QualifyingResult, Registration, TestResult } from 'koekalenteri-shared/model';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { v4 as uuidv4 } from 'uuid';
import { CollapsibleSection } from '../..';
import { EventResultRequirement, EventResultRequirements, EventResultRequirementsByDate, getRequirements, RegistrationClass } from './rules';
import { objectContains } from './validation';

type QualifyingResultsInfoProps = {
  reg: Registration
  error?: boolean
  helperText?: string
  onChange: (props: Partial<Registration>) => void
  onOpenChange?: (value: boolean) => void
  open?: boolean
}

type QRWithId = Partial<QualifyingResult> & { id: string };
const asArray = (v: EventResultRequirements | EventResultRequirement) => Array.isArray(v) ? v : [v];
export function QualifyingResultsInfo({ reg, error, helperText, onChange, onOpenChange, open }: QualifyingResultsInfoProps) {
  const { t } = useTranslation();
  const requirements = useMemo(() => getRequirements(reg.eventType, reg.class as RegistrationClass, reg.dates[0].date) || {rules: []}, [reg.eventType, reg.class, reg.dates]);
  const [results, setResults] = useState<Array<QRWithId>>([]);
  const sendChange = useMemo(() => debounce(onChange, 300), [onChange]);
  const handleChange = (result: QRWithId, props: Partial<TestResult>) => {
    const index = results.findIndex(r => !r.official && r.id && r.id === result.id);
    if (index >= 0) {
      const newResults: QRWithId[] = results.slice(0);
      newResults.splice(index, 1, { ...result, ...props });
      setResults(newResults);
      sendChange({ results: newResults.filter(r => !r.official) });
    }
  };
  useEffect(() => {
    const newResults: Array<QRWithId> = (reg.qualifyingResults || []).map(r => ({ ...r, id: getResultId(r) }));
    if (reg.results) {
      for (const result of reg.results) {
        if (!newResults.find(r => !r.official && r.id && r.id === result.id)) {
          newResults.push({ ...result, official: false });
        }
      }
    }
    setResults(newResults);
  }, [reg.qualifyingResults, reg.results]);

  return (
    <CollapsibleSection title={t("registration.qualifyingResults")} error={error} helperText={helperText} open={open} onOpenChange={onOpenChange}>
      <Grid item container spacing={1}>
        {results.map(result =>
          <Grid key={getResultId(result)} item container spacing={1} alignItems="center">
            <Grid item>
              <FormControl sx={{ width: 120 }}>
                <InputLabel id="type-label">{t("testResult.eventType")}</InputLabel>
                <Select
                  disabled={result.official}
                  label={t("testResult.eventType")}
                  labelId="type-label"
                  onChange={(e) => handleChange(result, {type: e.target.value})}
                  value={result.type}
                >
                  <MenuItem value="NOU">NOU</MenuItem>
                  <MenuItem value="NOME-B">NOME-B</MenuItem>
                  <MenuItem value="NOME-A">NOME-A</MenuItem>
                  <MenuItem value="NOWT">NOWT</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item>
              <FormControl sx={{ width: 120 }}>
                <InputLabel id="result-label">{t("testResult.result")}</InputLabel>
                <Select
                  disabled={result.official}
                  label={t("testResult.result")}
                  labelId="result-label"
                  onChange={(e) => handleChange(result, {result: e.target.value, class: e.target.value.slice(0, -1)})}
                  sx={{
                    '& fieldset': {
                      borderColor: resultBorderColor(result.qualifying),
                      borderWidth: !result.result || result.qualifying === undefined ? undefined : 2
                    },
                    '&.Mui-disabled .MuiOutlinedInput-notchedOutline': {
                      borderColor: resultBorderColor(result.qualifying),
                    }
                  }}
                  value={result.cert ? 'CERT' : result.result}
                >
                  <MenuItem value="NOU0">NOU0</MenuItem>
                  <MenuItem value="NOU1">NOU1</MenuItem>
                  <MenuItem value="ALO-">ALO-</MenuItem>
                  <MenuItem value="ALO0">ALO0</MenuItem>
                  <MenuItem value="ALO3">ALO3</MenuItem>
                  <MenuItem value="ALO2">ALO2</MenuItem>
                  <MenuItem value="ALO1">ALO1</MenuItem>
                  <MenuItem value="AVO-">AVO-</MenuItem>
                  <MenuItem value="AVO0">AVO0</MenuItem>
                  <MenuItem value="AVO3">AVO3</MenuItem>
                  <MenuItem value="AVO2">AVO2</MenuItem>
                  <MenuItem value="AVO1">AVO1</MenuItem>
                  <MenuItem value="VOI-">VOI-</MenuItem>
                  <MenuItem value="VOI0">VOI0</MenuItem>
                  <MenuItem value="VOI3">VOI3</MenuItem>
                  <MenuItem value="VOI2">VOI2</MenuItem>
                  <MenuItem value="VOI1">VOI1</MenuItem>
                  <MenuItem value="CERT">VOI1 (CERT)</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item>
              <FormControl sx={{ width: 150 }}>
                <DatePicker
                  disabled={result.official}
                  inputFormat={t('dateformat')}
                  label={t("testResult.date")}
                  mask={t('datemask')}
                  maxDate={new Date()}
                  minDate={subYears(new Date(), 15)}
                  onChange={(value) => handleChange(result, { date: value || undefined })}
                  renderInput={(params) => <TextField {...params} error={!result.date} />}
                  value={result.date || null}
                />
              </FormControl>
            </Grid>
            <Grid item>
              <TextField
                disabled={result.official}
                error={!result.location}
                label={t("testResult.location")}
                sx={{ width: 170 }}
                onChange={(e) => handleChange(result, { location: e.target.value })}
                value={result.location}
              />
            </Grid>
            <Grid item>
              <TextField
                disabled={result.official}
                error={!result.judge}
                label={t("testResult.judge")}
                sx={{ width: 180 }}
                onChange={(e) => handleChange(result, { judge: e.target.value })}
                value={result.judge}
              />
            </Grid>
            <Grid item sx={{display: result.official ? 'none' : 'block'}}>
              <Button startIcon={<DeleteOutline />} onClick={() => onChange({
                results: (reg.results || []).filter(r => r.id !== result.id)
              })}>Poista tulos</Button>
            </Grid>
          </Grid>
        )}
        <Button startIcon={<AddOutlined />} onClick={() => onChange({
          results: (reg.results || []).concat([createMissingResult(requirements, results)])
        })}>Lisää tulos</Button>
      </Grid>
    </CollapsibleSection>
  );
}

function findFirstMissing(requirements: EventResultRequirementsByDate | { rules: EventResultRequirements }, results: QRWithId[]) {
  for (const rule of requirements.rules) {
    for (const opt of asArray(rule)) {
      const { count, ...rest } = opt;
      if (results.filter(r => objectContains(r, rest)).length < count) {
        return rest;
      }
    }
  }
}

function createMissingResult(requirements: EventResultRequirementsByDate | { rules: EventResultRequirements }, results: QRWithId[]) {
  const rule = findFirstMissing(requirements, results);
  return {
    id: uuidv4(),
    ...rule
  };
}

function resultBorderColor(qualifying: boolean | undefined) {
  if (qualifying === true) {
    return 'success.light';
  }
  if (qualifying === false) {
    return 'error.main';
  }
}

function getResultId(result: QRWithId|QualifyingResult) {
  if ('id' in result) {
    return result.id;
  }
  return (result.judge || '') + result.date?.toString();
}
