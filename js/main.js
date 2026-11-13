/* Wires the menus to the game. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var I = ASO.Input, A = ASO.Audio, G, L = ASO.i18n;
  var screens = ['screen-title', 'screen-maps', 'screen-help', 'screen-pause', 'screen-results', 'screen-error', 'loading'];
  var lastRes = null, current = 'loading';

  function show(id) {
    current = id;
    screens.forEach(function (s) { $(s).classList.toggle('hidden', s !== id); });
  }
  function fmtTime(sec) {
    sec = Math.max(0, Math.round(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
  }

  document.body.classList.toggle('is-touch', I.isTouch);
  L.apply();
  $('loading-line').textContent = L.t('loading_line');

  function updateToggles() {
    $('btn-sound2').textContent = L.t(A.isMuted() ? 'sound_off' : 'sound_on');
    $('btn-music').textContent = L.t(A.isMusic() ? 'music_on' : 'music_off');
  }

  /* ---------- map select ---------- */
  function renderMaps() {
    var host = $('map-list'), save = G.getSave(), list = ASO.Maps.list;
    host.innerHTML = '';
    list.forEach(function (d, i) {
      if (d.bonus && !save.bonus) return;
      var locked = !d.bonus && i + 1 > save.unlocked;
      var card = document.createElement('div');
      card.className = 'mapcard' + (locked ? ' locked' : '') + (d.bonus ? ' bonus' : '');
      var info = document.createElement('div');
      var h = document.createElement('h3'); h.textContent = L.t(d.nameKey);
      var p = document.createElement('p'); p.textContent = L.t(d.introKey);
      var meta = document.createElement('p'); meta.className = 'meta';
      var best = save.best[d.id];
      meta.textContent = locked ? L.t('map_locked') :
        L.t('map_meta', { n: d.stashes.length, m: Math.round(d.time / 60) }) +
        (best ? ' · ' + L.t('map_best', { d: best.delivered, n: best.total, t: fmtTime(best.time) }) : '');
      info.appendChild(h); info.appendChild(p); info.appendChild(meta);
      var btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'btn primary'; btn.textContent = L.t('play'); btn.disabled = locked;
      btn.addEventListener('click', function () { startMap(i); });
      card.appendChild(info); card.appendChild(btn);
      host.appendChild(card);
    });
    var t = G.campaign();
    $('campaign-total').textContent = t.maps ? L.t('res_campaign', { huf: L.num(t.huf), eur: L.num(t.eur), usd: L.num(t.usd) }) : '';
  }

  function fillResults(r) {
    $('res-title').textContent = L.t(r.win ? 'results_win' : 'results_lose');
    var st = $('res-stamp');
    st.setAttribute('data-i18n', r.win ? 'stamp' : 'stamp_lose');
    st.textContent = L.t(r.win ? 'stamp' : 'stamp_lose');
    st.classList.toggle('lose', !r.win);
    $('res-huf').textContent = L.num(r.huf) + ' Ft';
    $('res-eur').textContent = L.num(r.eur) + ' €';
    $('res-usd').textContent = L.num(r.usd) + ' $';
    $('res-cases').textContent = r.delivered + '/' + r.total;
    $('res-time').textContent = fmtTime(r.time);
    $('res-digs').textContent = String(r.digs);
    $('res-rank').textContent = L.t('rank_' + r.rank);
    $('res-lost').textContent = r.lost ? L.t('res_lost', { n: r.lost }) : '';
    $('res-ach').textContent = (r.ach && r.ach.length) ? L.t('res_ach') + ': ' + r.ach.map(function (k) { return L.t(k); }).join(' · ') : '';
    var nextIdx = r.map + 1, def = ASO.Maps.list[r.map], canNext = r.win && !def.bonus && nextIdx < 4;
    $('btn-next').classList.toggle('hidden', !canNext);
    var t = G.campaign();
    $('res-next').textContent = (canNext ? L.t('res_next_hint') + ' ' : '') +
      (t.maps ? L.t('res_campaign', { huf: L.num(t.huf), eur: L.num(t.eur), usd: L.num(t.usd) }) : '');
  }

  /* ---------- starting a map ---------- */
  function begin() {
    A.ensure();
    G.start();
    I.requestLock();
  }
  function startMap(i) {
    A.ensure();
    if (i === G.mapIndex()) { begin(); return; }
    $('loading-line').textContent = L.t(ASO.Maps.list[i].nameKey);
    show('loading');
    setTimeout(function () {
      try { G.loadMap(i); } catch (e) { if (window.console) console.error(e); show('screen-error'); return; }
      begin();
    }, 60);
  }

  function boot() {
    try {
      if (!window.THREE) throw new Error('three.js did not load');
      G = ASO.Game;
      G.init($('view'), 0);
    } catch (e) {
      if (window.console) console.error(e);
      show('screen-error');
      return;
    }

    G.onState = function (m, data) {
      if (m === 'playing') show('');
      else if (m === 'paused') { updateToggles(); show('screen-pause'); }
      else if (m === 'title') show('screen-title');
      else if (m === 'results') { lastRes = data; fillResults(data); $('share-note').textContent = ''; show('screen-results'); }
    };
    I.onLockChange = function (locked) {
      if (!locked && G.mode() === 'playing' && !I.isTouch && !G.phoneOpen()) G.pause();
    };
    I.onLockError = function () {
      if (G.mode() === 'playing') G.toast(L.t('toast_lockfail'), 5);
    };

    $('btn-start').addEventListener('click', function () { A.ensure(); A.ui(); renderMaps(); show('screen-maps'); });
    $('btn-maps-back').addEventListener('click', function () { A.ui(); show('screen-title'); });
    $('btn-help').addEventListener('click', function () { A.ensure(); A.ui(); show('screen-help'); });
    $('btn-help-back').addEventListener('click', function () { A.ui(); show('screen-title'); });
    $('btn-resume').addEventListener('click', function () { A.ensure(); G.resume(); });
    $('btn-menu').addEventListener('click', function () { G.toMenu(); });
    $('btn-menu2').addEventListener('click', function () { G.toMenu(); });
    $('btn-maps2').addEventListener('click', function () { renderMaps(); show('screen-maps'); });
    $('btn-again').addEventListener('click', begin);
    $('btn-next').addEventListener('click', function () { startMap(G.mapIndex() + 1); });
    $('btn-pause').addEventListener('click', function () { G.pause(); });
    $('btn-sound').addEventListener('click', function () { A.ensure(); A.setMuted(!A.isMuted()); updateToggles(); G.refreshText(); });
    $('btn-sound2').addEventListener('click', function () { A.ensure(); A.setMuted(!A.isMuted()); updateToggles(); });
    $('btn-music').addEventListener('click', function () { A.ensure(); A.setMusic(!A.isMusic()); updateToggles(); });

    var langBtns = document.querySelectorAll('.langbtn');
    for (var i = 0; i < langBtns.length; i++) {
      langBtns[i].addEventListener('click', function (e) { L.setLang(e.currentTarget.getAttribute('data-lang')); });
    }
    L.onChange(function () {
      $('loading-line').textContent = L.t('loading_line');
      updateToggles();
      G.refreshText();
      if (current === 'screen-maps') renderMaps();
      if (lastRes && current === 'screen-results') fillResults(lastRes);
    });

    $('btn-share').addEventListener('click', function () {
      var txt = G.shareText() + ' ' + location.href;
      var note = $('share-note');
      var fallback = function () { note.textContent = txt; };
      if (navigator.share) {
        navigator.share({ text: txt }).catch(function () { /* cancelled */ });
      } else if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(function () { note.textContent = L.t('copied'); }, fallback);
      } else { fallback(); }
    });

    /* keys: pause, phone, whistle, and the classic cheat code (unlocks the cow level on the menus) */
    var code = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'KeyB', 'KeyA'], pos = 0;
    window.addEventListener('keydown', function (e) {
      if (e.code === 'Escape') {
        if (G.phoneOpen()) { G.closePhone(); return; }
        if (G.mode() === 'playing') G.pause();
      } else if (e.code === 'KeyP') {
        if (G.mode() === 'playing') G.pause();
        else if (G.mode() === 'paused') { A.ensure(); G.resume(); }
      } else if (e.code === 'KeyF') {
        if (G.mode() === 'playing') G.togglePhone();
      } else if (e.code === 'KeyQ') {
        G.whistle();
      }
      if (e.code === code[pos]) {
        pos++;
        if (pos === code.length) {
          pos = 0;
          if (G.mode() === 'playing') G.cow();
          else if (current === 'screen-title' || current === 'screen-maps') {
            A.ensure(); A.moo(); G.unlockBonus();
            $('title-note').textContent = L.t('cow_unlocked');
            if (current === 'screen-maps') renderMaps();
          }
        }
      } else { pos = (e.code === code[0]) ? 1 : 0; }
    });

    updateToggles();
    show('screen-title');
  }

  /* let the loading screen paint first, then build the world */
  setTimeout(boot, 60);
})();
