// Scheduling and answer-checking logic. No DOM access, so it runs under node --test.

// Days until the next review, indexed by box. Box 0 = still being learned today.
export const INTERVALS = [0, 1, 2, 4, 8, 16, 32, 64];
export const MAX_BOX = INTERVALS.length - 1;
export const SESSION_MS = 10 * 60 * 1000;

const KEY = 'spanish10.v1';

export function dayNumber(d = new Date()) {
  return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
}

export function newState() {
  return { v: 1, cards: {}, streak: 0, lastDone: null, lastNewDay: null, slow: false };
}

export function loadState(storage) {
  try {
    const s = JSON.parse(storage.getItem(KEY));
    if (s && s.v === 1 && s.cards) return { ...newState(), ...s };
  } catch {}
  return newState();
}

export function saveState(storage, state) {
  try {
    storage.setItem(KEY, JSON.stringify(state));
  } catch {}
}

export function nextLesson(state, lessons) {
  return lessons.find((l) => l.items.some((it) => !state.cards[it.id])) || null;
}

export function learnedCount(state) {
  return Object.values(state.cards).filter((c) => c.box >= 1).length;
}

export function dueCount(state, day) {
  return Object.values(state.cards).filter((c) => c.due <= day).length;
}

export function currentStreak(state, day) {
  return state.lastDone !== null && day - state.lastDone <= 1 ? state.streak : 0;
}

export function wordCount(es) {
  return tokens(es).length;
}

// Exercises get harder as a phrase gets more familiar: recognise, then build, then recall.
export function reviewKind(item, box) {
  const multi = wordCount(item.es) > 1;
  if (box <= 0) return 'pick-en';
  if (box === 1) return 'listen';
  if (box === 2) return 'pick-es';
  if (box === 3) return multi ? 'tiles' : 'type';
  if (box === 4) return 'type';
  return box % 2 ? 'speak' : 'type';
}

export function shuffle(arr, rng = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Builds today's list of steps: due reviews first, then one new lesson.
// `extra` allows a second lesson on the same day when the user asks for more.
export function buildQueue(state, day, lessons, { extra = false, maxReviews = 24, rng = Math.random } = {}) {
  const byId = {};
  for (const l of lessons) for (const it of l.items) byId[it.id] = it;

  const due = Object.entries(state.cards)
    .filter(([id, c]) => byId[id] && c.due <= day)
    .sort((a, b) => a[1].due - b[1].due || a[1].box - b[1].box)
    .slice(0, maxReviews);
  let queue = shuffle(
    due.map(([id, c]) => ({ id, kind: reviewKind(byId[id], c.box), final: true })),
    rng,
  );

  let lesson = null;
  if (extra || state.lastNewDay !== day) {
    lesson = nextLesson(state, lessons);
    if (lesson) {
      const fresh = lesson.items.filter((it) => !state.cards[it.id]);
      for (let i = 0; i < fresh.length; i += 2) {
        const pair = fresh.slice(i, i + 2);
        for (const it of pair) queue.push({ id: it.id, kind: 'intro' });
        for (const it of pair) queue.push({ id: it.id, kind: 'pick-en' });
      }
      for (const it of shuffle(fresh, rng)) {
        queue.push({ id: it.id, kind: wordCount(it.es) > 1 ? 'tiles' : 'type', final: true });
      }
    }
  }

  // Nothing due and nothing new: offer ungraded practice on the weakest phrases.
  if (!queue.length) {
    const weakest = Object.entries(state.cards)
      .filter(([id]) => byId[id])
      .sort((a, b) => a[1].box - b[1].box || a[1].due - b[1].due)
      .slice(0, 12);
    queue = shuffle(
      weakest.map(([id, c]) => ({ id, kind: reviewKind(byId[id], Math.max(c.box, 2)), practice: true })),
      rng,
    );
  }
  return { queue, lesson };
}

export function startCard(state, id, day) {
  if (!state.cards[id]) state.cards[id] = { box: 0, due: day };
  state.lastNewDay = day;
}

// `clean` means the phrase was answered correctly on every attempt this session.
export function gradeCard(state, id, clean, day) {
  const prev = state.cards[id] || { box: 0 };
  const box = clean ? Math.min(prev.box + 1, MAX_BOX) : 1;
  state.cards[id] = { box, due: day + INTERVALS[box] };
}

export function completeDay(state, day) {
  if (state.lastDone === day) return;
  state.streak = state.lastDone === day - 1 ? state.streak + 1 : 1;
  state.lastDone = day;
}

// --- answer checking ---

export function normalize(s) {
  return s
    .toLowerCase()
    .replace(/[¿?¡!.,;:…"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function stripAccents(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function tokens(es) {
  return normalize(es).split(' ').filter(Boolean);
}

export function levenshtein(a, b) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}

// Returns { correct, note } for a typed Spanish answer. Accents and a single
// slip are forgiven but pointed out, since the goal is speaking, not spelling.
export function checkTyped(input, item) {
  const got = normalize(input);
  if (!got) return { correct: false, note: null };
  const targets = [item.es, ...(item.alt || [])].map(normalize);
  if (targets.includes(got)) return { correct: true, note: null };
  const plain = stripAccents(got);
  if (targets.some((t) => stripAccents(t) === plain)) {
    return { correct: true, note: 'Right — watch the accents.' };
  }
  const main = stripAccents(targets[0]);
  if (main.length >= 5 && levenshtein(plain, main) <= 1) {
    return { correct: true, note: 'Close enough — check the spelling.' };
  }
  return { correct: false, note: null };
}

export function checkTiles(chosen, item) {
  return chosen.join(' ') === tokens(item.es).join(' ');
}
