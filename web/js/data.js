/* HOMEOSTASIS v6 — données du jeu (cartes, systèmes, configuration).
   Source unique : utilisée par le moteur, le simulateur, l'interface et le générateur de cartes. */
(function (root) {
  const HS = (root.HS = root.HS || {});

  HS.VERSION = '6.1';

  // Ordre horaire du plateau (sert au Collatéral : l'organe « suivant »).
  HS.SYS = ['cardio', 'respi', 'neuro', 'immuno', 'digest'];
  HS.SYS_INFO = {
    cardio: { name: 'Cardio', long: 'Cardiovasculaire', icon: '🫀', color: '#e5484d' },
    respi: { name: 'Respi', long: 'Respiratoire', icon: '🫁', color: '#3b9eff' },
    neuro: { name: 'Neuro', long: 'Neurologique', icon: '🧠', color: '#d864d8' },
    immuno: { name: 'Immuno', long: 'Immunitaire', icon: '🛡️', color: '#e2a336' },
    digest: { name: 'Digestif', long: 'Digestif', icon: '🍔', color: '#46a758' },
  };

  // Faces du dé Bio-Tech (d6).
  HS.FACES = ['S', 'P', 'A', 'L', '2', '3'];
  HS.FACE_INFO = {
    S: { name: 'Bouclier', icon: '🛡️' },
    P: { name: 'Patch', icon: '🩹' },
    A: { name: 'Adrénaline', icon: '⚡' },
    L: { name: 'Labo', icon: '🧪' },
    2: { name: 'Puissance 2', icon: '2' },
    3: { name: 'Puissance 3', icon: '3' },
  };

  // Paramètres de règles (ajustés par simulation — voir docs/ANALYSE-EQUILIBRAGE.md).
  HS.CONFIG = {
    maxHP: 10, // PV max par système
    startHand: 4, // cartes en main au départ
    draw: 2, // pioche par tour
    handMax: 7,
    actions: 2,
    dice: 3,
    atpStart: 0,
    atpMax: 2,
    greenAbove: 5, // Zone verte : tous les systèmes > 5 PV => +1 ATP
    shieldDie: 3, // dé Bouclier
    guardDie: 1, // Protection d'urgence
    reanimHP: 4, // PV après Réanimation
    reanimDice: 2, // dés sacrifiés pour la Réanimation
    crisis: 5, // Crise aiguë (2e chronique sur le même système)
    burn: 1, // Cycle chronique
    helpCost: 2, // Consultation : soigner le patient d'un allié coûte +1 Puissance
    chain: true, // Comorbidité : après une Chronique, révélez une autre Pathologie
    iatroFail: ['2', '3'], // faces d'échec du Risque iatrogénique
    systemic: 2, // Choc anaphylactique non bloqué : -N partout
    pathoPerPlayer: { 1: 22, 2: 19, 3: 17, 4: 16, 5: 13 }, // pathologies par joueur (durée Normale)
    lengthMult: { courte: 0.7, normale: 1, marathon: 99 },
    difficultyHP: { interne: 1, resident: 0, patron: -1 }, // modificateur de PV max
  };

  const ALL = HS.SYS;
  const C = {};
  function add(type, list) {
    list.forEach((c) => {
      c.type = type;
      C[c.id] = c;
    });
  }

  // ---------- PATHOLOGIES AIGUËS (45) ----------
  add('aigu', [
    { id: 'infarctus', name: 'Infarctus du Myocarde', qty: 4, dmg: { cardio: 6, neuro: 3 }, fx: 'choc', fxName: 'Choc',
      text: 'Perdez tous vos jetons ATP.', flavor: 'Chaque minute sans traitement détruit le muscle cardiaque de façon irréversible.' },
    { id: 'meningite', name: 'Méningite Bactérienne', qty: 3, dmg: { neuro: 5, immuno: 3 }, fx: 'photophobie', fxName: 'Photophobie',
      text: 'Coût des Traitements +1 Puissance ce tour-ci.', flavor: 'Fièvre + raideur de nuque + mal de tête = urgence absolue.' },
    { id: 'anaphylaxie', name: 'Choc Anaphylactique', qty: 3, dmg: { immuno: 3, respi: 2 }, fx: 'systemique', fxName: 'Systémique',
      text: 'Si non bloqué à 100 % : -{systemic} PV sur TOUS les systèmes.', flavor: "L'adrénaline est le seul médicament capable de stopper la cascade allergique mortelle." },
    { id: 'pancreatite', name: 'Pancréatite Aiguë', qty: 3, dmg: { digest: 6, immuno: 3 }, fx: 'douleur', fxName: 'Douleur',
      text: 'Défaussez 2 cartes de votre main au hasard.', flavor: "Souvent causée par un calcul biliaire bloqué ou l'alcool. Douleur transfixiante." },
    { id: 'embolie', name: 'Embolie Pulmonaire', qty: 3, dmg: { respi: 5, cardio: 4 }, fx: 'hypoxie', fxName: 'Hypoxie',
      text: 'Si non bloqué à 100 % : lancez 1 dé de moins au prochain tour.', flavor: 'Un caillot bloque le poumon. Fréquent après une immobilisation prolongée.' },
    { id: 'avc', name: 'AVC Ischémique', qty: 3, dmg: { neuro: 6, respi: 2 }, fx: 'hemiplegie', fxName: 'Hémiplégie',
      text: 'Max 1 Action jouable ce tour-ci.', flavor: '« VITE » : Visage, Inertie, Trouble de la parole, Urgence.' },
    { id: 'sepsis', name: 'Sepsis (Urinaire)', qty: 3, dmg: { immuno: 4, digest: 3 }, fx: 'fievre', fxName: 'Fièvre',
      text: 'Vos dés [S] ne bloquent que 2 dégâts ce tour-ci.', flavor: 'Une infection simple mal soignée peut virer en infection systémique.' },
    { id: 'hemorragie', name: 'Hémorragie Digestive', qty: 3, dmg: { digest: 5, cardio: 4 }, fx: 'anemie', fxName: 'Anémie',
      text: 'Si non bloqué à 100 % : piochez 1 carte de moins au prochain tour.', flavor: "Peut être causée par des ulcères ou la prise excessive d'anti-inflammatoires." },
    { id: 'asthme', name: "Crise d'Asthme Sévère", qty: 3, dmg: { respi: 5, neuro: 2 }, fx: 'panique', fxName: 'Panique',
      text: 'Pas de Mulligan clinique ce tour-ci.', flavor: "Les bronches se ferment. La panique aggrave la sensation d'étouffement." },
    { id: 'gastro', name: 'Gastro-Entérite Sévère', qty: 3, dmg: { digest: 4, immuno: 3 }, fx: 'deshydratation', fxName: 'Déshydratation',
      text: 'Vos dés [P] relancent mais ne soignent pas ce tour-ci.', flavor: "La perte d'eau et d'électrolytes est le vrai danger, surtout chez les fragiles." },
    { id: 'erysipele', name: 'Érysipèle', qty: 2, dmg: { immuno: 5, digest: 4 }, fx: 'barriere', fxName: 'Barrière rompue', danger: true,
      text: '[A] Danger : si vous subissez des dégâts, déclenche un Collatéral.', flavor: 'Infection cutanée brutale : jambe rouge et fièvre élevée.' },
    { id: 'dissection', name: 'Dissection Aortique', qty: 2, dmg: { cardio: 8, digest: 2 }, fx: 'dechirure', fxName: 'Déchirure',
      text: 'Si dégâts subis > 0 : défaussez votre Traitement le plus coûteux.', flavor: 'Douleur thoracique brutale « en coup de poignard ». Urgence chirurgicale.' },
    { id: 'co', name: 'Intoxication au Monoxyde de Carbone', qty: 3, dmg: { respi: 5, neuro: 4 }, fx: 'somnolence', fxName: 'Somnolence',
      text: 'Vos dés [3] valent [2] ce tour-ci.', flavor: "Le « tueur silencieux » prend la place de l'oxygène et étouffe le cerveau." },
    { id: 'endocardite', name: 'Endocardite', qty: 2, dmg: { immuno: 4, cardio: 3 }, fx: 'vegetations', fxName: 'Végétations',
      text: 'Chaque cible subit +1 dégât (déjà compté à la révélation).', flavor: "Bactérie sur une valve cardiaque. Attention à l'hygiène dentaire !" },
    { id: 'colique', name: 'Colique Néphrétique', qty: 3, dmg: { immuno: 4 }, fx: 'exquise', fxName: 'Douleur exquise',
      text: '-1 PV imblocable sur les 4 autres systèmes.', flavor: "Boire de l'eau est la meilleure prévention contre les calculs." },
    { id: 'convulsion', name: 'Convulsion', qty: 2, dmg: { neuro: 7 }, fx: 'orage', fxName: 'Orage électrique',
      text: 'Si non bloqué à 100 % : ATP à 0 et défaussez 1 carte au hasard.', flavor: 'Ne rien mettre dans la bouche ! Protégez la tête, puis position latérale de sécurité.' },
  ]);

  // ---------- PATHOLOGIES CHRONIQUES (20) ----------
  add('chronique', [
    { id: 'ic', name: 'Insuffisance Cardiaque', qty: 2, sys: 'cardio', fxName: 'Fatigue',
      text: "Impossible de gagner de l'ATP.", flavor: 'Le cœur ne pompe plus assez pour les besoins du corps.' },
    { id: 'mpoc', name: 'MPOC', qty: 2, sys: 'respi', fxName: 'Souffle court',
      text: 'Lancez 1 dé de moins (minimum 2).', flavor: "Maladie obstructive souvent liée au tabac. L'air reste piégé." },
    { id: 'diabete', name: 'Diabète de Type 2', qty: 2, sys: 'immuno', fxName: 'Sucre toxique',
      text: 'Chaque Pathologie aiguë inflige +1 dégât à sa cible principale.', flavor: "L'excès de sucre abîme nerfs et vaisseaux, retardant la cicatrisation." },
    { id: 'renale', name: 'Insuffisance Rénale', qty: 2, sys: 'immuno', fxName: 'Déchets',
      text: 'Main max réduite à 5 cartes.', flavor: "Les reins ne filtrent plus. Les toxines s'accumulent dans le sang." },
    { id: 'cirrhose', name: 'Cirrhose', qty: 2, sys: 'digest', fxName: 'Coagulation',
      text: "Protection d'urgence (1) interdite.", flavor: 'Le foie durcit et ne filtre plus les déchets du corps.' },
    { id: 'depression', name: 'Dépression Majeure', qty: 2, sys: 'neuro', fxName: 'Ralentissement',
      text: 'Coût des Traitements +1 Puissance.', flavor: "Maladie réelle affectant l'énergie et la volonté, pas une faiblesse." },
    { id: 'par', name: 'Polyarthrite Rhumatoïde', qty: 2, sys: 'immuno', fxName: 'Raideur',
      text: 'Vos dés [2] ne valent que 1 Puissance.', flavor: 'Le corps attaque ses propres articulations (auto-immun).' },
    { id: 'hta', name: 'Hypertension Artérielle', qty: 2, sys: 'cardio', fxName: 'Tueur silencieux',
      text: 'Lors de son Burn, si Cardio ≤ 5 : -1 PV aussi sur Respi et Neuro.', flavor: 'Le tueur silencieux qui use tous les organes prématurément.' },
    { id: 'crohn', name: 'Maladie de Crohn', qty: 2, sys: 'digest', fxName: 'Malabsorption',
      text: 'Vos cartes Traitement soignent 1 PV de moins par système.', flavor: "Inflammation chronique empêchant l'absorption des nutriments." },
    { id: 'parkinson', name: 'Maladie de Parkinson', qty: 2, sys: 'neuro', fxName: 'Tremblement',
      text: 'Pas de Mulligan clinique.', flavor: 'Perte de dopamine causant rigidité et tremblements.' },
  ]);

  // ---------- SOINS IMMÉDIATS (45) ----------
  add('soin', [
    { id: 'solute', name: 'Soluté Salin', sub: 'Hydratation', qty: 5, cost: 1, heal: { mode: 'one', amount: 3, systems: ALL },
      text: 'Soigne {amount} PV (1 système au choix).', flavor: 'Remplir les vaisseaux est la première étape du choc.' },
    { id: 'antibio', name: 'Antibiotiques IV', sub: 'Antibiothérapie', qty: 8, cost: 3, heal: { mode: 'each', amount: 2, systems: ['immuno', 'respi', 'digest'] },
      text: 'Soigne {amount} PV dans CHACUN de ces systèmes.', flavor: 'Inefficace contre les virus. Précieux contre les bactéries.' },
    { id: 'cortico', name: 'Corticostéroïdes', sub: 'Anti-inflammatoire', qty: 8, cost: 3, heal: { mode: 'split', amount: 5, systems: ['neuro', 'immuno', 'digest'] },
      text: 'Soigne {amount} PV à répartir.', flavor: "Réduit l'inflammation mais peut causer diabète et confusion." },
    { id: 'adrenaline', name: 'Adrénaline', sub: "Stimulant d'urgence", qty: 6, cost: 3, costDie: 'A', heal: { mode: 'split', amount: 5, systems: ['cardio', 'respi', 'immuno'] },
      text: 'Soigne {amount} PV à répartir. Payée avec un dé [A] : active le Collatéral.', flavor: 'Augmente le rythme cardiaque et la pression en urgence vitale.' },
    { id: 'oxygene', name: 'Oxygénothérapie', sub: 'Oxygénation', qty: 8, cost: 3, heal: { mode: 'split', amount: 5, systems: ['respi', 'neuro', 'cardio'] },
      text: 'Soigne {amount} PV à répartir.', flavor: "L'hypoxie tue le cerveau en 3 minutes." },
    { id: 'transfusion', name: 'Transfusion', sub: 'Transfusion sanguine', qty: 5, cost: 2, heal: { mode: 'pick', n: 2, amount: 3, systems: ['cardio', 'digest', 'neuro'] },
      text: 'Soigne {amount} PV sur 2 de ces systèmes.', flavor: "Une poche de sang sauve des vies lors d'hémorragies massives." },
    { id: 'support', name: 'Traitement de Support', sub: 'Soin global', qty: 5, cost: 3, heal: { mode: 'each', amount: 2, systems: ALL }, atp: 1,
      text: 'Soigne {amount} PV PARTOUT + 1 ATP.', flavor: 'Le soin global (nursing) est la clé de la récupération.' },
  ]);

  // ---------- MÉDICATION DE MAINTENANCE (20) ----------
  add('maint', [
    { id: 'ains', name: 'Analgésiques (AINS)', qty: 5, cost: 2, costDie: 'L', systems: ['neuro', 'immuno'], bonus: 'shield',
      text: 'Stabilise une Chronique ET +2 Boucliers ce tour.', flavor: 'Soulager la douleur permet au corps de mieux se défendre.' },
    { id: 'regulateur', name: 'Régulateur Métabolique', qty: 5, cost: 2, costDie: 'L', systems: ['cardio', 'digest', 'immuno'], bonus: 'draw',
      text: 'Stabilise une Chronique ET piochez 2 cartes.', flavor: 'Contrôle glycémie et cholestérol pour protéger les vaisseaux.' },
    { id: 'vasodilatateur', name: 'Vasodilatateur', qty: 5, cost: 2, costDie: 'L', systems: ['cardio', 'respi', 'neuro'], bonus: 'heal',
      text: 'Stabilise une Chronique ET soigne 2 PV sur 2 de ces systèmes.', flavor: 'Dilater les vaisseaux réduit le travail du cœur fatigué.' },
    { id: 'immunomodulateur', name: 'Immunomodulateur', qty: 5, cost: 2, costDie: 'L', systems: ['immuno', 'digest', 'respi'], bonus: 'habit',
      text: 'Stabilise une Chronique ET retire votre Mauvaise Habitude (sinon +1 ATP).', flavor: "Cible précisément l'inflammation sans tout bloquer." },
  ]);

  // ---------- SOINS CRITIQUES / INVASIFS (15) ----------
  add('invasif', [
    { id: 'chirurgie', name: "Chirurgie d'Urgence", sub: 'Intervention majeure', qty: 5, cost: 3, risk: 2, amount: 7,
      text: 'Soigne {amount} PV (1 système). Relance le dé !', flavor: '« Ouvrir » comporte toujours un risque infectieux et hémorragique.' },
    { id: 'dialyse', name: "Dialyse d'Urgence", sub: 'Épuration sanguine', qty: 3, cost: 4, risk: 2, amount: 6, systems: ['immuno', 'digest', 'neuro'],
      text: 'Remonte ces systèmes à {amount} PV. Relance le dé !', flavor: 'Remplace le rein. Épure le sang mais fatigue le cœur.' },
    { id: 'intubation', name: 'Intubation', sub: 'Assistance vitale', qty: 3, cost: 2, risk: 2, amount: 3, systems: ['cardio', 'respi', 'neuro'],
      text: 'Ces systèmes ne descendent pas sous 1 PV ce tour + Respi +{amount} PV. Relance le dé !', flavor: 'Respiration artificielle. Risque de pneumonie nosocomiale.' },
    { id: 'greffe', name: "Greffe d'Organe", sub: 'Transplantation', qty: 4, cost: 4, risk: 2, amount: 3, revive: 5,
      text: 'Retire 1 Chronique (son système +{amount} PV) OU ranime un système en Nécrose à {revive} PV. Relance le dé !', flavor: "Le don d'organe est le traitement ultime de la défaillance terminale." },
  ]);

  // ---------- ACTIONS (25) ----------
  add('action', [
    { id: 'delegation', name: 'Délégation de Tâche', qty: 5, cost: 1,
      text: 'COOP : un allié gagne +1 Action à son prochain tour et vous piochez 1 carte. SOLO : +1 Action à votre prochain tour. VS : chaque adversaire perd 1 Action à son prochain tour.',
      flavor: "C'est fou tout ce qu'on peut accomplir quand on ne fait rien soi-même." },
    { id: 'veto', name: 'Veto Médical', qty: 6, cost: 2,
      text: "Annule l'attaque qui vous vise ce tour (dégâts et effet). VS, au choix : la 1re carte du prochain tour d'un adversaire est annulée.",
      flavor: 'Votre diagnostic est erroné. Voici de quoi vous occuper en attendant.' },
    { id: 'placebo', name: 'Placebo / Nocebo', qty: 8, cost: 2,
      text: 'Copiez le dernier Soin immédiat joué (sinon : 3 PV sur 1 système). VS, au choix : Nocebo, -2 PV sur les 2 systèmes les plus hauts d\'un adversaire.',
      flavor: "Le pouvoir de l'esprit est un outil à double tranchant." },
    { id: 'recherche', name: 'Protocole de Recherche', qty: 6, cost: 2, costDie: 'L',
      text: 'Piochez 4 cartes, gardez-en 2, remettez les 2 autres sous le paquet.', flavor: "La science, c'est aussi savoir quoi garder." },
  ]);

  // ---------- PROFILS GÉNÉTIQUES (10) ----------
  add('gene', [
    { id: 'jeune', name: 'Jeune en Santé', plus: 'PV max +1 partout.', minus: 'ATP : exige tous les systèmes > 7 PV.',
      flavor: 'La jeunesse est un bouclier, mais il peut se fissurer.' },
    { id: 'brca', name: 'Mutation BRCA', plus: 'Vos Soins critiques soignent +3 PV.', minus: 'Immuno max -3.',
      flavor: "Certaines batailles sont inscrites dans nos gènes, mais c'est nous qui les menons." },
    { id: 'cardiaque', name: 'Antécédent Cardiaque', plus: 'Vision permanente de la prochaine Pathologie + commence avec 1 ATP.', minus: 'Cardio max -2.',
      flavor: 'Le passé de votre cœur éclaire votre avenir, mais il en fixe aussi les limites.' },
    { id: 'alpha1', name: 'Déficit Alpha-1 Antitrypsine', plus: '1 relance gratuite d\'un dé par tour (en plus du Mulligan).', minus: 'Respi max -2.',
      flavor: 'Chaque souffle est précieux, protégez-le.' },
    { id: 'hemochromatose', name: 'Hémochromatose', plus: 'Vos dés [3] valent 4 Puissance.', minus: '-1 PV Digestif chaque fois que vous utilisez ce bonus.',
      flavor: "Trop de fer, c'est lourd à porter." },
    { id: 'hla', name: 'Groupe HLA Rare', plus: 'Immunisé aux Mauvaises Habitudes (commence sans).', minus: "Greffe d'Organe injouable ; échec iatrogénique : +1 dégât.",
      flavor: 'Être unique est un don, mais la rareté a son prix.' },
    { id: 'metaboliseur', name: 'Métaboliseur Lent', plus: 'Votre 1er Traitement du tour ne coûte pas d\'Action.', minus: 'Risque iatrogénique : échec aussi sur [P].',
      flavor: 'Parfois, il vaut mieux prendre son temps pour guérir.' },
    { id: 'senior', name: 'Senior', plus: 'Main max +3 et +2 cartes au départ.', minus: 'PV max -1 partout ; échec iatrogénique : +1 dégât.',
      flavor: "L'expérience est une richesse, mais elle s'accompagne de fragilité." },
    { id: 'lynch', name: 'Syndrome de Lynch', plus: 'Piochez +1 carte par tour.', minus: 'Digestif max -3.',
      flavor: 'Une prédisposition ne dicte pas le destin.' },
    { id: 'ehlers', name: 'Ehlers-Danlos', plus: 'Vos dés [S] bloquent +1 dégât.', minus: 'Cardio max -2 ; les Collatéraux font 100 % des dégâts.',
      flavor: 'La flexibilité est un don, mais la stabilité est un besoin.' },
  ]);

  // ---------- BONNES HABITUDES (10) ----------
  add('bonne', [
    { id: 'reseau', name: 'Réseau Social', text: 'Une fois par tour (gratuit) : COOP, donnez 1 carte à un allié ; sinon défaussez 1 carte pour en piocher 1.', flavor: "Le meilleur des traitements, c'est l'amitié." },
    { id: 'curiosite', name: 'Curiosité Intellectuelle', text: 'Vos dés [L] piochent 2 cartes au lieu de 1.', flavor: 'Le savoir est le premier pas vers la guérison.' },
    { id: 'activite', name: 'Activité Physique', text: '+1 ATP immédiat et réserve max +1.', flavor: "Le mouvement, c'est la vie." },
    { id: 'sommeil', name: 'Sommeil Réparateur', text: '+1 Mulligan clinique par tour.', flavor: 'Le sommeil est la meilleure médecine.' },
    { id: 'hydratation', name: 'Hydratation Optimale', text: 'Vos dés [S] bloquent +1 dégât.', flavor: "L'eau est la source de la vie et de la protection." },
    { id: 'stress', name: 'Gestion du Stress', text: 'Vos dés à symbole valent 2 Puissance.', flavor: 'Le calme est la plus grande des forces.' },
    { id: 'hygiene', name: 'Bonne Hygiène de Vie', text: 'Chaque Pathologie aiguë inflige -1 dégât à sa cible principale.', flavor: 'La propreté et la mesure sont les gardiennes de la santé.' },
    { id: 'alimentation', name: 'Alimentation Équilibrée', text: '+1 PV à chaque soin reçu (par système).', flavor: 'Manger sainement est le premier médicament.' },
    { id: 'meditation', name: 'Méditation', text: 'Vos dés [2] peuvent servir de dé [L].', flavor: 'La paix intérieure est le plus puissant des élixirs.' },
    { id: 'resilience', name: 'Résilience', text: 'Quand un système tombe à 0 : lancez un dé. [2], [3] ou [S] : il reste à 1 PV.', flavor: 'Tomber sept fois, se relever huit.' },
  ]);

  // ---------- MAUVAISES HABITUDES (10) ----------
  add('mauvaise', [
    { id: 'insomnie', name: 'Insomnie', text: 'Vos dés [3] valent 2 Puissance et vos dés [2] valent 1.', flavor: 'Le sommeil est un luxe que je ne peux m\'offrir.' },
    { id: 'stresschro', name: 'Stress Chronique', text: 'Main max -2 cartes.', flavor: 'Le stress ronge lentement, mais sûrement.' },
    { id: 'alcoolisme', name: 'Alcoolisme', text: 'Début de tour : lancez un dé. [2] ou [3] : -1 Action ce tour.', flavor: 'La bouteille promet beaucoup, mais ne donne que des regrets.' },
    { id: 'isolement', name: 'Isolement', text: 'Vous piochez 1 carte de moins par tour (minimum 1). COOP : vous ne pouvez ni aider ni être aidé.', flavor: 'La solitude est une forteresse dont on perd vite la clé.' },
    { id: 'negligence', name: 'Négligence', text: 'Vos soins multi-cibles ne soignent que 2 systèmes.', flavor: "Ce que l'on ignore finit par nous rattraper." },
    { id: 'surmenage', name: 'Surmenage', text: 'Quand vous jouez votre 2e Action du tour : -1 PV Neuro.', flavor: "Vouloir tout faire, c'est parfois ne rien faire." },
    { id: 'deni', name: 'Déni de la Maladie', text: 'Max 1 Traitement (carte verte) joué par tour.', flavor: "L'ignorer ne la fera pas disparaître." },
    { id: 'sedentarite', name: 'Sédentarité', text: "Pas de gain d'ATP.", flavor: "Le canapé est mon meilleur ami, et l'effort mon pire ennemi." },
    { id: 'tabagisme', name: 'Tabagisme', text: 'Vos dés [S] bloquent 1 dégât de moins.', flavor: "Une bouffée à la fois, la santé s'envole." },
    { id: 'malbouffe', name: 'Malbouffe', text: 'Le Burn des Chroniques fait +1 dégât.', flavor: 'Ton corps est un temple, pas une poubelle.' },
  ]);

  HS.CARDS = C;
  HS.byType = (t) => Object.values(C).filter((c) => c.type === t);
  HS.isTreatment = (c) => c.type === 'soin' || c.type === 'maint' || c.type === 'invasif';

  HS.TYPE_INFO = {
    aigu: { label: 'Aigu — Urgence vitale', family: 'patho', back: 'patho' },
    chronique: { label: 'Maladie chronique', family: 'chronique', back: 'patho' },
    soin: { label: 'Soin immédiat', family: 'soin', back: 'soin' },
    maint: { label: 'Médication', family: 'maint', back: 'soin' },
    invasif: { label: 'Soin critique', family: 'soin', back: 'soin' },
    action: { label: 'Action', family: 'action', back: 'action' },
    gene: { label: 'Facteur de risque non modifiable', family: 'gene', back: 'facteur' },
    bonne: { label: 'Bonne habitude de vie', family: 'bonne', back: 'facteur' },
    mauvaise: { label: 'Mauvaise habitude de vie', family: 'mauvaise', back: 'facteur' },
  };

  // Texte de règle final d'une carte (remplace {amount}, {systemic}, ...).
  HS.cardText = function (c, cfg) {
    cfg = cfg || HS.CONFIG;
    const src = Object.assign({}, cfg, c, c.heal || {});
    return (c.text || '').replace(/\{(\w+)\}/g, (_, k) => (src[k] !== undefined ? src[k] : '?'));
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = HS;
})(typeof window !== 'undefined' ? window : globalThis);
