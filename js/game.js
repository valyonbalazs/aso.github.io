/* Map 1: the night forest. Game rules, dog AI, events, HUD and results. */
(function () {
  'use strict';
  window.ASO = window.ASO || {};

  var tr = function (k, v) { return ASO.i18n.t(k, v); };
  var A = ASO.Audio, I = ASO.Input;

  var CFG = {
    TIME: 420, WALK: 3.4, RUN: 5.6, CARRY: 0.72, EYE: 1.65, RADIUS: 0.4,
    STAM: 100, STAM_RUN: 9, STAM_DIG: 13, STAM_REGEN: 16,
    DET_RANGE: 28, DIG_BURIED: 3.4, DIG_LOGS: 2.4, DIG_DEEP: 6.5, DIG_JUNK: 1.6, DIG_DIRT: 1.1,
    STASH_REACH: 2.2, SAFE_REACH: 2.8, JUNK_REACH: 1.8, PILE_REACH: 2.6, VAN_R: 4.4,
    BUFF: 25, SAFE_PENALTY: 6
  };
  var CASES = [], def = null, N = 5, mapIndex = 0, renderer0 = null, basePR0 = 1;
  var SAVE_KEY = 'aso.save';

  var W = null, X = null, mode = 'title', S = null;
  var P = { x: 3, z: -9, yaw: Math.PI, pitch: 0, bob: 0, speed: 0, stepDist: 0 };
  var D = { x: 5, z: -7, yaw: 0, yawT: 0, state: 'lead', target: null, legPhase: 0, moving: false,
            barkT: 0, sniffT: 0, waitBark: 0, angle: 0, stuckT: 0, lx: 0, lz: 0, speed: 0, call: 0 };
  var dirt = { progress: 0 };
  var el = {}, shown = {}, segEls = [];
  var tAll = 0, lastTs = 0, titleAngle = 0, toastT = 0, hudAcc = 0, digSfxT = 0, digObj = null, digLook = 0, detTimer = 0;
  var perf = { n: 0, sum: 0, scale: 1 };
  var lastResult = null, lastCarryHint = -10;
  var Game = { onState: null };

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function dist(a, b) { var dx = a.x - b.x, dz = a.z - b.z; return Math.sqrt(dx * dx + dz * dz); }
  function wrap(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
  function $(id) { return document.getElementById(id); }
  function setText(id, v) {
    if (shown[id] === v) return;
    shown[id] = v;
    var e = el[id] || (el[id] = $(id));
    if (e) e.textContent = v;
  }
  function fmtTime(sec) {
    sec = Math.max(0, Math.ceil(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }
  function num(n) { return ASO.i18n.num(n); }

  /* ---------- state ---------- */
  function newRun() {
    return {
      time: def.time, clock: 0, huf: 0, eur: 0, usd: 0, delivered: 0, lost: 0, carrying: -1,
      digs: 0, boots: 0, ducks: 0, strikes: 0, stamina: CFG.STAM, exhausted: false, digging: false,
      events: [], cow: false, detLevel: 0, dogWaiting: false, buff: 0, vanReady: true, safe: null,
      ach: {}, deepHint: false, posts: [], unread: 0, phone: false, whistleCd: 0
    };
  }
  function later(sec, fn) { S.events.push({ t: S.clock + sec, fn: fn }); }
  function notify(m, data) { if (Game.onState) Game.onState(m, data); }
  function ach(key) { if (S) S.ach[key] = true; }

  function showHud(on) {
    el.hud.classList.toggle('hidden', !on);
    el.touch.classList.toggle('hidden', !(on && I.isTouch));
    el.toast.classList.add('hidden');
    if (!on) el.safegame.classList.add('hidden');
    shown = {};
  }
  function toast(msg, sec) {
    el.toast.textContent = msg;
    el.toast.classList.remove('hidden');
    toastT = sec || 2.8;
  }

  /* ---------- helpers ---------- */
  function nearestStash(from) {
    var best = null, bd = 1e9;
    for (var i = 0; i < W.stashes.length; i++) {
      var s = W.stashes[i];
      if (s.dug) continue;
      var d = dist(from, s);
      if (d < bd) { bd = d; best = s; }
    }
    return best ? { s: best, d: bd } : null;
  }
  function dogSound(kind) {
    var vx = D.x - P.x, vz = D.z - P.z;
    var fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
    var rel = Math.atan2(rx * vx + rz * vz, fx * vx + fz * vz);
    A.dog(kind, Math.sqrt(vx * vx + vz * vz), Math.sin(rel));
  }
  function parkDog() { var vs = W.layout.vanSpots[0]; D.x = vs.x + 5; D.z = vs.z - 6; }
  function pileSfx() { if (def.id === 'farm' || def.id === 'pasture') A.rustle(); else A.logs(); }
  function lockOf(sf) { return sf.obj.lock || { speed: 2.0, zone: 0.45 }; }
  function relAngle(x, z) {
    var vx = x - P.x, vz = z - P.z;
    var fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
    return Math.atan2(rx * vx + rz * vz, fx * vx + fz * vz);
  }

  /* ---------- start / pause / finish ---------- */
  Game.start = function () {
    W.resetWorld();
    S = newRun(); mode = 'playing';
    X.reset();
    P.x = W.start.x; P.z = W.start.z; P.yaw = Math.PI; P.pitch = 0; P.speed = 0; P.stepDist = 0;
    D.x = P.x - 1.5; D.z = P.z + 2.5; D.state = 'lead'; D.target = null; D.barkT = 3; D.sniffT = 2; D.waitBark = 0; D.stuckT = 0;
    D.lx = D.x; D.lz = D.z;
    dirt.progress = 0; digObj = null; digLook = 0; detTimer = 0.5; digSfxT = 0; lastCarryHint = -10;
    I.reset(); I.enabled = true;
    A.ensure(); A.startAmbience(def.ambience); A.setIntensity(0.15);
    S.posts = []; S.unread = 0; S.phone = false; S.whistleCd = 0; D.call = 0;
    post('start', {});
    showHud(true);
    refreshHud();
    notify('playing');
  };
  Game.pause = function () {
    if (mode !== 'playing') return;
    mode = 'paused'; I.enabled = false; I.releaseLock(); I.reset();
    A.sirenStop(); A.heliStop();
    notify('paused');
  };
  Game.resume = function () {
    if (mode !== 'paused') return;
    mode = 'playing'; I.reset(); I.enabled = true; I.requestLock();
    notify('playing');
  };
  Game.toMenu = function () {
    mode = 'title'; I.enabled = false; I.releaseLock(); I.reset();
    A.stopAmbience(); showHud(false);
    W.resetWorld(); X.reset(); S = null;
    parkDog(); D.target = null;
    notify('title');
  };
  Game.isPlaying = function () { return mode === 'playing'; };
  Game.mode = function () { return mode; };

  function finish(win) {
    if (mode !== 'playing') return;
    mode = 'results'; I.enabled = false; I.releaseLock(); I.reset();
    showHud(false); A.stopAmbience();
    if (win) { A.stamp(); setTimeout(A.fanfare, 350); } else { A.sad(); }
    if (win && S.delivered >= N && S.strikes === 0) ach('ach_perfect');
    if (win) post('done', {});
    var rank = S.delivered >= N ? 3 : (S.delivered >= Math.ceil(N * 0.4) ? 2 : 1);
    lastResult = {
      win: win, huf: S.huf, eur: S.eur, usd: S.usd, delivered: S.delivered, lost: S.lost,
      time: def.time - Math.max(0, S.time), digs: S.digs, rank: rank, ach: Object.keys(S.ach), map: mapIndex, total: N
    };
    parkDog(); D.target = null;
    saveResult(lastResult);
    notify('results', lastResult);
  }
  function checkEnd() {
    if (S.delivered + S.lost >= N) later(1.4, function () { finish(S.delivered > 0); });
  }
  Game.result = function () { return lastResult; };
  Game.shareText = function () {
    if (!lastResult) return '';
    return tr('share_text', {
      huf: num(lastResult.huf), eur: num(lastResult.eur), usd: num(lastResult.usd),
      time: fmtTime(lastResult.time), digs: lastResult.digs
    });
  };
  Game.cow = function () {
    if (mode !== 'playing' || S.cow) return;
    S.cow = true; ach('ach_cow'); post('cow', {});
    var fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
    W.addCow(P.x + fx * 7, P.z + fz * 7, P.yaw);
    A.moo(); toast(tr('toast_cow'), 4);
  };
  Game.toast = toast;
  Game.refreshText = function () { shown = {}; if (S) refreshHud(); };

  /* ---------- actor hooks ---------- */
  var hooks = {
    onThiefScared: function () { toast(tr('toast_thief_scared'), 3); },
    onThiefSteal: function () { toast(tr('toast_thief_steal'), 4); A.alarm(); post('thief', {}); },
    onThiefDrop: function () { ach('ach_thief'); toast(tr('toast_thief_drop'), 4); post('caught', {}); },
    onThiefEscape: function () { S.lost++; toast(tr('toast_thief_escape'), 4); checkEnd(); },
    onHeli: function () { toast(tr('toast_heli'), 2.6); },
    onCoffee: function () {
      if (!S) return;
      S.buff = CFG.BUFF; S.stamina = CFG.STAM; S.exhausted = false; ach('ach_coffee');
      A.coffee(); toast(tr('toast_coffee'), 3.4);
    }
  };

  /* ---------- digging ---------- */
  function pickTarget() {
    var i, d, best = null, bd = 1e9, s, j, reach;
    for (i = 0; i < W.stashes.length; i++) {
      s = W.stashes[i];
      if (s.dug || s.drop) continue;
      d = dist(P, s);
      reach = s.kind === 'safe' ? CFG.SAFE_REACH : (s.kind === 'pile' ? CFG.PILE_REACH : CFG.STASH_REACH);
      if (d < reach && d < bd) { bd = d; best = { kind: 'stash', sub: s.kind, obj: s }; }
    }
    if (best) return best;
    for (i = 0; i < W.junk.length; i++) {
      j = W.junk[i];
      if (j.dug) continue;
      d = dist(P, j);
      if (d < (j.kind === 'pile' ? CFG.PILE_REACH : CFG.JUNK_REACH) && d < bd) { bd = d; best = { kind: 'junk', sub: j.kind, obj: j }; }
    }
    if (best) return best;
    return { kind: 'dirt', sub: 'dirt', obj: dirt };
  }

  function updateDig(dt) {
    if (I.dig && S.carrying < 0) {
      var t0 = pickTarget();
      if (t0.sub === 'safe') { startSafe(t0.obj); return; }
    }
    var wantDig = I.dig && !S.exhausted && S.stamina > 0;
    if (I.dig && S.carrying >= 0) {
      if (S.clock - lastCarryHint > 4) { lastCarryHint = S.clock; toast(tr('toast_carry_first')); }
      wantDig = false;
    }
    if (!wantDig) {
      S.digging = false;
      if (digObj === dirt) dirt.progress = 0;
      return;
    }
    var tg = pickTarget();
    if (digObj !== tg.obj) { if (digObj === dirt) dirt.progress = 0; digObj = tg.obj; }
    S.digging = true;
    var dur = CFG.DIG_DIRT;
    if (tg.kind === 'stash') dur = tg.sub === 'deep' ? CFG.DIG_DEEP : (tg.sub === 'pile' ? CFG.DIG_LOGS : CFG.DIG_BURIED);
    else if (tg.kind === 'junk') dur = tg.sub === 'pile' ? CFG.DIG_LOGS : CFG.DIG_JUNK;
    if (tg.sub === 'deep' && !S.deepHint) { S.deepHint = true; toast(tr('toast_deep'), 3.2); }
    var boost = S.buff > 0 ? 1.5 : 1;
    tg.obj.progress += dt / dur * boost;
    S.stamina = Math.max(0, S.stamina - CFG.STAM_DIG * (S.buff > 0 ? 0.6 : 1) * dt);
    if (S.stamina <= 0) S.exhausted = true;

    var fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw);
    var px = tg.kind === 'dirt' ? P.x + fx * 1.3 : tg.obj.x;
    var pz = tg.kind === 'dirt' ? P.z + fz * 1.3 : tg.obj.z;
    digSfxT -= dt;
    if (digSfxT <= 0) {
      digSfxT = 0.42 / boost;
      if (tg.sub === 'pile') pileSfx(); else A.dig();
      W.spawnDirt(px, W.heightAt(px, pz) + 0.25, pz, tg.sub === 'pile' ? 2 : 5);
      if (tg.kind === 'stash') dogSound('bark');
    }
    if (tg.obj.progress < 1) return;

    S.digging = false; S.digs++;
    W.spawnDirt(px, W.heightAt(px, pz) + 0.3, pz, 14);
    if (tg.kind === 'stash') {
      tg.obj.dug = true;
      if (tg.sub !== 'pile') W.addHole(tg.obj);
      S.carrying = tg.obj.idx;
      A.found(); dogSound('barks');
      toast(tr('toast_found'));
      post('found', { huf: num(CASES[tg.obj.idx].huf) });
    } else if (tg.kind === 'junk') {
      tg.obj.dug = true;
      if (tg.sub === 'pile') { A.boing(); toast(tr('toast_logs_empty')); }
      else {
        W.addJunkItem(tg.obj);
        if (tg.sub === 'duck') { S.ducks++; ach('ach_duck'); A.duck(); toast(tr('toast_duck')); post('duck', {}); }
        else {
          S.boots++; A.boot(); toast(tr('toast_boot'));
          if (S.boots === 3) { ach('ach_boots'); later(2.2, function () { toast(tr('toast_bootach'), 3.2); A.ping(); }); }
        }
      }
    } else {
      dirt.progress = 0; A.toss(); toast(tr('toast_dirt'), 1.6);
    }
  }

  /* ---------- safe-cracking mini-game ---------- */
  function arcPath(c, hw) {
    var r = 78;
    function pt(a) { return (100 + r * Math.sin(a)).toFixed(1) + ' ' + (100 - r * Math.cos(a)).toFixed(1); }
    return 'M ' + pt(c - hw) + ' A ' + r + ' ' + r + ' 0 ' + (hw * 2 > Math.PI ? 1 : 0) + ' 1 ' + pt(c + hw);
  }
  function startSafe(obj) {
    S.safe = { obj: obj, step: 0, ang: 0, zc: wrap(1.5 + Math.random() * 2.5), prev: I.dig, gate: true, tap: false, misses: 0 };
    S.digging = false;
    el.safegame.classList.remove('hidden');
    updateSafeUi();
  }
  function closeSafe() {
    S.safe = null;
    el.safegame.classList.add('hidden');
  }
  function updateSafeUi() {
    var sf = S.safe, zw = Math.max(0.12, lockOf(sf).zone - 0.08 * sf.step);
    el['safe-zone'].setAttribute('d', arcPath(sf.zc, zw));
    el['safe-marker'].setAttribute('transform', 'rotate(' + (sf.ang * 180 / Math.PI).toFixed(1) + ' 100 100)');
    var pins = el['safe-pins'].children;
    for (var i = 0; i < pins.length; i++) pins[i].className = i < sf.step ? 'on' : '';
  }
  function updateSafe(dt) {
    var sf = S.safe;
    if (sf.gate && !I.dig) sf.gate = false;
    if (!sf.gate && Math.abs(I.moveX) + Math.abs(I.moveZ) > 0.5) { closeSafe(); return; }
    var zw = Math.max(0.12, lockOf(sf).zone - 0.08 * sf.step);
    sf.ang = (sf.ang + (lockOf(sf).speed + 0.6 * sf.step) * dt) % (Math.PI * 2);
    var press = (I.dig && !sf.prev && !sf.gate) || sf.tap;
    sf.prev = I.dig; sf.tap = false;
    if (press && !sf.gate) {
      if (Math.abs(wrap(sf.ang - sf.zc)) < zw) {
        sf.step++; A.safeClick();
        if (sf.step >= 3) {
          sf.obj.dug = true; S.carrying = sf.obj.idx; S.digs++;
          if (sf.misses === 0) ach('ach_safe');
          W.openSafe(sf.obj); A.safeOpen(); dogSound('barks'); toast(tr('toast_safe_open'), 3.4);
          closeSafe();
          return;
        }
        sf.zc = wrap(sf.ang + 1.3 + Math.random() * 2.6);
      } else {
        sf.step = Math.max(0, sf.step - 1); sf.misses++; S.strikes++;
        S.time = Math.max(1, S.time - CFG.SAFE_PENALTY);
        A.alarm(); toast(tr('toast_safe_miss'), 1.8);
      }
    }
    updateSafeUi();
  }
  Game.safeTap = function () { if (S && S.safe) S.safe.tap = true; };
  Game.safeCancel = function () { if (S && S.safe) closeSafe(); };

  /* ---------- delivery, van and events ---------- */
  function pickVanSpot() {
    var spots = W.layout.vanSpots, cands = [], all = [], i, j, md;
    for (i = 0; i < spots.length; i++) {
      if (i === W.vanIndex) continue;
      all.push(i);
      md = 1e9;
      for (j = 0; j < W.stashes.length; j++) {
        if (W.stashes[j].dug) continue;
        md = Math.min(md, dist(spots[i], W.stashes[j]));
      }
      if (md === 1e9 || (md > 26 && md < 64)) cands.push(i);
    }
    var pool = cands.length ? cands : all;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  function vanLeave() {
    W.vanGroup.visible = false; W.beacon.visible = false;
    A.engine(); toast(tr('toast_van_leaves'), 2.2);
  }
  function vanArrive() {
    W.moveVan(pickVanSpot());
    W.vanGroup.visible = true; W.beacon.visible = true; S.vanReady = true;
    A.honk(); toast(tr('toast_van_arrives'), 3.4);
  }
  function pickThiefTarget() {
    var cands = W.stashes.filter(function (s) { return !s.dug && !s.drop && s.kind !== 'safe'; });
    if (!cands.length) return null;
    var far = cands.filter(function (s) { var d = dist(P, s); return d > 28 && d < 75; });
    var pool = far.length ? far : cands;
    return pool[Math.floor(Math.random() * pool.length)];
  }
  function spawnThiefEvent() {
    var t = pickThiefTarget();
    if (!t) return;
    X.spawnThief(t);
    toast(tr('toast_thief_spawn'), 5);
  }
  function stageEvents(n) {
    var ev = null, i;
    for (i = 0; i < def.events.length; i++) if (def.events[i].n === n) ev = def.events[i];
    if (!ev) return;
    X.setStage(ev.stage);
    A.setIntensity(0.15 + 0.2 * ev.stage);
    if (ev.toast) toast(tr(ev.toast), 3);
    if (ev.thief) later(5, spawnThiefEvent);
    if (ev.heli) { X.heliRepeat = true; X.scheduleHeli(8); }
  }
  function deliver() {
    var c = CASES[S.carrying];
    S.huf += c.huf; S.eur += c.eur; S.usd += c.usd;
    S.delivered++; S.carrying = -1;
    A.van();
    toast(tr('toast_delivered', { huf: num(c.huf), eur: num(c.eur), usd: num(c.usd) }), 3.2);
    later(0.35, function () { A.cash(); });
    later(0.5, function () { A.coins(); });
    var n = S.delivered;
    if (S.delivered + S.lost >= N) { checkEnd(); return; }
    S.vanReady = false;
    later(1.6, function () { A.ping(); post('paid', { huf: num(c.huf), eur: num(c.eur), usd: num(c.usd) }); toast(tr(I.isTouch ? 'toast_post_touch' : 'toast_post'), 3.2); });
    later(3.2, vanLeave);
    later(4.6, function () { stageEvents(n); });
    later(6.8, vanArrive);
  }
  function pickDrop(st) {
    st.drop = false; st.dug = true; X.removeDrop(st);
    S.carrying = st.idx; A.found(); toast(tr('toast_case_back'), 3);
  }

  /* ---------- dog ---------- */
  function updateDog(dt) {
    var dp = dist(D, P), tgt = D.target, moving = false, speed = 0, tx = 0, tz = 0;
    var ch = X.thiefChase(), chasing = !!ch && dist(D, ch) < 45;
    if (tgt && tgt.dug) { D.target = tgt = null; if (D.state !== 'chase') D.state = 'lead'; }
    S.dogWaiting = false;
    if (chasing) {
      D.state = 'chase'; tx = ch.x; tz = ch.z; speed = 6.0;
      D.barkT -= dt;
      if (D.barkT <= 0) { dogSound('barks'); D.barkT = 1.8; }
    } else if (D.call > 0) {
      D.call -= dt; D.state = 'call';
      if (dp > 3) { tx = P.x; tz = P.z; speed = 5.5; } else { D.yawT = Math.atan2(P.x - D.x, P.z - D.z); D.call = Math.min(D.call, 1.5); }
    } else {
      if (D.state === 'chase' || D.state === 'call') D.state = 'lead';
      if (!tgt) {
        var n = nearestStash(D);
        if (n) { D.target = tgt = n.s; D.state = 'lead'; }
      }
      if (!tgt) {
        if (dp > 3.5) { tx = P.x; tz = P.z; speed = 3.6; }
      } else if (D.state === 'indicate') {
        D.angle += dt * 1.1;
        var cx = tgt.x + Math.cos(D.angle) * 1.5, cz = tgt.z + Math.sin(D.angle) * 1.5;
        if (Math.abs(cx - D.x) + Math.abs(cz - D.z) > 0.35) { tx = cx; tz = cz; speed = 1.8; }
        D.barkT -= dt; D.sniffT -= dt;
        if (D.sniffT <= 0) { dogSound('sniff'); D.sniffT = 2.4 + Math.random() * 1.6; }
        if (D.barkT <= 0) {
          var far = dp > 18;
          dogSound(far ? 'barks' : 'bark');
          D.barkT = far ? 2.6 : 4 + Math.random() * 2.5;
        }
      } else if (D.state === 'wait') {
        S.dogWaiting = dp > 9;
        D.yawT = Math.atan2(P.x - D.x, P.z - D.z);
        D.waitBark -= dt;
        if (D.waitBark <= 0) { dogSound('bark'); D.waitBark = 5; }
        if (dp < 8) D.state = 'lead';
      } else {
        if (dp > 13) { D.state = 'wait'; D.waitBark = 1; }
        else {
          var dd = dist(D, tgt);
          if (dd < 2.4) {
            D.state = 'indicate'; D.barkT = 0.6; D.sniffT = 1.2;
            D.angle = Math.atan2(D.z - tgt.z, D.x - tgt.x);
          } else { tx = tgt.x; tz = tgt.z; speed = 3.1 + (dp < 5 ? 0.6 : 0); }
        }
      }
    }
    if (speed > 0) {
      var dx = tx - D.x, dz = tz - D.z, L = Math.sqrt(dx * dx + dz * dz);
      if (L > 0.05) {
        var step = Math.min(L, speed * dt), gp = L > 2.5 ? W.pathTarget(D, tx, tz, dt) : { x: tx, z: tz }, hd = L > 2.5 ? W.steer(D, gp.x, gp.z, 0.35) : Math.atan2(dx, dz);
        D.x += Math.sin(hd) * step; D.z += Math.cos(hd) * step;
        D.yawT = hd; moving = true;
      }
    }
    W.resolve(D, 0.35, true);
    if (moving) {
      if (Math.abs(D.x - D.lx) + Math.abs(D.z - D.lz) < speed * dt * 0.3) D.stuckT += dt; else D.stuckT = 0;
      if (D.stuckT > 1.2) {
        var qx = -(tz - D.z), qz = (tx - D.x), ql = Math.sqrt(qx * qx + qz * qz) || 1;
        D.x += qx / ql * 1.6; D.z += qz / ql * 1.6; D.stuckT = 0;
      }
    }
    D.lx = D.x; D.lz = D.z;
    D.yaw += wrap(D.yawT - D.yaw) * Math.min(1, dt * 8);
    D.moving = moving;
    D.speed = speed;
    poseDog(dt, speed);
  }

  function poseDog(dt, speed) {
    var dg = W.dog, gy = W.heightAt(D.x, D.z);
    dg.group.position.set(D.x, gy, D.z);
    dg.group.rotation.y = D.yaw;
    var legs = dg.legs, i;
    if (D.moving) {
      D.legPhase += dt * speed * 5;
      var s = Math.sin(D.legPhase) * 0.7;
      legs[0].rotation.x = s; legs[3].rotation.x = s; legs[1].rotation.x = -s; legs[2].rotation.x = -s;
    } else {
      for (i = 0; i < 4; i++) legs[i].rotation.x *= 0.8;
    }
    dg.head.rotation.x = D.state === 'indicate' ? 0.65 + 0.15 * Math.sin(tAll * 9) : 0;
    var happy = D.state === 'indicate' || D.state === 'wait' || D.state === 'chase' || D.state === 'call' || !D.target;
    dg.tail.rotation.y = Math.sin(tAll * 12) * (happy ? 0.7 : 0.25);
  }

  /* ---------- HUD ---------- */
  function refreshHud() {
    if (!S) return;
    setText('hud-time', fmtTime(S.time));
    setText('hud-mapname', tr(def.nameKey));
    setText('hud-cases', S.delivered + '/' + N);
    setText('cash-huf', num(S.huf) + ' Ft');
    setText('cash-eur', num(S.eur) + ' €');
    setText('cash-usd', num(S.usd) + ' $');
    var obj;
    if (S.carrying >= 0) obj = tr('obj_carry');
    else if (S.delivered + S.lost >= N) obj = tr('obj_done');
    else {
      var n = nearestStash(P);
      obj = (n && n.d < 14) ? tr('obj_dig') : tr('obj_follow');
    }
    setText('hud-objective', obj);
    var lv = S.detLevel;
    setText('det-label', lv > 0.78 ? tr('det_hot') : lv > 0.5 ? tr('det_warm') : lv > 0.2 ? tr('det_cool') : tr('det_cold'));
    var prompt = '';
    if (S.safe) prompt = '';
    else if (S.carrying >= 0) {
      prompt = S.vanReady ? tr('prompt_carry', { d: Math.round(dist(P, W.van.rear)) }) : tr('prompt_van_moving');
    } else if (S.exhausted) prompt = tr('prompt_rest');
    else {
      var ns = nearestStash(P);
      if (ns && ns.d < 4.5 && !S.digging && !ns.s.drop) {
        prompt = ns.s.kind === 'safe' ? tr('prompt_safe') : tr(I.isTouch ? 'prompt_dig_touch' : 'prompt_dig_desktop');
      } else if (S.dogWaiting) prompt = tr('prompt_dog_wait');
    }
    setText('prompt', prompt);
    el.prompt.classList.toggle('hidden', !prompt);
    var mutedNow = A.isMuted();
    if (shown.mutedIcon !== mutedNow) {
      shown.mutedIcon = mutedNow;
      $('snd-wave').style.display = mutedNow ? 'none' : '';
      $('snd-wave2').style.display = mutedNow ? 'none' : '';
    }
  }

  function updateHudFast() {
    var lv = Math.round(S.detLevel * 10);
    if (shown.segs !== lv) {
      shown.segs = lv;
      for (var i = 0; i < segEls.length; i++) segEls[i].className = i < lv ? (i >= 7 ? 'hot' : 'on') : '';
    }
    el['stam-fill'].style.width = Math.round(S.stamina) + '%';
    el['stam-fill'].className = S.exhausted ? 'low' : '';
    var carrying = S.carrying >= 0;
    el['load-chip'].classList.toggle('hidden', !carrying);
    if (carrying) el['load-fill'].style.width = '82%';
    el['buff-chip'].classList.toggle('hidden', !(S.buff > 0));
    if (S.buff > 0) el['buff-fill'].style.width = Math.round(S.buff / CFG.BUFF * 100) + '%';
    var tgObj = digObj && S.digging ? digObj : null;
    el['dig-ring'].classList.toggle('hidden', !tgObj);
    if (tgObj) {
      var pr = clamp(tgObj.progress, 0, 1);
      el['dig-arc'].setAttribute('stroke-dashoffset', String(276.5 * (1 - pr)));
    }
    var showVan = carrying && S.vanReady;
    el.arrow.classList.toggle('hidden', !showVan);
    if (showVan) el.arrow.style.transform = 'rotate(' + relAngle(W.van.rear.x, W.van.rear.z) + 'rad)';
    var dd = dist(P, D), showDog = dd > 10 && !S.safe;
    el['arrow-dog'].classList.toggle('hidden', !showDog);
    if (showDog) { el['arrow-dog-rot'].style.transform = 'rotate(' + relAngle(D.x, D.z) + 'rad)'; setText('dog-dist', Math.round(dd) + ' m'); }
    var th = X.thiefInfo();
    el['arrow-thief'].classList.toggle('hidden', !th);
    if (th) el['arrow-thief'].style.transform = 'rotate(' + relAngle(th.x, th.z) + 'rad)';
  }

  /* ---------- main update ---------- */
  function update(dt) {
    if (S.phone) { I.poll(); I.consumeLook(); return; }
    S.clock += dt;
    if (S.whistleCd > 0) S.whistleCd -= dt;
    I.poll();
    var lk = I.consumeLook();
    P.yaw -= lk.dx; P.pitch = clamp(P.pitch - lk.dy, -1.35, 1.35);
    if (S.buff > 0) S.buff = Math.max(0, S.buff - dt);

    var frozen = !!S.safe;
    var fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
    var mx = I.moveX, mz = I.moveZ, mag = Math.min(1, Math.sqrt(mx * mx + mz * mz));
    var wantRun = I.run && mag > 0 && S.stamina > 6 && !S.exhausted && !frozen;
    var speed = 0;
    if (!S.digging && !frozen && mag > 0) {
      speed = (wantRun ? CFG.RUN : CFG.WALK) * (S.carrying >= 0 ? CFG.CARRY : 1) * mag * (S.buff > 0 ? 1.12 : 1);
    }
    if (speed > 0) {
      var vx = (fx * mz + rx * mx) / mag * speed, vz = (fz * mz + rz * mx) / mag * speed;
      P.x += vx * dt; P.z += vz * dt;
      W.resolve(P, CFG.RADIUS);
      P.bob += dt * (wantRun ? 11 : 8);
      P.stepDist += speed * dt;
      if (P.stepDist > (wantRun ? 2.2 : 1.7)) { P.stepDist = 0; A.step(wantRun); }
      if (wantRun) S.stamina = Math.max(0, S.stamina - CFG.STAM_RUN * (S.buff > 0 ? 0.6 : 1) * dt);
    }
    P.speed = speed;

    if (S.safe) updateSafe(dt); else updateDig(dt);

    if (!S.digging && !(wantRun && speed > 0)) {
      S.stamina = Math.min(CFG.STAM, S.stamina + CFG.STAM_REGEN * dt);
    }
    if (S.stamina <= 0) S.exhausted = true;
    if (S.exhausted && S.stamina >= 22) S.exhausted = false;

    /* a dropped case is picked up by walking over it */
    if (S.carrying < 0) {
      for (var q = 0; q < W.stashes.length; q++) {
        if (W.stashes[q].drop && dist(P, W.stashes[q]) < 1.6) { pickDrop(W.stashes[q]); break; }
      }
    }

    /* detector */
    var ns = nearestStash(P);
    if (ns && ns.d < CFG.DET_RANGE) {
      var k = ns.d / CFG.DET_RANGE;
      S.detLevel = clamp(1 - k, 0, 1);
      detTimer -= dt;
      if (detTimer <= 0) {
        A.beep(650 + (1 - k) * 950);
        detTimer = 0.13 + Math.pow(k, 1.3) * 1.5;
      }
    } else { S.detLevel = 0; detTimer = 0.4; }

    updateDog(dt);
    X.update(dt, P, D, S);

    /* delivery */
    if (S.carrying >= 0 && S.vanReady && dist(P, W.van.rear) < CFG.VAN_R) deliver();

    /* timed events */
    for (var i = S.events.length - 1; i >= 0; i--) {
      if (S.events[i].t <= S.clock) { var ev = S.events.splice(i, 1)[0]; ev.fn(); }
    }

    /* timer */
    S.time -= dt;
    if (S.time <= 0 && mode === 'playing') finish(false);
    if (mode !== 'playing') return;

    /* view models */
    digLook += ((S.digging ? 1 : 0) - digLook) * Math.min(1, dt * 8);
    applyCamera(dt);
    animateShovel(dt);
    W.shovel.visible = S.carrying < 0;
    W.heldCase.visible = S.carrying >= 0;

    updateHudFast();
    hudAcc += dt;
    if (hudAcc > 0.1) { hudAcc = 0; refreshHud(); drawRadar(); }
  }

  function applyCamera() {
    var gy = W.heightAt(P.x, P.z);
    var bob = Math.sin(P.bob) * 0.035 * Math.min(1, P.speed / 3);
    W.camera.position.set(P.x, gy + CFG.EYE + bob - digLook * 0.12, P.z);
    W.camera.rotation.set(P.pitch - digLook * 0.32, P.yaw, 0);
  }
  function animateShovel() {
    var sh = W.shovel;
    if (S.digging) {
      var s = Math.sin(S.clock * 14);
      sh.position.set(0.3, -0.55 + (s > 0 ? s * 0.16 : s * 0.05), -0.85 - Math.max(0, s) * 0.12);
      sh.rotation.set(-0.5 + s * 0.55, 0.1, 0.2);
    } else {
      var sway = Math.sin(P.bob) * 0.02 * Math.min(1, P.speed / 3);
      sh.position.set(0.38, -0.5 + sway, -0.78);
      sh.rotation.set(-0.35, 0.15, 0.25);
    }
    W.heldCase.position.y = -0.46 + Math.sin(P.bob * 1.2) * 0.015 * Math.min(1, P.speed / 3);
  }

  /* ---------- idle (title / paused / results) ---------- */
  function idleUpdate(dt) {
    if (mode !== 'paused') {
      titleAngle += dt * 0.12;
      var vs = W.layout.vanSpots[0];
      var cx = vs.x + Math.sin(titleAngle) * 11, cz = vs.z - 3 + Math.cos(titleAngle) * 11;
      W.camera.position.set(cx, W.heightAt(cx, cz) + 2.4, cz);
      W.camera.lookAt(vs.x, 1.8, vs.z - 3.5);
      D.state = 'wait'; D.target = null; D.moving = false;
      D.yawT = Math.atan2(cx - D.x, cz - D.z);
      D.yaw += wrap(D.yawT - D.yaw) * Math.min(1, dt * 4);
      poseDog(dt, 0);
      W.shovel.visible = false; W.heldCase.visible = false;
      X.update(dt, { x: cx, z: cz, yaw: Math.PI }, D, null);
    }
  }

  /* ---------- loop ---------- */
  function perfSample(dt) {
    if (mode !== 'playing') { perf.n = 0; perf.sum = 0; return; }
    perf.n++; perf.sum += dt;
    if (perf.n >= 90) {
      var avg = perf.sum / perf.n;
      perf.n = 0; perf.sum = 0;
      if (avg > 0.034 && perf.scale > 0.65) {
        perf.scale -= 0.12;
        W.setPixelRatioScale(perf.scale);
      }
    }
  }
  function frame(ts) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.05, (ts - lastTs) / 1000 || 0.016);
    lastTs = ts; tAll += dt;
    perfSample(dt);
    if (mode === 'playing') update(dt); else idleUpdate(dt);
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) el.toast.classList.add('hidden'); }
    W.updateParticles(dt);
    W.followSky();
    W.render();
  }

  /* ---------- progress (stored in the browser) ---------- */
  function loadSave() {
    var d = { unlocked: 1, best: {}, bonus: false };
    try { var raw = localStorage.getItem(SAVE_KEY); if (raw) { var o = JSON.parse(raw); if (o && typeof o.unlocked === 'number') d = o; } } catch (e) { /* ignore */ }
    if (!d.best) d.best = {};
    return d;
  }
  function storeSave(d) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(d)); } catch (e) { /* ignore */ } }
  function saveResult(r) {
    var d = loadSave(), id = def.id, b = d.best[id];
    if (!b || r.delivered > b.delivered || (r.delivered === b.delivered && r.time < b.time)) {
      d.best[id] = { delivered: r.delivered, total: r.total, time: r.time, huf: r.huf, eur: r.eur, usd: r.usd };
    }
    if (r.win && !def.bonus && d.unlocked < mapIndex + 2) d.unlocked = Math.min(4, mapIndex + 2);
    var allDone = ['forest', 'farm', 'village', 'quarry'].every(function (k) { return d.best[k] && d.best[k].delivered > 0; });
    if (allDone) d.bonus = true;
    storeSave(d);
  }
  Game.getSave = loadSave;
  Game.unlockBonus = function () { var d = loadSave(); d.bonus = true; storeSave(d); };
  Game.campaign = function () {
    var d = loadSave(), t = { huf: 0, eur: 0, usd: 0, maps: 0 };
    ['forest', 'farm', 'village', 'quarry'].forEach(function (k) {
      if (d.best[k]) { t.huf += d.best[k].huf; t.eur += d.best[k].eur; t.usd += d.best[k].usd; t.maps++; }
    });
    return t;
  };

  /* ---------- the in-game phone (the Agency's feed) ---------- */
  var PHOTOS = {
    forest: '<rect width="120" height="80" fill="#10202c"/><circle cx="96" cy="16" r="8" fill="#dce8f2"/><path d="M10 70L28 28L46 70Z M34 70L54 20L74 70Z M66 70L84 34L102 70Z" fill="#17402c"/><rect y="68" width="120" height="12" fill="#0d1a14"/>',
    farm: '<rect width="120" height="80" fill="#1c2640"/><rect y="52" width="120" height="28" fill="#4a3d1c"/><rect x="18" y="30" width="34" height="26" fill="#6b2e22"/><path d="M14 32L35 16L56 32Z" fill="#2b2420"/><rect x="76" y="20" width="14" height="36" fill="#aab2b8"/>',
    village: '<rect width="120" height="80" fill="#2a1f22"/><rect x="14" y="34" width="34" height="30" fill="#b09a7a"/><path d="M10 36L31 18L52 36Z" fill="#6a2f2a"/><rect x="70" y="40" width="34" height="24" fill="#8a9aa8"/><circle cx="62" cy="14" r="5" fill="#ffb060"/><rect y="64" width="120" height="16" fill="#1b1d20"/>',
    quarry: '<rect width="120" height="80" fill="#10151c"/><path d="M0 80L0 40L30 56L60 66L90 56L120 38L120 80Z" fill="#4a463e"/><rect x="74" y="26" width="6" height="30" fill="#2a2f33"/><circle cx="77" cy="24" r="6" fill="#eaf4ff"/>',
    pasture: '<rect width="120" height="80" fill="#0f2418"/><path d="M0 60Q30 46 60 56T120 50V80H0Z" fill="#24602c"/><rect x="30" y="42" width="26" height="12" fill="#f2f0e8"/><rect x="34" y="46" width="8" height="6" fill="#1b1b1b"/><rect x="26" y="40" width="9" height="9" fill="#f2f0e8"/>',
    cash: '<rect width="120" height="80" fill="#0e1a14"/><rect x="22" y="44" width="76" height="16" fill="#2c6a40"/><rect x="28" y="32" width="64" height="14" fill="#3a8050"/><rect x="36" y="20" width="48" height="14" fill="#4a9a60"/><circle cx="60" cy="53" r="6" fill="#f2b84b"/>',
    van: '<rect width="120" height="80" fill="#10202c"/><rect x="28" y="26" width="50" height="34" fill="#9fb0b8"/><rect x="78" y="36" width="16" height="24" fill="#7f939c"/><rect x="32" y="32" width="38" height="24" fill="#f2b84b"/><circle cx="44" cy="62" r="5" fill="#0b0f12"/><circle cx="84" cy="62" r="5" fill="#0b0f12"/>',
    thief: '<rect width="120" height="80" fill="#10151c"/><path d="M60 14C44 14 40 30 40 44L40 74L80 74L80 44C80 30 76 14 60 14Z" fill="#1c1c20"/><circle cx="54" cy="36" r="3" fill="#ff5050"/><circle cx="66" cy="36" r="3" fill="#ff5050"/>',
    duck: '<rect width="120" height="80" fill="#10202c"/><circle cx="58" cy="50" r="18" fill="#f5d020"/><circle cx="72" cy="30" r="11" fill="#f5d020"/><rect x="80" y="28" width="12" height="5" fill="#f08a1d"/><circle cx="75" cy="27" r="2" fill="#1a1307"/>',
    cow: '<rect width="120" height="80" fill="#0f2418"/><rect x="26" y="34" width="56" height="26" fill="#f2f0e8"/><rect x="34" y="36" width="18" height="12" fill="#1b1b1b"/><rect x="82" y="26" width="18" height="16" fill="#f2f0e8"/><rect x="30" y="58" width="6" height="14" fill="#f2f0e8"/><rect x="70" y="58" width="6" height="14" fill="#f2f0e8"/>'
  };
  var POST_PHOTO = { start: null, found: 'cash', paid: 'van', thief: 'thief', caught: 'thief', duck: 'duck', cow: 'cow', done: 'cash' };
  function post(type, params) {
    if (!S) return;
    var c1 = 1 + Math.floor(Math.random() * 8), c2 = 1 + Math.floor(Math.random() * 8);
    if (c2 === c1) c2 = (c1 % 8) + 1;
    S.posts.unshift({ type: type, params: params || {}, born: S.clock, seed: Math.floor(Math.random() * 40), c: [c1, c2],
                      stamp: fmtTime(def.time - Math.max(0, S.time)) });
    S.unread++;
    updatePhoneBadge();
  }
  function updatePhoneBadge() {
    var b = el['phone-badge'];
    if (!b) return;
    b.textContent = S && S.unread ? String(S.unread) : '';
    b.classList.toggle('hidden', !(S && S.unread));
  }
  function renderPhone() {
    var host = el['phone-feed'];
    host.innerHTML = '';
    var posts = S.posts;
    posts.forEach(function (p) {
      var div = document.createElement('div'); div.className = 'post';
      var photoKey = POST_PHOTO[p.type] === null ? def.photo : POST_PHOTO[p.type];
      var likes = 12 + p.seed * 7 + Math.floor((S.clock - p.born) * 2.4);
      var txt = tr('post_' + p.type, p.params);
      div.innerHTML = '<div class="post-head"><b>' + tr('phone_page') + '</b><span>' + p.stamp + '</span></div>' +
        '<p class="post-text"></p>' +
        '<svg viewBox="0 0 120 80" class="post-photo" aria-hidden="true">' + (PHOTOS[photoKey] || PHOTOS.forest) + '</svg>' +
        '<div class="post-likes">' + likes + ' ' + tr('phone_likes') + '</div>' +
        '<div class="post-cmt"><b>' + tr('cmt_u' + p.c[0]) + '</b> ' + tr('cmt_t' + p.c[0]) + '</div>' +
        '<div class="post-cmt"><b>' + tr('cmt_u' + p.c[1]) + '</b> ' + tr('cmt_t' + p.c[1]) + '</div>';
      div.querySelector('.post-text').textContent = txt;
      host.appendChild(div);
    });
    S.unread = 0; updatePhoneBadge();
  }
  Game.phoneOpen = function () { return !!(S && S.phone); };
  Game.openPhone = function () {
    if (mode !== 'playing' || S.phone || S.safe) return;
    S.phone = true; I.reset(); I.releaseLock();
    renderPhone();
    el.phone.classList.remove('hidden');
  };
  Game.closePhone = function () {
    if (!S || !S.phone) return;
    S.phone = false;
    el.phone.classList.add('hidden');
    I.reset(); I.requestLock();
  };
  Game.togglePhone = function () { if (S && S.phone) Game.closePhone(); else Game.openPhone(); };
  Game.whistle = function () {
    if (mode !== 'playing' || S.phone || S.whistleCd > 0) return;
    S.whistleCd = 3; D.call = 20; A.whistle(); toast(tr('toast_whistle'), 1.6);
  };

  /* ---------- radar ---------- */
  var radarCtx = null;
  function drawRadar() {
    if (!radarCtx || !S) return;
    var c = radarCtx, R = 60, RANGE = 60, sc = R / RANGE;
    c.clearRect(0, 0, 120, 120);
    c.fillStyle = 'rgba(15,26,23,0.78)'; c.beginPath(); c.arc(R, R, R - 1, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(243,239,228,0.18)'; c.lineWidth = 1;
    c.beginPath(); c.arc(R, R, R - 1, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(R, R, R / 2, 0, Math.PI * 2); c.stroke();
    var fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
    function dot(x, z, color, size, shape) {
      var dx = x - P.x, dz = z - P.z, f = dx * fx + dz * fz, r = dx * rx + dz * rz;
      var px = r * sc, py = -f * sc, len = Math.sqrt(px * px + py * py), edge = R - 6;
      if (len > edge) { px = px / len * edge; py = py / len * edge; }
      c.fillStyle = color;
      if (shape === 'sq') c.fillRect(R + px - size, R + py - size, size * 2, size * 2);
      else { c.beginPath(); c.arc(R + px, R + py, size, 0, Math.PI * 2); c.fill(); }
      return len > edge;
    }
    dot(W.van.rear.x, W.van.rear.z, S.vanReady ? '#F2B84B' : '#6b5a3a', 4, 'sq');
    var th = X.thiefInfo();
    if (th) dot(th.x, th.z, '#FF5050', 4);
    for (var i = 0; i < W.stashes.length; i++) if (W.stashes[i].drop) dot(W.stashes[i].x, W.stashes[i].z, '#7FD6A0', 4);
    dot(D.x, D.z, '#E9A25A', 5);
    c.strokeStyle = '#1A1307'; c.lineWidth = 1.5;
    c.fillStyle = '#F3EFE4'; c.beginPath(); c.moveTo(R, R - 7); c.lineTo(R - 5, R + 5); c.lineTo(R + 5, R + 5); c.closePath(); c.fill();
  }

  /* ---------- map loading ---------- */
  function bindWorld(world, idx) {
    if (W && W.dispose) { try { W.dispose(); } catch (e) { /* ignore */ } }
    W = world; mapIndex = idx; def = world.def;
    CASES = def.cases; N = def.stashes.length;
    X = ASO.Actors.create(W, hooks);
    W.camera.position.set(0, 3, 10);
    S = null;
    D.call = 0; D.target = null; D.state = 'lead'; parkDog();
    W.shovel.visible = false; W.heldCase.visible = false;
  }
  Game.loadMap = function (idx, done) {
    mode = 'title'; I.enabled = false; I.releaseLock(); A.stopAmbience(); if (el.hud) showHud(false);
    var d = ASO.Maps.list[idx];
    var world = ASO.World.create(null, d, { isTouch: I.isTouch, renderer: renderer0, basePR: basePR0 });
    bindWorld(world, idx);
    W.resize();
    if (done) done();
  };
  Game.mapDef = function () { return def; };
  Game.mapIndex = function () { return mapIndex; };

  Game.init = function (canvas, firstMap) {
    var T = THREE;
    basePR0 = Math.min(window.devicePixelRatio || 1, I.isTouch ? 1.5 : 2);
    renderer0 = new T.WebGLRenderer({ canvas: canvas, antialias: !I.isTouch, powerPreference: 'high-performance' });
    renderer0.setPixelRatio(basePR0);
    ['hud', 'touch', 'toast', 'prompt', 'arrow', 'arrow-thief', 'arrow-dog', 'arrow-dog-rot', 'dig-ring', 'dig-arc', 'stam-fill', 'load-chip', 'load-fill',
     'buff-chip', 'buff-fill', 'safegame', 'safe-zone', 'safe-marker', 'safe-pins', 'phone', 'phone-feed', 'phone-badge', 'radar'].forEach(function (id) { el[id] = $(id); });
    el.safegame = el['safegame']; el.phone = el['phone'];
    var segs = $('det-segs');
    for (var i = 0; i < 10; i++) { var s = document.createElement('i'); segs.appendChild(s); segEls.push(s); }
    radarCtx = el.radar && el.radar.getContext ? el.radar.getContext('2d') : null;
    I.init(canvas);
    $('safe-svg').addEventListener('pointerdown', function (e) { if (e.preventDefault) e.preventDefault(); Game.safeTap(); });
    $('btn-safe-cancel').addEventListener('click', function () { Game.safeCancel(); });
    $('btn-phone').addEventListener('click', function () { Game.togglePhone(); });
    $('btn-phone-close').addEventListener('click', function () { Game.closePhone(); });
    if ($('btn-whistle')) $('btn-whistle').addEventListener('click', function () { Game.whistle(); });
    window.addEventListener('resize', function () { if (W) W.resize(); });
    window.addEventListener('orientationchange', function () { setTimeout(function () { if (W) W.resize(); }, 200); });
    document.addEventListener('visibilitychange', function () { if (document.hidden) Game.pause(); });
    mode = 'title';
    Game.loadMap(firstMap || 0);
    requestAnimationFrame(frame);
  };

  Game.debug = {
    state: function () { return S; }, player: P, dog: D, world: function () { return W; }, actors: function () { return X; },
    cases: function () { return CASES; }, cfg: CFG, def: function () { return def; }
  };

  ASO.Game = Game;
})();
