---
title: Before entry opens
audience: secretary
order: 10
covers:
  - src/pages/admin/EventListPage.tsx
  - src/pages/admin/components/EventForm.tsx
  - src/pages/admin/components/eventForm/**
  - src/pages/admin/eventViewPage/EventStateStepper.tsx
  - src/pages/admin/OrganizerListPage.tsx
sourceHash: 96398c
---

Once a trial has been created in the calendar, the secretary's job before entry opens is to make
sure of three things: that the trial's details are right, that its state lets entrants in, and
that payments can get through.

## Administration and the event list

Sign in with your credentials and choose **{t:admin}** in the top bar. The event list that
opens shows the trials of every club you have access to.

!shot[EventListPage/event-list-desktop] The event list in administration

The list can be shaped to suit you: **Columns** picks the visible columns, the search box narrows
the rows, the **{t:organization}** selector shows one club's trials only, and **{t:showPastEvents}** brings the finished ones back into the list. Clicking a row enables the buttons at the
top: *{t:edit}*, *{t:copy}*, *{t:delete}* and *{t:registrations}*.

## 1. Check the trial's details

Pick the trial in the list and press **{t:edit}**. The form is divided into sections — event details,
the Kennel Club's trial id, judges, entry, payment, headquarters, contact details and additional
information — and each opens and closes from its heading.

!shot[EventForm/event-form-desktop] The trial's details open for editing

The form says itself what is missing: an incomplete section gets a red note, such as *State
"Published": classes ALO, AVO, VOI have no judge*, and **{t:save}** enables only once everything
required is in place. Go through the sections and check in particular:

- **the dates** — the trial's first and last day, and when entry opens and closes,
- **classes, groups and the number of places** — places can be given in total, per day or per class,
- **the judges and the classes each of them judges**,
- **{t:event.kcIdSectionTitle}** — it is needed to save the results,
- **contact details** — which of the chief officer's and the secretary's details entrants may see.

## 2. Check the trial's state

The trial's state is the **{t:event.state}** selector at the top of the form. Entry is possible only while
the state is *{t:event.states.confirmed}* and the entry period is running.

| {t:event.state} | What it means |
| --- | --- |
| {t:event.states.draft} | The trial is visible only to your own club's administrators |
| {t:event.states.tentative} | The trial is in the public calendar, but nobody can enter it |
| {t:event.states.confirmed} | The trial takes entries during its entry period |
| {t:event.states.cancelled} | The trial is cancelled and takes no entries |

Once the trial is published, its progress shows on the event page's stepper: entry open,
participants picked, invitations sent, start list published and so on. Those steps are taken from
the event page, not from the State selector — and once the trial has moved into them, the selector
no longer turns the state back.

!shot[EventStateStepper/event-state-stepper] The trial's steps on the event page

## 3. Make sure payments get through

The form's **{t:paymentDetails}** section sets the *{t:paymentTime}*: either *{t:paymentTimeOptions.registration}*, where the entrant pays immediately, or *{t:paymentTimeOptions.confirmation}*, where the payment link goes out with the invitation. The entry fee and the member price are in the same section.

Payments run through the club's own Paytrail agreement. The agreement's merchant id is recorded in
the club's details on the administration's **{t:organizations}** page, but whether the agreement is *active*
can be seen only in Paytrail. Confirm it with the club's treasurer before entry opens — with an
inactive agreement, entry payments fail.
