---
title: Koepäivä ja tulokset
audience: secretary
order: 40
covers:
  - src/pages/admin/EventStationsPage.tsx
  - src/pages/admin/components/DroppedTasksDialog.tsx
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
*{t:eventManagement.results.title}* kokoaa kaiken tähän kuuluvan: suorituspaikkojen määrittelyn,
tulosten syötön ja luokittaisen julkaisun. Tallentaminen ja julkaiseminen ovat kaksi eri asiaa —
syötetty tulos näkyy vain ylläpidossa, kunnes luokka julkaistaan.

!shot[ResultsPublishing/results-publishing] Tulosten julkaisu luokittain, alla suorituspaikat ja tulosten syöttö

## Ennen kokeen alkua

Tarkista tapahtumasivulta, että koe on liitetty Kennelliiton kokeeseen (*{t:event.kcGuidLinked}*).
Liitosta ei tarvita tulosten syöttämiseen, mutta tulossivu muistuttaa puuttuvasta liitoksesta ja
tarjoaa painikkeen **{t:event.kcIdLookup}**, jolla kokeen voi liittää Kennelliiton kokeeseen
poistumatta sivulta. Jos lista näyttää kokeen mutta ei anna valita sitä, Kennelliitto ei ole vielä
antanut kokeelle tunnistetta: liittämistä voi yrittää myöhemmin uudelleen.

Koepaikalla tarvittava starttilista avautuu paneelin *{t:eventManagement.actions}*-osion
painikkeella **{t:eventManagement.startList.secretary}**. Kirjautuneena myös julkisella
starttilistalla on painikkeet **{t:copyStartList}**, joka kopioi listan tekstinä esimerkiksi
foorumille, ja **{t:downloadStartList}**, joka lataa sen taulukkona.

Luokkasihteerille, joka kirjaa oman luokkansa starttinumerot, annetaan
*Ilmoittautumisajan jälkeen* -ohjeen mukainen linkki. Linkki avaa yhden luokan numerot ilman
kirjautumista, ja tallennus kertoo heti, jos numero on jo toisella koiralla tai ei kuulu luokalle.

!shot[StartNumbersEntry/start-numbers-entry-class-link] Luokkasihteerin näkymä omaan luokkaansa

## Suorituspaikat

NOWT-kokeessa koirakot tekevät rastinsa tuomarien suorituspaikoilla, ja pisteet kirjataan
rasteittain. Rasti on yksi 20 pisteen suoritus, ja kokeessa on tavallisesti neljä tai viisi rastia.
Suorituspaikat määritellään omalla sivullaan, jonka paneelin painike
**{t:eventManagement.stations}** avaa; painike näkyy vain niissä koemuodoissa, joissa pisteet
kirjataan rasteilla. Rata rakennetaan yleensä vasta koepaikalla, joten sivu on erillään kokeen
tiedoista.

Jokaiselle koepäivälle lisätään omat suorituspaikkansa painikkeella **{t:event.stationAdd}**, ja ne
numeroidaan päivän sisällä yhdestä alkaen. Suorituspaikalle kirjataan *{t:event.stationParts}*,
*{t:event.stationDogsAtOnce}* ja *{t:event.stationJudges}*, jotka valitaan kokeen tuomareista.
Osajako ja koiramäärä ovat paikan oletuksia sen rasteille. Osajako 2 jakaa rastin kahteen 10 pisteen
osaan; ensimmäisen palkinnon alaraja, puolet rastin pisteistä, koskee silloin osien summaa.
*{t:event.stationDogsAtOnce}* kertoo, montako koiraa otetaan kerralla samaan vuoroon. Aiemmin
kahteen osaan tallennettu paikka luetaan yhtenä rastina kahdessa osassa, joten sen tulokset
säilyvät ennallaan. Tarpeeton suorituspaikka poistetaan painikkeella
**{t:event.stationRemove}**, ja loput numeroituvat uudelleen.

**{t:event.rotation.title}.** Päivän suorituspaikkojen alla kerrotaan, missä järjestyksessä ja missä
paikoissa kukin ryhmä tekee rastinsa. Ilman ryhmiä jokainen luokka tekee yhden rastin kullakin päivän
suorituspaikalla numerojärjestyksessä, kuten ennenkin. Painike **{t:event.rotation.add}** lisää
ryhmän: ryhmä on luokka tai luokan koenumeroväli (*{t:event.rotation.firstNumber}* ja
*{t:event.rotation.lastNumber}* jätetään tyhjiksi, kun ryhmä on koko luokka). Ryhmän rivillä ovat
sen rastit järjestyksessä, ja kullekin rastille valitaan suorituspaikka, osajako ja
*{t:event.stationDogsAtOnce}*; muuten noudatetaan paikan oletusta. Sama suorituspaikka voi olla
useammalla rastilla, peräkkäin tai erillään: kaksi rastia samassa paikassa ovat kaksi saraketta, ja
kahden tuomarin koe voi kiertää paikat kahdesti (1, 2, 1, 2). Kun rastin suorituspaikkaa vaihdetaan,
rastin osajako ja koiramäärä pysyvät samoina, myös kun ne olivat vanhan paikan oletuksia. **+** lisää
rastin samaan suorituspaikkaan kuin ryhmän viimeinen rasti, ja valinta
*{t:event.rotation.visitNone}* poistaa rastin, kun ryhmällä on muitakin rasteja; koko ryhmä
poistetaan sen omalla roskakoripainikkeella. Jos ryhmällä on muu määrä kuin neljä tai viisi rastia,
sivu varoittaa siitä mutta tallentaa.

Päivän ensimmäinen ryhmä tekee yhden rastin kullakin suorituspaikalla numerojärjestyksessä. Seuraava
ryhmä ehdotetaan edellisen perusteella, koska ryhmät kiertävät yleensä samaan suuntaan: ryhmä
aloittaa paikasta, johon edellinen siirtyi ensimmäisestä paikastaan, ja jatkaa samassa järjestyksessä.
Peräkkäin toistuva paikka pysyy peräkkäisenä, joten edellisen 1, 2, 3, 3 antaa 2, 3, 1, 1 ja 1, 1, 2, 3
antaa 2, 2, 3, 1. Rastin osajako ja
koiramäärä pysyvät rastin numerolla. Luokaksi tulee ensimmäinen luokka ilman ryhmää; kun kaikilla
päivän luokilla on ryhmä, luokaksi tulee edellisen ryhmän luokka, *{t:event.rotation.firstNumber}* on
edellisen ryhmän viimeinen numero plus yksi ja *{t:event.rotation.lastNumber}* jää tyhjäksi.
Ehdotusta voi muokata kuten mitä tahansa ryhmää, myös vaihtamalla sen luokan.

Esimerkiksi kolmen luokan kokeessa ALO tekee rastit 1, 2, 3 ja 4 suorituspaikoilla 1, 2, 3 ja 3, AVO
paikoilla 3, 1, 2 ja 2 ja VOI paikoilla 2, 3, 1 ja 1, jolloin jokaisen luokan enimmäispistemäärä on 80.
Kun ensimmäiselle ryhmälle on lisätty neljäs rasti paikkaan 3 ennen kahden muun lisäämistä, ne saavat
paikat 2, 3, 1, 1 ja 3, 1, 2, 2, ja esimerkin järjestykseen riittää vaihtaa niiden luokat keskenään.
Yhden luokan kokeessa suoritusjärjestys jaetaan koenumeroilla, esimerkiksi numerot 1 - 8 aloittavat
paikasta 1 ja 9 - 16 paikasta 2.

Suorituspaikkojen alla näkyy jokainen paikka sellaisena kuin ryhmät sille saapuvat rastin numeron
mukaan, esimerkiksi "Suorituspaikka 1: ALO (rasti 1), AVO (rasti 2), VOI (rastit 3 ja 4)". Paikan
vuoroon nostetaan jonon kärjessä olevan koiran rastin koiramäärä, ja ryhmä, joka tekee paikassa kaksi
rastia, jonottaa sinne kerran kummallekin: ensin kaikki ryhmän koirat rastille 3, sitten rastille 4.
Lähtölistan odotusarvio laskee jäljellä olevat vuorot samoin, ryhmittäin ja rasteittain.

Saman luokan numerovälit eivät saa mennä päällekkäin, eikä koko luokan ryhmän rinnalla voi olla saman
luokan numeroväliä. Jos luokka on jaettu numeroväleihin ja jokin osallistuja jää kaikkien välien
ulkopuolelle, sivu luettelee syyt eikä tallenna. Kun päivän suorituspaikka poistetaan, sen rastit
poistuvat kaikista suoritusjärjestyksistä, ja ryhmä, jolle ei jää yhtään rastia, poistuu. Jos koiran
numero myöhemmin muuttuu välien ulkopuolelle, koira kuuluu lähimpään ryhmään: viimeisen välin
jälkeen viimeiseen, ensimmäistä väliä ennen ensimmäiseen ja välien välissä alempaan; koira ilman
numeroa kuuluu ensimmäiseen ryhmään. Koiran rastit tehdään aina sen oman koepäivän suorituspaikoilla.

!shot[EventStationsPage/event-stations-rotation] Kolmen luokan suoritusjärjestys: jokainen luokka aloittaa eri suorituspaikasta ja tekee kaksi viimeistä rastiaan samassa paikassa

**{t:save}** tallentaa suorituspaikat ja suoritusjärjestyksen kokeen tietoihin. Jos koirille on jo
kirjattu tuloksia, tallennus laskee niiden pisteet, enimmäispisteet, prosentin ja palkinnon uudelleen
uuden suoritusjärjestyksen mukaan, joten sijoitukset ja Omakoiraan lähtevät tulokset vastaavat
tulostaulukkoa. Sama koskee luokkien muuttamista kokeen tiedoissa. Jos koiralle tulee rasti, jota ei
ole vielä pisteytetty, koiran palkinto poistuu, kunnes rasti on pisteytetty. Jo lähetetty tulos, joka
muuttuu, on *Omakoira*-sarakkeessa tilassa *{t:results.kennelliitto.badge.changed}* ja lähetetään
uudelleen.

Kirjatut pisteet kuuluvat rastille, jolle ne kirjattiin: rasti 3 pysyy rastina 3, vaikka sen
suorituspaikka tai ryhmän suoritusjärjestys muuttuu. Kun esimerkiksi neljä suorituspaikkaa korjataan
kolmeksi niin, että kolmas paikka tekee rastit 3 ja 4, jokaisen koiran rastien 1, 2, 3 ja 4 pisteet
säilyvät ennallaan, eikä tallennus kysy mitään. Pisteen tuomari on sen suorituspaikan tuomari, jossa
ryhmä tekee rastin: kirjattu tuomari pysyy, kun hän on paikan tuomareita, ja muuten tuomariksi
luetaan paikan ensimmäinen tuomari. Omakoiraan lähtevät tuomarit luetaan samoin.

Pisteet poistuvat vain, kun rasti poistuu suoritusjärjestyksestä tai rastin osajako muuttuu, koska
pisteitä ei silloin voi lukea samalle rastille. Poistuvat pisteet luetellaan ennen tallennusta
koirittain.
**{t:event.resultTasksDropped.confirm}** tallentaa muutoksen ja poistaa pisteet, eivätkä ne palaa,
vaikka muutos perutaan myöhemmin. **{t:cancel}** jättää muutoksen tallentamatta.

!shot[DroppedTasksDialog/dropped-tasks] Muutos poistaisi kolmen koiran kirjattuja pisteitä

Huomaa: jos suoritusjärjestyksen keskelle lisätään rasti sen jälkeen, kun pisteitä on kirjattu, sen
jälkeisten rastien numerot kasvavat yhdellä, mutta kirjatut pisteet pysyvät vanhoilla numeroillaan.
Lisää rasti silloin järjestyksen loppuun tai tarkista tulostaulukko tallennuksen jälkeen.

Kun tulokset on luovutettu ylituomarille tai hyväksytty, muutosta, joka muuttaisi kirjattuja
tuloksia, ei tallenneta. Muutos, joka ei muuta yhdenkään koiran tulosta, tallentuu silti.

## Tulosten syöttö

Paneelin painike **{t:eventManagement.enterResults}** aktivoituu, kun koe on alkanut, ja avaa
sivun **{t:results.title}**. Monipäiväisessä kokeessa valitaan ensin päivä, ja luokat ovat omilla
välilehdillään. Sivulla ovat vain osallistujiksi nostetut koirakot starttijärjestyksessä.

**Rasteilla pisteytettävä koe (NOWT).** Jokaisella rastilla on oma sarakkeensa rastin numerolla,
"Rasti 1", "Rasti 2" ja niin edelleen, riippumatta siitä, missä suorituspaikassa ryhmä rastin teki.
Kahteen osaan jaetun rastin osat ovat omissa sarakkeissaan, esimerkiksi "Rasti 2, osa 1/2". Koiran
rivillä on kenttä vain sen oman ryhmän rasteille. Pisteet kirjoitetaan kenttään, jonka alla näkyy
rastin enimmäispistemäärä. Kentän alla on rastin arvostellut tuomari: yhden tuomarin
suorituspaikalla nimi vain näytetään, useamman tuomarin paikalla se valitaan ja valinta siirtyy
seuraavalle koirakolle. Nolla pistettä vaatii syyn kenttään *{t:results.zeroFault}*. Jos
arvostelukortista ei käy ilmi, miksi rasti nollattiin, valitaan *{t:results.zeroFaults.unknown}*.
Tulos lasketaan riville itsestään sääntöjen mukaan: yksikin nolla
estää palkintosijan, ja rivin alla näkyy pisteiden summa. Valinnalla *{t:results.scope}* sivun
voi rajata yhteen suorituspaikkaan, jolloin näkyvissä ovat vain siellä tehdyt rastit; tulos jää
silloin pois, koska se riippuu muistakin paikoista. Valinnassa ovat vain näytettävän päivän
suorituspaikat, ja rajattuna sivulla ovat vain ne koirakot, joiden ryhmä käy paikassa.

!shot[ResultsTable/results-entry-nowt] NOWT-luokan pisteet rasteittain, toisen koirakon ohjaaja keskeytti suorituspaikalla 1

**Muut koemuodot.** Tulos on tuomarin päätös ja se valitaan kentästä *{t:results.column.result}*:
palkintosija 1–3, nolla tai viiva, NOU- ja NKM-kokeessa vain hyväksytty tai hylätty. Vieressä on
*{t:results.judge}*, jos luokalla on useampi tuomari.

!shot[ResultsTable/results-entry-nou] NOU-kokeen tulokset: tuomari ja tulos

**Keskeytys.** Kentästä *{t:results.interruption}* kirjataan, jos koirakon koe päättyi kesken.
Työkokeessa (NOWT) vaihtoehdot ja niiden tulokset sääntöjen mukaan ovat:

- *{t:results.retirement.handlerChoice}*: tulos on nolla. Jos tuomarin mielestä koiralla olisi vielä
  ollut mahdollisuus palkintosijoille, ruksataan *{t:results.couldStillHavePlaced}*, jolloin tulos on
  viiva.
- *{t:results.retirement.injury}* tai *{t:results.retirement.illness}*: tuomari keskeytti kokeen, ja
  tulos on viiva, jonka perässä on julkaistulla listalla merkintä *{t:results.marks.interrupted}*.
- *{t:results.retirement.judgeStopped}*: tulos on nolla ja merkintä *{t:results.marks.interrupted}*.

Ohjaajan keskeytys ei saa merkintää *{t:results.marks.interrupted}*, kuten ei Kennelliiton
jalostustietojärjestelmässäkään. Kaikkien suorituspaikkojen näkymässä kysytään lisäksi
*{t:results.outcomeAt}*, eli millä rastilla koe päättyi, esimerkiksi "Rasti 3 (suorituspaikka 3)":
ryhmä voi käydä samassa paikassa useammin, joten paikka ei yksin kerro, mikä käynti oli kyseessä.
Keskeytys kirjataan rastille kuten pisteetkin, ja se pysyy sillä rastilla, vaikka suoritusjärjestys
muuttuu.
Keskeytyksen jälkeiset rastit koiran suoritusjärjestyksessä näkyvät tekstinä
*{t:results.notReached}*, myös yhteen suorituspaikkaan rajatussa näkymässä ja suorituspaikan
kirjaussivulla, jossa koirakko näkyy jo käyneenä niiden rastien kohdalla. Siihen asti
saadut pisteet säilyvät ja niitä voi muokata, ja rivin alla näkyy niiden summa koko suoritusjärjestyksen
enimmäispisteitä vasten. Sama summa lähtee Omakoiraan. Jos myöhemmälle rastille on jo kirjattu
pisteet, kenttä jää näkyviin ja pisteet lasketaan summaan, joten ne voi tarvittaessa poistaa. Kun
valintana on *{t:results.outcomeAtUnknown}*, mikään rasti ei näy keskeytettynä.

Muissa koemuodoissa kentästä kirjataan vain *{t:results.retirement.judgeStopped}*. Tulos on sääntöjen
mukaan nolla, ja julkaistulla listalla sen perässä on merkintä *{t:results.marks.interrupted}*. Jo
kirjattu palkintosija ei voi saada keskeytystä rinnalleen; poista ensin tulos.

Keskeytys kysytään vain koemuodoissa, joissa Kennelliitto sen kirjaa (NOME-A, NOME-B, NKM ja NOWT).
Taipumuskokeessa (NOU) keskeytystä ei ole, joten kenttää ei näytetä. Jos NOU-koirakolle on aiemmin
kirjattu keskeytys, kenttä näkyy sen rivillä, jotta keskeytyksen voi poistaa.

!shot[ResultsTable/results-entry-nome-b] NOME-B-luokan tulokset: keskeytys tuloksen vieressä

Puhelimella koirakot ovat allekkain omina kortteinaan samoilla kentillä.

**{t:results.save}** tallentaa vain muuttuneet rivit; **{t:cancel}** hylkää muutokset. Jos sivulta
poistuu tallentamatta, selain varoittaa. Toisen koesihteerin tallennukset päivittyvät sivulle
itsestään. Jos sama koirakko on ehditty kirjata muualla toisin, tallennus pysähtyy ikkunaan
**{t:results.conflictTitle}**, joka näyttää molemmat versiot ja kysyy, kumpi jää voimaan;
**{t:results.conflictResolve}** tallentaa valinnat. Muut rivit on tallennettu jo silloin. Jos valintojen
tallennus epäonnistuu, ikkuna jää auki ja syötetyt pisteet säilyvät; jos koirakko on sillä välin
kirjattu muualla taas toisin, ikkuna näyttää uuden version.

Virallisessa kokeessa sarake *{t:results.kennelliitto.column}* kertoo jokaisen koiran kohdalla,
onko sen tulos Omakoirassa: *{t:results.kennelliitto.badge.sent}*,
*{t:results.kennelliitto.badge.changed}*, *{t:results.kennelliitto.badge.unsent}* tai
*{t:results.kennelliitto.badge.failed}*. Tulossivu ja suorituspaikan kirjaussivu lukevat kokeen tilan
Kennelliitosta avautuessaan, joten tuomarille luovutettu koe avautuu vain luettavaksi myös silloin,
kun se on luovutettu suoraan Omakoirassa. Lähetyksestä ja tulosten korjaamisesta lähetyksen jälkeen
kerrotaan sivulla [Ilmoittautumisajan jälkeen](/docs/secretary/after-entry-closes), kohdassa
*Tulosten lähetys Kennelliittoon*.

## Tulosten julkaisu

Tulokset julkaistaan luokittain paneelin painikkeella **{t:eventManagement.results.publish}**, ja
kalenteri pyytää vahvistuksen. Julkaisu edellyttää, että luokan starttilista on julkaistu, että koe
on alkanut ja että päivän koirakoista ainakin yhdelle on syötetty tulos. Siihen asti rivillä lukee,
mikä puuttuu: *{t:eventManagement.results.startListRequired}* tai
*{t:eventManagement.results.noResults}*. Julkaistu
tulos näkyy julkisella starttilistalla koirakon rivin viimeisenä rivinä, ja myöhemmin tallennetut
korjaukset näkyvät siellä sellaisinaan. **{t:eventManagement.results.hide}** piilottaa
rivin tulokset uudelleen. Kokeessa, jossa ei ole luokkia (esimerkiksi NOU), on koetyypin mukaan
nimetty rivi, joka julkaisee koko kokeen tulokset.

Useampipäiväisessä kokeessa jokaisella luokalla on oma rivi kullekin koepäivälle, ja jokainen päivä
julkaistaan ja piilotetaan erikseen. Ensimmäisen päivän tulokset voi julkaista heti päivän
päätteeksi, eikä toisen päivän tuloksia näytetä, ennen kuin myös se päivä on julkaistu. Päivää ei
voi julkaista ennen kuin se on alkanut.

Julkaisu koskee vain Koekalenteria: se ei lähetä tuloksia Kennelliittoon.
