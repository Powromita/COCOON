// Entry for the tree-shaken three.js bundle embedded in the 3D viewer WebView.
// Only the classes the viewer uses are exported — see scripts/build-viewer.js.
export {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  Color,
  DirectionalLight,
  EdgesGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Spherical,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
