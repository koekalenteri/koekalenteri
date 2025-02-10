import { Suspense, useEffect } from 'react'
import { Outlet, useLocation } from 'react-router'
import Box from '@mui/material/Box'

import { rum } from '../lib/client/rum'

import Banner from './components/Banner'
import Header from './components/Header'
import LoadingIndicator from './components/LoadingIndicator'
import Version from './homePage/Version'

export function HomePage() {
  const location = useLocation()

  useEffect(() => {
    rum()?.recordPageView(location.pathname)
  }, [location])

  return (
    <>
      <Header />
      <Banner />
      <Box component="main">
        <Suspense fallback={<LoadingIndicator />}>
          <Outlet />
        </Suspense>
      </Box>
      <Version />
    </>
  )
}
