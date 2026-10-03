# HOMEOSTASIS — Analyse du système, rééquilibrage v6.0 et critique

Méthode : le moteur de règles (`web/js/engine.js`) est joué par un bot heuristique « joueur moyen » (`web/js/bot.js`).
Chaque configuration a été simulée de 1 500 à 4 000 fois (`node sim/simulate.js`). Résultats bruts : `docs/sim-v6.txt` et `docs/sim-origine.txt`.

> Limite à garder en tête : le bot joue correctement mais sans génie. Un groupe expérimenté fera quelques points de mieux,
> un groupe débutant quelques points de moins. Les règles d'origine ont été simulées par *approximation* (mêmes cartes, paramètres v4.0 / v5.1).

## 1. Diagnostic des règles d'origine

| Problème constaté | Preuve |
|---|---|
| **Deux règlements contradictoires** (v4.0 : 10 PV, pioche 1, nécrose définitive ; v5.1 : 15 PV, pioche 2, réanimation). Le tableau « Maladie chronique » de la v5.1 est une copie du tableau des aiguës. | Lecture des deux documents |
| **v5.1 : impossible de perdre.** Les soins (8 PV pour 3 Puissance) rattrapent tous les dégâts. | Coop : **99 à 100 % de victoires**, patients à 61/75 PV à la fin |
| **v4.0 : difficulté dépendante du nombre de joueurs.** | Solo 61 % → 2 J 80 % → 3 J 93 % → 4 J 98 % |
| **Parties trop longues** : 65 pathologies = 65 tours, quel que soit le nombre de joueurs. | ~64 tours par partie |
| **Mode VS inéquitable** : celui qui meurt le premier perd, même si le suivant serait mort au même tour ; quand la pioche s'épuise en cours de manche, les derniers joueurs ne subissent pas d'attaque. | Avantage aux derniers sièges mesuré jusqu'à 18 % / 32 % à 4 joueurs avant correction |
| **Profils génétiques déséquilibrés** : « Jeune en santé » dominait le VS (50 % à 3 joueurs), « Métaboliseur lent » était injouable (18 %), « Hémochromatose » perdait 1 PV *chaque tour*. | Simulation par profil |
| **Règles floues** : usage de l'ATP, origine des Habitudes, Veto hors-tour, cartes mortes (Maintenance sans chronique, Délégation en solo, Isolement en solo, Érysipèle sans collatéral possible). | — |
| **Cartes dont l'illustration ne correspond pas** : « Sepsis » étiqueté chronique, deux copies de « Chirurgie » avec le texte du Soluté, « Apnée du sommeil » illustrée par l'Intoxication au CO, « Chute / Trauma », « Intubation » et « Greffe » sans image. | Dossier d'images |

## 2. Ce qui change en v6.0

**Structure**
- **10 PV** par système (pistes courtes, faciles à suivre) ; **Nécrose réversible** : Réanimation = 1 Action + 2 dés → 4 PV.
- **Comorbidité** : une Chronique révélée s'installe *puis* on révèle une autre carte. Chaque tour comporte donc une vraie attaque ; c'est la principale source de tension ajoutée.
- **Durée calibrée** : 22 / 38 / 51 / 64 pathologies à 1 / 2 / 3 / 4 joueurs (≈ 15 tours par joueur en solo, 11 à 4 joueurs). Variante courte × 0,7.
- **Consultation** (coop) : soigner le patient d'un allié coûte +2 Puissance. Sans ce frein, plus on était nombreux, plus c'était facile.
- **Trois niveaux** en coop : Interne (11 PV), Résident (10 PV), Patron (9 PV).
- **VS équitable** : la manche en cours est toujours terminée ; égalité si les derniers patients tombent dans la même manche ; à l'épuisement de la pioche on compare les **PV perdus** (et non les PV totaux, ce qui favorisait les gros PV max).
- **Une seule pioche** (Traitements + Actions + Bonnes habitudes). Chaque joueur commence avec 1 Profil et 1 Mauvaise habitude ; jouer une Bonne habitude la remplace. En VS, les Mauvaises habitudes restantes sont dans la pioche et se jouent sur un adversaire.
- **ATP** clarifié : 1 ATP = 1 Puissance conservable, réserve max 2.
- **Coûts à symbole** : « dé Labo *ou* 2 Puissance », « dé Adrénaline *ou* 3 Puissance » — plus de carte injouable faute du bon dé.

**Cartes ajustées**

| Carte | Avant | v6.0 |
|---|---|---|
| Soluté Salin | 5 PV | 3 PV |
| Corticostéroïdes / Adrénaline / Oxygénothérapie | 8 PV à répartir | 6 PV à répartir |
| Transfusion | 5 PV × 2 | 4 PV × 2 |
| Chirurgie | 10–12 PV, échec variable | 8 PV, échec -2 PV × 3 systèmes |
| Dialyse | remonte à 7–10 PV, coût 4 | remonte à 7 PV, coût 4 |
| Intubation | plancher 1 PV, coût 3 | plancher 1 PV + Respi +3, coût 2 |
| Greffe | retire 1 Chronique, coût 5 | retire 1 Chronique (+3 PV) **ou ranime une Nécrose à 5 PV**, coût 4 |
| Médications | dé Labo obligatoire | dé Labo ou 2 Puissance ; jouables pour le bonus seul |
| Immunomodulateur | « 2 perks positifs » | retire votre Mauvaise habitude (sinon +1 ATP) |
| Veto Médical ×8 | annule l'action d'un joueur (hors-tour) | ×6 — annule l'attaque qui vous vise ; en VS : annule la 1re carte du prochain tour d'un adversaire |
| Placebo / Nocebo | copie / inverse | copie le dernier Soin ; Nocebo : -2 PV sur les 2 systèmes les plus hauts d'un adversaire |
| Protocole de Recherche ×4 | — | ×6, pioche 4 garde 2 |
| Délégation | coop / VS seulement | effet solo ajouté (+1 Action au prochain tour) |
| Érysipèle | « collatéral doublé » (jamais déclenché) | porte le symbole Danger : déclenche lui-même un Collatéral |
| Crise aiguë | -4 PV imblocables | attaque de 5, blocable |
| Hypertension | -1 PV partout si Cardio < 6 | lors de son Burn, si Cardio ≤ 5 : -1 Respi et -1 Neuro |
| MPOC | 2 dés | -1 dé (non cumulable avec la Nécrose) |
| Parkinson | « ne cible pas les autres » (sans effet en solo) | pas de Mulligan |
| Crohn | soins verts -2 PV | -1 PV par système soigné |
| Chute / Trauma, Apnée du sommeil | sans illustration | remplacées par Intoxication au CO ×3, +1 Colique, +1 Convulsion (toujours 45 aiguës) |
| Jeune en Santé | PV max +1 partout (dominant en VS) | idem, mais le VS se joue aux PV perdus |
| Hémochromatose | [3] = 4 ; -1 Digestif *chaque tour* | [3] = 4 ; -1 Digestif seulement quand le bonus sert |
| HLA Rare | Burn ×2 | immunisé aux Mauvaises habitudes ; Greffe injouable, échec iatrogénique +1 |
| Métaboliseur Lent | demi-coût/demi-effet ; 1re carte +1 | 1er Traitement sans Action ; échec iatrogénique aussi sur Patch |
| Ehlers-Danlos | relance avec Bouclier ; collatéral 100 % | Bouclier +1 ; Cardio max -2, collatéral 100 % |
| Antécédent Cardiaque / Alpha-1 | max -2 (sur 10) | max -2, +1 ATP de départ pour l'Antécédent |
| Réseau Social, Curiosité, Isolement, Alcoolisme | interactions hors-tour ou effets nuls | effets simples et automatisables (voir cartes) |

## 3. Résultats de la v6.0

**Coopératif — taux de victoire (4 000 parties par case)**

| Joueurs | Interne | Résident | Patron | Tours |
|---|---|---|---|---|
| 1 | 79 % | 68 % | 53 % | 15 |
| 2 | 81 % | 64 % | 42 % | 26 |
| 3 | 84 % | 65 % | 38 % | 35 |
| 4 | 87 % | 67 % | 36 % | 44 |

Rappel règles d'origine : v5.1 ≈ 99–100 % partout ; v4.0 de 61 % (solo) à 98 % (4 J).
Défaites : la médiane tombe vers 55–60 % de la pioche — la partie se joue au milieu, pas au premier tour.
Rythme : 6,3 dégâts subis et 4,7 PV soignés par tour ; ≈ 1,1 carte jouée par tour pour 2 cartes piochées, donc de vrais choix.

**Compétitif — équité des sièges**

| Joueurs | Victoire par siège | Fin par KO | Égalités |
|---|---|---|---|
| 2 | 49,0 % / 51,0 % | 60 % | 3 % |
| 3 | 32,7 % / 33,7 % / 33,6 % | 26 % | 4 % |
| 4 | 24,3 % / 24,8 % / 25,0 % / 25,8 % | 8 % | 5 % |

**Profils génétiques** : en solo Résident, tous entre 65 % et 78 % (moyenne 70 %) ; en coop à 3 (Interne), tous entre 82 % et 86 %.
En VS à 3, de 29 % à 42 % pour 33 % attendus. **Mauvaises habitudes** : toutes dans une bande de 3 points — aucune n'est une condamnation.

## 4. Critique honnête du jeu

**Points forts**
- Le dé à trois usages (symbole / Puissance / protection) est un excellent moteur : chaque lancer pose un vrai dilemme défense-contre-soin.
- Le thème est porté par la mécanique (burn chronique, stabilisation, risque iatrogénique, collatéral) et les « fun facts » ont une vraie valeur pédagogique.
- La v6 produit une courbe de tension lisible et une difficulté stable de 1 à 4 joueurs.

**Faiblesses qui restent**
1. **Interaction limitée.** En VS, chacun soigne surtout son patient ; l'interaction passe par ~25 cartes. C'est un jeu de course plus que d'affrontement.
2. **Le niveau Patron est plus dur à plusieurs** (53 % solo, 36 % à 4) : une seule mort fait perdre toute l'équipe.
3. **HLA Rare et Lynch sont un peu forts en VS** (≈ 42 %), Jeune et BRCA un peu faibles (≈ 29 %).
4. **Le Digestif est le système qui nécrose le plus** (il est « suivant » de l'Immuno, cible principale la plus fréquente). C'est jouable, mais à surveiller en test réel.
5. **Vision** (dé Labo, Antécédent Cardiaque) reste l'usage le moins rentable : à plusieurs, la prochaine Pathologie vise le joueur suivant.
6. **Charge de règles sur table** : une vingtaine d'effets passifs à retenir. L'application les automatise ; en version physique, prévoir l'aide de jeu à chaque place.
7. **Longueur à 4 joueurs en physique** : 44 tours, soit 50 à 70 minutes. La variante courte est recommandée pour une première partie.

**Pistes pour une v6.1** (non appliquées) : remplacer Vision par « regarder les 2 prochaines et en mettre une dessous » ; un marqueur d'escalade (+1 dégât dans le dernier tiers de la pioche) pour un final plus dramatique ; des cartes Action d'entraide en coop.

## 5. Reproduire

```bash
node sim/simulate.js 2000 --detail            # v6.0
node sim/simulate.js 2000 --alldiff           # trois difficultés
node sim/simulate.js 1000 maxHP=12 draw=1     # tester un paramètre
node sim/simulate.js 1000 card.cortico.heal.amount=8   # tester une carte
```
