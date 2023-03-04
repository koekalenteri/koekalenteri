import { Dispatch, SetStateAction, useCallback, useMemo } from 'react'
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import { Box, Typography } from '@mui/material'
import { GridCallbackDetails, GridSelectionModel } from '@mui/x-data-grid'
import { Registration, RegistrationDate, RegistrationGroup } from 'koekalenteri-shared/model'
import { useSnackbar } from 'notistack'
import { SetterOrUpdater } from 'recoil'

import StyledDataGrid from '../../components/StyledDataGrid'
import { RegistrationWithMutators } from '../recoil'
import { useAdminRegistrationActions } from '../recoil/registrations/actions'

import { useClassEntrySelectionColumns } from './classEntrySelection/columns'
import { DragItem } from './classEntrySelection/DragableRow'
import DragableDataGrid from './classEntrySelection/DropableDataGrid'
import { availableGroups } from './classEntrySelection/GroupColors'
import GroupHeader from './classEntrySelection/GroupHeader'
import NoRowsOverlay from './classEntrySelection/NoRowsOverlay'

interface Props {
  eventDates?: Date[]
  registrations?: RegistrationWithMutators[]
  setOpen?: Dispatch<SetStateAction<boolean>>
  selectedRegistrationId?: string
  setSelectedRegistrationId?: SetterOrUpdater<string | undefined>
}

interface RegistrationWithGroups extends Registration {
  groups: string[]
}

const listKey = (reg: Registration) => {
  if (reg.cancelled) {
    return 'cancelled'
  }
  return reg.group?.key ?? 'reserve'
}
export const groupKey = (rd: RegistrationDate) => rd.date.toISOString().slice(0, 10) + '-' + rd.time

const ClassEntrySelection = ({
  eventDates = [],
  registrations = [],
  setOpen,
  selectedRegistrationId,
  setSelectedRegistrationId,
}: Props) => {
  const { enqueueSnackbar } = useSnackbar()
  const { cancelledColumns, entryColumns, participantColumns } = useClassEntrySelectionColumns(eventDates)
  const actions = useAdminRegistrationActions()

  const eventGroups: RegistrationGroup[] = useMemo(
    () => availableGroups(eventDates).map((eventDate) => ({ ...eventDate, key: groupKey(eventDate), number: 0 })),
    [eventDates]
  )
  const registrationsByGroup: Record<string, RegistrationWithGroups[]> = useMemo(() => {
    const byGroup: Record<string, RegistrationWithGroups[]> = { reserve: [] }
    for (const group of eventGroups) {
      byGroup[group.key] = []
    }
    for (const reg of registrations) {
      const key = listKey(reg)
      byGroup[key] = byGroup[key] || [] // make sure the array exists
      byGroup[key].push({ ...reg, groups: reg.dates.map((rd) => groupKey(rd)) })
    }
    return byGroup
  }, [eventGroups, registrations])

  const handleDrop = (group?: RegistrationGroup) => (item: DragItem) => {
    const reg = registrations.find((r) => r.id === item.id)
    if (reg && reg.group?.key !== group?.key) {
      reg.setGroup(group) // set the group to cache for faster ui update
      actions.saveGroup({ ...reg, group })
    }
    if (item.move) {
      console.log(item.id, item.move)
      delete item.move
    }
  }

  const handleReject = (item: DragItem) => {
    const reg = registrations.find((r) => r.id === item.id)
    if (reg) {
      enqueueSnackbar(`Koira ${reg.dog.name} ei ole ilmoittautunut tähän ryhmään`, { variant: 'error' })
    }
  }

  const handleSelectionModeChange = useCallback(
    (selection: GridSelectionModel, details: GridCallbackDetails) => {
      const value = typeof selection[0] === 'string' ? selection[0] : undefined
      if (value) {
        const reg = registrations.find((r) => r.id === value)
        setSelectedRegistrationId?.(reg?.id)
      }
    },
    [registrations, setSelectedRegistrationId]
  )

  const handleDoubleClick = useCallback(() => setOpen?.(true), [setOpen])

  return (
    <DndProvider backend={HTML5Backend}>
      <Typography variant="h6">Osallistujat</Typography>
      {/* column headers only */}
      <Box sx={{ height: 40, flexShrink: 0, width: '100%', overflow: 'hidden' }}>
        <StyledDataGrid
          columns={participantColumns}
          density="compact"
          disableColumnMenu
          hideFooter
          rows={[]}
          components={{
            NoRowsOverlay: NullComponent,
          }}
        />
      </Box>
      {eventGroups.map((group) => (
        <DragableDataGrid
          autoHeight
          key={group.key}
          group={group.key}
          columns={participantColumns}
          hideFooter
          headerHeight={0}
          rows={registrationsByGroup[group.key] ?? []}
          onSelectionModelChange={handleSelectionModeChange}
          selectionModel={selectedRegistrationId ? [selectedRegistrationId] : []}
          onRowDoubleClick={handleDoubleClick}
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
          onReject={handleReject}
        />
      ))}
      <Typography variant="h6">Ilmoittautuneet</Typography>
      <DragableDataGrid
        autoHeight
        columns={entryColumns}
        hideFooter
        rows={registrationsByGroup.reserve}
        onSelectionModelChange={handleSelectionModeChange}
        selectionModel={selectedRegistrationId ? [selectedRegistrationId] : []}
        onRowDoubleClick={handleDoubleClick}
        onDrop={handleDrop()}
      />
      {registrationsByGroup.cancelled?.length ? (
        <>
          <Typography variant="h6">Peruneet</Typography>
          <StyledDataGrid
            autoHeight
            columns={cancelledColumns}
            hideFooter
            rows={registrationsByGroup.cancelled}
            onSelectionModelChange={handleSelectionModeChange}
            selectionModel={selectedRegistrationId ? [selectedRegistrationId] : []}
            onRowDoubleClick={handleDoubleClick}
          />
        </>
      ) : null}
    </DndProvider>
  )
}

function NullComponent() {
  return null
}

export default ClassEntrySelection
