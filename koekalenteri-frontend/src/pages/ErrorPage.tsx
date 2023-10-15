import Box from '@mui/material/Box'

import { ErrorInfo } from './components/ErrorInfo'

export const ErrorPage = () => {
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
      <ErrorInfo />
    </Box>
  )
}
