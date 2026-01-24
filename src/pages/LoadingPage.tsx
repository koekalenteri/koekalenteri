import Box from '@mui/material/Box'
import CircularProgress from '@mui/material/CircularProgress'

export function LoadingPage() {
  return (
    <Box
      sx={{
        alignItems: 'center',
        backgroundColor: 'background.default',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        minHeight: '100vh',
      }}
    >
      <CircularProgress />
    </Box>
  )
}
