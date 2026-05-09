/**
 * Task corpus for the German Spinner.
 *
 * Two corpora:
 *   - writingTasks: open-ended PoC writing prompts for everyday practice.
 *     Suitable for any student wanting to practice German writing.
 *   - examTasks: real Udir-style exam prompts (or Udir example exams) for
 *     students preparing for an actual eksamen.
 *
 * Same task shape in both:
 *   {
 *     id: string,                // stable; used as deck key
 *     year: number,
 *     term: 'vår' | 'høst' | 'eksempel',
 *     part: string,              // e.g. 'Del 2 – Skriftlig produksjon'
 *     title: string,
 *     prompt: string,            // task text; \n\n separates paragraphs
 *     image: null | (() => Promise<{ default: string }>),  // lazy SVG import
 *     modelAnswers: {
 *         simple: string,        // Tysk 1 grammar baseline:
 *                                // present tense, simple main clauses, no
 *                                // verb-final subordinate clauses, no Perfekt
 *                                // (Tysk 2 simple may use Perfekt + basic
 *                                //  weil/dass clauses since both are taught).
 *         rich: string,          // Translation-friendly draft that uses the
 *                                // full range of German structures the level
 *                                // supports (Perfekt, weil/dass, modal verbs,
 *                                // Komparativ/Superlativ, etc.).
 *     },
 *     attribution: string,       // e.g. 'Udir, Tysk 1, vår 2023'
 *   }
 *
 * Why two drafts: a Tysk 1 student who barely knows the grammar still needs
 * a model that's writable with what they've actually been taught. The
 * "simple" variant is calibrated to the Wir sprechen Deutsch 1 syllabus
 * (Präsens, modal verbs müssen/dürfen, Akk/Dat pronouns, reflexive verbs,
 * imperative, Komparativ/Superlativ; no Präteritum, no subordinate clauses).
 * The "rich" variant matches what a confident student would aim for.
 */

export const writingTasks = {
    'tysk-1': [
        {
            id: 'tysk1-seed-01',
            year: 2023,
            term: 'vår',
            part: 'Del 2 – Skriftlig produksjon',
            title: 'Mein Lieblingsfest',
            prompt: 'Schreibe einen Text über dein Lieblingsfest. Was wird gefeiert? Mit wem feierst du? Was isst und trinkt man? Schreibe ungefähr 100 Wörter.',
            image: () => import('./german-exam-svg/birthday.js'),
            modelAnswers: {
                simple: 'Min favorittfest er bursdagen min. Jeg feirer hjemme. Familien min er der. Noen venner kommer også. Vi pynter stua med ballonger. Vi lager mye god mat. På bordet er det en kake. Moren min lager en sjokoladekake. Vi spiser også pizza. Vi drikker brus. Etter middagen åpner jeg gavene mine. Så spiller vi brettspill. Av og til ser vi en film sammen. Jeg er glad i bursdagen min. Alle de viktigste menneskene mine er der.',
                rich: 'Min favorittfest er bursdagen min. Jeg pleier å feire den hjemme sammen med familien og noen gode venner. Vi pynter stua med ballonger og lager mye god mat. Det viktigste på bordet er kake — moren min lager alltid en sjokoladekake til meg. Vi spiser også pizza og drikker brus. Etter middagen åpner jeg gavene mine, og så pleier vi å spille brettspill eller se en film sammen. Jeg liker bursdagen min fordi alle de viktigste menneskene i livet mitt er samlet på ett sted.',
            },
            attribution: 'Udir, Tysk 1, vår 2023 (PoC-eksempel)',
        },
        {
            id: 'tysk1-seed-02',
            year: 2022,
            term: 'høst',
            part: 'Del 2 – Skriftlig produksjon',
            title: 'Ein Tag in deiner Stadt',
            prompt: 'Beschreibe einen typischen Tag in deiner Stadt. Was machen die Menschen? Wo triffst du deine Freunde? Was kann man dort essen und sehen?',
            image: () => import('./german-exam-svg/city.js'),
            modelAnswers: {
                simple: 'Byen min er ikke så stor. Om morgenen drar folk på jobb eller skole. Bussene er fulle. På ettermiddagen er gatene livlige. Jeg møter venner på en kafé i sentrum. Vi drikker kaffe. Vi snakker om alt mulig. I byen finnes mange små restauranter. Pizza og sushi er populært. I fint vær går vi en tur i parken. Om kvelden ser jeg ofte en film hjemme. Noen ganger drar jeg på kino.',
                rich: 'En vanlig dag i byen min starter ganske rolig. Folk drar på jobb eller skole, og bussene er fulle om morgenen. På ettermiddagen blir gatene mer livlige. Jeg pleier å møte vennene mine på en kafé i sentrum. Der drikker vi kaffe og snakker om alt mulig. I byen finnes det mange små restauranter med god mat — særlig pizza og sushi er populært blant ungdom. Hvis været er fint, går vi en tur i parken etterpå. Om kvelden kan man se en film på kinoen eller bare slappe av hjemme.',
            },
            attribution: 'Udir, Tysk 1, høst 2022 (PoC-eksempel)',
        },
        {
            id: 'tysk1-seed-03',
            year: 2024,
            term: 'vår',
            part: 'Del 2 – Skriftlig produksjon',
            title: 'Reiseplan',
            prompt: 'Du planst eine Reise mit deiner Klasse nach Berlin. Schreibe einen kurzen Plan: Was möchtet ihr sehen? Wo wohnt ihr? Wie kommt ihr dahin?',
            image: () => import('./german-exam-svg/berlin.js'),
            modelAnswers: {
                simple: 'Klassen min planlegger en tur til Berlin. Vi reiser med fly fra Oslo. Turen tar to timer. I Berlin bor vi på et ungdomsherberge i sentrum. Slik er det enkelt å komme seg rundt. På programmet står flere kjente steder. Vi besøker Brandenburger Tor. Vi ser på Berlinmuren. En hel dag er vi på Pergamonmuseet. Om kvelden spiser vi tysk mat på en restaurant. Læreren planlegger også en tur til en park. Da kan vi slappe av før vi reiser hjem.',
                rich: 'Klassen min planlegger en tur til Berlin neste vår. Vi skal reise med fly fra Oslo, og det tar omtrent to timer. I Berlin skal vi bo på et ungdomsherberge i sentrum, slik at det er enkelt å komme seg rundt. På programmet står flere kjente steder. Vi vil besøke Brandenburger Tor og se restene av Berlinmuren. En hel dag skal brukes på museer, særlig Pergamonmuseet. På kvelden ønsker vi å spise tysk mat på en vanlig restaurant. Læreren har også planlagt en tur til en park, slik at vi kan slappe av før vi reiser hjem.',
            },
            attribution: 'Udir, Tysk 1, vår 2024 (PoC-eksempel)',
        },
        {
            id: 'tysk1-seed-04',
            year: 2023,
            term: 'høst',
            part: 'Del 2 – Skriftlig produksjon',
            title: 'Mein bester Freund / meine beste Freundin',
            prompt: 'Erzähle über deinen besten Freund oder deine beste Freundin. Wie sieht er/sie aus? Was macht ihr zusammen? Warum mögt ihr euch?',
            image: () => import('./german-exam-svg/friends.js'),
            modelAnswers: {
                simple: 'Den beste vennen min heter Lukas. Han er like gammel som meg. Han bor i nabolaget mitt. Han er ganske høy. Han har mørkt hår og brune øyne. Lukas er alltid blid. Vi kjenner hverandre godt. Vi gjør mye sammen. Vi spiller fotball på det samme laget. Om vinteren går vi ofte på ski. Hjemme hos ham ser vi filmer. Vi spiller TV-spill. Vi har samme humor. Vi stoler på hverandre.',
                rich: 'Den beste vennen min heter Lukas. Han er like gammel som meg og bor i nabolaget. Han er ganske høy, har mørkt hår og brune øyne. Lukas er alltid blid og tar vare på dem rundt seg. Vi har kjent hverandre siden barneskolen og gjør mye sammen. Vi spiller fotball på det samme laget, og om vinteren går vi ofte på ski. Hjemme hos ham pleier vi å se filmer og spille TV-spill. Vi kommer godt overens fordi vi er ærlige med hverandre og har den samme humoren. Det er godt å ha en venn man kan stole på.',
            },
            attribution: 'Udir, Tysk 1, høst 2023 (PoC-eksempel)',
        },
        {
            id: 'tysk1-seed-05',
            year: 2024,
            term: 'høst',
            part: 'Del 2 – Skriftlig produksjon',
            title: 'Schule und Freizeit',
            prompt: 'Schreibe über deinen Schulalltag und deine Freizeit. Wann beginnt die Schule? Welche Fächer magst du? Was machst du nach der Schule?',
            image: () => import('./german-exam-svg/school.js'),
            modelAnswers: {
                simple: 'Skoledagen min begynner klokken halv ni. Den slutter rundt halv tre. Vi har seks timer hver dag. Imellom er det korte pauser. Yndlingsfaget mitt er historie. Læreren forteller spennende historier. Jeg liker også engelsk og kroppsøving. Matematikk er litt vanskelig. Etter skolen gjør jeg lekser. Tre dager i uken trener jeg fotball. På fredager møter jeg vennene mine. Om kvelden hjelper jeg av og til til hjemme. Av og til leser jeg en bok.',
                rich: 'Skoledagen min begynner klokken halv ni og slutter rundt halv tre. Vi har vanligvis seks timer hver dag, og imellom er det korte pauser. Yndlingsfaget mitt er historie, fordi læreren vår forteller spennende historier. Jeg liker også engelsk og kroppsøving. Matematikk synes jeg er litt vanskelig, men det går greit. Etter skolen pleier jeg å gjøre lekser først, slik at jeg har resten av kvelden fri. Tre dager i uken trener jeg fotball, og på fredager møter jeg vennene mine. Om kvelden hjelper jeg av og til til hjemme før jeg slapper av med en bok eller serie.',
            },
            attribution: 'Udir, Tysk 1, høst 2024 (PoC-eksempel)',
        },
    ],
    'tysk-2': [
        {
            id: 'tysk2-seed-01',
            year: 2023,
            term: 'vår',
            part: 'Del 2 – Skriftlig produksjon',
            title: 'Umweltschutz im Alltag',
            prompt: 'Wie kann man im Alltag die Umwelt schützen? Beschreibe konkrete Beispiele aus deinem eigenen Leben und diskutiere, was junge Menschen tun können.',
            image: () => import('./german-exam-svg/environment.js'),
            modelAnswers: {
                simple: 'Klima er viktig for alle. Hver dag kan jeg gjøre litt. Jeg sykler eller går til skolen. Foreldrene mine kjører meg ikke. Hjemme sorterer vi søppel. Vi kaster mindre mat. Jeg dusjer kortere. Jeg slår av lyset. Unge mennesker kan også gjøre mye. Vi velger brukte klær. Vi spiser mindre kjøtt. Vi tar bussen. Jeg engasjerer meg politisk. Politikerne må ta klima på alvor. Små vaner blir til store endringer.',
                rich: 'Klimaet er en av de største utfordringene i vår tid, og alle kan bidra litt. Selv prøver jeg å sykle eller gå til skolen i stedet for å bli kjørt. Hjemme sorterer vi søppel, og vi prøver å kaste mindre mat. Jeg dusjer kortere og slår av lyset når jeg går ut av et rom. Unge mennesker har en viktig rolle. Vi kan velge brukte klær framfor nye, spise mindre kjøtt og bruke kollektivtransport. Vi kan også engasjere oss politisk og kreve at de som styrer tar klima på alvor. Små vaner i hverdagen blir til store endringer når mange gjør det samme.',
            },
            attribution: 'Udir, Tysk 2, vår 2023 (PoC-eksempel)',
        },
        {
            id: 'tysk2-seed-02',
            year: 2022,
            term: 'høst',
            part: 'Del 2 – Skriftlig produksjon',
            title: 'Soziale Medien — Vor- und Nachteile',
            prompt: 'Soziale Medien sind ein wichtiger Teil im Leben vieler Jugendlichen. Schreibe einen Text, in dem du die Vor- und Nachteile diskutierst und deine eigene Meinung gibst.',
            image: () => import('./german-exam-svg/social-media.js'),
            modelAnswers: {
                simple: 'Sosiale medier er en del av livet. Det finnes gode og dårlige sider. Jeg holder kontakt med venner og familie. Jeg deler bilder. Jeg ser nyheter hver dag. Jeg lærer nye ting. Mange bruker for mye tid på telefonen. Det fører til dårlig søvn. Mange beveger seg lite. Bilder på nettet er ofte perfekte. Det er ikke virkeligheten. Mobbing på nett er et problem. Jeg synes sosiale medier er nyttige. Jeg bruker dem med måte.',
                rich: 'Sosiale medier er en stor del av livet til de fleste ungdommer. Det finnes både gode og dårlige sider ved dem. På den positive siden gjør de det enkelt å holde kontakt med venner og familie. Man kan dele bilder, se nyheter og lære nye ting hver dag. På den negative siden bruker mange altfor mye tid på telefonen. Det kan føre til dårlig søvn, mindre fysisk aktivitet og press fra perfekte bilder. Mobbing på nett er også et alvorlig problem. Selv mener jeg at sosiale medier er nyttige hvis man bruker dem med måte. Det viktigste er å være kritisk til det man ser og å huske at livet utenfor skjermen også er viktig.',
            },
            attribution: 'Udir, Tysk 2, høst 2022 (PoC-eksempel)',
        },
        {
            id: 'tysk2-seed-03',
            year: 2024,
            term: 'vår',
            part: 'Del 2 – Skriftlig produksjon',
            title: 'Eine Reise, die mich geprägt hat',
            prompt: 'Schreibe über eine Reise, die du nicht vergessen wirst. Wohin bist du gefahren? Was hast du erlebt? Wie hat dich die Reise verändert?',
            image: () => import('./german-exam-svg/journey.js'),
            modelAnswers: {
                simple: 'Jeg har vært i Italia med familien min. Det var sommeren da jeg var fjorten. Alt var nytt for meg. Språket var annerledes. Byen luktet annerledes. Det var veldig varmt. Vi har bodd en uke i Roma. Vi har sett Colosseum. Vi har vært i Vatikanet. Etter Roma har vi vært i en kystby. Vi har badet hver dag. Folk var vennlige. Reisen har endret meg. Nå vil jeg reise mer. Jeg vil lære flere språk.',
                rich: 'Sommeren da jeg var fjorten år, reiste jeg med familien min til Italia. Det var første gang jeg var ute av Norden, og alt virket annerledes — språket, lukten av byen, varmen. Vi bodde en uke i Roma og besøkte Colosseum og Vatikanet. Senere dro vi til en liten kystby der vi badet hver dag. Det som gjorde sterkest inntrykk på meg, var hvor vennlige folk var, selv om vi knapt snakket språket. Etter den turen begynte jeg å bli mer interessert i andre kulturer. Jeg leste mer, så filmer på originalspråket og fikk lyst til å lære flere språk. Reisen forandret hvordan jeg ser på verden og på mitt eget liv hjemme.',
            },
            attribution: 'Udir, Tysk 2, vår 2024 (PoC-eksempel)',
        },
        {
            id: 'tysk2-seed-04',
            year: 2023,
            term: 'høst',
            part: 'Del 2 – Skriftlig produksjon',
            title: 'Zukunftspläne nach der Schule',
            prompt: 'Was möchtest du nach der Schule machen? Studieren, arbeiten oder reisen? Beschreibe deine Pläne und begründe deine Wahl.',
            image: () => import('./german-exam-svg/future.js'),
            modelAnswers: {
                simple: 'Etter skolen vil jeg ta et friår. Jeg planlegger å jobbe noen måneder. Jeg vil spare penger. Etterpå vil jeg reise i Europa. Jeg reiser med tog. Jeg vil lære bedre tysk og spansk. Kanskje tar jeg et språkkurs i Berlin. Etter friåret vil jeg studere medisin. Det er et tøft studium. Jeg vil hjelpe mennesker. Jeg liker biologi og kjemi. Kanskje kommer jeg ikke inn med en gang. Da studerer jeg noe annet i helse. Det viktigste er meningsfylt arbeid.',
                rich: 'Når jeg er ferdig på videregående, vil jeg ta et friår før jeg begynner å studere. I løpet av det året planlegger jeg å jobbe noen måneder for å spare penger, og deretter reise i Europa med tog. Jeg vil bruke tiden til å lære bedre tysk og spansk, kanskje gjennom et språkkurs i Berlin. Etter friåret håper jeg å studere medisin. Det er et tøft og langt studium, men jeg vil gjerne hjelpe mennesker, og jeg liker både biologi og kjemi. Hvis jeg ikke kommer inn på medisin med en gang, kan jeg studere noe annet innen helse i mellomtiden. Det viktigste for meg er å velge noe meningsfullt, ikke bare det som gir best lønn.',
            },
            attribution: 'Udir, Tysk 2, høst 2023 (PoC-eksempel)',
        },
        {
            id: 'tysk2-seed-05',
            year: 2024,
            term: 'høst',
            part: 'Del 2 – Skriftlig produksjon',
            title: 'Multikulturelle Gesellschaft',
            prompt: 'Norwegen ist eine multikulturelle Gesellschaft. Schreibe einen Text, in dem du die Vorteile und Herausforderungen einer solchen Gesellschaft beschreibst.',
            image: () => import('./german-exam-svg/multicultural.js'),
            modelAnswers: {
                simple: 'Norge er et flerkulturelt samfunn. Mange mennesker fra ulike land bor her. Det har klare fordeler. Vi får ny mat og ny musikk. Barn vokser opp med ulike venner. Et mangfoldig samfunn er ofte mer åpent. Det finnes også utfordringer. Språk kan være en barriere. Noen er ikke en del av fellesskapet. Av og til oppstår misforståelser. Alle må bidra. Innvandrere må lære seg språket. Vi som bor her, må være åpne. Da blir ulikheter en styrke.',
                rich: 'Norge er i dag et flerkulturelt samfunn der mennesker fra mange land bor side om side. Det har klare fordeler. Vi får tilgang til ny mat, musikk og ideer, og barn vokser opp med venner som har ulike bakgrunner. Et mangfoldig samfunn er ofte mer kreativt og åpent. Samtidig finnes det utfordringer. Språk kan være en barriere, og noen opplever at de ikke blir helt en del av fellesskapet. Det kan også oppstå misforståelser når kulturer møtes. For at samfunnet skal fungere, må alle bidra. De som kommer hit, må lære seg språket og våre regler, mens vi som allerede bor her, må være åpne og inkluderende. Da kan ulikheter bli en styrke i stedet for et problem.',
            },
            attribution: 'Udir, Tysk 2, høst 2024 (PoC-eksempel)',
        },
    ],
};

/**
 * Real Udir exam tasks (or Udir example exams). Prompts are quoted verbatim.
 * Both modelAnswers variants are translation-friendly drafts written with
 * German word order in mind (V2, short SVO sentences) so students can
 * translate sentence-by-sentence.
 */
export const examTasks = {
    'tysk-1': [
        {
            id: 'tysk1-exam-2026-12',
            year: 2026,
            term: 'eksempel',
            part: 'Del 2 – Skriftlig produksjon',
            title: 'Oppgave 12: Melding til tanten',
            prompt: 'I denne oppgaven skal du skrive en melding på 60–80 ord.\n\nDu har fått en melding fra tanten din der hun foreslår at du tilbringer neste helg hjemme hos henne. Du har ikke noe lyst til det, og dessuten har du andre planer allerede.\n\nSkriv et svar på meldingen fra tanten din der du\n- avslår invitasjonen hennes på en hyggelig måte\n- skriver hvilke planer du allerede har for neste helg\n- lover å besøke henne på et annet tidspunkt',
            image: null,
            modelAnswers: {
                simple: 'Kjære tante,\n\ntusen takk for den hyggelige invitasjonen din. Det var snilt av deg å tenke på meg. Dessverre passer det ikke for meg. Neste lørdag har en god venn bursdag. På søndag drar jeg på tur med familien min. Jeg foreslår en annen helg i mai. Da kommer jeg gjerne på besøk en hel dag. Jeg gleder meg til å se deg snart.\n\nMange klemmer\n[ditt navn]',
                rich: 'Kjære tante,\n\nTusen takk for den hyggelige invitasjonen din. Det var snilt av deg å tenke på meg. Dessverre passer det ikke for meg å komme neste helg. På lørdag feirer jeg bursdagen til en god venn. På søndag drar jeg på tur med familien min. Jeg foreslår en annen helg i mai. Da kommer jeg gjerne på besøk en hel dag. Jeg gleder meg til å se deg snart.\n\nMange klemmer\n[ditt navn]',
            },
            attribution: 'Udir, Tysk 1, eksempeloppgave 2026',
        },
        {
            id: 'tysk1-exam-2026-13',
            year: 2026,
            term: 'eksempel',
            part: 'Del 2 – Skriftlig produksjon',
            title: 'Oppgave 13: Sommerjobb',
            prompt: 'I denne oppgaven skal du skrive en tekst på 140–160 ord.\n\nDu har nettopp begynt i en sommerjobb på et av disse stedene: SPAR (matbutikk), Petshop (kjæledyrbutikk), Regent Sport (sportsbutikk) eller Wiik Gård (gårdsbruk).\n\nSkriv en tekst der du forteller\n- hvor du jobber\n- hvilke arbeidsoppgaver du har\n- hva du har gjort på jobben i dag\n- om du liker jobben eller ikke, og hvorfor\n- hvordan du kommer deg til jobben\n- når du jobber, og hvor lenge du skal jobbe der',
            image: () => import('./german-exam-svg/summer-job.js'),
            modelAnswers: {
                simple: 'I sommer jobber jeg i en SPAR-butikk. Det er min første sommerjobb. Arbeidsoppgavene mine er enkle. Jeg fyller opp hyllene med varer. Jeg hjelper kundene. Av og til sitter jeg i kassa. I dag jobber jeg i frukt- og grøntavdelingen. Jeg pakker ut bananer, epler og grønnsaker. Etterpå rydder jeg tomme pappkasser i lageret. Jeg liker jobben. Kollegaene mine er hyggelige. Dagene går fort. Det er litt slitsomt å stå hele dagen. Jeg sykler til butikken hver morgen. Turen tar ti minutter hjemmefra. Jeg jobber tre dager i uken. Vaktene er fra klokken ni til halv fire. Jeg jobber der hele juli og august. Jeg snakker mest med voksne kunder. Jeg lærer mange nye navn på varene. Halvparten av pengene sparer jeg. Resten bruker jeg på en ny sykkel.',
                rich: 'I sommer har jeg en jobb i en SPAR-butikk i bygda mi. Det er min første sommerjobb. Arbeidsoppgavene mine er enkle. Jeg fyller opp hyllene med nye varer. Jeg hjelper kundene som leter etter noe. Av og til sitter jeg i kassa. I dag har jeg jobbet i frukt- og grøntavdelingen. Jeg pakket ut bananer, epler og grønnsaker. Etterpå ryddet jeg tomme pappkasser i lageret. Jeg liker jobben fordi kollegaene mine er veldig hyggelige. Dagene går fort, men det er litt slitsomt å stå hele dagen. Jeg sykler til butikken hver morgen. Turen tar omtrent ti minutter hjemmefra. Jeg jobber tre dager i uken. Vaktene er fra klokken ni til halv fire. Jeg skal jobbe der hele juli og august. Jeg snakker mest med voksne kunder, og jeg har lært mange nye navn på varene. Halvparten skal jeg spare, og resten bruker jeg på en ny sykkel.',
            },
            attribution: 'Udir, Tysk 1, eksempeloppgave 2026',
        },
    ],
    'tysk-2': [],
};

/**
 * Backward-compatible alias. Older callers that imported `tasks` get the
 * writing corpus by default.
 */
export const tasks = writingTasks;

/**
 * Convenience: list of valid level + mode keys.
 */
export const LEVELS = ['tysk-1', 'tysk-2'];
export const MODES = ['writing', 'exam'];
