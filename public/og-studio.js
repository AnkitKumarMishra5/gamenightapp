
const V = {
  'home-1': { bg:1, h:'Deal your friends in.', s:'Five party games. One five-letter code.', chips:['Free','No downloads','2–16 players'],
    art:'<div class="fan"><div class="pc" style="transform:translateX(-50%) rotate(-16deg)"></div><div class="pc" style="transform:translateX(-50%) rotate(-2deg)"></div><div class="pc face" style="transform:translateX(-50%) rotate(12deg)">42</div></div>' },
  'home-2': { bg:2, h:'Game night, no excuses.', s:'Every phone becomes a seat at the table.', chips:['Nothing to install','No accounts','Works everywhere'],
    art:'<div class="fan"><div class="pc" style="transform:translateX(-50%) rotate(-12deg)"></div><div class="pc face" style="transform:translateX(-50%) rotate(6deg)">🃏</div></div>' },
  'home-3': { bg:3, h:'Your table is ready.', s:'Bluff, deduce, and keep your nerve — live with friends.', chips:['Blend In','Island Rules','3 card games'],
    art:'<div class="fan"><div class="pc" style="transform:translateX(-50%) rotate(-14deg)"></div><div class="pc" style="transform:translateX(-50%) rotate(0deg)"></div><div class="pc face" style="transform:translateX(-50%) rotate(14deg)">🌙</div></div>' },
  'invite-1': { bg:2, h:'You’ve been dealt a seat.', s:'A friend set the table. The code is in this message.', chips:['Tap to sit down'],
    art:'<div class="fan"><div class="pc face" style="transform:translateX(-50%) rotate(8deg)">YOU</div></div>' },
  'invite-2': { bg:3, h:'A chair just opened up.', s:'Game night is starting without you. Fix that.', chips:['No download','Just the code'],
    art:'<div class="seat"><div class="halo">🪑</div><p>RESERVED</p></div>' },
  'invite-3': { bg:1, h:'The table is waiting.', s:'Cards are shuffled, candles lit. One seat left.', chips:['Tap to join the room'],
    art:'<div class="fan"><div class="pc" style="transform:translateX(-50%) rotate(-10deg)"></div><div class="pc face" style="transform:translateX(-50%) rotate(9deg)">🕯️</div></div>' },
};
V['home-4'] = { bg:2, h:'Bluff. Deduce. Survive.', s:'Five games where the fun is reading your friends\u2019 faces.', chips:['One room code','Points follow you'],
  art:'<div class="fan"><div class="pc" style="transform:translateX(-50%) rotate(-18deg)"></div><div class="pc" style="transform:translateX(-50%) rotate(-4deg)"></div><div class="pc face" style="transform:translateX(-50%) rotate(10deg)">🕵️</div></div>' };
V['invite-4'] = { bg:1, h:'Someone picked you.', s:'Out of everyone they know, they sent this to you. No pressure.', chips:['Tap to join'],
  art:'<div class="fan"><div class="pc face" style="transform:translateX(-50%) rotate(-6deg)">🫵</div></div>' };
V['invite-5'] = { bg:2, h:'Cards on the table.', s:'Your friends are mid-shuffle. Sit down before the deal.', chips:['No download','No sign-up'],
  art:'<div class="fan"><div class="pc" style="transform:translateX(-50%) rotate(-15deg)"></div><div class="pc" style="transform:translateX(-50%) rotate(-1deg)"></div><div class="pc face" style="transform:translateX(-50%) rotate(13deg)">🂡</div></div>' };
V['invite-6'] = { bg:3, h:'One code. One night.', s:'Everything you need to join is already in this message.', chips:['See you inside'],
  art:'<div class="seat"><div class="halo">🎟️</div><p>ADMIT ONE</p></div>' };
const key = new URLSearchParams(location.search).get('v') || 'home-1';
const v = V[key];
document.getElementById('bg').style.backgroundImage = `url(/media/backdrop-${v.bg}.jpg)`;
document.getElementById('h').textContent = v.h;
document.getElementById('s').textContent = v.s;
document.getElementById('c').innerHTML = v.chips.map(t => `<span class="chip">${t}</span>`).join('');
document.getElementById('art').innerHTML = v.art;
