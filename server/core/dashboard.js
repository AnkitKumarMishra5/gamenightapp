// Game Night — © 2026 Ankit Kumar Mishra. All rights reserved. See LICENSE.
// The owner's usage dashboard: one self-contained HTML page, no build step, no assets,
// readable on a phone. Everything it shows comes from core/analytics.js.
import { RANGES } from './analytics.js';


// The person reading this dashboard lives in IST, so every clock on it does too,
// wherever the server happens to be running.
const IST = 'Asia/Kolkata';
const istTime = (t) => new Date(t).toLocaleTimeString('en-IN', { timeZone: IST, hour12: false });
const istDate = (t) => new Date(t).toLocaleDateString('en-CA', { timeZone: IST });

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// "3m", "4h", "6d" — a duration short enough to sit in a table cell.
function ago(ms) {
  const min = Math.round(ms / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hours = Math.round(min / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

// A person's pseudonym, rendered as a link to their row further down the page. This is
// the thread that ties an activity line to the device it came from.
const chip = (id) => (id
  ? `<a class="pid ${id.startsWith('A-') ? 'anon' : ''}" href="#${esc(id)}" title="${
    id.startsWith('A-') ? 'No browser id, grouped by IP + browser for one day only' : 'Same browser, tracked across days'
  }">${esc(id)}</a>`
  : '<span class="pid off">, </span>');

const TYPE_LABEL = {
  visit: 'opened the app',
  room_created: 'created a room',
  room_joined: 'joined a room',
  room_rejoined: 'rejoined',
  game_started: 'started a game',
  game_finished: 'finished a game',
  left: 'closed the tab',
};

export function statsPage(s, live, { range = 'all', token = '', nonce = '' } = {}) {
  const t = s.totals;
  const m = s.metrics;
  const roomCount = live.length;
  const online = live.reduce((n, r) => n + r.connected, 0);
  const qs = (r) => `?range=${r}${token ? `&token=${encodeURIComponent(token)}` : ''}`;

  const bars = (rows, total) => (rows.length
    ? rows.map(([label, n]) => `<div class="row"><span class="lbl">${esc(label)}</span>
        <span class="bar"><i style="width:${Math.max(3, Math.round((n / Math.max(total, 1)) * 100))}%"></i></span>
        <span class="num">${n}</span></div>`).join('')
    : '<p class="muted">Nothing in this period.</p>');

  const stat = (label, value, note = '') => `<div class="stat"><b>${value}</b><span>${esc(label)}</span>${
    note ? `<em>${esc(note)}</em>` : ''}</div>`;

  const showDate = range !== 'day';
  const peakDay = Math.max(1, ...s.perDay.map((d) => d.visits));

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Game Night, usage</title>
<style>
  :root{color-scheme:dark;--ink:#eef0ff;--dim:#a7abce;--faint:#6b6f96;--line:rgba(255,255,255,.08)}
  *{box-sizing:border-box}
  body{margin:0;padding:24px 20px 60px;background:#0b0e1a;color:var(--ink);
       font:15px/1.5 ui-sans-serif,system-ui,-apple-system,sans-serif}
  h1{font-size:22px;margin:0 0 4px}
  h2{font-size:13px;text-transform:uppercase;letter-spacing:1.4px;color:var(--faint);
     margin:34px 0 10px;display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
  h2 small{text-transform:none;letter-spacing:0;font-size:12px;color:var(--faint);font-weight:400}
  a{color:inherit}
  .muted{color:var(--faint)}

  /* range tabs */
  nav{display:flex;gap:6px;flex-wrap:wrap;margin:16px 0 4px}
  nav a{padding:6px 14px;border-radius:99px;border:1px solid var(--line);font-size:13px;
        text-decoration:none;color:var(--dim);background:rgba(255,255,255,.03)}
  nav a:hover{background:rgba(255,255,255,.07);color:var(--ink)}
  nav a[aria-current]{background:linear-gradient(90deg,#8b5cf6,#6366f1);color:#fff;
                      border-color:transparent;font-weight:700}

  .stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-top:16px}
  .stat{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);
        border-radius:14px;padding:14px}
  .stat b{display:block;font-size:26px;font-weight:800;line-height:1.1}
  .stat span{font-size:12px;color:var(--dim);display:block;margin-top:2px}
  .stat em{font-style:normal;font-size:11px;color:var(--faint);display:block;margin-top:4px}

  .row{display:flex;align-items:center;gap:10px;margin:5px 0}
  .lbl{width:150px;font-size:13px;color:var(--dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .bar{flex:1;height:8px;background:rgba(255,255,255,.08);border-radius:99px;overflow:hidden}
  .bar i{display:block;height:100%;background:linear-gradient(90deg,#8b5cf6,#22d3ee)}
  .num{width:44px;text-align:right;font-weight:700;font-size:13px}

  /* trend */
  .trend{display:flex;align-items:flex-end;gap:3px;height:74px;padding:0 2px;
         border-bottom:1px solid var(--line)}
  .trend div{flex:1;min-width:3px;background:linear-gradient(180deg,#8b5cf6,#4c1d95);
             border-radius:3px 3px 0 0;position:relative}
  .trend div:hover{background:linear-gradient(180deg,#22d3ee,#0e7490)}
  .trend-axis{display:flex;justify-content:space-between;font-size:11px;color:var(--faint);margin-top:6px}

  /* tables */
  .scroll{overflow-x:auto;-webkit-overflow-scrolling:touch}
  table{width:100%;border-collapse:collapse;font-size:12.5px}
  th{text-align:left;font-size:10.5px;letter-spacing:1px;text-transform:uppercase;
     color:var(--faint);font-weight:700;padding:0 10px 7px;white-space:nowrap;
     border-bottom:1px solid rgba(255,255,255,.14)}
  td{padding:7px 10px;border-bottom:1px solid rgba(255,255,255,.06);vertical-align:middle}
  /* The notes column is the only free-text one; keep it from stretching a row to three
     lines and knocking the table out of rhythm. */
  #activity td:last-child{max-width:260px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  tbody tr:hover{background:rgba(255,255,255,.035)}
  .eid{color:var(--faint);font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;white-space:nowrap}
  .when{white-space:nowrap;color:var(--dim)}
  .when small{display:block;color:var(--faint);font-size:10.5px}
  .who b{color:var(--ink)}
  .nowrap{white-space:nowrap}
  .num-cell{text-align:right;font-variant-numeric:tabular-nums}

  .pill{display:inline-block;border-radius:99px;padding:2px 9px;font-size:11px;font-weight:700;
        white-space:nowrap;background:rgba(139,92,246,.2);border:1px solid rgba(139,92,246,.4)}
  .pill.visit{background:rgba(148,163,184,.14);border-color:rgba(148,163,184,.3);color:#cbd5e1}
  .pill.room_created{background:rgba(52,211,153,.16);border-color:rgba(52,211,153,.4);color:#6ee7b7}
  .pill.room_joined{background:rgba(34,211,238,.14);border-color:rgba(34,211,238,.35);color:#67e8f9}
  .pill.room_rejoined{background:rgba(34,211,238,.09);border-color:rgba(34,211,238,.22);color:#a5f3fc}
  .pill.game_started{background:rgba(251,191,36,.16);border-color:rgba(251,191,36,.4);color:#fcd34d}
  .pill.game_finished{background:rgba(244,114,182,.15);border-color:rgba(244,114,182,.38);color:#f9a8d4}
  .pill.left{background:rgba(148,163,184,.09);border-color:rgba(148,163,184,.2);color:#94a3b8}

  .pid{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;font-weight:700;
       text-decoration:none;color:#c4b5fd;background:rgba(139,92,246,.14);
       border:1px solid rgba(139,92,246,.3);border-radius:6px;padding:1px 6px;white-space:nowrap}
  .pid:hover{background:rgba(139,92,246,.3);color:#fff}
  .pid.anon{color:#94a3b8;background:rgba(148,163,184,.1);border-color:rgba(148,163,184,.22)}

  .tag{font-size:10.5px;font-weight:700;border-radius:5px;padding:1px 6px;white-space:nowrap}
  .tag.core{background:rgba(251,191,36,.18);color:#fcd34d}
  .tag.repeat{background:rgba(52,211,153,.16);color:#6ee7b7}
  .tag.returned{background:rgba(34,211,238,.14);color:#67e8f9}
  .tag.new{background:rgba(139,92,246,.16);color:#c4b5fd}
  .tag.peeked{background:rgba(148,163,184,.12);color:#94a3b8}

  tr:target{background:rgba(139,92,246,.18);outline:1px solid rgba(139,92,246,.5)}

  /* filter bar */
  .tools{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px}
  .tools input,.tools select{background:rgba(255,255,255,.06);border:1px solid var(--line);
    color:var(--ink);border-radius:9px;padding:7px 11px;font:inherit;font-size:13px}
  .tools input{flex:1;min-width:180px}
  .tools input:focus,.tools select:focus{outline:none;border-color:rgba(139,92,246,.6)}
  .count{font-size:12px;color:var(--faint)}

  /* live rooms */
  details.room{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);
               border-radius:12px;margin-bottom:8px;overflow:hidden}
  details.room summary{cursor:pointer;padding:11px 14px;display:flex;flex-wrap:wrap;
                       align-items:center;gap:12px;font-size:13.5px;list-style:none}
  details.room summary::-webkit-details-marker{display:none}
  details.room summary::before{content:'▸';color:var(--faint);font-size:11px;transition:transform .15s}
  details.room[open] summary::before{transform:rotate(90deg)}
  details.room summary:hover{background:rgba(255,255,255,.03)}
  .code{font-weight:800;letter-spacing:2px;font-size:15px}
  .who-count{color:#34d399;font-weight:700;font-size:12px}
  .phase{color:var(--dim);font-size:12px}
  .age{margin-left:auto;color:var(--faint);font-size:11.5px}
  details.room table{margin:0}
  details.room .scroll{padding:0 6px 10px}
  .on{color:#34d399;font-size:12px;white-space:nowrap}
  .off{color:#fbbf24;font-size:12px;white-space:nowrap}

  /* funnel */
  .funnel{display:flex;flex-direction:column;gap:6px}
  .fn{display:flex;align-items:center;gap:12px;font-size:13px}
  .fn .step{width:150px;color:var(--dim)}
  .fn .track{flex:1;height:26px;background:rgba(255,255,255,.05);border-radius:7px;overflow:hidden;position:relative}
  .fn .fill{height:100%;background:linear-gradient(90deg,#8b5cf6,#22d3ee);
            display:flex;align-items:center;padding-left:9px;font-size:11.5px;font-weight:800;color:#0b0e1a}
  .fn .drop{width:74px;text-align:right;font-size:11.5px;color:var(--faint)}

  /* hour histogram */
  .hours{display:flex;align-items:flex-end;gap:2px;height:52px}
  .hours div{flex:1;background:linear-gradient(180deg,#22d3ee,#0e7490);border-radius:2px 2px 0 0;min-height:2px}
  .hours-axis{display:flex;justify-content:space-between;font-size:10.5px;color:var(--faint);margin-top:5px}

  footer{margin-top:40px;padding-top:16px;border-top:1px solid var(--line);
         color:var(--faint);font-size:12px;line-height:1.7}
  code{background:rgba(255,255,255,.07);padding:1px 5px;border-radius:4px;font-size:11.5px}
  @media (max-width:600px){ body{padding:16px 12px 50px} .lbl{width:104px} }
nav .danger { margin-left: auto; background: #3a1520; color: #ff9c9c; border: 1px solid #7a2030; border-radius: 8px; padding: 4px 10px; cursor: pointer; }
</style></head><body>

<h1>🎭 Game Night, usage</h1>
<p class="muted">${plural(roomCount, 'room')} open · ${plural(online, 'player')} connected ·
  server up ${Math.round(process.uptime() / 60)} min</p>

<nav>${Object.entries(RANGES).map(([key, r]) => `<a href="${qs(key)}"${
  key === range ? ' aria-current="page"' : ''}>${esc(r.label)}</a>`).join('')}
  <button id="purge" class="danger" title="Deletes every logged event, local and mirrored. There is no undo.">🗑 Start data over</button></nav>

<div class="stats">
  ${stat('people', t.uniqueVisitors, `${t.repeatPeople} came back`)}
  ${stat('daily active', m.active.dau, `${m.active.wau} this week`)}
  ${stat('monthly active', m.active.mau, `${m.active.stickiness}% stickiness`)}
  ${stat('actually played', `${t.playedShare}%`, 'got into a room')}
  ${stat('return rate', `${t.repeatShare}%`, 'seen on 2+ days')}
  ${stat('games finished', m.play.gamesFinished, `${m.play.completionPct}% of games started`)}
  ${stat('came via invite', `${m.reach.invitePct}%`, `${m.reach.viaInvite} people`)}
  ${stat('installed as app', m.reach.installed, `${m.reach.countries} countries`)}
  ${stat('median session', m.play.medianSessionMin ? `${m.play.medianSessionMin}m` : ', ',
    m.play.medianGameMin ? `${m.play.medianGameMin}m per game` : 'no finished games yet')}
  ${stat('players per game', m.reach.avgPlayersPerRoom, `${m.play.gamesPerRoom} games per room`)}
  ${stat('rooms created', m.reach.rooms)}
  ${stat('online right now', online)}
</div>

<h2>Funnel <small>share of everyone who opened the app</small></h2>
<div class="funnel">${m.funnel.map((f, i) => {
    const prev = i ? m.funnel[i - 1].people : f.people;
    const drop = prev && i ? Math.round(((prev - f.people) / prev) * 100) : 0;
    return `<div class="fn">
    <span class="step">${esc(f.step)}</span>
    <span class="track"><span class="fill" style="width:${Math.max(f.pct, 4)}%">${f.people} · ${f.pct}%</span></span>
    <span class="drop">${i && drop ? `−${drop}% here` : ''}</span>
  </div>`;
  }).join('')}</div>

<h2>Retention <small>of the people first seen that day, how many came back later</small></h2>
${m.retention.length
    ? `<div class="scroll"><table>
    <thead><tr><th>First seen</th><th class="num-cell">New people</th><th class="num-cell">Came back</th><th>Rate</th></tr></thead>
    <tbody>${m.retention.map((c) => `<tr>
      <td class="nowrap">${esc(c.day)}</td>
      <td class="num-cell">${c.size}</td>
      <td class="num-cell">${c.returned}</td>
      <td>${c.size < 10 ? `<span class="muted">${c.pct}% (too few to read into)</span>` : `${c.pct}%`}</td>
    </tr>`).join('')}</tbody></table></div>`
    : '<p class="muted">Nothing in this period.</p>'}

<h2>When people play <small>visits by hour, your clock</small></h2>
<div class="hours">${m.hours.map((n, i) => `<div style="height:${
    Math.max(3, Math.round((n / Math.max(1, ...m.hours)) * 100))}%" title="${
    String(i).padStart(2, '0')}:00 — ${plural(n, 'visit')}"></div>`).join('')}</div>
<div class="hours-axis"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span></div>

<h2>Trend <small>visits per day</small></h2>
${s.perDay.length
    ? `<div class="trend">${s.perDay.map((d) => `<div style="height:${
      Math.max(4, Math.round((d.visits / peakDay) * 100))}%" title="${esc(d.day)}, ${
      plural(d.visits, 'visit')}, ${plural(d.people, 'person', 'people')}, ${
      plural(d.games, 'game')}"></div>`).join('')}</div>
  <div class="trend-axis"><span>${esc(s.perDay[0].day)}</span><span>${
    esc(s.perDay[s.perDay.length - 1].day)}</span></div>`
    : '<p class="muted">Nothing in this period.</p>'}

<h2>Live rooms <small>right now, regardless of the period above</small></h2>
${roomCount === 0 ? '<p class="muted">No rooms open right now.</p>' : live.map((r) => {
    const phase = [r.game, r.phase, r.round ? `round ${r.round}` : ''].filter(Boolean).join(' · ') || 'in the lobby';
    return `<details class="room"${roomCount <= 3 ? ' open' : ''}>
    <summary>
      <span class="code">${esc(r.code)}</span>
      <span class="who-count">${r.connected}/${r.total} here</span>
      <span class="phase">${esc(phase)}</span>
      <span class="age">${r.ageMin}m old${r.idleSec > 60 ? ` · idle ${Math.round(r.idleSec / 60)}m` : ''}</span>
    </summary>
    <div class="scroll"><table>
      <thead><tr><th></th><th>Player</th><th>ID</th><th>Status</th><th class="num-cell">Points</th><th>Joined</th></tr></thead>
      <tbody>${r.players.map((p) => `<tr>
        <td>${esc(p.avatar)}</td>
        <td class="who"><b>${esc(p.name)}</b>${p.host ? ' <span class="pill">owner</span>' : ''}</td>
        <td>${chip(p.person)}</td>
        <td>${p.connected ? '<span class="on">● connected</span>' : '<span class="off">● disconnected</span>'}</td>
        <td class="num-cell">${p.points}</td>
        <td class="nowrap">${p.joinedMinAgo}m ago</td>
      </tr>`).join('')}</tbody>
    </table></div>
  </details>`;
  }).join('')}

<h2>Activity <small>${plural(s.activity.length, 'event')} · newest first</small></h2>
<div class="tools">
  <input id="q" type="search" placeholder="Filter by name, ID, room, event…" autocomplete="off">
  <select id="kind">
    <option value="">All events</option>
    ${Object.entries(TYPE_LABEL).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('')}
  </select>
  <span class="count" id="count"></span>
</div>
<div class="scroll"><table id="activity">
  <thead><tr>
    <th>#</th><th>When</th><th>Event</th><th>Person</th><th>Name</th>
    <th>Room</th><th>Game</th><th class="num-cell">Players</th><th>Result</th>
    <th>Device</th><th>Browser</th><th>Where</th><th>Source</th><th>Notes</th>
  </tr></thead>
  <tbody>${s.activity.map((e) => `<tr data-kind="${esc(e.type)}">
    <td class="eid">${esc(e.id)}</td>
    <td class="when">${esc(istTime(e.t))}${
    showDate ? `<small>${esc(istDate(e.t))}</small>` : ''}</td>
    <td><span class="pill ${esc(e.type)}">${esc(TYPE_LABEL[e.type] || e.type)}</span></td>
    <td>${chip(e.person)}</td>
    <td class="who">${e.name ? `<b>${esc(e.name)}</b>` : '<span class="muted">, </span>'}</td>
    <td class="nowrap">${e.code ? `<b>${esc(e.code)}</b>` : '<span class="muted">, </span>'}</td>
    <td class="nowrap">${esc(e.game || '')}</td>
    <td class="num-cell">${e.players ?? ''}</td>
    <td class="nowrap">${esc(e.result || '')}</td>
    <td class="nowrap">${esc(e.device || '')}</td>
    <td class="nowrap">${esc(e.client || '')}</td>
    <td class="nowrap">${esc(e.place || '')}</td>
    <td class="nowrap">${esc(e.source || '')}</td>
    <td class="muted">${esc(e.detail || '')}</td>
  </tr>`).join('') || '<tr><td colspan="14" class="muted">Nothing in this period.</td></tr>'}</tbody>
</table></div>

<h2>People <small>one row per browser · click an ID above to jump here</small></h2>
<div class="scroll"><table>
  <thead><tr>
    <th>ID</th><th>Standing</th><th>Names used</th>
    <th class="num-cell">Days</th><th class="num-cell">Visits</th><th class="num-cell">Sessions</th>
    <th class="num-cell">Time</th><th class="num-cell">Rooms</th><th class="num-cell">Games</th>
    <th>Found us via</th><th>Device</th><th>Model</th><th>Browser</th><th>Screen</th>
    <th>Where</th><th>Hardware</th><th>Prefers</th><th>First seen</th><th>Last seen</th>
  </tr></thead>
  <tbody>${s.people.map((p) => `<tr id="${esc(p.id)}">
    <td>${chip(p.id)}</td>
    <td><span class="tag ${esc(p.status.key)}">${esc(p.status.label)}</span>${
    p.automated ? ' <span class="tag peeked">bot</span>' : ''}</td>
    <td class="who">${p.names.length ? `<b>${esc(p.names.join(', '))}</b>` : '<span class="muted">no name yet</span>'}</td>
    <td class="num-cell">${p.activeDays}</td>
    <td class="num-cell">${p.visits}</td>
    <td class="num-cell">${p.sessions}</td>
    <td class="num-cell nowrap">${p.secondsOnSite ? `${Math.round(p.secondsOnSite / 6) / 10}m` : ', '}</td>
    <td class="num-cell">${p.rooms}</td>
    <td class="num-cell">${p.gamesStarted}</td>
    <td class="nowrap">${esc(p.source || 'direct')}</td>
    <td class="nowrap">${esc([p.device, p.os && p.osVersion ? `${p.os} ${p.osVersion}` : p.os]
    .filter(Boolean).join(' · '))}</td>
    <td class="nowrap">${esc(p.model || '')}</td>
    <td class="nowrap">${esc(p.browser && p.browserVersion ? `${p.browser} ${p.browserVersion}` : p.browser || '')}</td>
    <td class="nowrap muted">${esc([p.resolution, p.dpr ? `@${p.dpr}x` : '', p.orientation]
    .filter(Boolean).join(' '))}</td>
    <td class="nowrap muted">${esc([p.country, p.tz, p.lang].filter(Boolean).join(' · '))}</td>
    <td class="nowrap muted">${esc([p.cores ? `${p.cores} cores` : '', p.memoryGb ? `${p.memoryGb}GB` : '',
    p.arch, p.network, p.touch ? 'touch' : ''].filter(Boolean).join(' · '))}</td>
    <td class="nowrap muted">${esc([p.theme, p.installed ? 'installed' : '', p.saveData ? 'data saver' : '',
    p.viaInvite ? 'invited' : ''].filter(Boolean).join(' · '))}</td>
    <td class="nowrap muted">${esc(ago(Date.now() - p.first))}</td>
    <td class="nowrap muted">${esc(ago(Date.now() - p.last))}</td>
  </tr>`).join('') || '<tr><td colspan="19" class="muted">Nobody yet.</td></tr>'}</tbody>
</table></div>

<h2>Device</h2>${bars(s.devices, t.visits)}
<h2>Operating system</h2>${bars(s.os, t.visits)}
<h2>Browser</h2>${bars(s.browsers, t.visits)}
<h2>Screen size</h2>${bars(s.screens, t.visits)}
<h2>Games played</h2>${bars(s.games, t.gamesStarted)}
<h2>Players by name</h2>${bars(s.players, t.visits)}
<h2>Came from</h2>${bars(s.referrers, t.visits)}
<h2>Country</h2>${bars(s.countries, t.visits)}
<h2>Timezone</h2>${bars(s.timezones, t.visits)}
<h2>Language</h2>${bars(s.languages, t.visits)}
<h2>Connection</h2>${bars(s.networks, t.visits)}
<h2>Screen resolution</h2>${bars(s.resolutions, t.visits)}
<h2>Colour scheme</h2>${bars(s.themes, t.visits)}

<footer>
  <b>P-…</b> is one browser, followed across days by a random id it made up itself and
  keeps in localStorage. Never a name, an account or an IP, and clearing site data makes
  that person a new stranger. <b>A-…</b> means no such id arrived (a bot, a link preview,
  a crawler); those are grouped by a hash of IP + browser that is re-salted every day, so
  they cannot be followed past midnight. No raw IP is ever written down.<br>
  Display names are recorded because players choose them. Nothing typed inside a game is
  recorded, and there are no cookies or third-party trackers.<br>
  History survives restarts via <code>.data/usage.jsonl</code>; the same lines go to your
  host's log stream. JSON for the same view: <code>/admin/stats.json${qs(range)}</code>.
</footer>

<script nonce="${nonce}">
  // The wipe asks twice, because there is no undo on either store.
  document.getElementById('purge').addEventListener('click', async () => {
    if (!confirm('Delete ALL usage data, including the remote mirror? No undo.')) return;
    if (!confirm('Really sure? This clears every event ever logged.')) return;
    const r = await fetch('/admin/purge?token=${encodeURIComponent(token)}', { method: 'POST' });
    alert(r.ok ? 'Wiped. Reloading.' : 'Purge failed.');
    if (r.ok) location.reload();
  });
  // Filtering happens in the page so it stays instant and never costs a round trip.
  const rows = [...document.querySelectorAll('#activity tbody tr')];
  const q = document.getElementById('q');
  const kind = document.getElementById('kind');
  const count = document.getElementById('count');
  function apply() {
    const needle = q.value.trim().toLowerCase();
    const want = kind.value;
    let shown = 0;
    for (const tr of rows) {
      const ok = (!want || tr.dataset.kind === want)
        && (!needle || tr.textContent.toLowerCase().includes(needle));
      tr.hidden = !ok;
      if (ok) shown++;
    }
    count.textContent = shown === rows.length ? '' : shown + ' of ' + rows.length + ' shown';
  }
  q.addEventListener('input', apply);
  kind.addEventListener('change', apply);

  // Auto-refresh, but never while someone is mid-filter or reading a specific row.
  setInterval(() => {
    if (q.value || kind.value || location.hash) return;
    location.reload();
  }, 30000);
</script>
</body></html>`;
}
