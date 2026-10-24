# Venaison

Appli de téléphone pour répartir la venaison entre les membres à la fin de chaque journée de chasse.
Elle fonctionne **sans réseau** une fois installée. Les données restent sur le téléphone.

Mêmes règles que le fichier Excel :

- présences oui / non par journée, avec alerte au 4e « non » (action 1) ou au 2e (action 1/2) ;
- bêtes avec catégorie proposée selon le poids : entier sous 40 kg, 2 demis jusqu'à 65 kg, 4 quarts au-delà (modifiable) ;
- priorité au tireur présent (une pièce de chacune de ses bêtes, un quart arrière si la bête est en quarts) ;
- les autres pièces vont au plus petit score = pièces reçues dans la catégorie ÷ coefficient
  (action 1 = 2, action 1/2 = 1), à égalité par ordre alphabétique ;
- répartition corrigeable à la main, y compris au profit d'un propriétaire (hors équilibrage) ;
- alignement d'un membre arrivé en cours de saison sur le moins servi.

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
3. **Présences** : oui ou non pour chaque membre, puis « Valider les présences ».
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

Le test compare l'appli à un calcul de référence indépendant sur 40 saisons générées au hasard
(281 journées, 2 431 pièces), plus les cas particuliers : priorité tireur, absents, bagues en double, alignement.

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
