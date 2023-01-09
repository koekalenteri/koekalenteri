import { Dispatch, SetStateAction, useCallback, useMemo } from 'react'
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import { Box, Typography } from '@mui/material'
import { GridSelectionModel } from '@mui/x-data-grid'
import { Registration, RegistrationDate, RegistrationGroup } from 'koekalenteri-shared/model'
import { useRecoilState, useRecoilValue } from 'recoil'

import StyledDataGrid from '../../components/StyledDataGrid'
import { adminRegistrationIdAtom, currentEventClassRegistrationsQuery } from '../recoil'

import { DragItem } from './classEntrySelection/DragableRow'
import DragableDataGrid from './classEntrySelection/DropableDataGrid'
import { availableGroups } from './classEntrySelection/GroupColors'
import GroupHeader from './classEntrySelection/GroupHeader'
import NoRowsOverlay from './classEntrySelection/NoRowsOverlay'
import { useClassEntrySelectionColumns } from './classEntrySelection/useClassEntrySelectionColumns'

interface Props {
  eventDates?: Date[]
  setOpen?: Dispatch<SetStateAction<boolean>>
}

interface RegistrationWithGroups extends Registration {
  groups: string[]
}

export const groupKey = (rd: RegistrationDate) => rd.date.toISOString().slice(0, 10) + '-' + rd.time

const ClassEntrySelection = ({ eventDates = [], setOpen }: Props) => {
  const registrations = useRecoilValue(currentEventClassRegistrationsQuery)
  const [selectedRegistrationID, setSelectedRegistrationID] = useRecoilState(adminRegistrationIdAtom)

  const eventGroups: RegistrationGroup[] = useMemo(() => availableGroups(eventDates).map(eventDate => ({ ...eventDate, key: groupKey(eventDate), number: 0 })), [eventDates])
  const registrationsByGroup: Record<string, RegistrationWithGroups[]> = useMemo(() => {
    const byGroup: Record<string, RegistrationWithGroups[]> = { reserve: [] }
    for (const group of eventGroups) {
      byGroup[group.key] = []
    }
    for (const reg of registrations) {
      const key = reg.group?.key ?? 'reserve'
      byGroup[key] = byGroup[key] || [] // make sure the array exists
      byGroup[key].push({...reg, groups: reg.dates.map(rd => groupKey(rd))})
    }
    return byGroup
  }, [eventGroups, registrations])

  const {entryColumns, participantColumns} = useClassEntrySelectionColumns(eventDates)

  const handleDrop = (group?: RegistrationGroup) => (item: DragItem) => {
    const reg = registrations.find(r => r.id === item.id)
    if (reg && reg.group?.key !== group?.key) {
      reg.setGroup(group)
    }
    if (item.move) {
      console.log(item.id, item.move)
      delete item.move
    }
  }

  const handleSelectionModeChange = useCallback((selection: GridSelectionModel) => {
    const value = typeof selection[0] === 'string' ? selection[0] : undefined
    setSelectedRegistrationID(value)
  }, [setSelectedRegistrationID])

  const handleDoubleClick = useCallback(() => setOpen?.(true), [setOpen])

  return (
    <DndProvider backend={HTML5Backend}>
      <Typography variant='h5'>Osallistujat</Typography>
      {/* column headers only */}
      <Box sx={{ height: 40, flexShrink: 0, width: '100%', overflow: 'hidden' }}>
        <StyledDataGrid
          columns={participantColumns}
          density='compact'
          disableColumnMenu
          hideFooter
          rows={[]}
          components={{
            NoRowsOverlay: NullComponent,
          }}
        />
      </Box>
      {eventGroups.map((group) =>
        <DragableDataGrid
          key={group.key}
          group={group.key}
          columns={participantColumns}
          density='compact'
          disableColumnMenu
          hideFooter
          headerHeight={0}
          rows={registrationsByGroup[group.key] ?? []}
          onSelectionModelChange={handleSelectionModeChange}
          selectionModel={selectedRegistrationID ? [selectedRegistrationID] : []}
          components={{
            Header: GroupHeader,
            NoRowsOverlay: NoRowsOverlay,
          }}
          componentsProps={{
            header: {
              eventDates: eventDates,
              group: group,
            },
            row: {
              groupKey: group.key,
            },
          }}
          onDrop={handleDrop(group)}
        />,
      )}
      < Typography variant='h5' > Ilmoittautuneet</Typography >
      <DragableDataGrid
        columns={entryColumns}
        density='compact'
        disableColumnMenu
        flex={eventGroups.length || 1}
        rows={registrationsByGroup.reserve}
        onSelectionModelChange={handleSelectionModeChange}
        selectionModel={selectedRegistrationID ? [selectedRegistrationID] : []}
        onRowDoubleClick={handleDoubleClick}
        onDrop={handleDrop()}
      />
    </DndProvider>
  )
}

function NullComponent() {
  return null
}

export default ClassEntrySelection
