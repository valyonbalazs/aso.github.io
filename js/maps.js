/* Map definitions. Each map supplies terrain, layout, case values, events and scenery to the generic world builder. */
(function () {
  'use strict';
  window.ASO = window.ASO || {};
  var smooth = ASO.World.smooth;
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
  function hash2(i, j) { var h = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return h - Math.floor(h); }

  /* ================= shared prop builders ================= */
  var MP = {};

  MP.bushes = function (B, list) {
    if (!list.length) return;
    B.inst(new B.T.IcosahedronGeometry(1, 0), B.ph(0xffffff), list, { fallback: 0x1c4a28 });
  };
  MP.rocks = function (B, list) {
    if (!list.length) return;
    B.inst(new B.T.DodecahedronGeometry(1, 0), B.ph(0xffffff), list, { fallback: 0x5a6168 });
  };
  MP.addBush = function (B, list, x, z, s, tint) {
    var r = B.rand;
    tint = tint || [0.07, 0.2, 0.09];
    list.push({ x: x, z: z, y: B.hY(x, z) + s * 0.55, sx: s * 1.3, sy: s, sz: s * 1.3, ry: r() * 6, c: [tint[0] + r() * 0.05, tint[1] + r() * 0.1, tint[2] + r() * 0.03] });
  };
  MP.addRock = function (B, list, x, z, s, tint) {
    var r = B.rand, g = tint || 0.3;
    list.push({ x: x, z: z, y: B.hY(x, z) + s * 0.25, sx: s * 1.2, sy: s * 0.7, sz: s, ry: r() * 6, c: [g + r() * 0.08, g + 0.02 + r() * 0.08, g + 0.04 + r() * 0.08] });
    if (s > 0.8) B.obstacle(x, z, s * 0.9);
  };
  /* a ring of bushes and rocks with one gap, hiding a stash from a distance */
  MP.cover = function (B, x, z, bushes, rocks, o) {
    o = o || {};
    var n = o.n || 9, rr = o.r || 3.0, gapA = B.rand() * 6.28, i;
    for (i = 0; i < n; i++) {
      var a = gapA + 0.9 + i * (Math.PI * 2 - 1.8) / (n - 1), r = rr + B.rand() * 0.8;
      var bx = x + Math.cos(a) * r, bz = z + Math.sin(a) * r, s = 1.0 + B.rand() * 0.8;
      MP.addBush(B, bushes, bx, bz, s, o.tint);
      B.obstacle(bx, bz, 0.9 * s, true);
    }
    for (i = 0; i < 3; i++) {
      var ra = gapA + 1.4 + i * 1.8, rd = rr + 1.2;
      MP.addRock(B, rocks, x + Math.cos(ra) * rd, z + Math.sin(ra) * rd, 0.9 + B.rand() * 0.5, 0.3);
    }
  };

  MP.logs = function (B, x, z, yaw, color) {
    var T = B.T, g = new T.Group(), geo = new T.CylinderGeometry(0.22, 0.22, 2.4, 7), mat = B.ph(color || 0x5b3d24);
    for (var r = 0; r < 3; r++) for (var c = 0; c < 3 - r; c++) {
      var m = B.mesh(geo, mat, 0, 0.25 + r * 0.4, -0.5 + c * 0.46 + r * 0.23);
      m.rotation.z = Math.PI / 2; g.add(m);
    }
    g.position.set(x, B.hY(x, z), z); g.rotation.y = yaw; B.add(g); B.obstacle(x, z, 1.1);
  };
  MP.hay = function (B, x, z, yaw) {
    var T = B.T, g = new T.Group(), geo = new T.CylinderGeometry(0.55, 0.55, 0.9, 10), mat = B.ph(0xc9a94a);
    var pos = [[-1.1, 0.55, 0], [0, 0.55, 0], [1.1, 0.55, 0], [-0.55, 1.35, 0], [0.55, 1.35, 0], [0, 2.1, 0]];
    pos.forEach(function (p) {
      var m = B.mesh(geo, mat, p[0], p[1], p[2]); m.rotation.x = Math.PI / 2; g.add(m);
    });
    g.position.set(x, B.hY(x, z), z); g.rotation.y = yaw; B.add(g); B.obstacle(x, z, 1.5);
  };
  MP.crates = function (B, x, z, yaw) {
    var T = B.T, g = new T.Group(), geo = new T.BoxGeometry(0.9, 0.9, 0.9), mat = B.ph(0x7a5a32);
    [[-0.5, 0.45, 0], [0.5, 0.45, 0], [-0.5, 0.45, 1.0], [0.5, 0.45, 1.0], [0, 1.35, 0.4]].forEach(function (p) {
      var m = B.mesh(geo, mat, p[0], p[1], p[2]); m.rotation.y = (p[0] + p[2]) * 0.2; g.add(m);
    });
    g.position.set(x, B.hY(x, z), z); g.rotation.y = yaw; B.add(g); B.obstacle(x, z + 0.4, 1.4);
  };
  MP.safe = function (B, st, yaw) {
    var T = B.T, g = new T.Group();
    g.position.set(st.x, B.hY(st.x, st.z), st.z); g.rotation.y = yaw || 0;
    g.add(B.mesh(B.box(0.95, 0.95, 0.75), B.ph(0x4a5a63), 0, 0.5, 0));
    var door = new T.Group(); door.position.set(-0.45, 0.5, -0.38);
    door.add(B.mesh(B.box(0.88, 0.88, 0.06), B.ph(0x39474f), 0.44, 0, 0));
    var dial = B.mesh(new T.CylinderGeometry(0.14, 0.14, 0.05, 12), B.ph(0xf2b84b), 0.44, 0.1, -0.05); dial.rotation.x = Math.PI / 2;
    door.add(dial); g.add(door);
    B.add(g); st.door = door; B.obstacle(st.x, st.z, 0.6);
  };
  /* open-front building (door faces -z) with collision walls */
  MP.building = function (B, o) {
    var T = B.T, g = new T.Group(), w = o.w, d = o.d, h = o.h, gap = o.gap || 2.4, ph = B.ph, t = 0.2;
    var wall = ph(o.wall || 0x5b3d24);
    g.add(B.mesh(B.box(w, 0.1, d), ph(o.floor || 0x3a2c20), 0, 0.05, 0));
    g.add(B.mesh(B.box(w, h, t), wall, 0, h / 2, d / 2));
    g.add(B.mesh(B.box(t, h, d), wall, -w / 2, h / 2, 0));
    g.add(B.mesh(B.box(t, h, d), wall, w / 2, h / 2, 0));
    var stub = (w - gap) / 2;
    g.add(B.mesh(B.box(stub, h, t), wall, -(gap / 2 + stub / 2), h / 2, -d / 2));
    g.add(B.mesh(B.box(stub, h, t), wall, (gap / 2 + stub / 2), h / 2, -d / 2));
    g.add(B.mesh(B.box(w + 0.8, 0.25, d + 0.8), ph(o.roof || 0x2a1e16), 0, h + 0.12, 0));
    if (o.lamp !== false) {
      g.add(B.mesh(B.box(0.2, 0.3, 0.2), new T.MeshBasicMaterial({ color: o.lampColor || 0xffd27a }), w / 2 - 0.7, h - 0.4, d / 2 - 0.5));
      var glow = B.mesh(new T.CircleGeometry(Math.min(w, 6) * 0.45, 16), new T.MeshBasicMaterial({ color: 0xffc060, transparent: true, opacity: 0.14, blending: T.AdditiveBlending, depthWrite: false }), 0, 0.13, 0.2);
      glow.rotation.x = -Math.PI / 2; g.add(glow);
    }
    g.position.set(o.x, B.hY(o.x, o.z), o.z); B.add(g);
    var i;
    for (i = -w / 2; i <= w / 2 + 0.01; i += 0.9) B.obstacle(o.x + i, o.z + d / 2, 0.55);
    for (i = -d / 2 + 0.9; i < d / 2; i += 0.9) { B.obstacle(o.x - w / 2, o.z + i, 0.55); B.obstacle(o.x + w / 2, o.z + i, 0.55); }
    for (i = gap / 2 + 0.5; i < w / 2; i += 0.9) { B.obstacle(o.x - i, o.z - d / 2, 0.55); B.obstacle(o.x + i, o.z - d / 2, 0.55); }
    return g;
  };
  /* solid house with a gabled roof and lit windows */
  MP.house = function (B, o) {
    var T = B.T, g = new T.Group(), w = o.w, d = o.d, h = o.h, ph = B.ph;
    g.add(B.mesh(B.box(w, h + 1, d), ph(o.wall), 0, (h - 1) / 2, 0));
    var roofMat = ph(o.roof);
    var r1 = B.mesh(B.box(w + 0.8, 0.22, d / 2 + 0.9), roofMat, 0, h + 0.9, d / 4 + 0.1); r1.rotation.x = -0.5;
    var r2 = B.mesh(B.box(w + 0.8, 0.22, d / 2 + 0.9), roofMat, 0, h + 0.9, -d / 4 - 0.1); r2.rotation.x = 0.5;
    g.add(r1, r2);
    var win = new T.MeshBasicMaterial({ color: 0xffd27a }), dark = new T.MeshBasicMaterial({ color: 0x1a2230 });
    for (var i = -1; i <= 1; i += 2) {
      g.add(B.mesh(B.box(1.1, 1.0, 0.08), B.rand() < 0.6 ? win : dark, i * w * 0.27, h * 0.5, -d / 2 - 0.02));
      g.add(B.mesh(B.box(1.1, 1.0, 0.08), B.rand() < 0.5 ? win : dark, i * w * 0.27, h * 0.5, d / 2 + 0.02));
    }
    g.add(B.mesh(B.box(1.0, 1.9, 0.1), ph(0x3a2a1c), 0, 0.85, -d / 2 - 0.03));
    g.position.set(o.x, B.hY(o.x, o.z), o.z); B.add(g);
    for (var a = -w / 2; a <= w / 2 + 0.01; a += 1.3) { B.obstacle(o.x + a, o.z - d / 2, 0.8); B.obstacle(o.x + a, o.z + d / 2, 0.8); }
    for (var b = -d / 2 + 1.3; b < d / 2; b += 1.3) { B.obstacle(o.x - w / 2, o.z + b, 0.8); B.obstacle(o.x + w / 2, o.z + b, 0.8); }
  };
  MP.camp = function (B, x, z) {
    var T = B.T, g = new T.Group();
    var tent = B.mesh(new T.ConeGeometry(1.7, 1.9, 4), B.ph(0x6b5a3a), -2.2, 0.95, 0.4);
    tent.rotation.y = Math.PI / 4; g.add(tent);
    var flame = B.mesh(new T.ConeGeometry(0.3, 0.8, 6), new T.MeshBasicMaterial({ color: 0xff8a2a }), 0, 0.5, 0); g.add(flame);
    var glow = B.mesh(new T.CircleGeometry(2.4, 16), new T.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.16, blending: T.AdditiveBlending, depthWrite: false }), 0, 0.12, 0);
    glow.rotation.x = -Math.PI / 2; g.add(glow);
    for (var i = 0; i < 6; i++) {
      var a = i / 6 * Math.PI * 2;
      g.add(B.mesh(new T.DodecahedronGeometry(0.2, 0), B.ph(0x5a6168), Math.cos(a) * 0.65, 0.15, Math.sin(a) * 0.65));
    }
    g.position.set(x, B.hY(x, z), z); B.add(g);
    B.obstacle(x - 2.2, z + 0.4, 1.4); B.obstacle(x, z, 0.8);
    B.w.flickers.push({ flame: flame, glow: glow, k: B.rand() * 6 });
  };
  MP.lamp = function (B, x, z, color) {
    var T = B.T, g = new T.Group();
    g.add(B.mesh(new T.CylinderGeometry(0.08, 0.1, 5, 6), B.ph(0x2a2f33), 0, 2.5, 0));
    g.add(B.mesh(B.box(0.5, 0.18, 0.5), new T.MeshBasicMaterial({ color: color || 0xffc070, fog: false }), 0, 5.0, 0));
    var glow = B.mesh(new T.CircleGeometry(4.2, 16), new T.MeshBasicMaterial({ color: color || 0xffa040, transparent: true, opacity: 0.2, blending: T.AdditiveBlending, depthWrite: false }), 0, 0.12, 0);
    glow.rotation.x = -Math.PI / 2; g.add(glow);
    g.position.set(x, B.hY(x, z), z); B.add(g); B.obstacle(x, z, 0.3);
  };
  MP.car = function (B, x, z, yaw, color) {
    var T = B.T, g = new T.Group();
    g.add(B.mesh(B.box(1.8, 0.7, 4.2), B.ph(color), 0, 0.7, 0));
    g.add(B.mesh(B.box(1.6, 0.6, 2.0), B.ph(0x1a2230), 0, 1.3, -0.1));
    var wg = new T.CylinderGeometry(0.36, 0.36, 0.3, 10);
    [[-0.9, 1.3], [0.9, 1.3], [-0.9, -1.3], [0.9, -1.3]].forEach(function (p) {
      var wh = B.mesh(wg, B.ph(0x0b0f12), p[0], 0.36, p[1]); wh.rotation.z = Math.PI / 2; g.add(wh);
    });
    g.position.set(x, B.hY(x, z), z); g.rotation.y = yaw; B.add(g);
    B.obstacle(x - Math.sin(yaw) * 1.3, z - Math.cos(yaw) * 1.3, 1.1); B.obstacle(x + Math.sin(yaw) * 1.3, z + Math.cos(yaw) * 1.3, 1.1);
  };
  MP.fence = function (B, x1, z1, x2, z2, gapT) {
    var len = Math.sqrt((x2 - x1) * (x2 - x1) + (z2 - z1) * (z2 - z1)), n = Math.max(2, Math.round(len / 2.2)), posts = [], rails = [];
    var ang = Math.atan2(x2 - x1, z2 - z1);
    for (var i = 0; i <= n; i++) {
      var t = i / n, x = x1 + (x2 - x1) * t, z = z1 + (z2 - z1) * t;
      var inGap = gapT && t > gapT[0] && t < gapT[1];
      if (inGap) continue;
      posts.push({ x: x, z: z, y: B.hY(x, z) + 0.6, sx: 0.12, sy: 1.2, sz: 0.12 });
      if (i < n && !(gapT && (t + 1 / n) > gapT[0] && t < gapT[1])) {
        var mx = x + (x2 - x1) / n / 2, mz = z + (z2 - z1) / n / 2;
        rails.push({ x: mx, z: mz, y: B.hY(mx, mz) + 0.95, sx: 0.06, sy: 0.08, sz: len / n, ry: ang });
        rails.push({ x: mx, z: mz, y: B.hY(mx, mz) + 0.5, sx: 0.06, sy: 0.08, sz: len / n, ry: ang });
      }
      B.obstacle(x, z, 0.4, true);
    }
    B.inst(B.box(1, 1, 1), B.ph(0x6b5a3a), posts);
    B.inst(B.box(1, 1, 1), B.ph(0x7a6a48), rails);
  };

  /* merged pine geometry used by the forest */
  function coneG(T, r, h, y) { var g = new T.ConeGeometry(r, h, 7).toNonIndexed(); g.translate(0, y, 0); return g; }
  function mergePos(T, list) {
    var n = 0, i;
    for (i = 0; i < list.length; i++) n += list[i].attributes.position.array.length;
    var arr = new Float32Array(n), o = 0;
    for (i = 0; i < list.length; i++) { arr.set(list[i].attributes.position.array, o); o += list[i].attributes.position.array.length; }
    var m = new T.BufferGeometry();
    m.setAttribute('position', new T.BufferAttribute(arr, 3));
    m.computeVertexNormals();
    return m;
  }

  /* ================= MAP 1: forest (Nógrád) ================= */
  var F_VAN = [{ x: 0, z: 0 }, { x: -28, z: -10 }, { x: 28, z: -28 }, { x: 35, z: 40 }];
  var F_PICK = [{ x: -18.4, z: -34.2 }, { x: 51.6, z: 25.8 }];
  var F_STASH = [
    { ang: 20, r: 30, kind: 'buried' },
    { ang: 100, r: 46, kind: 'pile' },
    { ang: 170, r: 38, kind: 'buried', hidden: true },
    { ang: 240, r: 62, kind: 'deep', hidden: true },
    { ang: 310, r: 52, kind: 'safe', hidden: true, lock: { speed: 2.0, zone: 0.45 } }
  ];
  var F_CABIN = (function () { var p = ASO.World.polar(F_STASH[4]); return { x: p.x, z: p.z - 1.2 }; })();
  var F_FLAT = [];
  F_VAN.forEach(function (v) { F_FLAT.push({ x: v.x, z: v.z, a: 8, b: 24 }); });
  F_FLAT.push({ x: F_CABIN.x, z: F_CABIN.z, a: 6, b: 16 });
  F_PICK.forEach(function (c) { F_FLAT.push({ x: c.x - 1.6, z: c.z - 0.8, a: 5, b: 13 }); });

  function forestHeight(x, z) {
    var f = 1, i, dx, dz, s;
    for (i = 0; i < F_FLAT.length; i++) {
      dx = x - F_FLAT[i].x; dz = z - F_FLAT[i].z;
      s = smooth(F_FLAT[i].a, F_FLAT[i].b, Math.sqrt(dx * dx + dz * dz));
      if (s < f) f = s;
    }
    return f * (1.2 * Math.sin(x * 0.045 + 1.3) * Math.cos(z * 0.04 + 0.4) + 0.55 * Math.sin(x * 0.12 + z * 0.09 + 2.0) + 0.25 * Math.sin(x * 0.31) * Math.sin(z * 0.27));
  }
  function forestColor(x, z, h, r0) {
    var d = Math.sqrt(x * x + z * z);
    var r = 0.085 + 0.02 * r0(), g = 0.17 + 0.05 * Math.sin(x * 0.21) * Math.cos(z * 0.17) + 0.02 * r0(), b = 0.10 + 0.01 * r0();
    var dirt = 1 - smooth(5, 13, d);
    return [r + (0.28 - r) * dirt, g + (0.22 - g) * dirt, b + (0.15 - b) * dirt];
  }
  function buildForest(B) {
    var T = B.T, rand = B.rand, hY = B.hY, touch = B.isTouch, bushes = [], rocks = [], i;
    /* pines */
    var trees = B.scatter({ n: touch ? 380 : 560, rmin: 6, rmax: 76, minDist: 3.1 });
    var ring = [];
    for (i = 0; i < (touch ? 90 : 150); i++) {
      var ra = rand() * Math.PI * 2, rd = 95 + rand() * 14;
      ring.push({ x: rd * Math.cos(ra), z: rd * Math.sin(ra) });
    }
    var all = trees.concat(ring), fl = [], tl = [];
    for (i = 0; i < all.length; i++) {
      var s = 0.8 + rand() * 0.75, sy = s * (0.9 + rand() * 0.3), ry = rand() * 6.28;
      fl.push({ x: all[i].x, z: all[i].z, y: hY(all[i].x, all[i].z) - 0.1, sx: s, sy: sy, sz: s, ry: ry, c: [0.04 + rand() * 0.08, 0.17 + rand() * 0.13, 0.09 + rand() * 0.07] });
      tl.push({ x: all[i].x, z: all[i].z, y: hY(all[i].x, all[i].z) - 0.1, sx: s, sy: sy, sz: s, ry: ry });
      if (i < trees.length) B.obstacle(all[i].x, all[i].z, 0.45 * s + 0.1);
    }
    var foliageGeo = mergePos(T, [coneG(T, 2.3, 3.4, 3.1), coneG(T, 1.8, 3.0, 4.8), coneG(T, 1.2, 2.6, 6.3)]);
    var trunkGeo = new T.CylinderGeometry(0.2, 0.32, 2.2, 6); trunkGeo.translate(0, 1.1, 0);
    B.inst(foliageGeo, B.ph(0xffffff), fl, { fallback: 0x1f4a2a });
    B.inst(trunkGeo, B.ph(0x2a1e16), tl);

    /* undergrowth: bushes, ferns, rocks, stumps, fallen logs */
    B.scatter({ n: touch ? 120 : 190, rmin: 5, rmax: 82, shared: false }).forEach(function (p) {
      var s = 0.7 + rand() * 0.9;
      MP.addBush(B, bushes, p.x, p.z, s);
      if (s > 1.1) B.obstacle(p.x, p.z, 0.7 * s, true);
    });
    var ferns = [];
    B.scatter({ n: touch ? 160 : 280, rmin: 4, rmax: 85, shared: false }).forEach(function (p) {
      var s = 0.6 + rand() * 0.7;
      ferns.push({ x: p.x, z: p.z, y: hY(p.x, p.z) + 0.3 * s, sx: s, sy: s, sz: s, ry: rand() * 6, c: [0.05 + rand() * 0.06, 0.22 + rand() * 0.12, 0.08] });
    });
    B.inst(new T.ConeGeometry(0.5, 0.9, 5), B.ph(0xffffff), ferns, { fallback: 0x2f6a35 });
    B.scatter({ n: touch ? 40 : 70, rmin: 8, rmax: 84, shared: false }).forEach(function (p) {
      MP.addRock(B, rocks, p.x, p.z, 0.3 + rand() * 1.1, 0.28);
    });
    var stumps = [], logsL = [];
    B.scatter({ n: 30, rmin: 8, rmax: 80, shared: false }).forEach(function (p) {
      stumps.push({ x: p.x, z: p.z, y: hY(p.x, p.z) + 0.25, sx: 0.9 + rand() * 0.5, sy: 0.8 + rand() * 0.7, sz: 0.9 + rand() * 0.5 });
      B.obstacle(p.x, p.z, 0.45, true);
    });
    B.inst(new T.CylinderGeometry(0.3, 0.38, 0.5, 7), B.ph(0x4a3320), stumps);
    B.scatter({ n: 16, rmin: 8, rmax: 80, shared: false }).forEach(function (p) {
      logsL.push({ x: p.x, z: p.z, y: hY(p.x, p.z) + 0.25, sx: 0.8, sy: 1.0 + rand() * 0.6, sz: 0.8, rz: Math.PI / 2, ry: rand() * 6 });
    });
    B.inst(new T.CylinderGeometry(0.25, 0.25, 3, 7), B.ph(0x4d3622), logsL);

    /* piles, camps, cabin */
    B.w.stashes.concat(B.w.junk).forEach(function (o) { if (o.kind === 'pile') MP.logs(B, o.x, o.z, rand() * 3); });
    F_PICK.forEach(function (c) { MP.camp(B, c.x - 1.6, c.z - 0.8); });
    var st = B.w.stashes[4];
    MP.building(B, { x: F_CABIN.x, z: F_CABIN.z, w: 5, d: 4, h: 2.6, gap: 1.8, wall: 0x5b3d24, roof: 0x2a1e16 });
    MP.safe(B, st, 0);
    [-3.3, -2.3, 2.3, 3.3].forEach(function (dx) { MP.addBush(B, bushes, F_CABIN.x + dx, F_CABIN.z - 2.9, 1.0 + rand() * 0.5); B.obstacle(F_CABIN.x + dx, F_CABIN.z - 2.9, 0.8, true); });
    /* the later cases are hidden behind thickets */
    B.w.stashes.forEach(function (s) { if (s.hidden && s.kind !== 'safe') MP.cover(B, s.x, s.z, bushes, rocks, { n: 10, r: 3.2 }); });
    MP.bushes(B, bushes); MP.rocks(B, rocks);
  }

  /* ================= MAP 2: farm (Békés) ================= */
  var FA_STASH = [
    { x: -48, z: 38, kind: 'buried' },
    { x: -8, z: 47, kind: 'pile' },
    { x: -26, z: 13.3, kind: 'safe', hidden: true, lock: { speed: 2.1, zone: 0.42 } },
    { x: 32, z: -42, kind: 'deep', hidden: true }
  ];
  function farmHeight(x, z) {
    var d = Math.sqrt(x * x + z * z), f = smooth(24, 42, d);
    var h = 0.45 * Math.sin(x * 0.02 + 1) * Math.cos(z * 0.025) + 0.2 * Math.sin(x * 0.06 + z * 0.05);
    var ditch = Math.abs(z - (22 + 0.12 * x)) < 3.2 && d > 30 ? -0.7 * (1 - Math.abs(z - (22 + 0.12 * x)) / 3.2) : 0;
    return h * f + ditch;
  }
  function farmColor(x, z, h, r0) {
    var d = Math.sqrt(x * x + z * z), n = r0() * 0.02, base;
    var cx = Math.floor((x + 140) / 40), cz = Math.floor((z + 140) / 40), t = Math.floor(hash2(cx, cz) * 4);
    if (x > 8 && x < 52 && z > -62 && z < -18) base = [0.16, 0.26, 0.1];
    else if (t === 0) base = [0.52, 0.45, 0.17];
    else if (t === 1) base = [0.27 + 0.04 * Math.sin(x * 3.0), 0.19 + 0.03 * Math.sin(x * 3.0), 0.12];
    else if (t === 2) base = [0.1, 0.2, 0.09];
    else base = [0.38, 0.33, 0.19];
    if (Math.abs(x) < 2.4 && z > 20) base = [0.3, 0.24, 0.17];
    var yard = 1 - smooth(22, 34, d);
    var c = mix(base, [0.33, 0.31, 0.29], yard);
    return [c[0] + n, c[1] + n, c[2] + n];
  }
  function buildFarm(B) {
    var T = B.T, rand = B.rand, hY = B.hY, touch = B.isTouch, bushes = [], rocks = [], i, j;
    MP.building(B, { x: -26, z: 10, w: 14, d: 9, h: 5, gap: 4, wall: 0x6b2e22, roof: 0x2b2420, floor: 0x4a3a28 });
    MP.safe(B, B.w.stashes[2], 0);
    MP.building(B, { x: 34, z: 22, w: 18, d: 10, h: 6, gap: 6, wall: 0x7a828a, roof: 0x3a3f44, floor: 0x3a3a3a });
    /* silos */
    [[-42, -4], [-48, -10]].forEach(function (p) {
      var g = new T.Group();
      g.add(B.mesh(new T.CylinderGeometry(3, 3, 14, 12), B.ph(0xaab2b8), 0, 7, 0));
      g.add(B.mesh(new T.ConeGeometry(3.1, 2.4, 12), B.ph(0x6a7278), 0, 15.2, 0));
      g.position.set(p[0], hY(p[0], p[1]), p[1]); B.add(g); B.obstacle(p[0], p[1], 3.6);
    });
    /* tractor */
    (function () {
      var g = new T.Group();
      g.add(B.mesh(B.box(1.5, 1.0, 3.0), B.ph(0x2f7a3a), 0, 1.2, 0));
      g.add(B.mesh(B.box(1.4, 1.2, 1.2), B.ph(0x1e5a2a), 0, 2.1, -0.5));
      var wg = new T.CylinderGeometry(0.9, 0.9, 0.5, 12), sg = new T.CylinderGeometry(0.55, 0.55, 0.4, 10);
      [[-1.0, -0.9, wg], [1.0, -0.9, wg], [-0.9, 1.1, sg], [0.9, 1.1, sg]].forEach(function (p) {
        var m = B.mesh(p[2], B.ph(0x0b0f12), p[0], p[2] === wg ? 0.9 : 0.55, p[1]); m.rotation.z = Math.PI / 2; g.add(m);
      });
      g.position.set(10, hY(10, 14), 14); g.rotation.y = 0.5; B.add(g); B.obstacle(10, 14, 1.9);
    })();
    /* corn field (hides the deep case) */
    var corn = [];
    for (i = 0; i < 25; i++) for (j = 0; j < 20; j++) {
      var cx = 12 + i * 1.5 + (rand() - 0.5) * 0.3, cz = -58 + j * 2.0 + (rand() - 0.5) * 0.4, s = 0.9 + rand() * 0.3;
      corn.push({ x: cx, z: cz, y: hY(cx, cz) + 1.1 * s, sx: s, sy: s, sz: s, ry: rand() * 6, c: [0.13 + rand() * 0.07, 0.3 + rand() * 0.12, 0.08] });
    }
    B.inst(new T.ConeGeometry(0.5, 2.3, 5), B.ph(0xffffff), corn, { fallback: 0x3a7a22 });
    /* poplar windbreaks */
    var pop = [];
    for (i = -80; i <= 80; i += 6) {
      pop.push({ x: i, z: 82 }); pop.push({ x: -82, z: i }); if (i < 20 || i > 40) pop.push({ x: 82, z: i });
    }
    var popl = pop.map(function (p) { var s = 0.8 + rand() * 0.5; B.obstacle(p.x, p.z, 0.5); return { x: p.x, z: p.z, y: hY(p.x, p.z) - 0.1, sx: s, sy: s * 1.2, sz: s, c: [0.07, 0.2 + rand() * 0.1, 0.08] }; });
    var popGeo = mergePos(T, [coneG(T, 0.9, 5, 3), coneG(T, 0.75, 4.5, 6.5), coneG(T, 0.55, 3.5, 10)]);
    B.inst(popGeo, B.ph(0xffffff), popl, { fallback: 0x1f4a2a });
    /* paddock fence by the barn, hay piles, barrels, bales */
    MP.fence(B, -12, 26, -12, 46, [0.4, 0.6]); MP.fence(B, -12, 46, 6, 46, null); MP.fence(B, 6, 46, 6, 26, null);
    B.w.stashes.concat(B.w.junk).forEach(function (o) {
      if (o.kind !== 'pile') return;
      if (o.x > 24 && o.x < 44 && o.z > 17 && o.z < 27) MP.crates(B, o.x, o.z, 0); else MP.hay(B, o.x, o.z, rand() * 3);
    });
    var bal = [];
    B.scatter({ n: 26, rmin: 12, rmax: 85, shared: false }).forEach(function (p) {
      bal.push({ x: p.x, z: p.z, y: hY(p.x, p.z) + 0.5, sx: 1, sy: 1, sz: 1, rz: Math.PI / 2, ry: rand() * 6 });
      B.obstacle(p.x, p.z, 0.8);
    });
    B.inst(new T.CylinderGeometry(0.55, 0.55, 1.1, 10), B.ph(0xc9a94a), bal);
    B.scatter({ n: 36, rmin: 12, rmax: 88, shared: false, box: [-90, 90, -90, 90] }).forEach(function (p) { MP.addBush(B, bushes, p.x, p.z, 0.8 + rand() * 0.8, [0.1, 0.22, 0.08]); });
    B.scatter({ n: 30, rmin: 12, rmax: 88, shared: false }).forEach(function (p) { MP.addRock(B, rocks, p.x, p.z, 0.3 + rand() * 0.9, 0.34); });
    /* cover for the hidden cases */
    var s0 = B.w.stashes[0];
    MP.cover(B, s0.x, s0.z, bushes, rocks, { n: 6, r: 3.0, tint: [0.1, 0.22, 0.08] });
    MP.bushes(B, bushes); MP.rocks(B, rocks);
    /* wooden barrels near the yard */
    var bar = [[-12, 4], [-13.2, 5], [18, -6], [19.2, -5.5]].map(function (p) { B.obstacle(p[0], p[1], 0.5); return { x: p[0], z: p[1], y: hY(p[0], p[1]) + 0.5, sx: 1, sy: 1, sz: 1 }; });
    B.inst(new T.CylinderGeometry(0.4, 0.4, 1.0, 8), B.ph(0x4a3a2a), bar);
    B.w.cowSpots = [[-60, 20], [-65, 28], [55, 50], [60, 44]];
    B.w.cowSpots.forEach(function (p, k) { var c = B.w.makeCow(p[0], p[1], rand() * 6, false); B.add(c); B.w.cows.push(c); B.obstacle(p[0], p[1], 1.0); });
  }

  /* ================= MAP 3: village (Pest) ================= */
  var V_HOUSES = [
    { x: -20, z: -20, w: 9, d: 8, h: 5, wall: 0xb09a7a, roof: 0x6a2f2a }, { x: -20, z: 22, w: 9, d: 8, h: 5, wall: 0x8a9aa8, roof: 0x4a3a34 },
    { x: 20, z: -20, w: 9, d: 8, h: 5, wall: 0xc4b48a, roof: 0x5a3030 }, { x: 20, z: 22, w: 9, d: 8, h: 5, wall: 0x9aa890, roof: 0x3a3a44 },
    { x: -38, z: -4, w: 8, d: 8, h: 4.5, wall: 0xa8887a, roof: 0x5a3a30 }, { x: 38, z: -4, w: 8, d: 8, h: 4.5, wall: 0x8a8a9a, roof: 0x44342e },
    { x: -14, z: -40, w: 8, d: 8, h: 4.5, wall: 0xb8a88a, roof: 0x6a3a30 }, { x: 14, z: -40, w: 8, d: 8, h: 4.5, wall: 0x9a9a88, roof: 0x4a3030 },
    { x: -12, z: 40, w: 8, d: 8, h: 4.5, wall: 0xa89a8a, roof: 0x5a3a3a }, { x: 14, z: 42, w: 8, d: 8, h: 4.5, wall: 0x88a0a8, roof: 0x3a3438 }
  ];
  var V_STASH = [
    { x: 28, z: 33, kind: 'buried' },
    { x: -28, z: 35, kind: 'pile', hidden: true },
    { x: -45, z: -30, kind: 'safe', hidden: true, lock: { speed: 2.4, zone: 0.4 } }
  ];
  function villageHeight(x, z) {
    var h = 0.6 * Math.sin(x * 0.025 + 0.5) * Math.cos(z * 0.03) + 0.2 * Math.sin(x * 0.09 + z * 0.07);
    var d = Math.sqrt(x * x + z * z);
    return h * smooth(6, 20, d);
  }
  function villageColor(x, z, h, r0) {
    var n = r0() * 0.02, d = Math.sqrt(x * x + z * z);
    if (d < 56 && (Math.abs(z) < 3.6 || Math.abs(x) < 3.6)) return [0.11 + n, 0.11 + n, 0.12 + n];
    if (d < 56 && (Math.abs(z) < 5.2 || Math.abs(x) < 5.2)) return [0.3 + n, 0.3 + n, 0.3 + n];
    return [0.11 + n, 0.21 + n + 0.03 * Math.sin(x * 0.4) * Math.cos(z * 0.35), 0.1 + n];
  }
  function buildVillage(B) {
    var T = B.T, rand = B.rand, hY = B.hY, touch = B.isTouch, bushes = [], rocks = [], i;
    V_HOUSES.forEach(function (h) { MP.house(B, h); });
    /* garage with the safe */
    var sf = B.w.stashes[2];
    MP.building(B, { x: -45, z: sf.z - 1.8, w: 7, d: 6, h: 3, gap: 2.4, wall: 0x7a7e82, roof: 0x34383c, floor: 0x3a3a3a });
    MP.safe(B, sf, 0);
    /* street lamps along both streets */
    for (i = -52; i <= 52; i += 13) { if (Math.abs(i) > 6) { MP.lamp(B, i, 6.4, 0xffb060); MP.lamp(B, 6.4, i, 0xffb060); } }
    /* parked cars */
    [[8, -6, 1.57, 0x7a2020], [-9, 7, 1.57, 0x20507a], [12, 17, 0, 0x3a6a3a], [-14, -12, 0, 0x777777], [36, 8, 1.57, 0x6a5a20]].forEach(function (c) {
      MP.car(B, c[0], c[1], c[2], c[3]);
    });
    /* hedges with gaps at the gates, garden trees, bushes, rocks */
    V_HOUSES.forEach(function (h) {
      var fx = h.x, fz = h.z - h.d / 2 - 4;
      for (var k = -5; k <= 5; k++) {
        if (Math.abs(k) < 2) continue;
        MP.addBush(B, bushes, fx + k * 1.6, fz, 0.7 + rand() * 0.3, [0.08, 0.24, 0.1]); B.obstacle(fx + k * 1.6, fz, 0.7, true);
      }
    });
    var trees = B.scatter({ n: touch ? 28 : 46, rmin: 10, rmax: 84, minDist: 5, accept: function (x, z) {
      return !(Math.abs(x) < 7 || Math.abs(z) < 7) && Math.sqrt(x * x + z * z) < 82;
    } });
    var canopies = [], trunks = [];
    trees.forEach(function (p) {
      var s = 0.9 + rand() * 0.7;
      canopies.push({ x: p.x, z: p.z, y: hY(p.x, p.z) + 3.6 * s, sx: 2.2 * s, sy: 2.0 * s, sz: 2.2 * s, c: [0.07 + rand() * 0.06, 0.22 + rand() * 0.12, 0.09] });
      trunks.push({ x: p.x, z: p.z, y: hY(p.x, p.z) + 1.3 * s, sx: s, sy: s, sz: s });
      B.obstacle(p.x, p.z, 0.5);
    });
    B.inst(new T.IcosahedronGeometry(1, 0), B.ph(0xffffff), canopies, { fallback: 0x2a6a30 });
    B.inst(new T.CylinderGeometry(0.2, 0.28, 2.6, 6), B.ph(0x3a2a1c), trunks);
    B.scatter({ n: 40, rmin: 10, rmax: 84, shared: false }).forEach(function (p) { MP.addBush(B, bushes, p.x, p.z, 0.6 + rand() * 0.7, [0.08, 0.22, 0.09]); });
    B.scatter({ n: 20, rmin: 10, rmax: 84, shared: false }).forEach(function (p) { MP.addRock(B, rocks, p.x, p.z, 0.3 + rand() * 0.6, 0.32); });
    /* piles (wood stacks / compost) */
    B.w.stashes.concat(B.w.junk).forEach(function (o) { if (o.kind === 'pile') MP.logs(B, o.x, o.z, rand() * 3, 0x7a5a32); });
    /* covering the hidden cases */
    var sp = B.w.stashes[1];
    MP.cover(B, sp.x, sp.z, bushes, rocks, { n: 8, r: 3.0, tint: [0.08, 0.24, 0.1] });
    MP.bushes(B, bushes); MP.rocks(B, rocks);
  }

  /* ================= MAP 4: quarry vault (Budapest) ================= */
  var Q_STASH = [
    { x: 38, z: -42, kind: 'deep' },
    { x: -12, z: -46, kind: 'safe', lock: { speed: 2.4, zone: 0.38 }, hidden: true },
    { x: -44, z: 34, kind: 'safe', lock: { speed: 2.8, zone: 0.32 }, hidden: true }
  ];
  function quarryHeight(x, z) {
    var d = Math.sqrt((x - 25) * (x - 25) + (z - 15) * (z - 15));
    var pit = -7 * (1 - smooth(14, 36, d));
    var heap = 4 * Math.exp(-((x + 42) * (x + 42) + (z - 8) * (z - 8)) / 260);
    var base = 0.5 * Math.sin(x * 0.05) * Math.cos(z * 0.04) + 0.25 * Math.sin(x * 0.14 + z * 0.1);
    var yard = smooth(8, 26, Math.sqrt(x * x + z * z));
    return (pit + heap) + base * yard;
  }
  function quarryColor(x, z, h, r0) {
    var n = r0() * 0.04, g = 0.3 + n;
    var d = Math.sqrt((x - 25) * (x - 25) + (z - 15) * (z - 15));
    var pitK = 1 - smooth(10, 34, d);
    var c = mix([g, g - 0.02, g - 0.05], [0.2 + n, 0.19 + n, 0.17 + n], pitK);
    if (h > 2.2) c = [c[0] + 0.1, c[1] + 0.09, c[2] + 0.07];
    return c;
  }
  function buildQuarry(B) {
    var T = B.T, rand = B.rand, hY = B.hY, touch = B.isTouch, bushes = [], rocks = [], i;
    /* rim rocks around the pit */
    for (i = 0; i < 46; i++) {
      var a = i / 46 * Math.PI * 2 + rand() * 0.1, rr = 38 + rand() * 5, x = 25 + Math.cos(a) * rr, z = 15 + Math.sin(a) * rr;
      if (Math.sqrt(x * x + z * z) > B.mapRadius - 6 || B.blocked(x, z, 2)) continue;
      MP.addRock(B, rocks, x, z, 1.5 + rand() * 2.4, 0.3);
      B.obstacle(x, z, 1.6);
    }
    B.scatter({ n: touch ? 60 : 110, rmin: 10, rmax: 88, shared: false }).forEach(function (p) { MP.addRock(B, rocks, p.x, p.z, 0.3 + rand() * 1.2, 0.3); });
    /* gravel mounds */
    var mounds = [];
    B.scatter({ n: 18, rmin: 12, rmax: 84, minDist: 6 }).forEach(function (p) {
      var s = 1.3 + rand() * 1.6; mounds.push({ x: p.x, z: p.z, y: hY(p.x, p.z) + s * 0.55, sx: s * 1.7, sy: s * 1.1, sz: s * 1.7, ry: rand() * 6, c: [0.32 + rand() * 0.06, 0.3 + rand() * 0.05, 0.27] });
      B.obstacle(p.x, p.z, s * 1.2);
    });
    B.inst(new T.ConeGeometry(1, 1, 8), B.ph(0xffffff), mounds, { fallback: 0x4a463e });
    /* containers (some stacked) */
    var cols = [0x8a2a22, 0x2a4a7a, 0x3a6a3a, 0x7a6a22, 0x5a5a5e], cont = [];
    B.scatter({ n: 14, rmin: 12, rmax: 80, minDist: 9 }).forEach(function (p) {
      var yaw = rand() < 0.5 ? 0 : Math.PI / 2, c = cols[Math.floor(rand() * cols.length)];
      var g = new T.Group();
      g.add(B.mesh(B.box(6, 2.6, 2.5), B.ph(c), 0, 1.3, 0));
      if (rand() < 0.4) g.add(B.mesh(B.box(6, 2.6, 2.5), B.ph(cols[Math.floor(rand() * cols.length)]), 0, 3.9, 0));
      g.position.set(p.x, hY(p.x, p.z), p.z); g.rotation.y = yaw; B.add(g);
      for (var k = -2; k <= 2; k++) B.obstacle(p.x + Math.cos(yaw) * k * 1.3, p.z - Math.sin(yaw) * k * 1.3, 1.5);
    });
    /* the container safe + the bunker vault */
    var s1 = B.w.stashes[1], s2 = B.w.stashes[2];
    MP.building(B, { x: s1.x, z: s1.z - 0.4, w: 6, d: 3.2, h: 2.6, gap: 2.2, wall: 0x2a4a7a, roof: 0x22344f, floor: 0x333333, lamp: false });
    MP.safe(B, s1, 0);
    MP.building(B, { x: s2.x, z: s2.z - 1.8, w: 9, d: 6, h: 4, gap: 2.0, wall: 0x8a8a86, roof: 0x4a4a48, floor: 0x333333 });
    MP.safe(B, s2, 0);
    /* excavator */
    (function () {
      var g = new T.Group();
      g.add(B.mesh(B.box(3.2, 1.2, 4.2), B.ph(0xd0a020), 0, 1.0, 0));
      g.add(B.mesh(B.box(2.2, 1.6, 2.2), B.ph(0xe0b030), 0, 2.3, 0.6));
      var arm = B.mesh(B.box(0.5, 0.5, 5), B.ph(0xd0a020), 0, 3.4, -2.2); arm.rotation.x = 0.5; g.add(arm);
      g.add(B.mesh(B.box(3.6, 0.5, 4.6), B.ph(0x222222), 0, 0.3, 0));
      g.position.set(10, hY(10, -30), -30); g.rotation.y = 0.8; B.add(g);
      B.obstacle(10, -30, 2.4); B.obstacle(8.4, -28, 1.8); B.obstacle(11.6, -32, 1.8);
    })();
    /* floodlight towers */
    [[-22, -10], [48, -20], [10, 50], [-34, 52], [60, 30], [-60, -30]].forEach(function (p) { MP.lamp(B, p[0], p[1], 0xeaf4ff); });
    /* barrels, cones, fences */
    var barrels = [];
    B.scatter({ n: 30, rmin: 10, rmax: 80, shared: false }).forEach(function (p) { barrels.push({ x: p.x, z: p.z, y: hY(p.x, p.z) + 0.5 }); B.obstacle(p.x, p.z, 0.45); });
    B.inst(new T.CylinderGeometry(0.4, 0.4, 1.0, 8), B.ph(0x8a3a1a), barrels);
    MP.fence(B, -30, -20, 10, -20, [0.4, 0.6]); MP.fence(B, 40, 10, 40, 50, [0.5, 0.7]);
    B.scatter({ n: 40, rmin: 10, rmax: 85, shared: false }).forEach(function (p) { MP.addBush(B, bushes, p.x, p.z, 0.6 + rand() * 0.6, [0.15, 0.2, 0.1]); });
    var s0 = B.w.stashes[0];
    MP.cover(B, s0.x, s0.z, bushes, rocks, { n: 5, r: 3.2, tint: [0.15, 0.2, 0.1] });
    MP.bushes(B, bushes); MP.rocks(B, rocks);
  }

  /* ================= MAP 5: the cow level (hidden) ================= */
  var P_STASH = [
    { x: 18, z: 20, kind: 'buried' },
    { x: -26, z: 14, kind: 'pile' },
    { x: 4, z: -40, kind: 'buried', hidden: true }
  ];
  function pastureHeight(x, z) {
    var d = Math.sqrt(x * x + z * z);
    return (1.8 * Math.sin(x * 0.05) * Math.cos(z * 0.04) + 0.6 * Math.sin(x * 0.13 + 1)) * smooth(6, 20, d);
  }
  function pastureColor(x, z, h, r0) {
    var n = r0() * 0.03, f = r0() < 0.02;
    if (f) return [0.8, 0.75, 0.2];
    return [0.1 + n, 0.3 + n + 0.04 * Math.sin(x * 0.2), 0.12 + n];
  }
  function buildPasture(B) {
    var T = B.T, rand = B.rand, hY = B.hY, bushes = [], rocks = [];
    var cows = B.scatter({ n: 26, rmin: 8, rmax: 62, minDist: 5 });
    cows.forEach(function (p, i) {
      var c = B.w.makeCow(p.x, p.z, rand() * 6.28, i === 0);
      B.add(c); B.w.cows.push(c); B.obstacle(p.x, p.z, 1.0);
    });
    B.w.stashes.concat(B.w.junk).forEach(function (o) { if (o.kind === 'pile') MP.hay(B, o.x, o.z, rand() * 3); });
    var bal = [];
    B.scatter({ n: 14, rmin: 10, rmax: 62, shared: false }).forEach(function (p) {
      bal.push({ x: p.x, z: p.z, y: hY(p.x, p.z) + 0.5, rz: Math.PI / 2, ry: rand() * 6 }); B.obstacle(p.x, p.z, 0.8);
    });
    B.inst(new T.CylinderGeometry(0.55, 0.55, 1.1, 10), B.ph(0xc9a94a), bal);
    MP.fence(B, -40, -10, -40, 40, [0.45, 0.6]); MP.fence(B, 40, -10, 40, 40, [0.3, 0.45]);
    B.scatter({ n: 60, rmin: 8, rmax: 64, shared: false }).forEach(function (p) { MP.addBush(B, bushes, p.x, p.z, 0.6 + rand() * 0.8, [0.1, 0.28, 0.1]); });
    B.scatter({ n: 24, rmin: 8, rmax: 64, shared: false }).forEach(function (p) { MP.addRock(B, rocks, p.x, p.z, 0.3 + rand() * 0.8, 0.34); });
    var s2 = B.w.stashes[2];
    MP.cover(B, s2.x, s2.z, bushes, rocks, { n: 8, r: 3.0, tint: [0.1, 0.28, 0.1] });
    MP.bushes(B, bushes); MP.rocks(B, rocks);
  }

  /* ================= definitions ================= */
  var list = [
    {
      id: 'forest', nameKey: 'map1_name', introKey: 'map1_intro', photo: 'forest', seed: 20261113, radius: 92, roadR: 84, time: 420,
      sky: { bg: 0x0a1520, fog: 0x0d1a24, fogDensity: 0.026, hemi: [0x3a5a78, 0x0a1410, 0.62], stars: 320 },
      weather: { fog: [0.026, 0.030, 0.036, 0.040, 0.034], rainFrom: 3, rainTo: 4 },
      events: [{ n: 1, stage: 1, toast: 'toast_fog' }, { n: 2, stage: 2, toast: 'toast_fog', thief: true }, { n: 3, stage: 3, toast: 'toast_rain', heli: true }, { n: 4, stage: 4, toast: 'toast_clear' }],
      ambience: { wind: 0.6, crickets: 1.1, owls: 1.2, dog: 1, extras: [] },
      start: { x: 3, z: -9 }, vanSpots: F_VAN, stashes: F_STASH, pickups: F_PICK, police: { x: 8, z: -3 },
      junk: [{ ang: 60, r: 24, kind: 'boot' }, { ang: 135, r: 30, kind: 'duck' }, { ang: 205, r: 50, kind: 'boot' }, { ang: 285, r: 36, kind: 'boot' },
             { x: 14, z: -48, kind: 'pile' }, { x: -58, z: 12, kind: 'pile' }],
      diggers: [{ x: -12, z: 26 }, { x: 32, z: 8 }, { x: -46, z: -8 }, { x: 22, z: -58 }, { x: -30, z: 56 }],
      search: [{ x: -15, z: 50 }, { x: 50, z: -30 }, { x: -60, z: -5 }, { x: 20, z: 62 }, { x: -45, z: -52 }],
      reserve: [{ x: F_CABIN.x, z: F_CABIN.z, r: 7.5 }, { x: F_PICK[0].x - 1.6, z: F_PICK[0].z - 0.8, r: 6.5 }, { x: F_PICK[1].x - 1.6, z: F_PICK[1].z - 0.8, r: 6.5 }],
      height: forestHeight, color: forestColor, build: buildForest,
      cases: [{ huf: 500000000, eur: 300000, usd: 100000 }, { huf: 450000000, eur: 250000, usd: 90000 }, { huf: 400000000, eur: 200000, usd: 80000 },
              { huf: 400000000, eur: 150000, usd: 70000 }, { huf: 350000000, eur: 100000, usd: 60000 }]
    },
    {
      id: 'farm', nameKey: 'map2_name', introKey: 'map2_intro', photo: 'farm', seed: 77123, radius: 100, roadR: 90, roadColor: 0x3a3226, time: 420,
      sky: { bg: 0x141c34, fog: 0x1c2640, fogDensity: 0.013, hemi: [0x5a6f9a, 0x1c1a14, 0.8], stars: 460, moonLight: 0x9fb4e0 },
      weather: { fog: [0.013, 0.016, 0.021, 0.026, 0.017], rainFrom: 3, rainTo: 4 },
      events: [{ n: 1, stage: 1, toast: 'toast_fog' }, { n: 2, stage: 2, toast: 'toast_fog', thief: true }, { n: 3, stage: 3, toast: 'toast_rain', heli: true }],
      ambience: { wind: 1.6, crickets: 1.2, owls: 0.8, dog: 1.2, extras: ['cows'] },
      start: { x: 3, z: -18 }, vanSpots: [{ x: 0, z: -10 }, { x: -45, z: -30 }, { x: 55, z: 5 }, { x: 10, z: 60 }],
      stashes: FA_STASH, pickups: [{ x: -12, z: -4 }, { x: 22, z: -8 }], police: { x: 14, z: -16 },
      junk: [{ x: -60, z: -5, kind: 'boot' }, { x: 55, z: -35, kind: 'boot' }, { x: 20, z: 40, kind: 'duck' }, { x: -30, z: 62, kind: 'pile' }, { x: 50, z: 52, kind: 'pile' }, { x: 36, z: 24, kind: 'pile' }],
      diggers: [{ x: -55, z: 50 }, { x: 30, z: 62 }, { x: 62, z: -30 }, { x: -62, z: -48 }],
      search: [{ x: -40, z: 62 }, { x: 62, z: 30 }, { x: 20, z: -75 }, { x: -70, z: -20 }],
      reserve: [{ x: -26, z: 10, r: 12 }, { x: 34, z: 22, r: 14 }, { x: -45, z: -7, r: 8 }, { x: 10, z: 14, r: 4 }, { x: -12, z: 36, r: 12 }],
      height: farmHeight, color: farmColor, build: buildFarm,
      cases: [{ huf: 400000000, eur: 300000, usd: 100000 }, { huf: 400000000, eur: 250000, usd: 80000 }, { huf: 350000000, eur: 200000, usd: 70000 }, { huf: 350000000, eur: 150000, usd: 50000 }]
    },
    {
      id: 'village', nameKey: 'map3_name', introKey: 'map3_intro', photo: 'village', seed: 5551212, radius: 90, roadR: 55, roadColor: 0x1b1d20, time: 360,
      sky: { bg: 0x1a1520, fog: 0x2a1f22, fogDensity: 0.021, hemi: [0x7a6070, 0x16110f, 0.72], stars: 140, moonColor: 0xe8d8c8 },
      weather: { fog: [0.021, 0.024, 0.028, 0.032], rainFrom: 1, rainTo: 3 },
      events: [{ n: 1, stage: 1, toast: 'toast_rain' }, { n: 2, stage: 2, toast: 'toast_fog', thief: true, heli: true }],
      ambience: { wind: 0.3, crickets: 0.6, owls: 0.5, dog: 2.0, extras: ['traffic', 'church'] },
      start: { x: 3, z: -14 }, vanSpots: [{ x: 0, z: -8 }, { x: -35, z: 20 }, { x: 40, z: 15 }, { x: 8, z: 45 }],
      stashes: V_STASH, pickups: [{ x: 7, z: -3 }, { x: -30, z: 6 }], police: { x: 12, z: -14 },
      junk: [{ x: 32, z: -30, kind: 'boot' }, { x: -34, z: -20, kind: 'duck' }, { x: 4, z: 28, kind: 'boot' }, { x: 44, z: 24, kind: 'pile' }],
      diggers: [{ x: -32, z: 20 }, { x: 36, z: -26 }, { x: 4, z: -30 }],
      search: [{ x: -10, z: -4 }, { x: 8, z: 14 }, { x: -4, z: 30 }, { x: 28, z: 6 }],
      reserve: V_HOUSES.map(function (h) { return { x: h.x, z: h.z, r: 8 }; }).concat([{ x: -45, z: -32, r: 7 }]),
      height: villageHeight, color: villageColor, build: buildVillage,
      cases: [{ huf: 300000000, eur: 150000, usd: 70000 }, { huf: 300000000, eur: 120000, usd: 50000 }, { huf: 200000000, eur: 80000, usd: 37100 }]
    },
    {
      id: 'quarry', nameKey: 'map4_name', introKey: 'map4_intro', photo: 'quarry', seed: 9090909, radius: 95, roadR: 84, roadColor: 0x2c2a28, time: 360,
      sky: { bg: 0x080b10, fog: 0x10151c, fogDensity: 0.02, hemi: [0x4a5a70, 0x14100c, 0.62], stars: 220, moon: false },
      weather: { fog: [0.02, 0.024, 0.03, 0.034], rainFrom: 2, rainTo: 3 },
      events: [{ n: 1, stage: 1, toast: 'toast_dust', heli: true }, { n: 2, stage: 2, toast: 'toast_rain', thief: true }],
      ambience: { wind: 0.9, crickets: 0.25, owls: 0.4, dog: 0.7, extras: ['drips', 'rumble'] },
      start: { x: 3, z: -16 }, vanSpots: [{ x: 0, z: -8 }, { x: -45, z: -35 }, { x: 50, z: -22 }, { x: -30, z: 45 }],
      stashes: Q_STASH, pickups: [{ x: 8, z: 2 }, { x: -20, z: 10 }], police: { x: 14, z: -14 },
      junk: [{ x: 20, z: -40, kind: 'boot' }, { x: -30, z: -10, kind: 'duck' }, { x: 55, z: 30, kind: 'boot' }],
      diggers: [{ x: 45, z: -40 }, { x: -20, z: 30 }], search: [{ x: -15, z: -20 }, { x: 40, z: -30 }, { x: 0, z: 40 }],
      reserve: [{ x: 25, z: 15, r: 30 }, { x: -12, z: -47, r: 6 }, { x: -44, z: 31, r: 8 }, { x: 10, z: -30, r: 4 }],
      dirtColor: 0x4a463e, decalColor: 0x2a2724,
      height: quarryHeight, color: quarryColor, build: buildQuarry,
      cases: [{ huf: 300000000, eur: 200000, usd: 200000 }, { huf: 250000000, eur: 120000, usd: 120000 }, { huf: 121632000, eur: 88350, usd: 80000 }]
    },
    {
      id: 'pasture', nameKey: 'map5_name', introKey: 'map5_intro', photo: 'pasture', seed: 31337, radius: 70, roadR: 0, time: 240, bonus: true,
      sky: { bg: 0x0f2418, fog: 0x1a3b27, fogDensity: 0.012, hemi: [0x5f8a6a, 0x142a18, 0.9], stars: 300, moonColor: 0xd8f0d0, moonLight: 0x9fe0a8 },
      weather: { fog: [0.012], rainFrom: 9, rainTo: 9 },
      events: [],
      ambience: { wind: 0.4, crickets: 1.0, owls: 0.5, dog: 0.3, extras: ['cows'] },
      start: { x: 3, z: -10 }, vanSpots: [{ x: 0, z: -6 }, { x: -30, z: 20 }, { x: 30, z: 20 }],
      stashes: P_STASH, pickups: [{ x: 10, z: -4 }], police: null,
      junk: [{ x: 30, z: -20, kind: 'duck' }, { x: -20, z: -30, kind: 'boot' }, { x: 40, z: 10, kind: 'pile' }],
      diggers: [], search: [],
      reserve: [],
      height: pastureHeight, color: pastureColor, build: buildPasture,
      cases: [{ huf: 1000, eur: 0, usd: 0 }, { huf: 1000, eur: 0, usd: 0 }, { huf: 1000, eur: 0, usd: 0 }]
    }
  ];

  ASO.Maps = { list: list, MP: MP };
})();
