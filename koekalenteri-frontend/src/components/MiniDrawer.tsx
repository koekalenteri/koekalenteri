import { MouseEventHandler, ReactNode } from 'react';
import { CSSObject, Drawer, List, ListItem, ListItemIcon, ListItemText, styled, Theme, Tooltip } from '@mui/material';

const drawerWidth = '256px';

const fullMixin = (theme: Theme): CSSObject => ({
  backgroundColor: theme.palette.grey[100],
  width: drawerWidth,
  transition: theme.transitions.create('width', {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.enteringScreen,
  }),
  overflowX: 'hidden',
});

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
});

export const MiniDrawer = styled(Drawer)(
  ({ theme, variant, open }) => {
    const mini = variant === 'permanent' && !open;
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
        color: 'inherit'
      },
      '& a.active > .MuiButtonBase-root': {
        backgroundColor: theme.palette.background.selected
      },
      '& .MuiButtonBase-root:hover': {
        backgroundColor: theme.palette.background.hover
      }
    }
  }
);

export function DrawerList({children}: {children: ReactNode}) {
  return (
    <List>
      {children}
    </List>
  );
}

export function DrawerItem({ text, icon, onClick }: {text: string, icon: ReactNode, onClick?: MouseEventHandler}) {
  return (
    <ListItem button key={text} onClick={onClick}>
      <Tooltip title={text} arrow><ListItemIcon aria-label={text}>{icon}</ListItemIcon></Tooltip>
      <ListItemText primary={text} />
    </ListItem>
  );
}
