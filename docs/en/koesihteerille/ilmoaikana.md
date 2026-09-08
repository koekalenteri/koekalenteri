---
title: While entry is open
audience: secretary
order: 20
covers:
  - src/pages/admin/EventViewPage.tsx
  - src/pages/admin/eventViewPage/ClassEntrySelection.tsx
  - src/pages/admin/eventViewPage/classEntrySelection/**
  - src/pages/admin/eventViewPage/InfoPanel.tsx
  - src/pages/admin/eventViewPage/RefundDialog.tsx
  - src/pages/admin/eventViewPage/RegistrationEditDialog.tsx
sourceHash: 6c3934
---

While entry is open the calendar does most of the work by itself: entries accumulate, payments
are recorded, and entrants change and cancel their own entries through their own links. What is
left for the secretary is keeping an eye on things, and the cancellations and refunds that do not
arrive through the calendar.

## Keeping an eye on the entries

Pick the trial in the event list and press **Registrations** — or double-click the trial. On the
event page each class has a tab of its own, and the class's entries are divided into three
sections:

| Section | Who is in it |
| --- | --- |
| Osallistujat (participants) | those who have a place, grouped by trial day and group |
| Ilmoittautuneet (entered) | everyone else who entered; while entry is open, practically everyone |
| Peruneet (cancelled) | those who cancelled, with their reason |

Every new entry lands in *Ilmoittautuneet* and stays there until the secretary moves it to the
participants once entry has closed. These three headings are shown in Finnish whichever language
the rest of the page is in.

!shot[ClassEntrySelection/class-entry-selection-groups-and-reserve] A class's entries in their three sections

The **Event management** panel on the right shows, per class, how many have been moved to the
participants, how many are on the reserve list and what the calendar expects next. Its *Audit
trail* tab lists everything that has been done to the trial.

!shot[InfoPanel/info-panel] The Event management panel

Keeping an eye on things needs no action of its own. If entries come in such numbers that another
judge is engaged, the trial's details are edited with the event list's **Edit** button: the judge
is added in the Judges section and the number of places raised in the Entry section.

## Recording a cancellation

An entrant can cancel through the link in their confirmation message, and then the cancellation
shows under *Peruneet* with its reason. Not everyone does, though; some send the cancellation by
email — and then the secretary records it:

- open the menu at the right end of the entry's row (⋮) and choose **Cancel registration**, or
- drag the entry into *Peruneet*.

The cancellation takes effect at once. Cancelled entries stay visible in their own section, so
nothing is lost.

## Refunding a payment

If an entry is cancelled for an acceptable reason, the payment can be refunded right away. Open the
menu on the entry's row (⋮) and choose **Refund payment**.

!shot[RefundDialog/refund-dialog-open] Refunding a payment

The dialog lists the entry's payments. Pick the one to refund, enter a *Handling fee* if the club
keeps one, and add an internal comment if you like — the entrant does not see it. **Refund** makes
the refund through Paytrail to the same payment method the payment came from. The refunded amount
then shows on the entry's row.

A refund can also be made directly in Paytrail's merchant portal, usually by the club's treasurer.
The treasurer then needs the payment date and the payer's name: both are found by opening the entry
(*Edit registration*) and scrolling to the end, where the entry's audit trail lists the payment
with its time.
