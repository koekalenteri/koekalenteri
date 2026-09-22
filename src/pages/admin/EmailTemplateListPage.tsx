import type { GridColDef, GridRowSelectionModel } from '@mui/x-data-grid'
import type { SyntheticEvent } from 'react'
import type { EmailTemplate, EmailTemplateError, EmailTemplateId } from '../../types'
import Cancel from '@mui/icons-material/Cancel'
import Save from '@mui/icons-material/Save'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Tab from '@mui/material/Tab'
import Tabs from '@mui/material/Tabs'
import { useAtom, useAtomValue } from 'jotai'
import { useResetAtom } from 'jotai/utils'
import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { firstSelectedRow } from '../../lib/datagrid'
import { findEmailTemplateError } from '../../lib/emailTemplate'
import { hasChanges } from '../../lib/utils'
import { LANGUAGES } from '../../types'
import StyledDataGrid from '../components/StyledDataGrid'
import FullPageFlex from './components/FullPageFlex'
import { TemplateEditor } from './emailTemplateListPage/TemplateEditor'
import { TemplateErrorAlert } from './emailTemplateListPage/TemplateErrorAlert'
import {
  adminEditableTemplateByIdAtom,
  adminEmailTemplateAtom,
  adminEmailTemplatesAtom,
  useAdminEmailTemplatesActions,
} from './state'

export default function EmailTemplateListPage() {
  const emailTemplates = useAtomValue(adminEmailTemplatesAtom)
  const [selectedTab, setSelectedTab] = useState<number>(0)
  const [selectedTemplateId, setSelectedTemplateId] = useState<EmailTemplateId>()
  const storedTemplate = useAtomValue(adminEmailTemplateAtom(selectedTemplateId))
  const [template, setTemplate] = useAtom(adminEditableTemplateByIdAtom(selectedTemplateId))
  const resetTemplate = useResetAtom(adminEditableTemplateByIdAtom(selectedTemplateId))
  const [changes, setChanges] = useState<boolean>(hasChanges(storedTemplate, template))
  const [saveError, setSaveError] = useState<EmailTemplateError>()
  const actions = useAdminEmailTemplatesActions()

  const { t } = useTranslation()

  const columns: GridColDef<EmailTemplate>[] = [
    {
      field: 'id',
      flex: 1,
      headerName: t('templateId'),
      valueGetter: (value: EmailTemplate['id']) => t(`emailTemplate.${value}`),
    },
  ]

  useEffect(() => {
    setChanges(hasChanges(storedTemplate, template))
  }, [storedTemplate, template])

  const handleSelectionModeChange = (selection: GridRowSelectionModel) => {
    const selected = firstSelectedRow(selection)
    const value = typeof selected === 'string' ? selected : undefined
    setSelectedTemplateId(value as EmailTemplateId)
    setSaveError(undefined)
  }
  const handleTabChange = (_event: SyntheticEvent, value: number) => setSelectedTab(value)
  const handleChange = useCallback(
    (newState: EmailTemplate) => {
      setTemplate(newState)
      setSaveError(undefined)
    },
    [setTemplate]
  )

  /** The failure under the editor, opened on the language it names so the line is in view. */
  const showError = useCallback((error: EmailTemplateError) => {
    setSaveError(error)
    if (error.language) setSelectedTab(LANGUAGES.indexOf(error.language))
  }, [])

  const handleSave = useCallback(() => {
    if (!template) {
      return
    }
    // The check the server makes, made here first: an error the editor can name itself needs no
    // round trip, and the server's answer is shown the same way when it finds one of its own.
    const syntaxError = findEmailTemplateError(template)
    if (syntaxError) {
      showError(syntaxError)
      return
    }
    actions.save(template).then(
      (result) => {
        if (result.ok) {
          resetTemplate()
          setChanges(false)
          setSaveError(undefined)
        } else {
          showError(result.error)
        }
      },
      (err) => {
        console.error(err)
      }
    )
  }, [actions, resetTemplate, showError, template])

  const handleCancel = useCallback(() => {
    resetTemplate()
    setChanges(false)
    setSaveError(undefined)
  }, [resetTemplate])

  return (
    <FullPageFlex>
      <Stack
        direction="row"
        spacing={1}
        sx={{
          alignItems: 'stretch',
          flex: 1,
          height: '100%',
          width: '100%',
        }}
      >
        <Box
          sx={{
            flex: 1,
            maxWidth: 300,
          }}
        >
          <StyledDataGrid
            columns={columns}
            onRowSelectionModelChange={handleSelectionModeChange}
            rows={emailTemplates}
          />
        </Box>
        <Paper
          sx={{
            display: 'flex',
            flex: 1,
            flexFlow: 'column',
            minHeight: 0,
            overflow: 'hidden',
            p: 1,
          }}
        >
          {template ? (
            <>
              <Tabs value={selectedTab} onChange={handleTabChange} sx={{ flex: 0 }}>
                <Tab label={t('locale.fi')} id="fi"></Tab>
                <Tab label={t('locale.en')} id="en"></Tab>
              </Tabs>
              <TemplateEditor
                templateId={selectedTemplateId}
                template={template}
                language="fi"
                hidden={selectedTab !== 0}
                onChange={handleChange}
              />
              <TemplateEditor
                templateId={selectedTemplateId}
                template={template}
                language="en"
                hidden={selectedTab !== 1}
                onChange={handleChange}
              />
              {saveError ? <TemplateErrorAlert error={saveError} /> : null}
              <Box
                sx={{
                  flex: 0,
                }}
              >
                <Stack
                  spacing={1}
                  direction="row"
                  sx={{
                    borderColor: '#bdbdbd',
                    borderTop: '1px solid',
                    justifyContent: 'flex-end',
                    py: 1,
                  }}
                >
                  <Button
                    color="primary"
                    disabled={!changes}
                    startIcon={<Save />}
                    variant="contained"
                    onClick={handleSave}
                  >
                    {t('save')}
                  </Button>
                  <Button startIcon={<Cancel />} disabled={!changes} variant="outlined" onClick={handleCancel}>
                    {t('cancel')}
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
