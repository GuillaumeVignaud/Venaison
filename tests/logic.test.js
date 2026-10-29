/*
 * Tests du moteur de calcul. Lancer avec :  node tests/logic.test.js
 * fixtures.json contient 40 saisons générées au hasard (membres, présences, bêtes). Elles sont rejouées
 * journée après journée et chaque répartition est contrôlée règle par règle.
 * (Les répartitions « expected » du fichier sont celles des anciennes règles, calquées sur le classeur Excel ;
 * elles ne servent plus.)
 */
const assert = require('assert');
const path = require('path');
const L = require('../js/logic.js');
const fixtures = require(path.join(__dirname, 'fixtures.json'));

const params = {
  seuilEntier: 40, seuilDemi: 65,
  actions: { '1': { coef: 2, alerte: 4 }, '1/2': { coef: 1, alerte: 2 } },
};
// Mêmes réglages, avec la découpe des cervidés
const paramsC = Object.assign({}, params, {
  decoupe: { Cerf: '8 morceaux', Daguet: '8 morceaux', Biche: '6 morceaux', Faon: '6 morceaux' },
});
let ok = 0;
function test(nom, fn) {
  try { fn(); ok++; } catch (e) { console.error('ÉCHEC :', nom, '\n ', e.message); process.exitCode = 1; }
}

// --- Catégories selon le poids
test('seuils de poids', () => {
  assert.strictEqual(L.categorieSuggeree(39.9, params), 'Entier');
  assert.strictEqual(L.categorieSuggeree(40, params), '2 demis');
  assert.strictEqual(L.categorieSuggeree(65, params), '2 demis');
  assert.strictEqual(L.categorieSuggeree(65.1, params), '4 quarts');
  assert.strictEqual(L.categorieSuggeree(null, params), '');
});

test('lecture des nombres saisis', () => {
  assert.strictEqual(L.parseNombre('27,5'), 27.5);
  assert.strictEqual(L.parseNombre(' 80 '), 80);
  assert.strictEqual(L.parseNombre(''), null);
  assert.strictEqual(L.parseNombre('abc'), null);
});

// --- Les 40 saisons générées au hasard, rejouées journée après journée : chaque règle est contrôlée.
// (fixtures.json ne sert ici que de données d'entrée : membres, présences, bêtes.)
let jours = 0;
let pieces = 0;
const PRIO = 'Priorité tireur';
const PRIO_CERF = 'Priorité cerf';
const SURPLUS = 'Surplus du jour';
const coefDe = (m) => params.actions[m.action].coef;
const ecartsFin = [];

fixtures.forEach((saison, s) => {
  // Un membre sur trois a eu du cerf la saison précédente
  const membres = saison.members.map((m, i) => Object.assign({}, m, { cerfAnDernier: i % 3 === 0 }));
  const parNom = Object.fromEntries(membres.map((m) => [m.nom, m]));
  const journal = [];
  saison.days.forEach((day) => {
    const journee = {
      date: day.date, presences: day.presence, presencesValidees: true, prioTireur: day.prio,
      betes: day.animals.map((a, i) => ({
        id: 'b' + i, bague: a.bague, espece: a.esp, poids: a.poids,
        tireurId: parNom[a.tireur] ? parNom[a.tireur].id : '',
        tireurNom: parNom[a.tireur] ? '' : a.tireur,
        categorie: a.cat || '', validation: a.valid,
      })),
    };
    const presents = membres.filter((m) => m.actif && day.presence[m.id] === 'oui');
    const avant = L.compteurs(journal, membres.map((m) => m.id), null, paramsC);
    const r = L.attribuer({ journee, membres, params: paramsC, journal });
    test(`saison ${s} ${day.date}`, () => {
      if (!journee.betes.some((b) => b.validation === 'OK') || !presents.length) return;
      assert.deepStrictEqual(r.erreurs, []);
      const recu = {};
      presents.forEach((m) => { recu[m.id] = []; });
      r.pieces.forEach((p) => {
        assert.ok(p.dest.startsWith('m:') && recu[p.dest.slice(2)], 'pièce donnée à un non-présent');
        recu[p.dest.slice(2)].push(p);
      });
      const moyenne = presents.reduce((x, m) => x + avant[m.id].total, 0) / presents.reduce((x, m) => x + coefDe(m), 0);
      presents.forEach((m) => {
        const ps = recu[m.id];
        const prio = ps.some((p) => p.remarque === PRIO || p.remarque === PRIO_CERF);
        // Pas 2 fois le même type le même jour (sauf sanglier, priorité tireur ou surplus)
        const vus = new Map();
        ps.forEach((p) => {
          const k = L.cleType(p.espece, p.piece);
          if (vus.has(k) && !L.estSanglier(p.espece)) {
            assert.ok([p, vus.get(k)].some((x) => x.remarque === SURPLUS || x.remarque === PRIO), `${m.nom} : 2 × ${k}`);
          }
          vus.set(k, p);
        });
        // 1 pièce normale par jour ; la 2e est un rattrapage d'un membre en retard
        assert.ok(ps.filter((p) => p.remarque === '').length <= 1, `${m.nom} : 2 pièces sans rattrapage`);
        if (ps.some((p) => p.remarque === 'Rattrapage')) {
          assert.ok(avant[m.id].total / coefDe(m) < moyenne, `${m.nom} : rattrapage sans retard`);
          assert.ok(ps.length - ps.filter((p) => p.remarque === SURPLUS).length <= 2 || prio);
        }
        // 3 pièces ou plus seulement s'il y a plus de 2 pièces par présent
        if (ps.length >= 3 && !prio) assert.ok(r.pieces.length > 2 * presents.length, `${m.nom} : 3 pièces évitables`);
      });
      // Le plus petit total passe d'abord : celui qui n'a rien eu ce jour avait un total au moins égal
      // à celui qu'avait le servi juste avant sa dernière pièce
      const apres = L.compteurs(journal.concat(r.pieces.map((p) => ({
        date: day.date, nature: 'Distribution', espece: p.espece, piece: p.piece, qte: 1, membreId: p.dest.slice(2),
      }))), membres.map((m) => m.id), null, paramsC);
      const sansRien = presents.filter((m) => !recu[m.id].length);
      presents.filter((m) => recu[m.id].filter((p) => p.remarque !== PRIO).length >= 2 &&
        !recu[m.id].some((p) => L.estCerf(p.espece))).forEach((y) => {
        sansRien.forEach((x) => {
          assert.ok((apres[y.id].total - 1) / coefDe(y) <= apres[x.id].total / coefDe(x) + 1e-9,
            `${y.nom} servi 2 fois alors que ${x.nom} avait moins`);
        });
      });
      // Cerf : personne n'en reçoit un 2e dans la saison tant qu'un présent n'en a jamais eu
      const toujoursSansCerf = presents.filter((m) => apres[m.id].cerf === 0);
      presents.forEach((m) => {
        const k = recu[m.id].filter((p) => L.estCerf(p.espece) && p.remarque !== PRIO).length;
        if (k && avant[m.id].cerf + k >= 2) {
          assert.strictEqual(toujoursSansCerf.length, 0, `${m.nom} : 2e morceau de cerf alors que ${toujoursSansCerf.map((x) => x.nom)} n'en a pas`);
        }
      });
      // … et parmi ceux qui n'en ont jamais eu, ceux sans cerf l'an dernier passent d'abord
      const servisCerf = presents.filter((m) => avant[m.id].cerf === 0 && recu[m.id].some((p) => L.estCerf(p.espece) && p.remarque !== PRIO));
      if (servisCerf.some((m) => m.cerfAnDernier)) {
        assert.ok(presents.every((m) => m.cerfAnDernier || avant[m.id].cerf > 0 || apres[m.id].cerf > 0), 'cerf de l’an dernier servi avant un autre');
      }
      jours++;
      pieces += r.pieces.length;
    });
    r.pieces.forEach((p) => journal.push({
      date: day.date, nature: 'Distribution', espece: p.espece, piece: p.piece, qte: 1, poidsPiece: p.poidsPiece,
      bague: p.bague, membreId: p.dest.slice(2),
    }));
  });
  // Équité de fin de saison, parmi les membres présents à toutes les journées
  const fin = L.compteurs(journal, membres.map((m) => m.id), null, paramsC);
  const ms = membres.filter((m) => m.actif && saison.days.every((dd) => dd.presence[m.id] === 'oui'));
  const sc = ms.map((m) => fin[m.id].total / coefDe(m));
  if (sc.length >= 2) ecartsFin.push(Math.max(...sc) - Math.min(...sc));
});

test('équité de fin de saison sur le total (membres toujours présents)', () => {
  // Avec le cerf en 8 morceaux, ces saisons comptent 3 546 pièces au lieu de 2 431 : écart moyen 1,66 part
  // (1,72 sans la règle du cerf). Ancien moteur, cerf découpé au poids : 2,03.
  const moy = ecartsFin.reduce((a, b) => a + b, 0) / ecartsFin.length;
  assert.ok(moy <= 1.8, `écart moyen ${moy}`);
});

// --- Cas particuliers
const membres = [
  { id: 'a', nom: 'ALPHA A', action: '1', actif: true },
  { id: 'b', nom: 'BRAVO B', action: '1/2', actif: true },
  { id: 'c', nom: 'CHARLIE C', action: '1', actif: true },
  { id: 'z', nom: 'ZULU Z', action: '1', actif: false },
];
const base = (betes, extra) => Object.assign({
  date: '2026-11-14', presences: { a: 'oui', b: 'oui', c: 'oui', z: 'oui' }, presencesValidees: true,
  prioTireur: true, betes,
}, extra || {});

test('présences non validées : bloqué', () => {
  const r = L.attribuer({ journee: base([], { presencesValidees: false }), membres, params, journal: [] });
  assert.ok(r.erreurs[0].includes('Validez'));
});

test('OK/NOK et poids obligatoires', () => {
  const r = L.attribuer({
    journee: base([{ id: '1', bague: 'X1', poids: 30, validation: '' }, { id: '2', bague: 'X2', validation: 'OK' }]),
    membres, params, journal: [],
  });
  assert.strictEqual(r.erreurs.length, 2);
});

test('membre inactif jamais servi, lignes NOK ignorées', () => {
  const r = L.attribuer({
    journee: base([{ id: '1', bague: 'X1', poids: 90, validation: 'OK' }, { id: '2', bague: 'X2', poids: 20, validation: 'NOK' }]),
    membres, params, journal: [],
  });
  assert.strictEqual(r.pieces.length, 4);
  assert.ok(r.pieces.every((p) => p.dest !== 'm:z'));
});

test('priorité tireur : quart arrière, et désactivable', () => {
  const b = [{ id: '1', bague: 'X1', poids: 90, validation: 'OK', tireurId: 'c' }];
  let r = L.attribuer({ journee: base(b), membres, params, journal: [] });
  assert.strictEqual(r.pieces[0].dest, 'm:c');
  assert.strictEqual(r.pieces[0].piece, 'Quart arrière');
  r = L.attribuer({ journee: base(b, { prioTireur: false }), membres, params, journal: [] });
  assert.strictEqual(r.pieces[0].remarque, '');
});

test('tireur invité ou absent : pas de priorité', () => {
  const r = L.attribuer({
    journee: base([{ id: '1', bague: 'X1', poids: 20, validation: 'OK', tireurNom: 'Invité Pierre' }],
      { presences: { a: 'oui', b: 'oui', c: 'non' } }),
    membres, params, journal: [],
  });
  assert.strictEqual(r.pieces[0].remarque, '');
});

test('bague déjà distribuée : avertissement', () => {
  const journal = [{ date: '2026-10-01', nature: 'Distribution', bague: 'x1', piece: 'Entier', qte: 1, membreId: 'a' }];
  const r = L.attribuer({ journee: base([{ id: '1', bague: 'X1', poids: 20, validation: 'OK' }]), membres, params, journal });
  assert.strictEqual(r.avertissements.length, 1);
});

test('une action 1 reçoit deux fois plus qu\'une action 1/2 sur la durée', () => {
  const journal = [];
  for (let k = 0; k < 30; k++) {
    const date = '2026-' + String(1 + Math.floor(k / 28)).padStart(2, '0') + '-' + String(1 + (k % 28)).padStart(2, '0');
    const r = L.attribuer({
      journee: base([{ id: '1', bague: 'Q' + k, poids: 90, validation: 'OK' }], { date }),
      membres, params, journal,
    });
    r.pieces.forEach((p) => journal.push({ date, nature: 'Distribution', piece: p.piece, qte: 1, membreId: p.dest.slice(2) }));
  }
  const t = L.totaux(journal);
  assert.strictEqual(t['m:a'].total, 48);
  assert.strictEqual(t['m:b'].total, 24);
  assert.strictEqual(t['m:c'].total, 48);
});

test('recalcul d\'une journée : ses anciennes distributions sont ignorées', () => {
  const journal = [{ date: '2026-11-14', nature: 'Distribution', piece: 'Entier', qte: 1, membreId: 'a' }];
  const r = L.attribuer({ journee: base([{ id: '1', bague: 'X1', poids: 20, validation: 'OK' }]), membres, params, journal });
  assert.strictEqual(r.pieces[0].dest, 'm:a');
});

test('alignement d\'un nouveau membre sur le moins servi', () => {
  const m2 = membres.concat([{ id: 'n', nom: 'NOUVEAU N', action: '1', actif: true }]);
  const journal = [
    { date: 'd', nature: 'Distribution', espece: 'Chevreuil', piece: 'Quart avant', qte: 3, membreId: 'a' },
    { date: 'd', nature: 'Distribution', espece: 'Sanglier', piece: 'Entier', qte: 1, membreId: 'a' },
    { date: 'd', nature: 'Distribution', espece: 'Chevreuil', piece: 'Quart avant', qte: 1, membreId: 'b' },
    { date: 'd', nature: 'Distribution', espece: 'Cerf', piece: 'Demi', qte: 4, membreId: 'c' },
  ];
  // Le moins servi est BRAVO (1 pièce ÷ 1) ; le nouveau, action 1, reçoit le double
  assert.deepStrictEqual(L.alignement('n', m2, params, journal), { 'Chevreuil|Quart avant': 2 });
});

// --- Nouvelles règles de répartition
const bete = (id, espece, poids, extra) => Object.assign({ id, bague: 'X' + id, espece, poids, validation: 'OK' }, extra || {});
const sans = { prioTireur: false };
const dests = (r) => r.pieces.map((p) => p.dest.slice(2));

test('les 2 demis d\'une même bête vont à 2 personnes différentes', () => {
  const r = L.attribuer({ journee: base([bete('1', 'Chevreuil', 50)], sans), membres, params, journal: [] });
  assert.strictEqual(new Set(dests(r)).size, 2);
});

test('celui qui n\'a rien passe devant celui qui a déjà du sanglier et du chevreuil', () => {
  const journal = [
    { date: '2026-10-01', nature: 'Distribution', espece: 'Sanglier', piece: 'Quart arrière', qte: 1, membreId: 'a' },
    { date: '2026-10-08', nature: 'Distribution', espece: 'Chevreuil', piece: 'Entier', qte: 1, membreId: 'a' },
  ];
  const r = L.attribuer({
    journee: base([bete('1', 'Cerf', 30)], { prioTireur: false, presences: { a: 'oui', b: 'absent', c: 'oui' } }),
    membres, params, journal,
  });
  assert.deepStrictEqual(dests(r), ['c']);
});

const enRetard = {
  presences: { a: 'oui', b: 'absent', c: 'oui' }, prioTireur: false,
};
const journalRetard = [{ date: '2026-10-01', nature: 'Distribution', espece: 'Cerf', piece: 'Demi', qte: 4, membreId: 'c' }];

test('sanglier : un membre en retard peut recevoir 2 quarts arrière', () => {
  const r = L.attribuer({ journee: base([bete('1', 'Sanglier', 90)], enRetard), membres, params, journal: journalRetard });
  assert.deepStrictEqual(r.pieces.map((p) => [p.piece, p.dest, p.remarque]), [
    ['Quart arrière', 'm:a', ''], ['Quart arrière', 'm:a', 'Rattrapage'],
    ['Quart avant', 'm:c', ''], ['Quart avant', 'm:c', 'Surplus du jour'],
  ]);
});

test('chevreuil : le membre en retard reçoit 2 pièces, mais pas du même type', () => {
  const r = L.attribuer({ journee: base([bete('1', 'Chevreuil', 90)], enRetard), membres, params, journal: journalRetard });
  assert.deepStrictEqual(r.pieces.map((p) => [p.piece, p.dest, p.remarque]), [
    ['Quart arrière', 'm:a', ''], ['Quart arrière', 'm:c', ''],
    ['Quart avant', 'm:a', 'Rattrapage'], ['Quart avant', 'm:c', 'Surplus du jour'],
  ]);
});

test('le cerf va à celui qui n\'en a jamais eu', () => {
  const journal = [
    { date: '2026-10-01', nature: 'Distribution', espece: 'Cerf', piece: 'Entier', qte: 1, membreId: 'a' },
    { date: '2026-10-01', nature: 'Distribution', espece: 'Chevreuil', piece: 'Entier', qte: 1, membreId: 'c' },
  ];
  const r = L.attribuer({
    journee: base([bete('1', 'Chevreuil', 30), bete('2', 'Cerf', 30)], { prioTireur: false, presences: { a: 'oui', c: 'oui' } }),
    membres, params, journal,
  });
  assert.deepStrictEqual(r.pieces.map((p) => [p.espece, p.dest]), [['Chevreuil', 'm:a'], ['Cerf', 'm:c']]);
});

test('un seul présent : il reçoit tout, en surplus, avec une note', () => {
  const r = L.attribuer({ journee: base([bete('1', 'Daim', 90)], { prioTireur: false, presences: { a: 'oui' } }), membres, params, journal: [] });
  assert.deepStrictEqual(dests(r), ['a', 'a', 'a', 'a']);
  assert.deepStrictEqual(r.pieces.map((p) => p.remarque), ['', 'Surplus du jour', 'Surplus du jour', 'Surplus du jour']);
  assert.strictEqual(r.notes.length, 1);
});

test('3 présents et 6 pièces : 2 chacun ; 7 pièces : un seul en reçoit 3', () => {
  const compte = (r) => ['a', 'b', 'c'].map((id) => dests(r).filter((x) => x === id).length).sort();
  let r = L.attribuer({ journee: base([bete('1', 'Daim', 90), bete('2', 'Chevreuil', 50)], sans), membres, params, journal: [] });
  assert.deepStrictEqual(compte(r), [2, 2, 2]);
  assert.strictEqual(r.notes.length, 0);
  r = L.attribuer({ journee: base([bete('1', 'Daim', 90), bete('2', 'Chevreuil', 50), bete('3', 'Chevreuil', 20)], sans), membres, params, journal: [] });
  assert.deepStrictEqual(compte(r), [2, 2, 3]);
  assert.strictEqual(r.notes.length, 1);
});

test('à égalité, celui servi il y a le plus longtemps passe avant l\'ordre alphabétique', () => {
  const journal = [
    { date: '2026-10-10', nature: 'Distribution', espece: 'Chevreuil', piece: 'Entier', qte: 1, membreId: 'a' },
    { date: '2026-10-01', nature: 'Distribution', espece: 'Chevreuil', piece: 'Entier', qte: 1, membreId: 'c' },
  ];
  const r = L.attribuer({
    journee: base([bete('1', 'Chevreuil', 30)], { prioTireur: false, presences: { a: 'oui', c: 'oui' } }),
    membres, params, journal,
  });
  assert.deepStrictEqual(dests(r), ['c']);
});

test('écarts à la juste part : leur somme est nulle', () => {
  const journal = [
    { date: 'd', nature: 'Distribution', espece: 'Chevreuil', piece: 'Entier', qte: 3, membreId: 'a', poidsPiece: 60 },
    { date: 'd', nature: 'Distribution', espece: 'Sanglier', piece: 'Demi', qte: 1, membreId: 'b', poidsPiece: 25 },
    { date: 'd', nature: 'Distribution', espece: 'Chevreuil', piece: 'Entier', qte: 2, membreId: 'c', poidsPiece: 40 },
  ];
  const E = L.ecarts({ membres, params, journal });
  assert.deepStrictEqual(E.especes, ['Chevreuil', 'Sanglier']);
  const parId = Object.fromEntries(E.lignes.map((l) => [l.id, l]));
  assert.strictEqual(parId.a.total, 0.6);  // 3 − 6 × 2/5
  assert.strictEqual(parId.b.total, -0.2); // 1 − 6 × 1/5
  assert.strictEqual(parId.c.total, -0.4);
  assert.ok(Math.abs(E.lignes.reduce((s, l) => s + l.total, 0)) < 1e-9);
  assert.ok(Math.abs(E.lignes.reduce((s, l) => s + l.kg, 0)) < 1e-9);
});

test('compteur de « non » et alerte', () => {
  const journees = [{ presences: { b: 'non' } }, { presences: { b: 'oui' } }, { presences: { b: 'non' } }];
  assert.strictEqual(L.nbNon('b', journees), 2);
  assert.strictEqual(L.enAlerte(membres[1], journees, params), true);
  assert.strictEqual(L.enAlerte(membres[0], journees, params), false);
});

test('absent : jamais servi, et pas compté comme un « non »', () => {
  const r = L.attribuer({
    journee: base([{ id: '1', bague: 'X1', poids: 90, validation: 'OK', tireurId: 'c' }],
      { presences: { a: 'oui', b: 'oui', c: 'absent' } }),
    membres, params, journal: [],
  });
  assert.strictEqual(r.pieces.length, 4);
  assert.ok(r.pieces.every((p) => p.dest !== 'm:c'));
  const journees = [{ presences: { b: 'absent' } }, { presences: { b: 'absent' } }, { presences: { b: 'non' } }];
  assert.strictEqual(L.nbNon('b', journees), 1);
  assert.strictEqual(L.enAlerte(membres[1], journees, params), false);
});

test('absences rattrapées : même total par action en fin de saison', () => {
  const journal = [];
  for (let k = 0; k < 30; k++) {
    const date = '2026-' + String(1 + Math.floor(k / 28)).padStart(2, '0') + '-' + String(1 + (k % 28)).padStart(2, '0');
    const presences = { a: 'oui', b: 'oui', c: 'oui' };
    if (k < 5) presences.a = 'absent';
    if (k >= 10 && k < 13) presences.b = 'absent';
    if (k === 15) presences.c = 'absent';
    const r = L.attribuer({
      journee: base([{ id: '1', bague: 'Q' + k, poids: 90, validation: 'OK' }], { date, presences }),
      membres, params, journal,
    });
    r.pieces.forEach((p) => journal.push({ date, nature: 'Distribution', piece: p.piece, qte: 1, membreId: p.dest.slice(2) }));
  }
  const t = L.totaux(journal);
  assert.strictEqual(t['m:a'].total, 48);
  assert.strictEqual(t['m:b'].total, 24);
  assert.strictEqual(t['m:c'].total, 48);
});

// --- Cervidés
const dix = Array.from({ length: 10 }, (_, i) => ({ id: 'p' + i, nom: 'MEMBRE ' + String.fromCharCode(65 + i), action: '1', actif: true }));
const presentsDe = (ids) => Object.fromEntries(ids.map((id) => [id, 'oui']));
const tous = dix.map((m) => m.id);
const journeeC = (betes, extra) => Object.assign({
  date: '2026-11-20', presences: presentsDe(tous), presencesValidees: true, prioTireur: false, betes,
}, extra || {});
const recuDe = (journal, id, espece) => journal.filter((e) => e.membreId === id && e.espece === espece).length;
const ligne = (membreId, espece, piece) => ({ date: '2026-10-01', nature: 'Distribution', espece, piece, qte: 1, membreId });

test('découpe des cervidés selon les réglages', () => {
  assert.strictEqual(L.categorieSuggeree(120, paramsC, 'Cerf'), '8 morceaux');
  assert.strictEqual(L.categorieSuggeree(70, paramsC, 'daguet'), '8 morceaux');
  assert.strictEqual(L.categorieSuggeree(60, paramsC, 'Biche'), '6 morceaux');
  assert.strictEqual(L.categorieSuggeree(25, paramsC, 'Faon'), '6 morceaux');
  assert.strictEqual(L.categorieSuggeree(25, paramsC, 'Chevreuil'), 'Entier');
  assert.deepStrictEqual(L.piecesDe('8 morceaux'), ['Cuissot', 'Cuissot', 'Filet', 'Filet', 'Côte', 'Côte', 'Avant', 'Avant']);
  assert.deepStrictEqual(L.piecesDe('6 morceaux'), ['Cuissot', 'Cuissot', 'Côtes/filet', 'Côtes/filet', 'Avant', 'Avant']);
  assert.strictEqual(L.categorieBete({ poids: 15, espece: 'Faon', categorie: 'Entier' }, paramsC), 'Entier');
  const avecDaim = Object.assign({}, paramsC, { decoupe: Object.assign({ Daim: '6 morceaux' }, paramsC.decoupe) });
  assert.strictEqual(L.categorieSuggeree(50, avecDaim, 'Daim'), '6 morceaux');
  assert.strictEqual(L.groupeEspece('Daim', avecDaim), 'Cervidés');
  assert.strictEqual(L.groupeEspece('Daim', paramsC), 'Daim');
  assert.deepStrictEqual(L.especesCervides(paramsC), ['Cerf', 'Daguet', 'Biche', 'Faon']);
});

test('cerf : ceux qui en ont déjà eu passent après tous les autres', () => {
  const journal = [ligne('p0', 'Cerf', 'Cuissot'), ligne('p1', 'Cerf', 'Avant')];
  const r = L.attribuer({ journee: journeeC([bete('1', 'Cerf', 120)]), membres: dix, params: paramsC, journal });
  assert.deepStrictEqual(dests(r).sort(), ['p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9']);
});

test('cerf : priorité à ceux qui n\'en ont pas eu la saison précédente', () => {
  const ms = dix.map((m, i) => Object.assign({}, m, { cerfAnDernier: i < 4 }));
  const r = L.attribuer({ journee: journeeC([bete('1', 'Cerf', 120)]), membres: ms, params: paramsC, journal: [] });
  ['p4', 'p5', 'p6', 'p7', 'p8', 'p9'].forEach((id) => assert.ok(dests(r).includes(id), id));
  assert.strictEqual(new Set(dests(r)).size, 8);
});

test('cerf : passe avant la limite du jour, la pièce du tireur reste à lui', () => {
  // p0 tire un chevreuil, n'a jamais eu de cerf et n'est pas en retard ; p1 et p2 ont déjà eu du cerf
  const journal = [ligne('p1', 'Cerf', 'Cuissot'), ligne('p2', 'Cerf', 'Cuissot'),
    ligne('p0', 'Chevreuil', 'Entier'), ligne('p0', 'Chevreuil', 'Entier'), ligne('p0', 'Sanglier', 'Demi')];
  const r = L.attribuer({
    journee: journeeC([bete('1', 'Chevreuil', 25, { tireurId: 'p0' }), bete('2', 'Cerf', 120, { categorie: '2 demis' })],
      { prioTireur: true, presences: presentsDe(['p0', 'p1', 'p2']) }),
    membres: dix, params: paramsC, journal,
  });
  assert.deepStrictEqual(r.pieces.filter((p) => p.dest === 'm:p0').map((p) => [p.espece, p.remarque]),
    [['Chevreuil', 'Priorité tireur'], ['Cerf', 'Priorité cerf']]);
  assert.ok(['m:p1', 'm:p2'].includes(r.pieces[2].dest));
});

test('cerf avec peu de présents : chacun un morceau avant un 2e', () => {
  const r = L.attribuer({
    journee: journeeC([bete('1', 'Cerf', 120)], { presences: presentsDe(['p0', 'p1', 'p2', 'p3', 'p4']) }),
    membres: dix, params: paramsC, journal: [],
  });
  assert.deepStrictEqual([...new Set(dests(r).slice(0, 5))].sort(), ['p0', 'p1', 'p2', 'p3', 'p4']);
});

test('biche, faon, daguet et cerf comptent ensemble comme cervidés', () => {
  const journal = [ligne('p0', 'Biche', 'Cuissot'), ligne('p1', 'Chevreuil', 'Entier')];
  const c = L.compteurs(journal, ['p0'], null, paramsC);
  assert.strictEqual(c.p0.esp['Cervidés'], 1);
  assert.strictEqual(c.p0.type['Cervidés|Cuissot'], 1);
  const r = L.attribuer({
    journee: journeeC([bete('1', 'Faon', 15, { categorie: 'Entier' })], { presences: presentsDe(['p0', 'p1']) }),
    membres: dix, params: paramsC, journal,
  });
  assert.deepStrictEqual(dests(r), ['p1']);
});

test('nouvelle saison : qui a reçu du cerf', () => {
  const journal = [ligne('p0', 'Cerf', 'Filet'), ligne('p1', 'Daguet', 'Filet'),
    { date: 'd', nature: 'Ajustement', espece: 'Cerf', piece: 'Avant', qte: 1, membreId: 'p2' }];
  assert.deepStrictEqual([...L.membresAvecCerf(journal)], ['p0']);
  assert.strictEqual(recuDe(journal, 'p0', 'Cerf'), 1);
});

// --- Pièces non consommables et choix imposés à la main
test('non consommable : à personne, les autres pièces recalculées', () => {
  // 3 présents, un chevreuil en 4 quarts, sans tireur : 1 pièce chacun + 1 rattrapage/surplus
  const betes = [{ id: 'q', bague: 'NC1', espece: 'Chevreuil', poids: 80, validation: 'OK' }];
  const sans = L.attribuer({ journee: base(betes), membres, params, journal: [] });
  assert.strictEqual(sans.pieces.length, 4);
  assert.deepStrictEqual(sans.pieces.map((p) => p.id), ['q#0', 'q#1', 'q#2', 'q#3']);
  // Le 1er quart arrière devient non consommable : 3 pièces pour 3 présents, une chacun
  const r = L.attribuer({ journee: base(betes), membres, params, journal: [], imposees: { 'q#0': { dest: L.NON_CONSO, remarque: 'Non consommable' } } });
  assert.strictEqual(r.pieces[0].dest, L.NON_CONSO);
  assert.strictEqual(r.pieces[0].remarque, 'Non consommable');
  const servis = r.pieces.slice(1).map((p) => p.dest).sort();
  assert.deepStrictEqual(servis, ['m:a', 'm:b', 'm:c']);
});

test('pièce imposée à un membre : elle compte pour lui', () => {
  const betes = [{ id: 'q', bague: 'NC2', espece: 'Chevreuil', poids: 80, validation: 'OK' }];
  const r = L.attribuer({
    journee: base(betes), membres, params, journal: [],
    imposees: { 'q#3': { dest: 'm:a', remarque: 'Modifié à la main' }, 'q#2': { dest: L.NON_CONSO, remarque: 'Non consommable' } },
  });
  assert.strictEqual(r.pieces[3].dest, 'm:a');
  assert.strictEqual(r.pieces[3].remarque, 'Modifié à la main');
  // Restent 2 pièces pour BRAVO et CHARLIE, ALPHA déjà servi
  assert.deepStrictEqual([r.pieces[0].dest, r.pieces[1].dest].sort(), ['m:b', 'm:c']);
});

test('priorité tireur quand sa 1re pièce est non consommable : il reçoit la suivante', () => {
  const betes = [{ id: 'q', bague: 'NC3', espece: 'Chevreuil', poids: 80, validation: 'OK', tireurId: 'c' }];
  const r = L.attribuer({ journee: base(betes), membres, params, journal: [], imposees: { 'q#0': { dest: L.NON_CONSO } } });
  assert.strictEqual(r.pieces[1].dest, 'm:c');
  assert.strictEqual(r.pieces[1].remarque, 'Priorité tireur');
});

test('totaux : détail par espèce et par morceau', () => {
  const journal = [
    { date: '2026-10-01', nature: 'Distribution', espece: 'Chevreuil', piece: 'Demi', qte: 1, membreId: 'a' },
    { date: '2026-10-02', nature: 'Distribution', espece: 'Chevreuil', piece: 'Demi', qte: 1, membreId: 'a' },
    { date: '2026-10-02', nature: 'Distribution', espece: 'Cerf', piece: 'Cuissot', qte: 1, membreId: 'a' },
    { date: '2026-10-02', nature: 'Distribution', piece: 'Entier', qte: 1, membreId: 'a' },
  ];
  const t = L.totaux(journal)['m:a'];
  assert.deepStrictEqual(t.type, { 'Chevreuil|Demi': 2, 'Cerf|Cuissot': 1, '|Entier': 1 });
  assert.strictEqual(t.Demi, 2);
  assert.strictEqual(t.total, 4);
});

test('lignes « Non consommable » du journal : comptées pour personne', () => {
  const journal = [{ date: '2026-10-01', nature: 'Non consommable', espece: 'Cerf', piece: 'Cuissot', qte: 1, membreId: null, nom: '' }];
  const c = L.compteurs(journal, ['a', 'b'], null, paramsC);
  assert.strictEqual(c.a.total + c.b.total, 0);
  assert.deepStrictEqual(L.totaux(journal), {});
  assert.strictEqual(L.saisonCommencee(journal), false);
  assert.strictEqual(L.membresAvecCerf(journal).size, 0);
});

console.log(`${ok} tests réussis — ${jours} journées et ${pieces} pièces conformes aux règles de répartition.`);
