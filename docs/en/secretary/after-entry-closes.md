---
title: After entry closes
audience: secretary
order: 30
covers:
  - src/pages/admin/EventViewPage.tsx
  - src/pages/admin/eventViewPage/ClassEntrySelection.tsx
  - src/pages/admin/eventViewPage/classEntrySelection/**
  - src/pages/admin/eventViewPage/infoPanel/**
  - src/pages/admin/eventViewPage/MoveToPositionDialog.tsx
  - src/pages/admin/eventViewPage/RegistrationCreateDialog.tsx
  - src/pages/admin/eventViewPage/RegistrationEditDialog.tsx
  - src/pages/admin/eventViewPage/SendMessageDialog.tsx
  - src/pages/admin/eventViewPage/MessageRecipientsDialog.tsx
  - src/pages/admin/EventStartNumbersPage.tsx
  - src/pages/admin/eventStartNumbersPage/**
  - src/pages/admin/EventTeamsPage.tsx
  - src/pages/admin/eventTeamsPage/**
  - src/pages/admin/StartListPage.tsx
  - src/pages/admin/StartListPreviewPage.tsx
  - src/pages/admin/startListPage/**
  - src/pages/ClassStartNumbersPage.tsx
sourceHash: 993dca
---

Once entry has closed, the secretary's work goes step by step: picking the participants, the
participant and reserve notifications, the invitations, the start list and finally the start numbers
drawn at the venue. The event page's **{t:eventManagement.tabs.management}** panel runs in the same order and says at
every step what has been done and what is possible next: a button that cannot be pressed yet has
its reason beside it.

## Adding an entry afterwards

The secretary can add a dog to the trial even after entry has closed. Press **{t:createRegistration}**
in the panel's *{t:eventManagement.actions}* section and fill in the dog's details on the same form the entrants use
themselves. Once everything required is in place, **{t:registration.cta.confirmAndSendLink}** emails the payment
link to the person marked as the payer, and the entry shows as unpaid until the payer has settled it.
If the trial's payment time is *{t:paymentTimeOptions.confirmation}*, the button is
**{t:registration.cta.confirmRegistration}** and the payment link goes out with the participant notification instead.

## Checking eligibility

The calendar fetches the dog's trial results from the Kennel Club's breeding database and checks the
right to enter the class itself. Only the dogs whose row shows results added by the entrant need
checking by hand. The exclamation mark icon marks them. The row's icons explain themselves when the
mouse hovers over them:

| Icon | What it means |
| --- | --- |
| star | the entrant has priority, for example as a member of the organising club; a dimmer star if only the owner or only the handler is a member |
| person | the owner or the handler is a member of the organising club |
| payment | the entry has been paid; red if part of the fee is missing, and after a refund the icon states the refunded amount |
| plus on a task list | the entrant has chosen optional services |
| tick | the entrant has confirmed taking the place |
| red letter | an email to the entrant could not be delivered |
| envelope | the invitation has been sent; an opened envelope means an acknowledged invitation |
| scheduled send | the invitation goes out only once the place has been paid for |
| exclamation mark | the entrant has added trial results themselves, **check eligibility** |
| speech bubble | the entrant has written additional information |
| note | the entry carries the secretary's internal comment |

If the trial is ranked on points, the qualifying points show at the end of the row as well.

## Picking the participants

Participants are picked by dragging a dog from *Ilmoittautuneet* (entered) into the right trial-day
and group section under *Osallistujat* (participants). The colour bars in front of the dog's name
show which groups the entrant said they can attend, and the same colours repeat in the group
headings. A multi-day class has more options and more colours. If a dog is dragged into a group it
did not enter, the calendar points that out.

!shot[ClassEntrySelection/class-entry-selection-groups-and-reserve] Participants by group, with the entered dogs below in reserve order

The panel's *{t:eventManagement.participantSelection.title}* section shows, per class, how many dogs have been picked against
the number of places. If there are more participants than the places saved in the trial's details,
the figure turns red and the participant notification cannot be sent until the extra dogs have been
dragged back to the entered list.

The order within a group is the dogs' running order. It can be changed by dragging, or from the
row's menu (⋮) with **{t:registration.moveToPositionDialog.moveToPosition}**, which asks for the day and the position number.

The dogs left under *Ilmoittautuneet* are on the reserve list in the order they appear. That order
can be changed by dragging until the reserve notifications have been sent; after that the list locks,
because the reserves have already been told their position. The lock can be lifted from the option
below the list if need be, but then the reserve notifications are best sent again.

## Participant notification

Once a class's participants have been picked, they are told about their place class by class with
the panel's **{t:eventManagement.participantSelection.sendPlaceNotification}** button. The dialog that opens shows the number of
recipients, the message template and its preview. An extra message can be written into the template,
and *{t:event.contactInfo}* picks which of the secretary's and the chief officer's details the message
gives.

!shot[SendMessageDialog/send-message-dialog-open] Sending a message: template, extra message, contact details and preview

The message asks the entrant to confirm their participation. The confirmation shows on the row as a
tick. After sending, the calendar says which addresses the message went to, the list's *Viesti*
(message) column shows the time of the latest send, and if delivery to some address fails, the row
gets a red letter icon.

Once the participant notifications have gone out, the panel no longer lets a participant be moved
back to the reserve list. If a new dog is then raised from the reserve list to the participants, the
calendar asks for confirmation and sends it the participant notification automatically, and the invitation
too if the invitations have already gone out.

## Reserve notification

First check that the order of the *Ilmoittautuneet* list is right, because the reserve notification
tells everyone their position. Then press the panel's **{t:eventManagement.participantSelection.sendReserveNotification}**. The message
dialog works the same way as for the participant notification.

## Invitation

Invitations are sent class by class from the panel's *{t:eventManagement.invitation.delivery}* section with the **{t:eventManagement.invitation.send}** button. The invitation is an email that can be extended with an extra message. If the
extra message does not have room enough, a separate PDF file is attached with the same section's
**{t:eventManagement.attachment.addPdf}** button before sending; the recipient gets the attachment through a link in the message,
which also acknowledges the invitation as read.

!shot[InvitationDelivery/invitation-delivery] Invitation delivery by class, the PDF attachment and the invitations still waiting

If the trial's payment time is *{t:paymentTimeOptions.confirmation}*, each
participant's invitation goes out only once they have paid for their place. The section shows how
many invitations are waiting for payment and sends them by itself when the payment arrives. A
payment that arrives after the trial no longer brings an invitation. An
acknowledged invitation shows on the row as an opened envelope and an unacknowledged one as a closed
one.

## Start list

Once the invitations have been sent, a class's start list can be published from the panel's *{t:eventManagement.startList.publishing}* section with the **{t:eventManagement.startList.publish}** button. **{t:eventManagement.startList.previewUnpublished}** shows the
list as the participants will see it. A published list updates by itself when participants are moved
or cancellations recorded. Until the morning of the class's first trial day, publishing waits on any
invitations not yet sent. From then on, and once the class has been judged, the list can be published
even if an invitation is still unsent. An invitation can still be sent on the trial day too.
A published list can be hidden at any time with **{t:eventManagement.startList.hide}**.

!shot[StartListPublishing/start-list-publishing] Start list publishing by class

The public list shows the dogs in alphabetical order, noting that the start order is not confirmed
yet, until the start numbers have been published. The secretary's own version opens with the
*{t:eventManagement.actions}* section's **{t:eventManagement.startList.secretary}** button: it also has the dog's identification mark and
the handler's contact details, and from it the dogs can be copied class by class straight into a
results spreadsheet. If the order is changed after the spreadsheet has been made, remember to update
the spreadsheet too.

!shot[StartListGroup/startlist-secretary-group] The secretary's start list

## Start numbers

Start numbers are drawn at the venue and recorded in the calendar with the **{t:eventManagement.enterStartNumbers}**
button in the panel's *{t:eventManagement.startList.numbersPublishing}* section. Under the title you see which trial the numbers are for. The page lists the day's and class's dogs
as rows, and the number each drew is typed in. If the day has morning and afternoon groups, the
rows are divided by headings for the two. A number belongs to one dog in the whole trial: in a
two-day trial, for example, Friday 1–24 and Saturday 25–48, and the same number twice blocks the
save.

!shot[StartNumbersEntry/start-numbers-entry-secretary] Entering the start numbers for a day's and class's dogs

If the classes have class secretaries of their own, they are given the entry page's links from the
**{t:startNumbers.linksTab}** tab after the class tabs. The tab has a row for every class of the
trial: **{t:startNumbers.copyLink}** copies the class's link to the clipboard, and the link works
without signing in and only for that class's numbers. **{t:startNumbers.revokeLink}** closes the
class's shared links; the next copy gives a new one.

!shot[StartNumbersEntry/start-numbers-entry-links] The class secretaries' links are handed out from a tab of their own

Once all of a day's numbers have been saved, they are published class by class (in a multi-day
class day by day) with **{t:eventManagement.startList.publishNumbers}**. A half-entered day cannot be published; the
calendar then asks for all the numbers first. The numbers wait on the invitations the same way the
start list does: until the morning of the class's first day the row reads
*{t:eventManagement.startList.invitationsRequired}* and the numbers cannot be published. If the trial draws no numbers at all, publishing
confirms the start list's running numbers as the dogs' start numbers as they are.

!shot[StartNumbersPublishing/start-numbers-publishing-two-days] A two-day class publishes its numbers one day at a time

If a day has morning and afternoon groups, there is a button for each of the two in place of the
class's or the day's: the morning's numbers can be published right after its draw, even while the
afternoon's draw is still to come. On the public start list the afternoon's dogs are then still
without a number. Once both halves are published, the day is published as a whole.

!shot[StartNumbersPublishing/start-numbers-publishing-half-day] The morning's numbers go out before the afternoon's draw

## Teams

A trial can run a team competition, whatever its type. The teams are set up with the
**{t:eventManagement.teams}** button in the panel's *{t:eventManagement.actions}* section. Type how
many teams the competition has in **{t:teams.count}**, and the page shows that many teams, numbered:
Team 1, Team 2 and so on. Lowering the number removes teams from the end, and their dogs become free
for the other teams. A number of zero means the trial has no team competition. Above the teams is the panel
*{t:teams.settings}*, which always shows, so the competition can be set up before there are any
teams.

A team can have a name besides its number, such as Team Finland 1, in **{t:teams.name}**. The
choice **{t:teams.primary}** marks the team as the first team of its club or kennel. The system does
not know which club or kennel a team belongs to, so it does not limit the first teams to one per
club: the marks are the secretary's to keep right. Dogs are
added to a team from **{t:teams.addDog}**, which offers the trial's entries that have not cancelled
and are not in a team already. A dog can therefore be in one team only. Until the participants of a
dog's class have been picked, a dog on the reserve list can be added too; once the class is picked,
the list offers only its dogs picked as participants. A dog already in a team is not affected. A team
can hold at most 26 dogs.

!shot[EventTeamsPage/teams-candidates] In a picked class the list offers only the participants: the reserve dog and the cancelled one are missing

A dog's identifier in its team follows the order the dogs were added: the dogs of team 1 are 1A, 1B,
1C and so on. To change an identifier, move the dog up or down with the arrows on its row; the bin
removes it from the team. When a dog is removed, the dogs after it move up, so removing 1B makes the
old 1C into 1B. If a team's dog cancels, it stays where it is, marked *{t:teams.memberCancelled}*,
and the others keep their identifiers until you remove it yourself. A dog on the reserve list is
marked *{t:teams.memberReserve}*.

!shot[EventTeamsPage/teams] The teams with their dogs and identifiers

In a trial where dogs score points (NOWT), each team has a line *{t:teams.result}* once the first
result is recorded: the team's place and points over the whole trial. The points are the team's
dogs' points added up, whatever their class and day, and a dog with no result yet brings no points.
Teams level on points share a place. When teams are level for first place, each of them has the
choice **{t:teams.runOffWon}**. Mark the winner of the run-off task there and save: the winner moves
to first place and the others share the next one. Marking one team clears the mark from the others.
If a result is later corrected so that the teams are no longer level, the mark has no effect.

!shot[EventTeamsPage/teams-standings] The team results: teams 1 and 2 are level on points, and team 2 is marked as the winner of the run-off

### Team at entry

To have the participants name their dog's team, tick **{t:teams.askAtEntry}** under *{t:teams.entry}*
in the panel *{t:teams.settings}* and save before entry opens. The entry form then has a section
where the participant types the team's name and can mark it the first team of their club or kennel
([Entering](/docs/participant/entering)). Clearing the choice stops the form asking, and the names
already given stay.

From the names given, the page has a panel *{t:teams.suggestions}* with one suggestion for each
name. Names that differ only in capital letters or spacing are the same team, and a suggestion is
named as the first participant to enter wrote it. A suggestion holds the dogs that could be added to
a team from **{t:teams.addDog}** and are in no team yet, in the order they entered. If any of the
dogs marked the team its first team, the suggestion reads *{t:teams.primary}*. The button
**{t:teams.takeSuggestionShort}** makes the suggestion a team: it fills the first empty team, with
no name and no dogs, or adds a new team at the end. The empty team keeps its series, and its
first-team mark comes from the suggestion. If more dogs gave the name than a team holds, the
suggestion says so, and once made a team it says how many dogs a team can hold: it can be saved only
once the extra dogs have moved to other teams. The team's name, dogs and first-team mark can
then be changed like any other team's, and **{t:save}** stores the changes.

!shot[EventTeamsPage/teams-suggestions] The question at entry is on, and Kultaiset Noutajat, given in two spellings, is one suggestion with the first-team mark

### Moving a whole team

Each team shows whether its dogs are participants, on the reserve list or some of each.
**{t:teams.toParticipants}** moves the team's dogs on the reserve list to the participants, each to
the day and group it entered, and **{t:teams.toReserve}** moves the team's participants to the
reserve list. A dog that cancelled is not moved.

If the move sends the dogs a confirmation of their place, that is, once the class's participants are
picked, Koekalenteri asks first and names the dogs the message goes to. The dogs are moved one class
at a time. If a class fails to move, the dogs of the other classes still move, and Koekalenteri
names the dogs that were not moved.

The moves follow the same rules as the class's participant view. Once the class's participants are
picked, its participants cannot be moved to the reserve list, and once the class's entries are closed
(the trial is over or the class judged), its dogs cannot be moved at all; the reason shows under the
button. A dog with no class, or whose class has no group to move it to, stays where it is, and
Koekalenteri names it after the move.

A team is moved as it is saved: while the page has changes not saved, the move buttons wait for
the save. While a move runs, the buttons wait for it to finish.

!shot[EventTeamsPage/teams-move] One of the team's dogs is a participant and one on the reserve list, so the team can be moved either way

### Litter teams

If the teams are made of dogs of one litter, as in a derby, tick **{t:teams.litters}** under
*{t:teams.litterTeams}* in the panel *{t:teams.settings}*. The panel *{t:teams.suggestions}* then also
suggests a team for each litter with at least two dogs in the trial: the dogs with the same sire, dam
and birth day that are in no team yet and gave no team name. A suggestion is named after the breeder
of the first dog entered, or after the parents (Sire x Dam) where no breeder was given. A team name given
at entry comes before the litter: the dog that gave it is in the name's suggestion.

A dog of a litter team is marked *{t:teams.otherLitter}* when it is of another litter than most of the
team's dogs (on a tie the team's first dog whose litter is known decides), and
*{t:teams.unknownLitter}* when its sire, dam or birth day is not known. The mark is a reminder only: the team can be saved all the same.

!shot[EventTeamsPage/teams-litters] A litter team with one dog of another litter and one whose litter is not known

### Series

A team competition may have several series, for example an open series and a breed series. Series
are added above the teams, in the panel *{t:teams.settings}* under *{t:teams.series}*, with **{t:teams.addSeries}**. Each series is
given a name in Finnish and, if wanted, in English; the English name shows on the start list in
English. When there are series, each team has the choice **{t:teams.teamSeries}**, which puts the
team in a series. A team can also be in no series (*{t:teams.noSeries}*).

Each team is placed within its own series: every series has its own first place and, for a tie, its
own run-off task, and the teams in no series are placed among themselves. Removing a series with the
bin leaves its teams in no series. A series' name can be changed at any time; the start list always
shows its current name.

!shot[EventTeamsPage/teams-series] Two series: teams 1 and 3 are in the open series and team 2 in the breed series, so teams 1 and 2 are each first in their series

### Days counted

In a trial of several days you can choose which days' results count for the teams' points, for
example a derby's qualifying day but not its final. The choice is in the same panel as the series,
*{t:teams.settings}*, under *{t:teams.countedDays}*. By default every day counts. Clearing a day leaves its results out of the teams'
points. At least one day must be chosen, so the last day counted cannot be cleared: to switch the
day, choose the new day first and then clear the old one. Once every day is chosen again, every day counts, also a day added to the trial
later. If the trial's days change, the days it no longer has drop out of the choice, and a copy
moves the choice with the trial.

When only some days count, a team's result ends with the days its points come from, on the teams
page and on the public start list alike.

!shot[EventTeamsPage/teams-counted-days] A two-day trial counting only its first day: the second day's dog adds nothing to team 2, and every team's result reads *from the results of Wed 10.2.*

**{t:save}** stores the changes. **{t:cancel}** goes back to the event without saving.

The saved teams show on the public start list, which opens by team
([Start list and results](/docs/participant/start-list)). The list shows only published dogs: a dog
on the reserve list or not yet published is not shown, and a team none of whose dogs is published
is not shown at all. A series' places and points show on the list once the results of every dog of
its teams are published and they are all on the list: a dog whose start number has not been entered
keeps the result of every team in its series hidden. A change to the teams, to the series, to the
run-off winner or to the results reaches open start lists by itself.

## Cancellations and refunds

A cancellation is recorded and a payment refunded the same way as while entry was open: from the
row's menu (⋮) with **{t:registration.actions.cancel}** or by dragging into *Peruneet* (cancelled), and with
**{t:registration.actions.refundPayment}**. When a participant cancels, the next dog on the reserve list is raised to the
freed place, and the calendar sends it the participant notification and the invitation by itself.

Payments charged twice are refunded from the notice above the class lists, when one shows
([Payments](/docs/admin/payments)).

The running order within a group closes up automatically after a cancellation. Start numbers already
entered, on the other hand, stay as they are, so published numbers do not change because of a
cancellation.

## Payment request

When the fee or part of it is unpaid and the entrant can pay it, the row's menu (⋮) has
**{t:registration.actions.requestPayment}**. It opens the message dialog with the
*{t:emailTemplate.payment-request}* template, and the message also goes to the person marked as
the payer. The payment request can still be sent for a week after the trial's last day, even
though the row's other actions have closed and the class may have been judged, so a fee left
unpaid can be collected after the trial. The entrant can pay during the same week; after that a
payment can no longer be started.

## Fixing a dog's details after the trial

Once the trial is over or the class has been judged, an entry opens read-only. For a dog entered by
hand (the registration number says *{t:registration.cta.helper.typed}*), the registration number, ID
marking, sex, date of birth and breed stay editable all the same, so that the results can be sent to
the Kennel Club. The ID marking must be the microchip's 15 digits. A corrected registration number must
be in its registry's form; only the number changes and nothing is fetched from the Kennel Club, so type
it and save the entry. The details of a dog fetched from the Kennel Club stay locked.

The registration number of any dog locks as soon as its result has gone to the Kennel Club, or a sending
got no answer and the Kennel Club may hold the result, also while the trial is still running. A result
the Kennel Club refused leaves the number open.

## A message to the participants

A free-form message, such as a change of schedule, can be sent with the **{t:eventManagement.message.action}** button in
the panel's *{t:eventManagement.actions}* section. First pick, class by class, whether the message goes to the
participants, the reserves or both, and then write the message in the same dialog as the participant
notification.

!shot[MessageRecipientsDialog/message-recipients] The message's recipients are picked class by class

## Sending the results to Kennelliitto

After the trial, the results are sent to Kennelliitto's Omakoira with the **{t:results.kennelliitto.send}**
button in the panel's *{t:results.kennelliitto.title}* section. The dialog first tells how many results
go and which dogs cannot go and why. A foreign dog Kennelliitto does not know is added there before its
result. After the sending, the dialog tells which dogs' results were saved in Omakoira and which were not.
The failed ones list, each with its reason, both the dogs whose result Kennelliitto refused and the dogs
that could not be sent.

Kennelliitto may know a foreign dog by another registration number, for example when the dog has been
registered again in Finland. Koekalenteri then looks for the dog by its microchip and its name too, and
such dogs are shown before the sending in one view: Koekalenteri's and Kennelliitto's details side by
side, with the differences highlighted. Choose for each dog whether its registration number is changed
to the one Kennelliitto knows or its result is left unsent for now. The change is chosen already when the microchip is the same.
**{t:results.kennelliitto.regNo.confirm}** saves the changed numbers on the entries and sends the results,
and **{t:results.kennelliitto.regNo.back}** goes back without changing anything.

!shot[KennelliittoSendDialog/kennelliitto-send-regnos] The dogs Kennelliitto knows by another number, in one view

In a WT trial, the points go to Omakoira as they are. Where Omakoira does not take the points for the
dog's result, the result is sent again with 0 points. After the sending, the dialog lists these dogs with
their real points, and the points are entered in Omakoira by hand until Kennelliitto fixes its interface.
The dialog names these dogs at the start of later sendings too, until Omakoira takes the points. If a dog
is sent again, for example for a corrected result, the sending tries the points first and sends 0 only if
Omakoira refuses them again.

!shot[KennelliittoSendDialog/kennelliitto-send-points-by-hand] The dogs whose points are entered in Omakoira by hand

A sent result shows dimmed on the dog in Koiranet until the judge has confirmed it. The result can be
corrected on the results page and sent again until the trial is handed over to the judge. When what
would go to Omakoira changes, also through a placement another dog's result moved or through the judges,
the dog reads *{t:results.kennelliitto.badge.changed}* in the *{t:results.kennelliitto.column}* column,
and the send dialog counts it among the changed results. Sending again sends only the new and changed
results; the unchanged ones are not sent again.

When the results have been sent, the trial is handed over to the chief judge with the
**{t:results.kennelliitto.handOverButton}** button. The hand-over dialog lists the results that still
have to be sent first, and the dogs whose result cannot be sent: those can be left out of the hand-over.
Once the trial has been handed over or the judge has confirmed
the results in Omakoira, the results can no longer be edited in Koekalenteri or in Omakoira:
the results page opens read-only and says so. If the judge returns the trial, editing opens again: the
results page reads the trial's state from Kennelliitto whenever it is opened, and the locked page's
**{t:results.kennelliitto.refreshState}** button reads it at once.
