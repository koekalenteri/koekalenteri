import type { ConfirmedEvent, RegistrationClass } from '../../../../types'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Stack from '@mui/material/Stack'
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
import { actionButtonSx, sectionSx } from './styles'

interface Props {
  readonly event: ConfirmedEvent
  /**
   * Passed in rather than taken from the action hook here: that hook reads an async atom, and reading
   * it during this render suspends the whole panel on a click.
   */
  readonly onSetResultsPublished?: (eventClass: RegistrationClass, published: boolean) => Promise<unknown>
}

/**
 * Publishing results, per class.
 *
 * Saving, publishing and sending to Omakoira are three different things, and the ticket is emphatic
 * that they must read that way. Entering a score changes nothing outside this office; publishing is
 * what puts it in front of the public; Omakoira is somewhere else entirely and this does not touch it.
 */
const ResultsPublishing = ({ event, onSetResultsPublished }: Props) => {
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
    <Box sx={sectionSx}>
      <Typography variant="overline" color="text.secondary" sx={{ display: 'block', pt: 1, px: 1.5 }}>
        {t('eventManagement.results.title')}
      </Typography>
      <Stack spacing={1} sx={{ p: 1 }}>
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
            <Stack alignItems="center" direction="row" key={eventClass} spacing={1}>
              <Typography sx={{ minWidth: 48 }}>{eventClass}</Typography>
              <Button
                disabled={!ready}
                onClick={() => toggle(eventClass, !published)}
                sx={actionButtonSx}
                variant="outlined"
              >
                {published ? t('eventManagement.results.hide') : t('eventManagement.results.publish')}
              </Button>
              <Typography variant="caption" color="text.secondary">
                {published && t('eventManagement.results.published')}
                {!published && !startListPublished && t('eventManagement.results.startListRequired')}
              </Typography>
            </Stack>
          )
        })}
      </Stack>
    </Box>
  )
}

export default ResultsPublishing
