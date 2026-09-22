'use strict';
const $ = id => document.getElementById(id);
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let playing=false,busy=false,score=0,target=0,max=9,min=0,started=0,pauseAt=0,hasStarted=false;
let recognition=null,listening=false,voiceWanted=false,generation=0,nextTimer,retryTimer,reconnects=0;
let audioCtx=null,bgmTimer=null,soundOn=true,bgmGain=null,pendingRound=false;
const activeTones=new Set();
const aliases={0:['0','零','〇','ゼロ','ぜろ','れい','レイ'],1:['1','一','いち','イチ','いっち','壱'],2:['2','二','に','ニ'],3:['3','三','さん','サン'],4:['4','四','よん','ヨン','し','シ'],5:['5','五','ご','ゴ'],6:['6','六','ろく','ロク'],7:['7','七','なな','ナナ','しち','シチ'],8:['8','八','はち','ハチ'],9:['9','九','きゅう','キュウ','く','ク']};
function extractNumbers(text){
 const normalized=text.normalize('NFKC');
 const digits=Array.from(normalized.matchAll(/[0-9]/g),m=>Number(m[0]));
 if(digits.length)return digits;
 const clean=normalized.replace(/[\s。、,.!！?？]/g,'').replace(/(です|だよ)$/,'');
 const exact=[];
 for(const [n,words] of Object.entries(aliases))if(words.includes(clean))exact.push(Number(n));
 if(exact.length)return exact;
 const matches=[];
 for(const [n,words] of Object.entries(aliases))for(const word of words){
  if(/[0-9]/.test(word)||word.length===1&&!/[一二三四五六七八九零〇壱]/.test(word))continue;
  let at=clean.indexOf(word);while(at!==-1){matches.push({at,n:Number(n),length:word.length});at=clean.indexOf(word,at+word.length);}
 }
 matches.sort((a,b)=>a.at-b.at||b.length-a.length);
 return matches.filter((m,i)=>!matches.some((other,j)=>j<i&&m.at>=other.at&&m.at<other.at+other.length)).map(m=>m.n);
}
function parseNumber(text){const numbers=extractNumbers(text);return numbers.length?numbers[numbers.length-1]:null;}
function ensureAudio(){
 if(!soundOn)return null;
 const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return null;
 try{
  if(!audioCtx){audioCtx=new Audio();bgmGain=audioCtx.createGain();bgmGain.gain.value=voiceWanted ? .018 : .055;bgmGain.connect(audioCtx.destination);}
  if(audioCtx.state==='suspended')audioCtx.resume().catch(()=>{});
 }catch{return null;}
 return audioCtx;
}
function tone(frequency,duration=.16,volume=.08,delay=0,type='sine',output=null){
 const ctx=ensureAudio();if(!ctx)return;
 const startAt=ctx.currentTime+delay,osc=ctx.createOscillator(),gain=ctx.createGain();
 osc.type=type;osc.frequency.value=frequency;gain.gain.setValueAtTime(.0001,startAt);gain.gain.exponentialRampToValueAtTime(volume,startAt+.02);gain.gain.exponentialRampToValueAtTime(.0001,startAt+duration);
 osc.connect(gain);gain.connect(output||ctx.destination);osc.isBgm=Boolean(output);activeTones.add(osc);
 osc.onended=()=>{activeTones.delete(osc);osc.disconnect();gain.disconnect();};
 osc.start(startAt);osc.stop(startAt+duration+.03);
}
function bgmPhrase(){if(!soundOn||!playing||score===5||document.hidden||$('dialog').open)return;[261.63,329.63,392,329.63].forEach((note,i)=>tone(note,.42,.5,i*.48,'sine',bgmGain));}
function startBgm(){if(!playing||score===5||document.hidden||$('dialog').open||!ensureAudio()||bgmTimer)return;duckBgm(voiceWanted);bgmPhrase();bgmTimer=setInterval(bgmPhrase,2400);}
function stopBgm(){clearInterval(bgmTimer);bgmTimer=null;for(const osc of activeTones)if(osc.isBgm){try{osc.stop();}catch{}}}
function silenceAudio(){stopBgm();for(const osc of activeTones){try{osc.stop();}catch{}}activeTones.clear();}
function duckBgm(duck){if(!bgmGain||!audioCtx)return;bgmGain.gain.cancelScheduledValues(audioCtx.currentTime);bgmGain.gain.setTargetAtTime(duck ? .018 : .055,audioCtx.currentTime,.08);}
function playSe(kind){if(!soundOn)return;if(kind==='wrong'){tone(196,.18,.055);return;}if(kind==='correct'){tone(523.25,.12,.11);tone(783.99,.2,.1,.1);return;}[523.25,659.25,783.99,1046.5].forEach((note,i)=>tone(note,.28,.1,i*.12));}
function updateSoundButton(){$('sound').textContent=soundOn?'♪ おと ON':'♪ おと OFF';$('sound').setAttribute('aria-pressed',String(soundOn));}
function toggleSound(){soundOn=!soundOn;updateSoundButton();if(soundOn){ensureAudio();if(playing)startBgm();tone(659.25,.14,.08);}else{silenceAudio();if(audioCtx)audioCtx.suspend().catch(()=>{});}}
function progress(){$('progress').innerHTML=Array.from({length:5},(_,i)=>'<span class="dot '+(i<score?'done':'')+'"></span>').join('');$('progress').setAttribute('aria-label',score+' / 5 クリア');}
function mainLabel(){
 $('main').textContent=playing?(voiceWanted?(listening?'■ マイクを とめる':'■ せつぞくちゅう（とめる）'):(Recognition?'● マイクを オン':'すうじを タッチしてね')):(hasStarted?'▶ もういちど あそぶ':'▶ あそぶ');
 $('main').disabled=playing&&(!Recognition||score===5);
 $('main').classList.toggle('listening',voiceWanted);
 if(playing&&score<5&&Recognition)$('main').setAttribute('aria-pressed',String(voiceWanted));
 else $('main').removeAttribute('aria-pressed');
 for(const button of $('numbers').children)button.disabled=!playing||busy;
}
function stopVoice(){voiceWanted=false;generation++;clearTimeout(retryTimer);const old=recognition;recognition=null;listening=false;if(old)old.abort();duckBgm(false);mainLabel();}
function spawn(){busy=false;target=min+Math.floor(Math.random()*(max-min+1));$('target').textContent=target;$('monster').classList.remove('vanish');$('spark').hidden=true;started=performance.now();$('status').textContent='この すうじ、なあに？';mainLabel();}
function start(){stopVoice();clearTimeout(nextTimer);hasStarted=true;pendingRound=false;max=Number($('range').value);min=max===9?0:1;score=0;playing=true;progress();renderNumbers();spawn();startBgm();$('helper').textContent=Recognition?'こえなら マイクを オン。タッチでも OK！':'こえは つかえないよ。すうじを タッチしてね';}
function advanceRound(){if($('dialog').open||document.hidden){pendingRound=true;return;}pendingRound=false;if(score===5){playing=false;busy=false;mainLabel();$('helper').textContent='もういちど？ きょうは おしまいでも いいよ';}else spawn();}
function renderNumbers(){$('numbers').replaceChildren();for(let n=min;n<=max;n++){const b=document.createElement('button');b.className='number';b.textContent=n;b.setAttribute('aria-label',n+' とこたえる');b.onclick=()=>answer(n);$('numbers').append(b);}}
function answer(n){
 if(!playing||busy||document.hidden||$('dialog').open)return;
 if(n!==target){playSe('wrong');$('status').textContent='だいじょうぶ。もう いっかい！';return;}
 busy=true;score++;progress();$('monster').classList.add('vanish');$('spark').hidden=false;
 $('status').textContent=['','できた！ ぽんっ！','いいね！ ぽんっ！','すごい！ ぽんっ！','やったね！ ぽんっ！','5こ できた！ はなまる！'][score];
 playSe(score===5?'clear':'correct');if(score===5){stopVoice();stopBgm();}
 mainLabel();nextTimer=setTimeout(advanceRound,900);
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
  rec.onstart=()=>{if(token!==generation)return;listening=true;duckBgm(true);mainLabel();$('helper').textContent='きいているよ。すうじを つづけて いってね';};
  rec.onresult=e=>{
   if(token!==generation||!voiceWanted)return;
   reconnects=0;
   for(let i=e.resultIndex;i<e.results.length;i++){
    if(consumed.has(i))continue;
    const result=e.results[i];
    if(busy||!playing||$('dialog').open){consumed.add(i);continue;}
    const numbers=extractNumbers(result[0].transcript);
    if(numbers.includes(target)){consumed.add(i);answer(target);}
    else if(result.isFinal){consumed.add(i);if(numbers.length)answer(numbers[numbers.length-1]);else $('status').textContent='もういちど いってみよう';}
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
$('sound').onclick=toggleSound;
$('settings').onclick=()=>{stopVoice();silenceAudio();if(playing)$('helper').textContent='おやすみちゅう。もどったら マイクを オン';pauseAt=performance.now();$('dialog').showModal();};
$('close').onclick=()=>$('dialog').close();$('dialog').addEventListener('close',()=>{started+=performance.now()-pauseAt;if(pendingRound)advanceRound();if(playing){$('helper').textContent='マイクは オフ。オンで さいかいできるよ';startBgm();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopVoice();silenceAudio();if(playing)$('helper').textContent='マイクは オフ。オンで さいかいできるよ';}else {if(pendingRound)advanceRound();if(playing&&soundOn)startBgm();}});
window.addEventListener('pagehide',()=>{stopVoice();silenceAudio();});
function frame(now){if(playing&&!busy&&!$('dialog').open){const t=Math.min(1,Math.max(0,(now-started)/Number($('speed').value)));const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;$('monster').style.transform='translateY('+((1-t)*-25)+'px) scale('+(.66+t*.34)+') rotate('+(reduced?0:Math.sin(now/450)*(1-t)*2)+'deg)';}requestAnimationFrame(frame);}
updateSoundButton();progress();requestAnimationFrame(frame);
