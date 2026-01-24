import type { ChangeEvent } from 'react'
import type { PublicContactInfo } from '../../../../../types'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormGroup from '@mui/material/FormGroup'
import TextField from '@mui/material/TextField'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'

interface Props {
  readonly disabled?: boolean
  readonly defaults: PublicContactInfo | undefined
  readonly name: string
  readonly show?: Partial<PublicContactInfo>
  readonly onChange: (name: string, props: PublicContactInfo) => void
}

export default function ContactInfoSelect({ disabled, name, show, defaults, onChange }: Props) {
  const { t } = useTranslation()
  const [state, setState] = useState({
    email: show?.email ?? '',
    name: show?.name ?? '',
    phone: show?.phone ?? '',
  })

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const prop = event.target.name as keyof PublicContactInfo
      const value = {
        ...state,
        [prop]: event.target.value,
      }
      setState(value)
      onChange(name, value)
    },
    [name, onChange, state]
  )

  const handleCheck = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const prop = event.target.name as keyof PublicContactInfo
      const value = {
        ...state,
        [prop]: event.target.checked ? (defaults?.[prop] ?? '') : '',
      }
      setState(value)
      onChange(name, value)
    },
    [defaults, name, onChange, state]
  )

  return (
    <FormGroup>
      <FormControlLabel
        disabled={disabled}
        control={<Checkbox checked={state.name !== ''} name="name" onChange={handleCheck} />}
        label={t('contact.name')}
      />
      <FormControlLabel
        disabled={disabled}
        control={<Checkbox checked={state.email !== ''} name="email" onChange={handleCheck} />}
        label={t('contact.email')}
      />
      <FormControlLabel
        disabled={disabled}
        control={<Checkbox checked={state.phone !== ''} name="phone" onChange={handleCheck} />}
        label={t('contact.phone')}
      />
      <TextField disabled={disabled} name="name" value={state.name} onChange={handleChange} />
      <TextField disabled={disabled} name="email" value={state.email} onChange={handleChange} />
      <TextField disabled={disabled} name="phone" value={state.phone} onChange={handleChange} />
    </FormGroup>
  )
}
