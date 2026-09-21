---
title: Statistics
audience: admin
order: 60
covers:
  - src/pages/admin/OrganizerStatsPage.tsx
  - src/pages/admin/EventBreakdownPage.tsx
  - src/pages/StatsPage.tsx
  - src/pages/components/stats/**
sourceHash: f4f6e2
---

The calendar works its statistics out from the trials that have ended. They are on three pages:
the club's own statistics in the admin menu, the nationwide statistics in the header, and the
application administrator's event breakdown. Every chart's title has an i icon that says which
figures the chart is drawn from and what has been left out.

## The club's statistics

**{t:stats.admin.overviewTitle}** in the admin menu shows the figures of the club you have access
to; with several clubs, the club is picked under *{t:organization}*. *{t:stats.year}* narrows the
charts to one year, and only the years in which the club has had trials can be picked.

| Chart | What it says |
| --- | --- |
| *{t:stats.admin.title}* | the amounts paid and refunded, by month |
| *{t:stats.admin.reserveCancelledTitle}* | entries left on the reserve list and entries cancelled, by month |
| *{t:stats.admin.memberShareTitle}* | how large a share of the participants were the club's members |
| *{t:stats.admin.judgeWorkloadTitle}* | how many of the club's trials each judge worked at |

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
