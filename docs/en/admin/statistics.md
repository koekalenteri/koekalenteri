---
title: Statistics
audience: admin
order: 60
covers:
  - src/pages/admin/OrganizerStatsPage.tsx
  - src/pages/admin/EventBreakdownPage.tsx
  - src/pages/StatsPage.tsx
  - src/pages/components/stats/**
sourceHash: 0c8cd2
---

The calendar works its statistics out from the trials that have ended. They are on three pages:
the club's own statistics in the admin menu, the nationwide statistics in the header, and the
application administrator's event breakdown. Every chart's title has an i icon that says which
figures the chart is drawn from and what has been left out.

## The club's statistics

**{t:stats.admin.overviewTitle}** in the admin menu shows the figures of the club you have access
to; with several clubs, the club is picked under *{t:organization}*. *{t:stats.year}* narrows the
charts to one year, and only the years in which the club has had trials can be picked.

| Chart or table | What it says |
| --- | --- |
| *{t:stats.admin.title}* | the amounts paid and refunded, by month |
| *{t:stats.admin.reserveCancelledTitle}* | entries left on the reserve list and entries cancelled, by month |
| *{t:stats.admin.memberShareTitle}* | how large a share of the participants were the club's members |
| *{t:stats.admin.judgeWorkloadTitle}* | a table: how many of the club's trials each judge has worked at and is still to work at |

The judge workload is the one part of the page that counts upcoming trials too. *{t:stats.admin.judgeHeldEvents}*
are the trials that have ended, *{t:stats.admin.judgeUpcomingEvents}* those whose last day has not
yet passed, and *{t:stats.admin.judgeTotalEvents}* the sum of the two. The table is sorted by the
total, largest first, and a long list scrolls in its own box. Drafts, tentative and cancelled
trials are not counted, and the figures are updated nightly.

The charts at the foot of the page are drawn for the event type and class picked under
*{t:stats.admin.eventType}* and *{t:stats.admin.class}*: *{t:stats.admin.capacityTitle}*,
*{t:stats.admin.demandTitle}* and *{t:stats.admin.cancellationRateTitle}*. The cancellation rate
is counted from every entry, those cancelled from the reserve list included.

!shot[CapacityUtilizationChart/capacity-all-classes] Participants and places by month for one event type

## Nationwide statistics

**{t:stats.title}** in the header is open to everyone with admin access and gathers every club's
trials. Its upper part runs by year: *{t:stats.participationTrend}*, *{t:stats.retentionTitle}*
and *{t:stats.fillRate}*. The lower part is drawn for the chosen year: the breakdowns by event type
and by class, how many times each dog-and-handler pair took part, dogs per handler, and the share
of entries that got a place, by breed. *{t:stats.breedDistribution}* shows the breeds' shares year
by year side by side.

!shot[RetentionChart/retention] New and returning dog-and-handler pairs by year

## Event breakdown

The application administrator's menu has **{t:stats.admin.eventBreakdownTitle}**: a table of the
chosen year's trials, places, starts, distinct handlers, reserve entries, cancellations and
members' starts, by club and event type, with subtotals.
**{t:stats.admin.eventBreakdownExport}** downloads the same table as an Excel file.

## Trials by class

On the same page, **{t:stats.admin.eventClassStatsExport}** downloads the chosen season's trials as
an Excel file, one class at a time, from every club. The season is the year the trial starts in.
The file is worked out when it is downloaded, so it also has the trials still ahead and the
tentative ones. Drafts, cancelled and deleted trials are left out.

Each row is one class of one trial: the club, the location, the trial's days, the event type, the
state, the entry period, the priorities, the entry fee and the members' entry fee, the class and its
days, the class's places, the entries, the cancellations, the entries with priority, the dogs picked
from the reserve list, and what the class's entries paid and were refunded. A class held on several
days is one row that lists the days and adds their places together, because a dog enters a class,
not a day. A trial without classes has one row with no class. Where places were given only for the
whole trial and it has several classes, the class's places are 0. The file has no names,
registration numbers or other personal data, only counts and sums.

The entries include those cancelled later, and their number is also in a column of its own. The fee
is the trial's base price; early-bird, breed and other prices are not in the file.

A dog counts as picked from the reserve list when it was on the reserve list as the reserve notice
was sent, and it now takes part or was sent a place notice after that. Two cases are left out of
the count: a class whose reserve list was never sent a reserve notice, and a dog picked from the
reserve list before June 2025 that cancelled after that.
