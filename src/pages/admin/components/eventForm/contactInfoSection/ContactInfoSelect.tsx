import type { ChangeEvent } from 'react'
import type { ShowContactInfo } from '../../../../../types'

import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormGroup from '@mui/material/FormGroup'

interface Props {
  readonly disabled?: boolean
  readonly name: string
  readonly show?: Partial<ShowContactInfo>
  readonly onChange: (name: string, props: ShowContactInfo) => void
}

export default function ContactInfoSelect({ disabled, name, show, onChange }: Props) {
  const { t } = useTranslation()
  const [state, setState] = useState({
    name: !!show?.name,
    email: !!show?.email,
    phone: !!show?.phone,
  })

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = {
        ...state,
        [event.target.name]: event.target.checked,
      }
      setState(value)
      onChange(name, value)
    },
    [name, onChange, state]
  )

  return (
    <FormGroup row>
      <FormControlLabel
        disabled={disabled}
        control={<Checkbox checked={state.name} name="name" onChange={handleChange} />}
        label={t('contact.name')}
      />
      <FormControlLabel
        disabled={disabled}
        control={<Checkbox checked={state.email} name="email" onChange={handleChange} />}
        label={t('contact.email')}
      />
      <FormControlLabel
        disabled={disabled}
        control={<Checkbox checked={state.phone} name="phone" onChange={handleChange} />}
        label={t('contact.phone')}
      />
    </FormGroup>
  )
}
