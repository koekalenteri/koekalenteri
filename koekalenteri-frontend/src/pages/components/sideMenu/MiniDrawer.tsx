import { CSSObject, styled, Theme } from '@mui/material'
import Drawer from '@mui/material/Drawer'

const drawerWidth = '256px'

const fullMixin = (theme: Theme): CSSObject => ({
  backgroundColor: theme.palette.grey[100],
  width: drawerWidth,
  transition: theme.transitions.create('width', {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.enteringScreen,
  }),
  overflowX: 'hidden',
})

const miniMixin = (theme: Theme): CSSObject => ({
  backgroundColor: theme.palette.grey[100],
  transition: theme.transitions.create('width', {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.leavingScreen,
  }),
  overflowX: 'hidden',
  width: `calc(${theme.spacing(7)} + 1px)`,
  [theme.breakpoints.up('sm')]: {
    width: `calc(${theme.spacing(7)} + 1px)`,
  },
})

const MiniDrawer = styled(Drawer)(({ theme, variant, open }) => {
  const mini = variant === 'permanent' && !open
  return {
    width: drawerWidth,
    flexShrink: 0,
    whiteSpace: 'nowrap',
    boxSizing: 'border-box',
    ...(!mini && {
      ...fullMixin(theme),
      '& .MuiDrawer-paper': fullMixin(theme),
    }),
    ...(mini && {
      ...miniMixin(theme),
      '& .MuiDrawer-paper': miniMixin(theme),
    }),
    '& a': {
      textDecoration: 'none',
      color: 'inherit',
    },
    '& a.active > .MuiButtonBase-root': {
      backgroundColor: theme.palette.background.selected,
    },
    '& .MuiButtonBase-root:hover': {
      backgroundColor: theme.palette.background.hover,
    },
  }
})

export default MiniDrawer
