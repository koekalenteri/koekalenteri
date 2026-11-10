---
title: Ilmoittautumisajan jälkeen
audience: secretary
order: 30
covers:
  - src/pages/admin/EventViewPage.tsx
  - src/pages/admin/eventViewPage/ClassEntrySelection.tsx
  - src/pages/admin/eventViewPage/classEntrySelection/**
  - src/pages/admin/eventViewPage/infoPanel/**
  - src/pages/admin/eventViewPage/MoveToPositionDialog.tsx
  - src/pages/admin/eventViewPage/RegistrationCreateDialog.tsx
  - src/pages/admin/eventViewPage/RegistrationEditDialog.tsx
  - src/pages/admin/eventViewPage/SendMessageDialog.tsx
  - src/pages/admin/eventViewPage/MessageRecipientsDialog.tsx
  - src/pages/admin/EventStartNumbersPage.tsx
  - src/pages/admin/eventStartNumbersPage/**
  - src/pages/admin/EventTeamsPage.tsx
  - src/pages/admin/eventTeamsPage/**
  - src/pages/admin/StartListPage.tsx
  - src/pages/admin/StartListPreviewPage.tsx
  - src/pages/admin/startListPage/**
  - src/pages/ClassStartNumbersPage.tsx
---

Kun ilmoittautumisaika on päättynyt, koesihteerin työ etenee vaihe kerrallaan: osallistujien
valinta, koepaikka- ja varasijailmoitukset, koekutsut, starttilista ja lopulta paikan päällä
arvotut starttinumerot. Tapahtumasivun **{t:eventManagement.tabs.management}** -paneeli kulkee samassa
järjestyksessä ja kertoo joka vaiheessa, mikä on tehty ja mikä on seuraavaksi mahdollista:
painike, jota ei vielä voi painaa, kertoo syyn vieressään.

## Ilmoittautumisen lisääminen jälkikäteen

Koesihteeri voi lisätä koirakon kokeeseen ilmoittautumisajan päätyttyäkin. Paina paneelin
*{t:eventManagement.actions}*-osiossa **{t:createRegistration}** ja täytä koirakon tiedot samalla lomakkeella,
jolla ilmoittautujat itse ilmoittautuvat. Kun kaikki tarvittava on täytetty, **{t:registration.cta.confirmAndSendLink}** lähettää maksulinkin maksajaksi merkityn henkilön sähköpostiin, ja ilmoittautuminen
näkyy maksamattomana, kunnes maksaja on sen hoitanut. Jos kokeen maksuajankohta on *{t:paymentTimeOptions.confirmation}*, painike on **{t:registration.cta.confirmRegistration}** ja maksulinkki lähtee vasta
koepaikkailmoituksen mukana.

## Osanotto-oikeuden tarkastaminen

Koekalenteri hakee koiran koetulokset Kennelliiton jalostustietokannasta ja tarkastaa oikeuden
osallistua luokkaan itse. Käsin tarkastettavia ovat vain ne koirakot, joiden riville
ilmoittautuja on lisännyt tuloksia itse. Ne tunnistaa huutomerkkikuvakkeesta. Rivin kuvakkeet
selittyvät, kun hiiren vie niiden päälle:

| Kuvake | Mitä se tarkoittaa |
| --- | --- |
| tähti | ilmoittautuja on etusijalla, esimerkiksi järjestävän yhdistyksen jäsenenä; himmeämpi tähti, jos vain omistaja tai vain ohjaaja on jäsen |
| henkilö | omistaja tai ohjaaja on järjestävän yhdistyksen jäsen |
| maksu | ilmoittautuminen on maksettu; punaisena, jos maksusta puuttuu osa, ja palautuksen jälkeen kuvake kertoo palautetun summan |
| plus tehtävälistalla | ilmoittautuja on valinnut lisäpalveluja |
| väkänen | ilmoittautuja on vahvistanut ottavansa koepaikan vastaan |
| punainen kirje | sähköpostin toimitus ilmoittautujalle epäonnistui |
| kirjekuori | koekutsu on lähetetty; avattu kuori tarkoittaa kuitattua kutsua |
| ajastettu lähetys | koekutsu lähtee vasta, kun koepaikka on maksettu |
| huutomerkki | ilmoittautuja on lisännyt koetuloksia itse, **tarkista osanotto-oikeus** |
| puhekupla | ilmoittautuja on kirjoittanut lisätietoja |
| muistiinpano | ilmoittautumisella on koesihteerin sisäinen kommentti |

Jos kokeeseen karsitaan pisteillä, rivin lopussa näkyvät myös karsintapisteet.

## Osallistujien valinta

Osallistujat valitaan raahaamalla koirakko kohdasta *Ilmoittautuneet* sopivaan koepäivän ja -ryhmän
osioon kohdassa *Osallistujat*. Koiran nimen edessä olevat väripalkit kertovat, mihin ryhmiin
ilmoittautuja on ilmoittanut voivansa osallistua, ja samat värit toistuvat ryhmien otsikoissa.
Useamman päivän luokassa vaihtoehtoja ja värejä on useampia. Jos koirakon raahaa ryhmään, johon se
ei ole ilmoittautunut, kalenteri huomauttaa siitä.

!shot[ClassEntrySelection/class-entry-selection-groups-and-reserve] Osallistujat ryhmittäin, ilmoittautuneet alla varasijajärjestyksessä

Paneelin *{t:eventManagement.participantSelection.title}* -osio näyttää luokittain, montako koirakkoa on nostettu suhteessa
koepaikkojen määrään. Jos osallistujia on enemmän kuin kokeen tietoihin tallennettuja paikkoja,
luku näkyy punaisena eikä koepaikkailmoitusta voi lähettää, ennen kuin ylimääräiset on raahattu
takaisin ilmoittautuneisiin.

Ryhmän sisäinen järjestys on koirakoiden starttijärjestys. Sitä voi muuttaa raahaamalla, tai rivin
valikosta (⋮) valinnalla **{t:registration.moveToPositionDialog.moveToPosition}**, joka kysyy päivän ja paikan numeron.

Kohtaan *Ilmoittautuneet* jäävät koirakot ovat varasijalla siinä järjestyksessä, jossa ne ovat
listalla. Järjestystä voi muuttaa raahaamalla, kunnes varasijailmoitukset on lähetetty; sen jälkeen
lista lukittuu, koska varasijalaisille on jo kerrottu heidän sijansa. Lukituksen voi tarvittaessa
avata listan alla olevasta valinnasta, mutta silloin varasijailmoitukset kannattaa lähettää uudelleen.

## Koepaikkailmoitus

Kun luokan osallistujat on valittu, heille lähetetään tieto koepaikasta luokittain paneelin
painikkeella **{t:eventManagement.participantSelection.sendPlaceNotification}**. Avautuvassa ikkunassa näkyy vastaanottajien määrä,
viestin pohja ja sen esikatselu. Pohjaan voi kirjoittaa lisäviestin, ja *{t:event.contactInfo}*-kohdassa
valitaan, mitkä koesihteerin ja vastaavan koetoimitsijan tiedot viestissä kerrotaan.

!shot[SendMessageDialog/send-message-dialog-open] Viestin lähettäminen: pohja, lisäviesti, yhteystiedot ja esikatselu

Viestissä ilmoittautujaa pyydetään vahvistamaan osallistumisensa. Vahvistus näkyy rivillä
väkäsenä. Lähetyksen jälkeen kalenteri kertoo, mihin osoitteisiin viesti lähti, listan
*Viesti*-sarake näyttää viimeisimmän lähetyksen ajan, ja jos toimitus johonkin osoitteeseen
epäonnistuu, rivi saa punaisen kirjekuvakkeen.

Kun koepaikkailmoitukset on kerran lähetetty, paneeli ei enää salli osallistujan siirtämistä
takaisin varasijalle. Jos varasijalta nostetaan tämän jälkeen uusi koirakko osallistujiin,
kalenteri kysyy vahvistuksen ja lähettää sille automaattisesti koepaikkailmoituksen ja, jos kutsut on jo
lähetetty, myös koekutsun.

## Varasijailmoitus

Tarkista ensin, että *Ilmoittautuneet*-listan järjestys on oikea, sillä varasijailmoitus kertoo
jokaiselle hänen sijansa. Sen jälkeen paina paneelin **{t:eventManagement.participantSelection.sendReserveNotification}**. Viesti-ikkuna
toimii samoin kuin koepaikkailmoituksessa.

## Koekutsu

Koekutsut lähetetään luokittain paneelin *{t:eventManagement.invitation.delivery}* -osiosta painikkeella **{t:eventManagement.invitation.send}**. Kutsu on sähköpostiviesti, jota voi täydentää lisäviestillä. Jos lisäviestin tila ei
riitä, kutsuun liitetään erillinen PDF-tiedosto saman osion painikkeella **{t:eventManagement.attachment.addPdf}** ennen
lähetystä; vastaanottaja saa liitteen viestin linkistä, joka samalla kuittaa kutsun luetuksi.

!shot[InvitationDelivery/invitation-delivery] Koekutsun lähetys luokittain, PDF-liite ja odottavat kutsut

Jos kokeen maksuajankohdaksi on valittu *{t:paymentTimeOptions.confirmation}*, koekutsu lähtee
kullekin osallistujalle vasta, kun tämä on maksanut koepaikkansa. Osio näyttää, montako kutsua
odottaa maksua, ja lähettää ne itsestään maksun tultua. Kokeen jälkeen tullut maksu ei enää tuo
koekutsua. Kuitattu kutsu näkyy rivillä avattuna
kirjekuorena ja kuittaamaton suljettuna.

## Starttilista

Kun koekutsut on lähetetty, luokan starttilistan voi julkaista paneelin *{t:eventManagement.startList.publishing}*
-osiosta painikkeella **{t:eventManagement.startList.publish}**. **{t:eventManagement.startList.previewUnpublished}** näyttää listan
sellaisena kuin osallistujat sen näkevät. Julkaistu lista päivittyy itsestään, kun osallistujia
siirretään tai peruutuksia kirjataan. Luokan ensimmäisen koepäivän aamuun asti julkaisu odottaa
lähettämättömiä koekutsuja. Siitä alkaen, ja myös kun luokka on arvosteltu, listan voi julkaista,
vaikka jokin kutsu olisi vielä lähettämättä. Kutsun voi silti lähettää myös koepäivänä.
Julkaistun listan voi piilottaa milloin tahansa painikkeella **{t:eventManagement.startList.hide}**.

!shot[StartListPublishing/start-list-publishing] Starttilistan julkaisu luokittain

Julkinen lista näyttää koirakot aakkosjärjestyksessä ja huomauttaa, ettei starttijärjestystä ole
vielä vahvistettu, kunnes starttinumerot on julkaistu. Koesihteerin oma versio avautuu
*{t:eventManagement.actions}*-osion painikkeella **{t:eventManagement.startList.secretary}**: siinä ovat myös koiran
tunnistusmerkintä ja ohjaajan yhteystiedot, ja siitä koirakot voi kopioida luokittain suoraan
tulostaulukkoon. Jos järjestystä muutetaan taulukon tekemisen jälkeen, muista päivittää myös
taulukko.

!shot[StartListGroup/startlist-secretary-group] Sihteerin starttilista

## Starttinumerot

Starttinumerot arvotaan koepaikalla ja kirjataan kalenteriin paneelin *{t:eventManagement.startList.numbersPublishing}* -osion painikkeella **{t:eventManagement.enterStartNumbers}**. Otsikon alla näkyy, minkä kokeen numeroita syötetään. Sivu näyttää päivän ja luokan koirakot
riveinä, ja jokaiselle kirjoitetaan sen arpoma numero. Jos päivällä on aamupäivän ja iltapäivän
ryhmät, rivit on jaettu vuoron mukaan väliotsikoilla. Numero kuuluu yhdelle koiralle koko
kokeessa: kahden päivän kokeessa esimerkiksi perjantai 1–24 ja lauantai 25–48, ja sama numero
kahdesti estää tallennuksen.

!shot[StartNumbersEntry/start-numbers-entry-secretary] Starttinumeroiden syöttö päivän ja luokan koirakoille

Jos luokilla on omat luokkasihteerit, heille jaetaan syöttösivun linkit välilehdeltä
**{t:startNumbers.linksTab}**, joka on luokkien välilehtien perässä. Välilehdellä on rivi jokaiselle
kokeen luokalle: **{t:startNumbers.copyLink}** kopioi luokan linkin leikepöydälle, ja linkki toimii
ilman kirjautumista ja vain sen luokan numeroihin. **{t:startNumbers.revokeLink}** sulkee luokan
jaetut linkit; seuraava kopiointi antaa uuden.

!shot[StartNumbersEntry/start-numbers-entry-links] Luokkasihteerien linkit jaetaan omalta välilehdeltään

Kun päivän kaikki numerot on tallennettu, ne julkaistaan luokittain (usean päivän luokassa
päivittäin) painikkeella **{t:eventManagement.startList.publishNumbers}**. Keskeneräistä päivää ei voi julkaista; silloin
kalenteri pyytää syöttämään ensin kaikki numerot. Numerot odottavat koekutsuja samoin kuin
starttilista: luokan ensimmäisen koepäivän aamuun asti rivillä lukee
*{t:eventManagement.startList.invitationsRequired}*, eikä numeroita voi julkaista. Jos kokeessa ei arvota numeroita lainkaan,
julkaisu vahvistaa starttilistan järjestysnumerot sellaisinaan koirakoiden starttinumeroiksi.

!shot[StartNumbersPublishing/start-numbers-publishing-two-days] Kahden päivän luokan numerot julkaistaan päivä kerrallaan

Jos päivällä on aamupäivän ja iltapäivän ryhmät, luokan tai päivän painikkeen sijasta on painike
kummallekin vuorolle: aamupäivän numerot voi julkaista heti sen arvonnan jälkeen, vaikka iltapäivän
arvonta olisi vielä tekemättä. Julkisella starttilistalla iltapäivän koirakot ovat silloin vielä
ilman numeroa. Kun molemmat vuorot on julkaistu, päivä on julkaistu kokonaan.

!shot[StartNumbersPublishing/start-numbers-publishing-half-day] Aamupäivän numerot julkaistaan ennen iltapäivän arvontaa

## Joukkueet

Kokeessa voi olla joukkuekilpailu, olipa koemuoto mikä tahansa. Joukkueet määritellään paneelin
*{t:eventManagement.actions}* -osion painikkeella **{t:eventManagement.teams}**. Kenttään
**{t:teams.count}** kirjoitetaan, montako joukkuetta kilpailussa on, ja sivulle tulee yhtä monta
joukkuetta numeroituina: Joukkue 1, Joukkue 2 ja niin edelleen. Kun määrää pienennetään, joukkueet
poistuvat lopusta ja niiden koirat vapautuvat muihin joukkueisiin. Jos määrä on nolla, kokeessa ei
ole joukkuekilpailua. Joukkueiden yläpuolella on paneeli *{t:teams.settings}*, joka näkyy aina,
jotta kilpailun asetukset voi tehdä jo ennen kuin joukkueita on.

Joukkueelle voi antaa numeron lisäksi nimen kenttään **{t:teams.name}**, esimerkiksi Team Finland 1.
Valinta **{t:teams.primary}** merkitsee joukkueen yhdistyksensä tai kennelinsä ykkösjoukkueeksi.
Järjestelmä ei tiedä, mihin yhdistykseen tai kenneliin joukkue kuuluu, joten se ei rajoita
ykkösjoukkueita yhteen yhdistystä kohden: merkinnät ovat koesihteerin vastuulla.
Koirat lisätään joukkueeseen valikosta **{t:teams.addDog}**, joka tarjoaa kokeen ilmoittautuneista
ne, jotka eivät ole peruneet eivätkä jo ole jossakin joukkueessa. Koira voi siis kuulua vain yhteen
joukkueeseen. Ennen kuin koiran luokan osallistujat on valittu, myös varasijalla oleva koira kelpaa;
kun luokka on valittu, valikko tarjoaa siitä vain osallistujiksi valitut koirat. Joukkueessa jo
olevaa koiraa tämä ei koske. Joukkueessa voi olla enintään 26 koiraa.

!shot[EventTeamsPage/teams-candidates] Valitun luokan koirista valikko tarjoaa vain osallistujat: varalla oleva ja perunut koira puuttuvat

Koira saa joukkueessa tunnuksen siinä järjestyksessä kuin se on lisätty: joukkueen 1 koirat ovat
1A, 1B, 1C ja niin edelleen. Tunnusta vaihdetaan siirtämällä koiraa rivin nuolilla ylös tai alas,
ja roskakori poistaa koiran joukkueesta. Kun koira poistetaan, sen perässä olevat siirtyvät
ylöspäin, joten esimerkiksi 1B:n poistaminen tekee entisestä 1C:stä 1B:n. Jos joukkueen koira
perutaan, se jää paikalleen merkinnällä *{t:teams.memberCancelled}*, eikä muiden tunnus muutu ennen
kuin poistat sen itse. Varasijalla olevan koiran kohdalla lukee *{t:teams.memberReserve}*.

!shot[EventTeamsPage/teams] Joukkueet koirineen ja niiden tunnuksineen

Kokeessa, jossa koirat saavat pisteitä (NOWT), jokaisen joukkueen kohdalla on rivi
*{t:teams.result}*, kun ensimmäinen tulos on kirjattu: joukkueen sijoitus ja pisteet koko kokeesta.
Pisteet ovat joukkueen koirien pisteet yhteensä, mistä luokasta ja miltä päivältä tahansa, ja
koira, jolla ei vielä ole tulosta, tuo nolla pistettä. Tasapisteissä olevat joukkueet jakavat sijan.
Jos ensimmäisestä sijasta on tasapisteitä, niiden joukkueiden kohdalla on valinta
**{t:teams.runOffWon}**. Merkitse siihen uusintatehtävän voittaja ja tallenna: voittaja nousee
ensimmäiseksi ja muut jakavat seuraavan sijan. Valinta yhdessä joukkueessa poistaa sen muista. Jos
tulos myöhemmin korjataan niin, ettei tasapisteitä enää ole, valinnalla ei ole vaikutusta.

!shot[EventTeamsPage/teams-standings] Joukkueiden tulokset: joukkueet 1 ja 2 ovat tasapisteissä, ja joukkue 2 on merkitty uusintatehtävän voittajaksi

### Joukkue ilmoittautumisessa

Jos ilmoittautujien halutaan kertovan koiransa joukkue, rastita paneelin *{t:teams.settings}*
kohdasta *{t:teams.entry}* valinta **{t:teams.askAtEntry}** ja tallenna ennen ilmoittautumisen
alkua. Silloin ilmoittautumislomakkeella on osio, johon ilmoittautuja kirjoittaa joukkueen nimen ja
voi merkitä joukkueen yhdistyksen tai kennelin ykkösjoukkueeksi
([Ilmoittautuminen](/docs/participant/entering)). Kun valinnan poistaa, lomake ei enää kysy
joukkuetta, mutta jo ilmoitetut nimet säilyvät.

Ilmoitetuista nimistä sivulla on paneeli *{t:teams.suggestions}*, jossa on yksi ehdotus kutakin
nimeä kohden. Nimet, jotka eroavat vain isoilta ja pieniltä kirjaimilta tai väleiltä, ovat sama
joukkue, ja ehdotus on nimetty niin kuin ensimmäinen ilmoittautuja sen kirjoitti. Ehdotuksessa ovat
ne koirat, jotka voisi lisätä joukkueeseen valikosta **{t:teams.addDog}** ja jotka eivät vielä ole
missään joukkueessa, ilmoittautumisjärjestyksessä. Jos joku koirista on merkinnyt joukkueen
ykkösjoukkueeksi, ehdotuksessa lukee *{t:teams.primary}*. Painike **{t:teams.takeSuggestionShort}**
tekee ehdotuksesta joukkueen: se täyttää ensimmäisen tyhjän joukkueen, jolla ei ole nimeä eikä
koiria, tai lisää uuden joukkueen loppuun. Tyhjän joukkueen sarja säilyy, ja ykkösjoukkueen
merkintä tulee ehdotuksesta. Jos nimen on ilmoittanut useampi koira kuin joukkueeseen mahtuu,
ehdotus kertoo sen, ja joukkueeksi tehtynä se kertoo, montako koiraa joukkueessa voi olla:
tallentaa voi vasta, kun ylimääräiset koirat on siirretty muihin joukkueisiin. Joukkueen nimeä,
koiria ja ykkösjoukkueen merkintää voi sen jälkeen muuttaa kuten muidenkin joukkueiden, ja
muutokset tallennetaan painikkeella **{t:save}**.

!shot[EventTeamsPage/teams-suggestions] Kysymys ilmoittautumisessa on päällä, ja kahdella kirjoitusasulla ilmoitettu Kultaiset Noutajat on yksi ehdotus ykkösjoukkueen merkinnällä

### Koko joukkueen siirto

Jokaisen joukkueen kohdalla kerrotaan, ovatko sen koirat osallistujina, varasijalla vai osa
kummassakin. Painike **{t:teams.toParticipants}** siirtää joukkueen varasijalla olevat koirat
osallistujiin, kunkin sen päivän ja ryhmän osallistujiin, johon se on ilmoittautunut, ja
**{t:teams.toReserve}** siirtää joukkueen osallistujat varasijalle. Perunutta koiraa ei siirretä.

Jos siirto lähettää koirille vahvistusviestin koepaikasta, eli luokan osallistujat on jo valittu,
Koekalenteri kysyy ensin ja kertoo, mille koirille viesti lähtee. Koirat siirretään luokka
kerrallaan. Jos jonkin luokan siirto epäonnistuu, muiden luokkien koirat siirtyvät silti, ja
Koekalenteri kertoo, mitkä koirat jäivät siirtämättä.

Siirrot noudattavat samoja sääntöjä kuin luokan osallistujanäkymä. Kun luokan osallistujat on
valittu, sen osallistujia ei voi siirtää varasijalle, ja kun luokan ilmoittautumiset on suljettu
(koe on päättynyt tai luokka arvosteltu), sen koiria ei voi siirtää lainkaan; painikkeen alla
kerrotaan syy. Koira, jolla ei ole luokkaa tai jonka luokalla ei ole ryhmää, johon sen voisi
siirtää, jää paikalleen, ja Koekalenteri nimeää sen siirron jälkeen.

Joukkue siirretään sellaisena kuin se on tallennettu: kun sivulla on tallentamattomia muutoksia,
siirtopainikkeet odottavat tallennusta. Siirron aikana painikkeet odottavat sen valmistumista.

!shot[EventTeamsPage/teams-move] Joukkueen koirista yksi on osallistujana ja yksi varasijalla, joten joukkueen voi siirtää kumpaan suuntaan tahansa

### Arvonta

Jos joukkueita on enemmän kuin kokeeseen mahtuu, painike **{t:teams.draw}** arpoo jäljellä olevat
paikat joukkueiden kesken. Arvonnassa ovat joukkueet, joiden koiria on vielä varasijoilla.
Ykkösjoukkueet arvotaan ennen muita, ja kummankin ryhmän järjestys arvotaan. Joukkue arvotaan vain, jos
kaikki sen varasijoilla olevat koirat mahtuvat luokkansa ja koko kokeen jäljellä oleville paikoille;
muuten arvonta siirtyy seuraavaan joukkueeseen. Luokka, jolle ei ole annettu omia paikkoja, rajoittuu
vain kokeen paikkoihin.

Arvottu koira siirretään sen ryhmän osallistujiin, jonka päivälle ja ajalle se on ilmoittautunut. Jos
kokeella on päiväkohtaiset paikat, koira menee ensimmäiselle ilmoittamalleen päivälle, jolla on vielä
tilaa. Joukkue, jonka jokin koira ei mahdu millekään päivälleen tai jonka luokka ei ota siirtoa
vastaan, jätetään väliin, ja sen paikat jäävät seuraavalle arvottavalle joukkueelle.

Ennen kuin yksikään koira siirtyy, Koekalenteri näyttää arvonnan tuloksen: arvotut joukkueet koirineen,
koirat, joille lähtee koepaikkailmoitus, ja väliin jätetyt joukkueet. **{t:teams.drawConfirm}** siirtää
koirat luokka kerrallaan samoin säännöin kuin koko joukkueen siirto, ja **{t:cancel}** jättää kaiken
ennalleen. Arvontaa ei voi tehdä, kun sivulla on tallentamattomia muutoksia. Palvelin ei tarkista
paikkojen määrää siirroissa, ei arvonnassa eikä käsin siirrettäessä.

!shot[EventTeamsPage/teams-draw] Kahdelle jäljellä olevalle paikalle arvottiin ykkösjoukkue, ja sen koirille lähtee koepaikkailmoitus

### Pentuejoukkueet

Jos joukkueet kootaan saman pentueen koirista, kuten derbyssä, rastita paneelin *{t:teams.settings}*
kohdasta *{t:teams.litterTeams}* valinta **{t:teams.litters}**. Silloin paneeli
*{t:teams.suggestions}* ehdottaa joukkueen myös kustakin pentueesta, jonka koiria on kokeessa vähintään
kaksi: koirista, joilla on sama isä, emä ja syntymäpäivä ja jotka eivät ole jo joukkueessa eivätkä ole
kertoneet joukkueen nimeä. Ehdotus nimetään ensimmäisen ilmoittautuneen koiran kasvattajan mukaan, tai
vanhempien mukaan (Isä x Emä), jos kasvattajaa ei ole kerrottu. Ilmoittautumisessa kerrottu joukkueen
nimi menee pentueen edelle: sen kertonut koira on nimen ehdotuksessa.

Pentuejoukkueen koiralla on merkintä *{t:teams.otherLitter}*, jos se on eri pentueesta kuin useimmat
joukkueen koirat (tasatilanteessa ratkaisee joukkueen ensimmäinen koira, jonka pentue tiedetään), ja
*{t:teams.unknownLitter}*, jos sen isää, emää tai syntymäpäivää ei tiedetä. Merkintä on vain muistutus: joukkueen voi tallentaa
siitä huolimatta.

!shot[EventTeamsPage/teams-litters] Pentuejoukkue, jossa yksi koira on eri pentueesta ja yhden pentuetta ei tiedetä

### Sarjat

Joukkuekilpailussa voi olla useita sarjoja, esimerkiksi avoin sarja ja rotusarja. Sarjat lisätään
joukkueiden yläpuolelta paneelista *{t:teams.settings}* kohdasta *{t:teams.series}* painikkeella **{t:teams.addSeries}**. Jokaiselle
sarjalle annetaan nimi suomeksi ja halutessa englanniksi; englanninkielinen nimi näkyy
englanninkielisellä starttilistalla. Kun sarjoja on, jokaisen joukkueen kohdalla on valinta
**{t:teams.teamSeries}**, josta joukkue liitetään sarjaan. Joukkue voi myös olla sarjoihin
kuulumaton (*{t:teams.noSeries}*).

Joukkueet sijoitetaan kukin oman sarjansa sisällä: jokaisella sarjalla on oma ensimmäinen sijansa ja
tasapisteissä oma uusintatehtävänsä, ja sarjoihin kuulumattomat joukkueet sijoitetaan keskenään. Kun
sarja poistetaan roskakorista, sen joukkueet jäävät ilman sarjaa. Sarjan nimen voi vaihtaa milloin
tahansa; starttilistalla näkyy aina sarjan nykyinen nimi.

!shot[EventTeamsPage/teams-series] Kaksi sarjaa: joukkueet 1 ja 3 ovat avoimessa sarjassa ja joukkue 2 rotusarjassa, joten joukkueet 1 ja 2 ovat kumpikin oman sarjansa ensimmäisiä

### Lasketut päivät

Monipäiväisessä kokeessa voi valita, minkä päivien tulokset lasketaan joukkueiden pisteisiin,
esimerkiksi derbyn karsintapäivän mutta ei finaalia. Valinta on samassa paneelissa kuin sarjat,
*{t:teams.settings}*, otsikon *{t:teams.countedDays}* alla. Oletuksena kaikki päivät lasketaan. Kun päivän valinnan
poistaa, sen päivän tulokset eivät kuulu joukkueille. Vähintään yhden päivän on oltava valittuna,
joten viimeistä laskettavaa päivää ei voi poistaa: jos haluat vaihtaa päivän, valitse ensin uusi
päivä ja poista sitten vanha. Kun kaikki päivät on taas
valittu, lasketaan kaikki päivät, myös päivä, joka kokeeseen myöhemmin lisätään. Jos kokeen päiviä
muutetaan, päivät, joita kokeessa ei enää ole, poistuvat valinnasta, ja kopio siirtää valinnan
kokeen mukana.

Kun vain osa päivistä lasketaan, joukkueen tuloksen perässä kerrotaan, minkä päivien tuloksista
pisteet on laskettu, sekä joukkuesivulla että julkisella starttilistalla.

!shot[EventTeamsPage/teams-counted-days] Kaksipäiväinen koe, jossa lasketaan vain ensimmäinen päivä: toisen päivän koiran tulos ei kuulu joukkueelle 2, ja joka joukkueen tuloksessa lukee *ke 10.2. tuloksista*

Muutokset tallennetaan painikkeella **{t:save}**. **{t:cancel}** palaa tapahtumaan tallentamatta.

Tallennetut joukkueet näkyvät julkisella starttilistalla, joka avautuu joukkueittain
([Starttilista ja tulokset](/docs/participant/start-list)). Listalla näkyvät vain julkaistut koirat:
varalla oleva tai vielä julkaisematon koira ei näy, eikä joukkuetta, jonka yhtäkään koiraa ei ole
julkaistu, näytetä lainkaan. Sarjan joukkueiden sijoitukset ja pisteet näkyvät listalla, kun kaikkien
sarjan joukkueiden koirien tulokset on julkaistu ja kaikki ne ovat listalla: koira, jonka
starttinumeroa ei ole syötetty, pitää sarjansa kaikkien joukkueiden tuloksen piilossa. Muutos
joukkueisiin, sarjoihin, uusintatehtävän voittajaan tai tuloksiin päivittyy avoimille
starttilistoille itsestään.

## Peruutukset ja palautukset

Peruutus kirjataan ja maksu palautetaan samoin kuin ilmoittautumisaikana: rivin valikosta (⋮)
**{t:registration.actions.cancel}** tai raahaamalla kohtaan *Peruneet*, ja **{t:registration.actions.refundPayment}**. Kun osallistuja
peruu, vapautuneelle paikalle nostetaan varasijalta seuraava, ja kalenteri lähettää hänelle
koepaikkailmoituksen ja koekutsun itsestään.

Kahdesti veloitetut maksut palautetaan luokkalistojen yläpuolella olevasta ilmoituksesta, jos sellainen
näkyy ([Maksuliikenne](/docs/admin/payments)).

Ryhmän sisäinen starttijärjestys tiivistyy peruutuksen jälkeen automaattisesti. Jo syötetyt
starttinumerot sen sijaan säilyvät, joten julkaistut numerot eivät muutu peruutuksesta.

## Maksupyyntö

Kun koemaksu tai sen osa on maksamatta ja ilmoittautuja voi sen maksaa, rivin valikossa (⋮) on valinta
**{t:registration.actions.requestPayment}**. Se avaa viesti-ikkunan pohjalla
*{t:emailTemplate.payment-request}*, ja viesti lähtee myös maksajaksi merkitylle. Maksupyynnön voi
lähettää vielä viikon ajan kokeen viimeisen päivän jälkeen, vaikka rivin muut toiminnot ovat jo
sulkeutuneet ja luokka olisi arvosteltu, joten maksamatta jäänyt koemaksu voidaan periä kokeen
jälkeenkin. Ilmoittautuja voi maksaa saman viikon ajan; sen jälkeen maksua ei voi enää aloittaa.

## Koiran tietojen korjaus kokeen jälkeen

Kun koe on ohi tai luokka on arvosteltu, ilmoittautuminen aukeaa vain luettavaksi. Käsin syötetyn
koiran (rekisterinumeron alla lukee *{t:registration.cta.helper.typed}*) rekisterinumero,
tunnistusmerkintä, sukupuoli, syntymäaika ja rotu jäävät kuitenkin muokattaviksi, jotta tulokset voi
lähettää Kennelliittoon. Tunnistusmerkinnässä pitää olla mikrosirun 15 numeroa. Korjatun
rekisterinumeron pitää olla rekisterinsä muodossa. Vain numero muuttuu eikä Kennelliitosta haeta mitään,
joten kirjoita numero ja tallenna ilmoittautuminen. Kennelliitosta haetun koiran tiedot pysyvät
lukittuina.

Koiran rekisterinumero lukittuu heti, kun sen tulos on lähetetty Kennelliittoon tai lähetykseen ei tullut
vastausta ja tulos voi olla siellä, myös kokeen vielä ollessa käynnissä. Kennelliiton hylkäämä tulos
jättää numeron auki.

## Viesti osallistujille

Vapaamuotoisen viestin, esimerkiksi aikataulumuutoksen, voi lähettää paneelin *{t:eventManagement.actions}*-osion
painikkeella **{t:eventManagement.message.action}**. Ensin valitaan luokittain, lähteekö viesti osallistujille,
varasijalaisille vai molemmille, ja sitten viesti kirjoitetaan samassa ikkunassa kuin
koepaikkailmoitus.

!shot[MessageRecipientsDialog/message-recipients] Viestin vastaanottajat valitaan luokittain

## Tulosten lähetys Kennelliittoon

Kokeen jälkeen tulokset lähetetään Kennelliiton Omakoiraan paneelin *{t:results.kennelliitto.title}*
-osiosta painikkeella **{t:results.kennelliitto.send}**. Ikkuna kertoo ensin, montako tulosta lähtee ja
mitkä koirat eivät voi lähteä ja miksi. Ulkomainen koira, jota Kennelliitto ei tunne, lisätään sinne
ennen tulosta. Lähetyksen jälkeen ikkuna kertoo, minkä koirien tulokset tallentuivat Omakoiraan ja minkä
eivät. Epäonnistuneissa ovat syineen sekä koirat, joiden tuloksen Kennelliitto hylkäsi, että koirat,
joita ei voinut lähettää.

Kennelliitto voi tuntea ulkomaisen koiran toisella rekisterinumerolla, esimerkiksi kun koira on
rekisteröity uudelleen Suomeen. Koekalenteri etsii koiraa silloin myös tunnistusmerkinnällä ja nimellä,
ja tällaiset koirat näytetään ennen lähetystä yhdessä näkymässä: koekalenterin ja Kennelliiton tiedot
rinnakkain, erot korostettuina. Valitse kullekin koiralle, vaihdetaanko rekisterinumero Kennelliiton
tuntemaksi vai jätetäänkö sen tulos lähettämättä nyt. Vaihto on valmiiksi valittuna, kun tunnistusmerkintä täsmää. **{t:results.kennelliitto.regNo.confirm}**
tallentaa vaihdetut numerot ilmoittautumisiin ja lähettää tulokset, ja **{t:results.kennelliitto.regNo.back}**
palaa muuttamatta mitään.

!shot[KennelliittoSendDialog/kennelliitto-send-regnos] Kennelliiton toisella numerolla tuntemat koirat yhdessä näkymässä

WT-kokeessa pisteet lähtevät Omakoiraan sellaisinaan. Jos Omakoira ei ota pisteitä vastaan koiran
tulokselle, tulos lähetetään uudelleen pisteillä 0. Lähetyksen jälkeen ikkuna luettelee nämä koirat
oikeine pisteineen, ja pisteet kirjataan Omakoiraan käsin, kunnes Kennelliitto korjaa rajapintansa. Ikkuna
nimeää nämä koirat myös seuraavien lähetysten alussa, kunnes Omakoira ottaa pisteet vastaan. Jos koira
lähetetään uudelleen, esimerkiksi korjatun tuloksen vuoksi, lähetys yrittää ensin pisteitä ja lähettää
nollan vain, jos Omakoira hylkää ne taas.

!shot[KennelliittoSendDialog/kennelliitto-send-points-by-hand] Koirat, joiden pisteet kirjataan Omakoiraan käsin

Lähetetty tulos näkyy koiralla Koiranetissä himmeänä, kunnes tuomari on vahvistanut sen. Tulosta voi
korjata tulossivulla ja lähettää uudelleen, kunnes koe on luovutettu tuomarille. Kun Omakoiraan lähtevä
tieto muuttuu, myös toisen koiran tuloksen siirtämän sijoituksen tai tuomarien takia, koiran kohdalla
lukee sarakkeessa *{t:results.kennelliitto.column}* *{t:results.kennelliitto.badge.changed}*, ja
lähetysikkuna laskee sen muuttuneisiin tuloksiin. Uusi lähetys lähettää vain uudet ja muuttuneet
tulokset; ennallaan olevia ei lähetetä uudelleen.

Kun tulokset on lähetetty, koe luovutetaan ylituomarille painikkeella
**{t:results.kennelliitto.handOverButton}**. Luovutusikkuna luettelee tulokset, jotka pitää vielä
lähettää ensin, ja koirat, joiden tulosta ei voi lähettää: ne voi jättää pois luovutuksesta.
Kun koe on luovutettu tai tuomari on vahvistanut tulokset Omakoirassa,
tuloksia ei voi enää muokata Koekalenterissa eikä Omakoirassa: tulossivu avautuu vain
luettavaksi ja kertoo sen. Jos tuomari palauttaa kokeen, muokkaus avautuu uudelleen: tulossivu lukee
kokeen tilan Kennelliitosta aina, kun se avataan, ja lukitun sivun painike
**{t:results.kennelliitto.refreshState}** lukee sen heti.
