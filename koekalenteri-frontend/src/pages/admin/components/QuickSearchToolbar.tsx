import { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Clear, Search } from '@mui/icons-material'
import { IconButton, Stack, TextField } from '@mui/material'
import { GridToolbarColumnsButton, GridToolbarContainer } from '@mui/x-data-grid'

interface QuickSearchToolbarProps {
  clearSearch: () => void
  onChange: () => void
  value: string
  columnSelector?: boolean
  children?: ReactNode
}

export function QuickSearchToolbar(props: QuickSearchToolbarProps) {
  const { t } = useTranslation()

  return (
    <Stack sx={{ p: 0.5, pb: 0 }} direction="row" justifyContent="space-between" alignItems="center">
      {props.columnSelector ? <GridToolbarColumnsButton /> : null}
      <GridToolbarContainer sx={{ p: 0 }}>
        <TextField
          variant="standard"
          value={props.value}
          onChange={props.onChange}
          placeholder={t('searchPlaceholder')}
          InputProps={{
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
          }}
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
        />
      </GridToolbarContainer>
      <GridToolbarContainer sx={{ p: 0, width: '30vw' }}>{props.children ?? ' '}</GridToolbarContainer>
    </Stack>
  )
}
