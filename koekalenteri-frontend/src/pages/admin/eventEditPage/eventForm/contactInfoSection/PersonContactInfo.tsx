import { ChangeEvent, useState } from "react"
import { useTranslation } from "react-i18next"
import { Checkbox, FormControlLabel, FormGroup } from "@mui/material"
import { ContactInfo, ShowContactInfo } from "koekalenteri-shared/model"

interface Props {
  contact: 'official' | 'secretary'
  show?: Partial<ShowContactInfo>
  onChange: (props: Partial<ContactInfo>) => void
}

export default function PersonContactInfo({ contact, show, onChange }: Props) {
  const { t } = useTranslation()
  const [state, setState] = useState({
    name: !!show?.name,
    email: !!show?.email,
    phone: !!show?.phone,
  })

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = {
      ...state,
      [event.target.name]: event.target.checked,
    }
    setState(value)
    onChange({ [contact]: value })
  }

  return (
    <>
      {t(`event.${contact}`)}
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
    </>
  )
}
