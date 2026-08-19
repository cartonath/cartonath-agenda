
const C=require("./core.v04.js");
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
if(fail)process.exit(1);
