import type { GridColDef, GridRowSelectionModel } from '@mui/x-data-grid'
import type { EmailTemplate } from 'koekalenteri-shared/model'
import type { SyntheticEvent } from 'react'

import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import Cancel from '@mui/icons-material/Cancel'
import Save from '@mui/icons-material/Save'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import { useRecoilState, useRecoilValue, useResetRecoilState } from 'recoil'

import { hasChanges } from '../../utils'
import StyledDataGrid from '../components/StyledDataGrid'

import FullPageFlex from './components/FullPageFlex'
import { TemplateEditor } from './emailTemplateListPage/TemplateEditor'
import { editableTemplateByIdAtom, emailTemplatesAtom, templateSelector, useEmailTemplatesActions } from './recoil'

export default function EmailTemplateListPage() {
  const emailTemplates = useRecoilValue(emailTemplatesAtom)
  const [selectedTab, setSelectedTab] = useState<number>(0)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>()
  const storedTemplate = useRecoilValue(templateSelector(selectedTemplateId))
  const [template, setTemplate] = useRecoilState(editableTemplateByIdAtom(selectedTemplateId))
  const resetTemplate = useResetRecoilState(editableTemplateByIdAtom(selectedTemplateId))
  const [changes, setChanges] = useState<boolean>(hasChanges(storedTemplate, template))
  const actions = useEmailTemplatesActions()

  const { t } = useTranslation()

  const columns: GridColDef<EmailTemplate>[] = [
    {
      field: 'id',
      flex: 1,
      headerName: t('templateId'),
      valueGetter: (params) => t(`emailTemplate.${params.row.id}` as any),
    },
  ]

  useEffect(() => {
    setChanges(hasChanges(storedTemplate, template))
  }, [storedTemplate, template])

  const handleSelectionModeChange = (selection: GridRowSelectionModel) => {
    const value = typeof selection[0] === 'string' ? selection[0] : undefined
    setSelectedTemplateId(value)
  }
  const handleTabChange = (event: SyntheticEvent, value: number) => setSelectedTab(value)
  const handleChange = useCallback(
    (newState: EmailTemplate) => {
      setTemplate(newState)
    },
    [setTemplate]
  )

  const handleSave = useCallback(() => {
    if (!template) {
      return
    }
    actions.save(template).then(
      (ok) => {
        if (ok) {
          resetTemplate()
          setChanges(false)
        }
      },
      (reason) => {
        console.error(reason)
      }
    )
  }, [actions, resetTemplate, template])

  const handleCancel = useCallback(() => {
    resetTemplate()
    setChanges(false)
  }, [resetTemplate])

  return (
    <FullPageFlex>
      <Stack direction="row" spacing={2} alignItems="stretch" flex={1}>
        <Box flex={1}>
          <StyledDataGrid
            columns={columns}
            onRowSelectionModelChange={handleSelectionModeChange}
            rows={emailTemplates}
          />
        </Box>
        <Paper sx={{ display: 'flex', p: 1, flex: 2, flexFlow: 'column' }} elevation={4}>
          {template ? (
            <>
              <Tabs value={selectedTab} onChange={handleTabChange} sx={{ flex: 0 }}>
                <Tab label={t('locale.fi')} id="fi"></Tab>
                <Tab label={t('locale.en')} id="en"></Tab>
              </Tabs>
              <TemplateEditor template={template} language="fi" hidden={selectedTab !== 0} onChange={handleChange} />
              <TemplateEditor template={template} language="en" hidden={selectedTab !== 1} onChange={handleChange} />
              <Box flex={0}>
                <Stack
                  spacing={1}
                  direction="row"
                  justifyContent="flex-end"
                  sx={{ py: 1, borderTop: '1px solid', borderColor: '#bdbdbd' }}
                >
                  <Button
                    color="primary"
                    disabled={!changes}
                    startIcon={<Save />}
                    variant="contained"
                    onClick={handleSave}
                  >
                    Tallenna
                  </Button>
                  <Button startIcon={<Cancel />} disabled={!changes} variant="outlined" onClick={handleCancel}>
                    Peruuta
                  </Button>
                </Stack>
              </Box>
            </>
          ) : null}
        </Paper>
      </Stack>
    </FullPageFlex>
  )
}
