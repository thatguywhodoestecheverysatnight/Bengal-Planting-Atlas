const fs=require('fs'), vm=require('vm');
const src=['src/data-env.js','src/data-species.js','src/engine.js'].map(f=>fs.readFileSync(f,'utf8')).join('\n');
const ctx={console, Math, Date, Object, Array, String, Number, JSON};
vm.createContext(ctx);
vm.runInContext(src+`
;globalThis.__run = runPipeline; globalThis.__species=SPECIES; globalThis.__cp=CONTROL_POINTS;`, ctx);
const run=ctx.__run;
function show(name, input){
  const r=run(input);
  const s=r.site;
  console.log('\n=== '+name+' ===');
  console.log(`station ${s.station} (${s.stationKm.toFixed(1)} km) lu=${s.lu} micro=${s.micro} tidal=${s.tidal}`);
  console.log(`P=${s.p.toFixed(0)} HI=${s.hiMax.toFixed(1)} pH=${s.ph.toFixed(2)} Ks=${s.ksEff.toFixed(3)} WT=${s.wt.toFixed(2)} EC=${s.ec.toFixed(2)} slope=${s.sl.toFixed(1)} Tmin=${s.tmin.toFixed(1)} PM=${s.pm.toFixed(0)} inu=${s.inu.toFixed(2)}`);
  console.log('sev  : '+r.criteria.map(c=>c.short+'='+c.s.toFixed(1)).join(' '));
  console.log('w    : '+r.criteria.map((c,i)=>c.short+'='+r.ahp.w[i].toFixed(3)).join(' '));
  console.log(`lambda=${r.ahp.raw.lambda.toFixed(3)} CI=${r.ahp.raw.cons.ci.toFixed(3)} CR=${r.ahp.raw.cons.cr.toFixed(3)} repaired=${r.ahp.repaired} final CR=${r.ahp.cons.cr.toFixed(3)}`);
  for (const st of ['tree','shrub','ground']){
    const list=r.strata[st];
    const sel=list.filter(e=>e.status==='selected');
    console.log(`${st}: ${sel.length} selected | `+list.slice(0,8).map(e=>`${e.sp.id}:${e.ssi.toFixed(3)}${e.status!=='selected'?'('+e.status[0]+')':''}`).join(' '));
  }
  const scr=r.evals.filter(e=>e.status==='screened').slice(0,6).map(e=>`${e.sp.id}:${e.ssi.toFixed(2)}`).join(' ');
  console.log('screened: '+scr);
  const L=r.layout; const m=L.metrics;
  console.log(`layout ${L.W.toFixed(0)}x${L.H.toFixed(0)} m trees=${m.treeCount} shrubs=${m.shrubCount} canopy=${m.canopyPct.toFixed(0)}% ssiDens=${m.ssiDensity.toFixed(2)} mounds=${m.moundVol.toFixed(0)} m3 flood=${L.floodProne} CO2 stock=${(m.co2Stock/1000).toFixed(1)} t, ${(m.co2Year/1000).toFixed(2)} t/yr APTI=${m.aptiMean&&m.aptiMean.toFixed(1)}`);
  const mix={}; L.placed.forEach(p=>{mix[p.sp.id]=(mix[p.sp.id]||0)+1}); console.log('mix: '+JSON.stringify(mix));
  const w=r.window; console.log(`window ${w.start.toDateString()} .. ${w.end.toDateString()} target ${w.target.toDateString()} onset ${w.onset.toDateString()}`);
  return r;
}
const base={areaHa:2.5, shape:'compact', lu:'auto', micro:'auto', tidal:'auto', includeAir:false};
show('Bidhannagar (paper, base 8 criteria)', {...base, lat:22.583, lon:88.417, lu:'urban', zone:'newall'});
show('Bidhannagar with air criterion', {...base, lat:22.583, lon:88.417, lu:'urban', includeAir:true, zone:'newall'});
show('Gosaba Sundarbans', {...base, lat:22.16, lon:88.80});
show('Darjeeling', {...base, lat:27.041, lon:88.263});
show('Ayodhya Hills Purulia', {...base, lat:23.19, lon:86.10});
show('Digha', {...base, lat:21.63, lon:87.51});
show('Durgapur air', {...base, lat:23.52, lon:87.312, includeAir:true});
show('Alipurduar Dooars', {...base, lat:26.485, lon:89.522});
show('Nadia Krishnanagar', {...base, lat:23.405, lon:88.502});
show('Random interior point (Bankura-Bardhaman)', {...base, lat:23.40, lon:87.55});
