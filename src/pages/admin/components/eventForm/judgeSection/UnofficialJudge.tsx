import type { EventType, PublicJudge } from '../../../../../types'
import type { SectionProps } from '../types'

import { useTranslation } from 'react-i18next'
import DeleteOutline from '@mui/icons-material/DeleteOutline'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Grid2 from '@mui/material/Grid2'
import TextField from '@mui/material/TextField'

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

  const title = selectedEventType?.official && index === 0 ? t('judgeChief') : t('judge') + ` ${index + 1}`

  return (
    <Grid2 key={'unofficial-' + index} container spacing={1} alignItems="center">
      <Grid2 sx={{ width: 300 }}>
        <TextField
          fullWidth
          label={title}
          value={judge.name}
          onChange={(e) => {
            const newJudges = [...event.judges]
            const newJudge = (newJudges[index] = { ...newJudges[index], name: e.target.value })
            onChange?.({
              judges: newJudges,
              classes: updateJudge(event, judge.id, newJudge, filterClassesByJudgeId(event.classes, judge.id)),
            })
          }}
        />
      </Grid2>
      <JudgeClasses disabled={disabled} event={event} index={index} judge={judge} onChange={onChange} />
      <Grid2 sx={{ width: 200 }}>
        <AutocompleteSingle
          options={countries}
          getOptionLabel={(option) => t(option, { ns: 'country' })}
          renderOption={(props, option) => (
            <Box component="li" sx={{ '& > img': { mr: 2, flexShrink: 0 } }} {...props}>
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
          onChange={(country) => {
            const newJudges = [...event.judges]
            const newJudge = (newJudges[index] = { ...newJudges[index], country: country ?? undefined })
            onChange?.({
              judges: newJudges,
              classes: updateJudge(event, judge.id, newJudge, filterClassesByJudgeId(event.classes, judge.id)),
            })
          }}
        />
      </Grid2>
      <Grid2>
        <Button
          startIcon={<DeleteOutline />}
          disabled={disabled}
          onClick={() =>
            onChange?.({
              judges: event.judges.filter((j) => j !== judge),
              classes: updateJudge(event, judge.id, undefined, []),
            })
          }
        >
          Poista tuomari
        </Button>
      </Grid2>
    </Grid2>
  )
}
