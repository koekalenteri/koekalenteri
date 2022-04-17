import { Checkbox, FormControlLabel, Grid, TextField } from '@mui/material';
import { Registration, RegistrationPerson } from 'koekalenteri-shared/model';
import { useTranslation } from 'react-i18next';
import { CollapsibleSection, emptyPerson } from '../..';
import { useStores } from '../../../stores';

type HandlerInfoProps = {
  reg: Partial<Registration>
  error?: boolean
  helperText?: string
  onChange: (props: Partial<Registration>) => void
  onOpenChange?: (value: boolean) => void
  open?: boolean
};

export function HandlerInfo({ reg, error, helperText, onChange, onOpenChange, open }: HandlerInfoProps) {
  const { t } = useTranslation();
  const { rootStore } = useStores();

  const handleChange = (props: Partial<RegistrationPerson>) => {
    const handler = { ...emptyPerson, ...reg.handler, ...props };
    if (reg.dog?.regNo) {
      rootStore.dogStore.save({ dog: { ...reg.dog }, handler });
    }
    onChange({ handler });
  }

  return (
    <CollapsibleSection title={t('registration.handler')} error={error} helperText={helperText} open={open} onOpenChange={onOpenChange}>
      <Grid item container spacing={1}>
        <Grid item container spacing={1}>
          <Grid item sx={{ width: 300 }}>
            <TextField
              InputProps={{ autoComplete: 'name' }}
              error={!reg.handler?.name}
              fullWidth
              id="handler_name"
              label={t('registration.contact.name')}
              name="name"
              onChange={e => handleChange({ name: e.target.value || '' })}
              value={reg.handler?.name || ''}
            />
          </Grid>
          <Grid item sx={{ width: 300 }}>
            <TextField
              InputProps={{ autoComplete: 'address-level2' }}
              error={!reg.handler?.location}
              fullWidth
              id="handler_city"
              name="city"
              onChange={e => handleChange({ location: e.target.value || '' })}
              label={t('registration.contact.city')}
              value={reg.handler?.location || ''}
            />
          </Grid>
        </Grid>
        <Grid item container spacing={1}>
          <Grid item sx={{ width: 300 }}>
            <TextField
              InputProps={{ autoComplete: 'email' }}
              error={!reg.handler?.email}
              fullWidth
              id="handler_email"
              label={t('registration.contact.email')}
              name="email"
              onChange={e => handleChange({ email: e.target.value || '' })}
              value={reg.handler?.email || ''}
            />
          </Grid>
          <Grid item sx={{ width: 300 }}>
            <TextField
              InputProps={{ autoComplete: 'tel' }}
              error={!reg.handler?.phone}
              fullWidth
              id="handler_phone"
              label={t('registration.contact.phone')}
              name="phone"
              onChange={e => handleChange({ phone: e.target.value || '' })}
              value={reg.handler?.phone || ''}
            />
          </Grid>
        </Grid>
      </Grid>
      <FormControlLabel
        control={
          <Checkbox
            checked={reg.handler?.membership}
            onChange={e => handleChange({ membership: e.target.checked })}
          />
        }
        label={t('registration.handlerIsMember')}
      />
    </CollapsibleSection>
  );
}
