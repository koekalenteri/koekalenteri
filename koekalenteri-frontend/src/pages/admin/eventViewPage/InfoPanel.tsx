import type { EmailTemplateId, Event, Registration } from 'koekalenteri-shared/model'
import type { ChangeEvent, SyntheticEvent } from 'react'

import { useCallback, useState } from 'react'
import ExpandMore from '@mui/icons-material/ExpandMore'
import PictureAsPdfOutlined from '@mui/icons-material/PictureAsPdfOutlined'
import Accordion from '@mui/material/Accordion'
import AccordionDetails from '@mui/material/AccordionDetails'
import AccordionSummary from '@mui/material/AccordionSummary'
import Button from '@mui/material/Button'
import Link from '@mui/material/Link'
import Paper from '@mui/material/Paper'
import Tab from '@mui/material/Tab'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Tabs from '@mui/material/Tabs'
import Typography from '@mui/material/Typography'
import { useRecoilValue } from 'recoil'

import { putInvitationAttachment } from '../../../api/event'
import useEventRegistrationInfo from '../../../hooks/useEventRegistrationsInfo'
import { API_BASE_URL } from '../../../routeConfig'
import { idTokenAtom } from '../../recoil'

interface Props {
  event: Event
  registrations: Registration[]
  onOpenMessageDialog?: (recipients: Registration[], templateId?: EmailTemplateId) => void
}

const InfoPanel = ({ event, registrations, onOpenMessageDialog }: Props) => {
  const token = useRecoilValue(idTokenAtom)
  const [attachmentKey, setAttachmentKey] = useState(event.invitationAttachment)
  const [expanded, setExpanded] = useState(true)
  const [tab, setTab] = useState(0)
  const { reserveByClass, numbersByClass, selectedByClass, stateByClass } = useEventRegistrationInfo(
    event,
    registrations
  )
  const handleExpandedChange = useCallback((event: React.SyntheticEvent, value: boolean) => {
    setExpanded(value)
  }, [])
  const handleTabChange = useCallback((e: SyntheticEvent, v: number) => {
    e.stopPropagation()
    setTab(v)
  }, [])
  const handleInvitationUpload = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files) return
      const fileKey = await putInvitationAttachment(event.id, e.target.files[0], token)
      setAttachmentKey(fileKey)
    },
    [event, token]
  )

  return (
    <Accordion
      square
      disableGutters
      elevation={0}
      expanded={expanded}
      sx={{
        backgroundColor: 'background.selected',
        width: '340px',
        '& .MuiTableContainer-root': {
          backgroundColor: 'background.selected',
          width: '100%',
          p: 0,
          '& .MuiTableCell-root': { py: 0, px: 1 },
        },
      }}
      onChange={handleExpandedChange}
    >
      <AccordionSummary
        expandIcon={<ExpandMore />}
        sx={{
          minHeight: '28px',
          '& .MuiAccordionSummary-content': { m: 0.5 },
        }}
      >
        {expanded ? (
          <Tabs
            value={tab}
            onChange={handleTabChange}
            sx={{ minHeight: '24px', '& .MuiTab-root': { p: '4px 16px', minHeight: '24px', fontWeight: 'bold' } }}
          >
            <Tab label="Kokeen tilanne" />
            <Tab label="Tehtävälista" />
          </Tabs>
        ) : (
          <Typography variant="body1">Tehtäviä tekemättä: ?/?</Typography>
        )}
      </AccordionSummary>
      <AccordionDetails sx={{ p: '0px 8px 8px' }}>
        <TableContainer component={Paper} elevation={0} hidden={tab !== 0}>
          <Table>
            <TableBody>
              <TableRow>
                <TableCell colSpan={3}>
                  <Typography variant="caption" noWrap>
                    Osallistujat
                  </Typography>
                </TableCell>
              </TableRow>
              {Object.entries(numbersByClass).map(([c, nums]) => {
                return (
                  <TableRow key={c}>
                    <TableCell align="left">
                      <Typography variant="caption" noWrap fontWeight="bold" ml={2}>
                        {c}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="caption" noWrap color={nums.invalid ? 'error' : 'info.dark'}>
                        {nums.participants} / {nums.places}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        sx={{ fontSize: '0.5rem' }}
                        disabled={
                          nums.participants === 0 || nums.invalid || !['confirmed', 'picked'].includes(stateByClass[c])
                        }
                        onClick={() =>
                          onOpenMessageDialog?.(
                            selectedByClass[c],
                            stateByClass[c] === 'confirmed' ? 'picked' : 'invitation'
                          )
                        }
                      >
                        LÄHETÄ&nbsp;{stateByClass[c] === 'confirmed' ? 'KOEPAIKKAILMOITUS' : 'KOEKUTSU'}
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
              <TableRow>
                <TableCell colSpan={3}>
                  <Typography variant="caption" noWrap>
                    Varasijalla
                  </Typography>
                </TableCell>
              </TableRow>
              {Object.entries(numbersByClass).map(([c, nums]) => {
                return (
                  <TableRow key={c}>
                    <TableCell align="left">
                      <Typography variant="caption" noWrap fontWeight="bold" ml={2}>
                        {c}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="caption" noWrap color="info.dark">
                        {nums.reserve}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        sx={{ fontSize: '0.5rem' }}
                        disabled={nums.reserve === 0}
                        onClick={() => onOpenMessageDialog?.(reserveByClass[c], 'reserve')}
                      >
                        LÄHETÄ&nbsp;VARASIJAILMOITUS
                      </Button>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </TableContainer>
        <TableContainer component={Paper} elevation={0} hidden={tab !== 1}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell colSpan={3}>Liitteet</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow>
                <TableCell align="left">
                  <Typography variant="caption" noWrap fontWeight="bold" ml={2}>
                    Koekutsu
                  </Typography>
                </TableCell>
                <TableCell>
                  {attachmentKey ? (
                    <>
                      <PictureAsPdfOutlined fontSize="small" sx={{ verticalAlign: 'middle', pr: 0.5 }} />
                      <Link
                        href={`${API_BASE_URL}/file/${attachmentKey}/kutsu.pdf`}
                        rel="noopener"
                        target="_blank"
                        type="application/pdf"
                        variant="caption"
                      >
                        Kutsu.pdf
                      </Link>
                    </>
                  ) : (
                    <Typography variant="caption" fontStyle="italic">
                      Ei liitettyä tiedostoa
                    </Typography>
                  )}
                </TableCell>
                <TableCell>
                  <input
                    accept="application/pdf"
                    type="file"
                    hidden
                    id="koekutsu-file"
                    onChange={handleInvitationUpload}
                  />
                  <label htmlFor="koekutsu-file">
                    <Button component="span" size="small" sx={{ fontSize: '0.5rem' }}>
                      LIITÄ KOEKUTSU
                    </Button>
                  </label>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      </AccordionDetails>
    </Accordion>
  )
}

export default InfoPanel
