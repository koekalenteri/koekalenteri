import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ExpandMore, PersonOutline } from '@mui/icons-material'
import { Menu, MenuItem } from '@mui/material'

import { useUserActions } from '../../../recoil/user/actions'
import AppBarButton from '../AppBarButton'

interface Props {
  userName: string
}

export default function LoggedInUserMenu({ userName }: Props) {
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const { t } = useTranslation()
  const actions = useUserActions()

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLElement>) => setAnchorEl(event.currentTarget),
    [setAnchorEl]
  )
  const handleClose = useCallback(() => setAnchorEl(null), [setAnchorEl])

  return (
    <>
      <AppBarButton onClick={handleClick} startIcon={<PersonOutline />} endIcon={<ExpandMore />}>
        {userName}
      </AppBarButton>
      <Menu anchorEl={anchorEl} open={!!anchorEl} onClose={handleClose} onClick={handleClose}>
        <MenuItem onClick={actions.signOut}>{t('logout')}</MenuItem>
      </Menu>
    </>
  )
}
