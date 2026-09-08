import type { CSSObject, Theme } from '@mui/material'
import { styled } from '@mui/material'
import Drawer from '@mui/material/Drawer'

const drawerWidth = '256px'

const fullMixin = (theme: Theme): CSSObject => ({
  backgroundColor: theme.palette.grey[100],
  overflowX: 'hidden',
  transition: theme.transitions.create('width', {
    duration: theme.transitions.duration.enteringScreen,
    easing: theme.transitions.easing.sharp,
  }),
  width: drawerWidth,
})

const miniMixin = (theme: Theme): CSSObject => ({
  backgroundColor: theme.palette.grey[100],
  overflowX: 'hidden',
  transition: theme.transitions.create('width', {
    duration: theme.transitions.duration.leavingScreen,
    easing: theme.transitions.easing.sharp,
  }),
  width: `calc(${theme.spacing(7)} + 1px)`,
  [theme.breakpoints.up('sm')]: {
    width: `calc(${theme.spacing(7)} + 1px)`,
  },
})

/**
 * Collapsed, only the icons belong in the drawer. The labels used to fall outside it on their own --
 * a 56px `ListItemIcon` pushed them past the 57px width -- but MUI v9 narrowed that icon slot to
 * 36px and the first few pixels of every label started showing through. Hide them, and the divider's
 * caption with them, instead of relying on a library default to clip them.
 */
const miniPaperMixin = (theme: Theme): CSSObject => ({
  ...miniMixin(theme),
  '& .MuiDivider-wrapper': {
    display: 'none',
  },
  '& .MuiListItemButton-root': {
    justifyContent: 'center',
  },
  '& .MuiListItemIcon-root': {
    justifyContent: 'center',
    minWidth: 0,
  },
  '& .MuiListItemText-root': {
    display: 'none',
  },
})

const MiniDrawer = styled(Drawer)(({ theme, variant, open }) => {
  const mini = variant === 'permanent' && !open
  return {
    boxSizing: 'border-box',
    flexShrink: 0,
    whiteSpace: 'nowrap',
    width: drawerWidth,
    ...(!mini && {
      ...fullMixin(theme),
      '& .MuiDrawer-paper': fullMixin(theme),
    }),
    ...(mini && {
      ...miniMixin(theme),
      '& .MuiDrawer-paper': miniPaperMixin(theme),
    }),
    '& .MuiButtonBase-root:hover': {
      backgroundColor: theme.palette.background.hover,
    },
    '& a': {
      color: 'inherit',
      textDecoration: 'none',
    },
    '& a.active.MuiButtonBase-root': {
      backgroundColor: theme.palette.background.selected,
    },
  }
})

export default MiniDrawer
