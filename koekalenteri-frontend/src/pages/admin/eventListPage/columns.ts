import { useTranslation } from "react-i18next"
import { GridColDef, GridValueGetterParams } from "@mui/x-data-grid"
import { EventClass, EventEx, EventState } from "koekalenteri-shared/model"

import { useJudgesActions } from "../../recoil/judges"

interface EventListColDef extends GridColDef {
  field: keyof EventEx | 'date'
}

type StartEndDate = { start: Date, end: Date }

export default function useEventListColumns(): EventListColDef[] {
  const { t } = useTranslation()
  const judgeActions = useJudgesActions()

  return [
    {
      align: 'right',
      field: 'date',
      headerName: t('date'),
      width: 120,
      sortComparator: (a, b) => (b as StartEndDate).start.valueOf() - (a as StartEndDate).start.valueOf(),
      valueGetter: (params) => ({ start: params.row.startDate, end: params.row.endDate }),
      valueFormatter: ({value}) => t('daterange', value as StartEndDate),
    },
    {
      field: 'eventType',
      headerName: t('event.eventType'),
      minWidth: 100,
    },
    {
      field: 'classes',
      headerName: t('event.classes'),
      minWidth: 100,
      flex: 1,
      valueGetter: (params) => ((params.row.classes || []) as Array<EventClass|string>).map(c => typeof c === 'string' ? c : c.class).join(', '),
    },
    {
      field: 'location',
      headerName: t('event.location'),
      minWidth: 100,
      flex: 1,
    },
    {
      field: 'official',
      headerName: t('event.official'),
      minWidth: 100,
      flex: 1,
      valueGetter: (params) => params.row.official?.name,
    },
    {
      field: 'judges',
      headerName: t('judgeChief'),
      minWidth: 100,
      flex: 1,
      valueGetter: (params) => params.row.judges && judgeActions.find(params.row.judges[0])?.name,
    },
    {
      field: 'places',
      headerName: t('places'),
      align: 'right',
      width: 80,
      valueGetter: (params) => `${params.row.entries} / ${params.row.places}`,
    },
    {
      field: 'state',
      headerName: t('event.state'),
      flex: 1,
      type: 'string',
      valueGetter: (params: GridValueGetterParams<EventState, EventEx>) => {
        const event: EventEx = params.row
        if (event.isEntryOpen) {
          return t('event.states.confirmed_entryOpen')
        }
        if (event.isEntryClosed) {
          return t('event.states.confirmed_entryClosed')
        }
        if (event.isEventOngoing) {
          return t('event.states.confirmed_eventOngoing')
        }
        if (event.isEventOver) {
          return t('event.states.confirmed_eventOver')
        }
        return t(`event.states.${(params.value || 'draft')}`)
      },
    },
  ]
}
