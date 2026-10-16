import { h, button, screenHeader, fmtMoney, attachMenuKeys, clear } from '../dom.js';
import { getTrack, GAME_TRACKS as TRACKS } from '../../data/tracks/index.js';
import { offersFor, getPatron } from '../../data/contracts.js';
import { icon } from '../icons.js';
import { outlineSvg, diffPips } from './trackSelect.js';
import { difficultyOf, difficultyLabel } from '../menuLogic.js';

/**
 * Pure: what the chosen bid will do when the race starts, as one line.
 * Race mode takes it at the start; practice ignores it; a contract already running keeps its place.
 */
export function bidSummary(setup, save) {
  if (save.contract) return 'A contract is already running. It settles after this race.';
  if (!setup.bid) return 'No bid: prize and kill bonus only.';
  const o = offersFor(save).find((x) => x.patron === setup.bid), p = getPatron(setup.bid);
  if (!o || !p) return 'No bid: prize and kill bonus only.';
  const tail = setup.mode === 'race' ? '' : ' Practice ignores bids, so this one is not taken.';
  return `${p.org}: wreck ${o.quota} racer${o.quota > 1 ? 's' : ''} for +${fmtMoney(o.bounty)}, or −${fmtMoney(o.penalty)} if you miss.${tail}`;
}

/**
 * Race setup as a two-step wizard, shown after the track is picked:
 *   1. the bid: take one patron's bid for this race, or decline and race clean
 *   2. the setup: mode, laps, rivals. The chosen bid is taken when START RACE is pressed.
 */
export function createRaceSettingsScreen({ game, flow }) {
  let detach = null;
  const setup = () => game.getRaceSetup();
  const stepLabel = h('span.wizard-step');
  const msg = h('p.msg.muted');
  const say = (t, bad = false) => { msg.textContent = t; msg.classList.toggle('bad', bad); };

  // ---- step 1: the bid
  const boardTrack = h('p.muted.small');
  const running = h('div.panel.contract-active');
  const bidGrid = h('div.contract-grid');
  const declineBtn = button('DECLINE: RACE CLEAN', () => { game.setRaceSetup({ bid: null }); render(); }, 'btn-small btn-decline');
  const pageBid = h('div.wizard-step-body',
    boardTrack, running, bidGrid,
    h('div.bid-decline', declineBtn, h('span.muted.small', 'No bid: prize and kill bonus only.')));

  // ---- step 2: the setup
  const title = h('h2');
  const sub = h('p');
  const hero = h('div.track-hero.panel', title, sub);
  const lapsVal = h('span.big');
  const modeBtns = {};
  const rivalsSw = h('button.switch', { type: 'button', role: 'switch', 'aria-label': 'Include rivals in practice', 'aria-checked': 'false' });
  const rivalsRow = h('div.setting-row', h('label', 'RIVALS IN PRACTICE'), h('div.ctl', rivalsSw));
  const info = h('p.muted');
  const bidLine = h('p.bid-line');
  modeBtns.race = button('RACE', () => { game.setRaceSetup({ mode: 'race' }); render(); }, 'btn-mode btn-small');
  modeBtns.practice = button('PRACTICE', () => { game.setRaceSetup({ mode: 'practice' }); render(); }, 'btn-mode btn-small');
  rivalsSw.addEventListener('click', () => { game.setRaceSetup({ practiceRivals: !setup().practiceRivals }); render(); });
  const pageSetup = h('div.wizard-step-body', h('div.settings-wrap', hero,
    h('div.panel.settings-main',
      h('div.setting-row', h('label', 'MODE'), h('div.ctl', h('div.seg', modeBtns.race, modeBtns.practice))),
      h('div.setting-row', h('label', 'LAPS'), h('div.ctl', button('−', () => { game.setRaceSetup({ laps: Math.max(1, setup().laps - 1) }); render(); }, 'btn-small btn-icon'), lapsVal,
        button('+', () => { game.setRaceSetup({ laps: Math.min(8, setup().laps + 1) }); render(); }, 'btn-small btn-icon'))),
      rivalsRow, info, bidLine, msg)));

  const foot1 = h('footer.screen-foot', button('BACK', () => flow.transition('trackSelect'), 'btn-back'), h('span.spacer'),
    button('NEXT: SETUP', () => goStep(2), 'btn-primary btn-next'));
  const foot2 = h('footer.screen-foot', button('BACK', () => goStep(1), 'btn-back'), h('span.spacer'),
    button('START RACE', start, 'btn-primary btn-start'));
  const el = h('section.screen.screen-settings',
    screenHeader('RACE SETTINGS', 'Take a bid or decline it, then set the race up.', stepLabel),
    h('div.screen-body', pageBid, pageSetup),
    foot1, foot2);

  function goStep(n) {
    pageBid.classList.toggle('hidden', n !== 1);
    pageSetup.classList.toggle('hidden', n !== 2);
    foot1.classList.toggle('hidden', n !== 1);
    foot2.classList.toggle('hidden', n !== 2);
    stepLabel.textContent = n === 1 ? 'STEP 1 OF 2 · THE BID' : 'STEP 2 OF 2 · THE RACE';
    el.querySelector('.screen-body').scrollTop = 0;
  }

  function renderBid() {
    const s = setup(), sv = game.getSave(), t = getTrack(s.trackId), open = sv.contract;
    boardTrack.textContent = `${t.name} · ${t.city}`;
    running.classList.toggle('hidden', !open);
    if (open) {
      const p = getPatron(open.patron);
      running.replaceChildren(h('div.panel-title', 'CONTRACT ALREADY RUNNING'),
        h('p', h('b', p.name), ` · ${p.org}`, h('br'), h('span.muted', `Wreck ${open.quota} racer${open.quota > 1 ? 's' : ''} in this race. It settles when the race ends.`)));
    }
    clear(bidGrid);
    for (const o of offersFor(sv)) {
      const p = getPatron(o.patron);
      const mine = !!open && open.patron === p.id;
      const chosen = s.bid === p.id;
      // picking the chosen bid again clears it, the same as declining
      const accept = button(mine ? 'RUNNING' : chosen ? 'ACCEPTED' : 'ACCEPT', () => { game.setRaceSetup({ bid: chosen ? null : p.id }); render(); },
        'btn-small' + (chosen || mine ? ' btn-primary' : ''));
      accept.disabled = !!open;
      bidGrid.append(h('div.panel.contract-card' + (chosen || mine ? '.taken' : ''),
        h('div.contract-head', icon(p.icon, { size: 26 }), h('div', h('h3', p.name), h('p.small.muted', p.org))),
        h('p.contract-line', `“${p.line}”`),
        h('div.contract-terms',
          h('div.term', h('span.small.muted', 'WRECK'), h('b', `${o.quota} racer${o.quota > 1 ? 's' : ''}`)),
          h('div.term', h('span.small.muted', 'ON THE FLAG'), h('b.good', '+' + fmtMoney(o.bounty))),
          h('div.term', h('span.small.muted', 'IF YOU MISS'), h('b.bad', '−' + fmtMoney(o.penalty)))),
        accept));
    }
    declineBtn.disabled = !!open;
    declineBtn.classList.toggle('on', !s.bid && !open);
  }

  function renderSetup() {
    const s = setup();
    const t = getTrack(s.trackId);
    const i = Math.max(0, TRACKS.findIndex((x) => x.id === t.id));
    title.textContent = t.name.toUpperCase();
    sub.textContent = `${t.city} — ${t.blurb}`;
    hero.replaceChildren(title, h('div.row', diffPips(difficultyOf(i, TRACKS.length)), h('span.muted.small', difficultyLabel(difficultyOf(i, TRACKS.length)))), outlineSvg(t.control, 260, 150), sub);
    lapsVal.textContent = String(s.laps);
    for (const [m, b] of Object.entries(modeBtns)) b.classList.toggle('on', s.mode === m);
    rivalsRow.style.display = s.mode === 'practice' ? '' : 'none';
    rivalsSw.setAttribute('aria-checked', String(!!s.practiceRivals));
    info.textContent = s.mode === 'race' ? `Winner takes ${fmtMoney(t.prize)}. Kills pay a bonus. Damage costs you.` : 'No money, no clock, no mercy for your nerves.';
    bidLine.textContent = bidSummary(s, game.getSave());
  }

  function render() { renderBid(); renderSetup(); }

  /** START RACE: take the chosen bid (race mode only), then load. The choice is spent, so it is cleared. */
  function start() {
    const s = setup();
    if (s.mode === 'race' && s.bid && !game.getSave().contract) {
      const r = game.acceptContract(s.bid);
      if (!r.ok) { say(r.error || 'Cannot take that bid.', true); return; }
    }
    game.setRaceSetup({ bid: null });
    flow.transition('loading');
  }

  return {
    el,
    show() {
      goStep(1);
      say('');
      render();
      detach = attachMenuKeys(el);
    },
    hide() { detach?.(); },
  };
}
