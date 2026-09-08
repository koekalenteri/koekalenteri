---
title: Kokeeseen ilmoittautuminen
audience: participant
order: 10
covers:
  - src/pages/SearchPage.tsx
  - src/pages/searchPage/EventFilter.tsx
  - src/pages/searchPage/eventList/EventListItem.tsx
  - src/pages/RegistrationCreatePage.tsx
  - src/pages/components/RegistrationForm.tsx
  - src/pages/components/registrationForm/**
---

Ilmoittautuminen ei vaadi tunnusta eikä kirjautumista. Riittää, että pääset lukemaan sitä
sähköpostia, jonka osoitteen annat lomakkeella: ilmoittautumisesi kaikki linkit tulevat sinne.

## Etsi koe kalenterista

Etusivun lista näyttää tulevat kokeet. Suodattimilla voit rajata sitä ajankohdan, koemuodon,
luokan, järjestäjän ja ylituomarin mukaan, ja valintaruuduilla näyttää vain ne kokeet joiden
ilmoittautuminen on auki tai tulossa.

Jokainen rivi kertoo kokeen ajan, paikan, järjestäjän ja luokat. **{t:register}** ilmestyy riville
vasta kun ilmoittautumisaika on käynnissä; sitä ennen rivillä lukee milloin ilmoittautuminen alkaa.

!shot[SearchPage/search-page-full-desktop] Kalenterin suodattimet ja kaksi koetta, joiden ilmoittautuminen on auki

## Täytä ilmoittautumislomake

Lomakkeen yläreunassa on kokeen tiedot ja alla omat osiosi. Kaikkia ei tarvitse avata siinä
järjestyksessä kuin ne ovat.

**Koiran tiedot.** Kirjoita rekisterinumero ja paina *{t:registration.cta.fetch}*. Koekalenteri hakee
Kennelliiton rajapinnasta nimen, rodun, syntymäajan, vanhemmat ja aiemmat koetulokset. Jos numerolla
ei löydy tietoja, saat ilmoituksen *{t:registration.cta.helper.notfound}* ja voit täyttää tiedot
käsin — tarkista kuitenkin ensin numero, sillä pelkkä kirjoitusvirhe riittää.

!shot[DogInfo/dog-info-fetched] Koiran tiedot haettuna Kennelliitosta

**Omistaja, ohjaaja ja maksaja.** Jos omistaja ohjaa koiraa itse, rastita *{t:registration.ownerHandles}*, niin
tietoja ei tarvitse kirjoittaa kahdesti. Sama koskee maksajaa. Sähköpostiosoite on tärkein kenttä:
sinne lähtee vahvistus ja sen mukana linkki, jolla ilmoittautumista pääsee myöhemmin muokkaamaan.

**Jäsenyystiedot.** Merkitse, onko ohjaaja tai omistaja järjestävän yhdistyksen jäsen. Jäsenyys
vaikuttaa ilmoittautumismaksuun.

**Koeluokka ja päivät.** Valitse luokka ja monipäiväisessä kokeessa ne päivät, jotka sinulle
sopivat. Jos ilmoittaudut varasijalle, kerro myös kuinka lyhyellä varoitusajalla ehdit paikalle.

!shot[EntryInfo/entry-info-with-classes] Koeluokka, päivät ja varasijan varoitusaika

**{t:registration.agreeToTerms}** on hyväksyttävä ennen kuin ilmoittautumisen voi vahvistaa.

Jos vahvistuspainike ei aktivoidu, avaa lomakkeen alalaidasta *{t:registration.accordionTitle}* —
se luettelee, mitä tietoja vielä puuttuu.

## Vahvista ja maksa

Järjestäjä päättää, maksetaanko koe heti vai vasta kun koepaikka on vahvistunut. Painikkeen teksti
kertoo, kumpi on kyseessä:

| Painike | Mitä tapahtuu |
| --- | --- |
| {t:registration.cta.confirmAndPay} | Maksat heti Paytrailin kautta verkkopankissa tai kortilla |
| {t:registration.cta.confirmAndSendLink} | Ilmoittautuminen tallennetaan ja maksulinkki tulee sähköpostiin |
| {t:registration.cta.confirmRegistration} | Maksat vasta kun järjestäjä on vahvistanut koepaikkasi |

## Ilmoittautumisen jälkeen

Vahvistusviestin linkki vie ilmoittautumisesi tietoihin. Sen kautta voit katsoa mitä olet
ilmoittanut, muokata tietoja niin kauan kuin ilmoittautumisaika on auki, ja perua ilmoittautumisen.

Linkki on henkilökohtainen ja se on ainoa avaimesi ilmoittautumiseen, joten säilytä viesti. Jos se
on kadonnut, ota yhteyttä kokeen sihteeriin — yhteystiedot ovat kokeen tiedoissa.

Kun koepaikat on jaettu, saat sähköpostiisi joko koepaikkailmoituksen tai tiedon varasijasta.
Starttilista ja starttinumerot tulevat näkyviin kokeen sivulle silloin, kun järjestäjä julkaisee ne.
