import { LESSONS, ITEMS, BY_ID } from './content.js';
import {
  SESSION_MS, dayNumber, loadState, saveState, newState, nextLesson, learnedCount, dueCount,
  currentStreak, buildQueue, startCard, gradeCard, completeDay, shuffle, tokens,
  checkTyped, checkTiles,
} from './srs.js';

const app = document.getElementById('app');
let state = loadState(localStorage);
let session = null;
let ticker = null;

const persist = () => saveState(localStorage, state);

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

function show(...nodes) {
  clearInterval(ticker);
  ticker = null;
  app.replaceChildren(...nodes);
  window.scrollTo(0, 0);
}

// ---------- audio ----------

const synth = 'speechSynthesis' in window ? window.speechSynthesis : null;
let voice = null;

function pickVoice() {
  if (!synth) return;
  const voices = synth.getVoices().filter((v) => /^es([-_]|$)/i.test(v.lang));
  const rank = (v) => {
    const i = ['es-mx', 'es-us', 'es-419', 'es-es'].indexOf(v.lang.replace('_', '-').toLowerCase());
    return i < 0 ? 9 : i;
  };
  voice = voices.sort((a, b) => rank(a) - rank(b))[0] || null;
}
if (synth) {
  pickVoice();
  synth.addEventListener?.('voiceschanged', pickVoice);
}

function say(text, slow = false) {
  if (!synth) return;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = voice ? voice.lang : 'es-MX';
  if (voice) u.voice = voice;
  u.rate = slow || state.slow ? 0.6 : 0.9;
  synth.speak(u);
}

const playBtn = (item, label = 'Play') =>
  h('button', { class: 'icon-btn', 'aria-label': label, onclick: () => say(item.es) }, '🔊');
const slowBtn = (item) =>
  h('button', { class: 'icon-btn', 'aria-label': 'Play slowly', onclick: () => say(item.es, true) }, '🐢');

// ---------- home ----------

function home() {
  session = null;
  const day = dayNumber();
  const streak = currentStreak(state, day);
  const due = dueCount(state, day);
  const upcoming = nextLesson(state, LESSONS);
  const doneToday = state.lastDone === day;
  const newToday = state.lastNewDay !== day && upcoming;
  const learned = learnedCount(state);

  let title, detail, cta, extra = false;
  if (!Object.keys(state.cards).length) {
    title = 'Start with hello';
    detail = 'Ten minutes, six phrases. That is the whole job today.';
    cta = 'Start lesson 1';
  } else if (due || newToday) {
    title = doneToday ? 'A little more is waiting' : "Today's 10 minutes";
    detail = [
      due ? `${due} phrase${due === 1 ? '' : 's'} to review` : null,
      newToday ? `new: ${upcoming.title}` : null,
    ].filter(Boolean).join(' · ');
    cta = doneToday ? 'Continue' : 'Start';
  } else {
    title = 'Done for today ✓';
    detail = 'Come back tomorrow — spacing it out is what makes it stick.';
    cta = upcoming ? `Keep going: ${upcoming.title}` : 'Practice weak phrases';
    extra = true;
  }

  const firstOpen = LESSONS.indexOf(upcoming);
  show(
    h('div', { class: 'top' },
      h('h1', null, 'Spanish 10'),
      h('div', { class: `streak${streak ? '' : ' off'}`, 'aria-label': `${streak} day streak` }, `🔥 ${streak}`),
    ),
    h('section', { class: 'card today' },
      h('div', { class: 'today-title' }, title),
      h('p', { class: 'muted' }, detail),
      h('button', { class: `btn${extra ? ' secondary' : ''}`, id: 'start', onclick: () => startSession(extra) }, cta),
    ),
    h('div', { class: 'stats' },
      h('div', { class: 'stat' }, h('b', null, learned), h('span', null, `of ${ITEMS.length} phrases`)),
      h('div', { class: 'stat' }, h('b', null, firstOpen < 0 ? LESSONS.length : firstOpen), h('span', null, `of ${LESSONS.length} lessons`)),
    ),
    h('h2', null, 'Lessons'),
    h('ul', { class: 'lessons' }, LESSONS.map((l, i) => {
      const started = l.items.some((it) => state.cards[it.id]);
      const complete = l.items.every((it) => state.cards[it.id]);
      const cls = complete ? 'done' : l === upcoming ? 'next' : '';
      return h('li', null,
        h('button', { class: `lesson ${cls}`, disabled: !started, onclick: () => lessonView(l) },
          h('span', { class: 'dot' }, complete ? '✓' : i + 1),
          h('span', null, l.title),
        ));
    })),
    h('div', { class: 'footer' },
      h('button', { class: 'link', onclick: toggleSlow }, state.slow ? 'Audio speed: slow' : 'Audio speed: normal'),
      h('button', { class: 'link', onclick: resetProgress }, 'Reset progress'),
    ),
  );
}

function toggleSlow() {
  state.slow = !state.slow;
  persist();
  home();
}

function resetProgress() {
  if (!confirm('Erase all progress and start again from lesson 1?')) return;
  state = newState();
  persist();
  home();
}

function lessonView(lesson) {
  show(
    h('div', { class: 'top' },
      h('h1', null, lesson.title),
      h('button', { class: 'close', 'aria-label': 'Back', onclick: home }, '✕'),
    ),
    h('p', { class: 'muted small' }, 'Tap a speaker to hear the phrase.'),
    h('div', null, lesson.items.filter((it) => state.cards[it.id]).map((it) =>
      h('div', { class: 'phrase' },
        h('div', null, h('b', { lang: 'es' }, it.es), h('span', { class: 'muted' }, it.en)),
        playBtn(it), slowBtn(it),
      ))),
  );
}

// ---------- session ----------

function startSession(extra = false) {
  const day = dayNumber();
  const { queue } = buildQueue(state, day, LESSONS, { extra });
  if (!queue.length) return home();
  session = { queue, i: 0, day, extra, start: Date.now(), missed: new Set(), answered: 0, right: 0, fresh: 0 };
  renderStep();
}

function sessionHeader() {
  const s = session;
  const clock = h('span', { class: 'clock' });
  const tick = () => {
    const left = Math.max(0, SESSION_MS - (Date.now() - s.start));
    const secs = Math.ceil(left / 1000);
    clock.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  };
  tick();
  const header = h('div', { class: 'session-top' },
    h('button', { class: 'close', 'aria-label': 'End session', onclick: () => finish('quit') }, '✕'),
    h('div', { class: 'bar' }, h('i', { style: `width:${Math.round((s.i / s.queue.length) * 100)}%` })),
    clock,
  );
  return { header, tick };
}

function renderStep() {
  const s = session;
  if (s.i >= s.queue.length) return finish('complete');
  if (!s.extra && Date.now() - s.start >= SESSION_MS) return finish('time');

  const step = s.queue[s.i];
  const item = BY_ID[step.id];
  const body = h('div', { class: 'grow' });
  const { header, tick } = sessionHeader();
  show(header, body);
  ticker = setInterval(tick, 1000);
  RENDER[step.kind](body, item, step);
}

function advance() {
  session.i++;
  renderStep();
}

// Records the result, shows the correct answer, and waits for Continue.
function answer(body, item, step, correct, note) {
  const s = session;
  s.answered++;
  if (correct) s.right++;
  if (!correct) {
    s.missed.add(item.id);
    s.queue.splice(Math.min(s.i + 4, s.queue.length), 0, { ...step });
  } else if (step.final && !step.practice) {
    gradeCard(state, item.id, !s.missed.has(item.id), s.day);
    persist();
  }
  body.querySelector('.actions')?.remove();
  say(item.es);
  const next = h('button', { class: `btn${correct ? ' good' : ''}`, id: 'continue', onclick: advance }, 'Continue');
  body.append(
    h('div', { class: `feedback ${correct ? 'ok' : 'no'}`, role: 'status' },
      h('div', { class: 'verdict' }, correct ? (note || '¡Correcto!') : 'Not quite — here it is:'),
      h('div', { class: 'row' },
        h('div', null, h('div', { class: 'es', lang: 'es' }, item.es), h('div', { class: 'muted' }, item.en)),
        playBtn(item),
      ),
      item.note && !correct ? h('p', { class: 'small muted', style: 'margin-top:8px' }, item.note) : null,
      next,
    ),
  );
  next.scrollIntoView({ block: 'nearest' });
}

// Other phrases to use as wrong answers: things already met, plus the item's own lesson.
function distractors(item, n) {
  const lesson = LESSONS.find((l) => l.items.includes(item));
  const pool = new Set([...lesson.items, ...ITEMS.filter((it) => state.cards[it.id])]);
  pool.delete(item);
  return shuffle([...pool]).slice(0, n);
}

function choice(body, item, step, field) {
  const options = shuffle([item, ...distractors(item, 3)]);
  const buttons = options.map((opt) =>
    h('button', {
      class: 'option', lang: field === 'es' ? 'es' : null,
      onclick: () => {
        buttons.forEach((b, i) => {
          b.disabled = true;
          if (options[i] === item) b.classList.add('right');
        });
        const correct = opt === item;
        if (!correct) buttons[options.indexOf(opt)].classList.add('wrong');
        answer(body, item, step, correct);
      },
    }, opt[field]));
  body.append(h('div', { class: 'options' }, buttons));
}

const RENDER = {
  intro(body, item) {
    startCard(state, item.id, session.day);
    persist();
    session.fresh++;
    body.append(
      h('div', { class: 'label' }, 'New phrase'),
      h('div', { class: 'prompt', lang: 'es' }, item.es),
      h('div', { class: 'sub' }, item.en),
      item.note ? h('div', { class: 'note' }, item.note) : null,
      h('div', { style: 'display:flex;gap:10px;margin-top:20px' }, playBtn(item), slowBtn(item)),
      h('p', { class: 'muted small', style: 'margin-top:14px' }, 'Listen, then say it out loud.'),
      h('div', { class: 'actions' }, h('button', { class: 'btn', id: 'continue', onclick: advance }, 'Got it')),
    );
    say(item.es);
  },

  'pick-en'(body, item, step) {
    body.append(
      h('div', { class: 'label' }, 'What does this mean?'),
      h('div', { class: 'prompt-row' }, h('div', { class: 'prompt', lang: 'es' }, item.es), playBtn(item)),
    );
    choice(body, item, step, 'en');
    say(item.es);
  },

  listen(body, item, step) {
    body.append(
      h('div', { class: 'label' }, 'Listen — what did you hear?'),
      h('button', { class: 'big-play', 'aria-label': 'Play phrase', onclick: () => say(item.es) }, '🔊'),
      h('div', { style: 'text-align:center' },
        h('button', { class: 'link', onclick: () => say(item.es, true) }, 'Play slowly')),
    );
    // No speech engine available: fall back to showing the text so the step is still answerable.
    if (!synth) body.append(h('div', { class: 'prompt', lang: 'es', style: 'text-align:center' }, item.es));
    choice(body, item, step, 'en');
    say(item.es);
  },

  'pick-es'(body, item, step) {
    body.append(
      h('div', { class: 'label' }, 'How do you say it?'),
      h('div', { class: 'prompt' }, item.en),
    );
    choice(body, item, step, 'es');
  },

  tiles(body, item, step) {
    const want = tokens(item.es);
    const extra = shuffle([...new Set(distractors(item, 6).flatMap((d) => tokens(d.es)))])
      .filter((w) => !want.includes(w))
      .slice(0, 3);
    const words = shuffle([...want, ...extra]);
    const chosen = [];
    const slots = h('div', { class: 'slots', 'aria-label': 'Your answer' });
    const check = h('button', { class: 'btn', id: 'check', disabled: true, onclick: submit }, 'Check');
    const bank = words.map((w, i) => h('button', { class: 'tile', lang: 'es', onclick: () => pick(i) }, w));
    let locked = false;

    function pick(i) {
      if (locked) return;
      chosen.push(i);
      bank[i].classList.add('used');
      bank[i].disabled = true;
      draw();
    }
    function unpick(pos) {
      if (locked) return;
      const [i] = chosen.splice(pos, 1);
      bank[i].classList.remove('used');
      bank[i].disabled = false;
      draw();
    }
    function draw() {
      slots.replaceChildren(...chosen.map((i, pos) =>
        h('button', { class: 'tile', lang: 'es', onclick: () => unpick(pos) }, words[i])));
      check.disabled = !chosen.length;
    }
    function submit() {
      locked = true;
      answer(body, item, step, checkTiles(chosen.map((i) => words[i]), item));
    }

    body.append(
      h('div', { class: 'label' }, 'Build it in Spanish'),
      h('div', { class: 'prompt' }, item.en),
      slots,
      h('div', { class: 'bank' }, bank),
      h('div', { class: 'actions' }, check),
    );
  },

  type(body, item, step) {
    const input = h('input', {
      class: 'answer', id: 'answer', type: 'text', lang: 'es', placeholder: 'Type the Spanish',
      autocomplete: 'off', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false',
      enterkeyhint: 'done',
    });
    const check = h('button', { class: 'btn', id: 'check', disabled: true, onclick: submit }, 'Check');
    function submit() {
      if (input.disabled || !input.value.trim()) return;
      input.disabled = true;
      const { correct, note } = checkTyped(input.value, item);
      answer(body, item, step, correct, note);
    }
    input.addEventListener('input', () => { check.disabled = !input.value.trim(); });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    body.append(
      h('div', { class: 'label' }, 'Write it in Spanish'),
      h('div', { class: 'prompt' }, item.en),
      input,
      h('p', { class: 'muted small', style: 'margin-top:8px' }, 'Accents are optional here.'),
      h('div', { class: 'actions' },
        check,
        h('button', { class: 'btn secondary', onclick: () => { input.disabled = true; answer(body, item, step, false); } }, "I don't know"),
      ),
    );
  },

  speak(body, item, step) {
    const actions = h('div', { class: 'actions' },
      h('button', {
        class: 'btn', id: 'reveal',
        onclick: () => {
          say(item.es);
          actions.replaceChildren(
            h('div', { class: 'note' },
              h('div', { class: 'row', style: 'display:flex;align-items:center;gap:12px' },
                h('b', { lang: 'es', style: 'flex:1;font-size:20px' }, item.es), playBtn(item))),
            h('p', { class: 'muted small', style: 'margin:14px 0 10px' }, 'Did you say it right?'),
            h('button', { class: 'btn good', id: 'yes', onclick: () => answer(body, item, step, true, 'Nice — on to the next.') }, 'Yes, I had it'),
            h('button', { class: 'btn secondary', id: 'no', onclick: () => answer(body, item, step, false) }, 'Not yet'),
          );
        },
      }, 'Reveal'),
    );
    body.append(
      h('div', { class: 'label' }, 'Say it out loud in Spanish'),
      h('div', { class: 'prompt' }, item.en),
      h('p', { class: 'sub' }, 'Say it, then check yourself.'),
      actions,
    );
  },
};

function finish(reason) {
  const s = session;
  session = null;
  synth?.cancel();
  if (reason === 'quit' && !s.answered) return home();
  if (reason !== 'quit') {
    completeDay(state, s.day);
    persist();
  }
  const mins = Math.max(1, Math.round((Date.now() - s.start) / 60000));
  const headline = reason === 'time' ? "Time's up — that's your 10" : reason === 'quit' ? 'Stopped early' : '¡Buen trabajo!';
  const detail = reason === 'quit'
    ? 'Your progress so far is saved. Finish the session to keep your streak.'
    : reason === 'time'
      ? 'Anything you did not reach will be waiting tomorrow.'
      : 'That is everything for today. See you tomorrow.';
  show(
    h('div', { class: 'finished grow' },
      h('div', { class: 'emoji' }, reason === 'quit' ? '⏸️' : '🎉'),
      h('h1', null, headline),
      h('p', { class: 'muted' }, detail),
      h('div', { class: 'stats' },
        h('div', { class: 'stat' }, h('b', null, `🔥 ${currentStreak(state, s.day)}`), h('span', null, 'day streak')),
        h('div', { class: 'stat' }, h('b', null, s.fresh), h('span', null, 'new phrases')),
        h('div', { class: 'stat' }, h('b', null, `${s.right}/${s.answered}`), h('span', null, `right · ${mins} min`)),
      ),
    ),
    h('button', { class: 'btn', id: 'home', onclick: home }, 'Done'),
  );
}

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

home();
