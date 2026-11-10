import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [app,hub,hubHtml,css] = await Promise.all([
  readFile(resolve(root,'app.js'),'utf8'),
  readFile(resolve(root,'moderator-hub/app.js'),'utf8'),
  readFile(resolve(root,'moderator-hub/index.html'),'utf8'),
  readFile(resolve(root,'styles.css'),'utf8')
]);

assert.match(app,/data-action="report" data-id="\$\{attr\(p\.id\)\}" data-photo-id="\$\{attr\(first\.id\)\}"/,
  'Every visible gallery card must flag the exact photo, not only the post');
assert.match(app,/data-photo-id="\$\{attr\(photo\?\.id\|\|''\)\}"/,
  'The expanded gallery flags the currently selected image in a multi-photo submission');
assert.match(app,/id="photo-flag-form"/,'Public visitors must have a structured report form');
assert.match(app,/name="reason" required/,'Reason is required');
assert.match(app,/name="comments" required minlength="12" maxlength="1200"/,'Report comments are required and bounded');
assert.match(app,/action:'report',photoId:state.reportPhotoId/,'Reports must use the server-side submission gateway');
assert.doesNotMatch(app,/if\(action==='report'\)\{const url=\`mailto:/,
  'Flagging must not unexpectedly launch an email client');
assert.match(app,/state\.adminTab==='reports'\?renderPhotoReportsAdmin\(\)/,
  'Reports must be included in the existing moderation system');
assert.match(app,/memory_staff_review_photo_report/,
  'Moderator disposition must be saved through an authorized backend function');
assert.match(app,/state\.posts\.filter\(x=>x\.status==='approved'&&assets\(x\.id\)\.length>0\)/,
  'A gallery post with no remaining visible photos must disappear from public feed');
assert.match(hubHtml,/id="photo-flags-alert"/,'Staff hub must display pending photo report counts');
assert.match(hubHtml,/tab=reports/,'Staff hub needs a direct link to the report queue');
assert.match(hub,/memory_photo_reports/,'Staff hub must load the protected photo report count');
assert.match(css,/\.photo-card-flag-row/,'Discreet per-photo report styling must exist');
assert.match(css,/\.photo-report-admin/,'The private report queue needs defined styling');

// Exercise the actual public report dialog renderer with a current gallery photo.
const start=app.indexOf('  function renderPhotoFlagModal(){');
const end=app.indexOf('  async function submitPhotoFlag(',start);
assert.ok(start>0&&end>start,'Locate the public report form implementation');
const source=app.slice(start,end);
const photoId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const postId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const state={
  modal:'photo-flag',reportPhotoId:photoId,reportBusy:false,
  photos:[{id:photoId,post_id:postId,position:0,storage_path:'test.jpg',public_visible:true}],
  selectedPost:{id:postId,team_id:'sample-team',tournament_id:'sample-event'},
  imageUrls:new Map([['test.jpg','https://example.com/test.jpg']])
};
const escape = value=>String(value??'').replace(/[&<>"']/g, char=>({
  '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[char]));
const render=new Function('state','modalHead','team','tournament','assets','icon','esc','attr','cleanUrl',
  source+'\nreturn renderPhotoFlagModal;')(
  state,(heading)=>'<h2>'+heading+'</h2>',
  ()=>({name:'Texas SCTP sample team'}),
  ()=>({title:'Example tournament'}),
  id=>state.photos.filter(x=>x.post_id===id),
  ()=>'<svg></svg>',escape,escape,escape
);
const result=render();
for(const required of [
  'id="photo-flag-form"','name="reason"','name="comments"',
  'name="reporterEmail"','name="reporterName"','name="website"',
  'value="privacy_consent"','value="removal_request"','Submit photo report'
])assert.ok(result.includes(required),'Missing public report field: '+required);
assert.ok(result.includes('photograph 1 of 1'),'Report must identify the specific gallery image');

console.log('PASS: Individual photo flags, protected report submission, staff inbox and actions.');
