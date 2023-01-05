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
  const handleChange = (props: Partial<ShowContactInfo>) => onChange({ [contact]: { ...show, ...props } })

  return (
    <>
      {t(`event.${contact}`)}
      <FormGroup row>
        <FormControlLabel
          control={<Checkbox checked={!!show?.name} onChange={e => handleChange({ name: e.target.checked })} />}
          label="Nimi" />
        <FormControlLabel
          control={<Checkbox checked={!!show?.email} onChange={e => handleChange({ email: e.target.checked })} />}
          label="Sähköposti" />
        <FormControlLabel
          control={<Checkbox checked={!!show?.phone} onChange={e => handleChange({ phone: e.target.checked })} />}
          label="Puhelin" />
      </FormGroup>
    </>
  )
}
