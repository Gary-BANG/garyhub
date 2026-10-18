/* Shared recovery dialog for Calendar, Tools, homepage and the academic login form. */
(()=>{'use strict';
if(window.GaryHubPasswordReset)return;
const t=s=>window.GaryHubI18n?.t(s)||s;
let dialog,requestId=null,resetToken=null,csrf=null,epoch=0,busy=false,retryAt=0,trigger=null,timer=null;
const $=id=>dialog.querySelector('#'+id);
async function api(route,body){
 if(!csrf){const response=await fetch('/api/csrf',{cache:'no-store',credentials:'same-origin'});if(!response.ok)throw Error('页面校验已失效，请刷新后重试。');csrf=(await response.json()).token;}
 const response=await fetch('/api/password-reset/'+route,{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify(body)});
 const result=await response.json();if(!response.ok){if(response.status===403)csrf=null;throw Error(result.message||'请求失败，请稍后重试。');}return result;
}
function controls(){if(!dialog)return;const seconds=Math.max(0,Math.ceil((retryAt-Date.now())/1000));for(const button of dialog.querySelectorAll('button[type="submit"]'))button.disabled=busy;$('recoveryIdentifier').disabled=busy;$('recoverySend').disabled=busy||seconds>0;$('recoverySend').textContent=seconds>0?t('重新发送')+' ('+seconds+'s)':t(requestId?'重新发送':'发送验证码');}
function status(message){$('recoveryMessage').textContent=t(message);}
function clear(){epoch++;busy=false;requestId=null;resetToken=null;csrf=null;retryAt=0;clearInterval(timer);timer=null;for(const f of dialog.querySelectorAll('form'))f.reset();$('recoveryVerifyForm').hidden=true;$('recoveryPasswordForm').hidden=true;$('recoveryRequestForm').hidden=false;status('');controls();}
function create(){
 if(dialog)return;
 dialog=document.createElement('dialog');dialog.id='passwordRecoveryDialog';dialog.className='password-recovery';dialog.setAttribute('aria-labelledby','recoveryTitle');
 dialog.innerHTML='<div class="recovery-heading"><h2 id="recoveryTitle">忘记密码</h2><button id="recoveryClose" type="button" aria-label="关闭密码找回">×</button></div><p class="recovery-help">使用账号原先绑定并验证的邮箱找回密码。没有验证邮箱或无法收件时，请联系管理员。</p><form id="recoveryRequestForm"><label for="recoveryIdentifier">用户名或邮箱</label><input id="recoveryIdentifier" autocomplete="username" maxlength="254" required><button id="recoverySend" type="submit">发送验证码</button></form><form id="recoveryVerifyForm" hidden><label for="recoveryCode">邮箱验证码</label><input id="recoveryCode" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required><button type="submit">验证验证码</button></form><form id="recoveryPasswordForm" hidden><label for="recoveryPassword">新密码</label><input id="recoveryPassword" type="password" autocomplete="new-password" minlength="10" maxlength="128" required><label for="recoveryConfirm">确认新密码</label><input id="recoveryConfirm" type="password" autocomplete="new-password" minlength="10" maxlength="128" required><p class="recovery-help">新密码应为10–128个字符。</p><button type="submit">重置密码</button></form><p id="recoveryMessage" role="status" aria-live="polite"></p>';
 document.body.append(dialog);
 $('recoveryClose').onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>{clear();trigger?.focus();});
 $('recoveryIdentifier').oninput=()=>{epoch++;requestId=null;resetToken=null;retryAt=0;$('recoveryVerifyForm').hidden=true;$('recoveryPasswordForm').hidden=true;$('recoveryCode').value='';controls();};
 $('recoveryRequestForm').onsubmit=async event=>{event.preventDefault();if(busy||Date.now()<retryAt)return;const own=epoch;busy=true;controls();try{const result=await api('request',{identifier:$('recoveryIdentifier').value.trim()});if(own!==epoch)return;requestId=result.requestId;retryAt=Date.now()+60000;$('recoveryVerifyForm').hidden=false;status(result.message);$('recoveryCode').focus();}catch(error){if(own===epoch)status(error.message);}finally{if(own===epoch){busy=false;controls();}}};
 $('recoveryVerifyForm').onsubmit=async event=>{event.preventDefault();if(busy||!requestId)return;const own=epoch;busy=true;controls();try{const result=await api('verify',{requestId,code:$('recoveryCode').value});if(own!==epoch)return;resetToken=result.resetToken;$('recoveryRequestForm').hidden=true;$('recoveryVerifyForm').hidden=true;$('recoveryPasswordForm').hidden=false;status(result.message);$('recoveryPassword').focus();}catch(error){if(own===epoch)status(error.message);}finally{if(own===epoch){busy=false;controls();}}};
 $('recoveryPasswordForm').onsubmit=async event=>{event.preventDefault();if(busy||!resetToken)return;if($('recoveryPassword').value!==$('recoveryConfirm').value){status('两次输入的密码不一致。');return;}const own=epoch;busy=true;controls();try{const result=await api('complete',{requestId,resetToken,password:$('recoveryPassword').value,confirmPassword:$('recoveryConfirm').value});if(own!==epoch)return;resetToken=null;requestId=null;for(const f of dialog.querySelectorAll('form')){f.hidden=true;f.reset();}status(result.message);document.dispatchEvent(new CustomEvent('garyhub:password-reset'));}catch(error){if(own===epoch)status(error.message);}finally{if(own===epoch){busy=false;controls();}}};
}
function open(button){create();clear();trigger=button;const form=button.closest('form'),identifier=form?.querySelector('[autocomplete="username"]');if(identifier)$('recoveryIdentifier').value=identifier.value;dialog.showModal();window.GaryHubI18n?.scan(dialog);timer=setInterval(controls,500);$('recoveryIdentifier').focus();}
function mount(){
 for(const form of document.querySelectorAll('form')){
  if(form.closest('#passwordRecoveryDialog')||form.dataset.recoveryMounted||!form.querySelector('input[autocomplete="current-password"]'))continue;
  const identifier=form.querySelector('input[autocomplete="username"]');if(!identifier)continue;
  form.dataset.recoveryMounted='true';identifier.maxLength=254;
  const button=document.createElement('button');button.type='button';button.className='password-recovery-trigger';button.textContent=t('忘记密码？');button.onclick=()=>open(button);form.append(button);
 }
}
function start(){mount();new MutationObserver(mount).observe(document.body,{childList:true,subtree:true});}
window.GaryHubPasswordReset={open};
document.addEventListener('garyhub:language',controls);
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
