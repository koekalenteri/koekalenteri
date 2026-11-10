---
title: Before entry opens
audience: secretary
order: 10
covers:
  - src/pages/admin/EventListPage.tsx
  - src/pages/admin/components/EventForm.tsx
  - src/pages/admin/components/eventForm/**
  - src/pages/admin/eventViewPage/EventStateStepper.tsx
  - src/pages/admin/EventCreatePage.tsx
  - src/pages/admin/EventEditPage.tsx
  - src/pages/admin/OrganizerListPage.tsx
sourceHash: ecd106
---

Once a trial has been created in the calendar, the secretary's job before entry opens is to make
sure of three things: that the trial's details are right, that its state lets entrants in, and
that payments can get through.

## Administration and the event list

Sign in with your credentials and choose **{t:admin}** in the top bar. The event list that
opens shows the trials of every club you have access to.

!shot[EventListPage/event-list-desktop] The event list in administration

The list can be shaped to suit you: **Columns** picks the visible columns, the search box narrows
the rows, the **{t:organization}** selector shows one club's trials only, and **{t:showFinishedEvents}** brings the finished ones into the list too. A trial that
has ended stays in the list until its results are published in every class, it is cancelled or 30
days have passed since it ended. Clicking a row enables the buttons at the
top: *{t:edit}*, *{t:copy}*, *{t:delete}* and *{t:registrations}*. *{t:delete}* is available only when
the trial's state is *{t:event.states.draft}*, *{t:event.states.tentative}* or
*{t:event.states.cancelled}*.

## 1. Check the trial's details

Pick the trial in the list and press **{t:edit}**. The form is divided into sections — event details,
the Kennel Club's trial id, judges, entry, payment, headquarters, contact details and additional
information — and each opens and closes from its heading.

!shot[EventForm/event-form-desktop] The trial's details open for editing

The form says itself what is missing: an incomplete section gets a red note, such as *State
"Published": classes ALO, AVO, VOI have no judge*, and **{t:save}** enables only once everything
required is in place. Go through the sections and check in particular:

- **the dates** — the trial's first and last day, and when entry opens and closes; the days' groups,
  the places per day, the posts with their groups and the team competition's counted days move with
  the days, and those of a day that drops out of the trial are removed,
- **classes, groups and the number of places** — places can be given in total, per day or per class,
- **{t:event.officialFormat}**: an unofficial trial can follow an official one (NOU, NOME-B, NOME-A
  or NOWT). Its classes, entry times, places, reserve list, posts and result entry then work as in
  that trial, and a result is written under its name, for example NOU1. Such a trial asks for no
  judges: neither the official trial's number of judges nor a judge for each class. A trial
  following NOWT or NOME-B needs its classes, chosen or its own, before its state can be set to
  Published. A trial's own classes use the posts as the followed trial's classes do. Who may enter,
  the Kennel Club and the statistics stay the unofficial trial's own. The choice can be changed
  until the first result or post turn is saved. Once the trial has entries, the choice cannot give
  the trial classes or take them away. If it is changed after entries, the post and start number
  links must be sent again, and the entry times the entrants chose stay as they are. When the trial
  stops following NOWT or changes type, its own scoring of the exercises goes.
- **{t:event.ownClasses.title}**: an unofficial trial can have classes of its own, for example YKS
  and VET. **{t:event.ownClasses.add}** adds a class, which gets a code and a name in Finnish and,
  if wanted, in English. The code is written in capitals, starts with a letter, has at most 10
  letters or digits, and cannot be the name of an event type. The code shows in links and in the
  administration, the name to entrants, on the start list and in emails. The classes show everywhere
  in the order the arrows put them in. Own classes replace the official classes: a trial cannot have
  both. Adding the first own class removes the official classes already chosen under
  **{t:event.classes}**. On a one-day trial a class gets the trial's
  day as soon as it has a code; on a longer trial its days are chosen under **{t:event.classes}**.
  A class's row says what to correct before saving. Once a class has entries, its code cannot be
  changed and the class cannot be removed. A class removed takes its groups in the running order
  on the posts page with it. Once the trial's classes have entries, the trial cannot
  take up own classes or drop them by changing its type. Cancelled and unpaid entries count too; if
  the save is refused because of them, Koekalenteri names the classes,
- **the judges and the classes each of them judges**,
- **{t:event.kcIdSectionTitle}**: the trial is linked to the Kennel Club event so that the results can be saved,
- **contact details** — which of the chief officer's and the secretary's details entrants may see.

!shot[BasicInfoSection/basic-info-section-own-classes] Two own classes: VET still lacks its Finnish name and its day

If you leave the form with unsaved changes, it asks first: **{t:unsavedChanges.stay}** keeps you on
the form, and **{t:unsavedChanges.leave}** discards the changes. Closing or reloading the tab gets the
browser's own question. **{t:cancel}** discards the changes at once without asking.

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
