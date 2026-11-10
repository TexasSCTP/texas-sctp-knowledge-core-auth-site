import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const app = await readFile(resolve(root, 'app.js'), 'utf8');
const studio = await readFile(resolve(root, 'hero-admin.js'), 'utf8');

const start = app.indexOf('  function rebuildHeroScenes(');
const end = app.indexOf('  function clampCrop(', start);
assert.ok(start >= 0 && end > start, 'Locate the actual homepage hero selection logic');
const rotationSource = app.slice(start, end);

const evaluate = ({
  approved = [], reference = [], hiddenApproved = [], hiddenReferences = []
} = {}) => {
  const logic = new Function('approved','reference','hiddenApproved','hiddenReferences',`
    let APPROVED_HERO_SCENES=approved,REFERENCE_HERO_SCENES=reference,HERO_SCENES=[],
        currentHero=0,heroSequence=[0],heroSequencePosition=0;
    const hiddenLive=new Set(hiddenApproved),hiddenRef=new Set(hiddenReferences);
    const heroTemporarilyHidden=id=>hiddenLive.has(id);
    const referenceTemporarilyHidden=id=>hiddenRef.has(id);
    const shuffleIndices=n=>Array.from({length:n},(_,i)=>i);
    ${rotationSource}
    rebuildHeroScenes();
    return HERO_SCENES.map(scene=>scene.id);
  `);
  return logic(approved, reference, hiddenApproved, hiddenReferences);
};

const approved = [
  { id:'approved-a',live:true,enabled:true },
  { id:'approved-b',live:true,enabled:true }
];
const referenceOn = [
  { id:'scene-01',reference:true,enabled:true },
  { id:'scene-02',reference:true,enabled:false }
];

assert.deepEqual(evaluate(), [], 'No samples should appear without explicit approval');
assert.deepEqual(evaluate({approved}), ['approved-a','approved-b'],
  'Approved enabled gallery photos are displayed');
assert.deepEqual(evaluate({reference:referenceOn}), ['scene-01'],
  'An explicitly enabled original slideshow image is displayed');
assert.deepEqual(evaluate({approved,reference:referenceOn}),
  ['approved-a','approved-b','scene-01'],
  'Approved submissions and manually enabled original images coexist');
assert.deepEqual(evaluate({approved,reference:referenceOn,hiddenReferences:['scene-01']}),
  ['approved-a','approved-b'], 'Disabling an original scene removes it immediately');
assert.deepEqual(evaluate({approved,reference:referenceOn,hiddenApproved:['a']}),
  ['approved-b','scene-01'], 'Disabling one gallery photo preserves the other scenes');
assert.deepEqual(evaluate({reference:[{id:'scene-02',reference:true,enabled:false}]}), [],
  'An original photograph marked OFF never appears as automatic fallback');
assert.deepEqual(evaluate({reference:[{id:'scene-02',enabled:true}]}), [],
  'An original image cannot appear without a verified reference setting');
assert.deepEqual(evaluate({approved:[{id:'approved-a',live:true,enabled:false}]}), [],
  'Gallery photos marked OFF are excluded');
assert.match(app, /let HERO_SCENES\s*=\s*\[\]/,
  'The hero starts empty until server choices load');
assert.match(app, /memory_hero_reference_choices/,
  'The public hero reads authoritative reference choices from Supabase');
assert.match(studio, /memory_staff_save_reference_hero_scene/,
  'Original photos are saved through a server-authorized function');
assert.match(studio, /checkbox\.disabled=liveSaving\|\|\(s\.reference&&\!canManageReferences\)/,
  'Only authorized statewide staff can toggle original images');
assert.match(studio, /config\.slides\.filter\(s=>\(s\.live\|\|s\.reference\)&&s\.enabled\)/,
  'Studio playback reflects both explicitly enabled types');
console.log('PASS: Approved and original slideshow images require explicit ON settings; OFF is respected.');
