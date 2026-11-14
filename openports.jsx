// OpenPorts : les connexions de ce Mac vers Internet, sur une carte du monde et dans une liste en capsules.
// Tout se passe ici, en JavaScript : collecte (nettop), pays et organisation (ip-api.com), carte, liste.
// Remplace openports.zsh + config.zsh + tint-map.pl (migration du 6 nov. 2026, rendu identique).
// La liste coule autour de la carte : d'abord au-dessus (liste du haut), puis en dessous (liste du bas).
// Les connexions actives passent en premier ; les connexions terminées, estompées selon leur âge,
// prennent les places restantes.

import { run } from 'uebersicht';

// ==========================================================================
// 1. MES RÉGLAGES : n'écrire ici que ce qu'on veut changer
// ==========================================================================
// Les valeurs par défaut complètes sont dans DEFAUTS, juste en dessous.
// Une clé absente, mal écrite ou d'un mauvais type garde sa valeur par défaut.
const MES_REGLAGES = {
	pays: {
		// Pays « focus » (en rose) : tous les pays SAUF ceux-ci, où le RGPD suit vos données :
		// l'Espace économique européen et les pays reconnus « adéquats » par la Commission européenne (novembre 2026).
		focusSauf: [
			'at', 'be', 'bg', 'hr', 'cy', 'cz', 'dk', 'ee', 'fi', 'fr', 'de', 'gr', 'hu', 'ie',   // Union européenne
			'it', 'lv', 'lt', 'lu', 'mt', 'nl', 'pl', 'pt', 'ro', 'sk', 'si', 'es', 'se',
			'gp', 'mq', 'gf', 're', 'yt', 'mf', 'ax',                                             // territoires de l'UE
			'is', 'li', 'no',                                                                     // reste de l'EEE
			'ad', 'ar', 'br', 'ca', 'ch', 'fo', 'gb', 'gg', 'il', 'im', 'je', 'jp', 'kr', 'nz',   // décisions d'adéquation
			'us', 'uy',                                                                           // (US : entreprises du Data Privacy Framework)
		],
		toujours: ['fr'],             // toujours coloriés sur la carte, même sans connexion
	},
	liste: {
		habitues: ['apsd', 'rapportd', 'trustd'],
		paysIgnores: ['FR'],
		bas: { lignes: 4 },          // 9 par défaut ; 4 laissent la place à Bandwidth en bas à gauche (12 nov. 2026)
	},
};

// ==========================================================================
// 2. VALEURS PAR DÉFAUT
// ==========================================================================
const DEFAUTS = {
	carte: {
		top: 376, left: -50, largeur: 760,  // left : -70 à l origine, 0 trop à droite pour Fafa (5 nov. au soir) ; terres centrées à 578 à l écran, comme Favoris et le duo météo + Spectre ; les deux listes suivent la carte
		terres: { haut: 14.2, bas: 757.6, largeurSource: 1734 },   // haut et bas des terres de la carte (unités de la carte, mesurés)
		couleurs: {
			pays: '#49483E',              // pays sans connexion
			frontieres: '#272822',        // leurs frontières et côtes
			connecte: '#F8F8F0',          // pays connecté
			focus: '#F92672',             // pays focus connecté
		},
		epaisseur: 1,                     // des frontières
	},
	liste: {
		ecart: 35,                          // même espace entre la carte et chaque liste (du bord des terres au bord des rails)
		haut: { left: 80, lignes: 10 },     // au-dessus de la carte ; sa position se calcule à partir de la carte
		bas: { left: 80, lignes: 9 },      // en dessous de la carte ; la ligne « + N » est toujours la dernière
		habitues: ['apsd', 'rapportd', 'trustd'],   // masqués s'il y a trop d'actives (sauf vers un pays focus), jamais affichés une fois terminés ; noms avec « _ » à la place des espaces
		paysIgnores: [],                            // pays focus qui ne protègent pas un habitué (ex. ['FR'])
	},
	terminees: {
		afficher: true,
		opaciteMax: 0.45,                   // juste après la fin de la connexion (0.6 avant le 5 nov. au soir)
		opaciteMin: 0.12,                   // au bout de « duree » (0.15 avant)
		duree: 60,                          // minutes ; au-delà, la ligne disparaît
		fondu: { lignes: 4, facteur: 0.4 }, // les dernières lignes de la liste du bas s'estompent en plus, jusqu'à × facteur sur la dernière ; lignes: 0 = pas de fondu (jamais sous opaciteMin)
	},
	police: '"SF Pro Rounded", ui-rounded, sans-serif',
	couleurs: {
		texte: '#F8F8F2',                   // PID et programme
		repos: '#75715E',                   // processus système : texte, nom d'organisation et pilules ; ligne « + N »
		rail: '#3B3A32',                    // fond d'un rail d'organisation
		pilule: '#F8F8F2',                  // pilule d'un pays
		textePilule: '#272822',
		focus: '#F92672',                   // PID d'une ligne focus et pilule du pays focus
	},
	tailles: { texte: 12, organisation: 12, pays: 12 },
	ligne: 30,                              // d'une ligne à la suivante
	colonnes: { pid: 48, ecartPid: 16, programme: 170, ecartProgramme: 30 },   // un nom plus long que « programme » finit par « … »
	rail: { hauteur: 24, margeGauche: 10, margeDroite: 4, ecartPilules: 4, ecart: 6 },
	pilule: { hauteur: 16, largeurMin: 26, marge: 4 },
	orgInconnue: '',                        // nom affiché quand l'organisation est inconnue ; '' = rail sans nom, juste les pays
	largeurRails: 500,                      // les rails qui ne tiennent pas sur la ligne sont masqués (un programme = une ligne)
	pays: {
		focus: [],                          // pays « focus » (codes à deux lettres) : en rose sur la carte et dans la liste
		focusSauf: [],                      // si non vide : tous les pays SAUF ceux-ci sont focus aussi (en plus de focus)
		toujours: [],                       // pays toujours coloriés sur la carte, même sans connexion
	},
	collecte: {
		rafraichissement: 5,                // en secondes
		chemins_systeme: ['/System/'],      // un programme dont l'exécutable commence ainsi est un processus système (en gris)
		memoire_minutes: 1440,              // les connexions terminées restent en mémoire 24 h (l'affichage suit terminees.duree)
	},
	geo: {
		memoire_jours: 30,                  // une adresse non revue depuis 30 jours est oubliée (sa localisation sera redemandée)
	},
};

// ==========================================================================
// Fusion tolérante : chaque valeur de MES_REGLAGES remplace celle de DEFAUTS si son type convient.
// ==========================================================================
const fusionner = (defaut, perso) => {
	if (Array.isArray(defaut)) {
		if (!Array.isArray(perso)) return defaut;
		return perso.map((p, i) => fusionner(defaut.length ? defaut[Math.min(i, defaut.length - 1)] : p, p));
	}
	if (defaut && typeof defaut === 'object') {
		const resultat = {};
		const source = perso && typeof perso === 'object' ? perso : {};
		for (const cle of Object.keys(defaut)) resultat[cle] = fusionner(defaut[cle], source[cle]);
		return resultat;
	}
	const typeAccepte = typeof perso === typeof defaut || (typeof defaut === 'string' && typeof perso === 'number');
	return perso !== undefined && typeAccepte ? perso : defaut;
};

const C = fusionner(DEFAUTS, MES_REGLAGES);
const FOCUS = new Set(C.pays.focus.map(x => String(x).toLowerCase()));
const SAUF = new Set(C.pays.focusSauf.map(x => String(x).toLowerCase()));
// Un pays (code à deux lettres, majuscules ou minuscules) est focus s'il est dans focus,
// ou si focusSauf n'est pas vide et qu'il n'y figure pas.
const paysFocus = code => {
	const c = String(code).toLowerCase();
	return FOCUS.has(c) || (SAUF.size > 0 && !SAUF.has(c));
};

// ==========================================================================
// 3. COLLECTE : nettop voit toutes les connexions TCP, de tous les comptes, IPv6 complet
// ==========================================================================
// (lsof ignore certaines applis, netstat tronque l'IPv6.) Une ligne par connexion établie :
// PID  User  Programme  Local->Distant  Système(0/1)
const COLLECTE = String.raw`nettop -m tcp -n -L 1 -x 2>/dev/null | awk -F',' -v syspaths="${C.collecte.chemins_systeme.join(' ')}" '
function fix(x) { match(x, /[.:][0-9]+$/); return substr(x,1,RSTART-1) ":" substr(x,RSTART+1) }
NR == 1 { next }
$2 !~ /^tcp[46] / {
	nom = $2; cur = nom; sub(/.*\./, "", cur); sub(/\.[0-9]+$/, "", nom)
	if (!(cur in usr)) {
		u = ""; q = "ps -p " cur " -o user= 2>/dev/null"; q | getline u; close(q); usr[cur] = u
		c = ""; q = "ps -p " cur " -o comm= 2>/dev/null"; q | getline c; close(q)
		sys[cur] = 0; n = split(syspaths, sp, " ")
		for (i = 1; i <= n; i++) if (index(c, sp[i]) == 1) sys[cur] = 1
		if (c != "") { complet = c; sub(/.*\//, "", complet); sub(/ \([^)]*\)$/, "", complet); if (index(complet, nom) == 1) nom = complet }
		gsub(/ /, "_", nom)
		prog[cur] = nom
	}
	next
}
$4 == "Established" {
	split(substr($2, 6), a, "<->")
	print cur "\t" usr[cur] "\t" prog[cur] "\t" fix(a[1]) "->" fix(a[2]) "\t" sys[cur]
}'`;
// Ce que fait l'awk : nettop coupe les noms à 15 caractères ; l'exécutable (ps) donne le vrai nom, sans chemin
// ni suffixe entre parenthèses (« Google Chrome Helper (Renderer) » → « Google Chrome Helper »), gardé seulement
// s'il prolonge le nom de nettop (ps code les accents : « Übersicht » → « UM-LM^Hbersicht »).

// Découpe la sortie : [{ pid, user, prog, lport, rport, ip, sys }], sans doublon, triée par PID puis programme
const decouper = sortie => {
	const vues = new Set(), lignes = [];
	sortie.split('\n').forEach(l => {
		const [pid, user, prog, liaison, sys] = l.split('\t');
		if (!liaison) return;
		const [local, distant = ''] = liaison.split('->');
		const lport = local.replace(/.*:/, ''), rport = distant.replace(/.*:/, '');
		const ip = distant.replace(/:[^:]*$/, '').replace(/[[\]]/g, '');
		const cle = [pid, user, prog, lport, rport, ip, sys].join('\t');
		if (vues.has(cle)) return;
		vues.add(cle);
		lignes.push({ pid, user, prog, lport, rport, ip, sys: sys === '1', cle });
	});
	return lignes.sort((a, b) => (Number(a.pid) - Number(b.pid)) || (a.prog < b.prog ? -1 : a.prog > b.prog ? 1 : 0)
		|| (a.cle < b.cle ? -1 : a.cle > b.cle ? 1 : 0));
};

// ==========================================================================
// 4. GÉOLOCALISATION : ip-api.com (gratuit pour un usage personnel), avec une mémoire
// ==========================================================================
// Réseau local : « Localhost LAN ». Les autres adresses sont demandées par paquets de 100 (ip-api /batch),
// puis gardées en mémoire (localStorage) : { ip: [organisation, pays, dernière fois vue] }.
const CLE_GEO = 'capsules-openports-geo';
const lireGeo = () => { try { return JSON.parse(localStorage.getItem(CLE_GEO)) || {}; } catch (e) { return {}; } };
let GEO = lireGeo();
const ecrireGeo = () => {
	const limite = Date.now() - C.geo.memoire_jours * 86400000;
	for (const ip of Object.keys(GEO)) if (GEO[ip][2] < limite) delete GEO[ip];
	try { localStorage.setItem(CLE_GEO, JSON.stringify(GEO)); } catch (e) {}
};

const LOCAL = /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fe80:|fc|fd)/i;

// Organisation : premier mot, sans ponctuation, majuscule initiale (« Google LLC » → « Google »)
const nomOrganisation = brut => {
	const mot = (brut || '').split(' ')[0].replace(/[^\p{L}\p{N}-]/gu, '').toLowerCase();
	return mot ? mot.charAt(0).toUpperCase() + mot.slice(1) : 'not-found';
};

// Localise les adresses inconnues. Une adresse sans réponse reste inconnue et n'est redemandée qu'après 10 minutes
// (ip-api accepte 15 paquets par minute).
const ECHECS = {};
const localiser = ips => {
	const inconnues = [...new Set(ips)]
		.filter(ip => ip && !LOCAL.test(ip) && !GEO[ip] && !(Date.now() - ECHECS[ip] < 600000)).slice(0, 100);
	if (!inconnues.length) return Promise.resolve();
	const controle = new AbortController();
	setTimeout(() => controle.abort(), 5000);
	return fetch('http://ip-api.com/batch?fields=status,query,countryCode,org,isp', {
		method: 'POST', body: JSON.stringify(inconnues), signal: controle.signal,
	})
		.then(r => r.ok ? r.json() : [])
		.then(reponses => {
			reponses.forEach(x => {
				if (x && x.status === 'success') GEO[x.query] = [nomOrganisation(x.org || x.isp), x.countryCode, Date.now()];
			});
			inconnues.forEach(ip => { if (!GEO[ip]) ECHECS[ip] = Date.now(); });
		})
		.catch(() => { inconnues.forEach(ip => { ECHECS[ip] = Date.now(); }); });
};

// « Org CC », « Localhost LAN », ou [ '', '' ] si l'adresse est encore inconnue
const geo = ip => {
	if (LOCAL.test(ip)) return ['Localhost', 'LAN'];
	const g = GEO[ip];
	if (!g) return ['', ''];
	g[2] = Date.now();
	return [g[0], g[1]];
};

// ==========================================================================
// 5. CONNEXIONS : regroupement, pays de la carte, mémoire des connexions terminées
// ==========================================================================
const CLE_HISTOIRE = 'capsules-openports-historique';
const lireHistoire = () => { try { return JSON.parse(localStorage.getItem(CLE_HISTOIRE)) || []; } catch (e) { return []; } };
const ecrireHistoire = h => { try { localStorage.setItem(CLE_HISTOIRE, JSON.stringify(h)); } catch (e) {} };

const estFocus = lieu => /^[A-Z]{2}$/.test(lieu) && paysFocus(lieu);

// À partir des connexions découpées : les lignes à afficher (une par PID, organisation et pays, sans doublon),
// les pays connectés (pour la carte) et la mémoire des connexions terminées mise à jour.
const analyser = (connexions, histoire, maintenant) => {
	const lignes = [], vues = new Set(), pays = new Set();
	connexions.forEach(c => {
		const [org, lieu] = geo(c.ip);
		if (/^[A-Z]{2}$/.test(lieu)) pays.add(lieu.toLowerCase());
		const cle = [c.pid, c.prog, org, lieu].join('|');
		if (vues.has(cle)) return;
		vues.add(cle);
		lignes.push({ pid: c.pid, prog: c.prog, org, lieu, focus: estFocus(lieu), systeme: c.sys });
	});
	C.pays.toujours.forEach(x => pays.add(String(x).toLowerCase()));

	// Mémoire : les connexions du moment en tête, à l'heure ; la première occurrence d'une connexion est la plus récente
	const limite = maintenant - C.collecte.memoire_minutes * 60;
	const dejaVues = new Set(), nouvelle = [];
	[...lignes.filter(l => l.pid).map(l => ({ ...l, vu: maintenant })), ...histoire].forEach(h => {
		const cle = [h.pid, h.prog, h.org, h.lieu].join('|');
		if (h.vu < limite || dejaVues.has(cle)) return;
		dejaVues.add(cle);
		nouvelle.push(h);
	});
	return { lignes, pays: [...pays], histoire: nouvelle };
};

export const initialState = { lignes: [], pays: C.pays.toujours.map(x => String(x).toLowerCase()), histoire: lireHistoire(), pret: false };

export const updateState = (evenement, avant) => evenement.type === 'CONNEXIONS' ? { ...evenement.etat, pret: true } : avant;

// Toutes les « rafraichissement » secondes : collecte, localisation des nouvelles adresses, analyse.
let enCours = false;
export const command = dispatch => {
	if (enCours) return;                    // la collecte précédente n'est pas finie (réseau lent) : on attend
	enCours = true;
	run(COLLECTE)
		.then(sortie => {
			const connexions = decouper(sortie);
			return localiser(connexions.map(c => c.ip)).then(() => connexions);
		})
		.then(connexions => {
			const etat = analyser(connexions, lireHistoire(), Math.floor(Date.now() / 1000));
			ecrireHistoire(etat.histoire);
			ecrireGeo();
			dispatch({ type: 'CONNEXIONS', etat });
		})
		.catch(() => {})
		.then(() => { enCours = false; });
};
export const refreshFrequency = Math.max(2, C.collecte.rafraichissement) * 1000;

// ==========================================================================
// 6. MISE EN PAGE (CSS)
// ==========================================================================
// Position des deux listes, calculée à partir des terres de la carte :
// l'espace se mesure du bord des terres au bord du rail le plus proche (le rail est centré dans sa ligne).
const echelle = C.carte.largeur / C.carte.terres.largeurSource;
const bordRail = (C.ligne - C.rail.hauteur) / 2;
const TOP_HAUT = C.carte.top + C.carte.terres.haut * echelle - C.liste.ecart - C.liste.haut.lignes * C.ligne + bordRail;
const TOP_BAS = C.carte.top + C.carte.terres.bas * echelle + C.liste.ecart - bordRail;

// Position et style du widget (CSS)
export const className = `
	top: 0;
	left: 0;
	.carte { position: absolute; top: ${C.carte.top}px; left: ${C.carte.left}px; }
	.carte svg { display: block; width: ${C.carte.largeur}px; height: auto; }

	.liste {
		position: absolute;
		font-family: ${C.police};
		font-size: ${C.tailles.texte}px;
		color: ${C.couleurs.texte};
	}
	.ligne {
		display: flex;
		align-items: flex-start;
	}
	.cellule {
		height: ${C.ligne}px;
		line-height: ${C.ligne}px;
		white-space: nowrap;
		flex: none;
	}
	.pid { width: ${C.colonnes.pid}px; margin-right: ${C.colonnes.ecartPid}px; text-align: right; font-variant-numeric: tabular-nums; }
	.programme { width: ${C.colonnes.programme}px; margin-right: ${C.colonnes.ecartProgramme}px; overflow: hidden; text-overflow: ellipsis; }
	.rails {
		display: flex;
		flex-wrap: wrap;
		column-gap: ${C.rail.ecart}px;
		flex: none;
		width: max-content;                 /* sinon le widget, sans largeur, ferait passer chaque rail à la ligne */
		max-width: ${C.largeurRails}px;
		height: ${C.ligne}px;               /* une seule ligne : les rails passés à la ligne sont cachés */
		overflow: hidden;
	}
	.emplacement {
		height: ${C.ligne}px;
		display: flex;
		align-items: center;
	}
	.rail {
		display: flex;
		align-items: center;
		gap: ${C.rail.ecartPilules}px;
		height: ${C.rail.hauteur}px;
		border-radius: ${C.rail.hauteur / 2}px;
		padding: 0 ${C.rail.margeDroite}px 0 ${C.rail.margeGauche}px;
		background: ${C.couleurs.rail};
		font-size: ${C.tailles.organisation}px;
		white-space: nowrap;
	}
	.rail.sans-nom { padding-left: ${C.rail.margeDroite}px; }   /* rail sans nom : même marge des deux côtés des pilules */
	.organisation { margin-right: ${C.rail.ecart - C.rail.ecartPilules}px; }
	.pilule {
		box-sizing: border-box;
		min-width: ${C.pilule.largeurMin}px;
		height: ${C.pilule.hauteur}px;
		line-height: ${C.pilule.hauteur}px;
		border-radius: ${C.pilule.hauteur / 2}px;
		padding: 0 ${C.pilule.marge}px;
		text-align: center;
		font-size: ${C.tailles.pays}px;
		color: ${C.couleurs.textePilule};
		background: ${C.couleurs.pilule};
	}
	.systeme { color: ${C.couleurs.repos}; }
	.systeme .pilule { background: ${C.couleurs.repos}; }
	.focus { color: ${C.couleurs.focus}; }
	.pilule.focus { background: ${C.couleurs.focus}; color: ${C.couleurs.textePilule}; }
`;

// Ajoute une connexion à un programme : un rail par organisation, une pilule par pays (sans doublon).
const ajouterPays = (p, org, code, estFocus) => {
	if (estFocus) p.focus = true;
	let rail = p.rails.find(r => r.org === org);
	if (!rail) { rail = { org, pays: [] }; p.rails.push(rail); }
	const pays = rail.pays.find(x => x.code === code);
	if (pays) pays.focus = pays.focus || estFocus;
	else rail.pays.push({ code, focus: estFocus });
};

// ==========================================================================
// 7. DESSIN
// ==========================================================================
// Regroupe les lignes (déjà triées par PID) : un programme par PID, un rail par organisation, une pilule par pays.
const regrouper = lignes => {
	const programmes = [];
	lignes.forEach(l => {
		const dernier = programmes[programmes.length - 1];
		if (!dernier || l.pid !== dernier.pid) programmes.push({ pid: l.pid, prog: l.prog, systeme: l.systeme, focus: false, rails: [] });
		ajouterPays(programmes[programmes.length - 1], l.org, l.lieu, l.focus);
	});
	return programmes;
};

// Programmes terminés, du plus récent au plus ancien, avec leur opacité.
// Écartés : un programme encore actif (même PID ou même nom : un programme qui revient efface sa ligne terminée),
// les habitués, et ce qui est plus vieux que C.terminees.duree.
// Si un programme a tourné sous plusieurs PID, seul le plus récent est gardé.
const terminer = (histoire, actifs) => {
	const T = C.terminees;
	if (!T.afficher) return [];
	const pids = new Set(actifs.map(p => p.pid));
	const progs = new Set(actifs.map(p => p.prog));
	const dureeMax = T.duree * 60;
	const maintenant = Date.now() / 1000;
	const parPid = new Map();
	histoire.forEach(({ vu, pid, prog, org, lieu, focus, systeme }) => {
		if (pids.has(pid) || progs.has(prog) || C.liste.habitues.includes(prog)) return;
		const age = Math.max(0, maintenant - vu);
		if (age > dureeMax) return;
		if (!parPid.has(pid)) parPid.set(pid, { pid, prog, systeme, focus: false, rails: [], age });
		const p = parPid.get(pid);
		p.age = Math.min(p.age, age);
		ajouterPays(p, org, lieu, focus);
	});
	const parProg = new Map();
	[...parPid.values()].forEach(p => {
		const autre = parProg.get(p.prog);
		if (!autre || p.age < autre.age) parProg.set(p.prog, p);
	});
	return [...parProg.values()]
		.sort((a, b) => a.age - b.age)
		.map(p => ({ ...p, opacite: T.opaciteMax - (T.opaciteMax - T.opaciteMin) * p.age / dureeMax }));
};

// Nom affiché : les « _ » et les « - » deviennent des espaces (Google_Chrome_H → Google Chrome H)
const lisible = nom => (nom || '').replace(/[_-]+/g, ' ');

// Au-delà de max programmes : masque les habitués, puis coupe la liste.
// Un programme connecté à un pays focus (hors paysIgnores) n'est jamais masqué.
// La ligne « + N » compte dans le maximum : on garde max - 1 programmes.
const filtrer = (programmes, max) => {
	const { habitues, paysIgnores } = C.liste;
	if (!max || programmes.length <= max) return { visibles: programmes, masques: 0 };
	const alerte = p => p.rails.some(r => r.pays.some(x =>
		x.focus && !paysIgnores.includes((x.code || '').slice(0, 2).toUpperCase())));
	const gardes = programmes.filter(p => alerte(p) || !habitues.includes(p.prog));
	let places = max - 1 - gardes.filter(alerte).length;   // places restantes une fois les alertes servies
	const visibles = gardes.filter(p => alerte(p) || places-- > 0);
	return { visibles, masques: programmes.length - visibles.length };
};

// Une ligne de la liste : un programme (actif ou terminé), ou la ligne « + N »
const Ligne = ({ p }) => {
	if (p.plus) {
		return (
			<div className="ligne systeme">
				<span className="cellule pid"></span>
				<span className="cellule programme">+ {p.plus} programme{p.plus > 1 ? 's' : ''}</span>
			</div>
		);
	}
	return (
		<div className={'ligne' + (p.systeme ? ' systeme' : '')} style={p.opacite === undefined ? null : { opacity: p.opacite }}>
			<span className={'cellule pid' + (p.focus ? ' focus' : '')}>{p.pid}</span>
			<span className="cellule programme">{lisible(p.prog)}</span>
			<div className="rails">
				{p.rails.map((r, j) => {
					const nom = r.org === 'not-found' ? C.orgInconnue : lisible(r.org);
					return (
						<div key={j} className="emplacement">
							<div className={'rail' + (nom ? '' : ' sans-nom')}>
								{nom && <span className="organisation">{nom}</span>}
								{r.pays.map((x, k) => (
									<span key={k} className={'pilule' + (x.focus ? ' focus' : '')}>{x.code}</span>
								))}
							</div>
						</div>
					);
				})}
			</div>
		</div>
	);
};

// La carte : un tracé par pays (identifiant = code du pays) ; connecté en blanc, focus en rose, sinon au repos
const CARTE = tracesCarte();              // déclarée tout en bas (une fonction est connue dès le début du fichier)
const Carte = ({ pays }) => {
	const connectes = new Set(pays), K = C.carte.couleurs;
	return (
		<svg xmlns="http://www.w3.org/2000/svg" width="1728px" height="899px" viewBox="0 0 1734 902">
			{CARTE.map(([id, d]) => {
				const etat = !connectes.has(id) ? 'repos' : paysFocus(id) ? 'focus' : 'connecte';
				return (
					<path key={id} id={id} d={d} fill={etat === 'repos' ? K.pays : etat === 'focus' ? K.focus : K.connecte} fillOpacity="1"
						stroke={etat === 'repos' ? K.frontieres : 'none'} strokeOpacity="1" strokeWidth={C.carte.epaisseur} strokeLinejoin="round" />
				);
			})}
		</svg>
	);
};

export const render = ({ lignes: actives, pays, histoire, pret }) => {
	if (!pret) return null;                 // première collecte pas encore finie
	const { haut, bas } = C.liste;
	const places = haut.lignes + bas.lignes;

	// Actives d'abord, puis « + N », puis les terminées dans les places restantes
	const actifs = regrouper(actives);
	const { visibles, masques } = filtrer(actifs, places);
	const lignes = [...visibles];
	if (masques > 0) lignes.push({ plus: masques });
	lignes.push(...terminer(histoire, actifs).slice(0, Math.max(0, places - lignes.length)));

	// Fondu de fin de liste : les dernières lignes terminées de la liste du bas s'estompent progressivement
	const { lignes: nFondu, facteur } = C.terminees.fondu;
	const debutFondu = Math.max(haut.lignes, lignes.length - nFondu);
	for (let i = debutFondu; i < lignes.length; i++) {
		const p = lignes[i];
		if (p.opacite === undefined) continue;   // actives et « + N » : jamais estompées
		const rang = i - (lignes.length - nFondu) + 1;   // 1 … nFondu (la dernière ligne)
		p.opacite = Math.max(C.terminees.opaciteMin, p.opacite * (1 - (1 - facteur) * rang / nFondu));
	}

	const liste = (top, left, contenu) => (
		<div className="liste" style={{ top, left }}>
			{contenu.map((p, i) => <Ligne key={i} p={p} />)}
		</div>
	);
	return (
		<div>
			<div className="carte"><Carte pays={pays} /></div>
			{liste(TOP_HAUT, haut.left, lignes.slice(0, haut.lignes))}
			{liste(TOP_BAS, bas.left, lignes.slice(haut.lignes))}
		</div>
	);
};

// ==========================================================================
// 8. LA CARTE : Natural Earth 1:110m (domaine public), simplifiée et arrondie pour Capsules
// ==========================================================================
// Un tracé par pays, dans un repère de 1734 × 902. « alaska » et « guyane » ont leur propre nom (jamais coloriés).
function tracesCarte() {
	return [
		['fj', 'M1711.7 548.2Q1712.7 548.5 1713.4 548.0Q1714.1 547.6 1714.7 548.4Q1715.3 549.2 1714.6 550.7Q1713.8 552.1 1712.2 552.5Q1710.7 552.9 1709.5 552.5Q1708.2 552.2 1708.3 551.0Q1708.4 549.7 1709.6 548.8Q1710.7 547.8 1711.7 548.2Z'],
		['tz', 'M1030.3 456.1L1031.1 456.7L1055.6 476.9L1053.3 483.8L1058.5 507.1L1060.2 508.4L1036.1 514.6L1032.4 515.1L1031.3 507.5L1028.8 503.3L1024.2 502.3L1021.5 500.6L1016.6 498.7L1014.6 497.3L1012.1 490.3L1009.0 481.0L1008.2 475.9L1010.2 475.6L1014.0 466.5L1013.7 464.3L1015.1 463.6L1015.4 460.3L1013.5 457.2L1015.2 456.5L1020.5 456.6L1030.3 456.1Z'],
		['eh', 'M826.8 296.3L826.8 296.6L826.6 297.7L826.5 306.2L818.8 306.1Q811.2 305.9 808.6 318.9Q806.0 331.8 796.3 332.7L786.5 333.6L786.8 331.2L792.1 331.0Q797.5 330.8 805.7 315.7Q814.0 300.6 820.0 298.4L826.1 296.3L826.8 296.3Z'],
		['ca', 'M346.3 177.6L345.8 177.6L339.4 172.7Q333.0 167.8 334.8 163.8Q336.6 159.7 334.8 154.5L333.0 149.3L335.0 146.6L338.3 143.7Q341.6 140.8 339.3 130.8Q337.1 120.8 331.1 123.1Q325.1 125.3 321.6 121.8Q318.1 118.2 345.7 95.2L373.3 72.2L378.3 73.3L400.7 70.9Q423.1 68.6 424.2 70.9Q425.3 73.3 429.6 71.7Q434.0 70.1 432.0 71.9Q430.0 73.7 444.5 74.8Q459.1 76.0 456.3 78.4Q453.6 80.8 456.3 81.3Q458.9 81.8 466.5 82.5Q474.1 83.2 482.4 79.9Q490.8 76.5 496.4 79.2Q502.1 82.0 510.9 79.8Q519.8 77.5 521.8 78.3Q523.8 79.2 521.8 81.4Q519.7 83.7 531.8 72.8Q544.0 61.9 546.5 63.3Q549.1 64.7 546.9 71.4Q544.7 78.0 549.5 77.7Q554.3 77.4 552.7 80.7Q551.0 84.1 559.6 77.8Q568.2 71.4 572.9 71.9Q577.5 72.4 574.9 78.5Q572.3 84.5 563.3 85.9Q554.4 87.2 539.8 94.4Q525.2 101.6 509.5 113.4Q493.8 125.1 496.5 125.5Q499.1 126.0 498.3 130.3Q497.5 134.7 515.0 139.8Q532.5 144.8 530.5 149.8Q528.5 154.7 530.8 160.2Q533.0 165.7 537.2 162.1Q541.4 158.5 541.4 152.9Q541.3 147.3 550.2 142.5Q559.2 137.6 558.2 131.7Q557.2 125.8 563.0 117.0Q568.8 108.1 577.1 107.8Q585.4 107.4 591.7 110.9Q598.0 114.4 596.0 119.7Q594.0 125.1 596.3 127.0Q598.7 128.9 607.2 123.5Q615.6 118.0 616.9 128.3Q618.1 138.6 625.6 143.1Q633.0 147.6 634.4 154.1Q635.7 160.7 625.1 165.8Q614.5 170.9 601.1 171.0Q587.7 171.0 582.2 174.1Q576.7 177.3 569.2 183.4Q561.8 189.5 576.7 182.9Q591.6 176.4 590.5 184.5Q589.3 192.7 595.4 193.7Q601.5 194.6 604.5 191.5Q607.5 188.5 608.2 191.4Q609.0 194.4 595.2 201.0Q581.5 207.5 580.4 205.0Q579.3 202.4 583.7 200.1Q588.1 197.9 584.6 198.0L581.1 198.1L576.1 198.7L576.2 193.4Q576.4 188.2 573.6 187.1Q570.8 186.1 563.9 192.8Q557.0 199.4 549.7 199.4Q542.4 199.5 522.4 208.7Q502.5 217.8 506.1 207.7Q509.7 197.6 500.3 189.5Q490.8 181.4 483.7 181.9Q476.6 182.3 471.3 178.9Q466.1 175.5 406.2 176.6L346.3 177.6ZM606.3 57.2Q599.9 57.9 601.0 55.7Q602.0 53.6 607.3 55.0Q612.6 56.5 606.3 57.2ZM594.5 48.6Q579.3 50.7 573.4 49.7Q567.5 48.8 569.4 46.5Q571.3 44.2 567.0 42.3Q562.6 40.4 564.3 39.6Q566.0 38.7 573.0 39.5Q580.0 40.3 580.9 42.8Q581.8 45.4 595.8 46.0Q609.8 46.5 594.5 48.6ZM624.2 175.2Q634.8 165.2 631.1 169.2Q627.5 173.2 634.1 174.8Q640.7 176.3 639.8 183.3Q639.0 190.4 637.2 187.4Q635.4 184.4 632.3 186.8Q629.2 189.1 621.5 187.2Q613.7 185.2 624.2 175.2ZM553.5 92.7Q556.0 94.3 560.8 97.7Q565.5 101.1 551.8 101.5Q538.1 102.0 544.5 96.6Q550.9 91.2 553.5 92.7ZM597.5 60.6Q601.5 59.9 615.2 64.2Q628.8 68.4 629.8 71.5Q630.8 74.7 626.9 75.8Q622.9 76.9 632.6 81.3Q642.4 85.8 636.1 90.3Q629.8 94.8 624.0 91.7Q618.2 88.7 620.5 95.7Q622.8 102.7 621.2 104.5Q619.6 106.3 613.9 103.6Q608.2 101.0 610.8 105.5Q613.4 110.0 600.8 103.2Q588.3 96.4 581.2 96.6Q574.0 96.9 584.0 94.7Q593.9 92.6 599.2 88.2Q604.5 83.7 599.7 79.9Q594.9 76.0 595.7 74.0Q596.6 71.9 577.4 69.6Q558.1 67.3 566.3 60.9Q574.4 54.6 579.3 54.0Q584.2 53.4 581.4 56.2Q578.6 59.1 587.1 56.4Q595.5 53.6 594.5 57.4Q593.6 61.3 597.5 60.6ZM550.6 56.6Q557.2 51.9 563.1 52.5Q569.0 53.1 556.5 57.2Q544.0 61.3 550.6 56.6ZM479.0 43.6Q477.6 43.2 482.8 41.5Q488.0 39.9 493.4 38.6Q498.8 37.2 501.1 37.2Q503.4 37.2 506.0 36.9Q508.6 36.6 505.9 38.3Q503.2 39.9 500.8 40.6Q498.5 41.4 496.8 41.5Q495.2 41.6 490.9 42.5Q486.5 43.4 483.4 43.8Q480.4 44.1 479.0 43.6ZM549.3 31.7Q551.6 29.8 557.0 31.8Q562.3 33.8 554.6 33.7Q547.0 33.6 549.3 31.7ZM340.1 175.5Q341.9 180.3 337.9 179.4Q333.8 178.6 330.8 174.0Q327.8 169.3 333.0 170.0Q338.2 170.6 340.1 175.5ZM464.6 50.8Q470.7 50.5 477.5 52.7Q484.3 54.8 463.7 60.7Q443.1 66.6 441.2 64.4Q439.4 62.1 449.0 56.7Q458.6 51.2 464.6 50.8ZM523.7 42.3Q523.6 44.3 527.0 44.1Q530.5 43.8 527.0 45.9Q523.5 48.0 512.2 49.3Q500.8 50.6 503.8 49.0Q506.8 47.3 497.4 47.2Q488.1 47.1 495.8 44.3Q503.5 41.6 510.4 43.8Q517.4 46.0 520.6 43.1Q523.8 40.2 523.7 42.3ZM505.2 59.9Q511.9 56.6 509.8 61.4Q507.7 66.2 511.3 68.5Q514.9 70.7 509.3 73.7Q503.7 76.7 480.6 75.7Q457.5 74.7 457.5 72.9Q457.5 71.0 467.2 70.1Q476.9 69.1 467.9 68.7Q458.9 68.3 464.2 66.5Q469.5 64.7 464.6 64.2Q459.7 63.6 465.8 61.0Q471.8 58.3 485.9 57.7Q499.9 57.2 499.2 60.2Q498.4 63.2 505.2 59.9ZM526.3 58.8Q530.2 58.3 538.1 55.9Q545.9 53.6 541.7 58.3Q537.6 63.1 532.4 63.8Q527.2 64.5 524.7 61.9Q522.3 59.2 526.3 58.8ZM548.5 43.1Q558.1 40.6 553.9 44.3Q549.8 48.0 544.4 46.8Q538.9 45.6 548.5 43.1ZM584.6 26.5Q587.2 24.7 594.2 23.5Q601.2 22.2 605.9 26.0Q610.6 29.7 597.4 31.7Q584.2 33.7 586.6 31.6Q589.0 29.5 585.5 28.9Q582.0 28.2 584.6 26.5ZM609.1 22.5Q606.9 19.9 650.4 18.6Q694.0 17.3 665.6 23.5Q637.2 29.7 624.5 36.3Q611.9 42.9 598.5 42.3Q585.1 41.6 594.8 39.3Q604.4 37.1 601.9 35.3Q599.4 33.6 606.1 31.6Q612.8 29.6 612.4 27.9Q611.9 26.1 619.9 25.7Q627.8 25.2 619.5 25.1Q611.3 25.1 609.1 22.5ZM528.9 72.8Q528.9 73.2 529.2 74.1Q529.4 75.0 527.5 75.9Q525.6 76.7 523.9 76.0Q522.2 75.2 520.5 75.5Q518.8 75.8 517.4 74.7Q516.1 73.7 518.4 72.9Q520.6 72.2 522.9 71.2Q525.1 70.2 526.3 70.8Q527.5 71.5 528.1 71.9Q528.8 72.3 528.9 72.8Z'],
		['us', 'M346.3 177.6L406.2 176.6Q466.1 175.5 471.3 178.9Q476.6 182.3 483.7 181.9Q490.8 181.4 500.3 189.5Q509.7 197.6 506.1 207.7Q502.5 217.8 522.4 208.7Q542.4 199.5 549.7 199.4Q557.0 199.4 563.9 192.8Q570.8 186.1 573.6 187.1Q576.4 188.2 576.2 193.4L576.1 198.7L576.4 200.5L568.6 203.6Q560.9 206.7 558.3 210.4Q555.8 214.2 557.1 216.1Q558.5 218.1 549.7 220.0Q540.9 222.0 544.8 222.0Q548.7 222.0 544.2 222.5Q539.6 223.0 536.2 228.0Q532.7 233.1 531.7 231.5Q530.8 229.9 528.2 236.3Q525.7 242.7 526.1 237.3Q526.6 231.9 524.5 234.4Q522.4 237.0 523.4 244.5Q524.4 252.0 509.0 263.5Q493.7 275.0 492.6 292.5Q491.4 310.0 488.6 308.2Q485.9 306.3 483.4 294.9Q481.0 283.5 475.0 282.2Q469.1 280.9 461.6 281.5Q454.1 282.2 453.9 285.0Q453.7 287.8 441.7 286.9Q429.7 286.0 423.0 290.7Q416.3 295.3 414.8 299.8L413.4 304.4L413.9 306.3L409.8 304.9Q405.7 303.5 403.2 295.0Q400.6 286.6 393.7 286.9Q386.7 287.2 382.7 280.2Q378.6 273.3 367.9 274.4Q357.2 275.6 350.0 271.7Q342.7 267.9 337.0 268.4L331.4 268.9L331.5 266.0L325.4 261.6Q319.4 257.3 317.3 241.3Q315.2 225.4 325.5 203.7Q335.9 182.1 339.0 182.5Q342.1 182.8 341.9 185.4Q341.6 188.0 343.4 185.0L345.2 182.1L346.3 177.6Z'],
		['alaska', 'M335.0 146.6L334.2 144.7L334.5 137.0Q334.8 129.4 322.8 124.3Q310.8 119.3 304.1 117.3Q297.4 115.3 283.8 119.7Q270.2 124.1 278.1 118.7Q286.0 113.2 256.6 126.8Q227.1 140.4 237.5 132.8Q247.9 125.3 239.0 124.4Q230.1 123.5 231.3 121.7Q232.4 119.8 228.5 118.5Q224.5 117.2 228.5 113.2Q232.6 109.3 250.7 102.6Q268.9 95.8 259.9 96.7Q251.0 97.5 249.4 94.5Q247.8 91.5 261.2 90.4Q274.6 89.4 273.5 84.0Q272.5 78.6 275.5 77.3Q278.5 76.1 304.9 70.3Q331.3 64.5 350.9 68.0L370.5 71.5L373.3 72.2L345.7 95.2Q318.1 118.2 321.6 121.8Q325.1 125.3 331.1 123.1Q337.1 120.8 339.3 130.8Q341.6 140.8 338.3 143.7L335.0 146.6Z'],
		['kz', 'M1236.8 176.5L1235.0 180.1L1233.6 184.3Q1232.2 188.5 1227.6 187.6Q1223.1 186.7 1223.3 191.6Q1223.5 196.5 1218.7 198.2Q1213.9 199.9 1216.1 205.4L1218.3 210.9L1219.7 214.1L1216.7 213.3L1204.2 211.1Q1191.6 208.8 1190.6 211.1Q1189.7 213.3 1184.5 212.7L1179.3 212.1L1179.0 214.6L1176.7 215.6L1173.0 219.5Q1169.3 223.5 1159.8 215.0Q1150.2 206.5 1144.1 207.1Q1138.0 207.7 1128.9 202.0Q1119.9 196.2 1114.7 197.9L1109.5 199.5L1114.2 219.9L1111.9 220.1L1108.3 217.2Q1104.7 214.2 1101.5 215.7L1098.3 217.2L1097.8 215.9L1091.7 208.8Q1085.6 201.6 1091.1 199.8Q1096.7 198.1 1095.7 193.7Q1094.7 189.3 1088.4 190.0L1082.0 190.7L1078.3 191.8L1071.5 186.4Q1064.7 180.9 1065.7 175.3Q1066.7 169.8 1069.3 171.3Q1071.8 172.9 1075.2 168.0Q1078.5 163.1 1101.3 165.5Q1124.1 167.9 1120.2 164.8Q1116.4 161.7 1119.1 159.0Q1121.8 156.3 1120.3 153.6Q1118.9 150.8 1133.1 147.2Q1147.3 143.6 1158.2 148.6Q1169.2 153.6 1175.1 150.9Q1181.1 148.3 1191.7 157.9Q1202.3 167.6 1217.7 170.4L1233.2 173.2L1236.8 176.5Z'],
		['uz', 'M1114.2 219.9L1109.5 199.5L1114.7 197.9Q1119.9 196.2 1128.9 202.0Q1138.0 207.7 1144.1 207.1Q1150.2 206.5 1159.8 215.0Q1169.3 223.5 1173.0 219.5L1176.7 215.6L1179.0 214.6L1180.4 215.1L1179.0 216.9Q1177.7 218.7 1184.0 220.5Q1190.3 222.3 1187.9 224.3L1185.6 226.3L1182.1 225.8L1180.3 225.9L1177.1 224.5Q1174.0 223.1 1171.1 226.3Q1168.3 229.5 1170.8 233.4L1173.2 237.4L1172.0 243.1L1168.3 241.9L1165.8 241.9L1165.2 238.4L1144.7 225.2Q1124.1 211.9 1121.6 215.8L1119.1 219.8L1114.2 219.9Z'],
		['pg', 'M1545.9 465.3L1554.2 469.2L1565.6 477.0Q1577.0 484.7 1575.6 488.4Q1574.2 492.0 1582.0 500.1Q1589.8 508.2 1582.9 507.8Q1576.1 507.3 1569.2 500.3Q1562.3 493.4 1555.5 497.6L1548.6 501.9L1543.7 501.7L1545.9 465.3ZM1596.9 478.7Q1594.6 483.4 1587.5 483.1Q1580.3 482.9 1586.3 482.1Q1592.4 481.2 1595.8 477.6Q1599.2 474.0 1596.9 478.7Z'],
		['id', 'M1545.9 465.3L1543.7 501.7L1539.9 497.1L1533.8 497.4Q1527.7 497.7 1530.5 494.7Q1533.3 491.6 1531.9 486.3Q1530.5 480.9 1520.5 475.7Q1510.4 470.6 1508.7 472.2Q1507.0 473.8 1504.8 470.2Q1502.5 466.6 1506.7 464.9Q1510.8 463.2 1503.2 459.6Q1495.6 456.1 1504.0 455.6Q1512.3 455.2 1515.7 462.4Q1519.1 469.6 1524.0 465.0Q1528.9 460.3 1534.9 462.3L1540.8 464.3L1545.9 465.3ZM1434.3 427.8L1431.8 432.8L1436.0 439.3Q1440.2 445.8 1437.3 446.1Q1434.4 446.5 1430.2 459.8Q1426.0 473.2 1411.9 470.2Q1397.7 467.2 1395.0 455.3L1392.3 443.4L1395.1 439.7L1397.2 443.1Q1399.3 446.5 1409.2 444.7Q1419.0 442.9 1421.8 434.9Q1424.6 426.8 1429.5 427.3L1434.3 427.8ZM1482.3 439.7Q1483.1 438.7 1483.3 440.2Q1483.5 441.8 1484.9 442.0Q1486.3 442.2 1486.6 443.4Q1486.8 444.5 1486.7 447.0Q1486.6 449.4 1485.3 449.1Q1484.1 448.9 1483.7 450.5Q1483.4 452.2 1484.4 453.7Q1485.3 455.2 1484.7 455.5Q1484.0 455.9 1483.0 454.1Q1482.1 452.3 1481.3 448.8Q1480.6 445.2 1481.1 443.0Q1481.5 440.8 1482.3 439.7ZM1454.2 444.8Q1459.1 446.0 1464.2 443.8Q1469.3 441.7 1467.8 445.1Q1466.4 448.4 1456.1 449.0Q1445.9 449.5 1445.5 451.6Q1445.2 453.7 1447.3 456.2Q1449.5 458.7 1455.3 456.5Q1461.1 454.3 1456.6 457.9Q1452.2 461.4 1455.8 471.0Q1459.5 480.6 1455.5 478.5Q1451.6 476.3 1450.6 470.9Q1449.5 465.5 1446.3 474.0Q1443.2 482.4 1441.0 474.4Q1438.9 466.4 1442.0 457.1Q1445.2 447.7 1447.2 445.6Q1449.2 443.5 1454.2 444.8ZM1382.8 485.2Q1388.5 486.6 1405.5 492.1Q1422.5 497.5 1400.5 494.7Q1378.5 491.8 1375.9 490.4Q1373.4 489.0 1375.2 486.4Q1377.0 483.7 1382.8 485.2ZM1352.8 439.2Q1369.7 456.9 1373.8 462.4Q1377.9 467.9 1376.9 475.7Q1375.9 483.4 1373.2 483.5Q1370.5 483.6 1348.0 451.9Q1325.4 420.3 1330.7 421.0Q1336.0 421.6 1352.8 439.2Z'],
		['ar', 'M582.9 743.6L585.4 746.0L593.5 750.3Q601.7 754.5 599.4 755.9L597.1 757.4L594.3 755.5L590.8 755.5Q587.4 755.4 585.1 749.5L582.9 743.6ZM601.5 619.8L601.0 624.3L601.1 640.5L601.3 643.4L606.2 649.0Q611.2 654.5 609.8 659.5Q608.5 664.4 598.6 666.2Q588.7 668.0 590.2 673.1Q591.8 678.3 585.4 679.4Q579.1 680.4 583.8 684.6Q588.4 688.8 585.3 691.3Q582.2 693.9 582.5 698.2Q582.8 702.4 579.4 703.8Q576.1 705.2 581.0 709.8Q585.9 714.5 581.5 723.9Q577.1 733.4 580.7 737.7L584.3 742.0L582.5 741.8L575.2 741.0Q568.0 740.2 562.2 733.0Q556.4 725.8 557.1 713.4Q557.8 701.0 553.8 694.0Q549.8 687.0 549.7 664.6Q549.5 642.1 546.4 634.1Q543.2 626.2 546.2 613.7Q549.3 601.1 548.0 594.5Q546.8 587.8 549.6 583.5L552.4 579.2L551.6 577.8L554.9 572.7L559.7 575.4Q564.5 578.1 567.8 576.0L571.2 573.9L572.1 575.1L581.8 584.2L589.4 587.8Q597.0 591.4 595.7 596.9Q594.5 602.4 599.6 603.6Q604.7 604.8 608.3 602.2L611.9 599.6L612.1 594.6L614.3 593.6L615.9 597.4Q617.4 601.3 612.0 606.7L606.6 612.1L601.5 619.8Z'],
		['cl', 'M582.9 743.6L585.1 749.5Q587.4 755.4 590.8 755.5L594.3 755.5L593.8 757.6L586.0 757.0Q578.1 756.4 568.2 750.5Q558.3 744.6 567.0 747.9Q575.6 751.2 577.7 747.1L579.7 742.9L582.9 743.6ZM536.6 548.9L539.4 552.7L548.3 578.6L551.6 577.8L552.4 579.2L549.6 583.5Q546.8 587.8 548.0 594.5Q549.3 601.1 546.2 613.7Q543.2 626.2 546.4 634.1Q549.5 642.1 549.7 664.6Q549.8 687.0 553.8 694.0Q557.8 701.0 557.1 713.4Q556.4 725.8 562.2 733.0Q568.0 740.2 575.2 741.0L582.5 741.8L578.8 741.7L576.3 745.9Q573.8 750.0 564.9 745.8Q555.9 741.6 550.9 731.9Q545.9 722.3 547.4 717.5Q549.0 712.8 545.5 712.0Q542.0 711.2 542.5 704.2Q543.1 697.3 545.8 698.2Q548.5 699.2 548.0 693.5Q547.5 687.8 544.6 690.1Q541.8 692.4 539.0 675.5Q536.2 658.7 538.2 645.4Q540.2 632.1 537.7 596.6L535.2 561.1L533.4 553.2L535.6 551.8L536.6 548.9Z'],
		['cd', 'M1008.2 475.9L1009.0 481.0L1012.1 490.3L1014.6 497.3L1012.7 496.8L1008.1 499.3Q1003.5 501.9 1003.1 509.3Q1002.8 516.6 1005.8 520.7Q1008.9 524.8 996.0 518.3L983.2 511.9L981.5 511.8L979.4 511.4L976.2 512.0Q973.1 512.6 972.3 502.1Q971.4 491.5 967.5 490.5Q963.6 489.5 957.2 492.7Q950.9 495.8 948.2 489.7Q945.5 483.6 935.9 484.2L926.2 484.8L925.6 483.1L927.8 478.6L929.5 477.5L933.3 478.0Q937.2 478.5 940.6 474.5Q944.0 470.5 949.8 452.6L955.6 434.7L955.8 431.3L956.2 427.4L958.5 425.1Q960.7 422.8 967.8 425.6Q974.8 428.4 986.0 425.3L997.1 422.3L998.7 421.7L1001.6 426.3L1011.2 427.6L1015.4 431.3L1015.2 437.8L1009.5 454.1L1009.5 458.3L1008.1 459.9L1007.2 463.6L1006.8 466.7L1007.9 469.2L1008.2 475.9Z'],
		['so', 'M1067.3 460.2L1064.3 435.3L1068.5 429.0L1069.8 427.2L1083.3 423.0L1096.5 406.2L1099.7 401.6L1101.3 387.2L1102.9 387.1L1107.3 386.2Q1111.7 385.3 1108.2 399.1Q1104.7 412.9 1086.5 435.9L1068.4 458.9L1067.3 460.2Z'],
		['ke', 'M1055.6 476.9L1031.1 456.7L1030.3 456.1L1030.2 450.2L1033.0 445.2Q1035.7 440.2 1034.4 435.6L1033.0 431.0L1030.7 427.1L1033.6 423.8L1036.8 420.1L1039.3 421.1L1044.9 425.9Q1050.5 430.8 1057.8 429.9L1065.2 429.0L1068.5 429.0L1064.3 435.3L1067.3 460.2L1063.9 462.4L1057.6 475.1L1055.6 476.9Z'],
		['sd', 'M985.0 405.0L981.3 402.5L977.1 391.1L976.5 388.7L976.5 387.4L975.0 379.2Q973.4 370.9 977.1 367.4L980.8 363.8L979.8 341.6L979.7 339.2L985.2 339.2L984.7 328.0L1003.6 328.0L1040.5 328.0L1042.4 333.5L1046.5 348.3L1049.2 350.4L1045.7 353.3Q1042.1 356.2 1041.2 362.2L1040.2 368.2L1040.8 370.4L1040.2 375.2L1029.9 397.4L1030.1 402.4L1029.9 398.1L1026.8 390.3Q1023.6 382.6 1020.5 389.4Q1017.3 396.1 1006.3 397.1Q995.3 398.1 993.0 395.4Q990.6 392.8 986.1 397.8L981.7 402.8L985.0 405.0Z'],
		['td', 'M979.8 341.6L980.8 363.8L977.1 367.4Q973.4 370.9 975.0 379.2L976.5 387.4L976.5 388.7L973.5 389.7L970.6 393.8Q967.7 398.0 956.1 403.5L944.4 409.1L940.4 409.5L941.1 408.0L937.5 402.8Q933.9 397.6 937.5 396.4Q941.2 395.2 939.7 388.9L938.2 382.7L936.3 379.1L936.7 376.5L934.2 373.6Q931.6 370.7 935.5 364.4Q939.5 358.1 940.8 347.6Q942.1 337.0 940.1 334.4L938.2 331.9L936.8 323.2L941.4 320.1L960.5 330.8L979.8 341.6Z'],
		['ht', 'M527.9 340.8L526.9 350.1L523.8 349.2L518.9 348.8Q514.0 348.5 519.1 347.6Q524.3 346.7 522.0 343.9Q519.8 341.2 521.8 340.6L523.9 339.9L527.9 340.8Z'],
		['do', 'M526.9 350.1L527.9 340.8L528.6 339.9L535.9 343.4Q543.3 347.0 535.1 349.4L526.9 351.8L526.9 350.1Z'],
		['ru', 'M1078.3 191.8L1077.0 195.1L1073.4 198.3Q1069.8 201.6 1072.4 206.1L1075.0 210.6L1081.0 217.1L1079.7 218.9Q1078.3 220.8 1075.5 218.9L1072.7 217.0L1071.4 216.8L1068.4 215.5L1041.6 208.1L1035.3 203.4L1030.6 200.8Q1025.8 198.1 1030.2 192.6L1034.5 187.1L1030.8 188.0L1033.7 185.8Q1036.5 183.6 1036.4 179.0Q1036.2 174.4 1025.8 171.8Q1015.4 169.1 1011.2 164.4Q1007.0 159.7 1003.8 160.4L1000.7 161.2L999.1 160.9L997.5 157.5L999.6 155.9Q1001.7 154.3 993.4 147.5L985.1 140.8L980.6 139.5L978.8 136.4L978.0 133.9L975.9 132.7L977.3 131.1L976.8 122.4L980.6 119.6L976.1 117.2L981.4 111.3Q986.7 105.3 977.5 91.9L968.4 78.5L968.0 75.2L970.7 74.8L976.1 72.9L976.1 72.9L995.6 77.9Q1015.0 82.9 1011.4 86.4Q1007.8 89.9 997.9 88.4Q987.9 86.9 997.0 93.7Q1006.1 100.5 1005.4 97.3Q1004.8 94.1 1009.7 95.6Q1014.7 97.2 1017.7 92.4Q1020.6 87.6 1024.4 88.6Q1028.1 89.6 1024.8 83.6Q1021.5 77.6 1026.8 78.3Q1032.1 79.1 1033.9 82.9Q1035.7 86.7 1046.5 81.4Q1057.2 76.2 1069.1 77.6Q1080.9 79.0 1079.8 75.2Q1078.6 71.5 1095.3 75.7Q1112.1 79.8 1104.2 72.9Q1096.3 66.0 1098.3 61.4Q1100.3 56.8 1106.6 58.7Q1112.9 60.5 1121.2 69.4Q1129.5 78.3 1128.5 83.4Q1127.6 88.4 1129.9 88.7Q1132.2 89.1 1134.4 85.3Q1136.6 81.4 1126.7 72.8Q1116.8 64.1 1118.6 62.5Q1120.3 61.0 1118.6 59.4Q1116.8 57.8 1122.9 61.6Q1129.0 65.5 1126.9 63.8Q1124.7 62.1 1126.8 61.2Q1128.8 60.3 1136.5 61.5Q1144.2 62.7 1138.6 58.4Q1133.0 54.1 1142.7 53.4Q1152.5 52.8 1150.3 50.1Q1148.1 47.5 1166.4 44.7Q1184.7 41.8 1186.6 39.1Q1188.5 36.4 1209.5 40.4Q1230.5 44.3 1227.9 48.0Q1225.3 51.7 1256.2 53.1Q1287.0 54.4 1303.5 60.8Q1319.9 67.2 1318.1 64.7Q1316.3 62.3 1330.5 63.1Q1344.6 63.9 1340.8 60.8Q1336.9 57.7 1375.9 62.2Q1414.8 66.8 1423.7 70.1Q1432.6 73.5 1450.8 75.2Q1468.9 77.0 1464.8 73.7Q1460.7 70.4 1482.2 73.0Q1503.6 75.7 1519.4 85.3Q1535.2 94.9 1531.8 95.8Q1528.3 96.7 1539.9 102.4Q1551.5 108.1 1543.0 109.8Q1534.6 111.4 1533.6 115.9Q1532.7 120.3 1527.8 118.6Q1522.9 116.8 1514.6 118.6Q1506.2 120.4 1516.9 133.4Q1527.5 146.4 1525.2 147.7Q1522.8 149.1 1524.8 152.1Q1526.8 155.1 1524.3 155.7Q1521.8 156.4 1522.5 161.6Q1523.2 166.8 1508.0 151.6Q1492.8 136.4 1496.0 125.2Q1499.2 114.0 1496.4 110.4Q1493.6 106.9 1491.5 107.1Q1489.5 107.3 1489.2 112.2Q1489.0 117.0 1483.8 113.9Q1478.6 110.8 1474.6 111.6Q1470.7 112.5 1470.5 116.7Q1470.4 121.0 1473.7 122.5Q1477.0 124.1 1452.0 124.4Q1427.0 124.7 1422.5 135.8Q1418.0 147.0 1434.2 151.4Q1450.3 155.7 1456.5 168.2Q1462.6 180.6 1459.6 194.5Q1456.6 208.3 1449.2 210.6L1441.8 213.0L1442.0 214.8L1440.9 213.8L1439.5 211.0L1437.3 205.3Q1435.2 199.7 1439.4 199.2Q1443.6 198.7 1442.4 189.6Q1441.1 180.5 1433.7 182.3Q1426.2 184.2 1400.9 169.0Q1375.6 153.7 1369.9 155.6Q1364.1 157.5 1366.6 159.6Q1369.1 161.7 1367.1 168.3L1365.1 174.9L1358.8 172.8L1354.1 173.3L1340.0 174.7Q1326.0 176.1 1302.0 168.7Q1277.9 161.2 1277.7 167.5Q1277.4 173.7 1265.5 170.8Q1253.5 167.9 1247.9 171.5L1242.3 175.1L1238.3 176.0L1236.8 176.5L1233.2 173.2L1217.7 170.4Q1202.3 167.6 1191.7 157.9Q1181.1 148.3 1175.1 150.9Q1169.2 153.6 1158.2 148.6Q1147.3 143.6 1133.1 147.2Q1118.9 150.8 1120.3 153.6Q1121.8 156.3 1119.1 159.0Q1116.4 161.7 1120.2 164.8Q1124.1 167.9 1101.3 165.5Q1078.5 163.1 1075.2 168.0Q1071.8 172.9 1069.3 171.3Q1066.7 169.8 1065.7 175.3Q1064.7 180.9 1071.5 186.4L1078.3 191.8ZM1136.1 24.4Q1138.0 23.1 1153.1 27.3Q1168.2 31.5 1156.7 30.4Q1145.3 29.3 1139.7 27.5Q1134.1 25.7 1136.1 24.4ZM1172.3 30.0Q1174.5 29.9 1180.8 31.9Q1187.1 33.9 1179.6 34.7Q1172.1 35.5 1171.1 32.8Q1170.1 30.1 1172.3 30.0ZM1312.9 46.4Q1306.9 43.1 1320.8 46.0Q1334.7 48.8 1326.8 49.3Q1318.9 49.8 1312.9 46.4ZM960.0 149.1L952.5 149.2L947.4 148.6L948.0 146.3L953.4 144.6L959.5 147.8L960.0 149.1ZM1043.4 58.8Q1043.5 53.6 1052.0 48.1Q1060.5 42.6 1072.0 41.9Q1083.6 41.3 1070.9 46.2Q1058.1 51.1 1055.9 55.5Q1053.8 59.9 1059.7 63.7Q1065.7 67.5 1054.5 65.7Q1043.2 64.0 1043.4 58.8ZM1451.6 151.1Q1454.2 152.4 1467.2 165.1Q1480.2 177.8 1476.5 176.9Q1472.7 176.0 1474.0 179.9Q1475.3 183.8 1480.4 188.5Q1485.4 193.2 1480.8 191.4Q1476.2 189.6 1463.5 172.1Q1450.8 154.6 1449.9 152.1Q1449.1 149.7 1451.6 151.1ZM232.3 79.9Q234.3 84.1 232.1 86.2Q229.8 88.3 236.5 86.9Q243.2 85.5 243.3 87.8Q243.4 90.0 231.6 94.2Q219.8 98.5 213.8 95.7Q207.9 92.9 210.1 91.1Q212.2 89.4 205.5 92.1Q198.8 94.9 214.6 85.3Q230.4 75.7 232.3 79.9ZM1011.2 194.1L1018.2 195.4L1018.3 195.9L1021.4 197.4Q1024.4 198.8 1019.4 200.9Q1014.4 203.0 1010.9 200.3Q1007.5 197.7 1009.7 196.2L1012.0 194.8L1011.2 194.1Z'],
		['bs', 'M500.9 311.8Q501.7 310.0 502.3 310.1Q503.0 310.2 503.5 312.6Q503.9 314.9 503.7 316.5Q503.4 318.1 502.9 318.3Q502.3 318.4 501.9 316.8Q501.6 315.2 500.8 314.4Q500.1 313.6 500.9 311.8Z'],
		['fk', 'M613.7 740.6Q612.3 739.4 614.3 737.8Q616.3 736.2 618.3 736.8Q620.2 737.5 621.2 736.4Q622.1 735.4 624.1 736.6Q626.2 737.8 625.8 738.7Q625.5 739.6 622.9 740.5Q620.4 741.2 619.1 740.3Q617.9 739.4 616.5 740.6Q615.1 741.8 613.7 740.6Z'],
		['no', 'M905.0 28.4Q911.9 28.3 921.9 29.8Q931.8 31.2 924.3 35.8Q916.9 40.3 907.4 34.4Q898.0 28.4 905.0 28.4ZM976.1 72.9L970.7 74.8L968.0 75.2L968.5 71.9L963.5 71.8Q958.5 71.7 956.7 74.4Q954.9 77.2 948.3 75.5L941.7 73.8L939.9 75.0L937.7 75.2L932.4 77.7Q927.0 80.2 920.6 89.8Q914.2 99.4 914.6 109.3Q915.0 119.2 912.7 122.4L910.5 125.6L907.6 122.5L903.9 125.4Q900.2 128.4 894.8 127.7Q889.4 127.0 887.8 118.4Q886.1 109.8 903.1 95.5Q920.0 81.2 935.7 73.6Q951.4 66.0 961.4 68.0L971.4 70.0L976.1 72.9ZM944.6 26.1Q947.7 26.8 946.0 27.9Q944.2 29.0 939.9 29.2Q935.7 29.4 931.2 29.1Q926.7 28.8 926.3 28.2Q925.9 27.7 923.7 27.6Q921.6 27.6 919.8 26.7Q917.9 25.8 922.3 25.3Q926.6 24.7 928.9 25.2Q931.2 25.7 932.4 25.1Q933.7 24.5 937.6 25.0Q941.5 25.5 944.6 26.1Z'],
		['gl', 'M738.1 19.0Q736.2 17.3 764.3 15.8Q792.5 14.2 800.7 15.6Q808.8 16.9 793.4 18.2Q778.1 19.4 805.0 20.8Q831.9 22.1 820.0 24.2Q808.1 26.4 811.5 26.5Q814.8 26.6 811.2 29.3Q807.5 32.1 808.4 35.7Q809.3 39.4 804.1 40.2Q798.9 41.0 801.5 42.1Q804.1 43.2 803.9 47.2Q803.7 51.2 796.2 53.4Q788.7 55.6 790.2 58.2Q791.6 60.7 787.5 60.4Q783.4 60.0 787.6 63.9Q791.8 67.7 785.8 66.0Q779.7 64.2 777.5 67.0Q775.3 69.8 782.3 70.0Q789.2 70.2 754.6 81.4Q720.0 92.6 708.9 105.9Q697.8 119.3 688.9 117.3Q680.1 115.4 675.2 102.4Q670.3 89.4 679.9 80.3Q689.4 71.2 682.3 71.9Q675.3 72.7 677.4 69.8Q679.6 67.0 684.4 67.6Q689.2 68.2 683.0 65.7Q676.8 63.1 680.0 61.0Q683.2 58.9 681.3 52.3Q679.4 45.8 664.5 44.6Q649.6 43.4 646.9 41.4Q644.2 39.3 652.1 38.5Q660.1 37.8 651.3 36.4Q642.6 35.0 665.6 27.6Q688.6 20.3 714.3 20.5Q740.0 20.7 738.1 19.0Z'],
		['tf', 'M1158.4 725.1Q1159.8 722.0 1162.8 723.2Q1165.8 724.4 1164.7 726.1Q1163.6 727.9 1160.3 728.1Q1157.0 728.2 1158.4 725.1Z'],
		['tl', 'M1466.9 500.9Q1466.7 500.4 1467.1 499.7Q1467.4 499.1 1469.5 498.5Q1471.7 497.8 1473.3 497.7Q1475.0 497.6 1475.8 497.3Q1476.6 496.9 1477.4 497.3Q1478.3 497.6 1477.4 498.4Q1476.4 499.1 1473.8 500.4Q1471.2 501.6 1469.1 502.4Q1467.0 503.2 1467.1 502.4Q1467.1 501.5 1466.9 500.9Z'],
		['za', 'M942.7 610.6L959.1 609.9L960.1 589.2L961.3 590.0L964.4 595.1Q967.6 600.2 971.7 596.1Q975.9 592.0 981.4 592.6Q986.8 593.2 992.7 585.8L998.6 578.3L1005.5 574.2L1007.4 574.2L1011.3 574.5L1013.8 575.1L1015.5 583.0L1015.3 593.2L1015.5 595.2L1013.2 594.2L1011.5 597.2Q1009.8 600.3 1012.5 601.5L1015.1 602.7L1016.3 600.2L1019.8 600.3L1018.3 604.4L1011.7 614.7Q1005.1 625.0 994.7 632.8Q984.3 640.7 970.2 643.1Q956.0 645.6 953.3 643.7Q950.6 641.8 948.1 629.8L945.7 617.9L942.7 610.6ZM997.9 617.4Q1001.0 612.7 996.3 615.3Q991.5 617.9 993.1 620.0Q994.7 622.2 997.9 617.4Z'],
		['ls', 'M996.3 615.3Q1001.0 612.7 997.9 617.4Q994.7 622.2 993.1 620.0Q991.5 617.9 996.3 615.3Z'],
		['mx', 'M331.4 268.9L337.0 268.4Q342.7 267.9 350.0 271.7Q357.2 275.6 367.9 274.4Q378.6 273.3 382.7 280.2Q386.7 287.2 393.7 286.9Q400.6 286.6 403.2 295.0Q405.7 303.5 409.8 304.9L413.9 306.3L411.1 311.2L408.9 318.4Q406.7 325.5 409.7 335.6Q412.7 345.8 415.9 347.7Q419.2 349.6 426.6 347.5Q434.0 345.5 437.6 339.6Q441.1 333.6 449.0 332.1Q456.8 330.6 453.2 339.0L449.5 347.5L448.5 347.6L444.1 350.6L444.0 351.5L439.6 351.4L436.1 353.0Q432.6 354.6 434.6 357.9Q436.5 361.2 433.4 361.2Q430.4 361.2 428.8 365.5L427.1 369.8L422.4 363.7L411.5 362.4Q400.6 361.0 385.4 352.0Q370.1 343.0 369.4 333.3Q368.7 323.7 362.8 315.8Q357.0 307.9 350.8 291.1Q344.6 274.3 342.7 273.7Q340.8 273.0 339.7 277.6Q338.5 282.2 346.0 301.3Q353.5 320.4 351.8 321.9Q350.0 323.4 346.1 318.0Q342.2 312.6 342.8 309.1Q343.4 305.5 338.2 300.7Q333.0 295.9 335.7 293.5Q338.4 291.2 335.0 282.6L331.6 273.9L331.4 268.9Z'],
		['uy', 'M601.5 619.8L604.4 619.2L612.5 624.6Q620.6 630.0 622.3 634.9L624.0 639.7L622.5 643.2L604.4 643.6L601.1 640.5L601.0 624.3L601.5 619.8Z'],
		['br', 'M624.0 639.7L622.3 634.9Q620.6 630.0 612.5 624.6L604.4 619.2L601.5 619.8L606.6 612.1L612.0 606.7Q617.4 601.3 615.9 597.4L614.3 593.6L612.1 594.6L612.6 591.4L608.6 583.5Q604.5 575.7 599.4 574.9Q594.3 574.2 594.1 570.4L593.9 566.6L592.2 563.5L593.5 562.3L591.7 552.0Q589.9 541.8 585.4 541.6Q580.8 541.5 579.5 534.6Q578.1 527.7 566.0 521.5Q553.9 515.3 553.8 510.3Q553.7 505.2 545.6 508.8L537.5 512.4L534.0 511.9L531.3 512.9L530.1 508.3Q528.9 503.7 524.9 505.3Q520.9 506.9 516.2 499.8Q511.6 492.8 514.0 486.5Q516.4 480.2 521.3 477.4L526.3 474.5L530.6 474.8L532.5 459.5L531.7 450.4Q530.8 441.3 536.3 440.4Q541.8 439.5 542.9 442.0L544.0 444.5L544.9 443.9L547.5 446.8L554.7 442.7Q561.8 438.6 558.4 433.4Q555.0 428.2 565.2 425.8L575.4 423.4L574.8 421.9L577.3 421.6L578.5 431.2Q579.8 440.9 586.6 440.7L593.5 440.4L594.7 440.2L597.3 440.7L601.7 436.8L604.4 438.0L606.5 439.1L609.3 439.1Q612.1 439.0 615.2 433.3L618.4 427.7L620.0 427.4L623.2 434.3Q626.3 441.2 625.3 446.2Q624.3 451.3 628.6 451.7Q632.8 452.1 632.9 454.9Q633.0 457.7 634.8 455.9Q636.6 454.1 643.7 456.8Q650.7 459.5 651.5 462.7Q652.3 465.8 663.4 466.3Q674.5 466.9 685.1 473.2Q695.8 479.5 697.9 485.6Q700.1 491.8 691.2 507.7Q682.2 523.6 678.2 548.5Q674.2 573.3 659.2 581.6Q644.2 589.9 642.4 600.5Q640.7 611.1 633.6 623.8L626.5 636.5L624.0 639.7Z'],
		['bo', 'M534.0 511.9L537.5 512.4L545.6 508.8Q553.7 505.2 553.8 510.3Q553.9 515.3 566.0 521.5Q578.1 527.7 579.5 534.6Q580.8 541.5 585.4 541.6Q589.9 541.8 591.7 552.0L593.5 562.3L592.2 563.5L591.9 561.7L583.3 561.1Q574.8 560.4 574.0 564.4L573.2 568.4L572.1 575.1L571.2 573.9L567.8 576.0Q564.5 578.1 559.7 575.4L554.9 572.7L551.6 577.8L548.3 578.6L539.4 552.7L536.6 548.9L539.1 542.9L538.7 520.9L534.0 511.9Z'],
		['pe', 'M530.6 474.8L526.3 474.5L521.3 477.4Q516.4 480.2 514.0 486.5Q511.6 492.8 516.2 499.8Q520.9 506.9 524.9 505.3Q528.9 503.7 530.1 508.3L531.3 512.9L534.0 511.9L538.7 520.9L539.1 542.9L536.6 548.9L535.6 551.8L533.4 553.2L528.3 550.0L516.4 541.3Q504.5 532.5 490.4 508.8Q476.3 485.0 476.5 479.2L476.7 473.3L480.4 469.8L480.2 472.7Q479.9 475.5 482.9 477.0Q485.9 478.5 495.3 467.2L504.6 455.9L503.9 451.7L505.2 451.2L510.2 457.4Q515.1 463.7 522.4 464.9Q529.7 466.0 528.9 468.9L528.2 471.8L530.6 474.8Z'],
		['co', 'M544.9 443.9L544.0 444.5L542.9 442.0Q541.8 439.5 536.3 440.4Q530.8 441.3 531.7 450.4L532.5 459.5L530.6 474.8L528.2 471.8L528.9 468.9Q529.7 466.0 522.4 464.9Q515.1 463.7 510.2 457.4L505.2 451.2L503.9 451.7L501.9 450.4L487.2 443.1L486.6 441.4L491.2 435.4Q495.8 429.4 495.2 421.5L494.6 413.6L492.8 410.6L495.7 402.5L498.2 402.7L503.2 395.9Q508.2 389.1 517.5 386.2L526.7 383.3L525.6 385.2L520.5 392.5Q515.3 399.8 518.2 405.8Q521.2 411.9 532.2 414.4Q543.2 416.9 543.3 427.6L543.5 438.3L544.9 443.9Z'],
		['pa', 'M495.7 402.5L492.8 410.6L491.2 409.0L489.3 404.8Q487.3 400.7 484.0 405.5Q480.6 410.3 474.9 408.1L469.1 405.8L468.6 405.0L471.1 397.5L472.7 399.5L494.0 401.0L495.7 402.5Z'],
		['cr', 'M471.1 397.5L468.6 405.0L466.1 403.8L455.3 390.1L456.5 389.0L466.3 389.9L467.3 392.9L469.0 395.1L471.1 397.5Z'],
		['ni', 'M466.3 389.9L456.5 389.0L455.0 387.3L449.3 378.8L449.7 378.4L470.7 367.2L470.2 367.7L465.6 388.9L466.3 389.9Z'],
		['hn', 'M470.7 367.2L449.7 378.4L449.1 376.7L447.6 376.2L442.1 370.9L440.8 370.4L441.9 369.0L446.9 363.1L447.4 363.3L469.6 365.7L470.7 367.2Z'],
		['sv', 'M440.8 370.4L442.1 370.9L447.6 376.2L447.0 377.5L438.1 375.4L436.8 374.2L439.6 370.7L440.8 370.4Z'],
		['gt', 'M427.1 369.8L428.8 365.5Q430.4 361.2 433.4 361.2Q436.5 361.2 434.6 357.9Q432.6 354.6 436.1 353.0L439.6 351.4L444.0 351.5L443.4 355.9L443.7 362.2L445.1 363.2L445.6 362.4L446.9 363.1L441.9 369.0L440.8 370.4L439.6 370.7L436.8 374.2L434.5 373.3L429.5 372.1L427.1 369.8Z'],
		['bz', 'M444.0 351.5L444.1 350.6L448.5 347.6L448.4 348.4L444.9 360.3L443.7 362.2L443.4 355.9L444.0 351.5Z'],
		['ve', 'M574.8 421.9L575.4 423.4L565.2 425.8Q555.0 428.2 558.4 433.4Q561.8 438.6 554.7 442.7L547.5 446.8L544.9 443.9L543.5 438.3L543.3 427.6Q543.2 416.9 532.2 414.4Q521.2 411.9 518.2 405.8Q515.3 399.8 520.5 392.5L525.6 385.2L525.4 386.5L524.2 393.4Q523.0 400.3 527.7 391.6Q532.4 383.0 536.3 387.5Q540.2 392.0 555.4 391.6Q570.5 391.1 569.2 393.2Q567.9 395.4 573.1 399.1L578.3 402.9L580.1 404.2L571.7 417.6L574.8 421.9Z'],
		['gy', 'M594.7 440.2L593.5 440.4L586.6 440.7Q579.8 440.9 578.5 431.2L577.3 421.6L574.8 421.9L571.7 417.6L580.1 404.2L583.2 406.2L590.4 415.6L592.2 417.6L589.9 422.9Q587.6 428.2 589.7 431.8L591.8 435.4L594.7 440.2Z'],
		['sr', 'M604.4 438.0L601.7 436.8L597.3 440.7L594.7 440.2L591.8 435.4L589.7 431.8Q587.6 428.2 589.9 422.9L592.2 417.6L597.9 418.7L602.4 417.3L607.5 418.8L605.7 435.6L604.4 438.0Z'],
		['fr', 'M893.1 175.1L895.2 176.5L898.3 177.0Q901.3 177.5 900.3 179.4L899.3 181.2L898.9 185.1L897.8 186.1L895.0 191.6L896.5 194.0L896.4 195.6L899.5 206.7L895.6 209.8L880.6 210.1L880.1 213.4L858.7 208.2L861.0 204.9L861.4 199.4Q861.9 193.9 854.7 186.6Q847.5 179.3 853.8 179.5Q860.1 179.6 859.5 176.5Q858.8 173.4 860.8 174.6Q862.8 175.8 868.3 171.4L873.9 167.1L877.5 166.1L887.2 172.3L891.0 174.8L891.9 175.2L893.1 175.1Z'],
		['guyane', 'M618.4 427.7L615.2 433.3Q612.1 439.0 609.3 439.1L606.5 439.1L604.4 438.0L605.7 435.6L607.5 418.8L609.1 419.4L617.6 425.4L618.4 427.7Z'],
		['ec', 'M503.9 451.7L504.6 455.9L495.3 467.2Q485.9 478.5 482.9 477.0Q479.9 475.5 480.2 472.7L480.4 469.8L482.9 465.6L480.0 464.5Q477.1 463.4 477.1 460.0Q477.2 456.7 480.5 451.0L483.9 445.4L487.2 443.1L501.9 450.4L503.9 451.7Z'],
		['pr', 'M550.9 347.5Q552.9 347.5 554.0 347.8Q555.2 348.0 555.6 348.6Q556.0 349.1 555.3 349.8Q554.6 350.5 552.8 350.5Q551.0 350.5 549.7 350.6Q548.3 350.7 548.2 349.5Q548.2 348.3 548.6 347.9Q549.0 347.5 550.9 347.5Z'],
		['jm', 'M498.7 349.4Q499.3 347.6 502.4 349.3Q505.4 351.0 501.7 351.1Q498.0 351.2 498.7 349.4Z'],
		['cu', 'M473.8 325.0Q480.8 321.3 489.7 323.2Q498.6 325.1 507.6 331.4Q516.6 337.6 508.0 338.8Q499.4 340.0 501.2 338.4Q502.9 336.9 499.5 333.6Q496.1 330.2 489.3 327.3Q482.5 324.4 474.7 326.5Q466.9 328.6 473.8 325.0Z'],
		['zw', 'M1013.8 575.1L1011.3 574.5L1007.4 574.2L1005.5 574.2L1002.6 571.6L988.6 554.3L986.9 549.8L992.2 550.4L1007.5 538.1L1011.2 537.3L1011.4 539.4L1017.3 541.8Q1023.2 544.1 1021.1 556.4L1019.1 568.7L1013.8 575.1Z'],
		['bw', 'M1005.5 574.2L998.6 578.3L992.7 585.8Q986.8 593.2 981.4 592.6Q975.9 592.0 971.7 596.1Q967.6 600.2 964.4 595.1L961.3 590.0L960.1 589.2L960.7 572.8L963.0 572.7Q965.3 572.6 965.7 562.7Q966.1 552.7 974.8 551.7L983.4 550.6L986.1 549.4L986.9 549.8L988.6 554.3L1002.6 571.6L1005.5 574.2Z'],
		['na', 'M960.1 589.2L959.1 609.9L942.7 610.6L939.4 606.3L936.8 590.3Q934.1 574.3 928.5 563.0L923.0 551.7L922.7 547.4L968.4 550.9L977.2 548.6L981.1 547.3L986.0 548.9L986.1 549.4L983.4 550.6L974.8 551.7Q966.1 552.7 965.7 562.7Q965.3 572.6 963.0 572.7L960.7 572.8L960.1 589.2Z'],
		['sn', 'M787.2 375.0L785.3 370.7L787.5 363.7L788.7 360.8L793.2 359.5Q797.7 358.2 801.8 361.9L805.9 365.5L809.0 369.3L809.1 372.8L812.2 379.7L811.9 381.5L811.2 381.8L803.8 380.7L801.5 380.7L792.7 380.4L787.2 381.8L786.5 377.5L793.7 376.5Q800.9 375.5 794.0 375.3L787.2 375.0Z'],
		['ml', 'M811.9 381.5L812.2 379.7L809.1 372.8L809.0 369.3L810.6 368.3L825.6 366.3Q840.6 364.4 838.7 337.9L836.8 311.4L844.0 311.3L859.7 323.6L882.0 344.5L887.2 343.9L887.3 356.8L885.8 360.4Q884.3 364.0 878.1 365.7L871.8 367.4L868.8 367.6L865.7 367.6L856.8 371.7Q847.9 375.7 844.3 382.7L840.8 389.8L841.1 393.0L839.1 393.9L829.1 393.4L828.5 393.9L827.1 392.3L825.2 387.3Q823.3 382.2 817.8 382.9L812.2 383.5L811.9 381.5Z'],
		['mr', 'M786.5 333.6L796.3 332.7Q806.0 331.8 808.6 318.9Q811.2 305.9 818.8 306.1L826.5 306.2L826.6 297.7L844.0 311.3L836.8 311.4L838.7 337.9Q840.6 364.4 825.6 366.3L810.6 368.3L809.0 369.3L805.9 365.5L801.8 361.9Q797.7 358.2 793.2 359.5L788.7 360.8L788.3 357.8L788.9 336.0L786.5 333.6Z'],
		['bj', 'M879.9 416.0L876.0 416.6L870.7 392.5L871.3 389.5L873.0 388.9L876.3 385.9L877.3 384.3L878.9 382.6L880.6 382.6L884.3 385.8L884.1 387.7L879.9 416.0Z'],
		['ne', 'M936.8 323.2L938.2 331.9L940.1 334.4Q942.1 337.0 940.8 347.6Q939.5 358.1 935.5 364.4Q931.6 370.7 934.2 373.6L936.7 376.5L936.3 379.1L934.9 379.4L934.8 381.2L933.9 381.4L931.7 378.2Q929.5 375.0 919.8 377.2Q910.1 379.3 901.5 376.4Q893.0 373.5 888.8 377.2L884.6 380.8L884.3 385.8L880.6 382.6L878.9 382.6L877.3 384.3L877.4 380.4L868.4 370.3L868.8 367.6L871.8 367.4L878.1 365.7Q884.3 364.0 885.8 360.4L887.3 356.8L887.2 343.9L893.9 341.4L907.4 330.4L923.3 319.8L930.8 322.2L933.5 325.2L936.8 323.2Z'],
		['ng', 'M879.9 416.0L884.1 387.7L884.3 385.8L884.6 380.8L888.8 377.2Q893.0 373.5 901.5 376.4Q910.1 379.3 919.8 377.2Q929.5 375.0 931.7 378.2L933.9 381.4L934.8 381.2L936.7 383.4L930.1 397.7Q923.5 411.9 917.4 413.4Q911.4 414.9 909.6 419.6L907.9 424.2L902.9 426.2L899.1 426.7Q895.4 427.1 889.8 421.5L884.2 416.0L879.9 416.0Z'],
		['cm', 'M936.3 379.1L938.2 382.7L939.7 388.9Q941.2 395.2 937.5 396.4Q933.9 397.6 937.5 402.8L941.1 408.0L940.4 409.5L938.0 415.1L937.4 419.8Q936.7 424.5 940.1 430.5L943.6 436.6L944.1 438.2L943.8 441.2L936.0 438.4L930.0 438.2L929.4 437.9L923.6 437.9L921.3 438.2L913.5 438.1L914.2 433.7L907.9 425.8L907.9 424.2L909.6 419.6Q911.4 414.9 917.4 413.4Q923.5 411.9 930.1 397.7L936.7 383.4L934.8 381.2L934.9 379.4L936.3 379.1Z'],
		['tg', 'M871.3 389.5L870.7 392.5L876.0 416.6L872.1 417.8L866.8 391.1L867.1 389.4L871.3 389.5Z'],
		['gh', 'M867.1 389.4L866.8 391.1L872.1 417.8L864.6 421.1L857.5 424.6L853.3 423.0L854.7 405.0L853.4 397.1L852.8 392.9L864.9 389.0L867.1 389.4Z'],
		['ci', 'M828.5 393.9L829.1 393.4L839.1 393.9L841.1 393.0L843.2 394.2L850.2 395.6L853.4 397.1L854.7 405.0L853.3 423.0L851.1 423.1L830.8 426.7L829.9 426.5L826.2 409.6L826.5 408.0L827.2 408.0L827.5 394.4L828.5 393.9Z'],
		['gn', 'M801.5 380.7L803.8 380.7L811.2 381.8L811.9 381.5L812.2 383.5L817.8 382.9Q823.3 382.2 825.2 387.3L827.1 392.3L828.5 393.9L827.5 394.4L827.2 408.0L826.5 408.0L825.1 407.9L818.9 403.9L817.9 404.0L816.6 404.3L815.1 399.6Q813.7 394.8 808.6 398.0L803.4 401.2L801.4 397.9L795.9 390.2L794.5 389.3L801.4 382.6L801.5 380.7Z'],
		['gw', 'M787.2 381.8L792.7 380.4L801.5 380.7L801.4 382.6L794.5 389.3L792.0 386.9L787.5 383.0L787.2 381.8Z'],
		['lr', 'M826.5 408.0L826.2 409.6L829.9 426.5L828.6 426.6L815.2 416.6L812.0 413.0L815.6 406.6L817.9 404.0L818.9 403.9L825.1 407.9L826.5 408.0Z'],
		['sl', 'M803.4 401.2L808.6 398.0Q813.7 394.8 815.1 399.6L816.6 404.3L817.9 404.0L815.6 406.6L812.0 413.0L810.7 412.6L804.0 405.3L803.4 401.2Z'],
		['bf', 'M841.1 393.0L840.8 389.8L844.3 382.7Q847.9 375.7 856.8 371.7L865.7 367.6L868.8 367.6L868.4 370.3L877.4 380.4L877.3 384.3L876.3 385.9L873.0 388.9L871.3 389.5L867.1 389.4L864.9 389.0L852.8 392.9L853.4 397.1L850.2 395.6L843.2 394.2L841.1 393.0Z'],
		['cf', 'M998.7 421.7L997.1 422.3L986.0 425.3Q974.8 428.4 967.8 425.6Q960.7 422.8 958.5 425.1L956.2 427.4L955.8 431.3L952.7 431.0L946.6 433.0L944.1 438.2L943.6 436.6L940.1 430.5Q936.7 424.5 937.4 419.8L938.0 415.1L940.4 409.5L944.4 409.1L956.1 403.5Q967.7 398.0 970.6 393.8L973.5 389.7L976.5 388.7L977.1 391.1L981.3 402.5L985.0 405.0L987.6 407.2L997.9 419.9L998.7 421.7Z'],
		['cg', 'M955.8 431.3L955.6 434.7L949.8 452.6Q944.0 470.5 940.6 474.5Q937.2 478.5 933.3 478.0L929.5 477.5L927.7 475.6L924.3 478.9L920.4 473.0L924.0 467.4Q927.6 461.7 931.7 461.8Q935.9 462.0 935.8 453.1Q935.8 444.2 932.7 442.4L929.6 440.6L930.0 438.2L936.0 438.4L943.8 441.2L944.1 438.2L946.6 433.0L952.7 431.0L955.8 431.3Z'],
		['ga', 'M921.3 438.2L923.6 437.9L929.4 437.9L930.0 438.2L929.6 440.6L932.7 442.4Q935.8 444.2 935.8 453.1Q935.9 462.0 931.7 461.8Q927.6 461.7 924.0 467.4L920.4 473.0L915.5 467.4L912.4 462.2Q909.4 457.0 910.6 453.2L911.8 449.3L912.7 445.2L921.4 444.9L921.3 438.2Z'],
		['gq', 'M913.5 438.1L921.3 438.2L921.4 444.9L912.7 445.2L911.8 444.4L913.5 438.1Z'],
		['zm', 'M1014.6 497.3L1016.6 498.7L1021.5 500.6L1024.2 502.3L1026.4 504.8L1023.1 527.3L1025.5 528.8L1010.9 533.4L1011.2 537.3L1007.5 538.1L992.2 550.4L986.9 549.8L986.1 549.4L986.0 548.9L981.1 547.3L977.2 548.6L974.2 545.1L973.0 533.9Q971.8 522.8 976.8 522.8Q981.8 522.8 981.9 518.2L982.0 513.5L981.5 511.8L983.2 511.9L996.0 518.3Q1008.9 524.8 1005.8 520.7Q1002.8 516.6 1003.1 509.3Q1003.5 501.9 1008.1 499.3L1012.7 496.8L1014.6 497.3Z'],
		['mw', 'M1024.2 502.3L1028.8 503.3L1031.3 507.5L1032.4 515.1L1031.0 519.3L1034.1 529.4Q1037.3 539.5 1035.4 542.0Q1033.5 544.6 1030.8 538.0L1028.2 531.4L1025.5 528.8L1023.1 527.3L1026.4 504.8L1024.2 502.3Z'],
		['mz', 'M1032.4 515.1L1036.1 514.6L1060.2 508.4L1060.9 510.9L1060.4 523.8Q1059.8 536.8 1045.7 549.0Q1031.5 561.3 1032.7 572.2Q1034.0 583.2 1027.2 590.3L1020.4 597.3L1019.8 600.3L1016.3 600.2L1016.0 597.7L1015.5 595.2L1015.3 593.2L1015.5 583.0L1013.8 575.1L1019.1 568.7L1021.1 556.4Q1023.2 544.1 1017.3 541.8L1011.4 539.4L1011.2 537.3L1010.9 533.4L1025.5 528.8L1028.2 531.4L1030.8 538.0Q1033.5 544.6 1035.4 542.0Q1037.3 539.5 1034.1 529.4L1031.0 519.3L1032.4 515.1Z'],
		['sz', 'M1016.3 600.2L1015.1 602.7L1012.5 601.5Q1009.8 600.3 1011.5 597.2L1013.2 594.2L1015.5 595.2L1016.0 597.7L1016.3 600.2Z'],
		['ao', 'M926.2 484.8L935.9 484.2Q945.5 483.6 948.2 489.7Q950.9 495.8 957.2 492.7Q963.6 489.5 967.5 490.5Q971.4 491.5 972.3 502.1Q973.1 512.6 976.2 512.0L979.4 511.4L981.5 511.8L982.0 513.5L981.9 518.2Q981.8 522.8 976.8 522.8Q971.8 522.8 973.0 533.9L974.2 545.1L977.2 548.6L968.4 550.9L922.7 547.4L922.3 543.9L927.6 528.8Q932.8 513.8 929.3 499.9L925.8 485.9L926.2 484.8Z'],
		['bi', 'M1013.7 464.3L1014.0 466.5L1010.2 475.6L1008.2 475.9L1007.9 469.2L1006.8 466.7L1009.7 467.1L1011.2 463.9L1013.7 464.3Z'],
		['il', 'M1030.3 267.9L1029.6 269.7L1027.9 268.9L1027.4 275.5L1029.4 274.8L1029.8 276.9L1028.3 285.9L1027.7 284.5L1024.4 276.3L1025.5 274.4L1027.2 265.8L1027.3 265.8L1029.2 264.8L1030.4 264.7L1030.7 267.0L1030.2 267.9L1030.3 267.9Z'],
		['lb', 'M1030.4 264.7L1029.2 264.8L1027.3 265.8L1028.5 261.2L1030.3 257.3L1030.4 257.1L1031.2 261.7L1030.4 264.7Z'],
		['mg', 'M1089.8 534.2Q1103.9 520.4 1105.4 529.4Q1106.9 538.5 1097.0 564.3Q1087.2 590.2 1083.1 592.0Q1079.0 593.9 1075.9 592.1Q1072.9 590.4 1071.8 584.2Q1070.7 578.0 1073.2 563.0Q1075.8 548.0 1089.8 534.2Z'],
		['ps', 'M1029.4 274.8L1027.4 275.5L1027.9 268.9L1029.6 269.7L1030.0 273.1L1029.4 274.8Z'],
		['gm', 'M786.9 376.3Q787.2 375.0 789.8 374.9Q792.4 374.9 792.9 374.2Q793.5 373.5 794.2 373.5Q795.0 373.4 795.9 374.1Q796.9 374.8 797.6 374.8Q798.4 374.9 799.1 374.4Q799.9 373.9 800.4 374.7Q800.9 375.5 799.8 376.2Q798.8 376.8 797.8 376.7Q796.7 376.7 795.7 376.1Q794.7 375.5 793.8 376.1Q792.9 376.8 792.5 376.8Q792.0 376.8 791.5 377.2Q790.9 377.6 788.7 377.6Q786.5 377.5 786.9 376.3Z'],
		['tn', 'M910.7 281.4L908.5 271.3L905.1 267.8Q901.7 264.4 903.3 254.3L904.9 244.2L909.7 241.9L913.2 242.7Q916.6 243.4 914.9 251.1Q913.1 258.8 915.4 261.7L917.7 264.6L919.4 265.5L912.9 280.1L910.7 281.4Z'],
		['dz', 'M826.6 297.7L826.8 296.6L826.8 296.3L826.9 289.6L843.9 280.0Q861.0 270.4 859.1 262.3L857.2 254.1L861.5 251.1L901.8 244.5L904.9 244.2L903.3 254.3Q901.7 264.4 905.1 267.8L908.5 271.3L910.7 281.4L912.3 286.4L911.4 295.7Q910.5 305.0 915.8 310.6L921.2 316.2L923.3 319.8L907.4 330.4L893.9 341.4L887.2 343.9L882.0 344.5L859.7 323.6L844.0 311.3L826.6 297.7Z'],
		['jo', 'M1029.6 269.7L1030.3 267.9L1035.6 270.1L1043.9 264.2L1046.5 271.0L1045.7 271.8L1041.2 273.2Q1036.8 274.6 1038.4 278.9Q1039.9 283.1 1034.2 284.9L1028.5 286.7L1028.3 285.9L1029.8 276.9L1029.4 274.8L1030.0 273.1L1029.6 269.7Z'],
		['ae', 'M1108.6 315.4L1109.4 315.1L1114.7 315.6Q1120.0 316.1 1124.8 311.6L1129.5 307.2L1130.7 311.6L1126.4 321.8L1126.5 324.0L1125.7 325.2L1118.5 323.8Q1111.2 322.4 1109.9 318.9L1108.6 315.4Z'],
		['qa', 'M1104.7 312.6L1103.9 308.5L1105.0 306.7Q1106.1 304.9 1107.1 307.5L1108.1 310.0L1107.5 313.3L1104.7 312.6Z'],
		['kw', 'M1088.2 283.3L1089.5 285.7L1089.2 287.0L1091.2 291.2L1086.5 288.7L1082.3 288.2L1085.1 282.8L1088.2 283.3Z'],
		['iq', 'M1046.5 271.0L1043.9 264.2L1053.3 258.3L1055.5 246.1L1057.3 242.6L1059.2 241.7L1066.3 243.9L1068.3 242.9L1072.2 249.6L1072.9 255.2Q1073.7 260.9 1082.3 272.2L1091.0 283.5L1088.2 283.3L1085.1 282.8L1082.3 288.2L1073.7 287.7L1052.2 272.5L1046.5 271.0Z'],
		['om', 'M1126.5 324.0L1126.4 321.8L1130.7 311.6L1133.2 315.4L1140.8 320.8Q1148.3 326.3 1144.3 335.7Q1140.2 345.1 1131.0 351.4L1121.7 357.6L1119.5 357.9L1117.7 354.0L1113.2 344.8L1127.0 339.2L1129.0 328.0L1126.5 324.0Z'],
		['vu', 'M1661.7 538.1Q1661.2 538.2 1661.0 537.5Q1660.8 536.7 1661.2 534.6Q1661.6 532.4 1662.6 533.3Q1663.5 534.1 1663.5 536.4Q1663.4 538.6 1662.8 538.3Q1662.3 537.9 1661.7 538.1Z'],
		['kh', 'M1357.7 382.9L1356.8 379.5Q1355.9 376.1 1360.2 373.3L1364.4 370.4L1369.0 371.2L1373.2 373.4L1374.9 369.6L1379.4 371.6L1380.9 375.4L1378.4 382.5Q1375.9 389.7 1371.5 391.1L1367.0 392.4L1362.9 391.6L1360.7 388.6L1357.7 382.9Z'],
		['th', 'M1369.0 371.2L1364.4 370.4L1360.2 373.3Q1355.9 376.1 1356.8 379.5L1357.7 382.9L1353.2 380.3L1349.1 378.2Q1345.1 376.1 1343.8 385.7Q1342.4 395.3 1348.9 404.3L1355.5 413.3L1358.1 416.2L1355.8 417.6Q1353.5 419.1 1350.8 417.0L1348.2 414.8L1346.1 412.7L1338.5 400.8L1339.5 395.5L1341.5 390.0Q1343.5 384.5 1339.2 375.5Q1334.9 366.5 1336.3 363.5Q1337.6 360.6 1333.1 354.2Q1328.6 347.9 1333.0 343.0L1337.3 338.2L1339.8 336.9L1342.2 338.6L1344.5 345.9Q1346.8 353.1 1353.4 351.1Q1360.0 349.1 1365.1 358.9L1370.2 368.7L1369.0 371.2Z'],
		['la', 'M1379.4 371.6L1374.9 369.6L1373.2 373.4L1369.0 371.2L1370.2 368.7L1365.1 358.9Q1360.0 349.1 1353.4 351.1Q1346.8 353.1 1344.5 345.9L1342.2 338.6L1339.8 336.9L1340.5 334.8L1343.9 331.2L1344.5 332.5L1345.2 326.2L1347.5 325.4L1351.0 329.8L1355.5 332.4Q1359.9 334.9 1359.3 339.1Q1358.8 343.3 1369.1 354.7L1379.5 366.0L1379.4 371.6Z'],
		['mm', 'M1339.8 336.9L1337.3 338.2L1333.0 343.0Q1328.6 347.9 1333.1 354.2Q1337.6 360.6 1336.3 363.5Q1334.9 366.5 1339.2 375.5Q1343.5 384.5 1341.5 390.0L1339.5 395.5L1338.7 391.3L1333.7 373.9Q1328.8 356.4 1324.9 359.8Q1321.1 363.2 1318.2 362.3Q1315.2 361.4 1311.2 350.7L1307.1 340.0L1303.0 335.4L1303.8 331.8L1303.2 327.8L1305.3 326.4L1307.6 314.4Q1309.9 302.4 1314.4 298.7L1318.9 295.0L1318.1 292.9L1320.7 292.5L1323.9 299.2Q1327.2 306.0 1325.9 311.7Q1324.5 317.4 1326.9 316.9Q1329.3 316.4 1331.7 321.9Q1334.0 327.3 1338.7 328.1L1343.3 328.8L1343.9 331.2L1340.5 334.8L1339.8 336.9Z'],
		['vn', 'M1367.0 392.4L1371.5 391.1Q1375.9 389.7 1378.4 382.5L1380.9 375.4L1379.4 371.6L1379.5 366.0L1369.1 354.7Q1358.8 343.3 1359.3 339.1Q1359.9 334.9 1355.5 332.4L1351.0 329.8L1347.5 325.4L1349.7 324.0L1355.5 322.2Q1361.3 320.4 1368.7 325.5L1376.1 330.5L1370.7 335.3L1369.0 339.9Q1367.3 344.5 1376.5 355.1Q1385.7 365.6 1387.7 375.7Q1389.7 385.8 1380.7 394.3Q1371.8 402.9 1371.3 399.2L1370.8 395.6L1367.0 392.4Z'],
		['kp', 'M1440.9 213.8L1442.0 214.8L1440.2 214.5L1440.5 218.4Q1440.9 222.2 1437.5 225.4Q1434.1 228.5 1435.6 230.5L1437.0 232.4L1440.6 234.9L1432.9 239.7L1430.3 238.6L1421.9 229.0L1419.2 227.6L1436.5 210.6L1440.9 213.8Z'],
		['kr', 'M1432.9 239.7L1440.6 234.9L1447.3 241.5L1449.9 246.5Q1452.5 251.5 1449.1 254.8Q1445.6 258.0 1443.7 258.2Q1441.7 258.5 1439.8 251.5L1438.0 244.5L1432.9 239.7Z'],
		['mn', 'M1238.3 176.0L1242.3 175.1L1247.9 171.5Q1253.5 167.9 1265.5 170.8Q1277.4 173.7 1277.7 167.5Q1277.9 161.2 1302.0 168.7Q1326.0 176.1 1340.0 174.7L1354.1 173.3L1358.8 172.8L1359.1 176.9L1360.2 180.7Q1361.3 184.6 1365.8 183.6Q1370.2 182.7 1375.7 186.4Q1381.1 190.2 1376.3 190.2Q1371.5 190.3 1365.5 195.4Q1359.5 200.5 1355.6 199.7Q1351.8 198.9 1353.4 202.7Q1355.0 206.4 1353.0 208.8Q1350.9 211.2 1340.4 214.7Q1329.9 218.3 1309.7 215.1Q1289.6 212.0 1285.7 207.8Q1281.9 203.7 1271.3 200.8Q1260.7 197.9 1256.7 191.3Q1252.6 184.7 1246.8 182.3L1241.0 179.8L1238.3 176.0Z'],
		['in', 'M1318.1 292.9L1318.9 295.0L1314.4 298.7Q1309.9 302.4 1307.6 314.4L1305.3 326.4L1303.2 327.8L1299.2 318.9L1296.9 319.2Q1294.7 319.6 1296.8 315.4Q1298.9 311.3 1289.2 307.2Q1279.5 303.1 1282.8 315.4L1286.1 327.7L1285.7 329.7L1281.3 330.3Q1276.9 330.8 1276.3 334.6Q1275.7 338.4 1262.5 350.2Q1249.3 362.1 1249.5 377.6Q1249.7 393.1 1244.6 399.8Q1239.4 406.4 1228.2 384.0Q1217.0 361.6 1213.2 346.6Q1209.4 331.6 1204.4 333.0Q1199.5 334.3 1196.2 328.8L1192.8 323.3L1186.7 318.5L1193.2 316.7Q1199.6 314.8 1195.0 307.5Q1190.3 300.3 1195.2 297.6Q1200.0 294.8 1205.7 282.6Q1211.5 270.4 1206.8 264.6Q1202.2 258.9 1209.1 258.0L1215.9 257.0L1219.2 252.3L1225.6 258.9L1225.7 263.7Q1225.7 268.4 1229.6 273.3L1233.6 278.2L1240.8 282.1L1238.4 284.6L1238.0 287.3Q1237.6 289.9 1250.7 295.7Q1263.8 301.5 1270.5 302.4Q1277.2 303.2 1276.6 300.4L1276.0 297.5L1275.8 295.0L1278.4 293.9L1279.7 298.3L1280.0 299.4L1294.8 297.4L1292.6 295.6L1296.2 294.9L1300.1 291.1Q1304.0 287.2 1307.4 286.7Q1310.9 286.2 1311.9 289.1L1312.9 292.0L1318.1 292.9Z'],
		['bd', 'M1303.2 327.8L1303.8 331.8L1303.0 335.4L1301.2 332.5L1298.9 328.1Q1296.6 323.7 1292.3 325.9L1288.0 328.2L1286.1 327.7L1282.8 315.4Q1279.5 303.1 1289.2 307.2Q1298.9 311.3 1296.8 315.4Q1294.7 319.6 1296.9 319.2L1299.2 318.9L1303.2 327.8Z'],
		['bt', 'M1292.6 295.6L1294.8 297.4L1280.0 299.4L1279.7 298.3L1281.9 294.1L1290.2 294.1L1292.6 295.6Z'],
		['np', 'M1275.8 295.0L1276.0 297.5L1276.6 300.4Q1277.2 303.2 1270.5 302.4Q1263.8 301.5 1250.7 295.7Q1237.6 289.9 1238.0 287.3L1238.4 284.6L1240.8 282.1L1242.4 280.8L1270.3 294.5L1275.8 295.0Z'],
		['pk', 'M1219.2 252.3L1215.9 257.0L1209.1 258.0Q1202.2 258.9 1206.8 264.6Q1211.5 270.4 1205.7 282.6Q1200.0 294.8 1195.2 297.6Q1190.3 300.3 1195.0 307.5Q1199.6 314.8 1193.2 316.7L1186.7 318.5L1183.1 317.1L1180.0 312.9Q1177.0 308.8 1168.9 309.4L1160.9 309.9L1154.4 310.7L1158.1 306.0Q1161.7 301.3 1156.1 294.2L1150.5 287.0L1147.8 284.1L1156.0 286.9L1164.5 285.3Q1173.0 283.8 1173.7 279.8Q1174.4 275.8 1179.5 274.1Q1184.7 272.4 1184.9 266.5Q1185.2 260.6 1188.3 257.4Q1191.5 254.2 1190.1 251.6Q1188.8 249.1 1195.6 246.4L1202.5 243.8L1204.9 243.1L1208.9 245.8L1211.2 250.1L1219.2 252.3Z'],
		['af', 'M1165.8 241.9L1168.3 241.9L1172.0 243.1L1173.5 243.8L1178.5 239.7Q1183.6 235.6 1187.1 240.5Q1190.5 245.3 1194.8 243.4L1199.1 241.5L1203.7 241.5L1204.9 243.1L1202.5 243.8L1195.6 246.4Q1188.8 249.1 1190.1 251.6Q1191.5 254.2 1188.3 257.4Q1185.2 260.6 1184.9 266.5Q1184.7 272.4 1179.5 274.1Q1174.4 275.8 1173.7 279.8Q1173.0 283.8 1164.5 285.3L1156.0 286.9L1147.8 284.1L1151.2 279.0L1143.2 258.4L1143.8 251.4L1148.8 253.6L1164.4 241.7L1165.8 241.9Z'],
		['tj', 'M1172.0 243.1L1173.2 237.4L1170.8 233.4Q1168.3 229.5 1171.1 226.3Q1174.0 223.1 1177.1 224.5L1180.3 225.9L1182.1 225.8L1180.9 227.5L1178.6 228.6Q1176.2 229.8 1181.6 230.5L1186.9 231.2L1195.1 230.3L1197.5 235.5L1202.3 238.3L1203.7 241.5L1199.1 241.5L1194.8 243.4Q1190.5 245.3 1187.1 240.5Q1183.6 235.6 1178.5 239.7L1173.5 243.8L1172.0 243.1Z'],
		['kg', 'M1179.0 214.6L1179.3 212.1L1184.5 212.7Q1189.7 213.3 1190.6 211.1Q1191.6 208.8 1204.2 211.1L1216.7 213.3L1219.7 214.1L1219.4 215.3L1196.0 229.0L1195.1 230.3L1186.9 231.2L1181.6 230.5Q1176.2 229.8 1178.6 228.6L1180.9 227.5L1182.1 225.8L1185.6 226.3L1187.9 224.3Q1190.3 222.3 1184.0 220.5Q1177.7 218.7 1179.0 216.9L1180.4 215.1L1179.0 214.6Z'],
		['tm', 'M1098.3 217.2L1101.5 215.7Q1104.7 214.2 1108.3 217.2L1111.9 220.1L1114.2 219.9L1119.1 219.8L1121.6 215.8Q1124.1 211.9 1144.7 225.2L1165.2 238.4L1165.8 241.9L1164.4 241.7L1148.8 253.6L1143.8 251.4L1142.5 246.7L1131.5 242.2Q1120.5 237.6 1115.0 240.2L1109.4 242.8L1107.8 238.8L1104.5 230.5Q1101.1 222.3 1105.1 222.1Q1109.1 221.9 1106.2 218.6Q1103.3 215.4 1101.9 218.1L1100.4 220.8L1098.3 217.2Z'],
		['ir', 'M1091.0 283.5L1082.3 272.2Q1073.7 260.9 1072.9 255.2L1072.2 249.6L1068.3 242.9L1065.2 238.5L1063.4 230.3L1066.2 228.8L1067.3 230.8L1069.9 233.4L1073.1 234.2L1074.7 234.0L1079.3 229.9L1085.7 236.5L1087.8 240.6L1109.2 244.1L1109.4 242.8L1115.0 240.2Q1120.5 237.6 1131.5 242.2L1142.5 246.7L1143.8 251.4L1143.2 258.4L1151.2 279.0L1147.8 284.1L1150.5 287.0L1156.1 294.2Q1161.7 301.3 1158.1 306.0L1154.4 310.7L1145.4 309.1L1140.1 308.0Q1134.8 307.0 1132.2 303.1Q1129.6 299.1 1122.8 300.1Q1115.9 301.0 1104.2 291.2L1092.4 281.3L1091.0 283.5Z'],
		['sy', 'M1030.3 267.9L1030.2 267.9L1030.7 267.0L1030.4 264.7L1031.2 261.7L1030.4 257.1L1029.5 252.8L1030.4 250.5L1031.4 247.7Q1032.4 244.9 1042.4 244.2L1052.3 243.5L1057.3 242.6L1055.5 246.1L1053.3 258.3L1043.9 264.2L1035.6 270.1L1030.3 267.9Z'],
		['am', 'M1074.7 234.0L1073.1 234.2L1070.8 230.9L1067.1 228.6L1066.2 228.8L1064.2 227.1L1060.7 223.0L1059.7 221.1L1065.7 220.2L1066.8 221.7L1074.0 230.1L1074.7 234.0Z'],
		['se', 'M910.5 125.6L912.7 122.4Q915.0 119.2 914.6 109.3Q914.2 99.4 920.6 89.8Q927.0 80.2 932.4 77.7L937.7 75.2L939.9 75.0L945.1 77.3L954.7 89.9L948.7 91.3L941.8 98.6Q934.9 105.9 933.9 109.4Q933.0 113.0 936.6 116.2Q940.3 119.3 935.7 129.6Q931.1 139.8 925.3 141.8Q919.5 143.7 916.8 138.3L914.1 132.9L910.5 125.6Z'],
		['by', 'M980.6 139.5L985.1 140.8L993.4 147.5Q1001.7 154.3 999.6 155.9L997.5 157.5L999.1 160.9L995.6 161.3L995.1 163.2Q994.6 165.1 980.8 164.3L967.1 163.5L965.1 163.8L964.7 161.4L963.8 153.7L963.4 151.3L967.3 151.4L975.1 144.7L974.3 142.4L976.6 141.5L980.6 139.5Z'],
		['ua', 'M999.1 160.9L1000.7 161.2L1003.8 160.4Q1007.0 159.7 1011.2 164.4Q1015.4 169.1 1025.8 171.8Q1036.2 174.4 1036.4 179.0Q1036.5 183.6 1033.7 185.8L1030.8 188.0L1027.5 188.4L1017.5 192.5L1018.2 195.4L1011.2 194.1L1010.5 193.5L1006.8 191.8Q1003.1 190.1 1000.5 192.0L998.0 193.8L995.1 197.9L991.1 197.8L989.1 196.8L990.1 196.2L992.8 193.2Q995.5 190.3 988.4 185.7L981.3 181.1L980.4 181.9L978.6 181.9L965.6 182.5L963.9 183.7L963.5 182.2L960.9 180.8L961.5 178.6L962.6 177.2L963.5 177.5L967.8 168.4L965.1 163.8L967.1 163.5L980.8 164.3Q994.6 165.1 995.1 163.2L995.6 161.3L999.1 160.9Z'],
		['pl', 'M963.4 151.3L963.8 153.7L964.7 161.4L965.1 163.8L967.8 168.4L963.5 177.5L962.6 177.2L958.3 175.1L946.9 175.3L946.7 174.9L944.5 172.3L931.9 168.0L929.8 166.3L927.8 162.9L925.0 152.2L927.7 150.6L943.4 148.6L947.4 148.6L952.5 149.2L960.0 149.1L962.1 149.7L963.4 151.3Z'],
		['at', 'M939.4 182.4L939.2 184.6L937.7 185.8L936.5 189.3L935.8 190.2L930.0 191.6L926.4 191.2L920.1 189.8L914.5 189.9L911.8 189.1L909.6 188.9L908.2 186.6L908.0 185.7L909.3 185.3L915.8 185.7Q922.3 186.0 922.8 183.4L923.3 180.8L924.7 178.3L927.9 180.1L937.0 178.8L939.1 179.8L938.8 180.5L939.4 182.4Z'],
		['hu', 'M960.9 180.8L963.5 182.2L963.9 183.7L961.4 184.8L957.5 192.2L954.1 193.3L951.4 193.0L948.2 194.5L946.7 195.3L939.6 191.9L938.2 191.2L937.3 189.4L936.5 189.3L937.7 185.8L939.2 184.6L939.4 182.4L941.6 183.8L960.1 181.3L960.9 180.8Z'],
		['md', 'M980.4 181.9L981.3 181.1L988.4 185.7Q995.5 190.3 992.8 193.2L990.1 196.2L989.1 196.8L988.0 194.3L981.7 182.4L980.4 181.9Z'],
		['ro', 'M989.1 196.8L991.1 197.8L995.1 197.9L995.4 199.3L992.1 199.9L991.6 206.6L967.1 205.9L965.6 203.7L964.7 202.7L956.7 195.4L954.1 193.3L957.5 192.2L961.4 184.8L963.9 183.7L965.6 182.5L978.6 181.9L980.4 181.9L981.7 182.4L988.0 194.3L989.1 196.8Z'],
		['lt', 'M974.3 142.4L975.1 144.7L967.3 151.4L963.4 151.3L962.1 149.7L960.0 149.1L959.5 147.8L953.4 144.6L952.0 140.2L970.0 139.8L974.3 142.4Z'],
		['lv', 'M975.9 132.7L978.0 133.9L978.8 136.4L980.6 139.5L976.6 141.5L974.3 142.4L970.0 139.8L952.0 140.2L951.6 136.3L954.2 133.8Q956.7 131.3 960.1 133.1L963.6 135.0L963.8 131.1L972.6 132.7L975.9 132.7Z'],
		['ee', 'M977.3 131.1L975.9 132.7L972.6 132.7L963.8 131.1L963.8 128.0L961.3 126.0Q958.8 123.9 965.8 123.2L972.7 122.6L976.8 122.4L977.3 131.1Z'],
		['de', 'M925.0 152.2L927.8 162.9L929.8 166.3L928.0 166.8L923.2 168.8Q918.5 170.8 920.3 173.4L922.1 176.0L924.7 178.3L923.3 180.8L922.8 183.4Q922.3 186.0 915.8 185.7L909.3 185.3L908.0 185.7L903.4 184.0L902.5 185.2L898.9 185.1L899.3 181.2L900.3 179.4Q901.3 177.5 898.3 177.0L895.2 176.5L893.1 175.1L893.3 172.8L892.4 171.5L892.8 167.9L891.9 162.3L895.4 153.6L896.2 152.5L902.0 148.8L901.7 145.8L907.4 145.7L907.6 147.7L922.9 150.5L925.0 152.2Z'],
		['bg', 'M965.6 203.7L967.1 205.9L991.6 206.6L989.6 208.9L988.5 212.8L990.2 216.0L986.4 215.2L982.0 217.0L982.3 219.8L971.6 219.9L968.3 219.7L967.7 216.0L965.4 214.3L966.0 213.5L964.7 204.9L965.6 203.7Z'],
		['gr', 'M968.3 219.7L971.6 219.9L982.3 219.8L982.0 217.0L984.3 218.5L982.3 222.6L979.6 222.4L973.5 224.1Q967.4 225.7 971.0 231.4Q974.5 237.1 973.0 242.1Q971.4 247.1 968.0 245.9Q964.5 244.8 960.8 237.8L957.1 230.8L956.7 229.2L960.0 223.9L960.0 222.5L962.9 222.0L967.5 219.9L968.3 219.7Z'],
		['tr', 'M1066.3 243.9L1059.2 241.7L1057.3 242.6L1052.3 243.5L1042.4 244.2Q1032.4 244.9 1031.4 247.7L1030.4 250.5L1028.4 247.9L1010.0 246.9Q991.5 245.8 987.5 238.0Q983.5 230.1 989.8 225.2Q996.2 220.4 1005.3 218.2Q1014.5 215.9 1030.0 218.7L1045.5 221.5L1050.3 218.6L1055.0 218.3L1059.7 221.1L1060.7 223.0L1064.2 227.1L1066.2 228.8L1063.4 230.3L1065.2 238.5L1068.3 242.9L1066.3 243.9ZM982.0 217.0L986.4 215.2L990.2 216.0L991.0 218.1L992.7 219.7Q994.4 221.3 988.4 222.5L982.4 223.7L982.3 222.6L984.3 218.5L982.0 217.0Z'],
		['al', 'M960.0 222.5L960.0 223.9L956.7 229.2L955.9 228.8L953.1 217.6L952.3 216.7L954.0 213.3L955.1 212.8L956.1 214.3L957.2 214.8L957.7 216.8L957.3 218.7L958.1 221.1L960.0 222.5Z'],
		['hr', 'M938.2 191.2L939.6 191.9L946.7 195.3L948.2 194.5L949.5 196.6L951.0 198.2L949.5 200.2L947.4 199.0L941.4 199.8Q935.4 200.5 939.9 205.4L944.4 210.3L948.4 212.4L948.0 213.4L943.8 211.3L926.2 196.8L926.3 196.7L934.9 192.7L938.2 191.2Z'],
		['ch', 'M908.0 185.7L908.2 186.6L909.6 188.9L911.8 189.1L911.6 191.3L898.4 195.2L896.5 194.0L895.0 191.6L897.8 186.1L898.9 185.1L902.5 185.2L903.4 184.0L908.0 185.7Z'],
		['lu', 'M892.4 171.5L893.3 172.8L893.1 175.1L891.9 175.2L891.0 174.8L891.3 171.7L892.4 171.5Z'],
		['be', 'M892.8 167.9L892.4 171.5L891.3 171.7L891.0 174.8L887.2 172.3L877.5 166.1L880.8 165.0L890.5 166.7L892.8 167.9Z'],
		['nl', 'M895.4 153.6L891.9 162.3L892.8 167.9L890.5 166.7L880.8 165.0L883.0 163.5L892.0 153.5L895.4 153.6Z'],
		['pt', 'M827.2 216.7L833.0 218.1Q838.8 219.5 836.1 231.4L833.5 243.3L831.6 244.8L829.3 244.7Q827.0 244.6 825.7 239.4Q824.5 234.2 825.9 226.4L827.3 218.6L827.2 216.7Z'],
		['es', 'M833.5 243.3L836.1 231.4Q838.8 219.5 833.0 218.1L827.2 216.7L827.6 212.8L829.9 209.6Q832.2 206.4 841.9 207.2L851.6 208.0L858.7 208.2L880.1 213.4L880.4 216.6L875.5 219.1Q870.6 221.5 864.0 233.6Q857.3 245.7 850.0 247.7Q842.7 249.8 840.2 247.0L837.7 244.2L833.5 243.3Z'],
		['ie', 'M838.8 151.1Q841.6 151.6 840.2 155.8Q838.8 160.1 832.1 161.3Q825.5 162.4 826.4 157.0Q827.2 151.5 831.7 148.2Q836.2 144.9 836.1 147.7Q836.0 150.6 838.8 151.1Z'],
		['nc', 'M1645.5 565.8Q1648.9 568.5 1651.2 571.5Q1653.4 574.6 1651.3 574.5Q1649.1 574.4 1645.6 568.7Q1642.1 563.1 1645.5 565.8Z'],
		['sb', 'M1631.8 494.3Q1633.6 495.5 1634.1 496.4Q1634.6 497.3 1634.6 497.9Q1634.7 498.4 1632.9 497.2Q1631.2 496.1 1629.9 495.1Q1628.7 494.1 1627.9 493.1Q1627.1 492.2 1627.5 491.9Q1627.9 491.6 1628.9 492.3Q1630.0 493.0 1631.8 494.3Z'],
		['nz', 'M1660.2 668.3Q1652.5 674.9 1645.4 678.3Q1638.3 681.6 1645.0 670.8Q1651.7 659.9 1652.3 651.7Q1652.9 643.5 1654.0 651.2Q1655.1 659.0 1656.2 657.0Q1657.4 655.1 1658.4 658.9Q1659.4 662.7 1663.6 662.2Q1667.8 661.7 1660.2 668.3ZM1596.9 700.6Q1608.1 694.2 1620.5 685.8Q1632.9 677.3 1632.4 679.6Q1632.0 681.9 1634.2 680.8Q1636.5 679.7 1619.8 693.4Q1603.2 707.2 1598.9 709.2Q1594.7 711.2 1590.2 709.0Q1585.7 706.9 1596.9 700.6Z'],
		['au', 'M1514.3 678.7Q1520.7 679.0 1517.5 685.7Q1514.2 692.3 1509.6 693.3Q1505.0 694.2 1506.5 686.3Q1508.0 678.4 1514.3 678.7ZM1457.1 629.0Q1444.5 631.0 1437.2 635.7Q1429.9 640.4 1421.2 640.6Q1412.6 640.9 1407.2 643.9Q1401.9 647.0 1396.0 644.5Q1390.0 642.1 1393.6 636.5Q1397.2 630.9 1396.3 613.8Q1395.3 596.8 1397.3 597.3Q1399.3 597.8 1398.6 592.4Q1397.9 587.0 1401.3 579.7Q1404.6 572.3 1404.4 574.4Q1404.1 576.6 1421.3 568.6Q1438.6 560.7 1452.6 545.5Q1466.7 530.2 1470.2 529.0Q1473.6 527.9 1479.2 531.1Q1484.8 534.3 1488.2 527.5Q1491.5 520.7 1496.4 519.6Q1501.2 518.4 1501.0 515.6Q1500.9 512.9 1510.5 514.9Q1520.2 517.0 1516.5 525.7Q1512.8 534.5 1522.7 542.1Q1532.5 549.7 1541.2 530.0Q1549.8 510.3 1551.6 521.1Q1553.4 532.0 1556.7 533.2Q1559.9 534.4 1560.1 545.5Q1560.3 556.6 1565.1 560.6Q1570.0 564.7 1570.5 570.1Q1571.1 575.6 1573.5 575.8Q1575.9 575.9 1578.4 586.2Q1581.0 596.5 1574.6 612.1Q1568.3 627.8 1554.5 644.0Q1540.6 660.2 1530.2 664.7Q1519.7 669.1 1518.4 666.0Q1517.1 662.8 1512.7 665.3Q1508.3 667.9 1502.7 665.7Q1497.1 663.5 1497.0 658.2Q1497.0 653.0 1494.4 651.5Q1491.7 650.0 1493.3 646.6Q1495.0 643.1 1490.8 645.6Q1486.7 648.1 1491.6 641.4Q1496.5 634.8 1490.1 640.4Q1483.8 646.0 1482.3 639.6Q1480.9 633.2 1475.3 630.1Q1469.7 627.0 1457.1 629.0Z'],
		['lk', 'M1255.6 402.5Q1259.9 408.9 1256.6 413.2Q1253.4 417.6 1252.3 406.8Q1251.3 396.1 1255.6 402.5Z'],
		['cn', 'M1388.4 344.0Q1386.2 349.3 1383.6 346.0Q1381.0 342.7 1385.8 340.8Q1390.6 338.8 1388.4 344.0ZM1219.7 214.1L1218.3 210.9L1216.1 205.4Q1213.9 199.9 1218.7 198.2Q1223.5 196.5 1223.3 191.6Q1223.1 186.7 1227.6 187.6Q1232.2 188.5 1233.6 184.3L1235.0 180.1L1236.8 176.5L1238.3 176.0L1241.0 179.8L1246.8 182.3Q1252.6 184.7 1256.7 191.3Q1260.7 197.9 1271.3 200.8Q1281.9 203.7 1285.7 207.8Q1289.6 212.0 1309.7 215.1Q1329.9 218.3 1340.4 214.7Q1350.9 211.2 1353.0 208.8Q1355.0 206.4 1353.4 202.7Q1351.8 198.9 1355.6 199.7Q1359.5 200.5 1365.5 195.4Q1371.5 190.3 1376.3 190.2Q1381.1 190.2 1375.7 186.4Q1370.2 182.7 1365.8 183.6Q1361.3 184.6 1360.2 180.7L1359.1 176.9L1358.8 172.8L1365.1 174.9L1367.1 168.3Q1369.1 161.7 1366.6 159.6Q1364.1 157.5 1369.9 155.6Q1375.6 153.7 1400.9 169.0Q1426.2 184.2 1433.7 182.3Q1441.1 180.5 1442.4 189.6Q1443.6 198.7 1439.4 199.2Q1435.2 199.7 1437.3 205.3L1439.5 211.0L1440.9 213.8L1436.5 210.6L1419.2 227.6L1413.7 229.2L1410.5 231.2Q1407.3 233.3 1406.2 227.6Q1405.0 221.9 1398.5 228.0Q1392.0 234.2 1398.6 238.6Q1405.2 243.0 1410.8 242.2Q1416.5 241.3 1411.9 248.5Q1407.3 255.6 1416.7 264.6Q1426.1 273.6 1428.5 283.4Q1431.0 293.1 1426.7 303.4Q1422.3 313.7 1417.0 318.7Q1411.6 323.6 1400.4 327.5Q1389.2 331.4 1388.9 334.3Q1388.7 337.3 1383.4 333.4L1378.2 329.6L1376.1 330.5L1368.7 325.5Q1361.3 320.4 1355.5 322.2L1349.7 324.0L1347.5 325.4L1345.2 326.2L1344.5 332.5L1343.9 331.2L1343.3 328.8L1338.7 328.1Q1334.0 327.3 1331.7 321.9Q1329.3 316.4 1326.9 316.9Q1324.5 317.4 1325.9 311.7Q1327.2 306.0 1323.9 299.2L1320.7 292.5L1318.1 292.9L1312.9 292.0L1311.9 289.1Q1310.9 286.2 1307.4 286.7Q1304.0 287.2 1300.1 291.1L1296.2 294.9L1292.6 295.6L1290.2 294.1L1281.9 294.1L1279.7 298.3L1278.4 293.9L1275.8 295.0L1270.3 294.5L1242.4 280.8L1240.8 282.1L1233.6 278.2L1229.6 273.3Q1225.7 268.4 1225.7 263.7L1225.6 258.9L1219.2 252.3L1211.2 250.1L1208.9 245.8L1204.9 243.1L1203.7 241.5L1202.3 238.3L1197.5 235.5L1195.1 230.3L1196.0 229.0L1219.4 215.3L1219.7 214.1Z'],
		['tw', 'M1435.8 312.0Q1437.1 314.6 1436.3 321.4Q1435.4 328.2 1432.9 323.7Q1430.4 319.3 1432.5 314.4Q1434.6 309.5 1435.8 312.0Z'],
		['it', 'M911.8 189.1L914.5 189.9L920.1 189.8L926.4 191.2L926.1 193.9L927.2 196.2L923.8 195.4L922.8 200.0Q921.8 204.5 935.4 215.3Q949.0 226.2 945.4 225.4Q941.8 224.7 940.5 231.5Q939.1 238.4 937.3 232.6Q935.5 226.9 923.5 216.1Q911.5 205.4 906.4 205.8L901.3 206.3L899.5 206.7L896.4 195.6L896.5 194.0L898.4 195.2L911.6 191.3L911.8 189.1ZM927.9 239.0Q933.1 237.5 934.1 241.8Q935.0 246.0 928.9 243.2Q922.8 240.5 927.9 239.0ZM905.9 227.7Q905.5 222.1 908.0 223.3Q910.5 224.4 908.4 228.8Q906.3 233.2 905.9 227.7Z'],
		['dk', 'M907.4 145.7L901.7 145.8L899.9 142.9L900.6 138.7Q901.2 134.6 905.2 133.0Q909.1 131.4 907.6 137.3L906.1 143.1L907.4 145.7Z'],
		['gb', 'M851.2 153.8Q854.3 154.0 848.3 145.2Q842.3 136.3 844.8 131.5Q847.2 126.8 851.2 126.7Q855.1 126.7 852.9 129.5Q850.8 132.3 855.0 132.0Q859.2 131.6 856.8 136.1Q854.4 140.5 864.2 149.0Q874.0 157.6 871.6 162.8Q869.3 168.1 857.1 170.3Q844.9 172.4 848.8 168.5Q852.8 164.6 848.9 163.1Q845.1 161.5 847.3 160.7Q849.5 159.9 848.8 156.7Q848.1 153.5 851.2 153.8Z'],
		['is', 'M795.7 89.8Q814.0 87.7 815.3 90.9Q816.6 94.2 806.6 98.2Q796.6 102.2 789.1 101.1Q781.5 99.9 783.6 98.8Q785.6 97.7 781.8 96.5Q778.0 95.3 781.4 94.1Q784.9 93.0 781.1 92.4Q777.3 91.8 795.7 89.8Z'],
		['az', 'M1071.4 216.8L1072.7 217.0L1075.5 218.9Q1078.3 220.8 1079.7 218.9L1081.0 217.1L1083.9 220.0L1087.2 222.9Q1090.6 225.7 1087.9 229.7L1085.2 233.8L1085.7 236.5L1079.3 229.9L1074.7 234.0L1074.0 230.1L1066.8 221.7L1065.7 220.2L1066.6 219.3L1069.6 220.3Q1072.6 221.2 1071.5 219.4L1070.4 217.6L1071.4 216.8Z'],
		['ge', 'M1041.6 208.1L1068.4 215.5L1071.4 216.8L1070.4 217.6L1071.5 219.4Q1072.6 221.2 1069.6 220.3L1066.6 219.3L1065.7 220.2L1059.7 221.1L1055.0 218.3L1050.3 218.6L1050.6 216.2L1043.5 209.8L1041.6 208.1Z'],
		['ph', 'M1456.0 397.9Q1454.7 395.2 1457.9 391.7Q1461.2 388.2 1459.2 394.4Q1457.2 400.6 1456.0 397.9ZM1471.1 400.2Q1473.7 403.9 1471.9 411.8Q1470.1 419.7 1465.4 413.5Q1460.7 407.2 1456.8 409.0Q1452.8 410.8 1456.3 406.6Q1459.7 402.4 1464.4 401.6Q1469.1 400.7 1468.7 398.6Q1468.4 396.4 1471.1 400.2ZM1443.1 348.4Q1447.1 349.1 1447.4 360.0Q1447.7 370.9 1453.2 372.5Q1458.8 374.0 1459.5 377.5Q1460.3 380.9 1451.6 377.2Q1442.8 373.6 1440.5 369.2Q1438.2 364.9 1438.7 356.2Q1439.2 347.6 1443.1 348.4ZM1464.3 381.9Q1467.4 383.0 1466.3 388.7Q1465.3 394.3 1463.2 387.6Q1461.2 380.8 1464.3 381.9Z'],
		['my', 'M1348.2 414.8L1350.8 417.0Q1353.5 419.1 1355.8 417.6L1358.1 416.2L1359.2 416.7L1364.2 429.2Q1369.1 441.8 1367.3 442.9Q1365.6 444.0 1360.4 439.7Q1355.2 435.4 1352.3 426.3L1349.3 417.2L1348.2 414.8ZM1434.3 427.8L1429.5 427.3Q1424.6 426.8 1421.8 434.9Q1419.0 442.9 1409.2 444.7Q1399.3 446.5 1397.2 443.1L1395.1 439.7L1398.7 441.6L1414.3 429.1L1416.6 425.6L1419.3 426.2Q1422.1 426.8 1422.2 423.6L1422.3 420.5L1425.8 416.6L1427.9 414.4Q1429.9 412.2 1435.1 416.5Q1440.3 420.7 1439.0 423.3L1437.8 425.9L1434.3 427.8Z'],
		['bn', 'M1422.3 420.5L1422.2 423.6Q1422.1 426.8 1419.3 426.2L1416.6 425.6L1418.4 423.5L1422.3 420.5Z'],
		['si', 'M926.4 191.2L930.0 191.6L935.8 190.2L936.5 189.3L937.3 189.4L938.2 191.2L934.9 192.7L926.3 196.7L927.2 196.2L926.1 193.9L926.4 191.2Z'],
		['fi', 'M968.0 75.2L968.4 78.5L977.5 91.9Q986.7 105.3 981.4 111.3L976.1 117.2L969.1 117.6L962.8 119.1Q956.4 120.5 953.0 118.3Q949.7 116.1 948.4 111.4Q947.2 106.6 953.7 99.4L960.3 92.2L954.7 89.9L945.1 77.3L939.9 75.0L941.7 73.8L948.3 75.5Q954.9 77.2 956.7 74.4Q958.5 71.7 963.5 71.8L968.5 71.9L968.0 75.2Z'],
		['sk', 'M962.6 177.2L961.5 178.6L960.9 180.8L960.1 181.3L941.6 183.8L939.4 182.4L938.8 180.5L939.1 179.8L939.6 178.6L945.4 175.0L946.7 174.9L946.9 175.3L958.3 175.1L962.6 177.2Z'],
		['cz', 'M929.8 166.3L931.9 168.0L944.5 172.3L946.7 174.9L945.4 175.0L939.6 178.6L939.1 179.8L937.0 178.8L927.9 180.1L924.7 178.3L922.1 176.0L920.3 173.4Q918.5 170.8 923.2 168.8L928.0 166.8L929.8 166.3Z'],
		['er', 'M1040.8 370.4L1040.2 368.2L1041.2 362.2Q1042.1 356.2 1045.7 353.3L1049.2 350.4L1052.3 356.9L1070.5 378.3L1073.0 380.0L1071.6 381.4L1069.5 380.9L1067.8 379.1L1062.8 374.5Q1057.9 369.9 1052.8 368.6Q1047.7 367.4 1047.0 369.5L1046.4 371.6L1040.8 370.4Z'],
		['jp', 'M1495.3 225.6Q1499.5 231.7 1501.0 243.0Q1502.5 254.3 1496.2 255.8Q1490.0 257.3 1488.0 260.5Q1486.0 263.7 1483.2 260.5Q1480.3 257.3 1471.8 259.3Q1463.2 261.3 1466.3 263.4Q1469.4 265.4 1469.6 270.2Q1469.8 275.0 1467.2 275.1Q1464.7 275.2 1461.0 269.9Q1457.3 264.6 1462.3 258.6Q1467.2 252.7 1474.1 252.4Q1480.9 252.1 1481.1 247.2Q1481.3 242.2 1483.4 243.5Q1485.5 244.8 1488.3 241.0Q1491.1 237.1 1489.0 228.8Q1486.9 220.5 1489.0 220.0Q1491.1 219.5 1495.3 225.6ZM1489.1 200.8Q1497.4 205.2 1500.5 207.1Q1503.7 209.1 1500.5 212.6Q1497.2 216.1 1492.8 214.2Q1488.3 212.3 1488.7 215.3Q1489.1 218.3 1486.7 218.4Q1484.3 218.4 1482.5 207.4Q1480.7 196.4 1489.1 200.8ZM1472.7 265.8Q1470.4 263.7 1472.9 261.2Q1475.5 258.6 1478.0 260.2Q1480.6 261.8 1477.8 264.9Q1475.0 267.9 1472.7 265.8Z'],
		['py', 'M592.2 563.5L593.9 566.6L594.1 570.4Q594.3 574.2 599.4 574.9Q604.5 575.7 608.6 583.5L612.6 591.4L612.1 594.6L611.9 599.6L608.3 602.2Q604.7 604.8 599.6 603.6Q594.5 602.4 595.7 596.9Q597.0 591.4 589.4 587.8L581.8 584.2L572.1 575.1L573.2 568.4L574.0 564.4Q574.8 560.4 583.3 561.1L591.9 561.7L592.2 563.5Z'],
		['ye', 'M1113.2 344.8L1117.7 354.0L1119.5 357.9L1116.2 359.4L1097.2 370.1Q1078.2 380.7 1074.5 371.4L1070.8 362.1L1070.5 359.6L1071.7 356.2Q1072.9 352.8 1081.6 354.5Q1090.3 356.3 1095.0 351.6L1099.8 346.9L1113.2 344.8Z'],
		['sa', 'M1028.5 286.7L1034.2 284.9Q1039.9 283.1 1038.4 278.9Q1036.8 274.6 1041.2 273.2L1045.7 271.8L1046.5 271.0L1052.2 272.5L1073.7 287.7L1082.3 288.2L1086.5 288.7L1091.2 291.2L1093.6 296.1L1103.8 311.2L1104.7 312.6L1107.5 313.3L1108.6 315.4L1109.9 318.9Q1111.2 322.4 1118.5 323.8L1125.7 325.2L1126.5 324.0L1129.0 328.0L1127.0 339.2L1113.2 344.8L1099.8 346.9L1095.0 351.6Q1090.3 356.3 1081.6 354.5Q1072.9 352.8 1071.7 356.2L1070.5 359.6L1069.7 357.2L1028.1 289.0L1028.5 286.7Z'],
		['cy', 'M1015.3 254.3L1015.6 254.3L1020.5 253.7L1021.0 254.8L1015.3 254.3Z'],
		['cy', 'M1015.3 254.3L1021.0 254.8L1021.2 255.2L1013.2 254.5L1015.3 254.3Z'],
		['ma', 'M857.2 254.1L859.1 262.3Q861.0 270.4 843.9 280.0L826.9 289.6L826.8 296.3L826.1 296.3L820.0 298.4Q814.0 300.6 805.7 315.7Q797.5 330.8 792.1 331.0L786.8 331.2L787.1 328.6L793.4 316.4Q799.7 304.1 811.3 293.8Q822.9 283.5 823.7 276.1Q824.5 268.7 832.3 259.8Q840.2 250.8 847.7 252.4L855.2 254.1L857.2 254.1Z'],
		['eg', 'M1040.5 328.0L1003.6 328.0L984.7 328.0L983.7 307.4L982.5 274.3L988.5 274.2L1022.2 277.7L1024.4 276.3L1027.7 284.5L1028.3 285.9L1027.2 288.2L1025.8 292.2Q1024.5 296.3 1020.3 290.4Q1016.1 284.5 1027.9 305.7L1039.6 326.9L1040.5 328.0Z'],
		['ly', 'M984.7 328.0L985.2 339.2L979.7 339.2L979.8 341.6L960.5 330.8L941.4 320.1L936.8 323.2L933.5 325.2L930.8 322.2L923.3 319.8L921.2 316.2L915.8 310.6Q910.5 305.0 911.4 295.7L912.3 286.4L910.7 281.4L912.9 280.1L919.4 265.5L924.9 267.4L939.9 274.5Q954.9 281.6 958.6 274.8Q962.3 267.9 971.8 270.2L981.2 272.5L982.5 274.3L983.7 307.4L984.7 328.0Z'],
		['et', 'M1096.5 406.2L1083.3 423.0L1069.8 427.2L1068.5 429.0L1065.2 429.0L1057.8 429.9Q1050.5 430.8 1044.9 425.9L1039.3 421.1L1036.8 420.1L1033.8 414.1L1029.6 410.8Q1025.3 407.4 1027.3 405.8L1029.4 404.1L1030.1 402.4L1029.9 397.4L1040.2 375.2L1040.8 370.4L1046.4 371.6L1047.0 369.5Q1047.7 367.4 1052.8 368.6Q1057.9 369.9 1062.8 374.5L1067.8 379.1L1069.5 380.9L1067.9 383.4L1067.5 386.3Q1067.0 389.2 1068.9 389.1L1070.8 388.9L1071.9 389.9L1070.9 391.9L1092.5 406.3L1096.5 406.2Z'],
		['dj', 'M1069.5 380.9L1071.6 381.4L1073.0 380.0L1074.2 381.8L1071.4 385.4L1073.5 386.9L1071.9 389.9L1070.8 388.9L1068.9 389.1Q1067.0 389.2 1067.5 386.3L1067.9 383.4L1069.5 380.9Z'],
		['so', 'M1099.7 401.6L1096.5 406.2L1092.5 406.3L1070.9 391.9L1071.9 389.9L1073.5 386.9L1075.2 388.0L1078.0 390.3Q1080.8 392.6 1089.7 390.0L1098.6 387.4L1101.3 387.2L1099.7 401.6Z'],
		['ug', 'M1030.3 456.1L1020.5 456.6L1015.2 456.5L1013.5 457.2L1010.6 458.9L1009.5 458.3L1009.5 454.1L1015.2 437.8L1015.4 431.3L1017.4 429.8L1027.7 429.7L1030.7 427.1L1033.0 431.0L1034.4 435.6Q1035.7 440.2 1033.0 445.2L1030.2 450.2L1030.3 456.1Z'],
		['rw', 'M1013.5 457.2L1015.4 460.3L1015.1 463.6L1013.7 464.3L1011.2 463.9L1009.7 467.1L1006.8 466.7L1007.2 463.6L1008.1 459.9L1009.5 458.3L1010.6 458.9L1013.5 457.2Z'],
		['ba', 'M948.4 212.4L944.4 210.3L939.9 205.4Q935.4 200.5 941.4 199.8L947.4 199.0L949.5 200.2L951.0 200.2L952.0 207.4L951.0 207.6L950.2 208.1L948.9 209.4L948.4 212.4Z'],
		['mk', 'M965.4 214.3L967.7 216.0L968.3 219.7L967.5 219.9L962.9 222.0L960.0 222.5L958.1 221.1L957.3 218.7L957.7 216.8L958.2 216.9L960.9 214.9L961.9 214.7L963.3 214.4L965.4 214.3Z'],
		['rs', 'M948.2 194.5L951.4 193.0L954.1 193.3L956.7 195.4L964.7 202.7L965.6 203.7L964.7 204.9L966.0 213.5L965.4 214.3L963.3 214.4L961.9 214.7L961.7 214.3L956.8 211.1L955.8 211.5L956.1 211.1L952.2 208.6L951.0 207.6L952.0 207.4L951.0 200.2L949.5 200.2L951.0 198.2L949.5 196.6L948.2 194.5Z'],
		['me', 'M955.1 212.8L954.0 213.3L952.3 216.7L951.4 216.3L950.0 214.5L948.0 213.4L948.4 212.4L948.9 209.4L950.2 208.1L951.0 207.6L952.2 208.6L956.1 211.1L955.8 211.5L955.1 212.8Z'],
		['xk', 'M957.7 216.8L957.2 214.8L956.1 214.3L955.1 212.8L955.8 211.5L956.8 211.1L961.7 214.3L961.9 214.7L960.9 214.9L958.2 216.9L957.7 216.8Z'],
		['tt', 'M570.8 392.7Q571.5 390.9 573.2 392.7Q574.9 394.5 572.5 394.5Q570.0 394.6 570.8 392.7Z'],
		['ss', 'M1015.4 431.3L1011.2 427.6L1001.6 426.3L998.7 421.7L997.9 419.9L987.6 407.2L985.0 405.0L981.7 402.8L986.1 397.8Q990.6 392.8 993.0 395.4Q995.3 398.1 1006.3 397.1Q1017.3 396.1 1020.5 389.4Q1023.6 382.6 1026.8 390.3L1029.9 398.1L1030.1 402.4L1029.4 404.1L1027.3 405.8Q1025.3 407.4 1029.6 410.8L1033.8 414.1L1036.8 420.1L1033.6 423.8L1030.7 427.1L1027.7 429.7L1017.4 429.8L1015.4 431.3Z'],
	];
}
