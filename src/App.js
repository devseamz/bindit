import { useState, useRef, useEffect } from "react";

const COLORS = {
  bg: "#13152E", surface: "#1A1D3A", card: "#212449", border: "#2E3260",
  accent: "#2DD4AA", accentGlow: "#2DD4AA33", accentLight: "#5EECD0",
  red: "#FF4D6A", redGlow: "#FF4D6A33", green: "#2DD4AA", yellow: "#F59E0B",
  text: "#F0EFF5", muted: "#7E85B0", inputBg: "#0F1128",
};
const CARD_COLORS = ["#7C5CFC","#FF4D6A","#00D68F","#F59E0B","#3B82F6","#EC4899","#14B8A6"];
const BANKS = {
  "Chase":            { url: "https://www.chase.com/digital/login-page", color: "#117ACA" },
  "Bank of America":  { url: "https://www.bankofamerica.com/credit-cards/", color: "#E31837" },
  "Citi":             { url: "https://online.citi.com/US/login.do", color: "#003B70" },
  "Wells Fargo":      { url: "https://connect.secure.wellsfargo.com/auth/login/present", color: "#D71E28" },
  "American Express": { url: "https://www.americanexpress.com/en-us/account/login", color: "#007BC1" },
  "Discover":         { url: "https://portal.discover.com/customersite/login", color: "#FF6600" },
  "Capital One":      { url: "https://myaccount.capitalone.com/consumer/signin", color: "#D03027" },
  "Apple Card":       { url: "https://wallet.apple.com/", color: "#555555" },
  "US Bank":          { url: "https://onlinebanking.usbank.com/auth/login/personal", color: "#0A2F6B" },
  "Barclays":         { url: "https://www.barclaysus.com/all-products/credit-cards/login.html", color: "#00AEEF" },
  "Other":            { url: null, color: "#7E85B0" },
};
const BANK_NAMES = Object.keys(BANKS);

const DEMO_CARDS = [
  { id:1, name:"Chase Sapphire",   balance:4200, limit:10000, apr:24.99, minPayment:85, color:CARD_COLORS[0], due:"Jun 22", bank:"Chase" },
  { id:2, name:"Amex Gold",        balance:1850, limit:5000,  apr:19.49, minPayment:37, color:CARD_COLORS[1], due:"Jun 28", bank:"American Express" },
  { id:3, name:"Citi Double Cash", balance:3100, limit:8000,  apr:22.24, minPayment:62, color:CARD_COLORS[2], due:"Jul 5",  bank:"Citi" },
];

// ── Math helpers ──────────────────────────────────────────────────────────────
function fmt(n)     { return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0}).format(n); }
function fmtX(n)    { return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",minimumFractionDigits:2,maximumFractionDigits:2}).format(n); }
function fmtPct(n)  { return `${parseFloat(n).toFixed(2)}%`; }
function moInt(bal,apr) { return bal*(apr/100/12); }
function calcMin(bal,apr) { if(bal<=0)return 0; return Math.max(bal*0.01+moInt(bal,apr),25); }
function moPayoff(bal,apr,pmt) {
  if(bal<=0)return 0; const r=apr/100/12;
  if(r===0)return Math.ceil(bal/pmt);
  if(pmt<=bal*r)return Infinity;
  return Math.ceil(Math.log(pmt/(pmt-bal*r))/Math.log(1+r));
}
function buildSchedule(bal,apr,pmt) {
  // Returns array of {month, balance, interest, principal} until paid off or 360 months
  const rows=[]; let b=bal; const r=apr/100/12;
  for(let m=1;m<=360&&b>0;m++){
    const int=b*r; const prin=Math.min(pmt-int,b); b=Math.max(b-prin,0);
    rows.push({month:m,balance:b,interest:int,principal:prin});
    if(b===0)break;
  }
  return rows;
}
function avalancheOrder(cards) { return [...cards].sort((a,b)=>b.apr-a.apr); }
function snowballOrder(cards)  { return [...cards].sort((a,b)=>a.balance-b.balance); }

function validate(form) {
  const e={};
  if(!form.name.trim()) e.name="Required";
  const bal=parseFloat(form.balance),lim=parseFloat(form.limit),apr=parseFloat(form.apr),min=parseFloat(form.minPayment);
  if(isNaN(bal)||bal<0)        e.balance="Enter a valid balance";
  if(isNaN(lim)||lim<=0)       e.limit="Enter a valid limit";
  if(!isNaN(bal)&&!isNaN(lim)&&bal>lim) e.balance="Balance > limit";
  if(isNaN(apr)||apr<0||apr>100) e.apr="0–100 required";
  if(form.minPayment!==""&&(isNaN(min)||min<0)) e.minPayment="Invalid";
  return e;
}

// ── Storage ───────────────────────────────────────────────────────────────────
async function loadCards() { try{ const r=await window.storage.get("bindit-cards"); if(r?.value)return JSON.parse(r.value); }catch{} return null; }
async function saveCards(c) { try{ await window.storage.set("bindit-cards",JSON.stringify(c)); }catch{} }

// ── Shared UI ─────────────────────────────────────────────────────────────────
function ProgressBar({value,max,color}){
  const pct=Math.min((value/max)*100,100);
  const col=pct>75?COLORS.red:pct>50?COLORS.yellow:color;
  return <div style={{background:COLORS.border,borderRadius:4,height:6,overflow:"hidden"}}><div style={{width:`${pct}%`,height:"100%",borderRadius:4,background:col,transition:"width 0.5s ease"}}/></div>;
}
function PayoffBadge({balance,apr,minPayment}){
  const m=moPayoff(balance,apr,minPayment);
  if(m===Infinity)return <span style={{fontSize:11,background:COLORS.red+"22",color:COLORS.red,borderRadius:6,padding:"2px 8px",fontWeight:600}}>⚠ Min too low</span>;
  if(m===0)return <span style={{fontSize:11,background:COLORS.green+"22",color:COLORS.green,borderRadius:6,padding:"2px 8px",fontWeight:600}}>✓ Paid off</span>;
  const lbl=m>120?`${Math.round(m/12)}y+`:m>23?`${Math.round(m/12)}y ${m%12}m`:`${m}mo`;
  const col=m>36?COLORS.red:m>12?COLORS.yellow:COLORS.green;
  return <span style={{fontSize:11,background:col+"22",color:col,borderRadius:6,padding:"2px 8px",fontWeight:600}}>{lbl} payoff</span>;
}
function SectionTitle({children}){
  return <div style={{fontSize:12,color:COLORS.muted,textTransform:"uppercase",letterSpacing:"0.1em",fontWeight:700,marginBottom:16}}>{children}</div>;
}

// ── Card Tile ─────────────────────────────────────────────────────────────────
function CardTile({card,onEdit,onDelete}){
  const util=(card.balance/card.limit)*100;
  const interest=moInt(card.balance,card.apr);
  const effMin=card.minPayment>0?card.minPayment:calcMin(card.balance,card.apr);
  return (
    <div style={{background:COLORS.card,border:`1px solid ${COLORS.border}`,borderRadius:16,padding:20,position:"relative",overflow:"hidden",transition:"border-color 0.2s"}}
      onMouseEnter={e=>e.currentTarget.style.borderColor=card.color+"99"}
      onMouseLeave={e=>e.currentTarget.style.borderColor=COLORS.border}>
      <div style={{position:"absolute",top:0,left:0,right:0,height:3,background:card.color,borderRadius:"16px 16px 0 0"}}/>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:14}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:12,color:COLORS.muted,marginBottom:4,fontWeight:600,letterSpacing:"0.06em",textTransform:"uppercase",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{card.name}</div>
          <div style={{fontSize:26,fontWeight:800,color:COLORS.text,letterSpacing:"-0.02em"}}>{fmt(card.balance)}</div>
        </div>
        <div style={{display:"flex",gap:6,flexShrink:0,marginLeft:8}}>
          <button onClick={()=>onEdit(card)} style={{background:COLORS.surface,border:`1px solid ${COLORS.border}`,borderRadius:8,color:COLORS.muted,padding:"5px 10px",cursor:"pointer",fontSize:12}}>Edit</button>
          <button onClick={()=>onDelete(card.id)} style={{background:"transparent",border:"none",color:COLORS.muted,cursor:"pointer",fontSize:18,lineHeight:1,padding:"5px 6px"}}>×</button>
        </div>
      </div>
      <div style={{marginBottom:14}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
          <span style={{fontSize:12,color:COLORS.muted}}>Utilization {fmtPct(util)}</span>
          <span style={{fontSize:12,color:COLORS.muted}}>{fmt(card.balance)} / {fmt(card.limit)}</span>
        </div>
        <ProgressBar value={card.balance} max={card.limit} color={card.color}/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:12}}>
        {[{label:"APR",value:fmtPct(card.apr)},{label:"Monthly Int",value:fmtX(interest)},{label:"Due",value:card.due||"—"}].map(item=>(
          <div key={item.label} style={{background:COLORS.surface,borderRadius:10,padding:"9px 11px"}}>
            <div style={{fontSize:10,color:COLORS.muted,marginBottom:3,textTransform:"uppercase",letterSpacing:"0.05em"}}>{item.label}</div>
            <div style={{fontSize:13,fontWeight:600,color:COLORS.text}}>{item.value}</div>
          </div>
        ))}
      </div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <span style={{fontSize:12,color:COLORS.muted}}>Min: <strong style={{color:COLORS.text}}>{fmtX(effMin)}</strong>/mo</span>
        <PayoffBadge balance={card.balance} apr={card.apr} minPayment={effMin}/>
      </div>
      {card.bank&&BANKS[card.bank]?.url&&(
        <a href={BANKS[card.bank].url} target="_blank" rel="noopener noreferrer" style={{display:"block",textAlign:"center",padding:"10px",borderRadius:12,background:COLORS.accent+"22",border:`1px solid ${COLORS.accent}`,color:COLORS.accent,fontSize:13,fontWeight:700,textDecoration:"none",transition:"background 0.2s"}}
          onMouseEnter={e=>e.currentTarget.style.background=COLORS.accent+"44"}
          onMouseLeave={e=>e.currentTarget.style.background=COLORS.accent+"22"}>
          💳 Make Payment → {card.bank}
        </a>
      )}
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function FieldInput({label,field,form,errors,set,type,placeholder}){
  return (
    <div>
      <label style={{fontSize:11,color:errors[field]?COLORS.red:COLORS.muted,display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:"0.05em",fontWeight:600}}>
        {label}{errors[field]?` — ${errors[field]}`:""}
      </label>
      <input type={type||"text"} placeholder={placeholder} value={form[field]} onChange={e=>set(field,e.target.value)}
        style={{width:"100%",background:COLORS.inputBg,border:`1px solid ${errors[field]?COLORS.red:COLORS.border}`,borderRadius:10,padding:"10px 14px",color:COLORS.text,fontSize:14,outline:"none",boxSizing:"border-box"}}/>
    </div>
  );
}
function Modal({card,onSave,onClose,nextColor}){
  const [form,setForm]=useState(card?{...card,balance:String(card.balance),limit:String(card.limit),apr:String(card.apr),minPayment:String(card.minPayment),bank:card.bank||""}:{name:"",balance:"",limit:"",apr:"",minPayment:"",due:"",bank:"",color:nextColor});
  const [errors,setErrors]=useState({});
  const set=(k,v)=>{setForm(f=>({...f,[k]:v}));setErrors(e=>({...e,[k]:undefined}));};
  const handleSave=()=>{ const errs=validate(form); if(Object.keys(errs).length){setErrors(errs);return;} onSave({...form,id:form.id||Date.now(),balance:parseFloat(form.balance),limit:parseFloat(form.limit),apr:parseFloat(form.apr),minPayment:form.minPayment!==""?parseFloat(form.minPayment):0}); };
  const suggested=form.balance&&form.apr?calcMin(parseFloat(form.balance)||0,parseFloat(form.apr)||0):null;
  return (
    <div style={{position:"fixed",inset:0,background:"#00000099",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center",padding:20}} onClick={onClose}>
      <div style={{background:COLORS.surface,border:`1px solid ${COLORS.border}`,borderRadius:20,padding:28,width:"100%",maxWidth:460,boxShadow:"0 24px 60px #00000088",maxHeight:"90vh",overflowY:"auto"}} onClick={e=>e.stopPropagation()}>
        <div style={{fontSize:18,fontWeight:700,color:COLORS.text,marginBottom:22}}>{card?"Edit Card":"Add Card Manually"}</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
          <div style={{gridColumn:"1 / -1"}}><FieldInput label="Card Name" field="name" form={form} errors={errors} set={set} placeholder="e.g. Chase Sapphire"/></div>
          <FieldInput label="Balance ($)"  field="balance"    form={form} errors={errors} set={set} type="number" placeholder="4200"/>
          <FieldInput label="Limit ($)"    field="limit"      form={form} errors={errors} set={set} type="number" placeholder="10000"/>
          <FieldInput label="APR (%)"      field="apr"        form={form} errors={errors} set={set} type="number" placeholder="24.99"/>
          <div>
            <FieldInput label="Min Payment ($)" field="minPayment" form={form} errors={errors} set={set} type="number" placeholder="85"/>
            {suggested&&<button onClick={()=>set("minPayment",suggested.toFixed(2))} style={{marginTop:5,fontSize:11,color:COLORS.accent,background:"none",border:"none",cursor:"pointer",padding:0}}>Use suggested: {fmtX(suggested)}</button>}
          </div>
          <FieldInput label="Due Date" field="due" form={form} errors={errors} set={set} placeholder="Jun 22"/>
          <div style={{gridColumn:"1 / -1"}}>
            <label style={{fontSize:11,color:COLORS.muted,display:"block",marginBottom:5,textTransform:"uppercase",letterSpacing:"0.05em",fontWeight:600}}>Bank / Issuer</label>
            <select value={form.bank||""} onChange={e=>set("bank",e.target.value)} style={{width:"100%",background:COLORS.inputBg,border:`1px solid ${COLORS.border}`,borderRadius:10,padding:"10px 14px",color:form.bank?COLORS.text:COLORS.muted,fontSize:14,outline:"none",boxSizing:"border-box"}}>
              <option value="">Select your bank...</option>
              {BANK_NAMES.map(b=><option key={b} value={b}>{b}</option>)}
            </select>
          </div>
        </div>
        <div style={{marginTop:16,marginBottom:22}}>
          <div style={{fontSize:11,color:COLORS.muted,marginBottom:8,textTransform:"uppercase",letterSpacing:"0.05em",fontWeight:600}}>Card Color</div>
          <div style={{display:"flex",gap:10}}>{CARD_COLORS.map(c=><button key={c} onClick={()=>set("color",c)} style={{width:26,height:26,borderRadius:"50%",background:c,border:form.color===c?"2px solid white":"2px solid transparent",cursor:"pointer"}}/>)}</div>
        </div>
        <div style={{display:"flex",gap:12}}>
          <button onClick={onClose} style={{flex:1,padding:12,borderRadius:12,background:COLORS.card,border:`1px solid ${COLORS.border}`,color:COLORS.muted,cursor:"pointer",fontSize:14}}>Cancel</button>
          <button onClick={handleSave} style={{flex:2,padding:12,borderRadius:12,background:COLORS.accent,border:"none",color:"white",cursor:"pointer",fontSize:14,fontWeight:600}}>Save Card</button>
        </div>
      </div>
    </div>
  );
}

// ── AI Chat ───────────────────────────────────────────────────────────────────
function AIChat({cards,onCardsUpdated}){
  const [messages,setMessages]=useState([{role:"assistant",text:"Hey! Tell me about a card — name, balance, limit, APR — and I'll add or update it. You can also ask me to remove a card or summarize your debt."}]);
  const [input,setInput]=useState("");
  const [loading,setLoading]=useState(false);
  const bottomRef=useRef(null);
  useEffect(()=>{ bottomRef.current?.scrollIntoView({behavior:"smooth"}); },[messages]);
  const send=async()=>{
    if(!input.trim()||loading)return;
    const userMsg=input.trim(); setInput(""); setMessages(m=>[...m,{role:"user",text:userMsg}]); setLoading(true);
    const sys=`You are BindIt AI. Current cards: ${JSON.stringify(cards)}. Respond ONLY with valid JSON:
- Add: {"action":"add","card":{"name":"...","balance":1234,"limit":5000,"apr":22.99,"minPayment":50,"due":"Jun 22","color":"#7C5CFC"}}
- Update: {"action":"update","id":<id>,"fields":{...}}
- Delete: {"action":"delete","id":<id>}
- Message: {"action":"message","text":"..."}
Colors: #7C5CFC #FF4D6A #00D68F #F59E0B #3B82F6 #EC4899 #14B8A6`;
    try{
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,system:sys,messages:[{role:"user",content:userMsg}]})});
      const data=await res.json();
      const raw=data.content?.find(b=>b.type==="text")?.text||"{}";
      const parsed=JSON.parse(raw.replace(/```json|```/g,"").trim());
      if(parsed.action==="add"){const nc={...parsed.card,id:Date.now()};onCardsUpdated({type:"add",card:nc});setMessages(m=>[...m,{role:"assistant",text:`Added "${parsed.card.name}" — ${fmt(parsed.card.balance)} balance at ${parsed.card.apr}% APR.`}]);}
      else if(parsed.action==="update"){onCardsUpdated({type:"update",id:parsed.id,fields:parsed.fields});setMessages(m=>[...m,{role:"assistant",text:"Updated!"}]);}
      else if(parsed.action==="delete"){const t=cards.find(c=>c.id===parsed.id);onCardsUpdated({type:"delete",id:parsed.id});setMessages(m=>[...m,{role:"assistant",text:`Removed "${t?.name||"card"}".`}]);}
      else setMessages(m=>[...m,{role:"assistant",text:parsed.text||"Done!"}]);
    }catch{ setMessages(m=>[...m,{role:"assistant",text:"Something went wrong — try again."}]); }
    finally{ setLoading(false); }
  };
  return (
    <div style={{background:COLORS.card,border:`1px solid ${COLORS.border}`,borderRadius:16,display:"flex",flexDirection:"column",height:400}}>
      <div style={{padding:"14px 20px",borderBottom:`1px solid ${COLORS.border}`,display:"flex",alignItems:"center",gap:10}}>
        <div style={{width:9,height:9,borderRadius:"50%",background:COLORS.accent,boxShadow:`0 0 8px ${COLORS.accent}`}}/>
        <span style={{fontWeight:700,color:COLORS.text,fontSize:14}}>BindIt AI</span>
        <span style={{fontSize:12,color:COLORS.muted}}>Add & manage cards by chat</span>
      </div>
      <div style={{flex:1,overflowY:"auto",padding:"16px 20px",display:"flex",flexDirection:"column",gap:10}}>
        {messages.map((m,i)=>(
          <div key={i} style={{alignSelf:m.role==="user"?"flex-end":"flex-start",background:m.role==="user"?COLORS.accent:COLORS.surface,color:COLORS.text,padding:"10px 14px",borderRadius:m.role==="user"?"16px 16px 4px 16px":"16px 16px 16px 4px",maxWidth:"82%",fontSize:14,lineHeight:1.5}}>{m.text}</div>
        ))}
        {loading&&<div style={{alignSelf:"flex-start",color:COLORS.muted,fontSize:14,padding:"10px 14px"}}>Thinking…</div>}
        <div ref={bottomRef}/>
      </div>
      <div style={{padding:"12px 16px",borderTop:`1px solid ${COLORS.border}`,display:"flex",gap:10}}>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()} placeholder='e.g. "Add Discover, $2100, $6000 limit, 21.5% APR"' style={{flex:1,background:COLORS.inputBg,border:`1px solid ${COLORS.border}`,borderRadius:10,padding:"10px 14px",color:COLORS.text,fontSize:14,outline:"none"}}/>
        <button onClick={send} disabled={loading} style={{background:COLORS.accent,border:"none",borderRadius:10,padding:"10px 18px",color:"white",fontWeight:600,cursor:"pointer",fontSize:14,opacity:loading?0.6:1}}>Send</button>
      </div>
    </div>
  );
}

// ── Dashboard Screen ──────────────────────────────────────────────────────────
function DashboardScreen({cards,setCards,saved}){
  const [tab,setTab]=useState("cards");
  const [modal,setModal]=useState(null);
  const totalDebt=cards.reduce((s,c)=>s+c.balance,0);
  const totalLimit=cards.reduce((s,c)=>s+c.limit,0);
  const totalMin=cards.reduce((s,c)=>s+(c.minPayment>0?c.minPayment:calcMin(c.balance,c.apr)),0);
  const totalInt=cards.reduce((s,c)=>s+moInt(c.balance,c.apr),0);
  const avgAPR=cards.length?cards.reduce((s,c)=>s+c.apr,0)/cards.length:0;
  const overallUtil=totalLimit?(totalDebt/totalLimit)*100:0;
  const handleSave=(card)=>{ setCards(prev=>{ const exists=prev.find(c=>c.id===card.id); return exists?prev.map(c=>c.id===card.id?card:c):[...prev,card]; }); setModal(null); };
  const handleDelete=(id)=>setCards(prev=>prev.filter(c=>c.id!==id));
  const handleAI=({type,card,id,fields})=>{ if(type==="add")setCards(p=>[...p,card]); else if(type==="update")setCards(p=>p.map(c=>c.id===id?{...c,...fields}:c)); else if(type==="delete")setCards(p=>p.filter(c=>c.id!==id)); };
  const nextColor=CARD_COLORS[cards.length%CARD_COLORS.length];
  return (
    <div style={{paddingBottom:4}}>
      <div style={{marginBottom:28}}>
        <div style={{fontSize:12,color:COLORS.muted,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:6}}>Total Debt</div>
        <div style={{fontSize:"clamp(36px,8vw,52px)",fontWeight:900,letterSpacing:"-0.04em",color:COLORS.text,lineHeight:1}}>{fmt(totalDebt)}</div>
        <div style={{marginTop:14}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
            <span style={{fontSize:12,color:COLORS.muted}}>Overall utilization {fmtPct(overallUtil)}</span>
            <span style={{fontSize:12,color:COLORS.muted}}>{fmt(totalDebt)} / {fmt(totalLimit)}</span>
          </div>
          <ProgressBar value={totalDebt} max={totalLimit} color={COLORS.accent}/>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))",gap:12,marginBottom:28}}>
        {[{label:"Cards",value:cards.length},{label:"Min / Month",value:fmtX(totalMin)},{label:"Interest / Mo",value:fmtX(totalInt)},{label:"Avg APR",value:fmtPct(avgAPR)}].map(s=>(
          <div key={s.label} style={{background:COLORS.card,border:`1px solid ${COLORS.border}`,borderRadius:14,padding:"16px 18px"}}>
            <div style={{fontSize:11,color:COLORS.muted,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.06em"}}>{s.label}</div>
            <div style={{fontSize:20,fontWeight:700,color:COLORS.text}}>{s.value}</div>
          </div>
        ))}
      </div>
      <div style={{display:"flex",gap:4,marginBottom:20,background:COLORS.card,border:`1px solid ${COLORS.border}`,borderRadius:12,padding:4,width:"fit-content"}}>
        {[{id:"cards",label:"My Cards"},{id:"ai",label:"✦ AI Add"}].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{padding:"7px 18px",borderRadius:9,border:"none",cursor:"pointer",fontSize:13,fontWeight:600,background:tab===t.id?COLORS.accent:"transparent",color:tab===t.id?"white":COLORS.muted,transition:"all 0.2s"}}>{t.label}</button>
        ))}
      </div>
      {tab==="cards"&&(
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(270px,1fr))",gap:16}}>
          {cards.map(card=><CardTile key={card.id} card={card} onEdit={c=>setModal(c)} onDelete={handleDelete}/>)}
          <button onClick={()=>setModal("add")} style={{background:"transparent",border:`2px dashed ${COLORS.border}`,borderRadius:16,padding:20,cursor:"pointer",color:COLORS.muted,fontSize:14,fontWeight:500,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:10,minHeight:180,transition:"border-color 0.2s,color 0.2s"}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=COLORS.accent;e.currentTarget.style.color=COLORS.accentLight;}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor=COLORS.border;e.currentTarget.style.color=COLORS.muted;}}>
            <span style={{fontSize:26}}>＋</span><span>Add a Card</span>
          </button>
        </div>
      )}
      {tab==="ai"&&<AIChat cards={cards} onCardsUpdated={handleAI}/>}
      {(modal==="add"||(modal&&typeof modal==="object"))&&<Modal card={modal==="add"?null:modal} onSave={handleSave} onClose={()=>setModal(null)} nextColor={nextColor}/>}
    </div>
  );
}

// ── Payoff Planner Screen ─────────────────────────────────────────────────────
function PayoffScreen({cards}){
  const totalMin=cards.reduce((s,c)=>s+(c.minPayment>0?c.minPayment:calcMin(c.balance,c.apr)),0);
  const [budget,setBudget]=useState(Math.ceil(totalMin+100));
  const [strategy,setStrategy]=useState("avalanche");
  const extra=Math.max(budget-totalMin,0);

  // Simple multi-card payoff simulation
  function simulate(cardList,monthlyBudget){
    let remaining=cardList.map(c=>({...c,bal:c.balance}));
    let month=0; let totalInterestPaid=0; const timeline=[];
    while(remaining.some(c=>c.bal>0)&&month<360){
      month++;
      // Pay minimums first
      let budgetLeft=monthlyBudget;
      remaining=remaining.map(c=>{
        if(c.bal<=0)return c;
        const int=c.bal*(c.apr/100/12);
        const min=Math.min(c.minPayment>0?c.minPayment:calcMin(c.bal,c.apr),c.bal+int);
        budgetLeft-=min; totalInterestPaid+=int;
        return {...c,bal:Math.max(c.bal-(min-int),0)};
      });
      // Extra to first non-zero card
      if(budgetLeft>0){
        for(let i=0;i<remaining.length;i++){
          if(remaining[i].bal>0){ remaining[i]={...remaining[i],bal:Math.max(remaining[i].bal-budgetLeft,0)}; break; }
        }
      }
      timeline.push({month,totalBal:remaining.reduce((s,c)=>s+c.bal,0)});
    }
    return {months:month,totalInterestPaid,timeline};
  }

  const ordered=strategy==="avalanche"?avalancheOrder(cards):snowballOrder(cards);
  const result=simulate(ordered,budget);
  const minResult=simulate(ordered,totalMin);
  const interestSaved=Math.max(minResult.totalInterestPaid-result.totalInterestPaid,0);
  const monthsSaved=Math.max(minResult.months-result.months,0);

  // Chart points every 6 months
  const chartPoints=result.timeline.filter((_,i)=>i%6===0||i===result.timeline.length-1);
  const maxBal=cards.reduce((s,c)=>s+c.balance,0);

  return (
    <div>
      <SectionTitle>Payoff Planner</SectionTitle>

      <div style={{background:COLORS.card,border:`1px solid ${COLORS.border}`,borderRadius:16,padding:20,marginBottom:20}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:20}}>
          <div>
            <div style={{fontSize:11,color:COLORS.muted,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8,fontWeight:600}}>Monthly Budget</div>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <span style={{color:COLORS.muted,fontSize:16}}>$</span>
              <input type="number" value={budget} onChange={e=>setBudget(Math.max(parseFloat(e.target.value)||0,totalMin))}
                style={{width:"100%",background:COLORS.inputBg,border:`1px solid ${COLORS.border}`,borderRadius:10,padding:"10px 14px",color:COLORS.text,fontSize:18,fontWeight:700,outline:"none",boxSizing:"border-box"}}/>
            </div>
            <div style={{fontSize:11,color:COLORS.muted,marginTop:6}}>Min required: {fmtX(totalMin)}/mo · Extra: {fmt(extra)}</div>
          </div>
          <div>
            <div style={{fontSize:11,color:COLORS.muted,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8,fontWeight:600}}>Strategy</div>
            <div style={{display:"flex",gap:8}}>
              {[{id:"avalanche",label:"Avalanche",sub:"Highest APR first"},{id:"snowball",label:"Snowball",sub:"Lowest balance first"}].map(s=>(
                <button key={s.id} onClick={()=>setStrategy(s.id)} style={{flex:1,background:strategy===s.id?COLORS.accent+"22":"transparent",border:`1px solid ${strategy===s.id?COLORS.accent:COLORS.border}`,borderRadius:12,padding:"10px 8px",cursor:"pointer",textAlign:"left",transition:"all 0.2s"}}>
                  <div style={{fontSize:13,fontWeight:700,color:strategy===s.id?COLORS.accentLight:COLORS.text}}>{s.label}</div>
                  <div style={{fontSize:11,color:COLORS.muted,marginTop:2}}>{s.sub}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
          {[
            {label:"Debt-free in",value:result.months>0?`${result.months} mo`:"Now!",color:result.months>36?COLORS.red:result.months>12?COLORS.yellow:COLORS.green},
            {label:"Total interest",value:fmtX(result.totalInterestPaid),color:COLORS.text},
            {label:"Interest saved",value:interestSaved>0?fmtX(interestSaved):"—",color:COLORS.green},
          ].map(s=>(
            <div key={s.label} style={{background:COLORS.surface,borderRadius:12,padding:"14px 16px"}}>
              <div style={{fontSize:11,color:COLORS.muted,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.05em"}}>{s.label}</div>
              <div style={{fontSize:18,fontWeight:800,color:s.color}}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Balance chart */}
      <div style={{background:COLORS.card,border:`1px solid ${COLORS.border}`,borderRadius:16,padding:20,marginBottom:20}}>
        <div style={{fontSize:13,fontWeight:600,color:COLORS.text,marginBottom:16}}>Projected Balance Over Time</div>
        <div style={{position:"relative",height:140}}>
          <svg width="100%" height="140" style={{overflow:"visible"}}>
            {chartPoints.length>1&&(()=>{
              const w=100; // percent
              const pts=chartPoints.map((p,i)=>({
                x:(i/(chartPoints.length-1))*w,
                y:100-((p.totalBal/maxBal)*100),
              }));
              const path=pts.map((p,i)=>`${i===0?"M":"L"}${p.x}% ${p.y}%`).join(" ");
              return <>
                <defs>
                  <linearGradient id="balGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.accent} stopOpacity="0.3"/>
                    <stop offset="100%" stopColor={COLORS.accent} stopOpacity="0"/>
                  </linearGradient>
                </defs>
                <path d={`${path} L100% 100% L0% 100% Z`} fill="url(#balGrad)"/>
                <path d={path} fill="none" stroke={COLORS.accent} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
              </>;
            })()}
          </svg>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:8}}>
            {chartPoints.filter((_,i)=>i%2===0).map(p=>(
              <span key={p.month} style={{fontSize:10,color:COLORS.muted}}>Mo {p.month}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Card order */}
      <div style={{background:COLORS.card,border:`1px solid ${COLORS.border}`,borderRadius:16,padding:20}}>
        <div style={{fontSize:13,fontWeight:600,color:COLORS.text,marginBottom:14}}>Payoff Order ({strategy==="avalanche"?"Highest APR → Lowest":"Lowest Balance → Highest"})</div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {ordered.map((card,i)=>{
            const effMin=card.minPayment>0?card.minPayment:calcMin(card.balance,card.apr);
            return (
              <div key={card.id} style={{display:"flex",alignItems:"center",gap:14,background:COLORS.surface,borderRadius:12,padding:"12px 16px"}}>
                <div style={{width:26,height:26,borderRadius:"50%",background:card.color+"22",border:`1px solid ${card.color}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,color:card.color,flexShrink:0}}>{i+1}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:600,color:COLORS.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{card.name}</div>
                  <div style={{fontSize:11,color:COLORS.muted}}>{fmt(card.balance)} · {fmtPct(card.apr)} APR</div>
                </div>
                <PayoffBadge balance={card.balance} apr={card.apr} minPayment={effMin}/>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Spending Insights Screen ──────────────────────────────────────────────────
function InsightsScreen({cards}){
  const totalDebt=cards.reduce((s,c)=>s+c.balance,0);
  const totalLimit=cards.reduce((s,c)=>s+c.limit,0);
  const totalInt=cards.reduce((s,c)=>s+moInt(c.balance,c.apr),0);
  const annualInt=totalInt*12;
  const highestAPR=cards.length?[...cards].sort((a,b)=>b.apr-a.apr)[0]:null;
  const highestBal=cards.length?[...cards].sort((a,b)=>b.balance-a.balance)[0]:null;

  // Simulated 6-month debt trend (going down 3% per month from current)
  const months=["Jan","Feb","Mar","Apr","May","Jun"];
  const trend=months.map((_,i)=>({label:months[i],value:Math.round(totalDebt*(1+((5-i)*0.04)))}));

  const barMax=Math.max(...trend.map(t=>t.value));

  return (
    <div>
      <SectionTitle>Spending Insights</SectionTitle>

      {/* Key insights */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:20}}>
        {[
          {label:"Annual Interest Cost",value:fmtX(annualInt),sub:"at current balances",color:COLORS.red},
          {label:"Available Credit",value:fmt(totalLimit-totalDebt),sub:`${fmtPct(100-((totalDebt/totalLimit)*100))} unused`,color:COLORS.green},
          {label:"Highest APR Card",value:highestAPR?fmtPct(highestAPR.apr):"—",sub:highestAPR?.name||"",color:COLORS.yellow},
          {label:"Largest Balance",value:highestBal?fmt(highestBal.balance):"—",sub:highestBal?.name||"",color:COLORS.text},
        ].map(s=>(
          <div key={s.label} style={{background:COLORS.card,border:`1px solid ${COLORS.border}`,borderRadius:14,padding:"16px 18px"}}>
            <div style={{fontSize:11,color:COLORS.muted,marginBottom:5,textTransform:"uppercase",letterSpacing:"0.05em"}}>{s.label}</div>
            <div style={{fontSize:20,fontWeight:800,color:s.color,marginBottom:3}}>{s.value}</div>
            <div style={{fontSize:11,color:COLORS.muted}}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Debt by card */}
      <div style={{background:COLORS.card,border:`1px solid ${COLORS.border}`,borderRadius:16,padding:20,marginBottom:20}}>
        <div style={{fontSize:13,fontWeight:600,color:COLORS.text,marginBottom:16}}>Debt Breakdown</div>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          {[...cards].sort((a,b)=>b.balance-a.balance).map(card=>{
            const share=(card.balance/totalDebt)*100;
            return (
              <div key={card.id}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                  <span style={{fontSize:13,color:COLORS.text,fontWeight:500}}>{card.name}</span>
                  <span style={{fontSize:13,color:COLORS.muted}}>{fmt(card.balance)} · {fmtPct(share)}</span>
                </div>
                <ProgressBar value={card.balance} max={totalDebt} color={card.color}/>
              </div>
            );
          })}
        </div>
      </div>

      {/* 6-month trend */}
      <div style={{background:COLORS.card,border:`1px solid ${COLORS.border}`,borderRadius:16,padding:20,marginBottom:20}}>
        <div style={{fontSize:13,fontWeight:600,color:COLORS.text,marginBottom:4}}>6-Month Debt Trend</div>
        <div style={{fontSize:11,color:COLORS.muted,marginBottom:16}}>Simulated projection at minimum payments</div>
        <div style={{display:"flex",alignItems:"flex-end",gap:8,height:100}}>
          {trend.map((t,i)=>(
            <div key={t.label} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:6}}>
              <div style={{fontSize:10,color:COLORS.muted}}>{fmt(t.value).replace("$","").replace(",000","k")}</div>
              <div style={{width:"100%",background:i===trend.length-1?COLORS.green:COLORS.accent,borderRadius:"4px 4px 0 0",height:`${(t.value/barMax)*80}px`,opacity:0.7+i*0.05,transition:"height 0.4s ease"}}/>
              <div style={{fontSize:11,color:COLORS.muted}}>{t.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* APR comparison */}
      <div style={{background:COLORS.card,border:`1px solid ${COLORS.border}`,borderRadius:16,padding:20}}>
        <div style={{fontSize:13,fontWeight:600,color:COLORS.text,marginBottom:16}}>APR Comparison</div>
        <div style={{display:"flex",flexDirection:"column",gap:10}}>
          {[...cards].sort((a,b)=>b.apr-a.apr).map(card=>(
            <div key={card.id}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                <span style={{fontSize:13,color:COLORS.text}}>{card.name}</span>
                <span style={{fontSize:13,fontWeight:700,color:card.apr>24?COLORS.red:card.apr>20?COLORS.yellow:COLORS.green}}>{fmtPct(card.apr)}</span>
              </div>
              <ProgressBar value={card.apr} max={35} color={card.apr>24?COLORS.red:card.apr>20?COLORS.yellow:COLORS.green}/>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Export / Report Screen ────────────────────────────────────────────────────
function ExportScreen({cards}){
  const [copied,setCopied]=useState(false);
  const totalDebt=cards.reduce((s,c)=>s+c.balance,0);
  const totalLimit=cards.reduce((s,c)=>s+c.limit,0);
  const totalMin=cards.reduce((s,c)=>s+(c.minPayment>0?c.minPayment:calcMin(c.balance,c.apr)),0);
  const totalInt=cards.reduce((s,c)=>s+moInt(c.balance,c.apr),0);
  const avgAPR=cards.length?cards.reduce((s,c)=>s+c.apr,0)/cards.length:0;
  const overallUtil=totalLimit?(totalDebt/totalLimit)*100:0;
  const today=new Date().toLocaleDateString("en-US",{year:"numeric",month:"long",day:"numeric"});

  const reportText=`BINDIT DEBT SUMMARY — ${today}
${"─".repeat(40)}

TOTAL DEBT:       ${fmtX(totalDebt)}
TOTAL LIMIT:      ${fmtX(totalLimit)}
UTILIZATION:      ${fmtPct(overallUtil)}
AVG APR:          ${fmtPct(avgAPR)}
MIN DUE / MONTH:  ${fmtX(totalMin)}
INTEREST / MONTH: ${fmtX(totalInt)}
INTEREST / YEAR:  ${fmtX(totalInt*12)}

${"─".repeat(40)}
CARD BREAKDOWN
${"─".repeat(40)}
${cards.map(c=>`
${c.name.toUpperCase()}
  Balance:  ${fmtX(c.balance)}
  Limit:    ${fmtX(c.limit)}
  APR:      ${fmtPct(c.apr)}
  Min Pmt:  ${fmtX(c.minPayment>0?c.minPayment:calcMin(c.balance,c.apr))}
  Due:      ${c.due||"—"}
  Mo Int:   ${fmtX(moInt(c.balance,c.apr))}`).join("\n")}

${"─".repeat(40)}
Generated by BindIt`;

  const handleCopy=()=>{ navigator.clipboard.writeText(reportText).then(()=>{ setCopied(true); setTimeout(()=>setCopied(false),2000); }); };

  return (
    <div>
      <SectionTitle>Export & Report</SectionTitle>

      <div style={{background:COLORS.card,border:`1px solid ${COLORS.border}`,borderRadius:16,padding:20,marginBottom:20}}>
        <div style={{fontSize:13,fontWeight:600,color:COLORS.text,marginBottom:4}}>Debt Summary Report</div>
        <div style={{fontSize:12,color:COLORS.muted,marginBottom:16}}>Share with your spouse, financial advisor, or save for your records</div>

        <div style={{background:COLORS.inputBg,border:`1px solid ${COLORS.border}`,borderRadius:12,padding:20,marginBottom:16,fontFamily:"monospace",fontSize:12,color:COLORS.text,lineHeight:1.8,whiteSpace:"pre-wrap",maxHeight:360,overflowY:"auto"}}>
          {reportText}
        </div>

        <div style={{display:"flex",gap:12}}>
          <button onClick={handleCopy} style={{flex:1,padding:"12px 20px",borderRadius:12,background:copied?COLORS.green:COLORS.accent,border:"none",color:"white",fontWeight:700,cursor:"pointer",fontSize:14,transition:"background 0.3s"}}>
            {copied?"✓ Copied!":"Copy Report"}
          </button>
        </div>
      </div>

      {/* Quick stats cards for sharing */}
      <div style={{background:COLORS.card,border:`1px solid ${COLORS.border}`,borderRadius:16,padding:20}}>
        <div style={{fontSize:13,fontWeight:600,color:COLORS.text,marginBottom:16}}>Snapshot</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {[
            {label:"Total Owed",value:fmtX(totalDebt)},
            {label:"Monthly Minimum",value:fmtX(totalMin)},
            {label:"Yearly Interest",value:fmtX(totalInt*12)},
            {label:"# of Cards",value:cards.length},
          ].map(s=>(
            <div key={s.label} style={{background:COLORS.surface,borderRadius:12,padding:"14px 16px"}}>
              <div style={{fontSize:11,color:COLORS.muted,marginBottom:4,textTransform:"uppercase",letterSpacing:"0.05em"}}>{s.label}</div>
              <div style={{fontSize:20,fontWeight:800,color:COLORS.text}}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Bottom Nav ────────────────────────────────────────────────────────────────
const NAV_ITEMS=[
  {id:"home",   label:"Home",    icon:"⊞"},
  {id:"payoff", label:"Payoff",  icon:"📈"},
  {id:"insights",label:"Insights",icon:"💡"},
  {id:"export", label:"Export",  icon:"📋"},
];
function BottomNav({active,setActive}){
  return (
    <div style={{position:"fixed",bottom:0,left:0,right:0,background:COLORS.surface,borderTop:`1px solid ${COLORS.border}`,display:"flex",zIndex:100,paddingBottom:"env(safe-area-inset-bottom,0px)"}}>
      {NAV_ITEMS.map(item=>(
        <button key={item.id} onClick={()=>setActive(item.id)} style={{flex:1,padding:"10px 4px 12px",border:"none",background:"transparent",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",gap:3,transition:"opacity 0.15s",opacity:active===item.id?1:0.45}}>
          <span style={{fontSize:20,lineHeight:1}}>{item.icon}</span>
          <span style={{fontSize:10,fontWeight:active===item.id?700:500,color:active===item.id?COLORS.accentLight:COLORS.muted,letterSpacing:"0.04em"}}>{item.label}</span>
          {active===item.id&&<div style={{width:20,height:2,borderRadius:2,background:COLORS.accent,marginTop:1}}/>}
        </button>
      ))}
    </div>
  );
}

// ── Root App ──────────────────────────────────────────────────────────────────
export default function BindIt(){
  const [cards,setCards]=useState(null);
  const [screen,setScreen]=useState("home");
  const [saved,setSaved]=useState(false);

  useEffect(()=>{ loadCards().then(stored=>setCards(stored||DEMO_CARDS)); },[]);
  useEffect(()=>{
    if(cards===null)return;
    saveCards(cards).then(()=>{ setSaved(true); setTimeout(()=>setSaved(false),1500); });
  },[cards]);

  if(cards===null) return (
    <div style={{minHeight:"100vh",background:COLORS.bg,display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{color:COLORS.muted,fontSize:15}}>Loading your cards…</div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:COLORS.bg,color:COLORS.text,fontFamily:"'Inter',system-ui,sans-serif"}}>
      {/* Header */}
      <div style={{borderBottom:`1px solid ${COLORS.border}`,padding:"16px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,background:COLORS.bg,zIndex:50}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <span style={{fontSize:20,fontWeight:800,letterSpacing:"-0.03em"}}>Bind<span style={{color:COLORS.accent}}>It</span></span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <div style={{width:7,height:7,borderRadius:"50%",background:saved?COLORS.green:COLORS.muted,transition:"background 0.3s"}}/>
          <span style={{fontSize:12,color:COLORS.muted}}>{saved?"Saved":"Live"}</span>
        </div>
      </div>

      {/* Screen content */}
      <div style={{maxWidth:920,margin:"0 auto",padding:"24px 16px 100px"}}>
        {screen==="home"    && <DashboardScreen cards={cards} setCards={setCards} saved={saved}/>}
        {screen==="payoff"  && <PayoffScreen cards={cards}/>}
        {screen==="insights"&& <InsightsScreen cards={cards}/>}
        {screen==="export"  && <ExportScreen cards={cards}/>}
      </div>

      <BottomNav active={screen} setActive={setScreen}/>
    </div>
  );
}