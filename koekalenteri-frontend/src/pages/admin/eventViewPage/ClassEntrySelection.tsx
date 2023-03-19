import { Dispatch, SetStateAction, useCallback, useMemo } from 'react'
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import { Box, Typography } from '@mui/material'
import { GridCallbackDetails, GridSelectionModel } from '@mui/x-data-grid'
import { Registration, RegistrationDate, RegistrationGroup, RegistrationGroupInfo } from 'koekalenteri-shared/model'
import { useSnackbar } from 'notistack'
import { SetterOrUpdater } from 'recoil'

import StyledDataGrid from '../../components/StyledDataGrid'
import { useAdminRegistrationActions } from '../recoil/registrations/actions'

import { useClassEntrySelectionColumns } from './classEntrySelection/columns'
import { DragItem } from './classEntrySelection/DragableRow'
import DragableDataGrid from './classEntrySelection/DropableDataGrid'
import { availableGroups } from './classEntrySelection/GroupColors'
import GroupHeader from './classEntrySelection/GroupHeader'
import NoRowsOverlay from './classEntrySelection/NoRowsOverlay'

interface Props {
  eventClass: string
  eventDates?: Date[]
  registrations?: Registration[]
  setOpen?: Dispatch<SetStateAction<boolean>>
  selectedRegistrationId?: string
  setSelectedRegistrationId?: SetterOrUpdater<string | undefined>
}

interface RegistrationWithGroups extends Registration {
  groups: string[]
}

const listKey = (reg: Registration, eventGroups: RegistrationGroup[]) => {
  if (reg.cancelled) {
    return 'cancelled'
  }
  if (reg.group && eventGroups.find((eg) => eg.key === reg.group?.key)) {
    return reg.group.key
  }
  return 'reserve'
}
export const groupKey = (rd: RegistrationDate) => rd.date.toISOString().slice(0, 10) + '-' + rd.time

const ClassEntrySelection = ({
  eventClass,
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
    const byGroup: Record<string, RegistrationWithGroups[]> = { cancelled: [], reserve: [] }
    for (const reg of registrations) {
      const key = listKey(reg, eventGroups)
      byGroup[key] = byGroup[key] ?? [] // make sure the array exists
      byGroup[key].push({ ...reg, groups: reg.dates.map((rd) => groupKey(rd)) })
    }
    for (const regs of Object.values(byGroup)) {
      regs.sort((a, b) => (a.group?.number || 999) - (b.group?.number || 999))
    }
    return byGroup
  }, [eventGroups, registrations])

  const handleDrop = (group: RegistrationGroup) => async (item: DragItem) => {
    const reg = registrations.find((r) => r.id === item.id)
    if (!reg) {
      return
    }

    // make sure the dropped registration is selected, so its intuitive to user
    setSelectedRegistrationId?.(reg.id)

    const save: RegistrationGroupInfo[] = []
    // determine all the other registrations in group
    const regs = registrations.filter((r) => r.group?.key === group.key && r.id !== reg.id)

    const newGroup = { ...group, number: regs.length + 1 }

    if (group.key === 'cancelled' || group.key === 'reserve') {
      if (reg.group?.key === group.key) {
        // user can not re-order items in cancelled or reserve groups
        delete item.move
        return
      }
      save.push({ eventId: reg.eventId, id: reg.id, group: newGroup })
    } else if (item.move) {
      const pos = item.move.index + (item.move.position === 'before' ? 0 : 1)
      newGroup.number = regs[pos]?.group?.number ?? 0
      regs.splice(pos, 0, reg)
      save.push({ eventId: reg.eventId, id: reg.id, group: newGroup })

      // update all the registrations that needs to move, and add to `save` array
      regs.forEach(async (r, i) => {
        if (r.group && r.group?.number !== i + 1 && r.id !== reg.id) {
          const grp = { ...r.group, number: i + 1 }
          save.push({ eventId: r.eventId, id: r.id, group: grp })
        }
      })
    } else {
      // move from list to another
      save.push({ eventId: reg.eventId, id: reg.id, group: newGroup })
    }

    // finally send all the updates to backend
    await actions.saveGroups(reg.eventId, save)
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
      <Typography variant="h6">Osallistujat {eventClass}</Typography>
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
        onDrop={handleDrop({ key: 'reserve', number: registrationsByGroup.reserve.length + 1 })}
      />
      <Typography variant="h6">Peruneet</Typography>
      <DragableDataGrid
        autoHeight
        columns={cancelledColumns}
        hideFooter
        rows={registrationsByGroup.cancelled}
        onSelectionModelChange={handleSelectionModeChange}
        selectionModel={selectedRegistrationId ? [selectedRegistrationId] : []}
        onRowDoubleClick={handleDoubleClick}
        onDrop={handleDrop({ key: 'cancelled', number: registrationsByGroup.cancelled.length + 1 })}
      />
    </DndProvider>
  )
}

function NullComponent() {
  return null
}

export default ClassEntrySelection
