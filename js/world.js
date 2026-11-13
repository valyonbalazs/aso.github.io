/* Generic world builder (three.js r128, classic global THREE). A map definition (js/maps.js) supplies terrain,
   layout and scenery; this file builds everything that every map shares. */
(function () {
  'use strict';
  window.ASO = window.ASO || {};

  function mulberry32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function smooth(a, b, x) {
    x = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return x * x * (3 - 2 * x);
  }
  function polar(d) {
    if (d.x !== undefined) return { x: d.x, z: d.z };
    var a = d.ang * Math.PI / 180;
    return { x: d.r * Math.sin(a), z: d.r * Math.cos(a) };
  }

  function create(canvas, def, opts) {
    var T = THREE;
    var isTouch = !!opts.isTouch;
    var rand = mulberry32(def.seed || 1);
    var MAP_R = def.radius;
    var sky = def.sky;

    var renderer = opts.renderer || new T.WebGLRenderer({ canvas: canvas, antialias: !isTouch, powerPreference: 'high-performance' });
    var basePR = opts.basePR || Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2);
    if (!opts.renderer) renderer.setPixelRatio(basePR);

    var scene = new T.Scene();
    scene.background = new T.Color(sky.bg);
    scene.fog = new T.FogExp2(sky.fog, sky.fogDensity);
    var camera = new T.PerspectiveCamera(72, 1, 0.1, 260);
    camera.rotation.order = 'YXZ';
    scene.add(camera);

    var hemi = new T.HemisphereLight(sky.hemi[0], sky.hemi[1], sky.hemi[2]);
    scene.add(hemi);
    var moonLight = new T.DirectionalLight(sky.moonLight || 0x8fb2d8, 0.38);
    moonLight.position.set(-40, 70, -60);
    scene.add(moonLight);
    var spot = new T.SpotLight(0xfff0c8, 2.6, 48, 0.46, 0.55, 1.2);
    spot.position.set(0.15, -0.1, 0);
    camera.add(spot);
    var spotTarget = new T.Object3D();
    spotTarget.position.set(0, 0, -6);
    camera.add(spotTarget);
    spot.target = spotTarget;

    function phong(color, extra) {
      var m = { color: color, flatShading: true, shininess: 0, specular: 0x000000 };
      if (extra) for (var k in extra) m[k] = extra[k];
      return new T.MeshPhongMaterial(m);
    }
    var hY = function (x, z) { return def.height(x, z); };

    var w = {
      def: def, renderer: renderer, scene: scene, camera: camera, heightAt: hY, mapRadius: MAP_R,
      stashes: [], junk: [], van: { x: 0, z: 0, rear: { x: 0, z: -4.0 } }, start: def.start,
      phong: phong, mulberry: mulberry32, flickers: [], cows: [],
      lights: { hemi: hemi, moon: moonLight, spot: spot, hemiBase: sky.hemi[2] }
    };

    /* ---------- layout ---------- */
    def.stashes.forEach(function (d, i) {
      var p = polar(d);
      w.stashes.push({ idx: i, kind: d.kind, x: p.x, z: p.z, ox: p.x, oz: p.z, hidden: !!d.hidden, lock: d.lock || null,
        dug: false, progress: 0, drop: false, stolen: false, lost: false, decal: null, hole: null, door: null });
    });
    def.junk.forEach(function (d) {
      var p = polar(d);
      w.junk.push({ kind: d.kind, x: p.x, z: p.z, dug: false, progress: 0, decal: null, item: null });
    });
    function decalShown(o) {
      if (o.idx !== undefined) return (o.kind === 'buried' || o.kind === 'deep') && !o.hidden;
      return o.kind === 'boot' || o.kind === 'duck';
    }
    var patrol = null;
    if (def.patrolPath) patrol = def.patrolPath;
    else if (def.roadR) {
      patrol = [];
      for (var pi = 0; pi < 64; pi++) {
        var pa = pi / 64 * Math.PI * 2;
        patrol.push({ x: def.roadR * Math.cos(pa), z: def.roadR * Math.sin(pa) });
      }
    }
    w.layout = { vanSpots: def.vanSpots, diggers: def.diggers || [], search: def.search || [], pickups: def.pickups || [],
                 police: def.police || null, patrol: patrol, roadR: def.roadR || 0 };

    /* ---------- reservations (keep scenery away from gameplay spots) ---------- */
    var spots = [];
    w.reserve = function (x, z, r) { spots.push({ x: x, z: z, r: r }); };
    w.blocked = function (x, z, pad) {
      pad = pad || 0;
      for (var i = 0; i < spots.length; i++) {
        var dx = x - spots[i].x, dz = z - spots[i].z, rr = spots[i].r + pad;
        if (dx * dx + dz * dz < rr * rr) return true;
      }
      if (def.roadR) {
        var d = Math.sqrt(x * x + z * z);
        if (Math.abs(d - def.roadR) < 6.5 + pad) return true;
      }
      return false;
    };
    def.vanSpots.forEach(function (v) { w.reserve(v.x, v.z, 11); });
    w.stashes.forEach(function (s) { w.reserve(s.x, s.z, 4.2); });
    w.junk.forEach(function (j) { w.reserve(j.x, j.z, 3.4); });
    (def.diggers || []).forEach(function (d) { w.reserve(d.x, d.z, 4.5); });
    (def.pickups || []).forEach(function (c) { w.reserve(c.x, c.z, 4.5); });
    if (def.police) w.reserve(def.police.x, def.police.z, 6.5);
    w.reserve(def.start.x, def.start.z, 5);
    (def.reserve || []).forEach(function (r) { w.reserve(r.x, r.z, r.r); });

    /* ---------- the map root (everything map-specific lives here) ---------- */
    var root = new T.Group();
    scene.add(root);

    /* ---------- terrain ---------- */
    (function () {
      var SIZE = (MAP_R + 40) * 2, SEG = 120;
      var geo = new T.PlaneGeometry(SIZE, SIZE, SEG, SEG);
      geo.rotateX(-Math.PI / 2);
      var pos = geo.attributes.position;
      var cols = new Float32Array(pos.count * 3);
      var r0 = mulberry32(7), colorFn = def.color || function () { return [0.1, 0.18, 0.1]; };
      for (var i = 0; i < pos.count; i++) {
        var x = pos.getX(i), z = pos.getZ(i), h = hY(x, z);
        pos.setY(i, h);
        var c = colorFn(x, z, h, r0);
        cols[i * 3] = c[0]; cols[i * 3 + 1] = c[1]; cols[i * 3 + 2] = c[2];
      }
      geo.setAttribute('color', new T.BufferAttribute(cols, 3));
      geo.computeVertexNormals();
      root.add(new T.Mesh(geo, phong(0xffffff, { vertexColors: true })));
    })();

    /* ---------- ring road ---------- */
    if (def.roadR) (function () {
      var R0 = def.roadR - 3.2, R1 = def.roadR + 3.2, N = 160, pos = new Float32Array((N + 1) * 2 * 3), idx = [], i, k;
      for (i = 0; i <= N; i++) {
        var a = i / N * Math.PI * 2;
        for (k = 0; k < 2; k++) {
          var r = k ? R1 : R0, x = r * Math.cos(a), z = r * Math.sin(a), o = (i * 2 + k) * 3;
          pos[o] = x; pos[o + 1] = hY(x, z) + 0.08; pos[o + 2] = z;
        }
      }
      for (i = 0; i < N; i++) {
        var A0 = i * 2, B0 = i * 2 + 1, C0 = (i + 1) * 2, D0 = (i + 1) * 2 + 1;
        idx.push(A0, C0, B0, B0, C0, D0);
      }
      var g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      root.add(new T.Mesh(g, phong(def.roadColor || 0x23282c, { flatShading: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, side: T.DoubleSide })));
    })();

    /* ---------- sky ---------- */
    var skyGroup = new T.Group();
    scene.add(skyGroup);
    (function () {
      var n = sky.stars === undefined ? 320 : sky.stars, arr = new Float32Array(n * 3), r1 = mulberry32(99);
      for (var i = 0; i < n; i++) {
        var u = r1() * Math.PI * 2, v = 0.12 + r1() * 1.2;
        arr[i * 3] = 200 * Math.cos(u) * Math.cos(v);
        arr[i * 3 + 1] = 200 * Math.sin(v);
        arr[i * 3 + 2] = 200 * Math.sin(u) * Math.cos(v);
      }
      var g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(arr, 3));
      var stars = new T.Points(g, new T.PointsMaterial({ color: 0xffffff, size: 1.7, sizeAttenuation: false, fog: false }));
      stars.frustumCulled = false;
      skyGroup.add(stars);
      if (sky.moon !== false) {
        var moon = new T.Mesh(new T.SphereGeometry(9, 14, 10), new T.MeshBasicMaterial({ color: sky.moonColor || 0xdce8f2, fog: false }));
        moon.position.set(-90, 95, -150);
        skyGroup.add(moon);
        var halo = new T.Mesh(new T.SphereGeometry(16, 14, 10), new T.MeshBasicMaterial({ color: 0xbfd3e6, fog: false, transparent: true, opacity: 0.12, depthWrite: false }));
        halo.position.copy(moon.position);
        skyGroup.add(halo);
      }
    })();

    /* ---------- collision grid ---------- */
    var CELL = 6, grid = {};
    function cellKey(cx, cz) { return (cx + 64) * 256 + (cz + 64); }
    function addObstacle(x, z, r, soft) {
      var k = cellKey(Math.floor(x / CELL), Math.floor(z / CELL));
      (grid[k] || (grid[k] = [])).push({ x: x, z: z, r: r, soft: !!soft });
    }
    var vanCircles = [{ x: 0, z: -1.7, r: 1.7 }, { x: 0, z: 0.1, r: 1.7 }, { x: 0, z: 1.9, r: 1.6 }];
    w.addObstacle = addObstacle;
    w.vanCircles = vanCircles;
    w.resolve = function (p, r, skipSoft) {
      var cx = Math.floor(p.x / CELL), cz = Math.floor(p.z / CELL), i, j, list, o, dx, dz, dd, min, push;
      for (i = -1; i <= 1; i++) {
        for (j = -1; j <= 1; j++) {
          list = grid[cellKey(cx + i, cz + j)];
          if (!list) continue;
          for (var k = 0; k < list.length; k++) {
            o = list[k];
            if (skipSoft && o.soft) continue;
            dx = p.x - o.x; dz = p.z - o.z;
            dd = Math.sqrt(dx * dx + dz * dz); min = r + o.r;
            if (dd < min && dd > 1e-4) { push = (min - dd) / dd; p.x += dx * push; p.z += dz * push; }
          }
        }
      }
      for (i = 0; i < vanCircles.length; i++) {
        o = vanCircles[i]; dx = p.x - o.x; dz = p.z - o.z;
        dd = Math.sqrt(dx * dx + dz * dz); min = r + o.r;
        if (dd < min && dd > 1e-4) { push = (min - dd) / dd; p.x += dx * push; p.z += dz * push; }
      }
      var d = Math.sqrt(p.x * p.x + p.z * p.z);
      if (d > MAP_R) { p.x *= MAP_R / d; p.z *= MAP_R / d; }
    };

    /* steering for the dog and NPCs: head for the target, sliding around anything solid in the way */
    w.steer = function (a, tx, tz, r) {
      var base = Math.atan2(tx - a.x, tz - a.z), offs = [0, 0.45, 0.9, 1.4, 2.0, 2.8], side = a.side || 1, i, s, ang, px, pz, p;
      for (i = 0; i < offs.length; i++) {
        for (s = 0; s < 2; s++) {
          ang = base + offs[i] * (s === 0 ? side : -side);
          px = a.x + Math.sin(ang) * 1.3; pz = a.z + Math.cos(ang) * 1.3;
          p = { x: px, z: pz };
          w.resolve(p, r || 0.35, true);
          if (Math.abs(p.x - px) + Math.abs(p.z - pz) < 0.05) {
            if (s === 1 && i > 0) a.side = -side;
            return ang;
          }
          if (i === 0) break;
        }
      }
      return base;
    };

    /* A* over a 1.5 m grid of walkable cells (used when steering alone gets stuck, e.g. inside a building) */
    w.findPath = function (ax, az, tx, tz) {
      var C = 1.5, off = Math.ceil((MAP_R + 2) / C), n = off * 2 + 1, cache = {};
      function kk(ix, iz) { return iz * n + ix; }
      function free(ix, iz) {
        if (ix < 0 || iz < 0 || ix >= n || iz >= n) return false;
        var key = kk(ix, iz), v = cache[key];
        if (v === undefined) {
          var x = (ix - off) * C, z = (iz - off) * C, p = { x: x, z: z };
          w.resolve(p, 0.4, true);
          v = cache[key] = (Math.abs(p.x - x) + Math.abs(p.z - z) < 0.06);
        }
        return v;
      }
      var sx = Math.round(ax / C) + off, sz = Math.round(az / C) + off, gx = Math.round(tx / C) + off, gz = Math.round(tz / C) + off;
      var open = [], g = {}, came = {}, closed = {}, found = null, iter = 0;
      function h(ix, iz) { var dx = ix - gx, dz = iz - gz; return Math.sqrt(dx * dx + dz * dz); }
      function push(nd) {
        open.push(nd);
        var i = open.length - 1;
        while (i > 0) { var p = (i - 1) >> 1; if (open[p].f <= open[i].f) break; var t = open[p]; open[p] = open[i]; open[i] = t; i = p; }
      }
      function pop() {
        var top = open[0], last = open.pop();
        if (open.length) {
          open[0] = last;
          var i = 0, Ln = open.length;
          for (;;) {
            var l = 2 * i + 1, r = l + 1, m = i;
            if (l < Ln && open[l].f < open[m].f) m = l;
            if (r < Ln && open[r].f < open[m].f) m = r;
            if (m === i) break;
            var t = open[m]; open[m] = open[i]; open[i] = t; i = m;
          }
        }
        return top;
      }
      g[kk(sx, sz)] = 0; push({ x: sx, z: sz, f: h(sx, sz) });
      while (open.length && iter++ < 9000) {
        var cur = pop(), ck = kk(cur.x, cur.z);
        if (closed[ck]) continue;
        closed[ck] = true;
        if (Math.abs(cur.x - gx) <= 1 && Math.abs(cur.z - gz) <= 1) { found = cur; break; }
        for (var dx = -1; dx <= 1; dx++) for (var dz = -1; dz <= 1; dz++) {
          if (!dx && !dz) continue;
          var nx = cur.x + dx, nz = cur.z + dz;
          if (!free(nx, nz)) continue;
          if (dx && dz && (!free(cur.x + dx, cur.z) || !free(cur.x, cur.z + dz))) continue;
          var nk = kk(nx, nz), ng = g[ck] + (dx && dz ? 1.414 : 1);
          if (g[nk] === undefined || ng < g[nk]) { g[nk] = ng; came[nk] = ck; push({ x: nx, z: nz, f: ng + h(nx, nz) }); }
        }
      }
      if (!found) return null;
      var path = [], c = kk(found.x, found.z), start = kk(sx, sz);
      while (c !== undefined && c !== start) { path.push({ x: ((c % n) - off) * C, z: (Math.floor(c / n) - off) * C }); c = came[c]; }
      path.reverse();
      return path;
    };
    /* where should an agent head right now? Follows a found path while it lasts, otherwise straight at the goal. */
    w.pathTarget = function (a, tx, tz, dt) {
      var d = Math.sqrt((tx - a.x) * (tx - a.x) + (tz - a.z) * (tz - a.z));
      if (!a.pgGoal || Math.abs(a.pgGoal[0] - tx) + Math.abs(a.pgGoal[1] - tz) > 4) { a.pgGoal = [tx, tz]; a.pgD = d; a.pgT = 0; a.path = null; }
      if (a.path && a.path.length) {
        a.pgT = 0; a.pgD = d;
        if (Math.abs(a.path[0].x - a.x) + Math.abs(a.path[0].z - a.z) < 1.1) a.path.shift();
        if (a.path.length) return a.path[0];
        a.path = null;
      }
      if (d < a.pgD - 0.6) { a.pgD = d; a.pgT = 0; } else a.pgT += dt;
      a.pathCd = (a.pathCd || 0) - dt;
      if (a.pgT > 1.8 && a.pathCd <= 0) {
        a.path = w.findPath(a.x, a.z, tx, tz); a.pathCd = 4; a.pgT = 0; a.pgD = d;
        if (a.path && a.path.length) return a.path[0];
        a.path = null;
      }
      return { x: tx, z: tz };
    };

    /* ---------- builder context for map definitions ---------- */
    var placedHash = {}, PH = 2.4;
    function phKey(x, z) { return Math.floor(x / PH) * 1000 + Math.floor(z / PH); }
    function B_mesh(g, m, x, y, z) {
      var o = new T.Mesh(g, m);
      if (x !== undefined) o.position.set(x, y, z);
      return o;
    }
    var B = {
      T: T, w: w, def: def, root: root, ph: phong, rand: rand, hY: hY, mapRadius: MAP_R,
      mesh: B_mesh,
      box: function (a, b, c) { return new T.BoxGeometry(a, b, c); },
      add: function (o) { root.add(o); return o; },
      obstacle: addObstacle, reserve: w.reserve, blocked: w.blocked,
      /* instanced mesh from a list of {x,y,z,sx,sy,sz,ry,c:[r,g,b]} */
      inst: function (geo, mat, list, o) {
        o = o || {};
        var im = new T.InstancedMesh(geo, mat, Math.max(1, list.length));
        im.frustumCulled = false;
        var dummy = new T.Object3D(), color = new T.Color(), hasC = typeof im.setColorAt === 'function';
        for (var i = 0; i < list.length; i++) {
          var it = list[i];
          dummy.position.set(it.x, it.y === undefined ? hY(it.x, it.z) : it.y, it.z);
          dummy.rotation.set(it.rx || 0, it.ry || 0, it.rz || 0);
          dummy.scale.set(it.sx || 1, it.sy || 1, it.sz || 1);
          dummy.updateMatrix();
          im.setMatrixAt(i, dummy.matrix);
          if (hasC && it.c) { color.setRGB(it.c[0], it.c[1], it.c[2]); im.setColorAt(i, color); }
        }
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
        if (!hasC && o.fallback !== undefined) im.material.color.setHex(o.fallback);
        root.add(im);
        return im;
      },
      /* random scatter that avoids reserved spots; returns [{x,z}] */
      scatter: function (o) {
        var out = [], tries = 0, minD = o.minDist || 0;
        var sx = o.cx || 0, sz = o.cz || 0;
        while (out.length < o.n && tries < o.n * 40) {
          tries++;
          var rmin = o.rmin || 0, rmax = o.rmax || MAP_R;
          var r = Math.sqrt(rand() * (rmax * rmax - rmin * rmin) + rmin * rmin), a = rand() * Math.PI * 2;
          var x = sx + r * Math.cos(a), z = sz + r * Math.sin(a);
          if (Math.sqrt(x * x + z * z) > MAP_R - 3) continue;
          if (o.box && (x < o.box[0] || x > o.box[1] || z < o.box[2] || z > o.box[3])) continue;
          if (w.blocked(x, z, o.pad || 0)) continue;
          if (o.accept && !o.accept(x, z)) continue;
          if (minD > 0 && o.shared !== false) {
            var cx = Math.floor(x / PH), cz = Math.floor(z / PH), bad = false, cs = Math.ceil(minD / PH);
            for (var i = -cs; i <= cs && !bad; i++) for (var j = -cs; j <= cs && !bad; j++) {
              var l = placedHash[(cx + i) * 1000 + (cz + j)];
              if (!l) continue;
              for (var k = 0; k < l.length; k++) {
                var dx = x - l[k].x, dz = z - l[k].z, mm = Math.max(minD, l[k].d || 0);
                if (dx * dx + dz * dz < mm * mm) { bad = true; break; }
              }
            }
            if (bad) continue;
            (placedHash[phKey(x, z)] || (placedHash[phKey(x, z)] = [])).push({ x: x, z: z, d: minD });
          }
          out.push({ x: x, z: z });
        }
        return out;
      }
    };
    B.isTouch = isTouch;
    w.B = B;
    w.claim = function (x, z, d) { (placedHash[phKey(x, z)] || (placedHash[phKey(x, z)] = [])).push({ x: x, z: z, d: d }); };

    /* ---------- the Treasury van ---------- */
    (function () {
      var van = new T.Group();
      var body = new T.Mesh(new T.BoxGeometry(2.5, 2.4, 5.0), phong(0x9fb0b8));
      body.position.set(0, 1.55, -0.2);
      var cab = new T.Mesh(new T.BoxGeometry(2.5, 1.7, 1.7), phong(0x7f939c));
      cab.position.set(0, 1.15, 2.7);
      var roof = new T.Mesh(new T.BoxGeometry(2.6, 0.12, 5.1), phong(0xb7c4ca));
      roof.position.set(0, 2.78, -0.2);
      van.add(body, cab, roof);
      var wheelGeo = new T.CylinderGeometry(0.5, 0.5, 0.4, 10);
      [[-1.25, 2.4], [1.25, 2.4], [-1.25, -1.8], [1.25, -1.8]].forEach(function (p) {
        var wh = new T.Mesh(wheelGeo, phong(0x0b0f12));
        wh.rotation.z = Math.PI / 2; wh.position.set(p[0], 0.5, p[1]);
        van.add(wh);
      });
      var inner = new T.Mesh(new T.PlaneGeometry(2.1, 2.0), new T.MeshBasicMaterial({ color: 0xf2b84b }));
      inner.rotation.y = Math.PI; inner.position.set(0, 1.5, -2.72);
      van.add(inner);
      var caseMat = phong(0x5a6b74);
      for (var r = 0; r < 2; r++) for (var c = 0; c < 4 - r; c++) {
        var cs = new T.Mesh(new T.BoxGeometry(0.42, 0.34, 0.5), caseMat);
        cs.position.set(-0.7 + c * 0.47 + r * 0.24, 0.62 + r * 0.36, -2.55);
        van.add(cs);
      }
      var doorMat = phong(0x7f939c);
      var dl = new T.Mesh(new T.BoxGeometry(0.1, 2.2, 1.2), doorMat);
      dl.position.set(-1.95, 1.5, -3.1); dl.rotation.y = -0.6;
      var dr = dl.clone(); dr.material = doorMat; dr.position.x = 1.95; dr.rotation.y = 0.6;
      van.add(dl, dr);
      var c2 = document.createElement('canvas'); c2.width = 512; c2.height = 96;
      var g2 = c2.getContext('2d');
      g2.fillStyle = '#F2B84B'; g2.fillRect(0, 0, 512, 96);
      g2.fillStyle = '#1A1307'; g2.font = 'bold 54px sans-serif'; g2.textAlign = 'center'; g2.textBaseline = 'middle';
      g2.fillText('ÁLLAMKINCSTÁR', 256, 50);
      var sign = new T.Mesh(new T.PlaneGeometry(2.3, 0.43), new T.MeshBasicMaterial({ map: new T.CanvasTexture(c2) }));
      sign.rotation.y = Math.PI; sign.position.set(0, 3.0, -2.78);
      van.add(sign);
      var lamp = new T.PointLight(0xffb84a, 1.7, 24, 1.5);
      lamp.position.set(0, 1.6, -3.4);
      van.add(lamp);
      scene.add(van);
      w.vanGroup = van;
      var beam = new T.Mesh(
        new T.CylinderGeometry(0.4, 0.4, 60, 8, 1, true),
        new T.MeshBasicMaterial({ color: 0xf2b84b, transparent: true, opacity: 0.16, blending: T.AdditiveBlending, depthWrite: false, fog: false, side: T.DoubleSide })
      );
      scene.add(beam);
      w.beacon = beam;
      w.vanIndex = 0;
      w.moveVan = function (i) {
        var sp = def.vanSpots[i], y = hY(sp.x, sp.z);
        w.vanIndex = i;
        w.van.x = sp.x; w.van.z = sp.z; w.van.rear.x = sp.x; w.van.rear.z = sp.z - 4.0;
        van.position.set(sp.x, y, sp.z);
        beam.position.set(sp.x, y + 30, sp.z - 3.5);
        vanCircles[0].x = sp.x; vanCircles[0].z = sp.z - 1.7;
        vanCircles[1].x = sp.x; vanCircles[1].z = sp.z + 0.1;
        vanCircles[2].x = sp.x; vanCircles[2].z = sp.z + 1.9;
      };
      w.moveVan(0);
    })();

    /* ---------- the dog ---------- */
    (function () {
      var g = new T.Group();
      var tan = phong(0xc98a4b), dark = phong(0x8a5a2b), gold = phong(0xf2b84b), black = phong(0x1a1307);
      var body = new T.Mesh(new T.BoxGeometry(0.34, 0.32, 0.8), tan); body.position.set(0, 0.56, 0);
      var vest = new T.Mesh(new T.BoxGeometry(0.37, 0.2, 0.3), gold); vest.position.set(0, 0.6, 0.12);
      var head = new T.Group(); head.position.set(0, 0.76, 0.42);
      var skull = new T.Mesh(new T.BoxGeometry(0.26, 0.26, 0.3), tan); skull.position.set(0, 0.06, 0.1);
      var snout = new T.Mesh(new T.BoxGeometry(0.14, 0.12, 0.22), tan); snout.position.set(0, 0.0, 0.3);
      var nose = new T.Mesh(new T.BoxGeometry(0.06, 0.05, 0.04), black); nose.position.set(0, 0.04, 0.42);
      var earL = new T.Mesh(new T.BoxGeometry(0.07, 0.18, 0.1), dark); earL.position.set(-0.1, 0.24, 0.06);
      var earR = earL.clone(); earR.position.x = 0.1;
      head.add(skull, snout, nose, earL, earR);
      var tail = new T.Mesh(new T.BoxGeometry(0.07, 0.07, 0.4), dark);
      tail.position.set(0, 0.7, -0.52); tail.rotation.x = 0.7;
      g.add(body, vest, head, tail);
      var legs = [];
      [[-0.12, 0.28], [0.12, 0.28], [-0.12, -0.28], [0.12, -0.28]].forEach(function (p) {
        var lg = new T.Group(); lg.position.set(p[0], 0.42, p[1]);
        var m = new T.Mesh(new T.BoxGeometry(0.1, 0.42, 0.1), dark); m.position.y = -0.21;
        lg.add(m); g.add(lg); legs.push(lg);
      });
      g.scale.set(1.25, 1.25, 1.25);
      scene.add(g);
      w.dog = { group: g, head: head, tail: tail, legs: legs };
    })();

    /* ---------- first-person view models ---------- */
    (function () {
      var sh = new T.Group();
      var handle = new T.Mesh(new T.BoxGeometry(0.05, 1.0, 0.05), phong(0x7a5733)); handle.position.y = 0.0;
      var grip = new T.Mesh(new T.BoxGeometry(0.2, 0.05, 0.05), phong(0x7a5733)); grip.position.y = 0.5;
      var blade = new T.Mesh(new T.BoxGeometry(0.26, 0.3, 0.03), phong(0x9db0b8)); blade.position.y = -0.62;
      sh.add(handle, grip, blade);
      sh.position.set(0.38, -0.5, -0.78);
      sh.rotation.set(-0.35, 0.15, 0.25);
      camera.add(sh);
      w.shovel = sh;
      var hc = new T.Group();
      var cb = new T.Mesh(new T.BoxGeometry(0.5, 0.26, 0.34), phong(0x4a5a63));
      var latch = new T.Mesh(new T.BoxGeometry(0.08, 0.06, 0.04), phong(0xf2b84b)); latch.position.set(0, 0.04, 0.19);
      var strap = new T.Mesh(new T.BoxGeometry(0.52, 0.04, 0.1), phong(0x2b363c)); strap.position.set(0, 0.06, 0);
      hc.add(cb, latch, strap);
      hc.position.set(0, -0.46, -0.72);
      hc.visible = false;
      camera.add(hc);
      w.heldCase = hc;
    })();

    /* ---------- dirt particles ---------- */
    var parts = [], partGroup = new T.Group();
    (function () {
      var geo = new T.BoxGeometry(0.08, 0.08, 0.08), mat = phong(def.dirtColor || 0x4a3a2a);
      for (var i = 0; i < 40; i++) {
        var m = new T.Mesh(geo, mat); m.visible = false;
        partGroup.add(m); parts.push({ m: m, vx: 0, vy: 0, vz: 0, life: 0 });
      }
      scene.add(partGroup);
    })();
    var partIdx = 0;
    w.spawnDirt = function (x, y, z, n) {
      for (var i = 0; i < n; i++) {
        var p = parts[partIdx++ % parts.length], a = Math.random() * Math.PI * 2, sp = 1 + Math.random() * 1.6;
        p.m.position.set(x, y, z); p.m.visible = true;
        p.vx = Math.cos(a) * sp; p.vz = Math.sin(a) * sp; p.vy = 2.6 + Math.random() * 2; p.life = 0.7 + Math.random() * 0.3;
      }
    };
    w.updateParticles = function (dt) {
      for (var i = 0; i < parts.length; i++) {
        var p = parts[i];
        if (!p.m.visible) continue;
        p.life -= dt;
        if (p.life <= 0) { p.m.visible = false; continue; }
        p.vy -= 9.8 * dt;
        p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt;
      }
    };

    /* ---------- decals (freshly turned earth) ---------- */
    w.stashes.concat(w.junk).forEach(function (o) {
      var d = new T.Mesh(new T.CircleGeometry(o.idx === undefined ? 0.7 : 0.95, 14),
        phong(def.decalColor || 0x2a1f16, { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
      d.rotation.x = -Math.PI / 2;
      d.position.set(o.x, hY(o.x, o.z) + 0.06, o.z);
      d.visible = decalShown(o);
      root.add(d);
      o.decal = d;
    });

    /* ---------- props created during play ---------- */
    var spawned = [];
    w.addHole = function (o) {
      var g = new T.Group();
      var gy = hY(o.x, o.z);
      var disc = new T.Mesh(new T.CircleGeometry(0.8, 14), phong(0x0b0805, { polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
      disc.rotation.x = -Math.PI / 2; disc.position.set(0, 0.09, 0);
      var mound = new T.Mesh(new T.TorusGeometry(1.0, 0.28, 6, 14), phong(def.dirtColor || 0x4a3a2a));
      mound.rotation.x = Math.PI / 2; mound.scale.set(1, 1, 0.55); mound.position.set(0, 0.1, 0);
      g.add(disc, mound); g.position.set(o.x, gy, o.z);
      scene.add(g); spawned.push(g); o.hole = g;
      if (o.decal) o.decal.visible = false;
    };
    function makeBoot() {
      var g = new T.Group(), m = phong(0x3a2a1c);
      var shaft = new T.Mesh(new T.BoxGeometry(0.18, 0.3, 0.14), m); shaft.position.set(0, 0.15, -0.05);
      var foot = new T.Mesh(new T.BoxGeometry(0.18, 0.1, 0.34), m); foot.position.set(0, 0.05, 0.06);
      g.add(shaft, foot); return g;
    }
    function makeDuck() {
      var g = new T.Group(), y = phong(0xf5d020);
      var b = new T.Mesh(new T.SphereGeometry(0.16, 8, 6), y); b.position.y = 0.16;
      var h = new T.Mesh(new T.SphereGeometry(0.1, 8, 6), y); h.position.set(0, 0.34, 0.1);
      var k = new T.Mesh(new T.BoxGeometry(0.08, 0.03, 0.08), phong(0xf08a1d)); k.position.set(0, 0.33, 0.2);
      g.add(b, h, k); return g;
    }
    w.addJunkItem = function (o) {
      var it = o.kind === 'duck' ? makeDuck() : makeBoot();
      var gy = hY(o.x + 0.5, o.z);
      it.position.set(o.x + 0.5, gy + 0.02, o.z);
      it.rotation.y = Math.random() * 6;
      scene.add(it); spawned.push(it); o.item = it;
      w.addHole(o);
    };
    w.makeCow = function (x, z, yaw, golden) {
      var g = new T.Group(), white = phong(golden ? 0xf2c84b : 0xf2f0e8), black = phong(golden ? 0xc9962b : 0x1b1b1b), pink = phong(0xe8a0a0);
      var body = new T.Mesh(new T.BoxGeometry(0.9, 0.8, 1.7), white); body.position.y = 1.0;
      var p1 = new T.Mesh(new T.BoxGeometry(0.94, 0.4, 0.6), black); p1.position.set(0, 1.12, 0.3);
      var p2 = new T.Mesh(new T.BoxGeometry(0.94, 0.3, 0.45), black); p2.position.set(0, 0.95, -0.55);
      var head = new T.Group(); head.position.set(0, 1.3, 1.05);
      head.add(new T.Mesh(new T.BoxGeometry(0.46, 0.46, 0.55), white));
      var muzzle = new T.Mesh(new T.BoxGeometry(0.34, 0.24, 0.2), pink); muzzle.position.set(0, -0.12, 0.33); head.add(muzzle);
      g.add(body, p1, p2, head);
      [[-0.3, 0.6], [0.3, 0.6], [-0.3, -0.6], [0.3, -0.6]].forEach(function (p) {
        var l = new T.Mesh(new T.BoxGeometry(0.16, 0.7, 0.16), white); l.position.set(p[0], 0.35, p[1]); g.add(l);
      });
      g.position.set(x, hY(x, z), z); g.rotation.y = yaw;
      g.userData = { head: head, t: Math.random() * 6 };
      return g;
    };
    w.addCow = function (x, z, yaw) {
      var g = w.makeCow(x, z, yaw, false);
      scene.add(g); spawned.push(g);
      return g;
    };
    w.openSafe = function (st) { if (st && st.door) st.door.rotation.y = -1.9; };
    w.resetWorld = function () {
      spawned.forEach(function (o) { scene.remove(o); });
      spawned = [];
      w.stashes.forEach(function (s) {
        s.x = s.ox; s.z = s.oz; s.dug = false; s.progress = 0; s.hole = null; s.drop = false; s.stolen = false; s.lost = false;
        if (s.door) s.door.rotation.y = 0;
        if (s.decal) { s.decal.visible = decalShown(s); s.decal.position.set(s.x, hY(s.x, s.z) + 0.06, s.z); }
      });
      w.junk.forEach(function (j) { j.dug = false; j.progress = 0; j.item = null; if (j.decal) j.decal.visible = decalShown(j); });
      parts.forEach(function (p) { p.m.visible = false; });
      w.moveVan(0); w.vanGroup.visible = true; w.beacon.visible = true;
    };

    /* ---------- map-specific scenery ---------- */
    if (def.build) def.build(B);

    /* ---------- misc ---------- */
    w.followSky = function () { skyGroup.position.copy(camera.position); };
    w.resize = function () {
      var Wd = window.innerWidth, Ht = window.innerHeight;
      renderer.setSize(Wd, Ht, false);
      camera.aspect = Wd / Ht;
      camera.updateProjectionMatrix();
    };
    w.setPixelRatioScale = function (k) {
      renderer.setPixelRatio(Math.max(0.6, basePR * k));
      w.resize();
    };
    w.render = function () { renderer.render(scene, camera); };
    w.dispose = function () {
      scene.traverse(function (o) {
        if (o.geometry && o.geometry.dispose) o.geometry.dispose();
        if (o.material) { var ms = o.material.length ? o.material : [o.material]; ms.forEach(function (m) { if (m.dispose) m.dispose(); }); }
      });
    };
    w.basePR = basePR;
    w.resize();
    return w;
  }

  ASO.World = { create: create, mulberry32: mulberry32, smooth: smooth, polar: polar };
})();
