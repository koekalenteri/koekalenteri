import { useTranslation } from 'react-i18next'
import { Theme, useMediaQuery } from '@mui/material'
import { GridColumns } from '@mui/x-data-grid'
import { User } from 'koekalenteri-shared/model'
import { useRecoilState, useRecoilValue } from 'recoil'

import StyledDataGrid from '../components/StyledDataGrid'

import FullPageFlex from './components/FullPageFlex'
import { QuickSearchToolbar } from './components/QuickSearchToolbar'
import { filteredUsersSelector, userFilterAtom } from './recoil/user'

export default function UsersPage() {
  const large = useMediaQuery((theme: Theme) => theme.breakpoints.up('md'))
  const [searchText, setSearchText] = useRecoilState(userFilterAtom)
  const { t } = useTranslation()
  const officials = useRecoilValue(filteredUsersSelector)

  const columns: GridColumns<User> = [
    {
      field: 'name',
      flex: 1,
      headerName: t('name'),
    },
    {
      field: 'id',
      flex: 0,
      headerName: t('id'),
      width: 80,
    },
    {
      field: 'location',
      flex: 0,
      headerName: t('contact.city'),
      width: 120,
    },
    {
      field: 'phone',
      flex: 0,
      headerName: t('contact.phone'),
      width: 150,
    },
    {
      field: 'email',
      flex: 1,
      headerName: t('contact.email'),
      minWidth: 150,
    },
    {
      field: 'district',
      flex: 1,
      headerName: t('district'),
    },
  ]

  return (
    <>
      <FullPageFlex>
        <StyledDataGrid
          columns={columns}
          columnVisibilityModel={{
            district: large,
            eventTypes: large,
            id: large,
            location: large,
          }}
          components={{ Toolbar: QuickSearchToolbar }}
          componentsProps={{
            toolbar: {
              value: searchText,
              onChange: (event: React.ChangeEvent<HTMLInputElement>) => setSearchText(event.target.value),
              clearSearch: () => setSearchText(''),
            },
          }}
          rows={officials}
        />
      </FullPageFlex>
    </>
  )
}
