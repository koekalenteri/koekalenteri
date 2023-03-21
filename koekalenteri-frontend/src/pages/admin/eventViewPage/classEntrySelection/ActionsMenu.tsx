import { Dispatch, SetStateAction, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EditOutlined, EventBusyOutlined, MenuOutlined } from '@mui/icons-material'
import { IconButton, ListItemIcon, Menu, MenuItem } from '@mui/material'

interface Props {
  id: string
  openEditDialog?: Dispatch<SetStateAction<boolean>>
}

export const ActionsMenu = ({ id, openEditDialog }: Props) => {
  const { t } = useTranslation()
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null)
  const open = Boolean(anchorEl)
  const handleClick = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget)
  }
  const handleClose = () => {
    setAnchorEl(null)
  }
  const handleEdit = () => {
    openEditDialog?.(true)
    handleClose()
  }
  return (
    <>
      <IconButton
        onClick={handleClick}
        size="small"
        aria-controls={open ? 'account-menu' : undefined}
        aria-haspopup="true"
        aria-expanded={open ? 'true' : undefined}
      >
        <MenuOutlined fontSize="small" />
      </IconButton>
      <Menu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        PaperProps={{
          elevation: 0,
          sx: {
            overflow: 'visible',
            filter: 'drop-shadow(0px 2px 8px rgba(0,0,0,0.32))',
            mt: 1.5,
            '& .MuiAvatar-root': {
              width: 32,
              height: 32,
              ml: -0.5,
              mr: 1,
            },
            '&:before': {
              content: '""',
              display: 'block',
              position: 'absolute',
              top: 0,
              right: 14,
              width: 10,
              height: 10,
              bgcolor: 'background.paper',
              transform: 'translateY(-50%) rotate(45deg)',
              zIndex: 0,
            },
          },
        }}
        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
      >
        <MenuItem onClick={handleEdit}>
          <ListItemIcon>
            <EditOutlined fontSize="small" />
          </ListItemIcon>
          {t('edit')}
        </MenuItem>
        <MenuItem onClick={handleClose}>
          <ListItemIcon>
            <EventBusyOutlined fontSize="small" />
          </ListItemIcon>
          {t('withdraw')}
        </MenuItem>
      </Menu>
    </>
  )
}
