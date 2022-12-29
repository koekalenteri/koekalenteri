import { Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import { Box } from '@mui/material'

import Version from '../components/Version'

import Banner from "./components/Banner"
import Header from './components/Header'
import LoadingIndicator from './components/LoadingIndicator'

export function HomePage() {
  return (
    <>
      <Header />
      <Banner />
      <Box>
        <Suspense fallback={<LoadingIndicator />}>
          <Outlet />
        </Suspense>
      </Box>
      <Version />
    </>
  )
}
