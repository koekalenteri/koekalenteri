import { ChangeEvent, useCallback } from "react"
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
  const handleChange = useCallback((props: Partial<ShowContactInfo>) => onChange({ [contact]: { ...show, ...props } }), [contact, onChange, show])
  const handleNameChange = useCallback((e: ChangeEvent<HTMLInputElement>, checked: boolean) => handleChange({ name: checked }), [handleChange])
  const handleEmailChange = useCallback((e: ChangeEvent<HTMLInputElement>, checked: boolean) => handleChange({ email: checked }), [handleChange])
  const handlePhoneChange = useCallback((e: ChangeEvent<HTMLInputElement>, checked: boolean) => handleChange({ phone: checked }), [handleChange])

  return (
    <>
      {t(`event.${contact}`)}
      <FormGroup row>
        <FormControlLabel
          control={<Checkbox checked={!!show?.name} onChange={handleNameChange} />}
          label={t('contact.name')} />
        <FormControlLabel
          control={<Checkbox checked={!!show?.email} onChange={handleEmailChange} />}
          label={t('contact.email')} />
        <FormControlLabel
          control={<Checkbox checked={!!show?.phone} onChange={handlePhoneChange} />}
          label={t('contact.phone')} />
      </FormGroup>
    </>
  )
}
