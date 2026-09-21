---
title: Koepäivä ja tulokset
audience: secretary
order: 40
covers:
  - src/pages/admin/EventStationsPage.tsx
  - src/pages/admin/eventStationsPage/**
  - src/pages/admin/EventResultsPage.tsx
  - src/pages/admin/eventResultsPage/**
  - src/pages/admin/StationResultsPage.tsx
  - src/pages/LiveEntryPage.tsx
  - src/pages/components/stationScoring/**
  - src/pages/admin/eventViewPage/infoPanel/ResultsPublishing.tsx
  - src/pages/admin/components/KcIdLookupButton.tsx
  - src/pages/admin/components/StartDaySelector.tsx
---

Koepäivänä koesihteerin työ on kirjata, mitä koirakot tekivät, ja saada tulokset osallistujien
nähtäville. Tapahtumasivun **{t:eventManagement.tabs.management}** -paneelin osio
*{t:eventManagement.results.title}* kokoaa kaiken tähän kuuluvan: rastien määrittelyn,
tulosten syötön ja luokittaisen julkaisun. Tallentaminen ja julkaiseminen ovat kaksi eri asiaa —
syötetty tulos näkyy vain ylläpidossa, kunnes luokka julkaistaan.

!shot[ResultsPublishing/results-publishing] Tulosten julkaisu luokittain, alla rastit ja tulosten syöttö

## Ennen kokeen alkua

Tarkista tapahtumasivulta, että kokeella on *{t:event.kcId}*. Sitä ei tarvita tulosten
syöttämiseen, mutta tulossivu muistuttaa puuttuvasta tunnuksesta ja tarjoaa painikkeen
**{t:event.kcIdLookup}**, jolla tunnuksen voi hakea Kennelliitosta poistumatta sivulta.

Koepaikalla tarvittava starttilista avautuu paneelin *{t:eventManagement.actions}*-osion
painikkeella **{t:eventManagement.startList.secretary}**. Kirjautuneena myös julkisella
starttilistalla on painikkeet **{t:copyStartList}**, joka kopioi listan tekstinä esimerkiksi
foorumille, ja **{t:downloadStartList}**, joka lataa sen taulukkona.

Luokkasihteerille, joka kirjaa oman luokkansa starttinumerot, annetaan
*Ilmoittautumisajan jälkeen* -ohjeen mukainen linkki. Linkki avaa yhden luokan numerot ilman
kirjautumista, ja tallennus kertoo heti, jos numero on jo toisella koiralla tai ei kuulu luokalle.

!shot[StartNumbersEntry/start-numbers-entry-class-link] Luokkasihteerin näkymä omaan luokkaansa

## Rastit

NOWT-kokeessa koirakot kiertävät rasteja, ja pisteet kirjataan rasteittain. Rastit määritellään
omalla sivullaan, jonka paneelin painike **{t:eventManagement.stations}** avaa; painike näkyy vain
niissä koemuodoissa, joissa pisteytys tehdään rasteilla. Rata rakennetaan yleensä vasta
koepaikalla, joten sivu on erillään kokeen tiedoista.

Jokaiselle koepäivälle lisätään omat rastinsa painikkeella **{t:event.stationAdd}**, ja ne
numeroidaan päivän sisällä yhdestä alkaen. Rastista kirjataan *{t:event.stationTasks}* (yksi tai
kaksi), *{t:event.stationDogsAtOnce}* ja *{t:event.stationJudges}*, jotka valitaan kokeen
tuomareista. Tarpeeton rasti poistetaan painikkeella **{t:event.stationRemove}**, ja loput
numeroituvat uudelleen. **{t:save}** tallentaa rastit kokeen tietoihin.

## Tulosten syöttö

Paneelin painike **{t:eventManagement.enterResults}** aktivoituu, kun koe on alkanut, ja avaa
sivun **{t:results.title}**. Monipäiväisessä kokeessa valitaan ensin päivä, ja luokat ovat omilla
välilehdillään. Sivulla ovat vain osallistujiksi nostetut koirakot starttijärjestyksessä.

**Rasteilla pisteytettävä koe (NOWT).** Jokaisella tehtävällä on oma sarakkeensa, ja pisteet
kirjoitetaan kenttään, jonka alla näkyy tehtävän enimmäispistemäärä. Kentän alla on tehtävää
arvostellut tuomari: yhden tuomarin rastilla nimi vain näytetään, useamman tuomarin rastilla
se valitaan ja valinta siirtyy seuraavalle koirakolle. Nolla pistettä vaatii syyn kenttään
*{t:results.zeroFault}*. Tulos lasketaan riville itsestään sääntöjen mukaan: yksikin nolla
estää palkintosijan, ja rivin alla näkyy pisteiden summa. Valinnalla *{t:results.scope}* sivun
voi rajata yhteen rastiin, jolloin näkyvissä ovat vain sen rastin tehtävät — tulos jää silloin
pois, koska se riippuu muistakin rasteista.

!shot[ResultsTable/results-entry-nowt] NOWT-luokan pisteet tehtävittäin, toinen koirakko keskeytetty rastilla 2

**Muut koemuodot.** Tulos on tuomarin päätös ja se valitaan kentästä *{t:results.column.result}*:
palkintosija 1–3, nolla tai viiva, NOU- ja NKM-kokeessa vain hyväksytty tai hylätty. Vieressä on
*{t:results.judge}*, jos luokalla on useampi tuomari.

!shot[ResultsTable/results-entry-nou] NOU-kokeen tulokset: tuomari, tulos ja keskeytys

**Keskeytys.** Kentästä *{t:results.interruption}* kirjataan
*{t:results.retirement.judgeStopped}*. Keskeytetyn koirakon tulos on sääntöjen mukaan nolla, ja
julkaistulla listalla sen perässä on merkintä *{t:results.marks.interrupted}*. Koko kierroksen
näkymässä kysytään lisäksi *{t:results.outcomeAt}*, eli millä rastilla keskeytys tapahtui. Jo
kirjattu palkintosija ei voi saada keskeytystä rinnalleen; poista ensin tulos.

Puhelimella koirakot ovat allekkain omina kortteinaan samoilla kentillä.

**{t:results.save}** tallentaa vain muuttuneet rivit; **{t:cancel}** hylkää muutokset. Jos sivulta
poistuu tallentamatta, selain varoittaa. Toisen koesihteerin tallennukset päivittyvät sivulle
itsestään. Jos sama koirakko on ehditty kirjata muualla toisin, tallennus pysähtyy ikkunaan
**{t:results.conflictTitle}**, joka näyttää molemmat versiot ja kysyy, kumpi jää voimaan;
**{t:results.conflictResolve}** tallentaa valinnat. Muut rivit on tallennettu jo silloin.

## Tulosten julkaisu

Tulokset julkaistaan luokittain paneelin painikkeella **{t:eventManagement.results.publish}**, ja
kalenteri pyytää vahvistuksen. Julkaisu edellyttää, että luokan starttilista on julkaistu — muuten
rivillä lukee *{t:eventManagement.results.startListRequired}* — ja että koe on alkanut. Julkaistu
tulos näkyy julkisella starttilistalla koirakon rivin viimeisenä rivinä, ja myöhemmin tallennetut
korjaukset näkyvät siellä sellaisinaan. **{t:eventManagement.results.hide}** piilottaa
luokan tulokset uudelleen.

Julkaisu koskee vain Koekalenteria: se ei lähetä tuloksia Kennelliittoon.

TODO: Rastin oma kirjausnäkymä ja tuomarin sihteerin live-kirjauslinkki ovat julkaisusta pois kytkettyinä (`liveViewEnabled`); kuvataan, kun ne otetaan käyttöön.
