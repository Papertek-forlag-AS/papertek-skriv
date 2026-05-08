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
 *     term: 'vår' | 'høst',
 *     part: string,              // e.g. 'Del 2 – Skriftlig produksjon'
 *     title: string,
 *     prompt: string,            // task text; \n\n separates paragraphs
 *     image: null | (() => Promise<{ default: string }>),  // lazy SVG import
 *     modelAnswer: string,       // simple-Norwegian draft, ~80–150 words
 *     attribution: string,       // e.g. 'Udir, Tysk 1, vår 2023'
 *   }
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
            modelAnswer: 'Min favorittfest er bursdagen min. Jeg pleier å feire den hjemme sammen med familien og noen gode venner. Vi pynter stua med ballonger og lager mye god mat. Det viktigste på bordet er kake — moren min lager alltid en sjokoladekake til meg. Vi spiser også pizza og drikker brus. Etter middagen åpner jeg gavene mine, og så pleier vi å spille brettspill eller se en film sammen. Jeg liker bursdagen min fordi alle de viktigste menneskene i livet mitt er samlet på ett sted.',
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
            modelAnswer: 'En vanlig dag i byen min starter ganske rolig. Folk drar på jobb eller skole, og bussene er fulle om morgenen. På ettermiddagen blir gatene mer livlige. Jeg pleier å møte vennene mine på en kafé i sentrum. Der drikker vi kaffe og snakker om alt mulig. I byen finnes det mange små restauranter med god mat — særlig pizza og sushi er populært blant ungdom. Hvis været er fint, går vi en tur i parken etterpå. Om kvelden kan man se en film på kinoen eller bare slappe av hjemme.',
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
            modelAnswer: 'Klassen min planlegger en tur til Berlin neste vår. Vi skal reise med fly fra Oslo, og det tar omtrent to timer. I Berlin skal vi bo på et ungdomsherberge i sentrum, slik at det er enkelt å komme seg rundt. På programmet står flere kjente steder. Vi vil besøke Brandenburger Tor og se restene av Berlinmuren. En hel dag skal brukes på museer, særlig Pergamonmuseet. På kvelden ønsker vi å spise tysk mat på en vanlig restaurant. Læreren har også planlagt en tur til en park, slik at vi kan slappe av før vi reiser hjem.',
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
            modelAnswer: 'Den beste vennen min heter Lukas. Han er like gammel som meg og bor i nabolaget. Han er ganske høy, har mørkt hår og brune øyne. Lukas er alltid blid og tar vare på dem rundt seg. Vi har kjent hverandre siden barneskolen og gjør mye sammen. Vi spiller fotball på det samme laget, og om vinteren går vi ofte på ski. Hjemme hos ham pleier vi å se filmer og spille TV-spill. Vi kommer godt overens fordi vi er ærlige med hverandre og har den samme humoren. Det er godt å ha en venn man kan stole på.',
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
            modelAnswer: 'Skoledagen min begynner klokken halv ni og slutter rundt halv tre. Vi har vanligvis seks timer hver dag, og imellom er det korte pauser. Yndlingsfaget mitt er historie, fordi læreren vår forteller spennende historier. Jeg liker også engelsk og kroppsøving. Matematikk synes jeg er litt vanskelig, men det går greit. Etter skolen pleier jeg å gjøre lekser først, slik at jeg har resten av kvelden fri. Tre dager i uken trener jeg fotball, og på fredager møter jeg vennene mine. Om kvelden hjelper jeg av og til til hjemme før jeg slapper av med en bok eller serie.',
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
            modelAnswer: 'Klimaet er en av de største utfordringene i vår tid, og alle kan bidra litt. Selv prøver jeg å sykle eller gå til skolen i stedet for å bli kjørt. Hjemme sorterer vi søppel, og vi prøver å kaste mindre mat. Jeg dusjer kortere og slår av lyset når jeg går ut av et rom. Unge mennesker har en viktig rolle. Vi kan velge brukte klær framfor nye, spise mindre kjøtt og bruke kollektivtransport. Vi kan også engasjere oss politisk og kreve at de som styrer tar klima på alvor. Små vaner i hverdagen blir til store endringer når mange gjør det samme.',
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
            modelAnswer: 'Sosiale medier er en stor del av livet til de fleste ungdommer. Det finnes både gode og dårlige sider ved dem. På den positive siden gjør de det enkelt å holde kontakt med venner og familie. Man kan dele bilder, se nyheter og lære nye ting hver dag. På den negative siden bruker mange altfor mye tid på telefonen. Det kan føre til dårlig søvn, mindre fysisk aktivitet og press fra perfekte bilder. Mobbing på nett er også et alvorlig problem. Selv mener jeg at sosiale medier er nyttige hvis man bruker dem med måte. Det viktigste er å være kritisk til det man ser og å huske at livet utenfor skjermen også er viktig.',
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
            modelAnswer: 'Sommeren da jeg var fjorten år, reiste jeg med familien min til Italia. Det var første gang jeg var ute av Norden, og alt virket annerledes — språket, lukten av byen, varmen. Vi bodde en uke i Roma og besøkte Colosseum og Vatikanet. Senere dro vi til en liten kystby der vi badet hver dag. Det som gjorde sterkest inntrykk på meg, var hvor vennlige folk var, selv om vi knapt snakket språket. Etter den turen begynte jeg å bli mer interessert i andre kulturer. Jeg leste mer, så filmer på originalspråket og fikk lyst til å lære flere språk. Reisen forandret hvordan jeg ser på verden og på mitt eget liv hjemme.',
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
            modelAnswer: 'Når jeg er ferdig på videregående, vil jeg ta et friår før jeg begynner å studere. I løpet av det året planlegger jeg å jobbe noen måneder for å spare penger, og deretter reise i Europa med tog. Jeg vil bruke tiden til å lære bedre tysk og spansk, kanskje gjennom et språkkurs i Berlin. Etter friåret håper jeg å studere medisin. Det er et tøft og langt studium, men jeg vil gjerne hjelpe mennesker, og jeg liker både biologi og kjemi. Hvis jeg ikke kommer inn på medisin med en gang, kan jeg studere noe annet innen helse i mellomtiden. Det viktigste for meg er å velge noe meningsfullt, ikke bare det som gir best lønn.',
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
            modelAnswer: 'Norge er i dag et flerkulturelt samfunn der mennesker fra mange land bor side om side. Det har klare fordeler. Vi får tilgang til ny mat, musikk og ideer, og barn vokser opp med venner som har ulike bakgrunner. Et mangfoldig samfunn er ofte mer kreativt og åpent. Samtidig finnes det utfordringer. Språk kan være en barriere, og noen opplever at de ikke blir helt en del av fellesskapet. Det kan også oppstå misforståelser når kulturer møtes. For at samfunnet skal fungere, må alle bidra. De som kommer hit, må lære seg språket og våre regler, mens vi som allerede bor her, må være åpne og inkluderende. Da kan ulikheter bli en styrke i stedet for et problem.',
            attribution: 'Udir, Tysk 2, høst 2024 (PoC-eksempel)',
        },
    ],
};

/**
 * Real Udir exam tasks (or Udir example exams). Prompts are quoted verbatim.
 * Model answers are teacher-authored simple-Norwegian drafts written with
 * German word order in mind (V2, short SVO sentences) so students can
 * translate sentence-by-sentence. Each task can also ship a `vocab` array
 * of [norwegian, german] pairs covering the trickier words; the spinner
 * shows them as chips, and the seeded document includes them as a
 * glossary so the student has the German equivalents at hand while writing.
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
            modelAnswer: 'Kjære tante,\n\nTusen takk for den hyggelige invitasjonen din. Det var snilt av deg å tenke på meg. Dessverre passer det ikke for meg å komme neste helg. På lørdag feirer jeg bursdagen til en god venn. På søndag drar jeg på tur med familien min. Jeg foreslår en annen helg i mai. Da kommer jeg gjerne på besøk en hel dag. Jeg gleder meg til å se deg snart.\n\nMange klemmer\n[ditt navn]',
            vocab: [
                ['kjære', 'liebe / lieber'],
                ['tante', 'Tante'],
                ['takk for', 'danke für'],
                ['invitasjonen', 'die Einladung'],
                ['snilt av deg', 'nett von dir'],
                ['dessverre', 'leider'],
                ['passer det ikke', 'es passt nicht'],
                ['neste helg', 'nächstes Wochenende'],
                ['lørdag', 'Samstag'],
                ['søndag', 'Sonntag'],
                ['feirer', 'feiere'],
                ['bursdagen', 'Geburtstag'],
                ['en god venn', 'ein guter Freund'],
                ['drar på tur', 'mache einen Ausflug'],
                ['familien min', 'meine Familie'],
                ['foreslår', 'schlage vor'],
                ['mai', 'Mai'],
                ['kommer på besøk', 'komme zu Besuch'],
                ['en hel dag', 'einen ganzen Tag'],
                ['gleder meg til', 'freue mich auf'],
                ['snart', 'bald'],
                ['mange klemmer', 'liebe Grüße'],
            ],
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
            modelAnswer: 'I sommer har jeg en jobb i en SPAR-butikk i bygda mi. Det er min første sommerjobb. Arbeidsoppgavene mine er enkle. Jeg fyller opp hyllene med nye varer. Jeg hjelper kundene som leter etter noe. Av og til sitter jeg i kassa. I dag har jeg jobbet i frukt- og grøntavdelingen. Jeg pakket ut bananer, epler og grønnsaker. Etterpå ryddet jeg tomme pappkasser i lageret. Jeg liker jobben fordi kollegaene mine er veldig hyggelige. Dagene går fort, men det er litt slitsomt å stå hele dagen. Jeg sykler til butikken hver morgen. Turen tar omtrent ti minutter hjemmefra. Jeg jobber tre dager i uken. Vaktene er fra klokken ni til halv fire. Jeg skal jobbe der hele juli og august. Jeg snakker mest med voksne kunder, og jeg har lært mange nye navn på varene. Etterpå har jeg tjent mine egne penger. Halvparten skal jeg spare, og resten bruker jeg på en ny sykkel.',
            vocab: [
                ['i sommer', 'diesen Sommer'],
                ['jobb', 'Job / Arbeit'],
                ['matbutikk', 'Lebensmittelgeschäft'],
                ['bygda mi', 'mein Dorf'],
                ['første sommerjobb', 'erster Sommerjob'],
                ['arbeidsoppgaver', 'Aufgaben'],
                ['enkle', 'einfach'],
                ['fyller opp', 'fülle … auf'],
                ['hyllene', 'die Regale'],
                ['varer', 'Waren'],
                ['hjelper kundene', 'helfe den Kunden'],
                ['leter etter', 'suchen nach'],
                ['av og til', 'manchmal'],
                ['sitter i kassa', 'sitze an der Kasse'],
                ['frukt- og grøntavdelingen', 'Obst- und Gemüseabteilung'],
                ['pakket ut', 'ausgepackt'],
                ['bananer, epler, grønnsaker', 'Bananen, Äpfel, Gemüse'],
                ['ryddet tomme pappkasser', 'räumte leere Kartons auf'],
                ['lageret', 'das Lager'],
                ['kollegaene mine', 'meine Kollegen'],
                ['hyggelige', 'nett'],
                ['dagene går fort', 'die Tage vergehen schnell'],
                ['slitsomt', 'anstrengend'],
                ['å stå hele dagen', 'den ganzen Tag zu stehen'],
                ['sykler', 'fahre mit dem Fahrrad'],
                ['turen tar … minutter', 'die Fahrt dauert … Minuten'],
                ['hjemmefra', 'von zu Hause'],
                ['tre dager i uken', 'drei Tage pro Woche'],
                ['vaktene', 'die Schichten'],
                ['fra … til …', 'von … bis …'],
                ['halv fire', 'halb vier (15:30)'],
                ['hele juli og august', 'den ganzen Juli und August'],
                ['voksne kunder', 'erwachsene Kunden'],
                ['har lært', 'habe gelernt'],
                ['navn på varene', 'Namen der Waren'],
                ['tjent egne penger', 'eigenes Geld verdient'],
                ['halvparten', 'die Hälfte'],
                ['skal jeg spare', 'werde ich sparen'],
                ['resten bruker jeg på', 'den Rest gebe ich aus für'],
                ['ny sykkel', 'ein neues Fahrrad'],
            ],
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
