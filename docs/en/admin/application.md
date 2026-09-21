---
title: For the application administrator
audience: admin
order: 70
covers:
  - src/pages/admin/EventTypeListPage.tsx
  - src/pages/admin/eventTypeListPage/**
  - src/pages/admin/EmailTemplateListPage.tsx
  - src/pages/admin/emailTemplateListPage/**
sourceHash: 03bbbd
---

The application administrator — SNJ's calendar contact — sees a section of their own at the foot
of the admin menu: **{t:organizations}**, **{t:eventTypes}**, **{t:emailTemplates}** and
**{t:stats.admin.eventBreakdownTitle}**. Clubs are described in the *Payments* guide and the event
breakdown in the *Statistics* guide; this page covers the other two.

## Event types

The list of event types comes from the Kennel Club's interface, and is refreshed from there with
the button above the list. The columns are *{t:eventType.eventType}*, *{t:official}*,
*{t:active}* and *{t:eventType.description}* in the chosen language.

*{t:active}* decides whether the event type is offered in an event's details and in the
statistics' pickers. Switch off the Kennel Club's event types that are not held in the calendar,
so the secretary's list stays short.

An event type the Kennel Club does not know — an unofficial practice trial, say — can be added
with **{t:eventType.create}**. The dialog takes *{t:eventType.createDialog.eventType}*, which is
stored in capitals and has to be new, and a description in Finnish, English and Swedish. The
added event type is in use at once and marked unofficial.

## Message templates

The calendar's emails are sent from templates edited on the **{t:emailTemplates}** page. The list
on the left names the messages, and the chosen template opens for editing on two tabs,
*{t:locale.fi}* and *{t:locale.en}* — an entrant gets the message in the language they entered in.

| Message | When it is sent |
| --- | --- |
| *{t:emailTemplate.registration}* | when the entry has been received |
| *{t:emailTemplate.receipt}* | when a payment has succeeded |
| *{t:emailTemplate.payment-request}* | when the secretary sends a payment request, or payment is set for confirmation |
| *{t:emailTemplate.picked}* and *{t:emailTemplate.reserve}* | sent by the secretary after picking the participants |
| *{t:emailTemplate.invitation}* | sent by the secretary, or by itself once a payment arrives |
| *{t:emailTemplate.message}* | the secretary's free-form message |
| *{t:emailTemplate.refund}* | after a payment is refunded |
| *{t:emailTemplate.cancel-picked}*, *{t:emailTemplate.cancel-reserve}* and *{t:emailTemplate.cancel-early}* | when an entrant cancels, according to the entry's stage |
| *{t:emailTemplate.access}* | when a user is given a role |

The templates are in Handlebars form: the message's data is written in double braces, and the
editor suggests the fields each message has as you type. A field the message does not have is
underlined as an error before saving. **{t:save}** puts the template into use from the next
message on; **{t:cancel}** restores the saved version.
