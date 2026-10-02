
(function(){
function boot(){
 const img=document.getElementById("arwVelocityImage");
 const select=document.getElementById("arwVelocityStation");
 if(!img||!select)return;

 function init(){
  if(document.getElementById("arwVelocityPanMap"))return;

  const screen=img.closest(".arw-velocity-screen");
  const box=document.createElement("div");
  box.id="arwVelocityPanMap";
  screen.appendChild(box);

  const map=L.map(box,{
   crs:L.CRS.Simple,
   minZoom:-4,
   maxZoom:4,
   zoomSnap:.25,
   attributionControl:false,
   scrollWheelZoom:true
  });

  let overlay=null;
  let lastStation="";
  let bounds=null;

  function update(){
   if(!img.naturalWidth||!img.naturalHeight)return;

   bounds=[[0,0],[img.naturalHeight,img.naturalWidth]];

   if(!overlay){
    overlay=L.imageOverlay(img.src,bounds).addTo(map);
    img.style.display="none";
   }else{
    overlay.setBounds(bounds);
    overlay.setUrl(img.src);
   }

   if(select.value!==lastStation){
    map.invalidateSize();
    map.fitBounds(bounds);
    lastStation=select.value;
   }
  }

  const Reset=L.Control.extend({
   options:{position:"bottomright"},
   onAdd:function(){
    const button=L.DomUtil.create(
     "button","arw-velocity-reset"
    );
    button.type="button";
    button.textContent="Reset view";
    L.DomEvent.disableClickPropagation(button);
    L.DomEvent.disableScrollPropagation(button);
    button.onclick=()=>{
     if(bounds)map.fitBounds(bounds);
    };
    return button;
   }
  });

  new Reset().addTo(map);
  img.addEventListener("load",update);
  if(img.complete)update();

  window.addEventListener(
   "resize",()=>map.invalidateSize()
  );
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
 script.onerror=()=>console.warn(
  "Zoom library unavailable; original velocity image retained."
 );
 document.head.appendChild(script);
}

if(document.readyState==="loading"){
 document.addEventListener("DOMContentLoaded",boot);
}else{
 boot();
}
})();
