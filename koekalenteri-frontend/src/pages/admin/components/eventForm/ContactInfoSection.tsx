import type { ContactInfo, DeepPartial, Official, Secretary, ShowContactInfo } from 'koekalenteri-shared/model'

import { useTranslation } from 'react-i18next'
import Grid from '@mui/material/Grid'

import CollapsibleSection from '../../../components/CollapsibleSection'

import ContactInfoDisplay from './contactInfoSection/ContactInfoDisplay'
import ContactInfoSelect from './contactInfoSection/ContactInfoSelect'

interface Props {
  readonly contactInfo?: DeepPartial<ContactInfo>
  readonly official?: DeepPartial<Official>
  readonly secretary?: Partial<Secretary>
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
  official,
  secretary,
  helperText,
  onChange,
  onOpenChange,
  open,
}: Props) {
  const { t } = useTranslation()
  const handleChange = (name: string, props: Partial<ShowContactInfo>) =>
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
      error={!!helperText}
      helperText={helperText}
    >
      <Grid container spacing={1}>
        <Grid item container spacing={1}>
          <Grid item>
            {t(`event.official`)}
            <ContactInfoSelect
              disabled={disabled}
              name="official"
              show={contactInfo?.official}
              onChange={handleChange}
            />
          </Grid>
          <Grid item>
            {t(`event.secretary`)}
            <ContactInfoSelect
              disabled={disabled}
              name="secretary"
              show={contactInfo?.secretary}
              onChange={handleChange}
            />
          </Grid>
        </Grid>
      </Grid>
      <hr />
      <Grid container rowSpacing={1}>
        <ContactInfoDisplay contact="official" person={official} show={contactInfo?.official} />
        <ContactInfoDisplay contact="secretary" person={secretary} show={contactInfo?.secretary} />
      </Grid>
    </CollapsibleSection>
  )
}
