import CircularProgress from '@mui/material/CircularProgress'

const LoadingIndicator = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: '50vh' }}>
    <CircularProgress />
  </div>
)

export default LoadingIndicator
