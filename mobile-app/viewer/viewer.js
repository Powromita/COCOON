/*
 * COCOON 3D viewer — runs inside a React Native WebView.
 *
 * Renders an M0 VisualizationModel exactly as given: one box per MeshBox
 * (origin_m/size_m, z up) and roof polygons from SurfaceVisual vertices.
 * It computes nothing thermal; in thermal mode each room is colored from the
 * temperature the model's temperature_series lists at the current index.
 *
 * Protocol (JSON):
 *   RN → viewer (via injectJavaScript → window.cocoonViewer.receive):
 *     { type: "LOAD_MODEL", model }
 *     { type: "SET_STATE", floor: number|null, isolate: string|null, exploded: bool,
 *       showRoof: bool, mode: "material"|"thermal", timeIndex: number, range: {min,max}|null }
 *   viewer → RN (window.ReactNativeWebView.postMessage):
 *     { type: "READY" } | { type: "MODEL_LOADED", zoneCount, floors }
 *     { type: "ROOM_SELECTED", zoneId: string|null } | { type: "ERROR", message }
 */
(function () {
  "use strict";
  var T = window.THREE;

  function post(msg) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(msg));
  }

  window.onerror = function (message) {
    post({ type: "ERROR", message: String(message) });
  };

  var canvas = document.getElementById("c");
  var renderer;
  try {
    renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
  } catch (e) {
    post({ type: "ERROR", message: "WebGL is not available on this device: " + e.message });
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  var scene = new T.Scene();
  var camera = new T.PerspectiveCamera(45, 1, 0.1, 1000);
  camera.up.set(0, 0, 1);
  scene.add(new T.AmbientLight(0xffffff, 0.75));
  var sun = new T.DirectionalLight(0xffffff, 0.6);
  sun.position.set(-10, -20, 30);
  scene.add(sun);

  var root = new T.Group();
  scene.add(root);

  // Room colors by zone type (material mode). Purely categorical.
  var TYPE_COLORS = {
    airlock: 0x94a3b8, living: 0x1e3a8a, sleeping: 0x3b5bab, equipment: 0x0f7a8c,
    storage: 0x64748b, command: 0x6b4c9a, medical: 0x059669
  };

  var model = null;
  var rooms = []; // { zoneId, floor, mesh, edges, baseZ }
  var roofs = [];
  var state = { floor: null, isolate: null, exploded: false, showRoof: false, mode: "material", timeIndex: 0, range: null };
  var target = new T.Vector3();
  var spherical = new T.Spherical(20, 1.0, 0.8);
  var bounds = { size: 10 };

  function clear() {
    while (root.children.length) {
      var c = root.children.pop();
      if (c.geometry) c.geometry.dispose();
      if (c.material) c.material.dispose();
    }
    rooms = [];
    roofs = [];
  }

  function zoneType(box) {
    var name = String(box.name || "");
    var m = /zone:\s*(\w+)/i.exec(name);
    return m ? m[1].toLowerCase() : "";
  }

  function load(m) {
    clear();
    model = m;
    var minV = new T.Vector3(Infinity, Infinity, Infinity);
    var maxV = new T.Vector3(-Infinity, -Infinity, -Infinity);
    var floors = {};
    (m.boxes || []).forEach(function (b) {
      var geo = new T.BoxGeometry(b.size_m.x, b.size_m.y, b.size_m.z);
      var mat = new T.MeshLambertMaterial({ color: TYPE_COLORS[zoneType(b)] || 0x9aa6b8, transparent: true, opacity: 0.85 });
      var mesh = new T.Mesh(geo, mat);
      var cx = b.origin_m.x + b.size_m.x / 2, cy = b.origin_m.y + b.size_m.y / 2, cz = b.origin_m.z + b.size_m.z / 2;
      mesh.position.set(cx, cy, cz);
      mesh.userData.zoneId = b.zone_id || null;
      var edges = new T.LineSegments(new T.EdgesGeometry(geo), new T.LineBasicMaterial({ color: 0x0f172a }));
      edges.position.copy(mesh.position);
      root.add(mesh);
      root.add(edges);
      var floor = typeof b.floor_level === "number" ? b.floor_level : 0;
      floors[floor] = true;
      rooms.push({ zoneId: b.zone_id || null, floor: floor, mesh: mesh, edges: edges, baseZ: cz });
      minV.min(new T.Vector3(b.origin_m.x, b.origin_m.y, b.origin_m.z));
      maxV.max(new T.Vector3(b.origin_m.x + b.size_m.x, b.origin_m.y + b.size_m.y, b.origin_m.z + b.size_m.z));
    });
    (m.surfaces || []).forEach(function (s) {
      if (s.surface_type !== "roof" || !s.vertices || s.vertices.length < 3) return;
      var pos = [];
      for (var i = 1; i < s.vertices.length - 1; i++) {
        [s.vertices[0], s.vertices[i], s.vertices[i + 1]].forEach(function (v) { pos.push(v.x, v.y, v.z + 0.02); });
      }
      var g = new T.BufferGeometry();
      g.setAttribute("position", new T.Float32BufferAttribute(pos, 3));
      g.computeVertexNormals();
      var roof = new T.Mesh(g, new T.MeshLambertMaterial({ color: 0x475569, side: 2, transparent: true, opacity: 0.9 }));
      var room = rooms.filter(function (r) { return "box_" + r.zoneId === s.parent_mesh_id; })[0];
      roof.userData.floor = room ? room.floor : 0;
      roof.userData.baseZ = 0;
      root.add(roof);
      roofs.push(roof);
    });
    if (!isFinite(minV.x)) {
      post({ type: "ERROR", message: "The model has no boxes to draw." });
      return;
    }
    target.copy(minV).add(maxV).multiplyScalar(0.5);
    bounds.size = Math.max(maxV.x - minV.x, maxV.y - minV.y, maxV.z - minV.z, 1);
    spherical.radius = bounds.size * 2.2;
    apply();
    post({ type: "MODEL_LOADED", zoneCount: rooms.length, floors: Object.keys(floors).map(Number).sort() });
  }

  function thermalColor(t) {
    // Blue (cold) → pale → orange (warm) across the range supplied by the app.
    var r = state.range;
    if (typeof t !== "number" || !r || r.max <= r.min) return 0x9aa6b8;
    var f = Math.max(0, Math.min(1, (t - r.min) / (r.max - r.min)));
    // Must match THERMAL_SCALE in components/viewer/protocol.ts.
    var cold = new T.Color(0x1e3a8a), mid = new T.Color(0xf8f9ff), warm = new T.Color(0xd97706);
    return f < 0.5 ? cold.lerp(mid, f * 2).getHex() : mid.lerp(warm, (f - 0.5) * 2).getHex();
  }

  function temperatureFor(zoneId) {
    var series = (model && model.temperature_series) || [];
    for (var i = 0; i < series.length; i++) {
      if (series[i].zone_id === zoneId) return series[i].temperatures_c[state.timeIndex];
    }
    return undefined;
  }

  function apply() {
    var gap = state.exploded ? bounds.size * 0.35 : 0;
    rooms.forEach(function (r) {
      var visible = (state.floor === null || state.floor === r.floor) && (!state.isolate || state.isolate === r.zoneId);
      r.mesh.visible = visible;
      r.edges.visible = visible;
      r.mesh.position.z = r.baseZ + r.floor * gap;
      r.edges.position.z = r.mesh.position.z;
      var type = zoneType({ name: (model.boxes.filter(function (b) { return b.zone_id === r.zoneId; })[0] || {}).name });
      r.mesh.material.color.setHex(state.mode === "thermal" ? thermalColor(temperatureFor(r.zoneId)) : TYPE_COLORS[type] || 0x9aa6b8);
      r.mesh.material.opacity = state.isolate ? 1 : 0.85;
    });
    roofs.forEach(function (roof) {
      roof.visible = state.showRoof && !state.isolate && (state.floor === null || state.floor === roof.userData.floor);
      roof.position.z = roof.userData.floor * gap;
    });
    render();
  }

  function resize() {
    var w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
    render();
  }

  function render() {
    spherical.phi = Math.max(0.05, Math.min(Math.PI / 2 - 0.02, spherical.phi));
    spherical.radius = Math.max(bounds.size * 0.4, Math.min(bounds.size * 8, spherical.radius));
    // Spherical is y-up; map to this z-up scene.
    var s = Math.sin(spherical.phi);
    camera.position.set(
      target.x + spherical.radius * s * Math.sin(spherical.theta),
      target.y - spherical.radius * s * Math.cos(spherical.theta),
      target.z + spherical.radius * Math.cos(spherical.phi)
    );
    camera.lookAt(target);
    renderer.render(scene, camera);
  }

  // --- Touch controls: 1 finger orbit, 2 fingers pinch-zoom + pan, tap selects a room. ---
  var touches = null, moved = false, startTime = 0;
  function pts(e) { return Array.prototype.map.call(e.touches, function (t) { return { x: t.clientX, y: t.clientY }; }); }
  function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
  function mid(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; }

  canvas.addEventListener("touchstart", function (e) {
    touches = pts(e);
    moved = false;
    startTime = Date.now();
  }, { passive: true });

  canvas.addEventListener("touchmove", function (e) {
    var now = pts(e);
    if (!touches) { touches = now; return; }
    if (now.length === 1 && touches.length === 1) {
      var dx = now[0].x - touches[0].x, dy = now[0].y - touches[0].y;
      if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
      spherical.theta -= dx * 0.008;
      spherical.phi -= dy * 0.008;
    } else if (now.length === 2 && touches.length === 2) {
      moved = true;
      var d0 = dist(touches[0], touches[1]), d1 = dist(now[0], now[1]);
      if (d1 > 0) spherical.radius *= d0 / d1;
      var m0 = mid(touches[0], touches[1]), m1 = mid(now[0], now[1]);
      var k = spherical.radius / 600;
      var right = new T.Vector3(Math.cos(spherical.theta), Math.sin(spherical.theta), 0);
      target.addScaledVector(right, -(m1.x - m0.x) * k);
      target.z += (m1.y - m0.y) * k;
    }
    touches = now;
    render();
  }, { passive: true });

  canvas.addEventListener("touchend", function (e) {
    if (!moved && e.changedTouches.length === 1 && Date.now() - startTime < 400) {
      var t = e.changedTouches[0];
      var ndc = new T.Vector2((t.clientX / window.innerWidth) * 2 - 1, -(t.clientY / window.innerHeight) * 2 + 1);
      var ray = new T.Raycaster();
      ray.setFromCamera(ndc, camera);
      var hits = ray.intersectObjects(rooms.filter(function (r) { return r.mesh.visible; }).map(function (r) { return r.mesh; }));
      post({ type: "ROOM_SELECTED", zoneId: hits.length ? hits[0].object.userData.zoneId : null });
    }
    touches = e.touches.length ? pts(e) : null;
  }, { passive: true });

  window.addEventListener("resize", resize);

  window.cocoonViewer = {
    receive: function (msg) {
      try {
        if (msg.type === "LOAD_MODEL") load(msg.model);
        else if (msg.type === "SET_STATE") {
          for (var k in msg) if (k !== "type") state[k] = msg[k];
          if (model) apply();
        }
      } catch (e) {
        post({ type: "ERROR", message: e.message });
      }
    }
  };

  resize();
  post({ type: "READY" });
})();
