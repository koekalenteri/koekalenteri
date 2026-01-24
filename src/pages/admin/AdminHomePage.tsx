import Box from '@mui/material/Box'
import { Suspense, useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router'
import { useRecoilValue } from 'recoil'
import { HEADER_HEIGHT } from '../../assets/Theme'
import Header from '../components/Header'
import LoadingIndicator from '../components/LoadingIndicator'
import { SideMenu } from '../components/SideMenu'
import { hasAdminAccessSelector, useUserActions } from '../recoil'

export default function AdminHomePage() {
  const actions = useUserActions()
  const hasAccess = useRecoilValue(hasAdminAccessSelector)
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  const closeMenu = () => setMenuOpen(false)
  const toggleMenu = () => setMenuOpen(!menuOpen)

  useEffect(() => {
    if (!hasAccess) actions.login()
  }, [actions, hasAccess])

  if (!hasAccess) return null

  return (
    <>
      <Header toggleMenu={toggleMenu} />
      <Box sx={{ display: 'flex', height: '100%' }} minWidth={900}>
        <SideMenu open={menuOpen} onClose={closeMenu} />
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            flexGrow: 1,
            mt: HEADER_HEIGHT,
            overflow: 'auto',
            p: 1,
          }}
        >
          <Suspense fallback={<LoadingIndicator />} key={location.key}>
            <Outlet />
          </Suspense>
        </Box>
      </Box>
    </>
  )
}
