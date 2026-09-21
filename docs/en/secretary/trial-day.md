---
title: The trial day and the results
audience: secretary
order: 40
covers:
  - src/pages/admin/EventStationsPage.tsx
  - src/pages/admin/eventStationsPage/**
  - src/pages/admin/EventResultsPage.tsx
  - src/pages/admin/eventResultsPage/**
  - src/pages/admin/StationResultsPage.tsx
  - src/pages/LiveEntryPage.tsx
  - src/pages/components/stationScoring/**
  - src/pages/admin/eventViewPage/infoPanel/ResultsPublishing.tsx
  - src/pages/admin/components/KcIdLookupButton.tsx
  - src/pages/admin/components/StartDaySelector.tsx
sourceHash: 636cbc
---

On the trial day the secretary's job is to record what the dogs did and to get the results in
front of the participants. The *{t:eventManagement.results.title}* section of the event page's
**{t:eventManagement.tabs.management}** panel gathers everything that belongs to it: defining the
posts, entering the results and publishing them class by class. Saving and publishing are two
different things — an entered result is visible only in the admin views until the class is
published.

!shot[ResultsPublishing/results-publishing] Publishing results per class, with the posts and the entry below

## Before the trial starts

Check on the event page that the trial has its *{t:event.kcId}*. It is not needed for entering
results, but the results page reminds you of a missing id and offers the
**{t:event.kcIdLookup}** button, which fetches the id from the Kennel Club without leaving the
page.

The start list needed at the venue opens from the panel's *{t:eventManagement.actions}* section
with **{t:eventManagement.startList.secretary}**. When logged in, the public start list also has
the buttons **{t:copyStartList}**, which copies the list as text for a forum post, say, and
**{t:downloadStartList}**, which downloads it as a spreadsheet.

A class secretary who records their own class's start numbers is given the link described in
*After entry closes*. The link opens one class's numbers without a login, and saving says at once
if a number already belongs to another dog or is not one of the class's.

!shot[StartNumbersEntry/start-numbers-entry-class-link] The class secretary's view of their own class

## Posts

In a NOWT trial the dogs go round posts, and the points are recorded post by post. The posts are
defined on their own page, opened with the panel's **{t:eventManagement.stations}** button; the
button shows only for the event types scored at posts. A course is usually laid out at the venue,
so the page is separate from the event's details.

Each trial day gets its own posts with **{t:event.stationAdd}**, numbered from one within the day.
For a post you record *{t:event.stationTasks}* (one or two), *{t:event.stationDogsAtOnce}* and
*{t:event.stationJudges}*, picked from the trial's judges. A post that is not needed is removed
with **{t:event.stationRemove}**, and the rest are renumbered. **{t:save}** stores the posts in
the event's details.

## Entering results

The panel's **{t:eventManagement.enterResults}** button becomes active once the trial has
started, and opens the **{t:results.title}** page. In a multi-day trial the day is picked first,
and the classes are on their own tabs. The page lists only the dogs picked as participants, in
running order.

**A trial scored at posts (NOWT).** Every task has its own column, and the points go in a field
under which the task's maximum shows. Under the field is the judge who judged the task: at a post
with one judge the name is just shown, at a post with several it is picked, and the choice carries
over to the next dog. Zero points need a reason in the *{t:results.zeroFault}* field. The result
is worked out on the row by itself, as the rules say: a single zero rules out a prize, and the
total of the points shows under the row. With *{t:results.scope}* the page can be narrowed to one
post, showing only that post's tasks — the result is then left out, since it depends on the other
posts too.

!shot[ResultsTable/results-entry-nowt] A NOWT class's points per task, the second dog stopped at post 2

**Other event types.** The result is the judge's decision and is picked in the
*{t:results.column.result}* field: a prize of 1 to 3, a nought or a dash, and in NOU and NKM
trials only pass or fail. Beside it is *{t:results.judge}*, when the class has more than one.

!shot[ResultsTable/results-entry-nou] A NOU trial's results: judge, result and interruption

**Interruption.** The *{t:results.interruption}* field records
*{t:results.retirement.judgeStopped}*. A stopped dog's result is a nought, as the rules say, and on
the published list it carries the mark *{t:results.marks.interrupted}*. The whole-round view also
asks *{t:results.outcomeAt}*, that is, at which post the round was stopped. A prize already
recorded cannot take a stop beside it; clear the result first.

On a phone the dogs are listed one under another as cards with the same fields.

**{t:results.save}** saves only the rows that changed; **{t:cancel}** discards the changes. If you
leave the page without saving, the browser warns you. Another secretary's saves reach the page by
themselves. If the same dog has meanwhile been recorded differently elsewhere, the save stops at
the dialog **{t:results.conflictTitle}**, which shows both versions and asks which one stands;
**{t:results.conflictResolve}** saves the choices. The other rows have already been saved by then.

## Publishing results

Results are published class by class with the panel's **{t:eventManagement.results.publish}**
button, and the calendar asks for confirmation. Publishing needs the class's start list to be
published — otherwise the row reads *{t:eventManagement.results.startListRequired}* — and the
trial to have started. A published result shows on the public start list as the last line of the
dog's row, and corrections saved later show there as they are.
**{t:eventManagement.results.hide}** hides the class's results again.

Publishing concerns the calendar only: it does not send the results to the Kennel Club.

TODO: The post's own entry view and the judge's secretary's live entry link are switched off in the release (`liveViewEnabled`); describe them when they are turned on.
