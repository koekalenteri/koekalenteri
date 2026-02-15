import type { Dispatch, SetStateAction } from 'react'
import type { SetterOrUpdater } from 'recoil'
import type { CustomCost, DogEvent, EventClassState, EventState, Registration, RegistrationDate } from '../../../types'
import type { DragItem, RegistrationWithGroups } from './classEntrySelection/types'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useConfirm } from 'material-ui-confirm'
import { Fragment, useMemo, useState } from 'react'
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import withScrolling from 'react-dnd-scrolling'
import { useTranslation } from 'react-i18next'
import { useAdminEventRegistrationDates } from '../../../hooks/useAdminEventRegistrationDates'
import { useAdminEventRegistrationGroups } from '../../../hooks/useAdminEventRegistrationGroups'
import { GROUP_KEY_CANCELLED, GROUP_KEY_RESERVE } from '../../../lib/registration'
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

  const { cancelledColumns, entryColumns, participantColumns } = useClassEntrySelectionColumns(
    dates,
    event,
    handleOpen,
    handleCancel,
    handleRefund
  )

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

  const reserveNotNotified = useMemo(
    () => !registrationsByGroup.reserve.some((r) => r.reserveNotified),
    [registrationsByGroup.reserve]
  )
  const canArrangeReserve = reserveNotNotified || unlockArrange

  // Extract DnD handlers to dedicated hook
  const { handleDrop, handleReject } = useDnDHandlers({
    canArrangeReserve,
    confirm,
    onCancelOpen: handleCancel,
    registrations,
    saveGroups: actions.saveGroups,
    setSelectedRegistrationId,
    state,
  })

  return (
    <DndProvider backend={HTML5Backend}>
      <Typography variant="h6">
        Osallistujat {eventClass} {state ? ` - ${t(`event.states.${state}`)}` : ''}
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
                noRowsOverlay: NoRowsOverlay,
                toolbar: GroupHeader,
              }}
              slotProps={{
                row: {
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
            {(selectedAdditionalCostsByGroup[group.key] ?? []).length > 0 ? (
              <Stack key={`${group.key}add`} direction="row" justifyContent="flex-end" px={1}>
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
    </DndProvider>
  )
}

export default ClassEntrySelection
