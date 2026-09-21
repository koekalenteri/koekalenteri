---
title: Tilastot
audience: admin
order: 60
covers:
  - src/pages/admin/OrganizerStatsPage.tsx
  - src/pages/admin/EventBreakdownPage.tsx
  - src/pages/StatsPage.tsx
  - src/pages/components/stats/**
---

Koekalenteri laskee tilastot päättyneistä kokeista itse. Niitä on kolmella sivulla: yhdistyksen
omat tilastot ylläpidon valikossa, koko maan tilastot yläpalkissa ja koekalenterin pääkäyttäjän
tapahtumaerittely. Jokaisen kaavion otsikossa on i-kuvake, joka kertoo, mistä luvuista kaavio on
laskettu ja mitä siitä on jätetty pois.

## Yhdistyksen tilastot

Ylläpidon valikon **{t:stats.admin.overviewTitle}** näyttää sen yhdistyksen luvut, johon sinulla
on oikeus; jos yhdistyksiä on useita, ne valitaan kohdasta *{t:organization}*. *{t:stats.year}*
rajaa kaaviot yhteen vuoteen, ja valittavissa ovat vain ne vuodet, joina yhdistyksellä on ollut
kokeita.

| Kaavio | Mitä se kertoo |
| --- | --- |
| *{t:stats.admin.title}* | maksetut ja palautetut summat kuukausittain |
| *{t:stats.admin.reserveCancelledTitle}* | varasijalle jääneet ja perutut ilmoittautumiset kuukausittain |
| *{t:stats.admin.memberShareTitle}* | kuinka suuri osa osallistujista oli yhdistyksen jäseniä |
| *{t:stats.admin.judgeWorkloadTitle}* | monessako yhdistyksen kokeessa kukin tuomari toimi |

Sivun alaosan kaaviot lasketaan koemuodolle ja luokalle, jotka valitaan kohdista
*{t:stats.admin.eventType}* ja *{t:stats.admin.class}*: *{t:stats.admin.capacityTitle}*,
*{t:stats.admin.demandTitle}* ja *{t:stats.admin.cancellationRateTitle}*. Peruutusprosentti
lasketaan kaikista ilmoittautuneista, myös varasijalta peruneista.

!shot[CapacityUtilizationChart/capacity-all-classes] Osallistujat ja paikat kuukausittain yhdelle koemuodolle

## Koko maan tilastot

Yläpalkin **{t:stats.title}** on jokaisen ylläpito-oikeuden haltijan nähtävissä ja kokoaa kaikkien
yhdistysten kokeet. Sen yläosa kulkee vuosittain: *{t:stats.participationTrend}*,
*{t:stats.retentionTitle}* ja *{t:stats.fillRate}*. Alaosa lasketaan valitulle vuodelle:
jakaumat koemuodoittain ja luokittain, koira–ohjaaja-parien osallistumiskerrat, koirien määrä
ohjaajaa kohden ja osallistujaprosentti roduittain. *{t:stats.breedDistribution}* näyttää rotujen
osuudet vuosittain vierekkäin.

!shot[RetentionChart/retention] Uudet ja palaavat koirakot vuosittain

## Tapahtumaerittely

Koekalenterin pääkäyttäjän valikossa on **{t:stats.admin.eventBreakdownTitle}**: taulukko, jossa
ovat valitun vuoden kokeet, starttipaikat, startit, eri ohjaajat, varasijalle jääneet, peruutukset
ja jäsenten startit yhdistyksittäin ja koemuodoittain, välisummineen. **{t:stats.admin.eventBreakdownExport}**
lataa saman taulukon Excel-tiedostona.
