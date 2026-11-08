---
title: Start list and results
audience: participant
order: 30
covers:
  - src/pages/StartListPage.tsx
  - src/pages/startListPage/**
sourceHash: 7984c1
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

In a trial scored by exercise (NOWT), the class heading is followed by the class's running order as
posts, for example "ALO: posts 1, 2, 3, 3", when the organizer has laid one out. The posts come in
the order of the exercises, and a post twice means two exercises at that post. When a class is split
into start number ranges, each range has a line of its own, and the ranges show only once the class's
start numbers are published.

!shot[ParticipantList/start-list-rotation] The classes' running orders: ALO does its last two exercises at post 3, AVO is split into two number ranges

The page updates by itself when the organizer publishes more or records a cancellation; there is
no need to reload it.

## Team competition

When the trial has a team competition, the list opens by team, and above the list you can choose
**{t:startList.byTeam}** or **{t:startList.byOrder}**. The running order is the same list, day by
day and class by class, as without teams.

By team, each day shows the teams that have dogs on that day's list, in number order: first
*Team 1* and the team's name, then its dogs. A dog's row is the same as otherwise, with the dog's
code in its team in front, for example *1A*. When the day's teams hold dogs of more than one
class, the class comes before the code, for example *AVO 1A*. In a trial of several days, a team
is shown under each day with those of its dogs that are on the list that day. The dogs in no team
come after the teams, under the heading *{t:startList.noTeam}*.

The letter is the dog's place in its team. When a team's dog is a reserve, is not shown yet or has
withdrawn, its letter stays unused, so a team may have 1A and 1C without 1B. A withdrawn dog is not
shown by team at all; in the running order it stays in its place marked *{t:startList.absent}*.

!shot[ParticipantList/start-list-teams] A two-day team competition by team: on the first day the teams hold dogs of two classes

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
judge stopped the trial, an injured or ill dog's included, the result carries the mark
*{t:results.marks.interrupted}* after it. A handler's own withdrawal carries none. In a working test (NOWT)
the result is followed by the dog's points out of the round's maximum and the percentage as a whole
number, for example *AVO1 65/80 pts 81%*. A round that ended early shows the points earned until
then, after the nought or the dash. A dog that earned a prize also shows its rank in its class that
day, for example *Place 2*; dogs with equal points share a rank.
Results are published class by class, and day by day in a trial of several days, so the page can
show classes with results beside classes that have none yet.

The results are shown only on the calendar's start list. They reach the Kennel Club's breeding
database independently of the calendar.
