(function(){
function boot(){
 const img=document.getElementById("arwVelocityImage");
 const select=document.getElementById("arwVelocityStation");
 if(!img||!select)return;

 function init(){
  const screen=img.closest(".arw-velocity-screen");
  const box=document.createElement("div");
  box.id="arwVelocityPanMap";
  screen.appendChild(box);
  img.style.display="none";

  const css=document.createElement("style");
  css.textContent=`
   #arwVelocityPanMap{
    position:absolute;inset:0;height:430px
   }
   .arw-velocity-screen .leaflet-tile{
    background:transparent!important;
    object-fit:fill!important
   }
   .arw-velocity-tools{
    padding:10px;background:#07151e;color:#edf7ff
   }
   .arw-velocity-tools button{
    padding:8px;background:#123b4d;color:white;
    border:1px solid #457488;cursor:pointer
   }
   .arw-velocity-tools button:disabled{opacity:.45}
   .arw-velocity-tools input{
    width:100%;accent-color:#61edd7
   }
   .arw-velocity-tools p{
    font-size:12px;line-height:1.4;margin:6px 0
   }
   .arw-velocity-tools a{color:#83dafa}
  `;
  document.head.appendChild(css);

  const tools=document.createElement("div");
  tools.className="arw-velocity-tools";
  tools.innerHTML=`
   <button id="velPlay" disabled>Play velocity</button>
   <button id="velLatest">Latest scan</button>
   <a id="velLegend" target="_blank" rel="noopener">
    Velocity color legend
   </a>
   <input id="velTimeline" type="range"
    min="0" max="0" value="0" disabled
    aria-label="Velocity scan timeline">
   <p id="velStatus" role="status">
    Loading NOAA base velocity...
   </p>
   <p>Velocity is station-based. Blank areas may lack
    coverage or usable echoes. Radar measurement cells
    remain finite at close zoom.</p>
  `;
  screen.after(tools);

  const get=id=>document.getElementById(id);
  const status=get("velStatus");

  const map=L.map(box,{
   minZoom:3,maxZoom:15,scrollWheelZoom:true
  }).setView([28,-81],6);

  L.tileLayer(
   "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
   {
    maxZoom:19,
    attribution:
     '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
   }
  ).addTo(map);

  map.attributionControl.addAttribution(
   "Base velocity: NOAA/NWS"
  );

  let station="",url="",name="";
  let frames=[],index=0;
  let layer=null,pending=null;
  let timer=null,playing=false,busy=false;
  let generation=0,controller=null;

  function pause(){
   playing=false;
   clearTimeout(timer);
   get("velPlay").textContent="Play velocity";
  }

  function schedule(){
   clearTimeout(timer);
   if(playing&&!document.hidden&&!busy){
    timer=setTimeout(
     ()=>show((index+1)%frames.length),900
    );
   }
  }

  function show(i){
   if(busy||!frames.length)return;
   busy=true;

   const token=generation;
   const time=frames[i];
   let errors=0,done=false;

   const next=L.tileLayer.wms(url,{
    layers:name,
    format:"image/png",
    transparent:true,
    version:"1.1.1",
    time:time,
    opacity:0,
    zIndex:20,
    maxZoom:15
   });
   pending=next;

   const timeout=setTimeout(
    ()=>finish(false),20000
   );

   function finish(ok){
    if(done)return;
    done=true;
    clearTimeout(timeout);

    if(token!==generation){
     map.removeLayer(next);
     return;
    }

    busy=false;
    pending=null;

    if(!ok||errors){
     map.removeLayer(next);
     pause();
     status.textContent=
      "NOAA velocity tiles unavailable. "+
      (layer?"Previous scan retained. ":"")+
      "Use Latest scan to retry.";
     return;
    }

    next.setOpacity(.7);
    if(layer)map.removeLayer(layer);
    layer=next;
    index=i;
    get("velTimeline").value=i;

    const age=Math.max(
     0,Math.round((Date.now()-Date.parse(time))/60000)
    );

    status.textContent=
     "Base velocity scan: "+
     new Date(time).toLocaleString()+
     " | "+age+" min old"+
     (age>20?" | Older scan; check freshness.":"");

    get("velPlay").disabled=frames.length<2;
    schedule();
   }

   next.on("tileerror",()=>errors++);
   next.once("load",()=>finish(true));
   next.addTo(map);
  }

  async function load(){
   pause();
   if(controller)controller.abort();

   const ctrl=new AbortController();
   controller=ctrl;
   const token=++generation;

   if(pending){
    map.removeLayer(pending);
    pending=null;
   }

   busy=false;
   get("velPlay").disabled=true;
   get("velTimeline").disabled=true;

   const code=select.value.split("|")[0].toLowerCase();
   const changed=station!==code;

   if(changed&&layer){
    map.removeLayer(layer);
    layer=null;
   }

   status.textContent="Checking current NOAA scans...";

   const endpoint=
    "https://opengeo.ncep.noaa.gov/geoserver/"+
    code+"/ows";

   const timeout=setTimeout(()=>ctrl.abort(),20000);

   try{
    const response=await fetch(
     endpoint+
     "?service=WMS&version=1.3.0&request=GetCapabilities",
     {cache:"no-store",signal:ctrl.signal}
    );

    if(!response.ok)throw Error("Metadata unavailable");

    const xml=new DOMParser().parseFromString(
     await response.text(),"text/xml"
    );

    if(token!==generation)return;

    const direct=(element,n)=>
     Array.from(element.children)
      .find(child=>child.localName===n);

    const target=Array.from(
     xml.getElementsByTagNameNS("*","Layer")
    ).find(element=>
     direct(element,"Name")?.textContent===
      code+"_sr_bvel"
    );

    if(!target){
     throw Error(
      "Base velocity layer not available for this station"
     );
    }

    const dimension=Array.from(target.children).find(
     element=>
      element.localName==="Dimension"&&
      element.getAttribute("name")==="time"
    );

    if(!dimension)throw Error("Scan timestamps unavailable");

    let times=(dimension.textContent||"")
     .split(",")
     .map(value=>value.trim())
     .filter(value=>
      Number.isFinite(Date.parse(value))&&
      !value.includes("/")
     );

    const latest=dimension.getAttribute("default");
    if(latest&&Number.isFinite(Date.parse(latest))){
     times.push(latest);
    }

    frames=Array.from(
     new Map(
      times.map(value=>[Date.parse(value),value])
     ).values()
    ).sort(
     (a,b)=>Date.parse(a)-Date.parse(b)
    ).slice(-12);

    if(!frames.length)throw Error("No valid scans");

    station=code;
    url=endpoint;
    name=code+"_sr_bvel";

    get("velTimeline").max=frames.length-1;
    get("velTimeline").disabled=false;

    get("velLegend").href=
     endpoint+
     "?service=WMS&version=1.1.1"+
     "&request=GetLegendGraphic"+
     "&format=image/png&layer="+name;

    if(changed){
     const bounds=direct(
      target,"EX_GeographicBoundingBox"
     );

     if(bounds){
      const num=n=>Number(direct(bounds,n).textContent);
      map.setView([
       (num("southBoundLatitude")+
        num("northBoundLatitude"))/2,
       (num("westBoundLongitude")+
        num("eastBoundLongitude"))/2
      ],6);
     }
    }

    show(frames.length-1);

   }catch(error){
    if(token===generation){
     status.textContent=
      "Current base velocity unavailable: "+
      error.message+
      ". Use Latest scan to retry.";
    }
   }finally{
    clearTimeout(timeout);
   }
  }

  get("velPlay").onclick=()=>{
   if(playing){
    pause();
   }else{
    playing=true;
    get("velPlay").textContent="Pause velocity";
    schedule();
   }
  };

  get("velTimeline").oninput=()=>{
   pause();
   show(Number(get("velTimeline").value));
  };

  get("velLatest").onclick=load;
  select.addEventListener("change",load);

  document.getElementById("arwRefreshVelocity")
   ?.addEventListener("click",load);

  setInterval(()=>{
   if(!document.hidden&&!playing&&!busy)load();
  },180000);

  document.addEventListener("visibilitychange",()=>{
   if(document.hidden)pause();
   else load();
  });

  window.addEventListener(
   "resize",()=>map.invalidateSize()
  );

  load();
 }

 if(window.L){
  init();
  return;
 }

 const css=document.createElement("link");
 css.rel="stylesheet";
 css.href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
 document.head.appendChild(css);

 const script=document.createElement("script");
 script.src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
 script.onload=init;
 document.head.appendChild(script);
}

if(document.readyState==="loading"){
 document.addEventListener("DOMContentLoaded",boot);
}else{
 boot();
}
})();