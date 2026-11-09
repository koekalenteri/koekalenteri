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

Rasteilla pisteytettävässä kokeessa (NOWT) luokan otsikon alla kerrotaan luokan suoritusjärjestys
suorituspaikkoina, esimerkiksi "ALO: suorituspaikat 1, 2, 3, 3", jos järjestäjä on määrittänyt sen.
Paikat ovat rastien järjestyksessä, ja sama paikka kahdesti tarkoittaa kahta rastia samassa paikassa.
Jos luokka on jaettu koenumeroväleihin, jokaisella välillä on oma rivinsä, ja välit näkyvät vasta,
kun luokan starttinumerot on julkaistu.

!shot[ParticipantList/start-list-rotation] Luokkien suoritusjärjestykset: ALO tekee kaksi viimeistä rastiaan suorituspaikalla 3, AVO on jaettu kahteen numeroväliin

Sivu päivittyy itsestään, kun järjestäjä julkaisee lisää tai kirjaa peruutuksen; sitä ei tarvitse
ladata uudelleen.

## Joukkuekilpailu

Jos kokeessa on joukkuekilpailu, lista avautuu joukkueittain, ja listan yläpuolella voi valita
**{t:startList.byTeam}** tai **{t:startList.byOrder}**. Suoritusjärjestys on sama lista päivä ja
luokka kerrallaan kuin ilman joukkueita.

Joukkueittain jokaisen päivän alla ovat ne joukkueet, joiden koiria on sen päivän listalla,
numerojärjestyksessä: ensin *Joukkue 1* ja joukkueen nimi, sitten sen koirat. Koiran rivi on sama
kuin muuten, ja sen alussa on koiran tunnus joukkueessa, esimerkiksi *1A*. Jos päivän listalla
on koiria useasta luokasta, luokka on tunnuksen edessä, esimerkiksi *AVO 1A*. Monipäiväisessä
kokeessa joukkue näkyy jokaisen päivän alla niillä koirillaan, jotka ovat sinä päivänä listalla.
Joukkueisiin kuulumattomat koirat ovat joukkueiden jälkeen otsikon *{t:startList.noTeam}* alla.
Luokkaotsikoita joukkueittain ei ole, joten jos luokan järjestys ei ole vielä lopullinen, päivän
alla lukee luokan kohdalla sama huomautus kuin suoritusjärjestyksessä luokan otsikossa, esimerkiksi
*AVO ({t:startNumbersNotPublished})*.

Kirjain kertoo koiran paikan joukkueessa. Jos joukkueen koira on varalla, sitä ei vielä näytetä
tai se on perunut, sen kirjain jää käyttämättä, joten joukkueessa voi olla esimerkiksi 1A ja 1C
ilman 1B:tä. Perunut koira ei näy joukkueittain lainkaan; suoritusjärjestyksessä se on
paikallaan merkinnällä *{t:startList.absent}*.

!shot[ParticipantList/start-list-teams] Kaksipäiväinen joukkuekilpailu joukkueittain: ensimmäisen päivän joukkueissa on koiria kahdesta luokasta

### Joukkueiden tulokset

Kokeessa, jossa koirat saavat pisteitä (NOWT), joukkueen pisteet ovat sen koirien pisteet yhteensä
koko kokeesta, mistä luokasta tahansa. Järjestäjä voi rajata pisteet tiettyihin päiviin, esimerkiksi
karsintapäivään ilman finaalia; silloin muiden päivien tulokset eivät kuulu joukkueelle. Koira, jolla ei ole tulosta, tuo joukkueelle
nolla pistettä. Joukkueet sijoitetaan yhteispisteiden mukaan, ja tasapisteissä olevat joukkueet jakavat
sijan, esimerkiksi 1., 2., 2., 4. Ensimmäisestä sijasta tasapisteissä olevien joukkueiden järjestys
ratkaistaan uusintatehtävällä: sen voittaja on ensimmäinen ja muut jakavat seuraavan sijan. Siihen
asti ne jakavat ensimmäisen sijan.

Joukkueen sijoitus ja pisteet näkyvät joukkueen otsikossa, kun koesihteeri on julkaissut kaikkien
sen sarjan joukkueiden koirien tulokset, esimerkiksi *2. sija, 170 pistettä*. Ennen sitä tulosta ei
näytetä yhdellekään sarjan joukkueelle. Tulosta ei näytetä myöskään silloin, kun joku sarjan
joukkueiden koirista ei vielä ole listalla, esimerkiksi koska sen starttinumeroa ei ole syötetty.
Kokeessa, jossa ei ole sarjoja, kaikki joukkueet ovat yhtä sarjaa. Monipäiväisessä kokeessa sama
rivi on joukkueen otsikossa jokaisen päivän alla. Ensimmäisestä sijasta tasapisteissä olleiden joukkueiden rivillä lukee lisäksi
*({t:startList.teamRunOff})*. Jos pisteet on rajattu tiettyihin päiviin, rivin lopussa kerrotaan,
minkä päivien tuloksista ne on laskettu, esimerkiksi *1. sija, 90 pistettä, pe 2.10. tuloksista*.
Kokeessa, jossa ei jaeta pisteitä, joukkueilla ei ole tulosta.

!shot[ParticipantList/start-list-team-standings] Joukkueiden tulokset: joukkueet 1 ja 2 olivat tasapisteissä, ja joukkue 2 voitti uusintatehtävän

### Sarjat

Joukkuekilpailussa voi olla useita sarjoja, esimerkiksi avoin sarja ja rotusarja. Silloin joukkueet
on jaettu sarjoihin, kukin sarjan nimen alla, ja sarjaan kuulumattomat joukkueet ovat ensimmäisinä. Jokainen sarja sijoitetaan erikseen: kullakin sarjalla on oma ensimmäinen sijansa ja
tasapisteissä oma uusintatehtävänsä. Sarjan nimi näkyy sivun kielellä, jos järjestäjä on antanut
sen sillä kielellä, ja muuten suomeksi.

!shot[ParticipantList/start-list-team-series] Joukkuekilpailu kahdessa sarjassa: joukkue 4 ei kuulu sarjaan, ja kummallakin sarjalla on oma ensimmäinen sijansa

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
keskeytti kokeen, myös koiran loukkaantumisen tai sairastumisen vuoksi, tuloksen perässä on merkintä
*{t:results.marks.interrupted}*. Ohjaajan oma keskeytys ei saa merkintää. Työkokeessa (NOWT) tuloksen
perässä ovat koiran pisteet kierroksen enimmäispisteistä ja prosentti kokonaislukuna, esimerkiksi
*AVO1 65/80 p 81 %*. Kesken jääneellä kierroksella ne ovat siihen asti ansaitut pisteet, nollan tai
viivan perässä. Palkitun koiran rivillä näkyy myös sen sija luokassa sinä päivänä, esimerkiksi
*Sija 2*; samat pisteet saaneet jakavat sijan. Tulokset
julkaistaan luokittain, ja useampipäiväisessä kokeessa päivä kerrallaan, joten sivulla voi olla
luokkia, joiden tulokset ovat jo näkyvissä, ja luokkia, joilla ei vielä ole niitä.

Tulokset näkyvät vain Koekalenterin starttilistalla. Kennelliiton jalostustietojärjestelmään ne
kirjataan Koekalenterista riippumatta.
