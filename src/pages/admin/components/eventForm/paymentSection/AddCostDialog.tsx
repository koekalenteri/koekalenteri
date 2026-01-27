import type { BreedCode } from '../../../../../types'
import type { DogEventCostKey } from '../../../../../types/Cost'

import { useCallback, useEffect, useMemo, useState } from 'react'
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
  mode: 'optional' | 'other' | null
  availableKeys: DogEventCostKey[]
  existingBreedCodes: BreedCode[]
  onClose: () => void
  onAdd: (key: DogEventCostKey, data?: any) => void
}

export const AddCostDialog = ({ open, mode, availableKeys, existingBreedCodes, onClose, onAdd }: Props) => {
  const { t } = useTranslation(['translation', 'breed'])
  const [key, setKey] = useState<DogEventCostKey | ''>('')
  const [breedCodes, setBreedCodes] = useState<BreedCode[]>([])
  const [descriptionFi, setDescriptionFi] = useState('')
  const [descriptionEn, setDescriptionEn] = useState('')
  const breeds = useMemo(
    () =>
      PRIORIZED_BREED_CODES.filter((c) => !existingBreedCodes.includes(c)).map((value) => ({
        value,
        label: t(`breed:${value}`),
      })),
    [t]
  )

  useEffect(() => {
    if (mode === 'other' && availableKeys.length === 1) {
      setKey(availableKeys[0])
    }
    if (mode === 'optional') {
      setKey('')
    }
  }, [mode, availableKeys])

  const handleAdd = useCallback(() => {
    const finalKey = mode === 'optional' ? 'optionalAdditionalCosts' : key
    if (!finalKey) return

    let data: any
    if (finalKey === 'breed') {
      data = { breedCode: breedCodes }
    } else if (finalKey === 'custom' || finalKey === 'optionalAdditionalCosts') {
      data = { description: { fi: descriptionFi.trim(), en: descriptionEn.trim() } }
    }

    onAdd(finalKey, data)
    onClose()
    setKey('')
    setBreedCodes([])
    setDescriptionFi('')
    setDescriptionEn('')
  }, [key, breedCodes, descriptionFi, descriptionEn, onAdd, onClose, mode])

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>{t(mode === 'optional' ? 'costOptionalAdd' : 'costChoose')}</DialogTitle>
      <DialogContent>
        {mode === 'other' ? (
          <Select
            size="small"
            value={key}
            onChange={(e) => setKey(e.target.value as DogEventCostKey)}
            displayEmpty
            fullWidth
          >
            {availableKeys.map((k) => (
              <MenuItem key={k} value={k}>
                {t(`costNamesAdd.${k}`)}
              </MenuItem>
            ))}
          </Select>
        ) : null}
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
        {(key === 'custom' || mode === 'optional') && (
          <>
            <TextField
              label={t('eventType.createDialog.description.fi')}
              value={descriptionFi}
              onChange={(e) => setDescriptionFi(e.target.value)}
              fullWidth
              margin="normal"
              required
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
        <Button onClick={handleAdd} disabled={mode === 'optional' || key === 'custom' ? !descriptionFi.trim() : !key}>
          {t(mode === 'optional' ? 'costAddOptional' : 'costAdd')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
