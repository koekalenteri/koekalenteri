import type { Dispatch, SetStateAction } from 'react'
import type { CustomCost, DogEvent, EventClassState, EventState, Registration, RegistrationDate } from '../../../types'
import type { DragItem, RegistrationWithGroups } from './classEntrySelection/types'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useAtomValue } from 'jotai'
import { useConfirm } from 'material-ui-confirm'
import { enqueueSnackbar } from 'notistack'
import { Fragment, useCallback, useMemo, useState } from 'react'
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import withScrolling from 'react-dnd-scrolling'
import { useTranslation } from 'react-i18next'
import { putStartNumbers } from '../../../api/event'
import { useAdminEventRegistrationDates } from '../../../hooks/useAdminEventRegistrationDates'
import { useAdminEventRegistrationGroups } from '../../../hooks/useAdminEventRegistrationGroups'
import { errorSnackbarOptions } from '../../../lib/client/snackbar'
import { rowSelectionModel } from '../../../lib/datagrid'
import { eventRegistrationDateKey, isEventOver } from '../../../lib/event'
import {
  GROUP_KEY_CANCELLED,
  GROUP_KEY_RESERVE,
  getRegistrationClass,
  getRegistrationGroupKey,
  isRegistrationClass,
} from '../../../lib/registration'
import { isConfirmedEvent } from '../../../lib/typeGuards'
import { NullComponent } from '../../components/NullComponent'
import StyledDataGrid from '../../components/StyledDataGrid'
import { idTokenAtom } from '../../state'
import { useAdminRegistrationActions } from '../state/registrations/actions'
import DroppableDataGrid from './classEntrySelection/DroppableDataGrid'
import GroupHeader from './classEntrySelection/GroupHeader'
import {
  buildDrawnNumberOptions,
  buildMoveToGroupChange,
  buildMoveToPositionDays,
  buildMoveToPositionGroupChange,
  buildMoveToPositionOptions,
  buildRegistrationsByGroup,
  buildSelectedAdditionalCostsByGroup,
  buildSelectedAdditionalCostsTotal,
  getDrawnNumberDays,
  getNouGroupRuleIssues,
  isDrawnNumberMove,
} from './classEntrySelection/helpers'
import { confirmMoveToParticipants } from './classEntrySelection/moveConfirmation'
import NoRowsOverlay from './classEntrySelection/NoRowsOverlay'
import UnlockArrange from './classEntrySelection/UnlockArrange'
import { useClassEntrySelectionColumns } from './classEntrySelection/useClassEntrySelectionColumns'
import { useDnDHandlers } from './classEntrySelection/useDnDHandlers'
import { useEntryHandlers } from './classEntrySelection/useEntryHandlers'
import InternalNotesDialog from './InternalNotesDialog'
import MoveToGroupDialog from './MoveToGroupDialog'
import MoveToPositionDialog from './MoveToPositionDialog'
import SendMessageDialog from './SendMessageDialog'

interface Props {
  readonly event: DogEvent
  /** The class this list covers, or undefined for the whole trial - the WT tab (KOE-912). */
  readonly eventClass?: string
  readonly registrations?: Registration[]
  readonly setOpen?: Dispatch<SetStateAction<boolean>>
  readonly setCancelOpen?: Dispatch<SetStateAction<boolean>>
  readonly setRefundOpen?: Dispatch<SetStateAction<boolean>>
  readonly selectedRegistrationId?: string
  readonly setSelectedRegistrationId?: (update: SetStateAction<string | undefined>) => void
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
  const token = useAtomValue(idTokenAtom)
  const actions = useAdminRegistrationActions(event.id)
  const [unlockArrange, setUnlockArrange] = useState(false)
  const [moveToGroupDialogOpen, setMoveToGroupDialogOpen] = useState(false)
  const [moveToPositionDialogOpen, setMoveToPositionDialogOpen] = useState(false)
  const [sendMessageDialogOpen, setSendMessageDialogOpen] = useState(false)
  const [internalNotesDialogOpen, setInternalNotesDialogOpen] = useState(false)
  const [pendingMoveId, setPendingMoveId] = useState<string>()
  const [selectedForAction, setSelectedForAction] = useState<Registration | undefined>()
  const actionsDisabled = isEventOver(event) || (state ? ['ended', 'completed'].includes(state) : false)
  const movementDisabled = actionsDisabled

  // Extract entry handlers to dedicated hook
  const { handleOpen, handleCancel, handleRefund, handleSelectionModeChange, handleCellClick, handleDoubleClick } =
    useEntryHandlers({
      registrations,
      setCancelOpen,
      setOpen,
      setRefundOpen,
      setSelectedRegistrationId,
    })

  const dates = useAdminEventRegistrationDates(event, eventClass)

  const groups = useAdminEventRegistrationGroups(event, eventClass)

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

  // Once the day's draw has begun, moving to a start place enters the number itself (KOE-1273). A
  // reserve dog has no day yet, so it names the day first; a day still undrawn takes the working order.
  const drawnDays = useMemo(() => getDrawnNumberDays(registrations), [registrations])
  const moveToPositionDays = useMemo(
    () => buildMoveToPositionDays(selectedForAction, groups, drawnDays),
    [drawnDays, groups, selectedForAction]
  )
  const [moveToPositionDayKey, setMoveToPositionDayKey] = useState<string>()
  const moveToPositionDay = moveToPositionDays.find((day) => day.key === moveToPositionDayKey) ?? moveToPositionDays[0]
  const assignNumberMove = moveToPositionDay ? moveToPositionDay.drawn : isDrawnNumberMove(selectedForAction, drawnDays)
  const moveToPositionGroups = useMemo(
    () => (moveToPositionDay ? groups.filter((group) => group.key === moveToPositionDay.key) : groups),
    [groups, moveToPositionDay]
  )
  const moveToPositionOptions = useMemo(() => {
    if (assignNumberMove && selectedForAction) {
      return buildDrawnNumberOptions(selectedForAction, registrations, moveToPositionDay?.date)
    }
    return buildMoveToPositionOptions(selectedForAction, moveToPositionGroups, registrationsByGroup)
  }, [
    assignNumberMove,
    moveToPositionDay,
    moveToPositionGroups,
    registrations,
    registrationsByGroup,
    selectedForAction,
  ])

  const openActionDialog = useCallback(
    (
      id: string,
      openDialog: Dispatch<SetStateAction<boolean>>,
      nextSelectedForAction = registrations.find((r) => r.id === id)
    ) => {
      if (!nextSelectedForAction) return

      setSelectedForAction(nextSelectedForAction)
      setMoveToPositionDayKey(undefined)
      openDialog(true)
    },
    [registrations]
  )
  const openMoveDialog = useCallback(
    (id: string, openDialog: Dispatch<SetStateAction<boolean>>) => {
      if (movementDisabled) return
      openActionDialog(id, openDialog)
    },
    [movementDisabled, openActionDialog]
  )

  const canMoveReserveToPosition = useMemo(() => {
    return groups.some((group) => (registrationsByGroup[group.key]?.length ?? 0) > 0)
  }, [groups, registrationsByGroup])

  const canMoveParticipantToPosition = useCallback(
    (registration: Registration) => {
      const currentGroupKey = getRegistrationGroupKey(registration)
      if (currentGroupKey === GROUP_KEY_RESERVE || currentGroupKey === GROUP_KEY_CANCELLED) return true

      const allowedGroupKeys = new Set(registration.dates?.map((date) => eventRegistrationDateKey(date)) ?? [])
      const allowedParticipantGroups = groups.filter((group) => allowedGroupKeys.has(eventRegistrationDateKey(group)))
      const positions = allowedParticipantGroups.flatMap((group) =>
        (registrationsByGroup[group.key] ?? [])
          .map((reg) => reg.group?.number)
          .filter((number): number is number => Number.isInteger(number))
      )
      const uniqueSortedPositions = [...new Set(positions)].sort((a, b) => a - b)

      return !(uniqueSortedPositions.length === 1 && uniqueSortedPositions[0] === registration.group?.number)
    },
    [groups, registrationsByGroup]
  )

  // Callback functions for kebab menu actions
  const callbacks = useMemo(
    () => ({
      actionsDisabled,
      cancelRegistration: (id: string) => {
        if (actionsDisabled) return
        handleCancel(id)
      },
      canMoveReserveToPosition,
      canMoveToPosition: canMoveParticipantToPosition,
      editInternalNotes: (id: string) => {
        if (actionsDisabled) return
        openActionDialog(id, setInternalNotesDialogOpen)
      },
      movementDisabled,
      moveToGroup: (id: string) => openMoveDialog(id, setMoveToGroupDialogOpen),
      moveToParticipants: (id: string) => openMoveDialog(id, setMoveToGroupDialogOpen),
      moveToPosition: (id: string) => openMoveDialog(id, setMoveToPositionDialogOpen),
      moveToReserve: async (id: string) => {
        if (movementDisabled) return
        const reg = registrations.find((r) => r.id === id)
        if (!reg) return
        setPendingMoveId(id)
        try {
          await actions.saveGroups(event.id, [
            {
              group: { key: GROUP_KEY_RESERVE },
              id,
            },
          ])
          enqueueSnackbar(t('registration.movedToReserve', { name: reg.dog.name }), { variant: 'success' })
        } catch (error) {
          console.error('Failed to move to reserve:', error)
          enqueueSnackbar(t('registration.moveToReserveFailed'), errorSnackbarOptions)
        } finally {
          setPendingMoveId(undefined)
        }
      },
      openEditDialog: (id: string) => {
        if (actionsDisabled) return
        handleOpen(id)
      },
      pendingMoveId,
      refundRegistration: handleRefund,
      sendMessage: (id: string) => {
        if (actionsDisabled) return
        openActionDialog(id, setSendMessageDialogOpen)
      },
    }),
    [
      registrations,
      openActionDialog,
      openMoveDialog,
      handleOpen,
      handleCancel,
      handleRefund,
      actions,
      event.id,
      pendingMoveId,
      canMoveReserveToPosition,
      canMoveParticipantToPosition,
      t,
      movementDisabled,
      actionsDisabled,
    ]
  )

  const { cancelledColumns, entryColumns, participantColumns } = useClassEntrySelectionColumns(
    dates,
    event,
    callbacks,
    registrations,
    !eventClass
  )

  const reserveNotNotified = useMemo(
    () => !registrationsByGroup.reserve.some((r) => r.reserveNotified),
    [registrationsByGroup.reserve]
  )
  const canArrangeReserve = !movementDisabled && (reserveNotNotified || unlockArrange)

  // Extract DnD handlers to dedicated hook
  const { handleDrop, handleReject } = useDnDHandlers({
    canArrangeReserve,
    confirm,
    disabled: movementDisabled,
    onCancelOpen: handleCancel,
    registrations,
    saveGroups: actions.saveGroups,
    setSelectedRegistrationId,
    state,
  })
  const stateText = state ? t(`event.states.${state}`) : ''

  /**
   * The kebab menu raises a dog the same way dragging it does, and the dog is mailed its place the
   * same way too — so both dialogs ask first, through the shared prompt (KOE-289).
   */
  const confirmPlaceMessage = useCallback(
    (registration: Registration, toGroupKey: string) =>
      confirmMoveToParticipants({
        confirm,
        dogName: registration.dog.name,
        fromGroupKey: getRegistrationGroupKey(registration),
        state,
        t,
        toGroupKey,
      }),
    [confirm, state, t]
  )

  const handleMoveToGroup = useCallback(
    async (groupKey: string): Promise<false | undefined> => {
      if (!selectedForAction || movementDisabled) return
      const change = buildMoveToGroupChange(selectedForAction, groupKey, groups)
      if (!change) return
      if (!(await confirmPlaceMessage(selectedForAction, change.group.key))) return false

      setPendingMoveId(selectedForAction.id)
      try {
        await actions.saveGroups(event.id, [change])
      } finally {
        setPendingMoveId(undefined)
      }
    },
    [actions, confirmPlaceMessage, event.id, groups, movementDisabled, selectedForAction]
  )

  /** The day's draw has begun, so the chosen place becomes the dog's own start number (KOE-1273). */
  const handleAssignStartNumber = useCallback(
    async (registration: Registration, position: number): Promise<false | undefined> => {
      // A reserve dog first takes its place on the day; only then is the number its own.
      const dayChange = moveToPositionDay
        ? buildMoveToGroupChange(registration, moveToPositionDay.key, groups)
        : undefined
      if (moveToPositionDay && !dayChange) return
      if (dayChange && !(await confirmPlaceMessage(registration, dayChange.group.key))) return false

      setPendingMoveId(registration.id)
      try {
        if (dayChange && (await actions.saveGroups(event.id, [dayChange])) === false) {
          throw new Error('Moving the registration to the day failed')
        }
        // On the whole-trial tab the numbers belong to the dog's own class (KOE-912).
        const numberClass = eventClass ?? getRegistrationClass(registration)
        await putStartNumbers(
          event.id,
          {
            ...(isRegistrationClass(numberClass) ? { eventClass: numberClass } : {}),
            numbers: [{ id: registration.id, startNumber: position }],
          },
          token ?? ''
        )
      } finally {
        setPendingMoveId(undefined)
      }
    },
    [actions, confirmPlaceMessage, event.id, eventClass, groups, moveToPositionDay, token]
  )

  const handleMoveToPosition = useCallback(
    async (position: number): Promise<false | undefined> => {
      if (!selectedForAction || movementDisabled) return
      if (assignNumberMove) return handleAssignStartNumber(selectedForAction, position)

      const change = buildMoveToPositionGroupChange(
        selectedForAction,
        position,
        moveToPositionGroups,
        registrationsByGroup
      )
      if (!change) return
      if (!(await confirmPlaceMessage(selectedForAction, change.group.key))) return false

      setPendingMoveId(selectedForAction.id)
      try {
        await actions.saveGroups(event.id, [change])
      } finally {
        setPendingMoveId(undefined)
      }
    },
    [
      actions,
      assignNumberMove,
      confirmPlaceMessage,
      event.id,
      handleAssignStartNumber,
      movementDisabled,
      moveToPositionGroups,
      registrationsByGroup,
      selectedForAction,
    ]
  )

  return (
    <DndProvider backend={HTML5Backend}>
      <Typography variant="h6">
        Osallistujat {eventClass ?? t('eventManagement.allClasses')} {stateText ? ` - ${stateText}` : ''}
      </Typography>
      {/* column headers only */}
      <Box sx={{ flexShrink: 0, height: 40, overflow: 'hidden', width: '100%' }}>
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
          display: 'flex',
          flexDirection: 'column',
          flexGrow: 1,
          height: '100%',
          overflowY: 'auto',
          width: '100%',
        }}
      >
        {groups.map((group) => {
          const issues = getNouGroupRuleIssues(event.eventType, registrationsByGroup[group.key] ?? [])

          return (
            <Fragment key={group.key}>
              <DroppableDataGrid
                canDrop={(item: DragItem | undefined) => {
                  return !movementDisabled && (state !== 'started' || item?.groupKey === GROUP_KEY_RESERVE)
                }}
                flex={registrationsByGroup[group.key]?.length}
                key={group.key}
                group={group.key}
                columns={participantColumns}
                hideFooter={(registrationsByGroup[group.key] ?? []).length < 101}
                columnHeaderHeight={0}
                rows={registrationsByGroup[group.key] ?? []}
                onRowSelectionModelChange={handleSelectionModeChange}
                rowSelectionModel={rowSelectionModel(selectedRegistrationId ? [selectedRegistrationId] : [])}
                onCellClick={handleCellClick}
                onRowDoubleClick={actionsDisabled ? undefined : handleDoubleClick}
                slots={{
                  noRowsOverlay: NoRowsOverlay,
                  toolbar: GroupHeader,
                }}
                slotProps={{
                  row: {
                    draggable: !movementDisabled,
                    groupKey: group.key,
                  },
                  toolbar: {
                    available: groups,
                    group: group,
                  },
                }}
                onDrop={handleDrop(group)}
                onReject={handleReject(group)}
              />
              {issues && (issues.singleGender || issues.genderBalance || issues.duplicateHandlers.length > 0) ? (
                <Stack
                  sx={{
                    gap: 1,
                    my: 1,
                  }}
                >
                  {issues.singleGender ? (
                    <Alert severity="warning">
                      {t(`eventManagement.groupRules.singleGender.${issues.maleCount > 0 ? 'male' : 'female'}`)}
                    </Alert>
                  ) : null}
                  {issues.genderBalance ? (
                    <Alert severity="warning">
                      {t('eventManagement.groupRules.genderBalance', {
                        femaleCount: issues.femaleCount,
                        maleCount: issues.maleCount,
                      })}
                    </Alert>
                  ) : null}
                  {issues.duplicateHandlers.map((handler) => (
                    <Alert key={handler.email} severity="warning">
                      {t('eventManagement.groupRules.duplicateHandler', handler)}
                    </Alert>
                  ))}
                </Stack>
              ) : null}
              {(selectedAdditionalCostsByGroup[group.key] ?? []).length > 0 ? (
                <Stack
                  key={`${group.key}add`}
                  direction="row"
                  sx={{
                    justifyContent: 'flex-end',
                    px: 1,
                  }}
                >
                  <Typography variant="caption">
                    {selectedAdditionalCostsByGroup[group.key]
                      .map((sac) => `${sac.cost.description.fi} x ${sac.count}`)
                      .join(', ')}
                  </Typography>
                </Stack>
              ) : null}
            </Fragment>
          )
        })}
        {selectedAdditionalCostsTotal ? (
          <Stack
            direction="row"
            sx={{
              justifyContent: 'flex-end',
              px: 1,
            }}
          >
            <Typography variant="caption" sx={{ borderTop: '1px solid #ccc' }}>
              {selectedAdditionalCostsTotal}
            </Typography>
          </Stack>
        ) : null}

        <Stack
          direction="row"
          sx={{
            gap: 2,
            justifyContent: 'space-between',
          }}
        >
          <Typography variant="h6">Ilmoittautuneet</Typography>
          <UnlockArrange
            checked={unlockArrange}
            disabled={movementDisabled || reserveNotNotified}
            onChange={setUnlockArrange}
          />
        </Stack>
        <DroppableDataGrid
          canDrop={(item: DragItem | undefined) =>
            !movementDisabled &&
            ((state !== 'picked' && item?.groupKey !== GROUP_KEY_RESERVE) ||
              item?.groupKey === GROUP_KEY_CANCELLED ||
              (item?.groupKey === GROUP_KEY_RESERVE && canArrangeReserve))
          }
          columns={entryColumns}
          slotProps={{
            row: {
              draggable: !movementDisabled,
              groupKey: 'reserve',
            },
          }}
          hideFooter={registrationsByGroup.reserve.length < 101}
          rows={registrationsByGroup.reserve}
          onRowSelectionModelChange={handleSelectionModeChange}
          rowSelectionModel={rowSelectionModel(selectedRegistrationId ? [selectedRegistrationId] : [])}
          onCellClick={handleCellClick}
          onRowDoubleClick={actionsDisabled ? undefined : handleDoubleClick}
          onDrop={handleDrop({ key: 'reserve', number: registrationsByGroup.reserve.length + 1 })}
          onReject={handleReject({ key: 'reserve', number: 0 })}
        />
        <Typography variant="h6">Peruneet</Typography>
        <DroppableDataGrid
          canDrop={(item: DragItem | undefined) => !movementDisabled && item?.groupKey !== GROUP_KEY_CANCELLED}
          columns={cancelledColumns}
          slotProps={{
            row: {
              draggable: !movementDisabled,
              groupKey: GROUP_KEY_CANCELLED,
            },
          }}
          hideFooter={registrationsByGroup.cancelled.length < 101}
          rows={registrationsByGroup.cancelled}
          onRowSelectionModelChange={handleSelectionModeChange}
          rowSelectionModel={rowSelectionModel(selectedRegistrationId ? [selectedRegistrationId] : [])}
          onCellClick={handleCellClick}
          onRowDoubleClick={actionsDisabled ? undefined : handleDoubleClick}
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
            onMove={handleMoveToGroup}
          />

          <MoveToPositionDialog
            open={moveToPositionDialogOpen}
            onClose={() => setMoveToPositionDialogOpen(false)}
            registration={selectedForAction}
            positions={moveToPositionOptions}
            assignNumber={assignNumberMove}
            days={moveToPositionDays}
            selectedDay={moveToPositionDay?.key}
            onSelectDay={setMoveToPositionDayKey}
            onMove={handleMoveToPosition}
          />

          {isConfirmedEvent(event) && (
            <SendMessageDialog
              event={event}
              open={sendMessageDialogOpen}
              onClose={() => setSendMessageDialogOpen(false)}
              registrations={[selectedForAction]}
            />
          )}

          <InternalNotesDialog
            open={internalNotesDialogOpen}
            onClose={() => setInternalNotesDialogOpen(false)}
            registration={selectedForAction}
            onSave={(internalNotes) =>
              actions.putInternalNotes(selectedForAction.eventId, selectedForAction.id, internalNotes)
            }
          />
        </>
      )}
    </DndProvider>
  )
}

export default ClassEntrySelection
