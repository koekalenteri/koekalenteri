import { Suspense, useCallback, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import Box from '@mui/material/Box'
import { useRecoilValue } from 'recoil'

import { Path } from '../../routeConfig'
import Header from '../components/Header'
import LoadingIndicator from '../components/LoadingIndicator'
import { SideMenu } from '../components/SideMenu'
import { hasAdminAccessSelector } from '../recoil'

export default function AdminHomePage() {
  const location = useLocation()
  const hasAccess = useRecoilValue(hasAdminAccessSelector)
  const [menuOpen, setMenuOpen] = useState(false)

  const closeMenu = useCallback(() => setMenuOpen(false), [setMenuOpen])
  const toggleMenu = useCallback(() => setMenuOpen(!menuOpen), [setMenuOpen, menuOpen])

  if (!hasAccess) {
    return <Navigate to={Path.login} state={{ from: location }} replace />
  }

  return (
    <>
      <Header toggleMenu={toggleMenu} />
      <Box sx={{ display: 'flex', height: '100%' }}>
        <SideMenu open={menuOpen} onClose={closeMenu} />
        <Box sx={{ p: 1, display: 'flex', flexDirection: 'column', flexGrow: 1, overflow: 'auto', mt: '36px' }}>
          <Suspense fallback={<LoadingIndicator />}>
            <Outlet />
          </Suspense>
        </Box>
      </Box>
    </>
  )
}