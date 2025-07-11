import type { SyntheticEvent } from 'react'

import { useTranslation } from 'react-i18next'
import Autocomplete from '@mui/material/Autocomplete'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import FormControl from '@mui/material/FormControl'
import FormHelperText from '@mui/material/FormHelperText'
import TextField from '@mui/material/TextField'
import { Box } from '@mui/system'

export type DogMode = 'fetch' | 'manual' | 'update' | 'notfound' | 'autofetch' | 'error'

interface DogSearchProps {
  regNo: string
  disabled?: boolean
  disabledByMode: boolean
  validRegNo: boolean
  allowRefresh: boolean
  mode: DogMode
  loading: boolean
  cachedRegNos: string[] | null
  refreshDate?: Date
  onRegNoChange: (event: SyntheticEvent<Element, Event>, value: string | null) => void
  onRegNoSelect: (event: SyntheticEvent<Element, Event>, value: string | null) => void
  onButtonClick: () => void
}

export const DogSearch = ({
  regNo,
  disabled,
  disabledByMode,
  validRegNo,
  allowRefresh,
  mode,
  loading,
  cachedRegNos,
  refreshDate,
  onRegNoChange,
  onRegNoSelect,
  onButtonClick,
}: DogSearchProps) => {
  const { t } = useTranslation()

  return (
    <FormControl fullWidth>
      <Box sx={{ display: 'flex', alignItems: 'center' }}>
        <Autocomplete
          id="txtReknro"
          disabled={disabled || !disabledByMode}
          freeSolo
          renderInput={(props) => <TextField {...props} error={!validRegNo} label={t('dog.regNo')} />}
          value={regNo}
          inputValue={regNo}
          onChange={onRegNoSelect}
          onInputChange={onRegNoChange}
          options={cachedRegNos ?? []}
          sx={{ display: 'flex', flexGrow: 1, mr: 1 }}
        />
        <Button
          disabled={disabled || !validRegNo || (mode === 'update' && !allowRefresh)}
          variant="contained"
          onClick={onButtonClick}
        >
          {t(`registration.cta.${mode}`)}
        </Button>
        <CircularProgress size={28} sx={{ ml: 1, display: loading ? undefined : 'none' }} />
      </Box>
      <FormHelperText error={['notfound', 'error'].includes(mode)}>
        {t(`registration.cta.helper.${mode}`, { date: refreshDate })}
      </FormHelperText>
    </FormControl>
  )
}
