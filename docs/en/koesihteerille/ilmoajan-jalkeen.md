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
  - src/pages/admin/eventViewPage/SendMessageDialog.tsx
  - src/pages/admin/eventViewPage/MessageRecipientsDialog.tsx
  - src/pages/admin/eventStartNumbersPage/**
  - src/pages/admin/startListPage/**
sourceHash: bd85de
---

Once entry has closed, the secretary's work goes step by step: picking the participants, the
participant and reserve notifications, the invitations, the start list and finally the start numbers
drawn at the venue. The event page's **Event management** panel runs in the same order and says at
every step what has been done and what is possible next — a button that cannot be pressed yet has
its reason beside it.

## Adding an entry afterwards

The secretary can add a dog to the trial even after entry has closed. Press **Add new registration**
in the panel's *Actions* section and fill in the dog's details on the same form the entrants use
themselves. Once everything required is in place, **Confirm and send payment link** emails the payment
link to the person marked as the payer, and the entry shows as unpaid until the payer has settled it.
If the trial's payment time is *Payment after the event place has been confirmed*, the button is
**Confirm registration** and the payment link goes out with the participant notification instead.

## Checking eligibility

The calendar fetches the dog's trial results from the Kennel Club's breeding database and checks the
right to enter the class itself. Only the dogs whose row shows results added by the entrant need
checking by hand — the exclamation mark icon marks them. The row's icons explain themselves when the
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
| exclamation mark | the entrant has added trial results themselves — **check eligibility** |
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

The panel's *Participant selection* section shows, per class, how many dogs have been picked against
the number of places. If there are more participants than the places saved in the trial's details,
the figure turns red and the participant notification cannot be sent until the extra dogs have been
dragged back to the entered list.

The order within a group is the dogs' running order. It can be changed by dragging, or from the
row's menu (⋮) with **Move to start position**, which asks for the day and the position number.

The dogs left under *Ilmoittautuneet* are on the reserve list in the order they appear. That order
can be changed by dragging until the reserve notifications have been sent; after that the list locks,
because the reserves have already been told their position. The lock can be lifted from the option
below the list if need be, but then the reserve notifications are best sent again.

## Participant notification

Once a class's participants have been picked, they are told about their place class by class with
the panel's **Send participant notification** button. The dialog that opens shows the number of
recipients, the message template and its preview. An extra message can be written into the template,
and *Contact details* picks which of the secretary's and the chief officer's details the message
gives.

!shot[SendMessageDialog/send-message-dialog-open] Sending a message: template, extra message, contact details and preview

The message asks the entrant to confirm their participation. The confirmation shows on the row as a
tick. After sending, the calendar says which addresses the message went to, the list's *Viesti*
(message) column shows the time of the latest send, and if delivery to some address fails, the row
gets a red letter icon.

Once the participant notifications have gone out, the panel no longer lets a participant be moved
back to the reserve list. If a new dog is then raised from the reserve list to the participants, the
calendar asks for confirmation and sends it the participant notification — and the invitation, if
the invitations have already gone out — automatically.

## Reserve notification

First check that the order of the *Ilmoittautuneet* list is right, because the reserve notification
tells everyone their position. Then press the panel's **Send reserve notification**. The message
dialog works the same way as for the participant notification.

## Invitation

Invitations are sent class by class from the panel's *Invitation delivery* section with the **Send
invitation** button. The invitation is an email that can be extended with an extra message. If the
extra message does not have room enough, a separate PDF file is attached with the same section's
**Add PDF** button before sending; the recipient gets the attachment through a link in the message,
which also acknowledges the invitation as read.

!shot[InvitationDelivery/invitation-delivery] Invitation delivery by class, the PDF attachment and the invitations still waiting

If the trial's payment time is *Payment after the event place has been confirmed*, each
participant's invitation goes out only once they have paid for their place. The section shows how
many invitations are waiting for payment and sends them by itself when the payment arrives. An
acknowledged invitation shows on the row as an opened envelope and an unacknowledged one as a closed
one.

## Start list

Once the invitations have been sent, a class's start list can be published from the panel's *Start
list publishing* section with the **Publish start list** button. **Preview start list** shows the
list as the participants will see it. A published list updates by itself when participants are moved
or cancellations recorded.

!shot[StartListPublishing/start-list-publishing] Start list publishing by class

The public list shows the dogs in alphabetical order, noting that the start order is not confirmed
yet, until the start numbers have been published. The secretary's own version opens with the
*Actions* section's **Secretary's start list** button: it also has the dog's identification mark and
the handler's contact details, and from it the dogs can be copied class by class straight into a
results spreadsheet. If the order is changed after the spreadsheet has been made, remember to update
the spreadsheet too.

!shot[StartListGroup/startlist-secretary-group] The secretary's start list

## Start numbers

Start numbers are drawn at the venue and recorded in the calendar with the **Enter start numbers**
button in the panel's *Publishing start numbers* section. The page lists the day's and class's dogs
as rows, and the number each drew is typed in. A number belongs to one dog in the whole trial: in a
two-day trial, for example, Friday 1–24 and Saturday 25–48, and the same number twice blocks the
save.

!shot[StartNumbersEntry/start-numbers-entry-secretary] Entering the start numbers for a day's and class's dogs

If a class has a class secretary of its own, they can be given the entry page's link with **Copy the
class secretary's link**; the link works without signing in and only for that class's numbers.
**Revoke the class links** closes the shared links.

Once all of a day's numbers have been saved, they are published class by class — and in a multi-day
class day by day — with **Publish start numbers**. A half-entered day cannot be published; the
calendar then asks for all the numbers first. If the trial draws no numbers at all, publishing
confirms the start list's running numbers as the dogs' start numbers as they are.

!shot[StartNumbersPublishing/start-numbers-publishing-two-days] A two-day class publishes its numbers one day at a time

## Cancellations and refunds

A cancellation is recorded and a payment refunded the same way as while entry was open: from the
row's menu (⋮) with **Cancel registration** or by dragging into *Peruneet* (cancelled), and with
**Refund payment**. When a participant cancels, the next dog on the reserve list is raised to the
freed place, and the calendar sends it the participant notification and the invitation by itself.

The running order within a group closes up automatically after a cancellation. Start numbers already
entered, on the other hand, stay as they are, so published numbers do not change because of a
cancellation.

## A message to the participants

A free-form message, such as a change of schedule, can be sent with the **Send a message** button in
the panel's *Actions* section. First pick, class by class, whether the message goes to the
participants, the reserves or both, and then write the message in the same dialog as the participant
notification.

!shot[MessageRecipientsDialog/message-recipients] The message's recipients are picked class by class
