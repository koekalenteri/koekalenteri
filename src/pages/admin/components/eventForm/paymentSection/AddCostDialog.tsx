import type { BreedCode } from '../../../../../types'
import type { DogEventCostKey } from '../../../../../types/Cost'

import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Autocomplete from '@mui/material/Autocomplete'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import MenuItem from '@mui/material/MenuItem'
import Select from '@mui/material/Select'
import TextField from '@mui/material/TextField'

import { PRIORIZED_BREED_CODES } from '../../../../../lib/priority'

interface Props {
  open: boolean
  availableKeys: DogEventCostKey[]
  onClose: () => void
  onAdd: (key: DogEventCostKey, data?: any) => void
}

export const AddCostDialog = ({ open, availableKeys, onClose, onAdd }: Props) => {
  const { t } = useTranslation(['translation', 'breed'])
  const [key, setKey] = useState<DogEventCostKey | ''>('')
  const [breedCodes, setBreedCodes] = useState<BreedCode[]>([])
  const [descriptionFi, setDescriptionFi] = useState('')
  const [descriptionEn, setDescriptionEn] = useState('')
  const breeds = useMemo(
    () =>
      PRIORIZED_BREED_CODES.map((value) => ({
        value,
        label: t(`breed:${value}`),
      })),
    [t]
  )

  const handleAdd = useCallback(() => {
    if (!key) return

    let data: any
    if (key === 'breed') {
      data = { breedCode: breedCodes }
    } else if (key === 'custom' || key === 'optionalAdditionalCosts') {
      data = { description: { fi: descriptionFi, en: descriptionEn } }
    }

    onAdd(key, data)
    onClose()
    setKey('')
    setBreedCodes([])
    setDescriptionFi('')
    setDescriptionEn('')
  }, [key, breedCodes, descriptionFi, descriptionEn, onAdd, onClose])

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>{t('costChoose')}</DialogTitle>
      <DialogContent>
        <Select
          size="small"
          value={key}
          onChange={(e) => setKey(e.target.value as DogEventCostKey)}
          displayEmpty
          fullWidth
        >
          {availableKeys.map((k) => (
            <MenuItem key={k} value={k}>
              {t(`costNames.${k}`, { code: '' })}
            </MenuItem>
          ))}
        </Select>
        {key === 'breed' && (
          <Autocomplete
            multiple
            options={breeds}
            getOptionLabel={(option) => option.label}
            isOptionEqualToValue={(option, value) => option.value === value.value}
            onChange={(_, value) => setBreedCodes(value.map((v) => v.value))}
            renderInput={(params) => <TextField {...params} label={t('dog.breed')} sx={{ mt: 1, minWidth: 300 }} />}
          />
        )}
        {(key === 'custom' || key === 'optionalAdditionalCosts') && (
          <>
            <TextField
              label={t('eventType.createDialog.description.fi')}
              value={descriptionFi}
              onChange={(e) => setDescriptionFi(e.target.value)}
              fullWidth
              margin="normal"
            />
            <TextField
              label={t('eventType.createDialog.description.en')}
              value={descriptionEn}
              onChange={(e) => setDescriptionEn(e.target.value)}
              fullWidth
              margin="normal"
            />
          </>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('cancel')}</Button>
        <Button onClick={handleAdd} disabled={!key}>
          {t('costAdd')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
