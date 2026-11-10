---
title: Ennen ilmoittautumisajan alkua
audience: secretary
order: 10
covers:
  - src/pages/admin/EventListPage.tsx
  - src/pages/admin/components/EventForm.tsx
  - src/pages/admin/components/eventForm/**
  - src/pages/admin/eventViewPage/EventStateStepper.tsx
  - src/pages/admin/EventCreatePage.tsx
  - src/pages/admin/EventEditPage.tsx
  - src/pages/admin/OrganizerListPage.tsx
---

Kun koe on luotu kalenteriin, koesihteerin tehtävä ennen ilmoittautumisajan alkua on varmistaa
kolme asiaa: että kokeen tiedot ovat oikein, että kokeen tila päästää ilmoittautujat sisään ja että
maksut pääsevät perille.

## Ylläpito ja tapahtumalistaus

Kirjaudu kalenteriin tunnuksillasi ja valitse yläpalkista **{t:admin}**. Avautuva
tapahtumalistaus näyttää kaikkien niiden yhdistysten kokeet, joihin sinulla on käyttöoikeus.

!shot[EventListPage/event-list-desktop] Tapahtumalistaus ylläpidossa

Listausta voi muokata itselle sopivaksi: **Sarakkeet** valitsee näkyvät sarakkeet, hakukenttä
rajaa rivejä, **{t:organization}**-valinta näyttää vain yhden yhdistyksen kokeet, ja **{t:showFinishedEvents}** tuo listaan myös valmiit kokeet. Päättynyt koe pysyy
listassa, kunnes sen tulokset on julkaistu kaikissa luokissa, se on peruttu tai sen päättymisestä
on kulunut 30 päivää. Rivin valinta klikkaamalla aktivoi yläreunan
painikkeet: *{t:edit}*, *{t:copy}*, *{t:delete}* ja *{t:registrations}*. *{t:delete}* on käytettävissä
vain, kun kokeen tila on *{t:event.states.draft}*, *{t:event.states.tentative}* tai
*{t:event.states.cancelled}*.

## 1. Tarkasta kokeen tiedot

Valitse koe listasta ja paina **{t:edit}**. Lomake on jaettu osioihin — tapahtuman tiedot,
Kennelliiton koetunnus, tuomarit, ilmoittautuminen, maksutiedot, keskuspaikan tiedot, yhteystiedot
ja lisätiedot — ja kunkin osion voi avata ja sulkea otsikostaan.

!shot[EventForm/event-form-desktop] Kokeen tiedot muokattavana

Lomake kertoo itse, mitä puuttuu: puutteellinen osio saa punaisen huomautuksen, esimerkiksi
*Tila "Julkaistu": ALO, AVO, VOI koeluokilta puuttuu tuomari*, ja **{t:save}** aktivoituu vasta
kun kaikki vaadittu on paikallaan. Käy osiot läpi ja tarkista erityisesti:

- **päivämäärät** — kokeen alkamis- ja päättymispäivä sekä ilmoittautumisajan alku ja loppu,
- **luokat, ryhmät ja koepaikkojen määrä** — paikat voi antaa yhteensä, päivittäin tai luokittain,
- **{t:event.officialFormat}**: epävirallinen koe voi noudatella virallista koetta (NOU, NOME-B,
  NOME-A tai NOWT). Silloin luokat, ilmoittautumisen ajat, koepaikat, varasijalista, suorituspaikat
  ja tulosten syöttö toimivat kuten siinä kokeessa, ja tulos kirjataan sen nimellä, esimerkiksi
  NOU1. Tällainen koe ei vaadi tuomareita: ei virallisen kokeen tuomarimäärää eikä tuomaria
  luokkaa kohden. Jos kokeella on omia luokkia, ne ajetaan suorituspaikoilla samoin kuin noudateltavan
  kokeen luokat. Kuka saa ilmoittautua, Kennelliitto ja tilastot pysyvät epävirallisen kokeen
  omina. Valintaa voi muuttaa, kunnes kokeeseen on tallennettu ensimmäinen tulos tai suorituspaikan
  vuoro. Kun kokeessa on jo ilmoittautumisia, valinta ei voi tuoda luokkia kokeeseen eikä poistaa
  niitä. Jos valintaa muuttaa ilmoittautumisten jälkeen, suorituspaikkojen ja starttinumeroiden
  linkit on lähetettävä uudelleen, ja ilmoittautujien valitsemat ajat jäävät ennalleen,
- **{t:event.ownClasses.title}**: epävirallisessa kokeessa voi olla omia luokkia, esimerkiksi YKS
  ja VET. Painike **{t:event.ownClasses.add}** lisää luokan, jolle annetaan koodi ja nimi suomeksi
  sekä halutessa englanniksi. Koodi kirjoitetaan isoilla kirjaimilla, se alkaa kirjaimella ja siinä
  on enintään 10 kirjainta tai numeroa, eikä se voi olla koetyypin nimi. Koodi näkyy linkeissä ja
  ylläpidossa, nimi ilmoittautujille, starttilistalla ja sähköposteissa. Luokat näkyvät kaikkialla
  siinä järjestyksessä, johon ne nuolilla järjestää. Kun ensimmäinen oma luokka lisätään, kokeen
  ALO-, AVO- ja VOI-luokat poistuvat, sillä koe ajaa vain omia luokkiaan. Yksipäiväisessä kokeessa
  luokka saa kokeen päivän heti, kun sillä on koodi; pidemmässä kokeessa luokan päivät valitaan
  kohdasta **{t:event.classes}**. Luokan rivillä kerrotaan, mitä siinä on korjattavaa ennen
  tallennusta. Kun luokassa on ilmoittautumisia, sen koodia ei voi muuttaa eikä luokkaa poistaa.
  Kun kokeen luokissa on jo ilmoittautumisia, omia luokkia ei voi ottaa käyttöön eikä niitä voi
  poistaa vaihtamalla koetyyppiä. Ilmoittautumisiksi lasketaan myös perutut ja maksamattomat;
  jos tallennus torjutaan niiden takia, Koekalenteri kertoo, mistä luokista on kyse,
- **tuomarit ja luokat, joita kukin arvostelee**,
- **{t:event.kcIdSectionTitle}**: koe liitetään Kennelliiton kokeeseen, jotta tulokset voi tallentaa,
- **yhteystiedot** — mitkä vastaavan koetoimitsijan ja koesihteerin tiedot ilmoittautuja saa nähdä.

!shot[BasicInfoSection/basic-info-section-own-classes] Kaksi omaa luokkaa: VET-luokalta puuttuu vielä nimi suomeksi ja päivä

Jos lomakkeelta poistuu tallentamatta, se kysyy ensin: **{t:unsavedChanges.stay}** jää lomakkeelle,
ja **{t:unsavedChanges.leave}** hylkää muutokset. Välilehden sulkemisesta tai uudelleenlataamisesta
kysyy selain. **{t:cancel}** hylkää muutokset heti kysymättä.

## 2. Tarkasta kokeen tila

Kokeen tila on lomakkeen yläreunan **{t:event.state}**-valikko. Ilmoittautuminen on mahdollista vain, kun
tila on *{t:event.states.confirmed}* ja ilmoittautumisaika on käynnissä.

| {t:event.state} | Mitä se tarkoittaa |
| --- | --- |
| {t:event.states.draft} | Koe näkyy vain oman yhdistyksen ylläpitäjille |
| {t:event.states.tentative} | Koe näkyy julkisessa kalenterissa, mutta siihen ei voi ilmoittautua |
| {t:event.states.confirmed} | Kokeeseen voi ilmoittautua ilmoittautumisaikana |
| {t:event.states.cancelled} | Koe on peruttu eikä siihen voi ilmoittautua |

Kun koe on julkaistu, sen eteneminen näkyy tapahtumasivun askelpalkissa: ilmoittautuminen
käynnissä, osallistujat valittu, koekutsut lähetetty, starttilista julkaistu ja niin edelleen. Nämä
vaiheet tehdään tapahtumasivulta, ei Tila-valikosta — ja kun koe on edennyt niihin, valikko ei
enää muuta tilaa taaksepäin.

!shot[EventStateStepper/event-state-stepper] Kokeen vaiheet tapahtumasivulla

## 3. Varmista, että maksut pääsevät perille

Lomakkeen **{t:paymentDetails}**-osiossa valitaan *{t:paymentTime}*: joko *{t:paymentTimeOptions.registration}*, jolloin ilmoittautuja maksaa heti, tai *{t:paymentTimeOptions.confirmation}*, jolloin
maksulinkki lähtee vasta koepaikkailmoituksen mukana. Samassa osiossa ovat osallistumismaksu ja
jäsenhinta.

Maksut kulkevat yhdistyksen omalla Paytrail-sopimuksella. Sopimuksen kauppiastunnus on kirjattu
yhdistyksen tietoihin ylläpidon **{t:organizations}**-sivulle, mutta se, onko sopimus *aktiivinen*, näkyy
vain Paytrailissa. Varmista asia yhdistyksen rahastonhoitajalta ennen ilmoittautumisajan alkua —
jos sopimus on passiivinen, ilmoittautumismaksut eivät onnistu.
