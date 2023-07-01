import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import CheckOutlined from '@mui/icons-material/CheckOutlined'
import DragIndicatorOutlined from '@mui/icons-material/DragIndicatorOutlined'
import EditOutlined from '@mui/icons-material/EditOutlined'
import EuroOutlined from '@mui/icons-material/EuroOutlined'
import EventBusyOutlined from '@mui/icons-material/EventBusyOutlined'
import MarkEmailReadOutlined from '@mui/icons-material/MarkEmailReadOutlined'
import PersonOutline from '@mui/icons-material/PersonOutline'
import Tooltip from '@mui/material/Tooltip'
import { GridActionsCellItem, GridColumns, GridValueGetterParams } from '@mui/x-data-grid'
import { BreedCode, Registration } from 'koekalenteri-shared/model'

import GroupColors from './GroupColors'

export function useClassEntrySelectionColumns(eventDates: Date[], openEditDialog?: (id: string) => void) {
  const { t } = useTranslation()

  return useMemo(() => {
    const entryColumns: GridColumns<Registration> = [
      {
        cellClassName: 'nopad',
        field: 'dates',
        headerName: '',
        width: 56,
        minWidth: 56,
        renderCell: (p) => (
          <>
            <DragIndicatorOutlined />
            <GroupColors dates={eventDates} selected={p.row.dates} />
          </>
        ),
        sortable: false,
      },
      {
        align: 'right',
        cellClassName: 'nopad',
        field: 'number',
        headerAlign: 'right',
        headerClassName: 'nopad',
        headerName: '#',
        width: 20,
        minWidth: 20,
        sortable: false,
        valueGetter: (p) => (p.row.group?.number ? `${p.row.group.number}.` : ''),
      },
      {
        field: 'dog.name',
        headerName: t('dog.name'),
        width: 250,
        flex: 1,
        sortable: false,
        valueGetter: (p: GridValueGetterParams<string, Registration>) => p.row.dog.name,
      },
      {
        field: 'dog.regNo',
        headerName: t('dog.regNo'),
        width: 130,
        sortable: false,
        valueGetter: (p) => p.row.dog.regNo,
      },
      {
        field: 'dob.breed',
        headerName: t('dog.breed'),
        width: 150,
        sortable: false,
        valueGetter: (p: GridValueGetterParams<BreedCode, Registration>) =>
          p.row.dog?.breedCode && p.row.dog?.gender
            ? t(`${p.row.dog.breedCode}.${p.row.dog.gender}`, { ns: 'breedAbbr', defaultValue: p.row.dog.breedCode })
            : '',
      },
      {
        field: 'handler',
        headerName: t('registration.handler'),
        width: 150,
        flex: 1,
        sortable: false,
        valueGetter: (p) => p.row.handler.name,
      },
      {
        field: 'lastEmail',
        headerName: 'Viesti',
        width: 130,
        flex: 1,
        sortable: false,
        valueGetter: (p) => p.row.lastEmail ?? '',
      },
      {
        field: 'icons',
        headerName: '',
        width: 90,
        align: 'center',
        renderCell: (p) => (
          <>
            <Tooltip
              title={`Ilmoittautuja ${p.row.handler.membership ? 'on' : 'ei ole'} järjestävän yhdistyksen jäsen`}
              placement="left"
            >
              <PersonOutline fontSize="small" sx={{ opacity: p.row.handler.membership ? 1 : 0.05 }} />
            </Tooltip>
            <Tooltip
              title={`Ilmoittautuja ${
                p.row.paidAt ? 'on maksanut ilmoittautumisen' : 'ei ole maksanut ilmoittautumista'
              }`}
              placement="left"
            >
              <EuroOutlined fontSize="small" sx={{ opacity: p.row.paidAt ? 1 : 0.05 }} />
            </Tooltip>
            <Tooltip
              title={`Ilmoittautuja ${
                p.row.confirmed
                  ? 'on vahvistanut ottavansa koepaikan vastaan'
                  : 'ei ole vahvistanut ottavansa koepaikkaa vastaan'
              }`}
              placement="left"
            >
              <CheckOutlined fontSize="small" sx={{ opacity: p.row.confirmed ? 1 : 0.05 }} />
            </Tooltip>
            <Tooltip
              title={`Ilmoittautuja ${
                p.row.invitationRead ? 'on kuitannut koekutsun' : 'ei ole kuitannut koekutsua'
              } luetuksi`}
              placement="left"
            >
              <MarkEmailReadOutlined fontSize="small" sx={{ opacity: p.row.invitationRead ? 1 : 0.05 }} />
            </Tooltip>
          </>
        ),
        sortable: false,
      },
      {
        cellClassName: 'nopad',
        field: 'actions',
        type: 'actions',
        headerName: '',
        width: 30,
        minWidth: 30,
        sortable: false,
        getActions: (p) => [
          <GridActionsCellItem
            icon={<EditOutlined fontSize="small" />}
            label={t('edit')}
            onClick={() => openEditDialog?.(p.row.id)}
            showInMenu
          />,
          <GridActionsCellItem
            icon={<EventBusyOutlined fontSize="small" />}
            label={t('withdraw')}
            onClick={() => openEditDialog?.(p.row.id)}
            showInMenu
          />,
        ],
      },
    ]

    const participantColumns: GridColumns<Registration> = [...entryColumns]

    const cancelledColumns: GridColumns<Registration> = [...participantColumns]
    cancelledColumns.splice(cancelledColumns.length - 2, 0, {
      field: 'cancelReason',
      headerName: 'Perumisen syy',
      width: 90,
    })

    return { cancelledColumns, entryColumns, participantColumns }
  }, [eventDates, openEditDialog, t])
}
