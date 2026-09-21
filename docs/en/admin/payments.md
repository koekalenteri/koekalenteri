---
title: Payments
audience: admin
order: 40
covers:
  - src/pages/PaymentPage.tsx
  - src/pages/PaymentResultPage.tsx
  - src/pages/components/PaymentDetails.tsx
  - src/pages/admin/OrganizerListPage.tsx
  - src/pages/admin/organizerListPage/**
  - src/pages/admin/eventViewPage/RefundDialog.tsx
  - src/pages/admin/eventViewPage/refundDialog/**
  - src/lambda/lib/payment.ts
  - src/lambda/PaymentCreateFunction/**
  - src/lambda/RefundCreateFunction/**
sourceHash: 9b8f22
---

Koekalenteri is a web shop: the entrant pays the entry fee in the calendar, and the money goes
through Paytrail straight to the organising club. This page says how the payments flow, what a
club has to do before its first trial, and what it costs.

## How a payment travels

The entrant pays on Paytrail's payment page the way they choose: online bank, card or mobile
payment. The payment methods are Paytrail's, not the calendar's, and the selection is whatever
Paytrail offers at the time.

!shot[PaymentPage/payment-page-methods-desktop] Choosing the payment method before going to Paytrail

The trial's details set the *{t:paymentTime}*: either *{t:paymentTimeOptions.registration}*, where
only a paid entry gets through, or *{t:paymentTimeOptions.confirmation}*, where the entry is saved
at once and the payment link goes out with the participant notification. In the latter, the
invitation reaches the entrant only once the place has been paid for.

The payments run as Paytrail's *shop-in-shop*: SNJ is the main merchant, responsible for the
calendar and the technical side of paying, and every club using the calendar is a sub-merchant of
its own. The money does not pass through SNJ:

1. The entrant pays.
2. Paytrail receives the payment, works out the settlements and deducts its fees.
3. Paytrail settles the funds to the club's account monthly. The settlement made on the first of
   the month holds the previous month's payments less the refunds, and is paid on the second
   business day.

The settlement report goes as a PDF to the address set as the reports' recipient on the
*Asetukset* (settings) tab of Paytrail's merchant panel, and every report is found under the
panel's *Tilitysraportit* (settlement reports).

## Refunding a payment

The trial secretary refunds a payment straight from the calendar: from the entry's row menu (⋮),
**{t:registration.actions.refundPayment}**. The refund goes to the payment method the payment came
from, and the club can keep a handling fee of the amount put in the
*{t:registration.refundDialog.handlingCost}* field. With some payment methods Paytrail asks the
entrant for an account number by email, and the refund shows as pending until the entrant has
answered.

!shot[RefundDialog/refund-dialog-open] Refunding a payment from the calendar

A refund only goes through if the club's Paytrail account holds a balance. Right after a
settlement it holds none, and the treasurer then moves money to the account with the merchant
panel's *Siirrä varoja* (transfer funds) function: the sum is paid by online bank and shows in
the balance at once. The transfer needs the *Palvelun maksujen hallinta* role in the panel. What
is left of the transferred money after the refunds is settled to the club with the next
settlement. A refund can also be made straight from the panel's *Maksutapahtumat* (payments)
view; the secretary then tells the treasurer the payment date and the payer's name.

## What it costs the club

Paytrail charges for its service directly from the club's sub-merchant account. The prices are
Paytrail's list prices; in spring 2024 they were 9.90 € + VAT per month while the service is
active, 0.55 € for every successful payment, and for card, mobile and invoice payments a further
2 % of the sum. Of a forty-euro entry fee, then, 0.55 € went to Paytrail with a bank payment and
1.35 € with the other methods.

The monthly fee runs only while the service is active. The club activates and deactivates its
account itself through Paytrail's customer service — deactivate it when no trials are coming, and
agree who activates it before the next trial's entry opens. With an inactive account the entry
stops at the payment: the entrant is told, instead of a payment, that the club's payment service agreement is not in force, and to contact the trial secretary.

## The sub-merchant agreement

Before its first trial the club makes a sub-merchant agreement with Paytrail. SNJ starts it once
the club has sent its business ID and a contact person's email address to SNJ's calendar
coordinator. A club that does not yet have credentials for the calendar asks for them first from
nome@snj.fi.

1. SNJ creates the sub-merchant, and the contact person gets a link to Paytrail's merchant panel by
   email.
2. The contact person creates an account in the panel and completes the order form: the club's
   details, contacts with their purpose (commercial, technical, customer service), billing details
   and the account number as IBAN with its BIC.
3. Under *Omistajat ja edunsaajat* (owners and beneficiaries) every board member is entered (name,
   personal identity code, nationality) — a club has no owners, and the agreement is not approved
   without every board member. Politically exposed persons (PEP) are declared if there are any,
   and a trade register extract from PRH showing the right to sign is attached.
4. The agreement is signed by the club's official signatories; the contact person can send them a
   signing invitation from the panel.
5. Once everyone has signed, Paytrail processes the order and confirms the approval by email. The
   agreement is in force at once and the account active — if the service is not needed yet,
   deactivate the account so the monthly fee does not run for nothing.

The merchant panel is where payments are followed, settlement reports fetched, funds transferred,
settings changed and users managed. At least the treasurer should have access to it.

The club's Paytrail merchant ID is recorded in the calendar on the administration's
**{t:organizations}** page (*{t:organizer.paytrailMerchantId}*); SNJ's calendar coordinator does
that once the agreement is in force. Without the ID the entrant sees the message
*{t:paymentPage.error412}* instead of a payment.
