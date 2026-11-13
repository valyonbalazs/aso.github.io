/* Keyboard + mouse (pointer lock, drag-look fallback) + touch controls. */
(function () {
  'use strict';
  window.ASO = window.ASO || {};

  var I = {
    moveX: 0, moveZ: 0, run: false, dig: false,
    locked: false, lockFailed: false, enabled: false,
    isTouch: ('ontouchstart' in window) || (navigator.maxTouchPoints > 0),
    onLockChange: null, onLockError: null
  };

  var keys = {};
  var look = { dx: 0, dy: 0 };
  var mouseDig = false, dragLook = false, touchDig = false;
  var joy = { id: null, x: 0, y: 0 };
  var lookTouch = { id: null, x: 0, y: 0 };
  var canvas = null, joyEl = null, knobEl = null, digBtn = null;

  var MOUSE_SENS = 0.0022, TOUCH_SENS = 0.0052;

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  I.init = function (cv) {
    canvas = cv;
    joyEl = document.getElementById('joy');
    knobEl = document.getElementById('knob');
    digBtn = document.getElementById('btn-dig');

    window.addEventListener('keydown', function (e) {
      keys[e.code] = true;
      if (I.enabled && (e.code.indexOf('Arrow') === 0 || e.code === 'Space')) e.preventDefault();
    });
    window.addEventListener('keyup', function (e) { keys[e.code] = false; });
    window.addEventListener('blur', function () { I.reset(); });

    canvas.addEventListener('mousedown', function (e) {
      if (!I.enabled || e.button !== 0 || I.isTouch) return;
      if (I.locked) { mouseDig = true; return; }
      if (!I.lockFailed) I.requestLock();
      dragLook = true;
    });
    window.addEventListener('mouseup', function (e) {
      if (e.button !== 0) return;
      mouseDig = false; dragLook = false;
    });
    window.addEventListener('mousemove', function (e) {
      if (!I.enabled) return;
      if (I.locked || dragLook) {
        look.dx += e.movementX || 0;
        look.dy += e.movementY || 0;
      }
    });

    document.addEventListener('pointerlockchange', function () {
      I.locked = document.pointerLockElement === canvas;
      if (!I.locked) mouseDig = false;
      if (I.onLockChange) I.onLockChange(I.locked);
    });
    document.addEventListener('pointerlockerror', function () {
      I.lockFailed = true;
      if (I.onLockError) I.onLockError();
    });

    /* touch: joystick */
    if (joyEl) {
      joyEl.addEventListener('pointerdown', function (e) {
        if (joy.id !== null) return;
        joy.id = e.pointerId;
        try { joyEl.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        joyMove(e); e.preventDefault();
      });
      joyEl.addEventListener('pointermove', function (e) { if (e.pointerId === joy.id) joyMove(e); });
      var joyEnd = function (e) {
        if (e.pointerId !== joy.id) return;
        joy.id = null; joy.x = 0; joy.y = 0;
        if (knobEl) { knobEl.style.left = '42px'; knobEl.style.top = '42px'; }
      };
      joyEl.addEventListener('pointerup', joyEnd);
      joyEl.addEventListener('pointercancel', joyEnd);
    }
    /* touch: dig button */
    if (digBtn) {
      digBtn.addEventListener('pointerdown', function (e) {
        touchDig = true; digBtn.classList.add('down');
        try { digBtn.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        e.preventDefault();
      });
      var digEnd = function () { touchDig = false; digBtn.classList.remove('down'); };
      digBtn.addEventListener('pointerup', digEnd);
      digBtn.addEventListener('pointercancel', digEnd);
      digBtn.addEventListener('lostpointercapture', digEnd);
    }
    /* touch: look by dragging anywhere on the canvas */
    canvas.addEventListener('pointerdown', function (e) {
      if (!I.enabled || e.pointerType === 'mouse' || lookTouch.id !== null) return;
      lookTouch.id = e.pointerId; lookTouch.x = e.clientX; lookTouch.y = e.clientY;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });
    canvas.addEventListener('pointermove', function (e) {
      if (e.pointerId !== lookTouch.id) return;
      look.dx += (e.clientX - lookTouch.x) * (TOUCH_SENS / MOUSE_SENS);
      look.dy += (e.clientY - lookTouch.y) * (TOUCH_SENS / MOUSE_SENS);
      lookTouch.x = e.clientX; lookTouch.y = e.clientY;
    });
    var lookEnd = function (e) { if (e.pointerId === lookTouch.id) lookTouch.id = null; };
    canvas.addEventListener('pointerup', lookEnd);
    canvas.addEventListener('pointercancel', lookEnd);
    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  };

  function joyMove(e) {
    var r = joyEl.getBoundingClientRect();
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2, rad = r.width / 2;
    var dx = (e.clientX - cx) / rad, dy = (e.clientY - cy) / rad;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len > 1) { dx /= len; dy /= len; }
    joy.x = dx; joy.y = dy;
    if (knobEl) {
      knobEl.style.left = (r.width / 2 - 26 + dx * (rad - 26)) + 'px';
      knobEl.style.top = (r.height / 2 - 26 + dy * (rad - 26)) + 'px';
    }
  }

  I.requestLock = function () {
    if (I.isTouch || !canvas || !canvas.requestPointerLock) return;
    try {
      var p = canvas.requestPointerLock();
      if (p && p.catch) p.catch(function () { I.lockFailed = true; });
    } catch (e) { I.lockFailed = true; }
  };
  I.releaseLock = function () {
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { /* ignore */ }
  };

  /* Called once per frame by the game. */
  I.poll = function () {
    var kx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
    var kz = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
    var jx = Math.abs(joy.x) > 0.12 ? joy.x : 0;
    var jz = Math.abs(joy.y) > 0.12 ? -joy.y : 0;
    var mx = kx + jx, mz = kz + jz;
    var len = Math.sqrt(mx * mx + mz * mz);
    if (len > 1) { mx /= len; mz /= len; }
    I.moveX = mx; I.moveZ = mz;
    I.run = !!(keys.ShiftLeft || keys.ShiftRight) || (len > 0.92 && (jx !== 0 || jz !== 0));
    I.dig = !!(keys.KeyE || mouseDig || touchDig);
  };
  I.consumeLook = function () {
    var r = { dx: look.dx * MOUSE_SENS, dy: look.dy * MOUSE_SENS };
    look.dx = 0; look.dy = 0;
    return r;
  };
  I.reset = function () {
    keys = {}; mouseDig = false; dragLook = false; touchDig = false;
    joy.id = null; joy.x = 0; joy.y = 0; lookTouch.id = null; look.dx = 0; look.dy = 0;
    if (digBtn) digBtn.classList.remove('down');
    if (knobEl) { knobEl.style.left = '42px'; knobEl.style.top = '42px'; }
  };
  I.clamp = clamp;

  ASO.Input = I;
})();
