# Handoff : LightEditorVidz — Éditeur vidéo desktop

## Vue d'ensemble
LightEditorVidz est une application desktop d'édition vidéo. Ce package décrit trois vues :
1. **Écran d'accueil / lancement** — création ou ouverture d'un projet.
2. **Modale « Nouvelle vidéo »** — choix de la résolution et du nombre d'images par seconde (fps).
3. **Interface d'édition** — canvas central, rail de bibliothèque à gauche, panneau de propriétés à droite, timeline en bas.

Le flux nominal : Accueil → clic « Nouveau projet » → Modale → clic « Créer le projet » → Éditeur.

---

## À propos des fichiers de design
Le fichier `LightEditorVidz.dc.html` de ce bundle est une **référence de design réalisée en HTML** — un prototype montrant l'apparence et le comportement voulus, **pas du code de production à copier tel quel**.

La tâche consiste à **recréer ce design dans l'environnement de l'application cible** (par ex. Electron + React, Tauri, SwiftUI, Qt…) en suivant ses patterns et bibliothèques établis. Si aucun environnement n'existe encore : pour une app desktop d'édition vidéo, une stack recommandée est **Electron (ou Tauri) + React + TypeScript**, avec un rendu du canvas en `<canvas>`/WebGL et une timeline en composants React. Adapte selon l'existant.

> Note : le fichier `.dc.html` utilise un petit runtime maison (`support.js`, inclus pour référence de rendu uniquement). **Ne pas** porter ce runtime — il ne sert qu'à ouvrir le prototype dans un navigateur. Reproduis la logique décrite ci-dessous dans le framework cible.

Pour ouvrir le prototype : ouvrir `LightEditorVidz.dc.html` dans un navigateur (Chrome/Edge). Naviguer via les boutons.

---

## Fidélité
**Haute fidélité (hifi).** Couleurs, typographie, espacements et interactions sont finaux. Reproduire l'UI au pixel près en utilisant les bibliothèques/patterns du codebase cible. Les valeurs exactes (hex, tailles, rayons) sont listées dans « Design Tokens ».

Fenêtre de référence : **desktop**, pensée pour ~1440×900 et plus. Les panneaux latéraux ont des largeurs fixes ; le canvas et la timeline sont fluides. Testé jusqu'à ~1000px de large.

---

## Écrans / Vues

### 1. Accueil (`screenshots/01-accueil.png`)
- **But** : point d'entrée. Créer un nouveau projet, en ouvrir un, ou reprendre un projet récent.
- **Layout** : colonne verticale pleine hauteur, contenu centré (flex column, `align/justify: center`, `gap: 52px`). Fond dégradé radial subtil (voir tokens). Barre de titre macOS en haut (44px, 3 « feux » colorés à gauche).
- **Composants** :
  - **Logo + wordmark** (centré) : carré 56×56, `border-radius: 15px`, fond `linear-gradient(135deg, #5c86ff, #a45cff)`, glyph « play » blanc (triangle). À droite : « LightEditor » (blanc) + « Vidz » (accent `#5c86ff`), `font-weight: 800`, `font-size: 26px`, `letter-spacing: -0.02em`. Sous-titre mono `VIDEO EDITOR · V1.0`, `11px`, `#6b6b78`, `letter-spacing: 0.14em`, uppercase.
  - **Tagline** : `15px`, `#9a9aa8`, `max-width: 440px`, `line-height: 1.55`, centrée. Texte : « Montez vos vidéos, ajoutez du texte, des images, du son et des formes — le tout sur une timeline fluide. »
  - **Bouton primaire « Nouveau projet »** : `padding: 15px 26px`, `border-radius: 13px`, fond `linear-gradient(135deg, #5c86ff, #a45cff)`, texte blanc `15px/700`, icône « + », `box-shadow: 0 10px 30px rgba(92,134,255,0.36)`. Hover : `brightness(1.08)` + `translateY(-1px)`. **Action : ouvre la modale.**
  - **Bouton secondaire « Ouvrir un projet »** : `padding: 15px 22px`, `border: 1px solid rgba(255,255,255,0.12)`, fond `rgba(255,255,255,0.04)`, texte `#e9e9f0 15px/600`, icône. Hover : fond `rgba(255,255,255,0.08)`.
  - **Projets récents** : bloc `max-width: 760px`. En-tête : « Projets récents » (`13px/700 #c9c9d4`) + compteur « 4 projets » (`12px #6b6b78`) alignés en `space-between`. Grille `4 colonnes`, `gap: 14px`. Chaque carte : vignette `aspect-ratio: 16/10`, `border-radius: 11px`, fond placeholder rayé `repeating-linear-gradient(135deg,#1a1a22 0 10px,#15151c 10px 20px)`, `border: 1px solid rgba(255,255,255,0.07)`, label ratio mono centré `#5a5a68`. Sous la vignette : titre `13px/600` + méta mono `11px #6b6b78`. Hover : `translateY(-2px)`. **Action carte : va directement à l'éditeur.**
  - Données démo : « Vlog Été 2026 » 1920×1080 · il y a 2h ; « Reel Produit » 1080×1920 · hier ; « Pub Insta » 1080×1080 · 3 j ; « Aftermovie » 3840×2160 · 1 sem.

### 2. Modale « Nouvelle vidéo » (`screenshots/02-modale.png`)
- **But** : configurer le format d'un nouveau projet.
- **Layout** : overlay plein écran `rgba(6,6,10,0.7)` + `backdrop-filter: blur(6px)`, contenu centré. Carte `width: 520px` (max `92vw`), `border-radius: 18px`, fond `#16161d`, `border: 1px solid rgba(255,255,255,0.1)`, `box-shadow: 0 30px 90px rgba(0,0,0,0.6)`. Animation d'entrée : `scale(.96)→1` + fade, `.22s cubic-bezier(.2,.8,.3,1)`.
- **Sections** (padding interne `22px 24px`, `gap: 22px`) :
  - **En-tête** : titre « Nouvelle vidéo » `18px/800` + sous-titre « Choisissez le format et la cadence. » `12.5px #9a9aa8`. Bouton fermer (croix) 32×32, `border-radius: 9px`, fond `rgba(255,255,255,0.05)`. Séparateur bas `1px rgba(255,255,255,0.07)`.
  - **Nom du projet** : label `12px/700 #c9c9d4` + champ `padding: 12px 14px`, `border-radius: 11px`, fond `#0f0f15`, `border: 1px solid rgba(255,255,255,0.1)`, valeur « Vlog Été 2026 ».
  - **Résolution** : grille 4 colonnes. Chaque option = carte cliquable `padding: 13px 8px`, `border-radius: 11px`, avec une **mini-preview de ratio** (rectangle en bordure) + libellé (`12px/700`) + dimensions mono (`9.5px #6b6b78`). Options : `16:9` 1920×1080 ; `9:16` 1080×1920 ; `1:1` 1080×1080 ; `UHD/4K` 3840×2160. **État sélectionné** : fond `rgba(92,134,255,0.14)`, `border-color: #5c86ff`, contour de preview `#5c86ff`. Non sélectionné : fond `#0f0f15`, `border: rgba(255,255,255,0.09)`, contour `#6b6b78`. Défaut : `16:9`.
  - **Images par seconde** : 3 options côte à côte (`flex`, `gap: 9px`) : `24` (Cinéma), `30` (Standard), `60` (Fluide). Valeur mono `15px/800` + sous-libellé `10px #6b6b78`. Même logique sélectionné/non. Défaut : `30`.
  - **Pied** : séparateur haut, boutons alignés à droite : « Annuler » (secondaire, ferme la modale) + « Créer le projet → » (primaire dégradé, **va à l'éditeur avec les paramètres choisis**).

### 3. Éditeur (`screenshots/03-editeur-texte.png`, `04-editeur-image.png`)
- **But** : monter la vidéo. Ajouter/sélectionner des éléments, régler leurs propriétés, visualiser la timeline.
- **Layout global** : colonne pleine hauteur `100vh` → **Top bar (50px)** / **Zone médiane (flex:1)** / **Timeline (230px)**.

**Top bar** (`#131319`, `border-bottom: 1px rgba(255,255,255,0.07)`, padding `0 14px`, `space-between`) :
- Gauche : logo compact (28×28 dégradé) + wordmark `14px/800` (clic = retour accueil) ; séparateur vertical ; menus texte « Fichier / Édition / Affichage / Aide » (`12.5px #9a9aa8`, hover fond léger).
- Centre : nom du projet `13px/600` + badge mono `11px` sur `rgba(255,255,255,0.05)` affichant « `1920 × 1080 · 30fps` » (reflète les choix de la modale).
- Droite : bouton « Enregistrer » (secondaire bordé, icône download) + bouton « Exporter » (primaire dégradé).

**Zone médiane** — 4 colonnes en flex :
1. **Rail catégories** (largeur `74px`, `#131319`) : 5 boutons verticaux (icône + label `10px`) — **Texte** (« T »), **Vidéos**, **Images**, **Audio**, **Formes**. Bouton actif : fond `rgba(92,134,255,0.14)`, icône/texte blanc ; inactif : `#9a9aa8`. Défaut actif : Texte.
2. **Panneau bibliothèque** (largeur `264px`, `#16161d`) : en-tête = titre de la catégorie + hint mono « CLIC POUR AJOUTER » ; champ recherche (placeholder « Rechercher… ») ; puis contenu selon la catégorie active :
   - **Texte** : grande carte « Ajouter un titre » (`24px/800`), carte « Sous-titre par défaut », puis grille 2×2 de styles animés (Néon dégradé, Ombre, Boîte, Spacé). Clic = ajoute/sélectionne un titre sur le canvas.
   - **Vidéos** : grille 2 colonnes de vignettes `16/10` rayées bleutées avec durée mono en overlay (`plage_coucher.mp4` 00:12, `ville_nuit.mp4` 00:34, `interview.mp4` 01:05) + tuile « Importer » (bordure pointillée).
   - **Images** : grille 2 colonnes de tuiles carrées rayées vertes (`logo.png`, `photo_1`, `sticker`) + tuile « Importer ».
   - **Audio** : liste de pistes (icône + nom + méta mono) : « Summer Groove » 02:14 · Lo-fi ; « Upbeat Intro » 00:18 · SFX ; « Voix off » (Enregistrer…). Accent vert `#38d17a`.
   - **Formes** : grille 3 colonnes de formes orange `#ff8a5c` (carré arrondi, cercle, triangle, étoile, flèche, ligne).
   - Chaque item a une transition d'apparition `fade .2s`.
3. **Zone canvas** (flex, fond `#0b0b0f`) :
   - **Toolbar canvas** (42px) : à gauche undo/redo + séparateur + « ajuster/fit » (icônes 30×30, hover fond léger) ; à droite contrôle de zoom mono « − · fit · 68% · + ».
   - **Stage** (flex centré, `padding: 34px`) : **cadre vidéo 16:9**. Largeur `min(100%, 76vh*16/9)`, `max-width: 860px`, `aspect-ratio: 16/9`, `border-radius: 8px`, `container-type: size` (les textes internes sont dimensionnés en **unités `cqw`** pour scaler avec le cadre), `box-shadow: 0 24px 70px rgba(0,0,0,0.6)`, `overflow: hidden`. Fond = dégradé bleu nuit + voile radial + rayures très légères (simule une frame vidéo).
     - Éléments sur le canvas (positionnés en `%`, cliquables → sélection) :
       - **Logo** (image) : haut-gauche `left:6% top:8%`, `11cqw × 11cqw`, placeholder rayé vert, `border-radius: 1.6cqw`.
       - **Titre** : centré `top:44%`, texte « Vlog Été 2026 », `font-size: 6.6cqw`, `800`, blanc, `text-shadow`.
       - **Sous-titre** : `top:62%`, « Épisode 4 — La côte Atlantique », `2.7cqw/600`, sur pastille `rgba(0,0,0,0.35)`.
     - **Sélection** : élément sélectionné → `outline` coloré (texte = `#a45cff`, image = `#2fc4b6`) + poignées carrées 9×9 aux coins (bordure `#0b0b0f`).
   - **Barre de lecture** (46px, `#0f0f15`) : boutons précédent / **play-pause** (rond 34px dégradé, `box-shadow` accent) / suivant, puis timecode mono « `00:04:12` / 00:30:00 ». Le bouton central bascule play/pause (icône ▶ ↔ ‖‖).
4. **Panneau propriétés** (largeur `300px`, `#16161d`, `border-left`) — **contenu conditionnel selon la sélection** :
   - **Aucune sélection** : état vide centré — icône curseur, « Aucun élément sélectionné », aide « Cliquez sur un élément du canvas ou de la timeline pour voir ses propriétés. »
   - **Texte sélectionné** (`03-editeur-texte.png`) : en-tête (pastille « T » violette + « Propriétés du texte »). Sections : **Contenu** (valeur éditable) ; **Police** (sélecteur « Manrope ExtraBold », taille « 46 px » mono, boutons B/I) ; **Couleur** (5 pastilles 34×34, sélectionnée bordée accent) ; **Alignement** (3 boutons gauche/centre/droite, actif fond accent) ; **Opacité** (slider avec remplissage dégradé + poignée ronde, « 100% ») ; **Animation** (grille 2×2 : Fondu ↗ actif, Glisser, Zoom, Machine). Apparition `pop .2s`.
   - **Image sélectionnée** (`04-editeur-image.png`) : en-tête (pastille verte + « Propriétés de l'image » + « logo.png »). Sections : **Position** (grille 2×2 X/Y/W/H mono) ; **Arrondi** (slider « 12 px ») ; **Opacité** (slider « 100% ») ; **Filtres** (3 vignettes : Original actif, N&B, Chaud).

**Timeline** (230px, `#131319`, `border-top: 1px rgba(255,255,255,0.08)`) :
- **Toolbar timeline** (40px) : à gauche actions « Diviser » (actif), « Supprimer », « Dupliquer » (icône + label `12px`) ; à droite contrôle de zoom timeline (icône loupe + slider `90px`).
- **Corps** : colonne de **labels de pistes** (largeur `104px`, `border-right`) — chaque piste = pastille couleur 8×8 + nom : **Texte** (`#a45cff`), **Vidéo** (`#5c86ff`), **Image** (`#2fc4b6`), **Audio** (`#38d17a`). Hauteur de rangée `36px`.
- **Lanes** (zone scrollable horizontale, `min-width: 900px`) :
  - **Règle** (24px) : graduations mono toutes les 5 s (00:00 → 00:30), `border-left` par graduation.
  - **Clips** (positionnés en `%`, `left`/`width`, `border-radius: 6px`, `height: 26px`, cliquables → sélectionnent l'élément lié) :
    - Piste Texte : « Vlog Été 2026 » (violet, 2%→22%), « Épisode 4 — Sous-titre » (violet clair, 26%→52%).
    - Piste Vidéo : « plage_coucher.mp4 » (bleu rayé, 0→44%), « ville_nuit.mp4 » (44.5%→78.5%).
    - Piste Image : « logo.png » (vert, 1%→16%).
    - Piste Audio : bloc « waveform » vert (SVG polyligne) 0→78%.
  - **Tête de lecture (playhead)** : ligne verticale rouge `#ff5f57` 2px à `left: 38%`, avec poignée carrée 12×12 en haut. Traverse règle + lanes.

---

## Interactions & comportement
- **Navigation** :
  - Accueil → « Nouveau projet » = ouvre la modale.
  - Accueil → carte projet récent = va à l'éditeur.
  - Modale → « Annuler » ou croix = ferme la modale. → « Créer le projet » = va à l'éditeur (transporte résolution + fps vers le badge de la top bar).
  - Éditeur → clic logo/wordmark top-left = retour accueil.
- **Sélection de catégorie** : clic sur un bouton du rail gauche change le contenu de la bibliothèque (état actif mis à jour).
- **Ajout / sélection d'élément** : clic sur un item de la bibliothèque « Texte » ou « Images » ajoute/sélectionne l'élément correspondant sur le canvas et **ouvre le panneau de propriétés adapté**. Clic sur un élément du canvas OU sur un clip de la timeline = sélectionne cet élément (met à jour l'outline + le panneau droit). Cliquer une zone sans élément → panneau « aucune sélection ».
- **Lecture** : le bouton play/pause central bascule l'icône (▶/‖‖). (Dans le prototype c'est un toggle visuel ; en implémentation réelle, câbler au moteur de lecture.)
- **Transitions/animations** : modale = pop `.22s cubic-bezier(.2,.8,.3,1)` + overlay fade `.18s` ; contenu bibliothèque = fade `.2s` ; panneau propriétés = pop `.2s`. Hovers : boutons primaires `brightness(1.08)` (+ `translateY(-1px)` sur l'accueil) ; cartes récentes `translateY(-2px)` ; items de liste/tuiles → changement de `border-color` vers l'accent de la catégorie.

## State management
Variables d'état minimales (nommage indicatif) :
- `screen` : `'home' | 'editor'` (défaut `home`).
- `showModal` : booléen (défaut `false`).
- `projectName` : string (« Vlog Été 2026 »).
- `resolution` : `'16:9' | '9:16' | '1:1' | '4k'` (défaut `16:9`) → mappe vers dimensions affichées.
- `fps` : `24 | 30 | 60` (défaut `30`).
- `leftTab` (catégorie active) : `'text' | 'video' | 'image' | 'audio' | 'shape'` (défaut `text`).
- `selectedId` : id de l'élément sélectionné ou `null` (`'title' | 'subtitle' | 'logo' | null`) → pilote l'outline canvas, les clips en surbrillance et le contenu du panneau droit.
- `playing` : booléen (défaut `false`).

Transitions clés : « Créer le projet » → `showModal=false, screen='editor'`. Clic élément → `selectedId=<id>`. Clic catégorie → `leftTab=<cat>`. En prod, ajouter le vrai modèle de données (liste d'éléments, clips avec `start`/`duration`/`track`, médias importés, moteur de rendu du canvas).

---

## Design tokens

**Couleurs — fonds**
- `#0b0b0f` fond le plus profond (stage canvas, inputs sombres via `#0f0f15`)
- `#0f0f15` fond app / champs
- `#131319` barres (top bar, rail, timeline)
- `#16161d` panneaux (bibliothèque, propriétés, modale)
- `#1a1a22` / `#20202a` cartes surélevées

**Couleurs — texte**
- `#e9e9f0` texte principal ; `#c9c9d4` texte fort secondaire
- `#9a9aa8` texte atténué ; `#6b6b78` faible ; `#5a5a68` très faible (labels placeholder)

**Bordures**
- `rgba(255,255,255,0.06)` / `0.07` séparateurs fins ; `0.09`–`0.12` bordures de champs/boutons

**Accents**
- Primaire `#5c86ff` (bleu) — variable `--accent`
- Secondaire `#a45cff` (violet) — variable `--accent2`
- Dégradé signature : `linear-gradient(135deg, #5c86ff, #a45cff)`
- Couleurs par type d'élément : Vidéo `#5c86ff` · Texte `#a45cff` · Image/Audio-vert `#2fc4b6` (image) / `#38d17a` (audio) · Formes `#ff8a5c`
- Playhead / feu « fermer » : `#ff5f57`
- Les accents primaire/secondaire sont **thémables** (exposés en tweaks dans le proto : bleu/teal/vert/orange & violet/bleu/rose/teal).

**Typographie**
- UI : **Manrope** (400/500/600/700/800). Poids courants : 600 (labels), 700 (titres de section), 800 (titres/wordmark).
- Chiffres, timecodes, dimensions, hints : **JetBrains Mono** (400/500/700).
- Import proto : Google Fonts (`Manrope`, `JetBrains Mono`). Dans le codebase, utiliser l'équivalent du design system s'il existe.
- Échelle observée : wordmark 26px ; titres modale/section 18px ; corps 13–15px ; labels 11–12.5px ; hints 9–11px mono. `letter-spacing` négatif (`-0.01/-0.02em`) sur les gros titres, positif (`0.08–0.14em`) sur les labels uppercase.

**Rayons**
- Boutons/champs 9–13px · panneaux/cartes 11px · modale 18px · pastilles 8–9px · clips timeline 6px · logo home 15px.

**Ombres**
- Boutons primaires : `0 10px 30px rgba(92,134,255,0.36)` (home) / `0 5px 16px rgba(92,134,255,0.32)` (top bar).
- Modale : `0 30px 90px rgba(0,0,0,0.6)`. Cadre canvas : `0 24px 70px rgba(0,0,0,0.6)`.

**Espacements** — échelle de type 4/6/8 : gaps courants 6/7/8/9/14px ; paddings de panneaux 14–16px ; sections `gap: 18–22px`.

**Largeurs fixes** — rail 74px · bibliothèque 264px · propriétés 300px · labels timeline 104px. Hauteurs : top bar 50px · toolbars 40–42px · barre lecture 46px · timeline 230px · rangée de piste 36px.

---

## Assets
Aucun asset binaire n'est requis. Tout est vectoriel/CSS dans le prototype :
- **Icônes** : SVG inline simples (play, +, download, undo/redo, alignement, corbeille, dupliquer, loupe, formes…). À remplacer par la bibliothèque d'icônes du codebase (ex. Lucide/Feather) — les glyphes utilisés sont volontairement standards.
- **Vignettes / médias** : **placeholders** (dégradés rayés `repeating-linear-gradient`) avec labels monospace. En prod, remplacer par les vraies vignettes de médias importés.
- **Waveform audio** : SVG polyligne décorative (piste audio). En prod, générer depuis l'analyse du fichier audio.
- **Polices** : Manrope + JetBrains Mono (Google Fonts) — ou équivalents du design system cible.

## Fichiers de ce bundle
- `LightEditorVidz.dc.html` — le prototype HTML complet (les 3 vues + interactions). Ouvrir dans un navigateur pour explorer.
- `support.js` — runtime du prototype (référence de rendu uniquement ; **ne pas porter**).
- `screenshots/01-accueil.png` — écran d'accueil.
- `screenshots/02-modale.png` — modale nouvelle vidéo.
- `screenshots/03-editeur-texte.png` — éditeur, élément texte sélectionné.
- `screenshots/04-editeur-image.png` — éditeur, élément image sélectionné.
