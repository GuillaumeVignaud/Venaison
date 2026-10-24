/*
 * Tests du moteur de calcul. Lancer avec :  node tests/logic.test.js
 * fixtures.json contient 40 saisons générées au hasard, avec la répartition attendue
 * calculée par un programme de référence indépendant (celui qui a validé le fichier Excel).
 */
const assert = require('assert');
const path = require('path');
const L = require('../js/logic.js');
const fixtures = require(path.join(__dirname, 'fixtures.json'));

const params = {
  seuilEntier: 40, seuilDemi: 65,
  actions: { '1': { coef: 2, alerte: 4 }, '1/2': { coef: 1, alerte: 2 } },
};
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

// --- Répartitions identiques au calcul de référence
let jours = 0;
let pieces = 0;
fixtures.forEach((saison, s) => {
  saison.days.forEach((day) => {
    const membres = saison.members;
    const parNom = Object.fromEntries(membres.map((m) => [m.nom, m]));
    const journee = {
      date: day.date, presences: day.presence, presencesValidees: true, prioTireur: day.prio,
      betes: day.animals.map((a, i) => ({
        id: 'b' + i, bague: a.bague, espece: a.esp, poids: a.poids,
        tireurId: parNom[a.tireur] ? parNom[a.tireur].id : '',
        tireurNom: parNom[a.tireur] ? '' : a.tireur,
        categorie: a.cat || '', validation: a.valid,
      })),
    };
    test(`saison ${s} ${day.date}`, () => {
      const r = L.attribuer({ journee, membres, params, journal: saison.journal.slice(0, day.journal_avant) });
      assert.deepStrictEqual(r.erreurs, []);
      const got = r.pieces.map((p) => ({
        bague: p.bague, piece: p.piece,
        nom: membres.find((m) => 'm:' + m.id === p.dest).nom, rem: p.remarque,
      }));
      assert.deepStrictEqual(got, day.expected);
      jours++;
      pieces += got.length;
    });
  });
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
  const m2 = membres.concat([{ id: 'n', nom: 'NOUVEAU N', action: '1/2', actif: true }]);
  const journal = [
    { date: 'd', nature: 'Distribution', piece: 'Quart avant', qte: 3, membreId: 'a' },
    { date: 'd', nature: 'Distribution', piece: 'Quart avant', qte: 2, membreId: 'b' },
    { date: 'd', nature: 'Distribution', piece: 'Quart avant', qte: 4, membreId: 'c' },
    { date: 'd', nature: 'Distribution', piece: 'Entier', qte: 1, membreId: 'a' },
  ];
  const q = L.alignement('n', m2, params, journal);
  assert.strictEqual(q['Quart avant'], 1.5); // min(3/2, 2/1, 4/2) = 1,5 × coef 1
  assert.strictEqual(q.Entier, 0);           // BRAVO et CHARLIE n'ont aucun entier
});

test('compteur de « non » et alerte', () => {
  const journees = [{ presences: { b: 'non' } }, { presences: { b: 'oui' } }, { presences: { b: 'non' } }];
  assert.strictEqual(L.nbNon('b', journees), 2);
  assert.strictEqual(L.enAlerte(membres[1], journees, params), true);
  assert.strictEqual(L.enAlerte(membres[0], journees, params), false);
});

console.log(`${ok} tests réussis — ${jours} journées et ${pieces} pièces identiques au calcul de référence.`);
