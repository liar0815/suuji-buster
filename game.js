'use strict';
const $ = id => document.getElementById(id);
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let playing=false,busy=false,score=0,target=0,max=9,min=0,started=0,pauseAt=0;
let recognition=null,listening=false,voiceWanted=false,generation=0,nextTimer,retryTimer,reconnects=0;
const aliases={0:['0','零','〇','ゼロ','ぜろ','れい','レイ'],1:['1','一','いち','イチ','いっち','壱'],2:['2','二','に','ニ'],3:['3','三','さん','サン'],4:['4','四','よん','ヨン','し','シ'],5:['5','五','ご','ゴ'],6:['6','六','ろく','ロク'],7:['7','七','なな','ナナ','しち','シチ'],8:['8','八','はち','ハチ'],9:['9','九','きゅう','キュウ','く','ク']};
function parseNumber(text){const clean=text.normalize('NFKC').replace(/[\s。、,.!！?？]/g,'').replace(/(です|だよ)$/,'');for(const [n,words] of Object.entries(aliases))if(words.includes(clean))return Number(n);return null;}
function progress(){$('progress').innerHTML=Array.from({length:5},(_,i)=>'<span class="dot '+(i<score?'done':'')+'"></span>').join('');$('progress').setAttribute('aria-label',score+' / 5 クリア');}
function mainLabel(){
 $('main').textContent=playing?(voiceWanted?(listening?'■ マイクを とめる':'■ せつぞくちゅう（とめる）'):(Recognition?'● マイクを オン':'すうじを タッチしてね')):'▶ もういちど あそぶ';
 $('main').disabled=playing&&(!Recognition||score===5);
 $('main').classList.toggle('listening',voiceWanted);
 $('main').setAttribute('aria-pressed',String(voiceWanted));
}
function stopVoice(){voiceWanted=false;generation++;clearTimeout(retryTimer);const old=recognition;recognition=null;listening=false;if(old)old.abort();mainLabel();}
function spawn(){busy=false;target=min+Math.floor(Math.random()*(max-min+1));$('target').textContent=target;$('monster').classList.remove('vanish');$('spark').hidden=true;started=performance.now();$('status').textContent='この すうじ、なあに？';mainLabel();}
function start(){stopVoice();clearTimeout(nextTimer);max=Number($('range').value);min=max===9?0:1;score=0;playing=true;progress();renderNumbers();spawn();$('helper').textContent=Recognition?'マイクを オンにすると、つづけて こたえられるよ':'このブラウザでは タッチで あそべるよ';}
function renderNumbers(){$('numbers').replaceChildren();for(let n=min;n<=max;n++){const b=document.createElement('button');b.className='number';b.textContent=n;b.setAttribute('aria-label',n+' とこたえる');b.onclick=()=>answer(n);$('numbers').append(b);}}
function answer(n){
 if(!playing||busy||$('dialog').open)return;
 if(n!==target){$('status').textContent='だいじょうぶ。もう いっかい！';return;}
 busy=true;score++;progress();$('monster').classList.add('vanish');$('spark').hidden=false;
 $('status').textContent=['','できた！ ぽんっ！','いいね！ ぽんっ！','すごい！ ぽんっ！','やったね！ ぽんっ！','5こ できた！ はなまる！'][score];
 if(score===5)stopVoice();
 mainLabel();nextTimer=setTimeout(()=>{if(score===5){playing=false;busy=false;mainLabel();$('helper').textContent='もういちど？ きょうは おしまいでも いいよ';}else spawn();},900);
}
function voiceFailed(message){stopVoice();$('helper').textContent=message;}
function connectVoice(){
 if(!voiceWanted||recognition||!playing||score===5||document.hidden||$('dialog').open)return;
 const token=++generation;
 try{
  const rec=new Recognition();recognition=rec;
  rec.lang='ja-JP';rec.interimResults=true;rec.continuous=true;rec.maxAlternatives=1;
  // Prevent a delayed final result from scoring the same utterance twice.
  const consumed=new Set();
  rec.onstart=()=>{if(token!==generation)return;listening=true;mainLabel();$('helper').textContent='きいているよ。すうじを つづけて いってね';};
  rec.onresult=e=>{
   if(token!==generation||!voiceWanted)return;
   reconnects=0;
   for(let i=e.resultIndex;i<e.results.length;i++){
    if(consumed.has(i))continue;
    const result=e.results[i];
    if(busy||!playing||$('dialog').open){consumed.add(i);continue;}
    const n=parseNumber(result[0].transcript);
    if(n===target){consumed.add(i);answer(n);}
    else if(result.isFinal){consumed.add(i);if(n!==null)answer(n);else $('status').textContent='もういちど いってみよう';}
   }
  };
  rec.onerror=e=>{
   if(token!==generation)return;
   if(e.error==='no-speech')return;
   voiceFailed(e.error==='not-allowed'||e.error==='service-not-allowed'?'マイクが つかえないよ。タッチで あそぼう':'マイクが とまったよ。オンで やりなおせるよ');
  };
  rec.onend=()=>{
   if(token!==generation)return;
   recognition=null;listening=false;mainLabel();
   if(!voiceWanted)return;
   if(++reconnects>3){voiceFailed('マイクが とまったよ。オンで やりなおせるよ');return;}
   $('helper').textContent='マイクを つなぎなおしているよ';
   retryTimer=setTimeout(connectVoice,250*reconnects);
  };
  rec.start();
 }catch{voiceFailed('マイクが つかえないよ。タッチで あそぼう');}
}
function listen(){if(voiceWanted){stopVoice();$('helper').textContent='マイクは オフ。タッチでも あそべるよ';return;}if(!Recognition||!playing||score===5)return;voiceWanted=true;reconnects=0;mainLabel();connectVoice();}
$('main').onclick=()=>playing?listen():start();
$('settings').onclick=()=>{stopVoice();$('helper').textContent='マイクは オフ。もどったら オンにしてね';pauseAt=performance.now();$('dialog').showModal();};
$('close').onclick=()=>$('dialog').close();$('dialog').addEventListener('close',()=>{started+=performance.now()-pauseAt;});
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopVoice();$('helper').textContent='マイクは オフ。オンで さいかいできるよ';}});
window.addEventListener('pagehide',()=>stopVoice());
function frame(now){if(playing&&!busy&&!$('dialog').open){const t=Math.min(1,Math.max(0,(now-started)/Number($('speed').value)));const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;$('monster').style.transform='translateY('+((1-t)*-25)+'px) scale('+(.66+t*.34)+') rotate('+(reduced?0:Math.sin(now/450)*(1-t)*2)+'deg)';}requestAnimationFrame(frame);}
progress();requestAnimationFrame(frame);