
const DB_NAME="cartonath-db", DB_VERSION=2;
const STORES={clients:"clients",methods:"methods",appointments:"appointments",meta:"meta"};
const DEFAULT_METHODS=[["Bússola do Amor",3000],["Templo de Afrodite",2500],["Leitura de Sonhos",3000],["Energia Geral",2500],["Energia Financeira",3000],["Aniversário",3500],["Mediunidade",3500],["Plano de Carreira",3500],["Que Frequência Estou?",2500],["1 Pergunta Objetiva",1000],["3 Perguntas Objetivas",2000],["6 Perguntas Objetivas",3500],["1 Hora Atendimento",6000]];
let db,calendarDate=new Date(),selectedDate=dateKey(new Date()),financeDate=new Date(),lastDeleted=null,toastTimer=null;
const C=CartoCore;

function uid(){return crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random()}
function dateKey(d){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`}
function parseDate(s){const [y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d)}
function brl(c){return C.fromCents(c).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}
function dayLabel(d){return d.toLocaleDateString("pt-BR",{weekday:"long",day:"2-digit",month:"long"}).replace(/^./,x=>x.toUpperCase())}
function monthLabel(d){return d.toLocaleDateString("pt-BR",{month:"long",year:"numeric"}).replace(/^./,x=>x.toUpperCase())}
function esc(s=""){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function statusLabel(s){return {pendente:"Pendente",a_receber:"A receber",recebido:"Recebido"}[s]||s}
function showFatal(msg){const e=document.getElementById("fatal");e.classList.remove("hidden");e.innerHTML=`<h1>Não foi possível abrir a agenda</h1><p>${esc(msg)}</p><p>Não apague dados do Safari. Feche o app e tente novamente.</p>`}
function showToast(text,undo){const t=document.getElementById("toast");t.innerHTML=esc(text)+(undo?' <button id="undoBtn">Desfazer</button>':"");t.classList.remove("hidden");clearTimeout(toastTimer);if(undo)document.getElementById("undoBtn").onclick=undo;toastTimer=setTimeout(()=>t.classList.add("hidden"),6000)}

function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open(DB_NAME,DB_VERSION);r.onupgradeneeded=e=>{const d=e.target.result;for(const s of [STORES.clients,STORES.methods,STORES.appointments])if(!d.objectStoreNames.contains(s))d.createObjectStore(s,{keyPath:"id"});if(!d.objectStoreNames.contains(STORES.meta))d.createObjectStore(STORES.meta,{keyPath:"key"});};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error("Banco bloqueado por outra versão aberta."));})}
function os(name,mode="readonly"){return db.transaction(name,mode).objectStore(name)}
function all(name){return new Promise((res,rej)=>{const r=os(name).getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function one(name,id){return new Promise((res,rej)=>{const r=os(name).get(id);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function put(name,obj){return new Promise((res,rej)=>{const r=os(name,"readwrite").put(obj);r.onsuccess=()=>res(obj);r.onerror=()=>rej(r.error)})}
function removeOne(name,key){return new Promise((res,rej)=>{const r=os(name,"readwrite").delete(key);r.onsuccess=()=>res();r.onerror=()=>rej(r.error)})}

async function migrateData(){
  const apps=await all(STORES.appointments);
  for(const a of apps){const m=C.migrateAppointment(a);if(JSON.stringify(m)!==JSON.stringify(a))await put(STORES.appointments,m)}
  const methods=await all(STORES.methods);
  for(const m of methods){if(m.valueCents==null){m.valueCents=C.toCents(m.value||0);delete m.value;await put(STORES.methods,m)}}
}
async function seed(){
  if(!(await all(STORES.methods)).length)for(const [name,valueCents] of DEFAULT_METHODS)await put(STORES.methods,{id:uid(),name,valueCents,archived:false});
}
async function integrityCheck(){
  const [apps,clients]=await Promise.all([all(STORES.appointments),all(STORES.clients)]);
  const ids=new Set(clients.filter(x=>!x.deletedAt).map(x=>x.id)),issues=[];
  for(const a of apps.filter(x=>!x.deletedAt)){const e=C.validateAppointment(a);if(e.length)issues.push(`${a.id}: ${e.join(",")}`);if(!ids.has(a.clientId))issues.push(`${a.id}: cliente ausente`)}
  if(issues.length){console.error("Integrity issues",issues);showToast(`${issues.length} inconsistência(s) detectada(s). Evite editar até revisar.`)}
  return issues;
}
async function persist(){try{if(navigator.storage?.persist)await navigator.storage.persist()}catch{}}

document.addEventListener("DOMContentLoaded",init);
async function init(){
 try{
  db=await openDB(); await migrateData(); await seed(); await persist(); bind(); await refresh(); await integrityCheck(); await renderBackupSafetyState();
  if("serviceWorker"in navigator){navigator.serviceWorker.register("sw.v05.js").catch(console.error)}
 }catch(e){console.error(e);showFatal(e.message||String(e))}
}
window.addEventListener("error",e=>console.error("UI error",e.error||e.message));
window.addEventListener("unhandledrejection",e=>console.error("Promise error",e.reason));

function bind(){
 document.querySelectorAll(".nav").forEach(b=>b.onclick=()=>showView(b.dataset.view));
 document.querySelectorAll("[data-nav]").forEach(b=>b.onclick=()=>showView(b.dataset.nav));
 document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>document.getElementById(b.dataset.close).close());
 newAppointmentBtn.onclick=()=>openAppointment(); newClientBtn.onclick=()=>openClient(); quickNewClientBtn.onclick=()=>{appointmentDialog.close();openClient(true)};
 openMethodsBtn.onclick=async()=>{await renderMethods();methodsDialog.showModal()};
 appointmentMethod.onchange=async()=>{const m=await one(STORES.methods,appointmentMethod.value);if(m)appointmentBaseValue.value=(m.valueCents/100).toFixed(2).replace(".",",");updateTotal()};
 appointmentBaseValue.oninput=updateTotal; addExtraBtn.onclick=()=>addExtra(); appointmentFinancialStatus.onchange=toggleFinancialDates; appointmentPaymentMethod.onchange=()=>{if(appointmentPaymentMethod.value==="Crédito"&&appointmentFinancialStatus.value==="recebido")appointmentFinancialStatus.value="a_receber";toggleFinancialDates()};
 appointmentForm.oninput=saveDraft; appointmentForm.onchange=saveDraft; appointmentForm.onsubmit=saveAppointment; deleteAppointmentBtn.onclick=softDeleteAppointment;
 clientForm.onsubmit=saveClient; deleteClientBtn.onclick=softDeleteClient; clientSearch.oninput=renderClients;
 methodForm.onsubmit=saveMethod; cancelMethodEditBtn.onclick=resetMethod;
 exportBackupBtn.onclick=exportBackup; importBackupBtn.onclick=()=>backupFileInput.click(); backupFileInput.onchange=importBackup; undoRestoreBtn.onclick=undoLastRestore;
 prevMonthBtn.onclick=()=>{calendarDate.setMonth(calendarDate.getMonth()-1);renderCalendar()};nextMonthBtn.onclick=()=>{calendarDate.setMonth(calendarDate.getMonth()+1);renderCalendar()};
 todayBtn.onclick=()=>{calendarDate=new Date();selectedDate=dateKey(new Date());renderCalendar();renderSelectedDate()};
 prevFinanceMonthBtn.onclick=()=>{financeDate.setMonth(financeDate.getMonth()-1);renderFinance()};nextFinanceMonthBtn.onclick=()=>{financeDate.setMonth(financeDate.getMonth()+1);renderFinance()};
}
function showView(v){document.querySelectorAll(".view").forEach(x=>x.classList.remove("active"));document.getElementById("view-"+v).classList.add("active");document.querySelectorAll(".nav").forEach(x=>x.classList.toggle("active",x.dataset.view===v));if(v==="agenda"){renderCalendar();renderSelectedDate()}if(v==="clientes")renderClients();if(v==="financeiro")renderFinance();scrollTo(0,0)}
async function refresh(){todayLabel.textContent=dayLabel(new Date());await Promise.all([populateSelects(),renderToday(),renderCalendar(),renderSelectedDate(),renderClients(),renderFinance()])}
async function populateSelects(){const cs=(await all(STORES.clients)).filter(x=>!x.deletedAt).sort((a,b)=>a.name.localeCompare(b.name));const ms=(await all(STORES.methods)).filter(x=>!x.archived).sort((a,b)=>a.name.localeCompare(b.name));appointmentClient.innerHTML='<option value="">Selecione...</option>'+cs.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join("");appointmentMethod.innerHTML='<option value="">Selecione...</option>'+ms.map(m=>`<option value="${m.id}">${esc(m.name)} — ${brl(m.valueCents)}</option>`).join("")}
function card(a,cm){return `<button class="appointment-card" onclick="openAppointment('${a.id}')"><div><div class="card-title">${esc(a.time)} · ${esc(cm[a.clientId]?.name||"Cliente")}</div><div class="card-meta">${esc(a.methodNameSnapshot||"Método")}</div><span class="status ${a.financialStatus}">${statusLabel(a.financialStatus)}</span></div><div class="amount">${brl(C.totalCents(a))}</div></button>`}
async function renderToday(){const [apps0,cs]=await Promise.all([all(STORES.appointments),all(STORES.clients)]),apps=apps0.filter(x=>!x.deletedAt),cm=Object.fromEntries(cs.map(x=>[x.id,x])),today=dateKey(new Date()),list=apps.filter(a=>a.date===today).sort((a,b)=>a.time.localeCompare(b.time));const now=new Date();const next=list.find(a=>{const[h,m]=a.time.split(":").map(Number),d=new Date();d.setHours(h,m,0,0);return d>=now})||list[0];nextAppointment.innerHTML=next?`<div class="next-time">${esc(next.time)}</div><div class="next-name">${esc(cm[next.clientId]?.name||"Cliente")}</div><div class="next-meta">${esc(next.methodNameSnapshot||"Método")} · ${brl(C.totalCents(next))}</div>`:`<div style="padding-top:10px">Nenhum atendimento agendado para hoje. ✦</div>`;todayAppointments.innerHTML=list.length?list.map(a=>card(a,cm)).join(""):'<div class="empty">Hoje está livre.</div>';const ym=dateKey(new Date()).slice(0,7),f=C.financeForMonth(apps,ym);monthBilled.textContent=brl(f.billed);monthReceived.textContent=brl(f.received);monthReceivable.textContent=brl(f.receivable)}
async function renderCalendar(){const apps=(await all(STORES.appointments)).filter(x=>!x.deletedAt);calendarTitle.textContent=monthLabel(calendarDate);calendarGrid.innerHTML="";const y=calendarDate.getFullYear(),m=calendarDate.getMonth(),first=new Date(y,m,1),start=new Date(y,m,1-((first.getDay()+6)%7)),today=dateKey(new Date());for(let i=0;i<42;i++){const d=new Date(start);d.setDate(start.getDate()+i);const k=dateKey(d),count=apps.filter(a=>a.date===k).length,b=document.createElement("button");b.className="day"+(d.getMonth()!==m?" other":"")+(k===today?" today":"")+(k===selectedDate?" selected":"");b.innerHTML=d.getDate()+(count?`<span class="dots">${'<i class="dot"></i>'.repeat(Math.min(count,3))}</span>`:"");b.onclick=()=>{selectedDate=k;renderCalendar();renderSelectedDate()};calendarGrid.appendChild(b)}}
async function renderSelectedDate(){const[apps,cs]=await Promise.all([all(STORES.appointments),all(STORES.clients)]),cm=Object.fromEntries(cs.map(x=>[x.id,x])),list=apps.filter(a=>!a.deletedAt&&a.date===selectedDate).sort((a,b)=>a.time.localeCompare(b.time));selectedDateTitle.textContent=dayLabel(parseDate(selectedDate));selectedDateAppointments.innerHTML=list.length?list.map(a=>card(a,cm)).join(""):'<div class="empty">Nenhum atendimento neste dia.</div>'}
async function renderClients(){const q=clientSearch.value.trim().toLowerCase(),[cs,apps]=await Promise.all([all(STORES.clients),all(STORES.appointments)]),live=apps.filter(x=>!x.deletedAt),list=cs.filter(c=>!c.deletedAt&&(c.name.toLowerCase().includes(q)||(c.phone||"").includes(q))).sort((a,b)=>a.name.localeCompare(b.name));clientList.innerHTML=list.length?list.map(c=>{const ca=live.filter(a=>a.clientId===c.id);return `<button class="client-card" onclick="openClient(false,'${c.id}')"><div><div class="card-title">${esc(c.name)}</div><div class="card-meta">${ca.length} atendimento${ca.length===1?"":"s"}${c.phone?" · "+esc(c.phone):""}</div></div><div class="amount">${brl(ca.reduce((s,a)=>s+C.totalCents(a),0))}</div></button>`}).join(""):'<div class="empty">Nenhum cliente cadastrado.</div>'}
async function renderFinance(){const[apps0,cs]=await Promise.all([all(STORES.appointments),all(STORES.clients)]),apps=apps0.filter(x=>!x.deletedAt),cm=Object.fromEntries(cs.map(x=>[x.id,x])),ym=`${financeDate.getFullYear()}-${String(financeDate.getMonth()+1).padStart(2,"0")}`,f=C.financeForMonth(apps,ym);financeMonthTitle.textContent=monthLabel(financeDate);financeBilled.textContent=brl(f.billed);financeReceived.textContent=brl(f.received);financeReceivable.textContent=brl(f.receivable);const month=apps.filter(a=>a.date.slice(0,7)===ym),bp={};month.forEach(a=>bp[a.paymentMethod]=(bp[a.paymentMethod]||0)+C.totalCents(a));paymentBreakdown.innerHTML=Object.keys(bp).length?Object.entries(bp).map(([k,v])=>`<div class="card"><div class="section-head compact"><strong>${esc(k)}</strong><strong>${brl(v)}</strong></div></div>`).join(""):'<div class="empty">Sem lançamentos.</div>';financeList.innerHTML=month.length?[...month].sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time)).map(a=>`<button class="appointment-card" onclick="openAppointment('${a.id}')"><div><div class="card-title">${esc(cm[a.clientId]?.name||"Cliente")}</div><div class="card-meta">${parseDate(a.date).toLocaleDateString("pt-BR")} · ${esc(a.methodNameSnapshot||"Método")} · ${esc(a.paymentMethod)}</div><span class="status ${a.financialStatus}">${statusLabel(a.financialStatus)}</span></div><div class="amount">${brl(C.totalCents(a))}</div></button>`).join(""):'<div class="empty">Sem atendimentos neste mês.</div>'}

window.openAppointment=async function(id=""){await populateSelects();appointmentId.value=id;appointmentFormTitle.textContent=id?"Editar atendimento":"Novo atendimento";deleteAppointmentBtn.classList.toggle("hidden",!id);extrasContainer.innerHTML="";if(id){const a=await one(STORES.appointments,id);appointmentClient.value=a.clientId;appointmentMethod.value=a.methodId||"";appointmentDate.value=a.date;appointmentTime.value=a.time;appointmentBaseValue.value=(a.baseCents/100).toFixed(2).replace(".",",");appointmentPaymentMethod.value=a.paymentMethod||"Pix";appointmentFinancialStatus.value=a.financialStatus;appointmentExpectedDate.value=a.expectedReceiveDate||"";appointmentReceivedDate.value=a.receivedDate||"";appointmentSummary.value=a.summary||"";(a.extras||[]).forEach(addExtra)}else{appointmentForm.reset();appointmentId.value="";appointmentDate.value=selectedDate||dateKey(new Date());appointmentPaymentMethod.value="Pix";appointmentFinancialStatus.value="pendente";restoreDraft()}toggleFinancialDates();updateTotal();appointmentDialog.showModal()}
function addExtra(x={description:"",cents:0}){const r=document.createElement("div");r.className="extra-row";r.innerHTML=`<input class="xdesc" placeholder="Pergunta adicional" value="${esc(x.description||"")}"><input class="xval" inputmode="decimal" placeholder="R$" value="${x.cents?String((x.cents/100).toFixed(2)).replace(".",","):""}"><button type="button" class="small-x">×</button>`;r.querySelector("button").onclick=()=>{r.remove();updateTotal();saveDraft()};r.querySelector(".xval").oninput=updateTotal;extrasContainer.appendChild(r)}
function extras(){return [...document.querySelectorAll(".extra-row")].map(r=>({description:r.querySelector(".xdesc").value.trim(),cents:C.toCents(r.querySelector(".xval").value)})).filter(x=>x.description||x.cents)}
function updateTotal(){appointmentTotal.textContent=brl(C.toCents(appointmentBaseValue.value)+extras().reduce((s,x)=>s+x.cents,0))}
function toggleFinancialDates(){expectedWrap.classList.toggle("hidden",appointmentFinancialStatus.value!=="a_receber");receivedWrap.classList.toggle("hidden",appointmentFinancialStatus.value!=="recebido");if(appointmentFinancialStatus.value==="a_receber"&&!appointmentExpectedDate.value){const d=new Date();d.setDate(d.getDate()+30);appointmentExpectedDate.value=dateKey(d)}if(appointmentFinancialStatus.value==="recebido"&&!appointmentReceivedDate.value)appointmentReceivedDate.value=appointmentDate.value||dateKey(new Date())}
function saveDraft(){if(appointmentId.value)return;const d={clientId:appointmentClient.value,methodId:appointmentMethod.value,date:appointmentDate.value,time:appointmentTime.value,base:appointmentBaseValue.value,paymentMethod:appointmentPaymentMethod.value,status:appointmentFinancialStatus.value,expected:appointmentExpectedDate.value,received:appointmentReceivedDate.value,summary:appointmentSummary.value,extras:extras(),savedAt:Date.now()};localStorage.setItem("cartonath-appointment-draft",JSON.stringify(d))}
function restoreDraft(){try{const raw=localStorage.getItem("cartonath-appointment-draft");if(!raw)return;const d=JSON.parse(raw);if(Date.now()-d.savedAt>86400000){localStorage.removeItem("cartonath-appointment-draft");return}if(confirm("Há um atendimento não salvo. Continuar de onde parou?")){appointmentClient.value=d.clientId||"";appointmentMethod.value=d.methodId||"";appointmentDate.value=d.date||dateKey(new Date());appointmentTime.value=d.time||"";appointmentBaseValue.value=d.base||"";appointmentPaymentMethod.value=d.paymentMethod||"Pix";appointmentFinancialStatus.value=d.status||"pendente";appointmentExpectedDate.value=d.expected||"";appointmentReceivedDate.value=d.received||"";appointmentSummary.value=d.summary||"";(d.extras||[]).forEach(addExtra)}else localStorage.removeItem("cartonath-appointment-draft")}catch{localStorage.removeItem("cartonath-appointment-draft")}}
async function saveAppointment(e){e.preventDefault();const id=appointmentId.value||uid(),old=id?await one(STORES.appointments,id):null,method=await one(STORES.methods,appointmentMethod.value),apps=await all(STORES.appointments),methods=await all(STORES.methods);if(C.conflictCount(apps,appointmentDate.value,appointmentTime.value,id)&&!confirm("Já existe atendimento exatamente neste horário. Salvar mesmo assim?"))return;const obj={id,clientId:appointmentClient.value,methodId:appointmentMethod.value,methodNameSnapshot:(()=>{
  const currentName=method?.name||"Método";
  if(!old) return currentName;
  if(old.methodId!==appointmentMethod.value) return currentName;
  const staleFromAnotherMethod=old.methodNameSnapshot&&old.methodNameSnapshot!==currentName&&methods.some(m=>m.id!==appointmentMethod.value&&m.name===old.methodNameSnapshot);
  if(staleFromAnotherMethod) return currentName;
  return old.methodNameSnapshot||currentName;
})(),date:appointmentDate.value,time:appointmentTime.value,baseCents:C.toCents(appointmentBaseValue.value),extras:extras(),paymentMethod:appointmentPaymentMethod.value,financialStatus:appointmentFinancialStatus.value,expectedReceiveDate:appointmentFinancialStatus.value==="a_receber"?appointmentExpectedDate.value:"",receivedDate:appointmentFinancialStatus.value==="recebido"?appointmentReceivedDate.value:"",summary:appointmentSummary.value.trim(),deletedAt:null,createdAt:old?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),schemaVersion:2};const errs=C.validateAppointment(obj);if(errs.length){alert("Não foi possível salvar: "+errs.join(", "));return}await put(STORES.appointments,obj);localStorage.removeItem("cartonath-appointment-draft");appointmentDialog.close();await refresh();showToast("Atendimento salvo.")}
async function softDeleteAppointment(){const id=appointmentId.value,a=await one(STORES.appointments,id);if(!a||!confirm("Excluir este atendimento? Você poderá desfazer por alguns segundos."))return;a.deletedAt=new Date().toISOString();await put(STORES.appointments,a);lastDeleted={store:STORES.appointments,obj:a};appointmentDialog.close();await refresh();showToast("Atendimento excluído.",async()=>{const x={...a,deletedAt:null};await put(STORES.appointments,x);await refresh();showToast("Atendimento restaurado.")})}

window.openClient=async function(ret=false,id=""){clientId.value=id;clientFormTitle.textContent=id?"Ficha do cliente":"Novo cliente";deleteClientBtn.classList.toggle("hidden",!id);clientHistoryWrap.classList.toggle("hidden",!id);clientDialog.dataset.ret=ret?"1":"0";if(id){const c=await one(STORES.clients,id);clientName.value=c.name||"";clientPhone.value=c.phone||"";clientNotes.value=c.notes||"";await renderClientHistory(id)}else clientForm.reset();clientDialog.showModal()}
async function renderClientHistory(cid){const[apps,methods]=await Promise.all([all(STORES.appointments),all(STORES.methods)]),list=apps.filter(a=>!a.deletedAt&&a.clientId===cid).sort((a,b)=>(b.date+b.time).localeCompare(a.date+a.time));clientHistory.innerHTML=list.length?list.map(a=>`<button type="button" class="card" onclick="clientDialog.close();openAppointment('${a.id}')"><div class="section-head compact"><strong>${parseDate(a.date).toLocaleDateString("pt-BR")} · ${a.time}</strong><strong>${brl(C.totalCents(a))}</strong></div><div class="card-meta">${esc(a.methodNameSnapshot||"Método")} · ${statusLabel(a.financialStatus)}</div>${a.summary?`<div class="summary">${esc(a.summary)}</div>`:""}</button>`).join(""):'<div class="empty">Ainda não há atendimentos.</div>'}
async function saveClient(e){e.preventDefault();const id=clientId.value||uid(),old=id?await one(STORES.clients,id):null,obj={id,name:clientName.value.trim(),phone:clientPhone.value.trim(),notes:clientNotes.value.trim(),deletedAt:null,createdAt:old?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};await put(STORES.clients,obj);const ret=clientDialog.dataset.ret==="1";clientDialog.close();await refresh();if(ret){appointmentClient.value=id;appointmentDialog.showModal()}showToast("Cliente salvo.")}
async function softDeleteClient(){const id=clientId.value,apps=await all(STORES.appointments);if(apps.some(a=>!a.deletedAt&&a.clientId===id)){alert("Este cliente possui atendimentos. Exclua os atendimentos primeiro.");return}const c=await one(STORES.clients,id);if(!c||!confirm("Excluir este cliente?"))return;c.deletedAt=new Date().toISOString();await put(STORES.clients,c);clientDialog.close();await refresh();showToast("Cliente excluído.",async()=>{c.deletedAt=null;await put(STORES.clients,c);await refresh();showToast("Cliente restaurado.")})}


async function collectBackupData(){
  const [clients,methods,appointments]=await Promise.all([all(STORES.clients),all(STORES.methods),all(STORES.appointments)]);
  return {clients,methods,appointments};
}
function backupFilename(){
  const d=new Date(), stamp=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}_${String(d.getHours()).padStart(2,"0")}-${String(d.getMinutes()).padStart(2,"0")}`;
  return `CartoNath_backup_${stamp}.json`;
}
async function exportBackup(){
  try{
    backupStatus.textContent="Preparando backup...";
    const envelope=await C.createBackupEnvelope(await collectBackupData());
    const json=JSON.stringify(envelope,null,2),name=backupFilename();
    const blob=new Blob([json],{type:"application/json"});
    let completed=false;
    if(typeof File!=="undefined" && navigator.share && navigator.canShare){
      const file=new File([blob],name,{type:"application/json"});
      try{
        if(navigator.canShare({files:[file]})){
          await navigator.share({files:[file],title:"Backup CartoNath"});
          completed=true;
        }
      }catch(e){
        if(e && e.name==="AbortError"){
          backupStatus.textContent="Backup criado; compartilhamento cancelado.";
          return;
        }
        console.warn("Web Share indisponível, usando download",e);
      }
    }
    if(!completed){
      const url=URL.createObjectURL(blob),a=document.createElement("a");
      a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    }
    backupStatus.textContent=`Backup gerado: ${envelope.data.clients.length} clientes e ${envelope.data.appointments.length} atendimentos.`;
    showToast("Backup exportado.");
  }catch(e){console.error(e);backupStatus.textContent="Falha ao gerar backup.";alert("Não foi possível gerar o backup. Nenhum dado foi alterado.")}
}
async function replaceAllData(data){
  return new Promise((resolve,reject)=>{
    const tx=db.transaction([STORES.clients,STORES.methods,STORES.appointments],"readwrite");
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error||new Error("Falha na restauração"));
    tx.onabort=()=>reject(tx.error||new Error("Restauração cancelada"));
    const cs=tx.objectStore(STORES.clients),ms=tx.objectStore(STORES.methods),as=tx.objectStore(STORES.appointments);
    cs.clear();ms.clear();as.clear();
    for(const x of data.clients)cs.put(x);
    for(const x of data.methods)ms.put(x);
    for(const x of data.appointments)as.put(x);
  });
}
async function importBackup(){
  const file=backupFileInput.files&&backupFileInput.files[0];
  backupFileInput.value="";
  if(!file)return;
  try{
    backupStatus.textContent="Validando backup...";
    const text=await file.text();
    let parsed;
    try{parsed=JSON.parse(text)}catch{throw new Error("O arquivo não é um JSON válido.")}
    const validation=await C.validateBackupEnvelope(parsed);
    if(!validation.ok){
      backupStatus.textContent="Backup rejeitado.";
      alert("Esse backup não será restaurado:\\n\\n"+validation.errors.slice(0,8).join("\\n"));
      return;
    }
    const when=validation.exportedAt?new Date(validation.exportedAt).toLocaleString("pt-BR"):"data desconhecida";
    const msg=`Backup válido.\\n\\n${validation.counts.clients} clientes\\n${validation.counts.methods} métodos\\n${validation.counts.appointments} atendimentos\\nCriado em: ${when}\\n\\nRestaurar vai SUBSTITUIR os dados atuais deste aparelho. Continuar?`;
    if(!confirm(msg)){backupStatus.textContent="Restauração cancelada.";return}
    // Safety copy of current state before destructive restore.
    const current=await C.createBackupEnvelope(await collectBackupData());
    await put(STORES.meta,{key:"preRestoreBackup",value:current,createdAt:new Date().toISOString()});
    await replaceAllData(validation.data);
    localStorage.removeItem("cartonath-appointment-draft");
    const issues=await integrityCheck();
    if(issues.length)throw new Error("A restauração terminou com inconsistências.");
    await refresh();
    await renderBackupSafetyState();
    backupStatus.textContent=`Backup restaurado: ${validation.counts.clients} clientes e ${validation.counts.appointments} atendimentos.`;
    showToast("Backup restaurado com sucesso.");
  }catch(e){
    console.error(e);backupStatus.textContent="Falha ao restaurar backup.";
    alert("Não foi possível restaurar o backup. O app evitou continuar silenciosamente.\\n\\n"+(e.message||e));
  }
}


async function renderBackupSafetyState(){
  try{
    const snap=await one(STORES.meta,"preRestoreBackup");
    undoRestoreBtn.classList.toggle("hidden",!(snap&&snap.value));
  }catch{undoRestoreBtn.classList.add("hidden")}
}
async function undoLastRestore(){
  try{
    const snap=await one(STORES.meta,"preRestoreBackup");
    if(!snap||!snap.value){alert("Não há restauração anterior para desfazer.");await renderBackupSafetyState();return}
    const v=await C.validateBackupEnvelope(snap.value);
    if(!v.ok){alert("A cópia de segurança interna não passou na validação e não será usada.");return}
    if(!confirm(`Desfazer a última restauração e voltar para os dados anteriores?\\n\\n${v.counts.clients} clientes\\n${v.counts.appointments} atendimentos`))return;
    await replaceAllData(v.data);
    await removeOne(STORES.meta,"preRestoreBackup");
    localStorage.removeItem("cartonath-appointment-draft");
    const issues=await integrityCheck();
    if(issues.length)throw new Error("A reversão terminou com inconsistências.");
    await refresh();await renderBackupSafetyState();
    backupStatus.textContent="Última restauração desfeita.";
    showToast("Dados anteriores restaurados.");
  }catch(e){console.error(e);alert("Não foi possível desfazer a restauração. Nenhum passo adicional será executado.")}
}

async function renderMethods(){const ms=(await all(STORES.methods)).filter(x=>!x.archived).sort((a,b)=>a.name.localeCompare(b.name));methodsList.innerHTML=ms.map(m=>`<div class="card section-head compact"><div><div class="card-title">${esc(m.name)}</div><div class="card-meta">${brl(m.valueCents)}</div></div><div><button class="link" onclick="editMethod('${m.id}')">Editar</button><button class="link" onclick="archiveMethod('${m.id}')">Arquivar</button></div></div>`).join("")}
window.editMethod=async id=>{const m=await one(STORES.methods,id);methodId.value=id;methodName.value=m.name;methodValue.value=(m.valueCents/100).toFixed(2).replace(".",",");cancelMethodEditBtn.classList.remove("hidden")}
function resetMethod(){methodId.value="";methodName.value="";methodValue.value="";cancelMethodEditBtn.classList.add("hidden")}
async function saveMethod(e){e.preventDefault();const id=methodId.value||uid(),old=id?await one(STORES.methods,id):null;await put(STORES.methods,{id,name:methodName.value.trim(),valueCents:C.toCents(methodValue.value),archived:false,createdAt:old?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()});resetMethod();await renderMethods();await refresh();showToast("Método salvo.")}
window.archiveMethod=async id=>{if(!confirm("Arquivar este método? Atendimentos antigos continuam intactos."))return;const m=await one(STORES.methods,id);m.archived=true;await put(STORES.methods,m);await renderMethods();await refresh();showToast("Método arquivado.")}
