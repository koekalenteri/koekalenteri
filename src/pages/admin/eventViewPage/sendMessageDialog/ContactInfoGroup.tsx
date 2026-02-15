import type { Dispatch, SetStateAction } from 'react'
import type { ContactInfo, DogEvent } from '../../../../types'
import { styled } from '@mui/material'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormGroup from '@mui/material/FormGroup'
import FormLabel from '@mui/material/FormLabel'
import { useTranslation } from 'react-i18next'

interface Props {
  contactInfo: Partial<ContactInfo> | undefined
  event: DogEvent
  group: 'secretary' | 'official'
  setContactInfo: Dispatch<SetStateAction<Partial<ContactInfo> | undefined>>
}

const CONTACT_INFO_PROPS = ['name', 'email', 'phone'] as const
const ContactInfoCheckbox = styled(Checkbox)({ paddingBottom: 0, paddingTop: 0 })

const ContactInfoGroup = ({ contactInfo, event, group, setContactInfo }: Props) => {
  const { t } = useTranslation()

  return (
    <div key={`${group}`}>
      <FormLabel component="legend">{t(`event.${group}`)}</FormLabel>
      <FormGroup sx={{ mx: 2, my: 0 }} row>
        {CONTACT_INFO_PROPS.map((prop) => (
          <FormControlLabel
            key={`${group}.${prop}`}
            control={<ContactInfoCheckbox name={`${group}.${prop}`} />}
            label={t(`contact.${prop}`)}
            checked={Boolean(contactInfo?.[group]?.[prop])}
            disabled={!event?.[group]?.[prop]}
            onChange={(_e, checked) =>
              setContactInfo((old) => ({
                ...old,
                [group]: {
                  ...old?.[group],
                  [prop]: checked
                    ? // prefer contactInfo from event, fall back to actual contact info
                      event?.contactInfo?.[group]?.[prop] || event?.[group]?.[prop]
                    : undefined,
                },
              }))
            }
          />
        ))}
      </FormGroup>
    </div>
  )
}

export default ContactInfoGroup
