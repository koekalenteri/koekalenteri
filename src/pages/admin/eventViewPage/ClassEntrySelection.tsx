import type { GridCallbackDetails, GridCellParams, GridRowSelectionModel, MuiEvent } from '@mui/x-data-grid'
import type { Dispatch, SetStateAction } from 'react'
import type React from 'react'
import type { SetterOrUpdater } from 'recoil'
import type {
  DogEvent,
  EventClassState,
  EventState,
  Registration,
  RegistrationGroup,
  RegistrationGroupInfo,
} from '../../../types'
import type { DragItem } from './classEntrySelection/dropableDataGrid/DragableRow'

import { useCallback, useMemo, useState } from 'react'
import { DndProvider } from 'react-dnd'
import { HTML5Backend } from 'react-dnd-html5-backend'
import { useTranslation } from 'react-i18next'
import Box from '@mui/material/Box'
import Checkbox from '@mui/material/Checkbox'
import FormControlLabel from '@mui/material/FormControlLabel'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { isSameDay } from 'date-fns'
import { useConfirm } from 'material-ui-confirm'
import { useSnackbar } from 'notistack'

import { useAdminEventRegistrationDates } from '../../../hooks/useAdminEventRegistrationDates'
import { useAdminEventRegistrationGroups } from '../../../hooks/useAdminEventRegistrationGroups'
import { eventRegistrationDateKey } from '../../../lib/event'
import { getRegistrationGroupKey, GROUP_KEY_CANCELLED, GROUP_KEY_RESERVE } from '../../../lib/registration'
import { uniqueDate } from '../../../lib/utils'
import { NullComponent } from '../../components/NullComponent'
import StyledDataGrid from '../../components/StyledDataGrid'
import { useAdminRegistrationActions } from '../recoil/registrations/actions'

import DragableDataGrid from './classEntrySelection/DropableDataGrid'
import GroupHeader from './classEntrySelection/GroupHeader'
import NoRowsOverlay from './classEntrySelection/NoRowsOverlay'
import { useClassEntrySelectionColumns } from './classEntrySelection/useClassEntrySectionColumns'

interface Props {
  readonly event: DogEvent
  readonly eventClass: string
  readonly registrations?: Registration[]
  readonly setOpen?: Dispatch<SetStateAction<boolean>>
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
    available: any // TODO: use proper type
    group: any // TODO: use proper type
  }
}

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
    async (id: string) => {
      const reg = registrations.find((r) => r.id === id)
      if (!reg) return
      const regs = registrations.filter((r) => getRegistrationGroupKey(r) === GROUP_KEY_CANCELLED && r.id !== id)
      const group: RegistrationGroup = { key: GROUP_KEY_CANCELLED, number: regs.length + 1 }
      await actions.saveGroups(reg.eventId, [{ eventId: reg.eventId, id, group }])
    },
    [actions, registrations]
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

  const reserveNotNotified = useMemo(
    () => !registrationsByGroup.reserve.some((r) => r.reserveNotified),
    [registrationsByGroup.reserve]
  )
  const canArrangeReserve = reserveNotNotified || unlockArrange

  const handleDrop = (group: RegistrationGroup) => async (item: DragItem) => {
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
      try {
        await confirm({
          title: 'Olet lisäämässä koirakkoa osallistujiin',
          description: `Kun koirakko on lisätty, koirakolle lähtee vahvistusviesti koepaikasta${extra}. Oletko varma että haluat lisätä tämän koirakon osallistujiin?`,
          confirmationText: 'Lisää osallistujiin',
          cancellationText: t('cancel'),
        })
      } catch {
        return
      }
    }

    // make sure the dropped registration is selected, so its intuitive to user
    setSelectedRegistrationId?.(reg.id)

    const save: RegistrationGroupInfo[] = []
    // determine all the other registrations in group
    const regs = registrations.filter((r) => r.group?.key === group.key && r.id !== reg.id)

    // by default, assume new location is last in group
    const newGroup = { ...group, number: regs.length + 1 }

    if (group.key === GROUP_KEY_CANCELLED || (group.key === GROUP_KEY_RESERVE && !canArrangeReserve)) {
      if (reg.group?.key === group.key) {
        // user can not re-order items in cancelled or reserve groups
        delete item.targetGroupKey
        return
      }
      save.push({ eventId: reg.eventId, id: reg.id, group: newGroup, cancelled: newGroup.key === GROUP_KEY_CANCELLED })
    } else if (item.targetGroupKey && item.targetGroupKey === item.groupKey) {
      const targetIndex = item.targetIndex ?? 0
      // if moving down, substract 1 (bevause this reg is not included in regs)
      const directionModifier = item.index < targetIndex ? -1 : 0
      // modifier based on if hovered above or below the target
      const hoverModifier = item.position === 'before' ? -0.5 : 0.5
      // final position
      const pos = targetIndex + directionModifier
      // take the number from registration in that position
      newGroup.number = regs[pos]?.group?.number ?? 0

      // moved as last, set number to last + 1
      if (item.position === 'after' && pos > 0 && newGroup.number === 0) {
        newGroup.number = (regs[regs.length - 1]?.group?.number ?? 0) + 1
      }
      // put the registration in correct position
      regs.splice(pos, 0, reg)
      // save using a 0.5 modifier based on position. backend will fix the numbers.
      save.push({
        eventId: reg.eventId,
        id: reg.id,
        group: { ...newGroup, number: newGroup.number + hoverModifier },
      })
    } else if (item.groupKey !== newGroup.key) {
      console.log('heihei', item)
      // move from list to another (always last)
      save.push({ eventId: reg.eventId, id: reg.id, group: newGroup, cancelled: newGroup.key === GROUP_KEY_CANCELLED })
    }

    // finally send all the updates to backend
    if (save.length) {
      await actions.saveGroups(reg.eventId, save)
    }
  }

  const handleReject = (group: RegistrationGroup) => (item: DragItem) => {
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
      console.log(reg.group?.key, group.key, reg.dates)
      enqueueSnackbar(`Koira ${reg.dog.name} ei ole ilmoittautunut tähän ryhmään`, { variant: 'error' })
    }
  }

  const handleSelectionModeChange = useCallback(
    (selection: GridRowSelectionModel, details: GridCallbackDetails) => {
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
          message: 'Rekisterinumero kopioitu',
          variant: 'info',
          autoHideDuration: 1000,
          anchorOrigin: {
            horizontal: 'center',
            vertical: 'bottom',
          },
        })
      }
    },
    [enqueueSnackbar]
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
      {groups.map((group) => (
        <DragableDataGrid
          autoHeight
          canDrop={(item) => {
            return state !== 'started' || item?.groupKey === GROUP_KEY_RESERVE
          }}
          flex={registrationsByGroup[group.key]?.length}
          key={group.key}
          group={group.key}
          columns={participantColumns}
          hideFooter
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
      ))}
      <Stack direction="row" justifyContent="space-between" gap={2}>
        <Typography variant="h6">Ilmoittautuneet</Typography>
        <FormControlLabel
          control={<Checkbox checked={unlockArrange} />}
          disabled={reserveNotNotified}
          disableTypography
          label="Järjestä varasijoja, jo lähetetyistä varasijailmoituksista huolimatta"
          onChange={(e, checked) => setUnlockArrange(checked)}
          sx={{ fontSize: '0.82rem', lineHeight: 1, maxWidth: 240 }}
        />
      </Stack>
      <DragableDataGrid
        autoHeight
        canDrop={(item) =>
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
        hideFooter
        rows={registrationsByGroup.reserve}
        onRowSelectionModelChange={handleSelectionModeChange}
        rowSelectionModel={selectedRegistrationId ? [selectedRegistrationId] : []}
        onCellClick={handleCellClick}
        onRowDoubleClick={handleDoubleClick}
        onDrop={handleDrop({ key: 'reserve', number: registrationsByGroup.reserve.length + 1 })}
        onReject={handleReject({ key: 'reserve', number: 0 })}
      />
      <Typography variant="h6">Peruneet</Typography>
      <DragableDataGrid
        autoHeight
        canDrop={(item) => item?.groupKey !== GROUP_KEY_CANCELLED}
        columns={cancelledColumns}
        slotProps={{
          row: {
            groupKey: GROUP_KEY_CANCELLED,
          },
        }}
        hideFooter
        rows={registrationsByGroup.cancelled}
        onRowSelectionModelChange={handleSelectionModeChange}
        rowSelectionModel={selectedRegistrationId ? [selectedRegistrationId] : []}
        onCellClick={handleCellClick}
        onRowDoubleClick={handleDoubleClick}
        onDrop={handleDrop({ key: GROUP_KEY_CANCELLED, number: registrationsByGroup.cancelled.length + 1 })}
      />
    </DndProvider>
  )
}

export default ClassEntrySelection
