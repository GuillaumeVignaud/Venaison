/*
 * Venaison — données de l'appli, enregistrées sur le téléphone (localStorage).
 * Rien n'est envoyé sur Internet : la sauvegarde se fait par export de fichier.
 */
(function (root) {
  'use strict';

  const CLE = 'venaison-donnees-v1';

  function saisonParDefaut() {
    const d = new Date();
    const y = d.getFullYear();
    return d.getMonth() >= 5 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
  }

  function donneesVides() {
    return {
      format: 1,
      saison: saisonParDefaut(),
      params: {
        seuilEntier: 40,
        seuilDemi: 65,
        actions: { '1': { coef: 2, alerte: 4 }, '1/2': { coef: 1, alerte: 2 } },
        prioTireur: true,
        especes: ['Chevreuil', 'Sanglier', 'Cerf', 'Biche', 'Daguet', 'Faon', 'Daim'],
        // Espèces découpées en morceaux plutôt que selon le poids ; elles comptent ensemble comme « Cervidés »
        decoupe: { Cerf: '8 morceaux', Daguet: '8 morceaux', Biche: '6 morceaux', Faon: '6 morceaux' },
        versionEspeces: 2,
        proprietaires: ['Propriétaire'],
      },
      membres: [],      // { id, nom, action: '1' | '1/2', actif }
      journees: [],     // { date, presences, presencesValidees, prioTireur, betes, repartition }
      journal: [],      // une ligne par pièce distribuée (ou ajustement)
      journeeCourante: null,
      derniereModif: null,
      derniereSauvegarde: null,
    };
  }

  function completer(d) {
    const base = donneesVides();
    const res = Object.assign(base, d || {});
    res.params = Object.assign(donneesVides().params, (d && d.params) || {});
    res.params.actions = Object.assign(donneesVides().params.actions, res.params.actions || {});
    // Données d'avant les cervidés : on ajoute une seule fois biche, daguet et faon à la liste des espèces
    if (d && d.params && !(d.params.versionEspeces >= 2)) {
      ['Biche', 'Daguet', 'Faon'].forEach((e) => {
        if (!res.params.especes.some((x) => x.toLowerCase() === e.toLowerCase())) res.params.especes.push(e);
      });
      res.params.versionEspeces = 2;
    }
    ['membres', 'journees', 'journal'].forEach((k) => { if (!Array.isArray(res[k])) res[k] = []; });
    return res;
  }

  function charger() {
    try {
      const brut = localStorage.getItem(CLE);
      return completer(brut ? JSON.parse(brut) : null);
    } catch (e) {
      return donneesVides();
    }
  }

  const Store = {
    data: charger(),

    enregistrer(modifie = true) {
      if (modifie) this.data.derniereModif = new Date().toISOString();
      try {
        localStorage.setItem(CLE, JSON.stringify(this.data));
        return true;
      } catch (e) {
        return false;
      }
    },

    remplacer(d) {
      this.data = completer(d);
      this.enregistrer(false);
    },

    uid() {
      return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    },

    aSauvegarder() {
      const d = this.data;
      if (!d.derniereModif) return false;
      return !d.derniereSauvegarde || d.derniereModif > d.derniereSauvegarde;
    },

    exportJSON() {
      return JSON.stringify({ app: 'venaison', format: 1, exporteLe: new Date().toISOString(), donnees: this.data }, null, 1);
    },

    lireImport(texte) {
      const o = JSON.parse(texte);
      if (!o || o.app !== 'venaison' || !o.donnees) throw new Error('Ce fichier n’est pas une sauvegarde Venaison.');
      return o;
    },

    demanderStockagePersistant() {
      if (navigator.storage && navigator.storage.persist) {
        navigator.storage.persist().catch(() => {});
      }
    },
  };

  root.Store = Store;
})(typeof self !== 'undefined' ? self : this);
