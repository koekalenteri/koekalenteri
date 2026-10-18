import type { ReactNode } from 'react'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'

interface TermHeadingProps {
  readonly children: ReactNode
}

/** A numbered term, drawn as the bold paragraph it used to be. */
const TermHeading = ({ children }: TermHeadingProps) => (
  <Typography component="h2" sx={{ fontWeight: 'bold', my: 2 }} variant="body1">
    {children}
  </Typography>
)

export const TermsPage = () => {
  return (
    <Paper sx={{ m: 1, p: 1 }}>
      <Typography component="h1" variant="h2">
        Ilmoittautumisen ehdot
      </Typography>
      <TermHeading>1. Tapahtumaan ilmoittautuminen</TermHeading>
      <ul>
        <li>
          {' '}
          Ilmoittautuminen on Suomen Kennelliiton sääntöjen mukaisesti aina sitova. Ilmoittautuminen velvoittaa
          ilmoittajan maksamaan tapahtuman järjestäjän määräämän osallistumismaksun.
        </li>
        <li>
          {' '}
          Peruutuskäytäntö ja käytäntö maksujen palauttamisessa ovat samat niin ilmoittautumisaikana kuin sen jälkeenkin
        </li>
        <li>
          {' '}
          Vain ilmoittautumisaikana maksettu ilmoittautuminen hyväksytään, ellei tapahtuman järjestäjä ole toisin
          ilmoittanut
        </li>
      </ul>
      <TermHeading>2. Osallistujan osallistumisoikeus</TermHeading>
      <ul>
        <li>
          {' '}
          Ilmoittautumalla kokeeseen ja/tai kilpailuun ilmoittaja vakuuttaa, että ilmoitetulla osallistujalla on
          osallistumisoikeus ko. tapahtumaan.
        </li>
        <li>
          {' '}
          Ilmoittautumisessa on aina ilmoitettava osallistujan paras/korkein lajissa saavutettu tulos, vaikka tämä tulos
          oikeuttaisi osallistumisen ylempään koe- tai kilpailuluokkaan.
        </li>
        <li>
          {' '}
          Jos ilmoittaja jättää ilmoittamatta osallistujan parhaan ko. koelajin tuloksen ilmoittautumishetkellä voi
          kokeen ja/tai kilpailun järjestäjä mitätöidä ilmoittautumisen. Asian ilmetessä tapahtuman jälkeen voi
          tapahtuman järjestäjä pyytää Suomen Kennelliitolta kokeessa ja/tai kilpailussa saavutetun tuloksen
          mitätöimistä ilmoittautumistietojen ollessa näiden ehtojen vastaisia.&nbsp;
        </li>
      </ul>
      <TermHeading>3.&nbsp;Rokotusmääräykset ja antidopingmääräykset</TermHeading>
      <ul>
        <li>
          {' '}
          Ilmoittautumalla kokeeseen ja/tai kilpailuun ilmoittaja sitoutuu noudattamaan Suomen Kennelliiton voimassa
          olevia rokotusmääräyksiä ja koe-/testi- ja antidopingsääntöjä sekä niitä täydentäviä ohjeita.
        </li>
      </ul>
      <TermHeading>4.&nbsp;Kokeen ja/tai kilpailun tulosten julkaiseminen</TermHeading>
      <ul>
        <li>
          {' '}
          Ilmoittautumalla kokeeseen ja/tai kilpailuun ilmoittaja suostuu siihen, että tapahtuman järjestäjä tai tämän
          edustaja, Suomen Kennelliitto tai rotuyhdistykset saavat julkaista osallistujan koe-/kilpailu-/testituloksen.
        </li>
      </ul>
      <TermHeading>5. Ilmoittautumisen peruuttaminen</TermHeading>
      <ul>
        <li>
          {' '}
          Ilman pätevää syytä osallistumismaksua ei palauteta. Päteviksi syiksi poisjäämiseen katsotaan osallistuvan
          koiran alkanut kiima sekä koiran tai omistajan sairaus. Sairauden syy on todistettava lääkärintodistuksella,
          joka on päivätty viimeistään koetta seuraavana arkipäivänä.
        </li>
        <li>
          {' '}
          Lääkärintodistus on toimitettava kokeen ja/tai kilpailun järjestäjälle viimeistään 14 vrk:n kuluessa
          tapahtumasta.
        </li>
        <li>
          {' '}
          Poisjäämisestä on välittömästi ilmoitettava kokeen ja/tai kilpailun järjestäjälle, kuitenkin viimeistään ennen
          kokeen alkua.
        </li>
      </ul>
      <TermHeading>6. Osallistumismaksujen palauttaminen</TermHeading>
      <ul>
        <li>
          {' '}
          Kokeen ja/tai kilpailun järjestäjä palauttaa osallistumismaksut siihen oikeutetuille mahdollisimman pian
          tapahtuman jälkeen
        </li>
        <li> Tapahtuman järjestäjällä on oikeus vähentää palautettavasta summasta käsittelykuluina 5€.</li>
      </ul>
      <TermHeading>7. Osallistumispaikkojen jakoperusteet</TermHeading>
      <ul>
        <li>
          {' '}
          Mikäli kokeeseen on ilmoittautunut enemmän osallistujia kuin on koepaikkoja, arvotaan osallistumispaikat
          vakiintuneen käytännön mukaisesti &nbsp;ilmoitetut etusijat ja rajoitukset &nbsp;huomioiden.
        </li>
        <li>
          {' '}
          Muilta osin noudatetaan SKL:n ohjeita:{' '}
          <a href="https://www.kennelliitto.fi/sites/default/files/media/ohje_kokeiden_rajoituksista.pdf">
            https://www.kennelliitto.fi/sites/default/files/media/ohje_kokeiden_rajoituksista.pdf
          </a>
        </li>
      </ul>
    </Paper>
  )
}
