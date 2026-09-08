---
title: Ennen ilmoittautumisajan alkua
audience: secretary
order: 10
covers:
  - src/pages/admin/EventListPage.tsx
  - src/pages/admin/components/EventForm.tsx
  - src/pages/admin/components/eventForm/**
  - src/pages/admin/eventViewPage/EventStateStepper.tsx
  - src/pages/admin/OrganizerListPage.tsx
---

Kun koe on luotu kalenteriin, koesihteerin tehtävä ennen ilmoittautumisajan alkua on varmistaa
kolme asiaa: että kokeen tiedot ovat oikein, että kokeen tila päästää ilmoittautujat sisään ja että
maksut pääsevät perille.

## Ylläpito ja tapahtumalistaus

Kirjaudu kalenteriin tunnuksillasi ja valitse yläpalkista **Ylläpito**. Avautuva
tapahtumalistaus näyttää kaikkien niiden yhdistysten kokeet, joihin sinulla on käyttöoikeus.

!shot[EventListPage/event-list-desktop] Tapahtumalistaus ylläpidossa

Listausta voi muokata itselle sopivaksi: **Sarakkeet** valitsee näkyvät sarakkeet, hakukenttä
rajaa rivejä, **Yhdistys**-valinta näyttää vain yhden yhdistyksen kokeet, ja **Näytä myös menneet
tapahtumat** tuo listaan jo päättyneet kokeet. Rivin valinta klikkaamalla aktivoi yläreunan
painikkeet: *Muokkaa*, *Kopioi*, *Poista* ja *Ilmoittautumiset*.

## 1. Tarkasta kokeen tiedot

Valitse koe listasta ja paina **Muokkaa**. Lomake on jaettu osioihin — tapahtuman tiedot,
Kennelliiton koetunnus, tuomarit, ilmoittautuminen, maksutiedot, keskuspaikan tiedot, yhteystiedot
ja lisätiedot — ja kunkin osion voi avata ja sulkea otsikostaan.

!shot[EventForm/event-form-desktop] Kokeen tiedot muokattavana

Lomake kertoo itse, mitä puuttuu: puutteellinen osio saa punaisen huomautuksen, esimerkiksi
*Tila "Julkaistu": ALO, AVO, VOI koeluokilta puuttuu tuomari*, ja **Tallenna** aktivoituu vasta
kun kaikki vaadittu on paikallaan. Käy osiot läpi ja tarkista erityisesti:

- **päivämäärät** — kokeen alkamis- ja päättymispäivä sekä ilmoittautumisajan alku ja loppu,
- **luokat, ryhmät ja koepaikkojen määrä** — paikat voi antaa yhteensä, päivittäin tai luokittain,
- **tuomarit ja luokat, joita kukin arvostelee**,
- **Kennelliiton koetunnus** — sitä tarvitaan tulosten tallentamiseen,
- **yhteystiedot** — mitkä vastaavan koetoimitsijan ja koesihteerin tiedot ilmoittautuja saa nähdä.

## 2. Tarkasta kokeen tila

Kokeen tila on lomakkeen yläreunan **Tila**-valikko. Ilmoittautuminen on mahdollista vain, kun
tila on *Julkaistu* ja ilmoittautumisaika on käynnissä.

| Tila | Mitä se tarkoittaa |
| --- | --- |
| Luonnos | Koe näkyy vain oman yhdistyksen ylläpitäjille |
| Julkaistu alustavana | Koe näkyy julkisessa kalenterissa, mutta siihen ei voi ilmoittautua |
| Julkaistu | Kokeeseen voi ilmoittautua ilmoittautumisaikana |
| Peruttu | Koe on peruttu eikä siihen voi ilmoittautua |

Kun koe on julkaistu, sen eteneminen näkyy tapahtumasivun askelpalkissa: ilmoittautuminen
käynnissä, osallistujat valittu, koekutsut lähetetty, starttilista julkaistu ja niin edelleen. Nämä
vaiheet tehdään tapahtumasivulta, ei Tila-valikosta — ja kun koe on edennyt niihin, valikko ei
enää muuta tilaa taaksepäin.

!shot[EventStateStepper/event-state-stepper] Kokeen vaiheet tapahtumasivulla

## 3. Varmista, että maksut pääsevät perille

Lomakkeen **Maksutiedot**-osiossa valitaan *Maksuajankohta*: joko *Maksu ilmoittautumisen
yhteydessä*, jolloin ilmoittautuja maksaa heti, tai *Maksu vasta koepaikan varmistuttua*, jolloin
maksulinkki lähtee vasta koepaikkailmoituksen mukana. Samassa osiossa ovat osallistumismaksu ja
jäsenhinta.

Maksut kulkevat yhdistyksen omalla Paytrail-sopimuksella. Sopimuksen kauppiastunnus on kirjattu
yhdistyksen tietoihin ylläpidon **Yhdistykset**-sivulle, mutta se, onko sopimus *aktiivinen*, näkyy
vain Paytrailissa. Varmista asia yhdistyksen rahastonhoitajalta ennen ilmoittautumisajan alkua —
jos sopimus on passiivinen, ilmoittautumismaksut eivät onnistu.
