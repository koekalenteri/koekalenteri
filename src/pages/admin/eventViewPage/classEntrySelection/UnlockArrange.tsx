import type { Dispatch, SetStateAction } from 'react'
import InfoOutlined from '@mui/icons-material/InfoOutlined'
import FormControl from '@mui/material/FormControl'
import FormControlLabel from '@mui/material/FormControlLabel'
import Switch from '@mui/material/Switch'
import Tooltip from '@mui/material/Tooltip'
import { useTranslation } from 'react-i18next'

interface Props {
  checked?: boolean
  disabled?: boolean
  onChange?: Dispatch<SetStateAction<boolean>>
}

const UnlockArrange = ({ checked, disabled, onChange }: Props) => {
  const { t } = useTranslation()

  if (disabled) return null

  return (
    <FormControl sx={{ alignItems: 'center', flexDirection: 'row', maxWidth: 450 }}>
      <FormControlLabel
        control={<Switch checked={checked} size="small" />}
        disableTypography
        label={t('eventManagement.participantSelection.unlockArrange.label')}
        onChange={(_e, checked) => onChange?.(checked)}
        sx={{ fontSize: '0.82rem', lineHeight: 1 }}
      />
      <Tooltip
        title={
          <div>
            <p>{t('eventManagement.participantSelection.unlockArrange.info1')}</p>
            <p>{t('eventManagement.participantSelection.unlockArrange.info2')}</p>
            <p>{t('eventManagement.participantSelection.unlockArrange.info3')}</p>
          </div>
        }
      >
        <InfoOutlined color="info" fontSize="small" />
      </Tooltip>
    </FormControl>
  )
}

export default UnlockArrange
