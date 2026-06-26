import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { COLORBOND_HEX, getColorbondHex } from "@/lib/colorbondColours";

type Point = { x: number; y: number };
type Geometry = {
  points: Point[];
};

type FlashingProfile3DPreviewProps = {
  geometry: Geometry;
  colour?: string;
  lengthMm?: number;
  profileName?: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function resolveColourHex(colour?: string) {
  const raw = String(colour || "").trim();
  if (!raw) return "#cbd5e1";
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw;

  const exact = getColorbondHex(raw);
  if (exact !== "#cccccc") return exact;

  const lower = raw.toLowerCase();
  const namedMatch = Object.keys(COLORBOND_HEX).find((name) => lower.includes(name.toLowerCase()));
  return namedMatch ? COLORBOND_HEX[namedMatch] : "#cbd5e1";
}

function buildProfileMesh(points: Point[], lengthMm: number, colourHex: string) {
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const profileWidth = Math.max(1, maxX - minX);
  const profileHeight = Math.max(1, maxY - minY);
  const profileScale = clamp(24 / Math.max(profileWidth, profileHeight), 0.035, 0.12);
  const depth = clamp((Number(lengthMm) || 0) / 80, 36, 130);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  const toScenePoint = (point: Point, z: number) => (
    new THREE.Vector3((point.x - centerX) * profileScale, -(point.y - centerY) * profileScale, z)
  );

  const vertices: number[] = [];
  const indices: number[] = [];
  points.slice(1).forEach((point, index) => {
    const previous = points[index];
    const base = vertices.length / 3;
    const frontA = toScenePoint(previous, -depth / 2);
    const frontB = toScenePoint(point, -depth / 2);
    const backB = toScenePoint(point, depth / 2);
    const backA = toScenePoint(previous, depth / 2);
    [frontA, frontB, backB, backA].forEach((vertex) => vertices.push(vertex.x, vertex.y, vertex.z));
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(colourHex),
    metalness: 0.35,
    roughness: 0.42,
    side: THREE.DoubleSide,
  });

  return new THREE.Mesh(geometry, material);
}

export function FlashingProfile3DPreview({
  geometry,
  colour,
  lengthMm = 0,
  profileName = "Flashing profile",
}: FlashingProfile3DPreviewProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const [previewError, setPreviewError] = useState("");
  const colourHex = useMemo(() => resolveColourHex(colour), [colour]);
  const hasGeometry = geometry.points.length >= 2;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !hasGeometry) return undefined;
    setPreviewError("");

    try {
      const scene = new THREE.Scene();
      scene.background = new THREE.Color("#020617");

      const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 1000);
      camera.position.set(58, 36, 92);

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      mount.appendChild(renderer.domElement);

      const group = new THREE.Group();
      const profileMesh = buildProfileMesh(geometry.points, lengthMm, colourHex);
      group.add(profileMesh);

      const edgeGeometry = new THREE.EdgesGeometry(profileMesh.geometry, 12);
      const edgeLines = new THREE.LineSegments(
        edgeGeometry,
        new THREE.LineBasicMaterial({ color: "#f8fafc", transparent: true, opacity: 0.72 }),
      );
      group.add(edgeLines);

      scene.add(group);
      scene.add(new THREE.HemisphereLight("#e0f2fe", "#1e293b", 1.6));
      const keyLight = new THREE.DirectionalLight("#ffffff", 2.6);
      keyLight.position.set(24, 44, 32);
      scene.add(keyLight);
      const rimLight = new THREE.DirectionalLight("#fef3c7", 1.1);
      rimLight.position.set(-40, 18, -36);
      scene.add(rimLight);

      const grid = new THREE.GridHelper(140, 14, "#334155", "#1e293b");
      grid.position.y = -18;
      scene.add(grid);

      const target = new THREE.Vector3(0, 0, 0);
      camera.lookAt(target);

      let width = 1;
      let height = 1;
      let animationFrame = 0;
      let isPointerDown = false;
      let lastPointerX = 0;
      let lastPointerY = 0;
      let rotationY = -0.48;
      let rotationX = -0.26;

      const resize = () => {
        width = Math.max(1, mount.clientWidth);
        height = Math.max(260, mount.clientHeight || 340);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      };

      const render = () => {
        if (!isPointerDown) rotationY += 0.0024;
        group.rotation.set(rotationX, rotationY, 0);
        renderer.render(scene, camera);
        animationFrame = window.requestAnimationFrame(render);
      };

      const onPointerDown = (event: PointerEvent) => {
        isPointerDown = true;
        lastPointerX = event.clientX;
        lastPointerY = event.clientY;
        renderer.domElement.setPointerCapture(event.pointerId);
      };

      const onPointerMove = (event: PointerEvent) => {
        if (!isPointerDown) return;
        const deltaX = event.clientX - lastPointerX;
        const deltaY = event.clientY - lastPointerY;
        rotationY += deltaX * 0.008;
        rotationX = clamp(rotationX + deltaY * 0.006, -1.2, 0.7);
        lastPointerX = event.clientX;
        lastPointerY = event.clientY;
      };

      const onPointerUp = (event: PointerEvent) => {
        isPointerDown = false;
        if (renderer.domElement.hasPointerCapture(event.pointerId)) {
          renderer.domElement.releasePointerCapture(event.pointerId);
        }
      };

      renderer.domElement.addEventListener("pointerdown", onPointerDown);
      renderer.domElement.addEventListener("pointermove", onPointerMove);
      renderer.domElement.addEventListener("pointerup", onPointerUp);
      renderer.domElement.addEventListener("pointercancel", onPointerUp);

      const resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(mount);
      resize();
      render();

      return () => {
        window.cancelAnimationFrame(animationFrame);
        resizeObserver.disconnect();
        renderer.domElement.removeEventListener("pointerdown", onPointerDown);
        renderer.domElement.removeEventListener("pointermove", onPointerMove);
        renderer.domElement.removeEventListener("pointerup", onPointerUp);
        renderer.domElement.removeEventListener("pointercancel", onPointerUp);
        if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
        edgeGeometry.dispose();
        (edgeLines.material as THREE.Material).dispose();
        profileMesh.geometry.dispose();
        (profileMesh.material as THREE.Material).dispose();
        renderer.dispose();
      };
    } catch (error) {
      console.warn("[flashing] 3D preview could not start", error);
      setPreviewError("3D preview is unavailable on this device.");
      return undefined;
    }
  }, [colourHex, geometry.points, hasGeometry, lengthMm]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">3D Preview</p>
          <p className="text-xs text-muted-foreground">Derived from the 2D profile and order length.</p>
        </div>
        <div className="flex items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5 text-xs">
          <span className="h-3 w-3 rounded-full border border-border" style={{ backgroundColor: colourHex }} />
          <span className="max-w-[180px] truncate">{colour || "No colour selected"}</span>
        </div>
      </div>
      <div
        ref={mountRef}
        className="relative h-[300px] min-h-[260px] overflow-hidden rounded-md border bg-slate-950"
        role="img"
        aria-label={`${profileName} 3D preview${colour ? ` in ${colour}` : ""}`}
      >
        {!hasGeometry && (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-300">
            Add at least two profile points to see the 3D preview.
          </div>
        )}
        {previewError && (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-slate-300">
            {previewError}
          </div>
        )}
      </div>
    </div>
  );
}
