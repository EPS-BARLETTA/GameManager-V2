# PouleManager – V2 EPS terrain

PouleManager est une application web statique (HTML/CSS/JS) pensée pour les professeurs d’EPS qui veulent créer, planifier et piloter un tournoi directement sur le terrain (téléphone, tablette, TV). Tout fonctionne hors-ligne : il suffit d’ouvrir `index.html` via un petit serveur local.

## Lancer l’application
1. Copier le dossier `PouleManager` sur votre machine.
2. Depuis ce dossier, lancer un serveur statique basique :
   ```bash
   python3 -m http.server 4173
   ```
3. Ouvrir [http://localhost:4173/index.html](http://localhost:4173/index.html) dans Chrome, Edge ou Safari (desktop/mobile).
4. Optionnel : ajouter la page à l’écran d’accueil pour un affichage plein écran.

## Nouveau parcours utilisateur
1. **Accueil** – deux cartes seulement (*Sports collectifs* et *Raquettes*) + un bouton « Mode EPS rapide » pour générer un tournoi express hors parcours guidé.
2. **Univers dédié** – après le clic, seules les variantes utiles apparaissent :
   - Sport co : *Championnat* ou *Coupe du monde* (poules + finales).
   - Raquettes : *Poule*, *Montée-descente*, *Défi*.
3. **Étape 2 – Nombre** – compteur + slider adaptés au vocabulaire (équipes ou joueurs).
4. **Étape 3 – Noms** – auto-remplissage, collage massif, normalisation des patronymes raquettes.
5. **Étape 4 – Paramétrage ciblé** – carte récap de l’univers + grille d’options prioritaires différentes selon le mode (durées, terrains arbitrés, nombre de poules, etc.) avec options avancées repliées (pauses, chrono, rôles EPS).
6. **Étape 5 – Résultats** – vue « Gestion » affichée par défaut, carte « Live » et carte « Projection » accessibles via un hub clair « Je consulte / je gère / je projette », raccourcis permanents (Classement, Projection, Chrono) et onglets *Rotations*, *Par équipe* et *Classement*. Un bascule **Lecture / Pilotage** masque les actions tant que l’enseignant ne souhaite que lire la synthèse.

## Univers et modes
### Sports collectifs
- **Championnat** : toutes les équipes se rencontrent, estimation automatique du temps total, rôles sociaux proposés pendant les temps de repos, optimisation au choix (alternance pédagogique ou durée minimale).
- **Coupe du monde** : sélection du nombre de poules (2, 3 ou 4). Hypothèse EPS par défaut : les deux premiers de chaque poule se qualifient (avec meilleur 2ᵉ si 3 poules) pour les demi-finales, match pour la 3ᵉ place et finale.

### Raquettes
- **Poule** : round-robin intégral avec estimation du temps, libellés adaptés aux joueurs.
- **Montée-descente** : champs dédiés « Terrains avec arbitre » / « Terrains sans arbitre », badge visuel sur chaque terrain (Arbitré ou Libre) en gestion et en live, rappel dans le panneau d’options.
- **Défi** : classement vivant avec contrainte ±5. Un clic simple sur un joueur met en surbrillance les cinq places au-dessus et au-dessous (3 s). Un bouton « Saisir un défi » sur chaque ligne ouvre la saisie de score sur iPad/tactile, sans dépendre du double clic.

## Paramétrage ciblé par mode
- La carte de contexte rappelle l’univers actif, le mode choisi et son descriptif.
- La grille prioritaire expose uniquement les champs indispensables (équipes/joueurs, terrains, durée ou créneau disponible, heure de début, heure de fin prévue, optimisation et, selon le mode, terrains arbitrés ou structure de poules).
- Les réglages secondaires regroupent les éléments contextuels : format temps/points, structure de Coupe du monde, légende montée-descente, rappel des interactions du mode Défi.
- Les **options avancées** restent communes (buffer entre matches, pauses, chrono + son/vibration, rôles EPS) et s’ouvrent seulement si besoin.

## Hub Gestion / Live / Projection
- Le bandeau d’étape 5 affiche trois cartes « Je consulte », « Je gère », « Je projette ». Chaque carte agit comme un gros bouton (sélection / ouverture du live / ouverture de la projection plein écran).
- Des **raccourcis persistants** (« Classement », « Projection », « Chrono ») restent visibles dans la zone résultats.
- L’action principale « Démarrer / reprendre le live » et le duo **Modifier / Imprimer** sont regroupés et lisibles sur iPad.
- Un interrupteur **Lecture / Pilotage** contrôle l’affichage des actions : en lecture, seules les synthèses et prévisions s’affichent ; en pilotage, les rotations, saisies et raccourcis avancés réapparaissent.

## Mode Défi tactile
- Après génération, une seule page « Classement Défi » reste visible : aucune zone de saisie fixe, juste la liste des joueurs classés.
- Tap/clic simple = fenêtre ±5 places pendant 3 s (effet valable en projection) ; retaper sur soi ou utiliser le bouton **Défi** déclenche la saisie.
- La sélection touche → modale = joueur strictement identique : la fenêtre ±5 et les adversaires proposés sont recalculés depuis le classement courant.
- Toute saisie se fait dans une modale plein centre (`.modal-overlay`) au design compact (adversaire, scores, actions alignés) ; le classement reste visible derrière, légèrement atténué.
- Un bandeau discret ajoute un bouton **Quitter** (retour direct vers les paramètres) et trois raccourcis (Résultats, Projection, Paramètres) pour changer de contexte sans quitter le terrain des yeux.
- Les scores s’affichent dans la modale avec l’adversaire prérempli et focus direct sur la saisie tactile. Le double clic desktop reste supporté.
- Un encart « Dernier défi » permanent affiche le duel le plus récent avec un bouton **Modifier** qui rouvre la modale préremplie. La correction remplace automatiquement le duel précédent sans casser le classement.
- La logique EPS reste inchangée : victoire sur un joueur mieux classé ⇒ échange immédiat des positions, sinon classement intact. Les joueurs marqués « Indisponible » restent gris et non interactifs.

## Classement et statut *Indisponible*
- Un bouton « Classement » visible dans la zone résultats et dans le menu `Outils` ouvre le panneau dédié sans casser la navigation. Le bouton reste actif dans les vues live et chrono.
- Les statuts « Blessé » / « Neutralisé » fusionnent en un unique statut **Indisponible** : l’équipe reste visible mais sa ligne et ses matchs futurs sont neutralisés automatiquement (badge gris, scores désactivés, estimation recalculée). L’action est accessible depuis `Outils` ou le live.

## Montée-descente lisible
- Les terrains configurés « avec arbitre » / « sans arbitre » sont indiqués directement sur les cartes terrain (résultats et live) via des badges Arbitré / Libre.
- Une légende intégrée explique la répartition et rappelle le comportement (gain ⇒ montée, perte ⇒ descente, terrains libres autonomes).

## Live, projection et chrono
- **Live enseignant** : scores tactiles, rôles EPS, badge terrain (Arbitré/Libre), boutons rapides (classement, chrono, projection), neutralisation automatique en cas d’indisponibilité.
- **Projection** : plein écran synchronisé (rotation, chrono/reste, terrains, prochaine rotation, élèves au repos). Le raccourci « Projection » accessible dans les résultats ouvre directement cette vue.
- **Chrono plein écran** : timer XXL avec matchs listés, bouton « Rotation suivante », badges de terrains + rôles, synchronisé avec le live.
- **Widget chrono** flottant toujours disponible quand le chrono est activé dans les options.

## Planification, estimation et impression
- Résumés pédagogiques conservés : volume de jeu, transitions, pauses, durée réelle, fin prévue, matches par terrain, temps d’attente moyen, engagement moteur.
- Simulation et configuration recommandée restent accessibles via les boutons dédiés pour valider la faisabilité du créneau EPS.
- La recommandation calcule désormais le créneau réel (début/fin) et propose jusqu’à trois profils (Optimisé pratique, Équilibré, Confort terrain) en privilégiant le temps de jeu effectif et l’engagement moteur.
- Le mode **Impression/PDF** masque la navigation, garde le thème adapté à l’univers et reste pensé pour une distribution terrain (rôles, terrains, classements visibles, noir & blanc lisible).

## Identité visuelle et thèmes
- Le choix de l’univers applique un thème global (accent sport co orangé, raquettes bleu) sur badges, boutons principaux, onglets actifs et capsules clés (mode actif, projection, live).
- La topbar est allégée : badges univers/mode centrés et un bouton `Outils` unique qui regroupe les actions secondaires (Classement, Statut indisponible, Imprimer).

## Mode EPS rapide
Toujours disponible depuis l’accueil : renseignez participants, terrains, durée, heure de début et pratique, activez Arbitre / Table si besoin puis « Générer rapidement ». Le tournoi obtenu peut être retravaillé ensuite dans le parcours guidé (paramétrage ciblé, simulation, etc.).

## Menu Outils
Le bouton `Outils` (dans la topbar) ouvre un mini panneau contextuel accessible à tout moment (Classement, Statut indisponible, Imprimer). L’ouverture/fermeture gère automatiquement le clic extérieur et la navigation clavier, ce qui le rend exploitable en situation terrain sur iPad comme sur desktop.
