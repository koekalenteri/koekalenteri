import CircularProgress from '@mui/material/CircularProgress'

const LoadingIndicator = () => {
  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <CircularProgress />
    </div>
  )
}

export default LoadingIndicator
