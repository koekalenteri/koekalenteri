import { Suspense, useCallback, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuthenticator } from '@aws-amplify/ui-react'
import { Box, Toolbar } from '@mui/material'

import { Header, SideMenu } from '../../layout'
import { Path } from '../../routeConfig'

export function AdminHomePage() {
  const location = useLocation()
  const { route } = useAuthenticator(context => [context.route])
  const [menuOpen, setMenuOpen] = useState(false)

  const closeMenu = useCallback(() => setMenuOpen(false), [setMenuOpen])
  const toggleMenu = useCallback(() => setMenuOpen(!menuOpen), [setMenuOpen, menuOpen])

  return (route !== 'authenticated' ? <Navigate to={Path.login} state={{ from: location }} replace /> :
    <>
      <Header title={'Admin'} toggleMenu={toggleMenu} />
      <Box sx={{ display: 'flex', height: '100%' }}>
        <SideMenu open={menuOpen} onClose={closeMenu} />
        <Box sx={{ p: 1, display: 'flex', flexDirection: 'column', flexGrow: 1, overflow: 'auto' }}>
          <Toolbar variant="dense" />
          <Suspense fallback={<div>Loading...</div>}>
            <Outlet />
          </Suspense>
        </Box>
      </Box>
    </>
  )
}
