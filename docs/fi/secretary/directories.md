---
title: Tuomarit ja koetoimitsijat
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
---

Ylläpidon vasemman laidan valikossa ovat **{t:events}**, **{t:judges}**, **{t:officials}**,
**{t:users}** ja **{t:stats.admin.overviewTitle}**. Kapealla näytöllä valikko avautuu yläpalkin
painikkeesta. Tuomarit ja koetoimitsijat ovat luetteloita, joista kokeen tiedot poimivat
tuomarinsa ja vastaavan koetoimitsijansa; koesihteeri lukee niitä, koekalenterin pääkäyttäjä
ylläpitää.

!shot[SideMenu/side-menu-expanded] Ylläpidon valikko

## Tuomarit

Luettelo tulee Kennelliiton rajapinnasta, ja hakukenttä rajaa sitä nimen tai muun sarakkeen
mukaan. Sarakkeet kertovat tuomarin numeron, kotikunnan, yhteystiedot, kennelpiirin ja
*{t:eventTypes}*, joita tuomari arvostelee.

!shot[JudgeListPage/judge-list-mock-trial] Tuomariluettelo

Kolme saraketta ovat Koekalenterin omia, eivät Kennelliiton:

| Sarake | Mitä se tarkoittaa |
| --- | --- |
| *{t:judgeActive}* | tuomari on valittavissa kokeen tietoihin; pois kytketty tuomari ei näy kokeen lomakkeen tuomarilistassa |
| *{t:judgeMockTrial}* | tuomari saa arvostella Mock trialin yksin; NOME-A-tuomarilla oikeus on aina, NOWT-tuomarille se annetaan tästä |
| *{t:languages}* | kielet, joilla tuomari arvostelee |

Sarakkeita muuttaa vain koekalenterin pääkäyttäjä. Jos tuomari puuttuu listalta tai on väärin
merkitty, ilmoita asiasta SNJ:n koekalenterivastaavalle.

## Koetoimitsijat

Koetoimitsijoiden luettelo tulee samoin Kennelliitosta, ja siinä ovat nimi, tunnus, kotikunta,
yhteystiedot, kennelpiiri ja koemuodot. Sitä ei muokata Koekalenterissa. Kapealla näytöllä osa
sarakkeista on piilossa.
