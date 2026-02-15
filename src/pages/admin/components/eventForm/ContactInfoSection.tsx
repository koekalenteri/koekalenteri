import type { ContactInfo, DeepPartial, PublicContactInfo, User } from '../../../../types'
import Grid from '@mui/material/Grid'
import { useTranslation } from 'react-i18next'
import CollapsibleSection from '../../../components/CollapsibleSection'
import ContactInfoSelect from './contactInfoSection/ContactInfoSelect'

interface Props {
  readonly contactInfo: DeepPartial<ContactInfo> | undefined
  readonly official: Partial<User> | undefined
  readonly secretary: Partial<User> | undefined
  readonly disabled?: boolean
  readonly error?: boolean
  readonly helperText?: string
  readonly open?: boolean
  readonly onChange: (changes: { contactInfo: DeepPartial<ContactInfo> }) => void
  readonly onOpenChange?: (value: boolean) => void
}

export default function ContactInfoSection({
  contactInfo,
  disabled,
  error,
  helperText,
  onChange,
  onOpenChange,
  official,
  open,
  secretary,
}: Props) {
  const { t } = useTranslation()
  const handleChange = (name: string, props: Partial<PublicContactInfo>) =>
    onChange({
      contactInfo: {
        ...contactInfo,
        [name]: props,
      },
    })

  return (
    <CollapsibleSection
      title={t('event.contactInfo')}
      open={open}
      onOpenChange={onOpenChange}
      error={error}
      helperText={helperText}
    >
      <Grid container spacing={1}>
        <Grid container spacing={1}>
          <Grid sx={{ width: 300 }}>
            {t(`event.official`)}
            <ContactInfoSelect
              disabled={disabled}
              defaults={official}
              name="official"
              show={contactInfo?.official}
              onChange={handleChange}
            />
          </Grid>
          <Grid sx={{ width: 300 }}>
            {t(`event.secretary`)}
            <ContactInfoSelect
              disabled={disabled}
              defaults={secretary}
              name="secretary"
              show={contactInfo?.secretary}
              onChange={handleChange}
            />
          </Grid>
        </Grid>
      </Grid>
    </CollapsibleSection>
  )
}
