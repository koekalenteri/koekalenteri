import type { EventType, PublicJudge } from '../../../../../types'
import type { SectionProps } from '../types'
import DeleteOutline from '@mui/icons-material/DeleteOutline'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Grid from '@mui/material/Grid'
import TextField from '@mui/material/TextField'
import { useTranslation } from 'react-i18next'
import { countries } from '../../../../../lib/data'
import AutocompleteSingle from '../../../../components/AutocompleteSingle'
import JudgeClasses from './JudgeClasses'
import { filterClassesByJudgeId, updateJudge } from './utils'

interface Props extends Pick<SectionProps, 'event' | 'disabled' | 'onChange'> {
  readonly selectedEventType?: EventType
  readonly judge: PublicJudge
  readonly index: number
}

export const UnofficialJudge = ({ event, judge, index, selectedEventType, disabled, onChange }: Props) => {
  const { t } = useTranslation()

  const title = selectedEventType?.official && index === 0 ? t('judgeChief') : `${t('judge')} ${index + 1}`

  const handleChange = (props: Partial<PublicJudge>) => {
    const newJudges = [...event.judges]
    const newJudge = { ...newJudges[index], ...props }
    newJudges[index] = newJudge
    onChange?.({
      classes: updateJudge(event, judge.id, newJudge, filterClassesByJudgeId(event.classes, judge.id)),
      judges: newJudges,
    })
  }

  return (
    <Grid key={`unofficial-${index}`} container spacing={1} alignItems="center" width="100%">
      <Grid sx={{ width: 300 }}>
        <TextField
          fullWidth
          label={title}
          value={judge.name}
          onChange={(e) => handleChange({ name: e.target.value })}
        />
      </Grid>
      <JudgeClasses disabled={disabled} event={event} index={index} judge={judge} onChange={onChange} />
      <Grid sx={{ width: 200 }}>
        <AutocompleteSingle
          options={countries}
          getOptionLabel={(option) => t(option, { ns: 'country' })}
          renderOption={(props, option) => (
            <Box component="li" sx={{ '& > img': { flexShrink: 0, mr: 2 } }} {...props}>
              <img
                loading="lazy"
                width="20"
                srcSet={`https://flagcdn.com/w40/${option.toLowerCase()}.png 2x`}
                src={`https://flagcdn.com/w20/${option.toLowerCase()}.png`}
                alt=""
              />
              {t(option, { ns: 'country' })}
            </Box>
          )}
          value={judge.foreing ? judge.country : 'FI'}
          label={'Maa'}
          disabled={!judge.foreing}
          onChange={(country) => handleChange({ country: country ?? undefined })}
        />
      </Grid>
      <Grid>
        <Button
          startIcon={<DeleteOutline />}
          disabled={disabled}
          onClick={() =>
            onChange?.({
              classes: updateJudge(event, judge.id, undefined, []),
              judges: event.judges.filter((j) => j !== judge),
            })
          }
        >
          Poista tuomari
        </Button>
      </Grid>
    </Grid>
  )
}
