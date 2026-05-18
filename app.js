/* === EPS TOURNOI — constantes et état initial === */

const STORAGE_KEY = 'eps-tournoi-v1';
const SESSIONS_KEY = 'eps-tournoi-sessions-v1';
const CLASSROOMS_KEY = 'eps-classrooms-v1';
const TEAM_COLOR_SUGGESTIONS = ['Bleu', 'Rouge', 'Vert', 'Jaune', 'Orange', 'Blanc', 'Noir', 'Rose'];

const TOURNAMENT_MODES = {
  'round-robin': { label: 'Championnat' },
  'groups-finals': { label: 'Coupe du monde' },
  'groups-pools': { label: 'Poules' },
  'rotating-teams': { label: 'Poules tournantes' },
  ladder: { label: 'Échelle / Ladder' },
  swiss: { label: 'Ronde suisse' },
  challenge: { label: 'Défi' },
};

const FORMAT_DEFINITIONS = {
  'sport-co': [
    { id: 'round-robin', icon: '🏆', title: 'Championnat', description: 'Toutes les équipes se rencontrent', recommended: true },
    { id: 'groups-finals', icon: '🌍', title: 'Coupe du monde', description: 'Phases de poules + finale', recommended: false },
    { id: 'rotating-teams', icon: '🔄', title: 'Poules tournantes', description: "Les joueurs changent d'équipe à chaque rotation", recommended: false },
  ],
  raquette: [
    { id: 'round-robin', icon: '🏸', title: 'Tournoi poule', description: 'Tous contre tous sur les terrains', recommended: true },
    { id: 'groups-pools', icon: '🏸', title: 'Poules', description: 'Groupes de 3–6 joueurs, rotations et rôles dans chaque poule', recommended: true },
    { id: 'ladder', icon: '🪜', title: 'Échelle / Ladder', description: 'Montée-descente entre les terrains', recommended: false },
    { id: 'swiss', icon: '🇨🇭', title: 'Ronde suisse', description: 'Appariement progressif selon le niveau', recommended: false },
    { id: 'challenge', icon: '⚔️', title: 'Défi', description: 'Classement vivant — défie quelqu\'un mieux classé', recommended: false },
  ],
};

const dom = {};
const runtime = {
  timerInterval: null,
};

function createDefaultDraft() {
  return {
    sport: 'sport-co',
    format: 'round-robin',
    participantCount: 24,
    selectedConfigKey: '',
    teamNames: [],
    studentNamesText: '',
    fields: 2,
    startTime: '10:00',
    endTime: '11:00',
    duration: 7,
    rotatingReferee: false,
    scoreTable: false,
    sessionName: '',
    challengeRange: 5,
    poolSize: 4,
  };
}

function createDefaultState() {
  return {
    view: 'home',
    draft: createDefaultDraft(),
    currentSession: null,
    lastStatsSessionId: null,
    timer: {
      totalSeconds: 0,
      remainingSeconds: 0,
      running: false,
    },
  };
}

let state = sanitizeState(loadState() || createDefaultState());

/* === Helpers généraux === */

function clampNumber(value, min, max, fallback) {
  if (Number.isNaN(value)) return fallback;
  return Math.min(Math.max(value, min), max);
}

function clampSetupCount(value, fallback = 24) {
  return clampNumber(Number(value) || fallback, 4, 48, fallback);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDisplayName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/);
  if (parts.length < 2) return fullName;
  const firstName = parts[parts.length - 1];
  const familyParts = parts.slice(0, parts.length - 1);
  const initials = familyParts.map(p => p.charAt(0).toUpperCase()).join('-');
  return `${initials}. ${firstName}`;
}

function uniqueId(prefix = 'id') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function parseTime(value) {
  if (!value) return null;
  const [hours, minutes] = value.split(':').map(Number);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) return null;
  return hours * 60 + minutes;
}

function formatTimeLabel(value) {
  if (!value && value !== 0) return '';
  const hours = String(Math.floor(value / 60)).padStart(2, '0');
  const minutes = String(value % 60).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function getAvailableWindow(options) {
  const start = parseTime(options.startTime);
  const end = parseTime(options.endTime);
  if (start == null || end == null) return { availableMinutes: null };
  let diff = end - start;
  if (diff < 0) diff += 24 * 60;
  return { availableMinutes: diff };
}

function buildMatchKey(rotationNumber, home, away) {
  return `r${rotationNumber}-${encodeURIComponent(home)}-${encodeURIComponent(away)}`;
}

function parseNames(text) {
  return String(text || '')
    .split(/[\n,;]+/)
    .map(value => value.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function ensureTeamListLength(list, length, prefix = 'Équipe') {
  const current = Array.isArray(list) ? [...list] : [];
  while (current.length < length) {
    current.push(`${prefix} ${current.length + 1}`);
  }
  return current.slice(0, length).map((name, index) => {
    const clean = String(name || '').trim();
    return clean || `${prefix} ${index + 1}`;
  });
}

function getEnabledRolesFromOptions(options = {}) {
  const roles = [];
  if (options.rotatingReferee) roles.push('Arbitre');
  if (options.scoreTable) roles.push('Table');
  return roles;
}

function assignRolesForByes(byeList, enabledRoles) {
  const names = Array.isArray(byeList) ? byeList.filter(Boolean) : [];
  const roles = Array.isArray(enabledRoles) && enabledRoles.length ? enabledRoles : ['Spectateur actif'];
  return names.map((name, index) => ({
    name,
    role: roles[index % roles.length],
  }));
}

function getSuggestedTeamConfigurations(studentCount) {
  const safeCount = clampSetupCount(studentCount, 24);
  return Array.from({ length: 7 }, (_, offset) => offset + 2)
    .map(teamSize => {
      const remainder = safeCount % teamSize;
      const teamCount = Math.floor(safeCount / teamSize);
      if (teamCount < 2) return null;
      const exact = remainder === 0;
      const acceptable = !exact && remainder <= Math.floor(teamSize / 2);
      if (!exact && !acceptable) return null;
      const inPreferredBand = teamSize >= 3 && teamSize <= 6;
      return {
        key: `${teamSize}-${teamCount}-${remainder}`,
        teamSize,
        teamCount,
        substitutes: remainder,
        exact,
        acceptable,
        inPreferredBand,
        label: exact
          ? `${teamCount} équipes de ${teamSize}`
          : `${teamCount} équipes de ${teamSize} (+ ${remainder} remplaçants)`,
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (left.exact !== right.exact) return left.exact ? -1 : 1;
      if (left.inPreferredBand !== right.inPreferredBand) return left.inPreferredBand ? -1 : 1;
      const leftDistance = Math.abs(left.teamSize - 4.5);
      const rightDistance = Math.abs(right.teamSize - 4.5);
      if (leftDistance !== rightDistance) return leftDistance - rightDistance;
      if (left.substitutes !== right.substitutes) return left.substitutes - right.substitutes;
      return right.teamSize - left.teamSize;
    })
    .slice(0, 4);
}

function getEstimatedRotationCount(participantCount, fieldCount, options = {}) {
  const safeCount = Math.max(2, Number(participantCount) || 2);
  const safeFields = Math.max(1, Number(fieldCount) || 1);
  const teamBased = Boolean(options.teamBased);
  const estimate = teamBased
    ? safeCount + safeFields
    : Math.ceil(safeCount / Math.max(safeFields * 2, 1)) + safeFields + 1;
  return clampNumber(estimate, 4, 12, 8);
}

function getSuggestedDurationFromWindow(availableMinutes, rotationEstimate, fallback = 7) {
  if (!Number.isFinite(availableMinutes) || availableMinutes <= 0) return fallback;
  return clampNumber(Math.floor(availableMinutes / Math.max(rotationEstimate, 1)), 1, 60, fallback);
}

function getTournamentType(source = state.draft) {
  const format = source?.format || 'round-robin';
  return Object.prototype.hasOwnProperty.call(TOURNAMENT_MODES, format) ? format : 'round-robin';
}

function getCurrentFormatDefinition() {
  const sport = state.draft.sport === 'raquette' ? 'raquette' : 'sport-co';
  const found = FORMAT_DEFINITIONS[sport].find(entry => entry.id === state.draft.format);
  return found || FORMAT_DEFINITIONS[sport][0];
}

function isTeamBasedDraft() {
  return state.draft.sport === 'sport-co' && state.draft.format !== 'rotating-teams';
}

function getSelectedConfiguration() {
  if (!isTeamBasedDraft()) return null;
  const suggestions = getSuggestedTeamConfigurations(state.draft.participantCount);
  if (!suggestions.length) return null;
  const selected = suggestions.find(entry => entry.key === state.draft.selectedConfigKey) || suggestions[0];
  state.draft.selectedConfigKey = selected.key;
  return selected;
}

function getDraftTeamNames(config) {
  const count = config?.teamCount || 0;
  const defaults = ensureTeamListLength(
    TEAM_COLOR_SUGGESTIONS.slice(0, count).concat(Array.from({ length: Math.max(0, count - TEAM_COLOR_SUGGESTIONS.length) }, (_, index) => `Équipe ${TEAM_COLOR_SUGGESTIONS.length + index + 1}`)),
    count,
    'Équipe'
  );
  if (!count) return [];
  state.draft.teamNames = ensureTeamListLength(state.draft.teamNames.length ? state.draft.teamNames : defaults, count, 'Équipe');
  return state.draft.teamNames;
}

function getDraftStudentNames(count) {
  const typed = parseNames(state.draft.studentNamesText);
  if (!typed.length) {
    return ensureTeamListLength([], count, 'Élève');
  }
  return ensureTeamListLength(typed, count, 'Élève');
}

/* === Fonctions de génération récupérées/adaptées === */

function createRoundRobinPairs(teamNames, options = {}) {
  const working = [...teamNames];
  const needsBye = working.length % 2 === 1;
  if (needsBye) working.push('Exempt');
  const pivot = working[0];
  let rest = working.slice(1);
  const rounds = [];
  const totalRounds = working.length - 1;
  let previousReferee = null;
  for (let roundIndex = 0; roundIndex < totalRounds; roundIndex += 1) {
    const current = [pivot, ...rest];
    const matches = [];
    const byes = [];
    for (let index = 0; index < current.length / 2; index += 1) {
      const home = current[index];
      const away = current[current.length - 1 - index];
      if (home === 'Exempt') {
        byes.push(away);
        continue;
      }
      if (away === 'Exempt') {
        byes.push(home);
        continue;
      }
      matches.push({
        id: buildMatchKey(roundIndex + 1, home, away),
        home,
        away,
      });
    }
    const roundReferee = options.rotatingReferee ? (byes[0] || previousReferee || null) : null;
    if (roundReferee) {
      matches.forEach(match => {
        match.referee = roundReferee;
      });
    }
    if (byes[0]) {
      previousReferee = byes[0];
    }
    rounds.push({ matches, byes });
    rest.unshift(rest.pop());
  }
  return rounds;
}

function assembleSchedule(entries, teams, options, metaExtras) {
  const fieldCount = clampNumber(Number(options.fields) || 1, 1, 20, 1);
  const rotations = [];
  let rotationNumber = 1;
  let totalMatches = 0;
  let clock = parseTime(options.startTime);
  entries.forEach(entry => {
    const chunked = [];
    for (let index = 0; index < entry.matches.length; index += fieldCount) {
      chunked.push(entry.matches.slice(index, index + fieldCount));
    }
    if (!chunked.length) {
      chunked.push([]);
    }
    chunked.forEach(slice => {
      const startLabel = clock == null ? '' : formatTimeLabel(clock);
      const endLabel = clock == null ? '' : formatTimeLabel(clock + Number(options.duration || 7));
      const preparedMatches = slice.map((match, matchIndex) => {
        totalMatches += 1;
        return {
          ...match,
          field: match.field || matchIndex + 1,
          phase: match.phase || entry.phase || metaExtras.format,
          groupId: match.groupId || entry.groupId || null,
          groupLabel: match.groupLabel || entry.groupLabel || null,
        };
      });
      rotations.push({
        number: rotationNumber,
        title: entry.title || `Rotation ${rotationNumber}`,
        phase: entry.phase || metaExtras.format,
        groupId: entry.groupId || null,
        groupLabel: entry.groupLabel || null,
        startLabel,
        endLabel,
        matches: preparedMatches,
        byes: [...(entry.byes || [])],
        byeAssignments: Array.isArray(entry.byeAssignments) ? structuredClone(entry.byeAssignments) : [],
      });
      rotationNumber += 1;
      if (clock != null) {
        clock += Number(options.duration || 7);
      }
    });
  });
  return {
    format: metaExtras.format,
    rotations,
    teams: teams.map(name => ({ name })),
    groups: metaExtras.groups || [],
    finals: metaExtras.finals || null,
    meta: {
      format: metaExtras.format,
      formatLabel: metaExtras.formatLabel,
      teamCount: teams.length,
      matchCount: totalMatches,
      fieldCount,
      rotationCount: rotations.length,
      practiceType: options.practiceType,
      durationMinutes: Number(options.duration || 7),
    },
  };
}

function buildSinglePoolSchedule(teams, options) {
  const rounds = createRoundRobinPairs(teams, options);
  const entries = rounds.map((round, index) => ({
    phase: 'single',
    title: `Rotation ${index + 1}`,
    matches: round.matches.map(match => ({ ...match })),
    byes: [...round.byes],
  }));
  return assembleSchedule(entries, teams, options, {
    format: 'round-robin',
    formatLabel: TOURNAMENT_MODES['round-robin'].label,
    groups: [],
  });
}

function distributeIntoGroups(teamNames, options = {}) {
  if (!Array.isArray(teamNames) || !teamNames.length) return [];
  const teams = [...teamNames];
  const requestedGroups = Number(options.targetGroups);
  const targetGroups =
    Number.isFinite(requestedGroups) && requestedGroups > 0 ? clampNumber(requestedGroups, 2, 4, requestedGroups) : null;
  const minGroups = options.finals ? Math.min(2, teams.length) : teams.length >= 4 ? Math.min(2, teams.length) : 1;
  const maxGroups = options.finals ? Math.min(4, teams.length) : Math.min(6, teams.length);
  const preferSize = 4;
  const candidates = [];
  for (let groupCount = minGroups; groupCount <= Math.max(minGroups, maxGroups); groupCount += 1) {
    const base = Math.floor(teams.length / groupCount);
    if (!base) continue;
    const remainder = teams.length % groupCount;
    const sizes = Array(groupCount).fill(base);
    for (let index = 0; index < remainder; index += 1) {
      sizes[index] += 1;
    }
    if (sizes.some(size => size < 2)) continue;
    const maxSize = Math.max(...sizes);
    const minSize = Math.min(...sizes);
    const imbalance = maxSize - minSize;
    const penalty = sizes.reduce((sum, size) => sum + Math.abs(size - preferSize), 0) + imbalance * (imbalance > 1 ? 3 : 1);
    candidates.push({ groupCount, sizes, imbalance, penalty });
  }
  if (!candidates.length) {
    return [{ id: 'group-0', label: 'Groupe A', teams }];
  }
  const balanced = candidates.filter(entry => entry.imbalance <= 1);
  const pool = balanced.length ? balanced : candidates;
  pool.sort((left, right) => {
    if (left.penalty !== right.penalty) return left.penalty - right.penalty;
    return left.groupCount - right.groupCount;
  });
  if (targetGroups) {
    const idx = pool.findIndex(entry => entry.groupCount === targetGroups);
    if (idx > 0) {
      const [preferred] = pool.splice(idx, 1);
      pool.unshift(preferred);
    }
  }
  const selected = pool[0];
  const result = [];
  let cursor = 0;
  selected.sizes.forEach((size, index) => {
    const label = `Groupe ${String.fromCharCode(65 + index)}`;
    result.push({
      id: `group-${index}`,
      label,
      teams: teams.slice(cursor, cursor + size),
    });
    cursor += size;
  });
  return result;
}

function buildFinalEntries(groups) {
  if (groups.length < 2) return [];
  return [
    {
      phase: 'finals',
      title: 'Demi-finale 1',
      matches: [
        {
          id: 'sf1',
          seedHome: { type: 'group', groupId: groups[0].id, position: 1 },
          seedAway: { type: 'group', groupId: groups[1].id, position: 2 },
          placeholderHome: `1er ${groups[0].label}`,
          placeholderAway: `2e ${groups[1].label}`,
        },
      ],
    },
    {
      phase: 'finals',
      title: 'Demi-finale 2',
      matches: [
        {
          id: 'sf2',
          seedHome: { type: 'group', groupId: groups[1].id, position: 1 },
          seedAway: { type: 'group', groupId: groups[0].id, position: 2 },
          placeholderHome: `1er ${groups[1].label}`,
          placeholderAway: `2e ${groups[0].label}`,
        },
      ],
    },
    {
      phase: 'finals',
      title: 'Match pour la 3e place',
      matches: [
        {
          id: 'small-final',
          seedHome: { type: 'matchLoser', matchId: 'sf1', label: 'Demi-finale 1' },
          seedAway: { type: 'matchLoser', matchId: 'sf2', label: 'Demi-finale 2' },
          placeholderHome: 'Perdant demi-finale 1',
          placeholderAway: 'Perdant demi-finale 2',
        },
      ],
    },
    {
      phase: 'finals',
      title: 'Finale',
      matches: [
        {
          id: 'final',
          seedHome: { type: 'matchWinner', matchId: 'sf1', label: 'Demi-finale 1' },
          seedAway: { type: 'matchWinner', matchId: 'sf2', label: 'Demi-finale 2' },
          placeholderHome: 'Vainqueur demi-finale 1',
          placeholderAway: 'Vainqueur demi-finale 2',
        },
      ],
    },
  ];
}

function buildGroupedSchedule(groups, allTeams, options, extras = {}) {
  const groupedRounds = groups.map(group => ({
    ...group,
    rounds: createRoundRobinPairs(group.teams, options),
  }));
  const entries = [];
  const maxRounds = Math.max(...groupedRounds.map(group => group.rounds.length));
  for (let roundIndex = 0; roundIndex < maxRounds; roundIndex += 1) {
    const matches = [];
    const byes = [];
    groupedRounds.forEach(group => {
      const round = group.rounds[roundIndex];
      if (!round) return;
      round.matches.forEach(match => {
        matches.push({
          ...match,
          phase: 'groups',
          groupId: group.id,
          groupLabel: group.label,
        });
      });
      round.byes.forEach(name => byes.push(name));
    });
    entries.push({
      phase: 'groups',
      title: `Rotation ${entries.length + 1}`,
      matches,
      byes,
    });
  }
  if (extras.finals && groups.length >= 2) {
    entries.push(...buildFinalEntries(groups));
  }
  return assembleSchedule(entries, allTeams, options, {
    format: extras.finals ? 'groups-finals' : 'groups',
    formatLabel: extras.finals ? TOURNAMENT_MODES['groups-finals'].label : 'Groupes',
    groups,
    finals: extras.finals ? { enabled: true } : null,
  });
}

function buildGroupPoolsRaquetteSchedule(teams, options) {
  const poolSize = clampNumber(Number(options.poolSize) || 4, 3, 6, 4);
  const targetGroups = Math.max(1, Math.ceil(teams.length / poolSize));
  const groups = distributeIntoGroups(teams, { targetGroups });
  const enabledRoles = getEnabledRolesFromOptions(options);
  const groupedRounds = groups.map(group => ({
    ...group,
    rounds: createRoundRobinPairs(group.teams, options),
  }));
  const entries = [];
  const maxRounds = Math.max(...groupedRounds.map(group => group.rounds.length));
  for (let roundIndex = 0; roundIndex < maxRounds; roundIndex += 1) {
    const matches = [];
    const byes = [];
    groupedRounds.forEach(group => {
      const round = group.rounds[roundIndex];
      if (!round) return;
      round.matches.forEach(match => {
        matches.push({
          ...match,
          phase: 'groups-pools',
          groupId: group.id,
          groupLabel: group.label,
        });
      });
      round.byes.forEach(name => byes.push(name));
    });
    entries.push({
      phase: 'groups-pools',
      title: `Rotation ${entries.length + 1}`,
      matches,
      byes,
      byeAssignments: assignRolesForByes(byes, enabledRoles),
    });
  }
  return assembleSchedule(entries, teams, options, {
    format: 'groups-pools',
    formatLabel: TOURNAMENT_MODES['groups-pools'].label,
    groups,
    finals: null,
  });
}

function buildLadderRotation(order, rotationNumber, options) {
  const fieldCount = clampNumber(Number(options.fields) || 1, 1, 20, 1);
  let activeCount = Math.min(order.length, fieldCount * 2);
  if (activeCount % 2 === 1) activeCount -= 1;
  if (activeCount < 2) activeCount = Math.min(2, order.length);
  const activePlayers = order.slice(0, activeCount);
  const byes = order.slice(activeCount);
  const matches = [];
  for (let index = 0; index < activePlayers.length; index += 2) {
    const home = activePlayers[index];
    const away = activePlayers[index + 1];
    if (!home || !away) continue;
    matches.push({
      id: buildMatchKey(rotationNumber, home, away),
      home,
      away,
      field: matches.length + 1,
      phase: 'ladder',
    });
  }
  return {
    number: rotationNumber,
    title: `Rotation ${rotationNumber}`,
    phase: 'ladder',
    matches,
    byes,
    orderSnapshot: [...order],
  };
}

function buildLadderSchedule(teams, options) {
  const rotationTarget = getEstimatedRotationCount(teams.length, options.fields, { teamBased: false });
  const firstRotation = buildLadderRotation([...teams], 1, options);
  return {
    format: 'ladder',
    rotations: [firstRotation],
    teams: teams.map(name => ({ name })),
    ladder: {
      rotationTarget,
      latestOrder: [...teams],
    },
    meta: {
      format: 'ladder',
      formatLabel: TOURNAMENT_MODES.ladder.label,
      teamCount: teams.length,
      matchCount: firstRotation.matches.length,
      fieldCount: clampNumber(Number(options.fields) || 1, 1, 20, 1),
      rotationCount: rotationTarget,
      practiceType: options.practiceType,
      durationMinutes: Number(options.duration || 7),
    },
  };
}

function buildChallengeBoard(teams, options) {
  const orderedTeams = teams.map((name, index) => ({ name, rank: index + 1 }));
  return {
    format: 'challenge',
    rotations: [],
    teams: orderedTeams,
    challengeLog: [],
    meta: {
      format: 'challenge',
      formatLabel: TOURNAMENT_MODES.challenge.label,
      teamCount: teams.length,
      matchCount: 0,
      fieldCount: clampNumber(Number(options.fields) || 1, 1, 20, 1),
      rotationCount: 0,
      practiceType: options.practiceType,
      durationMinutes: Number(options.duration || 7),
    },
  };
}

function buildSwissRotation(roundNumber, matches, playerMap) {
  return {
    number: roundNumber,
    title: `Ronde ${roundNumber}`,
    phase: 'swiss',
    matches: matches.filter(match => !match.bye).map(match => ({
      id: match.id,
      home: playerMap.get(match.p1Id)?.name || '',
      away: playerMap.get(match.p2Id)?.name || '',
      field: match.field,
      phase: 'swiss',
      swissP1Id: match.p1Id,
      swissP2Id: match.p2Id,
      swissNote: `${playerMap.get(match.p1Id)?.name || ''} et ${playerMap.get(match.p2Id)?.name || ''} ont tous les deux ${playerMap.get(match.p1Id)?.points || 0} pt${(playerMap.get(match.p1Id)?.points || 0) > 1 ? 's' : ''}`,
    })),
    byes: matches.filter(match => match.bye).map(match => playerMap.get(match.p1Id)?.name).filter(Boolean),
  };
}

function generateSwissPairings(players, previousMatches) {
  const previousOpponentMap = new Map();
  (previousMatches || []).forEach(match => {
    if (match?.bye) return;
    if (!previousOpponentMap.has(match.p1Id)) previousOpponentMap.set(match.p1Id, new Set());
    if (!previousOpponentMap.has(match.p2Id)) previousOpponentMap.set(match.p2Id, new Set());
    previousOpponentMap.get(match.p1Id).add(match.p2Id);
    previousOpponentMap.get(match.p2Id).add(match.p1Id);
  });
  const activePlayers = [...players].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.wins !== a.wins) return b.wins - a.wins;
    if (a.losses !== b.losses) return a.losses - b.losses;
    return a.seed - b.seed;
  });
  const matches = [];
  let pool = [...activePlayers];
  if (pool.length % 2 === 1) {
    const byeCandidates = [...pool].sort((a, b) => {
      if (a.bye !== b.bye) return a.bye - b.bye;
      if (a.points !== b.points) return a.points - b.points;
      if (a.wins !== b.wins) return a.wins - b.wins;
      return b.seed - a.seed;
    });
    const byePlayer = byeCandidates[0];
    pool = pool.filter(player => player.id !== byePlayer.id);
    matches.push({
      id: `swiss-bye-${(previousMatches?.length || 0) + 1}-${byePlayer.id}`,
      p1Id: byePlayer.id,
      p2Id: null,
      bye: true,
      field: null,
    });
  }
  let field = 1;
  while (pool.length) {
    const p1 = pool.shift();
    if (!p1) break;
    let bestIndex = -1;
    let bestScore = Number.POSITIVE_INFINITY;
    pool.forEach((candidate, index) => {
      const alreadyPlayed = previousOpponentMap.get(p1.id)?.has(candidate.id) || false;
      const scoreGap = Math.abs((candidate.points || 0) - (p1.points || 0));
      const pairingScore = alreadyPlayed ? scoreGap + 100 : scoreGap;
      if (pairingScore < bestScore) {
        bestScore = pairingScore;
        bestIndex = index;
      }
    });
    const p2 = bestIndex === -1 ? pool.shift() : pool.splice(bestIndex, 1)[0];
    if (!p2) break;
    matches.push({
      id: `swiss-${(previousMatches?.length || 0) + 1}-${field}`,
      p1Id: p1.id,
      p2Id: p2.id,
      bye: false,
      field,
    });
    field += 1;
  }
  return matches;
}

function initializeSwissMode(teams, options) {
  const players = teams.map((name, index) => ({
    id: index + 1,
    seed: index,
    name,
    points: 0,
    matches: 0,
    wins: 0,
    losses: 0,
    bye: 0,
    opponents: [],
  }));
  const currentMatches = generateSwissPairings(players, []);
  const playerMap = new Map(players.map(player => [player.id, player]));
  const maxRounds = clampNumber(Math.ceil(Math.log2(Math.max(players.length, 2))) + 1, 3, 8, 4);
  return {
    format: 'swiss',
    rotations: [buildSwissRotation(1, currentMatches, playerMap)],
    teams: teams.map(name => ({ name })),
    swiss: {
      round: 1,
      maxRounds,
      players,
      currentMatches,
      history: [],
    },
    meta: {
      format: 'swiss',
      formatLabel: TOURNAMENT_MODES.swiss.label,
      teamCount: teams.length,
      matchCount: currentMatches.filter(match => !match.bye).length,
      fieldCount: clampNumber(Number(options.fields) || 1, 1, 20, 1),
      rotationCount: maxRounds,
      practiceType: options.practiceType,
      durationMinutes: Number(options.duration || 7),
    },
  };
}

function buildIntraPoolRotations(poolPlayers, teamSize, targetRotations) {
  const rotations = [];
  const usablePlayerCount = Math.floor(poolPlayers.length / teamSize) * teamSize;
  const usablePlayers = poolPlayers.slice(0, usablePlayerCount);
  const fixedByes = poolPlayers.slice(usablePlayerCount);
  const n = usablePlayers.length;
  const teamsPerRotation = Math.floor(n / teamSize);
  if (!teamsPerRotation) {
    return Array.from({ length: targetRotations }, () => ({ matches: [], byes: [...poolPlayers] }));
  }
  for (let rotationIndex = 0; rotationIndex < targetRotations; rotationIndex += 1) {
    const rotated = n > 1 ? [usablePlayers[0]] : [...usablePlayers];
    for (let index = 1; index < n; index += 1) {
      rotated.push(usablePlayers[1 + ((index - 1 + rotationIndex) % (n - 1))]);
    }
    const matches = [];
    const byes = [...fixedByes];
    for (let teamIndex = 0; teamIndex < teamsPerRotation; teamIndex += 2) {
      if (teamIndex + 1 >= teamsPerRotation) {
        byes.push(...rotated.slice(teamIndex * teamSize, (teamIndex + 1) * teamSize));
        break;
      }
      const home = rotated.slice(teamIndex * teamSize, (teamIndex + 1) * teamSize);
      const away = rotated.slice((teamIndex + 1) * teamSize, (teamIndex + 2) * teamSize);
      matches.push({ homePlayers: home, awayPlayers: away });
    }
    rotations.push({ matches, byes });
  }
  return rotations;
}

function validateRotatingSchedule(schedule) {
  if (!schedule || schedule.format !== 'rotating-teams') return;
  const players = schedule.rotatingTeams?.players || [];
  const poolMap = new Map();
  players.forEach(player => poolMap.set(player.name, player.poolId));
  schedule.rotations.forEach((rotation, rotationIndex) => {
    const seen = new Set();
    const addPlayer = (name, source) => {
      if (!name) {
        console.warn(`[validateRotating] Rotation ${rotationIndex + 1} — nom vide dans ${source}`);
        return;
      }
      if (seen.has(name)) {
        console.warn(`[validateRotating] Rotation ${rotationIndex + 1} — doublon : "${name}"`);
      }
      seen.add(name);
    };
    rotation.matches.forEach((match, matchIndex) => {
      const allPlayers = [...(match.homePlayers || []), ...(match.awayPlayers || [])];
      const pools = new Set(allPlayers.map(name => poolMap.get(name)).filter(Boolean));
      if (pools.size > 1) {
        console.warn(`[validateRotating] Rotation ${rotationIndex + 1} match ${matchIndex + 1} — MÉLANGE DE POULES : ${[...pools].join(', ')}`);
      }
      (match.homePlayers || []).forEach(name => addPlayer(name, 'homePlayers'));
      (match.awayPlayers || []).forEach(name => addPlayer(name, 'awayPlayers'));
    });
    (rotation.byes || []).forEach(name => addPlayer(name, 'byes'));
  });
}

function generateRotatingTeamsSchedule(teams, options) {
  const names = [...teams];
  const teamSize = clampNumber(Number(options.teamSize) || 3, 2, 8, 3);
  const minPlayersPerPool = teamSize * 2;
  let poolCount = options.organization === 'full-random'
    ? 1
    : Math.max(1, Math.min(Number(options.fields) || 1, Math.floor(names.length / minPlayersPerPool) || 1));
  poolCount = Math.max(1, poolCount);
  const pools = [];
  const basePoolSize = Math.floor(names.length / poolCount);
  const remainder = names.length % poolCount;
  let cursor = 0;
  for (let index = 0; index < poolCount; index += 1) {
    const size = basePoolSize + (index < remainder ? 1 : 0);
    pools.push({
      id: `P${index + 1}`,
      label: `Poule ${String.fromCharCode(65 + index)}`,
      players: names.slice(cursor, cursor + size),
    });
    cursor += size;
  }
  const targetRotations = getEstimatedRotationCount(names.length, options.fields, { teamBased: false });
  const rotationsByPool = pools.map(pool => buildIntraPoolRotations(pool.players, teamSize, targetRotations));
  const enabledRoles = getEnabledRolesFromOptions(options);
  const rotations = [];
  for (let rotationIndex = 0; rotationIndex < targetRotations; rotationIndex += 1) {
    const matches = [];
    const byes = [];
    let field = 1;
    pools.forEach((pool, poolIndex) => {
      const currentRotation = rotationsByPool[poolIndex][rotationIndex];
      currentRotation.matches.forEach(match => {
        matches.push({
          id: `rot-${rotationIndex + 1}-${field}`,
          field,
          poolId: pool.id,
          groupLabel: pool.label,
          homePlayers: [...match.homePlayers],
          awayPlayers: [...match.awayPlayers],
          phase: 'rotating-teams',
        });
        field += 1;
      });
      byes.push(...currentRotation.byes);
    });
    rotations.push({
      number: rotationIndex + 1,
      title: `Rotation ${rotationIndex + 1}`,
      phase: 'rotating-teams',
      matches,
      byes,
      byeAssignments: assignRolesForByes(byes, enabledRoles),
    });
  }
  const players = [];
  pools.forEach(pool => {
    pool.players.forEach((name, index) => {
      players.push({
        id: players.length + 1,
        name,
        poolId: pool.id,
        seed: index,
      });
    });
  });
  const schedule = {
    format: 'rotating-teams',
    rotations,
    teams: names.map(name => ({ name })),
    rotatingTeams: {
      organization: options.organization || 'pools',
      teamSize,
      players,
      pools: pools.map(pool => ({ id: pool.id, label: pool.label, playerIds: pool.players.map(name => players.find(player => player.name === name)?.id).filter(Boolean) })),
    },
    meta: {
      format: 'rotating-teams',
      formatLabel: TOURNAMENT_MODES['rotating-teams'].label,
      teamCount: names.length,
      matchCount: rotations.reduce((sum, rotation) => sum + rotation.matches.length, 0),
      fieldCount: clampNumber(Number(options.fields) || 1, 1, 20, 1),
      rotationCount: rotations.length,
      practiceType: options.practiceType,
      durationMinutes: Number(options.duration || 7),
    },
  };
  validateRotatingSchedule(schedule);
  return schedule;
}

function generateSchedule(teams, options) {
  const format = getTournamentType(options);
  if (format === 'round-robin') {
    return buildSinglePoolSchedule(teams, options);
  }
  if (format === 'groups-finals') {
    const groups = distributeIntoGroups(teams, { finals: true, targetGroups: 2 });
    return buildGroupedSchedule(groups, teams, options, { finals: true });
  }
  if (format === 'groups-pools') {
    return buildGroupPoolsRaquetteSchedule(teams, options);
  }
  if (format === 'rotating-teams') {
    return generateRotatingTeamsSchedule(teams, options);
  }
  if (format === 'ladder') {
    return buildLadderSchedule(teams, options);
  }
  if (format === 'swiss') {
    return initializeSwissMode(teams, options);
  }
  if (format === 'challenge') {
    return buildChallengeBoard(teams, options);
  }
  return buildSinglePoolSchedule(teams, options);
}

/* === Sauvegarde et restauration === */

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn('[EPS Tournoi] Données corrompues, réinitialisation.', error);
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    return null;
  }
}

function sanitizeState(raw) {
  const base = createDefaultState();
  const source = raw && typeof raw === 'object' ? raw : base;
  const next = {
    ...base,
    ...source,
    draft: {
      ...base.draft,
      ...(source.draft || {}),
    },
    timer: {
      ...base.timer,
      ...(source.timer || {}),
    },
  };
  next.view = ['home', 'new', 'sessions', 'live', 'summary', 'classrooms', 'classroom-detail'].includes(next.view) ? next.view : 'home';
  next.draft.sport = next.draft.sport === 'raquette' ? 'raquette' : 'sport-co';
  const allowedFormats = FORMAT_DEFINITIONS[next.draft.sport].map(item => item.id);
  next.draft.format = allowedFormats.includes(next.draft.format) ? next.draft.format : FORMAT_DEFINITIONS[next.draft.sport][0].id;
  next.draft.participantCount = clampSetupCount(next.draft.participantCount, 24);
  next.draft.fields = clampNumber(Number(next.draft.fields) || 2, 1, 20, 2);
  next.draft.challengeRange = clampNumber(Number(next.draft.challengeRange) || 5, 1, 10, 5);
  next.draft.poolSize = clampNumber(Number(next.draft.poolSize) || 4, 3, 6, 4);
  next.draft.duration = clampNumber(Number(next.draft.duration) || 7, 1, 60, 7);
  next.draft.startTime = next.draft.startTime || '10:00';
  next.draft.endTime = next.draft.endTime || '11:00';
  next.draft.teamNames = Array.isArray(next.draft.teamNames) ? next.draft.teamNames.map(value => String(value || '')) : [];
  next.draft.studentNamesText = String(next.draft.studentNamesText || '');
  next.draft.sessionName = String(next.draft.sessionName || '');
  next.currentSession = source.currentSession && typeof source.currentSession === 'object' ? source.currentSession : null;
  next.lastStatsSessionId = source.lastStatsSessionId || null;
  return next;
}

function persistState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...state,
      timer: {
        totalSeconds: state.timer.totalSeconds,
        remainingSeconds: state.timer.remainingSeconds,
        running: false,
      },
    }));
  } catch (error) {
    console.warn('Impossible de sauvegarder l’état principal', error);
  }
}

function loadStoredSessions() {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('[EPS Tournoi] Données corrompues, réinitialisation.', error);
    try { localStorage.removeItem(SESSIONS_KEY); } catch (_) {}
    return [];
  }
}

function saveStoredSessions(entries) {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(entries));
}

function loadClassrooms() {
  try {
    const raw = localStorage.getItem(CLASSROOMS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.warn('[EPS Tournoi] Données corrompues, réinitialisation.', error);
    try { localStorage.removeItem(CLASSROOMS_KEY); } catch (_) {}
    return [];
  }
}

function saveClassrooms(list) {
  localStorage.setItem(CLASSROOMS_KEY, JSON.stringify(Array.isArray(list) ? list : []));
}

function getClassroomById(id) {
  return loadClassrooms().find(classroom => classroom.id === id) || null;
}

function upsertClassroom(classroom) {
  if (!classroom?.id) return;
  const list = loadClassrooms().filter(entry => entry.id !== classroom.id);
  list.push(classroom);
  list.sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'fr'));
  saveClassrooms(list);
}

function deleteClassroom(id) {
  saveClassrooms(loadClassrooms().filter(classroom => classroom.id !== id));
}

function buildAppSaveSnapshot(session = state.currentSession) {
  if (!session) return null;
  return {
    id: session.id,
    savedAt: new Date().toISOString(),
    name: session.name,
    sport: session.sport,
    format: session.format,
    teams: [...session.teams],
    schedule: structuredClone(session.schedule),
    scores: structuredClone(session.scores),
    currentRotation: session.currentRotation,
    options: { ...session.options },
    completed: Boolean(session.completed),
    createdAt: session.createdAt,
    classroomId: session.classroomId || null,
    classroomName: session.classroomName || null,
    challengeOrder: session.challengeOrder ? [...session.challengeOrder] : undefined,
    challengeLog: session.challengeLog ? structuredClone(session.challengeLog) : undefined,
  };
}

function upsertStoredSession(snapshot) {
  if (!snapshot?.id) return;
  const sessions = loadStoredSessions().filter(entry => entry.id !== snapshot.id);
  sessions.push(snapshot);
  sessions.sort((left, right) => new Date(right.savedAt).getTime() - new Date(left.savedAt).getTime());
  saveStoredSessions(sessions);
}

function saveSessionLocally(session = state.currentSession) {
  const snapshot = buildAppSaveSnapshot(session);
  if (!snapshot) return null;
  upsertStoredSession(snapshot);
  state.lastStatsSessionId = snapshot.id;
  persistState();
  return snapshot;
}

function deleteStoredSession(sessionId) {
  saveStoredSessions(loadStoredSessions().filter(entry => entry.id !== sessionId));
  if (state.lastStatsSessionId === sessionId) {
    state.lastStatsSessionId = loadStoredSessions()[0]?.id || null;
    persistState();
  }
}

/* === Résolution des matches et statistiques === */

function getSessionById(sessionId) {
  return loadStoredSessions().find(session => session.id === sessionId) || null;
}

function getCurrentRotation(session = state.currentSession, index = session?.currentRotation ?? 0) {
  return session?.schedule?.rotations?.[index] || null;
}

function getScoreRecord(session, matchId) {
  return session?.scores?.[matchId] || null;
}

function isScoreComplete(record) {
  return Number.isFinite(record?.home) && Number.isFinite(record?.away);
}

function getGroupMatchesForStandings(session, groupId) {
  return session.schedule.rotations.flatMap(rotation => rotation.matches.filter(match => match.groupId === groupId));
}

function resolveSeedDescriptor(seed, session) {
  if (!seed) return '';
  if (seed.type === 'group') {
    const rows = computeTeamStandings(session, { scope: 'group', groupId: seed.groupId });
    return rows[seed.position - 1]?.name || '';
  }
  const sourceMatch = findMatchById(session, seed.matchId);
  if (!sourceMatch) return '';
  const participants = resolveMatchParticipants(sourceMatch, session);
  const record = getScoreRecord(session, sourceMatch.id);
  if (!isScoreComplete(record)) return '';
  if (record.home === record.away) return '';
  const winner = record.home > record.away ? participants.home : participants.away;
  const loser = record.home > record.away ? participants.away : participants.home;
  return seed.type === 'matchWinner' ? winner : loser;
}

function resolveMatchParticipants(match, session) {
  if (match.homePlayers && match.awayPlayers) {
    return {
      home: match.homePlayers.join(' · '),
      away: match.awayPlayers.join(' · '),
      homePlayers: [...match.homePlayers],
      awayPlayers: [...match.awayPlayers],
      unresolved: false,
    };
  }
  if (match.seedHome || match.seedAway) {
    const homeResolved = resolveSeedDescriptor(match.seedHome, session);
    const awayResolved = resolveSeedDescriptor(match.seedAway, session);
    return {
      home: homeResolved || match.placeholderHome || 'À déterminer',
      away: awayResolved || match.placeholderAway || 'À déterminer',
      homePlayers: [],
      awayPlayers: [],
      unresolved: !homeResolved || !awayResolved,
    };
  }
  return {
    home: match.home,
    away: match.away,
    homePlayers: [],
    awayPlayers: [],
    unresolved: false,
  };
}

function findMatchById(session, matchId) {
  for (const rotation of session.schedule.rotations) {
    const found = rotation.matches.find(match => match.id === matchId);
    if (found) return found;
  }
  return null;
}

function createStatsRow(name) {
  return {
    name,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    points: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    goalDiff: 0,
    badges: [],
  };
}

function computeTeamStandings(session, options = {}) {
  const sourceNames = options.scope === 'group'
    ? (session.schedule.groups.find(group => group.id === options.groupId)?.teams || [])
    : [...session.teams];
  const rows = new Map(sourceNames.map(name => [name, createStatsRow(name)]));
  session.schedule.rotations.forEach(rotation => {
    rotation.matches.forEach(match => {
      if (options.scope === 'group' && match.groupId !== options.groupId) return;
      const participants = resolveMatchParticipants(match, session);
      if (participants.unresolved) return;
      const record = getScoreRecord(session, match.id);
      if (!isScoreComplete(record)) return;
      const home = rows.get(participants.home) || createStatsRow(participants.home);
      const away = rows.get(participants.away) || createStatsRow(participants.away);
      rows.set(participants.home, home);
      rows.set(participants.away, away);
      home.played += 1;
      away.played += 1;
      home.pointsFor += record.home;
      home.pointsAgainst += record.away;
      away.pointsFor += record.away;
      away.pointsAgainst += record.home;
      if (record.home > record.away) {
        home.wins += 1;
        away.losses += 1;
        home.points += 3;
      } else if (record.away > record.home) {
        away.wins += 1;
        home.losses += 1;
        away.points += 3;
      } else {
        home.draws += 1;
        away.draws += 1;
        home.points += 1;
        away.points += 1;
      }
    });
  });
  const ranking = [...rows.values()].map(row => ({
    ...row,
    goalDiff: row.pointsFor - row.pointsAgainst,
  }));
  ranking.sort((left, right) => {
    if (right.points !== left.points) return right.points - left.points;
    if (right.goalDiff !== left.goalDiff) return right.goalDiff - left.goalDiff;
    if (right.pointsFor !== left.pointsFor) return right.pointsFor - left.pointsFor;
    return left.name.localeCompare(right.name, 'fr');
  });
  if (ranking.length) {
    const bestAttack = Math.max(...ranking.map(row => row.pointsFor));
    const bestDefense = Math.min(...ranking.map(row => row.pointsAgainst));
    ranking.forEach(row => {
      if (row.pointsFor === bestAttack) row.badges.push('Meilleure attaque');
      if (row.pointsAgainst === bestDefense) row.badges.push('Meilleure défense');
      if (row.pointsAgainst === bestDefense) row.badges.push('Fair-play');
    });
  }
  return ranking;
}

function computeRotatingPlayerStats(session) {
  const players = session.schedule.rotatingTeams?.players?.map(player => player.name) || [...session.teams];
  const rows = new Map(players.map(name => [name, createStatsRow(name)]));
  session.schedule.rotations.forEach(rotation => {
    rotation.matches.forEach(match => {
      const record = getScoreRecord(session, match.id);
      if (!isScoreComplete(record)) return;
      const homePlayers = match.homePlayers || [];
      const awayPlayers = match.awayPlayers || [];
      homePlayers.forEach(name => {
        const row = rows.get(name);
        if (!row) return;
        row.played += 1;
        row.pointsFor += record.home;
        row.pointsAgainst += record.away;
        if (record.home > record.away) {
          row.wins += 1;
          row.points += 3;
        } else if (record.home < record.away) {
          row.losses += 1;
        } else {
          row.draws += 1;
          row.points += 1;
        }
      });
      awayPlayers.forEach(name => {
        const row = rows.get(name);
        if (!row) return;
        row.played += 1;
        row.pointsFor += record.away;
        row.pointsAgainst += record.home;
        if (record.away > record.home) {
          row.wins += 1;
          row.points += 3;
        } else if (record.away < record.home) {
          row.losses += 1;
        } else {
          row.draws += 1;
          row.points += 1;
        }
      });
    });
  });
  const ranking = [...rows.values()].map(row => ({
    ...row,
    goalDiff: row.pointsFor - row.pointsAgainst,
    ratio: row.played ? row.wins / row.played : 0,
  }));
  ranking.sort((left, right) => {
    if (right.wins !== left.wins) return right.wins - left.wins;
    if (right.points !== left.points) return right.points - left.points;
    if (right.goalDiff !== left.goalDiff) return right.goalDiff - left.goalDiff;
    return left.name.localeCompare(right.name, 'fr');
  });
  if (ranking[0]) {
    ranking[0].badges.push('Meilleur joueur');
  }
  return ranking;
}

function computeIndividualStandings(session) {
  if (session.format === 'rotating-teams') {
    return computeRotatingPlayerStats(session);
  }
  const rows = new Map(session.teams.map(name => [name, createStatsRow(name)]));
  session.schedule.rotations.forEach(rotation => {
    rotation.matches.forEach(match => {
      const participants = resolveMatchParticipants(match, session);
      const record = getScoreRecord(session, match.id);
      if (!isScoreComplete(record) || participants.unresolved) return;
      const home = rows.get(participants.home) || createStatsRow(participants.home);
      const away = rows.get(participants.away) || createStatsRow(participants.away);
      rows.set(participants.home, home);
      rows.set(participants.away, away);
      home.played += 1;
      away.played += 1;
      home.pointsFor += record.home;
      home.pointsAgainst += record.away;
      away.pointsFor += record.away;
      away.pointsAgainst += record.home;
      if (record.home > record.away) {
        home.wins += 1;
        home.points += 1;
        away.losses += 1;
      } else if (record.away > record.home) {
        away.wins += 1;
        away.points += 1;
        home.losses += 1;
      } else {
        home.draws += 1;
        away.draws += 1;
        home.points += 1;
        away.points += 1;
      }
    });
  });
  const ranking = [...rows.values()].map(row => ({
    ...row,
    goalDiff: row.pointsFor - row.pointsAgainst,
    ratio: row.played ? row.wins / row.played : 0,
  }));
  ranking.sort((left, right) => {
    if (right.points !== left.points) return right.points - left.points;
    if (right.wins !== left.wins) return right.wins - left.wins;
    if (right.goalDiff !== left.goalDiff) return right.goalDiff - left.goalDiff;
    return left.name.localeCompare(right.name, 'fr');
  });
  if (ranking[0]) {
    ranking[0].badges.push('Meilleur joueur');
  }
  return ranking;
}

function computeStandings(session) {
  if (!session) return [];
  if (session.format === 'challenge') {
    const order = session.challengeOrder || session.schedule.teams.map(t => t.name);
    return order.map((name, idx) => {
      const log = session.challengeLog || [];
      const asChallenger = log.filter(l => l.challenger === name);
      const asTarget = log.filter(l => l.target === name);
      const wins = asChallenger.filter(l => !l.isDraw && l.challengerWon).length
                 + asTarget.filter(l => !l.isDraw && !l.challengerWon).length;
      const losses = asChallenger.filter(l => !l.isDraw && !l.challengerWon).length
                   + asTarget.filter(l => !l.isDraw && l.challengerWon).length;
      const draws = log.filter(l => l.isDraw && (l.challenger === name || l.target === name)).length;
      const played = asChallenger.length + asTarget.length;
      const totalFor = asChallenger.reduce((s, l) => s + (l.challengerScore || 0), 0)
                     + asTarget.reduce((s, l) => s + (l.targetScore || 0), 0);
      const totalAgainst = asChallenger.reduce((s, l) => s + (l.targetScore || 0), 0)
                         + asTarget.reduce((s, l) => s + (l.challengerScore || 0), 0);
      return {
        name,
        rank: idx + 1,
        wins,
        losses,
        draws,
        played,
        points: wins,
        pointsFor: totalFor,
        pointsAgainst: totalAgainst,
        goalDiff: totalFor - totalAgainst,
        ratio: played ? wins / played : 0,
        badges: [],
        challengesMade: asChallenger.length,
        challengesReceived: asTarget.length,
      };
    });
  }
  if (session.sport === 'sport-co' && session.format !== 'rotating-teams') {
    return computeTeamStandings(session);
  }
  return computeIndividualStandings(session);
}

function computeStudentStatsFromSession(session) {
  const standings = computeStandings(session);
  return standings.map((row, index) => ({
    name: row.name,
    played: row.played,
    wins: row.wins,
    losses: row.losses,
    draws: row.draws,
    pointsFor: row.pointsFor,
    pointsAgainst: row.pointsAgainst,
    finalRank: index + 1,
  }));
}

function mergeStudentIntoClassroom(classroom, studentStats, sessionId) {
  if (!classroom || !Array.isArray(studentStats)) return classroom;
  if (!Array.isArray(classroom.students)) classroom.students = [];
  if (!Array.isArray(classroom.sessionIds)) classroom.sessionIds = [];
  if (classroom.sessionIds.includes(sessionId)) return classroom;
  studentStats.forEach(stat => {
    let student = classroom.students.find(entry => entry.name === stat.name);
    if (!student) {
      student = {
        name: stat.name,
        totalPlayed: 0,
        totalWins: 0,
        totalLosses: 0,
        totalDraws: 0,
        totalPointsFor: 0,
        totalPointsAgainst: 0,
        bestRank: null,
        lastRank: null,
        sessionsCount: 0,
      };
      classroom.students.push(student);
    }
    student.totalPlayed += stat.played || 0;
    student.totalWins += stat.wins || 0;
    student.totalLosses += stat.losses || 0;
    student.totalDraws += stat.draws || 0;
    student.totalPointsFor += stat.pointsFor || 0;
    student.totalPointsAgainst += stat.pointsAgainst || 0;
    student.sessionsCount += 1;
    student.bestRank = student.bestRank == null ? stat.finalRank : Math.min(student.bestRank, stat.finalRank);
    student.lastRank = stat.finalRank;
  });
  classroom.sessionIds.push(sessionId);
  return classroom;
}

/* === Navigation entre vues === */

function showView(viewName) {
  state.view = viewName;
  document.querySelectorAll('.view').forEach(section => {
    section.classList.toggle('active', section.dataset.view === viewName);
  });
  if (viewName === 'home') renderHomeView();
  if (viewName === 'new') renderNewTournamentView();
  if (viewName === 'sessions') renderSessionsView();
  if (viewName === 'live') renderLiveView();
  if (viewName === 'summary') renderSummaryView();
  if (viewName === 'classrooms') renderClassroomsView();
  persistState();
}

/* === Vue 2 — formulaire nouveau tournoi === */

function updateDraftSessionNamePlaceholder() {
  if (!dom.sessionNameInput) return;
  const formatTitle = getCurrentFormatDefinition().title;
  const sportTitle = state.draft.sport === 'raquette' ? 'Badminton' : 'Handball';
  dom.sessionNameInput.placeholder = `Classe 5e A - ${sportTitle} · ${formatTitle}`;
}

function renderFormatCards() {
  const cards = FORMAT_DEFINITIONS[state.draft.sport]
    .map(entry => `
      <button class="format-card ${state.draft.format === entry.id ? 'selected' : ''}" type="button" data-format="${entry.id}">
        <div>
          <strong>${entry.icon} ${escapeHtml(entry.title)}</strong>
          <span>${escapeHtml(entry.description)}</span>
        </div>
        ${entry.recommended ? '<span class="format-badge">Recommandé</span>' : ''}
      </button>
    `)
    .join('');
  dom.formatCards.innerHTML = cards;
}

function renderConfigSuggestions() {
  if (!isTeamBasedDraft()) {
    dom.configSuggestions.innerHTML = '';
    return;
  }
  const suggestions = getSuggestedTeamConfigurations(state.draft.participantCount);
  if (!suggestions.length) {
    dom.configSuggestions.innerHTML = '';
    return;
  }
  const selected = getSelectedConfiguration();
  dom.configSuggestions.innerHTML = suggestions
    .map(entry => `<button class="suggestion-chip ${selected?.key === entry.key ? 'selected' : ''}" type="button" data-config-key="${entry.key}">✓ ${escapeHtml(entry.label)}</button>`)
    .join('');
}

function renderTeamNameFields() {
  const config = getSelectedConfiguration();
  const shouldShow = isTeamBasedDraft() && config;
  dom.teamNamesSection.classList.toggle('hidden', !shouldShow);
  dom.studentNamesSection.classList.toggle('hidden', shouldShow);
  if (!shouldShow) {
    dom.teamNamesGrid.innerHTML = '';
    return;
  }
  const names = getDraftTeamNames(config);
  dom.teamNamesGrid.innerHTML = names
    .map((name, index) => `
      <div class="name-row">
        <label for="teamName_${index}">Équipe ${index + 1}</label>
        <input id="teamName_${index}" type="text" data-team-name-index="${index}" value="${escapeHtml(name)}" maxlength="30" />
      </div>
    `)
    .join('');
}

function renderParticipantSection() {
  dom.participantCountInput.value = state.draft.participantCount;
  dom.participantCountLabel.textContent = String(state.draft.participantCount);
  renderConfigSuggestions();
  renderTeamNameFields();
  const showStudentNames = state.draft.sport === 'raquette' || state.draft.format === 'rotating-teams';
  dom.studentNamesSection.classList.toggle('hidden', !showStudentNames || (isTeamBasedDraft() && Boolean(getSelectedConfiguration())));
  dom.studentNamesInput.value = state.draft.studentNamesText;
  let oddAlert = document.getElementById('oddCountAlert');
  if (!oddAlert) {
    oddAlert = document.createElement('div');
    oddAlert.id = 'oddCountAlert';
    oddAlert.style.cssText = [
      'display:none',
      'margin-top:12px',
      'padding:12px 16px',
      'border-radius:14px',
      'background:#fef9c3',
      'border:1px solid #ca8a04',
      'color:#92400e',
      'font-weight:600',
      'font-size:0.92rem',
      'line-height:1.45',
    ].join(';');
    const anchor = dom.configSuggestions || dom.participantCountLabel?.closest('.panel-card');
    if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(oddAlert, anchor.nextSibling);
  }
  const isIndividual = !isTeamBasedDraft();
  const isOdd = state.draft.participantCount % 2 === 1;
  if (isIndividual && isOdd) {
    oddAlert.style.display = '';
    oddAlert.textContent = `⚠️ Nombre impair (${state.draft.participantCount} joueurs) — un joueur sera exempt (bye) à chaque rotation. Prévoyez une tâche pour le joueur au repos.`;
  } else {
    oddAlert.style.display = 'none';
  }
}

function renderTimeSection() {
  dom.fieldCountInput.value = state.draft.fields;
  dom.fieldCountLabel.textContent = String(state.draft.fields);
  dom.startTimeInput.value = state.draft.startTime;
  dom.endTimeInput.value = state.draft.endTime;
  dom.matchDurationInput.value = state.draft.duration;
  dom.matchDurationLabel.textContent = `${state.draft.duration} min`;
  const config = getSelectedConfiguration();
  const effectiveCount = isTeamBasedDraft() && config ? config.teamCount : state.draft.participantCount;
  const availableWindow = getAvailableWindow(state.draft).availableMinutes;
  const rotationEstimate = getEstimatedRotationCount(effectiveCount, state.draft.fields, {
    teamBased: isTeamBasedDraft(),
  });
  const suggestedDuration = getSuggestedDurationFromWindow(availableWindow, rotationEstimate, state.draft.duration);
  const slotLabel = availableWindow == null
    ? `${state.draft.duration} min par match`
    : `${availableWindow} min · Durée suggérée : ${suggestedDuration} min/match · ${rotationEstimate} rotations`;
  dom.timingSummary.innerHTML = availableWindow == null
    ? `<strong>Durée</strong> : ${slotLabel}`
    : `<strong>Créneau</strong> : ${slotLabel}`;
}

function renderNewTournamentView() {
  document.querySelectorAll('[data-sport]').forEach(button => {
    button.classList.toggle('selected', button.dataset.sport === state.draft.sport);
  });
  renderFormatCards();
  renderParticipantSection();
  renderTimeSection();
  dom.rotatingRefereeInput.checked = Boolean(state.draft.rotatingReferee);
  dom.scoreTableInput.checked = Boolean(state.draft.scoreTable);
  dom.sessionNameInput.value = state.draft.sessionName;
  updateDraftSessionNamePlaceholder();
  const isChallenge = state.draft.format === 'challenge';
  if (dom.challengeRangeBlock) {
    dom.challengeRangeBlock.style.display = isChallenge ? '' : 'none';
    if (dom.challengeRangeInput) dom.challengeRangeInput.value = state.draft.challengeRange;
    if (dom.challengeRangeLabel) dom.challengeRangeLabel.textContent = `±${state.draft.challengeRange}`;
  }
  const isGroupPools = state.draft.format === 'groups-pools';
  if (dom.poolSizeBlock) {
    dom.poolSizeBlock.style.display = isGroupPools ? '' : 'none';
    if (dom.poolSizeInput) dom.poolSizeInput.value = state.draft.poolSize;
    if (dom.poolSizeLabel) dom.poolSizeLabel.textContent = `${state.draft.poolSize}`;
  }
}

function buildLaunchOptions() {
  const config = getSelectedConfiguration();
  const options = {
    sport: state.draft.sport,
    format: state.draft.format,
    fields: state.draft.fields,
    startTime: state.draft.startTime,
    endTime: state.draft.endTime,
    duration: state.draft.duration,
    practiceType: state.draft.sport === 'raquette' ? 'raquette' : state.draft.format === 'rotating-teams' ? 'eleve' : 'sport-co',
    teamSize: config?.teamSize || 3,
    organization: 'pools',
    rotatingReferee: Boolean(state.draft.rotatingReferee),
    scoreTable: Boolean(state.draft.scoreTable),
    challengeRange: state.draft.challengeRange || 5,
    poolSize: state.draft.poolSize || 4,
  };
  return options;
}

function createSessionName(options) {
  const trimmed = String(state.draft.sessionName || '').trim();
  if (trimmed) return trimmed;
  const sportLabel = options.sport === 'raquette' ? 'Badminton' : 'Tournoi';
  const formatLabel = getCurrentFormatDefinition().title;
  return `${sportLabel} · ${formatLabel} · ${new Date().toLocaleDateString('fr-FR')}`;
}

function createTeamsForLaunch(options) {
  const config = getSelectedConfiguration();
  if (options.sport === 'sport-co' && options.format !== 'rotating-teams') {
    const teamCount = config?.teamCount || 4;
    const names = getDraftTeamNames(config || { teamCount });
    return ensureTeamListLength(names, teamCount, 'Équipe');
  }
  const count = state.draft.participantCount;
  return getDraftStudentNames(count);
}

async function launchTournament() {
  const options = buildLaunchOptions();
  const teams = createTeamsForLaunch(options);
  const schedule = generateSchedule(teams, options);
  const session = {
    id: uniqueId('session'),
    createdAt: new Date().toISOString(),
    savedAt: new Date().toISOString(),
    name: createSessionName(options),
    sport: options.sport,
    format: options.format,
    teams: [...teams],
    schedule,
    scores: {},
    currentRotation: 0,
    options: {
      fields: options.fields,
      duration: options.duration,
      startTime: options.startTime,
      endTime: options.endTime,
      teamSize: options.teamSize,
      poolSize: options.poolSize,
      rotatingReferee: options.rotatingReferee,
      scoreTable: options.scoreTable,
      challengeRange: options.challengeRange,
    },
    completed: false,
  };
  if (session.format === 'challenge') {
    session.challengeOrder = session.schedule.teams.map(t => t.name);
    session.challengeLog = [];
    session.options.challengeRange = options.challengeRange || 5;
  }
  const classroomChoice = await promptClassroomChoice();
  if (classroomChoice) {
    const classroom = getClassroomById(classroomChoice);
    session.classroomId = classroom?.id || null;
    session.classroomName = classroom?.name || null;
  } else {
    session.classroomId = null;
    session.classroomName = null;
  }
  state.currentSession = session;
  resetTimer();
  saveSessionLocally(session);
  showView('live');
}

/* === Vue 4 — pilotage live === */

function getSessionCurrentRotationCount(session) {
  return session?.schedule?.meta?.rotationCount || session?.schedule?.rotations?.length || 0;
}

function resetTimer() {
  clearInterval(runtime.timerInterval);
  runtime.timerInterval = null;
  const durationSeconds = (state.currentSession?.options?.duration || 7) * 60;
  state.timer.totalSeconds = durationSeconds;
  state.timer.remainingSeconds = durationSeconds;
  state.timer.running = false;
  renderTimer();
  persistState();
}

function renderTimer() {
  if (!dom.timerLabel) return;
  const total = Math.max(state.timer.totalSeconds, 1);
  const remaining = Math.max(state.timer.remainingSeconds, 0);
  const minutes = String(Math.floor(remaining / 60)).padStart(2, '0');
  const seconds = String(remaining % 60).padStart(2, '0');
  dom.timerLabel.textContent = `⏱ ${minutes}:${seconds}`;
  dom.timerStatus.textContent = state.timer.running ? 'En cours' : remaining === total ? 'Prêt' : remaining === 0 ? 'Terminé' : 'Pause';
  dom.timerProgressBar.style.width = `${((total - remaining) / total) * 100}%`;
}

function startTimer() {
  if (state.timer.running) return;
  state.timer.running = true;
  renderTimer();
  runtime.timerInterval = window.setInterval(() => {
    state.timer.remainingSeconds = Math.max(0, state.timer.remainingSeconds - 1);
    if (state.timer.remainingSeconds === 0) {
      if (typeof AudioContext !== 'undefined') {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.4, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
        osc.start(); osc.stop(ctx.currentTime + 0.8);
      }
      if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      pauseTimer();
    }
    renderTimer();
  }, 1000);
}

function pauseTimer() {
  state.timer.running = false;
  clearInterval(runtime.timerInterval);
  runtime.timerInterval = null;
  renderTimer();
}

function isCurrentRotationEditable(session, rotationIndex) {
  return rotationIndex === session.currentRotation;
}

function adjustScore(matchId, side, delta) {
  const session = state.currentSession;
  if (!session) return;
  const current = session.scores[matchId] || { home: 0, away: 0 };
  const nextValue = Math.max(0, Number(current[side] || 0) + delta);
  session.scores[matchId] = {
    home: side === 'home' ? nextValue : Number(current.home || 0),
    away: side === 'away' ? nextValue : Number(current.away || 0),
  };
  saveSessionLocally(session);
  renderLiveView();
}

function setRotatingOutcome(matchId, outcome) {
  const session = state.currentSession;
  if (!session) return;
  if (outcome === 'home') {
    session.scores[matchId] = { home: 1, away: 0 };
  } else if (outcome === 'away') {
    session.scores[matchId] = { home: 0, away: 1 };
  } else {
    session.scores[matchId] = { home: 1, away: 1 };
  }
  saveSessionLocally(session);
  renderLiveView();
}

function autoSave() {
  if (!state.currentSession) return;
  saveSessionLocally(state.currentSession);
}

function finishTournament() {
  if (!state.currentSession) return;
  state.currentSession.completed = true;
  if (state.currentSession.classroomId) {
    const classroom = getClassroomById(state.currentSession.classroomId);
    if (classroom) {
      const stats = computeStudentStatsFromSession(state.currentSession);
      mergeStudentIntoClassroom(classroom, stats, state.currentSession.id);
      upsertClassroom(classroom);
    }
  }
  saveSessionLocally(state.currentSession);
  showView('summary');
}

function renderRankingDrawer(session) {
  const standings = computeStandings(session);
  if (!standings.length) {
    dom.liveRankingContent.innerHTML = '<div class="empty-state">Aucun résultat saisi pour le moment.</div>';
    return;
  }
  dom.liveRankingContent.innerHTML = renderStandingsTable(session, standings);
}

function getRoleBadgeStyle(role) {
  if (role === 'Arbitre') return 'background:rgba(249,115,22,0.14);color:#c2410c;border:1px solid rgba(249,115,22,0.3);';
  if (role === 'Table') return 'background:rgba(59,130,246,0.14);color:#1d4ed8;border:1px solid rgba(59,130,246,0.3);';
  if (role === 'Coach') return 'background:rgba(34,197,94,0.14);color:#15803d;border:1px solid rgba(34,197,94,0.3);';
  return 'background:rgba(15,23,42,0.06);color:var(--text-soft);border:1px solid rgba(148,163,184,0.25);';
}

function renderByeAssignmentsBlock(assignments, session) {
  if (!Array.isArray(assignments) || !assignments.length) return '';
  return `<div style="margin-top:16px;padding:14px 16px;border-radius:16px;background:#fef9c3;border:1px solid #ca8a04;color:#92400e;font-weight:600;">
    ⚠️ Élève(s) au repos cette rotation :
    <div style="display:grid;gap:8px;margin-top:10px;">
      ${assignments.map(entry => `
        <div style="display:flex;flex-wrap:wrap;align-items:center;gap:8px;">
          <strong>${escapeHtml(session && session.sport === 'sport-co' && session.format !== 'rotating-teams' ? entry.name : formatDisplayName(entry.name))}</strong>
          <span style="display:inline-flex;align-items:center;justify-content:center;padding:4px 10px;border-radius:999px;font-size:0.8rem;font-weight:700;${getRoleBadgeStyle(entry.role)}">${escapeHtml(entry.role)}</span>
        </div>
      `).join('')}
    </div>
   </div>`;
}

function renderLiveMatches(session) {
  const rotation = getCurrentRotation(session);
  if (!rotation) {
    dom.liveMatches.innerHTML = '<div class="empty-state">Aucune rotation disponible.</div>';
    return;
  }
  const editable = isCurrentRotationEditable(session, session.currentRotation);
  const enabledRoles = getEnabledRolesFromOptions(session.options || {});
  const exemptPlayers = [...(rotation.byes || [])];
  const byeAssignments = Array.isArray(rotation.byeAssignments) && rotation.byeAssignments.length
    ? rotation.byeAssignments
    : assignRolesForByes(exemptPlayers, enabledRoles);
  const visibleMatches = rotation.matches.filter(match => {
    const p = resolveMatchParticipants(match, session);
    if (p.home === 'Exempt') { exemptPlayers.push(p.away); return false; }
    if (p.away === 'Exempt') { exemptPlayers.push(p.home); return false; }
    return true;
  });

  const matchesHtml = visibleMatches.map(match => {
    const participants = resolveMatchParticipants(match, session);
    const record = session.scores[match.id] || { home: 0, away: 0 };
    const complete = isScoreComplete(getScoreRecord(session, match.id));
    const subtitle = match.groupLabel ? `${match.groupLabel}` : rotation.title;
    if (session.format === 'rotating-teams') {
      const selectedOutcome = record.home > record.away ? 'home' : record.away > record.home ? 'away' : isScoreComplete(record) ? 'draw' : '';
      return `
        <article class="live-card ${complete ? '' : 'live-card--incomplete'}">
          <div class="live-card-head">
            <div>
              <p class="section-kicker">Terrain ${match.field}</p>
              <h3>${escapeHtml(subtitle)}</h3>
            </div>
          </div>
          <div class="rotating-side">${escapeHtml((match.homePlayers || []).map(name => formatDisplayName(name)).join(' · '))}</div>
          <div class="vs-badge">vs</div>
          <div class="rotating-side">${escapeHtml((match.awayPlayers || []).map(name => formatDisplayName(name)).join(' · '))}</div>
          <div class="team-result-stack">
            <button class="team-result-btn ${selectedOutcome === 'home' ? 'selected' : ''}" type="button" data-rotating-outcome="home" data-match-id="${match.id}" ${editable ? '' : 'disabled'}>Équipe locale gagne</button>
            <button class="team-result-btn ${selectedOutcome === 'away' ? 'selected' : ''}" type="button" data-rotating-outcome="away" data-match-id="${match.id}" ${editable ? '' : 'disabled'}>Visiteurs gagnent</button>
            <button class="team-result-btn ${selectedOutcome === 'draw' ? 'selected' : ''}" type="button" data-rotating-outcome="draw" data-match-id="${match.id}" ${editable ? '' : 'disabled'}>Match nul</button>
          </div>
        </article>
      `;
    }
    const displayHome = session.sport === 'raquette' ? formatDisplayName(participants.home) : participants.home;
    const displayAway = session.sport === 'raquette' ? formatDisplayName(participants.away) : participants.away;
    const extraInfo = [
      match.referee ? `<p style="margin:10px 0 0;color:#c2410c;font-weight:700;">🟠 Arbitre : ${escapeHtml(match.referee)}</p>` : '',
      match.ladderReferee ? `<p style="margin:10px 0 0;color:#c2410c;font-weight:700;">🟠 Arbitre : ${escapeHtml(formatDisplayName(match.ladderReferee))}</p>` : '',
      match.swissNote ? `<p style="margin:10px 0 0;color:var(--text-soft);font-style:italic;">${escapeHtml(match.swissNote)}</p>` : '',
    ].filter(Boolean).join('');
    return `
      <article class="live-card ${complete ? '' : 'live-card--incomplete'}">
        <div class="live-card-head">
          <div>
            <p class="section-kicker">Terrain ${match.field}</p>
            <h3>${escapeHtml(subtitle)}</h3>
          </div>
        </div>
        <div class="score-row">
          <div class="score-name">${escapeHtml(displayHome)}</div>
          <button class="score-btn" type="button" data-score-step="-1" data-score-side="home" data-match-id="${match.id}" ${editable && !participants.unresolved ? '' : 'disabled'}>−</button>
          <div class="score-value">${record.home ?? 0}</div>
          <button class="score-btn" type="button" data-score-step="1" data-score-side="home" data-match-id="${match.id}" ${editable && !participants.unresolved ? '' : 'disabled'}>+</button>
          <div></div>
        </div>
        <div class="vs-badge">──</div>
        <div class="score-row">
          <div class="score-name">${escapeHtml(displayAway)}</div>
          <button class="score-btn" type="button" data-score-step="-1" data-score-side="away" data-match-id="${match.id}" ${editable && !participants.unresolved ? '' : 'disabled'}>−</button>
          <div class="score-value">${record.away ?? 0}</div>
          <button class="score-btn" type="button" data-score-step="1" data-score-side="away" data-match-id="${match.id}" ${editable && !participants.unresolved ? '' : 'disabled'}>+</button>
          <div></div>
        </div>
        ${extraInfo}
      </article>
    `;
  }).join('');

  const effectiveByeAssignments = session.format === 'rotating-teams'
    ? (rotation.byeAssignments || byeAssignments)
    : assignRolesForByes(exemptPlayers, enabledRoles);
  const exemptHtml = renderByeAssignmentsBlock(effectiveByeAssignments, session);

  dom.liveMatches.innerHTML = matchesHtml + exemptHtml;
}

function renderChallengeLive(session) {
  dom.liveModeLabel.textContent = 'Défi';
  dom.liveSessionTitle.textContent = session.name;
  const logCount = session.challengeLog?.length || 0;
  dom.liveRotationLabel.textContent = `${logCount} défi${logCount > 1 ? 's' : ''} joué${logCount > 1 ? 's' : ''}`;

  dom.timerStatus.textContent = 'Libre';
  dom.timerLabel.textContent = '⏱ —';
  dom.timerProgressBar.style.width = '0%';
  dom.timerStartBtn.disabled = true;
  dom.timerPauseBtn.disabled = true;
  dom.timerResetBtn.disabled = true;
  dom.prevRotationBtn.disabled = true;
  if (!dom.nextRotationBtn._challengeHandlerSet) {
    dom.nextRotationBtn.addEventListener('click', () => {
      if (state.currentSession?.format === 'challenge') finishTournament();
    });
    dom.nextRotationBtn._challengeHandlerSet = true;
  }
  dom.nextRotationBtn.textContent = '🏁 Terminer';
  dom.nextRotationBtn.disabled = false;

  const challengeRange = session.options.challengeRange || 5;
  session.challengeOrder = Array.isArray(session.challengeOrder) && session.challengeOrder.length
    ? session.challengeOrder
    : session.schedule.teams.map(t => t.name);
  const order = session.challengeOrder;

  dom.liveMatches.innerHTML = `
    <div class="challenge-board">
      <p id="challengeHint" style="color:var(--text-soft);margin-bottom:12px;min-height:1.4em;transition:color 0.2s;">
        Tape sur un joueur pour voir contre qui il peut jouer.
      </p>
      <div class="challenge-list" id="challengeList">
        ${order.map((name, idx) => `
          <button class="challenge-row" type="button" data-challenge-index="${idx}" title="Rang ${idx + 1} — peut défier jusqu'à ±${challengeRange} joueurs mieux classés">
            <span class="challenge-rank">${idx + 1}</span>
            <span class="challenge-name">${escapeHtml(formatDisplayName(name))}</span>
            <span class="challenge-action">${idx === 0 ? '' : '⚔️'}</span>
          </button>
        `).join('')}
      </div>
    </div>
    <div class="challenge-modal hidden" id="challengeModal">
      <div class="challenge-modal-inner">
        <h3 id="challengerTitle"></h3>
        <p id="challengeTargetLabel"></p>
        <div class="challenge-score-form hidden" id="challengeScoreForm">
          <div class="score-row" style="max-width:320px;margin:0 auto">
            <div class="score-name" id="challengeHomeName"></div>
            <button class="score-btn" type="button" id="challengeHomeMin">−</button>
            <div class="score-value" id="challengeHomeVal">0</div>
            <button class="score-btn" type="button" id="challengeHomePlus">+</button>
            <div></div>
          </div>
          <div class="vs-badge">──</div>
          <div class="score-row" style="max-width:320px;margin:0 auto">
            <div class="score-name" id="challengeAwayName"></div>
            <button class="score-btn" type="button" id="challengeAwayMin">−</button>
            <div class="score-value" id="challengeAwayVal">0</div>
            <button class="score-btn" type="button" id="challengeAwayPlus">+</button>
            <div></div>
          </div>
          <div style="display:flex;gap:12px;margin-top:18px">
            <button class="btn btn-primary btn-lg" type="button" id="challengeConfirmBtn" style="flex:1">✓ Valider</button>
            <button class="btn btn-secondary btn-lg" type="button" id="challengeCancelBtn" style="flex:1">Annuler</button>
          </div>
        </div>
      </div>
    </div>
  `;

  let highlightTimeout = null;
  let selectedChallengerIdx = null;

  function clearHighlight() {
    if (highlightTimeout) { clearTimeout(highlightTimeout); highlightTimeout = null; }
    selectedChallengerIdx = null;
    document.querySelectorAll('#challengeList .challenge-row').forEach(btn => {
      btn.classList.remove('challenge-selected', 'challenge-target', 'challenge-challenger', 'challenge-dimmed');
    });
    const hint = document.getElementById('challengeHint');
    if (hint) {
      hint.textContent = 'Tape sur un joueur pour voir contre qui il peut jouer.';
      hint.style.color = 'var(--text-soft)';
    }
  }

  function openScoreModal(challengerIdx, targetIdx) {
    clearHighlight();
    const currentOrder = session.challengeOrder;
    const challengerName = currentOrder[challengerIdx];
    const targetName = currentOrder[targetIdx];
    const modal = document.getElementById('challengeModal');
    const scoreForm = document.getElementById('challengeScoreForm');
    document.getElementById('challengerTitle').textContent =
      `${formatDisplayName(challengerName)} (rang ${challengerIdx + 1})`;
    document.getElementById('challengeTargetLabel').textContent =
      `contre ${formatDisplayName(targetName)} (rang ${targetIdx + 1})`;
    document.getElementById('challengeHomeName').textContent = formatDisplayName(targetName);
    document.getElementById('challengeAwayName').textContent = formatDisplayName(challengerName);
    document.getElementById('challengeHomeVal').textContent = '0';
    document.getElementById('challengeAwayVal').textContent = '0';
    scoreForm.classList.remove('hidden');
    modal.classList.remove('hidden');

    let scores = { home: 0, away: 0 };
    const updateVal = (side, step) => {
      scores[side] = Math.max(0, (scores[side] || 0) + step);
      document.getElementById(`challenge${side === 'home' ? 'Home' : 'Away'}Val`).textContent = scores[side];
    };
    document.getElementById('challengeHomeMin').onclick = () => updateVal('home', -1);
    document.getElementById('challengeHomePlus').onclick = () => updateVal('home', 1);
    document.getElementById('challengeAwayMin').onclick = () => updateVal('away', -1);
    document.getElementById('challengeAwayPlus').onclick = () => updateVal('away', 1);

    document.getElementById('challengeConfirmBtn').onclick = () => {
      const co = session.challengeOrder;
      const isDraw = scores.home === scores.away;
      const challengerWon = !isDraw && scores.away > scores.home;
      session.challengeLog.push({
        challenger: challengerName,
        target: targetName,
        challengerRank: challengerIdx + 1,
        targetRank: targetIdx + 1,
        challengerScore: scores.away,
        targetScore: scores.home,
        challengerWon,
        isDraw,
        ts: Date.now(),
      });
      if (challengerWon) {
        const newOrder = [...co];
        newOrder[targetIdx] = challengerName;
        newOrder[challengerIdx] = targetName;
        session.challengeOrder = newOrder;
      }
      modal.classList.add('hidden');
      autoSave();
      renderChallengeLive(session);
      if (isDraw) {
        const hint = document.getElementById('challengeHint');
        if (hint) {
          hint.textContent = 'Match nul — les rangs restent inchangés.';
          hint.style.color = 'var(--text-soft)';
          setTimeout(() => {
            const nextHint = document.getElementById('challengeHint');
            if (nextHint) {
              nextHint.textContent = 'Tape sur un joueur pour voir contre qui il peut jouer.';
              nextHint.style.color = 'var(--text-soft)';
            }
          }, 3000);
        }
      }
    };

    document.getElementById('challengeCancelBtn').onclick = () => {
      modal.classList.add('hidden');
    };
  }

  const challengeListEl = document.getElementById('challengeList');
  challengeListEl.addEventListener('click', e => {
    const btn = e.target.closest('[data-challenge-index]');
    if (!btn) return;
    const clickedIdx = Number(btn.dataset.challengeIndex);

    if (btn.classList.contains('challenge-target') && selectedChallengerIdx !== null) {
      openScoreModal(selectedChallengerIdx, clickedIdx);
      return;
    }

    if (selectedChallengerIdx !== null) {
      clearHighlight();
      return;
    }

    if (clickedIdx === 0) {
      const hint = document.getElementById('challengeHint');
      if (hint) {
        const maxChallenger = Math.min(session.challengeOrder.length, challengeRange + 1);
        hint.textContent = maxChallenger > 1
          ? `${formatDisplayName(session.challengeOrder[0])} est en tête — il ne peut défier personne. Peut être défié par rangs 2→${maxChallenger}.`
          : `${formatDisplayName(session.challengeOrder[0])} est en tête — personne à défier.`;
        hint.style.color = 'var(--text-soft)';
      }
      setTimeout(() => {
        const h = document.getElementById('challengeHint');
        if (h) { h.textContent = 'Tape sur un joueur pour voir contre qui il peut jouer.'; h.style.color = 'var(--text-soft)'; }
      }, 2000);
      return;
    }

    selectedChallengerIdx = clickedIdx;
    const minTarget = Math.max(0, clickedIdx - challengeRange);
    const maxTarget = clickedIdx - 1;
    const minChallenger = clickedIdx + 1;
    const maxChallenger = Math.min(session.challengeOrder.length - 1, clickedIdx + challengeRange);

    document.querySelectorAll('#challengeList .challenge-row').forEach((rowBtn, idx) => {
      rowBtn.classList.remove('challenge-selected', 'challenge-target', 'challenge-challenger', 'challenge-dimmed');
      if (idx === clickedIdx) {
        rowBtn.classList.add('challenge-selected');
      } else if (idx >= minTarget && idx <= maxTarget) {
        rowBtn.classList.add('challenge-target');
      } else if (idx >= minChallenger && idx <= maxChallenger) {
        rowBtn.classList.add('challenge-challenger');
      } else {
        rowBtn.classList.add('challenge-dimmed');
      }
    });

    const hint = document.getElementById('challengeHint');
    if (hint) {
      const targetText = maxTarget >= minTarget ? `${minTarget + 1}→${maxTarget + 1}` : 'aucun';
      const challengerText = maxChallenger >= minChallenger ? `${minChallenger + 1}→${maxChallenger + 1}` : 'aucun';
      hint.textContent = `${formatDisplayName(session.challengeOrder[clickedIdx])} peut défier rangs ${targetText} · Peut être défié par rangs ${challengerText}`;
      hint.style.color = 'var(--accent-dark)';
    }

    highlightTimeout = setTimeout(() => {
      clearHighlight();
    }, 8000);
  });
}

function renderLiveView() {
  const session = state.currentSession;
  if (!session) {
    showView('home');
    return;
  }
  if (session.format === 'challenge') {
    renderChallengeLive(session);
    const timerCard = document.querySelector('.timer-card');
    if (timerCard) timerCard.style.display = 'none';
    if (dom.prevRotationBtn) dom.prevRotationBtn.style.display = 'none';
    if (dom.nextRotationBtn) dom.nextRotationBtn.style.display = 'none';
    return;
  }
  const timerCard = document.querySelector('.timer-card');
  if (timerCard) timerCard.style.display = '';
  if (dom.prevRotationBtn) dom.prevRotationBtn.style.display = '';
  if (dom.nextRotationBtn) dom.nextRotationBtn.style.display = '';
  const rotation = getCurrentRotation(session);
  dom.timerStartBtn.disabled = false;
  dom.timerPauseBtn.disabled = false;
  dom.timerResetBtn.disabled = false;
  dom.prevRotationBtn.disabled = false;
  dom.nextRotationBtn.textContent = 'Rotation suivante →';
  dom.nextRotationBtn.onclick = null;
  dom.liveModeLabel.textContent = TOURNAMENT_MODES[session.format]?.label || session.format;
  dom.liveSessionTitle.textContent = session.name;
  dom.liveRotationLabel.textContent = rotation
    ? `${rotation.title} / ${getSessionCurrentRotationCount(session)}`
    : 'Aucune rotation';
  renderTimer();
  renderLiveMatches(session);
  if (session.format === 'swiss') {
    dom.liveMatches.insertAdjacentHTML('afterbegin', '<div style="margin-bottom:16px;padding:12px 16px;border-radius:14px;background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.2);color:#1e3a8a;font-size:0.95rem;">🇨🇭 Ronde suisse : chaque rotation oppose des joueurs de niveau similaire. Après chaque round, les paires sont recalculées.</div>');
  }
  renderRankingDrawer(session);
}

function isRotationComplete(session, rotationIndex = session.currentRotation) {
  const rotation = getCurrentRotation(session, rotationIndex);
  if (!rotation) return false;
  return rotation.matches.every(match => isScoreComplete(getScoreRecord(session, match.id)));
}

function appendNextLadderRotation(session) {
  const currentRotation = getCurrentRotation(session);
  if (!currentRotation) return false;
  const nextNumber = session.schedule.rotations.length + 1;
  if (nextNumber > session.schedule.ladder.rotationTarget) return false;
  let order = currentRotation.orderSnapshot ? [...currentRotation.orderSnapshot] : [...session.schedule.ladder.latestOrder];
  const activeCount = Math.min(order.length, Math.max(2, session.options.fields * 2 - ((session.options.fields * 2) % 2)));
  const activePlayers = order.slice(0, activeCount);
  const bench = order.slice(activeCount);
  const promotedReferees = new Map();
  for (let index = 0; index < activePlayers.length; index += 2) {
    const home = activePlayers[index];
    const away = activePlayers[index + 1];
    const match = currentRotation.matches.find(entry => entry.home === home && entry.away === away) || currentRotation.matches.find(entry => entry.home === away && entry.away === home);
    const record = match ? getScoreRecord(session, match.id) : null;
    if (!match || !isScoreComplete(record)) continue;
    const homeWon = record.home > record.away;
    const awayWon = record.away > record.home;
    if (awayWon) {
      promotedReferees.set(match.field, away);
      activePlayers[index] = away;
      activePlayers[index + 1] = home;
    } else if (!homeWon && !awayWon) {
      const temp = activePlayers[index];
      activePlayers[index] = activePlayers[index + 1];
      activePlayers[index + 1] = temp;
    }
  }
  if (bench.length) {
    const outgoing = activePlayers.pop();
    const incoming = bench.shift();
    if (incoming) {
      activePlayers.push(incoming);
      bench.push(outgoing);
    }
  }
  order = [...activePlayers, ...bench];
  session.schedule.ladder.latestOrder = [...order];
  const nextRotation = buildLadderRotation(order, nextNumber, session.options);
  nextRotation.matches.forEach(match => {
    if (promotedReferees.has(match.field)) {
      match.ladderReferee = promotedReferees.get(match.field);
    }
  });
  session.schedule.rotations.push(nextRotation);
  session.schedule.meta.matchCount += nextRotation.matches.length;
  return true;
}

function appendNextSwissRotation(session) {
  const swiss = session.schedule.swiss;
  const currentRotation = getCurrentRotation(session);
  if (!swiss || !currentRotation || swiss.round >= swiss.maxRounds) return false;
  const committedMatches = swiss.currentMatches.map(match => ({ ...match }));
  committedMatches.forEach(match => {
    if (match.bye) {
      const player = swiss.players.find(entry => entry.id === match.p1Id);
      if (player) {
        player.points += 1;
        player.bye += 1;
      }
      return;
    }
    const record = getScoreRecord(session, match.id);
    if (!isScoreComplete(record)) return;
    const p1 = swiss.players.find(entry => entry.id === match.p1Id);
    const p2 = swiss.players.find(entry => entry.id === match.p2Id);
    if (!p1 || !p2) return;
    p1.matches += 1;
    p2.matches += 1;
    p1.opponents.push(p2.id);
    p2.opponents.push(p1.id);
    if (record.home > record.away) {
      p1.wins += 1;
      p1.points += 1;
      p2.losses += 1;
    } else {
      p2.wins += 1;
      p2.points += 1;
      p1.losses += 1;
    }
  });
  swiss.history.push({ round: swiss.round, matches: committedMatches });
  swiss.round += 1;
  const previousMatches = swiss.history.flatMap(round => round.matches);
  swiss.currentMatches = generateSwissPairings(swiss.players, previousMatches).map((match, index) => ({
    ...match,
    id: match.bye ? `swiss-bye-${swiss.round}-${match.p1Id}` : `swiss-${swiss.round}-${index + 1}`,
  }));
  const playerMap = new Map(swiss.players.map(player => [player.id, player]));
  session.schedule.rotations.push(buildSwissRotation(swiss.round, swiss.currentMatches, playerMap));
  session.schedule.meta.rotationCount = swiss.maxRounds;
  session.schedule.meta.matchCount += swiss.currentMatches.filter(match => !match.bye).length;
  return true;
}

function moveToNextRotation() {
  const session = state.currentSession;
  if (!session) return;
  if (!isRotationComplete(session)) {
    window.alert('Terminez tous les matchs de la rotation avant de passer à la suivante.');
    return;
  }
  const atLastRotation = session.currentRotation >= session.schedule.rotations.length - 1;
  if (session.format === 'ladder' && atLastRotation) {
    appendNextLadderRotation(session);
  }
  if (session.format === 'swiss' && atLastRotation) {
    appendNextSwissRotation(session);
  }
  if (session.currentRotation < session.schedule.rotations.length - 1) {
    session.currentRotation += 1;
    resetTimer();
    saveSessionLocally(session);
    renderLiveView();
    return;
  }
  session.completed = true;
  saveSessionLocally(session);
  showView('summary');
}

function moveToPreviousRotation() {
  const session = state.currentSession;
  if (!session || session.currentRotation <= 0) return;
  session.currentRotation -= 1;
  resetTimer();
  saveSessionLocally(session);
  renderLiveView();
}

/* === Vue 5 — statistiques et export === */

function renderStandingsTable(session, standings) {
  const isTeamMode = session.sport === 'sport-co' && session.format !== 'rotating-teams';
  return `
    <div class="summary-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Rang</th>
            <th>${isTeamMode ? 'Équipe' : 'Joueur'}</th>
            <th><span class="th-tip" title="Victoires">V</span></th>
            <th><span class="th-tip" title="Matchs nuls">N</span></th>
            <th><span class="th-tip" title="Défaites">D</span></th>
            <th><span class="th-tip" title="Points : 3 par victoire, 1 par nul, 0 par défaite">Pts</span></th>
            <th><span class="th-tip" title="${isTeamMode ? 'Buts marqués / Buts encaissés' : 'Points marqués / encaissés'}">±</span></th>
            <th><span class="th-tip" title="Ratio : Victoires ÷ Matchs joués (1.00 = toutes victoires)">Ratio</span></th>
          </tr>
        </thead>
        <tbody>
          ${standings.map((row, index) => `
            <tr>
              <td>${index + 1}</td>
              <td>${escapeHtml(isTeamMode ? row.name : formatDisplayName(row.name))}</td>
              <td>${row.wins}</td>
              <td>${row.draws}</td>
              <td>${row.losses}</td>
              <td>${row.points}</td>
              <td>${row.pointsFor} / ${row.pointsAgainst}</td>
              <td>${row.played ? (row.wins / row.played).toFixed(2) : '0.00'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderSummaryStats(session, standings) {
  const isTeamMode = session.sport === 'sport-co' && session.format !== 'rotating-teams';
  return standings.map(row => `
    <article class="stat-row">
      <strong>${escapeHtml(isTeamMode ? row.name : formatDisplayName(row.name))}</strong>
      <span>${row.wins}V ${row.draws}N ${row.losses}D · ${row.points} pts · ${row.pointsFor}/${row.pointsAgainst}</span>
      ${isTeamMode ? `<span>Différence : ${row.goalDiff}</span>` : `<span>Ratio : ${(row.ratio || 0).toFixed(2)}</span>`}
      ${session.format === 'challenge' && row.challengesMade !== undefined
        ? `<span style="font-size:0.88rem;color:var(--text-soft);">Défis lancés : ${row.challengesMade} · Défis reçus : ${row.challengesReceived}</span>`
        : ''}
      ${row.badges?.length ? `<div class="badges">${row.badges.map(badge => `<span class="badge">${escapeHtml(badge)}</span>`).join('')}</div>` : ''}
    </article>
  `).join('');
}

function renderSummaryView() {
  const session = state.currentSession || getSessionById(state.lastStatsSessionId);
  if (!session) {
    showView('home');
    return;
  }
  const standings = computeStandings(session);
  state.currentSession = session;
  dom.summaryTitle.textContent = session.name;
  dom.summarySubtitle.textContent = `${session.sport === 'raquette' ? 'Raquettes' : 'Sports collectifs'} · ${TOURNAMENT_MODES[session.format]?.label || session.format}`;
  dom.summaryContent.innerHTML = `
    <section class="summary-card">
      <div class="panel-head">
        <h3>Classement final</h3>
      </div>
      ${standings.length ? renderStandingsTable(session, standings) : '<div class="empty-state">Aucun résultat enregistré.</div>'}
    </section>
    <section class="summary-card">
      <div class="panel-head">
        <h3>${session.sport === 'sport-co' && session.format !== 'rotating-teams' ? 'Statistiques par équipe' : 'Statistiques par joueur'}</h3>
      </div>
      <div class="stat-list">
        ${standings.length ? renderSummaryStats(session, standings) : ''}
      </div>
    </section>
  `;
}

function exportCsv(session = state.currentSession) {
  if (!session) return;
  let standings = computeStandings(session);
  if (session.format === 'rotating-teams') {
    standings = computeRotatingPlayerStats(session);
  }
  const rankingHeader = 'nom;victoires;nuls;defaites;points;buts_pour;buts_contre';
  const rankingRows = standings.map(row => [row.name, row.wins, row.draws, row.losses, row.points, row.pointsFor, row.pointsAgainst].join(';'));
  let matchHeader = 'rotation;terrain;domicile;exterieur;score_domicile;score_exterieur';
  let matchRows = session.schedule.rotations.flatMap(rotation =>
    rotation.matches.map(match => {
      const participants = resolveMatchParticipants(match, session);
      const record = getScoreRecord(session, match.id) || { home: '', away: '' };
      return [rotation.number, match.field || '', participants.home, participants.away, record.home ?? '', record.away ?? ''].join(';');
    })
  );
  if (session.format === 'challenge') {
    matchHeader = 'ordre;nom;victoires;defaites;points_marques;points_encaisses';
    matchRows = standings.map((row, index) => [index + 1, row.name, row.wins, row.losses, row.pointsFor, row.pointsAgainst].join(';'));
  }
  const csv = [
    'Classement général',
    rankingHeader,
    ...rankingRows,
    '',
    'Détail des matchs',
    matchHeader,
    ...matchRows,
  ].join('\n');
  triggerDownload(csv, `${slugify(session.name || 'eps-tournoi')}.csv`, 'text/csv;charset=utf-8;');
}

function triggerDownload(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function slugify(value) {
  return String(value || 'eps-tournoi')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/* === Vue 3 — sauvegardes et reprise === */

function renderSessionsView() {
  const sessions = loadStoredSessions().sort((left, right) => new Date(right.savedAt).getTime() - new Date(left.savedAt).getTime());
  if (!sessions.length) {
    dom.sessionsList.innerHTML = '<div class="empty-state">Aucune séance enregistrée pour le moment.</div>';
    return;
  }
  dom.sessionsList.innerHTML = sessions.map(session => `
    <article class="session-item">
      <div class="session-item-header">
        <strong>${escapeHtml(session.name || 'Séance')}</strong>
        <span class="session-item-meta">${escapeHtml(TOURNAMENT_MODES[session.format]?.label || session.format)} · ${new Date(session.savedAt).toLocaleDateString('fr-FR')}</span>
      </div>
      <div class="session-item-actions">
        <button class="btn btn-primary btn-sm" type="button" data-session-action="resume" data-session-id="${session.id}">Reprendre</button>
        <button class="btn btn-secondary btn-sm" type="button" data-session-action="stats" data-session-id="${session.id}">Stats</button>
        <button class="btn btn-secondary btn-sm" type="button" data-session-action="delete" data-session-id="${session.id}">Supprimer</button>
      </div>
    </article>
  `).join('');
}

function openClassroomModal(config = {}) {
  return new Promise(resolve => {
    const classrooms = loadClassrooms();
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.45);display:flex;align-items:center;justify-content:center;z-index:200;padding:20px;';
    overlay.innerHTML = `
      <div style="background:var(--surface);border-radius:var(--radius-xl);box-shadow:var(--shadow);width:min(100%,640px);padding:28px 24px;display:grid;gap:16px;max-height:90vh;overflow:auto;">
        <div>
          <p style="margin:0 0 8px;font-size:0.88rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--accent-dark);">${escapeHtml(config.kicker || 'Suivi élèves')}</p>
          <h3 style="margin:0 0 8px;">${escapeHtml(config.title || 'Associer à une classe ?')}</h3>
          <p style="margin:0;color:var(--text-soft);">${escapeHtml(config.subtitle || 'Permet un suivi élève sur plusieurs séances. Facultatif.')}</p>
        </div>
        ${classrooms.length ? `<div style="display:grid;gap:10px;">${classrooms.map(classroom => `<button class="choice-card" type="button" data-classroom-pick="${classroom.id}" style="justify-content:space-between;text-align:left;"><span>${escapeHtml(classroom.name)}</span><span style="color:var(--text-soft);font-size:0.9rem;">${classroom.sessionIds?.length || 0} séance${(classroom.sessionIds?.length || 0) > 1 ? 's' : ''}</span></button>`).join('')}</div>` : ''}
        <div style="display:grid;gap:12px;">
          <button class="btn btn-primary btn-lg" type="button" id="classroomCreateToggleBtn">➕ Nouvelle classe</button>
          ${config.allowIgnore !== false ? '<button class="btn btn-secondary btn-lg" type="button" id="classroomIgnoreBtn">Ignorer</button>' : ''}
        </div>
        <div id="classroomCreateForm" style="display:none;gap:12px;">
          <label class="field">
            <span>Nom de la classe</span>
            <input id="classroomNameInputModal" type="text" placeholder="4B" />
          </label>
          <button class="btn btn-primary btn-lg" type="button" id="classroomCreateConfirmBtn">Créer et associer</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const cleanup = value => {
      document.body.removeChild(overlay);
      resolve(value);
    };

    overlay.addEventListener('click', event => {
      if (event.target === overlay && config.allowIgnore !== false) {
        cleanup(null);
      }
    });

    overlay.querySelectorAll('[data-classroom-pick]').forEach(button => {
      button.addEventListener('click', () => cleanup(button.dataset.classroomPick));
    });

    const createForm = overlay.querySelector('#classroomCreateForm');
    const createToggle = overlay.querySelector('#classroomCreateToggleBtn');
    if (createToggle) {
      createToggle.addEventListener('click', () => {
        createForm.style.display = createForm.style.display === 'none' ? 'grid' : 'none';
      });
    }

    const ignoreBtn = overlay.querySelector('#classroomIgnoreBtn');
    if (ignoreBtn) {
      ignoreBtn.addEventListener('click', () => cleanup(null));
    }

    const createConfirm = overlay.querySelector('#classroomCreateConfirmBtn');
    if (createConfirm) {
      createConfirm.addEventListener('click', () => {
        const input = overlay.querySelector('#classroomNameInputModal');
        const name = String(input?.value || '').trim();
        if (!name) return;
        const classroom = {
          id: uniqueId('class'),
          name,
          colorIndex: loadClassrooms().length % 8,
          sport: config.sport || state.draft.sport || 'raquette',
          createdAt: new Date().toISOString(),
          sessionIds: [],
          students: [],
        };
        upsertClassroom(classroom);
        cleanup(classroom.id);
      });
    }
  });
}

function promptClassroomChoice() {
  return openClassroomModal({
    title: 'Associer à une classe ?',
    subtitle: 'Permet un suivi élève sur plusieurs séances. Facultatif.',
    kicker: 'Suivi élèves',
    allowIgnore: true,
    sport: state.draft.sport,
  });
}

async function promptCreateClassroom() {
  const classroomId = await openClassroomModal({
    title: 'Créer une classe',
    subtitle: 'Ajoutez une classe pour suivre plusieurs séances.',
    kicker: 'Mes classes',
    allowIgnore: false,
    sport: state.draft.sport,
  });
  if (classroomId) {
    renderClassroomsView();
  }
}

function renderClassroomsView() {
  const classrooms = loadClassrooms();
  if (!classrooms.length) {
    dom.classroomsList.innerHTML = '<div class="empty-state">Aucune classe créée.<br>Cliquez sur « Nouvelle classe » pour commencer.</div>';
    return;
  }
  dom.classroomsList.innerHTML = classrooms.map((classroom, index) => {
    const colorClass = `classroom-color-${(classroom.colorIndex ?? index) % 8}`;
    const sportLabel = classroom.sport === 'raquette' ? '🏸 Raquettes' : '⚽ Sport collectif';
    const sessionCount = classroom.sessionIds?.length || 0;
    const studentCount = classroom.students?.length || 0;
    return `
      <article class="classroom-card ${colorClass}">
        <div>
          <span class="classroom-sport-badge">${sportLabel}</span>
          <h3>${escapeHtml(classroom.name)}</h3>
          <p class="classroom-meta">${sessionCount} séance${sessionCount > 1 ? 's' : ''} · ${studentCount} élève${studentCount > 1 ? 's' : ''}</p>
        </div>
        <div class="classroom-actions">
          <button class="btn btn-primary btn-sm" type="button" data-classroom-view="${classroom.id}">📂 Ouvrir la classe</button>
          <button class="btn btn-secondary btn-sm" type="button" data-classroom-delete="${classroom.id}">🗑️ Supprimer</button>
        </div>
      </article>
    `;
  }).join('');
  dom.classroomsList.querySelectorAll('[data-classroom-view]').forEach(button => {
    button.addEventListener('click', () => showClassroomDetail(button.dataset.classroomView));
  });
  dom.classroomsList.querySelectorAll('[data-classroom-delete]').forEach(button => {
    button.addEventListener('click', () => {
      if (window.confirm('Supprimer définitivement cette classe et tout son historique ?')) {
        deleteClassroom(button.dataset.classroomDelete);
        renderClassroomsView();
      }
    });
  });
}

function showClassroomDetail(classroomId) {
  const classroom = getClassroomById(classroomId);
  if (!classroom) return;
  const allSessions = loadStoredSessions();
  const sessions = allSessions
    .filter(session => classroom.sessionIds?.includes(session.id))
    .sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());

  const sportCoSessions = sessions.filter(s => s.sport !== 'raquette');
  const raquetteSessions = sessions.filter(s => s.sport === 'raquette');

  const students = [...(classroom.students || [])].sort((left, right) => {
    const leftRatio = left.totalPlayed ? left.totalWins / left.totalPlayed : 0;
    const rightRatio = right.totalPlayed ? right.totalWins / right.totalPlayed : 0;
    if (rightRatio !== leftRatio) return rightRatio - leftRatio;
    return left.name.localeCompare(right.name, 'fr');
  });

  const colorClass = `classroom-color-${(classroom.colorIndex ?? 0) % 8}`;

  dom.classroomDetailTitle.textContent = classroom.name;
  dom.classroomDetailMeta.textContent = `${sessions.length} séances · ${students.length} élèves`;

  function renderSessionList(list) {
    if (!list.length) return '<p style="color:var(--text-soft);padding:12px 0;">Aucune séance.</p>';
    return list.map(session => {
      const isCompleted = session.completed === true;
      const statusBadge = isCompleted
        ? '<span class="session-status-badge completed">✅ Terminé</span>'
        : '<span class="session-status-badge ongoing">🔄 En cours</span>';
      const date = new Date(session.savedAt).toLocaleDateString('fr-FR');
      const formatLabel = escapeHtml(TOURNAMENT_MODES[session.format]?.label || session.format);
      return `
        <article class="session-item" style="margin-bottom:10px;">
          <div class="session-item-header">
            <strong>${escapeHtml(session.name || 'Séance sans nom')}</strong>
            <span class="session-item-meta">${date} · ${formatLabel} ${statusBadge}</span>
          </div>
          <div class="session-item-actions">
            <button class="btn btn-secondary btn-sm" type="button"
              data-session-action="stats" data-session-id="${session.id}">
              📊 Stats
            </button>
            ${!isCompleted ? `<button class="btn btn-primary btn-sm" type="button"
              data-session-action="resume" data-session-id="${session.id}">
              ▶ Reprendre
            </button>` : ''}
            <button class="btn btn-secondary btn-sm" type="button"
              data-classroom-remove-session="${session.id}" data-classroom-id="${classroomId}"
              style="color:#991b1b;">
              🗑️ Retirer
            </button>
          </div>
        </article>
      `;
    }).join('');
  }

  function renderStatTable(list, isSportCo) {
    const studentsForSport = students.filter(s =>
      isSportCo
        ? list.some(sess => sess.id && classroom.sessionIds?.includes(sess.id))
        : true
    );
    if (!studentsForSport.length) return '<p style="color:var(--text-soft);">Aucune donnée.</p>';
    if (isSportCo) {
      return `
        <div class="summary-table-wrap">
          <table>
            <thead><tr>
              <th>Équipe / Élève</th><th>Séances</th>
              <th>J</th><th>V</th><th>N</th><th>D</th>
              <th>BP</th><th>BC</th><th>Ratio V/J</th>
            </tr></thead>
            <tbody>
              ${studentsForSport.map(s => `<tr>
                <td>${escapeHtml(formatDisplayName(s.name))}</td>
                <td>${s.sessionsCount}</td>
                <td>${s.totalPlayed}</td>
                <td>${s.totalWins}</td>
                <td>${s.totalDraws}</td>
                <td>${s.totalLosses}</td>
                <td>${s.totalPointsFor}</td>
                <td>${s.totalPointsAgainst}</td>
                <td>${s.totalPlayed ? (s.totalWins / s.totalPlayed).toFixed(2) : '0.00'}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
    } else {
      return `
        <div class="summary-table-wrap">
          <table>
            <thead><tr>
              <th>Joueur</th><th>Séances</th>
              <th>Matchs</th><th>V</th><th>D</th>
              <th>Ratio V/J</th><th>Meilleur rang</th>
            </tr></thead>
            <tbody>
              ${studentsForSport.map(s => `<tr>
                <td>${escapeHtml(formatDisplayName(s.name))}</td>
                <td>${s.sessionsCount}</td>
                <td>${s.totalPlayed}</td>
                <td>${s.totalWins}</td>
                <td>${s.totalLosses}</td>
                <td>${s.totalPlayed ? (s.totalWins / s.totalPlayed).toFixed(2) : '0.00'}</td>
                <td>${s.bestRank ?? '—'}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>`;
    }
  }

  dom.classroomDetailContent.innerHTML = `
    <div class="${colorClass}" style="margin-bottom:20px;">

      ${sportCoSessions.length ? `
      <section class="summary-card" style="margin-bottom:20px;">
        <div class="panel-head">
          <h3>⚽ Séances Sport collectif</h3>
        </div>
        ${renderSessionList(sportCoSessions)}
        <details style="margin-top:12px;">
          <summary style="cursor:pointer;font-weight:700;color:var(--text-soft);">📊 Stats cumulées Sport collectif</summary>
          <div style="margin-top:12px;">${renderStatTable(sportCoSessions, true)}</div>
        </details>
      </section>` : ''}

      ${raquetteSessions.length ? `
      <section class="summary-card" style="margin-bottom:20px;">
        <div class="panel-head">
          <h3>🏸 Séances Raquettes</h3>
        </div>
        ${renderSessionList(raquetteSessions)}
        <details style="margin-top:12px;">
          <summary style="cursor:pointer;font-weight:700;color:var(--text-soft);">📊 Stats cumulées Raquettes</summary>
          <div style="margin-top:12px;">${renderStatTable(raquetteSessions, false)}</div>
        </details>
      </section>` : ''}

      ${!sportCoSessions.length && !raquetteSessions.length ? `
      <div class="empty-state">Aucune séance associée à cette classe pour l'instant.<br>
      Lancez un tournoi et associez-le à cette classe en fin de séance.</div>` : ''}

    </div>
  `;
  dom.classroomDetailContent.querySelectorAll('[data-session-action]').forEach(button => {
    button.addEventListener('click', () => {
      const { sessionId, sessionAction: action } = button.dataset;
      if (action === 'resume') restoreSession(sessionId, 'live');
      if (action === 'stats') restoreSession(sessionId, 'summary');
    });
  });

  dom.classroomDetailContent.querySelectorAll('[data-classroom-remove-session]').forEach(button => {
    button.addEventListener('click', () => {
      if (!window.confirm('Retirer cette séance de la classe ? (La séance reste dans vos sauvegardes)')) return;
      const cl = getClassroomById(button.dataset.classroomId);
      if (!cl) return;
      cl.sessionIds = (cl.sessionIds || []).filter(id => id !== button.getAttribute('data-classroom-remove-session'));
      upsertClassroom(cl);
      showClassroomDetail(classroomId);
    });
  });

  showView('classroom-detail');
}

function restoreSession(sessionId, targetView = 'live') {
  const snapshot = getSessionById(sessionId);
  if (!snapshot) return;
  state.currentSession = structuredClone(snapshot);
  if (state.currentSession.format === 'challenge') {
    if (!state.currentSession.challengeOrder) {
      state.currentSession.challengeOrder = state.currentSession.schedule.teams.map(t => t.name);
    }
    if (!state.currentSession.challengeLog) {
      state.currentSession.challengeLog = [];
    }
  }
  state.lastStatsSessionId = snapshot.id;
  resetTimer();
  if (targetView === 'summary' || snapshot.completed) {
    showView('summary');
  } else {
    showView('live');
  }
}

/* === Vue 1 — accueil === */

function renderHomeView() {
  const sessions = loadStoredSessions().sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
  const classrooms = loadClassrooms();
  const latest = sessions[0] || null;

  const hasOngoing = sessions.some(s => !s.completed);
  if (dom.resumeSessionBtn) dom.resumeSessionBtn.disabled = !hasOngoing;

  if (dom.lastStatsBtn) {
    if (latest) {
      dom.lastStatsBtn.classList.remove('hidden');
      const sportIcon = latest.sport === 'raquette' ? '🏸' : '⚽';
      dom.lastStatsBtn.textContent = `${sportIcon} Dernière séance : ${escapeHtml(latest.name || 'Stats')}`;
    } else {
      dom.lastStatsBtn.classList.add('hidden');
    }
  }
}

/* === Événements === */

function handleGlobalClick(event) {
  const viewTarget = event.target.closest('[data-view-target]');
  if (viewTarget) {
    showView(viewTarget.dataset.viewTarget);
    return;
  }

  const sportButton = event.target.closest('[data-sport]');
  if (sportButton) {
    state.draft.sport = sportButton.dataset.sport === 'raquette' ? 'raquette' : 'sport-co';
    state.draft.format = FORMAT_DEFINITIONS[state.draft.sport][0].id;
    state.draft.selectedConfigKey = '';
    renderNewTournamentView();
    persistState();
    return;
  }

  const formatButton = event.target.closest('[data-format]');
  if (formatButton) {
    state.draft.format = formatButton.dataset.format;
    state.draft.selectedConfigKey = '';
    renderNewTournamentView();
    persistState();
    return;
  }

  const configButton = event.target.closest('[data-config-key]');
  if (configButton) {
    state.draft.selectedConfigKey = configButton.dataset.configKey;
    renderNewTournamentView();
    persistState();
    return;
  }

  const teamScoreButton = event.target.closest('[data-score-step]');
  if (teamScoreButton) {
    adjustScore(teamScoreButton.dataset.matchId, teamScoreButton.dataset.scoreSide, Number(teamScoreButton.dataset.scoreStep));
    return;
  }

  const rotatingOutcomeButton = event.target.closest('[data-rotating-outcome]');
  if (rotatingOutcomeButton) {
    setRotatingOutcome(rotatingOutcomeButton.dataset.matchId, rotatingOutcomeButton.dataset.rotatingOutcome);
    return;
  }

  const sessionAction = event.target.closest('[data-session-action]');
  if (sessionAction) {
    const { sessionId, sessionAction: action } = sessionAction.dataset;
    if (action === 'resume') restoreSession(sessionId, 'live');
    if (action === 'stats') restoreSession(sessionId, 'summary');
    if (action === 'delete') {
      if (window.confirm('Supprimer cette séance sauvegardée ?')) {
        deleteStoredSession(sessionId);
        renderSessionsView();
        renderHomeView();
      }
    }
    return;
  }

  if (event.target === dom.startNewTournamentBtn) {
    showView('new');
    return;
  }
  if (event.target === dom.resumeSessionBtn) {
    showView('sessions');
    return;
  }
  if (event.target === dom.lastStatsBtn) {
    const latest = loadStoredSessions().sort((left, right) => new Date(right.savedAt).getTime() - new Date(left.savedAt).getTime())[0];
    if (latest) restoreSession(latest.id, 'summary');
    return;
  }
  if (event.target === dom.timerStartBtn) {
    startTimer();
    return;
  }
  if (event.target === dom.timerPauseBtn) {
    pauseTimer();
    return;
  }
  if (event.target === dom.timerResetBtn) {
    resetTimer();
    return;
  }
  if (event.target === dom.prevRotationBtn) {
    moveToPreviousRotation();
    return;
  }
  if (event.target === dom.nextRotationBtn) {
    if (state.currentSession?.format === 'challenge') return;
    moveToNextRotation();
    return;
  }
  if (event.target === dom.saveSessionBtn || event.target === dom.saveSummaryBtn) {
    if (state.currentSession) {
      saveSessionLocally(state.currentSession);
      window.alert('Séance sauvegardée.');
    }
    return;
  }
  if (event.target === dom.printSummaryBtn) {
    window.print();
    return;
  }
  if (event.target === dom.exportCsvBtn) {
    exportCsv(state.currentSession);
    return;
  }
  if (event.target === dom.exportAllSessionsBtn) {
    triggerDownload(JSON.stringify(loadStoredSessions(), null, 2), `eps-tournoi-sessions-${new Date().toISOString().slice(0, 10)}.json`, 'application/json');
    return;
  }
  if (event.target === dom.openRankingBtn) {
    dom.rankingDrawer.classList.remove('hidden');
    return;
  }
  if (event.target === dom.closeRankingBtn) {
    dom.rankingDrawer.classList.add('hidden');
  }
}

function handleGlobalInput(event) {
  if (event.target === dom.participantCountInput) {
    state.draft.participantCount = clampSetupCount(event.target.value, 24);
    renderNewTournamentView();
    persistState();
    return;
  }
  if (event.target === dom.fieldCountInput) {
    state.draft.fields = clampNumber(Number(event.target.value) || 2, 1, 20, 2);
    renderNewTournamentView();
    persistState();
    return;
  }
  if (event.target === dom.startTimeInput) {
    state.draft.startTime = event.target.value || '10:00';
    renderTimeSection();
    persistState();
    return;
  }
  if (event.target === dom.endTimeInput) {
    state.draft.endTime = event.target.value || '11:00';
    renderTimeSection();
    persistState();
    return;
  }
  if (event.target === dom.matchDurationInput) {
    state.draft.duration = clampNumber(Number(event.target.value) || 7, 1, 60, 7);
    renderTimeSection();
    persistState();
    return;
  }
  if (event.target === dom.sessionNameInput) {
    state.draft.sessionName = event.target.value;
    persistState();
    return;
  }
  if (event.target === dom.studentNamesInput) {
    state.draft.studentNamesText = event.target.value;
    persistState();
    return;
  }
  if (event.target === dom.rotatingRefereeInput) {
    state.draft.rotatingReferee = dom.rotatingRefereeInput.checked;
    persistState();
    return;
  }
  if (event.target === dom.scoreTableInput) {
    state.draft.scoreTable = dom.scoreTableInput.checked;
    persistState();
    return;
  }
  if (event.target === dom.challengeRangeInput) {
    state.draft.challengeRange = clampNumber(Number(event.target.value) || 5, 1, 10, 5);
    if (dom.challengeRangeLabel) dom.challengeRangeLabel.textContent = `±${state.draft.challengeRange}`;
    persistState();
    return;
  }
  if (event.target === dom.poolSizeInput) {
    state.draft.poolSize = clampNumber(Number(event.target.value) || 4, 3, 6, 4);
    if (dom.poolSizeLabel) dom.poolSizeLabel.textContent = `${state.draft.poolSize}`;
    persistState();
    return;
  }
  if (event.target.matches('[data-team-name-index]')) {
    const index = Number(event.target.dataset.teamNameIndex);
    state.draft.teamNames[index] = event.target.value;
    persistState();
  }
}

function handleGlobalSubmit(event) {
  if (event.target === dom.newTournamentForm) {
    event.preventDefault();
    launchTournament();
  }
}

function handleStepperButtons() {
  dom.participantMinusBtn.addEventListener('click', () => {
    state.draft.participantCount = clampSetupCount(state.draft.participantCount - 1, 24);
    renderNewTournamentView();
    persistState();
  });
  dom.participantPlusBtn.addEventListener('click', () => {
    state.draft.participantCount = clampSetupCount(state.draft.participantCount + 1, 24);
    renderNewTournamentView();
    persistState();
  });
  dom.fieldMinusBtn.addEventListener('click', () => {
    state.draft.fields = clampNumber(state.draft.fields - 1, 1, 20, 2);
    renderTimeSection();
    persistState();
  });
  dom.fieldPlusBtn.addEventListener('click', () => {
    state.draft.fields = clampNumber(state.draft.fields + 1, 1, 20, 2);
    renderTimeSection();
    persistState();
  });
  dom.durationMinusBtn.addEventListener('click', () => {
    state.draft.duration = clampNumber(state.draft.duration - 1, 1, 60, 7);
    renderTimeSection();
    persistState();
  });
  dom.durationPlusBtn.addEventListener('click', () => {
    state.draft.duration = clampNumber(state.draft.duration + 1, 1, 60, 7);
    renderTimeSection();
    persistState();
  });
  if (dom.challengeRangeMinusBtn) {
    dom.challengeRangeMinusBtn.addEventListener('click', () => {
      state.draft.challengeRange = clampNumber((state.draft.challengeRange || 5) - 1, 1, 10, 5);
      if (dom.challengeRangeLabel) dom.challengeRangeLabel.textContent = `±${state.draft.challengeRange}`;
      if (dom.challengeRangeInput) dom.challengeRangeInput.value = state.draft.challengeRange;
      persistState();
    });
    dom.challengeRangePlusBtn.addEventListener('click', () => {
      state.draft.challengeRange = clampNumber((state.draft.challengeRange || 5) + 1, 1, 10, 5);
      if (dom.challengeRangeLabel) dom.challengeRangeLabel.textContent = `±${state.draft.challengeRange}`;
      if (dom.challengeRangeInput) dom.challengeRangeInput.value = state.draft.challengeRange;
      persistState();
    });
  }
  if (dom.poolSizeMinusBtn) {
    dom.poolSizeMinusBtn.addEventListener('click', () => {
      state.draft.poolSize = clampNumber((state.draft.poolSize || 4) - 1, 3, 6, 4);
      if (dom.poolSizeLabel) dom.poolSizeLabel.textContent = `${state.draft.poolSize}`;
      if (dom.poolSizeInput) dom.poolSizeInput.value = state.draft.poolSize;
      persistState();
    });
    dom.poolSizePlusBtn.addEventListener('click', () => {
      state.draft.poolSize = clampNumber((state.draft.poolSize || 4) + 1, 3, 6, 4);
      if (dom.poolSizeLabel) dom.poolSizeLabel.textContent = `${state.draft.poolSize}`;
      if (dom.poolSizeInput) dom.poolSizeInput.value = state.draft.poolSize;
      persistState();
    });
  }
}

/* === Initialisation === */

function cacheDom() {
  dom.startNewTournamentBtn = document.getElementById('startNewTournamentBtn');
  dom.resumeSessionBtn = document.getElementById('resumeSessionBtn');
  dom.classroomsBtn = document.getElementById('classroomsBtn');
  dom.lastStatsBtn = document.getElementById('lastStatsBtn');
  dom.newTournamentForm = document.getElementById('newTournamentForm');
  dom.formatCards = document.getElementById('formatCards');
  dom.participantCountInput = document.getElementById('participantCountInput');
  dom.participantCountLabel = document.getElementById('participantCountLabel');
  dom.participantMinusBtn = document.getElementById('participantMinusBtn');
  dom.participantPlusBtn = document.getElementById('participantPlusBtn');
  dom.configSuggestions = document.getElementById('configSuggestions');
  dom.teamNamesSection = document.getElementById('teamNamesSection');
  dom.teamNamesGrid = document.getElementById('teamNamesGrid');
  dom.studentNamesSection = document.getElementById('studentNamesSection');
  dom.studentNamesInput = document.getElementById('studentNamesInput');
  dom.fieldCountInput = document.getElementById('fieldCountInput');
  dom.fieldCountLabel = document.getElementById('fieldCountLabel');
  dom.fieldMinusBtn = document.getElementById('fieldMinusBtn');
  dom.fieldPlusBtn = document.getElementById('fieldPlusBtn');
  dom.startTimeInput = document.getElementById('startTimeInput');
  dom.endTimeInput = document.getElementById('endTimeInput');
  dom.timingSummary = document.getElementById('timingSummary');
  dom.matchDurationInput = document.getElementById('matchDurationInput');
  dom.matchDurationLabel = document.getElementById('matchDurationLabel');
  dom.durationMinusBtn = document.getElementById('durationMinusBtn');
  dom.durationPlusBtn = document.getElementById('durationPlusBtn');
  dom.rotatingRefereeInput = document.getElementById('rotatingRefereeInput');
  dom.scoreTableInput = document.getElementById('scoreTableInput');
  dom.sessionNameInput = document.getElementById('sessionNameInput');
  dom.sessionsList = document.getElementById('sessionsList');
  dom.exportAllSessionsBtn = document.getElementById('exportAllSessionsBtn');
  dom.liveModeLabel = document.getElementById('liveModeLabel');
  dom.liveSessionTitle = document.getElementById('liveSessionTitle');
  dom.liveRotationLabel = document.getElementById('liveRotationLabel');
  dom.timerLabel = document.getElementById('timerLabel');
  dom.timerStatus = document.getElementById('timerStatus');
  dom.timerProgressBar = document.getElementById('timerProgressBar');
  dom.timerStartBtn = document.getElementById('timerStartBtn');
  dom.timerPauseBtn = document.getElementById('timerPauseBtn');
  dom.timerResetBtn = document.getElementById('timerResetBtn');
  dom.openRankingBtn = document.getElementById('openRankingBtn');
  dom.liveHomeBtn = document.getElementById('liveHomeBtn');
  dom.closeRankingBtn = document.getElementById('closeRankingBtn');
  dom.rankingDrawer = document.getElementById('rankingDrawer');
  dom.liveRankingContent = document.getElementById('liveRankingContent');
  dom.liveMatches = document.getElementById('liveMatches');
  dom.prevRotationBtn = document.getElementById('prevRotationBtn');
  dom.saveSessionBtn = document.getElementById('saveSessionBtn');
  dom.nextRotationBtn = document.getElementById('nextRotationBtn');
  dom.finishTournamentBtn = document.getElementById('finishTournamentBtn');
  dom.summaryTitle = document.getElementById('summaryTitle');
  dom.summarySubtitle = document.getElementById('summarySubtitle');
  dom.summaryContent = document.getElementById('summaryContent');
  dom.printSummaryBtn = document.getElementById('printSummaryBtn');
  dom.saveSummaryBtn = document.getElementById('saveSummaryBtn');
  dom.exportCsvBtn = document.getElementById('exportCsvBtn');
  dom.addClassroomBtn = document.getElementById('addClassroomBtn');
  dom.classroomsList = document.getElementById('classroomsList');
  dom.classroomDetailTitle = document.getElementById('classroomDetailTitle');
  dom.classroomDetailMeta = document.getElementById('classroomDetailMeta');
  dom.classroomDetailContent = document.getElementById('classroomDetailContent');
  dom.challengeRangeBlock = document.getElementById('challengeRangeBlock');
  dom.challengeRangeInput = document.getElementById('challengeRangeInput');
  dom.challengeRangeLabel = document.getElementById('challengeRangeLabel');
  dom.challengeRangeMinusBtn = document.getElementById('challengeRangeMinusBtn');
  dom.challengeRangePlusBtn = document.getElementById('challengeRangePlusBtn');
  dom.poolSizeBlock = document.getElementById('poolSizeBlock');
  dom.poolSizeInput = document.getElementById('poolSizeInput');
  dom.poolSizeLabel = document.getElementById('poolSizeLabel');
  dom.poolSizeMinusBtn = document.getElementById('poolSizeMinusBtn');
  dom.poolSizePlusBtn = document.getElementById('poolSizePlusBtn');
}

function bindEvents() {
  document.addEventListener('click', handleGlobalClick);
  document.addEventListener('input', handleGlobalInput);
  document.addEventListener('submit', handleGlobalSubmit);
  const liveHeaderInfo = document.getElementById('liveHeaderInfo');
  const liveHeader = document.getElementById('liveHeader');
  if (liveHeaderInfo && liveHeader) {
    liveHeaderInfo.addEventListener('click', () => {
      liveHeader.classList.toggle('collapsed');
    });
  }
  if (dom.classroomsBtn) dom.classroomsBtn.addEventListener('click', () => showView('classrooms'));
  if (dom.addClassroomBtn) dom.addClassroomBtn.addEventListener('click', () => promptCreateClassroom());
  if (dom.liveHomeBtn) {
    dom.liveHomeBtn.addEventListener('click', () => {
      if (confirm('Revenir à l\'accueil ? Le tournoi en cours sera conservé dans "Reprendre une séance".')) {
        saveSessionLocally();
        showView('home');
      }
    });
  }
  if (dom.finishTournamentBtn) {
    dom.finishTournamentBtn.addEventListener('click', () => {
      if (confirm('Terminer le tournoi et voir les statistiques finales ?')) {
        finishTournament();
      }
    });
  }
  handleStepperButtons();
}

function init() {
  cacheDom();
  bindEvents();
  renderHomeView();
  renderNewTournamentView();
  renderSessionsView();
  if (state.currentSession) {
    resetTimer();
  }
  showView(state.view);
}

document.addEventListener('DOMContentLoaded', init);
