---
title: Ilmoittautumisaikana
audience: secretary
order: 20
covers:
  - src/pages/admin/EventViewPage.tsx
  - src/pages/admin/eventViewPage/ClassEntrySelection.tsx
  - src/pages/admin/eventViewPage/classEntrySelection/**
  - src/pages/admin/eventViewPage/InfoPanel.tsx
  - src/pages/admin/eventViewPage/RefundDialog.tsx
  - src/pages/admin/eventViewPage/RegistrationEditDialog.tsx
---

Ilmoittautumisaikana kalenteri tekee suurimman osan työstä itse: ilmoittautumiset kertyvät, maksut
kirjautuvat ja ilmoittautujat muokkaavat ja peruvat omia ilmoittautumisiaan omilla linkeillään.
Koesihteerille jää seuranta ja ne peruutukset ja palautukset, jotka eivät tule kalenterin kautta.

## Ilmoittautumisten seuranta

Valitse koe tapahtumalistauksesta ja paina **Ilmoittautumiset** — tai tuplaklikkaa koetta.
Tapahtumasivulla jokaisella luokalla on oma välilehtensä, ja luokan ilmoittautumiset on jaettu
kolmeen osaan:

| Osa | Ketä siinä on |
| --- | --- |
| Osallistujat | koepaikan saaneet, ryhmiteltyinä koepäivän ja -ryhmän mukaan |
| Ilmoittautuneet | kaikki muut ilmoittautuneet; ilmoittautumisaikana siis käytännössä kaikki |
| Peruneet | ilmoittautumisen peruneet, perumisen syineen |

Jokainen uusi ilmoittautuminen tulee kohtaan *Ilmoittautuneet* ja pysyy siellä, kunnes koesihteeri
siirtää sen osallistujiin ilmoittautumisajan päätyttyä.

!shot[ClassEntrySelection/class-entry-selection-groups-and-reserve] Luokan ilmoittautumiset kolmessa osassa

Oikean laidan **Tapahtuman hallinta** -paneeli näyttää luokittain, montako on nostettu
osallistujiin, montako on varasijalla ja mitä koekalenteri odottaa seuraavaksi. Sen
*Muutoshistoria*-välilehti listaa kaiken, mitä kokeelle on tehty.

!shot[InfoPanel/info-panel] Tapahtuman hallinta -paneeli

Seuranta ei sinänsä vaadi toimenpiteitä. Jos ilmoittautumisia tulee niin paljon, että kokeeseen
hankitaan lisätuomari, kokeen tietoja muokataan tapahtumalistauksen **Muokkaa**-painikkeella:
tuomari lisätään Tuomarit-osioon ja koepaikkojen määrä nostetaan Ilmoittautuminen-osiossa.

## Peruutuksen kirjaaminen

Ilmoittautuja voi perua itse vahvistusviestinsä linkistä, ja silloin peruutus näkyy kohdassa
*Peruneet* perumisen syyn kanssa. Kaikki eivät kuitenkaan tee niin, vaan lähettävät peruutuksen
sähköpostilla — silloin koesihteeri kirjaa sen:

- avaa ilmoittautumisen rivin oikean laidan valikko (⋮) ja valitse **Peru ilmoittautuminen**, tai
- raahaa ilmoittautuminen kohtaan *Peruneet*.

Peruutus tulee voimaan heti. Perutut säilyvät näkyvissä omassa osiossaan, joten tieto ei katoa.

## Maksun palautus

Jos ilmoittautuminen perutaan hyväksyttävästä syystä, maksun voi palauttaa heti. Avaa
ilmoittautumisen rivin valikko (⋮) ja valitse **Palauta maksu**.

!shot[RefundDialog/refund-dialog-open] Maksun palautus

Ikkuna listaa ilmoittautumisen maksut. Valitse palautettava maksu, kirjaa tarvittaessa
*Käsittelykulu*, joka jää yhdistykselle, ja lisää halutessasi sisäinen kommentti — se ei näy
ilmoittautujalle. **Palauta maksu** tekee palautuksen Paytrailin kautta samalle maksutavalle, jolla
maksu tuli. Palautettu summa näkyy sen jälkeen ilmoittautumisen rivillä.

Palautuksen voi tehdä myös suoraan Paytrailin kauppiasportaalissa, yleensä yhdistyksen
rahastonhoitaja. Silloin rahastonhoitaja tarvitsee maksupäivän ja maksajan nimen: molemmat löytyvät
avaamalla ilmoittautuminen (*Muokkaa ilmoittautumista*) ja vierittämällä sen loppuun, jossa
ilmoittautumisen muutoshistoria luettelee myös maksun ajankohtineen.
