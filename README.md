# Venaison

Appli de téléphone pour répartir la venaison entre les membres à la fin de chaque journée de chasse.
Elle fonctionne **sans réseau** une fois installée. Les données restent sur le téléphone.

Règles :

- présences oui / non / absent par journée, avec alerte au 4e « non » (action 1) ou au 2e (action 1/2) ;
- un « non » ou un « absent » n'est pas servi ce jour-là et rattrape aux journées suivantes : en fin de saison,
  chaque action 1 a reçu autant que les autres et chaque action 1/2 la moitié. L'absent ne compte pas comme un « non » ;
- bêtes avec catégorie proposée selon le poids : entier sous 40 kg, 2 demis jusqu'à 65 kg, 4 quarts au-delà (modifiable) ;
- priorité au tireur présent (une pièce de chacune de ses bêtes, un quart arrière si la bête est en quarts) ;
- tous les comptes sont ramenés à l'action (pièces reçues ÷ 2 pour une action 1, ÷ 1 pour une action 1/2),
  et une pièce compte pour 1, quelle que soit sa taille ;
- chaque pièce va d'abord à celui qui a le moins de pièces au total sur la saison, puis le moins de cette espèce,
  puis le moins de cette pièce de cette espèce (ex. quart arrière de chevreuil) ; à égalité, à celui servi
  il y a le plus longtemps, et l'ordre alphabétique en dernier recours ;
- 1 pièce par personne et par journée. Un membre en retard (total sous la moyenne des présents) peut en recevoir
  une 2e (« Rattrapage »), mais pas du même type, sauf pour le sanglier. S'il y a plus de pièces que de places,
  le surplus est réparti 2 par personne au plus, et 3 ou plus seulement s'il y a plus de 2 pièces par présent ;
- les espèces les plus rares de la saison sont distribuées en premier, quarts arrière d'abord ;
- cervidés (réglable dans Réglages > Découpe par espèce) : cerf et daguet en 8 morceaux (2 avants, 2 côtes,
  2 filets, 2 cuissots), biche et faon en 6 (2 avants, 2 côtes/filets, 2 cuissots). Ils comptent ensemble
  comme « Cervidés » pour l'équité ; les cuissots partent d'abord ;
- cerf : distribué avant tout le reste. Personne n'en reçoit un 2e morceau dans la saison tant qu'un présent
  n'en a pas eu, et ceux qui n'en ont pas eu la saison précédente passent d'abord (fiche membre, remplie
  toute seule à chaque nouvelle saison). Cette règle passe avant la limite d'une pièce par jour (« Priorité cerf ») ;
- répartition corrigeable à la main, y compris au profit d'un propriétaire (hors équilibrage) ;
- alignement d'un membre arrivé en cours de saison sur le moins servi ;
- Historique > Écarts : avance ou retard de chacun sur sa juste part (total, par espèce, en kg).

## 1. Mettre l'appli en ligne avec GitHub Pages

1. Sur GitHub, créez un dépôt public nommé `venaison`.
2. Depuis ce dossier, envoyez les fichiers :

   ```bash
   git init
   git add .
   git commit -m "Venaison, première version"
   git branch -M main
   git remote add origin https://github.com/guillaumevignaud/venaison.git
   git push -u origin main
   ```

3. Dans le dépôt : **Settings > Pages**, « Deploy from a branch », branche `main`, dossier `/ (root)`, puis **Save**.
4. Une minute plus tard, l'appli est disponible à l'adresse `https://guillaumevignaud.github.io/venaison/`.

Le dépôt public ne contient que le code. Les noms des membres et l'historique ne quittent jamais le téléphone.

## 2. Installer l'appli sur le téléphone

À faire **une fois, avec du réseau** :

- **iPhone** : ouvrez l'adresse dans Safari > bouton Partager > **Sur l'écran d'accueil**.
- **Android** : ouvrez l'adresse dans Chrome > menu ⋮ > **Installer l'application**.

Ouvrez ensuite l'appli depuis l'écran d'accueil, toujours avec du réseau, pour qu'elle se mette en mémoire.
Elle fonctionne ensuite sans aucune connexion.

Sur iPhone, l'appli de l'écran d'accueil a ses propres données, séparées de Safari :
saisissez les membres **dans l'appli installée**, pas dans un onglet Safari.

## 3. Utilisation

1. **Membres** : saisissez chaque membre (NOM Prénom) et son action, 1 ou 1/2.
2. À l'ouverture, l'appli propose de créer la **journée de chasse** du jour. Répondez « Non » pour revenir à la dernière journée.
3. **Présences** : oui, non ou absent pour chaque membre, puis « Valider les présences ».
4. **Bêtes** : une fiche par bête (bague, espèce, poids, sexe, prélevé par), OK ou NOK, puis « Lancer l'attribution ».
5. **Répartition** : vérifiez, corrigez si besoin (« Par bête »), puis « Valider la répartition ».
   L'affichage « Par personne » sert de feuille d'appel au moment de la distribution.

L'onglet **Historique** donne les totaux de la saison par membre et le journal de toutes les pièces distribuées.

## 4. Sauvegarde

Les données ne sont que sur le téléphone. Après chaque journée : **Réglages > Exporter la sauvegarde**,
puis envoyez-vous le fichier (message, e-mail) une fois revenu au réseau.
En cas de changement ou de perte de téléphone : **Réglages > Importer une sauvegarde**.

Les exports « pour un tableur » (journal et totaux) s'ouvrent directement dans Excel ou LibreOffice.

## 5. Mettre à jour l'appli

À chaque modification du code :

1. dans `sw.js`, augmentez le numéro : `venaison-v1` → `venaison-v2` ;
2. poussez sur GitHub ;
3. sur le téléphone, ouvrez l'appli avec du réseau, fermez-la complètement puis rouvrez-la
   (sur iPhone, parfois deux fois). Le numéro de version s'affiche en bas des Réglages.

Les données enregistrées sur le téléphone sont conservées lors d'une mise à jour.

## 6. Vérifier les calculs

```bash
node tests/logic.test.js
```

Le test rejoue 40 saisons générées au hasard (281 journées, 2 431 pièces) et contrôle chaque règle
de répartition, plus les cas particuliers : priorité tireur, absents, rattrapage, sanglier, surplus, bagues en double, alignement.

## Organisation des fichiers

| Fichier | Rôle |
| --- | --- |
| `index.html` | Page de l'appli |
| `css/app.css` | Apparence (mode clair et mode sombre) |
| `js/logic.js` | Règles de calcul, sans interface |
| `js/store.js` | Enregistrement des données sur le téléphone |
| `js/app.js` | Écrans et boutons |
| `sw.js` | Fonctionnement hors ligne (cache) |
| `manifest.json`, `icons/` | Installation sur l'écran d'accueil |
| `tests/` | Vérification des calculs |
