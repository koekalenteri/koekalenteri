---
title: Your entry
audience: participant
order: 20
covers:
  - src/pages/RegistrationListPage.tsx
  - src/pages/registrationListPage/**
  - src/pages/RegistrationEditPage.tsx
  - src/pages/RegistrationInvitation.tsx
  - src/pages/components/CancelDialog.tsx
  - src/pages/components/RegistrationEventInfo.tsx
sourceHash: 862400
---

The link in your confirmation email opens your entry's own page, headed **{t:entryList}**. The
same link works for the whole trial: through it you pay, accept your place, change your details
and, if need be, cancel the entry. The calendar's other messages — the place notification, the
reserve notification and the invitation — each lead to the same page, usually straight to the
part the message is about.

The top of the page shows the trial: its dates, venue, organizer, judges, entry period and the
contact details the organizer chose to show. Below it are your own status, the dog you entered
and **{t:paymentDetails}**, which itemizes the price of your entry with the choices you made.

## Your status at a glance

The box on the right says three things: whether you have priority, whether the fee is settled
and what stage your entry is at.

!shot[InfoBox/info-box-part-missing] The status box, with part of the fee still unpaid

| Line | What it can say |
| --- | --- |
| priority | *{t:registration.priority.hasPriority}* or *{t:registration.priority.noPriority}* — the grounds for priority are in the trial's details |
| payment | *{t:paymentStatus.success}*, *{t:paymentStatus.missing}*, *{t:paymentStatus.waitingForConfirmation}* or *{t:paymentStatus.pending}*; when part of the fee is missing, the line names the amount |
| stage | *{t:registration.status.received}*, *{t:registration.status.placeOffered}*, *{t:registration.status.confirmed}*, *{t:registration.status.confirmedAndInvitationRead}* or *{t:registration.status.cancelled}* |

The same facts appear as icons on the dog's row; hover over the icons to see what they mean.

## Paying

When there is something to pay, the payment line has a **{t:registration.cta.pay}** button and
the dog's row a euro sign named *{t:registration.actions.pay}*. Both take you to Paytrail's payment
page. When you return from the payment, the page says *{t:registration.notifications.paymentVerifying}*
and the status updates by itself in a moment.

The button shows only while something is unpaid. If the trial is paid only once your place is
confirmed, the payment line reads *{t:paymentStatus.waitingForConfirmation}* until then, and the
button appears once you have accepted the place. Something may also become payable later, if the
secretary corrects your entry so that its price rises — by removing a membership tick, say. The
line then names the missing amount and the button comes back. Once you have paid the missing
part, you get a receipt and the message *{t:registration.email.subject_update}*.

If the secretary refunds part of the payment, the overpaid part say, the payment details show a
*{t:registration.refunded}* line under the amount paid, and what is left to pay is counted after
the refund.

## Accepting your place

Once the secretary has picked the participants, you get a place notification. Its link opens the
page and the dialog **{t:registration.confirmDialog.title}**; the same dialog opens from the status
box's **{t:registration.confirmDialog.cta}** button while the stage is
*{t:registration.status.placeOffered}*. Accepting tells the secretary you are taking the place, and
shows on your row as a tick.

If payment was set for confirmation, accepting is followed by the dialog
**{t:registration.paymentDialog.title}**, whose **{t:registration.paymentDialog.cta}** button
takes you to pay. The invitation is sent to you only once the place has been paid.

## Changing your details

In the menu at the right end of the dog's row (⋮), **{t:registration.actions.edit}** opens the
same form you entered with. Changes are saved with **{t:registration.cta.saveChanges}**. The form
can be edited while entry is open; once entry has closed or the trial has started, the details
are shown but can no longer be changed — changes are then arranged with the secretary. A cancelled
entry opens under the heading *{t:registration.state.cancelled}*.

## Cancelling the entry

Cancel the entry from the row's menu (⋮) with **{t:registration.actions.cancel}**. The dialog
says which dog's entry to which trial you are cancelling and asks for the reason: the dog in
season, the handler or the dog taken ill, another reason, or *{t:registration.cancelReason.gdpr}*.
For an illness, the dialog reminds you that a refund needs a doctor's or a vet's certificate sent
to the secretary. **{t:registration.cancelDialog.cta}** takes effect at once, and the secretary is
told.

!shot[CancelDialog/cancel-dialog-open] The reason is picked before confirming

On the trial's first day and the day before it, cancelling cannot be done in the calendar; the
dialog asks you to contact the secretary directly. The refund terms are in the Kennel Club's
rules, which the link at the foot of the dialog opens.

## The invitation

The invitation arrives by email. Opening its link marks the invitation as read, and the secretary
sees that. If the invitation carries an attachment, the link opens a page with the trial's and
the dog's details and the buttons **{t:invitation.open}** and **{t:invitation.download}**; if the
organizer has updated the attachment, the page says when. Without an attachment the link goes
straight to your entry's page, where the stage is now
*{t:registration.status.confirmedAndInvitationRead}*.

!shot[RegistrationInvitation/registration-invitation-open] The invitation's attachment is opened or downloaded
