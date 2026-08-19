
const C=require("./core.v05.js");
(async()=>{
 let clients=[],methods=[],appointments=[];
 for(let i=0;i<500;i++) clients.push({id:"c"+i,name:"Cliente "+i,phone:"",notes:"",deletedAt:null});
 for(let i=0;i<25;i++) methods.push({id:"m"+i,name:"Método "+i,valueCents:1000+(i*100),archived:i%9===0});
 for(let i=0;i<10000;i++){
   let month=1+(i%6),day=1+(i%28),d=`2026-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
   let status=i%3===0?"recebido":i%3===1?"a_receber":"pendente";
   let a={id:"a"+i,clientId:"c"+(i%500),methodId:"m"+(i%25),methodNameSnapshot:"Método "+(i%25),date:d,time:`${String(8+(i%12)).padStart(2,"0")}:${i%2?"30":"00"}`,baseCents:1000+(i%6)*500,extras:i%4===0?[{description:"extra",cents:1000}]:[],paymentMethod:i%2?"Pix":"Crédito",financialStatus:status,summary:"Resumo "+i,deletedAt:i%97===0?"2026-07-01T00:00:00Z":null,schemaVersion:2};
   if(status==="recebido")a.receivedDate=d;
   if(status==="a_receber")a.expectedReceiveDate=`2026-${String(Math.min(month+1,7)).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
   appointments.push(a);
 }
 const t0=Date.now();
 const b=await C.createBackupEnvelope({clients,methods,appointments},"2026-08-19T15:00:00.000Z");
 const size=Buffer.byteLength(JSON.stringify(b));
 const v=await C.validateBackupEnvelope(b);
 if(!v.ok) throw new Error(v.errors.slice(0,5).join(","));
 if(v.counts.clients!==500||v.counts.methods!==25||v.counts.appointments!==10000)throw new Error("contagens erradas");
 // clone restore-equivalent and compare representative finance
 for(let m=1;m<=6;m++){
   const ym=`2026-${String(m).padStart(2,"0")}`;
   const a=C.financeForMonth(appointments,ym),r=C.financeForMonth(v.data.appointments,ym);
   if(JSON.stringify(a)!==JSON.stringify(r))throw new Error("finance divergente "+ym);
 }
 console.log("PASS backup stress 10.000 atendimentos");
 console.log("bytes",size,"ms",Date.now()-t0);
})();
