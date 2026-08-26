import { NextResponse } from "next/server";

/**
 * GET /s.js — l'extrait posé sur les sites des clients :
 *   <script src="https://<clozado>/s.js" data-site="<clé de site>" async></script>
 * Cette ligne est le SEUL contrat côté client ; tout le reste vit ici et se
 * met à jour côté Clozado, sans redéploiement chez le client (cache court).
 *
 * Ce qu'il fait : pose un identifiant de visiteur anonyme en première
 * partie (localStorage, repli cookie), envoie la visite de la page avec le
 * referrer et les UTM, expose `clozado.track("simulation_started" |
 * "simulation_completed", { simulator, origin })` pour les simulateurs, et
 * accepte une file `window.clozado.q` remplie avant son chargement. Envoi
 * par sendBeacon en text/plain (pas de pré-vol CORS), repli fetch
 * keepalive. Il ÉCHOUE EN SILENCE : jamais une exception sur la page du
 * client. Version du contrat dans chaque charge (`v: 1`) — additif
 * seulement ; une rupture = un autre numéro servi en parallèle.
 */
// eslint-disable-next-line local/no-visible-text -- du JavaScript servi aux sites des clients, pas un texte d'interface
const SCRIPT = `(function(){try{
var s=document.currentScript;if(!s)return;var site=s.getAttribute('data-site');if(!site)return;
var dOrigin=s.getAttribute('data-origin')||null,dSim=s.getAttribute('data-simulator')||null;
var base='';try{base=new URL(s.src).origin}catch(e){}
var vid=null;try{vid=localStorage.getItem('clozado_vid')}catch(e){}
if(!vid){try{vid=(document.cookie.match(/(?:^|; )clozado_vid=([^;]+)/)||[])[1]||null}catch(e){}}
if(!vid){vid='v'+Date.now().toString(36)+Math.random().toString(36).slice(2,12);try{localStorage.setItem('clozado_vid',vid)}catch(e){}try{document.cookie='clozado_vid='+vid+'; path=/; max-age=31536000; SameSite=Lax'}catch(e){}}
function utm(){var p={};try{var q=new URLSearchParams(location.search);['utm_source','utm_medium','utm_campaign'].forEach(function(k){var v=q.get(k);if(v)p[k]=String(v).slice(0,200)})}catch(e){}return p}
function send(kind,data){try{
var e={kind:kind,visitor_id:vid,occurred_at:new Date().toISOString(),page_url:String(location.href.split('#')[0]).slice(0,2048),referrer:String(document.referrer||'').slice(0,2048)};
var u=utm();for(var k in u)e[k]=u[k];if(dOrigin)e.origin=dOrigin;if(dSim)e.simulator=dSim;
if(data){['origin','simulator','page_url'].forEach(function(k){if(data[k]!=null)e[k]=String(data[k]).slice(0,2048)})}
var body=JSON.stringify({v:1,site:site,events:[e]});var url=base+'/api/events';
if(navigator.sendBeacon){navigator.sendBeacon(url,new Blob([body],{type:'text/plain'}))}
else{fetch(url,{method:'POST',body:body,headers:{'Content-Type':'text/plain'},keepalive:true,mode:'cors'}).catch(function(){})}
}catch(e){}}
var q=(window.clozado&&window.clozado.q)||[];
window.clozado={v:1,visitorId:vid,track:function(kind,data){if(kind==='simulation_started'||kind==='simulation_completed')send(kind,data)}};
send('visit');for(var i=0;i<q.length;i++){try{window.clozado.track.apply(null,q[i])}catch(e){}}
}catch(e){}})();`;

export async function GET() {
  return new NextResponse(SCRIPT, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300, must-revalidate",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
