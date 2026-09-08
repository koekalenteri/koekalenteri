---
title: Entering a trial
audience: participant
order: 10
covers:
  - src/pages/SearchPage.tsx
  - src/pages/searchPage/EventFilter.tsx
  - src/pages/searchPage/eventList/EventListItem.tsx
  - src/pages/RegistrationCreatePage.tsx
  - src/pages/components/RegistrationForm.tsx
  - src/pages/components/registrationForm/**
sourceHash: b02bcd
---

Entering a trial needs no account and no sign-in. All you need is access to the email address you
give on the form: every link to your entry is sent there.

## Find the trial in the calendar

The front page lists upcoming trials. The filters narrow it by date, trial type, class, organizer
and senior judge, and the checkboxes show only the trials whose entry is open or about to open.

Each row gives the date, place, organizer and classes. **Enter** appears on the row only while the
entry period is running; before that, the row says when entry opens.

!shot[SearchPage/search-page-full-desktop] The calendar's filters and two trials with entry open

## Fill in the entry form

The trial's details are at the top of the form and your own sections below. You do not have to open
them in the order they appear.

**Dog.** Type the registration number and press *Fetch dog details*. Koekalenteri reads the name,
breed, date of birth, parents and past trial results from the Kennel Club's API. If the number
returns nothing you get *No results for this registration number* and can fill the details in by
hand — but check the number first, a single typo is enough.

!shot[DogInfo/dog-info-fetched] The dog's details, fetched from the Kennel Club

**Owner, handler and payer.** If the owner handles the dog, tick *Owner handles*, and you need not
type the same details twice. The same goes for the payer. The email address is the field that
matters most: the confirmation goes there, and with it the link you use to change the entry later.

**Membership.** Say whether the handler or the owner is a member of the organizing club. Membership
affects the entry fee.

**Class and days.** Choose the class, and in a multi-day trial the days that suit you. If you enter
for a reserve place, say how short a notice you can still make it to the trial on.

!shot[EntryInfo/entry-info-with-classes] Class, days and the notice you can accept a reserve place on

**Terms and the privacy notice** have to be accepted before the entry can be confirmed.

If the confirm button stays disabled, open *Why can't I continue?* at the bottom of the form — it
lists what is still missing.

## Confirm and pay

The organizer decides whether the trial is paid right away or only once your place is confirmed.
The button says which one it is:

| Button | What happens |
| --- | --- |
| Confirm and pay | You pay immediately through Paytrail, by online bank or card |
| Confirm and send payment link | The entry is saved and a payment link is emailed to you |
| Confirm entry | You pay once the organizer has confirmed your place |

## After entering

The link in the confirmation message opens your entry. Through it you can see what you entered,
change the details for as long as entry is open, and cancel the entry.

The link is personal and it is your only key to the entry, so keep the message. If it is lost,
contact the trial secretary — the contact details are in the trial's information.

Once places have been allocated you will get either an invitation or a notice of a reserve place by
email. The start list and start numbers appear on the trial's page when the organizer publishes
them.
