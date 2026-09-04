import type { ConfirmedEvent, RegistrationClass } from '../../../../types'
import EditNoteOutlined from '@mui/icons-material/EditNoteOutlined'
import PlaceOutlined from '@mui/icons-material/PlaceOutlined'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
import TableCell from '@mui/material/TableCell'
import TableRow from '@mui/material/TableRow'
import Typography from '@mui/material/Typography'
import { useConfirm } from 'material-ui-confirm'
import { enqueueSnackbar } from 'notistack'
import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { errorSnackbarOptions } from '../../../../lib/client/snackbar'
import {
  canPublishResults,
  getEventStateForClass,
  isResultsPublishedForClass,
  isStartListAvailableForClass,
  uniqueClasses,
} from '../../../../lib/event'
import { scoresAtPosts } from '../../../../lib/results'
import { Path } from '../../../../routeConfig'
import { PublishingSection } from './PublishingSection'
import { actionButtonSx } from './styles'

interface Props {
  readonly event: ConfirmedEvent
  /** Results can only be entered once there is something to score. */
  readonly eventStarted?: boolean
  /**
   * Passed in rather than taken from the action hook here: that hook reads an async atom, and reading
   * it during this render suspends the whole panel on a click.
   */
  readonly onSetResultsPublished?: (eventClass: RegistrationClass, published: boolean) => Promise<unknown>
}

/**
 * Publishing results, per class — and the entry that feeds it (KOE-1354).
 *
 * Saving, publishing and sending to Omakoira are three different things, and the ticket is emphatic
 * that they must read that way. Entering a score changes nothing outside this office; publishing is
 * what puts it in front of the public; Omakoira is somewhere else entirely and this does not touch it.
 *
 * The entry sits under the buttons its scores feed, the way the draw entry sits under the start
 * numbers it fills (KOE-1297): a step of the trial reads as one section, not as a decision here and
 * its own doing among the general actions at the foot of the panel.
 */
const ResultsPublishing = ({ event, eventStarted, onSetResultsPublished }: Props) => {
  const { t } = useTranslation()
  const confirm = useConfirm()
  const classes = uniqueClasses(event)

  const toggle = useCallback(
    async (eventClass: RegistrationClass, published: boolean) => {
      if (published) {
        // Publishing is the step that cannot be quietly undone in the reader's mind, so it is asked for.
        const { confirmed } = await confirm({
          confirmationText: t('eventManagement.results.publish'),
          description: t('eventManagement.results.confirm', { eventClass }),
          title: t('eventManagement.results.confirmTitle'),
        })
        if (!confirmed) return
      }

      try {
        await onSetResultsPublished?.(eventClass, published)
        enqueueSnackbar(
          t(published ? 'eventManagement.results.publishedSnack' : 'eventManagement.results.hidden', { eventClass }),
          { variant: 'success' }
        )
      } catch {
        enqueueSnackbar(t('eventManagement.results.saveFailed'), errorSnackbarOptions)
      }
    },
    [confirm, onSetResultsPublished, t]
  )

  return (
    <PublishingSection
      title={t('eventManagement.results.title')}
      action={
        <Stack spacing={1}>
          {/* Where the scoring happens at posts, defining them is the first half of entering results. */}
          {scoresAtPosts(event.eventType) && (
            <Button
              fullWidth
              href={Path.admin.stations(event.id)}
              startIcon={<PlaceOutlined />}
              sx={actionButtonSx}
              variant="outlined"
            >
              {t('eventManagement.stations')}
            </Button>
          )}
          <Button
            disabled={!eventStarted}
            fullWidth
            href={Path.admin.results(event.id)}
            startIcon={<EditNoteOutlined />}
            sx={actionButtonSx}
            variant="outlined"
          >
            {t('eventManagement.enterResults')}
          </Button>
        </Stack>
      }
    >
      {classes.map((eventClass) => {
        const published = isResultsPublishedForClass(event, eventClass)
        const classState = getEventStateForClass(event, eventClass)
        // Results travel on the start list's rows, so publishing them while it is hidden would
        // change nothing a spectator can see. Say so rather than leaving a dead button.
        const classEntry = event.classes.find((item) => item.class === eventClass) ?? { class: eventClass }
        const startListPublished = isStartListAvailableForClass(event, classEntry)
        // Nothing to publish before the dogs have run.
        const ready = startListPublished && canPublishResults(classState, event)

        return (
          <TableRow key={eventClass}>
            <TableCell align="left">
              <Box
                sx={{
                  ml: 2,
                }}
              >
                <Typography
                  variant="caption"
                  noWrap
                  sx={{
                    fontWeight: 'bold',
                  }}
                >
                  {eventClass}
                </Typography>
                {published && (
                  <Typography
                    variant="caption"
                    noWrap
                    sx={{
                      color: 'info.main',
                      display: 'block',
                    }}
                  >
                    {t('eventManagement.results.published')}
                  </Typography>
                )}
                {!published && !startListPublished && (
                  <Typography
                    variant="caption"
                    noWrap
                    sx={{
                      color: 'text.secondary',
                      display: 'block',
                    }}
                  >
                    {t('eventManagement.results.startListRequired')}
                  </Typography>
                )}
              </Box>
            </TableCell>
            <TableCell align="right">
              <Button
                color={published ? 'secondary' : 'primary'}
                disabled={!ready}
                onClick={() => toggle(eventClass, !published)}
                size="small"
                sx={{ whiteSpace: 'nowrap' }}
                variant={ready ? 'contained' : 'outlined'}
              >
                {published ? t('eventManagement.results.hide') : t('eventManagement.results.publish')}
              </Button>
            </TableCell>
          </TableRow>
        )
      })}
    </PublishingSection>
  )
}

export default ResultsPublishing
