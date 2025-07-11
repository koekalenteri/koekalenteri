import type { PublicJudge } from '../../../../../types'
import type { SectionProps } from '../types'

import Grid2 from '@mui/material/Grid2'

import EventClasses from '../components/EventClasses'

import { filterClassesByJudgeId, updateJudge } from './utils'

interface Props extends Pick<SectionProps, 'event' | 'disabled' | 'onChange'> {
  readonly judge: PublicJudge
  readonly index: number
}

const JudgeClasses = ({ disabled, event, index, judge, onChange }: Props) => {
  return (
    <Grid2 flex={1} display={event.eventType === 'NOWT' ? 'NONE' : undefined}>
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
    </Grid2>
  )
}

export default JudgeClasses
