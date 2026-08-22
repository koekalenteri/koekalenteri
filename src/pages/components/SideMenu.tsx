import type { Theme } from '@mui/material'
import type { MigrationResult } from '../../api/migrate'
import Accessibility from '@mui/icons-material/Accessibility'
import EmojiEventsOutlined from '@mui/icons-material/EmojiEventsOutlined'
import Event from '@mui/icons-material/Event'
import HandymanOutlined from '@mui/icons-material/HandymanOutlined'
import Logout from '@mui/icons-material/Logout'
import MailOutline from '@mui/icons-material/MailOutline'
import PersonOutline from '@mui/icons-material/PersonOutline'
import SupervisorAccount from '@mui/icons-material/SupervisorAccount'
import Support from '@mui/icons-material/Support'
import { useMediaQuery } from '@mui/material'
import Box from '@mui/material/Box'
import Divider from '@mui/material/Divider'
import { useAtomValue } from 'jotai'
import { useSnackbar } from 'notistack'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { runMigrations } from '../../api/migrate'
import { HEADER_HEIGHT } from '../../assets/Theme'
import { Path } from '../../routeConfig'
import { isAdminAtom, validIdTokenAtom } from '../state'
import { useUserActions } from '../state/user/actions'
import DrawerItem from './sideMenu/DrawerItem'
import DrawerList from './sideMenu/DrawerList'
import MiniDrawer from './sideMenu/MiniDrawer'

interface Props {
  readonly open?: boolean
  readonly onClose: () => void
}

const formatMigrationResults = (results: MigrationResult[]) =>
  ['Migrations completed', ...results.map(({ count, name }) => `${name}: ${count}`)].join('\n')

export function SideMenu({ open, onClose }: Props) {
  const md = useMediaQuery((theme: Theme) => theme.breakpoints.up('md'))
  const lg = useMediaQuery((theme: Theme) => theme.breakpoints.up('lg'))
  const { t } = useTranslation()
  const actions = useUserActions()
  const isAdmin = useAtomValue(isAdminAtom)
  const token = useAtomValue(validIdTokenAtom)
  const { enqueueSnackbar } = useSnackbar()

  const handleRunMigrations = useCallback(async () => {
    const { data: results } = await runMigrations(token)

    enqueueSnackbar(formatMigrationResults(results), { persist: true, variant: 'success' })
  }, [enqueueSnackbar, token])

  return (
    <MiniDrawer
      variant={md ? 'permanent' : 'temporary'}
      open={lg || open}
      ModalProps={{
        keepMounted: true,
      }}
      onClose={onClose}
    >
      <Box sx={{ height: HEADER_HEIGHT, minHeight: HEADER_HEIGHT }} />
      <DrawerList>
        <DrawerItem to={Path.admin.events} onClick={onClose} text={t('events')} icon={<Event />} />
        <DrawerItem to={Path.admin.judges} onClick={onClose} text={t('judges')} icon={<Accessibility />} />
        <DrawerItem to={Path.admin.officials} onClick={onClose} text={t('officials')} icon={<SupervisorAccount />} />
        <DrawerItem to={Path.admin.users} onClick={onClose} text={t('users')} icon={<PersonOutline />} />
      </DrawerList>
      <Divider />
      <DrawerList>
        <DrawerItem text={t('logout')} icon={<Logout />} onClick={async () => actions.signOut()} />
      </DrawerList>
      <Box sx={{ flex: 1, flexGrow: 1, minHeight: '32px' }} />
      {isAdmin && (
        <>
          <Divider>admin section</Divider>
          <DrawerList>
            <DrawerItem to={Path.admin.orgs} onClick={onClose} text={t('organizations')} icon={<Support />} />
            <DrawerItem
              to={Path.admin.eventTypes}
              onClick={onClose}
              text={t('eventTypes')}
              icon={<EmojiEventsOutlined />}
            />
            <DrawerItem
              to={Path.admin.emailTemplates}
              onClick={onClose}
              text={t('emailTemplates')}
              icon={<MailOutline />}
            />
            <DrawerItem onClick={handleRunMigrations} text="Run migrations" icon={<HandymanOutlined />} />
          </DrawerList>
        </>
      )}
    </MiniDrawer>
  )
}
