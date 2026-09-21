---
title: Start list and results
audience: participant
order: 30
covers:
  - src/pages/StartListPage.tsx
  - src/pages/startListPage/**
sourceHash: 3b56fc
---

The start list is the trial's public page, where the organizer publishes the participants, the
start numbers and in the end the results. It needs no login and no link from an email: it opens
from the trial's details in the calendar once the organizer has published the list for at least
one class. Before that the page reads *{t:error.startListNotAvailable}*.

## What the list shows

The list runs day by day and class by class. A class's heading names its judges, and where a day
is split into a morning and an afternoon, each group is its own section. For every dog and handler
the list gives the start number, breed, titles, name, registration number and date of birth, the
parents, the owner and handler, and the breeder. A withdrawn dog stays in its place marked
*{t:startList.absent}*, so the numbers do not shift because of a cancellation.

!shot[RegistrationDetails/start-list-result] A dog's row, with its result already on it

The page updates by itself when the organizer publishes more or records a cancellation; there is
no need to reload it.

## When the order is final

The organizer publishes the list and the start numbers separately, and the class heading says
which stage the class is at:

| Note in the heading | What it means |
| --- | --- |
| *{t:startListNotPublished}* | the class's participants are not shown yet; the heading is there so the class is known to be coming |
| *{t:startNumbersNotPublished}* | the participants are in alphabetical order and the number does not yet say when a dog runs |
| no note | the numbers have been drawn and published, and the list is the running order |

In a multi-day trial the numbers can be published one day at a time, so one day's class can be
final while another is still alphabetical.

## Results

Once the organizer has published a class's results, the last line of each dog's row is its
result: the class and the prize, AVO1 for example, or a nought or a dash as the rules say. If the
judge stopped the trial, the result carries the mark *{t:results.marks.interrupted}* after it.
Results are published class by class, so the page can show classes with results beside classes
that have none yet.

The results are shown only on the calendar's start list. They reach the Kennel Club's breeding
database independently of the calendar.

TODO: The start list's Live section (who is at the post now, how the queue is moving) is switched off in the release (`liveViewEnabled`); describe it when it is turned on.
