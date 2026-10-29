/*
 * Venaison — interface.
 * Organisation : quelques fonctions « vue » renvoient le HTML de l'écran,
 * et des « actions » (data-act / data-change / data-submit) modifient les données puis réaffichent.
 */
(function () {
  'use strict';

  const L = window.Logic;
  const S = window.Store;
  const d = () => S.data;
  const $ = (sel, r) => (r || document).querySelector(sel);

  const ui = { onglet: 'journee', etape: null, vueRep: null, vueHist: 'totaux', ouverts: new Set() };

  // ------------------------------------------------------------------ outils

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  const pad = (n) => String(n).padStart(2, '0');

  function aujourdHui() {
    const t = new Date();
    return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`;
  }

  function dateLongue(iso, avecAnnee) {
    const o = { weekday: 'long', day: 'numeric', month: 'long' };
    if (avecAnnee) o.year = 'numeric';
    const s = new Date(iso + 'T12:00:00').toLocaleDateString('fr-FR', o);
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function dateHeure(isoDT) {
    if (!isoDT) return '';
    const t = new Date(isoDT);
    return `${pad(t.getDate())}/${pad(t.getMonth() + 1)}/${t.getFullYear()} à ${pad(t.getHours())} h ${pad(t.getMinutes())}`;
  }

  function kg(n) {
    if (n == null || n === '') return '';
    const r = Math.round(Number(n) * 10) / 10;
    return r.toLocaleString('fr-FR', { minimumFractionDigits: r % 1 ? 1 : 0, maximumFractionDigits: 1 });
  }

  function qte(n) {
    const r = Math.round(Number(n) * 100) / 100;
    return r.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
  }

  const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`;

  function membresTries(actifsSeulement) {
    return d().membres.filter((m) => !actifsSeulement || m.actif).sort((a, b) => L.compareNoms(a.nom, b.nom));
  }
  const membre = (id) => d().membres.find((m) => m.id === id);
  const journee = (date) => d().journees.find((j) => j.date === date);
  const joursTries = () => [...d().journees].sort((a, b) => b.date.localeCompare(a.date));

  function jourCourant() {
    return journee(d().journeeCourante) || joursTries()[0] || null;
  }

  function nomDest(dest) {
    if (!dest) return '';
    if (dest === L.NON_CONSO) return 'Non consommable';
    if (dest.startsWith('m:')) {
      const m = membre(dest.slice(2));
      return m ? m.nom : 'Membre supprimé';
    }
    return dest.slice(2);
  }

  function estProprietaire(nom) {
    return d().params.proprietaires.some((p) => L.memeNom(p, nom));
  }

  function sauver() { S.enregistrer(true); }

  function liste(items) {
    return `<ul class="liste-msg">${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
  }

  // ------------------------------------------------------------------ fenêtres

  let modaleOuverte = null;

  function feuille({ titre, corps, boutons, valider, onOuvrir }) {
    return new Promise((resolve) => {
      const racine = $('#modale');
      const fond = document.createElement('div');
      fond.className = 'fond';
      fond.innerHTML = `
        <div class="feuille" role="dialog" aria-modal="true" aria-labelledby="feuille-titre">
          <h2 id="feuille-titre">${esc(titre)}</h2>
          <div class="feuille-corps">${corps || ''}</div>
          <p class="feuille-erreur" role="alert" hidden></p>
          <div class="feuille-boutons">
            ${boutons.map((b, i) => `<button type="button" class="btn ${b.style || 'neutre'}" data-i="${i}">${esc(b.label)}</button>`).join('')}
          </div>
        </div>`;
      const avant = document.activeElement;
      racine.appendChild(fond);
      document.body.classList.add('modale-ouverte');
      const fermer = (v) => {
        fond.remove();
        document.body.classList.remove('modale-ouverte');
        modaleOuverte = null;
        if (avant && avant.isConnected) avant.focus({ preventScroll: true });
        resolve(v);
      };
      modaleOuverte = { annuler: () => fermer(null) };
      fond.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-i]');
        if (!b) return;
        const def = boutons[Number(b.dataset.i)];
        if (def.value === 'ok' && valider) {
          const r = valider(fond);
          if (r && r.erreur) {
            const err = $('.feuille-erreur', fond);
            err.textContent = r.erreur;
            err.hidden = false;
            return;
          }
          fermer(r);
        } else {
          fermer(def.value);
        }
      });
      fond.addEventListener('submit', (ev) => ev.preventDefault());
      if (onOuvrir) onOuvrir(fond);
      const cible = $('input:not([hidden]):not([type=radio]):not([type=checkbox]), select', fond) || $('.btn.primaire, .btn.danger', fond) || $('.btn', fond);
      if (cible) cible.focus({ preventScroll: true });
    });
  }

  const alerte = (titre, html) => feuille({ titre, corps: html, boutons: [{ label: 'OK', value: true, style: 'primaire' }] });

  const confirmer = (titre, html, ok, danger) => feuille({
    titre, corps: html,
    boutons: [{ label: 'Annuler', value: false }, { label: ok || 'Confirmer', value: true, style: danger ? 'danger' : 'primaire' }],
  }).then((v) => v === true);

  let toastMinuteur = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('visible');
    clearTimeout(toastMinuteur);
    toastMinuteur = setTimeout(() => t.classList.remove('visible'), 2600);
  }

  // ------------------------------------------------------------------ affichage

  function cleFocus(el) {
    if (!el || !el.dataset) return null;
    const k = ['act', 'change', 'id', 'v', 'i', 'onglet', 'etape'].map((x) => el.dataset[x] || '').join('|');
    return k.replace(/\|/g, '') ? k : null;
  }

  function rendre() {
    const cle = cleFocus(document.activeElement);
    $('#saison').textContent = 'Saison ' + d().saison;
    const vues = { journee: vueJournee, historique: vueHistorique, membres: vueMembres, reglages: vueReglages };
    $('#vue').innerHTML = vues[ui.onglet]();
    document.querySelectorAll('.onglet').forEach((b) => {
      if (b.dataset.onglet === ui.onglet) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    document.body.classList.toggle('avec-action', !!$('#vue .barre-action'));
    if (cle) {
      const el = [...document.querySelectorAll('#vue [data-act], #vue [data-change]')].find((x) => cleFocus(x) === cle);
      if (el) el.focus({ preventScroll: true });
    }
    if (ui.onglet === 'reglages') afficherVersion();
    ajusterTableaux();
  }

  /** Donne au cadre du tableau la hauteur libre de l'écran : sous le titre et les boutons,
   *  au-dessus de la note et des onglets, pour que tout tienne sans faire défiler la page. */
  function ajusterTableaux() {
    const haut = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    // La marge basse de <main> couvre déjà les onglets et la zone de sécurité du téléphone
    const main = $('main');
    const bas = main ? parseFloat(getComputedStyle(main).paddingBottom) || 0 : 0;
    document.querySelectorAll('#vue .tableau-defile').forEach((cadre) => {
      const debut = cadre.getBoundingClientRect().top + window.scrollY;
      const suite = cadre.nextElementSibling;
      const sous = suite ? suite.getBoundingClientRect().height + parseFloat(getComputedStyle(suite).marginTop || 0) : 0;
      const dispo = haut - debut - sous - bas;
      cadre.style.maxHeight = Math.max(dispo, 220) + 'px';
    });
  }
  window.addEventListener('resize', ajusterTableaux);
  if (window.visualViewport) window.visualViewport.addEventListener('resize', ajusterTableaux);

  // ------------------------------------------------------------------ journée

  function statuts(j) {
    const r = j.repartition;
    const n = j.betes.length;
    return {
      presences: { txt: j.presencesValidees ? 'Validées' : 'À valider', fait: j.presencesValidees },
      betes: { txt: n ? pluriel(n, 'bête', 'bêtes') : 'Aucune', fait: !!r },
      repartition: {
        txt: !r ? 'À lancer' : { proposee: 'À valider', validee: 'Validée', modifiee: 'À revalider' }[r.statut],
        fait: !!r && r.statut === 'validee',
      },
    };
  }

  function etapeParDefaut(j) {
    if (!j.presencesValidees) return 'presences';
    if (!j.repartition) return 'betes';
    return 'repartition';
  }

  function titreDate(iso) {
    const mots = dateLongue(iso, false).split(' ');
    const fin = mots.pop();
    return `${esc(mots.join(' '))} <span class="fin">${esc(fin)}</span>`;
  }

  function vueJournee() {
    if (!d().membres.length) {
      return `<section class="vide">
        <h1>Bienvenue</h1>
        <p>Commencez par saisir les membres de la société, avec leur action (1 ou 1/2).</p>
        <button class="btn primaire" data-act="onglet" data-onglet="membres">Saisir les membres</button>
      </section>`;
    }
    const jours = joursTries();
    if (!jours.length) {
      return `<section class="vide">
        <h1>Aucune journée</h1>
        <p>Créez la journée de chasse pour saisir les présences, puis les bêtes.</p>
        <button class="btn primaire" data-act="nouvelleJournee">Nouvelle journée de chasse</button>
      </section>`;
    }
    const j = jourCourant();
    if (d().journeeCourante !== j.date) {
      d().journeeCourante = j.date;
      S.enregistrer(false);
    }
    if (!ui.etape) ui.etape = etapeParDefaut(j);
    const st = statuts(j);
    const etapes = [['presences', 'Présences'], ['betes', 'Bêtes'], ['repartition', 'Répartition']];
    const contenu = { presences: etapePresences, betes: etapeBetes, repartition: etapeRepartition }[ui.etape](j);
    return `
      <section class="jour-tete">
        <div class="jour-choix">
          <h1 class="jour-titre">${titreDate(j.date)}</h1>
          <select class="jour-date" data-change="choisirJour" aria-label="Changer de journée">
            ${jours.map((x) => `<option value="${x.date}" ${x.date === j.date ? 'selected' : ''}>${esc(dateLongue(x.date, true))}</option>`).join('')}
          </select>
        </div>
        <button class="btn-icone" data-act="nouvelleJournee" aria-label="Nouvelle journée de chasse">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
        </button>
        <button class="btn-icone" data-act="menuJournee" aria-label="Options de la journée">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>
        </button>
      </section>
      <nav class="etapes" aria-label="Étapes de la journée">
        ${etapes.map(([k, lib], i) => `
          <button class="etape${st[k].fait ? ' faite' : ''}" data-act="etape" data-etape="${k}" ${ui.etape === k ? 'aria-current="step"' : ''}>
            <span class="etape-n">${st[k].fait ? '✓' : i + 1}</span>
            <span class="etape-t">${lib}</span>
            <span class="etape-s">${st[k].txt}</span>
          </button>`).join('')}
      </nav>
      ${bandeauSauvegarde(j)}
      <section class="etape-contenu">${contenu}</section>`;
  }

  function bandeauSauvegarde(j) {
    if (!(j.repartition && j.repartition.statut === 'validee' && S.aSauvegarder())) return '';
    return `<div class="bandeau rappel">
      <p>Les données ne sont que sur ce téléphone. Exportez la sauvegarde pour pouvoir les retrouver.</p>
      <button class="btn petit" data-act="exporterSauvegarde">Exporter</button>
    </div>`;
  }

  // ---- étape 1 : présences

  function etapePresences(j) {
    const ms = membresTries(true);
    const verrou = j.presencesValidees;
    const nOui = ms.filter((m) => j.presences[m.id] === 'oui').length;
    const nNon = ms.filter((m) => j.presences[m.id] === 'non').length;
    const nAbs = ms.filter((m) => j.presences[m.id] === 'absent').length;
    const nVide = ms.length - nOui - nNon - nAbs;
    const abs = nAbs ? `, ${pluriel(nAbs, 'absent', 'absents')}` : '';
    const tete = verrou
      ? `<div class="bandeau ok"><p>Présences validées : ${pluriel(nOui, 'présent', 'présents')}, ${nNon} non${abs}.</p>
           <button class="btn petit" data-act="rouvrirPresences">Rouvrir</button></div>`
      : `<div class="resume"><p>${nOui} oui, ${nNon} non${abs}${nVide ? `, <strong>${nVide} à renseigner</strong>` : ''}</p>
           ${nVide ? `<button class="lien" data-act="tousOui">Oui pour les ${nVide} restants</button>` : ''}</div>`;
    const lignes = ms.map((m) => {
      const v = j.presences[m.id] || '';
      const nn = L.nbNon(m.id, d().journees);
      const al = L.enAlerte(m, d().journees, d().params);
      return `<li class="pres${al ? ' en-alerte' : ''}">
        <div class="pres-nom">
          <span class="nom">${esc(m.nom)}</span>
          <span class="pres-info">Action ${esc(m.action)}${nn ? `<span class="badge-non${al ? ' alerte' : ''}" title="Nombre de « non » cette saison">${nn} « non »</span>` : ''}</span>
        </div>
        <div class="seg" role="group" aria-label="Présence de ${esc(m.nom)}">
          <button class="seg-oui" data-act="presence" data-id="${m.id}" data-v="oui" aria-pressed="${v === 'oui'}" ${verrou ? 'disabled' : ''}>oui</button>
          <button class="seg-non" data-act="presence" data-id="${m.id}" data-v="non" aria-pressed="${v === 'non'}" ${verrou ? 'disabled' : ''}>non</button>
          <button class="seg-absent" data-act="presence" data-id="${m.id}" data-v="absent" aria-pressed="${v === 'absent'}" ${verrou ? 'disabled' : ''}>absent</button>
        </div>
      </li>`;
    }).join('');
    return `${tete}
      <ul class="liste-pres">${lignes}</ul>
      ${verrou ? '' : `<div class="barre-action"><button class="btn primaire large" data-act="validerPresences">Valider les présences</button></div>`}`;
  }

  // ---- étape 2 : bêtes

  function etapeBetes(j) {
    const p = d().params;
    const items = j.betes.map((b) => {
      const cat = L.categorieBete(b, p);
      const tireur = L.nomTireur(b, d().membres);
      const sexe = b.sexe === 'M' ? 'mâle' : b.sexe === 'F' ? 'femelle' : '';
      const sous = [sexe, tireur ? `prélevé par ${esc(tireur)}` : ''].filter(Boolean).join(', ');
      return `<li class="bete${b.validation === 'NOK' ? ' nok' : ''}">
        <button class="bete-carte" data-act="editerBete" data-id="${b.id}" aria-label="Modifier la bête ${esc(b.bague || '')}">
          <span class="bete-bague">${b.bague ? esc(b.bague) : 'sans bague'}</span>
          <span class="bete-titre">${esc(b.espece || 'Espèce ?')} <span class="bete-poids">${b.poids ? kg(b.poids) + ' kg' : 'poids ?'}</span></span>
          ${sous ? `<span class="bete-sous">${sous.charAt(0).toUpperCase() + sous.slice(1)}</span>` : ''}
          <span class="bete-cat">${cat ? esc(cat) : 'Catégorie ?'}${cat && !b.categorie ? ` <em>(selon ${L.decoupeEspece(b.espece, p) ? 'l’espèce' : 'le poids'})</em>` : ''}</span>
        </button>
        <div class="seg seg-ok" role="group" aria-label="Validation">
          <button data-act="validationBete" data-id="${b.id}" data-v="OK" aria-pressed="${b.validation === 'OK'}">OK</button>
          <button data-act="validationBete" data-id="${b.id}" data-v="NOK" aria-pressed="${b.validation === 'NOK'}">NOK</button>
        </div>
      </li>`;
    }).join('');
    return `
      <label class="interrupteur">
        <input type="checkbox" data-change="prioTireur" ${j.prioTireur ? 'checked' : ''}>
        <span class="interrupteur-piste" aria-hidden="true"></span>
        <span class="interrupteur-txt"><strong>Priorité au tireur</strong>
          <small>Le tireur présent reçoit d’abord une pièce de chacune de ses bêtes.</small></span>
      </label>
      ${j.betes.length ? `<ul class="liste-betes">${items}</ul>` : '<p class="vide-petit">Aucune bête saisie pour cette journée.</p>'}
      <button class="btn secondaire large" data-act="ajouterBete">Ajouter une bête</button>
      <div class="barre-action"><button class="btn primaire large" data-act="lancerAttribution">Lancer l’attribution</button></div>`;
  }

  function optionsTireur(b) {
    const ms = membresTries(true);
    if (b.tireurId && !ms.some((m) => m.id === b.tireurId) && membre(b.tireurId)) ms.push(membre(b.tireurId));
    const autre = !b.tireurId && !!b.tireurNom;
    return `<option value="">Personne</option>
      ${ms.map((m) => `<option value="${m.id}" ${m.id === b.tireurId ? 'selected' : ''}>${esc(m.nom)}</option>`).join('')}
      <option value="__autre" ${autre ? 'selected' : ''}>Invité ou autre…</option>`;
  }

  async function formBete(existante) {
    const j = jourCourant();
    const p = d().params;
    const b = existante || { bague: '', espece: '', poids: null, sexe: '', tireurId: '', tireurNom: '', categorie: '', validation: 'OK' };
    const especes = [...p.especes];
    if (b.espece && !especes.includes(b.espece)) especes.push(b.espece);
    const radio = (nom, val, lib, coche) => `<label class="seg-radio"><input type="radio" name="${nom}" value="${val}" ${coche ? 'checked' : ''}><span>${lib}</span></label>`;
    const corps = `
      <div class="champs-2">
        <div class="champ"><label for="f-bague">N° de bague</label>
          <input id="f-bague" value="${esc(b.bague)}" autocomplete="off" autocapitalize="characters" spellcheck="false"></div>
        <div class="champ"><label for="f-poids">Poids (kg)</label>
          <input id="f-poids" inputmode="decimal" autocomplete="off" value="${b.poids != null ? String(b.poids).replace('.', ',') : ''}"></div>
      </div>
      <div class="champs-2">
        <div class="champ"><label for="f-espece">Espèce</label>
          <select id="f-espece"><option value=""></option>${especes.map((e) => `<option ${e === b.espece ? 'selected' : ''}>${esc(e)}</option>`).join('')}</select></div>
        <fieldset class="champ"><legend>Sexe</legend>
          <div class="seg">${radio('f-sexe', 'M', 'Mâle', b.sexe === 'M')}${radio('f-sexe', 'F', 'Femelle', b.sexe === 'F')}</div></fieldset>
      </div>
      <div class="champ"><label for="f-tireur">Prélevé par</label>
        <select id="f-tireur">${optionsTireur(b)}</select>
        <input id="f-tireur-nom" placeholder="Nom de l’invité (jamais servi)" value="${esc(b.tireurNom)}" ${!b.tireurId && b.tireurNom ? '' : 'hidden'}></div>
      <div class="champ"><label for="f-cat">Catégorie à distribuer</label>
        <select id="f-cat">
          <option value="" id="f-cat-auto"></option>
          ${L.CATEGORIES.map((c) => `<option value="${c}" ${c === b.categorie ? 'selected' : ''}>${c}</option>`).join('')}
        </select></div>
      <fieldset class="champ"><legend>Validation</legend>
        <div class="seg">${radio('f-valid', 'OK', 'OK, à distribuer', b.validation !== 'NOK')}${radio('f-valid', 'NOK', 'NOK, non distribuée', b.validation === 'NOK')}</div>
      </fieldset>`;
    const boutons = existante
      ? [{ label: 'Supprimer', value: 'suppr', style: 'danger-lien' }, { label: 'Annuler', value: null }, { label: 'Enregistrer', value: 'ok', style: 'primaire' }]
      : [{ label: 'Annuler', value: null }, { label: 'Ajouter', value: 'ok', style: 'primaire' }];
    const res = await feuille({
      titre: existante ? 'Modifier la bête' : 'Ajouter une bête',
      corps, boutons,
      onOuvrir: (r) => {
        const poids = $('#f-poids', r);
        const espece = $('#f-espece', r);
        const auto = $('#f-cat-auto', r);
        const maj = () => {
          const parEspece = L.decoupeEspece(espece.value, p);
          const c = L.categorieSuggeree(L.parseNombre(poids.value), p, espece.value);
          const selon = parEspece ? 'Selon l’espèce' : 'Selon le poids';
          auto.textContent = c ? `${selon} : ${c}` : selon;
        };
        poids.addEventListener('input', maj);
        espece.addEventListener('change', maj);
        maj();
        const t = $('#f-tireur', r);
        t.addEventListener('change', () => {
          const nom = $('#f-tireur-nom', r);
          nom.hidden = t.value !== '__autre';
          if (!nom.hidden) nom.focus();
        });
      },
      valider: (r) => {
        const txt = $('#f-poids', r).value.trim();
        const poids = L.parseNombre(txt);
        if (txt && !(poids > 0)) return { erreur: 'Le poids doit être un nombre de kilos, par exemple 27,5.' };
        const tv = $('#f-tireur', r).value;
        const sexe = $('input[name=f-sexe]:checked', r);
        return {
          bague: $('#f-bague', r).value.trim(),
          espece: $('#f-espece', r).value,
          poids: txt ? poids : null,
          sexe: sexe ? sexe.value : '',
          tireurId: tv && tv !== '__autre' ? tv : '',
          tireurNom: tv === '__autre' ? $('#f-tireur-nom', r).value.trim() : '',
          categorie: $('#f-cat', r).value,
          validation: $('input[name=f-valid]:checked', r).value,
        };
      },
    });
    if (!res) return;
    if (res === 'suppr') {
      if (!(await confirmer('Supprimer cette bête ?', `<p>La bête ${esc(b.bague || '')} sera retirée de la journée.</p>`, 'Supprimer', true))) return;
      j.betes = j.betes.filter((x) => x.id !== b.id);
    } else if (existante) {
      Object.assign(existante, res);
    } else {
      j.betes.push(Object.assign({ id: S.uid() }, res));
    }
    sauver();
    rendre();
  }

  // ---- étape 3 : répartition

  // Lignes du journal propres à une journée (remplacées à chaque validation)
  const NATURES_JOUR = ['Distribution', 'Non consommable'];

  /** Donne un id « beteId#rang » aux pièces d'une ancienne répartition qui n'en ont pas. */
  function numeroterPieces(pieces) {
    const rangs = {};
    pieces.forEach((p) => {
      rangs[p.beteId] = (rangs[p.beteId] || 0) + 1;
      if (!p.id) p.id = `${p.beteId}#${rangs[p.beteId] - 1}`;
    });
  }

  /** Choix à garder lors d'un recalcul : pièces modifiées à la main (tout = true) ou seulement non consommables. */
  function piecesImposees(pieces, tout) {
    const imp = {};
    numeroterPieces(pieces);
    pieces.forEach((p) => {
      if (p.dest === L.NON_CONSO || (tout && p.manuel)) imp[p.id] = { dest: p.dest, remarque: p.remarque };
    });
    return imp;
  }

  function optionsDest(dest) {
    const ms = membresTries(true);
    if (dest && dest.startsWith('m:') && !ms.some((m) => 'm:' + m.id === dest) && membre(dest.slice(2))) ms.push(membre(dest.slice(2)));
    const props = [...d().params.proprietaires];
    if (dest && dest.startsWith('p:') && !props.includes(dest.slice(2))) props.push(dest.slice(2));
    return `<option value="" ${!dest ? 'selected' : ''}>Personne</option>
      <option value="${L.NON_CONSO}" ${dest === L.NON_CONSO ? 'selected' : ''}>Non consommable</option>
      <optgroup label="Membres">${ms.map((m) => `<option value="m:${m.id}" ${'m:' + m.id === dest ? 'selected' : ''}>${esc(m.nom)}</option>`).join('')}</optgroup>
      <optgroup label="Propriétaires">${props.map((p) => `<option value="p:${esc(p)}" ${'p:' + p === dest ? 'selected' : ''}>${esc(p)}</option>`).join('')}</optgroup>`;
  }

  function etapeRepartition(j) {
    const r = j.repartition;
    if (!r) {
      return `<section class="vide">
        <p>Pas encore de répartition pour cette journée. Saisissez les bêtes, puis lancez l’attribution.</p>
        <button class="btn primaire" data-act="etape" data-etape="betes">Aller aux bêtes</button>
      </section>`;
    }
    const vue = ui.vueRep || (r.statut === 'validee' ? 'personnes' : 'betes');
    const bandeau = {
      proposee: `<div class="bandeau attente"><p>Proposition du ${dateHeure(r.lanceeLe)}. Vérifiez, corrigez si besoin, puis validez.</p></div>`,
      modifiee: '<div class="bandeau attente"><p>Modifiée depuis la validation : validez à nouveau pour enregistrer les changements.</p></div>',
      validee: `<div class="bandeau ok"><p>Validée le ${dateHeure(r.valideeLe)}, enregistrée dans l’historique.</p></div>`,
    }[r.statut];
    const corps = vue === 'personnes' ? repartitionParPersonne(j) : repartitionParBete(j);
    return `${bandeau}
      <div class="bascule" role="group" aria-label="Affichage">
        <button data-act="vueRep" data-v="betes" aria-pressed="${vue === 'betes'}">Par bête</button>
        <button data-act="vueRep" data-v="personnes" aria-pressed="${vue === 'personnes'}">Par personne</button>
      </div>
      ${corps}
      ${r.statut !== 'validee' ? '<div class="barre-action"><button class="btn primaire large" data-act="validerRepartition">Valider la répartition</button></div>' : ''}`;
  }

  function repartitionParBete(j) {
    const groupes = [];
    j.repartition.pieces.forEach((p, i) => {
      let g = groupes.find((x) => x.beteId === p.beteId);
      if (!g) {
        g = { beteId: p.beteId, p, items: [] };
        groupes.push(g);
      }
      g.items.push({ p, i });
    });
    return groupes.map(({ p, items }) => `
      <section class="groupe">
        <h3 class="groupe-titre">${esc(p.espece || 'Bête')}${p.bague ? ` <span class="bague">${esc(p.bague)}</span>` : ''}</h3>
        <p class="groupe-sous">${kg(p.poidsBete)} kg${p.tireur ? `, prélevé par ${esc(p.tireur)}` : ''}</p>
        <ul class="pieces">
          ${items.map(({ p: x, i }) => `
            <li class="piece">
              <div class="piece-info">
                <span class="piece-nom">${esc(x.piece)}</span>
                <span class="piece-poids">${kg(x.poidsPiece)} kg</span>
                ${x.remarque ? `<span class="piece-rem">${esc(x.remarque)}</span>` : ''}
              </div>
              <select class="piece-dest" data-change="destPiece" data-i="${i}" aria-label="${esc(x.piece)} ${esc(x.bague)} attribué à">${optionsDest(x.dest)}</select>
            </li>`).join('')}
        </ul>
      </section>`).join('');
  }

  function repartitionParPersonne(j) {
    const parDest = new Map();
    j.repartition.pieces.forEach((p) => {
      const k = p.dest || '';
      if (!parDest.has(k)) parDest.set(k, []);
      parDest.get(k).push(p);
    });
    const cles = [...parDest.keys()].sort((a, b) => {
      const rang = (k) => (k.startsWith('m:') ? 0 : k.startsWith('p:') ? 1 : k ? 3 : 2);
      return rang(a) - rang(b) || L.compareNoms(nomDest(a), nomDest(b));
    });
    const servis = new Set(cles);
    const presentsSansRien = membresTries(true).filter((m) => j.presences[m.id] === 'oui' && !servis.has('m:' + m.id));
    const absents = membresTries(true).filter((m) => j.presences[m.id] === 'absent');
    return `<ol class="appel">
        ${cles.map((k) => {
          const ps = parDest.get(k);
          const tot = ps.reduce((s, p) => s + (Number(p.poidsPiece) || 0), 0);
          return `<li class="appel-ligne${k.startsWith('p:') ? ' proprio' : ''}${!k || k === L.NON_CONSO ? ' sans' : ''}">
            <div class="appel-tete">
              <h3 class="appel-nom">${k ? esc(nomDest(k)) : 'Sans destinataire'}</h3>
              <span class="appel-total">${kg(tot)} kg</span>
            </div>
            <ul class="appel-pieces">
              ${ps.map((p) => `<li><span>${esc(p.piece)}</span> <span class="appel-de">${esc(p.espece ? p.espece.toLowerCase() : 'bête')} ${esc(p.bague)}</span><span class="appel-kg">${kg(p.poidsPiece)} kg</span></li>`).join('')}
            </ul>
          </li>`;
        }).join('')}
      </ol>
      ${presentsSansRien.length ? `<p class="note">Présents sans pièce aujourd’hui (prioritaires la prochaine fois) : ${presentsSansRien.map((m) => esc(m.nom)).join(', ')}.</p>` : ''}
      ${absents.length ? `<p class="note">Absents, non servis (ils rattraperont aux prochaines journées) : ${absents.map((m) => esc(m.nom)).join(', ')}.</p>` : ''}`;
  }

  // ------------------------------------------------------------------ historique

  function vueHistorique() {
    const vue = ui.vueHist;
    return `
      <h1 class="titre-page">Historique</h1>
      <div class="bascule" role="group" aria-label="Affichage">
        <button data-act="vueHist" data-v="totaux" aria-pressed="${vue === 'totaux'}">Totaux</button>
        <button data-act="vueHist" data-v="ecarts" aria-pressed="${vue === 'ecarts'}">Écarts</button>
        <button data-act="vueHist" data-v="journal" aria-pressed="${vue === 'journal'}">Journal</button>
      </div>
      ${vue === 'totaux' ? histTotaux() : vue === 'ecarts' ? histEcarts() : histJournal()}`;
  }

  /** Écart signé : +1,5 / −2 / 0, coloré selon le signe. */
  function ecartHtml(x, unite) {
    if (!x) return '<span class="zero">0</span>';
    const v = (unite === 'kg' ? kg(Math.abs(x)) : qte(Math.abs(x)));
    return x > 0 ? `<span class="ecart-plus">+${v}</span>` : `<span class="ecart-moins">−${v}</span>`;
  }

  function histEcarts() {
    const E = L.ecarts({ membres: d().membres, params: d().params, journal: d().journal });
    if (!E.lignes.length) return '<p class="vide-petit">Aucun membre actif pour l’instant.</p>';
    const abrege = (e) => (e.length > 5 ? e.slice(0, 4) + '.' : e) || 'Autre';
    const lignes = [...E.lignes].sort((a, b) => a.total - b.total || L.compareNoms(a.nom, b.nom));
    return `
      <table class="totaux ecarts">
        <thead><tr><th scope="col">Membre</th><th scope="col" title="Total des pièces">Total</th>
          ${E.especes.map((e) => `<th scope="col" title="${esc(e || 'Sans espèce')}">${esc(abrege(e))}</th>`).join('')}
          <th scope="col">kg</th></tr></thead>
        <tbody>
          ${lignes.map((l) => `<tr>
            <th scope="row"><span class="ligne-nom"><span class="nom">${esc(l.nom)}</span>
              <span class="sous">Action ${esc(l.action)}, ${pluriel(l.recu, 'pièce', 'pièces')}${l.cerf ? `, dont ${qte(l.cerf)} cerf` : ''}</span></span></th>
            <td><strong>${ecartHtml(l.total)}</strong></td>
            ${E.especes.map((e) => `<td>${ecartHtml(l.especes[e])}</td>`).join('')}
            <td class="kg">${ecartHtml(l.kg, 'kg')}</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <p class="note">Avance (+) ou retard (−) de chaque membre sur sa juste part, en pièces, ramenée à son action (une action 1/2 a droit à la moitié). Les plus en retard, en haut, sont servis en priorité. Les kilos sont indicatifs : l’équilibrage se fait au nombre de pièces.</p>`;
  }

  function lignesDe(cle) {
    return d().journal.filter((e) => e.nature === 'Distribution' &&
      (cle.startsWith('m:') ? e.membreId === cle.slice(2) : !e.membreId && L.memeNom(e.nom, cle.slice(2))))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /** Colonnes espèce / morceau des totaux, pour le tableau et l'export.
   *  Seulement les couples reçus par au moins une des lignes `cles` ; espèces dans l'ordre des réglages
   *  (puis inconnues par ordre alphabétique, sans espèce en dernier), morceaux dans l'ordre de L.TYPES.
   *  parType[cle] : quantités par colonne, « chevreuil » et « Chevreuil » regroupés sous le nom des réglages. */
  function colonnesTotaux(T, cles) {
    const ordreEsp = d().params.especes;
    const parType = {};
    Object.keys(T).forEach((c) => {
      parType[c] = {};
      Object.entries(T[c].type).forEach(([k, q]) => {
        const { espece, piece } = L.decouperCle(k);
        const kk = L.cleType(ordreEsp.find((x) => L.memeNom(x, espece)) || espece, piece);
        parType[c][kk] = (parType[c][kk] || 0) + q;
      });
    });
    const somme = {};
    cles.forEach((c) => Object.entries(parType[c] || {}).forEach(([k, q]) => { somme[k] = (somme[k] || 0) + q; }));
    const rangEsp = (e) => {
      if (!e) return [2, ''];
      const i = ordreEsp.findIndex((x) => L.memeNom(x, e));
      return i >= 0 ? [0, i] : [1, e];
    };
    const rangPiece = (p) => { const i = L.TYPES.indexOf(p); return i >= 0 ? i : L.TYPES.length; };
    const colonnes = Object.keys(somme).filter((k) => somme[k]).map((k) => L.decouperCle(k)).sort((a, b) => {
      const [ga, va] = rangEsp(a.espece);
      const [gb, vb] = rangEsp(b.espece);
      return ga - gb || (ga === 1 ? L.compareNoms(va, vb) : va - vb) || rangPiece(a.piece) - rangPiece(b.piece) ||
        L.compareNoms(a.piece, b.piece);
    }).map((c, i, arr) => ({ ...c, cle: L.cleType(c.espece, c.piece), debut: !i || arr[i - 1].espece !== c.espece }));
    return { parType, colonnes };
  }

  function histTotaux() {
    const T = L.totaux(d().journal);
    const vide = { total: 0, kg: 0 };
    const membres = d().membres.filter((m) => m.actif || T['m:' + m.id]).sort((a, b) => L.compareNoms(a.nom, b.nom));
    const autres = new Set(d().params.proprietaires);
    d().journal.forEach((e) => { if (e.nature === 'Distribution' && !e.membreId) autres.add(e.nom); });

    const cles = [...membres.map((m) => 'm:' + m.id), ...[...autres].map((nom) => 'p:' + nom)];
    const { parType, colonnes } = colonnesTotaux(T, cles);
    const groupes = [];
    colonnes.forEach((c) => {
      if (c.debut) groupes.push({ espece: c.espece, n: 0 });
      groupes[groupes.length - 1].n++;
    });
    const nbCol = colonnes.length + 2;
    const ABREGES = { Entier: 'Ent.', 'Quart avant': 'Q. av.', 'Quart arrière': 'Q. ar.', Cuissot: 'Cuis.', 'Côtes/filet': 'Côt./f.' };

    const ligne = (cle, nom, sous, alerteNom) => {
      const t = T[cle] || vide;
      const ouvert = ui.ouverts.has(cle);
      const detail = ouvert ? `<tr class="detail"><td colspan="${nbCol}">${detailLignes(cle)}</td></tr>` : '';
      const n = (x) => (x ? qte(x) : '<span class="zero">0</span>');
      return `<tr class="${alerteNom ? 'en-alerte' : ''}">
          <th scope="row"><button class="ligne-nom" data-act="ouvrirLigne" data-id="${esc(cle)}" aria-expanded="${ouvert}">
            <span class="nom">${esc(nom)}</span>${sous ? `<span class="sous">${sous}</span>` : ''}</button></th>
          ${colonnes.map((c) => `<td${c.debut ? ' class="debut-espece"' : ''}>${n((parType[cle] || {})[c.cle])}</td>`).join('')}
          <td class="kg debut-espece">${t.kg ? kg(t.kg) : '<span class="zero">0</span>'}</td>
        </tr>${detail}`;
    };
    if (!membres.length) return '<p class="vide-petit">Aucun membre pour l’instant.</p>';
    const tete = colonnes.length
      ? `<tr><th scope="col" rowspan="2">Membre</th>
          ${groupes.map((g) => `<th scope="colgroup" colspan="${g.n}" class="debut-espece">${esc(g.espece || 'Autre')}</th>`).join('')}
          <th scope="col" rowspan="2" class="debut-espece">kg</th></tr>
        <tr class="tete-pieces">${colonnes.map((c) => `<th scope="col" title="${esc(c.piece)}"${c.debut ? ' class="debut-espece"' : ''}>${esc(ABREGES[c.piece] || c.piece)}</th>`).join('')}</tr>`
      : '<tr><th scope="col">Membre</th><th scope="col">kg</th></tr>';
    return `
      <div class="tableau-defile"><table class="totaux">
        <thead>${tete}</thead>
        <tbody>
          ${membres.map((m) => {
            const nn = L.nbNon(m.id, d().journees);
            const al = L.enAlerte(m, d().journees, d().params);
            const sous = `Action ${esc(m.action)}${m.actif ? '' : ', ancien membre'}${nn ? `, ${nn} « non »` : ''}`;
            return ligne('m:' + m.id, m.nom, sous, al);
          }).join('')}
        </tbody>
        <tbody class="autres">
          <tr class="separateur"><th colspan="${nbCol}" scope="rowgroup">Propriétaires et autres destinataires, hors équilibrage</th></tr>
          ${[...autres].sort(L.compareNoms).map((nom) => ligne('p:' + nom, nom, '', false)).join('')}
        </tbody>
      </table></div>
      <p class="note">Touchez un nom pour voir le détail par journée.</p>`;
  }

  function detailLignes(cle) {
    const ls = lignesDe(cle);
    const aj = cle.startsWith('m:') ? d().journal.filter((e) => e.nature === 'Ajustement' && e.membreId === cle.slice(2)) : [];
    if (!ls.length && !aj.length) return '<p class="detail-vide">Rien reçu pour l’instant.</p>';
    const parDate = new Map();
    ls.forEach((e) => {
      if (!parDate.has(e.date)) parDate.set(e.date, []);
      parDate.get(e.date).push(e);
    });
    return `<dl class="detail-liste">
      ${[...parDate.entries()].map(([date, es]) => `<dt>${L.dateFr(date)}</dt>
        ${es.map((e) => `<dd>${esc(e.piece)}, ${esc((e.espece || '').toLowerCase())} ${esc(e.bague)}<span>${kg(e.poidsPiece)} kg</span></dd>`).join('')}`).join('')}
      ${aj.length ? `<dt>Alignement</dt>${aj.map((e) => `<dd>${esc(e.piece)} : ${qte(e.qte)}<span>sans viande</span></dd>`).join('')}` : ''}
    </dl>`;
  }

  function histJournal() {
    const j = [...d().journal].sort((a, b) => b.date.localeCompare(a.date) || 0);
    if (!j.length) return '<p class="vide-petit">Le journal est vide : il se remplit à chaque répartition validée.</p>';
    const parDate = new Map();
    j.forEach((e) => {
      if (!parDate.has(e.date)) parDate.set(e.date, []);
      parDate.get(e.date).push(e);
    });
    return [...parDate.entries()].map(([date, es]) => `
      <section class="journal-jour">
        <h2>${esc(dateLongue(date, true))}</h2>
        <ul>
          ${es.map((e) => {
            const nom = e.membreId && membre(e.membreId) ? membre(e.membreId).nom : e.nom;
            if (e.nature === 'Ajustement') {
              return `<li class="aj"><span class="j-quoi">Alignement ${esc(e.piece.toLowerCase())} : ${qte(e.qte)}</span><span class="j-qui">${esc(nom)}</span></li>`;
            }
            if (e.nature === 'Non consommable') {
              return `<li class="nc"><span class="j-quoi">${esc(e.piece)}, ${esc((e.espece || '').toLowerCase())} ${esc(e.bague)} <small>${kg(e.poidsPiece)} kg</small></span><span class="j-qui">Non consommable</span></li>`;
            }
            return `<li><span class="j-quoi">${esc(e.piece)}, ${esc((e.espece || '').toLowerCase())} ${esc(e.bague)} <small>${kg(e.poidsPiece)} kg</small></span><span class="j-qui">${esc(nom)}</span></li>`;
          }).join('')}
        </ul>
      </section>`).join('');
  }

  // ------------------------------------------------------------------ membres

  function vueMembres() {
    const actifs = membresTries(true);
    const anciens = d().membres.filter((m) => !m.actif).sort((a, b) => L.compareNoms(a.nom, b.nom));
    const n1 = actifs.filter((m) => m.action === '1').length;
    const ligne = (m) => {
      const nn = L.nbNon(m.id, d().journees);
      const al = L.enAlerte(m, d().journees, d().params);
      return `<li><button class="membre${al ? ' en-alerte' : ''}" data-act="editerMembre" data-id="${m.id}">
        <span class="nom">${esc(m.nom)}</span>
        <span class="membre-info">Action ${esc(m.action)}${nn ? `<span class="badge-non${al ? ' alerte' : ''}">${nn} « non »</span>` : ''}</span>
      </button></li>`;
    };
    return `
      <div class="tete-page">
        <h1 class="titre-page">Membres</h1>
        <button class="btn primaire" data-act="ajouterMembre">Ajouter</button>
      </div>
      ${actifs.length
        ? `<p class="note">${pluriel(actifs.length, 'membre actif', 'membres actifs')} : ${n1} à l’action 1, ${actifs.length - n1} à l’action 1/2.</p>
           <ul class="liste-membres">${actifs.map(ligne).join('')}</ul>`
        : '<p class="vide-petit">Aucun membre. Ajoutez chaque membre avec son nom (NOM Prénom) et son action.</p>'}
      ${anciens.length ? `<h2 class="sous-titre">Anciens membres</h2><ul class="liste-membres anciens">${anciens.map(ligne).join('')}</ul>` : ''}`;
  }

  function peutAligner(m) {
    return L.saisonCommencee(d().journal) && !d().journal.some((e) => e.membreId === m.id);
  }

  function aUnHistorique(m) {
    return d().journal.some((e) => e.membreId === m.id) ||
      d().journees.some((j) => j.presences[m.id] || j.betes.some((b) => b.tireurId === m.id));
  }

  async function formMembre(existant) {
    const m = existant || { nom: '', action: '1', actif: true };
    const radio = (val, lib) => `<label class="seg-radio"><input type="radio" name="f-action" value="${val}" ${m.action === val ? 'checked' : ''}><span>${lib}</span></label>`;
    const corps = `
      <div class="champ"><label for="f-nom">Nom</label>
        <input id="f-nom" value="${esc(m.nom)}" placeholder="NOM Prénom" autocomplete="off" autocapitalize="words"></div>
      <fieldset class="champ"><legend>Action</legend>
        <div class="seg">${radio('1', 'Action 1')}${radio('1/2', 'Action 1/2')}</div>
        <p class="aide">Une action 1 reçoit deux fois plus qu’une action 1/2.</p></fieldset>
      <label class="interrupteur dans-feuille">
        <input type="checkbox" id="f-cerf" ${m.cerfAnDernier ? 'checked' : ''}>
        <span class="interrupteur-piste" aria-hidden="true"></span>
        <span class="interrupteur-txt"><strong>A reçu du cerf la saison dernière</strong><small>Ceux qui n’en ont pas eu sont servis en cerf d’abord. Rempli tout seul à chaque nouvelle saison.</small></span>
      </label>
      ${existant ? `<label class="interrupteur dans-feuille">
          <input type="checkbox" id="f-actif" ${m.actif ? 'checked' : ''}>
          <span class="interrupteur-piste" aria-hidden="true"></span>
          <span class="interrupteur-txt"><strong>Membre actif</strong><small>Décochez pour un membre qui part : son historique est conservé.</small></span>
        </label>` : ''}
      ${existant && peutAligner(existant) ? `<div class="encart"><p>Arrivé en cours de saison ? Alignez-le sur le membre le moins servi pour qu’il ne rafle pas tout aux prochaines journées.</p>
          <button type="button" class="btn petit" id="f-aligner">Aligner sur le moins servi</button></div>` : ''}`;
    const boutons = [];
    if (existant && !aUnHistorique(existant)) boutons.push({ label: 'Supprimer', value: 'suppr', style: 'danger-lien' });
    boutons.push({ label: 'Annuler', value: null }, { label: existant ? 'Enregistrer' : 'Ajouter', value: 'ok', style: 'primaire' });
    const res = await feuille({
      titre: existant ? 'Modifier le membre' : 'Ajouter un membre',
      corps, boutons,
      onOuvrir: (r) => {
        const b = $('#f-aligner', r);
        if (b) b.addEventListener('click', () => { modaleOuverte.annuler(); aligner(existant); });
      },
      valider: (r) => {
        const nom = $('#f-nom', r).value.trim().replace(/\s+/g, ' ');
        if (!nom) return { erreur: 'Indiquez le nom du membre.' };
        if (d().membres.some((x) => x !== existant && L.memeNom(x.nom, nom))) return { erreur: `${nom} existe déjà dans la liste.` };
        const actif = $('#f-actif', r);
        return { nom, action: $('input[name=f-action]:checked', r).value, actif: actif ? actif.checked : true, cerfAnDernier: $('#f-cerf', r).checked };
      },
    });
    if (!res) return;
    if (res === 'suppr') {
      if (!(await confirmer('Supprimer ce membre ?', `<p>${esc(m.nom)} sera retiré de la liste.</p>`, 'Supprimer', true))) return;
      d().membres = d().membres.filter((x) => x !== existant);
      sauver();
      rendre();
      return;
    }
    if (existant) {
      Object.assign(existant, res);
      d().journal.forEach((e) => { if (e.membreId === existant.id) e.nom = existant.nom; });
      sauver();
      rendre();
      return;
    }
    const nouveau = Object.assign({ id: S.uid() }, res);
    d().membres.push(nouveau);
    sauver();
    rendre();
    toast(`${nouveau.nom} ajouté.`);
    if (L.saisonCommencee(d().journal)) await aligner(nouveau, true);
  }

  async function aligner(m, apresAjout) {
    const q = L.alignement(m.id, d().membres, d().params, d().journal);
    const cles = Object.keys(q);
    const total = cles.reduce((s, k) => s + q[k], 0);
    if (!total) {
      if (!apresAjout) await alerte('Aucun alignement nécessaire', '<p>Le membre le moins servi n’a encore rien reçu : le nouveau membre part déjà au même niveau.</p>');
      return;
    }
    const ok = await confirmer(apresAjout ? 'La saison a commencé' : 'Aligner sur le moins servi ?',
      `<p>Aligner <strong>${esc(m.nom)}</strong> sur le membre le moins servi, pour qu’il ne soit pas prioritaire partout aux prochaines journées :</p>
       ${liste(cles.map((k) => `${L.libelleCle(k)} : ${qte(q[k])}`))}
       <p class="aide">Ces quantités comptent dans le calcul d’équité mais ne correspondent à aucune viande reçue.</p>`,
      'Aligner');
    if (!ok) return;
    const now = new Date().toISOString();
    cles.forEach((k) => {
      const { espece, piece } = L.decouperCle(k);
      d().journal.push({
        date: aujourdHui(), bague: '', espece, poidsBete: null, tireur: '', piece, qte: q[k], poidsPiece: 0,
        membreId: m.id, nom: m.nom, destinataire: 'Membre', nature: 'Ajustement', valideLe: now,
      });
    });
    sauver();
    rendre();
    toast(`${m.nom} est aligné.`);
  }

  // ------------------------------------------------------------------ réglages

  function vueReglages() {
    const p = d().params;
    const puces = (cle, label) => `
      <ul class="puces">${p[cle].map((x, i) => `<li>${esc(x)}<button data-act="retirerListe" data-liste="${cle}" data-i="${i}" aria-label="Retirer ${esc(x)}">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg></button></li>`).join('')}</ul>
      <form class="ajout-ligne" data-submit="ajouterListe" data-liste="${cle}">
        <label class="sr" for="aj-${cle}">${label}</label>
        <input id="aj-${cle}" name="v" placeholder="${label}" autocomplete="off">
        <button class="btn petit">Ajouter</button>
      </form>`;
    const a = p.actions;
    const cervides = L.especesCervides(p);
    return `
      <h1 class="titre-page">Réglages</h1>

      <section class="reglage">
        <h2>Sauvegarde</h2>
        <p>Les données ne sont que sur ce téléphone. Exportez une sauvegarde après chaque journée, puis envoyez-la-vous (message, e-mail) une fois revenu au réseau.</p>
        <p class="etat${S.aSauvegarder() ? ' a-faire' : ''}">${d().derniereSauvegarde ? `Dernière sauvegarde exportée le ${dateHeure(d().derniereSauvegarde)}` : 'Aucune sauvegarde exportée pour l’instant'}${S.aSauvegarder() ? ', données modifiées depuis.' : '.'}</p>
        <div class="pile">
          <button class="btn primaire" data-act="exporterSauvegarde">Exporter la sauvegarde</button>
          <button class="btn secondaire" data-act="importerSauvegarde">Importer une sauvegarde</button>
          <button class="btn secondaire" data-act="exporterJournal">Exporter le journal pour un tableur</button>
          <button class="btn secondaire" data-act="exporterTotaux">Exporter les totaux pour un tableur</button>
        </div>
      </section>

      <section class="reglage">
        <h2>Saison</h2>
        <div class="champ"><label for="r-saison">Nom de la saison</label>
          <input id="r-saison" data-change="reglage" data-id="saison" value="${esc(d().saison)}"></div>
      </section>

      <section class="reglage">
        <h2>Catégorie proposée selon le poids</h2>
        <div class="champs-2">
          <div class="champ"><label for="r-se">Entier en dessous de (kg)</label>
            <input id="r-se" inputmode="decimal" data-change="reglage" data-id="seuilEntier" value="${kg(p.seuilEntier)}"></div>
          <div class="champ"><label for="r-sd">2 demis jusqu’à (kg, inclus)</label>
            <input id="r-sd" inputmode="decimal" data-change="reglage" data-id="seuilDemi" value="${kg(p.seuilDemi)}"></div>
        </div>
        <p class="aide">Au-delà : 4 quarts, 2 avant et 2 arrière. La catégorie reste modifiable bête par bête.</p>
      </section>

      <section class="reglage">
        <h2>Cervidés</h2>
        <p class="aide">Découpés en morceaux plutôt que selon le poids. Ils comptent ensemble comme une seule espèce pour l’équité.</p>
        ${cervides.length ? `<ul class="decoupes">
          ${cervides.map((e, i) => `<li>
            <label for="r-cerv-${i}">${esc(e)}${L.estCerf(e) ? '<small>Rare : règle du cerf</small>' : ''}</label>
            <select id="r-cerv-${i}" data-change="reglage" data-id="decoupe:${esc(e)}">
              ${L.DECOUPES.map((x) => `<option ${x === p.decoupe[e] ? 'selected' : ''}>${x}</option>`).join('')}
            </select>
            <button class="btn-icone" data-act="retirerCervide" data-espece="${esc(e)}" aria-label="Retirer ${esc(e)} des cervidés">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7L7 17"/></svg></button>
          </li>`).join('')}
        </ul>` : '<p class="vide-petit">Aucune espèce dans les cervidés : toutes sont découpées selon le poids.</p>'}
        <form class="ajout-ligne ajout-cervide" data-submit="ajouterCervide">
          <label class="sr" for="aj-cervide">Espèce à ajouter aux cervidés</label>
          <input id="aj-cervide" name="v" list="especes-hors-cervides" placeholder="Ajouter une espèce" autocomplete="off">
          <datalist id="especes-hors-cervides">${p.especes.filter((e) => !L.decoupeEspece(e, p)).map((e) => `<option value="${esc(e)}">`).join('')}</datalist>
          <label class="sr" for="aj-cervide-dec">Découpe</label>
          <select id="aj-cervide-dec" name="dec">${L.DECOUPES.map((x) => `<option>${x}</option>`).join('')}</select>
          <button class="btn petit">Ajouter</button>
        </form>
        <p class="aide">8 morceaux : 2 avants, 2 côtes, 2 filets, 2 cuissots. 6 morceaux : 2 avants, 2 côtes/filets, 2 cuissots.
          Règle du cerf : personne n’en reçoit un 2e morceau dans la saison tant qu’un présent n’en a pas eu,
          et ceux qui n’en ont pas eu la saison précédente passent d’abord.</p>
      </section>

      <section class="reglage">
        <h2>Actions</h2>
        <table class="tableau-actions">
          <thead><tr><th scope="col">Action</th><th scope="col">Coefficient</th><th scope="col">Alerte au n<sup>e</sup> « non »</th></tr></thead>
          <tbody>
            ${['1', '1/2'].map((k) => `<tr><th scope="row">${k}</th>
              <td><input inputmode="decimal" aria-label="Coefficient de l’action ${k}" data-change="reglage" data-id="coef:${k}" value="${kg(a[k].coef)}"></td>
              <td><input inputmode="numeric" aria-label="Seuil d’alerte de l’action ${k}" data-change="reglage" data-id="alerte:${k}" value="${a[k].alerte}"></td></tr>`).join('')}
          </tbody>
        </table>
        <p class="aide">Avec les coefficients 2 et 1, une action 1 reçoit deux fois plus qu’une action 1/2.</p>
      </section>

      <section class="reglage">
        <h2>Priorité au tireur</h2>
        <label class="interrupteur">
          <input type="checkbox" data-change="reglage" data-id="prioTireur" ${p.prioTireur ? 'checked' : ''}>
          <span class="interrupteur-piste" aria-hidden="true"></span>
          <span class="interrupteur-txt"><strong>Activée pour chaque nouvelle journée</strong>
            <small>Modifiable ensuite journée par journée, dans l’étape Bêtes.</small></span>
        </label>
      </section>

      <section class="reglage">
        <h2>Espèces</h2>
        ${puces('especes', 'Ajouter une espèce')}
      </section>

      <section class="reglage">
        <h2>Propriétaires</h2>
        <p class="aide">Jamais servis automatiquement : on les choisit à la main dans la répartition. Ils n’entrent pas dans l’équilibrage.</p>
        ${puces('proprietaires', 'Ajouter un propriétaire')}
      </section>

      <section class="reglage">
        <h2>Nouvelle saison</h2>
        <p>Exporte d’abord la sauvegarde de la saison qui se termine, puis vide les journées et l’historique. Les membres et les réglages sont conservés.</p>
        <button class="btn danger" data-act="nouvelleSaison">Préparer une nouvelle saison</button>
      </section>

      <p class="version" id="version"></p>`;
  }

  function afficherVersion() {
    const el = $('#version');
    if (!el || !('caches' in window)) return;
    caches.keys().then((ks) => {
      const k = ks.find((x) => x.startsWith('venaison-'));
      if (k && $('#version')) $('#version').textContent = `Version ${k.replace('venaison-', '')}`;
    }).catch(() => {});
  }

  // ------------------------------------------------------------------ fichiers

  async function partagerFichier(nom, contenu, type) {
    const blob = new Blob([contenu], { type });
    try {
      const f = new File([blob], nom, { type });
      if (navigator.canShare && navigator.canShare({ files: [f] })) {
        await navigator.share({ files: [f], title: nom });
        return true;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return false;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nom;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    return true;
  }

  function csv(lignes) {
    const cell = (c) => {
      const s = c == null ? '' : String(c);
      return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return '﻿' + lignes.map((l) => l.map(cell).join(';')).join('\r\n');
  }
  const nb = (n) => (n == null || n === '' ? '' : String(Math.round(Number(n) * 100) / 100).replace('.', ','));
  const nomFichier = (x) => x.replace(/[^\w.-]+/g, '-');

  async function exporterSauvegarde() {
    const ok = await partagerFichier(nomFichier(`venaison-sauvegarde-${d().saison}-${aujourdHui()}.json`), S.exportJSON(), 'application/json');
    if (ok) {
      d().derniereSauvegarde = new Date().toISOString();
      S.enregistrer(false);
      rendre();
      toast('Sauvegarde exportée.');
    }
    return ok;
  }

  function exporterJournal() {
    const tete = ['Date', 'N° de bague', 'Espèce', 'Poids bête (kg)', 'Prélevé par', 'Pièce', 'Qté', 'Poids pièce (kg)',
      'Attribué à', 'Destinataire', 'Nature', 'Validé le'];
    const lignes = [...d().journal].sort((a, b) => a.date.localeCompare(b.date)).map((e) => [
      L.dateFr(e.date), e.bague, e.espece, nb(e.poidsBete), e.tireur, e.piece, nb(e.qte), nb(e.poidsPiece),
      e.membreId && membre(e.membreId) ? membre(e.membreId).nom : e.nom, e.destinataire, e.nature, e.valideLe ? dateHeure(e.valideLe) : '']);
    partagerFichier(nomFichier(`venaison-journal-${d().saison}.csv`), csv([tete, ...lignes]), 'text/csv');
  }

  function exporterTotaux() {
    const T = L.totaux(d().journal);
    const E = L.ecarts({ membres: d().membres, params: d().params, journal: d().journal });
    const ecartDe = new Map(E.lignes.map((l) => [l.id, l]));
    const cles = [...d().membres.map((m) => 'm:' + m.id), ...Object.keys(T).filter((k) => k.startsWith('p:'))];
    const { colonnes } = colonnesTotaux(T, cles);
    // Pour chaque destinataire et chaque colonne espèce / morceau : la date de chaque distribution
    const ordreEsp = d().params.especes;
    const dates = {};
    [...d().journal].filter((e) => e.nature === 'Distribution').sort((a, b) => a.date.localeCompare(b.date)).forEach((e) => {
      const qui = e.membreId ? 'm:' + e.membreId : 'p:' + e.nom;
      const esp = String(e.espece || '').trim();
      const col = L.cleType(ordreEsp.find((x) => L.memeNom(x, esp)) || esp, e.piece);
      if (!dates[qui]) dates[qui] = {};
      if (!dates[qui][col]) dates[qui][col] = [];
      for (let i = 0; i < Math.max(1, Math.round(Number(e.qte) || 1)); i++) dates[qui][col].push(L.dateFr(e.date));
    });
    const pieces = (cle) => colonnes.map((c) => ((dates[cle] || {})[c.cle] || []).join(', '));
    const tete = ['Nom', 'Action', 'Actif', ...colonnes.map((c) => `${c.espece || 'Autre'} - ${c.piece}`), 'Total pièces', 'Kg reçus', 'Nb « non »', 'Morceaux de cerf', 'Cerf la saison dernière',
      'Écart total (pièces)', ...E.especes.map((e) => `Écart ${e || 'sans espèce'}`), 'Écart kg'];
    const vides = () => ['', ...E.especes.map(() => ''), ''];
    const lignes = [...d().membres].sort((a, b) => L.compareNoms(a.nom, b.nom)).map((m) => {
      const t = T['m:' + m.id] || {};
      const ec = ecartDe.get(m.id);
      return [m.nom, m.action, m.actif ? 'Oui' : 'Non', ...pieces('m:' + m.id), nb(t.total || 0), nb(t.kg || 0), L.nbNon(m.id, d().journees),
        ec ? nb(ec.cerf) : '', m.cerfAnDernier ? 'Oui' : 'Non',
        ...(ec ? [nb(ec.total), ...E.especes.map((e) => nb(ec.especes[e])), nb(ec.kg)] : vides())];
    });
    Object.keys(T).filter((k) => k.startsWith('p:')).forEach((k) => {
      const t = T[k];
      lignes.push([k.slice(2), '', 'Hors équilibrage', ...pieces(k), nb(t.total), nb(t.kg), '', '', '', ...vides()]);
    });
    partagerFichier(nomFichier(`venaison-totaux-${d().saison}.csv`), csv([tete, ...lignes]), 'text/csv');
  }

  async function importer(fichier) {
    try {
      const o = S.lireImport(await fichier.text());
      const dd = o.donnees;
      const ok = await confirmer('Importer cette sauvegarde ?',
        `<p>Sauvegarde exportée le ${dateHeure(o.exporteLe)} : saison ${esc(dd.saison)}, ${pluriel((dd.membres || []).length, 'membre', 'membres')}, ${pluriel((dd.journees || []).length, 'journée', 'journées')}.</p>
         <p>Toutes les données actuelles de ce téléphone seront remplacées.</p>`, 'Importer', true);
      if (!ok) return;
      S.remplacer(dd);
      S.data.derniereSauvegarde = o.exporteLe;
      S.data.derniereModif = o.exporteLe;
      S.enregistrer(false);
      ui.etape = null;
      ui.onglet = 'journee';
      rendre();
      toast('Sauvegarde importée.');
    } catch (e) {
      alerte('Import impossible', `<p>${esc(e.message || 'Fichier illisible.')}</p>`);
    }
  }

  // ------------------------------------------------------------------ journées

  function creerJournee(date) {
    d().journees.push({ date, presences: {}, presencesValidees: false, prioTireur: d().params.prioTireur, betes: [], repartition: null });
    d().journeeCourante = date;
    ui.onglet = 'journee';
    ui.etape = 'presences';
    ui.vueRep = null;
    sauver();
    rendre();
  }

  function demanderDate(titre, intro) {
    return feuille({
      titre,
      corps: `${intro ? `<p>${intro}</p>` : ''}<div class="champ"><label for="f-date">Date de la journée</label>
        <input type="date" id="f-date" value="${aujourdHui()}"></div>`,
      boutons: [{ label: intro ? 'Non' : 'Annuler', value: null }, { label: 'Créer la journée', value: 'ok', style: 'primaire' }],
      valider: (r) => {
        const x = $('#f-date', r).value;
        if (!x) return { erreur: 'Choisissez une date.' };
        if (journee(x)) return { erreur: `La journée du ${L.dateFr(x)} existe déjà.` };
        return x;
      },
    });
  }

  async function questionOuverture() {
    if (!d().membres.length) return;
    if (journee(aujourdHui())) {
      d().journeeCourante = aujourdHui();
      ui.etape = null;
      rendre();
      return;
    }
    const v = await demanderDate('Nouvelle journée de chasse ?', 'Sinon, l’appli s’ouvre sur la dernière journée.');
    if (v) creerJournee(v);
  }

  // ------------------------------------------------------------------ actions

  const actions = {
    onglet(el) {
      ui.onglet = el.dataset.onglet;
      if (ui.onglet === 'journee') ui.etape = ui.etape || null;
      rendre();
      window.scrollTo(0, 0);
    },
    etape(el) {
      ui.etape = el.dataset.etape;
      rendre();
      window.scrollTo(0, 0);
    },
    async nouvelleJournee() {
      const v = await demanderDate('Nouvelle journée de chasse');
      if (v) creerJournee(v);
    },
    async menuJournee() {
      const j = jourCourant();
      const v = await feuille({
        titre: dateLongue(j.date, true),
        corps: '<p>Supprimer cette journée efface ses présences, ses bêtes et sa répartition, et la retire de l’historique.</p>',
        boutons: [{ label: 'Fermer', value: null }, { label: 'Supprimer la journée', value: 'suppr', style: 'danger' }],
      });
      if (v !== 'suppr') return;
      if (!(await confirmer('Supprimer définitivement ?', `<p>La journée du ${L.dateFr(j.date)} sera effacée.</p>`, 'Supprimer', true))) return;
      d().journees = d().journees.filter((x) => x !== j);
      d().journal = d().journal.filter((e) => !(NATURES_JOUR.includes(e.nature) && e.date === j.date));
      d().journeeCourante = joursTries()[0] ? joursTries()[0].date : null;
      ui.etape = null;
      sauver();
      rendre();
      toast('Journée supprimée.');
    },
    async presence(el) {
      const j = jourCourant();
      if (j.presencesValidees) return;
      const id = el.dataset.id;
      const v = el.dataset.v;
      const avant = j.presences[id];
      j.presences[id] = v;
      sauver();
      rendre();
      if (v === 'non' && avant !== 'non') {
        const m = membre(id);
        const n = L.nbNon(id, d().journees);
        const s = L.seuilAlerte(m.action, d().params);
        if (s && n >= s) {
          await alerte('Alerte présences', `<p><strong>${esc(m.nom)}</strong> cumule ${n} « non » cette saison (alerte à partir de ${s} pour une action ${esc(m.action)}).</p>
            <p>La saisie est conservée et le nom reste en rouge : à vous de décider d’en tenir compte.</p>`);
        }
      }
    },
    tousOui() {
      const j = jourCourant();
      membresTries(true).forEach((m) => { if (!j.presences[m.id]) j.presences[m.id] = 'oui'; });
      sauver();
      rendre();
    },
    async validerPresences() {
      const j = jourCourant();
      const manquants = membresTries(true).filter((m) => !['oui', 'non', 'absent'].includes(j.presences[m.id]));
      if (manquants.length) {
        await alerte('Présences incomplètes', `<p>Indiquez oui, non ou absent pour :</p>${liste(manquants.map((m) => m.nom))}`);
        return;
      }
      const n = membresTries(true).filter((m) => j.presences[m.id] === 'oui').length;
      if (!(await confirmer('Valider les présences ?', `<p>${pluriel(n, 'membre présent', 'membres présents')} le ${L.dateFr(j.date)}.</p>`, 'Valider'))) return;
      j.presencesValidees = true;
      ui.etape = 'betes';
      sauver();
      rendre();
      window.scrollTo(0, 0);
      toast('Présences validées.');
    },
    async rouvrirPresences() {
      const j = jourCourant();
      const msg = j.repartition ? '<p>Après modification, validez-les puis relancez l’attribution.</p>' : '<p>Vous pourrez les modifier puis les valider à nouveau.</p>';
      if (!(await confirmer('Rouvrir les présences ?', msg, 'Rouvrir'))) return;
      j.presencesValidees = false;
      sauver();
      rendre();
    },
    ajouterBete() { formBete(null); },
    editerBete(el) { formBete(jourCourant().betes.find((b) => b.id === el.dataset.id)); },
    validationBete(el) {
      const b = jourCourant().betes.find((x) => x.id === el.dataset.id);
      b.validation = el.dataset.v;
      sauver();
      rendre();
    },
    async lancerAttribution() {
      const j = jourCourant();
      // Les pièces non consommables restent non consommables ; les autres corrections à la main sont effacées
      const imposees = j.repartition ? piecesImposees(j.repartition.pieces, false) : {};
      const r = L.attribuer({ journee: j, membres: d().membres, params: d().params, journal: d().journal, imposees });
      if (r.erreurs.length) {
        await alerte('Attribution impossible', liste(r.erreurs));
        return;
      }
      if (r.avertissements.length &&
        !(await confirmer('Numéros de bague', `${liste(r.avertissements)}<p>Continuer quand même ?</p>`, 'Continuer'))) return;
      if (j.repartition) {
        const msg = j.repartition.statut === 'validee'
          ? '<p>Une répartition est déjà validée pour cette journée. Elle reste enregistrée jusqu’à ce que vous validiez la nouvelle.</p>'
          : '<p>Les corrections faites à la main sur la répartition en cours seront perdues.</p>';
        if (!(await confirmer('Recalculer la répartition ?', msg, 'Recalculer'))) return;
      }
      j.repartition = { statut: 'proposee', lanceeLe: new Date().toISOString(), valideeLe: null, pieces: r.pieces };
      ui.etape = 'repartition';
      ui.vueRep = 'betes';
      sauver();
      rendre();
      window.scrollTo(0, 0);
      toast(`Répartition proposée : ${pluriel(r.pieces.length, 'pièce', 'pièces')}.`);
      if (r.notes.length) await alerte('Peu de présents', liste(r.notes));
    },
    vueRep(el) {
      ui.vueRep = el.dataset.v;
      rendre();
    },
    async validerRepartition() {
      const j = jourCourant();
      const r = j.repartition;
      const vides = r.pieces.filter((p) => !p.dest).length;
      const nc = r.pieces.filter((p) => p.dest === L.NON_CONSO).length;
      const deja = d().journal.some((e) => e.date === j.date && NATURES_JOUR.includes(e.nature));
      let msg = `<p>${pluriel(r.pieces.length - vides - nc, 'pièce', 'pièces')} à enregistrer pour le ${L.dateFr(j.date)}.</p>`;
      if (nc) msg += `<p>${pluriel(nc, 'pièce non consommable, notée dans le journal sans compter pour personne', 'pièces non consommables, notées dans le journal sans compter pour personne')}.</p>`;
      if (vides) msg += `<p>${pluriel(vides, 'pièce sans destinataire ne sera pas enregistrée', 'pièces sans destinataire ne seront pas enregistrées')}.</p>`;
      if (deja) msg += '<p>Elle remplace la répartition déjà enregistrée pour cette date.</p>';
      if (!(await confirmer('Valider la répartition ?', msg, 'Valider'))) return;
      const now = new Date().toISOString();
      d().journal = d().journal.filter((e) => !(e.date === j.date && NATURES_JOUR.includes(e.nature)));
      r.pieces.forEach((p) => {
        if (!p.dest) return;
        if (p.dest === L.NON_CONSO) {
          d().journal.push({
            date: j.date, bague: p.bague, espece: p.espece, poidsBete: p.poidsBete, tireur: p.tireur, piece: p.piece, qte: 1,
            poidsPiece: p.poidsPiece, membreId: null, nom: '', destinataire: 'Non consommable', nature: 'Non consommable', valideLe: now,
          });
          return;
        }
        const m = p.dest.startsWith('m:') ? membre(p.dest.slice(2)) : null;
        const nom = m ? m.nom : nomDest(p.dest);
        d().journal.push({
          date: j.date, bague: p.bague, espece: p.espece, poidsBete: p.poidsBete, tireur: p.tireur, piece: p.piece, qte: 1,
          poidsPiece: p.poidsPiece, membreId: m ? m.id : null, nom,
          destinataire: m ? 'Membre' : estProprietaire(nom) ? 'Propriétaire' : 'Autre', nature: 'Distribution', valideLe: now,
        });
      });
      r.statut = 'validee';
      r.valideeLe = now;
      ui.vueRep = 'personnes';
      sauver();
      rendre();
      window.scrollTo(0, 0);
      toast('Répartition validée et enregistrée.');
    },
    vueHist(el) {
      ui.vueHist = el.dataset.v;
      rendre();
    },
    ouvrirLigne(el) {
      const k = el.dataset.id;
      if (ui.ouverts.has(k)) ui.ouverts.delete(k);
      else ui.ouverts.add(k);
      rendre();
    },
    ajouterMembre() { formMembre(null); },
    editerMembre(el) { formMembre(membre(el.dataset.id)); },
    retirerListe(el) {
      const l = d().params[el.dataset.liste];
      const [retiree] = l.splice(Number(el.dataset.i), 1);
      if (el.dataset.liste === 'especes') retirerDesCervides(retiree);
      sauver();
      rendre();
    },
    retirerCervide(el) {
      retirerDesCervides(el.dataset.espece);
      sauver();
      rendre();
      toast(`${el.dataset.espece} sera découpé selon le poids.`);
    },
    exporterSauvegarde() { exporterSauvegarde(); },
    importerSauvegarde() { $('#fichier-import').click(); },
    exporterJournal() { exporterJournal(); },
    exporterTotaux() { exporterTotaux(); },
    async nouvelleSaison() {
      const ok = await confirmer('Préparer une nouvelle saison ?',
        `<p>La sauvegarde de la saison ${esc(d().saison)} va d’abord être exportée.</p>
         <p>Ensuite, les journées et l’historique seront vidés. Les membres et les réglages sont conservés.</p>
         <p>L’appli retient qui a reçu du cerf cette saison : les autres seront servis en cerf d’abord la saison prochaine.</p>`, 'Continuer');
      if (!ok) return;
      const sauve = await exporterSauvegarde();
      if (!sauve && !(await confirmer('Sauvegarde non exportée', '<p>Continuer sans sauvegarde ? L’historique de la saison sera perdu.</p>', 'Continuer sans sauvegarde', true))) return;
      const suivante = (() => {
        const m = /^(\d{4})\s*-\s*(\d{4})$/.exec(d().saison);
        return m ? `${Number(m[1]) + 1}-${Number(m[2]) + 1}` : '';
      })();
      const nom = await feuille({
        titre: 'Nouvelle saison',
        corps: `<div class="champ"><label for="f-saison">Nom de la nouvelle saison</label><input id="f-saison" value="${esc(suivante)}"></div>`,
        boutons: [{ label: 'Annuler', value: null }, { label: 'Commencer la saison', value: 'ok', style: 'primaire' }],
        valider: (r) => $('#f-saison', r).value.trim() || { erreur: 'Indiquez un nom de saison.' },
      });
      if (!nom) return;
      const avecCerf = L.membresAvecCerf(d().journal);
      d().membres.forEach((m) => { m.cerfAnDernier = avecCerf.has(m.id); });
      d().journees = [];
      d().journal = [];
      d().journeeCourante = null;
      d().saison = nom;
      ui.onglet = 'journee';
      ui.etape = null;
      sauver();
      rendre();
      toast(`Saison ${nom} prête.`);
    },
  };

  const changements = {
    choisirJour(el) {
      d().journeeCourante = el.value;
      ui.etape = null;
      ui.vueRep = null;
      S.enregistrer(false);
      rendre();
    },
    prioTireur(el) {
      jourCourant().prioTireur = el.checked;
      sauver();
      rendre();
    },
    async destPiece(el) {
      const j = jourCourant();
      const p = j.repartition.pieces[Number(el.dataset.i)];
      const avant = p.dest;
      p.dest = el.value;
      p.manuel = true;
      p.remarque = !p.dest ? 'Sans destinataire' : p.dest === L.NON_CONSO ? 'Non consommable'
        : p.dest.startsWith('p:') ? 'Propriétaire, choix manuel' : 'Modifié à la main';
      if (j.repartition.statut === 'validee') j.repartition.statut = 'modifiee';
      // Pièce passée en (ou sortie de) non consommable : les autres pièces sont recalculées, choix à la main conservés
      let recalcul = null;
      if ((avant === L.NON_CONSO) !== (p.dest === L.NON_CONSO)) {
        if (avant === L.NON_CONSO && !p.dest) delete p.manuel; // redevient une pièce à attribuer
        const imposees = piecesImposees(j.repartition.pieces, true);
        const r = L.attribuer({ journee: j, membres: d().membres, params: d().params, journal: d().journal, imposees });
        if (!r.erreurs.length) {
          j.repartition.pieces = r.pieces;
          recalcul = r;
        }
      }
      sauver();
      rendre();
      if (recalcul) {
        toast('Répartition recalculée.');
        if (recalcul.notes.length) await alerte('Peu de présents', liste(recalcul.notes));
        return;
      }
      if (p.dest.startsWith('m:') && j.presences[p.dest.slice(2)] !== 'oui') {
        await alerte('Attention', `<p>${esc(nomDest(p.dest))} n’est pas indiqué présent (oui) ce jour-là. L’attribution est conservée.</p>`);
      }
    },
    async reglage(el) {
      const k = el.dataset.id;
      const p = d().params;
      if (k === 'saison') {
        d().saison = el.value.trim() || d().saison;
      } else if (k === 'prioTireur') {
        p.prioTireur = el.checked;
      } else if (k.startsWith('decoupe:')) {
        const espece = k.slice('decoupe:'.length);
        p.decoupe = Object.assign({}, p.decoupe);
        Object.keys(p.decoupe).filter((x) => L.memeNom(x, espece)).forEach((x) => { delete p.decoupe[x]; });
        if (el.value) p.decoupe[espece] = el.value;
      } else {
        const v = L.parseNombre(el.value);
        if (!(v > 0)) {
          await alerte('Valeur invalide', '<p>Saisissez un nombre supérieur à zéro.</p>');
          rendre();
          return;
        }
        if (k === 'seuilEntier' || k === 'seuilDemi') {
          const se = k === 'seuilEntier' ? v : p.seuilEntier;
          const sd = k === 'seuilDemi' ? v : p.seuilDemi;
          if (se > sd) {
            await alerte('Seuils incohérents', '<p>Le seuil des entiers doit être inférieur ou égal à celui des demis.</p>');
            rendre();
            return;
          }
          p[k] = v;
        } else {
          const [type, action] = k.split(':');
          p.actions[action][type] = type === 'alerte' ? Math.round(v) : v;
        }
      }
      sauver();
      rendre();
      toast('Réglage enregistré.');
    },
  };

  function retirerDesCervides(espece) {
    const p = d().params;
    p.decoupe = Object.assign({}, p.decoupe);
    Object.keys(p.decoupe).filter((x) => L.memeNom(x, espece)).forEach((x) => { delete p.decoupe[x]; });
  }

  const soumissions = {
    ajouterCervide(f) {
      const p = d().params;
      const saisie = f.elements.v.value.trim().replace(/\s+/g, ' ');
      if (!saisie) return;
      // On garde l'orthographe de la liste des espèces si elle y est déjà
      const espece = p.especes.find((x) => L.memeNom(x, saisie)) || saisie;
      retirerDesCervides(espece);
      p.decoupe[espece] = f.elements.dec.value;
      if (!p.especes.some((x) => L.memeNom(x, espece))) p.especes.push(espece);
      sauver();
      rendre();
      toast(`${espece} ajouté aux cervidés.`);
    },
    ajouterListe(f) {
      const v = f.elements.v.value.trim();
      const l = d().params[f.dataset.liste];
      if (!v || l.some((x) => L.memeNom(x, v))) return;
      l.push(v);
      sauver();
      rendre();
      const champ = $(`#aj-${f.dataset.liste}`);
      if (champ) champ.focus();
    },
  };

  // ------------------------------------------------------------------ démarrage

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled || el.closest('#modale')) return;
    const f = actions[el.dataset.act];
    if (f) {
      e.preventDefault();
      f(el);
    }
  });
  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-change]');
    if (!el || el.closest('#modale')) return;
    const f = changements[el.dataset.change];
    if (f) f(el);
  });
  document.addEventListener('submit', (e) => {
    const f = e.target.closest('[data-submit]');
    if (!f) return;
    e.preventDefault();
    soumissions[f.dataset.submit](f);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modaleOuverte) modaleOuverte.annuler();
  });
  $('#fichier-import').addEventListener('change', (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (f) importer(f);
  });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  S.demanderStockagePersistant();
  rendre();
  questionOuverture();
})();
