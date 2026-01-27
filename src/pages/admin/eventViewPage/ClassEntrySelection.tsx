import type { Dispatch, SetStateAction } from 'react'
import type { SetterOrUpdater } from 'recoil'
import type { CustomCost, DogEvent, EventClassState, EventState, Registration, RegistrationDate } from '../../../types'
import type { DragItem, RegistrationWithGroups } from './classEntrySelection/types'

import { Fragment, useMemo, useState } from 'react'
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import withScrolling from 'react-dnd-scrolling'
import { useTranslation } from 'react-i18next'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useConfirm } from 'material-ui-confirm'
import { enqueueSnackbar } from 'notistack'

import { useAdminEventRegistrationDates } from '../../../hooks/useAdminEventRegistrationDates'
import { useAdminEventRegistrationGroups } from '../../../hooks/useAdminEventRegistrationGroups'
import { eventRegistrationDateKey } from '../../../lib/event'
import { getRegistrationGroupKey, GROUP_KEY_CANCELLED, GROUP_KEY_RESERVE } from '../../../lib/registration'
import { NullComponent } from '../../components/NullComponent'
import StyledDataGrid from '../../components/StyledDataGrid'
import { useAdminRegistrationActions } from '../recoil/registrations/actions'

import DroppableDataGrid from './classEntrySelection/DroppableDataGrid'
import GroupHeader from './classEntrySelection/GroupHeader'
import {
  buildRegistrationsByGroup,
  buildSelectedAdditionalCostsByGroup,
  buildSelectedAdditionalCostsTotal,
} from './classEntrySelection/helpers'
import NoRowsOverlay from './classEntrySelection/NoRowsOverlay'
import UnlockArrange from './classEntrySelection/UnlockArrange'
import { useClassEntrySelectionColumns } from './classEntrySelection/useClassEntrySelectionColumns'
import { useDnDHandlers } from './classEntrySelection/useDnDHandlers'
import { useEntryHandlers } from './classEntrySelection/useEntryHandlers'
import MoveToGroupDialog from './MoveToGroupDialog'
import MoveToPositionDialog from './MoveToPositionDialog'
import SendMessageDialog from './SendMessageDialog'

interface Props {
  readonly event: DogEvent
  readonly eventClass: string
  readonly registrations?: Registration[]
  readonly setOpen?: Dispatch<SetStateAction<boolean>>
  readonly setCancelOpen?: Dispatch<SetStateAction<boolean>>
  readonly setRefundOpen?: Dispatch<SetStateAction<boolean>>
  readonly selectedRegistrationId?: string
  readonly setSelectedRegistrationId?: SetterOrUpdater<string | undefined>
  readonly state?: EventClassState | EventState
}

declare module '@mui/x-data-grid' {
  interface ToolbarPropsOverrides {
    available: RegistrationDate[]
    group: RegistrationDate
  }
}

const ScrollDiv = withScrolling('div')

const ClassEntrySelection = ({
  event,
  eventClass,
  registrations = [],
  setOpen,
  setCancelOpen,
  setRefundOpen,
  selectedRegistrationId,
  setSelectedRegistrationId,
  state,
}: Props) => {
  const confirm = useConfirm()
  const { t } = useTranslation()
  const actions = useAdminRegistrationActions(event.id)
  const [unlockArrange, setUnlockArrange] = useState(false)
  const [moveToGroupDialogOpen, setMoveToGroupDialogOpen] = useState(false)
  const [moveToPositionDialogOpen, setMoveToPositionDialogOpen] = useState(false)
  const [sendMessageDialogOpen, setSendMessageDialogOpen] = useState(false)
  const [selectedForAction, setSelectedForAction] = useState<Registration | undefined>()

  // Extract entry handlers to dedicated hook
  const { handleOpen, handleCancel, handleRefund, handleSelectionModeChange, handleCellClick, handleDoubleClick } =
    useEntryHandlers({
      setOpen,
      setCancelOpen,
      setRefundOpen,
      setSelectedRegistrationId,
      registrations,
    })

  const dates = useAdminEventRegistrationDates(event, eventClass)

  const groups = useAdminEventRegistrationGroups(event, eventClass)

  // Callback functions for kebab menu actions
  const callbacks = useMemo(
    () => ({
      openEditDialog: handleOpen,
      cancelRegistration: handleCancel,
      refundRegistration: handleRefund,
      moveToGroup: (id: string) => {
        const reg = registrations.find((r) => r.id === id)
        if (reg) {
          setSelectedForAction(reg)
          setMoveToGroupDialogOpen(true)
        }
      },
      moveToPosition: (id: string) => {
        const reg = registrations.find((r) => r.id === id)
        if (reg) {
          setSelectedForAction(reg)
          setMoveToPositionDialogOpen(true)
        }
      },
      moveToReserve: async (id: string) => {
        const reg = registrations.find((r) => r.id === id)
        if (!reg) return
        const reserveRegs = registrations.filter((r) => getRegistrationGroupKey(r) === GROUP_KEY_RESERVE)
        try {
          await actions.saveGroups(event.id, [
            {
              eventId: event.id,
              id,
              group: { key: GROUP_KEY_RESERVE, number: reserveRegs.length + 1 },
              cancelled: false,
            },
          ])
          enqueueSnackbar(t('registration.movedToReserve'), { variant: 'success' })
        } catch (error) {
          console.error('Failed to move to reserve:', error)
          enqueueSnackbar(t('registration.moveToReserveFailed'), { variant: 'error' })
        }
      },
      moveToParticipants: (id: string) => {
        const reg = registrations.find((r) => r.id === id)
        if (reg) {
          setSelectedForAction(reg)
          setMoveToGroupDialogOpen(true)
        }
      },
      sendMessage: (id: string) => {
        const reg = registrations.find((r) => r.id === id)
        if (reg) {
          setSelectedForAction(reg)
          setSendMessageDialogOpen(true)
        }
      },
    }),
    [registrations, handleOpen, handleCancel, handleRefund, actions, event.id]
  )

  const { cancelledColumns, entryColumns, participantColumns } = useClassEntrySelectionColumns(dates, event, callbacks)

  const registrationsByGroup: Record<string, RegistrationWithGroups[]> = useMemo(
    () => buildRegistrationsByGroup(registrations, groups),
    [groups, registrations]
  )

  const selectedAdditionalCostsByGroup: Record<string, Array<{ cost: CustomCost; count: number }>> = useMemo(
    () => buildSelectedAdditionalCostsByGroup(event, groups, registrationsByGroup),
    [event, groups, registrationsByGroup]
  )

  const selectedAdditionalCostsTotal = useMemo(
    () => buildSelectedAdditionalCostsTotal(groups, selectedAdditionalCostsByGroup),
    [groups, selectedAdditionalCostsByGroup]
  )

  const reserveNotNotified = useMemo(
    () => !registrationsByGroup.reserve.some((r) => r.reserveNotified),
    [registrationsByGroup.reserve]
  )
  const canArrangeReserve = reserveNotNotified || unlockArrange

  // Extract DnD handlers to dedicated hook
  const { handleDrop, handleReject } = useDnDHandlers({
    registrations,
    state,
    canArrangeReserve,
    confirm,
    setSelectedRegistrationId,
    saveGroups: actions.saveGroups,
    onCancelOpen: handleCancel,
  })

  return (
    <DndProvider backend={HTML5Backend}>
      <Typography variant="h6">
        Osallistujat {eventClass} {state ? ' - ' + t(`event.states.${state}`) : ''}
      </Typography>
      {/* column headers only */}
      <Box sx={{ height: 40, flexShrink: 0, width: '100%', overflow: 'hidden' }}>
        <StyledDataGrid
          columns={participantColumns}
          initialState={{ density: 'compact' }}
          disableColumnMenu
          hideFooter
          rows={[]}
          slots={{
            noRowsOverlay: NullComponent,
          }}
        />
      </Box>
      <ScrollDiv
        style={{
          overflowY: 'auto',
          display: 'flex',
          flexGrow: 1,
          flexDirection: 'column',
          width: '100%',
          height: '100%',
        }}
      >
        {groups.map((group) => (
          <Fragment key={group.key}>
            <DroppableDataGrid
              canDrop={(item: DragItem | undefined) => {
                return state !== 'started' || item?.groupKey === GROUP_KEY_RESERVE
              }}
              flex={registrationsByGroup[group.key]?.length}
              key={group.key}
              group={group.key}
              columns={participantColumns}
              hideFooter={(registrationsByGroup[group.key] ?? []).length < 101}
              columnHeaderHeight={0}
              rows={registrationsByGroup[group.key] ?? []}
              onRowSelectionModelChange={handleSelectionModeChange}
              rowSelectionModel={selectedRegistrationId ? [selectedRegistrationId] : []}
              onCellClick={handleCellClick}
              onRowDoubleClick={handleDoubleClick}
              slots={{
                toolbar: GroupHeader,
                noRowsOverlay: NoRowsOverlay,
              }}
              slotProps={{
                toolbar: {
                  available: groups,
                  group: group,
                },
                row: {
                  groupKey: group.key,
                },
              }}
              onDrop={handleDrop(group)}
              onReject={handleReject(group)}
            />
            {(selectedAdditionalCostsByGroup[group.key] ?? []).length > 0 ? (
              <Stack key={group.key + 'add'} direction="row" justifyContent="flex-end" px={1}>
                <Typography variant="caption">
                  {selectedAdditionalCostsByGroup[group.key]
                    .map((sac) => `${sac.cost.description.fi} x ${sac.count}`)
                    .join(', ')}
                </Typography>
              </Stack>
            ) : null}
          </Fragment>
        ))}
        {selectedAdditionalCostsTotal ? (
          <Stack direction="row" justifyContent="flex-end" px={1}>
            <Typography variant="caption" sx={{ borderTop: '1px solid #ccc' }}>
              {selectedAdditionalCostsTotal}
            </Typography>
          </Stack>
        ) : null}

        <Stack direction="row" justifyContent="space-between" gap={2}>
          <Typography variant="h6">Ilmoittautuneet</Typography>
          <UnlockArrange checked={unlockArrange} disabled={reserveNotNotified} onChange={setUnlockArrange} />
        </Stack>
        <DroppableDataGrid
          canDrop={(item: DragItem | undefined) =>
            (state !== 'picked' && item?.groupKey !== GROUP_KEY_RESERVE) ||
            item?.groupKey === GROUP_KEY_CANCELLED ||
            (item?.groupKey === GROUP_KEY_RESERVE && canArrangeReserve)
          }
          columns={entryColumns}
          slotProps={{
            row: {
              groupKey: 'reserve',
            },
          }}
          hideFooter={registrationsByGroup.reserve.length < 101}
          rows={registrationsByGroup.reserve}
          onRowSelectionModelChange={handleSelectionModeChange}
          rowSelectionModel={selectedRegistrationId ? [selectedRegistrationId] : []}
          onCellClick={handleCellClick}
          onRowDoubleClick={handleDoubleClick}
          onDrop={handleDrop({ key: 'reserve', number: registrationsByGroup.reserve.length + 1 })}
          onReject={handleReject({ key: 'reserve', number: 0 })}
        />
        <Typography variant="h6">Peruneet</Typography>
        <DroppableDataGrid
          canDrop={(item: DragItem | undefined) => item?.groupKey !== GROUP_KEY_CANCELLED}
          columns={cancelledColumns}
          slotProps={{
            row: {
              groupKey: GROUP_KEY_CANCELLED,
            },
          }}
          hideFooter={registrationsByGroup.cancelled.length < 101}
          rows={registrationsByGroup.cancelled}
          onRowSelectionModelChange={handleSelectionModeChange}
          rowSelectionModel={selectedRegistrationId ? [selectedRegistrationId] : []}
          onCellClick={handleCellClick}
          onRowDoubleClick={handleDoubleClick}
          onDrop={handleDrop({ key: GROUP_KEY_CANCELLED, number: registrationsByGroup.cancelled.length + 1 })}
        />
      </ScrollDiv>

      {selectedForAction && (
        <>
          <MoveToGroupDialog
            open={moveToGroupDialogOpen}
            onClose={() => setMoveToGroupDialogOpen(false)}
            registration={selectedForAction}
            event={event}
            groups={groups}
            onMove={async (groupKey) => {
              const group = groups.find((g) => eventRegistrationDateKey(g) === groupKey)
              if (!group) return

              const groupRegs = registrations.filter((r) => getRegistrationGroupKey(r) === groupKey)

              await actions.saveGroups(event.id, [
                {
                  eventId: event.id,
                  id: selectedForAction.id,
                  group: {
                    key: groupKey,
                    number: groupRegs.length + 1,
                    date: group.date,
                    time: group.time,
                  },
                  cancelled: false,
                },
              ])
            }}
          />

          <MoveToPositionDialog
            open={moveToPositionDialogOpen}
            onClose={() => setMoveToPositionDialogOpen(false)}
            registration={selectedForAction}
            maxPosition={
              getRegistrationGroupKey(selectedForAction) === GROUP_KEY_RESERVE
                ? (groups[0] && registrationsByGroup[groups[0].key]?.length) || 100
                : registrationsByGroup[getRegistrationGroupKey(selectedForAction)]?.length || 100
            }
            onMove={async (position) => {
              const currentGroupKey = getRegistrationGroupKey(selectedForAction)

              // If moving from reserve to participants
              if (currentGroupKey === GROUP_KEY_RESERVE) {
                const targetGroup = groups[0] // Use first participant group
                if (!targetGroup) return

                await actions.saveGroups(event.id, [
                  {
                    eventId: event.id,
                    id: selectedForAction.id,
                    group: {
                      key: targetGroup.key,
                      number: position,
                      date: targetGroup.date,
                      time: targetGroup.time,
                    },
                    cancelled: false,
                  },
                ])
              } else {
                // Moving within current group (participants or cancelled)
                const currentGroup = selectedForAction.group
                if (!currentGroup) return

                await actions.saveGroups(event.id, [
                  {
                    eventId: event.id,
                    id: selectedForAction.id,
                    group: {
                      ...currentGroup,
                      number: position,
                    },
                    cancelled: false,
                  },
                ])
              }
            }}
          />

          <SendMessageDialog
            event={event as any}
            open={sendMessageDialogOpen}
            onClose={() => setSendMessageDialogOpen(false)}
            registrations={[selectedForAction]}
          />
        </>
      )}
    </DndProvider>
  )
}

export default ClassEntrySelection
