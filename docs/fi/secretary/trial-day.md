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
*{t:eventManagement.results.title}* kokoaa kaiken tähän kuuluvan: rastien määrittelyn,
tulosten syötön ja luokittaisen julkaisun. Tallentaminen ja julkaiseminen ovat kaksi eri asiaa —
syötetty tulos näkyy vain ylläpidossa, kunnes luokka julkaistaan.

!shot[ResultsPublishing/results-publishing] Tulosten julkaisu luokittain, alla rastit ja tulosten syöttö

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

## Rastit

NOWT-kokeessa koirakot kiertävät rasteja, ja pisteet kirjataan rasteittain. Rastit määritellään
omalla sivullaan, jonka paneelin painike **{t:eventManagement.stations}** avaa; painike näkyy vain
niissä koemuodoissa, joissa pisteytys tehdään rasteilla. Rata rakennetaan yleensä vasta
koepaikalla, joten sivu on erillään kokeen tiedoista.

Jokaiselle koepäivälle lisätään omat rastinsa painikkeella **{t:event.stationAdd}**, ja ne
numeroidaan päivän sisällä yhdestä alkaen. Rastista kirjataan *{t:event.stationTaskCount}*,
*{t:event.stationParts}*, *{t:event.stationDogsAtOnce}* ja *{t:event.stationJudges}*, jotka
valitaan kokeen tuomareista. *{t:event.stationDogsAtOnce}* on rastin oletus sille, montako koiraa
rastille otetaan kerralla samaan vuoroon. Tehtävä on aina 20 pistettä, joten rastin enimmäispistemäärä on sen
tehtävien määrä kertaa 20. Osajako 2 jakaa tehtävän kahteen 10 pisteen osaan; ensimmäisen palkinnon
alaraja, puolet tehtävän pisteistä, koskee silloin osien summaa. Ennen kiertoryhmiä tallennettu
kahden tehtävän rasti luetaan yhtenä tehtävänä kahdessa osassa, joten sen tulokset säilyvät
ennallaan. Tarpeeton rasti poistetaan painikkeella **{t:event.stationRemove}**, ja loput
numeroituvat uudelleen.

**{t:event.rotation.title}.** Päivän rastien alla kerrotaan, missä järjestyksessä koirakot rastit
kiertävät. Ilman kiertoryhmiä jokainen luokka kiertää päivän rastit numerojärjestyksessä ja tekee
kullakin rastilla rastin oletusmäärän tehtäviä, kuten ennenkin. Painike
**{t:event.rotation.add}** lisää kiertoryhmän: ryhmä on luokka tai luokan koenumeroväli
(*{t:event.rotation.firstNumber}* ja *{t:event.rotation.lastNumber}* jätetään tyhjiksi, kun
ryhmä on koko luokka). Päivän ensimmäinen ryhmä kiertää päivän rastit numerojärjestyksessä. Seuraava
ryhmä ehdotetaan edellisen perusteella, koska kiertosuunta on yleensä kaikilla sama: ryhmä aloittaa
rastilta, jolla edellinen kävi toisena, ja kiertää samassa järjestyksessä. Sarakkeen asetukset
pysyvät sarakkeessa, joten viimeisen rastin kaksi tehtävää siirtyvät uuden ryhmän omalle viimeiselle
rastille. Luokaksi tulee ensimmäinen luokka ilman ryhmää; kun kaikilla päivän luokilla on ryhmä,
luokaksi tulee edellisen ryhmän luokka, *{t:event.rotation.firstNumber}* on edellisen ryhmän
viimeinen numero plus yksi ja *{t:event.rotation.lastNumber}* jää tyhjäksi. Ehdotusta voi muokata
kuten mitä tahansa ryhmää, myös vaihtamalla sen luokan. Järjestys muutetaan
valitsemalla sarakkeeseen rasti: jos ryhmä käy jo valitulla rastilla toisessa sarakkeessa, rastit
vaihtavat paikkaa ja kumpikin säilyttää omat asetuksensa. Rasti, jolla ryhmä ei vielä käy, saa
sarakkeen asetukset. Valinta *{t:event.rotation.visitNone}* poistaa
rastin kierrosta, kun ryhmällä on muitakin rasteja; koko ryhmä poistetaan sen omalla
roskakoripainikkeella. **+** lisää kiertoon rastin, jolla ryhmä ei vielä käy. Kullekin rastille voi
antaa ryhmän tehtävien määrän (1 - 3), osajaon ja *{t:event.stationDogsAtOnce}*; muuten noudatetaan
rastin oletusta. Sama rasti voi siten ottaa yhden luokan koirat yksitellen ja toisen pareittain:
rastin kirjausnäkymä nostaa vuoroon jonon kärjessä olevan koiran ryhmän koiramäärän, ja lähtölistan
odotusarvio laskee jäljellä olevat vuorot ryhmittäin samalla määrällä. Esimerkiksi kolmen luokan
kokeessa ALO kiertää rastit 1, 2 ja 3 ja tekee rastilla 3 kaksi tehtävää, AVO kiertää 3, 1 ja 2 ja
VOI 2, 3 ja 1, jolloin jokaisen luokan enimmäispistemäärä on 80. Kun ensimmäisen ryhmän viimeiselle
rastille on merkitty kaksi tehtävää ennen kahden muun lisäämistä, kolme peräkkäin lisättyä ryhmää
kiertävät 1, 2, 3; 2, 3, 1 ja 3, 1, 2, kukin kahdella tehtävällä omalla viimeisellä rastillaan,
joten tämä kierto on kahden luokanvaihdon päässä ehdotuksesta: toisen ryhmän luokaksi valitaan VOI
ja kolmannen AVO. Yhden luokan kokeessa kierto jaetaan koenumeroilla, esimerkiksi numerot 1 - 8
aloittavat rastilta 1 ja 9 - 16 rastilta 2.

Rastien alla näkyy jokainen rasti sellaisena kuin ryhmät sille saapuvat, esimerkiksi "Rasti 1: ALO,
AVO, VOI (x 2)": "(x 2)" kertoo, että ryhmä tekee rastilla kaksi tehtävää, ja "(2 osaa)", että
tehtävä on jaettu kahteen osaan. Saman luokan numerovälit eivät saa mennä päällekkäin, eikä koko
luokan ryhmän rinnalla voi olla saman luokan numeroväliä. Jos luokka on jaettu numeroväleihin ja
jokin osallistuja jää kaikkien välien ulkopuolelle, sivu luettelee syyt eikä tallenna. Kun päivän
rasti poistetaan, se poistuu kaikista kierroista, ja ryhmä, jolle ei jää yhtään rastia, poistuu.
Jos koiran numero myöhemmin muuttuu välien ulkopuolelle, koira kiertää lähimmän ryhmän mukana:
viimeisen välin jälkeen viimeisen ryhmän, ensimmäistä väliä ennen ensimmäisen ja välien välissä
alemman ryhmän; koira ilman numeroa kiertää ensimmäisen ryhmän mukana. Koiran kierros koostuu aina
sen oman koepäivän rasteista.

!shot[EventStationsPage/event-stations-rotation] Kolmen luokan kierto: jokainen luokka aloittaa eri rastilta ja tekee viimeisellä rastillaan kaksi tehtävää

**{t:save}** tallentaa rastit ja kierron kokeen tietoihin. Jos koirille on jo kirjattu tuloksia,
tallennus laskee niiden pisteet, enimmäispisteet, prosentin ja palkinnon uudelleen uuden kierroksen
mukaan, joten sijoitukset ja Omakoiraan lähtevät tulokset vastaavat tulostaulukkoa. Sama koskee
luokkien muuttamista kokeen tiedoissa. Jos koiran kierrokseen tulee tehtävä, jota ei ole vielä
pisteytetty, koiran palkinto poistuu, kunnes tehtävä on pisteytetty. Jo lähetetty tulos, joka
muuttuu, on *Omakoira*-sarakkeessa tilassa *{t:results.kennelliitto.badge.changed}* ja lähetetään
uudelleen.

Kirjattu tehtävä säilyy vain, jos sen paikka tarkoittaa koiran uudella kierroksella samaa tehtävää
kuin ennen. Kun esimerkiksi rastin tehtävämäärä vaihdetaan kahdesta yhteen tai tehtävän osajako
muuttuu, poistuvat pisteet luetellaan ennen tallennusta koirittain. **{t:event.resultTasksDropped.confirm}**
tallentaa muutoksen ja poistaa pisteet, eivätkä ne palaa, vaikka muutos perutaan myöhemmin.
**{t:cancel}** jättää muutoksen tallentamatta.

!shot[DroppedTasksDialog/dropped-tasks] Rastin muutos poistaisi kolmen koiran kirjattuja tehtäviä

Kun tulokset on luovutettu ylituomarille tai hyväksytty, muutosta, joka muuttaisi kirjattuja
tuloksia, ei tallenneta. Muutos, joka ei muuta yhdenkään koiran tulosta, tallentuu silti.

## Tulosten syöttö

Paneelin painike **{t:eventManagement.enterResults}** aktivoituu, kun koe on alkanut, ja avaa
sivun **{t:results.title}**. Monipäiväisessä kokeessa valitaan ensin päivä, ja luokat ovat omilla
välilehdillään. Sivulla ovat vain osallistujiksi nostetut koirakot starttijärjestyksessä.

**Rasteilla pisteytettävä koe (NOWT).** Jokaisella tehtävällä on oma sarakkeensa ryhmän
kiertojärjestyksessä, ja tehtävät numeroidaan koko kierroksen läpi. Kahteen osaan jaetun tehtävän
osat ovat omissa sarakkeissaan, esimerkiksi "Tehtävä 2, osa 1/2". Jos luokka on jaettu
numeroväleihin ja ryhmien kierrokset eroavat, sarakkeet nimetään rasteittain, esimerkiksi "Rasti 2,
tehtävä 2", ja koiran rivillä on kenttä vain sen oman ryhmän tehtäville. Pisteet kirjoitetaan
kenttään, jonka alla näkyy tehtävän enimmäispistemäärä. Kentän alla on tehtävää arvostellut tuomari:
yhden tuomarin rastilla nimi vain näytetään, useamman tuomarin rastilla se valitaan ja valinta
siirtyy seuraavalle koirakolle. Nolla pistettä vaatii syyn kenttään *{t:results.zeroFault}*. Jos
arvostelukortista ei käy ilmi, miksi tehtävä nollattiin, valitaan *{t:results.zeroFaults.unknown}*.
Tulos lasketaan riville itsestään sääntöjen mukaan: yksikin nolla
estää palkintosijan, ja rivin alla näkyy pisteiden summa. Valinnalla *{t:results.scope}* sivun
voi rajata yhteen rastiin, jolloin näkyvissä ovat vain sen rastin tehtävät — tulos jää silloin
pois, koska se riippuu muistakin rasteista. Valinnassa ovat vain näytettävän päivän rastit, ja
rajattuna sivulla ovat vain ne koirakot, joiden ryhmä käy rastilla.

!shot[ResultsTable/results-entry-nowt] NOWT-luokan pisteet tehtävittäin, toisen koirakon ohjaaja keskeytti rastilla 1

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
jalostustietojärjestelmässäkään. Koko kierroksen näkymässä kysytään lisäksi *{t:results.outcomeAt}*,
eli millä rastilla koe päättyi. Sitä seuraavat rastit koiran kierrosjärjestyksessä näkyvät tekstinä
*{t:results.notReached}*, myös yhteen rastiin rajatussa näkymässä ja rastin kirjaussivulla, jossa
koirakko näkyy jo käyneenä. Siihen asti saadut pisteet säilyvät ja niitä voi muokata, ja rivin alla
näkyy niiden summa koko kierroksen enimmäispisteitä vasten. Sama summa lähtee Omakoiraan. Jos
myöhemmälle rastille on jo kirjattu pisteet, kenttä jää näkyviin ja pisteet lasketaan summaan, joten
ne voi tarvittaessa poistaa. Kun valintana on *{t:results.outcomeAtUnknown}*, mikään rasti ei näy
keskeytettynä.

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
*{t:results.kennelliitto.badge.failed}*. Tulossivu ja rastin kirjaussivu lukevat kokeen tilan
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
