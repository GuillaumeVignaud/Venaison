/*
 * Venaison — règles de calcul (aucune interface ici).
 *
 * Tous les scores = pièces reçues ÷ coefficient de l'action (1 → 2, 1/2 → 1). Une pièce compte 1, quelle que soit sa taille.
 *  - le « type » d'une pièce = espèce + pièce (ex. quart arrière de chevreuil)
 *  - le tireur présent reçoit d'abord une pièce de chacune de ses bêtes (option)
 *  - 1 pièce par présent et par journée ; un présent en retard (total sous la moyenne) peut en recevoir une 2e,
 *    d'un autre type (même type permis pour le sanglier) ; 3 pièces ou plus seulement s'il y a plus de 2 pièces par présent
 *  - les espèces les plus rares de la saison sont distribuées en premier, quarts arrière d'abord
 *  - chaque pièce va au plus petit total, puis au plus petit nombre de l'espèce, puis du type ;
 *    puis à celui servi il y a le plus longtemps ; l'ordre alphabétique en tout dernier recours
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
  const ORDRE_PIECES = { 'Quart arrière': 0, 'Quart avant': 1, Demi: 2, Entier: 3 };

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

  const nomEspece = (e) => String(e || '').trim();
  /** Clé d'un type de pièce : « Chevreuil|Quart arrière » (espèce vide pour les anciennes lignes). */
  const cleType = (espece, piece) => `${nomEspece(espece)}|${piece}`;
  function decouperCle(cle) {
    const i = cle.lastIndexOf('|');
    return { espece: cle.slice(0, i), piece: cle.slice(i + 1) };
  }
  function libelleCle(cle) {
    const { espece, piece } = decouperCle(cle);
    return espece ? `${piece} de ${espece.toLowerCase()}` : piece;
  }
  const estSanglier = (espece) => memeNom(espece, 'Sanglier');

  function compteurVide() {
    return { total: 0, esp: {}, type: {}, kg: 0, dernier: '' };
  }

  function ajouter(c, espece, piece, q) {
    const e = nomEspece(espece);
    const k = cleType(e, piece);
    c.total += q;
    c.esp[e] = (c.esp[e] || 0) + q;
    c.type[k] = (c.type[k] || 0) + q;
  }

  /** Pièces reçues par membre, depuis le journal (ajustements compris) :
   *  { total, esp: {espèce: n}, type: {clé: n}, kg, dernier } — kg et dernier ne comptent que la viande reçue.
   *  Les distributions de la date `exclureDate` sont ignorées (journée en cours de recalcul). */
  function compteurs(journal, ids, exclureDate) {
    const cnt = {};
    ids.forEach((id) => { cnt[id] = compteurVide(); });
    journal.forEach((e) => {
      if (e.nature === 'Distribution' && exclureDate && e.date === exclureDate) return;
      const c = e.membreId && cnt[e.membreId];
      if (!c || !TYPES.includes(e.piece)) return;
      ajouter(c, e.espece, e.piece, Number(e.qte) || 0);
      if (e.nature === 'Distribution') {
        c.kg += Number(e.poidsPiece) || 0;
        if (e.date && e.date > c.dernier) c.dernier = e.date;
      }
    });
    return cnt;
  }

  /** -1, 0 ou 1 en ignorant les écarts d'arrondi. */
  const ecartSigne = (x, y) => (Math.abs(x - y) < EPS ? 0 : x < y ? -1 : 1);

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
   * Retourne { erreurs: [...], avertissements: [...], notes: [...], pieces: [...] }.
   * Les avertissements (bagues en double) demandent une confirmation mais ne bloquent pas.
   * Les notes signalent un membre servi 3 fois ou plus faute de présents.
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
    if (erreurs.length) return { erreurs, avertissements, notes: [], pieces: [] };

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

    // En retard : total de saison (÷ coefficient) sous la moyenne des présents, avant ce jour
    const moyenne = eligibles.reduce((s, e) => s + cnt[e.m.id].total, 0) / eligibles.reduce((s, e) => s + e.coef, 0);
    const enRetard = new Set(eligibles.filter((e) => cnt[e.m.id].total / e.coef < moyenne - EPS).map((e) => e.m.id));

    // Ce que chacun a déjà reçu ce jour
    const jour = {};
    eligibles.forEach((e) => { jour[e.m.id] = { n: 0, types: new Set() }; });
    function donner(p, e, remarque) {
      p.dest = 'm:' + e.m.id;
      p.remarque = remarque;
      ajouter(cnt[e.m.id], p.espece, p.piece, 1);
      cnt[e.m.id].dernier = journee.date;
      jour[e.m.id].n += 1;
      jour[e.m.id].types.add(p.cle);
    }

    // Découpe en pièces + priorité au tireur
    const pieces = [];
    betesOK.forEach(({ b, cat }) => {
      const types = piecesDe(cat);
      const tireur = nomTireur(b, membres);
      const first = pieces.length;
      types.forEach((t) => {
        pieces.push({
          beteId: b.id, bague: b.bague || '', espece: b.espece || '', poidsBete: b.poids,
          tireur, piece: t, poidsPiece: b.poids / types.length, dest: '', remarque: '', cle: cleType(b.espece, t),
        });
      });
      if (journee.prioTireur) {
        const e = eligibles.find((x) => (b.tireurId && x.m.id === b.tireurId) ||
          (!b.tireurId && b.tireurNom && memeNom(x.m.nom, b.tireurNom)));
        if (e) donner(pieces[first], e, 'Priorité tireur');
      }
    });

    // Ordre de distribution : espèces les plus rares de la saison d'abord, puis quarts arrière, quarts avant, demis, entiers
    const parEspece = {};
    journal.forEach((e) => {
      if (e.nature !== 'Distribution' || e.date === journee.date || !TYPES.includes(e.piece)) return;
      const s = nomEspece(e.espece);
      parEspece[s] = (parEspece[s] || 0) + (Number(e.qte) || 0);
    });
    const ordre = pieces.map((p, i) => i).filter((i) => !pieces[i].dest).sort((a, b) => {
      const pa = pieces[a];
      const pb = pieces[b];
      const ea = nomEspece(pa.espece);
      const eb = nomEspece(pb.espece);
      return (parEspece[ea] || 0) - (parEspece[eb] || 0) || compareNoms(ea, eb) ||
        ORDRE_PIECES[pa.piece] - ORDRE_PIECES[pb.piece] || a - b;
    });

    // Négatif si a passe avant b pour la pièce p
    function comparer(a, b, p, surplus) {
      const ca = cnt[a.m.id];
      const cb = cnt[b.m.id];
      const ja = jour[a.m.id];
      const jb = jour[b.m.id];
      const e = nomEspece(p.espece);
      return (surplus ? (ja.types.has(p.cle) ? 1 : 0) - (jb.types.has(p.cle) ? 1 : 0) : 0) ||
        ecartSigne(ca.total / a.coef, cb.total / b.coef) ||
        ecartSigne((ca.esp[e] || 0) / a.coef, (cb.esp[e] || 0) / b.coef) ||
        ecartSigne((ca.type[p.cle] || 0) / a.coef, (cb.type[p.cle] || 0) / b.coef) ||
        (ja.n ? 1 : 0) - (jb.n ? 1 : 0) ||
        (ca.dernier < cb.dernier ? -1 : ca.dernier > cb.dernier ? 1 : 0) ||
        compareNoms(a.m.nom, b.m.nom);
    }

    let surplusDonne = false;
    ordre.forEach((i) => {
      const p = pieces[i];
      const sanglier = estSanglier(p.espece);
      // Rien reçu ce jour, ou en retard avec une seule pièce d'un autre type (même type permis pour le sanglier)
      let candidats = eligibles.filter((e) => {
        const j = jour[e.m.id];
        return j.n === 0 || (j.n === 1 && enRetard.has(e.m.id) && (sanglier || !j.types.has(p.cle)));
      });
      let surplus = false;
      if (!candidats.length) {
        // Plus de pièces que de places : on monte d'un cran à la fois (2 pièces chacun, puis 3…)
        const min = Math.min(...eligibles.map((e) => jour[e.m.id].n));
        candidats = eligibles.filter((e) => jour[e.m.id].n === min);
        surplus = true;
        surplusDonne = true;
      }
      const best = candidats.reduce((a, b) => (comparer(b, a, p, surplus) < 0 ? b : a));
      donner(p, best, surplus ? 'Surplus du jour' : jour[best.m.id].n ? 'Rattrapage' : '');
    });

    const notes = [];
    if (surplusDonne) {
      eligibles.filter((e) => jour[e.m.id].n >= 3).forEach((e) => {
        notes.push(`${e.m.nom} reçoit ${jour[e.m.id].n} pièces : pas assez de présents pour faire moins.`);
      });
    }

    pieces.forEach((p) => { delete p.cle; });
    return { erreurs, avertissements, notes, pieces };
  }

  /** Quantités d'« ajustement » { clé espèce|pièce: qté } pour aligner un nouveau membre
   *  sur le membre actif au plus petit total (même total, mêmes espèces, mêmes pièces, ramenés à son action). */
  function alignement(membreId, membres, params, journal) {
    const nouveau = membres.find((m) => m.id === membreId);
    const cN = nouveau ? coefficient(nouveau.action, params) : 0;
    const autres = membres.filter((m) => m.actif && m.id !== membreId && coefficient(m.action, params) > 0);
    const cnt = compteurs(journal, autres.map((m) => m.id), null);
    let ref = null;
    let refSc = 0;
    autres.forEach((m) => {
      const sc = cnt[m.id].total / coefficient(m.action, params);
      if (!ref || sc < refSc - EPS) {
        ref = m;
        refSc = sc;
      }
    });
    const res = {};
    if (!ref || !(cN > 0)) return res;
    const cR = coefficient(ref.action, params);
    Object.keys(cnt[ref.id].type).sort().forEach((k) => {
      const q = Math.round((cnt[ref.id].type[k] / cR) * cN * 100) / 100;
      if (q > 0) res[k] = q;
    });
    return res;
  }

  /** Avance (+) ou retard (−) de chaque membre actif sur sa juste part, en pièces et en kg, ramené à son action.
   *  Retourne { especes: [...], lignes: [{ id, nom, action, recu, total, especes: {espèce: écart}, kg }] }. */
  function ecarts({ membres, params, journal }) {
    const actifs = membres.filter((m) => m.actif && coefficient(m.action, params) > 0);
    const cnt = compteurs(journal, actifs.map((m) => m.id), null);
    const sommeCoef = actifs.reduce((s, m) => s + coefficient(m.action, params), 0);
    const parPart = (f) => (sommeCoef ? actifs.reduce((s, m) => s + f(cnt[m.id]), 0) / sommeCoef : 0);
    const especes = [...new Set(actifs.flatMap((m) => Object.keys(cnt[m.id].esp).filter((e) => cnt[m.id].esp[e])))]
      .sort(compareNoms);
    const partTotal = parPart((c) => c.total);
    const partKg = parPart((c) => c.kg);
    const partEsp = {};
    especes.forEach((e) => { partEsp[e] = parPart((c) => c.esp[e] || 0); });
    const r = (x, n) => Math.round(x * n) / n || 0;
    return {
      especes,
      lignes: actifs.map((m) => {
        const c = cnt[m.id];
        const k = coefficient(m.action, params);
        const esp = {};
        especes.forEach((e) => { esp[e] = r((c.esp[e] || 0) - partEsp[e] * k, 100); });
        return { id: m.id, nom: m.nom, action: m.action, recu: c.total, total: r(c.total - partTotal * k, 100), especes: esp, kg: r(c.kg - partKg * k, 10) };
      }),
    };
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
    seuilAlerte, nbNon, enAlerte, compteurs, saisonCommencee, nomTireur, attribuer, alignement, ecarts, totaux,
    dateFr, parseNombre, cleType, decouperCle, libelleCle, estSanglier,
  };
});
