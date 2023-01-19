import { ChangeEvent, useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Checkbox, FormControlLabel, FormGroup } from '@mui/material'
import { ShowContactInfo } from 'koekalenteri-shared/model'

interface Props {
  name: string
  show?: Partial<ShowContactInfo>
  onChange: (name: string, props: ShowContactInfo) => void
}

export default function ContactInfoSelect({ name, show, onChange }: Props) {
  const { t } = useTranslation()
  const [state, setState] = useState({
    name: !!show?.name,
    email: !!show?.email,
    phone: !!show?.phone,
  })

  const handleChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const value = {
      ...state,
      [event.target.name]: event.target.checked,
    }
    setState(value)
    onChange(name, value)
  }, [name, onChange, state])

  return (
    <FormGroup row>
      <FormControlLabel
        control={<Checkbox checked={state.name} name="name" onChange={handleChange} />}
        label={t('contact.name')} />
      <FormControlLabel
        control={<Checkbox checked={state.email} name="email" onChange={handleChange} />}
        label={t('contact.email')} />
      <FormControlLabel
        control={<Checkbox checked={state.phone} name="phone" onChange={handleChange} />}
        label={t('contact.phone')} />
    </FormGroup>
  )
}
