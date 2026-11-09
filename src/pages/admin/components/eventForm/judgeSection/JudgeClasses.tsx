import type { PublicJudge } from '@/types'
import type { JudgesEvent, SectionProps } from '../types'
import Grid from '@mui/material/Grid'
import { useTranslation } from 'react-i18next'
import { formatTypeOf } from '@/lib/event'
import EventClasses from '../components/EventClasses'
import { filterClassesByJudgeId, updateJudge } from './utils'

interface Props extends Pick<SectionProps, 'disabled' | 'onChange'> {
  readonly event: JudgesEvent
  readonly judge: PublicJudge
  readonly index: number
}

const JudgeClasses = ({ disabled, event, index, judge, onChange }: Props) => {
  const { t } = useTranslation()

  return (
    // Fills the row beside the judge's name; on a phone, where there is no such room, takes a row of its own.
    <Grid
      sx={{
        // A NOWT names no judge per class (KOE-317), nor does a trial that follows one (KOE-1718).
        display: formatTypeOf(event) === 'NOWT' ? 'NONE' : undefined,
        flex: '1 1 200px',
      }}
    >
      <EventClasses
        id={`class${index}`}
        disabled={disabled}
        eventStartDate={event.startDate}
        eventEndDate={event.endDate}
        value={filterClassesByJudgeId(event.classes, judge.id)}
        classes={[...event.classes]}
        label={t('event.judgesEditor.classes')}
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
