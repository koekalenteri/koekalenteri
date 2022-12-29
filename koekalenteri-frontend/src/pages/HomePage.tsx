import { Outlet } from 'react-router-dom'
import { Box } from '@mui/material'

import Version from '../components/Version'
import { Banner,  Header } from '../layout'

export function HomePage() {
  return (
    <>
      <Header />
      <Banner />
      <Box>
        <Outlet />
      </Box>
      <Version />
    </>
  )
}
