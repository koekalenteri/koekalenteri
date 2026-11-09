import Box from '@mui/material/Box'
import { Suspense, useState } from 'react'
import { Outlet, useLocation } from 'react-router'
import { HEADER_HEIGHT } from '../../assets/Theme'
import { useAdminSubscription } from '../../hooks/useAdminSubscription'
import { AdminAccessGuard } from '../components/AdminAccessGuard'
import Header from '../components/Header'
import LoadingIndicator from '../components/LoadingIndicator'
import { SideMenu } from '../components/SideMenu'

export default function AdminHomePage() {
  return (
    <AdminAccessGuard>
      <AdminShell />
    </AdminAccessGuard>
  )
}

/** The header, the menu and the admin page; opens the admin subscription only for a user with access. */
function AdminShell() {
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)

  const closeMenu = () => setMenuOpen(false)
  const toggleMenu = () => setMenuOpen(!menuOpen)

  useAdminSubscription()

  return (
    <>
      <Header toggleMenu={toggleMenu} />
      <Box sx={{ display: 'flex', height: '100%' }}>
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
