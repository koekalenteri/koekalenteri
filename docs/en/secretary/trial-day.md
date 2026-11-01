---
title: The trial day and the results
audience: secretary
order: 40
covers:
  - src/pages/admin/EventStationsPage.tsx
  - src/pages/admin/components/DroppedTasksDialog.tsx
  - src/pages/admin/eventStationsPage/**
  - src/pages/admin/EventResultsPage.tsx
  - src/pages/admin/eventResultsPage/**
  - src/pages/admin/StationResultsPage.tsx
  - src/pages/LiveEntryPage.tsx
  - src/pages/components/stationScoring/**
  - src/pages/admin/eventViewPage/infoPanel/ResultsPublishing.tsx
  - src/pages/admin/components/KcIdLookupButton.tsx
  - src/pages/admin/components/StartDaySelector.tsx
sourceHash: c396d9
---

On the trial day the secretary's job is to record what the dogs did and to get the results in
front of the participants. The *{t:eventManagement.results.title}* section of the event page's
**{t:eventManagement.tabs.management}** panel gathers everything that belongs to it: defining the
posts, entering the results and publishing them class by class. Saving and publishing are two
different things — an entered result is visible only in the admin views until the class is
published.

!shot[ResultsPublishing/results-publishing] Publishing results per class, with the posts and the entry below

## Before the trial starts

Check on the event page that the trial is linked to a Kennel Club event (*{t:event.kcGuidLinked}*).
The link is not needed for entering results, but the results page reminds you of a missing link
and offers the **{t:event.kcIdLookup}** button, which links the trial to the Kennel Club event
without leaving the page. If the list shows the event but does not let you select it, the Kennel
Club has not yet given it an identifier: try linking again later.

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
For a post you record *{t:event.stationTaskCount}*, *{t:event.stationParts}*,
*{t:event.stationDogsAtOnce}* and *{t:event.stationJudges}*, picked from the trial's judges.
*{t:event.stationDogsAtOnce}* is the post's default for how many dogs it takes in one turn. A task
is always worth 20 points, so a post's maximum is its number of tasks times 20. Parts 2 splits a
task into two parts of 10; the first-prize floor, half the task's points, then applies to the sum of
the parts. A post with two tasks saved before rotation groups existed is read as one task in two
parts, so its results stay as they were. A post that is not needed is removed with
**{t:event.stationRemove}**, and the rest are renumbered.

**{t:event.rotation.title}.** Below the day's posts you say in which order the dogs go round them.
Without rotation groups every class goes round the day's posts in number order and does each post's
default number of tasks, as before. **{t:event.rotation.add}** adds a rotation group: a class, or a
range of its start numbers (*{t:event.rotation.firstNumber}* and *{t:event.rotation.lastNumber}* are
left empty when the group is the whole class). The day's first group goes round the day's posts in
number order. The next group is suggested from the previous one, since the groups usually all go round
the same way: it starts at the post the previous group visited second and goes round in the same
order. A column's settings stay in the column, so two tasks at the last post move to the new group's
own last post. The class is the first class without a group; once every class of the day has a group,
it is the previous group's class, *{t:event.rotation.firstNumber}* is the previous group's last number
plus one and *{t:event.rotation.lastNumber}* is left empty. A suggestion can be edited like any group,
its class included. The order is changed by picking a post in a column: when the group already visits
that post in another column, the two posts change places and each keeps its own settings. A post the
group does not visit yet takes over the column's settings. *{t:event.rotation.visitNone}* takes the
post out of the round while the group has other posts; the whole group is removed with
its own bin button. **+** adds a post the group does not visit yet. For each post
you can give the group's number of tasks (1 - 3), the parts and *{t:event.stationDogsAtOnce}*;
otherwise the post's default applies. So one post can take one class's dogs one at a time and
another's in pairs: the post's entry view puts as many dogs in a turn as the group of the dog at the
head of the queue takes, and the start list's wait estimate counts the turns left group by group
with the same figures. In a three-class trial, for example, ALO goes round posts 1, 2 and 3 and does
two tasks at post 3, AVO goes round 3, 1 and 2 and VOI 2, 3 and 1, and every class has a maximum of
80. After two tasks are marked at the first group's last post, three groups added in a row go round
1, 2, 3; 2, 3, 1 and 3, 1, 2, each with two tasks at its own last post, so this rotation is two
class changes away from the suggestion: the second group's class is changed to VOI and the third's
to AVO. In a one-class trial the rotation is split by start number, for example numbers 1 - 8 start
at post 1 and 9 - 16 at post 2.

Below the posts each post reads as the groups reach it, for example "Station 1: ALO, AVO, VOI (x
2)": "(x 2)" says the group does two tasks there, and "(2 parts)" that the task is split in two
parts. The number ranges of one class must not overlap, and a range cannot stand beside a group of
the whole class. When a class is split into number ranges and a participant falls outside every
range, the page lists the reasons and does not save. A post of the day that is removed leaves every
round, and a group left with no post is removed. If a dog's number later moves outside the ranges,
the dog goes with the nearest group: past the last range with the last group, before the first range
with the first, and between ranges with the lower group; a dog without a number goes with the first
group. A dog's round is always made of the posts of its own trial day.

!shot[EventStationsPage/event-stations-rotation] A three-class rotation: each class starts at a different post and does two tasks at its last

**{t:save}** stores the posts and the rotation in the event's details. When results have already been
recorded, the save works out their points, maximum, percentage and prize again for the new rounds, so
the placements and the results sent to Omakoira match the results table. The same goes for changing
the classes in the event's details. If a dog's round gains a task that has not been scored yet, the
dog's prize goes until that task is scored. A result already sent that changes reads
*{t:results.kennelliitto.badge.changed}* in the *Omakoira* column and is sent again.

A recorded task is kept only where its place means the same task in the dog's new round as before.
When, for example, a post goes from two tasks to one or a task's parts change, the scores that would
go are listed dog by dog before the save. **{t:event.resultTasksDropped.confirm}** saves the change
and removes those scores, and they do not come back if the change is undone later. **{t:cancel}**
leaves the change unsaved.

!shot[DroppedTasksDialog/dropped-tasks] A change of a post would remove recorded tasks from three dogs

Once the results have been handed over to the chief judge or confirmed, a change that would alter
recorded results is not saved. A change that alters no dog's result is still saved.

## Entering results

The panel's **{t:eventManagement.enterResults}** button becomes active once the trial has
started, and opens the **{t:results.title}** page. In a multi-day trial the day is picked first,
and the classes are on their own tabs. The page lists only the dogs picked as participants, in
running order.

**A trial scored at posts (NOWT).** Every task has its own column in the group's rotation order,
and the tasks are numbered through the whole round. The parts of a task split in two have columns of
their own, for example "Task 2, part 1/2". When a class is split into number ranges and the groups'
rounds differ, the columns are named by post, for example "Station 2, task 2", and a dog's row has
a field only for its own group's tasks. The points go in a field under which the task's maximum
shows. Under the field is the judge who judged the task: at a post with one judge the name is just
shown, at a post with several it is picked, and the choice carries over to the next dog. Zero points need a reason in the *{t:results.zeroFault}* field. When the
scorecard does not say why the task scored nothing, pick *{t:results.zeroFaults.unknown}*. The result
is worked out on the row by itself, as the rules say: a single zero rules out a prize, and the
total of the points shows under the row. With *{t:results.scope}* the page can be narrowed to one
post, showing only that post's tasks — the result is then left out, since it depends on the other
posts too. The choice offers only the shown day's posts, and the narrowed page lists only the dogs
whose group comes to that post.

!shot[ResultsTable/results-entry-nowt] A NOWT class's points per task, the second dog stopped at post 2

**Other event types.** The result is the judge's decision and is picked in the
*{t:results.column.result}* field: a prize of 1 to 3, a nought or a dash, and in NOU and NKM
trials only pass or fail. Beside it is *{t:results.judge}*, when the class has more than one.

!shot[ResultsTable/results-entry-nou] A NOU trial's results: judge and result

**Interruption.** The *{t:results.interruption}* field records
*{t:results.retirement.judgeStopped}*. A stopped dog's result is a nought, as the rules say, and on
the published list it carries the mark *{t:results.marks.interrupted}*. The whole-round view also
asks *{t:results.outcomeAt}*, that is, at which post the round was stopped. A prize already
recorded cannot take a stop beside it; clear the result first.

The interruption is asked only in the formats where the Kennel Club records one (NOME-A, NOME-B, NKM
and NOWT). An aptitude test (NOU) has no interruption, so the field is not shown. If a NOU dog already
has an interruption recorded from before, the field shows on its row so that it can be cleared.

!shot[ResultsTable/results-entry-nome-b] A NOME-B class's results: the interruption beside the result

On a phone the dogs are listed one under another as cards with the same fields.

**{t:results.save}** saves only the rows that changed; **{t:cancel}** discards the changes. If you
leave the page without saving, the browser warns you. Another secretary's saves reach the page by
themselves. If the same dog has meanwhile been recorded differently elsewhere, the save stops at
the dialog **{t:results.conflictTitle}**, which shows both versions and asks which one stands;
**{t:results.conflictResolve}** saves the choices. The other rows have already been saved by then. If
saving the choices fails, the dialog stays open and the entered scores are kept; if the dog has
meanwhile been recorded differently elsewhere again, the dialog shows the new version.

In an official trial the *{t:results.kennelliitto.column}* column tells for each dog whether its result is
in Omakoira: *{t:results.kennelliitto.badge.sent}*, *{t:results.kennelliitto.badge.changed}*,
*{t:results.kennelliitto.badge.unsent}* or *{t:results.kennelliitto.badge.failed}*. The results page and a
post's scoring page read the trial's state from Kennelliitto when they open, so a trial handed to the judge
opens read-only also when it was handed over in Omakoira directly. Sending the results and correcting them
after sending are described on the page [After entry closes](/docs/secretary/after-entry-closes), under
*Sending the results to Kennelliitto*.

## Publishing results

Results are published class by class with the panel's **{t:eventManagement.results.publish}**
button, and the calendar asks for confirmation. Publishing needs the class's start list to be
published, the trial to have started and a result entered for at least one dog of the day. Until
then the row says what is missing: *{t:eventManagement.results.startListRequired}* or
*{t:eventManagement.results.noResults}*. A published result shows on the public start list as the last line of the
dog's row, and corrections saved later show there as they are.
**{t:eventManagement.results.hide}** hides the row's results again. A trial without classes,
such as NOU, has a row named after the trial type, and it publishes the results of the whole
trial.

In a trial of several days each class has a row for each day, and each day is published and hidden
on its own. The first day's results can go out as soon as the day is over, and the second day's
results stay hidden until that day is published too. A day cannot be published before it has
begun.

Publishing concerns the calendar only: it does not send the results to the Kennel Club.
