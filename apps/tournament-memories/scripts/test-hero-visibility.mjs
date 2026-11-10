import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = await readFile(resolve(root, 'app.js'), 'utf8');
const studio = await readFile(resolve(root, 'hero-admin.js'), 'utf8');

const start = app.indexOf('  function rebuildHeroScenes(');
const end = app.indexOf('  function clampCrop(', start);
assert.ok(start >= 0 && end > start, 'Locate actual homepage rotation selection logic');
const rotationSource = app.slice(start, end);

const evaluate = ({ approved = [], reference = [], hidden = [] } = {}) => {
  const logic = new Function('approved','reference','hidden', `
    let APPROVED_HERO_SCENES=approved,ALL_SCENES=reference,HERO_SCENES=[],
        currentHero=0,heroSequence=[0],heroSequencePosition=0;
    const blocked=new Set(hidden);
    const heroTemporarilyHidden=id=>blocked.has(id);
    const shuffleIndices=n=>Array.from({length:n},(_,i)=>i);
    ${rotationSource}
    rebuildHeroScenes();
    return HERO_SCENES.map(scene=>scene.id);
  `);
  return logic(approved, reference, hidden);
};

const reference = [
  { id:'scene-01',enabled:true },
  { id:'scene-02',enabled:true },
  { id:'scene-03',enabled:false }
];
const approved = [
  { id:'approved-a',live:true,enabled:true },
  { id:'approved-b',live:true,enabled:true }
];

assert.deepEqual(evaluate({reference}), [],
  'Legacy samples never appear when no approved hero photos are enabled');
assert.deepEqual(evaluate({reference,approved}), ['approved-a','approved-b'],
  'Only approved real photos appear even when legacy samples remain enabled');
assert.deepEqual(evaluate({reference,approved,hidden:['a']}), ['approved-b'],
  'A hidden approved photo cannot re-enter the rotation');
assert.deepEqual(evaluate({reference,approved,hidden:['a','b']}), [],
  'Hiding the last approved photo shows the branded background, not samples');
assert.deepEqual(evaluate({reference,approved:[{id:'approved-a',live:true,enabled:false}]}), [],
  'A disabled approved photo cannot enter the rotation');
assert.deepEqual(evaluate({reference,approved:[{id:'scene-01',enabled:true}]}), [],
  'An illustrative image without live approval cannot masquerade as a photo');
assert.match(app, /let HERO_SCENES\s*=\s*\[\]/,
  'Never render an unapproved sample image on initial page load');
assert.match(app, /HERO_SCENES\.length<2/,
  'Protect zero/single-slide playback');
assert.match(studio, /checkbox\.disabled=liveSaving\|\|!s\.live/,
  'Studio reference sample inclusion switches must be disabled');
assert.match(studio, /config\.slides\.filter\(s=>s\.live&&s\.enabled\)/,
  'Studio preview/playback only includes approved live photographs');

console.log('PASS: Approved-only hero playback, disabled-photo exclusion, and no legacy sample fallback.');
