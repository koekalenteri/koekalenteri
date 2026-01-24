import type { BreedCode, DeepPartial, DogGender, Registration } from '../../../../types'
import type { DogMode } from './DogSearch'

import { useTranslation } from 'react-i18next'
import FormControl from '@mui/material/FormControl'
import Grid from '@mui/material/Grid'
import TextField from '@mui/material/TextField'
import { DatePicker } from '@mui/x-date-pickers'
import { subMonths, subYears } from 'date-fns'

import AutocompleteSingle from '../../AutocompleteSingle'

import { TitlesAndName } from './TitlesAndName'

interface DogFormValues {
  rfid: string
  name: string
  titles: string
  dob: Date | undefined
  gender: DogGender | ''
  breedCode: BreedCode | ''
  sire: string
  dam: string
}

interface DogDetailsProps {
  formValues: DogFormValues
  updateField: (field: keyof DogFormValues, value: any) => void
  disabledByMode: boolean
  rfidDisabled: boolean
  sireDamDisabled: boolean
  disabled?: boolean
  mode: DogMode
  reg: DeepPartial<Registration>
  eventDate: Date
  minDogAgeMonths: number
}

export const DogDetails = ({
  formValues,
  updateField,
  disabledByMode,
  rfidDisabled,
  sireDamDisabled,
  disabled,
  mode,
  reg,
  eventDate,
  minDogAgeMonths,
}: Readonly<DogDetailsProps>) => {
  const { t } = useTranslation()
  const { t: breed } = useTranslation('breed')

  return (
    <>
      <Grid size={{ xs: 12, sm: 5, md: 6, lg: 3 }}>
        <TextField
          className={rfidDisabled && reg?.dog?.rfid ? 'fact' : ''}
          disabled={disabled || rfidDisabled}
          fullWidth
          label={t('dog.rfid')}
          value={formValues.rfid ?? ''}
          error={!rfidDisabled && !formValues.rfid}
          onChange={(e) => updateField('rfid', e.target.value)}
        />
      </Grid>
      <Grid container spacing={1} size={{ xs: 12, lg: 6 }}>
        <TitlesAndName
          className={disabledByMode && reg?.dog?.breedCode ? 'fact' : ''}
          disabledTitles={disabled || (disabledByMode && mode !== 'update')}
          disabledName={disabledByMode}
          id="dog"
          name={formValues.name}
          nameLabel={t('dog.name')}
          onChange={(props) => {
            if (props.name !== undefined) updateField('name', props.name)
            if (props.titles !== undefined) updateField('titles', props.titles)
          }}
          titles={formValues.titles}
          titlesLabel={t('dog.titles')}
        />
      </Grid>
      <Grid size={{ xs: 6, sm: 3, lg: 3 }}>
        <FormControl className={disabledByMode && reg?.dog?.dob ? 'fact' : ''} fullWidth>
          <DatePicker
            referenceDate={subYears(new Date(), 2)}
            disabled={disabledByMode}
            format={t('dateFormatString.long')}
            label={t('dog.dob')}
            maxDate={subMonths(eventDate, minDogAgeMonths)}
            minDate={subYears(new Date(), 15)}
            onChange={(value: any) => updateField('dob', value || undefined)}
            openTo={'year'}
            value={formValues.dob ?? null}
            views={['year', 'month', 'day']}
          />
        </FormControl>
      </Grid>
      <Grid size={{ xs: 6, sm: 3, lg: 3 }}>
        <AutocompleteSingle<DogGender | '', true>
          className={disabledByMode && reg?.dog?.gender ? 'fact' : ''}
          disableClearable
          disabled={disabledByMode}
          error={!disabledByMode && !reg?.dog?.gender}
          getOptionLabel={(o) => (o ? t(`dog.genderChoises.${o}`) : '')}
          isOptionEqualToValue={(o, v) => o === v}
          label={t('dog.gender')}
          onChange={(value) => updateField('gender', value || '')}
          options={['F', 'M'] as DogGender[]}
          value={formValues.gender}
        />
      </Grid>
      <Grid size={{ xs: 12, sm: 6 }}>
        <AutocompleteSingle<BreedCode | '', true>
          className={disabledByMode && reg?.dog?.breedCode ? 'fact' : ''}
          disableClearable
          disabled={disabledByMode}
          error={!disabledByMode && !reg?.dog?.breedCode}
          getOptionLabel={(o) => (o ? breed(o) : '')}
          isOptionEqualToValue={(o, v) => o === v}
          label={t('dog.breed')}
          onChange={(value) => updateField('breedCode', value || '')}
          options={['122', '111', '121', '312', '110', '263']}
          value={formValues.breedCode}
        />
      </Grid>
      <Grid size={{ xs: 12, lg: 6 }}>
        <TextField
          disabled={sireDamDisabled}
          fullWidth
          id={'sire'}
          label={t('dog.sire.name')}
          onChange={(e) => updateField('sire', e.target.value)}
          error={!sireDamDisabled && !formValues.sire}
          value={formValues.sire}
        />
      </Grid>
      <Grid size={{ xs: 12, lg: 6 }}>
        <TextField
          disabled={sireDamDisabled}
          fullWidth
          id={'dam'}
          label={t('dog.dam.name')}
          onChange={(e) => updateField('dam', e.target.value)}
          error={!sireDamDisabled && !formValues.dam}
          value={formValues.dam}
        />
      </Grid>
    </>
  )
}
