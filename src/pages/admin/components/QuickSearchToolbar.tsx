import type { ReactNode } from 'react'

import { useTranslation } from 'react-i18next'
import Clear from '@mui/icons-material/Clear'
import Search from '@mui/icons-material/Search'
import IconButton from '@mui/material/IconButton'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import { GridToolbarColumnsButton, GridToolbarContainer } from '@mui/x-data-grid'

// augment the props for the toolbar slot
declare module '@mui/x-data-grid' {
  interface ToolbarPropsOverrides {
    columnSelector?: boolean
  }
}

export interface QuickSearchToolbarProps {
  readonly clearSearch: () => void
  readonly onChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  readonly value: string
  readonly columnSelector?: boolean
  readonly children?: ReactNode
}

export function QuickSearchToolbar(props: QuickSearchToolbarProps) {
  const { t } = useTranslation()

  return (
    <Stack sx={{ p: 0.5, pb: 0 }} direction="row" justifyContent="space-between" spacing={1} alignItems="center">
      {props.columnSelector ? <GridToolbarColumnsButton /> : null}
      <GridToolbarContainer sx={{ p: 0 }}>
        <TextField
          variant="standard"
          value={props.value}
          onChange={props.onChange}
          placeholder={t('search.placeholder')}
          sx={{
            width: {
              xs: 1,
              sm: 'auto',
            },
            m: (theme) => theme.spacing(1, 0.5, 1.5),
            '& .MuiSvgIcon-root': {
              mr: 0.5,
            },
            '& .MuiInput-underline:before': {
              borderBottom: 1,
              borderColor: 'divider',
            },
          }}
          slotProps={{
            input: {
              startAdornment: <Search fontSize="small" />,
              endAdornment: (
                <IconButton
                  title={t('clear')}
                  aria-label={t('clear')}
                  size="small"
                  style={{ visibility: props.value ? 'visible' : 'hidden' }}
                  onClick={props.clearSearch}
                >
                  <Clear fontSize="small" />
                </IconButton>
              ),
            },
          }}
        />
      </GridToolbarContainer>
      <GridToolbarContainer sx={{ p: 0, width: '50vw' }}>{props.children}</GridToolbarContainer>
    </Stack>
  )
}
