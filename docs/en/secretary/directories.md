---
title: Judges and officials
audience: secretary
order: 50
covers:
  - src/pages/admin/JudgeListPage.tsx
  - src/pages/admin/judgeListPage/**
  - src/pages/admin/OfficialListPage.tsx
  - src/pages/admin/officialListPage/**
  - src/pages/admin/officialDirectoryColumns.ts
  - src/pages/admin/components/OfficialDirectoryList.tsx
  - src/pages/admin/components/OfficialCell.tsx
  - src/pages/components/SideMenu.tsx
  - src/pages/components/sideMenu/**
sourceHash: a79559
---

The menu on the left of the admin views holds **{t:events}**, **{t:judges}**, **{t:officials}**,
**{t:users}** and **{t:stats.admin.overviewTitle}**. On a narrow screen the menu opens from the
button in the header. Judges and officials are directories, from which an event's details pick
its judges and its chief steward; the secretary reads them, the application's administrator
maintains them.

!shot[SideMenu/side-menu-expanded] The admin menu

## Judges

The directory comes from the Kennel Club's interface, and the search box narrows it by name or
by any other column. The columns give the judge's number, home town, contact details, kennel
district and the *{t:eventTypes}* the judge judges.

!shot[JudgeListPage/judge-list-mock-trial] The judge directory

Three columns are the calendar's own, not the Kennel Club's:

| Column | What it means |
| --- | --- |
| *{t:judgeActive}* | the judge can be picked into an event's details; a judge switched off does not appear in the event form's judge list |
| *{t:judgeMockTrial}* | the judge may judge a Mock trial alone; a NOME-A judge always has the right, a NOWT judge is given it here |
| *{t:languages}* | the languages the judge judges in |

Only the application's administrator changes these columns. If a judge is missing from the list
or wrongly marked, tell SNJ's calendar contact.

## Officials

The directory of officials comes from the Kennel Club the same way, with name, id, home town,
contact details, kennel district and event types. It is not edited in the calendar. On a narrow
screen some of the columns are hidden.
