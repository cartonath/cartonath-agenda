
(function(root){
  const VALID_STATUS = new Set(["pendente","a_receber","recebido"]);
  function toCents(v){
    const n = Number(String(v ?? 0).replace(",", "."));
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100);
  }
  function fromCents(c){ return (Number(c)||0)/100; }
  function totalCents(a){
    return Number(a.baseCents||0) + (a.extras||[]).reduce((s,x)=>s+Number(x.cents||0),0);
  }
  function migrateAppointment(a){
    const out = {...a};
    if (out.baseCents == null) out.baseCents = toCents(out.baseValue||0);
    delete out.baseValue;
    out.extras = (out.extras||[]).map(x => ({
      description: x.description || "",
      cents: x.cents == null ? toCents(x.value||0) : Number(x.cents||0)
    }));
    if (!out.methodNameSnapshot) out.methodNameSnapshot = out.methodName || "";
    if (!out.financialStatus) {
      if (out.paymentStatus === "pago") out.financialStatus = "recebido";
      else if (out.paymentStatus === "a_receber") out.financialStatus = "a_receber";
      else out.financialStatus = "pendente";
    }
    if (!out.receivedDate && out.financialStatus === "recebido") out.receivedDate = out.date || "";
    if (!out.expectedReceiveDate && out.financialStatus === "a_receber") out.expectedReceiveDate = out.receiveDate || "";
    delete out.paymentStatus; delete out.receiveDate; delete out.methodName;
    out.deletedAt = out.deletedAt || null;
    out.schemaVersion = 2;
    return out;
  }
  function validateAppointment(a){
    const errors=[];
    if(!a || !a.id) errors.push("id");
    if(!a.clientId) errors.push("clientId");
    if(!a.methodId && !a.methodNameSnapshot) errors.push("method");
    if(!/^\d{4}-\d{2}-\d{2}$/.test(a.date||"")) errors.push("date");
    if(!/^\d{2}:\d{2}$/.test(a.time||"")) errors.push("time");
    if(!Number.isInteger(a.baseCents) || a.baseCents < 0) errors.push("baseCents");
    if(!(a.extras||[]).every(x=>Number.isInteger(x.cents)&&x.cents>=0)) errors.push("extras");
    if(!VALID_STATUS.has(a.financialStatus)) errors.push("financialStatus");
    if(a.financialStatus==="a_receber" && a.expectedReceiveDate && !/^\d{4}-\d{2}-\d{2}$/.test(a.expectedReceiveDate)) errors.push("expectedReceiveDate");
    if(a.financialStatus==="recebido" && a.receivedDate && !/^\d{4}-\d{2}-\d{2}$/.test(a.receivedDate)) errors.push("receivedDate");
    return errors;
  }
  function monthKey(dateStr){ return (dateStr||"").slice(0,7); }
  function financeForMonth(apps, ym){
    const live=(apps||[]).filter(a=>!a.deletedAt);
    const billed = live.filter(a=>monthKey(a.date)===ym).reduce((s,a)=>s+totalCents(a),0);
    const received = live.filter(a=>a.financialStatus==="recebido" && monthKey(a.receivedDate||a.date)===ym).reduce((s,a)=>s+totalCents(a),0);
    const receivable = live.filter(a=>a.financialStatus==="a_receber" && monthKey(a.expectedReceiveDate)===ym).reduce((s,a)=>s+totalCents(a),0);
    return {billed,received,receivable};
  }
  function conflictCount(apps, date, time, excludeId=""){
    return (apps||[]).filter(a=>!a.deletedAt && a.id!==excludeId && a.date===date && a.time===time).length;
  }

  function normalizeMethod(m){
    const out={...m};
    if(out.valueCents==null) out.valueCents=toCents(out.value||0);
    delete out.value;
    out.archived=Boolean(out.archived);
    return out;
  }
  function normalizeClient(c){
    return {...c, deletedAt:c.deletedAt||null};
  }
  function backupPayload(data, exportedAt){
    return {
      app:"CartoNath Agenda",
      backupVersion:1,
      schemaVersion:2,
      exportedAt:exportedAt || new Date().toISOString(),
      data:{
        clients:(data.clients||[]).map(normalizeClient),
        methods:(data.methods||[]).map(normalizeMethod),
        appointments:(data.appointments||[]).map(migrateAppointment)
      }
    };
  }
  async function sha256Hex(text){
    const bytes=new TextEncoder().encode(text);
    const digest=await crypto.subtle.digest("SHA-256",bytes);
    return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");
  }
  async function createBackupEnvelope(data, exportedAt){
    const payload=backupPayload(data,exportedAt);
    const checksum=await sha256Hex(JSON.stringify(payload));
    return {...payload,checksum};
  }
  async function validateBackupEnvelope(input){
    const errors=[],warnings=[];
    if(!input || typeof input!=="object") return {ok:false,errors:["Arquivo inválido"],warnings,data:null};
    if(input.app!=="CartoNath Agenda") errors.push("Arquivo não pertence à CartoNath Agenda");
    if(input.backupVersion!==1) errors.push("Versão de backup não suportada");
    if(!input.data || !Array.isArray(input.data.clients) || !Array.isArray(input.data.methods) || !Array.isArray(input.data.appointments)) errors.push("Estrutura de dados incompleta");
    if(errors.length) return {ok:false,errors,warnings,data:null};
    const payload={app:input.app,backupVersion:input.backupVersion,schemaVersion:input.schemaVersion,exportedAt:input.exportedAt,data:input.data};
    if(input.checksum){
      const expected=await sha256Hex(JSON.stringify(payload));
      if(expected!==input.checksum) errors.push("Checksum inválido: arquivo foi alterado ou corrompido");
    }else warnings.push("Backup sem checksum");
    const clients=(input.data.clients||[]).map(normalizeClient);
    const methods=(input.data.methods||[]).map(normalizeMethod);
    const appointments=(input.data.appointments||[]).map(migrateAppointment);
    const unique=(arr,label)=>{
      const ids=new Set();
      for(const x of arr){
        if(!x || !x.id){errors.push(`${label}: registro sem id`);continue}
        if(ids.has(x.id)) errors.push(`${label}: id duplicado ${x.id}`);
        ids.add(x.id);
      }
      return ids;
    };
    const clientIds=unique(clients,"clientes");
    unique(methods,"métodos");
    unique(appointments,"atendimentos");
    for(const a of appointments){
      const e=validateAppointment(a);
      if(e.length) errors.push(`atendimento ${a.id||"?"}: ${e.join(",")}`);
      if(a.clientId && !clientIds.has(a.clientId)) errors.push(`atendimento ${a.id||"?"}: cliente inexistente`);
    }
    return {
      ok:errors.length===0,
      errors,warnings,
      data:{clients,methods,appointments},
      counts:{clients:clients.length,methods:methods.length,appointments:appointments.length},
      exportedAt:input.exportedAt||""
    };
  }

  const api={toCents,fromCents,totalCents,migrateAppointment,validateAppointment,financeForMonth,conflictCount,monthKey,normalizeMethod,normalizeClient,backupPayload,sha256Hex,createBackupEnvelope,validateBackupEnvelope};
  if(typeof module!=="undefined" && module.exports) module.exports=api;
  root.CartoCore=api;
})(typeof globalThis!=="undefined"?globalThis:this);
