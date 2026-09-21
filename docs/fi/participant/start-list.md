---
title: Starttilista ja tulokset
audience: participant
order: 30
covers:
  - src/pages/StartListPage.tsx
  - src/pages/startListPage/**
---

Starttilista on kokeen julkinen sivu, jolle järjestäjä julkaisee osallistujat, starttinumerot ja
lopulta tulokset. Sivu ei vaadi kirjautumista eikä linkkiä sähköpostista: se avautuu kalenterin
kokeen tiedoista, kun järjestäjä on julkaissut listan vähintään yhdelle luokalle. Sitä ennen
sivulla lukee *{t:error.startListNotAvailable}*.

## Mitä listalla on

Lista etenee päivä ja luokka kerrallaan. Luokan otsikossa ovat luokan tuomarit, ja jos päivä on
jaettu aamu- ja iltapäivään, kumpikin ryhmä on omana osanaan. Jokaisesta koirakosta kerrotaan
starttinumero, rotu, tittelit, nimi, rekisterinumero ja syntymäaika, vanhemmat, omistaja ja
ohjaaja sekä kasvattaja. Perunut koirakko näkyy paikallaan merkinnällä *{t:startList.absent}*,
joten numerot eivät siirry peruutuksen takia.

!shot[RegistrationDetails/start-list-result] Koirakon rivi, jolla on jo tulos

Sivu päivittyy itsestään, kun järjestäjä julkaisee lisää tai kirjaa peruutuksen; sitä ei tarvitse
ladata uudelleen.

## Milloin järjestys on lopullinen

Järjestäjä julkaisee listan ja starttinumerot erikseen, ja luokan otsikko kertoo, missä vaiheessa
luokka on:

| Otsikon huomautus | Mitä se tarkoittaa |
| --- | --- |
| *{t:startListNotPublished}* | luokan osallistujia ei vielä näytetä; otsikko on listalla, jotta luokan tiedetään olevan tulossa |
| *{t:startNumbersNotPublished}* | osallistujat ovat aakkosjärjestyksessä eikä numero vielä kerro starttivuoroa |
| ei huomautusta | numerot on arvottu ja julkaistu, ja lista on koirakoiden starttijärjestys |

Monipäiväisessä kokeessa numerot voi julkaista päivä kerrallaan, joten yhden päivän luokka voi olla
lopullinen toisen ollessa vielä aakkosjärjestyksessä.

## Tulokset

Kun järjestäjä on julkaissut luokan tulokset, jokaisen koirakon rivin viimeinen rivi on sen
tulos: luokka ja palkintosija, esimerkiksi AVO1, tai nolla ja viiva sääntöjen mukaan. Jos tuomari
keskeytti kokeen, tuloksen perässä on merkintä *{t:results.marks.interrupted}*. Tulokset
julkaistaan luokittain, joten sivulla voi olla luokkia, joiden tulokset ovat jo näkyvissä, ja
luokkia, joilla ei vielä ole niitä.

Tulokset näkyvät vain Koekalenterin starttilistalla. Kennelliiton jalostustietojärjestelmään ne
kirjataan Koekalenterista riippumatta.

TODO: Starttilistan Live-osio (rastilla nyt, jonon eteneminen) on julkaisusta pois kytkettynä (`liveViewEnabled`); kuvataan, kun se otetaan käyttöön.
