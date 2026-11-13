/* Procedural audio (Web Audio). No audio files are needed.
   Real dog recordings are optional: see audio/dog/README.md */
(function () {
  'use strict';
  window.ASO = window.ASO || {};

  var A = {};
  var ctx = null, master = null, sfxBus = null, ambBus = null, musBus = null, noiseBuf = null;
  var vol = 0.8, muted = false, musicOn = false;
  var ambStops = [], musicStop = null, ambOn = false;
  var samples = { bark: [], sniff: [], yelp: [] };

  musicOn = true;
  try {
    muted = localStorage.getItem('aso.muted') === '1';
    if (localStorage.getItem('aso.music') === '0') musicOn = false;
  } catch (e) { /* ignore */ }
  var musicIntensity = 0.15;

  /* ---------- context ---------- */
  A.ensure = function () {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { ctx = null; return null; }
      master = ctx.createGain();
      master.gain.value = muted ? 0 : vol;
      var comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.ratio.value = 6;
      master.connect(comp); comp.connect(ctx.destination);
      sfxBus = ctx.createGain(); ambBus = ctx.createGain(); musBus = ctx.createGain();
      sfxBus.gain.value = 1; ambBus.gain.value = 0.9; musBus.gain.value = 0.5;
      sfxBus.connect(master); ambBus.connect(master); musBus.connect(master);
      var len = ctx.sampleRate * 2;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      loadSamples();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  };

  A.isMuted = function () { return muted; };
  A.isMusic = function () { return musicOn; };
  A.setMuted = function (b) {
    muted = !!b;
    try { localStorage.setItem('aso.muted', muted ? '1' : '0'); } catch (e) { /* ignore */ }
    if (ctx) master.gain.setTargetAtTime(muted ? 0 : vol, ctx.currentTime, 0.05);
  };
  A.setMusic = function (b) {
    musicOn = !!b;
    try { localStorage.setItem('aso.music', musicOn ? '1' : '0'); } catch (e) { /* ignore */ }
    if (!ctx) return;
    if (musicOn && ambOn) startMusic(); else stopMusic();
  };

  /* ---------- building blocks ---------- */
  function env(g, t, a, peak, dur) {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dur);
  }
  function tone(type, f0, f1, t, dur, peak, dest, att) {
    att = att || 0.005;
    var o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    var g = ctx.createGain(); env(g, t, att, peak, dur);
    o.connect(g); g.connect(dest || sfxBus);
    o.start(t); o.stop(t + att + dur + 0.05);
  }
  function noise(t, dur, peak, ftype, f0, q, dest, f1) {
    var s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    var f = ctx.createBiquadFilter(); f.type = ftype; f.Q.value = q || 1;
    f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    var g = ctx.createGain(); env(g, t, 0.004, peak, dur);
    s.connect(f); f.connect(g); g.connect(dest || sfxBus);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }
  function bell(t, f, dur, peak, dest) {
    tone('sine', f, f, t, dur, peak, dest);
    tone('sine', f * 2.01, f * 2.01, t, dur * 0.6, peak * 0.5, dest);
    tone('sine', f * 3.97, f * 3.97, t, dur * 0.3, peak * 0.25, dest);
  }
  function brass(t, f, dur, peak, dest) {
    var o = ctx.createOscillator(), o2 = ctx.createOscillator();
    o.type = 'sawtooth'; o2.type = 'sawtooth';
    o.frequency.value = f; o2.frequency.value = f * 1.006;
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(600, t);
    lp.frequency.exponentialRampToValueAtTime(2800, t + 0.06);
    lp.frequency.exponentialRampToValueAtTime(900, t + dur);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.03);
    g.gain.setValueAtTime(peak, t + Math.max(0.04, dur - 0.08));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(dest || sfxBus);
    o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }
  function trombone(t, f0, f1, dur, peak) {
    var o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.linearRampToValueAtTime(f1, t + dur);
    var l = ctx.createOscillator(); l.frequency.value = 5.5;
    var lg = ctx.createGain(); lg.gain.value = f0 * 0.03;
    l.connect(lg); lg.connect(o.frequency);
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.setValueAtTime(450, t);
    lp.frequency.linearRampToValueAtTime(1300, t + dur * 0.4);
    lp.frequency.linearRampToValueAtTime(500, t + dur);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.04);
    g.gain.setValueAtTime(peak, t + dur - 0.06);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp); lp.connect(g); g.connect(sfxBus);
    o.start(t); l.start(t); o.stop(t + dur + 0.05); l.stop(t + dur + 0.05);
  }
  function squeak(t) {
    var o = ctx.createOscillator(); o.type = 'triangle';
    o.frequency.setValueAtTime(700, t);
    o.frequency.linearRampToValueAtTime(1800, t + 0.07);
    o.frequency.linearRampToValueAtTime(950, t + 0.2);
    var g = ctx.createGain(); env(g, t, 0.01, 0.5, 0.2);
    o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.3);
  }
  function boing(t) {
    var o = ctx.createOscillator(); o.type = 'sine';
    var pts = [[0, 220], [0.05, 520], [0.12, 190], [0.2, 430], [0.3, 200], [0.4, 330]];
    o.frequency.setValueAtTime(pts[0][1], t);
    for (var i = 1; i < pts.length; i++) o.frequency.linearRampToValueAtTime(pts[i][1], t + pts[i][0]);
    var g = ctx.createGain(); env(g, t, 0.01, 0.5, 0.4);
    o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + 0.5);
  }

  /* ---------- dog (synthesized: glottal source + formant filters + growl + breath) ---------- */
  function formantVoice(t, dur, curve, forms, o) {
    var dest = o.dest || sfxBus;
    var src = ctx.createOscillator(); src.type = 'sawtooth';
    src.frequency.setValueCurveAtTime(curve, t, dur);
    var am = ctx.createGain(); am.gain.value = 1;
    var lfo = ctx.createOscillator(); lfo.frequency.value = o.growl || 65;
    var lg = ctx.createGain(); lg.gain.value = o.growlDepth === undefined ? 0.3 : o.growlDepth;
    lfo.connect(lg); lg.connect(am.gain);
    src.connect(am);
    var mix = ctx.createGain(); mix.gain.value = 1;
    forms.forEach(function (f) {
      var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = f.q;
      bp.frequency.setValueAtTime(f.f0, t);
      bp.frequency.linearRampToValueAtTime(f.f1, t + dur);
      var fg = ctx.createGain(); fg.gain.value = f.g;
      am.connect(bp); bp.connect(fg); fg.connect(mix);
    });
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4800;
    var env2 = ctx.createGain();
    var amp = (o.amp || 1) * 1.6;
    env2.gain.setValueAtTime(0.0001, t);
    env2.gain.exponentialRampToValueAtTime(amp, t + 0.012);
    env2.gain.setValueAtTime(amp * 0.85, t + dur * 0.55);
    env2.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.05);
    mix.connect(lp); lp.connect(env2); env2.connect(dest);
    src.start(t); lfo.start(t); src.stop(t + dur + 0.1); lfo.stop(t + dur + 0.1);
  }
  function dogBark(t, o) {
    o = o || {};
    var p = o.pitch || 1, dur = 0.17 * (o.len || 1), n = 9, curve = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      var k = i / (n - 1);
      curve[i] = (560 - 270 * Math.pow(k, 0.8)) * p * (1 + (Math.random() - 0.5) * 0.04);
    }
    formantVoice(t, dur, curve, [
      { f0: 820, f1: 600, q: 5, g: 1.0 },
      { f0: 1350, f1: 950, q: 6, g: 0.7 },
      { f0: 2700, f1: 2300, q: 8, g: 0.3 }
    ], o);
    noise(t, 0.05, 0.22 * (o.amp || 1), 'bandpass', 1800, 0.9, o.dest || sfxBus);
  }
  function dogYelp(t, o) {
    o = o || {};
    var curve = new Float32Array([780, 1250, 1700, 1550, 1250, 980, 830]);
    formantVoice(t, 0.3, curve, [
      { f0: 900, f1: 750, q: 6, g: 1.0 },
      { f0: 2300, f1: 2000, q: 8, g: 0.6 },
      { f0: 3300, f1: 3000, q: 8, g: 0.25 }
    ], { dest: o.dest, amp: (o.amp || 1) * 0.8, growl: 30, growlDepth: 0.15 });
    noise(t, 0.06, 0.12 * (o.amp || 1), 'bandpass', 2600, 1, o.dest || sfxBus);
  }
  function dogSniff(t, o) {
    o = o || {};
    var dest = o.dest || sfxBus, amp = o.amp || 1;
    var pulses = 4 + Math.floor(Math.random() * 3), at = t;
    for (var i = 0; i < pulses; i++) {
      var a = Math.max(0.12, 0.55 - i * 0.07) * amp;
      noise(at, 0.07, a, 'bandpass', 2100 + Math.random() * 700, 0.8, dest);
      noise(at, 0.05, a * 0.5, 'highpass', 1200, 0.5, dest);
      tone('sine', 140, 90, at, 0.05, 0.1 * amp, dest);
      at += 0.1 + Math.random() * 0.05;
    }
    noise(at, 0.22, 0.22 * amp, 'lowpass', 900, 0.6, dest, 300);
  }
  function playSample(kind, dest) {
    var list = samples[kind];
    if (!list || !list.length) return false;
    var s = ctx.createBufferSource();
    s.buffer = list[Math.floor(Math.random() * list.length)];
    s.playbackRate.value = 0.95 + Math.random() * 0.1;
    var g = ctx.createGain(); g.gain.value = 0.9;
    s.connect(g); g.connect(dest || sfxBus); s.start();
    return true;
  }
  function spatial(dist, pan) {
    var g = ctx.createGain();
    g.gain.value = Math.max(0.08, 1 / (1 + dist * 0.09));
    if (ctx.createStereoPanner) {
      var p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan || 0));
      g.connect(p); p.connect(sfxBus);
    } else { g.connect(sfxBus); }
    return g;
  }
  /* kind: bark | barks | yelp | sniff */
  A.dog = function (kind, dist, pan) {
    if (!ctx || muted) return;
    var t = ctx.currentTime + 0.02, dest = spatial(dist || 0, pan || 0);
    if (kind === 'bark') {
      if (!playSample('bark', dest)) {
        dogBark(t, { dest: dest, pitch: 1 });
        if (Math.random() < 0.6) dogBark(t + 0.24, { dest: dest, pitch: 0.94, amp: 0.85 });
      }
    } else if (kind === 'barks') {
      if (!playSample('bark', dest)) {
        var at = t;
        for (var i = 0; i < 3; i++) {
          dogBark(at, { dest: dest, pitch: 1.04 - i * 0.04, amp: 1 - i * 0.12 });
          at += 0.2 + Math.random() * 0.06;
        }
      }
    } else if (kind === 'yelp') {
      if (!playSample('yelp', dest)) dogYelp(t, { dest: dest });
    } else if (kind === 'sniff') {
      if (!playSample('sniff', dest)) dogSniff(t, { dest: dest });
    }
  };

  function loadSamples() {
    if (!window.fetch) return;
    try {
      fetch('audio/dog/samples.json').then(function (r) { return r.ok ? r.json() : null; }).then(function (man) {
        if (!man) return;
        ['bark', 'sniff', 'yelp'].forEach(function (k) {
          (man[k] || []).forEach(function (f) {
            fetch('audio/dog/' + f).then(function (r) { return r.arrayBuffer(); })
              .then(function (ab) { return ctx.decodeAudioData(ab); })
              .then(function (buf) { samples[k].push(buf); })
              .catch(function () { /* ignore */ });
          });
        });
      }).catch(function () { /* no manifest: use synthesized dog */ });
    } catch (e) { /* ignore */ }
  }

  /* ---------- ambience ---------- */
  function loop(fn, minMs, maxMs) {
    var id = null, alive = true;
    function go() {
      if (!alive || !ctx) return;
      fn(ctx.currentTime + 0.05);
      id = setTimeout(go, minMs + Math.random() * (maxMs - minMs));
    }
    id = setTimeout(go, 400);
    return function () { alive = false; clearTimeout(id); };
  }
  function hoot(t, dest) {
    tone('sine', 400, 360, t, 0.22, 0.5, dest, 0.05);
    tone('sine', 390, 300, t + 0.34, 0.5, 0.5, dest, 0.06);
  }
  function cricket(t, dest) {
    var base = 4200 + Math.random() * 400;
    for (var k = 0; k < 3; k++) tone('sine', base, base, t + k * 0.055, 0.035, 0.05, dest, 0.004);
  }
  function startWind(out) {
    var src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 380; bp.Q.value = 0.6;
    var mod = ctx.createGain(); mod.gain.value = 0.7;
    var l = ctx.createOscillator(); l.frequency.value = 0.13;
    var lg = ctx.createGain(); lg.gain.value = 0.35; l.connect(lg); lg.connect(mod.gain);
    var l2 = ctx.createOscillator(); l2.frequency.value = 0.09;
    var l2g = ctx.createGain(); l2g.gain.value = 140; l2.connect(l2g); l2g.connect(bp.frequency);
    src.connect(bp); bp.connect(mod); mod.connect(out);
    src.start(); l.start(); l2.start();
    return function () { [src, l, l2].forEach(function (n) { try { n.stop(); } catch (e) { /* ignore */ } }); };
  }
  function startMusic() {
    if (musicStop || !ctx) return;
    var step = 60 / 84 / 4, n = 0, next = ctx.currentTime + 0.1;
    /* eerie drone: two detuned saws a minor second apart + a sub, slowly breathing */
    var dOut = ctx.createGain(); dOut.gain.value = 0.0001; dOut.connect(musBus);
    dOut.gain.setTargetAtTime(0.55, ctx.currentTime, 2.5);
    var d1 = ctx.createOscillator(); d1.type = 'sawtooth'; d1.frequency.value = 55;
    var d2 = ctx.createOscillator(); d2.type = 'sawtooth'; d2.frequency.value = 58.27;
    var d3 = ctx.createOscillator(); d3.type = 'sine'; d3.frequency.value = 27.5;
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240; lp.Q.value = 2;
    var lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    var lg = ctx.createGain(); lg.gain.value = 110; lfo.connect(lg); lg.connect(lp.frequency);
    var dg = ctx.createGain(); dg.gain.value = 0.11;
    var sub = ctx.createGain(); sub.gain.value = 0.5;
    d1.connect(lp); d2.connect(lp); lp.connect(dg); dg.connect(dOut); d3.connect(sub); sub.connect(dOut);
    d1.start(); d2.start(); d3.start(); lfo.start();
    var bass = { 0: 55, 6: 55, 8: 65.41, 14: 49 };
    var bells = [659.25, 622.25, 493.88, 698.46, 440];
    var nBell = ctx.currentTime + 3, nCreak = ctx.currentTime + 10, nHeart = ctx.currentTime + 1, nWhisper = ctx.currentTime + 18;
    var id = setInterval(function () {
      var now = ctx.currentTime;
      while (next < now + 0.15) {
        var s = n % 32, b = s % 16;
        if (bass[b]) tone('triangle', bass[b] * 2, bass[b] * 1.96, next, 0.22, 0.5, musBus);
        if (s % 4 === 2) noise(next, 0.03, 0.05, 'highpass', 7000, 1, musBus);
        if (s === 22 || s === 28) tone('sine', 1244.5, 1244.5, next, 0.3, 0.05, musBus);
        next += step; n++;
      }
      if (now >= nBell) { bell(now + 0.05, bells[Math.floor(Math.random() * bells.length)], 2.4, 0.07, musBus); nBell = now + 3 + Math.random() * 5; }
      if (now >= nCreak) { noise(now + 0.05, 1.3, 0.09, 'bandpass', 300, 6, musBus, 900); nCreak = now + 14 + Math.random() * 14; }
      if (now >= nWhisper) { noise(now + 0.05, 1.9, 0.05, 'bandpass', 3800, 9, musBus, 3000); nWhisper = now + 20 + Math.random() * 20; }
      if (now >= nHeart) {
        var v = 0.05 + musicIntensity * 0.55;
        tone('sine', 62, 38, now + 0.02, 0.16, v, musBus); tone('sine', 58, 36, now + 0.2, 0.18, v * 0.8, musBus);
        nHeart = now + 1.2 - musicIntensity * 0.5;
      }
    }, 25);
    musicStop = function () {
      clearInterval(id);
      try { dOut.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.2); } catch (e) { /* ignore */ }
      setTimeout(function () { [d1, d2, d3, lfo].forEach(function (o) { try { o.stop(); } catch (e) { /* ignore */ } }); }, 800);
    };
  }
  A.setIntensity = function (v) { musicIntensity = Math.max(0, Math.min(1, v)); };
  function stopMusic() { if (musicStop) { musicStop(); musicStop = null; } }

  function mooFar(t, dest) {
    var o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(120, t); o.frequency.linearRampToValueAtTime(82, t + 1.4);
    var f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2.2;
    f.frequency.setValueAtTime(480, t); f.frequency.linearRampToValueAtTime(820, t + 0.6); f.frequency.linearRampToValueAtTime(400, t + 1.4);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1, t + 0.2); g.gain.setValueAtTime(1, t + 1.0); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    o.connect(f); f.connect(g); g.connect(dest);
    o.start(t); o.stop(t + 1.6);
  }
  /* cfg: { wind, crickets, owls, dog, extras: ['cows','traffic','church','drips','rumble'] } (all optional multipliers) */
  A.startAmbience = function (cfg) {
    if (!ctx || ambOn) return;
    cfg = cfg || {};
    ambOn = true;
    var k = function (v, d) { return v === undefined ? d : v; };
    var windOut = ctx.createGain(); windOut.gain.value = 0.3 * k(cfg.wind, 1); windOut.connect(ambBus);
    if (k(cfg.wind, 1) > 0) ambStops.push(startWind(windOut));
    var cr = ctx.createGain(); cr.gain.value = 1.15 * k(cfg.crickets, 1); cr.connect(ambBus);
    if (k(cfg.crickets, 1) > 0) ambStops.push(loop(function (t) {
      cricket(t, cr); cricket(t + 0.09, cr);
      if (Math.random() < 0.7) cricket(t + 0.21, cr);
      if (Math.random() < 0.4) cricket(t + 0.33, cr);
    }, 220, 750));
    var ow = ctx.createGain(); ow.gain.value = 1.0 * k(cfg.owls, 1); ow.connect(ambBus);
    if (k(cfg.owls, 1) > 0) ambStops.push(loop(function (t) {
      hoot(t, ow);
      if (Math.random() < 0.6) hoot(t + 1.6, ow);
    }, 4500, 9500));
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 800;
    var fd = ctx.createGain(); fd.gain.value = 0.22 * k(cfg.dog, 1); lp.connect(fd); fd.connect(ambBus);
    if (k(cfg.dog, 1) > 0) ambStops.push(loop(function (t) {
      if (!playSample('bark', lp)) { dogBark(t, { dest: lp, pitch: 0.82 }); dogBark(t + 0.3, { dest: lp, pitch: 0.8, amp: 0.8 }); }
    }, 11000, 24000));
    (cfg.extras || []).forEach(function (ex) {
      if (ex === 'cows') {
        var cg = ctx.createGain(); cg.gain.value = 0.25; cg.connect(ambBus);
        ambStops.push(loop(function (t) { mooFar(t, cg); }, 9000, 20000));
      } else if (ex === 'church') {
        var bg = ctx.createGain(); bg.gain.value = 0.2; bg.connect(ambBus);
        ambStops.push(loop(function (t) { for (var i = 0; i < 3; i++) bell(t + i * 1.6, 392, 2.4, 0.5, bg); }, 45000, 80000));
      } else if (ex === 'traffic') {
        var tg = ctx.createGain(); tg.gain.value = 0.35; tg.connect(ambBus);
        ambStops.push(loop(function (t) { noise(t, 3.2, 0.5, 'bandpass', 300, 1.2, tg, 900); }, 9000, 20000));
      } else if (ex === 'drips') {
        var dgn = ctx.createGain(); dgn.gain.value = 0.5; dgn.connect(ambBus);
        ambStops.push(loop(function (t) { tone('sine', 1500, 900, t, 0.09, 0.3, dgn, 0.003); tone('sine', 1500, 900, t + 0.22, 0.08, 0.1, dgn, 0.003); }, 1800, 4500));
        var cl = ctx.createGain(); cl.gain.value = 0.25; cl.connect(ambBus);
        ambStops.push(loop(function (t) { bell(t, 560 + Math.random() * 200, 0.7, 0.4, cl); }, 12000, 26000));
      } else if (ex === 'rumble') {
        var rg = ctx.createGain(); rg.gain.value = 0.35; rg.connect(ambBus);
        ambStops.push(loop(function (t) { noise(t, 4, 0.5, 'lowpass', 110, 0.8, rg, 70); }, 14000, 30000));
      }
    });
    if (musicOn) startMusic();
  };
  A.mooAt = function (dist, pan) {
    if (!on()) return;
    mooFar(T(), spatial(dist || 0, pan || 0));
  };
  A.rustle = function () {
    if (!on()) return;
    var t = T();
    noise(t, 0.16, 0.35, 'bandpass', 1900, 1.2, null, 1200);
    noise(t + 0.06, 0.12, 0.2, 'highpass', 3000, 1);
  };
  A.whistle = function () {
    if (!on()) return;
    var t = T();
    tone('sine', 1800, 2500, t, 0.2, 0.3, null, 0.02);
    tone('sine', 2500, 1900, t + 0.22, 0.25, 0.3, null, 0.02);
  };
  A.stopAmbience = function () {
    ambOn = false;
    if (A.stopWorld) A.stopWorld();
    ambStops.forEach(function (s) { try { s(); } catch (e) { /* ignore */ } });
    ambStops = [];
    stopMusic();
  };

  /* ---------- game sounds ---------- */
  function T() { return ctx.currentTime + 0.01; }
  function on() { return ctx && !muted; }

  A.step = function (run) {
    if (!on()) return;
    var t = T();
    noise(t, 0.07, run ? 0.2 : 0.13, 'lowpass', 420 + Math.random() * 200, 0.8, null, 200);
    noise(t, 0.05, 0.05, 'highpass', 3000, 1);
    tone('sine', 90 + Math.random() * 20, 60, t, 0.06, 0.1);
  };
  A.beep = function (hz) {
    if (!on()) return;
    var t = T();
    tone('square', hz, hz, t, 0.1, 0.08);
    tone('sine', hz, hz, t, 0.1, 0.22);
  };
  A.dig = function () {
    if (!on()) return;
    var t = T();
    noise(t, 0.2, 0.8, 'lowpass', 700, 0.7);
    tone('sine', 110, 45, t, 0.18, 0.8);
    noise(t + 0.05, 0.3, 0.3, 'bandpass', 900, 1.5, null, 2200);
  };
  A.toss = function () {
    if (!on()) return;
    var t = T();
    noise(t, 0.22, 0.45, 'lowpass', 1400, 0.8, null, 400);
    for (var i = 0; i < 3; i++) noise(t + 0.12 + Math.random() * 0.2, 0.02, 0.25, 'highpass', 3000, 1);
  };
  A.found = function () {
    if (!on()) return;
    var t = T();
    tone('triangle', 160, 70, t, 0.22, 0.8);
    noise(t, 0.12, 0.5, 'bandpass', 800, 2);
    bell(t + 0.12, 1568, 0.7, 0.25);
  };
  A.cash = function () {
    if (!on()) return;
    var t = T();
    noise(t, 0.03, 0.5, 'highpass', 4000, 1);
    bell(t + 0.02, 2093, 0.5, 0.3);
    bell(t + 0.14, 2794, 0.9, 0.3);
  };
  A.coins = function () {
    if (!on()) return;
    var t = T();
    for (var i = 0; i < 14; i++) bell(t + Math.random() * 0.8, 2500 + Math.random() * 2600, 0.25, 0.08);
  };
  A.van = function () {
    if (!on()) return;
    var t = T();
    noise(t, 0.35, 0.8, 'lowpass', 500, 0.8);
    tone('sine', 70, 38, t, 0.3, 0.8);
    noise(t + 0.14, 0.03, 0.5, 'highpass', 3500, 1);
  };
  A.stamp = function () {
    if (!on()) return;
    var t = T();
    tone('sine', 130, 50, t, 0.2, 0.9);
    noise(t, 0.1, 0.6, 'lowpass', 900, 1);
    noise(t + 0.14, 0.12, 0.3, 'highpass', 2500, 1);
  };
  A.fanfare = function () {
    if (!on()) return;
    var t = T();
    [523.25, 659.25, 783.99].forEach(function (f, i) { brass(t + i * 0.13, f, 0.16, 0.2); });
    brass(t + 0.39, 1046.5, 0.7, 0.24); brass(t + 0.39, 783.99, 0.7, 0.16);
  };
  A.sad = function () {
    if (!on()) return;
    var t = T();
    trombone(t, 233, 233, 0.38, 0.28); trombone(t + 0.4, 220, 220, 0.38, 0.28);
    trombone(t + 0.8, 208, 208, 0.38, 0.28); trombone(t + 1.2, 196, 150, 1.0, 0.3);
  };
  A.ping = function () {
    if (!on()) return;
    var t = T();
    tone('sine', 880, 880, t, 0.16, 0.35, null, 0.01);
    tone('sine', 1318, 1318, t + 0.12, 0.28, 0.35, null, 0.01);
  };
  A.boot = function () {
    if (!on()) return;
    var t = T();
    tone('triangle', 160, 60, t, 0.2, 0.7);
    noise(t, 0.12, 0.45, 'bandpass', 700, 2);
    boing(t + 0.18);
  };
  A.duck = function () { if (!on()) return; var t = T(); squeak(t); squeak(t + 0.3); };
  A.moo = function () {
    if (!on()) return;
    var t = T();
    var o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(140, t); o.frequency.linearRampToValueAtTime(95, t + 1.2);
    var l = ctx.createOscillator(); l.frequency.value = 6;
    var lg = ctx.createGain(); lg.gain.value = 4; l.connect(lg); lg.connect(o.frequency);
    var f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2.5;
    f.frequency.setValueAtTime(500, t); f.frequency.linearRampToValueAtTime(900, t + 0.5);
    f.frequency.linearRampToValueAtTime(420, t + 1.2);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(1.3, t + 0.15);
    g.gain.setValueAtTime(1.3, t + 0.9); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.3);
    o.connect(f); f.connect(g); g.connect(sfxBus);
    o.start(t); l.start(t); o.stop(t + 1.4); l.stop(t + 1.4);
  };
  A.ui = function () { if (!on()) return; tone('sine', 700, 900, T(), 0.06, 0.2); };

  /* ---------- v1.1: world sounds (sirens, helicopter, rain, thunder, van, safe, voices) ---------- */
  var sirens = {}, heli = null, rain = null;

  A.siren = function (i, gain, pan) {
    if (!ctx) return;
    var s = sirens[i];
    if (!s) {
      if (gain < 0.002) return;
      var o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 900;
      var lfo = ctx.createOscillator(); lfo.type = 'triangle'; lfo.frequency.value = 0.5 + i * 0.13;
      var lg = ctx.createGain(); lg.gain.value = 280; lfo.connect(lg); lg.connect(o.frequency);
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
      var g = ctx.createGain(); g.gain.value = 0;
      var p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      o.connect(lp); lp.connect(g);
      if (p) { g.connect(p); p.connect(ambBus); } else g.connect(ambBus);
      o.start(); lfo.start();
      s = sirens[i] = { o: o, lfo: lfo, g: g, p: p };
    }
    s.g.gain.setTargetAtTime(muted ? 0 : Math.min(0.16, gain), ctx.currentTime, 0.1);
    if (s.p) s.p.pan.setTargetAtTime(pan || 0, ctx.currentTime, 0.1);
  };
  A.sirenStop = function () {
    for (var k in sirens) { try { sirens[k].o.stop(); sirens[k].lfo.stop(); } catch (e) { /* ignore */ } }
    sirens = {};
  };

  A.heli = function (gain, pan) {
    if (!ctx) return;
    if (!heli) {
      if (gain < 0.002) return;
      var src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 280;
      var am = ctx.createGain(); am.gain.value = 0.55;
      var lfo = ctx.createOscillator(); lfo.frequency.value = 11;
      var lg = ctx.createGain(); lg.gain.value = 0.45; lfo.connect(lg); lg.connect(am.gain);
      var g = ctx.createGain(); g.gain.value = 0;
      var p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      src.connect(lp); lp.connect(am); am.connect(g);
      if (p) { g.connect(p); p.connect(ambBus); } else g.connect(ambBus);
      src.start(); lfo.start();
      heli = { src: src, lfo: lfo, g: g, p: p };
    }
    heli.g.gain.setTargetAtTime(muted ? 0 : Math.min(0.9, gain), ctx.currentTime, 0.15);
    if (heli.p) heli.p.pan.setTargetAtTime(pan || 0, ctx.currentTime, 0.15);
  };
  A.heliStop = function () {
    if (!heli) return;
    try { heli.src.stop(); heli.lfo.stop(); } catch (e) { /* ignore */ }
    heli = null;
  };

  A.rain = function (on) {
    if (!ctx) return;
    if (on && !rain) {
      var src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
      var hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1400;
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 7000;
      var g = ctx.createGain(); g.gain.value = 0;
      src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(ambBus);
      src.start();
      g.gain.setTargetAtTime(0.28, ctx.currentTime, 1.5);
      rain = { src: src, g: g };
    } else if (!on && rain) {
      var r = rain; rain = null;
      r.g.gain.setTargetAtTime(0, ctx.currentTime, 0.8);
      setTimeout(function () { try { r.src.stop(); } catch (e) { /* ignore */ } }, 3500);
    }
  };
  A.thunder = function (delay) {
    if (!on()) return;
    var t = ctx.currentTime + (delay || 0);
    noise(t, 0.14, 0.6, 'highpass', 2000, 1);
    noise(t + 0.04, 2.8, 0.9, 'lowpass', 220, 0.7, null, 60);
    tone('sine', 55, 38, t + 0.05, 2.2, 0.5);
  };
  A.honk = function () {
    if (!on()) return;
    var t = T();
    tone('square', 440, 440, t, 0.16, 0.12); tone('square', 554, 554, t, 0.16, 0.1);
    tone('square', 440, 440, t + 0.24, 0.2, 0.12); tone('square', 554, 554, t + 0.24, 0.2, 0.1);
  };
  A.engine = function () {
    if (!on()) return;
    var t = T();
    var o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(60, t); o.frequency.linearRampToValueAtTime(150, t + 1.6); o.frequency.linearRampToValueAtTime(70, t + 3.2);
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t + 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
    o.connect(lp); lp.connect(g); g.connect(sfxBus);
    o.start(t); o.stop(t + 3.3);
    noise(t, 3.0, 0.15, 'lowpass', 300, 0.7);
  };
  A.safeClick = function () {
    if (!on()) return;
    var t = T();
    noise(t, 0.02, 0.7, 'highpass', 3500, 1);
    tone('square', 1800, 1500, t, 0.04, 0.12);
  };
  A.safeOpen = function () {
    if (!on()) return;
    var t = T();
    tone('sine', 90, 40, t, 0.3, 0.9);
    noise(t, 0.2, 0.7, 'lowpass', 600, 1);
    bell(t + 0.2, 1568, 0.9, 0.25);
  };
  A.alarm = function () {
    if (!on()) return;
    var t = T();
    for (var i = 0; i < 4; i++) tone('square', i % 2 ? 520 : 760, i % 2 ? 520 : 760, t + i * 0.13, 0.12, 0.14);
  };
  A.logs = function () {
    if (!on()) return;
    var t = T();
    tone('triangle', 220, 110, t, 0.12, 0.7);
    noise(t, 0.1, 0.5, 'bandpass', 500, 1.5);
  };
  A.coffee = function () {
    if (!on()) return;
    var t = T();
    for (var i = 0; i < 3; i++) tone('sine', 320 - i * 40, 200, t + i * 0.12, 0.09, 0.3);
    bell(t + 0.45, 1976, 0.5, 0.2);
  };
  A.digFar = function (dist, pan) {
    if (!on()) return;
    var t = T(), d = spatial(dist || 0, pan || 0);
    noise(t, 0.2, 0.8, 'lowpass', 700, 0.7, d);
    tone('sine', 110, 45, t, 0.18, 0.8, d);
  };
  A.shout = function (dist, pan) {
    if (!on()) return;
    var t = T();
    formantVoice(t, 0.35, new Float32Array([180, 235, 215, 170]), [
      { f0: 600, f1: 450, q: 5, g: 1.0 },
      { f0: 1700, f1: 2000, q: 6, g: 0.6 },
      { f0: 2600, f1: 2700, q: 8, g: 0.3 }
    ], { dest: spatial(dist || 0, pan || 0), amp: 0.9, growl: 40, growlDepth: 0.05 });
  };
  A.stopWorld = function () { A.sirenStop(); A.heliStop(); A.rain(false); };

  ASO.Audio = A;
})();
