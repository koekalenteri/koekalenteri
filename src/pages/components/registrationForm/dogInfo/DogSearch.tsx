import type { SyntheticEvent } from 'react'
import type { RegNoError } from '@/lib/validation'
import Autocomplete from '@mui/material/Autocomplete'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import FormControl from '@mui/material/FormControl'
import FormHelperText from '@mui/material/FormHelperText'
import TextField from '@mui/material/TextField'
import { Box } from '@mui/system'
import { useTranslation } from 'react-i18next'

type DogMode = 'fetch' | 'manual' | 'update' | 'notfound' | 'autofetch' | 'error'

interface DogSearchProps {
  readonly regNo: string
  readonly disabled?: boolean
  readonly disabledByMode: boolean
  readonly validRegNo: boolean
  /** Why the number cannot be entered by hand: it is not in its registry's form (KOE-1651). */
  readonly typedRegNoError?: RegNoError
  readonly allowRefresh: boolean
  readonly mode: DogMode
  readonly loading: boolean
  readonly cachedRegNos: string[] | null
  readonly refreshDate?: Date
  readonly onRegNoChange: (event: SyntheticEvent<Element, Event>, value: string | null) => void
  readonly onRegNoSelect: (event: SyntheticEvent<Element, Event>, value: string | null) => void
  readonly onButtonClick: () => void
}

export const DogSearch = ({
  regNo,
  disabled,
  disabledByMode,
  validRegNo,
  typedRegNoError,
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
      <Box sx={{ alignItems: 'center', display: 'flex' }}>
        <Autocomplete
          id="txtReknro"
          disabled={disabled || !disabledByMode}
          freeSolo
          renderInput={(props) => (
            <TextField {...props} error={!validRegNo || Boolean(typedRegNoError)} label={t('dog.regNo')} />
          )}
          value={regNo}
          inputValue={regNo}
          onChange={onRegNoSelect}
          onInputChange={onRegNoChange}
          options={cachedRegNos ?? []}
          sx={{ display: 'flex', flexGrow: 1, mr: 1 }}
        />
        <Button
          disabled={disabled || !validRegNo || Boolean(typedRegNoError) || (mode === 'update' && !allowRefresh)}
          variant="contained"
          onClick={onButtonClick}
        >
          {t(`registration.cta.${mode}`)}
        </Button>
        <CircularProgress size={28} sx={{ display: loading ? undefined : 'none', ml: 1 }} />
      </Box>
      <FormHelperText error={['notfound', 'error'].includes(mode)}>
        {/* A dog entered by hand was never fetched, so it has no time to tell (KOE-1650). */}
        {t(`registration.cta.helper.${mode === 'update' && !refreshDate ? 'typed' : mode}`, { date: refreshDate })}
      </FormHelperText>
      {typedRegNoError && <FormHelperText error>{t(`validation.regNo.${typedRegNoError}`)}</FormHelperText>}
    </FormControl>
  )
}
