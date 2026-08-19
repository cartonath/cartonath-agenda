
const C=require("./core.v05.js");
let pass=0, fail=0;
function t(name,fn){try{fn();console.log("PASS",name);pass++}catch(e){console.error("FAIL",name,e.message);fail++}}
function eq(a,b){if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(JSON.stringify(a)+" != "+JSON.stringify(b))}
t("centavos sem float",()=>eq(C.toCents("0,10")+C.toCents("0,20"),30));
t("migra v1 para v2",()=>{const m=C.migrateAppointment({id:"a",clientId:"c",methodId:"m",methodName:"3 Perguntas",date:"2026-08-01",time:"10:00",baseValue:20,extras:[{description:"extra",value:10}],paymentStatus:"pago"});eq(m.baseCents,2000);eq(m.extras[0].cents,1000);eq(m.financialStatus,"recebido");eq(m.receivedDate,"2026-08-01");eq(m.methodNameSnapshot,"3 Perguntas")});
t("snapshot preserva nome antigo",()=>{const a=C.migrateAppointment({id:"a",clientId:"c",methodId:"m",methodNameSnapshot:"Nome Antigo",date:"2026-08-01",time:"10:00",baseCents:2000,extras:[],financialStatus:"recebido"});eq(a.methodNameSnapshot,"Nome Antigo")});
t("financeiro separa faturado e recebido",()=>{const apps=[{id:"1",clientId:"c",methodId:"m",methodNameSnapshot:"x",date:"2026-08-20",time:"10:00",baseCents:6000,extras:[],financialStatus:"recebido",receivedDate:"2026-09-20"}];eq(C.financeForMonth(apps,"2026-08"),{billed:6000,received:0,receivable:0});eq(C.financeForMonth(apps,"2026-09"),{billed:0,received:6000,receivable:0})});
t("a receber entra no mês previsto",()=>{const apps=[{id:"1",clientId:"c",methodId:"m",methodNameSnapshot:"x",date:"2026-08-20",time:"10:00",baseCents:6000,extras:[],financialStatus:"a_receber",expectedReceiveDate:"2026-09-20"}];eq(C.financeForMonth(apps,"2026-09").receivable,6000)});
t("soft delete exclui do financeiro",()=>{const a={id:"1",clientId:"c",methodId:"m",methodNameSnapshot:"x",date:"2026-08-20",time:"10:00",baseCents:6000,extras:[],financialStatus:"recebido",receivedDate:"2026-08-20",deletedAt:"x"};eq(C.financeForMonth([a],"2026-08"),{billed:0,received:0,receivable:0})});
t("conflito de horário",()=>eq(C.conflictCount([{id:"1",date:"2026-08-20",time:"10:00"}],"2026-08-20","10:00"),1));
t("validação rejeita centavos negativos",()=>{const e=C.validateAppointment({id:"1",clientId:"c",methodId:"m",methodNameSnapshot:"x",date:"2026-08-20",time:"10:00",baseCents:-1,extras:[],financialStatus:"pendente"});if(!e.includes("baseCents"))throw new Error("não rejeitou")});

// stress 6 meses, 1500 atendimentos
const apps=[]; let seed=123456789;
function rnd(){seed=(1103515245*seed+12345)%2147483648;return seed/2147483648}
for(let i=0;i<1500;i++){
 const day=1+Math.floor(rnd()*180), d=new Date(2026,0,day), date=d.toISOString().slice(0,10);
 const status=rnd()<.55?"recebido":rnd()<.75?"a_receber":"pendente";
 const base=[1000,2000,2500,3000,3500,6000][Math.floor(rnd()*6)];
 const extras=rnd()<.35?[{description:"extra",cents:[1000,1500,2000][Math.floor(rnd()*3)]}]:[];
 const a={id:"a"+i,clientId:"c"+(i%120),methodId:"m"+(i%13),methodNameSnapshot:"Método "+(i%13),date,time:`${String(8+(i%12)).padStart(2,"0")}:00`,baseCents:base,extras,financialStatus:status,deletedAt:null};
 if(status==="recebido")a.receivedDate=date;
 if(status==="a_receber"){const r=new Date(d);r.setDate(r.getDate()+30);a.expectedReceiveDate=r.toISOString().slice(0,10)}
 const errs=C.validateAppointment(a);if(errs.length)throw new Error("stress inválido "+errs.join(","));
 apps.push(a);
}
t("stress 1500 registros sem NaN",()=>{for(let m=1;m<=6;m++){const ym=`2026-${String(m).padStart(2,"0")}`,f=C.financeForMonth(apps,ym);for(const v of Object.values(f))if(!Number.isInteger(v)||v<0)throw new Error("financeiro inválido")}});
console.log(`RESULT ${pass} passed, ${fail} failed`);


(async()=>{
  async function at(name,fn){try{await fn();console.log("PASS",name);pass++}catch(e){console.error("FAIL",name,e.message);fail++}}
  const sample={
    clients:[{id:"c1",name:"Bruno",phone:"",notes:"",deletedAt:null}],
    methods:[{id:"m1",name:"3 Perguntas Objetivas",valueCents:2000,archived:false}],
    appointments:[{id:"a1",clientId:"c1",methodId:"m1",methodNameSnapshot:"3 Perguntas Objetivas",date:"2026-08-19",time:"14:00",baseCents:2000,extras:[{description:"extra",cents:1000}],paymentMethod:"Pix",financialStatus:"recebido",receivedDate:"2026-08-19",expectedReceiveDate:"",summary:"teste",deletedAt:null,schemaVersion:2}]
  };
  let envelope;
  await at("backup cria checksum",async()=>{envelope=await C.createBackupEnvelope(sample,"2026-08-19T12:00:00.000Z");if(!/^[a-f0-9]{64}$/.test(envelope.checksum))throw new Error("checksum ausente")});
  await at("backup íntegro valida",async()=>{const v=await C.validateBackupEnvelope(envelope);if(!v.ok)throw new Error(v.errors.join(","));eq(v.counts,{clients:1,methods:1,appointments:1})});
  await at("backup adulterado é rejeitado",async()=>{const x=JSON.parse(JSON.stringify(envelope));x.data.appointments[0].baseCents=999999;const v=await C.validateBackupEnvelope(x);if(v.ok||!v.errors.some(e=>e.includes("Checksum")))throw new Error("adulteração não detectada")});
  await at("backup com cliente ausente é rejeitado",async()=>{const x=await C.createBackupEnvelope({...sample,clients:[]});const v=await C.validateBackupEnvelope(x);if(v.ok||!v.errors.some(e=>e.includes("cliente inexistente")))throw new Error("referência órfã não detectada")});
  await at("backup com id duplicado é rejeitado",async()=>{const x=await C.createBackupEnvelope({...sample,clients:[sample.clients[0],{...sample.clients[0]}]});const v=await C.validateBackupEnvelope(x);if(v.ok||!v.errors.some(e=>e.includes("id duplicado")))throw new Error("duplicata não detectada")});
  await at("backup preserva método customizado",async()=>{const custom={...sample,methods:[...sample.methods,{id:"m2",name:"Método Novo",valueCents:4700,archived:false}]};const x=await C.createBackupEnvelope(custom);const v=await C.validateBackupEnvelope(x);if(!v.ok)throw new Error(v.errors.join(","));if(!v.data.methods.some(m=>m.name==="Método Novo"&&m.valueCents===4700))throw new Error("método customizado perdido")});
  await at("backup preserva registros soft-deleted",async()=>{const data=JSON.parse(JSON.stringify(sample));data.appointments[0].deletedAt="2026-08-20T00:00:00Z";const x=await C.createBackupEnvelope(data);const v=await C.validateBackupEnvelope(x);if(!v.ok)throw new Error(v.errors.join(","));if(!v.data.appointments[0].deletedAt)throw new Error("soft delete perdido")});
  console.log(`FINAL RESULT ${pass} passed, ${fail} failed`);
  if(fail)process.exit(1);
})();
