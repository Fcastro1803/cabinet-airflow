const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const W = 900, H = 560, dpr = window.devicePixelRatio || 1;
cv.width = W*dpr; cv.height = H*dpr; ctx.scale(dpr,dpr);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const on = id => document.getElementById(id).checked;
const clamp = (v,a,b) => Math.max(a, Math.min(b, v));
const IN = '#3aa0ff', OUT = '#ff6a3a';

// Geometría (en px del dibujo). Todo se recalcula con layout() cuando cambia el tamaño del gabinete;
// los objetos se modifican en el lugar para que el resto del código siga apuntando a los mismos.
const CASE = {};
const MOBO = {w:550, h:350};
const GPU = {w:390, h:38};
const HS = {w:60, h:130};   // disipador de torre del CPU: aletas horizontales, el aire lo cruza de frente hacia atrás
const PSU = {w:350, h:50};
const STOCK = {w:50, h:60}; // disipador de fábrica: bajo, con el ventilador mirando a la placa
const PUMP = {w:30, h:40};  // bloque/bomba de la líquida
const cpuPush = {r:55, a:0}; // empuja aire hacia las aletas
const cpuPull = {r:55, a:0}; // segundo ventilador: tira del aire al salir
const R = 50;                // radio de un ventilador de gabinete
const WALLS = {};            // paredes donde se puede montar un ventilador; n = normal hacia adentro
const SLOTS = {};            // tapas de las ranuras PCI libres en la pared trasera, debajo del bracket de la GPU
const SIZES = {mini:[620,440], mid:[740,440], full:[800,500]};
function layout(w, h){
  Object.assign(CASE, {x:Math.round((W-w)/2), y:Math.round((H-h)/2), w, h});
  const right = CASE.x+w, top = CASE.y, bottom = CASE.y+h;
  // La placa madre se atornilla arriba-atrás: el CPU y el slot PCIe quedan siempre a la misma distancia de esa esquina.
  Object.assign(MOBO, {x:right-570, y:top+40});
  Object.assign(HS, {x:right-140, y:top+70});
  Object.assign(STOCK, {x:right-135, y:top+100});
  Object.assign(PUMP, {x:right-125, y:top+110});
  // La GPU va en el slot PCIe: su chapa (bracket) queda atornillada a la pared trasera y la tarjeta se extiende hacia el frente
  Object.assign(GPU, {x:right-390, y:top+275});
  Object.assign(PSU, {x:right-350, y:bottom-50}); // fuente abajo, contra la pared trasera
  Object.assign(cpuPush, {x:HS.x-8, y:HS.y+HS.h/2});
  Object.assign(cpuPull, {x:HS.x+HS.w+8, y:HS.y+HS.h/2});
  Object.assign(SLOTS, {y0:GPU.y+GPU.h+14, y1:PSU.y-4});
  WALLS.front  = {v:true,  c:CASE.x, a:top+R,       b:bottom-R,  nx:1,  ny:0};
  WALLS.rear   = {v:true,  c:right,  a:top+R,       b:GPU.y-R,   nx:-1, ny:0}; // debajo están las ranuras PCI
  WALLS.top    = {v:false, c:top,    a:CASE.x+R,    b:right-R,   nx:0,  ny:1};
  WALLS.bottom = {v:false, c:bottom, a:CASE.x+R,    b:PSU.x-R,   nx:0,  ny:-1}; // termina donde empieza la fuente
}
const SIZE_KEY = 'flujo-gabinete-tamano';
let caseSize = {preset:'mid', w:740, h:440};
try{ const sv = JSON.parse(localStorage.getItem(SIZE_KEY)); if(sv && sv.w && sv.h) caseSize = sv; }catch(e){}
caseSize.w = clamp(+caseSize.w, 620, 800); caseSize.h = clamp(+caseSize.h, 440, 500);
layout(caseSize.w, caseSize.h);
const stockFan = {a:0};
const val = id => document.getElementById(id).value;
const cooler = () => val('cooler');
const cpuBody = () => cooler().startsWith('tower') ? HS : cooler()==='stock' ? STOCK : PUMP;
const solids = () => [GPU, cpuBody(), PSU];

// Modelos con su consumo aproximado a carga máxima (W)
const GPU_MODELS = [['GTX 1650',75],['GTX 1660 Super',125],['RX 570',150],['RX 580',185],['RX 590',225],['RX 5700 XT',225],
  ['RX 6600',132],['RX 6700 XT',230],['RX 7600',165],['RX 7800 XT',263],['RTX 2060',160],['RTX 3060',170],['RTX 3070',220],
  ['RTX 4060',115],['RTX 4070',200],['RTX 4080',320],['RTX 4090',450]];
const CPU_MODELS = [['Core i3-12100',75],['Core i5-12400',90],['Core i5-13600K',180],['Core i7-12700K',190],['Core i9-13900K',253],
  ['Ryzen 5 3600',88],['Ryzen 5 5600',76],['Ryzen 5 7600',88],['Ryzen 7 5800X',142],['Ryzen 7 7800X3D',90],['Ryzen 9 7950X',230]];
function fillModels(id, list, def){
  const sel = document.getElementById(id), inp = document.getElementById(id.slice(0,3)+'w');
  sel.innerHTML = list.map(([n,w]) => `<option value="${w}"${n===def?' selected':''}>${n} (~${w} W)</option>`).join('')
    + '<option value="otro">Otro (ingresar watts)</option>';
  sel.addEventListener('change', () => inp.hidden = sel.value !== 'otro');
}
fillModels('gpumodel', GPU_MODELS, 'RTX 3060');
fillModels('cpumodel', CPU_MODELS, 'Ryzen 5 5600');
const watts = k => { const v = val(k+'model'); return clamp(+(v==='otro' ? val(k+'w') : v) || 0, 0, 600); };
// Temperatura de los componentes (0 = frío, 1 = muy caliente), misma escala de color que el aire.
// ponytail: modelo térmico simplificado (potencia fija vs. calor que se lleva cada partícula), no son °C reales
const temp = {cpu:0.3, gpu:0.3};
// cuánto se enfría el componente por cada unidad de calor que se lleva una partícula (= tamaño del disipador)
const CAP = {cpu:0.012, gpu:0.03};
const CPU_CAP = {stock:0.006, tower1:0.012, tower2:0.012, aio:0.013};
const GPU_CAP = {1:0.022, 2:0.03, 3:0.036};   // más ventiladores = tarjeta más larga, disipador más grande
const GPU_EFF = {1:0.45, 2:0.6, 3:0.7};
function exchange(p, k, eff){
  const q = eff*(temp[k]-p.t);
  p.t = clamp(p.t+q, T0, 1);
  temp[k] = clamp(temp[k]-q*CAP[k], T0, 1);
}
// GPU de diseño abierto, ventiladores en la cara inferior: aspiran desde abajo y el aire caliente sale disperso dentro del gabinete
const GPU_FAN_X = {1:[GPU.w/2], 2:[105,285], 3:[70,195,320]};
let gpuFans = [];
function buildGpuFans(){ const n = val('gpufancount'); gpuFans = GPU_FAN_X[n].map(x => ({x:GPU.x+x, y:GPU.y+GPU.h+7, r:n==='3'?52:60, a:0})); }
buildGpuFans();
document.getElementById('gpufancount').addEventListener('change', buildGpuFans);

function place(f, wall, pos){
  const w = WALLS[wall]; pos = clamp(pos, w.a, w.b);
  f.wall = wall; f.pos = pos;
  if(w.v){ f.x = w.c; f.y = pos; } else { f.x = pos; f.y = w.c; }
}
function nearestWall(m){
  let best = null;
  for(const [k,w] of Object.entries(WALLS)){
    const pos = clamp(w.v ? m.y : m.x, w.a, w.b);
    const d = w.v ? Math.hypot(m.x-w.c, m.y-pos) : Math.hypot(m.x-pos, m.y-w.c);
    if(!best || d < best.d) best = {wall:k, pos, d};
  }
  return best;
}
const overlaps = f => fans.some(o => o!==f && o.wall===f.wall && Math.abs(o.pos-f.pos) < 2*R+4);

// 3 frontales de entrada, 1 trasero y 2 superiores de salida, ubicados según el tamaño actual
const defaultFans = () => [
  {wall:'front',pos:CASE.y+90,mode:'in'},{wall:'front',pos:CASE.y+220,mode:'in'},{wall:'front',pos:CASE.y+350,mode:'in'},
  {wall:'rear',pos:CASE.y+90,mode:'out'},
  {wall:'top',pos:CASE.x+CASE.w-480,mode:'out'},{wall:'top',pos:CASE.x+CASE.w-300,mode:'out'},
];
const KEY = 'flujo-gabinete-fans';
let fans = [];
function load(list){
  for(const f of fans) f.removed = true;
  fans = [];
  for(const s of list){
    if(!WALLS[s.wall]) continue;
    const f = {mode: s.mode==='out' ? 'out' : 'in', a:0};
    place(f, s.wall, +s.pos);
    if(!overlaps(f)) fans.push(f);
  }
}
function save(){ try{ localStorage.setItem(KEY, JSON.stringify(fans.map(({wall,pos,mode})=>({wall,pos,mode})))); }catch(e){} }
try{ load(JSON.parse(localStorage.getItem(KEY)) || defaultFans()); }catch(e){ load(defaultFans()); }

let msgTimer;
function flash(t){ const m = document.getElementById('msg'); m.textContent = t; clearTimeout(msgTimer); msgTimer = setTimeout(()=>m.textContent='', 2500); }

function addFan(mode){
  const order = mode==='in' ? ['front','bottom','top','rear'] : ['top','rear','front','bottom'];
  for(const wall of order){
    const w = WALLS[wall];
    for(let p = w.a; p <= w.b; p += 5){
      const f = {mode, a:0}; place(f, wall, p);
      if(!overlaps(f)){ fans.push(f); save(); return; }
    }
  }
  flash('No queda espacio libre en las paredes del gabinete.');
}
document.getElementById('addIn').onclick = () => addFan('in');
document.getElementById('addOut').onclick = () => addFan('out');
document.getElementById('reset').onclick = () => { load(defaultFans()); save(); };

// ---- tamaño del gabinete ----
function resizeCase(w, h){
  // cada ventilador conserva su pared y su posición relativa sobre ella
  const old = fans.map(f => { const wl = WALLS[f.wall]; return {wall:f.wall, mode:f.mode, frac:(f.pos-wl.a)/((wl.b-wl.a)||1)}; });
  layout(w, h); buildGpuFans(); // el aire que ya circula se acomoda solo a las paredes nuevas (no se borra, para no cortar el enfriamiento)
  for(const f of fans) f.removed = true;
  fans = [];
  let lost = 0;
  for(const o of old){
    const wl = WALLS[o.wall], f = {mode:o.mode, a:0};
    place(f, o.wall, wl.a + clamp(o.frac,0,1)*(wl.b-wl.a));
    if(overlaps(f)){
      let ok = false;
      for(let q = wl.a; q <= wl.b && !ok; q += 5){ place(f, o.wall, q); ok = !overlaps(f); }
      if(!ok){ lost++; continue; }
    }
    fans.push(f);
  }
  save();
  try{ localStorage.setItem(SIZE_KEY, JSON.stringify(caseSize)); }catch(e){}
  if(lost) flash(lost===1 ? 'Se quitó 1 ventilador: no entra en este gabinete.' : `Se quitaron ${lost} ventiladores: no entran en este gabinete.`);
}
{
  const sel = document.getElementById('casesize'), box = document.getElementById('customsize');
  const rw = document.getElementById('casew'), rh = document.getElementById('caseh');
  // los deslizadores muestran el tamaño relativo a una media torre
  const showVals = () => {
    document.getElementById('casewv').textContent = Math.round(rw.value/740*100) + '%';
    document.getElementById('casehv').textContent = Math.round(rh.value/440*100) + '%';
  };
  sel.value = caseSize.preset; rw.value = caseSize.w; rh.value = caseSize.h;
  box.hidden = caseSize.preset !== 'custom'; showVals();
  sel.addEventListener('change', () => {
    box.hidden = sel.value !== 'custom';
    if(sel.value !== 'custom'){ [rw.value, rh.value] = SIZES[sel.value]; showVals(); }
    caseSize = {preset:sel.value, w:+rw.value, h:+rh.value};
    resizeCase(caseSize.w, caseSize.h);
  });
  for(const r of [rw, rh]) r.addEventListener('input', () => {
    showVals(); caseSize = {preset:'custom', w:+rw.value, h:+rh.value}; resizeCase(caseSize.w, caseSize.h);
  });
}

// ---- arrastrar y soltar ----
let drag = null;
function pt(e){
  const r = cv.getBoundingClientRect(), x = (e.clientX-r.left)*W/r.width;
  return {x: mirror ? W-x : x, y:(e.clientY-r.top)*H/r.height};
}
function hit(m){
  return fans.find(f => WALLS[f.wall].v ? Math.abs(m.x-f.x)<18 && Math.abs(m.y-f.y)<R : Math.abs(m.y-f.y)<18 && Math.abs(m.x-f.x)<R);
}
function outside(m){
  const dx = Math.max(CASE.x-m.x, 0, m.x-(CASE.x+CASE.w)), dy = Math.max(CASE.y-m.y, 0, m.y-(CASE.y+CASE.h));
  return Math.hypot(dx,dy);
}
cv.addEventListener('pointerdown', e => {
  const m = pt(e), f = hit(m);
  if(!f) return;
  drag = {f, wall:f.wall, pos:f.pos, sx:m.x, sy:m.y, moved:false, del:false};
  cv.setPointerCapture(e.pointerId); cv.style.cursor = 'grabbing';
});
cv.addEventListener('pointermove', e => {
  const m = pt(e);
  if(!drag){ cv.style.cursor = hit(m) ? 'grab' : 'default'; return; }
  if(Math.hypot(m.x-drag.sx, m.y-drag.sy) > 4) drag.moved = true;
  if(!drag.moved) return;
  drag.del = outside(m) > 40;
  if(drag.del){ drag.f.x = m.x; drag.f.y = m.y; }
  else { const n = nearestWall(m); place(drag.f, n.wall, n.pos); }
});
function endDrag(){
  if(!drag) return;
  const f = drag.f;
  if(!drag.moved){ f.mode = f.mode==='in' ? 'out' : 'in'; }
  else if(drag.del){ f.removed = true; fans = fans.filter(o => o!==f); }
  else if(overlaps(f)){ place(f, drag.wall, drag.pos); flash('Ese lugar ya tiene un ventilador.'); }
  drag = null; cv.style.cursor = 'default'; save();
}
cv.addEventListener('pointerup', endDrag);
cv.addEventListener('pointercancel', () => { if(drag){ place(drag.f, drag.wall, drag.pos); drag = null; } });

// ---- partículas ----
let parts = [], avg = 0.2, radFans = [];
const MAXP = 900;
// Carga de trabajo 0–100% sobre el consumo del modelo; en reposo igual disipa algo (15% del máximo)
const power = k => watts(k) * (0.15 + 0.85*(+val(k+'load'))/100);
// temp.cpu/temp.gpu son la temperatura del disipador. El chip siempre queda más caliente que su disipador,
// tanto más cuanto más consume (resistencia térmica del encapsulado, pasta y base, en °C por watt).
const RJ = {cpu:0.15, gpu:0.10};
// las GPU grandes tienen un chip más grande que reparte mejor el calor: su resistencia por watt es menor
const rj = k => k==='gpu' ? RJ.gpu*Math.pow(170/Math.max(watts('gpu'),30), 0.6) : RJ.cpu;
const chipC = k => Math.min(toC(temp[k]) + power(k)*rj(k), 100);
const chipT = k => (chipC(k)-22)/73;   // en la escala de color
const chipLabel = k => `${Math.round(chipC(k))} °C${chipC(k) >= 95 ? ' (al límite)' : ''}`;
for(const id of ['cpuload','gpuload']){
  const r = document.getElementById(id), o = document.getElementById(id+'v');
  r.addEventListener('input', () => o.textContent = r.value + '%');
}
// Una sola escala de temperatura para aire y componentes: 0 → 22 °C (ambiente), 1 → 95 °C
const toC = t => 22 + 73*t;
const degC = t => Math.round(toC(t));
const KC = 0.000034, KG = 0.000018; // calor que entra al disipador por watt y por cuadro
const T0 = (15-22)/73; // mínimo posible: 15 °C, el ambiente más frío del control
const ambT = () => (+val('ambient')-22)/73;
{ const r = document.getElementById('ambient'), o = document.getElementById('ambientv');
  r.addEventListener('input', () => o.textContent = r.value + ' °C'); }
const pciVent = () => on('pcivent');
// presión positiva: el aire que sobra escapa por las rendijas del gabinete (pared trasera, techo);
// con tapas PCI ventiladas, una parte sale por ellas
const leakPoint = () => {
  if(pciVent() && Math.random() < 0.4) return {x:CASE.x+CASE.w, y:SLOTS.y0+Math.random()*(SLOTS.y1-SLOTS.y0), leak:true};
  return Math.random() < 0.5
    ? {x:CASE.x+CASE.w, y:CASE.y+40+Math.random()*(GPU.y-CASE.y-60), leak:true}
    : {x:CASE.x+CASE.w*(0.3+0.6*Math.random()), y:CASE.y, leak:true};
};
function pickTarget(ins, outs){
  // presión positiva: el aire que sobra escapa por rendijas (ranuras PCI traseras)
  if(!outs.length) return leakPoint();
  const leak = ins.length > outs.length ? (ins.length-outs.length)/ins.length : 0;
  return Math.random() < leak ? leakPoint() : outs[Math.random()*outs.length|0];
}
function inBox(p,b,m=3){ return p.x>b.x-m && p.x<b.x+b.w+m && p.y>b.y-m && p.y<b.y+b.h+m; }

function update(){
  const tAmb = ambT(); // el aire entra a la temperatura del cuarto
  const nIn = fans.filter(f => f.mode==='in').length, nOut = fans.filter(f => f.mode==='out').length;
  const slotsOut = pciVent() && nIn > nOut; // con presión positiva el aire sale por las rejillas PCI
  const ins = fans.filter(f => f.mode==='in' && f!==drag?.f), outs = fans.filter(f => f.mode==='out' && f!==drag?.f);
  if(parts.length < MAXP){
    // con presión positiva los ventiladores de entrada no logran meter todo su caudal (el aire no tiene por dónde salir)
    const flow = outs.length >= ins.length ? 1 : (outs.length+0.5)/ins.length;
    for(const f of ins){
      if(Math.random() > flow) continue;
      const w = WALLS[f.wall], off = (Math.random()*2-1)*(R-8);
      const p = {x:f.x+w.nx*4+(w.v?0:off), y:f.y+w.ny*4+(w.v?off:0), vx:w.nx*2.2, vy:w.ny*2.2, t:tAmb, life:0, ex:pickTarget(ins,outs)};
      if(radFans.includes(f)) exchange(p,'cpu',0.5); // radiador en una entrada: el aire entra ya tibio
      parts.push(p);
    }
    // tapas PCI ventiladas: si la presión no es positiva, los ventiladores de la GPU (que están justo al lado)
    // aspiran aire fresco de afuera a través de las rejillas
    if(pciVent() && nIn <= nOut && Math.random() < 0.25*gpuSpeed)
      parts.push({x:CASE.x+CASE.w-4, y:SLOTS.y0+Math.random()*(SLOTS.y1-SLOTS.y0), vx:-1, vy:0, t:tAmb, life:0, ex:pickTarget(ins,outs)});
    // presión negativa: entra aire sin filtrar por las rendijas del frente y, si están ventiladas, por las tapas PCI de atrás
    for(let i = ins.length; i < outs.length; i++) if(Math.random() < 0.5){
      if(pciVent() && Math.random() < 0.4)
        parts.push({x:CASE.x+CASE.w-4, y:SLOTS.y0+Math.random()*(SLOTS.y1-SLOTS.y0), vx:-1.4, vy:0, t:tAmb, life:0, ex:pickTarget(ins,outs)});
      else
        parts.push({x:CASE.x+4, y:CASE.y+20+Math.random()*(CASE.h-40), vx:1.4, vy:0, t:tAmb, life:0, ex:pickTarget(ins,outs)});
    }
  }
  // potencia que disipan (la GPU un poco más) y una pequeña pérdida por conducción al resto del gabinete
  const c = cooler(), body = cpuBody(), nG = val('gpufancount');
  // velocidad de los ventiladores de la GPU: sigue la curva, pero acelera/frena de a poco como uno real
  const target = on('gpufans') ? curveAt(chipC('gpu')) : 0;
  gpuSpeed += (target-gpuSpeed)*0.03;
  const gEff = GPU_EFF[nG]*(0.2+0.8*gpuSpeed), gPull = 0.15*(0.15+0.85*gpuSpeed);
  // los fabricantes dimensionan el disipador de la GPU según su consumo: una tarjeta de 450 W trae uno mucho más grande
  CAP.cpu = CPU_CAP[c]; CAP.gpu = GPU_CAP[nG] * Math.pow(Math.max(watts('gpu'),30)/170, 0.8);
  // líquida: el calor del CPU sale por el radiador, montado en los ventiladores del techo (o del frente)
  radFans = [];
  if(c==='aio'){
    const live = fans.filter(f => f!==drag?.f);
    radFans = live.filter(f => f.wall==='top');
    if(!radFans.length) radFans = live.filter(f => f.wall==='front');
    if(!radFans.length) radFans = live.slice(0,1);
  }
  // la pérdida por conducción también va hacia la temperatura ambiente
  temp.cpu = clamp(temp.cpu + KC*power('cpu') - 0.0006*(temp.cpu-tAmb), T0, 1);
  temp.gpu = clamp(temp.gpu + KG*power('gpu') - 0.0006*(temp.gpu-tAmb), T0, 1);
  for(const p of parts){
    p.life++;
    if(p.ex.removed || p.ex===drag?.f || (p.ex.mode && p.ex.mode!=='out')) p.ex = pickTarget(ins, outs);
    // si iba a escapar por las tapas PCI pero quedó arriba de la GPU (que le tapa el paso), escapa por las rendijas de más arriba
    if(p.ex.leak && p.ex.y > GPU.y && p.y < GPU.y) p.ex = {x:CASE.x+CASE.w, y:CASE.y+40+Math.random()*(GPU.y-CASE.y-60), leak:true};
    // intercambio pasivo: el aire que roza el componente se lleva algo de calor
    if(inBox(p,GPU,6)) exchange(p,'gpu',0.003);
    if(inBox(p,body,6)) exchange(p,'cpu',0.003);
    // disipador de fábrica: su ventilador sopla sobre la placa y el aire sale hacia los costados
    if(c==='stock' && inBox(p,STOCK,30)){
      exchange(p,'cpu',0.05);
      p.vx += (p.x-(STOCK.x+STOCK.w/2))*0.003; p.vy += (p.y-(STOCK.y+STOCK.h/2))*0.003;
    }
    // torre del CPU: el ventilador aspira, el aire cruza las aletas y sale por detrás
    const two = c==='tower2';
    if(c.startsWith('tower') && p.x > HS.x-8-(two?90:60) && p.x < HS.x && Math.abs(p.y-cpuPush.y) < cpuPush.r){
      p.vx += two ? 0.22 : 0.15; p.vy += (cpuPush.y-p.y)*0.004;
      if(p.x > HS.x-12){
        exchange(p,'cpu', two ? 0.7 : 0.55);
        p.x = HS.x+HS.w+12; p.vx = two ? 2.6 : 1.8; p.vy = (Math.random()-0.5)*0.8;
      }
    }
    if(p.t > tAmb) p.t = Math.max(tAmb, p.t - 0.0006);
    // succión de los ventiladores de la GPU
    // los ventiladores de la GPU generan baja presión debajo de la tarjeta y atraen aire desde el frente
    if(gpuSpeed > 0.02 && !p.gpuDone && p.y > GPU.y+GPU.h-10 && p.x > GPU.x-280 && p.x < GPU.x+GPU.w){
      const f = gpuFans.reduce((a,b) => Math.abs(b.x-p.x) < Math.abs(a.x-p.x) ? b : a);
      const dx = f.x-p.x, dy = f.y-p.y, d = Math.hypot(dx,dy)||1, a = 0.17*(0.3+0.7*gpuSpeed);
      p.vx += dx/d*a; p.vy += dy/d*a;
    }
    if(gpuSpeed > 0.02 && !p.gpuDone && p.y > GPU.y+GPU.h && p.y < GPU.y+GPU.h+70){
      for(const f of gpuFans){
        if(Math.abs(p.x-f.x) > f.r) continue;
        p.vy -= gPull; p.vx += (f.x-p.x)*0.004;
        if(p.y < f.y+4){
          exchange(p,'gpu',gEff); p.gpuDone = true;
          const r = Math.random(), gy = GPU.y + Math.random()*GPU.h;
          if(r < 0.3){ p.x = GPU.x-4; p.y = gy; p.vx = -1.6; p.vy = (Math.random()-0.5)*1.5; }
          else if(r < 0.4){ p.dead = true; p.exitT = p.t; } // una parte sale por las rejillas del bracket, fuera del gabinete
          else { p.x = GPU.x + Math.random()*GPU.w; p.y = GPU.y-4; p.vx = (Math.random()-0.5)*2; p.vy = -1.2; }
        }
        break;
      }
    }
    if(p.dead) continue;
    // el aire caliente sube: si hay salidas superiores, tiende a irse por ahí
    if(p.t-tAmb > 0.55 && !p.hot){
      p.hot = true;
      const tops = outs.filter(f => f.wall==='top');
      if(tops.length && p.ex.wall!=='top' && Math.random() < 0.6) p.ex = tops[Math.random()*tops.length|0];
    }
    const dx = p.ex.x-p.x, dy = p.ex.y-p.y, d = Math.hypot(dx,dy)||1;
    const k = p.life < 25 ? 0.01 : 0.035;
    p.vx += (dx/d*2.1 - p.vx)*k;
    p.vy += (dy/d*2.1 - p.vy)*k;
    p.vy -= (p.t-tAmb)*0.03; // sube según cuánto más caliente está que el cuarto
    p.vx += (Math.random()-0.5)*0.12; p.vy += (Math.random()-0.5)*0.12;
    for(const b of solids()){
      if(inBox({x:p.x+p.vx,y:p.y+p.vy},b,2)){
        const cy = b.y+b.h/2;
        p.vy = (p.y<cy ? -1:1)*Math.max(1.2,Math.abs(p.vy));
        p.vx *= 0.7;
        if(inBox(p,b,0)) p.y += (p.y<cy?-1:1)*2;
      }
    }
    p.x += p.vx; p.y += p.vy;
    // tapas PCI ventiladas: con presión positiva, parte del aire que llega ahí se escapa por las rejillas
    if(slotsOut && p.x > CASE.x+CASE.w-8 && p.y > SLOTS.y0 && p.y < SLOTS.y1 && Math.random() < 0.15){
      p.dead = true; p.exitT = p.t; continue;
    }
    if(Math.hypot(p.x-p.ex.x, p.y-p.ex.y) < 26){
      if(radFans.includes(p.ex)) exchange(p,'cpu',0.5); // radiador en una salida
      p.dead = true; p.exitT = p.t; continue;
    }
    if(p.x < CASE.x+3){ p.x = CASE.x+3; p.vx = Math.abs(p.vx); }
    if(p.x > CASE.x+CASE.w-3){ p.x = CASE.x+CASE.w-3; p.vx = -Math.abs(p.vx)*0.5; }
    if(p.y < CASE.y+3){ p.y = CASE.y+3; p.vy = Math.abs(p.vy); }
    if(p.y > CASE.y+CASE.h-4){ p.y = CASE.y+CASE.h-4; p.vy = -Math.abs(p.vy); }
    if(p.life > 900) p.dead = true;
  }
  let sum=0, n=0;
  for(const p of parts) if(p.dead && p.exitT!==undefined){ sum+=p.exitT; n++; }
  if(n) avg = avg*0.98 + (sum/n)*0.02;
  parts = parts.filter(p => !p.dead);
  for(const f of [...fans, cpuPush, cpuPull, stockFan]) f.a += 0.25;
  for(const f of gpuFans) f.a += 0.35*gpuSpeed;
  const pres = ins.length > outs.length ? 'positiva' : ins.length < outs.length ? 'negativa' : 'neutra';
  // resumen como lista (dt/dd); solo se toca el DOM cuando algo cambió
  const rows = [
    ['Ventiladores de entrada', String(ins.length)],
    ['Ventiladores de salida', String(outs.length)],
    ['Presión', pres[0].toUpperCase() + pres.slice(1)],
    ['CPU', chipLabel('cpu')],
    ['GPU', chipLabel('gpu')],
    ['Ventiladores GPU', `${Math.round(gpuSpeed*100)}%`],
    ['Aire de salida', `${degC(avg)} °C`],
  ];
  const html = rows.map(([k, v]) => `<dt>${k}</dt><dd${v.includes('al límite') ? ' class="hot"' : ''}>${v}</dd>`).join('');
  const statEl = document.getElementById('stat');
  if(statEl.innerHTML !== html) statEl.innerHTML = html;
}

// Escala térmica azul → verde → amarillo → rojo. Se interpola el tono (HSL), no el RGB:
// mezclar RGB de azul a amarillo pasa por gris, que era lo que se veía en el aire tibio.
function col(t){
  t = clamp(t, 0, 1);
  const h = t < 0.5 ? 210 - 162*(t/0.5) : 48 - 44*((t-0.5)/0.5);
  return `hsl(${h|0},95%,55%)`;
}

function drawFan(f, vertical, color, alpha){
  ctx.save(); ctx.translate(f.x, f.y); ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  if(vertical) ctx.fillRect(-6,-f.r,12,f.r*2); else ctx.fillRect(-f.r,-6,f.r*2,12);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
  const s = Math.sin(f.a);
  for(let i=-4;i<=4;i++){
    const o = i*(f.r/5);
    ctx.beginPath();
    if(vertical){ ctx.moveTo(-3,o); ctx.lineTo(3,o+s*4); } else { ctx.moveTo(o,-3); ctx.lineTo(o+s*4,3); }
    ctx.stroke();
  }
  ctx.restore();
}
function drawArrow(f){
  // flecha hacia adentro (entrada) dibujada dentro, hacia afuera (salida) dibujada fuera
  const w = WALLS[f.wall], s = f.mode==='in' ? 1 : -1;
  const dx = w.nx*s, dy = w.ny*s, bx = f.x + dx*16, by = f.y + dy*16;
  ctx.fillStyle = f.mode==='in' ? IN : OUT;
  ctx.beginPath();
  ctx.moveTo(bx+dx*9, by+dy*9);
  ctx.lineTo(bx-dy*7, by+dx*7);
  ctx.lineTo(bx+dy*7, by-dx*7);
  ctx.fill();
}

// La simulación siempre trabaja con el frente a la izquierda; "mirror" solo espeja el dibujo y el puntero.
let mirror = false;
try{ mirror = localStorage.getItem(KEY+'-mirror') === '1'; }catch(e){}
const flipBtn = document.getElementById('flip');
const flipText = () => flipBtn.textContent = mirror ? 'Poner frente a la izquierda' : 'Poner frente a la derecha';
flipText();
flipBtn.onclick = () => { mirror = !mirror; flipText(); try{ localStorage.setItem(KEY+'-mirror', mirror ? '1' : '0'); }catch(e){} };
// texto sin espejar: se dibuja en la posición reflejada, alineado a la derecha para ocupar el mismo lugar
function label(s, x, y){
  ctx.save(); ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.textAlign = mirror ? 'right' : 'left';
  ctx.fillText(s, mirror ? W-x : x, y);
  ctx.restore();
}

function draw(){
  const mute = css('--mute'), line = css('--line'), ink = css('--ink');
  ctx.save();
  if(mirror){ ctx.translate(W,0); ctx.scale(-1,1); }
  ctx.fillStyle = css('--panel'); ctx.fillRect(0,0,W,H);
  ctx.strokeStyle = mute; ctx.lineWidth = 3; ctx.strokeRect(CASE.x,CASE.y,CASE.w,CASE.h);
  ctx.fillStyle = line; ctx.globalAlpha = 0.5; ctx.fillRect(MOBO.x,MOBO.y,MOBO.w,MOBO.h); ctx.globalAlpha = 1;
  ctx.fillStyle = '#39424f'; ctx.fillRect(PSU.x,PSU.y,PSU.w,PSU.h);
  ctx.fillStyle = '#cfd6df'; ctx.font = '12px system-ui'; label('Fuente',PSU.x+10,PSU.y+30);
  // refrigeración del CPU, coloreada por temperatura
  const c = cooler(), body = cpuBody();
  if(c.startsWith('tower')){
    ctx.fillStyle = col(temp.cpu);
    for(let y = HS.y; y < HS.y+HS.h; y += 6) ctx.fillRect(HS.x, y, HS.w, 3);
    ctx.fillStyle = '#7d8794'; ctx.fillRect(HS.x+8, HS.y, 4, HS.h); ctx.fillRect(HS.x+HS.w-12, HS.y, 4, HS.h);
    (c==='tower2' ? [cpuPush, cpuPull] : [cpuPush]).forEach(f => drawFan(f, true, '#8a96a5', 1));
  } else if(c==='stock'){
    ctx.fillStyle = col(temp.cpu); ctx.fillRect(STOCK.x, STOCK.y, STOCK.w, STOCK.h);
    ctx.save(); ctx.translate(STOCK.x+STOCK.w/2, STOCK.y+STOCK.h/2);
    ctx.strokeStyle = '#39424f'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0,0,22,0,6.283); ctx.stroke();
    ctx.rotate(stockFan.a);
    for(let i=0;i<5;i++){ ctx.rotate(1.2566); ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(19,7); ctx.stroke(); }
    ctx.restore();
  } else {
    // radiador junto a sus ventiladores + mangueras hasta la bomba
    ctx.strokeStyle = '#5b6675'; ctx.lineWidth = 4;
    for(const f of radFans){
      const w = WALLS[f.wall];
      const rx = w.v ? f.x + (w.nx>0 ? 8 : -30) : f.x-R, ry = w.v ? f.y-R : f.y + (w.ny>0 ? 8 : -30);
      const rw = w.v ? 22 : 2*R, rh = w.v ? 2*R : 22;
      ctx.beginPath(); ctx.moveTo(PUMP.x+PUMP.w/2, PUMP.y); ctx.lineTo(rx+rw/2, ry+rh/2); ctx.stroke();
      ctx.fillStyle = col(temp.cpu); ctx.fillRect(rx, ry, rw, rh);
      ctx.fillStyle = '#39424f';
      if(w.v) for(let y=ry; y<ry+rh; y+=5) ctx.fillRect(rx, y, rw, 1); else for(let x=rx; x<rx+rw; x+=5) ctx.fillRect(x, ry, 1, rh);
    }
    ctx.fillStyle = col(chipT('cpu')); ctx.fillRect(PUMP.x, PUMP.y, PUMP.w, PUMP.h);
    ctx.strokeStyle = '#39424f'; ctx.lineWidth = 2; ctx.strokeRect(PUMP.x, PUMP.y, PUMP.w, PUMP.h);
  }
  ctx.fillStyle = ink; ctx.font = '12px system-ui'; label(`CPU ${Math.round(chipC('cpu'))} °C`, body.x-6, body.y-10);
  // GPU coloreada por temperatura
  ctx.fillStyle = col(chipT('gpu')); ctx.fillRect(GPU.x,GPU.y,GPU.w,GPU.h);
  ctx.strokeStyle = '#2b323c'; ctx.lineWidth = 2; ctx.strokeRect(GPU.x,GPU.y,GPU.w,GPU.h);
  ctx.fillStyle = '#9aa5b4'; ctx.fillRect(CASE.x+CASE.w-5, GPU.y-10, 5, GPU.h+22); // bracket PCIe
  // tapas de las ranuras PCI libres: con agujeros si están ventiladas
  for(let y = SLOTS.y0; y+16 <= SLOTS.y1; y += 20){
    ctx.fillStyle = '#9aa5b4'; ctx.fillRect(CASE.x+CASE.w-5, y, 7, 16);
    if(pciVent()){ ctx.fillStyle = '#39424f'; for(let k = 2; k < 15; k += 4) ctx.fillRect(CASE.x+CASE.w-3, y+k, 3, 2); }
  }
  ctx.fillStyle = '#10151b'; label(`GPU ${Math.round(chipC('gpu'))} °C`, GPU.x+GPU.w/2-28, GPU.y+24);
  gpuFans.forEach(f => drawFan(f, false, '#ffb13a', gpuSpeed > 0.02 ? 1 : 0.35));
  ctx.fillStyle = ink; ctx.font = '13px system-ui';
  label('FRENTE', CASE.x-4, H-14);
  label('ATRÁS', CASE.x+CASE.w-50, H-14);
  for(const p of parts){
    ctx.fillStyle = col(p.t); ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.arc(p.x,p.y,2.4,0,6.283); ctx.fill();
  }
  ctx.globalAlpha = 1;
  for(const f of fans){
    const del = drag?.f===f && drag.del;
    f.r = R;
    drawFan(f, WALLS[f.wall].v, del ? '#888' : f.mode==='in' ? IN : OUT, del ? 0.5 : 1);
    if(!del) drawArrow(f);
  }
  if(drag?.del){ ctx.fillStyle = '#ff5a3a'; ctx.font = '13px system-ui'; label('Soltá para eliminar', drag.f.x+12, drag.f.y-12); }
  ctx.restore();
}

// ---- curva de ventiladores de la GPU (temperatura °C → velocidad %) ----
let gpuSpeed = 0.5;
const CURVE_KEY = KEY+'-curva';
const CURVE_DEFAULT = [[30,20],[50,35],[65,55],[75,80],[85,100]];
let curve = CURVE_DEFAULT.map(q => [...q]);
try{ const sv = JSON.parse(localStorage.getItem(CURVE_KEY)); if(Array.isArray(sv) && sv.length===5) curve = sv; }catch(e){}
function curveAt(T){
  if(T <= curve[0][0]) return curve[0][1]/100;
  for(let i=1; i<curve.length; i++){
    const [x0,y0] = curve[i-1], [x1,y1] = curve[i];
    if(T <= x1) return (y0 + (y1-y0)*(T-x0)/((x1-x0)||1))/100;
  }
  return curve[curve.length-1][1]/100;
}
const cc = document.getElementById('curve'), cx = cc.getContext('2d');
const CW = 480, CH = 240, PL = 44, PR = 14, PT = 14, PB = 34, TMIN = 30, TMAX = 100;
cc.width = CW*dpr; cc.height = CH*dpr; cx.scale(dpr,dpr);
const sx = T => PL + (T-TMIN)/(TMAX-TMIN)*(CW-PL-PR);
const sy = v => CH-PB - v/100*(CH-PT-PB);
const ix = x => TMIN + (x-PL)/(CW-PL-PR)*(TMAX-TMIN);
const iy = y => (CH-PB-y)/(CH-PT-PB)*100;
let cdrag = -1;
function cpt(e){ const r = cc.getBoundingClientRect(); return {x:(e.clientX-r.left)*CW/r.width, y:(e.clientY-r.top)*CH/r.height}; }
const nearPoint = m => curve.findIndex(([T,v]) => Math.hypot(sx(T)-m.x, sy(v)-m.y) < 12);
cc.addEventListener('pointerdown', e => { cdrag = nearPoint(cpt(e)); if(cdrag >= 0) cc.setPointerCapture(e.pointerId); });
cc.addEventListener('pointermove', e => {
  const m = cpt(e);
  if(cdrag < 0){ cc.style.cursor = nearPoint(m) >= 0 ? 'grab' : 'default'; return; }
  // cada punto queda entre sus vecinos, así la curva nunca se cruza
  const lo = cdrag > 0 ? curve[cdrag-1][0]+1 : TMIN, hi = cdrag < curve.length-1 ? curve[cdrag+1][0]-1 : TMAX;
  curve[cdrag] = [Math.round(clamp(ix(m.x), lo, hi)), Math.round(clamp(iy(m.y), 0, 100))];
});
const endCurve = () => { if(cdrag >= 0){ cdrag = -1; try{ localStorage.setItem(CURVE_KEY, JSON.stringify(curve)); }catch(e){} } };
cc.addEventListener('pointerup', endCurve);
cc.addEventListener('pointercancel', endCurve);
document.getElementById('curveReset').onclick = () => { curve = CURVE_DEFAULT.map(q => [...q]); try{ localStorage.removeItem(CURVE_KEY); }catch(e){} };

function drawCurve(){
  const ink = css('--ink'), mute = css('--mute'), line = css('--line'), panel = css('--panel');
  cx.fillStyle = panel; cx.fillRect(0,0,CW,CH);
  cx.strokeStyle = line; cx.lineWidth = 1; cx.fillStyle = mute; cx.font = '11px system-ui';
  cx.textAlign = 'center';
  for(let T=TMIN; T<=TMAX; T+=10){ cx.beginPath(); cx.moveTo(sx(T),sy(0)); cx.lineTo(sx(T),sy(100)); cx.stroke(); cx.fillText(T+'°', sx(T), CH-PB+16); }
  cx.fillText('Temperatura de la GPU (°C)', (PL+CW-PR)/2, CH-4);
  cx.textAlign = 'right';
  for(let v=0; v<=100; v+=20){ cx.beginPath(); cx.moveTo(sx(TMIN),sy(v)); cx.lineTo(sx(TMAX),sy(v)); cx.stroke(); cx.fillText(v+'%', PL-6, sy(v)+4); }
  cx.strokeStyle = '#ffb13a'; cx.lineWidth = 2.5; cx.beginPath();
  cx.moveTo(sx(TMIN), sy(curve[0][1]));
  for(const [T,v] of curve) cx.lineTo(sx(T), sy(v));
  cx.lineTo(sx(TMAX), sy(curve[curve.length-1][1])); cx.stroke();
  const T = clamp(chipC('gpu'), TMIN, TMAX);
  cx.strokeStyle = col(chipT('gpu')); cx.lineWidth = 1.5; cx.setLineDash([4,4]);
  cx.beginPath(); cx.moveTo(sx(T),sy(0)); cx.lineTo(sx(T),sy(100)); cx.stroke(); cx.setLineDash([]);
  curve.forEach(([Tp,v], i) => {
    cx.fillStyle = i===cdrag ? ink : '#ffb13a'; cx.strokeStyle = panel; cx.lineWidth = 2;
    cx.beginPath(); cx.arc(sx(Tp), sy(v), 6, 0, 6.283); cx.fill(); cx.stroke();
  });
  cx.fillStyle = ink; cx.strokeStyle = '#10151b'; cx.lineWidth = 1.5;
  cx.beginPath(); cx.arc(sx(T), sy(gpuSpeed*100), 4.5, 0, 6.283); cx.fill(); cx.stroke();
  if(cdrag >= 0){
    const [Tp,v] = curve[cdrag];
    cx.textAlign = sx(Tp) > CW-110 ? 'right' : 'left';
    cx.fillText(`${Tp} °C → ${v}%`, sx(Tp) + (sx(Tp) > CW-110 ? -10 : 10), Math.max(sy(v)-10, 12));
  }
}

function loop(){ update(); draw(); drawCurve(); requestAnimationFrame(loop); }
loop();

// ---- tema: Claro / Oscuro / Sistema ----
// El tema guardado ya lo aplica un script en <head> antes de pintar; acá solo se maneja el selector.
// Los canvas leen los colores del tema en cada cuadro, así que no hace falta redibujar nada.
{
  const THEME_KEY = 'flujo-gabinete-tema';
  const root = document.documentElement;
  const btns = [...document.querySelectorAll('[data-theme-opt]')];
  const sysDark = window.matchMedia('(prefers-color-scheme: dark)');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const current = () => root.dataset.theme || 'system';
  const isDark = opt => opt === 'dark' || (opt === 'system' && sysDark.matches);
  const mark = () => btns.forEach(b => b.setAttribute('aria-pressed', String(b.dataset.themeOpt === current())));
  function apply(opt){
    if(opt === 'system') delete root.dataset.theme; else root.dataset.theme = opt;
    try{ opt === 'system' ? localStorage.removeItem(THEME_KEY) : localStorage.setItem(THEME_KEY, opt); }catch(e){}
    mark();
  }
  btns.forEach(b => b.addEventListener('click', () => {
    const opt = b.dataset.themeOpt;
    if(opt === current()) return;
    // anima solo si cambia lo que se ve, el navegador lo soporta y no se pidió reducir movimiento
    const animate = isDark(opt) !== isDark(current()) && document.startViewTransition && !reduce.matches;
    if(!animate){ apply(opt); return; }
    // si se toca otro botón durante la animación, el navegador cancela la anterior: no es un error
    const t = document.startViewTransition(() => apply(opt));
    t.ready.catch(() => {}); t.finished.catch(() => {});
  }));
  mark();
}

// ---- ayuda ----
// <dialog> nativo: showModal() maneja el foco y Esc lo cierra; acá se agrega el ✕ y el clic afuera.
{
  const help = document.getElementById('help');
  const open = () => help.showModal();
  document.getElementById('helpOpen').addEventListener('click', open);
  document.getElementById('helpOpen2').addEventListener('click', open);
  document.getElementById('helpClose').addEventListener('click', () => help.close());
  // un clic en el fondo oscuro llega al propio <dialog>, no a su contenido
  help.addEventListener('click', e => {
    const r = help.getBoundingClientRect();
    if(e.target === help && (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom)) help.close();
  });
}

// ---- ideas para probar: cada botón arma la situación y dice qué mirar ----
// Reusa las mismas funciones y eventos que los controles de la página (load, addFan, eventos change/input).
{
  const help = document.getElementById('help');
  const msg = document.getElementById('tryMsg');
  const setVal = (id, v, ev) => { const el = document.getElementById(id); el.value = v; if(ev) el.dispatchEvent(new Event(ev)); };
  const noTop = () => defaultFans().filter(f => f.wall !== 'top');
  // Cada idea parte de la configuración inicial (respetando la GPU, el CPU y sus cargas) y cambia una sola cosa,
  // así una prueba no arrastra cambios de la anterior y la comparación es justa.
  function baseline(){
    if(val('casesize') !== 'mid') setVal('casesize', 'mid', 'change');
    setVal('ambient', 22, 'input');
    setVal('cooler', 'tower1');
    document.getElementById('pcivent').checked = true;
    curve = CURVE_DEFAULT.map(q => [...q]); try{ localStorage.removeItem(CURVE_KEY); }catch(e){}
    load(defaultFans()); save();
  }
  const TRIES = {
    'sin-techo': {
      run(){ load(noTop()); save(); },
      msg: 'Sin salidas en el techo: mirá cómo sube la temperatura del CPU en el resumen y cómo el aire caliente se acumula arriba.',
    },
    'presion-negativa': {
      run(){ const d = defaultFans(); load([d[0], d[1], d[3], d[4], d[5]]); addFan('out'); document.getElementById('pcivent').checked = false; },
      msg: 'Presión negativa (2 entradas, 4 salidas) con las tapas PCI cerradas: mirá la GPU. Después marcá «Tapas PCI traseras ventiladas» y compará.',
    },
    'curva-silenciosa': {
      run(){ curve = [[30,0],[60,0],[70,25],[80,40],[90,60]]; try{ localStorage.setItem(CURVE_KEY, JSON.stringify(curve)); }catch(e){} },
      msg: 'Curva silenciosa: los ventiladores de la GPU giran más lento. Mirá cuánto sube la GPU; «Restablecer curva» vuelve a la original.',
    },
    'liquida-frente': {
      run(){ setVal('cooler', 'aio'); load(noTop()); save(); },
      msg: 'Líquida con el radiador al frente: el aire entra tibio y la GPU recibe aire más caliente. Tocá «Restablecer» para ponerlo en el techo y comparar.',
    },
    'cuarto-35': {
      run(){ setVal('ambient', 35, 'input'); },
      msg: 'Cuarto a 35 °C: el aire ya entra verde y todo se calienta. Mirá cómo aceleran los ventiladores de la GPU para compensar.',
    },
    'mini-torre': {
      run(){ setVal('casesize', 'mini', 'change'); },
      msg: 'Mini torre: anotá las temperaturas y después elegí «Torre completa» en la lista Gabinete para comparar.',
    },
  };
  let msgTimer;
  document.querySelectorAll('[data-try]').forEach(b => b.addEventListener('click', () => {
    const t = TRIES[b.dataset.try];
    baseline(); t.run();
    help.close();
    msg.textContent = t.msg; msg.hidden = false;
    clearTimeout(msgTimer); msgTimer = setTimeout(() => msg.hidden = true, 15000);
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    msg.scrollIntoView({behavior: smooth ? 'smooth' : 'auto', block: 'start'});
  }));
}
