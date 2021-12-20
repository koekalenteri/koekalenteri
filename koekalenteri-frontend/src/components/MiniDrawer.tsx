import { MouseEventHandler, ReactNode } from 'react';
import { CSSObject, Drawer, List, ListItem, ListItemIcon, ListItemText, styled, Theme } from '@mui/material';

const drawerWidth = '256px';

const openedMixin = (theme: Theme): CSSObject => ({
  backgroundColor: theme.palette.grey[100],
  width: drawerWidth,
  transition: theme.transitions.create('width', {
    easing: theme.transitions.easing.sharp,
    duration: theme.transitions.duration.enteringScreen,
  }),
  overflowX: 'hidden',
});

const closedMixin = (theme: Theme): CSSObject => ({
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

export const MiniDrawer = styled(Drawer, {
  shouldForwardProp: (prop: string) => prop !== 'open'
})(
  ({ theme, open }) => ({
    width: drawerWidth,
    flexShrink: 0,
    whiteSpace: 'nowrap',
    boxSizing: 'border-box',
    ...(open && {
      ...openedMixin(theme),
      '& .MuiDrawer-paper': openedMixin(theme),
    }),
    ...(!open && {
      ...closedMixin(theme),
      '& .MuiDrawer-paper': closedMixin(theme),
    }),
  }),
);

export function DrawerList({children}: {children: ReactNode}) {
  return (
    <List>
      {children}
    </List>
  );
}

export function DrawerItem({ text, icon, onClick, mini }: {text: string, icon: ReactNode, onClick?: MouseEventHandler, mini?: boolean}) {
  return (
    <ListItem button key={text} onClick={onClick}>
      <ListItemIcon>{icon}</ListItemIcon>
      <ListItemText primary={text} hidden={mini} />
    </ListItem>
  );
}
