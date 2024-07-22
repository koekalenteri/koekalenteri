import { forwardRef } from 'react'
import CircularProgress from '@mui/material/CircularProgress'

const LoadingIndicator = forwardRef((props, ref) => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', minHeight: '50vh' }}>
    <CircularProgress ref={ref} />
  </div>
))

export default LoadingIndicator
