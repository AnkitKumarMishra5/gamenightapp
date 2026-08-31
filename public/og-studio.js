
const V = {
  'home-1': { bg:1, h:'Deal your friends in.', s:'Five party games. One five-letter code.', chips:['Free','No downloads','2–16 players'],
    art:'<div class="fan"><div class="pc" style="transform:translateX(-50%) rotate(-16deg)"></div><div class="pc" style="transform:translateX(-50%) rotate(-2deg)"></div><div class="pc face" style="transform:translateX(-50%) rotate(12deg)">42</div></div>' },
  'home-2': { bg:2, h:'Game night, no excuses.', s:'Every phone becomes a seat at the table.', chips:['Nothing to install','No accounts','Works everywhere'],
    art:'<div class="fan"><div class="pc" style="transform:translateX(-50%) rotate(-12deg)"></div><div class="pc face" style="transform:translateX(-50%) rotate(6deg)">🃏</div></div>' },
  'home-3': { bg:3, h:'Your table is ready.', s:'Bluff, deduce, and keep your nerve — live with friends.', chips:['Blend In','Island Rules','Silent Order','Swap or Stay','Sleepless','+ more coming'],
    art:'<div class="fan"><div class="pc" style="transform:translateX(-50%) rotate(-14deg)"></div><div class="pc" style="transform:translateX(-50%) rotate(0deg)"></div><div class="pc face" style="transform:translateX(-50%) rotate(14deg)">🌙</div></div>' },
  'invite-1': { bg:2, h:'You’ve been dealt a seat.', s:'A friend set the table. The code is in this message.', chips:['Tap to sit down'],
    art:'<div class="fan"><div class="pc face" style="transform:translateX(-50%) rotate(8deg)">YOU</div></div>' },
  'invite-2': { bg:3, h:'A chair just opened up.', s:'Game night is starting without you. Fix that.', chips:['No download','Just the code'],
    art:'<div class="seat"><div class="halo">🪑</div><p>RESERVED</p></div>' },
  'invite-3': { bg:1, h:'The table is waiting.', s:'Cards are shuffled, candles lit. One seat left.', chips:['Tap to join the room'],
    art:'<div class="fan"><div class="pc" style="transform:translateX(-50%) rotate(-10deg)"></div><div class="pc face" style="transform:translateX(-50%) rotate(9deg)">🕯️</div></div>' },
};
V['home-4'] = { bg:2, h:'Bluff. Deduce. Survive.', s:'Five games where the fun is reading your friends\u2019 faces.', chips:['Blend In','Island Rules','Silent Order','Swap or Stay','Sleepless','+ more coming'],
  art:'<div class="fan"><div class="pc" style="transform:translateX(-50%) rotate(-18deg)"></div><div class="pc" style="transform:translateX(-50%) rotate(-4deg)"></div><div class="pc face" style="transform:translateX(-50%) rotate(10deg)">🕵️</div></div>' };
V['invite-4'] = { bg:1, h:'Someone picked you.', s:'Out of everyone they know, they sent this to you. No pressure.', chips:['Tap to join'],
  art:'<div class="fan"><div class="pc face" style="transform:translateX(-50%) rotate(-6deg)">🫵</div></div>' };
V['invite-5'] = { bg:2, h:'Cards on the table.', s:'Your friends are mid-shuffle. Sit down before the deal.', chips:['No download','No sign-up'],
  art:'<div class="fan"><div class="pc" style="transform:translateX(-50%) rotate(-15deg)"></div><div class="pc" style="transform:translateX(-50%) rotate(-1deg)"></div><div class="pc face" style="transform:translateX(-50%) rotate(13deg)">🂡</div></div>' };
V['invite-6'] = { bg:3, h:'One code. One night.', s:'Everything you need to join is already in this message.', chips:['See you inside'],
  art:'<div class="seat"><div class="halo">🎟️</div><p>ADMIT ONE</p></div>' };
V['home-5'] = { bg:3, h:'Five games. One code.', s:'Bluff, deduce, gamble and survive \u2014 live from every phone at the table.', chips:['Free','2\u201316 players','Points all night'],
  art:'<div class="fan"><div class="pc" style="transform:translateX(-50%) rotate(-16deg)"></div><div class="pc" style="transform:translateX(-50%) rotate(-2deg)"></div><div class="pc face" style="transform:translateX(-50%) rotate(12deg)">5</div></div>' };
V['home-6'] = { bg:1, h:'Wake the group chat up.', s:'Turn \u201Cwe should hang out\u201D into an actual game night. Tonight.', chips:['No installs','No accounts','Just a code'],
  art:'<div class="seat"><div class="halo">\uD83D\uDCE3</div><p>GAME NIGHT</p></div>' };
V['invite-7'] = { bg:1, h:'Your seat is getting cold.', s:'The room is live, the cards are warm, and the code is in this message.', chips:['Warm it up'],
  art:'<div class="seat"><div class="halo">\uD83D\uDD25</div><p>SEAT: YOURS</p></div>' };
V['invite-8'] = { bg:2, h:'Drop everything.', s:'Five minutes from now you could be accusing your best friend of lying.', chips:['Tap to join','No download'],
  art:'<div class="fan"><div class="pc" style="transform:translateX(-50%) rotate(-12deg)"></div><div class="pc face" style="transform:translateX(-50%) rotate(8deg)">\uD83D\uDE0F</div></div>' };
V['invite-9'] = { bg:3, h:'This is your sign.', s:'A room code, your friends, zero downloads. Come ruin somebody\u2019s bluff.', chips:['Admit one'],
  art:'<div class="seat"><div class="halo">\uD83C\uDFAD</div><p>TONIGHT ONLY</p></div>' };
V['invite-10'] = { bg:1, h:'Table for you.', s:'Reserved under your name. Everyone is stalling until you arrive.', chips:['Claim your chair'],
  art:'<div class="fan"><div class="pc" style="transform:translateX(-50%) rotate(-9deg)"></div><div class="pc face" style="transform:translateX(-50%) rotate(10deg)">VIP</div></div>' };
const key = new URLSearchParams(location.search).get('v') || 'home-1';
const v = V[key];
document.getElementById('bg').style.backgroundImage = `url(/media/backdrop-${v.bg}.jpg)`;
document.getElementById('h').textContent = v.h;
document.getElementById('s').textContent = v.s;
document.getElementById('c').innerHTML = v.chips
  .map(t => `<span class="chip${t.startsWith('+') ? ' more' : ''}">${t}</span>`).join('');
document.getElementById('art').innerHTML = v.art;
