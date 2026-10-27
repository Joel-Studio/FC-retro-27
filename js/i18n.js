/* =============================================================================
 * i18n.js  -  Mode français
 * -----------------------------------------------------------------------------
 * A phrase table (English -> French) plus a few patterns for lines that carry a name or a score. RUT.i18n.t(text) is used
 * by the match engine (ticker, events, floating texts, scoreboard words) and a DOM pass translates every menu, label and
 * button on the page (and keeps doing it as the page re-renders). Anything not in the table stays in English.
 * Player names, club names and card stats are never touched.
 * ========================================================================== */
(function () {
  const RUT = window.RUT = window.RUT || {};

  const D = {
    // ----- navigation
    'Home': 'Accueil', 'Club': 'Club', 'My Club': 'Mon club', 'Squad & Chemistry': 'Effectif et alchimie', 'Evolutions': 'Évolutions', 'Unassigned': 'Non attribués',
    'Play': 'Jouer', 'Kick Off': 'Coup d\'envoi', 'Casual Match': 'Match amical', 'Online Match': 'Match en ligne', 'Testing Ground': 'Terrain d\'essai', 'Match Rules': 'Règles du match',
    'Market': 'Marché', 'Search': 'Recherche', 'Transfer List': 'Liste de transferts', 'Watchlist': 'Liste de suivi', 'SBCs': 'DCE', 'Store': 'Boutique', 'Settings': 'Réglages',
    'Squad': 'Effectif', 'Transfer Market': 'Marché des transferts', 'Squad Building Challenges': 'Défis de composition d\'équipe', 'SBC Builder': 'Constructeur de DCE',
    'Match & UT Rules': 'Règles du match et d\'Ultimate Team', 'How the engine enforces FC 27 rules in this game.': 'Comment le moteur applique les règles de FC 27 dans ce jeu.',
    'FC RETRO 27': 'FC RETRO 27', 'FC 27 · 2D ARCADE EDITION': 'FC 27 · ÉDITION ARCADE 2D', 'FC 27 · ULTIMATE TEAM': 'FC 27 · ULTIMATE TEAM',
    'A 1999 pixel engine with a modern Ultimate Team.': 'Un moteur pixel de 1999 avec un Ultimate Team moderne.',
    'Ratings are estimates. Saves live in this browser.': 'Les notes sont des estimations. Les sauvegardes restent dans ce navigateur.',
    'Trade': 'Échanges', 'Transfer Market ': 'Marché des transferts',
    // ----- home
    'WELCOME TO FC RETRO 27': 'BIENVENUE DANS FC RETRO 27', 'Play it in 1999.': 'Jouez comme en 1999.', 'Build your club.': 'Construisez votre club.',
    'Open packs, trade on a live market, complete SBCs and take your XI onto a pixel pitch where every rule counts.': 'Ouvrez des packs, échangez sur un marché en direct, relevez des DCE et menez votre XI sur un terrain pixel où chaque règle compte.',
    'Welcome to FC RETRO 27. Your starter XI is ready.': 'Bienvenue dans FC RETRO 27. Votre XI de départ est prêt.',
    '▶ Kick Off': '▶ Coup d\'envoi', '▶ Kick off': '▶ Coup d\'envoi', '▶ Play Match': '▶ Jouer un match', 'Open Packs': 'Ouvrir des packs', 'Open packs': 'Ouvrir des packs',
    'View Unassigned': 'Voir les non attribués', 'Market Pulse': 'Pouls du marché', 'Movers (24h)': 'Mouvements (24 h)', 'Quiet market.': 'Marché calme.',
    'Open packs → store or sell items → trade on the Market (5% tax) → complete SBCs for promo packs and cards → push cheap cards through Evolutions → win matches for coins.': 'Ouvrez des packs → rangez ou vendez les objets → échangez sur le marché (5 % de taxe) → relevez des DCE pour des packs et cartes promo → faites évoluer des cartes bon marché → gagnez des matchs pour des pièces.',
    'You start with': 'Vous commencez avec', ', a starter XI, a Starter Pack and a Gold Pack.': ', un XI de départ, un pack de départ et un pack or.', 'Open your Gold Pack': 'Ouvrez votre pack or',
    'Record': 'Bilan', 'Results': 'Résultats', 'Goals': 'Buts', 'Squad Rating': 'Note de l\'effectif', 'Chemistry': 'Alchimie', 'Winning': 'Victorieux',
    'Squad rating uses FC\'s weighted formula: players above the average add their excess again before dividing by 11.': 'La note d\'effectif suit la formule pondérée de FC : les joueurs au-dessus de la moyenne comptent leur excédent une seconde fois avant la division par 11.',
    'Ratings for the 150 headline players are estimates (FC 27 ratings aren\'t public). Everything saves to your browser\'s LocalStorage.': 'Les notes des 150 joueurs vedettes sont des estimations (les notes de FC 27 ne sont pas publiques). Tout est sauvegardé dans le stockage local de votre navigateur.',
    // ----- play / kick off
    'Opponent': 'Adversaire', 'Half length (real seconds)': 'Durée d\'une mi-temps (secondes réelles)', 'Your team\'s style': 'Style de votre équipe', 'Opponent\'s style': 'Style de l\'adversaire',
    'Auto (a random style)': 'Auto (style aléatoire)', 'Knockout tie (draw → penalty shootout, ABAB + sudden death)': 'Match à élimination (nul → tirs au but, ABAB + mort subite)',
    '▶ Play (you control)': '▶ Jouer (vous contrôlez)', 'Watch AI vs AI': 'Regarder IA contre IA', 'Quick Sim': 'Simulation rapide', 'Play online': 'Jouer en ligne',
    'Online Match · 2 players, 2 computers': 'Match en ligne · 2 joueurs, 2 ordinateurs', 'Casual Match · 2 players': 'Match amical · 2 joueurs', 'Set up a casual match': 'Préparer un match amical',
    'Testing Ground · 1 player': 'Terrain d\'essai · 1 joueur', 'Open the testing ground': 'Ouvrir le terrain d\'essai',
    'Host a game and share the game code, or enter your friend\'s code, and play each other with your own club XI on the huge pitch.': 'Créez une partie et partagez le code, ou entrez le code de votre ami, et affrontez-vous avec votre XI sur l\'immense terrain.',
    'Build two teams from any players in the game and play a friend on one keyboard or two gamepads. No coins, no DNF.': 'Composez deux équipes avec n\'importe quels joueurs du jeu et jouez contre un ami sur un clavier ou deux manettes. Pas de pièces, pas d\'abandon.',
    'A huge empty pitch for you alone, or a full CPU team to play against (Opponent AI). Pick any player, then add cones, pressing defenders, attackers, a keeper or team-mates, and feed crosses to test everything. Live speed and strike read-out. No clock, fouls or rewards.': 'Un immense terrain vide rien que pour vous, ou une équipe complète de l\'ordinateur à affronter (IA adverse). Choisissez un joueur, puis ajoutez des plots, des défenseurs, des attaquants, un gardien ou des coéquipiers, et servez des centres pour tout tester. Vitesse et frappes en direct. Ni chrono, ni fautes, ni récompenses.',
    'Your XI needs 11 players. Go to Squad → Auto-build.': 'Votre XI a besoin de 11 joueurs. Allez dans Effectif → Composition auto.',
    'Rewards: coins scale with opponent difficulty, result and goals. Evolving players progress only if they start.': 'Récompenses : les pièces dépendent de la difficulté, du résultat et des buts. Les joueurs en évolution progressent seulement s\'ils débutent.',
    'Controls': 'Commandes', 'Skill moves on the ball (hold a direction):': 'Gestes techniques avec le ballon (maintenez une direction) :',
    'move ·': 'déplacement ·', 'sprint': 'sprint', 'pass · defending: standing tackle': 'passe · en défense : tacle debout', 'shoot (↑/↓ aim) · defending: slide': 'tir (↑/↓ pour viser) · en défense : tacle glissé',
    'through ball · defending: switch player': 'passe en profondeur · en défense : changer de joueur', 'lob / long ball / cross · defending: hold for a team-mate to press': 'lob / long ballon / centre · en défense : maintenir pour qu\'un coéquipier presse',
    'ball roll ·': 'roulette ·', 'stepover ·': 'passement de jambes ·', 'body feint ·': 'feinte de corps ·', 'knock-and-run. Pass goes to the team-mate you face; more power reaches further. Shots plant your feet and rise with power.': 'ballon devant et course. La passe va au coéquipier que vous regardez ; plus de puissance porte plus loin. Les tirs plantent vos pieds et montent avec la puissance.',
    'Hold any of them on the ball to fill the power bar: green = sweet spot for shots, white tick = ideal pass weight.': 'Maintenez-en une avec le ballon pour remplir la jauge : vert = zone idéale pour les tirs, repère blanc = poids de passe idéal.',
    'camera TV / wide / close ·': 'caméra TV / large / proche ·', 'pause': 'pause', 'Pause': 'Pause', 'Resume': 'Reprendre', 'Quit': 'Quitter', 'Speed x1': 'Vitesse x1',
    'pass': 'passe', 'shoot': 'tir', 'thru': 'profondeur', 'lob': 'lob', 'roll': 'roulette', 'step': 'passement', 'feint': 'feinte', 'knock-on': 'ballon devant', 'PASS': 'PASSE', 'SHOOT': 'TIR', 'THRU': 'PROF.', 'LOB': 'LOB', 'ROLL': 'ROUL.', 'SKILL': 'TECH.', 'STEP': 'PASS.', 'FEINT': 'FEINTE', 'RUN': 'COURSE',
    'Camera: TV': 'Caméra : TV', 'Camera: Wide': 'Caméra : large', 'Camera: Close': 'Caméra : proche',
    'Sit back and enjoy the pixels.': 'Installez-vous et profitez des pixels.', 'AI vs AI': 'IA contre IA', 'click to skip': 'cliquer pour passer',
    'Easy': 'Facile',
    // ----- match results / flow
    'Continue': 'Continuer', 'Rematch': 'Revanche', 'Back': 'Retour', 'Back to teams': 'Retour aux équipes', 'Back to Online': 'Retour au mode en ligne', 'Keep playing': 'Continuer à jouer',
    'YOU WIN!': 'VOUS GAGNEZ !', 'Reward:': 'Récompense :', '· You get': '· Vous recevez', ', you receive': ', vous recevez', 'Match events': 'Événements du match', 'Match ': 'Match ',
    'DNF: match abandoned. No rewards, and -100 coins on future matches.': 'Abandon : match quitté. Aucune récompense et -100 pièces sur les prochains matchs.',
    'Possession': 'Possession', 'Shots': 'Tirs', 'On target': 'Cadrés', 'Passes': 'Passes', 'Tackles': 'Tacles', 'Fouls': 'Fautes', 'Corners': 'Corners',
    // ----- squad / club / market (common)
    'Auto-build best XI': 'Composition auto du meilleur XI', 'Best XI': 'Meilleur XI', 'Clear': 'Vider', 'Squad · 4-3-3': 'Effectif · 4-3-3', 'My club XI': 'Mon XI', 'Choose player': 'Choisir un joueur',
    'Empty slot': 'Poste vide', 'Empty.': 'Vide.', 'empty': 'vide', 'OUT OF POS': 'HORS POSTE', 'Change role': 'Changer le rôle', 'View card · stats · traits · role': 'Voir la carte · stats · traits · rôle',
    'Roles': 'Rôles', 'Traits': 'Traits', 'Role': 'Rôle', 'Role: Auto': 'Rôle : auto', 'PlayStyles+': 'Styles de jeu+', 'PlayStyles+ in XI': 'Styles de jeu+ dans le XI', 'PlayStyles+ on the pitch': 'Styles de jeu+ sur le terrain',
    'Chemistry Style': 'Style d\'alchimie', 'Full boost at 3 chem, partial at 1–2, none at 0.': 'Bonus complet à 3 d\'alchimie, partiel à 1–2, nul à 0.', 'Chem: club 2/5/8 · nation 2/5/8 · league 3/5/8 in-position players = 1/2/3 pts (max 3 each). Out-of-position players get 0.': 'Alchimie : club 2/5/8 · nation 2/5/8 · ligue 3/5/8 joueurs à leur poste = 1/2/3 pts (max 3 chacun). Hors poste = 0.',
    '(tap a role to change it · tap a name for stats and traits)': '(touchez un rôle pour le changer · touchez un nom pour les stats et traits)', '(how the AI plays him)': '(comment l\'IA le fait jouer)',
    'Any position': 'Tout poste', 'Any club': 'Tout club', 'Any league': 'Toute ligue', 'Any pos': 'Tout poste', 'Any rarity': 'Toute rareté', 'Name': 'Nom', 'Nation': 'Nation', 'League': 'Ligue', 'Club / League': 'Club / Ligue',
    'Position': 'Poste', 'Pos': 'Poste', 'Rarity': 'Rareté', 'Rating': 'Note', 'OVR': 'NOT', 'Player': 'Joueur', 'Price*': 'Prix*', 'Price': 'Prix', 'Status': 'Statut', 'Time': 'Durée', 'Value': 'Valeur', 'Duration': 'Durée',
    'PAC': 'VIT', 'SHO': 'TIR', 'DEF': 'DÉF',
    'Search market': 'Chercher sur le marché', 'Set filters and hit Search.': 'Réglez les filtres puis lancez la recherche.', 'No players match.': 'Aucun joueur ne correspond.', 'Reset': 'Réinitialiser',
    'Rating min / max': 'Note min / max', 'Buy Now min / max': 'Achat immédiat min / max', 'Buy Now': 'Achat immédiat', 'Bid': 'Enchérir', 'Buy': 'Acheter', 'Buy & Open': 'Acheter et ouvrir', 'Outbid': 'Surenchéri', 'Winning ': 'Gagnant', 'Expired': 'Expiré', 'Active': 'Actif', 'Activity': 'Activité', 'Available': 'Disponible',
    '*Price = live FUTBIN-style tracked price. Click a name for the price graph.': '*Prix = prix suivi en direct, façon FUTBIN. Cliquez sur un nom pour voir le graphique.', 'Price history (FUTBIN-style)': 'Historique des prix (façon FUTBIN)',
    'Promo cards are untradeable; graph shows the base card.': 'Les cartes promo ne sont pas échangeables ; le graphique montre la carte de base.', 'Tax calculator': 'Calculateur de taxe', 'EA takes 5% of every sale.': 'EA prélève 5 % sur chaque vente.',
    'List item': 'Mettre en vente', 'List on Transfer Market': 'Mettre sur le marché des transferts', 'Start price': 'Prix de départ', 'Relist': 'Remettre en vente', 'Clear sold': 'Effacer les vendus', 'Not listed': 'Non listé', 'Nothing listed.': 'Rien en vente.',
    'List items from your Club or Unassigned pile (click a card → List). AI buyers snipe fair Buy Now prices; overpriced cards expire.': 'Mettez en vente des objets de votre club ou des non attribués (cliquez une carte → Vendre). Les acheteurs IA raflent les prix corrects ; les cartes trop chères expirent.',
    'Bid on players to track them here. Won auctions go to Unassigned.': 'Enchérissez sur des joueurs pour les suivre ici. Les enchères gagnées arrivent dans Non attribués.',
    'Click a card to store it, quick sell it, or list it on the Transfer Market.': 'Cliquez une carte pour la ranger, la vendre rapidement ou la mettre sur le marché.',
    'Send all to Club': 'Tout envoyer au club', 'Send to Club': 'Envoyer au club', 'To Club': 'Au club', 'Go to Unassigned': 'Aller aux non attribués', 'Quick sell all': 'Tout vendre rapidement', 'SBC Storage': 'Stockage DCE', 'Sent to club': 'Envoyé au club',
    'Stored in SBC Storage': 'Rangé dans le stockage DCE', 'All items sent to club': 'Tous les objets envoyés au club', 'Bulk quick sell': 'Vente rapide en masse', 'Best XI selected': 'Meilleur XI sélectionné', 'Nothing waiting. Open a pack!': 'Rien en attente. Ouvrez un pack !',
    'Untradeable': 'Non échangeable', 'DUPLICATE': 'DOUBLON', 'None': 'Aucun', 'None yet': 'Aucun pour l\'instant', 'Select': 'Choisir', 'Pick': 'Choisir', 'View': 'Voir', 'Open': 'Ouvrir', 'Open now': 'Ouvrir maintenant', 'Later': 'Plus tard', 'Opening…': 'Ouverture…',
    'No packs. Visit the Store or complete SBCs.': 'Aucun pack. Passez à la boutique ou relevez des DCE.', 'My Packs': 'Mes packs', 'Pack contents': 'Contenu du pack', '+ guaranteed': '+ garanti', 'SBC COMPLETE!': 'DCE TERMINÉ !', 'Your reward is waiting in Unassigned.': 'Votre récompense vous attend dans Non attribués.',
    'Requirements': 'Conditions', 'Submit': 'Valider', 'Start': 'Commencer', 'Eligibility:': 'Éligibilité :', 'Auto-fill (best + cheapest)': 'Remplissage auto (meilleur + moins cher)', 'Reserve pool': 'Réserve', 'ready to submit': 'prêt à valider',
    'Submitted players are consumed. Players in your starting XI are protected and can\'t be used.': 'Les joueurs validés sont consommés. Les joueurs de votre XI de départ sont protégés et inutilisables.',
    'Starting an Evolution makes the item untradeable.': 'Lancer une évolution rend l\'objet non échangeable.', 'No active Evolutions.': 'Aucune évolution en cours.', 'In your starting XI': 'Dans votre XI de départ', 'In XI — progressing': 'Dans le XI — progresse', 'Not in XI — add to squad to progress': 'Hors XI — ajoutez-le à l\'effectif pour progresser',
    'No eligible players in your club.': 'Aucun joueur éligible dans votre club.', 'No available players. Buy some on the market or open packs.': 'Aucun joueur disponible. Achetez-en ou ouvrez des packs.',
    'Players in your active XI are hidden to protect your squad.': 'Les joueurs de votre XI actif sont masqués pour protéger l\'effectif.', 'Players already in the XI will swap places.': 'Les joueurs déjà dans le XI échangeront leur place.',
    'Reset save': 'Réinitialiser la sauvegarde', 'Reset your save?': 'Réinitialiser votre sauvegarde ?', 'Coins, club and progress will be wiped.': 'Pièces, club et progression seront effacés.', 'Fresh save created.': 'Nouvelle sauvegarde créée.',
    // ----- casual / online / testing ground
    'Player 1': 'Joueur 1', 'Player 2': 'Joueur 2', 'Swap sides': 'Inverser les côtés', 'Home XI': 'XI domicile', 'Away XI': 'XI extérieur', 'Random': 'Aléatoire', 'Pick any players in the game for both teams. No coins, no DNF. Hold pass / shoot / through / lob to fill the power bar; the result depends on that player\'s stats.': 'Choisissez n\'importe quels joueurs pour les deux équipes. Pas de pièces ni d\'abandon. Maintenez passe / tir / profondeur / lob pour remplir la jauge ; le résultat dépend des stats du joueur.',
    'CPU vs CPU: sit back and watch.': 'Ordi contre ordi : installez-vous et regardez.', '▶ Start match': '▶ Lancer le match', 'Host a game': 'Créer une partie', 'Join a game': 'Rejoindre une partie', 'Join': 'Rejoindre', 'Game code': 'Code de partie', 'How it plays': 'Comment ça se joue',
    'Tell your friend this code. It works while this screen is open.': 'Donnez ce code à votre ami. Il fonctionne tant que cet écran reste ouvert.', 'Enter the game code.': 'Entrez le code de la partie.', 'Connected. Swapping squads...': 'Connecté. Échange des effectifs...', 'Ready. Pick the options and start.': 'Prêt. Choisissez les options et lancez.',
    'Squads swapped.': 'Effectifs échangés.', 'Squads swapped. Waiting for the host to start the match...': 'Effectifs échangés. En attente du lancement par l\'hôte...', 'Starting...': 'Démarrage...', 'Online play is not available in this build.': 'Le jeu en ligne n\'est pas disponible dans cette version.',
    'The other player stopped responding. Match ended.': 'L\'autre joueur ne répond plus. Match terminé.', 'The other player left.': 'L\'autre joueur est parti.', 'The other player left the match.': 'L\'autre joueur a quitté le match.', 'WAITING FOR OPPONENT': 'EN ATTENTE DE L\'ADVERSAIRE', 'WAITING FOR OPPONENT...': 'EN ATTENTE DE L\'ADVERSAIRE...', 'OUT OF SYNC - QUIT AND REMATCH': 'DÉSYNCHRONISÉ - QUITTEZ ET REFAITES UN MATCH', 'ONLINE MATCH': 'MATCH EN LIGNE',
    'Play a friend over the internet with your own club XI on the huge pitch. One of you hosts and shares the game code, the other types it in. You both need this page open from the shared artifact link, signed in to claude.ai, with Contributor access or higher. Matches are for fun: no coins or rewards.': 'Jouez contre un ami par internet avec votre XI sur l\'immense terrain. L\'un de vous crée la partie et partage le code, l\'autre le saisit. Vous devez tous deux ouvrir cette page depuis le lien partagé, connectés à claude.ai, avec un accès contributeur ou plus. Les matchs sont pour le plaisir : ni pièces ni récompenses.',
    'Both machines run the same match; only button presses travel, delayed by about 0.13 s so they stay in step. Controls are the same as Kick Off: you control your own team, the host plays from the left, the guest from the right.': 'Les deux machines font tourner le même match ; seules les touches voyagent, retardées d\'environ 0,13 s pour rester synchronisées. Les commandes sont celles du coup d\'envoi : vous contrôlez votre équipe, l\'hôte joue à gauche, l\'invité à droite.',
    'Opponent AI · a full CPU team that attacks and defends (turns the cones and defenders above off)': 'IA adverse · une équipe complète de l\'ordinateur qui attaque et défend (désactive les plots et défenseurs ci-dessus)',
    'Setup ▾': 'Réglage ▾', 'Setup ▸': 'Réglage ▸', 'Pitch': 'Terrain', 'Huge 160x116': 'Immense 160x116', 'Large 130x96': 'Grand 130x96', 'Standard 105x80': 'Standard 105x80', 'Cones (still)': 'Plots (immobiles)', 'Defenders (press)': 'Défenseurs (pressing)', 'Attackers (you defend)': 'Attaquants (vous défendez)',
    'World class': 'Classe mondiale', 'Opponents': 'Adversaires', 'Team-mates (play it back)': 'Coéquipiers (renvoyez-leur le ballon)', 'Their keeper': 'Leur gardien', 'No keeper (their goal is open)': 'Pas de gardien (but ouvert)', 'No keeper for me': 'Pas de gardien pour moi', 'My keeper in goal': 'Mon gardien dans le but',
    'Goalkeeper (cones / defenders modes)': 'Gardien (modes plots / défenseurs)', 'Ball to feet · B': 'Ballon aux pieds · B', 'Cross · F': 'Centre · F', 'Ground ball · G': 'Ballon rasant · G', 'Reset all · N': 'Tout réinitialiser · N', 'Opponent AI': 'IA adverse', 'Their style': 'Leur style', 'Your style': 'Votre style',
    // ----- rules page
    'Clock': 'Chronomètre', 'Offside': 'Hors-jeu', 'Fouls & cards': 'Fautes et cartons', 'Restarts': 'Remises en jeu', 'Stamina & PlayStyles+': 'Endurance et styles de jeu+', 'Ultimate Team': 'Ultimate Team',
    '2 halves of 45 game-minutes, scaled to your chosen half length': '2 mi-temps de 45 minutes de jeu, adaptées à la durée choisie', 'Stoppage time +1 to +6 per half, built from fouls, cards and goal celebrations': 'Temps additionnel de +1 à +6 par mi-temps, selon fautes, cartons et célébrations',
    'Knockout ties: a draw goes to an ABAB penalty shootout, then sudden death': 'Élimination directe : un nul mène à une séance de tirs au but ABAB, puis à la mort subite', 'Checked at the exact frame a teammate passes': 'Vérifié à l\'instant exact de la passe d\'un coéquipier',
    'Offside position: past the ball and the second-last defender (0.25m body margin), in the opponent half': 'Position de hors-jeu : devant le ballon et l\'avant-dernier défenseur (marge de 0,25 m), dans le camp adverse', 'Penalised only when the player touches the ball, including rebounds off a save': 'Sanctionné seulement si le joueur touche le ballon, rebonds sur arrêt compris',
    'No offside directly from a goal kick, corner or throw-in': 'Pas de hors-jeu direct sur dégagement, corner ou touche', 'Slides from behind, reckless slides and careless tackles can be fouls': 'Les tacles par derrière, imprudents ou négligents peuvent être des fautes',
    'Advantage: play on for 2.5s while the fouled team keeps the ball, otherwise it comes back for a free kick': 'Avantage : le jeu continue 2,5 s tant que l\'équipe fautée garde le ballon, sinon coup franc', 'Yellow: reckless or from-behind tackles, persistent fouling (3 fouls), stopping a fast break': 'Jaune : tacles imprudents ou par derrière, fautes répétées (3), contre-attaque stoppée',
    'Red: second yellow, DOGSO outside the box, violent conduct': 'Rouge : second jaune, occasion de but annihilée hors surface, conduite violente', 'DOGSO in the box: penalty plus yellow when playing the ball': 'Occasion annihilée dans la surface : penalty plus jaune si le défenseur joue le ballon',
    'Direct free kick for physical fouls, with the wall 9.15m back': 'Coup franc direct pour les fautes physiques, mur à 9,15 m', 'Indirect free kick (goalkeeper holding over 6s, offside): a goal straight from it does not count': 'Coup franc indirect (gardien qui garde plus de 6 s, hors-jeu) : un but direct ne compte pas',
    'Penalty: keeper stays on the line until the kick': 'Penalty : le gardien reste sur sa ligne jusqu\'à la frappe', 'Goal kicks, corners, throw-ins': 'Dégagements, corners, touches', 'Below 30% stamina, Acceleration, Sprint Speed and Agility drop proportionally': 'Sous 30 % d\'endurance, accélération, vitesse de sprint et agilité baissent proportionnellement',
    'Rapid+: 2 s speed burst when sprinting with the ball (5 s cooldown)': 'Rapide+ : 2 s de vitesse en sprintant avec le ballon (5 s de recharge)', 'Quick Step+: 3 s sharper acceleration when sprinting without the ball (5 s cooldown)': 'Pas rapides+ : 3 s d\'accélération en sprintant sans ballon (5 s de recharge)', 'Finesse Shot+: +40% curve, faster finesse shots': 'Frappe enroulée+ : +40 % d\'effet, frappes enroulées plus rapides', 'Anticipate+: +35% tackle success, half the foul chance': 'Anticipation+ : +35 % de tacles réussis, deux fois moins de fautes',
    'Trivela+: outside-of-the-boot curve under pressure (purple arc)': 'Trivela+ : effet du coup du pied extérieur sous pression (arc violet)', 'Chemistry: club 2/4/7, league 3/5/8, nation 2/5/8 → 1/2/3 pts, max 33': 'Alchimie : club 2/4/7, ligue 3/5/8, nation 2/5/8 → 1/2/3 pts, max 33',
    'Out-of-position players get 0 chem and give 0': 'Un joueur hors poste a 0 d\'alchimie et n\'en apporte pas', 'Chemistry Styles: full boost at 3 chem, up to +8 to +15': 'Styles d\'alchimie : bonus complet à 3, de +8 à +15', '5% EA tax on every sale, fixed price ranges, max 100 active listings, 1/3/6/12/24h durations': 'Taxe EA de 5 % à chaque vente, fourchettes de prix fixes, 100 annonces actives max, durées de 1/3/6/12/24 h',
    'SBCs must pass every rule at once, then burn all 11 cards': 'Un DCE doit respecter toutes les règles à la fois, puis consomme les 11 cartes', 'Coins = Skill × (Completion + Goals − Conceded + Clean Sheet + Corners/Possession) − DNFs': 'Pièces = Niveau × (Match terminé + Buts − Encaissés + Cage inviolée + Corners/Possession) − Abandons',
    'Rapid+ leaves a yellow trail · Finesse Shot+ curls with a cyan trail · Power Shot+ red streak · Pinged Pass+ laser line · Intercept+ blue ring · Bruiser+ CRUNCH! · Quick Step+ dust burst': 'Rapide+ laisse une traînée jaune · Frappe enroulée+ une traînée cyan · Frappe puissante+ une traînée rouge · Passe laser+ une ligne laser · Interception+ un anneau bleu · Costaud+ CRAC ! · Pas rapides+ un nuage de poussière',
    // ----- team styles, opponents, key hints
    'Sunday League XI': 'XI du dimanche', 'Semi-Pro United': 'Semi-Pro United', 'Pro Athletic': 'Pro Athletic', 'World Class FC': 'FC Classe Mondiale', 'Legendary Galácticos': 'Galácticos Légendaires',
    'Balanced': 'Équilibré', 'Tiki-taka': 'Tiki-taka', 'Gegenpressing': 'Gegenpressing', 'Catenaccio': 'Catenaccio', 'Total football': 'Football total', 'Positional play': 'Jeu de position', 'Low-block counter': 'Bloc bas et contre',
    'Classic wing-play 4-4-2': 'Jeu sur les ailes 4-4-2', 'False nine': 'Faux numéro 9', 'Vertical tiki-taka': 'Tiki-taka vertical', 'Direct long-ball': 'Jeu long direct', 'Bielsa man-to-man': 'Marquage individuel Bielsa', 'Conte 3-5-2': 'Conte 3-5-2',
    'Sacchi zona mista': 'Zone mixte de Sacchi', 'Rest-defence': 'Défense de repos', 'The standard 4-3-3.': 'Le 4-3-3 classique.', 'SHIFT': 'MAJ', 'SPACE': 'ESPACE', 'L-SHIFT': 'MAJ G.', 'R-SHIFT': 'MAJ D.',
    'Play ▾': 'Jouer ▾', 'Market ▾': 'Marché ▾', 'Club ▾': 'Club ▾', 'Setup': 'Réglage', 'Hold': 'Maintenir', 'hold = power': 'maintenir = puissance', 'Dribbling': 'Dribble',
    // ----- settings text
    'Every option in the game. Changes are saved in this browser and apply to the next match.': 'Toutes les options du jeu. Les changements sont sauvegardés dans ce navigateur et valent pour le prochain match.',
    'Hold SHOOT to charge the power bar, release to wind up, then press SHOOT again as the marker reaches the green zone: a green hit is the cleanest strike, a mistimed one drags it wide or weakens it. Hold SHOOT and tap LOB for a chip, THRU for a finesse curler, both for a low driven shot; a full bar is a power shot. SHOOT without the ball near a loose ball in the box strikes it first time: a volley, half-volley or header by its height. Fully assisted skips the timing press and corrects aim and power for you. Online matches use the host\'s choice.': 'Maintenez TIR pour charger la jauge, relâchez pour armer la frappe, puis appuyez de nouveau sur TIR quand le repère atteint la zone verte : une frappe parfaite est la plus nette, un timing raté l\'envoie à côté ou lui retire de la force. Maintenez TIR et touchez LOB pour un lob piqué, PROF. pour une frappe enroulée, les deux pour une frappe rasante ; une jauge pleine donne une frappe de puissance. TIR sans le ballon, près d\'un ballon libre dans la surface, frappe de volée du premier coup : volée, demi-volée ou tête selon sa hauteur. L\'assistance totale supprime le second appui et corrige visée et puissance. En ligne, le choix de l\'hôte s\'applique.',
    'The ball is a real body: spin curves it (Magnus), air drag slows it, grass friction and bounce depend on the surface, and rebounds off posts, keepers and legs come from the simulation.': 'Le ballon est un vrai corps : l\'effet le fait dévier (Magnus), l\'air le freine, frottement et rebond dépendent du terrain, et les rebonds sur poteaux, gardiens et jambes viennent de la simulation.',
    'one press, aim and power corrected': 'un seul appui, visée et puissance corrigées', 'time it for a green hit': 'timing pour une frappe parfaite', 'precise timing, no safety net': 'timing précis, sans filet', 'grips, true bounce': 'adhère, rebond franc', 'skids, runs faster': 'dérape, roule plus vite', 'slow, uneven bounce': 'lent, rebond irrégulier',
    'balanced': 'équilibré', 'heavy, holds its line': 'lourd, garde sa trajectoire', 'swerves and dips': 'dévie et plonge', 'Everything saves to your browser\'s LocalStorage.': 'Tout est sauvegardé dans le stockage local de votre navigateur.',
    'Mode français: menus, commentaires et événements du match.': 'Mode français : menus, commentaires et événements du match.',
    'Hold SHOOT, then press SHOOT again at contact for a green hit · tap LOB = chip, THRU = finesse, both = low driven': 'Maintenez TIR, puis appuyez de nouveau au contact pour une frappe parfaite · LOB = lob piqué, PROF. = enroulée, les deux = rasante',
    // ----- foul reasons, misc labels
    'slide from behind': 'tacle par derrière', 'reckless slide': 'tacle imprudent', 'careless tackle': 'tacle négligent', 'DOGSO, last man': 'occasion annihilée, dernier défenseur', 'violent conduct': 'conduite violente', 'persistent fouling': 'fautes répétées',
    'stopping a fast break': 'contre-attaque stoppée', 'temper': 'mauvais comportement', 'second yellow': 'second jaune', 'Sort: rating': 'Tri : note', 'Sort: value': 'Tri : valeur', 'Sort: name': 'Tri : nom', 'How to play': 'Comment jouer', 'Upgrades': 'Améliorations', 'Build': 'Construire',
    'Starter Pack ×1': 'Pack de départ ×1', 'Signature star': 'Joueur vedette', 'Reward': 'Récompense', 'Active': 'Actif', 'Starter Pack': 'Pack de départ', 'Silver Pack': 'Pack argent', 'Gold Pack': 'Pack or', 'Bronze Pack': 'Pack bronze', 'bronze': 'bronze', 'silver': 'argent', 'special': 'spécial', 'gold': 'or',
    'Foundations': 'Fondations', 'Turn 11 bronze bodies into a Silver Pack.': 'Transformez 11 bronzes en un pack argent.', '11 silvers in, one Gold Pack out.': '11 argents en entrée, un pack or en sortie.', 'Bronze Upgrade': 'Amélioration bronze', 'Silver Swap': 'Échange argent',
    'Turn a forward into a Rapid+ burner.': 'Faites d\'un attaquant une fusée Rapide+.', 'Pinged Pass+ for your engine room.': 'Passe laser+ pour votre entrejeu.', 'Pace Merchant': 'Marchand de vitesse', 'Midfield Maestro': 'Chef d\'orchestre',
    'through ·': 'profondeur ·', 'lob (or gamepad 1)': 'lob (ou manette 1)', 'If the other side\'s connection stalls you will see': 'Si la connexion de l\'autre côté se bloque, vous verrez',
    'and the match carries on when it returns. For the smoothest game both players should use the same browser, ideally Chrome. The match can\'t be paused.': 'et le match reprend à son retour. Pour un jeu fluide, les deux joueurs devraient utiliser le même navigateur, idéalement Chrome. Le match ne peut pas être mis en pause.',
    'Untradeables quick sell for 0. Duplicates cannot sit in the club: list them, store them for SBCs or quick sell them': 'Les objets non échangeables se vendent 0. Les doublons ne peuvent pas rester dans le club : mettez-les en vente, rangez-les pour des DCE ou vendez-les rapidement',
    // ----- settings page
    'Settings': 'Réglages', 'Settings ⚙': 'Réglages ⚙', 'Language': 'Langue', 'Match': 'Match', 'Difficulty': 'Difficulté', 'Half length': 'Durée de mi-temps', 'Pitch size': 'Taille du terrain', 'Camera': 'Caméra', 'Graphics': 'Graphismes', 'Shooting & assists': 'Tir et assistance', 'Physics': 'Physique',
    'Pitch condition': 'État du terrain', 'Match ball': 'Ballon de match', 'Shot assist': 'Assistance au tir', 'Fully assisted': 'Assistance totale', 'Semi-assisted': 'Semi-assisté', 'Fully manual': 'Totalement manuel', 'Firm & dry': 'Ferme et sec', 'Rain': 'Pluie', 'Worn': 'Usé', 'Classic': 'Classique', 'Light': 'Léger',
    'Save': 'Sauvegarde', 'Data': 'Données', 'Auto': 'Auto', 'Medium': 'Moyen', 'Low': 'Bas', 'High': 'Élevé', 'Potato': 'Patate', 'Full 3D (WebGL)': 'Full 3D (WebGL)', 'Ultra 1440p': 'Ultra 1440p',
    // ----- v32 mobile + online
    'Touch controls': 'Commandes tactiles', 'phones and tablets': 'téléphones et tablettes', 'always show them': 'toujours les afficher', 'keyboard or gamepad': 'clavier ou manette', 'On': 'Activé', 'Off': 'Désactivé',
    'Connect': 'Connexion', 'Friend found': 'Ami trouvé', 'Squads swapped': 'Équipes échangées', 'Play': 'Jouer', 'Copy code': 'Copier le code', 'Share invite': 'Partager l\'invitation', 'Tap to copy': 'Touchez pour copier',
    'Rematch': 'Revanche', 'Your opponent wants a rematch!': 'Ton adversaire veut une revanche !', 'Waiting for your opponent...': 'En attente de ton adversaire...', 'The other player has left.': 'L\'autre joueur est parti.',
    'Fullscreen': 'Plein écran', 'Quit': 'Quitter', 'SPRINT': 'SPRINT', 'THRU': 'PROFONDEUR', 'LOB': 'LOB', 'PASS': 'PASSE', 'SHOOT': 'TIR', 'ROLL': 'ROULETTE', 'STEP': 'PASSEMENT', 'FEINT': 'FEINTE', 'RUN': 'COURSE',
    'TACKLE': 'TACLE', 'SLIDE': 'GLISSÉ', 'SWITCH': 'CHANGE', 'PRESS': 'PRESSING', 'switch': 'change', 'call': 'appel', 'tackle': 'tacle', 'slide': 'glissé',
    '↻ Rotate your phone for a wider pitch': '↻ Tourne ton téléphone pour un terrain plus large', 'measuring the connection...': 'mesure de la connexion...',
    'great': 'excellent', 'good': 'bon', 'playable': 'jouable', 'laggy': 'lent', 'Tell your friend this code. It works while this screen is open.': 'Donne ce code à ton ami. Il fonctionne tant que cet écran est ouvert.',
    'Squads swapped. Waiting for the host to start the match...': 'Équipes échangées. En attente du lancement par l\'hôte...', 'Connected. Swapping squads...': 'Connecté. Échange des équipes...',
    'Back to Online': 'Retour au jeu en ligne', ' · loading the squad...': ' · chargement de l\'équipe...',
    'Mobile mode (touch controls)': 'Mode mobile (commandes tactiles)', 'Mobile mode ON': 'Mode mobile ACTIVÉ', 'stick + buttons, any device': 'stick + boutons, tout appareil',
    'Club XI (11v11)': 'Équipe du club (11c11)', '1v1 Duel': 'Duel 1c1', 'Pick player': 'Choisir le joueur', 'Your player:': 'Ton joueur :', '1v1 Duel · pick your player': 'Duel 1c1 · choisis ton joueur', 'Search name': 'Chercher un nom', 'Any club': 'Tous les clubs', 'Pick': 'Choisir',
    'Play a friend over the internet: a Club XI match (11v11, huge pitch) or a 1v1 Duel (any player you like, small pitch). One of you hosts': 'Joue contre un ami sur internet : un match avec ton équipe (11c11, terrain géant) ou un duel 1c1 (le joueur de ton choix, petit terrain). L\'un de vous héberge',
    'No Claude account? Direct connection': 'Pas de compte Claude ? Connexion directe', 'Host direct': 'Héberger en direct', 'Join direct': 'Rejoindre en direct', 'Host': 'Hôte', 'Guest': 'Invité',
    '1. Send this invite code to your friend': '1. Envoie ce code d\'invitation à ton ami', '2. Paste the reply code your friend sends back': '2. Colle le code de réponse de ton ami', 'Copy invite': 'Copier l\'invitation', 'Copy reply': 'Copier la réponse', 'Share': 'Partager',
    'Connect': 'Connexion', 'Connecting...': 'Connexion...', 'Working...': 'En cours...', 'Create reply': 'Créer la réponse', 'Cancel': 'Annuler', 'Creating the invite...': 'Création de l\'invitation...',
    '1. Paste the host\'s invite code': '1. Colle le code d\'invitation de l\'hôte', '2. Send this reply code back to the host': '2. Renvoie ce code de réponse à l\'hôte', 'Waiting for the host to connect...': 'En attente de la connexion de l\'hôte...', 'Code copied': 'Code copié',
    // ----- in-match words (uppercase also matched)
    'GOAL!': 'BUT !', 'HALF TIME': 'MI-TEMPS', 'FULL TIME': 'FIN DU MATCH', 'PAUSED': 'PAUSE', 'KICK OFF!': 'COUP D\'ENVOI !', 'TESTING GROUND': 'TERRAIN D\'ESSAI', 'CORNER': 'CORNER', 'GOAL KICK': 'DÉGAGEMENT', 'THROW IN': 'TOUCHE', 'FREE KICK': 'COUP FRANC', 'INDIRECT FREE KICK': 'COUP FRANC INDIRECT',
    'ADVANTAGE PLAYED': 'AVANTAGE JOUÉ', 'ADVANTAGE!': 'AVANTAGE !', 'Advantage gone - free kick back': 'Avantage perdu - coup franc', 'BLOCKED!': 'CONTRÉ !', 'BUMP!': 'CHOC !', 'CHIP': 'LOB', 'CLANG!': 'CLANG !', 'CRUNCH!': 'CRAC !', 'FINESSE': 'ENROULÉE', 'FINGERTIPS!': 'DU BOUT DES DOIGTS !',
    'FOUL - PLAY ON (no free kicks here)': 'FAUTE - JEU CONTINUE (pas de coups francs ici)', 'GK held the ball > 6s': 'Le gardien a gardé le ballon plus de 6 s', 'GREEN HIT!': 'FRAPPE PARFAITE !', 'HEADER': 'TÊTE', 'HEAVY TOUCH': 'MAUVAIS CONTRÔLE', 'INDIRECT - NO GOAL': 'INDIRECT - PAS DE BUT', 'JUST WIDE!': 'JUSTE À CÔTÉ !',
    'MISTIMED': 'MAL TIMÉ', 'OUT - BALL BACK TO YOU': 'SORTI - BALLON POUR VOUS', 'PENALTY!': 'PENALTY !', 'PERFECT!': 'PARFAIT !', 'POWER!': 'PUISSANCE !', 'PUNCH!': 'POING !', 'PUNCHED CLEAR!': 'ÉCARTÉ AU POING !', 'SAFE HANDS!': 'MAINS SÛRES !', 'SAVE!': 'ARRÊT !', 'SCUFFED': 'RATÉ',
    'SHOULDERED OFF!': 'ÉPAULE CONTRE ÉPAULE !', 'SKILL!': 'TECHNIQUE !', 'TRIVELA!': 'TRIVELA !', 'ULTRA IS TOO HEAVY HERE - SWITCHED TO HIGH': 'ULTRA TROP LOURD ICI - PASSAGE EN ÉLEVÉ', 'VOLLEY': 'VOLÉE', 'TIME IT': 'TIMING', 'OFF THE POST!': 'SUR LE POTEAU !', 'OFF THE BAR!': 'SUR LA BARRE !',
    'CROSS IN - HEADER, CHEST OR VOLLEY': 'CENTRE - TÊTE, POITRINE OU VOLÉE', 'GROUND BALL - FIRST TOUCH': 'BALLON RASANT - PREMIER CONTRÔLE', 'STEPOVER!': 'PASSEMENT !', 'ROLLED!': 'ROULETTE !', 'FEINT!': 'FEINTE !', 'KEEPER!': 'GARDIEN !', 'SWITCH!': 'CHANGE !', 'HERE!': 'ICI !',
    'Hit the post': 'Poteau', 'Hit the bar': 'Barre',
  };

  // patterns for lines that carry a name, a score or a number
  const PAT = [
    [/^squad rating (\d+)$/, (m) => 'note de l\'équipe ' + m[1]],
    [/^(\d+) ms$/, (m) => m[1] + ' ms'],
    [/^(\d+)s per half$/, (m) => m[1] + ' s par mi-temps'],
    [/^GREAT SAVE (.+)!$/, (m) => 'BEL ARRÊT ' + m[1] + ' !'],
    [/^FINGERTIP SAVE (.+)!$/, (m) => 'ARRÊT DU BOUT DES DOIGTS ' + m[1] + ' !'],
    [/^(.+) MISTIMES IT$/, (m) => m[1] + ' RATE SON TIMING'],
    [/^(.+) WINS IT!$/, (m) => m[1] + ' RÉCUPÈRE !'],
    [/^OFFSIDE (.+)$/, (m) => 'HORS-JEU ' + m[1]],
    [/^YELLOW CARD (.+) \((.*)\)$/, (m) => 'CARTON JAUNE ' + m[1] + ' (' + tr(m[2]) + ')'],
    [/^RED CARD (.+) \((.*)\)$/, (m) => 'CARTON ROUGE ' + m[1] + ' (' + tr(m[2]) + ')'],
    [/^PENALTY! (.+) fouls (.+)$/, (m) => 'PENALTY ! ' + m[1] + ' fait faute sur ' + m[2]],
    [/^FOUL by (.+) \((.*)\)$/, (m) => 'FAUTE de ' + m[1] + ' (' + tr(m[2]) + ')'],
    [/^GOAL! (.+) (\d+-\d+)$/, (m) => 'BUT ! ' + m[1] + ' ' + m[2]],
    [/^Half time (\d+-\d+)$/, (m) => 'Mi-temps ' + m[1]],
    [/^Full time (\d+-\d+)$/, (m) => 'Fin du match ' + m[1]],
    [/^PENALTIES (.+)$/, (m) => 'TIRS AU BUT ' + m[1]],
    [/^\+(\d+) minutes added$/, (m) => '+' + m[1] + ' minutes de temps additionnel'],
    [/^Hit the post - (.+)$/, (m) => 'Poteau - ' + m[1]],
    [/^Hit the bar - (.+)$/, (m) => 'Barre - ' + m[1]],
    [/^(\d+)s per half$/, (m) => m[1] + ' s par mi-temps'],
    [/^(\d+) new item\(s\) waiting to be stored\.$/, (m) => m[1] + ' nouvel(s) objet(s) en attente de rangement.'],
    [/^(.+) vs (.+)$/, (m) => tr(m[1]) + ' contre ' + tr(m[2])],
    [/^Transfer List \((\d+)\)$/, (m) => 'Liste de transferts (' + m[1] + ')'],
    [/^Watchlist \((\d+)\)$/, (m) => 'Liste de suivi (' + m[1] + ')'],
    [/^Club \((\d+) players\)$/, (m) => 'Club (' + m[1] + ' joueurs)'],
    [/^Active Evolutions \((.+)\)$/, (m) => 'Évolutions actives (' + m[1] + ')'],
    [/^Reward: (.+)$/, (m) => 'Récompense : ' + tr(m[1])],
    [/^Prices drift every (\d+)s\.$/, (m) => 'Les prix bougent toutes les ' + m[1] + ' s.'],
    [/^Quiet market\. Prices drift every (\d+)s\.$/, (m) => 'Marché calme. Les prix bougent toutes les ' + m[1] + ' s.'],
    [/^Play (\d+) matches?$/, (m) => 'Jouer ' + m[1] + ' match(s)'],
    [/^Win (\d+) matches?$/, (m) => 'Gagner ' + m[1] + ' match(s)'],
    [/^Score (\d+) team goals$/, (m) => 'Marquer ' + m[1] + ' buts en équipe'],
    [/^(\d+)\/(\d+) picked · tap a slot to choose any player$/, (m) => m[1] + '/' + m[2] + ' choisis · touchez un poste pour choisir n\'importe quel joueur'],
    [/^Match (\d+)$/, (m) => 'Match ' + m[1]],
    [/^Camera: (.+)$/, (m) => 'Caméra : ' + tr(m[1])],
    [/^Gfx: (.+)$/, (m) => 'Graph. : ' + tr(m[1])],
    [/^Speed x(\d)$/, (m) => 'Vitesse x' + m[1]],
    [/^Quick sold for (.+)$/, (m) => 'Vendu rapidement pour ' + m[1]],
    [/^Filled (\d+) empty slot\(s\) with the best available players$/, (m) => m[1] + ' poste(s) vide(s) comblé(s) avec les meilleurs joueurs disponibles'],
    [/^Unassigned \((\d+)\)$/, (m) => 'Non attribués (' + m[1] + ')'],
    [/^Squad rating (.+)$/, (m) => 'Note d\'effectif ' + m[1]],
    [/^(.+) · squad rating (.+)$/, (m) => m[1] + ' · note d\'effectif ' + m[2]],
    [/^(\d+) duplicate\(s\) in this pack: list, store in SBC Storage or quick sell\.$/, (m) => m[1] + ' doublon(s) dans ce pack : mettez-les en vente, rangez-les dans le stockage DCE ou vendez-les.'],
    [/^Quick sell all < (\d+)$/, (m) => 'Tout vendre rapidement < ' + m[1]],
  ];

  const lower = {};
  Object.keys(D).forEach(k => { lower[k.toLowerCase()] = D[k]; });
  const cache = new Map();
  function isUpper(s) { return s === s.toUpperCase() && /[A-Z]{2}/.test(s); }
  function tr(s) {
    if (s == null || s === '') return s;
    if (RUT.i18n.lang !== 'fr' || typeof s !== 'string') return s;
    const hit = cache.get(s); if (hit !== undefined) return hit;
    const pre = /^([›•▶·\s]+)(.+)$/.exec(s);
    if (pre && pre[2] && pre[2] !== s) { const r = tr(pre[2]); const res0 = r === pre[2] ? s : pre[1] + r; cache.set(s, res0); return res0; }
    const lead = s.match(/^\s*/)[0], trail = s.match(/\s*$/)[0], core = s.trim();
    let out = null;
    if (core) {
      if (D[core] !== undefined) out = D[core];
      else {
        for (const [re, fn] of PAT) { const m = re.exec(core); if (m) { out = fn(m); break; } }
        if (out == null && lower[core.toLowerCase()] !== undefined) { out = lower[core.toLowerCase()]; if (isUpper(core)) out = out.toUpperCase(); }
        if (out == null && /\s·\s|^·\s|\s·$/.test(core)) { const parts = core.split(/(\s*·\s*)/); const t2 = parts.map((x, i) => (i % 2 ? x : tr(x))).join(''); if (t2 !== core) out = t2; }
        if (out == null) { const m = /^(.*?)(\s*[!:.]?)$/.exec(core); const base = m && m[1]; if (base && base !== core && (D[base] !== undefined || lower[base.toLowerCase()] !== undefined)) out = (D[base] !== undefined ? D[base] : lower[base.toLowerCase()]) + m[2]; }
      }
    }
    const res = out == null ? s : lead + out + trail;
    if (cache.size > 4000) cache.clear();
    cache.set(s, res);
    return res;
  }

  /* ---------------------------- DOM translation ---------------------------- */
  let busy = false, obs = null;
  const SKIP = /^(SCRIPT|STYLE|CANVAS|TEXTAREA|INPUT)$/;
  function textNode(n) {
    const v = n.nodeValue;
    if (n.__t !== undefined && v === n.__t) return;               // already ours
    const o = v;
    if (RUT.i18n.lang === 'fr') { const t = tr(o); if (t !== o) { n.__o = o; n.__t = t; n.nodeValue = t; return; } }
    n.__o = undefined; n.__t = undefined;
  }
  function attrs(el) {
    ['title', 'placeholder', 'aria-label'].forEach(a => {
      if (!el.hasAttribute || !el.hasAttribute(a)) return;
      const key = '__a_' + a, v = el.getAttribute(a);
      if (el[key] && el[key].t === v) return;
      const t = RUT.i18n.lang === 'fr' ? tr(v) : v;
      if (t !== v) { el[key] = { o: v, t }; el.setAttribute(a, t); } else el[key] = null;
    });
  }
  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { if (!SKIP.test(root.parentNode && root.parentNode.tagName || '')) textNode(root); return; }
    if (root.nodeType !== 1 || SKIP.test(root.tagName)) return;
    attrs(root);
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null);
    let n = w.nextNode();
    while (n) {
      if (n.nodeType === 3) { if (!SKIP.test(n.parentNode.tagName)) textNode(n); }
      else if (SKIP.test(n.tagName)) { /* leave */ } else attrs(n);
      n = w.nextNode();
    }
    const opts = root.querySelectorAll ? root.querySelectorAll('option') : [];
    opts.forEach(o => { /* option text nodes are covered above */ });
  }
  function start() {
    if (obs || typeof MutationObserver === 'undefined') return;
    obs = new MutationObserver(list => {
      if (busy || RUT.i18n.lang !== 'fr') return;
      busy = true;
      try { list.forEach(m => { if (m.type === 'characterData') walk(m.target); else m.addedNodes.forEach(walk); if (m.type === 'attributes') attrs(m.target); }); } finally { busy = false; }
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  function apply() {
    busy = true;
    try { walk(document.body); document.documentElement.lang = RUT.i18n.lang; document.title = RUT.i18n.lang === 'fr' ? 'FC RETRO 27' : 'FC RETRO 27'; } finally { busy = false; }
  }

  RUT.i18n = {
    lang: 'en',
    t: tr,
    /** Switch language. Going back to English restores the saved originals; the app re-renders its own views. */
    set(lang) {
      this.lang = lang === 'fr' ? 'fr' : 'en';
      cache.clear();
      if (this.lang === 'en') {
        busy = true;
        try {
          const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null); let n;
          while ((n = w.nextNode())) { if (n.__t !== undefined && n.nodeValue === n.__t) n.nodeValue = n.__o; n.__o = undefined; n.__t = undefined; }
          document.querySelectorAll('[title],[placeholder]').forEach(el => ['title', 'placeholder'].forEach(a => { const k = el['__a_' + a]; if (k && el.getAttribute(a) === k.t) el.setAttribute(a, k.o); el['__a_' + a] = null; }));
          document.documentElement.lang = 'en';
        } finally { busy = false; }
      } else { start(); apply(); }
    },
    apply,
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
