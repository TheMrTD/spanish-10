import test from 'node:test';
import assert from 'node:assert/strict';
import { LESSONS, ITEMS } from '../js/content.js';
import {
  newState, buildQueue, startCard, gradeCard, completeDay, currentStreak,
  checkTyped, checkTiles, tokens, reviewKind, nextLesson, INTERVALS,
} from '../js/srs.js';

test('content has unique ids and unique English prompts', () => {
  assert.equal(new Set(ITEMS.map((i) => i.id)).size, ITEMS.length);
  assert.equal(new Set(ITEMS.map((i) => i.en)).size, ITEMS.length);
  assert.equal(new Set(ITEMS.map((i) => i.es)).size, ITEMS.length);
  for (const l of LESSONS) assert.ok(l.items.length >= 4, l.id);
});

test('first day introduces the first lesson, each phrase ending on a graded step', () => {
  const s = newState();
  const { queue, lesson } = buildQueue(s, 100, LESSONS);
  assert.equal(lesson.id, LESSONS[0].id);
  for (const it of lesson.items) {
    const steps = queue.filter((q) => q.id === it.id);
    assert.equal(steps[0].kind, 'intro');
    assert.equal(steps.filter((q) => q.final).length, 1);
  }
});

function playLesson(s, day) {
  const { queue } = buildQueue(s, day, LESSONS);
  for (const step of queue) {
    if (step.kind === 'intro') startCard(s, step.id, day);
    if (step.final) gradeCard(s, step.id, true, day);
  }
  completeDay(s, day);
}

test('new phrases come back the next day and only one lesson is added per day', () => {
  const s = newState();
  playLesson(s, 100);
  assert.equal(buildQueue(s, 100, LESSONS).queue.every((q) => q.practice), true);
  assert.equal(buildQueue(s, 100, LESSONS, { extra: true }).lesson.id, LESSONS[1].id);
  const next = buildQueue(s, 101, LESSONS);
  assert.equal(next.queue.filter((q) => q.final && q.kind === 'listen').length, 6);
  assert.equal(next.lesson.id, LESSONS[1].id);
});

test('grading moves a card up a box when clean and back to box 1 when missed', () => {
  const s = newState();
  s.cards.x = { box: 3, due: 10 };
  gradeCard(s, 'x', true, 10);
  assert.deepEqual(s.cards.x, { box: 4, due: 10 + INTERVALS[4] });
  gradeCard(s, 'x', false, 20);
  assert.deepEqual(s.cards.x, { box: 1, due: 21 });
});

test('a phrase abandoned mid-lesson is still due and not re-introduced', () => {
  const s = newState();
  startCard(s, LESSONS[0].items[0].id, 100);
  const { queue } = buildQueue(s, 100, LESSONS);
  const steps = queue.filter((q) => q.id === LESSONS[0].items[0].id);
  assert.deepEqual(steps.map((q) => q.kind), ['pick-en']);
});

test('streak counts consecutive days and lapses after a missed day', () => {
  const s = newState();
  completeDay(s, 5); completeDay(s, 5); completeDay(s, 6);
  assert.equal(s.streak, 2);
  assert.equal(currentStreak(s, 7), 2);
  assert.equal(currentStreak(s, 8), 0);
  completeDay(s, 8);
  assert.equal(s.streak, 1);
});

test('typed answers forgive punctuation, case, accents and one slip', () => {
  const item = { es: '¿Dónde está el baño?', alt: [] };
  assert.deepEqual(checkTyped('¿Dónde está el baño?', item), { correct: true, note: null });
  assert.equal(checkTyped('donde esta el bano', item).correct, true);
  assert.ok(checkTyped('donde esta el bano', item).note);
  assert.equal(checkTyped('donde esta el banoo', item).correct, true);
  assert.equal(checkTyped('donde es el hotel', item).correct, false);
  assert.equal(checkTyped('', item).correct, false);
  assert.equal(checkTyped('lo siento', { es: 'Perdón', alt: ['lo siento'] }).correct, true);
  assert.equal(checkTyped('no', { es: 'Sí', alt: [] }).correct, false);
});

test('tiles compare against the punctuation-free tokens', () => {
  const item = { es: 'Más despacio, por favor' };
  assert.deepEqual(tokens(item.es), ['más', 'despacio', 'por', 'favor']);
  assert.equal(checkTiles(['más', 'despacio', 'por', 'favor'], item), true);
  assert.equal(checkTiles(['por', 'favor', 'más', 'despacio'], item), false);
});

test('single-word phrases never get a tile exercise', () => {
  for (let box = 0; box <= 7; box++) assert.notEqual(reviewKind({ es: 'Hola' }, box), 'tiles');
});

test('finishing every lesson leaves nothing new to introduce', () => {
  const s = newState();
  for (const it of ITEMS) s.cards[it.id] = { box: 2, due: 999 };
  assert.equal(nextLesson(s, LESSONS), null);
  const { queue } = buildQueue(s, 100, LESSONS);
  assert.ok(queue.length > 0 && queue.every((q) => q.practice));
});
