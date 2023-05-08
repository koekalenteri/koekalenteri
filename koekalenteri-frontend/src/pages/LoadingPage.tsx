import { useEffect } from 'react'
import { Box, CircularProgress } from '@mui/material'

export function LoadingPage() {
  useEffect(() => {
    // Dirty hack to work around some forever hanging suspense
    const timer = setTimeout(() => window.location.reload(), 3000)
    return () => clearTimeout(timer)
  })

  return (
    <Box
      sx={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        flexDirection: 'column',
        minHeight: '100vh',
        backgroundColor: 'background.default',
      }}
    >
      <CircularProgress />
    </Box>
  )
}
