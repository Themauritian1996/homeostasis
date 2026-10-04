# HOMEOSTASIS v6.1

Jeu de cartes médical pour 1 à 5 joueurs (coop ou compétitif) : version web multijoueur, application Android et dossier d'impression.

## Arborescence

| Dossier | Rôle |
|---|---|
| `web/` | Le jeu (site statique, aucun serveur requis). `js/data.js` = cartes et paramètres, `js/engine.js` = règles, `js/bot.js` = joueur automatique, `js/net.js` = multijoueur, `js/ui.js` = interface |
| `sim/` | Simulateur Monte-Carlo |
| `tools/` | Générateur de cartes et de PDF |
| `assets/art/` | Illustrations extraites des cartes d'origine |
| `impression/` | Fichiers prêts pour l'imprimeur (voir `LISEZ-MOI_IMPRIMEUR.md`) |
| `android/` | Projet Android minimal + script de build de l'APK |
| `docs/` | Analyse d'équilibrage et résultats de simulation |

## Liens

- Jouer : https://themauritian1996.github.io/homeostasis/
- APK Android : https://github.com/Themauritian1996/homeostasis/releases/latest/download/homeostasis.apk

## Jouer sur cet ordinateur

```bash
node tools/serve.js
```

Puis ouvrir http://localhost:8080 — solo, bots, ou plusieurs joueurs sur le même écran.

## Jouer à plusieurs, chacun sur son appareil

Le multijoueur est pair-à-pair (WebRTC via PeerJS) : un joueur « Crée une partie en ligne », obtient un **code à 5 caractères**, les autres choisissent « Rejoindre avec un code ».
Pour que vos amis accèdent au jeu, le dossier `web/` doit être en ligne. Le plus simple :

1. **Netlify Drop** : glisser le dossier `web` sur https://app.netlify.com/drop → une adresse publique en 30 secondes.
2. ou **GitHub Pages** : pousser `web/` dans un dépôt et activer Pages.

Limites connues : la mise en relation passe par le serveur public gratuit de PeerJS ; certains réseaux d'entreprise ou d'université bloquent le WebRTC. Si un joueur se déconnecte, un bot le remplace et il peut revenir avec le même code.

## Application Android

```bash
powershell -ExecutionPolicy Bypass -File android\build-apk.ps1
```

Produit `homeostasis.apk` (WebView qui embarque `web/`). Sur le téléphone : autoriser l'installation d'applications inconnues.
Sans APK, le site hébergé s'installe aussi comme application (menu du navigateur → « Ajouter à l'écran d'accueil »).

## Régénérer les cartes et le dossier d'impression

```bash
python tools/extract_art.py
node tools/build_cards.js
python tools/prep_print.py
node tools/build_print.js
```

Modifier un texte ou un chiffre : éditer `web/js/data.js`, relancer la simulation (`node sim/simulate.js 2000 --detail`), puis les quatre commandes ci-dessus.
