/* Team Logo Portal verified listing editor, accessible only after server-authenticated staff access. */
export function createProfileEditor({getTeams,getRanges,request,onSaved}) {
 const $=id=>document.getElementById(id);
 const dialog=$('profile-dialog'),form=$('profile-form');
 let teamId=null,busy=false;
 const val=id=>$(id).value.trim();
 function feedback(message,error=false) {
   const n=$('profile-form-status');
   n.textContent=message||'';
   n.className='profile-form-status'+(error?' error':'');
 }
 function setBusy(next) {
   busy=next;
   $('profile-save').disabled=next;
   $('profile-cancel').disabled=next;
   $('profile-close').disabled=next;
   $('add-range').disabled=next;
   $('profile-save').textContent=next?'Saving…':'Save team listing';
 }
 function showType(){
   const kind=val('profile-team-kind');
   $('school-fields').hidden=kind!=='school';
   $('club-fields').hidden=kind!=='club';
 }
 function fillRanges(selected=''){
   const element=$('profile-home-range');
   element.replaceChildren(new Option('Choose a primary practice range',''));
   for (const range of getRanges().filter(x=>x.active!==false).sort((a,b)=>a.name.localeCompare(b.name))) {
     element.add(new Option(range.name+' · '+range.city+', '+range.state,range.id));
   }
   element.value=selected;
 }
 function open(id) {
   if(busy)return;
   const team=getTeams().find(t=>t.id===id);
   if(!team)return;
   teamId=team.id;
   const p=team.profile||{};
   $('profile-dialog-heading').textContent='Edit team listing';
   $('profile-team-description').textContent=team.name+(team.shotTeamId?' · SHOT ID '+team.shotTeamId:'');
   $('profile-team-kind').value=p.team_kind||'';
   $('profile-school-name').value=p.school_name||'';
   $('profile-school-city').value=p.school_city||'';
   fillRanges(p.home_range_id||'');
   $('profile-contact-role').value=p.contact_role||'';
   $('profile-contact-name').value=p.contact_name||'';
   $('profile-email').value=p.organization_email||'';
   $('profile-contact-public').checked=p.contact_public_approved===true;
   $('profile-approved').checked=p.profile_status==='approved';
   $('profile-source-note').value=p.source_note||'';
   $('new-range-name').value='';
   $('new-range-city').value='';
   $('new-range-state').value='TX';
   $('new-range-toggle').open=false;
   feedback('');
   setBusy(false);
   showType();
   dialog.showModal();
   $('profile-team-kind').focus();
 }
 function close(){
   if(busy)return;
   if(dialog.open)dialog.close();
   teamId=null;
   feedback('');
 }
 async function addRange(){
   if(busy)return;
   const name=val('new-range-name'),city=val('new-range-city'),state=val('new-range-state').toUpperCase();
   if(name.length<2||city.length<2||!/^[A-Z]{2}$/.test(state)){
     feedback('Enter the verified range name, city, and two-letter state.',true);return;
   }
   setBusy(true);
   feedback('Adding verified range to the directory…');
   try {
     const result=await request('staff_range_add',{name,city,state});
     if(!result.ok||!result.range?.id)throw Error('The range was not confirmed by the server.');
     getRanges().push(result.range);
     fillRanges(result.range.id);
     $('new-range-toggle').open=false;
     feedback('Range added. Select “Approve” after confirming this is the team’s primary practice range.');
   } catch(e){feedback(e.message||'Could not add range.',true);}
   finally{setBusy(false);}
 }
 async function save(e){
   e.preventDefault();
   if(busy||!teamId)return;
   const teamKind=val('profile-team-kind')||null;
   const profileStatus=$('profile-approved').checked?'approved':'draft';
   const organizationEmail=val('profile-email').toLowerCase();
   const contactPublicApproved=$('profile-contact-public').checked;
   const formData={
     teamId,teamKind,
     schoolName:teamKind==='school'?val('profile-school-name'):null,
     schoolCity:teamKind==='school'?val('profile-school-city'):null,
     homeRangeId:teamKind==='club'?val('profile-home-range'):null,
     contactRole:val('profile-contact-role')||null,
     contactName:val('profile-contact-name')||null,
     organizationEmail:organizationEmail||null,
     contactPublicApproved,profileStatus,sourceNote:val('profile-source-note')||null
   };
   if(profileStatus==='approved'&&!((teamKind==='school'&&formData.schoolName&&formData.schoolCity)||(teamKind==='club'&&formData.homeRangeId))){
     feedback('To approve: provide the school name and city, or select the club’s confirmed home range.',true);return;
   }
   if(contactPublicApproved&&!(profileStatus==='approved'&&formData.contactRole&&formData.contactName&&formData.organizationEmail)){
     feedback('Public contact approval requires an approved profile, name, role, and email.',true);return;
   }
   setBusy(true);feedback('Saving to the verified team directory…');
   try{
     const result=await request('staff_profile_save',formData);
     if(result.ok!==true||result.teamId!==teamId)throw Error('The server did not confirm this save.');
     dialog.close();
     teamId=null;
     await onSaved();
   }catch(e){feedback('Save failed: '+(e.message||'Please try again.'),true);}
   finally{setBusy(false);}
 }
 form.addEventListener('submit',save);
 $('profile-team-kind').addEventListener('change',()=>{showType();$('profile-approved').checked=false;$('profile-contact-public').checked=false;});
 for(const id of ['profile-school-name','profile-school-city','profile-home-range']){
   $(id).addEventListener('change',()=>{$('profile-approved').checked=false;$('profile-contact-public').checked=false;});
 }
 for(const id of ['profile-contact-role','profile-contact-name','profile-email']){
   $(id).addEventListener('change',()=>{$('profile-contact-public').checked=false;});
 }
 $('add-range').addEventListener('click',addRange);
 $('profile-close').addEventListener('click',close);
 $('profile-cancel').addEventListener('click',close);
 dialog.addEventListener('cancel',e=>{if(busy)e.preventDefault();else teamId=null;});
 return {open};
}
