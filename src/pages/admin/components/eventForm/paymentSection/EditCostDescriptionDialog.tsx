import type { DogEventCostKey } from '../../../../../types/Cost'

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogTitle from '@mui/material/DialogTitle'
import TextField from '@mui/material/TextField'

interface Props {
  open: boolean
  costKey: DogEventCostKey
  initialDescriptions: {
    fi: string
    en?: string
  }
  onClose: () => void
  onSave: (costKey: DogEventCostKey, descriptions: { fi: string; en?: string }) => void
}

export const EditCostDescriptionDialog = ({ open, costKey, initialDescriptions, onClose, onSave }: Props) => {
  const { t } = useTranslation()
  const [descriptionFi, setDescriptionFi] = useState(initialDescriptions.fi || '')
  const [descriptionEn, setDescriptionEn] = useState(initialDescriptions.en || '')

  // Reset form when dialog opens with new data
  useEffect(() => {
    if (open) {
      setDescriptionFi(initialDescriptions.fi || '')
      setDescriptionEn(initialDescriptions.en || '')
    }
  }, [open, initialDescriptions])

  const handleSave = useCallback(() => {
    onSave(costKey, {
      fi: descriptionFi,
      en: descriptionEn || undefined,
    })
    onClose()
  }, [costKey, descriptionFi, descriptionEn, onSave, onClose])

  return (
    <Dialog open={open} onClose={onClose}>
      <DialogTitle>{t('editWhat', { what: t(`costNames.${costKey}`, { name: descriptionFi }) })}</DialogTitle>
      <DialogContent>
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
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t('cancel')}</Button>
        <Button onClick={handleSave} disabled={!descriptionFi}>
          {t('save')}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
