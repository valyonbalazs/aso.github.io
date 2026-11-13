/* NPCs, rival thief, police cars, helicopter, weather and pickups. Everything map-specific comes from the map definition. */
(function () {
  'use strict';
  window.ASO = window.ASO || {};

  function create(W, hooks) {
    var T = THREE, A = ASO.Audio, tr = ASO.i18n.t;
    var scene = W.scene, ph = W.phong, hY = W.heightAt, L = W.layout, MAP_R = W.mapRadius, def = W.def;
    var rand = W.mulberry(424242);
    var X = { t: 0, heliRepeat: false };
    var hemiBase = W.lights.hemiBase;

    var M = {
      skin: ph(0xb98c68), vest: ph(0x1f3a5f), gold: ph(0xf2b84b), pants: ph(0x1b2530), cap: ph(0x14243d),
      hood: ph(0x1c1c20), hoodDark: ph(0x111114), wood: ph(0x5b3d24), metal: ph(0x4a5a63), white: ph(0xe8ecef),
      blue: ph(0x1a2b44), orange: ph(0xf08a1d)
    };
    function mesh(g, m, x, y, z) {
      var o = new T.Mesh(g, m);
      if (x !== undefined) o.position.set(x, y, z);
      return o;
    }
    function box(w, h, d) { return new T.BoxGeometry(w, h, d); }
    function relPan(P, x, z) {
      var vx = x - P.x, vz = z - P.z;
      var fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
      return { d: Math.sqrt(vx * vx + vz * vz), pan: Math.sin(Math.atan2(rx * vx + rz * vz, fx * vx + fz * vz)) };
    }
    function wrap(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }

    /* ---------- little scenery helpers ---------- */
    function holeDecor(x, z) {
      var g = new T.Group();
      var disc = mesh(new T.CircleGeometry(0.8, 14), ph(0x0b0805, { polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), 0, 0.09, 0);
      disc.rotation.x = -Math.PI / 2;
      var mound = mesh(new T.TorusGeometry(1.0, 0.28, 6, 14), ph(def.dirtColor || 0x4a3a2a), 0, 0.1, 0);
      mound.rotation.x = Math.PI / 2; mound.scale.set(1, 1, 0.55);
      g.add(disc, mound); g.position.set(x, hY(x, z), z);
      scene.add(g);
    }
    function cone(x, z) {
      var g = new T.Group();
      g.add(mesh(new T.ConeGeometry(0.22, 0.6, 8), M.orange, 0, 0.3, 0));
      g.add(mesh(box(0.5, 0.05, 0.5), ph(0x2a1e16), 0, 0.03, 0));
      g.position.set(x, hY(x, z), z); scene.add(g);
    }

    /* ---------- police car ---------- */
    function makePoliceCar() {
      var g = new T.Group();
      g.add(mesh(box(1.8, 0.65, 4.2), M.white, 0, 0.7, 0));
      g.add(mesh(box(1.82, 0.22, 4.22), M.blue, 0, 0.62, 0));
      g.add(mesh(box(1.6, 0.6, 2.0), M.blue, 0, 1.3, -0.2));
      var wheelGeo = new T.CylinderGeometry(0.36, 0.36, 0.3, 10);
      [[-0.9, 1.3], [0.9, 1.3], [-0.9, -1.3], [0.9, -1.3]].forEach(function (p) {
        var w = mesh(wheelGeo, ph(0x0b0f12), p[0], 0.36, p[1]); w.rotation.z = Math.PI / 2; g.add(w);
      });
      var a = new T.MeshBasicMaterial({ color: 0x3a7bff, fog: false }), b = new T.MeshBasicMaterial({ color: 0xff3030, fog: false });
      g.add(mesh(box(0.55, 0.16, 0.34), a, -0.4, 1.68, -0.2));
      g.add(mesh(box(0.55, 0.16, 0.34), b, 0.4, 1.68, -0.2));
      var head = new T.MeshBasicMaterial({ color: 0xfff1b8 }), tail = new T.MeshBasicMaterial({ color: 0xc02020 });
      g.add(mesh(box(0.3, 0.14, 0.06), head, -0.6, 0.78, 2.12)); g.add(mesh(box(0.3, 0.14, 0.06), head, 0.6, 0.78, 2.12));
      g.add(mesh(box(0.3, 0.12, 0.06), tail, -0.6, 0.78, -2.12)); g.add(mesh(box(0.3, 0.12, 0.06), tail, 0.6, 0.78, -2.12));
      return {
        g: g,
        flash: function (t) {
          var on = Math.floor(t * 4.5) % 2 === 0;
          a.color.setHex(on ? 0x3a7bff : 0x0b1a33);
          b.color.setHex(on ? 0x2a0b0b : 0xff3030);
        }
      };
    }
    var parked = null;
    if (L.police) {
      parked = makePoliceCar();
      var pp = L.police;
      parked.g.position.set(pp.x, hY(pp.x, pp.z), pp.z);
      parked.g.rotation.y = 1.2;
      scene.add(parked.g);
      W.addObstacle(pp.x + 0.6, pp.z - 0.8, 1.2); W.addObstacle(pp.x - 0.6, pp.z + 0.8, 1.2);
      cone(pp.x - 3.5, pp.z - 6); cone(pp.x - 1.5, pp.z - 6.6); cone(pp.x + 0.5, pp.z - 7); cone(pp.x + 2.5, pp.z - 7.2);
      var lamp = new T.PointLight(0x4060ff, 1.3, 16, 1.5);
      lamp.position.set(pp.x, hY(pp.x, pp.z) + 2.2, pp.z);
      scene.add(lamp);
      X.parkedLamp = lamp;
    }
    L.diggers.forEach(function (d) { holeDecor(d.x, d.z); });

    /* ================= NPC agents ================= */
    var AG = { torso: box(0.5, 0.62, 0.28), stripe: box(0.52, 0.08, 0.3), head: box(0.26, 0.28, 0.26), cap: box(0.3, 0.09, 0.3),
               brim: box(0.22, 0.04, 0.14), arm: box(0.12, 0.55, 0.12), leg: box(0.16, 0.78, 0.16) };
    var beamGeo = new T.ConeGeometry(2.0, 8, 10, 1, true);
    var beamMat = new T.MeshBasicMaterial({ color: 0xfff0c8, transparent: true, opacity: 0.09, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide });
    var beamRed = new T.MeshBasicMaterial({ color: 0xff5050, transparent: true, opacity: 0.08, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide });

    function makeAgent(rival, beamOn) {
      var g = new T.Group(), body = rival ? M.hood : M.vest;
      g.add(mesh(AG.torso, body, 0, 1.15, 0));
      if (!rival) g.add(mesh(AG.stripe, M.gold, 0, 1.1, 0));
      var head = new T.Group(); head.position.set(0, 1.62, 0);
      head.add(mesh(AG.head, M.skin, 0, 0, 0));
      head.add(mesh(AG.cap, rival ? M.hoodDark : M.cap, 0, 0.17, 0));
      if (!rival) head.add(mesh(AG.brim, M.cap, 0, 0.13, 0.17));
      g.add(head);
      var armL = new T.Group(), armR = new T.Group(), legL = new T.Group(), legR = new T.Group();
      armL.position.set(-0.33, 1.42, 0); armR.position.set(0.33, 1.42, 0);
      armL.add(mesh(AG.arm, body, 0, -0.26, 0)); armR.add(mesh(AG.arm, body, 0, -0.26, 0));
      legL.position.set(-0.13, 0.82, 0); legR.position.set(0.13, 0.82, 0);
      legL.add(mesh(AG.leg, M.pants, 0, -0.39, 0)); legR.add(mesh(AG.leg, M.pants, 0, -0.39, 0));
      g.add(armL, armR, legL, legR);
      var beam = null;
      if (beamOn) {
        beam = new T.Group(); beam.position.set(0, 0, 0.15); beam.rotation.x = 0.28;
        var cone2 = mesh(beamGeo, rival ? beamRed : beamMat, 0, 0, 4.0);
        cone2.rotation.x = -Math.PI / 2;
        beam.add(cone2); head.add(beam);
      }
      return { g: g, head: head, armL: armL, armR: armR, legL: legL, legR: legR, beam: beam,
               x: 0, z: 0, yaw: 0, phase: 0, t: 0, cool: 3 + rand() * 6, stuck: 0, lx: 0, lz: 0 };
    }
    function addShovel(a) {
      var tool = new T.Group();
      tool.add(mesh(box(0.04, 0.9, 0.04), M.wood, 0, 0, 0));
      tool.add(mesh(box(0.2, 0.24, 0.03), ph(0x9db0b8), 0, -0.5, 0));
      tool.position.set(0, -0.5, 0.12); tool.rotation.x = -0.5;
      a.armR.add(tool);
    }
    function place(a, x, z, yaw) {
      a.x = x; a.z = z; a.yaw = yaw; a.lx = x; a.lz = z;
      a.g.position.set(x, hY(x, z), z); a.g.rotation.y = yaw;
    }
    function walk(a, tx, tz, sp, dt) {
      var dx = tx - a.x, dz = tz - a.z, d = Math.sqrt(dx * dx + dz * dz);
      if (d < 0.05) return false;
      var step = Math.min(d, sp * dt), gp = d > 2.5 ? W.pathTarget(a, tx, tz, dt) : { x: tx, z: tz }, hd = d > 2.5 ? W.steer(a, gp.x, gp.z, 0.35) : Math.atan2(dx, dz);
      a.x += Math.sin(hd) * step; a.z += Math.cos(hd) * step;
      W.resolve(a, 0.35, true);
      if (Math.abs(a.x - a.lx) + Math.abs(a.z - a.lz) < sp * dt * 0.3) a.stuck += dt; else a.stuck = 0;
      if (a.stuck > 1.2) {
        var qx = -(tz - a.z), qz = (tx - a.x), ql = Math.sqrt(qx * qx + qz * qz) || 1;
        a.x += qx / ql * 1.6; a.z += qz / ql * 1.6; a.stuck = 0;
      }
      a.lx = a.x; a.lz = a.z;
      a.yaw += wrap(hd - a.yaw) * Math.min(1, dt * 8);
      a.phase += dt * sp * 5;
      a.g.position.set(a.x, hY(a.x, a.z), a.z); a.g.rotation.y = a.yaw;
      return true;
    }
    function swing(a, amp) {
      var s = Math.sin(a.phase) * amp;
      a.legL.rotation.x = s; a.legR.rotation.x = -s;
      a.armL.rotation.x = -s * 0.8; a.armR.rotation.x = s * 0.8;
    }

    /* ---- speech bubbles ---- */
    var host = document.getElementById('bubbles'), bubbles = [], proj = new T.Vector3();
    function say(a, key) {
      if (!host || bubbles.length >= 3) return;
      var el = document.createElement('div');
      el.className = 'bubble'; el.textContent = tr(key);
      host.appendChild(el);
      bubbles.push({ el: el, a: a, t: 3 });
    }
    function clearBubbles() {
      bubbles.forEach(function (b) { if (b.el.parentNode) b.el.parentNode.removeChild(b.el); });
      bubbles = [];
    }
    function updateBubbles(dt) {
      for (var i = bubbles.length - 1; i >= 0; i--) {
        var b = bubbles[i]; b.t -= dt;
        if (b.t <= 0) { if (b.el.parentNode) b.el.parentNode.removeChild(b.el); bubbles.splice(i, 1); continue; }
        proj.set(b.a.g.position.x, b.a.g.position.y + 2.15, b.a.g.position.z).project(W.camera);
        var vis = proj.z < 1 && Math.abs(proj.x) < 1.2 && Math.abs(proj.y) < 1.2;
        b.el.style.display = vis ? '' : 'none';
        if (vis) {
          b.el.style.left = ((proj.x * 0.5 + 0.5) * window.innerWidth) + 'px';
          b.el.style.top = ((-proj.y * 0.5 + 0.5) * window.innerHeight) + 'px';
        }
      }
    }

    /* ---- diggers ---- */
    var diggers = L.diggers.map(function (d) {
      var a = makeAgent(false, true); addShovel(a);
      place(a, d.x + 1.0, d.z, -Math.PI / 2);
      a.beam.rotation.x = 0.9; a.t = rand() * 6; a.strike = 0; a.hx = d.x; a.hz = d.z;
      scene.add(a.g);
      return a;
    });
    function updateDiggers(dt, P) {
      diggers.forEach(function (a) {
        a.t += dt;
        var c = a.t % 6, rp = relPan(P, a.x, a.z);
        if (c < 3.6) {
          var s = Math.sin(a.t * 7.5);
          a.armR.rotation.x = -0.9 - Math.abs(s) * 0.9; a.armL.rotation.x = a.armR.rotation.x * 0.8;
          a.head.rotation.y *= 0.9;
          a.strike -= dt;
          if (a.strike <= 0) {
            a.strike = 0.47;
            if (rp.d < 45) { A.digFar(rp.d, rp.pan); W.spawnDirt(a.hx, hY(a.hx, a.hz) + 0.3, a.hz, 2); }
          }
        } else if (c < 4.6) {
          a.armR.rotation.x *= 0.85; a.armL.rotation.x *= 0.85; a.head.rotation.y = Math.sin(a.t * 3) * 0.8;
        } else {
          a.armR.rotation.x *= 0.85; a.armL.rotation.x *= 0.85; a.head.rotation.y *= 0.9;
        }
        a.cool -= dt;
        if (a.cool <= 0) {
          a.cool = 8 + rand() * 8;
          if (rp.d < 16) say(a, 'npc_d' + (1 + Math.floor(rand() * 5)));
        }
      });
    }

    /* ---- searchers ---- */
    var searchers = L.search.map(function (c) {
      var a = makeAgent(false, true);
      a.wps = [[0, 0], [12, 6], [6, -10], [-8, -4]].map(function (o) { return { x: c.x + o[0], z: c.z + o[1] }; });
      a.wp = 0; a.wait = 0;
      place(a, a.wps[0].x, a.wps[0].z, rand() * 6);
      scene.add(a.g);
      return a;
    });
    function updateSearchers(dt, P) {
      searchers.forEach(function (a) {
        a.t += dt;
        var w = a.wps[a.wp], rp = relPan(P, a.x, a.z);
        if (a.wait > 0) {
          a.wait -= dt;
          a.armR.rotation.x = -0.6 - Math.abs(Math.sin(a.t * 5)) * 0.7;
          a.head.rotation.y = Math.sin(a.t * 1.6) * 0.8;
          a.legL.rotation.x *= 0.8; a.legR.rotation.x *= 0.8;
          if (a.wait <= 0) a.wp = (a.wp + 1) % a.wps.length;
        } else {
          var dx = w.x - a.x, dz = w.z - a.z;
          if (dx * dx + dz * dz < 0.5 || a.stuck > 1.1) { a.wait = 2.5 + rand() * 2; a.stuck = 0; }
          else {
            walk(a, w.x, w.z, 1.6, dt); swing(a, 0.6);
            a.head.rotation.y = Math.sin(a.t * 0.9) * 0.6;
          }
        }
        a.cool -= dt;
        if (a.cool <= 0) {
          a.cool = 9 + rand() * 9;
          if (rp.d < 16) say(a, 'npc_s' + (1 + Math.floor(rand() * 5)));
        }
      });
    }

    /* ================= rival thief ================= */
    var thief = { st: 'off', a: makeAgent(true, true), stash: null, t: 0, sfx: 0, caseMesh: null };
    addShovel(thief.a);
    (function () {
      var cm = new T.Group();
      cm.add(mesh(box(0.5, 0.26, 0.34), M.metal, 0, 0, 0));
      cm.add(mesh(box(0.08, 0.06, 0.04), M.gold, 0, 0.04, 0.19));
      cm.position.set(0, 1.2, -0.3); cm.visible = false;
      thief.a.g.add(cm); thief.caseMesh = cm;
      thief.a.g.visible = false;
      scene.add(thief.a.g);
    })();
    var dropMeshes = [];
    function makeCaseMesh() {
      var cm = new T.Group();
      cm.add(mesh(box(0.5, 0.26, 0.34), M.metal, 0, 0.13, 0));
      cm.add(mesh(box(0.08, 0.06, 0.04), M.gold, 0, 0.18, 0.19));
      return cm;
    }
    X.spawnThief = function (stash) {
      var a = thief.a, l = Math.sqrt(stash.x * stash.x + stash.z * stash.z) || 1;
      thief.st = 'approach'; thief.stash = stash; thief.t = 0; thief.sfx = 0;
      var sr = MAP_R - 6;
      place(a, stash.x / l * sr, stash.z / l * sr, 0);
      a.g.visible = true; thief.caseMesh.visible = false; a.stuck = 0;
    };
    X.thiefInfo = function () {
      var s = thief.st;
      return (s === 'approach' || s === 'dig' || s === 'flee') ? { x: thief.a.x, z: thief.a.z } : null;
    };
    X.thiefChase = function () {
      var s = thief.st;
      return (s === 'dig' || s === 'flee') ? { x: thief.a.x, z: thief.a.z } : null;
    };
    X.thiefState = function () { return thief.st; };
    X.removeDrop = function (stash) {
      for (var i = dropMeshes.length - 1; i >= 0; i--) {
        if (dropMeshes[i].stash === stash) { scene.remove(dropMeshes[i].m); dropMeshes.splice(i, 1); }
      }
    };
    function goFlee(carrying) {
      thief.st = carrying ? 'flee' : 'flee_empty';
      thief.a.beam.rotation.x = 0.28;
    }
    function updateThief(dt, P, D, S) {
      var th = thief;
      if (th.st === 'off' || th.st === 'gone' || !S) return;
      var a = th.a, st = th.stash;
      var dP = Math.sqrt((a.x - P.x) * (a.x - P.x) + (a.z - P.z) * (a.z - P.z));
      var dD = Math.sqrt((a.x - D.x) * (a.x - D.x) + (a.z - D.z) * (a.z - D.z));
      var rp = relPan(P, a.x, a.z), moving;
      a.t += dt;
      if (th.st === 'approach' || th.st === 'dig') {
        if (st.dug && !st.stolen) { goFlee(false); return; }
        if (dP < 9 || dD < 3.5) { A.shout(rp.d, rp.pan); hooks.onThiefScared(); goFlee(false); return; }
      }
      if (th.st === 'approach') {
        moving = walk(a, st.x + 1.1, st.z, 3.8, dt);
        swing(a, 0.7);
        if (!moving || Math.abs(a.x - (st.x + 1.1)) + Math.abs(a.z - st.z) < 0.6) {
          th.st = 'dig'; th.t = 0;
          a.yaw = -Math.PI / 2; a.g.rotation.y = a.yaw; a.beam.rotation.x = 0.9;
        }
      } else if (th.st === 'dig') {
        th.t += dt;
        var s = Math.sin(a.t * 7.5);
        a.armR.rotation.x = -0.9 - Math.abs(s) * 0.9; a.armL.rotation.x = a.armR.rotation.x * 0.8;
        th.sfx -= dt;
        if (th.sfx <= 0) {
          th.sfx = 0.55;
          if (rp.d < 60) { A.digFar(rp.d, rp.pan); W.spawnDirt(st.x, hY(st.x, st.z) + 0.3, st.z, 3); }
        }
        if (th.t >= 16) {
          st.dug = true; st.stolen = true; W.addHole(st);
          th.caseMesh.visible = true; goFlee(true);
          hooks.onThiefSteal(st);
        }
      } else if (th.st === 'flee' || th.st === 'flee_empty') {
        var l = Math.sqrt(a.x * a.x + a.z * a.z) || 1, sp = th.st === 'flee' ? 4.4 : 5.2;
        walk(a, a.x / l * (MAP_R + 8), a.z / l * (MAP_R + 8), sp, dt);
        swing(a, 0.9);
        if (th.st === 'flee' && (dP < 1.6 || dD < 1.8)) {
          th.caseMesh.visible = false;
          st.dug = false; st.drop = true; st.x = a.x; st.z = a.z; st.progress = 1;
          var m = makeCaseMesh(); m.position.set(a.x, hY(a.x, a.z), a.z);
          scene.add(m); dropMeshes.push({ stash: st, m: m });
          A.shout(rp.d, rp.pan);
          th.st = 'flee_empty';
          hooks.onThiefDrop(st);
          return;
        }
        if (l > MAP_R - 3) {
          th.caseMesh.visible = false; a.g.visible = false;
          var had = th.st === 'flee';
          th.st = 'gone';
          if (had) { st.lost = true; hooks.onThiefEscape(st); }
        }
      }
    }

    /* ================= police patrol along the road ================= */
    var path = L.patrol, total = 0, cum = [];
    if (path) {
      for (var pi = 0; pi < path.length; pi++) {
        var n2 = path[(pi + 1) % path.length];
        cum.push(total);
        total += Math.sqrt((n2.x - path[pi].x) * (n2.x - path[pi].x) + (n2.z - path[pi].z) * (n2.z - path[pi].z));
      }
    }
    function atPath(s) {
      s = ((s % total) + total) % total;
      var i = cum.length - 1;
      while (i > 0 && cum[i] > s) i--;
      var a = path[i], b = path[(i + 1) % path.length];
      var segLen = Math.sqrt((b.x - a.x) * (b.x - a.x) + (b.z - a.z) * (b.z - a.z)) || 1, k = (s - cum[i]) / segLen;
      return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, hx: (b.x - a.x) / segLen, hz: (b.z - a.z) / segLen };
    }
    var patrol = path ? [0, 1].map(function (i) {
      var car = makePoliceCar(); car.g.visible = false; scene.add(car.g);
      return { car: car, s: 0, dir: i ? -1 : 1, on: false, off: i * 75, i: i };
    }) : [];
    function updatePatrol(dt, P) {
      patrol.forEach(function (p) {
        var on = ((X.t + p.off) % 150) < 66;
        if (on && !p.on) { p.on = true; p.s = rand() * total; p.car.g.visible = true; }
        if (!on && p.on) { p.on = false; p.car.g.visible = false; }
        if (!p.on) { A.siren(p.i, 0, 0); return; }
        p.s += p.dir * 9 * dt;
        var q = atPath(p.s);
        p.car.g.position.set(q.x, hY(q.x, q.z), q.z);
        p.car.g.rotation.y = Math.atan2(q.hx * p.dir, q.hz * p.dir);
        p.car.flash(X.t + p.i * 0.11);
        var rp = relPan(P, q.x, q.z);
        A.siren(p.i, 0.55 / (1 + rp.d * 0.08), rp.pan);
      });
    }

    /* ================= helicopter ================= */
    var heli = { on: false, armed: false, next: 0, t: 0, dur: 14, from: null, to: null, g: null, rotor: null, spot: null };
    (function () {
      var g = new T.Group();
      g.add(mesh(box(1.6, 1.2, 3.4), ph(0x2b3036), 0, 0, 0));
      g.add(mesh(box(0.3, 0.4, 3.2), ph(0x2b3036), 0, 0.2, -3.2));
      var rotor = mesh(box(7, 0.05, 0.25), ph(0x111114), 0, 0.8, 0);
      g.add(rotor);
      g.add(mesh(new T.SphereGeometry(0.12, 6, 4), new T.MeshBasicMaterial({ color: 0xff3030, fog: false }), 0, -0.7, 1.2));
      var cone3 = mesh(new T.ConeGeometry(5.5, 36, 14, 1, true), new T.MeshBasicMaterial({ color: 0xdff0ff, transparent: true, opacity: 0.1, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }), 0, -18, 0);
      g.add(cone3);
      g.visible = false; scene.add(g);
      var spot = mesh(new T.CircleGeometry(5.5, 18), new T.MeshBasicMaterial({ color: 0xdff0ff, transparent: true, opacity: 0.16, blending: T.AdditiveBlending, depthWrite: false }), 0, 0, 0);
      spot.rotation.x = -Math.PI / 2; spot.visible = false; scene.add(spot);
      heli.g = g; heli.rotor = rotor; heli.spot = spot;
    })();
    X.scheduleHeli = function (delay) { heli.armed = true; heli.next = X.t + delay; };
    function updateHeli(dt, P) {
      if (!heli.on && heli.armed && X.t >= heli.next) {
        var th = rand() * Math.PI * 2, R = MAP_R + 24;
        heli.from = { x: R * Math.cos(th), z: R * Math.sin(th) };
        heli.to = { x: -heli.from.x * 0.8 + (rand() - 0.5) * 50, z: -heli.from.z * 0.8 + (rand() - 0.5) * 50 };
        var dx = heli.to.x - heli.from.x, dz = heli.to.z - heli.from.z;
        heli.dur = Math.sqrt(dx * dx + dz * dz) / 16; heli.t = 0; heli.on = true; heli.armed = false;
        heli.g.visible = true; heli.spot.visible = true;
        hooks.onHeli();
      }
      if (!heli.on) return;
      heli.t += dt;
      var k = Math.min(1, heli.t / heli.dur);
      var x = heli.from.x + (heli.to.x - heli.from.x) * k, z = heli.from.z + (heli.to.z - heli.from.z) * k;
      heli.g.position.set(x, 38, z);
      heli.g.rotation.y = Math.atan2(heli.to.x - heli.from.x, heli.to.z - heli.from.z);
      heli.rotor.rotation.y += dt * 30;
      heli.spot.position.set(x, hY(x, z) + 0.15, z);
      var rp = relPan(P, x, z);
      A.heli(1.2 / (1 + rp.d * 0.035), rp.pan);
      if (k >= 1) {
        heli.on = false; heli.g.visible = false; heli.spot.visible = false; A.heliStop();
        if (X.heliRepeat) { heli.armed = true; heli.next = X.t + 55 + rand() * 40; }
      }
    }

    /* ================= weather ================= */
    var WX = def.weather || { fog: [def.sky.fogDensity], rainFrom: 99, rainTo: 99 };
    var fogTarget = WX.fog[0], rainOn = false, nextFlash = 0, flashT = -1;
    var rainN = 360, rainPos = new Float32Array(rainN * 6), rainGeo = new T.BufferGeometry();
    var rainGroup = new T.Group();
    (function () {
      for (var i = 0; i < rainN; i++) {
        var x = (rand() - 0.5) * 36, y = rand() * 24 - 6, z = (rand() - 0.5) * 36;
        rainPos[i * 6] = x; rainPos[i * 6 + 1] = y; rainPos[i * 6 + 2] = z;
        rainPos[i * 6 + 3] = x + 0.05; rainPos[i * 6 + 4] = y + 0.7; rainPos[i * 6 + 5] = z;
      }
      rainGeo.setAttribute('position', new T.BufferAttribute(rainPos, 3));
      var lines = new T.LineSegments(rainGeo, new T.LineBasicMaterial({ color: 0xa8c0d8, transparent: true, opacity: 0.4, fog: false }));
      lines.frustumCulled = false;
      rainGroup.add(lines); rainGroup.visible = false; scene.add(rainGroup);
    })();
    X.setStage = function (n) {
      fogTarget = WX.fog[Math.min(n, WX.fog.length - 1)];
      var wantRain = n >= WX.rainFrom && n < WX.rainTo;
      if (wantRain !== rainOn) { rainOn = wantRain; A.rain(rainOn); }
      nextFlash = X.t + 4;
    };
    X.weather = function () { return { fog: W.scene.fog.density, rain: rainOn }; };
    function updateWeather(dt) {
      var f = W.scene.fog;
      f.density += (fogTarget - f.density) * Math.min(1, dt * 0.5);
      rainGroup.visible = rainOn;
      if (rainOn) {
        rainGroup.position.copy(W.camera.position);
        for (var i = 0; i < rainN; i++) {
          var o = i * 6;
          rainPos[o + 1] -= 18 * dt; rainPos[o + 4] -= 18 * dt;
          if (rainPos[o + 4] < -6) { rainPos[o + 1] += 24; rainPos[o + 4] += 24; }
        }
        rainGeo.attributes.position.needsUpdate = true;
        if (flashT < 0 && X.t >= nextFlash) {
          flashT = 0; nextFlash = X.t + 7 + rand() * 8; A.thunder(0.6 + rand() * 1.6);
        }
      }
      if (flashT >= 0) {
        flashT += dt;
        var v = (flashT < 0.12 ? 1 : 0) + (flashT > 0.2 && flashT < 0.3 ? 0.8 : 0);
        W.lights.hemi.intensity = hemiBase + v * 1.9;
        if (flashT > 0.5) { flashT = -1; W.lights.hemi.intensity = hemiBase; }
      }
    }

    /* ================= pickups (coffee) ================= */
    var pickups = L.pickups.map(function (c) {
      var m = new T.Group();
      m.add(mesh(new T.CylinderGeometry(0.11, 0.11, 0.38, 8), ph(0xb02a2a), 0, 0.19, 0));
      m.add(mesh(new T.CylinderGeometry(0.115, 0.115, 0.08, 8), M.white, 0, 0.42, 0));
      m.position.set(c.x, hY(c.x, c.z), c.z); scene.add(m);
      return { x: c.x, z: c.z, taken: false, mesh: m };
    });

    /* ================= cows ================= */
    function updateCows(dt, P) {
      for (var i = 0; i < W.cows.length; i++) {
        var c = W.cows[i], u = c.userData;
        u.t += dt;
        u.head.rotation.x = 0.35 + 0.3 * Math.sin(u.t * 0.8 + i);
        u.cool = (u.cool === undefined ? 5 + rand() * 20 : u.cool) - dt;
        if (u.cool <= 0) {
          u.cool = 14 + rand() * 20;
          var rp = relPan(P, c.position.x, c.position.z);
          if (rp.d < 40) A.mooAt(rp.d, rp.pan);
        }
      }
    }

    /* ================= main update / reset ================= */
    X.update = function (dt, P, D, S) {
      X.t += dt;
      var t = X.t, i;
      if (parked) {
        parked.flash(t);
        X.parkedLamp.color.setHex(Math.floor(t * 4.5) % 2 === 0 ? 0x4060ff : 0xff3030);
      }
      for (i = 0; i < W.flickers.length; i++) {
        var f = W.flickers[i], k = 1 + 0.25 * Math.sin(t * 13 + f.k) + 0.15 * Math.sin(t * 29 + f.k * 2);
        f.flame.scale.set(1, k, 1); f.glow.material.opacity = 0.13 + 0.04 * Math.sin(t * 11 + f.k);
      }
      updateDiggers(dt, P);
      updateSearchers(dt, P);
      updatePatrol(dt, P);
      updateHeli(dt, P);
      updateWeather(dt);
      updateCows(dt, P);
      if (S) {
        updateThief(dt, P, D, S);
        for (var j = 0; j < pickups.length; j++) {
          var p = pickups[j];
          if (!p.taken && Math.abs(P.x - p.x) + Math.abs(P.z - p.z) < 2.4 && Math.sqrt((P.x - p.x) * (P.x - p.x) + (P.z - p.z) * (P.z - p.z)) < 1.7) {
            p.taken = true; p.mesh.visible = false; hooks.onCoffee();
          }
        }
      }
      updateBubbles(dt);
    };
    X.reset = function () {
      thief.st = 'off'; thief.a.g.visible = false; thief.caseMesh.visible = false;
      dropMeshes.forEach(function (d) { scene.remove(d.m); }); dropMeshes = [];
      pickups.forEach(function (p) { p.taken = false; p.mesh.visible = true; });
      heli.on = false; heli.armed = false; heli.g.visible = false; heli.spot.visible = false; X.heliRepeat = false;
      A.heliStop();
      X.setStage(0); W.scene.fog.density = WX.fog[0]; rainGroup.visible = false; flashT = -1; W.lights.hemi.intensity = hemiBase;
      clearBubbles();
      diggers.forEach(function (a) { a.t = rand() * 6; });
      searchers.forEach(function (a) { a.wp = 0; a.wait = 0; place(a, a.wps[0].x, a.wps[0].z, a.yaw); });
    };
    X.thief = thief; X.heli = heli; X.pickups = pickups; X.diggers = diggers; X.searchers = searchers; X.patrol = patrol;
    return X;
  }

  ASO.Actors = { create: create };
})();
