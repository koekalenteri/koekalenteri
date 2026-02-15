import Box from '@mui/material/Box'
import { ErrorInfo } from './components/ErrorInfo'

export const ErrorPage = () => {
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
      <ErrorInfo />
    </Box>
  )
}
