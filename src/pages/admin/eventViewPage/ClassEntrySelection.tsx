import type { GridCallbackDetails, GridCellParams, GridRowSelectionModel, MuiEvent } from '@mui/x-data-grid'
import type { Dispatch, SetStateAction } from 'react'
import type React from 'react'
import type { SetterOrUpdater } from 'recoil'
import type {
  CustomCost,
  DogEvent,
  EventClassState,
  EventState,
  Registration,
  RegistrationDate,
  RegistrationGroup,
} from '../../../types'
import type { DragItem } from './classEntrySelection/types'

import { Fragment, useCallback, useMemo, useState } from 'react'
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import withScrolling from 'react-dnd-scrolling'
import { useTranslation } from 'react-i18next'
import Box from '@mui/material/Box'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { isSameDay } from 'date-fns'
import { useConfirm } from 'material-ui-confirm'
import { useSnackbar } from 'notistack'

import { useAdminEventRegistrationDates } from '../../../hooks/useAdminEventRegistrationDates'
import { useAdminEventRegistrationGroups } from '../../../hooks/useAdminEventRegistrationGroups'
import { rum } from '../../../lib/client/rum'
import { eventRegistrationDateKey } from '../../../lib/event'
import { getRegistrationGroupKey, GROUP_KEY_CANCELLED, GROUP_KEY_RESERVE } from '../../../lib/registration'
import { uniqueDate } from '../../../lib/utils'
import { NullComponent } from '../../components/NullComponent'
import StyledDataGrid from '../../components/StyledDataGrid'
import { useAdminRegistrationActions } from '../recoil/registrations/actions'

import { determineChangesFromDrop } from './classEntrySelection/dnd'
import DroppableDataGrid from './classEntrySelection/DroppableDataGrid'
import GroupHeader from './classEntrySelection/GroupHeader'
import NoRowsOverlay from './classEntrySelection/NoRowsOverlay'
import UnlockArrange from './classEntrySelection/UnlockArrange'
import { useClassEntrySelectionColumns } from './classEntrySelection/useClassEntrySelectionColumns'

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

interface RegistrationWithGroups extends Registration {
  groups: string[]
  dropGroups: string[]
}

declare module '@mui/x-data-grid' {
  interface ToolbarPropsOverrides {
    available: RegistrationDate[]
    group: RegistrationDate
  }
}

const ScrollDiv = withScrolling('div')

const listKey = (reg: Registration, eventGroups: RegistrationGroup[]) => {
  const key = getRegistrationGroupKey(reg)

  if (key === GROUP_KEY_CANCELLED) return GROUP_KEY_CANCELLED

  if (eventGroups.find((eg) => eg.key === key)) {
    return key
  }

  return GROUP_KEY_RESERVE
}

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
  const { enqueueSnackbar } = useSnackbar()
  const actions = useAdminRegistrationActions(event.id)
  const [unlockArrange, setUnlockArrange] = useState(false)

  const handleOpen = useCallback(
    (id: string) => {
      setSelectedRegistrationId?.(id)
      setOpen?.(true)
    },
    [setOpen, setSelectedRegistrationId]
  )

  const handleCancel = useCallback(
    (id: string) => {
      setSelectedRegistrationId?.(id)
      setCancelOpen?.(true)
    },
    [setCancelOpen, setSelectedRegistrationId]
  )

  const handleRefund = useCallback(
    async (id: string) => {
      setSelectedRegistrationId?.(id)
      setRefundOpen?.(true)
    },
    [setRefundOpen, setSelectedRegistrationId]
  )

  const dates = useAdminEventRegistrationDates(event, eventClass)

  const { cancelledColumns, entryColumns, participantColumns } = useClassEntrySelectionColumns(
    dates,
    event,
    handleOpen,
    handleCancel,
    handleRefund
  )

  const groups = useAdminEventRegistrationGroups(event, eventClass)

  const registrationsByGroup: Record<string, RegistrationWithGroups[]> = useMemo(() => {
    const byGroup: Record<string, RegistrationWithGroups[]> = { cancelled: [], reserve: [] }
    for (const reg of registrations) {
      const key = listKey(reg, groups)
      const regDates = uniqueDate(reg.dates.map((rd) => rd.date))
      byGroup[key] = byGroup[key] ?? [] // make sure the array exists
      byGroup[key].push({
        ...reg,
        groups: reg.dates.map((rd) => eventRegistrationDateKey(rd)),
        dropGroups: groups.filter((g) => regDates.find((d) => !g.date || isSameDay(g.date, d))).map((g) => g.key),
      })
    }
    for (const regs of Object.values(byGroup)) {
      regs.sort((a, b) => (a.group?.number || 999) - (b.group?.number || 999))
    }
    return byGroup
  }, [groups, registrations])

  const selectedAdditionalCostsByGroup: Record<string, Array<{ cost: CustomCost; count: number }>> = useMemo(() => {
    if (typeof event.cost === 'number') return {}

    const costs = event.cost.optionalAdditionalCosts
    if (!costs) return {}

    const result: Record<string, Array<{ cost: CustomCost; count: number }>> = {}

    groups.forEach((g) => {
      result[g.key] = []
      const regs = registrationsByGroup[g.key] ?? []
      costs.forEach((cost, i) => {
        const count = regs.reduce((acc, r) => acc + (r.optionalCosts?.includes(i) ? 1 : 0), 0)
        if (count > 0) result[g.key].push({ cost, count })
      })
    })

    return result
  }, [groups, event.cost, registrationsByGroup])

  const selectedAdditionalCostsTotal = useMemo(() => {
    const totals = new Map<CustomCost, number>()
    let count = 0
    groups.forEach((g) => {
      const selected = selectedAdditionalCostsByGroup[g.key] ?? []
      selected.forEach((sac) => {
        const acc = totals.get(sac.cost) ?? 0
        totals.set(sac.cost, acc + sac.count)
        count++
      })
    })
    if (count <= 1) return ''
    return Array.from(totals.entries().map(([cost, count]) => `${cost.description.fi} x ${count}`)).join(', ')
  }, [groups, selectedAdditionalCostsByGroup])

  const reserveNotNotified = useMemo(
    () => !registrationsByGroup.reserve.some((r) => r.reserveNotified),
    [registrationsByGroup.reserve]
  )
  const canArrangeReserve = reserveNotNotified || unlockArrange

  const handleDrop = useCallback(
    (group: RegistrationGroup) => async (item: DragItem) => {
      const reg = registrations.find((r) => r.id === item.id)
      if (!reg) {
        return
      }

      if (
        (state === 'picked' || state === 'invited') &&
        group.key !== GROUP_KEY_CANCELLED &&
        group.key !== GROUP_KEY_RESERVE &&
        ((item.targetGroupKey && item.targetGroupKey !== group.key) || item.groupKey !== group.key)
      ) {
        const extra = state === 'invited' ? ' sekä koekutsu' : ''
        const { confirmed } = await confirm({
          title: `Olet lisäämässä koiraa ${reg.dog.name} osallistujiin`,
          description: `Kun koirakko on lisätty, koirakolle lähtee vahvistusviesti koepaikasta${extra}. Oletko varma että haluat lisätä koiran ${reg.dog.name} osallistujiin?`,
          confirmationText: 'Lisää osallistujiin',
          cancellationText: t('cancel'),
        })
        if (!confirmed) return
      }

      // make sure the dropped registration is selected, so its intuitive to user
      setSelectedRegistrationId?.(reg.id)

      // determine all the other registrations in group
      const regs = registrations.filter((r) => r.group?.key === group.key && r.id !== reg.id)
      // determine changes
      const save = determineChangesFromDrop(item, group, reg, regs, canArrangeReserve)

      // send all the updates to backend
      if (save.length) {
        if (save.length === 1 && save[0].cancelled) handleCancel(save[0].id)
        else await actions.saveGroups(reg.eventId, save)
      }
    },
    [registrations, state, confirm, t, setSelectedRegistrationId, canArrangeReserve, handleCancel, actions]
  )

  const handleReject = useCallback(
    (group: RegistrationGroup) => (item: DragItem) => {
      const reg = registrations.find((r) => r.id === item.id)
      if (!reg) return
      if (getRegistrationGroupKey(reg) === group.key) {
        if (group.key === GROUP_KEY_RESERVE) {
          enqueueSnackbar(`Varasijalla olevia koiria ei voi enää järjestellä, kun varasijailmoituksia on lähetetty`, {
            variant: 'info',
          })
        }
        return
      }
      if (state === 'picked' && group.key === GROUP_KEY_RESERVE) {
        enqueueSnackbar(`Kun koepaikat on vahvistettu, ei koirakkoa voi enää siirtää osallistujista varasijalle.`, {
          variant: 'warning',
        })
      } else {
        rum()?.recordEvent('dnd-group-rejected', {
          eventId: reg.eventId,
          registrationId: reg.id,
          targetGroup: group.key,
          sourceGroup: reg.group?.key,
          regGroups: reg.dates.map((rd) => eventRegistrationDateKey(rd)).join(', '),
          dropGroups: item.groups.join(', '),
        })
        enqueueSnackbar(`Koira ${reg.dog.name} ei ole ilmoittautunut tähän ryhmään`, { variant: 'error' })
      }
    },
    [registrations, state, enqueueSnackbar]
  )

  const handleSelectionModeChange = useCallback(
    (selection: GridRowSelectionModel, _details: GridCallbackDetails) => {
      const value = typeof selection[0] === 'string' ? selection[0] : undefined
      if (value) {
        const reg = registrations.find((r) => r.id === value)
        setSelectedRegistrationId?.(reg?.id)
      }
    },
    [registrations, setSelectedRegistrationId]
  )

  const handleCellClick = useCallback(
    async (params: GridCellParams, event: MuiEvent<React.MouseEvent>) => {
      if (params.field === 'dog.regNo') {
        event.defaultMuiPrevented = true
        await navigator.clipboard.writeText(params.value as string)
        enqueueSnackbar({
          message: t('registration.regNoCopied', 'Rekisterinumero kopioitu'),
          variant: 'info',
          autoHideDuration: 1000,
          anchorOrigin: {
            horizontal: 'center',
            vertical: 'bottom',
          },
        })
      }
    },
    [enqueueSnackbar, t]
  )

  const handleDoubleClick = useCallback(() => setOpen?.(true), [setOpen])

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
    </DndProvider>
  )
}

export default ClassEntrySelection
