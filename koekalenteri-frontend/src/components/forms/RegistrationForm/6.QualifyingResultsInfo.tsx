import { DatePicker } from '@mui/lab';
import { FormControl, Grid, InputLabel, MenuItem, Select, TextField } from '@mui/material';
import { subYears } from 'date-fns';
import { Registration } from 'koekalenteri-shared/model';
import { useTranslation } from 'react-i18next';
import { CollapsibleSection } from '../..';

type QualifyingResultsInfoProps = {
  reg: Registration
  error?: boolean
  helperText?: string
  onChange: (props: Partial<Registration>) => void
}

export function QualifyingResultsInfo({ reg, error, helperText }: QualifyingResultsInfoProps) {
  const { t } = useTranslation();

  return (
    <CollapsibleSection title={t("registration.qualifyingResults")} error={error} helperText={helperText}>
      <Grid item container spacing={1}>
        {reg.qualifyingResults.map(result =>
          <Grid key={result.date.toString()} item container spacing={1}>
            <Grid item>
              <FormControl sx={{ width: 120 }}>
                <InputLabel id="type-label">{t("testResult.eventType")}</InputLabel>
                <Select
                  labelId="type-label"
                  label={t("testResult.eventType")}
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
                  labelId="result-label"
                  label={t("testResult.result")}
                  error={result.qualifying === false}
                  value={result.cert ? 'CERT' : result.result}
                  sx={{
                    '& fieldset': {
                      borderColor: result.qualifying ? 'success.light' : undefined,
                      borderWidth: result.qualifying === undefined ? undefined : 2
                    }
                  }}
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
                  label={t("testResult.date")}
                  value={result.date}
                  mask={t('datemask')}
                  inputFormat={t('dateformat')}
                  minDate={subYears(new Date(), 15)}
                  maxDate={new Date()}
                  onChange={(value) => { if (value) { result.date = value; } }}
                  renderInput={(params) => <TextField {...params} />} />
              </FormControl>
            </Grid>
            <Grid item>
              <TextField sx={{ width: 170 }} label={t("testResult.location")} value={result.location} />
            </Grid>
            <Grid item>
              <TextField sx={{ width: 180 }} label={t("testResult.judge")} value={result.judge} />
            </Grid>
          </Grid>
        )}
      </Grid>
    </CollapsibleSection>
  );
}
