import { keyframes } from '@mui/material'

export const recentUpdateFlash = keyframes`
  0% {
    background-color: rgba(255, 215, 64, 0.55);
  }
  60% {
    background-color: rgba(255, 215, 64, 0.2);
  }
  100% {
    background-color: transparent;
  }
`

export const recentUpdateSx = {
  '@media (prefers-reduced-motion: reduce)': {
    animation: 'none',
    backgroundColor: 'background.ok',
  },
  animation: `${recentUpdateFlash} 2s ease-out`,
}
