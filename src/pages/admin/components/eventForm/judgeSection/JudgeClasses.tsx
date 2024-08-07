import type { PublicJudge } from '../../../../../types'
import type { SectionProps } from '../../EventForm'

import Grid from '@mui/material/Grid'

import EventClasses from '../components/EventClasses'

import { filterClassesByJudgeId, updateJudge } from './utils'

interface Props extends Pick<SectionProps, 'event' | 'disabled' | 'onChange'> {
  readonly judge: PublicJudge
  readonly index: number
}

const JudgeClasses = ({ disabled, event, index, judge, onChange }: Props) => {
  return (
    <Grid item sx={{ width: 300 }} display={event.eventType === 'NOWT' ? 'NONE' : undefined}>
      <EventClasses
        id={`class${index}`}
        disabled={disabled}
        eventStartDate={event.startDate}
        eventEndDate={event.endDate}
        value={filterClassesByJudgeId(event.classes, judge.id)}
        classes={[...event.classes]}
        label="Arvostelee luokat"
        onChange={(_e, values) =>
          onChange?.({
            classes: updateJudge(event, judge.id, judge, [...values]),
          })
        }
      />
    </Grid>
  )
}

export default JudgeClasses
