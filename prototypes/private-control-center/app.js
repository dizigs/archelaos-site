"use strict";
(function(){
const $=id=>document.getElementById(id);
const qs=(s,root=document)=>Array.from(root.querySelectorAll(s));
const svgNS="http://www.w3.org/2000/svg";
const workers=[
{id:"github",name:"GitHub Bridge",short:"GITHUB",type:"CI / PR EVENTS",status:"success",x:178,y:96,icon:"⌘",detail:"Λήψη εικονικών GitHub events, PR status και CI provenance."},
{id:"drive",name:"Drive Intake",short:"DRIVE",type:"ARCHIVE INGEST",status:"running",x:402,y:68,icon:"◫",detail:"Υποδοχή τεκμηρίων και έλεγχος διπλών πριν από ερευνητική αξιολόγηση."},
{id:"analytics",name:"Analytics",short:"ANALYTICS",type:"AGGREGATED METRICS",status:"success",x:634,y:72,icon:"▥",detail:"Εικονικά συγκεντρωτικά δεδομένα με καταγραφή προέλευσης."},
{id:"news",name:"News Research",short:"NEWS",type:"HISTORICAL RESEARCH",status:"success",x:834,y:148,icon:"✶",detail:"Ερευνητική ροή ειδήσεων, φωτογραφιών και ιστορικών πηγών."},
{id:"selfheal",name:"Self-Heal Guard",short:"SELF-HEAL",type:"REVIEW / SAFETY",status:"blocked",x:842,y:356,icon:"◇",detail:"Fail-closed έλεγχος. Δεν επιτρέπεται πραγματικό recovery από το DEMO."},
{id:"apps",name:"Apps Script",short:"APPS SCRIPT",type:"AUTOMATIONS",status:"success",x:612,y:447,icon:"≋",detail:"Συγχρονισμοί εργασιών σε προσομοιωμένο περιβάλλον."},
{id:"cloudflare",name:"Cloudflare",short:"CLOUDFLARE",type:"PAGES / WORKERS",status:"standby",x:355,y:439,icon:"⬡",detail:"Εικονική κατάσταση Pages, Workers και service bindings."},
{id:"gmail",name:"Gmail Intake",short:"GMAIL",type:"MESSAGE INGEST",status:"success",x:155,y:340,icon:"✉",detail:"Εικονική λήψη email και ανάθεση για ιδιωτική επεξεργασία."}
];
const tasks=[
{id:"DEMO-248",name:"Έλεγχος consent gate",source:"GitHub CI",status:"success",time:"09:17",detail:"Εικονικό test suite για privacy defaults. Δεν περιγράφει πραγματικό workflow."},
{id:"DEMO-234",name:"Canonical Brain receipt",source:"Brain",status:"running",time:"09:14",detail:"Προσομοιωμένος signed receipt έλεγχος με fail-closed συμπεριφορά."},
{id:"DEMO-235",name:"Self-Heal acceptance",source:"Security",status:"blocked",time:"09:11",detail:"Αναμονή simulated authentication readback."},
{id:"DEMO-220",name:"Analytics ingest",source:"Worker",status:"success",time:"09:06",detail:"Προσομοιωμένη ενημέρωση αναλυτικών συγκεντρωτικών με privacy suppression."},
{id:"DEMO-227",name:"Apps Script approvals",source:"Apps Script",status:"running",time:"08:52",detail:"Εικονική επικύρωση έγκρισης και project locks."},
{id:"DEMO-233",name:"Cloudflare staging probe",source:"Cloudflare",status:"failed",time:"08:47",detail:"Εικονική αποτυχία staging. Δεν έγινε πραγματική απόπειρα σύνδεσης."},
{id:"DEMO-217",name:"Independent QA acceptance",source:"GitHub",status:"success",time:"08:32",detail:"Εικονική επιτυχία QA, όχι CI σε πραγματικό SHA."},
{id:"DEMO-125",name:"Historian review queue",source:"Archive",status:"blocked",time:"08:15",detail:"Εικονική εκκρεμότητα για τεκμηριωμένες ταυτοποιήσεις."}
];
const events=[
{id:"EV-008",time:"09:17",title:"Consent test: simulated pass",text:"Ένα εικονικό workflow ολοκλήρωσε έλεγχο ιδιωτικότητας.",status:"success"},
{id:"EV-007",time:"09:14",title:"Brain receipt pending",text:"Εικονικό signed readback σε εξέλιξη.",status:"running"},
{id:"EV-006",time:"09:11",title:"UNKNOWN quarantined",text:"Απομόνωση αμφίβολης εγγραφής χωρίς ενέργειες.",status:"blocked"},
{id:"EV-005",time:"09:06",title:"Analytics snapshot recorded",text:"Αποθηκεύτηκαν εικονικά, συνολικά δεδομένα.",status:"success"},
{id:"EV-004",time:"08:47",title:"Staging probe failed",text:"Αποτυχία προσομοιωμένου ελέγχου, χωρίς retry σε παραγωγή.",status:"failed"},
{id:"EV-003",time:"08:32",title:"CI integrity checked",text:"Εικονική επιβεβαίωση απαιτούμενων ελέγχων.",status:"success"},
{id:"EV-002",time:"08:15",title:"Historical evidence queued",text:"Νέο εικονικό αντικείμενο περιμένει επιμελητή.",status:"blocked"}
];

/* Fixed example records. All times below are synthetic; no production endpoints. */
const demoClockStart=Date.parse("2026-11-06T11:30:00+02:00");
const demoClockOpened=Date.now();
const deployments=[
 {id:"DEMO-DEP-410",name:"Αρχέλαος · Website",source:"Pages",status:"running",start:"2026-11-06T11:29:00+02:00",finish:null,sha:"demo-a01",description:"Εικονική ανάπτυξη του site. Η ώρα λήξης είναι μόνο εκτίμηση βάσει ιστορικών διάρκειών."},
 {id:"DEMO-DEP-409",name:"Brain · Coordinator",source:"Workers",status:"success",start:"2026-11-06T11:04:00+02:00",finish:"2026-11-06T11:06:20+02:00",sha:"demo-a02",description:"Εικονική επιβεβαιωμένη ολοκλήρωση Worker."},
 {id:"DEMO-DEP-408",name:"Αρχέλαος · Website",source:"Pages",status:"success",start:"2026-11-06T10:24:00+02:00",finish:"2026-11-06T10:28:00+02:00",sha:"demo-a03",description:"Εικονική επιτυχία ανάπτυξης Pages."},
 {id:"DEMO-DEP-407",name:"CI · Quality gate",source:"GitHub Actions",status:"failed",start:"2026-11-06T10:02:00+02:00",finish:"2026-11-06T10:04:00+02:00",sha:"demo-a04",description:"Εικονική αποτυχία CI. Δεν αποτελεί επιβεβαίωση πραγματικού deployment."},
 {id:"DEMO-DEP-406",name:"Αρχέλαος · Website",source:"Pages",status:"success",start:"2026-11-05T18:22:00+02:00",finish:"2026-11-05T18:27:00+02:00",sha:"demo-a05",description:"Εικονική καταχώριση ιστορικού Pages."},
 {id:"DEMO-DEP-405",name:"Brain · Coordinator",source:"Workers",status:"success",start:"2026-11-05T14:02:00+02:00",finish:"2026-11-05T14:04:00+02:00",sha:"demo-a06",description:"Εικονική καταχώριση Worker."},
 {id:"DEMO-DEP-404",name:"Αρχέλαος · Website",source:"Pages",status:"success",start:"2026-11-04T10:17:00+02:00",finish:"2026-11-04T10:22:00+02:00",sha:"demo-a07",description:"Εικονική καταχώριση Pages."},
 {id:"DEMO-DEP-403",name:"CI · Quality gate",source:"GitHub Actions",status:"success",start:"2026-11-04T09:55:00+02:00",finish:"2026-11-04T09:58:00+02:00",sha:"demo-a08",description:"Εικονική επιτυχία CI, όχι απόδειξη παραγωγικού deployment."},
 {id:"DEMO-DEP-402",name:"Αρχέλαος · Website",source:"Pages",status:"success",start:"2026-11-03T10:17:00+02:00",finish:"2026-11-03T10:23:00+02:00",sha:"demo-a09",description:"Εικονική καταχώριση Pages."},
 {id:"DEMO-DEP-401",name:"Brain · Coordinator",source:"Workers",status:"success",start:"2026-11-03T10:08:00+02:00",finish:"2026-11-03T10:11:00+02:00",sha:"demo-a10",description:"Εικονική καταχώριση Worker."}
];
const labels={success:"Επιτυχία",running:"Σε εκτέλεση",blocked:"Αναμονή",failed:"Αποτυχία",standby:"Standby"};
const scenarios=[
{name:"Ομαλή ροή",health:98.6,online:7,queue:12,brain:"STANDBY",locks:2,running:3,unknown:1,alerts:2,spend:6.45},
{name:"Αυξημένος φόρτος",health:96.2,online:8,queue:28,brain:"ACTIVE",locks:2,running:7,unknown:1,alerts:3,spend:12.70},
{name:"Προστατευμένη αποτυχία",health:89.4,online:6,queue:19,brain:"FAIL-CLOSED",locks:1,running:1,unknown:5,alerts:5,spend:18.25}
];
/* Synthetic per-worker states stay consistent with each scenario's summary. */
const demoWorkerStates=[
 ["success","running","success","success","blocked","success","standby","success"],
 ["success","running","success","running","blocked","success","success","success"],
 ["standby","running","success","success","blocked","success","standby","success"]
];
let activeView="overview",currentScenario=0,drawerTrigger=null,toastTimer=0,paused=false;
function setText(id,text){const node=$(id);if(node)node.textContent=String(text)}
function setDemoTag(id,state,text){const node=$(id);if(node){node.className="tag tag-"+state;node.textContent=text}}
function elementSvg(name,attrs={},text){const e=document.createElementNS(svgNS,name);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,String(v)));if(text!==undefined)e.textContent=text;return e}
function renderDiagram(){
 const lines=$("networkLines"),packets=$("networkPackets"),nodes=$("networkNodes");lines.replaceChildren();packets.replaceChildren();nodes.replaceChildren();
 workers.forEach((worker,i)=>{
   const path="M 500 245 L "+worker.x+" "+worker.y;
   lines.append(elementSvg("path",{d:path,class:"network-path"}));
   for(const shadow of [true,false]){
     const circle=elementSvg("circle",{r:shadow?8:3.7,class:shadow?"packet packet-shadow":"packet packet-core"});
     const motion=elementSvg("animateMotion",{dur:(2.9+i*.27)+"s",begin:(i*.26+(shadow?.02:0))+"s",repeatCount:"indefinite",path:path,keyPoints:"0;1",keyTimes:"0;1",calcMode:"linear"});
     circle.append(motion);packets.append(circle);
   }
   const g=elementSvg("g",{class:"node state-"+worker.status,role:"button",tabindex:"0","aria-label":worker.name+", "+(labels[worker.status]||worker.status)+". Άνοιγμα λεπτομερειών",transform:"translate("+worker.x+" "+worker.y+")"});
   g.append(elementSvg("circle",{r:"36",class:"node-circle"}));
   g.append(elementSvg("text",{"text-anchor":"middle",y:"8",class:"node-symbol"},worker.icon));
   const title=elementSvg("text",{y:"57","text-anchor":"middle",class:"node-title"},worker.short);g.append(title);
   const sub=elementSvg("text",{y:"72","text-anchor":"middle",class:"node-sub"},labels[worker.status]||worker.status);g.append(sub);
   const click=()=>openWorker(worker,g);g.addEventListener("click",click);g.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();click()}});nodes.append(g);
 });
 /* Motion is synchronized at startup and on preference changes. */
}
function renderWorkerCards(){
 const grid=$("workerGrid");grid.replaceChildren();
 workers.forEach(w=>{
  const btn=document.createElement("button");btn.type="button";btn.className="worker-card";
  const icon=document.createElement("span");icon.className="worker-icon";icon.textContent=w.icon;
  const title=document.createElement("strong");title.textContent=w.name;const sub=document.createElement("small");sub.textContent=w.type+" · DEMO";
  const tag=document.createElement("span");tag.className="tag "+(w.status==="success"?"tag-green":w.status==="failed"?"tag-red":"tag-amber");tag.textContent=labels[w.status]||w.status;
  btn.append(icon,title,sub,tag);btn.addEventListener("click",()=>openWorker(w,btn));grid.append(btn);
 });
}
function statusBadge(status){const s=document.createElement("span");s.className="status-chip status-"+status;s.textContent=labels[status]||status;return s}

function demoNow(){return demoClockStart+(Date.now()-demoClockOpened)}
function dateEl(iso){return iso?new Intl.DateTimeFormat("el-GR",{timeZone:"Europe/Athens",day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date(iso)):"—"}
function durationEl(ms){if(!Number.isFinite(ms)||ms<0)return "—";const seconds=Math.floor(ms/1000);const mins=Math.floor(seconds/60);return mins>=60?Math.floor(mins/60)+"ω "+(mins%60)+"λ":mins+"λ "+(seconds%60)+"δ"}
function durationMean(items){const durations=items.filter(d=>d.status==="success"&&d.finish).map(d=>Date.parse(d.finish)-Date.parse(d.start)).filter(ms=>ms>0);return durations.length?durations.reduce((sum,ms)=>sum+ms,0)/durations.length:null}
function deploymentEta(d){const avg=durationMean(deployments.filter(other=>other.source===d.source));return avg===null?null:Date.parse(d.start)+avg}
function deploySourceLabel(value){return value==="Pages"?"Cloudflare Pages":value==="Workers"?"Cloudflare Workers":value}
function getDeploymentSelection(){
 const q=$("deploySearch").value.trim().toLocaleLowerCase("el"),status=$("deployFilter").value,source=$("deploySource").value;
 return deployments.filter(d=>(status==="all"||d.status===status)&&(source==="all"||d.source===source)&&[d.id,d.name,d.source,d.sha,d.description].some(v=>v.toLocaleLowerCase("el").includes(q)));
}
function showDeployment(d,trigger){
 const end=d.finish?dateEl(d.finish):"Δεν έχει ολοκληρωθεί";
 const eta=d.status==="running"&&deploymentEta(d)!==null?dateEl(new Date(deploymentEta(d)).toISOString())+" (εκτίμηση)":"—";
 const elapsed=Date.parse(d.finish||new Date(demoNow()).toISOString())-Date.parse(d.start);
 openDetail(d.name,d.id,[["Πηγή",deploySourceLabel(d.source)],["Κατάσταση",labels[d.status]],["Περιβάλλον","SIMULATED / DEMO"],["SHA",d.sha],["Έναρξη",dateEl(d.start)],["Ολοκλήρωση",end],["Ενδεικτικό ETA",eta],["Διάρκεια",durationEl(elapsed)]],d.description,trigger);
}
function renderDeployments(){
 const selected=getDeploymentSelection(),body=$("deployBody");body.replaceChildren();
 selected.forEach(d=>{
   const tr=document.createElement("tr"),primary=document.createElement("td"),name=document.createElement("strong"),ref=document.createElement("small");
   name.textContent=d.name;ref.textContent=d.id+" · "+d.sha;primary.append(name,ref);
   const source=document.createElement("td");source.textContent=deploySourceLabel(d.source);
   const start=document.createElement("td");start.textContent=dateEl(d.start);
   const end=document.createElement("td");
   if(d.finish)end.textContent=dateEl(d.finish);
   else {const eta=deploymentEta(d);end.textContent=eta===null?"Άγνωστο · σε εξέλιξη":"~ "+dateEl(new Date(eta).toISOString())+" · εκτίμηση";}
   const duration=document.createElement("td");duration.textContent=durationEl((d.finish?Date.parse(d.finish):demoNow())-Date.parse(d.start));
   const state=document.createElement("td");state.append(statusBadge(d.status));
   const action=document.createElement("td"),button=document.createElement("button");button.type="button";button.className="table-action";button.textContent="Λεπτομέρειες";button.setAttribute("aria-label","Λεπτομέρειες "+d.id);
   button.addEventListener("click",()=>showDeployment(d,button));action.append(button);tr.append(primary,source,start,end,duration,state,action);body.append(tr);
 });
 $("deployEmpty").hidden=selected.length>0;
 const from=demoClockStart-7*86400000;
 const week=deployments.filter(d=>Date.parse(d.start)>=from&&Date.parse(d.start)<=demoClockStart);
 const running=deployments.filter(d=>d.status==="running");
 const finished=deployments.filter(d=>d.status!=="running"&&d.finish);
 const successful=finished.filter(d=>d.status==="success");
 const mean=durationMean(deployments);
 setText("deployWeek",week.length);
 setText("deployActive",running.length);
 setText("deployAvg",mean===null?"—":durationEl(mean));
 setText("deployRate",finished.length?Math.round(successful.length/finished.length*100)+"%":"—");
 setText("deployPeekRunning",running.length);
 setText("deployPeekWeek",week.length);
 setText("deployPeekAverage",mean===null?"—":durationEl(mean));
 const last=finished.slice().sort((a,b)=>Date.parse(b.finish)-Date.parse(a.finish))[0];
 setText("deployPeekFinish",last?dateEl(last.finish):"—");
 setText("mobileDeployStatus",running.length+" ενεργό");
 const allForCadence=deployments.filter(d=>d.status==="success"&&d.source===($("deploySource").value==="all"?"Pages":$("deploySource").value)).slice().sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));
 const gaps=allForCadence.slice(1).map((d,i)=>Date.parse(d.start)-Date.parse(allForCadence[i].start)).filter(v=>v>0);
 const chosen=$("deploySource").value==="all"?"Cloudflare Pages (ενδεικτικά)":deploySourceLabel($("deploySource").value);
 const avgGap=gaps.length?gaps.reduce((a,b)=>a+b,0)/gaps.length:null;
 setText("deployCadence",chosen+": "+(avgGap===null?"δεν επαρκούν δείγματα για μέσο διάστημα":"μέσο διάστημα μεταξύ επιτυχημένων ξεκινημάτων ~"+durationEl(avgGap))+". Δεν υποκαθιστά επίσημο πρόγραμμα.");
 const chart=$("deployChart");chart.replaceChildren();
 const daysFmt=new Intl.DateTimeFormat("el-GR",{timeZone:"Europe/Athens",weekday:"short",day:"numeric",month:"numeric"});
 const seven=Array.from({length:7},(_,i)=>{const day=demoClockStart-(6-i)*86400000;return {day,start:Date.parse(new Date(day).toISOString().slice(0,10)+"T00:00:00+02:00")};});
 const sourceFilter=$("deploySource").value;
 const dayCounts=seven.map(d=>deployments.filter(item=>{const t=Date.parse(item.start);return t>=d.start&&t<d.start+86400000&&(sourceFilter==="all"||item.source===sourceFilter)}).length);
 const max=Math.max(1,...dayCounts);
 seven.forEach((d,i)=>{const bar=document.createElement("div");bar.className="deploy-day";const count=document.createElement("strong");count.textContent=String(dayCounts[i]);const track=document.createElement("div");track.className="deploy-day-track";const fill=document.createElement("span");fill.style.height=(Math.max(4,dayCounts[i]/max*100))+"%";if(dayCounts[i]===0)fill.className="is-empty";track.append(fill);const lbl=document.createElement("small");lbl.textContent=daysFmt.format(new Date(d.start));bar.append(count,track,lbl);chart.append(bar)});
}

function renderTasks(){
 const query=$("operationsSearch").value.trim().toLocaleLowerCase("el"),filter=$("operationsFilter").value,body=$("operationsBody");body.replaceChildren();
 const visible=tasks.filter(t=>(filter==="all"||t.status===filter)&&[t.id,t.name,t.source,t.detail].some(v=>v.toLocaleLowerCase("el").includes(query)));
 visible.forEach(t=>{
  const tr=document.createElement("tr"),name=document.createElement("td"),strong=document.createElement("strong"),id=document.createElement("small");strong.textContent=t.name;id.textContent=t.id;name.append(strong,id);
  const source=document.createElement("td");source.textContent=t.source;const status=document.createElement("td");status.append(statusBadge(t.status));const time=document.createElement("td");time.textContent=t.time;const action=document.createElement("td"),btn=document.createElement("button");btn.className="table-action";btn.type="button";btn.textContent="Άνοιγμα";btn.setAttribute("aria-label","Λεπτομέρειες "+t.id);btn.addEventListener("click",()=>openDetail(t.name,t.id,[["Πηγή",t.source],["Κατάσταση",labels[t.status]],["Ώρα DEMO",t.time]],t.detail,btn));action.append(btn);tr.append(name,source,status,time,action);body.append(tr);
 });$("operationsEmpty").hidden=visible.length>0;
}
function renderEvents(){
 const query=$("eventsSearch").value.trim().toLocaleLowerCase("el"),filter=$("eventsFilter").value,box=$("eventsList");box.replaceChildren();
 const visible=events.filter(e=>(filter==="all"||e.status===filter)&&[e.title,e.text,e.id].some(v=>v.toLocaleLowerCase("el").includes(query)));
 visible.forEach(e=>{
  const row=document.createElement("article");row.className="timeline-entry";const track=document.createElement("div");track.className="timeline-track";const dot=document.createElement("span");dot.className="timeline-circle";track.append(dot);
  const content=document.createElement("div");content.className="timeline-content";const top=document.createElement("div");top.className="timeline-top";const title=document.createElement("b");title.textContent=e.title;const time=document.createElement("small");time.textContent=e.time;top.append(title,time);const p=document.createElement("p");p.textContent=e.text;const btn=document.createElement("button");btn.type="button";btn.className="text-button";btn.textContent="Λεπτομέρειες ↗";btn.addEventListener("click",()=>openDetail(e.title,e.id,[["Κατάσταση",labels[e.status]],["Χρόνος",e.time]],e.text,btn));content.append(top,p,btn);row.append(track,content);box.append(row);
 });$("eventsEmpty").hidden=visible.length>0;
}
function openDetail(title,subtitle,rows,description,trigger){
 drawerTrigger=trigger||document.activeElement;setText("detailsTitle",title);setText("detailsSubtitle",subtitle+" · DEMO");
 const body=$("detailsBody");body.replaceChildren();rows.forEach(([key,value])=>{const row=document.createElement("div");row.className="detail-row";const k=document.createElement("span");k.textContent=key;const v=document.createElement("b");v.textContent=value;row.append(k,v);body.append(row)});
 const p=document.createElement("div");p.className="detail-callout";p.textContent=description;body.append(p);
 $("detailsDrawer").hidden=false;$("drawerBackdrop").hidden=false;document.querySelector(".layout").inert=true;syncScrollLock();$("closeDetails").focus();
}
function openWorker(w,trigger){openDetail(w.name,w.type,[["Κατάσταση",labels[w.status]],["Worker ID",w.id],["Πηγή","Synthetic demo fixture"],["Δίκτυο","Brain ↔ "+w.short]],w.detail,trigger)}
function openGeneric(type,trigger){
 if(type==="brain")openDetail("Canonical Brain","CENTRAL COORDINATOR",[["Mode",scenarios[currentScenario].brain],["Locks",String(scenarios[currentScenario].locks)],["Queue",String(scenarios[currentScenario].queue)],["Builders","Max 2"]],"Μοναδικός κεντρικός συντονιστής (επίδειξη). Signed receipts, immutable readback, isolation και quarantine UNKNOWN σε μελλοντική, ασφαλή διασύνδεση.",trigger);
 else openDetail("Cloudflare Pages & Workers","EDGE SERVICES",[["Pages","Ready · DEMO"],["Workers","8 synthetic nodes"],["Service bindings","Simulation only"],["Production API","Disconnected"]],"Αποκλειστικά εικονικές μετρήσεις. Οτιδήποτε σχετικό με πραγματικό deployment χρειάζεται επαλήθευση SHA, logs και readback.",trigger)
}
function closeDrawer(){if($("detailsDrawer").hidden)return;$("detailsDrawer").hidden=true;$("drawerBackdrop").hidden=true;document.querySelector(".layout").inert=false;syncMenuA11y();if(drawerTrigger&&document.contains(drawerTrigger)&&!drawerTrigger.closest("[hidden]"))drawerTrigger.focus();else $("main").focus()}
function setView(view,focusMain=false){
 if(!["overview","network","deployments","operations","security","cost","events"].includes(view))view="overview";
 activeView=view;qs("[data-panel]").forEach(panel=>{panel.hidden=panel.dataset.panel!==view});
 qs(".nav-link").forEach(a=>{let on=a.dataset.view===view;a.classList.toggle("is-active",on);if(on)a.setAttribute("aria-current","page");else a.removeAttribute("aria-current")});
 const names={overview:"Επισκόπηση",network:"Δίκτυο Workers",deployments:"Deployments",operations:"Εργασίες & CI",security:"Ασφάλεια",cost:"Κόστος AI",events:"Χρονολόγιο"};setText("pageCrumb",names[view]);window.location.hash=view;window.scrollTo({top:0,behavior:"auto"});closeMenu();syncTopologyMotion();if(focusMain)$("main").focus();
}
function syncScrollLock(){document.body.classList.toggle("no-scroll",!$("detailsDrawer").hidden||$("sidebar").classList.contains("open"))}
function syncMenuA11y(){
 const sidebar=$("sidebar"),mobile=window.matchMedia("(max-width: 760px)").matches,open=mobile&&sidebar.classList.contains("open");
 sidebar.inert=mobile&&!open;
 if(open){sidebar.setAttribute("role","dialog");sidebar.setAttribute("aria-modal","true")}
 else{sidebar.removeAttribute("role");sidebar.removeAttribute("aria-modal")}
 $("menuToggle").setAttribute("aria-expanded",String(open));
 $("menuToggle").setAttribute("aria-label",open?"Κλείσιμο μενού":"Άνοιγμα μενού");
 $("mobileBackdrop").hidden=!open;
 document.querySelector(".content-shell").inert=open;
 syncScrollLock();
}
function openMenu(){if(!window.matchMedia("(max-width: 760px)").matches)return;$("sidebar").classList.add("open");syncMenuA11y();const first=$("sidebar").querySelector(".nav-link");if(first)first.focus()}
function closeMenu(restoreFocus=false){const wasOpen=$("sidebar").classList.contains("open");$("sidebar").classList.remove("open");syncMenuA11y();if(restoreFocus&&wasOpen)$("menuToggle").focus()}
function updateCost(amount){const spent=Number(amount);setText("costAvailable",Math.max(0,20-spent).toFixed(2).replace(".",",")+" €");setText("costUsed",spent.toFixed(2).replace(".",",")+" €");setText("costSliderLabel",spent.toFixed(2).replace(".",",")+" €");$("costBar").style.width=Math.min(100,spent/20*100)+"%";const warning=$("costWarning");warning.className="warning-inline"+(spent>20?" danger":spent>=16?" warn":"");warning.textContent=spent>20?"● Υπέρβαση ορίου — DEMO":spent>=16?"● Προειδοποίηση: ≥80% ορίου — DEMO":"● Εντός προϋπολογισμού — DEMO"}

/* DEMO only: mobile live-style summary, fully local and not connected to telemetry. */
let mobileEventIndex=0,mobileFeedPaused=false;
function updateMobileSummary(){
 const s=scenarios[currentScenario];
 setText("mobileBrainStatus",s.brain);
 setText("mobileWorkersStatus",s.online+" / 8");
 setText("mobileQueueStatus",s.queue);
 setText("mobileAlertsStatus",s.alerts);
 setText("mobileDeployStatus",deployments.filter(d=>d.status==="running").length+" ενεργό");
}
function nextMobileEvent(announce=false){
 mobileEventIndex=(mobileEventIndex+1)%events.length;
 setText("mobileEventText",events[mobileEventIndex].text);
 setText("mobileEventCounter","Δείγμα "+(mobileEventIndex+1)+" / "+events.length);
 if(announce)setText("mobileEventAnnouncement","DEMO — "+events[mobileEventIndex].text);
}
function syncTopologyMotion(){
 const reduceMotion=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
 const compact=window.matchMedia("(max-width: 1000px)").matches;
 const tabHidden=document.visibilityState==="hidden";
 if(paused||reduceMotion||compact||tabHidden||activeView!=="overview")$("topology").pauseAnimations();
 else $("topology").unpauseAnimations();
 const button=$("pauseButton");button.disabled=reduceMotion||compact;
 button.setAttribute("aria-pressed",String(paused));
 setText("pauseButton",reduceMotion?"● Χωρίς κίνηση":paused?"▶ Συνέχεια":"Ⅱ Παύση");
}
function syncFeedControls(){
 const reduceMotion=window.matchMedia("(prefers-reduced-motion: reduce)").matches,button=$("mobilePauseEvent");
 button.disabled=reduceMotion;
 button.setAttribute("aria-pressed",String(mobileFeedPaused));
 setText("mobilePauseEvent",reduceMotion?"Χωρίς αυτόματη κίνηση":mobileFeedPaused?"▶ Συνέχεια":"Ⅱ Παύση");
}
function initMobileFeed(){
 $("mobileNextEvent").addEventListener("click",()=>nextMobileEvent(true));
 $("mobilePauseEvent").addEventListener("click",()=>{mobileFeedPaused=!mobileFeedPaused;syncFeedControls();showToast(mobileFeedPaused?"Η αυτόματη ροή σταμάτησε — DEMO":"Η αυτόματη ροή συνεχίστηκε — DEMO")});
 updateMobileSummary();
 const viewport=window.matchMedia("(max-width: 1000px)");
 const menuViewport=window.matchMedia("(max-width: 760px)");
 const reduceMotion=window.matchMedia("(prefers-reduced-motion: reduce)");
 if(typeof viewport.addEventListener==="function")viewport.addEventListener("change",syncTopologyMotion);
 if(typeof menuViewport.addEventListener==="function")menuViewport.addEventListener("change",()=>{if(!menuViewport.matches)$("sidebar").classList.remove("open");syncMenuA11y()});
 if(typeof reduceMotion.addEventListener==="function")reduceMotion.addEventListener("change",()=>{syncTopologyMotion();syncFeedControls()});
 document.addEventListener("visibilitychange",syncTopologyMotion);
 syncTopologyMotion();syncFeedControls();syncMenuA11y();
 window.setInterval(()=>{if(activeView==="overview"&&viewport.matches&&!mobileFeedPaused&&!reduceMotion.matches&&document.visibilityState!=="hidden")nextMobileEvent()},9000);
}

function setScenario(i,announce=true){
 currentScenario=(i+scenarios.length)%scenarios.length;const s=scenarios[currentScenario];setText("scenarioLabel",s.name);setText("metricHealth",s.health.toFixed(1));setText("metricWorkers",s.online);setText("metricQueue",s.queue);setText("metricSpend",s.spend.toFixed(2));$("metricSpendBar").style.width=Math.min(s.spend/20*100,100)+"%";setText("heroBrain",s.brain+" · DEMO");setText("brainCardStatus",s.brain);setText("locksCount",s.locks);setText("runningCount",s.running);setText("unknownCount",s.unknown);setText("securityAlerts",s.alerts);setDemoTag("healthTag",s.health<90?"red":s.health<98?"amber":"green",s.health<90?"● DEMO · προσοχή":s.health<98?"● DEMO · μειωμένη":"● DEMO · κανονική");
 setDemoTag("workerMetricTag",s.online<=6?"red":s.online<8?"amber":"green",s.online===8?"● DEMO · 8/8":"● DEMO · "+(8-s.online)+" standby");
 setDemoTag("budgetTag",s.spend>=20?"red":s.spend>=16?"amber":"green",s.spend>=16?"● DEMO · προειδοποίηση":"● DEMO · εντός ορίου");$("costSlider").value=String(s.spend);updateCost(s.spend);
 /* Keep every worker inspector and the topology synchronized with the selected fixture. */
 const states=demoWorkerStates[currentScenario];
 workers.forEach((w,index)=>{w.status=states[index]});
 renderDiagram();renderWorkerCards();syncTopologyMotion();
 updateMobileSummary();
 if(announce)showToast("Σενάριο: "+s.name+" — μόνο DEMO");
}
function showToast(t){const toast=$("toast");toast.textContent=t;toast.hidden=false;window.clearTimeout(toastTimer);toastTimer=window.setTimeout(()=>toast.hidden=true,3300)}
const searchItems=[
{label:"Επισκόπηση",type:"Ενότητα",view:"overview"},{label:"Χάρτης Workers",type:"Ενότητα",view:"network"},{label:"Deployments και αναπτύξεις",type:"Ενότητα",view:"deployments"},{label:"GitHub και αυτοματισμοί",type:"Ενότητα",view:"operations"},{label:"Ασφάλεια Self-Heal",type:"Ενότητα",view:"security"},{label:"Κόστος AI",type:"Ενότητα",view:"cost"},{label:"Χρονολόγιο",type:"Ενότητα",view:"events"},
...workers.map(w=>({label:w.name,type:"Worker",worker:w})),
...tasks.map(t=>({label:t.name+" ("+t.id+")",type:"Εργασία",task:t})),
...deployments.map(d=>({label:d.name+" ("+d.id+")",type:"Deployment",deployment:d}))
];
function searchRender(){
 const q=$("globalSearch").value.trim().toLocaleLowerCase("el"),list=$("globalSearchResults");list.replaceChildren();const entries=searchItems.filter(item=>(item.label+" "+item.type).toLocaleLowerCase("el").includes(q)).slice(0,11);
 entries.forEach(item=>{const b=document.createElement("button");b.type="button";b.className="search-option";b.textContent=item.label;const small=document.createElement("small");small.textContent=item.type+" · DEMO";b.append(small);b.addEventListener("click",()=>{closeSearch();if(item.view)setView(item.view,true);else if(item.worker)openWorker(item.worker,$("searchShortcut"));else if(item.deployment)showDeployment(item.deployment,$("searchShortcut"));else if(item.task){const t=item.task;openDetail(t.name,t.id,[["Πηγή",t.source],["Κατάσταση",labels[t.status]]],t.detail,$("searchShortcut"))}});list.append(b)});
 if(!entries.length){const p=document.createElement("p");p.className="soft-text";p.textContent="Δεν βρέθηκαν αποτελέσματα.";list.append(p)}
}
function closeSearch(){if($("searchDialog").open)$("searchDialog").close()}
function downloadDemo(){
 const payload={_note:"STATIC DEMO ONLY — NO LIVE DATA",generated:"2026-11-06",scenario:scenarios[currentScenario],workers:workers.map(w=>({id:w.id,status:w.status})),tasks,events,deployments};
 const url=URL.createObjectURL(new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}));const a=document.createElement("a");a.href=url;a.download="archelaos-control-center-DEMO.json";document.body.append(a);a.click();a.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);showToast("Δημιουργήθηκε τοπικά αρχείο DEMO JSON")
}
function init(){
 renderDiagram();renderWorkerCards();renderTasks();renderEvents();renderDeployments();setScenario(0,false);initMobileFeed();
 qs(".nav-link").forEach(a=>a.addEventListener("click",e=>{e.preventDefault();setView(a.dataset.view,true)}));
 qs("[data-view-button]").forEach(b=>b.addEventListener("click",()=>setView(b.dataset.viewButton,true)));
 qs("[data-detail]").forEach(b=>b.addEventListener("click",()=>openGeneric(b.dataset.detail,b)));
 $("menuToggle").addEventListener("click",()=>$("sidebar").classList.contains("open")?closeMenu(true):openMenu());
 $("mobileBackdrop").addEventListener("click",()=>closeMenu(true));
 $("sidebar").addEventListener("keydown",e=>{
  if(e.key!=="Tab"||!$("sidebar").classList.contains("open"))return;
  const links=qs(".nav-link",e.currentTarget);if(!links.length)return;
  if(e.shiftKey&&document.activeElement===links[0]){e.preventDefault();links[links.length-1].focus()}
  else if(!e.shiftKey&&document.activeElement===links[links.length-1]){e.preventDefault();links[0].focus()}
 });

 $("closeDetails").addEventListener("click",closeDrawer);$("drawerBackdrop").addEventListener("click",closeDrawer);
 $("detailsDrawer").addEventListener("keydown",e=>{if(e.key==="Tab"){const focusable=qs("button:not([disabled])",e.currentTarget);if(focusable.length){e.preventDefault();focusable[0].focus()}}});
 $("scenarioButton").addEventListener("click",()=>setScenario(currentScenario+1));$("exportButton").addEventListener("click",downloadDemo);
 $("pauseButton").addEventListener("click",()=>{if($("pauseButton").disabled)return;paused=!paused;syncTopologyMotion();showToast(paused?"Η κίνηση σταμάτησε — DEMO":"Η κίνηση συνεχίστηκε — DEMO")});
 ["deploySearch","deploySource","deployFilter"].forEach(id=>$(id).addEventListener(id==="deploySearch"?"input":"change",renderDeployments));
 window.setInterval(()=>{if(activeView==="deployments"&&document.visibilityState!=="hidden")renderDeployments()},30000);
 ["operationsSearch","operationsFilter"].forEach(id=>$(id).addEventListener(id.endsWith("Filter")?"change":"input",renderTasks));
 ["eventsSearch","eventsFilter"].forEach(id=>$(id).addEventListener(id.endsWith("Filter")?"change":"input",renderEvents));
 $("costSlider").addEventListener("input",e=>updateCost(e.target.value));
 $("searchShortcut").addEventListener("click",()=>{$("searchDialog").showModal();$("globalSearch").focus();searchRender()});
 $("closeSearch").addEventListener("click",closeSearch);$("globalSearch").addEventListener("input",searchRender);
 $("globalSearch").addEventListener("keydown",e=>{if(e.key==="Enter"){const first=$("globalSearchResults").querySelector("button");if(first)first.click()}});
 $("helpButton").addEventListener("click",()=>$("helpDialog").showModal());$("closeHelp").addEventListener("click",()=>$("helpDialog").close());
 document.addEventListener("keydown",e=>{
  if(e.key==="Escape"){closeDrawer();closeMenu(true)}
  const typing=/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName||"")||document.activeElement?.isContentEditable;
  if(e.key==="/"&&!typing&&!$("searchDialog").open&&!$("helpDialog").open&&$("detailsDrawer").hidden){e.preventDefault();$("searchDialog").showModal();$("globalSearch").focus();searchRender()}
 });
 window.addEventListener("hashchange",()=>{const view=location.hash.replace("#","");if(view!==activeView)setView(view)});
 const initial=location.hash.replace("#","");setView(["overview","network","deployments","operations","security","cost","events"].includes(initial)?initial:"overview");
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
