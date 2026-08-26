/**
 * Word bank for the Writing Spinner — English (en).
 *
 * Used when the pupil writes in English (the English subject exists at
 * every school level). Bucket keys are intentionally kept identical to
 * the Norwegian data files (innledning, hoveddel, ...) — they are
 * internal ids referenced by the `spinner:` tags in frames/en/*.md.
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
    // ANALYSE — literary/text analysis
    // ─────────────────────────────────────────────────────────────────────────
    analyse: {
        us: {
            innledning: [
                'In this text I am going to analyse...',
                'The text I am going to look at is...',
                'The author writes about...',
                'This text is about...',
                'I am going to examine how the author...',
            ],
            hoveddel: [
                'The text is structured so that...',
                'The author starts by...',
                'Later in the text we see that...',
                'The main character is described as...',
            ],
            verkemiddel: [
                'One device the author uses is...',
                'A good example of this is when...',
                'The author uses... to show that...',
                'This makes the reader feel...',
            ],
            tolkning: [
                'I think the text is really about...',
                'An important theme in the text is...',
                'This shows us that...',
                'The author probably wants to say that...',
            ],
            avslutning: [
                'To sum up, the text shows that...',
                'The most important thing I found was...',
                'After analysing the text, I think that...',
            ],
        },
        vgs: {
            innledning: [
                'This analysis examines...',
                'In the following, I will analyse... with emphasis on...',
                'The text was published in... and addresses...',
                'A striking feature of the text is...',
            ],
            hoveddel: [
                'The composition of the text is characterised by...',
                'The narrative perspective shifts when...',
                'Structurally, the text moves from... to...',
                'A closer reading reveals that...',
            ],
            verkemiddel: [
                'A central literary device is..., as seen in...',
                'The recurring imagery of... reinforces...',
                'The contrast between... and... serves to...',
                'The effect of this device is to...',
            ],
            tolkning: [
                'My interpretation is that the text explores...',
                'This can be read as a comment on...',
                'On a deeper level, the text deals with...',
                'This reading is supported by the fact that...',
            ],
            avslutning: [
                'In conclusion, the analysis shows that...',
                'Taken together, these findings suggest that...',
                'The continued relevance of the text lies in...',
            ],
        },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // DRØFTING — discussion essay
    // ─────────────────────────────────────────────────────────────────────────
    droefting: {
        us: {
            innledning: [
                'In this text I am going to discuss...',
                'An important question today is...',
                'Many people disagree about...',
                'This essay looks at both sides of...',
            ],
            argument: [
                'One important argument in favour is that...',
                'Those who support this often say that...',
                'A good reason for this is...',
                'Firstly, ...',
            ],
            motargument: [
                'On the other hand, some people think that...',
                'Not everyone agrees, because...',
                'An argument against this is that...',
                'However, ...',
            ],
            eksempel: [
                'For example, ...',
                'We can see this when...',
                'A good example of this is...',
                'Research shows that...',
            ],
            overgang: [
                'This means that...',
                'Because of this, ...',
                'Another side of the issue is...',
                'This leads to the question of...',
            ],
            avslutning: [
                'After looking at both sides, I think that...',
                'To sum up, ...',
                'My conclusion is that...',
            ],
            kilde: [
                'According to...',
                'As stated in...',
                'The article... says that...',
            ],
        },
        vgs: {
            innledning: [
                'A central question of our time is...',
                'There is growing debate about whether...',
                'This essay will discuss the extent to which...',
                'The issue of... raises several difficult questions.',
            ],
            argument: [
                'The strongest argument in favour is that...',
                'Proponents point out that...',
                'It can be argued that...',
                'A further point in favour is that...',
            ],
            motargument: [
                'Critics, however, argue that...',
                'This view can be challenged on the grounds that...',
                'A significant objection is that...',
                'Conversely, it could be claimed that...',
            ],
            eksempel: [
                'This is illustrated by...',
                'A case in point is...',
                'Empirical evidence suggests that...',
                'Recent studies have shown that...',
            ],
            overgang: [
                'This raises the question of whether...',
                'It follows from this that...',
                'Turning to the opposing view, ...',
                'Weighing these considerations against each other, ...',
            ],
            avslutning: [
                'Having considered both sides of the issue, I conclude that...',
                'On balance, the arguments suggest that...',
                'In conclusion, while... it seems clear that...',
            ],
            kilde: [
                'According to..., ...',
                'As... argues in...,',
                'Figures from... indicate that...',
            ],
        },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // FAGARTIKKEL — academic/subject article
    // ─────────────────────────────────────────────────────────────────────────
    fagartikkel: {
        us: {
            innledning: [
                'In this article I am going to look at...',
                'This topic matters because...',
                'Have you ever wondered why...',
            ],
            fakta: [
                'One key fact is that...',
                'Numbers show that...',
                'We know that...',
                'An important finding is that...',
            ],
            forklaring: [
                'This means that...',
                'To understand this, we first need to know that...',
                'One possible explanation is that...',
                'In other words, ...',
            ],
            overgang: [
                'Another important point is...',
                'This brings us to...',
                'Next, let us look at...',
            ],
            avslutning: [
                'To sum up, this article has shown that...',
                'The most important thing to take away is...',
                'In the future it will be interesting to see...',
            ],
            kilde: [
                'According to...',
                'The source... states that...',
            ],
        },
        vgs: {
            innledning: [
                'This article examines...',
                'The topic is highly relevant because...',
                'The central question addressed here is...',
            ],
            fakta: [
                'A key finding is that...',
                'Figures from the study show that...',
                'The data indicate that...',
                'Several sources confirm that...',
            ],
            forklaring: [
                'This can be explained by...',
                'A central concept in this context is...',
                'According to established theory, ...',
                'This suggests a connection between... and...',
            ],
            overgang: [
                'Building on this, ...',
                'This finding leads to the further question of...',
                'Having established..., we can now turn to...',
            ],
            avslutning: [
                'In summary, this review shows that...',
                'The findings point to the conclusion that...',
                'For future research, it could be fruitful to...',
            ],
            kilde: [
                'According to..., ...',
                'As documented in..., ...',
                'Research by... indicates that...',
            ],
        },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // KRONIKK — opinion piece / op-ed
    // ─────────────────────────────────────────────────────────────────────────
    kronikk: {
        us: {
            innledning: [
                'Recently we learned that...',
                'It is time to talk about...',
                'In this text I will argue that...',
            ],
            pastand: [
                'I believe that...',
                'The truth is that...',
                'We can no longer accept that...',
            ],
            argument: [
                'The most important argument is that...',
                'A good example of this is...',
                'This can be backed up by...',
            ],
            motargument: [
                'Some might say that...',
                'Still, I believe that..., because...',
                'That argument does not hold, because...',
            ],
            appell: [
                'Think about what would happen if...',
                'We all have a responsibility to...',
                'Imagine a future where...',
            ],
            avslutning: [
                'All in all, this shows that...',
                'That is why I believe we must...',
                'The time to act is now.',
            ],
        },
        vgs: {
            innledning: [
                'Recent developments have made it clear that...',
                'In this piece I will argue that...',
                'The debate about... has so far missed a crucial point:',
            ],
            pastand: [
                'My claim is simple:...',
                'The evidence points in one direction:...',
                'It is a paradox that...',
            ],
            argument: [
                'The principal argument is that...',
                'This is supported by the fact that...',
                'Furthermore, it is worth noting that...',
            ],
            motargument: [
                'Sceptics will no doubt object that...',
                'While this objection deserves attention, it overlooks...',
                'Nevertheless, the argument fails because...',
            ],
            appell: [
                'The consequences of inaction are clear:...',
                'We owe it to the next generation to...',
                'If we truly care about..., we must...',
            ],
            avslutning: [
                'Taken together, these arguments show that...',
                'The conclusion is inescapable:...',
                'That is why we must act — and act now.',
            ],
        },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // KÅSERI — humorous essay
    // ─────────────────────────────────────────────────────────────────────────
    kaaseri: {
        us: {
            innledning: [
                'It was a perfectly ordinary Tuesday when it struck me that...',
                'Have you ever noticed that...',
                'There is something strange about...',
            ],
            digresjon: [
                'That reminds me of the time when...',
                'Speaking of which...',
                'I especially remember the time when...',
            ],
            ironi: [
                'The irony, of course, is that...',
                'Naturally, that was exactly when...',
                'Because that is just how life works, isn’t it?',
            ],
            poeng: [
                'But really, this is about something much bigger...',
                'When you think about it, perhaps it is not so strange that...',
                'And that is when it hit me:...',
            ],
            avslutning: [
                'And the moral? Perhaps it is simply that...',
                'Next time, I will certainly...',
                'Until then, I will keep...',
            ],
        },
        vgs: {
            innledning: [
                'It was a perfectly ordinary Tuesday when it struck me that...',
                'Have you ever noticed how... always happens precisely when...',
                'Allow me to make a confession:...',
            ],
            digresjon: [
                'Which, incidentally, brings me to...',
                'A brief digression: the other day I...',
                'This is, of course, the same phenomenon as...',
            ],
            ironi: [
                'The irony is exquisite:...',
                'We say we want..., yet we spend our days...',
                'Naturally, the universe chose that exact moment to...',
            ],
            poeng: [
                'Beneath the absurdity lies a serious point:...',
                'Strip away the comedy, and what remains is...',
                'Perhaps this small ritual reveals something larger about us:...',
            ],
            avslutning: [
                'And the moral? Perhaps simply that...',
                'So the next time you catch yourself..., remember:...',
                'As for me, I have made my peace with...',
            ],
        },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // LESERINNLEGG — letter to the editor
    // ─────────────────────────────────────────────────────────────────────────
    leserinnlegg: {
        us: {
            innledning: [
                'I strongly object to...',
                'It is about time someone spoke up about...',
                'I am writing because...',
            ],
            pastand: [
                'This is simply not good enough.',
                'I believe that...',
                'The situation is unacceptable because...',
            ],
            argument: [
                'The most important point is that...',
                'A good example of this is...',
                'In addition, we can see that...',
            ],
            oppfordring: [
                'I urge everyone to...',
                'Something has to be done about...',
                'The politicians must...',
            ],
            avslutning: [
                'That is why I demand that...',
                'It is high time we...',
                'I hope those responsible are listening.',
            ],
        },
        vgs: {
            innledning: [
                'I read with growing disbelief that...',
                'The recent decision to... calls for a response.',
                'It is high time someone addressed...',
            ],
            pastand: [
                'The plain fact is that...',
                'This policy fails those it claims to serve.',
                'The current approach is both unfair and short-sighted.',
            ],
            argument: [
                'The core of the problem is that...',
                'The figures speak for themselves:...',
                'Moreover, it is worth remembering that...',
            ],
            oppfordring: [
                'I call on the council to...',
                'Those responsible must now...',
                'Readers who share my concern should...',
            ],
            avslutning: [
                'Anything less would be a failure of responsibility.',
                'The time for empty promises is over.',
                'I expect better — and so should you.',
            ],
        },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // NOVELLE — short story
    // ─────────────────────────────────────────────────────────────────────────
    novelle: {
        us: {
            aapning: [
                'It all began the day...',
                'She stood by the window, looking out at...',
                'The letter arrived on a Thursday.',
            ],
            skildring: [
                'The room smelled of...',
                'Outside, the rain...',
                'His hands were shaking as...',
                'Her heart was pounding in her chest...',
            ],
            dialog: [
                '"We need to talk," said...',
                '"I never meant for this to happen."',
                '"What are you doing here?"',
            ],
            vendepunkt: [
                'But then something unexpected happened...',
                'Everything changed when...',
                'In that moment she realised that...',
            ],
            avslutning: [
                'Afterwards, nothing was the same...',
                'For the first time, she felt that...',
                'He never went back.',
            ],
        },
        vgs: {
            aapning: [
                'Afterwards, no one could say exactly when it had started.',
                'The house had been empty for years when...',
                'On the morning of the funeral, ...',
            ],
            skildring: [
                'The silence between them thickened until...',
                'Light fell through the blinds in narrow stripes across...',
                'She noticed, absurdly, the small details:...',
            ],
            dialog: [
                '"You knew," she said quietly. "All this time, you knew."',
                '"It doesn’t have to mean anything," he said, meaning the opposite.',
                '"Stay," was all she managed to say.',
            ],
            vendepunkt: [
                'It was then, in that unremarkable moment, that everything shifted.',
                'What he found in the drawer changed the meaning of every year that had gone before.',
                'She understood, suddenly and completely, that...',
            ],
            avslutning: [
                'Outside, the world went on, indifferent and bright.',
                'She closed the door softly behind her, and did not look back.',
                'Only much later would he understand what had truly ended that day.',
            ],
        },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // SAMMENLIGNING — comparative essay
    // ─────────────────────────────────────────────────────────────────────────
    sammenligning: {
        us: {
            innledning: [
                'I am going to compare... and...',
                'Both texts are about..., but they are also different.',
                'The focus of my comparison is...',
            ],
            likheter: [
                'Both texts show that...',
                'A clear similarity is that...',
                'In the same way as text 1, text 2 also...',
            ],
            forskjeller: [
                'The most important difference is that...',
                'While text 1..., text 2...',
                'Unlike text 1, text 2...',
            ],
            avslutning: [
                'The comparison shows that...',
                'To sum up, the texts are similar in... but different in...',
                'In my opinion, text... works best because...',
            ],
        },
        vgs: {
            innledning: [
                'This essay compares... with..., focusing on...',
                'Although the texts differ in form, they share a preoccupation with...',
                'Read side by side, the two texts illuminate each other.',
            ],
            likheter: [
                'A clear common feature is that both texts...',
                'Text 1 expresses this through..., while text 2 achieves the same through...',
                'This similarity can be traced to...',
            ],
            forskjeller: [
                'The most significant difference concerns...',
                'Where text 1 remains..., text 2 moves towards...',
                'One possible explanation for this difference is...',
            ],
            avslutning: [
                'The comparison reveals that...',
                'Seen together, the texts demonstrate that...',
                'Overall, text... is the more effective, because...',
            ],
        },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // KORTSVAR — short answer
    // ─────────────────────────────────────────────────────────────────────────
    kortsvar: {
        us: {
            innledning: [
                'Text 1 is... by... and text 2 is... by...',
                'I will compare these texts with a focus on...',
            ],
            sammenligning: [
                'Both texts deal with..., but in different ways...',
                'A clear similarity is that both...',
            ],
            forskjeller: [
                'The most important difference is that text 1..., while text 2...',
                'This is shown by...',
            ],
            oppsummering: [
                'The comparison shows that...',
                'In short, the texts...',
            ],
        },
        vgs: {
            innledning: [
                'Text 1, ... by..., and text 2, ... by..., both address...',
                'The following comparison focuses on...',
            ],
            sammenligning: [
                'Both texts explore..., though from different angles:...',
                'The texts converge in their treatment of...',
            ],
            forskjeller: [
                'They diverge, however, in...',
                'Where text 1..., text 2 instead...',
            ],
            oppsummering: [
                'In sum, the comparison shows that...',
                'Together, the texts demonstrate that...',
            ],
        },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // KREATIV TEKST — creative text
    // ─────────────────────────────────────────────────────────────────────────
    'kreativ-tekst': {
        us: {
            aapning: [
                'The first thing I noticed was...',
                'Nobody ever asks me about...',
                'This is what I remember:...',
            ],
            utvikling: [
                'And then, slowly, ...',
                'Day after day, ...',
                'What I did not know then was that...',
            ],
            skildring: [
                'The light was...',
                'It sounded like...',
                'Everything smelled of...',
            ],
            vendepunkt: [
                'But that was before...',
                'Then everything changed.',
                'Suddenly I understood that...',
            ],
            avslutning: [
                'Maybe that is all there is to say.',
                'And still, somewhere, ...',
                'I carry it with me, even now.',
            ],
        },
        vgs: {
            aapning: [
                'There are mornings when the whole city seems to hold its breath.',
                'Let me tell you about the year we stopped speaking.',
                'The sea again. Always the sea.',
            ],
            utvikling: [
                'Little by little, the days rearranged themselves around...',
                'I kept returning to the same thought:...',
                'Somewhere between... and..., something quietly gave way.',
            ],
            skildring: [
                'The light that afternoon was thin and merciless.',
                'Her voice, when it finally came, was smaller than the room.',
                'The silence had a texture to it, like...',
            ],
            vendepunkt: [
                'And then — without warning — ...',
                'It was such a small thing, and it changed everything.',
                'That was the moment the story stopped being about...',
            ],
            avslutning: [
                'Perhaps that is what remains, in the end:...',
                'Somewhere, the tide is still going out.',
                'And if you ask me what it meant, I will say:...',
            ],
        },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // REFLEKTERENDE TEKST — reflective essay
    // ─────────────────────────────────────────────────────────────────────────
    'reflekterende-tekst': {
        us: {
            innledning: [
                'I have long wondered why...',
                'What got me thinking about this was...',
                'Sometimes I ask myself...',
            ],
            hoveddel: [
                'One way to look at it is...',
                'At first I thought that...',
                'The more I think about it, the more...',
            ],
            utforsking: [
                'On the one hand, ...',
                'But what if it is really about...',
                'A question that keeps coming back is...',
            ],
            refleksjon: [
                'I remember one time...',
                'This experience made me realise that...',
                'What I had not considered before is...',
            ],
            avslutning: [
                'What this reflection has shown me is that...',
                'I still do not quite know..., but I now understand that...',
                'Maybe the answer is that there is no simple answer.',
            ],
        },
        vgs: {
            innledning: [
                'The question has followed me for a long time:...',
                'It began, as such things often do, with something trivial:...',
                'I do not have an answer yet — which is precisely why I am writing.',
            ],
            hoveddel: [
                'My first instinct is to say that...',
                'The obvious explanation would be..., but it feels incomplete.',
                'The longer I sit with the question, the more it opens up.',
            ],
            utforsking: [
                'Seen from one angle, ...; from another, ...',
                'But suppose, for a moment, that the opposite were true:...',
                'Perhaps the question itself is the problem:...',
            ],
            refleksjon: [
                'An experience of my own keeps intruding here:...',
                'That moment taught me something I am only now able to name:...',
                'I notice that my view has shifted while writing:...',
            ],
            avslutning: [
                'If this reflection has led anywhere, it is here:...',
                'I remain uncertain about..., but I no longer believe that...',
                'The question is still open — but it is a better question now.',
            ],
        },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // RETORISK ANALYSE — rhetorical analysis
    // ─────────────────────────────────────────────────────────────────────────
    'retorisk-analyse': {
        us: {
            innledning: [
                'The text I am going to analyse is... written by...',
                'The main purpose of the text is to persuade the reader that...',
            ],
            'retorisk-situasjon': [
                'The sender is...',
                'The target audience of the text is...',
                'The text was written because...',
            ],
            etos: [
                'The sender builds credibility by...',
                'We trust the sender because...',
            ],
            patos: [
                'The text appeals to emotions such as... by...',
                'A clear example of an appeal to feelings is...',
            ],
            logos: [
                'The sender uses facts and figures, such as...',
                'The logical argument is that...',
            ],
            virkemidler: [
                'A key device is..., which creates the effect of...',
                'The text also uses... to...',
            ],
            avslutning: [
                'Overall, the text is convincing because...',
                'The most effective strategy of persuasion is...',
            ],
        },
        vgs: {
            innledning: [
                'This analysis examines the rhetoric of..., published in...',
                'The text seeks to persuade its audience that...',
            ],
            'retorisk-situasjon': [
                'The rhetorical situation is defined by...',
                'The exigence of the text is...',
                'The kairos is favourable because...',
            ],
            etos: [
                'Ethos is established through...',
                'The sender’s authority rests on...',
                'Credibility is reinforced by the use of...',
            ],
            patos: [
                'The appeal to pathos is most evident in...',
                'Emotionally charged language such as... serves to...',
                'The imagery of... evokes...',
            ],
            logos: [
                'The logical backbone of the argument is...',
                'Statistical evidence, such as..., lends weight to...',
                'The causal claim that... rests on...',
            ],
            virkemidler: [
                'The anaphora in... drives home...',
                'The rhetorical question... positions the reader as...',
                'Contrast is deployed to sharpen...',
            ],
            avslutning: [
                'Assessed as a whole, the text’s persuasive power lies in...',
                'The dominant appeal is..., which proves to be a strength because...',
                'Ultimately, the text succeeds/fails in its purpose because...',
            ],
        },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // FORTELLING — story
    // ─────────────────────────────────────────────────────────────────────────
    fortelling: {
        us: {
            begynnelse: [
                'Once upon a time...',
                'One day, ... was going to...',
                'Just then, something strange happened.',
                'It all started when...',
            ],
            midtdel: [
                'Suddenly...',
                'That was when ... discovered...',
                'Things got worse and worse, because...',
                'It smelled like...',
                'She heard a sound like...',
            ],
            slutt: [
                'In the end...',
                'At last, ... was...',
                'After that day...',
            ],
        },
        vgs: {
            begynnelse: [
                'It began as a perfectly ordinary day, until...',
                'No one in... had ever seen...',
                'Looking back, there had been warnings all along.',
            ],
            midtdel: [
                'Without warning, ...',
                'What she found there made her stop mid-step.',
                'Every choice seemed to lead deeper into...',
                'The air carried a smell of...',
            ],
            slutt: [
                'When it was finally over, ...',
                'Nothing about the town looked different — and yet everything was.',
                'From that day on, ...',
            ],
        },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // FAKTATEKST — factual text
    // ─────────────────────────────────────────────────────────────────────────
    faktatekst: {
        us: {
            innledning: [
                'This text is about...',
                'Did you know that...',
                'Have you ever wondered how...',
            ],
            fakta: [
                'One important thing to know is that...',
                'Scientists have found that...',
                'Another exciting thing is that...',
                'This means that...',
            ],
            avslutning: [
                'Now you have learned that...',
                'The most important thing to remember is...',
                'That is why... is so fascinating.',
            ],
        },
        vgs: {
            innledning: [
                'This text gives an overview of...',
                'Few topics illustrate... as clearly as...',
                'To understand..., we need to look at...',
            ],
            fakta: [
                'A central fact is that...',
                'Research has established that...',
                'The figures show that...',
                'This is closely connected to...',
            ],
            avslutning: [
                'In summary, ...',
                'The key point to take away is that...',
                'This knowledge matters because...',
            ],
        },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // BOKMELDING — book review
    // ─────────────────────────────────────────────────────────────────────────
    bokmelding: {
        us: {
            innledning: [
                'The book I have read is called...',
                'It is written by...',
                'This is a book about...',
            ],
            handling: [
                'The book is about...',
                'The main character is... who...',
                'The problem in the story is that...',
            ],
            vurdering: [
                'The best thing about the book was... because...',
                'I really liked that...',
                'Something I did not like so much was...',
            ],
            anbefaling: [
                'I recommend this book to anyone who likes...',
                'This book is a good fit for...',
            ],
        },
        vgs: {
            innledning: [
                '... by... is a novel about...',
                'With..., the author... has written a...',
            ],
            handling: [
                'The novel follows..., who...',
                'The central conflict arises when...',
                'Without giving too much away, the plot turns on...',
            ],
            vurdering: [
                'The novel’s greatest strength is..., particularly...',
                'The characterisation of... is convincing because...',
                'Less successful, in my view, is...',
            ],
            anbefaling: [
                'Readers who enjoyed... will find much to like here.',
                'I would recommend the book to anyone interested in...',
            ],
        },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // SØKNAD — job application
    // ─────────────────────────────────────────────────────────────────────────
    soeknad: {
        us: {
            innledning: [
                'I am writing to apply for the position of...',
                'With reference to the advertisement on..., I would like to apply for...',
            ],
            kvalifikasjoner: [
                'I have experience with... from...',
                'Through..., I have learned to...',
                'As..., I was responsible for...',
            ],
            motivasjon: [
                'I would like this position because...',
                'What appeals to me about... is...',
                'I can contribute...',
            ],
            avslutning: [
                'I would be happy to attend an interview and can start...',
                'Please do not hesitate to contact me if you have any questions.',
                'Yours sincerely',
            ],
        },
        vgs: {
            innledning: [
                'I am writing to apply for the position of..., as advertised on...',
                'I was excited to see your advertisement for..., and hereby apply.',
            ],
            kvalifikasjoner: [
                'My experience from... has given me solid skills in...',
                'In my role as..., I was responsible for..., which taught me...',
                'I am used to working both independently and in teams, for example when...',
            ],
            motivasjon: [
                'What draws me to this position in particular is...',
                'Your organisation’s work on... matches my interest in...',
                'I am confident I can contribute..., because...',
            ],
            avslutning: [
                'I would welcome the opportunity to discuss my application at an interview.',
                'I am available to start from..., and can be reached at any time.',
                'Yours sincerely',
            ],
        },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // FORMELT BREV — formal letter
    // ─────────────────────────────────────────────────────────────────────────
    'formelt-brev': {
        us: {
            innledning: [
                'I am writing to you because...',
                'With reference to..., I would like to...',
            ],
            sak: [
                'On..., I experienced that...',
                'The matter concerns...',
                'I would particularly like to point out that...',
            ],
            handling: [
                'I therefore ask that...',
                'I would appreciate a response regarding...',
                'A good outcome for me would be that...',
            ],
            avslutning: [
                'Thank you in advance for your help.',
                'I look forward to hearing from you.',
                'Yours sincerely',
            ],
        },
        vgs: {
            innledning: [
                'I am writing regarding...',
                'With reference to your letter of..., I would like to...',
                'I wish to bring the following matter to your attention:...',
            ],
            sak: [
                'The facts of the matter are as follows:...',
                'On..., the following occurred:...',
                'For the record, I would like to note that...',
            ],
            handling: [
                'I therefore request that...',
                'I trust that you will...',
                'I expect a written reply by...',
            ],
            avslutning: [
                'Thank you for your attention to this matter.',
                'I look forward to your prompt reply.',
                'Yours sincerely',
            ],
        },
    },

    // ─────────────────────────────────────────────────────────────────────────
    // GENERELL — fallback for unknown genres
    // ─────────────────────────────────────────────────────────────────────────
    generell: {
        us: {
            innledning: [
                'In this text I am going to write about...',
                'An important question is...',
                'This text is about...',
            ],
            argument: [
                'One important argument is that...',
                'A good reason for this is...',
            ],
            motargument: [
                'On the other hand, ...',
                'Some people think that...',
            ],
            eksempel: [
                'For example, ...',
                'A good example of this is...',
            ],
            overgang: [
                'This means that...',
                'Another important point is...',
            ],
            avslutning: [
                'To sum up, ...',
                'My conclusion is that...',
            ],
            kilde: [
                'According to...',
                'As stated in...',
            ],
        },
        vgs: {
            innledning: [
                'This text examines...',
                'A central question in this context is...',
                'The topic of... deserves closer attention.',
            ],
            argument: [
                'The principal argument is that...',
                'It can be argued that...',
            ],
            motargument: [
                'Conversely, it could be claimed that...',
                'A significant objection is that...',
            ],
            eksempel: [
                'This is illustrated by...',
                'A case in point is...',
            ],
            overgang: [
                'It follows from this that...',
                'Turning to the next point, ...',
            ],
            avslutning: [
                'In conclusion, ...',
                'On balance, the evidence suggests that...',
            ],
            kilde: [
                'According to..., ...',
                'As... argues, ...',
            ],
        },
    },
};

/**
 * Synonyms for overused words. `common` applies to every level;
 * `us` and `vgs` add level-appropriate alternatives on top.
 */
export const synonyms = {
    common: {
        good: ['excellent', 'impressive', 'effective', 'convincing', 'remarkable'],
        bad: ['poor', 'weak', 'flawed', 'disappointing', 'inadequate'],
        big: ['large', 'huge', 'significant', 'considerable', 'enormous'],
        small: ['tiny', 'minor', 'slight', 'modest', 'limited'],
        nice: ['pleasant', 'enjoyable', 'delightful', 'appealing'],
        said: ['stated', 'explained', 'argued', 'claimed', 'pointed out'],
        says: ['states', 'explains', 'argues', 'claims', 'points out'],
        think: ['believe', 'consider', 'argue', 'assume', 'suspect'],
        thinks: ['believes', 'considers', 'argues', 'assumes'],
        shows: ['demonstrates', 'illustrates', 'reveals', 'indicates', 'suggests'],
        show: ['demonstrate', 'illustrate', 'reveal', 'indicate', 'suggest'],
        very: ['extremely', 'remarkably', 'particularly', 'exceptionally'],
        really: ['truly', 'genuinely', 'particularly', 'in fact'],
        get: ['receive', 'obtain', 'gain', 'acquire'],
        gets: ['receives', 'obtains', 'gains', 'acquires'],
        got: ['received', 'obtained', 'gained', 'acquired'],
        go: ['move', 'travel', 'head', 'proceed'],
        went: ['moved', 'travelled', 'headed', 'hurried'],
        make: ['create', 'produce', 'cause', 'form'],
        makes: ['creates', 'produces', 'causes', 'forms'],
        important: ['crucial', 'essential', 'significant', 'central', 'vital'],
        interesting: ['fascinating', 'intriguing', 'compelling', 'thought-provoking'],
        also: ['furthermore', 'in addition', 'moreover', 'likewise'],
        but: ['however', 'yet', 'nevertheless', 'on the other hand'],
        thing: ['aspect', 'element', 'factor', 'issue', 'detail'],
        things: ['aspects', 'elements', 'factors', 'issues', 'details'],
        lots: ['a great deal', 'plenty', 'a wide range'],
        many: ['numerous', 'countless', 'a wide range of', 'several'],
    },
    us: {
        fun: ['enjoyable', 'entertaining', 'amusing', 'exciting'],
        funny: ['amusing', 'humorous', 'comical', 'entertaining'],
        scary: ['frightening', 'terrifying', 'creepy', 'unsettling'],
        cool: ['impressive', 'stylish', 'fascinating', 'striking'],
        happy: ['glad', 'delighted', 'cheerful', 'pleased'],
        sad: ['unhappy', 'miserable', 'gloomy', 'heartbroken'],
        angry: ['furious', 'annoyed', 'cross', 'outraged'],
        walk: ['stroll', 'wander', 'march', 'hurry'],
        walked: ['strolled', 'wandered', 'marched', 'hurried'],
        look: ['glance', 'stare', 'gaze', 'peek'],
        looked: ['glanced', 'stared', 'gazed', 'peeked'],
        kind: ['friendly', 'generous', 'caring', 'considerate'],
    },
    vgs: {
        uses: ['employs', 'applies', 'draws on', 'deploys'],
        use: ['employ', 'apply', 'draw on', 'deploy'],
        about: ['concerning', 'regarding', 'with respect to'],
        because: ['since', 'as', 'owing to the fact that', 'given that'],
        so: ['therefore', 'consequently', 'thus', 'hence'],
        problem: ['issue', 'challenge', 'dilemma', 'difficulty'],
        idea: ['notion', 'concept', 'proposition', 'perspective'],
        way: ['manner', 'approach', 'method', 'means'],
        clear: ['evident', 'apparent', 'obvious', 'unmistakable'],
        different: ['distinct', 'diverse', 'contrasting', 'divergent'],
        mean: ['signify', 'imply', 'suggest', 'entail'],
        means: ['signifies', 'implies', 'suggests', 'entails'],
    },
};

/**
 * English stopwords — ignored by the repetition radar.
 */
export const stopwords = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'if', 'so', 'as', 'than', 'because',
    'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them',
    'my', 'your', 'his', 'its', 'our', 'their', 'mine', 'yours', 'hers', 'ours', 'theirs',
    'this', 'that', 'these', 'those', 'who', 'whom', 'whose', 'which', 'what',
    'is', 'am', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'having', 'do', 'does', 'did', 'doing',
    'will', 'would', 'shall', 'should', 'can', 'could', 'may', 'might', 'must',
    'in', 'on', 'at', 'to', 'of', 'for', 'from', 'by', 'with', 'without', 'about',
    'into', 'onto', 'over', 'under', 'between', 'through', 'during', 'before', 'after',
    'up', 'down', 'out', 'off', 'above', 'below', 'again', 'further',
    'here', 'there', 'where', 'when', 'why', 'how',
    'all', 'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such',
    'no', 'nor', 'not', 'only', 'own', 'same', 'too', 'just',
    'then', 'once', 'now', 'also', 'very', 'still', 'even', 'ever', 'never', 'always',
    'yes', 'one', 'two', 'first', 'get', 'got', 'like', 'well',
    "it's", "don't", "doesn't", "didn't", "can't", "couldn't", "won't", "wouldn't",
    "isn't", "aren't", "wasn't", "weren't", "i'm", "i've", "i'll", "you're", "they're",
    "that's", "there's", "what's", "let's",
]);

/**
 * Light English stemmer for the repetition radar.
 * Collapses plural/verb/adverb inflections so 'walks', 'walked' and
 * 'walking' count as the same word. Deliberately conservative — a wrong
 * merge is worse than a missed one.
 * @param {string} word - lowercase word
 * @returns {string} stem
 */
export function stem(word) {
    let w = word;
    if (w.length <= 3) return w;

    // Possessives
    w = w.replace(/'s$/, '').replace(/'$/, '');

    // -ies → -y (stories → story), -ied → -y (carried → carry)
    if (/[a-z]{2}ie[sd]$/.test(w)) return w.slice(0, -3) + 'y';

    // -ing (walking → walk, running → run) — require enough left over
    if (w.length > 5 && w.endsWith('ing')) {
        w = w.slice(0, -3);
        // undo doubling: running → run (but not e.g. 'fall' → keep)
        if (/([^aeiou])\1$/.test(w)) w = w.slice(0, -1);
        return w;
    }

    // -ed (walked → walk, hoped → hop[e] — accept slight over-stemming)
    if (w.length > 4 && w.endsWith('ed')) {
        w = w.slice(0, -2);
        if (/([^aeiou])\1$/.test(w)) w = w.slice(0, -1);
        return w;
    }

    // -es after sibilants (boxes → box, wishes → wish)
    if (w.length > 4 && /(s|x|z|ch|sh)es$/.test(w)) return w.slice(0, -2);

    // plain plural -s (not -ss)
    if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1);

    return w;
}
