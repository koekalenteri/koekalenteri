import { TextField } from '@mui/material';
import { Registration } from 'koekalenteri-shared/model';
import { useTranslation } from 'react-i18next';
import { CollapsibleSection } from '../..';

type AdditionalInfoProps = {
  reg: Registration
  onChange: (props: Partial<Registration>) => void
};

export function AdditionalInfo({reg, onChange}: AdditionalInfoProps) {
  const { t } = useTranslation();

  return (
    <CollapsibleSection title={t('registration.notes')}>
      <TextField
        multiline
        onChange={(e) => onChange({ notes: e.target.value })}
        rows={4}
        sx={{ width: '100%' }}
        value={reg.notes}
      />
    </CollapsibleSection>
  );
}
