/*
 * Venaison — règles de calcul (aucune interface ici).
 *
 * Mêmes règles que le classeur Excel :
 *  - 4 catégories équilibrées séparément : Entier, Demi, Quart avant, Quart arrière
 *  - score = pièces déjà reçues dans la catégorie ÷ coefficient de l'action (1 → 2, 1/2 → 1)
 *  - chaque pièce va au plus petit score ; égalité → ordre alphabétique
 *  - le tireur présent reçoit d'abord une pièce de chacune de ses bêtes (option)
 *  - seuls les membres actifs indiqués « oui » ce jour-là sont servis ; « non » et « absent » ne reçoivent
 *    rien ce jour-là et rattrapent ensuite (seul le « non » compte pour l'alerte)
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Logic = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TYPES = ['Entier', 'Demi', 'Quart avant', 'Quart arrière'];
  const CATEGORIES = ['Entier', '2 demis', '4 quarts'];
  const EPS = 1e-6;

  function compareNoms(a, b) {
    return String(a).localeCompare(String(b), 'fr', { sensitivity: 'base' });
  }

  function memeNom(a, b) {
    return compareNoms(String(a || '').trim(), String(b || '').trim()) === 0;
  }

  function categorieSuggeree(poids, params) {
    if (!(poids > 0)) return '';
    if (poids < params.seuilEntier) return 'Entier';
    if (poids <= params.seuilDemi) return '2 demis';
    return '4 quarts';
  }

  function categorieBete(bete, params) {
    return bete.categorie || categorieSuggeree(bete.poids, params);
  }

  /** Pièces d'une bête, dans l'ordre de distribution (quarts arrière d'abord). */
  function piecesDe(categorie) {
    switch (categorie) {
      case 'Entier': return ['Entier'];
      case '2 demis': return ['Demi', 'Demi'];
      case '4 quarts': return ['Quart arrière', 'Quart arrière', 'Quart avant', 'Quart avant'];
      default: return [];
    }
  }

  function coefficient(action, params) {
    const a = params.actions[action];
    return a && a.coef > 0 ? a.coef : 0;
  }

  function seuilAlerte(action, params) {
    const a = params.actions[action];
    return a && a.alerte > 0 ? a.alerte : 0;
  }

  function nbNon(membreId, journees) {
    return journees.reduce((n, j) => n + (j.presences && j.presences[membreId] === 'non' ? 1 : 0), 0);
  }

  function enAlerte(membre, journees, params) {
    const s = seuilAlerte(membre.action, params);
    return s > 0 && nbNon(membre.id, journees) >= s;
  }

  function compteursVides() {
    const c = {};
    TYPES.forEach((t) => { c[t] = 0; });
    return c;
  }

  /** Pièces reçues par membre et par catégorie, depuis le journal.
   *  Les distributions de la date `exclureDate` sont ignorées (journée en cours de recalcul). */
  function compteurs(journal, ids, exclureDate) {
    const cnt = {};
    ids.forEach((id) => { cnt[id] = compteursVides(); });
    journal.forEach((e) => {
      if (e.nature === 'Distribution' && exclureDate && e.date === exclureDate) return;
      if (e.membreId && cnt[e.membreId] && TYPES.includes(e.piece)) {
        cnt[e.membreId][e.piece] += Number(e.qte) || 0;
      }
    });
    return cnt;
  }

  function saisonCommencee(journal) {
    return journal.some((e) => e.nature === 'Distribution');
  }

  function nomTireur(bete, membres) {
    if (bete.tireurId) {
      const m = membres.find((x) => x.id === bete.tireurId);
      if (m) return m.nom;
    }
    return (bete.tireurNom || '').trim();
  }

  function libelleBete(bete, index) {
    return bete.bague ? `Bête ${index + 1} (bague ${bete.bague})` : `Bête ${index + 1}`;
  }

  /**
   * Calcule la répartition proposée pour une journée.
   * Retourne { erreurs: [...], avertissements: [...], pieces: [...] }.
   * Les avertissements (bagues en double) demandent une confirmation mais ne bloquent pas.
   */
  function attribuer({ journee, membres, params, journal }) {
    const erreurs = [];
    const avertissements = [];

    if (!journee.presencesValidees) {
      erreurs.push('Validez d’abord les présences de la journée.');
    }

    const betesOK = [];
    journee.betes.forEach((b, i) => {
      const lib = libelleBete(b, i);
      if (b.validation !== 'OK' && b.validation !== 'NOK') {
        erreurs.push(`${lib} : choisissez OK ou NOK.`);
        return;
      }
      if (b.validation === 'NOK') return;
      if (!(b.poids > 0)) {
        erreurs.push(`${lib} : poids manquant.`);
        return;
      }
      const cat = categorieBete(b, params);
      if (!piecesDe(cat).length) {
        erreurs.push(`${lib} : catégorie à distribuer manquante.`);
        return;
      }
      betesOK.push({ b, cat });
    });

    const eligibles = membres
      .filter((m) => m.actif && journee.presences[m.id] === 'oui')
      .map((m) => ({ m, coef: coefficient(m.action, params) }));
    eligibles.forEach((e) => {
      if (!(e.coef > 0)) erreurs.push(`${e.m.nom} : action « ${e.m.action} » inconnue.`);
    });

    if (!erreurs.length && !betesOK.length) erreurs.push('Aucune bête validée OK à distribuer.');
    if (!erreurs.length && !eligibles.length) {
      erreurs.push('Aucun membre n’est indiqué présent (oui) : rien ne peut être attribué.');
    }
    if (erreurs.length) return { erreurs, avertissements, pieces: [] };

    // Contrôle des numéros de bague
    const vus = new Set();
    betesOK.forEach(({ b }) => {
      const bg = String(b.bague || '').trim().toUpperCase();
      if (!bg) return;
      if (vus.has(bg)) avertissements.push(`Bague ${b.bague} saisie plusieurs fois ce jour.`);
      vus.add(bg);
      const deja = journal.find((e) => e.nature === 'Distribution' && e.date !== journee.date &&
        String(e.bague || '').trim().toUpperCase() === bg);
      if (deja) avertissements.push(`Bague ${b.bague} déjà distribuée le ${dateFr(deja.date)}.`);
    });

    const cnt = compteurs(journal, eligibles.map((e) => e.m.id), journee.date);

    // Découpe en pièces + priorité au tireur
    const pieces = [];
    betesOK.forEach(({ b, cat }) => {
      const types = piecesDe(cat);
      const tireur = nomTireur(b, membres);
      const first = pieces.length;
      types.forEach((t) => {
        pieces.push({
          beteId: b.id, bague: b.bague || '', espece: b.espece || '', poidsBete: b.poids,
          tireur, piece: t, poidsPiece: b.poids / types.length, dest: '', remarque: '',
        });
      });
      if (journee.prioTireur) {
        const e = eligibles.find((x) => (b.tireurId && x.m.id === b.tireurId) ||
          (!b.tireurId && b.tireurNom && memeNom(x.m.nom, b.tireurNom)));
        if (e) {
          pieces[first].dest = 'm:' + e.m.id;
          pieces[first].remarque = 'Priorité tireur';
          cnt[e.m.id][types[0]] += 1;
        }
      }
    });

    // Autres pièces : plus petit score, puis ordre alphabétique
    pieces.forEach((p) => {
      if (p.dest) return;
      let best = null;
      let bestSc = 0;
      eligibles.forEach((e) => {
        const sc = cnt[e.m.id][p.piece] / e.coef;
        if (!best || sc < bestSc - EPS || (sc <= bestSc + EPS && compareNoms(e.m.nom, best.m.nom) < 0)) {
          best = e;
          bestSc = sc;
        }
      });
      p.dest = 'm:' + best.m.id;
      cnt[best.m.id][p.piece] += 1;
    });

    return { erreurs, avertissements, pieces };
  }

  /** Quantités d'« ajustement » pour aligner un nouveau membre sur le membre actif le moins servi. */
  function alignement(membreId, membres, params, journal) {
    const nouveau = membres.find((m) => m.id === membreId);
    const cN = nouveau ? coefficient(nouveau.action, params) : 0;
    const autres = membres.filter((m) => m.actif && m.id !== membreId && coefficient(m.action, params) > 0);
    const cnt = compteurs(journal, autres.map((m) => m.id), null);
    const res = {};
    TYPES.forEach((t) => {
      let min = null;
      autres.forEach((m) => {
        const s = cnt[m.id][t] / coefficient(m.action, params);
        if (min === null || s < min) min = s;
      });
      res[t] = Math.round((min || 0) * cN * 100) / 100;
    });
    return res;
  }

  /** Totaux réellement reçus (hors ajustements) : { cle -> {Entier, Demi, ..., total, kg} } */
  function totaux(journal) {
    const res = {};
    journal.forEach((e) => {
      if (e.nature !== 'Distribution') return;
      const cle = e.membreId ? 'm:' + e.membreId : 'p:' + e.nom;
      if (!res[cle]) res[cle] = Object.assign(compteursVides(), { total: 0, kg: 0 });
      if (TYPES.includes(e.piece)) res[cle][e.piece] += Number(e.qte) || 0;
      res[cle].total += Number(e.qte) || 0;
      res[cle].kg += Number(e.poidsPiece) || 0;
    });
    return res;
  }

  function dateFr(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  function parseNombre(v) {
    if (typeof v === 'number') return v;
    const s = String(v || '').trim().replace(/\s/g, '').replace(',', '.');
    if (!s) return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  return {
    TYPES, CATEGORIES, compareNoms, memeNom, categorieSuggeree, categorieBete, piecesDe, coefficient,
    seuilAlerte, nbNon, enAlerte, compteurs, saisonCommencee, nomTireur, attribuer, alignement, totaux,
    dateFr, parseNombre,
  };
});
