import CircularProgress from '@mui/material/CircularProgress'
import { forwardRef } from 'react'

const LoadingIndicator = forwardRef((_props, ref) => (
  <div style={{ alignItems: 'center', display: 'flex', height: '100%', justifyContent: 'center', minHeight: '50vh' }}>
    <CircularProgress ref={ref} />
  </div>
))

export default LoadingIndicator
