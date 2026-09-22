// Cours et quiz de démonstration, préparés à l'avance (repris de prototype.html).
// Ils servent :
//  - au bouton « Jouer au quiz de démonstration » : fonctionne sans IA ni Internet (plan B de la démo) ;
//  - au bouton « Remplir avec un cours d'exemple » : un texte fiable pour tester la vraie génération IA.
// Le quiz suit exactement le format défini dans docs/PLAN.md (section 4).

export const DEMO_COURSE = `LE CYCLE DE L'EAU

L'eau circule continuellement entre les océans, les continents et l'atmosphère. Ce déplacement permanent est appelé le cycle de l'eau. Il n'a pas de point de départ unique.

Le Soleil fournit l'énergie qui permet une grande partie de l'évaporation. Sous l'effet de la chaleur, une partie de l'eau liquide des mers, des lacs et des rivières devient de la vapeur d'eau. L'évaporation est donc le passage de l'état liquide à l'état gazeux. La vapeur d'eau est invisible.

Les plantes participent aussi au cycle. Elles absorbent de l'eau par leurs racines et en rejettent une partie dans l'air par leurs feuilles. Ce phénomène s'appelle la transpiration.

Lorsque l'air humide se refroidit, une partie de sa vapeur d'eau se transforme en petites gouttelettes liquides : c'est la condensation. Les nuages sont constitués de petites gouttelettes d'eau et parfois de cristaux de glace.

Lorsque les gouttes ou les cristaux deviennent assez lourds, ils tombent vers le sol. Ce sont les précipitations. Elles peuvent prendre la forme de pluie, de neige ou de grêle.

Une partie de l'eau s'écoule à la surface du sol, notamment sur les pentes : c'est le ruissellement. Une autre partie pénètre dans le sol : c'est l'infiltration. Cette eau peut alimenter des réserves souterraines appelées nappes phréatiques.

Les cours d'eau transportent l'eau vers d'autres cours d'eau, des lacs ou la mer. La neige et la glace peuvent fondre et redevenir de l'eau liquide. Ce passage de l'état solide à l'état liquide s'appelle la fusion.

Dans ce cycle, l'eau peut donc se trouver sous trois états : solide, liquide et gazeux. Elle change de lieu ou d'état, puis continue à circuler.`;

export const DEMO_QUIZ = {
  title: "Le cycle de l'eau",
  questions: [
    {
      question: "Quelle est la principale source d'énergie citée pour l'évaporation ?",
      choices: ['Le Soleil', 'La Lune', 'Les marées', 'Les roches'],
      correctIndex: 0,
      explanation: "La chaleur du Soleil permet à une partie de l'eau liquide de devenir de la vapeur.",
      sourceQuote: "Le Soleil fournit l'énergie qui permet une grande partie de l'évaporation.",
    },
    {
      question: "Quel changement d'état correspond à l'évaporation ?",
      choices: ['Du solide au liquide', 'Du liquide au gazeux', 'Du gazeux au solide', 'Du liquide au solide'],
      correctIndex: 1,
      explanation: "Lors de l'évaporation, l'eau liquide se transforme en vapeur d'eau.",
      sourceQuote: "L'évaporation est donc le passage de l'état liquide à l'état gazeux.",
    },
    {
      question: 'Que se passe-t-il pendant la condensation ?',
      choices: ["L'eau entre dans le sol", 'La glace devient liquide', 'La vapeur devient des gouttelettes', 'Les rivières se vident'],
      correctIndex: 2,
      explanation: "La condensation transforme de la vapeur d'eau en petites gouttelettes liquides.",
      sourceQuote: "Lorsque l'air humide se refroidit, une partie de sa vapeur d'eau se transforme en petites gouttelettes liquides : c'est la condensation.",
    },
    {
      question: 'Quel ensemble contient uniquement des précipitations ?',
      choices: ['Vent, brouillard et soleil', 'Rivière, lac et mer', 'Vapeur, nuage et chaleur', 'Pluie, neige et grêle'],
      correctIndex: 3,
      explanation: 'La pluie, la neige et la grêle sont trois formes de précipitations citées dans le cours.',
      sourceQuote: 'Elles peuvent prendre la forme de pluie, de neige ou de grêle.',
    },
    {
      question: "Comment appelle-t-on l'eau qui s'écoule à la surface du sol ?",
      choices: ['Le ruissellement', "L'infiltration", 'La condensation', 'La transpiration'],
      correctIndex: 0,
      explanation: 'Le ruissellement se fait à la surface du sol, par exemple sur une pente.',
      sourceQuote: "Une partie de l'eau s'écoule à la surface du sol, notamment sur les pentes : c'est le ruissellement.",
    },
    {
      question: "Que signifie l'infiltration ?",
      choices: ["L'eau devient de la vapeur", "L'eau pénètre dans le sol", "L'eau tombe d'un nuage", "L'eau gèle"],
      correctIndex: 1,
      explanation: "L'infiltration correspond à l'entrée de l'eau dans le sol.",
      sourceQuote: "Une autre partie pénètre dans le sol : c'est l'infiltration.",
    },
    {
      question: 'Que sont les nappes phréatiques ?',
      choices: ['Des couches de nuages', 'Des plaques de glace', "Des réserves d'eau souterraines", "Des cours d'eau de surface"],
      correctIndex: 2,
      explanation: "L'eau infiltrée peut alimenter des réserves situées sous le sol.",
      sourceQuote: 'Cette eau peut alimenter des réserves souterraines appelées nappes phréatiques.',
    },
    {
      question: "Comment s'appelle le rejet d'eau dans l'air par les feuilles ?",
      choices: ['La fusion', 'Le ruissellement', "L'infiltration", 'La transpiration'],
      correctIndex: 3,
      explanation: "Les plantes rejettent par leurs feuilles une partie de l'eau qu'elles ont absorbée : elles transpirent.",
      sourceQuote: "Elles absorbent de l'eau par leurs racines et en rejettent une partie dans l'air par leurs feuilles. Ce phénomène s'appelle la transpiration.",
    },
    {
      question: 'De quoi les nuages sont-ils constitués, selon le cours ?',
      choices: ['De gouttelettes et parfois de cristaux de glace', "Uniquement de vapeur d'eau invisible", 'De poussière sèche uniquement', "Uniquement d'eau salée"],
      correctIndex: 0,
      explanation: 'Le cours distingue la vapeur invisible des petites gouttelettes et des cristaux présents dans les nuages.',
      sourceQuote: "Les nuages sont constitués de petites gouttelettes d'eau et parfois de cristaux de glace.",
    },
    {
      question: "Comment appelle-t-on le passage de la glace à l'eau liquide ?",
      choices: ['La condensation', 'La fusion', "L'évaporation", "L'infiltration"],
      correctIndex: 1,
      explanation: "La fusion est le passage de l'état solide à l'état liquide.",
      sourceQuote: "Ce passage de l'état solide à l'état liquide s'appelle la fusion.",
    },
    {
      question: "Quels sont les trois états de l'eau mentionnés ?",
      choices: ['Chaud, tiède et froid', 'Salé, doux et acide', 'Solide, liquide et gazeux', 'Léger, lourd et dense'],
      correctIndex: 2,
      explanation: "La glace est solide, l'eau peut être liquide et la vapeur est gazeuse.",
      sourceQuote: "Dans ce cycle, l'eau peut donc se trouver sous trois états : solide, liquide et gazeux.",
    },
    {
      question: "Quelle affirmation décrit le cycle de l'eau ?",
      choices: ['Il commence toujours dans un lac', "Il s'arrête après la pluie", 'Il se produit une fois par an', "L'eau circule continuellement"],
      correctIndex: 3,
      explanation: 'Le cycle est une circulation permanente, sans point de départ unique.',
      sourceQuote: "L'eau circule continuellement entre les océans, les continents et l'atmosphère.",
    },
    {
      question: "Quelle propriété de la vapeur d'eau est précisée ?",
      choices: ['Elle est invisible', 'Elle est toujours blanche', 'Elle est solide', 'Elle reste dans le sol'],
      correctIndex: 0,
      explanation: "La vapeur d'eau elle-même est invisible ; le cours la distingue des gouttelettes des nuages.",
      sourceQuote: "La vapeur d'eau est invisible.",
    },
    {
      question: "Pourquoi des gouttes ou des cristaux tombent-ils d'un nuage ?",
      choices: ['Ils deviennent trop chauds', 'Ils deviennent assez lourds', 'Ils se changent en vapeur', 'Ils atteignent le sol par infiltration'],
      correctIndex: 1,
      explanation: "Le cours indique qu'ils tombent vers le sol lorsqu'ils deviennent assez lourds.",
      sourceQuote: 'Lorsque les gouttes ou les cristaux deviennent assez lourds, ils tombent vers le sol.',
    },
    {
      question: "Quel rôle les cours d'eau jouent-ils dans le cycle ?",
      choices: ['Ils empêchent toute évaporation', 'Ils fabriquent les cristaux de glace', "Ils transportent l'eau vers d'autres cours d'eau, des lacs ou la mer", "Ils bloquent l'infiltration partout"],
      correctIndex: 2,
      explanation: "Les cours d'eau déplacent l'eau à travers le paysage et peuvent rejoindre la mer.",
      sourceQuote: "Les cours d'eau transportent l'eau vers d'autres cours d'eau, des lacs ou la mer.",
    },
  ],
};
