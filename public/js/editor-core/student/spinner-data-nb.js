/**
 * Word bank for the Writing Spinner — Norwegian Bokmål (nb).
 *
 * Categories:
 *   starters  — sentence starters grouped by rhetorical function
 *   synonyms  — common overused words → better alternatives
 *   stopwords — words to ignore in frequency analysis
 *
 * All data is static — no API calls, works offline.
 * The student decides whether the suggestion fits — that's the learning mechanism.
 */

export const starters = {
    // ─────────────────────────────────────────────────────────────────────────
    // ANALYSE — tekstanalyse, litterær analyse, retorisk analyse
    // ─────────────────────────────────────────────────────────────────────────
    analyse: {
        us: {
            innledning: [
                'I denne teksten skal jeg analysere...',
                'Teksten jeg skal se nærmere på er...',
                'Forfatteren tar opp temaet...',
                'Denne teksten handler om...',
                'Jeg skal undersøke hvordan forfatteren...',
                'Teksten ble skrevet av... og handler om...',
            ],
            hoveddel: [
                'Teksten er bygd opp slik at...',
                'Forfatteren starter med å...',
                'Videre i teksten ser vi at...',
                'Et viktig poeng i teksten er...',
                'Deretter går forfatteren over til...',
                'Hovedbudskapet kommer fram gjennom...',
                'Teksten kan deles inn i... deler...',
            ],
            verkemiddel: [
                'Forfatteren bruker... for å...',
                'Et virkemiddel som går igjen er...',
                'Her bruker forfatteren en metafor som...',
                'Gjentakelsen av... skaper en effekt av...',
                'Språket i teksten er preget av...',
                'Kontrasten mellom... og... viser...',
                'Forfatteren henvender seg direkte til leseren ved å...',
            ],
            tolkning: [
                'Dette kan bety at...',
                'Jeg tolker dette som...',
                'En mulig forklaring er at...',
                'Kanskje forfatteren mener at...',
                'Dette kan ses i sammenheng med...',
                'Temaet i teksten er...',
                'Budskapet er trolig at...',
            ],
            avslutning: [
                'Alt i alt viser analysen at...',
                'Hovedbudskapet i teksten er...',
                'Oppsummert bruker forfatteren... for å...',
                'Teksten lykkes med å... fordi...',
                'Etter å ha analysert teksten mener jeg at...',
                'Virkemidlene bidrar til å...',
            ],
        },
        vgs: {
            innledning: [
                'Denne analysen tar for seg...',
                'I det følgende skal jeg analysere... med vekt på...',
                'Teksten inngår i en kontekst der...',
                'Verket ble utgitt i... og representerer...',
                'Med utgangspunkt i... vil jeg undersøke...',
                'Analysens fokus er retoriske strategier i...',
                'Tekstens aktualitet viser seg gjennom...',
            ],
            hoveddel: [
                'Kompositorisk er teksten bygd opp rundt...',
                'Strukturen underbygger tematikken ved at...',
                'Teksten beveger seg fra... til...',
                'Den narrative fremdriften drives av...',
                'Argumentasjonsstrukturen hviler på...',
                'Spenningen mellom form og innhold viser seg i...',
                'Den tematiske utviklingen kan spores gjennom...',
            ],
            verkemiddel: [
                'Det sentrale virkemiddelet er... som fungerer ved at...',
                'Den gjennomgående metaforikken etablerer...',
                'Ironien i passasjen forsterker...',
                'Intertekstuelle referanser til... bidrar til...',
                'Den retoriske appellen bygges opp gjennom...',
                'Stilbruddet markerer et skifte i...',
                'Forfatterens bruk av... skaper distanse til...',
                'Det stilistiske registeret signaliserer...',
            ],
            tolkning: [
                'Symbolikken peker mot en fortolkning der...',
                'I lys av konteksten kan dette leses som...',
                'En mulig lesning er at teksten problematiserer...',
                'Ambivalensen i teksten åpner for...',
                'Sett i sammenheng med samtiden uttrykker teksten...',
                'Underteksten antyder at...',
                'Flertydigheten gjør det mulig å lese dette som...',
                'Dersom vi leser teksten allegorisk...',
            ],
            avslutning: [
                'Analysen viser at teksten opererer på flere nivåer...',
                'Samlet sett fremstår teksten som...',
                'Virkemidlene samvirker til å skape...',
                'Tekstens relevans i dag ligger i...',
                'Avslutningsvis vil jeg argumentere for at...',
                'Den samlede effekten av virkemidlene er...',
            ],
        },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // DRØFTING — argumenterende tekst med for og imot
    // ─────────────────────────────────────────────────────────────────────────
    droefting: {
        us: {
            innledning: [
                'I denne teksten skal jeg drøfte...',
                'Et viktig spørsmål i dag er...',
                'Det er mange ulike meninger om...',
                'Temaet er aktuelt fordi...',
                'Mange lurer på om... og i denne teksten skal jeg...',
                'Problemstillingen jeg vil drøfte er...',
            ],
            argument: [
                'Et viktig argument for dette er...',
                'Det finnes gode grunner til å mene at...',
                'For det første...',
                'En grunn til at dette er bra er...',
                'De som mener... begrunner det med...',
                'Et argument som støtter dette er...',
                'I tillegg er det slik at...',
            ],
            motargument: [
                'På den andre siden...',
                'Et motargument er at...',
                'Andre mener derimot at...',
                'Likevel kan man innvende at...',
                'De som er uenige peker på at...',
                'Mot dette kan man si at...',
                'Det finnes også ulemper, for eksempel...',
            ],
            eksempel: [
                'Et godt eksempel på dette er...',
                'Vi ser dette tydelig i...',
                'En konkret konsekvens er...',
                'I praksis betyr dette at...',
                'Et eksempel fra hverdagen er...',
                'Dette kan illustreres med...',
            ],
            overgang: [
                'I tillegg til dette...',
                'Et annet viktig poeng er...',
                'Dessuten...',
                'Når det gjelder...',
                'Vi må også se på...',
                'Med dette som bakgrunn...',
                'La oss nå se på...',
            ],
            avslutning: [
                'Alt i alt mener jeg at...',
                'Etter å ha sett på begge sider...',
                'Konklusjonen min er at...',
                'Samlet sett tror jeg at...',
                'Derfor vil jeg hevde at...',
                'Min vurdering er at...',
            ],
            kilde: [
                'Ifølge... er det slik at...',
                'Som... påpeker...',
                'I artikkelen "..." hevdes det at...',
                'Tall fra... viser at...',
                'En undersøkelse viser at...',
                'Eksperten... mener at...',
            ],
        },
        vgs: {
            innledning: [
                'Et sentralt spørsmål i vår tid er...',
                'Stadig flere stiller spørsmål ved...',
                'Problemstillingen berører grunnleggende verdier som...',
                'Debatten om... aktualiserer spørsmålet om...',
                'I skjæringspunktet mellom... og... oppstår spørsmålet...',
                'Denne drøftingen tar utgangspunkt i...',
                'Spørsmålet har fått fornyet aktualitet i kjølvannet av...',
            ],
            argument: [
                'På den ene siden kan man hevde at...',
                'Et sentralt poeng er at...',
                'Forskning viser at...',
                'Dette underbygges av...',
                'Et tungtveiende argument er at...',
                'Tilhengerne fremhever at...',
                'Fra et... perspektiv er det avgjørende at...',
                'Det er grunn til å hevde at...',
            ],
            motargument: [
                'Mot dette kan det anføres at...',
                'Kritikere vil hevde at...',
                'En vesentlig innvending er at...',
                'Resonnementet forutsetter imidlertid at...',
                'Perspektivet overser at...',
                'Et problematisk aspekt ved dette synet er...',
                'Argumentet svekkes dersom man tar hensyn til...',
            ],
            eksempel: [
                'Dette kan illustreres ved...',
                'Et talende eksempel er...',
                'Problemstillingen manifesterer seg konkret i...',
                'Konsekvensene ble tydelige da...',
                'Erfaringene fra... tilsier at...',
                'Parallellen til... er slående...',
            ],
            overgang: [
                'Videre er det verdt å merke seg at...',
                'Et annet viktig aspekt er...',
                'Ikke bare... men også...',
                'Drøftingen har så langt vist at...',
                'La meg nå vende blikket mot...',
                'Et beslektet spørsmål er...',
                'Med dette som bakteppe...',
            ],
            avslutning: [
                'Etter å ha vurdert begge sider...',
                'Samlet sett viser drøftingen at...',
                'Avslutningsvis vil jeg hevde at...',
                'Uten å forenkle vil jeg konkludere med at...',
                'En balansert vurdering tilsier at...',
                'Problemstillingen lar seg ikke løse entydig, men...',
            ],
            kilde: [
                'Ifølge... er det slik at...',
                'Som... påpeker...',
                'I artikkelen "..." hevdes det at...',
                'Statistikk fra... viser at...',
                'I sin bok "..." argumenterer... for at...',
                'Forskningen til... dokumenterer at...',
                'Studien konkluderer med at...',
            ],
        },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // FAGARTIKKEL — sakprosa, formidling av kunnskap
    // ─────────────────────────────────────────────────────────────────────────
    fagartikkel: {
        us: {
            innledning: [
                'I denne teksten skal jeg forklare...',
                'Temaet for denne artikkelen er...',
                'Har du noen gang lurt på...',
                'Visste du at...',
                'Mange tror at... men egentlig...',
                'I denne fagartikkelen skal jeg ta for meg...',
            ],
            fakta: [
                'Forskning viser at...',
                'Det er påvist at...',
                'Ifølge... er det slik at...',
                'Tall fra... viser at...',
                'En viktig fakta er at...',
                'Studier har vist at...',
                'Det er dokumentert at...',
            ],
            forklaring: [
                'Dette betyr at...',
                'Grunnen til dette er at...',
                'Det fungerer slik at...',
                'Enkelt forklart...',
                'Med andre ord...',
                'Årsaken er at...',
                'Dette henger sammen med...',
            ],
            overgang: [
                'I tillegg...',
                'Et annet viktig poeng er...',
                'La oss nå se på...',
                'Videre...',
                'Når det gjelder...',
                'En annen side av saken er...',
            ],
            avslutning: [
                'Oppsummert kan vi si at...',
                'Det viktigste å huske er...',
                'Som vi har sett...',
                'Kort sagt...',
                'Avslutningsvis...',
                'Vi har nå sett at...',
            ],
            kilde: [
                'Ifølge... er det slik at...',
                'I en artikkel fra... står det at...',
                'Forskere ved... har funnet ut at...',
                'Som det framgår av...',
                'Tall fra... bekrefter at...',
                'Kilden... opplyser at...',
            ],
        },
        vgs: {
            innledning: [
                'Denne artikkelen belyser...',
                'Formålet med denne teksten er å redegjøre for...',
                'Tematikken aktualiseres av...',
                'I det følgende skal jeg presentere...',
                'Fagfeltet har i senere tid viet oppmerksomhet til...',
                'Problemstillingen som behandles er...',
                'Artikkelen tar sikte på å klargjøre...',
            ],
            fakta: [
                'Forskning utført av... dokumenterer at...',
                'Ifølge nyere studier...',
                'Datamaterialet viser en tydelig tendens til...',
                'Det empiriske grunnlaget tilsier at...',
                'Statistiske analyser avdekker at...',
                'Feltstudier bekrefter at...',
                'Det vitenskapelige konsensus er at...',
            ],
            forklaring: [
                'Mekanismen bak dette er...',
                'Fenomenet kan forklares med...',
                'Sammenhengen mellom... og... skyldes...',
                'Den underliggende årsaken er...',
                'Prosessen foregår ved at...',
                'Dette innebærer at...',
                'Konsekvensen av dette er at...',
            ],
            overgang: [
                'Med dette som utgangspunkt...',
                'I forlengelsen av dette...',
                'Et beslektet tema er...',
                'La oss nå vende oss mot...',
                'Perspektivet utvides dersom vi...',
                'Fremstillingen har så langt vist at...',
            ],
            avslutning: [
                'Samlet sett gir dette et bilde av...',
                'Gjennomgangen viser at...',
                'Konklusjonen er at...',
                'Kunnskapen om... tilsier at...',
                'Avslutningsvis kan det konstateres at...',
                'Implikasjonene av dette er...',
            ],
            kilde: [
                'Ifølge... er det slik at...',
                'Som... påpeker i sin studie...',
                'Forskningsrapporten konkluderer med at...',
                'Statistikk fra... viser at...',
                'Publiserte data fra... indikerer at...',
                'Den faglige litteraturen understreker at...',
            ],
        },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // KRONIKK — meningsytring med personlig stemme og appell
    // ─────────────────────────────────────────────────────────────────────────
    kronikk: {
        us: {
            innledning: [
                'Noe som opptar meg er...',
                'I det siste har vi sett at...',
                'Jeg mener det er på tide å snakke om...',
                'Mange unge opplever at...',
                'Tenk deg at...',
                'Hvorfor er det slik at...',
            ],
            pastand: [
                'Jeg mener at...',
                'Det er tydelig at...',
                'Slik jeg ser det...',
                'Min påstand er at...',
                'Vi kan ikke akseptere at...',
                'Det burde være selvsagt at...',
            ],
            argument: [
                'En viktig grunn til dette er...',
                'Dette handler om...',
                'Konsekvensen er at...',
                'Erfaringen viser at...',
                'Det er dokumentert at...',
                'Folk som har opplevd dette forteller at...',
                'Et eksempel som viser dette er...',
            ],
            motargument: [
                'Noen vil kanskje mene at...',
                'Selv om det er sant at...',
                'Innvendingen om at... holder ikke fordi...',
                'Det er lett å tenke at... men...',
                'Motargumentet om... overser at...',
                'Ja, det stemmer at... men likevel...',
            ],
            appell: [
                'Vi må handle nå...',
                'Det er på tide at...',
                'Spør deg selv...',
                'Hva slags samfunn vil vi ha...',
                'La oss ikke akseptere at...',
                'Ansvaret ligger hos...',
                'Sammen kan vi...',
            ],
            avslutning: [
                'Derfor mener jeg at...',
                'Vi skylder... å...',
                'Tiden er inne for å...',
                'Min oppfordring er...',
                'La oss begynne med...',
                'Framtiden avhenger av at...',
            ],
        },
        vgs: {
            innledning: [
                'I kjølvannet av... er det betimelig å spørre...',
                'Den offentlige debatten om... preges av...',
                'Det er en voksende erkjennelse av at...',
                'Samtiden konfronterer oss med...',
                'Når... er det grunn til å stille spørsmål ved...',
                'Et paradoks i vår tid er at...',
                'Bak overskriftene om... skjuler det seg...',
            ],
            pastand: [
                'Min tese er at...',
                'Det er grunn til å hevde at...',
                'Fundamentalt handler dette om...',
                'Det er vanskelig å komme utenom at...',
                'En ubehagelig sannhet er at...',
                'Kjernen i problemet er at...',
            ],
            argument: [
                'Denne posisjonen underbygges av...',
                'Erfaringene fra... illustrerer poenget...',
                'Den underliggende dynamikken er at...',
                'Konsekvensene manifesterer seg som...',
                'Forskningen peker entydig i retning av...',
                'Et slående eksempel er...',
                'Logikken er enkel...',
            ],
            motargument: [
                'Innvendingen om at... fortjener å tas på alvor...',
                'Det ville være naivt å overse at...',
                'Mot dette kan det selvsagt anføres at...',
                'Kritikken rammer delvis, men...',
                'Perspektivet har sine begrensninger...',
                'Selv om... gjelder det likevel at...',
            ],
            appell: [
                'Vi kan ikke lenger se bort fra at...',
                'Spørsmålet er ikke om, men når...',
                'Ethvert ansvarlig samfunn bør...',
                'Det krever politisk vilje å...',
                'Vi står ved et veiskille der...',
                'Alternativet er for kostbart...',
                'La oss ikke bedra oss selv med at...',
            ],
            avslutning: [
                'Utfordringen krever at vi...',
                'I siste instans handler dette om...',
                'Ansvaret påhviler oss alle...',
                'Historien vil dømme oss etter...',
                'Fremtiden fordrer at vi...',
                'La det ikke herske tvil om at...',
            ],
        },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // KÅSERI — personlig, humoristisk, med digresjoner og ironi
    // ─────────────────────────────────────────────────────────────────────────
    kaaseri: {
        us: {
            innledning: [
                'Har du lagt merke til at...',
                'Det er noe merkelig med...',
                'La meg fortelle deg om en opplevelse...',
                'Jeg vet ikke med deg, men jeg...',
                'Det finnes få ting som irriterer meg mer enn...',
                'Noen ganger lurer jeg på om...',
            ],
            digresjon: [
                'Men vent, det minner meg om...',
                'Apropos... så er det jo slik at...',
                'Og det bringer meg til et annet poeng...',
                'Nå som vi er inne på temaet...',
                'Mens vi snakker om det...',
                'Forresten, har du tenkt på at...',
            ],
            ironi: [
                'Selvfølgelig er det helt normalt å...',
                'For det er jo så lurt å...',
                'Og alle vet jo at...',
                'Det er klart, fordi...',
                'Ja, for det fungerer jo så bra...',
                'Heldigvis har vi jo...',
                'Som vi alle vet er... helt uproblematisk...',
            ],
            poeng: [
                'Poenget er egentlig at...',
                'Det sier noe om oss at...',
                'Kanskje handler det om at...',
                'For i bunn og grunn...',
                'Det interessante er jo at...',
                'Men spøk til side...',
                'Det vi egentlig bør spørre oss er...',
            ],
            avslutning: [
                'Men hva vet vel jeg...',
                'Til syvende og sist...',
                'Og med det sagt...',
                'Så neste gang du...',
                'Moralen er vel at...',
                'Jeg lar det være opp til deg å...',
            ],
        },
        vgs: {
            innledning: [
                'Det er en sannhet med modifikasjoner at...',
                'I en verden der... burde man kanskje...',
                'La oss et øyeblikk dvele ved...',
                'Det er fascinerende hvordan...',
                'En ting som aldri slutter å forundre meg er...',
                'Man skulle tro at... men nei...',
                'Livet har lært meg at...',
            ],
            digresjon: [
                'Men la meg ta et sidesprang...',
                'Dette bringer tankene til...',
                'Parentetisk bemerket...',
                'Og her kommer en observasjon som...',
                'Nå lar jeg meg riktignok avspore, men...',
                'Et beslektet fenomen er...',
                'Som en viss filosof visstnok skal ha sagt...',
            ],
            ironi: [
                'For det er jo en udiskutabel sannhet at...',
                'Naturligvis er dette helt uproblematisk...',
                'Og vi kan jo bare berolige oss med at...',
                'Heldigvis slipper vi å forholde oss til...',
                'Det er da vitterlig et tegn på fremskritt at...',
                'La oss glede oss over at...',
                'For hva kan vel gå galt...',
            ],
            poeng: [
                'Bak humoren skjuler det seg et alvor...',
                'Det avslørende er at...',
                'Paradokset er selvsagt at...',
                'Og her er vi ved sakens kjerne...',
                'Det tragiske — eller komiske — er at...',
                'Spøk til side: dette handler dypest sett om...',
                'Subteksten er naturligvis at...',
            ],
            avslutning: [
                'Og med det har jeg sagt mitt...',
                'Men hvem er vel jeg til å...',
                'Jeg overlater resten til ettertanken...',
                'Så får det stå til...',
                'Og neste gang noen hevder at...',
                'La oss håpe at... men la oss ikke satse på det...',
            ],
        },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // LESERINNLEGG — kort meningsytring, tydelig standpunkt, oppfordring
    // ─────────────────────────────────────────────────────────────────────────
    leserinnlegg: {
        us: {
            innledning: [
                'Jeg skriver dette fordi...',
                'Det har lenge irritert meg at...',
                'Etter å ha lest om... føler jeg behov for å...',
                'Som elev reagerer jeg på at...',
                'I det siste har det vært mye snakk om...',
                'Det er viktig å si ifra når...',
            ],
            pastand: [
                'Jeg mener at...',
                'Det er feil at...',
                'Vi kan ikke godta at...',
                'Det er på tide at noen sier at...',
                'Sannheten er at...',
                'La meg være tydelig:...',
            ],
            argument: [
                'Grunnen til at dette er viktig er...',
                'For det første...',
                'I tillegg...',
                'Mange opplever at...',
                'Det rammer spesielt...',
                'Konsekvensen er at...',
                'Et eksempel er...',
            ],
            oppfordring: [
                'Derfor ber jeg om at...',
                'De ansvarlige må...',
                'Vi som er berørt krever at...',
                'Det minste vi kan forvente er...',
                'Min oppfordring er...',
                'La oss sørge for at...',
                'Det er på tide at...',
            ],
            avslutning: [
                'Vi fortjener bedre...',
                'Nok er nok...',
                'Det haster å gjøre noe med dette...',
                'Jeg håper noen lytter...',
                'La oss ikke akseptere status quo...',
                'Ballen ligger nå hos...',
            ],
        },
        vgs: {
            innledning: [
                'Undertegnede finner grunn til å kommentere...',
                'Den pågående debatten om... har avdekket...',
                'Når... er det nødvendig å nyansere...',
                'I lys av den siste tidens utvikling...',
                'Det er betimelig å stille spørsmål ved...',
                'Det fremstår som paradoksalt at...',
                'Som direkte berørt part vil jeg...',
            ],
            pastand: [
                'Det er grunnlag for å hevde at...',
                'Realiteten er at...',
                'Situasjonen er uholdbar fordi...',
                'Det er vanskelig å se bort fra at...',
                'Premisset om at... holder ikke...',
                'Kjerneproblemet er at...',
            ],
            argument: [
                'Argumentet styrkes av at...',
                'De strukturelle årsakene er...',
                'Konsekvensene er veldokumenterte...',
                'Empiri fra... underbygger at...',
                'Sammenlignet med... fremstår...',
                'Det er ikke uten grunn at...',
                'Den prinsipielle begrunnelsen er at...',
            ],
            oppfordring: [
                'Det påhviler beslutningstakerne å...',
                'En ansvarlig tilnærming forutsetter at...',
                'Situasjonen krever handling i form av...',
                'Jeg etterlyser en politikk som...',
                'Det er ikke lenger tilstrekkelig å...',
                'Det minste man kan forlange er at...',
                'Tiden for symbolpolitikk er forbi...',
            ],
            avslutning: [
                'Ansvaret kan ikke skyves videre...',
                'Demokratiet forutsetter at...',
                'Alternativene er klare...',
                'Det hviler et ansvar på...',
                'Utviklingen tilsier at...',
                'Historien har vist at passivitet...',
            ],
        },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // NOVELLE — kreativ skriving, skjønnlitterær tekst
    // ─────────────────────────────────────────────────────────────────────────
    novelle: {
        us: {
            aapning: [
                'Det var den dagen da...',
                'Regnet trommet mot vinduet da...',
                'Noe var annerledes den morgenen...',
                'Klokken var nesten...',
                'Huset lå stille, bortsett fra...',
                'Det begynte med en lyd...',
                'Meldingen kom klokken...',
            ],
            skildring: [
                'Lyset falt skrått inn og...',
                'Luften var tung av...',
                'Stillheten ble bare brutt av...',
                'Overalt lå det...',
                'Rommet var...',
                'Utenfor vinduet...',
                'Det luktet av...',
            ],
            dialog: [
                '"Hør," sa... "...',
                '"Jeg har noe jeg må fortelle deg," ...',
                '"Vent," hvisket...',
                '"Det er ikke det du tror," ...',
                'Stemmen var knapt hørbar:...',
                '"Hvorfor?" var alt... klarte å si...',
            ],
            vendepunkt: [
                'Da skjedde det som endret alt...',
                'Plutselig...',
                'Det var i det øyeblikket...',
                'Først da forsto...',
                'Sannheten traff som...',
                'Alt snudde da...',
                'I det samme...',
            ],
            avslutning: [
                'Etterpå var ingenting som før...',
                'Og slik ble det...',
                'Tilbake sto bare...',
                'Det siste... så var...',
                'Nå visste... at...',
                'Morgenen etter...',
            ],
        },
        vgs: {
            aapning: [
                'Minnet sitter i kroppen ennå...',
                'Det finnes øyeblikk som...',
                'Solen hadde for lengst gått ned da...',
                'Tre ting var sikkert den kvelden...',
                'Ettertiden ville kalle det et vendepunkt...',
                'Byen sov. Men i leiligheten i...',
                'Det ironiske er at alt begynte med...',
                'Dersom noen hadde fortalt meg at...',
            ],
            skildring: [
                'Morgenlyset siv gjennom gardinene som...',
                'Det var noe ved rommet som...',
                'Lydene trengte gjennom veggene —...',
                'Skyggene tegnet mønstre som...',
                'Kroppen husket det hodet hadde glemt...',
                'Landskapet åpnet seg som...',
                'Det var den typen stillhet som...',
                'Detaljene brant seg fast:...',
            ],
            dialog: [
                'Ordene hang i luften mellom dem...',
                '"Det er ikke så enkelt," mumlet...',
                'Stemmen bar preg av...',
                'Det usagte fylte rommet...',
                'Pausen sa mer enn ordene...',
                'Samtalen hadde den desperate tonen av...',
                'De snakket forbi hverandre som...',
            ],
            vendepunkt: [
                'I ettertid var det dette øyeblikket som...',
                'Erkjennelsen slo inn med...',
                'Det var som om tiden...',
                'Noe forskjøv seg umerkelig...',
                'Plutselig fremsto alt i et nytt lys...',
                'Den tilsynelatende ubetydelige hendelsen...',
                'Alt det som hadde virket stabilt...',
            ],
            avslutning: [
                'Tiden ville vise at...',
                'Sporene etter den dagen finnes ennå...',
                'Noe hadde lukket seg for godt...',
                'Det fantes ingen vei tilbake til...',
                'Livet gikk videre, men...',
                'Og kanskje var det nettopp det som...',
                'Etterpå var det ingen som snakket om...',
            ],
        },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // SAMMENLIGNING — sammenligne to eller flere tekster
    // ─────────────────────────────────────────────────────────────────────────
    sammenligning: {
        us: {
            innledning: [
                'I denne teksten skal jeg sammenligne...',
                'Jeg skal se på likheter og forskjeller mellom...',
                'De to tekstene har mye til felles, men...',
                'Temaet... behandles ulikt i de to tekstene...',
                'Begge tekstene handler om... men med ulike tilnærminger...',
                'Formålet med denne sammenligningen er å...',
            ],
            likheter: [
                'En tydelig likhet er at begge tekstene...',
                'Felles for tekstene er...',
                'Både tekst 1 og tekst 2...',
                'Tematisk deler tekstene...',
                'Et gjennomgående fellestrekk er...',
                'Begge forfatterne velger å...',
            ],
            forskjeller: [
                'En viktig forskjell er at...',
                'Mens tekst 1... velger tekst 2 å...',
                'Tekstene skiller seg i måten de...',
                'Der den ene forfatteren... gjør den andre...',
                'I motsetning til tekst 1 bruker tekst 2...',
                'Forskjellen blir tydelig når vi ser på...',
            ],
            avslutning: [
                'Sammenligningen viser at...',
                'Til tross for forskjellene deler tekstene...',
                'Den viktigste innsikten fra sammenligningen er...',
                'Tekstene utfyller hverandre ved at...',
                'Oppsummert kan vi si at...',
                'Samlet sett illustrerer tekstene hvordan...',
            ],
        },
        vgs: {
            innledning: [
                'Denne komparative analysen undersøker...',
                'I det følgende sammenlignes... med utgangspunkt i...',
                'Tekstene representerer ulike tilnærminger til...',
                'Sammenligningen tar sikte på å belyse...',
                'Med utgangspunkt i... og... vil jeg undersøke...',
                'De valgte tekstene egner seg for sammenligning fordi...',
            ],
            likheter: [
                'Et strukturelt fellestrekk er at begge tekstene...',
                'Tematisk konvergerer tekstene i sin behandling av...',
                'Parallellen mellom... og... er slående...',
                'Begge tekstene opererer innenfor en tradisjon der...',
                'Den felles tematikken manifesterer seg gjennom...',
                'På et dypere plan deler tekstene en...',
            ],
            forskjeller: [
                'Divergensen blir tydelig i måten tekstene...',
                'Der den ene anlegger et... perspektiv, velger den andre...',
                'Forskjellen er ikke bare stilistisk, men også...',
                'Kontrasten mellom tekstene reflekterer...',
                'Den mest fundamentale forskjellen ligger i...',
                'Tekstenes ulike posisjonering viser seg gjennom...',
            ],
            avslutning: [
                'Den komparative analysen avdekker at...',
                'Tekstene belyser hverandre ved at...',
                'Sammenligningen demonstrerer hvordan...',
                'De komplementære perspektivene viser at...',
                'Avslutningsvis illustrerer tekstene kompleksiteten i...',
                'Den samlede analysen viser at...',
            ],
        },
    },


    // ─────────────────────────────────────────────────────────────────────────
    // KORTSVAR — kort, sammenlignende oppgave
    // ─────────────────────────────────────────────────────────────────────────
    kortsvar: {
        us: {
            innledning: [
                'Tekst 1 er skrevet av... og handler om...',
                'Jeg skal sammenligne... og...',
                'I dette kortsvaret vil jeg ta for meg...',
                'Begge tekstene tar opp temaet...',
                'I dette kortsvaret skal jeg sammenligne...',
                'De to tekstene handler begge om... men...',
                'Tekstene ligner hverandre ved at... men skiller seg ved...',
                'Jeg skal se på likheter og forskjeller mellom...',
            ],
            sammenligning: [
                'Begge tekstene peker på at...',
                'Et fellestrekk ved tekstene er...',
                'Den største likheten er hvordan de...',
                'Både forfatter 1 og forfatter 2 vektlegger...',
                'En likhet mellom tekstene er at...',
                'Begge tekstene bruker... men med ulik effekt...',
                'Felles for tekstene er at...',
            ],
            forskjeller: [
                'På den annen side velger tekst 2 å...',
                'En viktig forskjell er at...',
                'Mens tekst 1 er..., er tekst 2...',
                'Til forskjell fra tekst 1, bruker tekst 2...',
                'I motsetning til tekst 1 velger tekst 2 å...',
                'Der tekst 1 fokuserer på... legger tekst 2 vekt på...',
            ],
            oppsummering: [
                'Kort oppsummert viser sammenligningen at...',
                'Samlet sett gir de to tekstene et bilde av...',
                'Hovedforskjellen koker ned til...',
                'Til tross for ulikhetene, er budskapet...',
                'Samlet sett viser sammenligningen at...',
                'Til tross for ulikhetene deler tekstene...',
                'Konklusjonen er at tekstene... fordi...',
                'Den viktigste forskjellen er at...',
            ],
        },
        vgs: {
            innledning: [
                'Dette kortsvaret tar utgangspunkt i tekstene...',
                'Jeg skal foreta en sammenligning av...',
                'Begge tekstene retter søkelyset mot...',
                'Formålet med denne sammenligningen er...',
                'Denne sammenligningen tar for seg... med vekt på...',
                'De to tekstene posisjonerer seg ulikt innenfor...',
                'Tekstenes felles tematikk åpner for en sammenligning av...',
                'I det følgende sammenlignes... med hensyn til...',
            ],
            sammenligning: [
                'Tematisk sett har tekstene mye til felles, spesielt...',
                'Et gjennomgående likhetstrekk er forfatternes bruk av...',
                'Parallellen mellom tekstene blir tydelig når...',
                'Begge tekstene bygger på premisset om at...',
                'Et gjennomgående trekk ved begge tekstene er...',
            ],
            forskjeller: [
                'Forskjellen i virkemiddelbruk kommer frem ved at...',
                'Mens tekst 1 appellerer til..., støtter tekst 2 seg på...',
                'Kontrasten er markant i måten forfatterne...',
                'Der tekst 1 inntar et... perspektiv, velger tekst 2...',
                'Tekstene divergerer imidlertid i sin behandling av...',
                'Den kompositoriske forskjellen gjenspeiler ulike syn på...',
                'Mens den ene forfatteren privilegerer... prioriterer den andre...',
            ],
            oppsummering: [
                'Sammenligningen avdekker at tekstene utfyller...',
                'Konklusjonen er at tekstene belyser temaet fra...',
                'Dette viser hvordan ulik form påvirker...',
                'Samlet sett underbygger de begge at...',
                'Sammenligningen avdekker at tekstene representerer...',
                'De komplementære perspektivene belyser...',
                'Avslutningsvis demonstrerer tekstene hvordan...',
                'Til tross for overflatisk likhet er forskjellene fundamentale...',
                'Den samlede sammenligningen viser at...',
            ],
        },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // KREATIV TEKST — fortelling, dikt, novelle (kreativ inngang)
    // ─────────────────────────────────────────────────────────────────────────
    'kreativ-tekst': {
        us: {
            aapning: [
                'Det hele begynte den dagen da...',
                'Uten forvarsel smalt det...',
                'Sola stekte, og gatene var tomme...',
                'Ingen hadde trodd at...',
                'Det var noe jeg aldri fikk sagt...',
                'Ordene forsvant i det øyeblikket...',
                'Jeg husker lyden av...',
                'Alt begynte med en tanke som...',
                'Noen ganger tenker jeg at...',
                'Det finnes steder der...',
            ],
            utvikling: [
                'Og plutselig var alt annerledes...',
                'Tankene mine vandret til...',
                'Det var som om verden...',
                'Stemmen i meg sa...',
                'Bildene skiftet —...',
                'Noe forandret seg da...',
                'Kroppen husket det hodet hadde glemt...',
            ],
            skildring: [
                'Lufta var tung av...',
                'Lyden av... fylte rommet...',
                'Skyggene danset over...',
                'En iskald følelse spredte seg...',
            ],
            vendepunkt: [
                'Men plutselig forandret alt seg...',
                'Det var da hun forstod at...',
                'I det øyeblikket skjedde det utrolige...',
                'Ting skulle aldri bli det samme igjen...',
            ],
            avslutning: [
                'Og med det var kapittelet lukket.',
                'Kanskje var det like greit.',
                'Stillheten senket seg endelig.',
                'Noen ganger er det beste å...',
                'Og der, i stillheten, fant jeg...',
                'Kanskje var det alltid slik...',
                'Det eneste som gjensto var...',
                'Slik ender det — ikke med et smell, men...',
                'Og så var det stille igjen...',
                'Men nå vet jeg at...',
            ],
        },
        vgs: {
            aapning: [
                'Regnet slo nådeløst mot asfalten, mens...',
                'Stillheten i rommet var nesten til å ta og føle på...',
                'I et flyktig sekund trodde hun at...',
                'Det lå en ubeskrivelig tyngde over...',
                'Det finnes et øyeblikk mellom...',
                'La meg fortelle deg om et sted der...',
                'Membranen mellom drøm og virkelighet...',
                'Tre bilder: ...',
                'Kroppen som arkiv — der sitter...',
                'Dersom språket kunne fange det...',
                'I grenselandet mellom... og...',
            ],
            utvikling: [
                'Og tiden folder seg — ...',
                'Her bryter noe gjennom overflaten...',
                'Fragmentene ordner seg til...',
                'Stemmene veksler mellom... og...',
                'Det usagte tar form som...',
                'Rytmen skifter — fra... til...',
                'I spennet mellom det fortalte og det fortiede...',
            ],
            skildring: [
                'Lyset brøt gjennom støvskyen og...',
                'Lukten av... vekket umiddelbart minner om...',
                'Landskapet lå badet i...',
                'Ansiktet hans bar preg av...',
            ],
            vendepunkt: [
                'Det uunngåelige inntraff med brutal kraft...',
                'Som et lyn fra klar himmel innså han at...',
                'Det var dette øyeblikket som definerte alt...',
                'Erkjennelsen traff henne som et slag...',
            ],
            avslutning: [
                'Slik forble det, urørlig og stille.',
                'Minner blekende i lyset av en ny dag.',
                'Og ingenting ville noensinne bli det samme.',
                'Til syvende og sist var alt bare...',
                'Slik avsluttes ingenting — alt fortsetter som...',
                'Det som gjenstår er sporet av...',
                'Og kanskje er det nettopp dette: ...',
                'Mellom linjene hviler det som aldri ble...',
                'Siste bilde: ...',
                'Sirkelen lukker seg — men ikke helt...',
            ],
        },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // REFLEKTERENDE TEKST
    // ─────────────────────────────────────────────────────────────────────────
    'reflekterende-tekst': {
        us: {
            innledning: [
                'Har du noen gang tenkt over hvorfor...',
                'Dette temaet får meg til å tenke på...',
                'I dag snakker alle om..., men...',
                'Et spørsmål som ofte dukker opp er...',
                'Noe som har fått meg til å tenke er...',
                'Jeg har ofte lurt på...',
                'Da jeg opplevde... begynte jeg å reflektere over...',
                'Det er vanskelig å sette ord på... men...',
                'Mange tar for gitt at... men er det virkelig slik?',
            ],
            hoveddel: [
                'På den ene siden kan man si at...',
                'Samtidig er det viktig å huske på...',
                'Dette kan henge sammen med...',
                'Mine egne erfaringer viser at...',
            ],
            utforsking: [
                'Når jeg tenker nærmere over dette...',
                'En annen måte å se det på er...',
                'Kanskje handler det egentlig om...',
                'Min erfaring er at...',
                'Jeg tror dette henger sammen med...',
                'Det som overrasker meg er at...',
                'Samtidig må jeg innrømme at...',
            ],
            refleksjon: [
                'Jeg tror at grunnen til dette er...',
                'Det får meg til å innse at...',
                'Kanskje ligger løsningen i å...',
                'Dette minner meg om...',
            ],
            avslutning: [
                'Alt i alt er dette et tema som krever...',
                'Forhåpentligvis vil vi en dag...',
                'Det viktigste jeg tar med meg er...',
                'Kanskje har vi noe å lære av...',
                'Etter å ha tenkt over dette innser jeg at...',
                'Jeg har ikke et endelig svar, men...',
                'Denne refleksjonen har lært meg at...',
                'Jeg tror vi alle trenger å...',
                'Det jeg sitter igjen med er...',
            ],
        },
        vgs: {
            innledning: [
                'En av vår tids store utfordringer er knyttet til...',
                'Å reflektere over... tvinger oss til å...',
                'Debatten om... reiser grunnleggende spørsmål om...',
                'Det finnes neppe et entydig svar på hvorfor...',
                'Refleksjonen som følger springer ut av...',
                'Det finnes spørsmål som ikke lar seg besvare entydig...',
                'I møtet mellom... og... oppstår et rom for refleksjon...',
                'Erfaringen av... har satt i gang en tankeprosess om...',
                'Å reflektere over... innebærer å anerkjenne at...',
                'Denne teksten utforsker spenningen mellom...',
            ],
            hoveddel: [
                'Et sentralt aspekt ved denne problematikken er...',
                'Det er nærliggende å trekke paralleller til...',
                'Dette fenomenet må ses i sammenheng med...',
                'I et bredere perspektiv kan man hevde at...',
            ],
            utforsking: [
                'Ved nærmere ettertanke fremstår det som...',
                'Paradokset er at...',
                'Perspektivet forskyves dersom vi...',
                'Det er fristende å forenkle, men...',
                'Den personlige erfaringen resonerer med...',
                'Ambivalensen skyldes kanskje at...',
                'I spenningsfeltet mellom... og... finnes...',
            ],
            refleksjon: [
                'Dette etterlater en følelse av ambivalens...',
                'Erkjennelsen av at... åpner for nye spørsmål...',
                'Dypest sett handler dette om vår evne til...',
                'Kanskje ligger kjernen i problemet nettopp i...',
            ],
            avslutning: [
                'Slik sett representerer... ikke bare en utfordring, men...',
                'Avslutningsvis er det grunn til å minne om...',
                'Til syvende og sist koker det ned til...',
                'Refleksjonen leder oss frem til at...',
                'Refleksjonen leder ikke til et entydig svar, men...',
                'Det som gjenstår er en dypere forståelse av...',
                'Kanskje er selve undringen det verdifulle...',
                'Erkjennelsen som trer fram er at...',
                'Prosessen har vist at... krever...',
                'Innsikten jeg bærer med meg er at...',
            ],
        },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // RETORISK ANALYSE
    // ─────────────────────────────────────────────────────────────────────────
    'retorisk-analyse': {
        us: {
            innledning: [
                'Teksten jeg skal analysere heter...',
                'Formålet med teksten er å overbevise om at...',
                'Avsenderen av teksten er...',
                'Målgruppen ser ut til å være...',
                'I denne teksten skal jeg analysere retorikken i...',
                'Teksten jeg skal undersøke bruker flere retoriske grep...',
                'Avsenderen forsøker å overbevise leseren om at...',
                'Jeg skal se på hvordan forfatteren bruker etos, patos og logos...',
            ],
            'retorisk-situasjon': [
                'Teksten ble skrevet fordi...',
                'Den retoriske situasjonen er preget av...',
                'Situasjonen krevde at avsenderen...',
                'Debatten rundt dette temaet var...',
            ],
            etos: [
                'Forfatteren bygger tillit ved å...',
                'Avsenderen fremstår som troverdig fordi...',
                'Bruken av egne erfaringer styrker etos...',
                'Etos etableres tidlig i teksten ved...',
                'Avsenderen bygger troverdighet (etos) ved å...',
                'Etos-appellen forsterkes av at avsenderen...',
            ],
            patos: [
                'Teksten spiller på følelser som...',
                'Forfatteren prøver å vekke leserens...',
                'Bruken av sterke ord skaper en følelse av...',
                'For å fange oppmerksomheten bruker avsender...',
                'Her appellerer teksten til følelsene våre (patos) gjennom...',
                'Patos brukes effektivt når forfatteren...',
            ],
            logos: [
                'Forfatteren bruker fakta for å bevise at...',
                'Logikken i teksten er bygget opp rundt...',
                'Argumentene støttes av statistikk som viser...',
                'Avsenderen argumenterer logisk ved å vise til...',
                'Argumentet hviler på logikk (logos) fordi...',
                'Logos kommer til uttrykk gjennom fakta som...',
            ],
            virkemidler: [
                'Et viktig virkemiddel her er...',
                'Gjentakelsen av... understreker at...',
                'Forfatteren bruker ironi for å vise at...',
                'Metaforen... hjelper leseren å forstå...',
                'Retoriske spørsmål brukes for å...',
                'Kontrasten mellom... og... understreker...',
                'Forfatteren bruker vi-form for å...',
            ],
            avslutning: [
                'Alt i alt lykkes teksten med å...',
                'Den mest effektive appellformen er...',
                'Konklusjonen er at forfatteren klarer å...',
                'Til tross for sterke argumenter, mangler teksten...',
                'Oppsummert bruker avsenderen... for å overbevise...',
                'De retoriske grepene virker... fordi...',
                'Teksten lykkes/lykkes ikke med å overbevise fordi...',
                'Retorikken er effektiv fordi...',
                'Analysen viser at teksten primært appellerer til...',
            ],
        },
        vgs: {
            innledning: [
                'Denne retoriske analysen tar for seg...',
                'Hovedintensjonen til avsenderen er å...',
                'Teksten posisjonerer seg i debatten om...',
                'Den retoriske strategien hviler tungt på...',
                'Denne analysen undersøker de retoriske strategiene i...',
                'Den retoriske situasjonen kjennetegnes av...',
                'Med utgangspunkt i den retoriske situasjonen vil jeg analysere...',
                'Teksten inngår i en kontekst der kairos er...',
                'Avsenderens retoriske hensikt er å...',
                'I det følgende analyseres de retoriske appellformene i...',
            ],
            'retorisk-situasjon': [
                'Det påtrengende problemet (exigence) er...',
                'Kairos-øyeblikket for teksten er preget av...',
                'Avsenderen tilpasser seg den retoriske situasjonen ved...',
                'Konteksten teksten inngår i, krever en strategi som...',
            ],
            etos: [
                'Avsenderen konstruerer en initial etos preget av...',
                'Den avledede etosen styrkes underveis ved at...',
                'Kompetanse og autoritet etableres gjennom...',
                'Etos appellerer til målgruppens verdier (dygd) ved å...',
                'Etos-appellen konstrueres gjennom avsenderens...',
                'Etosen forsterkes intertekstuelt gjennom referanser til...',
                'Samspillet mellom etos og patos skaper...',
            ],
            patos: [
                'Patosappellen aktiveres umiddelbart gjennom...',
                'Det følelsesmessige engasjementet vekkes ved hjelp av...',
                'Billedbruken bidrar sterkt til å mobilisere patos...',
                'Skiftet i tonefall skaper en emosjonell kontrast som...',
                'Patos-dimensjonen realiseres ved at teksten...',
                'Den emosjonelle appellen intensiveres ved...',
            ],
            logos: [
                'Den logiske argumentasjonen (logos) bæres frem av...',
                'Preste- og entymemer benyttes for å...',
                'Induktiv resonnering ligger til grunn for påstanden om...',
                'Holdbarheten i argumentasjonen styrkes av...',
                'Logos-argumentasjonen bygger på premisset om at...',
                'Den logiske argumentasjonsrekken hviler på...',
            ],
            virkemidler: [
                'Det stilistiske valget av... fungerer overbevisende...',
                'De retoriske spørsmålene tjener funksjonen å...',
                'Kontrastbruken polariserer debatten ved å...',
                'Den gjennomgående metaforikken forsterker inntrykket av...',
                'Den retoriske figuren... fungerer ved at...',
                'Anaforens repetitive struktur forsterker...',
                'Det stilistiske registeret signaliserer en...',
                'Topos-bruken plasserer argumentet innenfor...',
                'Den implisitte premissen forutsetter at mottakeren...',
                'Metonymien erstatter... med... og oppnår...',
                'Kairos utnyttes ved at teksten aktualiserer...',
            ],
            avslutning: [
                'Samlet sett fremstår den retoriske strategien som...',
                'Den dominerende patosappellen overskygger imidlertid...',
                'Avsenderen oppnår sitt perlokutive mål ved å...',
                'Tekstens retoriske styrke ligger i samspillet mellom...',
                'Analysen avdekker et samspill mellom appellformene der...',
                'Den retoriske strategien er primært... med innslag av...',
                'Tekstens overbevisningskraft hviler i hovedsak på...',
                'Retorikkens effektivitet begrenses imidlertid av...',
                'Avslutningsvis demonstrerer teksten hvordan...',
                'Den samlede retoriske effekten er...',
            ],
        },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // FORTELLING — barneskole/ungdomsskole narrativ (us-tier = enkelt språk)
    // ─────────────────────────────────────────────────────────────────────────
    fortelling: {
        us: {
            begynnelse: [
                'Det var en gang...',
                'En dag skulle...',
                'Det hele startet da...',
                'Akkurat da... skjedde det noe rart.',
                'Langt borte i... bodde det...',
                'Jeg glemmer aldri dagen da...',
            ],
            midtdel: [
                'Plutselig...',
                'Da oppdaget...',
                'Det ble verre og verre, fordi...',
                'Uten å tenke seg om...',
                'Hjertet banket fort da...',
                'Ingen visste at...',
            ],
            slutt: [
                'Til slutt...',
                'Endelig var...',
                'Etter den dagen...',
                'Alt ble bra igjen da...',
                'Og det var slik...',
                'Nå vet jeg at...',
            ],
        },
        vgs: {
            begynnelse: [
                'Det begynte som en helt vanlig dag, helt til...',
                'Ingen i... hadde noen gang sett...',
                'Lyden av... var det første jeg la merke til.',
                'Alle sa at man aldri skulle... men...',
            ],
            midtdel: [
                'I det samme øyeblikket forsto...',
                'Alt hang plutselig sammen:...',
                'Det fantes ingen vei tilbake da...',
                'Med hendene fulle av... snudde...',
            ],
            slutt: [
                'Da roen endelig senket seg...',
                'Ingenting ble helt som før, men...',
                'Kanskje var det nettopp det som måtte skje...',
                'Historien om... fortelles fortsatt.',
            ],
        },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // FAKTATEKST — barneskole/ungdomsskole informerende tekst
    // ─────────────────────────────────────────────────────────────────────────
    faktatekst: {
        us: {
            innledning: [
                'Denne teksten handler om...',
                'Visste du at...',
                'Har du noen gang lurt på...',
                'Nå skal du få lære om...',
            ],
            fakta: [
                'En viktig ting å vite er at...',
                'Forskere har funnet ut at...',
                'Noe annet som er spennende, er at...',
                'Det betyr at...',
                'De fleste... har...',
                'Et eksempel på dette er...',
            ],
            avslutning: [
                'Nå har du lært at...',
                'Det viktigste å huske er...',
                'Som du ser, er... et spennende emne.',
                'Hvis du vil lære mer, kan du...',
            ],
        },
        vgs: {
            innledning: [
                'Denne teksten gir en oversikt over...',
                'Temaet... er aktuelt fordi...',
                'For å forstå... må vi først se på...',
            ],
            fakta: [
                'Undersøkelser viser at...',
                'Et sentralt kjennetegn ved... er...',
                'Dette henger sammen med...',
                'Sammenlignet med... er...',
            ],
            avslutning: [
                'Oppsummert kjennetegnes... av...',
                'Kunnskap om... er viktig fordi...',
                'Det gjenstår fortsatt å finne ut...',
            ],
        },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // BOKMELDING — presentasjon, handling og vurdering av ei bok
    // ─────────────────────────────────────────────────────────────────────────
    bokmelding: {
        us: {
            innledning: [
                'Boka jeg har lest, heter...',
                'Den er skrevet av...',
                'Dette er en bok om...',
                'Sjangeren er... og boka passer for...',
            ],
            handling: [
                'Boka handler om...',
                'Hovedpersonen er... som...',
                'Problemet i historien er at...',
                'Underveis møter... på...',
                'Det mest spennende stedet i boka er når...',
            ],
            vurdering: [
                'Det beste med boka var... fordi...',
                'Jeg likte godt at...',
                'Noe jeg ikke likte så godt, var...',
                'Språket i boka er...',
                'Boka fikk meg til å føle...',
            ],
            anbefaling: [
                'Jeg anbefaler boka til deg som liker...',
                'Denne boka passer for...',
                'Jeg gir boka... av 6 stjerner fordi...',
                'Hvis du likte... vil du også like denne.',
            ],
        },
        vgs: {
            innledning: [
                'Romanen... av... kom ut i...',
                'Forfatteren er kjent for...',
                'Boka plasserer seg i sjangeren...',
            ],
            handling: [
                'Handlingen kretser rundt...',
                'Konflikten oppstår når...',
                'Fortellingen veksler mellom...',
            ],
            vurdering: [
                'Bokas største styrke er...',
                'Forfatteren lykkes særlig med...',
                'Et svakt punkt er imidlertid...',
                'Språklig kjennetegnes boka av...',
            ],
            anbefaling: [
                'Boka anbefales til lesere som...',
                'Samlet sett fortjener boka...',
                'Lesere av... vil kjenne seg igjen i...',
            ],
        },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // SØKNAD — jobbsøknad / søknad om plass
    // ─────────────────────────────────────────────────────────────────────────
    soeknad: {
        us: {
            innledning: [
                'Jeg søker med dette på stillingen som...',
                'Jeg viser til utlysningen på... og søker herved...',
                'Jeg så annonsen deres på... og vil gjerne søke.',
            ],
            kvalifikasjoner: [
                'Jeg har erfaring med... fra...',
                'Gjennom... har jeg lært å...',
                'Som... hadde jeg ansvar for...',
                'På skolen har jeg vist at jeg...',
                'Venner og lærere beskriver meg som...',
            ],
            motivasjon: [
                'Jeg ønsker meg denne stillingen fordi...',
                'Det som tiltaler meg ved... er...',
                'Jeg kan bidra med...',
                'Jeg er spesielt interessert i...',
            ],
            avslutning: [
                'Jeg stiller gjerne til intervju og kan begynne...',
                'Ta gjerne kontakt om dere har spørsmål.',
                'Jeg håper på positivt svar.',
            ],
        },
        vgs: {
            innledning: [
                'Jeg søker med dette den utlyste stillingen som...',
                'Med bakgrunn i... ønsker jeg å søke stillingen som...',
            ],
            kvalifikasjoner: [
                'Erfaringen min fra... har gitt meg...',
                'I rollen som... utviklet jeg...',
                'Jeg behersker... og har dokumentert...',
                'Arbeidet med... krevde at jeg...',
            ],
            motivasjon: [
                'Virksomheten deres tiltaler meg fordi...',
                'Stillingen passer godt med min plan om å...',
                'Jeg ser fram til å kunne bidra med...',
            ],
            avslutning: [
                'Jeg stiller gjerne i intervju for å utdype søknaden.',
                'Referanser oppgis på forespørsel.',
                'Jeg ser fram til å høre fra dere.',
            ],
        },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // FORMELT BREV — klage, forespørsel eller melding til ukjent mottaker
    // ─────────────────────────────────────────────────────────────────────────
    'formelt-brev': {
        us: {
            innledning: [
                'Jeg skriver til dere fordi...',
                'Jeg viser til... og ønsker å...',
                'Jeg kontakter dere angående...',
            ],
            sak: [
                'Den... opplevde jeg at...',
                'Saken gjelder...',
                'Jeg vil særlig peke på at...',
                'Dette har ført til at...',
            ],
            handling: [
                'Jeg ber derfor om at...',
                'Jeg ønsker en tilbakemelding på...',
                'Et godt utfall for meg ville være at...',
            ],
            avslutning: [
                'På forhånd takk for hjelpen.',
                'Jeg ser fram til å høre fra dere.',
                'Jeg kan kontaktes på...',
            ],
        },
        vgs: {
            innledning: [
                'Jeg henvender meg til dere i forbindelse med...',
                'Det vises til... datert...',
            ],
            sak: [
                'Saksforholdet er som følger:...',
                'Jeg vil framheve at...',
                'Vedlagt følger dokumentasjon på...',
            ],
            handling: [
                'På denne bakgrunn ber jeg om at...',
                'Jeg imøteser en skriftlig tilbakemelding innen...',
                'Dersom saken ikke løses, vurderer jeg å...',
            ],
            avslutning: [
                'Takk for at dere behandler henvendelsen.',
                'Jeg står til disposisjon for ytterligere opplysninger.',
            ],
        },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // GENERELL — fallback når ingen skriveramme er aktiv
    // ─────────────────────────────────────────────────────────────────────────
    generell: {
        us: {
            innledning: [
                'I denne teksten skal jeg...',
                'Temaet for denne teksten er...',
                'Det er mange som mener at...',
                'Har du noen gang tenkt på...',
                'Et viktig spørsmål i dag er...',
                'Mange lurer på om...',
            ],
            argument: [
                'Et viktig argument for dette er...',
                'For det første...',
                'Det finnes gode grunner til å mene at...',
                'En grunn til dette er...',
                'Det er bevist at...',
                'Et sentralt poeng er at...',
            ],
            motargument: [
                'På den andre siden...',
                'Et motargument er at...',
                'Andre mener derimot at...',
                'Likevel kan man innvende at...',
                'De som er uenige peker på at...',
                'Mot dette kan man si at...',
            ],
            eksempel: [
                'Et godt eksempel på dette er...',
                'Vi ser dette tydelig i...',
                'I praksis betyr dette at...',
                'Dette kan illustreres med...',
                'Et konkret eksempel er...',
                'For eksempel...',
            ],
            overgang: [
                'I tillegg til dette...',
                'Et annet viktig poeng er...',
                'Dessuten...',
                'Når det gjelder...',
                'Vi må også se på...',
                'La oss nå se på...',
                'Videre...',
            ],
            avslutning: [
                'Alt i alt mener jeg at...',
                'Konklusjonen er at...',
                'Samlet sett...',
                'Til slutt vil jeg si at...',
                'Oppsummert...',
                'Derfor mener jeg at...',
            ],
            kilde: [
                'Ifølge... er det slik at...',
                'Som... påpeker...',
                'I artikkelen "..." hevdes det at...',
                'Tall fra... viser at...',
                'En undersøkelse viser at...',
                'Forskning viser at...',
            ],
        },
        vgs: {
            innledning: [
                'Et sentralt spørsmål i vår tid er...',
                'Stadig flere stiller spørsmål ved...',
                'Temaet er aktuelt fordi...',
                'I det følgende skal jeg...',
                'Problemstillingen som behandles er...',
                'Debatten aktualiserer spørsmålet om...',
            ],
            argument: [
                'På den ene siden kan man hevde at...',
                'Et sentralt poeng er at...',
                'Forskning viser at...',
                'Dette underbygges av...',
                'Det finnes gode grunner til å mene at...',
                'Et tungtveiende argument er at...',
                'Fra et... perspektiv...',
            ],
            motargument: [
                'Mot dette kan det anføres at...',
                'Kritikere vil hevde at...',
                'Likevel kan man innvende at...',
                'En vesentlig innvending er...',
                'Argumentet svekkes dersom...',
                'Perspektivet overser imidlertid at...',
            ],
            eksempel: [
                'Et godt eksempel på dette er...',
                'Dette kan illustreres ved...',
                'Vi ser dette tydelig i...',
                'En konkret konsekvens av dette er...',
                'Problemstillingen manifesterer seg i...',
                'Erfaringene fra... tilsier at...',
            ],
            overgang: [
                'Videre er det verdt å merke seg at...',
                'Et annet viktig aspekt er...',
                'Ikke bare... men også...',
                'Med dette som bakgrunn...',
                'La meg nå vende blikket mot...',
                'I forlengelsen av dette...',
                'Et beslektet spørsmål er...',
            ],
            avslutning: [
                'Etter å ha vurdert begge sider...',
                'Samlet sett viser dette at...',
                'Avslutningsvis vil jeg hevde at...',
                'Konklusjonen er at...',
                'En balansert vurdering tilsier at...',
                'Alt tatt i betraktning...',
            ],
            kilde: [
                'Ifølge... er det slik at...',
                'Som... påpeker...',
                'I artikkelen "..." hevdes det at...',
                'Statistikk fra... viser at...',
                'I sin bok "..." argumenterer... for at...',
                'Forskningen til... dokumenterer at...',
            ],
        },
    },
};

export const synonyms = {
    // ─────────────────────────────────────────────────────────────────────
    // COMMON — works for both ungdomsskole and VGS
    // ─────────────────────────────────────────────────────────────────────
    common: {
        // Overbrukte verb (original 24 + nye)
        'mener': ['hevder', 'påstår', 'anser', 'argumenterer for', 'fremholder'],
        'sier': ['uttaler', 'hevder', 'påpeker', 'framhever', 'konstaterer'],
        'viser': ['illustrerer', 'avslører', 'demonstrerer', 'tydeliggjør', 'bekrefter'],
        'bruker': ['benytter', 'anvender', 'nyttiggjør seg', 'tar i bruk'],
        'gjør': ['utfører', 'foretar', 'gjennomfører', 'bidrar til'],
        'får': ['oppnår', 'erverver', 'tilegner seg', 'mottar'],
        'har': ['besitter', 'innehar', 'disponerer', 'rår over'],
        'ser': ['observerer', 'betrakter', 'legger merke til', 'registrerer'],
        'tenker': ['reflekterer', 'vurderer', 'overveier', 'funderer på'],
        'vet': ['kjenner til', 'er kjent med', 'er klar over', 'forstår'],
        'går': ['beveger seg', 'forflytter seg', 'vandrer', 'spaserer', 'rusler'],
        'kommer': ['ankommer', 'dukker opp', 'inntreffer', 'melder seg'],
        'tar': ['griper', 'henter', 'plukker', 'velger', 'benytter'],
        'gir': ['tildeler', 'overrekker', 'bidrar med', 'tilbyr'],
        'lar': ['tillater', 'gir rom for', 'overlater til', 'åpner for'],
        'begynner': ['innleder', 'starter', 'setter i gang', 'tar fatt på'],
        'fortsetter': ['viderefører', 'holder fram', 'opprettholder', 'går videre med'],
        'finner': ['oppdager', 'lokaliserer', 'avdekker', 'støter på'],
        'legger': ['plasserer', 'anbringer', 'fører', 'stiller'],
        'holder': ['bevarer', 'opprettholder', 'fastholder', 'beholder'],
        'står': ['befinner seg', 'er plassert', 'forblir', 'hviler'],
        'ligger': ['befinner seg', 'er plassert', 'hviler', 'strekker seg'],
        'setter': ['plasserer', 'anbringer', 'stiller', 'fastslår'],
        'snakker': ['samtaler', 'diskuterer', 'ytrer seg', 'uttaler seg'],
        'forteller': ['beretter', 'forklarer', 'gjør rede for', 'skildrer'],
        'skriver': ['formulerer', 'uttrykker', 'nedtegner', 'forfatter'],
        'leser': ['studerer', 'gjennomgår', 'tolker', 'tyder'],
        'hører': ['lytter til', 'oppfatter', 'fanger opp', 'registrerer'],
        'føler': ['opplever', 'erfarer', 'fornemmer', 'sanser'],

        // Overbrukte adjektiv (original + nye)
        'stor': ['betydelig', 'omfattende', 'vesentlig', 'markant'],
        'liten': ['beskjeden', 'ubetydelig', 'marginal', 'minimal'],
        'god': ['effektiv', 'vellykket', 'fordelaktig', 'gunstig'],
        'dårlig': ['uheldig', 'problematisk', 'utilstrekkelig', 'mangelfull'],
        'viktig': ['avgjørende', 'sentral', 'vesentlig', 'betydningsfull'],
        'mange': ['tallrike', 'en rekke', 'adskillige', 'et betydelig antall'],
        'mye': ['i stor grad', 'betraktelig', 'i vesentlig grad'],
        'ny': ['moderne', 'innovativ', 'nyskapende', 'fersk'],
        'gammel': ['eldre', 'aldrende', 'fortidig', 'utdatert', 'tradisjonell'],
        'ung': ['ungdommelig', 'uerfarent', 'tidlig i livet', 'ny'],
        'lang': ['utstrakt', 'langvarig', 'omfattende', 'vidtrekkende'],
        'kort': ['kortvarig', 'knapp', 'kortfattet', 'begrenset'],
        'fin': ['elegant', 'pen', 'tiltalende', 'utsøkt'],
        'rar': ['merkelig', 'underlig', 'eiendommelig', 'besynderlig'],
        'lik': ['tilsvarende', 'lignende', 'analog', 'sammenfallende'],
        'ulik': ['forskjellig', 'avvikende', 'uensartet', 'varierende'],
        'hard': ['streng', 'rigid', 'kompromissløs', 'krevende'],
        'lett': ['enkel', 'uanstrengt', 'overkommelig', 'ukomplisert'],
        'tung': ['krevende', 'belastende', 'byrdefull', 'møysommelig'],
        'rask': ['hurtig', 'snarlig', 'effektiv', 'kjapp'],
        'treg': ['langsom', 'sendrektig', 'tunggrodd', 'saktegående'],
        'sterk': ['kraftig', 'robust', 'intens', 'formidabel'],
        'svak': ['skjør', 'sårbar', 'begrenset', 'utydelig'],

        // Overbrukte adverb/bindeord (original + nye)
        'også': ['i tillegg', 'dessuten', 'videre', 'likeledes'],
        'derfor': ['følgelig', 'som en konsekvens', 'av den grunn', 'dermed'],
        'men': ['imidlertid', 'likevel', 'derimot', 'til tross for dette'],
        'fordi': ['ettersom', 'siden', 'på grunn av at', 'da'],
        'egentlig': ['i bunn og grunn', 'strengt tatt', 'i realiteten', 'i grunnen'],
        'selvfølgelig': ['naturligvis', 'åpenbart', 'utvilsomt', 'selvsagt'],
        'faktisk': ['i virkeligheten', 'rent faktisk', 'i praksis', 'sannelig'],
        'absolutt': ['fullstendig', 'helt klart', 'definitivt', 'utvilsomt'],
        'alltid': ['til enhver tid', 'gjennomgående', 'konsekvent', 'uavbrutt'],
        'aldri': ['ikke på noe tidspunkt', 'under ingen omstendighet', 'på ingen måte'],
        'kanskje': ['muligens', 'trolig', 'antakelig', 'det er tenkelig at'],
        'sikkert': ['utvilsomt', 'med stor sannsynlighet', 'trolig', 'antagelig'],
        'plutselig': ['brått', 'uventet', 'med ett', 'uten forvarsel'],
    },

    // ─────────────────────────────────────────────────────────────────────
    // US — Ungdomsskole: enklere, mer konkrete alternativer
    // ─────────────────────────────────────────────────────────────────────
    us: {
        // Narrative ord elever overbruker
        'kul': ['imponerende', 'stilig', 'fascinerende', 'tøff', 'interessant'],
        'skummel': ['uhyggelig', 'skremmende', 'urovekkende', 'fryktinngytende'],
        'morsom': ['underholdende', 'komisk', 'festlig', 'lattervekkende'],
        'gøy': ['underholdende', 'morsomt', 'spennende', 'engasjerende'],
        'trist': ['sørgelig', 'vemodig', 'nedslående', 'bedrøvelig'],
        'sint': ['rasende', 'opprørt', 'irritert', 'forbannet', 'frustrert'],
        'glad': ['fornøyd', 'lykkelig', 'begeistret', 'tilfreds', 'henrykt'],
        'redd': ['engstelig', 'urolig', 'forskrekket', 'livredd', 'nervøs'],
        'lei': ['lei av', 'trøtt av', 'mett av', 'utålmodig'],
        'dum': ['uklok', 'tankeløs', 'uoverveid', 'lite gjennomtenkt'],
        'smart': ['klok', 'skarpsindig', 'oppvakt', 'kvikk'],
        'flink': ['dyktig', 'kompetent', 'talentfull', 'begavet'],
        'drit': ['svært', 'ekstremt', 'veldig', 'uhyre'],

        // Uformelle verb de lener seg på
        'fikse': ['ordne', 'reparere', 'løse', 'rette opp'],
        'sjekke': ['undersøke', 'kontrollere', 'se etter', 'finne ut av'],
        'chille': ['slappe av', 'hvile', 'ta det rolig', 'koble av'],
        'henge': ['oppholde seg', 'tilbringe tid', 'slå seg ned', 'være sammen'],
        'drite': ['gjøre bort seg', 'feile', 'mislykkes', 'klusse til'],
        'stresse': ['bekymre seg', 'haste', 'forhaste seg', 'jage'],
        'digge': ['like', 'sette pris på', 'beundre', 'nyte'],
        'hate': ['mislike sterkt', 'avsky', 'ikke tåle', 'forakte'],

        // Enkle koblinger de gjentar
        'så': ['deretter', 'etterpå', 'i neste øyeblikk', 'etter det'],
        'da': ['i det øyeblikket', 'akkurat da', 'på det tidspunktet', 'nettopp da'],
        'og så': ['deretter', 'i tillegg', 'videre', 'dessuten'],
        'etterpå': ['i etterkant', 'senere', 'deretter', 'i neste omgang'],
        'til slutt': ['avslutningsvis', 'omsider', 'etter hvert', 'til sist'],
        'liksom': ['på en måte', 'nærmest', 'så å si', 'nesten som'],
        'typ': ['omtrent', 'en slags', 'nærmest', 'liksom'],
        'bare': ['kun', 'utelukkende', 'simpelthen', 'rett og slett'],
        'veldig': ['svært', 'ytterst', 'i høy grad', 'usedvanlig'],
        'skikkelig': ['ordentlig', 'svært', 'grundig', 'virkelig'],
    },

    // ─────────────────────────────────────────────────────────────────────
    // VGS — Videregående: akademisk register, litterær analyse, drøfting
    // ─────────────────────────────────────────────────────────────────────
    vgs: {
        // Akademiske verb
        'problematisere': ['stille spørsmål ved', 'utfordre', 'sette under debatt', 'drøfte kritisk'],
        'kontekstualisere': ['sette i sammenheng', 'ramme inn', 'plassere historisk', 'forankre'],
        'nyansere': ['moderere', 'nyskape forståelsen', 'tilføre perspektiv', 'balansere'],
        'underbygge': ['dokumentere', 'støtte opp om', 'belegge', 'forsterke'],
        'utdype': ['gå i dybden på', 'analysere nærmere', 'fordype seg i', 'utbrodere'],
        'belyse': ['kaste lys over', 'klargjøre', 'tydeliggjøre', 'synliggjøre'],
        'aktualisere': ['gjøre relevant', 'knytte til nåtiden', 'relatere til samtiden'],
        'fremheve': ['understreke', 'betone', 'markere', 'løfte fram'],
        'konkretisere': ['eksemplifisere', 'gi konkret form', 'spesifisere', 'tydeliggjøre'],
        'eksemplifisere': ['illustrere med eksempler', 'vise gjennom eksempel', 'gi belegg for'],
        'påpeke': ['gjøre oppmerksom på', 'fremheve', 'konstatere', 'peke på'],
        'påvirke': ['influere', 'forme', 'innvirke på', 'prege', 'ha effekt på'],
        'formidle': ['viderebringe', 'kommunisere', 'overføre', 'dele'],

        // Litterær analyse
        'symbolisere': ['representere', 'stå som bilde på', 'være et uttrykk for', 'peke mot'],
        'gjenspeile': ['avspeile', 'reflektere', 'speile', 'gi uttrykk for'],
        'fremstille': ['skildre', 'presentere', 'portrettere', 'tegne et bilde av'],
        'skildrer': ['beskriver', 'framstiller', 'gir et bilde av', 'portretterer'],
        'antyder': ['hintar om', 'gir inntrykk av', 'peker i retning av', 'impliserer'],
        'impliserer': ['antyder', 'innebærer', 'forutsetter', 'gir uttrykk for'],
        'konnoterer': ['gir assosiasjoner til', 'bærer med seg betydningen', 'peker mot'],
        'illustrerer': ['belyser', 'tydeliggjør', 'viser', 'eksemplifiserer'],
        'understreker': ['forsterker', 'betoner', 'framhever', 'markerer'],
        'kontrasterer': ['stiller opp mot', 'setter i motsetning til', 'motvirker'],
        'forsterker': ['intensiverer', 'fremhever', 'bygger opp under', 'understreker'],

        // Argumentasjon og drøfting
        'presisere': ['klargjøre', 'tydeliggjøre', 'spesifisere', 'avgrense'],
        'avgrense': ['begrense', 'snevre inn', 'definere rammene for', 'sette grenser for'],
        'definere': ['fastsette', 'bestemme', 'klargjøre innholdet i', 'avgrense betydningen av'],
        'klassifisere': ['kategorisere', 'gruppere', 'ordne', 'sortere'],
        'sammenligne': ['sidestille', 'sette opp mot hverandre', 'holde sammen', 'parallellføre'],
        'kontrastere': ['stille i motsetning', 'sette opp mot', 'peke på ulikheter mellom'],
        'evaluere': ['vurdere', 'bedømme', 'ta stilling til', 'verdsette'],
        'vurdere': ['evaluere', 'bedømme', 'drøfte', 'veie for og imot'],
        'begrunne': ['argumentere for', 'forklare grunnlaget for', 'rettferdiggjøre', 'gi belegg for'],
        'drøfte': ['diskutere', 'belyse fra flere sider', 'analysere', 'veie argumenter'],
        'analysere': ['undersøke', 'granske', 'dissekere', 'bryte ned'],
        'tolke': ['fortolke', 'tyde', 'lese', 'gi mening til', 'forstå som'],
        'reflektere': ['tenke over', 'betrakte', 'dvele ved', 'overveie'],
        'konkludere': ['oppsummere', 'trekke slutning', 'fastslå', 'slå fast'],

        // Akademiske adjektiv
        'relevant': ['aktuell', 'vesentlig', 'treffende', 'anvendelig'],
        'kompleks': ['sammensatt', 'flersidig', 'innfløkt', 'mangefasettert'],
        'tydelig': ['åpenbar', 'klar', 'uomtvistelig', 'iøynefallende'],
        'sentral': ['grunnleggende', 'kjernerelatert', 'overordnet', 'nøkkel-'],
        'omfattende': ['vidtrekkende', 'bred', 'gjennomgripende', 'helhetlig'],
        'kritisk': ['avgjørende', 'problematiserende', 'undersøkende', 'granskende'],
        'overordnet': ['helhetlig', 'overgripende', 'hovedsakelig', 'styrende'],
        'grunnleggende': ['fundamental', 'prinsipiell', 'essensiell', 'basal'],
    },
};

/**
 * Norwegian stop words — excluded from frequency analysis.
 * Common function words that appear often but carry no content meaning.
 */
export const stopwords = new Set([
    // Artikler/determinativer
    'en', 'ei', 'et', 'den', 'det', 'de',
    // Pronomen
    'jeg', 'du', 'han', 'hun', 'vi', 'dere', 'dem', 'seg', 'sin', 'sitt', 'sine',
    'meg', 'deg', 'oss', 'denne', 'dette', 'disse', 'min', 'mitt', 'mine', 'din', 'ditt', 'dine',
    'vår', 'vårt', 'våre', 'hans', 'hennes', 'deres',
    // Preposisjoner
    'i', 'på', 'til', 'for', 'med', 'av', 'om', 'fra', 'ved', 'over', 'under',
    'etter', 'mellom', 'mot', 'gjennom', 'blant', 'hos', 'uten', 'innen',
    // Konjunksjoner
    'og', 'eller', 'men', 'for', 'så', 'at', 'da', 'når', 'hvis', 'fordi',
    'siden', 'selv', 'om', 'enn', 'som', 'der', 'her', 'hvor',
    // Hjelpeverb
    'er', 'var', 'har', 'hadde', 'vil', 'ville', 'skal', 'skulle', 'kan', 'kunne',
    'må', 'måtte', 'bør', 'burde', 'blir', 'ble', 'blitt', 'vært', 'være',
    'ha', 'få', 'fikk', 'fått',
    // Andre vanlige
    'ikke', 'ingen', 'noe', 'noen', 'alt', 'alle', 'mange', 'mer', 'mest',
    'hva', 'hvem', 'hvilken', 'hvilket', 'hvilke',
    'også', 'bare', 'helt', 'slik', 'sånn', 'veldig', 'ganske',
    'jo', 'ja', 'nei', 'nå', 'da', 'her', 'der', 'dit',
]);

/**
 * Simple Norwegian stemmer — strips common suffixes to group word forms.
 * Not linguistically perfect, but good enough for frequency grouping.
 * @param {string} word - Lowercase word
 * @returns {string} Stemmed form
 */
export function stem(word) {
    if (word.length < 4) return word;

    // Strip common endings, longest first
    const suffixes = [
        'erende', 'elsen', 'inger', 'inger',
        'ene', 'ene', 'ert', 'ing', 'het', 'lig', 'isk',
        'er', 'en', 'et', 'te', 'de', 'ar', 'ne',
        'e', 's',
    ];
    for (const suf of suffixes) {
        if (word.length > suf.length + 2 && word.endsWith(suf)) {
            return word.slice(0, -suf.length);
        }
    }
    return word;
}
