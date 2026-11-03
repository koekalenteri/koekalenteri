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
sourceHash: 8d4d4e
---

On the trial day the secretary's job is to record what the dogs did and to get the results in
front of the participants. The *{t:eventManagement.results.title}* section of the event page's
**{t:eventManagement.tabs.management}** panel gathers everything that belongs to it: defining the
posts, entering the results and publishing them class by class. Saving and publishing are two
different things: an entered result is visible only in the admin views until the class is
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

In a NOWT trial the dogs do their exercises at the judges' posts, and the points are recorded
exercise by exercise. An exercise is one performance worth 20 points, and a trial usually has four or
five. The posts are defined on their own page, opened with the panel's
**{t:eventManagement.stations}** button; the button shows only for the event types scored by
exercise. A course is usually laid out at the venue, so the page is separate from the event's details.

Each trial day gets its own posts with **{t:event.stationAdd}**, numbered from one within the day.
For a post you record *{t:event.stationParts}*, *{t:event.stationDogsAtOnce}* and
*{t:event.stationJudges}*, picked from the trial's judges. The tasks and the dogs are the post's
defaults for its exercises. Tasks 2 splits an exercise into two parts of 10. *{t:event.stationDogsAtOnce}* says
how many dogs go into one turn. A post saved earlier in two parts is read as one exercise in two
parts, so its results stay as they were. A post that is not needed is removed with
**{t:event.stationRemove}**, and the rest are renumbered.

**{t:event.rotation.title}.** Below the day's posts you say in which order and at which posts each
group does its exercises. Without groups every class does one exercise at each of the day's posts in
number order, as before. **{t:event.rotation.add}** adds a group: a class, or a range of its start
numbers (*{t:event.rotation.firstNumber}* and *{t:event.rotation.lastNumber}* are left empty when the
group is the whole class). The group's row holds its exercises in order, and for each you pick the
post, the tasks and *{t:event.stationDogsAtOnce}*; otherwise the post's default applies. One post can
take several exercises, in a row or apart: two exercises at one post are two columns, and a
two-judge trial can go round the posts twice (1, 2, 1, 2). When an exercise's post changes, its tasks
and dogs at once stay the same, also when they were the old post's defaults. **+** adds an exercise
at the post of the group's last one, and *{t:event.rotation.visitNone}* removes an exercise while the
group has others; the whole group is removed with its own bin button. When a group has other than
four or five exercises, the page warns of it but saves.

The day's first group does one exercise at each post in number order. The next group is suggested
from the previous one, since the groups usually all go round the same way: it starts at the post the
previous group moved to after its first post and goes on in the same order. A post repeated in a row
stays in a row, so the previous 1, 2, 3, 3 gives 2, 3, 1, 1 and 1, 1, 2, 3 gives 2, 2, 3, 1. An exercise keeps its tasks and dogs at
once with its number. The class is the first class without a group; once every class of the day has
a group, it is the previous group's class, *{t:event.rotation.firstNumber}* is the previous group's
last number plus one and *{t:event.rotation.lastNumber}* is left empty. A suggestion can be edited
like any group, its class included.

In a three-class trial, for example, ALO does exercises 1, 2, 3 and 4 at posts 1, 2, 3 and 3, AVO at
posts 3, 1, 2 and 2 and VOI at posts 2, 3, 1 and 1, and every class has a maximum of 80. When a
fourth exercise at post 3 is added to the first group before the other two are added, they get posts
2, 3, 1, 1 and 3, 1, 2, 2, and swapping their classes gives the example's order. In a one-class trial
the running order is split by start number, for example numbers 1 - 8 start at post 1 and 9 - 16 at
post 2.

Below the posts each post reads as the groups reach it by exercise number, for example "Post 1: ALO
(exercise 1), AVO (exercise 2), VOI (exercises 3 and 4)". A turn at a post takes as many dogs as the
exercise of the dog at the head of the queue, and a group doing two exercises at a post queues there
once for each: all its dogs for exercise 3 first, then for exercise 4. The start list's wait estimate
counts the turns left the same way, group by group and exercise by exercise.

The number ranges of one class must not overlap, and a range cannot stand beside a group of the whole
class. When a class is split into number ranges and a participant falls outside every range, the page
lists the reasons and does not save. A post of the day that is removed takes its exercises out of
every running order, and a group left with no exercise is removed. If a dog's number later moves
outside the ranges, the dog belongs to the nearest group: past the last range the last group, before
the first range the first, and between ranges the lower group; a dog without a number belongs to the
first group. A dog's exercises are always done at the posts of its own trial day.

!shot[EventStationsPage/event-stations-rotation] A three-class running order: each class starts at a different post and does its last two exercises at one post

**{t:save}** stores the posts and the running orders in the event's details. When results have
already been recorded, the save works out their points, maximum, percentage and prize again for the
new running orders, so the placements and the results sent to Omakoira match the results table. The
same goes for changing the classes in the event's details. If a dog gains an exercise that has not
been scored yet, the dog's prize goes until that exercise is scored. A result already sent that
changes reads *{t:results.kennelliitto.badge.changed}* in the *Omakoira* column and is sent again.

Recorded points belong to the exercise they were entered for: exercise 3 stays exercise 3 whatever
post does it and whatever the group's running order becomes. When, for example, four posts are
corrected to three, the third post doing exercises 3 and 4, every dog keeps its points for exercises
1, 2, 3 and 4 as they were, and the save asks nothing. The judge of a score is a judge of the post
where the group does the exercise: the recorded judge stays while they judge at that post, and
otherwise the post's first judge is read as the judge. The judges sent to Omakoira are read the same
way.

Points go only when an exercise leaves the running order or an exercise is split differently, since
the points can then no longer be read as the same exercise. The scores that would go are listed dog
by dog before the save.
**{t:event.resultTasksDropped.confirm}** saves the change and removes the scores, and they do not
come back even if the change is undone later. **{t:cancel}** leaves the change unsaved.

!shot[DroppedTasksDialog/dropped-tasks] A change would remove recorded scores from three dogs

Note: when an exercise is added in the middle of a running order after points have been recorded,
the exercises after it are numbered one higher, but the recorded points keep their old numbers. Add
the exercise at the end of the order instead, or check the results table after the save.

Once the results have been handed over to the chief judge or confirmed, a change that would alter
recorded results is not saved. A change that alters no dog's result is still saved.

## Entering results

The panel's **{t:eventManagement.enterResults}** button becomes active once the trial has
started, and opens the **{t:results.title}** page. In a multi-day trial the day is picked first,
and the classes are on their own tabs. The page lists only the dogs picked as participants, in
running order.

**A trial scored by exercise (NOWT).** Every exercise has its own column by its number, "Exercise
1", "Exercise 2" and so on, whatever post the group did it at. The parts of an exercise split in two
have columns of their own, for example "Exercise 2, part 1/2". A dog's row has a field only for its
own group's exercises. The points go in a field beside which the exercise's maximum shows. At a post
with one judge the judge's name shows in the column heading; at a post with several the judge is
picked under the field, and the choice carries over to the next dog. The dog's name, registration
number and handler share the *{t:results.column.team}* column. Zero points need a
reason in the *{t:results.zeroFault}* field. When the scorecard does not say why the exercise scored
nothing, pick *{t:results.zeroFaults.unknown}*. The result is worked out on the row by itself, as the
rules say: a single zero rules out a prize, and the total of the points shows under the row. With
*{t:results.scope}* the page can be narrowed to one post, showing only the exercises done there; the
result is then left out, since it depends on the other posts too. The choice offers only the shown
day's posts, and the narrowed page lists only the dogs whose group comes to that post.

!shot[ResultsTable/results-entry-nowt] A NOWT class's points per exercise, the second dog's handler withdrew at post 1

**Other event types.** The result is the judge's decision and is picked in the
*{t:results.column.result}* field: a prize of 1 to 3, a nought or a dash, and in NOU and NKM
trials only pass or fail. Beside it is *{t:results.judge}*, when the class has more than one.

!shot[ResultsTable/results-entry-nou] A NOU trial's results: judge and result

**Interruption.** The *{t:results.interruption}* field records a dog's trial that ended early. In the
table the field shows as a lone dash on the row until an interruption is picked. In a
working test (NOWT) the choices and their results under the rules are:

- *{t:results.retirement.handlerChoice}*: the result is a nought. If the judge holds that the dog
  could still have reached a prize, tick *{t:results.couldStillHavePlaced}*, and the result is a dash.
- *{t:results.retirement.injury}* or *{t:results.retirement.illness}*: the judge stopped the trial,
  and the result is a dash with the mark *{t:results.marks.interrupted}* after it on the published list.
- *{t:results.retirement.judgeStopped}*: the result is a nought with the mark
  *{t:results.marks.interrupted}*.

A handler's withdrawal carries no *{t:results.marks.interrupted}* mark, just as in the Kennel Club's
breeding database. The view of all posts also asks *{t:results.outcomeAt}*, that is, at which exercise
the trial ended, for example "Exercise 3 (post 3)": a group can come to one post more than once, so
the post alone does not say which visit it was. A stop is recorded for its exercise, as the
points are, and stays with that exercise when the running order changes. The exercises after the stop in the dog's
running order read *{t:results.notReached}*, in the view narrowed to one post too and on the post's
own entry page, where the dog shows as done for those exercises. The points
earned until then stay and can be edited, and their total against the whole running order's maximum
shows under the row. The same total goes to Omakoira. Where Omakoira does not take it for this
result, the result goes with 0 points, and the send dialog tells the points to enter in Omakoira by hand. If points were already entered for a later
exercise, the field stays and the points count in the total, so they can be cleared if need be. When
the choice is *{t:results.outcomeAtUnknown}*, no exercise shows as not reached.

In the other formats the field records only *{t:results.retirement.judgeStopped}*. The result is a
nought, as the rules say, and on the published list it carries the mark
*{t:results.marks.interrupted}*. A prize already recorded cannot take a stop beside it; clear the
result first.

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
*{t:results.kennelliitto.badge.unsent}*, *{t:results.kennelliitto.badge.blocked}*,
*{t:results.kennelliitto.badge.sentGone}* or *{t:results.kennelliitto.badge.failed}*. The column shows
the same as the send dialog: the page asks where the dogs stand when it opens, and a moment after results
have been saved, also at a post or by another secretary. A result has changed when what would go to
Omakoira differs from what was sent, whether the change is in the dog's own result, in its placement
because of another dog's result, in the judges or in the dog's details. Saving without a change does not
change the state. The exception is a foreign dog not yet sent: the send dialog asks Kennelliitto about the
dog and may then say it cannot be sent or that Kennelliitto knows it under another number, and the column
shows that only after sending. *{t:results.kennelliitto.badge.blocked}*: the result cannot be sent, and hovering over
the state shows why; correct the result or the dog's details. *{t:results.kennelliitto.badge.sentGone}*:
the result is in Omakoira although the dog no longer has a result here; record the result again, or leave
the dog out of the hand-over when the hand-over dialog asks. If Kennelliitto cannot be asked, or the trial
has already been handed over, the column shows only the outcome of the last sending. The results page and a
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
