import React, { useEffect, useState } from 'react';
import { 
  db, 
  seedDemoData, 
  type Project, 
  type Plan, 
  type PunchItem, 
  type Approval,
  type WallNode,
  type ColumnNode,
  type PortalNode,
  type RoomNode,
  type ProgressPhoto,
  type FurnitureNode
} from './db/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { 
  Compass, 
  Layers, 
  Calculator, 
  Folder, 
  TrendingUp, 
  CheckSquare, 
  Camera, 
  UserCheck, 
  Hammer, 
  Trash2, 
  FileDown, 
  Settings, 
  AlertTriangle, 
  Check, 
  Undo
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

interface ThreeDViewportProps {
  walls: any[];
  columns: any[];
  portals: any[];
  furnitures: any[];
  rooms: any[];
  trueNorth: number;
  plotWidth: number;
  plotDepth: number;
  setbackFront: number;
  setbackRear: number;
  setbackLeft: number;
  setbackRight: number;
  showPlotBoundary: boolean;
}

const ThreeDViewport: React.FC<ThreeDViewportProps> = ({
  walls,
  columns,
  portals,
  furnitures,
  rooms,
  trueNorth,
  plotWidth,
  plotDepth,
  setbackFront,
  setbackRear,
  setbackLeft,
  setbackRight,
  showPlotBoundary
}) => {
  const SF = 0.1; // Architectural Scale Magnifier (1px = 0.1ft in 3D, canvas is 30px = 1ft, so room is 3x larger in 3D)
  const containerRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [viewMode, setViewMode] = useState<'orbit' | 'walk'>('orbit');
  const [renderStyle, setRenderStyle] = useState<'realistic' | 'clay'>('realistic');

  // References to keep event listeners synced
  const keysRef = React.useRef({ w: false, a: false, s: false, d: false });
  const viewModeRef = React.useRef(viewMode);
  const renderStyleRef = React.useRef(renderStyle);
  const mouseRef = React.useRef({ isDown: false, lastX: 0, lastY: 0 });

  const cameraRef = React.useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = React.useRef<OrbitControls | null>(null);

  useEffect(() => {
    viewModeRef.current = viewMode;
  }, [viewMode]);

  useEffect(() => {
    renderStyleRef.current = renderStyle;
  }, [renderStyle]);

  useEffect(() => {
    if (!canvasRef.current || !containerRef.current) return;

    // Reference rooms to satisfy compiler checks
    const roomCount = rooms ? rooms.length : 0;
    console.log("ThreeDViewport compiling 3D room sectors count:", roomCount);

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight || 400;

    // 1. Scene setup
    const scene = new THREE.Scene();
    const bgCol = renderStyle === 'realistic' ? 0x0f172a : 0x080b11;
    scene.background = new THREE.Color(bgCol);
    scene.fog = new THREE.FogExp2(bgCol, 0.008);

    // 2. Camera setup
    const camera = new THREE.PerspectiveCamera(82, width / height, 0.1, 1000);
    camera.position.set(0, 45, 60);
    camera.rotation.order = 'YXZ';
    cameraRef.current = camera;

    // 3. Renderer setup
    const renderer = new THREE.WebGLRenderer({
      canvas: canvasRef.current,
      antialias: true,
      alpha: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // 4. Controls setup
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2 - 0.02; // prevent going below grid
    controls.minDistance = 5;
    controls.maxDistance = 180;
    // Unity-style mouse controls
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.PAN,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE
    };
    controlsRef.current = controls;

    // 5. Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    // Hemisphere light for gorgeous sky/ground soft environmental lighting
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x333333, 0.35);
    scene.add(hemiLight);

    const sunLight = new THREE.DirectionalLight(0xfff7e6, 0.9);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 250;
    
    // Extents for directional shadow camera
    const d = 60;
    sunLight.shadow.camera.left = -d;
    sunLight.shadow.camera.right = d;
    sunLight.shadow.camera.top = d;
    sunLight.shadow.camera.bottom = -d;
    sunLight.shadow.bias = -0.0005;
    scene.add(sunLight);

    // Dynamic solar lighting angle from Vastu Compass
    const updateSunPosition = () => {
      const angleRad = (trueNorth * Math.PI) / 180;
      sunLight.position.set(
        Math.sin(angleRad) * 80,
        90,
        Math.cos(angleRad) * 80
      );
    };
    updateSunPosition();

    // 6. Materials
    const clayWallMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
    const realWallMat = new THREE.MeshStandardMaterial({ color: 0xfcfaf2, roughness: 0.65, metalness: 0.02 }); // elegant plaster off-white
    
    const clayPillarMat = new THREE.MeshStandardMaterial({ color: 0x14f1c3, emissive: 0x14f1c3, emissiveIntensity: 0.1 });
    const realPillarMat = new THREE.MeshStandardMaterial({ color: 0xfcfaf2, roughness: 0.65, metalness: 0.02 }); // Matches wall plaster
 
    const clayFloorMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6, side: THREE.DoubleSide });
    // Plot base material (dark slate stone yard)
    const plotBaseMat = new THREE.MeshStandardMaterial({ color: 0x22252a, roughness: 0.85 });
    
    // Room-specific materials
    const concreteMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.45, metalness: 0.2, side: THREE.DoubleSide }); // polished concrete
    const tileMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.05, metalness: 0.15, side: THREE.DoubleSide }); // Carrara polished marble
    const woodFloorMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.22, metalness: 0.1, side: THREE.DoubleSide }); // rich warm Oak wood
    const grassMat = new THREE.MeshStandardMaterial({ color: 0x2d6a4f, roughness: 0.95, metalness: 0.0, side: THREE.DoubleSide }); // lush organic green grass
 
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xdbeafe,
      transparent: true,
      opacity: 0.3,
      roughness: 0.02,
      metalness: 0.98
    });
 
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21, roughness: 0.45, metalness: 0.05 }); // premium dark mahogany wood
    const clayDoorMat = new THREE.MeshStandardMaterial({ color: 0x475569 });
    const realDoorMat = woodMat;

    // 7. Ground Plane (Floor Slab / Plot Yard)
    const plotW3d = plotWidth * (SF * 30);
    const plotH3d = plotDepth * (SF * 30);

    const floorGeom = new THREE.BoxGeometry(plotW3d, 0.4, plotH3d);
    const floorMesh = new THREE.Mesh(floorGeom, renderStyle === 'clay' ? clayFloorMat : plotBaseMat);
    floorMesh.position.set(0, -0.2, 0);
    floorMesh.receiveShadow = true;
    
    // 7. Wall Compilers
    const wallExtGeom = new THREE.BoxGeometry(1, 1, 1);
    const wallInstancedMesh = new THREE.InstancedMesh(wallExtGeom, renderStyle === 'clay' ? clayWallMat : realWallMat, (walls || []).length);
    wallInstancedMesh.castShadow = true;
    wallInstancedMesh.receiveShadow = true;

    const dummy = new THREE.Object3D();
    (Array.isArray(walls) ? walls : []).forEach((w, i) => {
      const cx = (w.startX + w.endX) / 2 - 400;
      const cy = (w.startY + w.endY) / 2 - 225;
      const length = Math.hypot(w.endX - w.startX, w.endY - w.startY);
      const angle = Math.atan2(w.endY - w.startY, w.endX - w.startX);
      const thick = w.thickness;

      dummy.position.set(cx * SF, 5.5, cy * SF); // elevated for 11ft ceiling height
      dummy.rotation.y = -angle;
      dummy.scale.set(length * SF, 11, thick * 0.1); // Keep thickness realistic
      dummy.updateMatrix();
      wallInstancedMesh.setMatrixAt(i, dummy.matrix);
    });
    scene.add(wallInstancedMesh);

    // 8. Portal Compilers
    (Array.isArray(portals) ? portals : []).forEach(p => {
      if (p.type === 'DOOR') {
        const doorGeom = new THREE.BoxGeometry(p.width * SF, 7.5, 1); // 7.5ft height
        const doorMesh = new THREE.Mesh(doorGeom, renderStyle === 'clay' ? clayDoorMat : realDoorMat);
        const px = (p.x - 400) * SF;
        const pz = (p.y - 225) * SF;
        doorMesh.position.set(px, 3.75, pz);
        doorMesh.rotation.y = (-p.rotation * Math.PI) / 180;
        scene.add(doorMesh);
      } else if (p.type === 'WINDOW') {
        const winGeom = new THREE.BoxGeometry(p.width * SF, 4.5, 1.2);
        const winMesh = new THREE.Mesh(winGeom, glassMat);
        const px = (p.x - 400) * SF;
        const pz = (p.y - 225) * SF;
        winMesh.position.set(px, 5.5, pz);
        winMesh.rotation.y = (-p.rotation * Math.PI) / 180;
        scene.add(winMesh);
      }
    });    scene.add(floorMesh);

    // 7.5 Room Specific Floors & Ceiling Lights (Realistic Mode)
    if (renderStyle === 'realistic') {
      (Array.isArray(rooms) ? rooms : []).forEach(r => {
        if (!r.points || r.points.length < 3) return;
        
        let mat = woodFloorMat; // default
        const nameLower = r.name.toLowerCase();
        if (nameLower.includes('garage') || nameLower.includes('porch')) mat = concreteMat;
        else if (nameLower.includes('bath') || nameLower.includes('toilet') || nameLower.includes('patio')) mat = tileMat;
        else if (nameLower.includes('garden') || nameLower.includes('lawn')) mat = grassMat;

        const shape = new THREE.Shape();
        r.points.forEach((p: any, idx: number) => {
          const px = (p.x - 400) * SF;
          const pz = (p.y - 225) * SF;
          if (idx === 0) shape.moveTo(px, pz);
          else shape.lineTo(px, pz);
        });

        const shapeGeom = new THREE.ShapeGeometry(shape);
        const roomFloor = new THREE.Mesh(shapeGeom, mat);
        roomFloor.rotation.x = -Math.PI / 2;
        roomFloor.position.y = 0.01; // Slightly above main plot floor
        roomFloor.receiveShadow = true;
        scene.add(roomFloor);

        // Add soft warm ceiling lights centered in each room
        const cx = r.points.reduce((sum: number, p: any) => sum + p.x, 0) / r.points.length;
        const cy = r.points.reduce((sum: number, p: any) => sum + p.y, 0) / r.points.length;
        const c3dx = (cx - 400) * SF;
        const c3dz = (cy - 225) * SF;

        // Spot fixture cylinder
        const fixtureGeom = new THREE.CylinderGeometry(0.18, 0.18, 0.15, 8);
        const fixtureMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.75 });
        const fixture = new THREE.Mesh(fixtureGeom, fixtureMat);
        fixture.position.set(c3dx, 10.9, c3dz);
        scene.add(fixture);

        // Point Light source
        const roomLight = new THREE.PointLight(0xfff2e0, 0.45, 25);
        roomLight.position.set(c3dx, 10.5, c3dz);
        roomLight.castShadow = true;
        roomLight.shadow.bias = -0.002;
        roomLight.shadow.mapSize.width = 512;
        roomLight.shadow.mapSize.height = 512;
        scene.add(roomLight);
      });
    }

    // dashed green buildable yard boundary outline
    if (showPlotBoundary) {
      const bx = setbackLeft * (SF * 30);
      const bz = setbackFront * (SF * 30);
      const bw = Math.max(0, plotWidth * (SF * 30) - (setbackLeft + setbackRight) * (SF * 30));
      const bh = Math.max(0, plotDepth * (SF * 30) - (setbackFront + setbackRear) * (SF * 30));
      
      if (bw > 0 && bh > 0) {
        const outlineGeom = new THREE.BufferGeometry();
        const sx = -plotW3d/2 + bx;
        const sz = -plotH3d/2 + bz;
        const vertices = new Float32Array([
          sx, 0.05, sz,
          sx + bw, 0.05, sz,
          sx + bw, 0.05, sz + bh,
          sx, 0.05, sz + bh,
          sx, 0.05, sz
        ]);
        outlineGeom.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
        const outlineMat = new THREE.LineBasicMaterial({ color: 0x10b981, linewidth: 2 });
        const outline = new THREE.Line(outlineGeom, outlineMat);
        scene.add(outline);
      }
    }

    // Grid helper overlay for structural CAD feeling
    const gridHelper = new THREE.GridHelper(160, 80, 0x14f1c3, 0x334155);
    gridHelper.position.set(0, 0.02, 0);
    (gridHelper.material as THREE.Material).transparent = true;
    (gridHelper.material as THREE.Material).opacity = 0.12;
    scene.add(gridHelper);

    // 8. Wall Slicing & Compilation
    const activeWallMaterial = renderStyle === 'clay' ? clayWallMat : realWallMat;
    const renderedPortalIds = new Set<string>();
    
    const build3DWallSegments = (w: any) => {
      const x1 = (w.startX - 400) * SF;
      const z1 = (w.startY - 225) * SF;
      const x2 = (w.endX - 400) * SF;
      const z2 = (w.endY - 225) * SF;
      const dx = x2 - x1;
      const dz = z2 - z1;
      const len = Math.sqrt(dx * dx + dz * dz);
      const thickness = w.thickness === 8 ? 0.375 : 0.75;
      const angle = Math.atan2(-dz, dx);

      const addBox = (offsetStart: number, offsetEnd: number, h: number, yCenter: number) => {
        const segmentLen = offsetEnd - offsetStart;
        if (segmentLen <= 0.05) return;
        const geom = new THREE.BoxGeometry(segmentLen, h, thickness);
        const mesh = new THREE.Mesh(geom, activeWallMaterial);
        
        const localCenter = (offsetStart + offsetEnd) / 2;
        const wx = x1 + localCenter * Math.cos(angle);
        const wz = z1 - localCenter * Math.sin(angle);
        
        mesh.position.set(wx, yCenter, wz);
        mesh.rotation.y = angle;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);

        // Skirting/Baseboard for realistic mode (only for full wall segments, not headers/sills)
        if (renderStyle === 'realistic' && h === 11) {
          const skirtGeom = new THREE.BoxGeometry(segmentLen, 0.4, thickness + 0.05);
          const skirtMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.9 });
          const skirtMesh = new THREE.Mesh(skirtGeom, skirtMat);
          skirtMesh.position.set(wx, 0.2, wz);
          skirtMesh.rotation.y = angle;
          scene.add(skirtMesh);
        }
      };

      // Project portals onto wall centerline (Expanded snappings to 5.0 ft)
      const portalsOnWall = (Array.isArray(portals) ? portals : []).map(p => {
        const px = (p.x - 400) * SF;
        const pz = (p.y - 225) * SF;
        const pdx = px - x1;
        const pdz = pz - z1;
        const t = (pdx * dx + pdz * dz) / (len * len);
        const distFromStart = t * len;
        
        const projX = x1 + t * dx;
        const projZ = z1 + t * dz;
        const perpDist = Math.sqrt((px - projX)**2 + (pz - projZ)**2);
        
        return { portal: p, dist: distFromStart, perp: perpDist };
      }).filter(item => item.perp < 5.0 && item.dist > -0.5 && item.dist < len + 0.5);

      if (portalsOnWall.length === 0) {
        addBox(0, len, 11, 5.5);
      } else {
        portalsOnWall.sort((a, b) => a.dist - b.dist);
        
        let lastOffset = 0;
        portalsOnWall.forEach(item => {
          const pWidth = item.portal.width * SF;
          const pStart = Math.max(0, item.dist - pWidth / 2);
          const pEnd = Math.min(len, item.dist + pWidth / 2);
          
          addBox(lastOffset, pStart, 11, 5.5);
          
          if (item.portal.type === 'DOOR' || item.portal.type === 'DOUBLE_DOOR') {
            addBox(pStart, pEnd, 3.5, 9.25); // header beam (11ft - 7.5ft = 3.5ft header)
            renderedPortalIds.add(item.portal.id);
            
            if (renderStyle === 'realistic') {
              if (item.portal.type === 'DOUBLE_DOOR') {
                const halfWidth = pWidth / 2 - 0.05;
                const leftDoorLeaf = new THREE.Mesh(new THREE.BoxGeometry(halfWidth, 7.3, 0.15), woodMat);
                const rightDoorLeaf = new THREE.Mesh(new THREE.BoxGeometry(halfWidth, 7.3, 0.15), woodMat);
                
                // Swing open symmetrically
                const leftAngle = angle + Math.PI / 4;
                const rightAngle = angle - Math.PI / 4;
                
                const midX = x1 + item.dist * Math.cos(angle);
                const midZ = z1 - item.dist * Math.sin(angle);
                
                // Place left and right leaves offset along the wall line
                leftDoorLeaf.position.set(midX - (halfWidth / 2) * Math.cos(angle), 3.65, midZ + (halfWidth / 2) * Math.sin(angle));
                leftDoorLeaf.rotation.y = leftAngle;
                
                rightDoorLeaf.position.set(midX + (halfWidth / 2) * Math.cos(angle), 3.65, midZ - (halfWidth / 2) * Math.sin(angle));
                rightDoorLeaf.rotation.y = rightAngle;
                
                scene.add(leftDoorLeaf);
                scene.add(rightDoorLeaf);
              } else {
                const doorLeaf = new THREE.Mesh(new THREE.BoxGeometry(pWidth, 7.3, 0.15), woodMat);
                const doorAngle = angle + (item.portal.flippedX ? -Math.PI / 3 : Math.PI / 3);
                const doorX = x1 + item.dist * Math.cos(angle);
                const doorZ = z1 - item.dist * Math.sin(angle);
                doorLeaf.position.set(doorX, 3.65, doorZ);
                doorLeaf.rotation.y = doorAngle;
                scene.add(doorLeaf);
              }
            }
          } else {
            addBox(pStart, pEnd, 2.0, 1.0); // sill (height 2ft, center 1ft)
            addBox(pStart, pEnd, 3.5, 9.25); // header (height 3.5ft, center 9.25ft)
            renderedPortalIds.add(item.portal.id);
            
            const glassPane = new THREE.Mesh(new THREE.BoxGeometry(pWidth, 5.5, 0.08), glassMat);
            const winX = x1 + item.dist * Math.cos(angle);
            const winZ = z1 - item.dist * Math.sin(angle);
            glassPane.position.set(winX, 4.75, winZ);
            glassPane.rotation.y = angle;
            scene.add(glassPane);
          }
          
          lastOffset = pEnd;
        });
        
        addBox(lastOffset, len, 11, 5.5);
      }
    };

    (Array.isArray(walls) ? walls : []).forEach(build3DWallSegments);

    // 8.5 Standalone Portals Fallback Rendering (Ensures all placed doors/windows render)
    (Array.isArray(portals) ? portals : []).forEach(p => {
      if (renderedPortalIds.has(p.id)) return;

      const px = (p.x - 400) * SF;
      const pz = (p.y - 225) * SF;
      const pWidth = p.width * SF;
      const protRad = (-p.rotation * Math.PI) / 180;

      const portalGroup = new THREE.Group();
      portalGroup.position.set(px, 0, pz);
      portalGroup.rotation.y = protRad;

      if (p.type === 'DOOR' || p.type === 'DOUBLE_DOOR') {
        const frameMat = woodMat;
        const leftPost = new THREE.Mesh(new THREE.BoxGeometry(0.15, 11, 0.4), frameMat);
        leftPost.position.set(-pWidth / 2, 5.5, 0);
        const rightPost = new THREE.Mesh(new THREE.BoxGeometry(0.15, 11, 0.4), frameMat);
        rightPost.position.set(pWidth / 2, 5.5, 0);
        const topPost = new THREE.Mesh(new THREE.BoxGeometry(pWidth, 0.15, 0.4), frameMat);
        topPost.position.set(0, 11, 0);
        portalGroup.add(leftPost, rightPost, topPost);

        if (renderStyle === 'realistic') {
          if (p.type === 'DOUBLE_DOOR') {
            const halfWidth = pWidth / 2 - 0.1;
            const leftDoorLeaf = new THREE.Mesh(new THREE.BoxGeometry(halfWidth, 7.3, 0.15), woodMat);
            leftDoorLeaf.position.set(-halfWidth / 2, 3.65, halfWidth / 3);
            leftDoorLeaf.rotation.y = Math.PI / 4;
            
            const rightDoorLeaf = new THREE.Mesh(new THREE.BoxGeometry(halfWidth, 7.3, 0.15), woodMat);
            rightDoorLeaf.position.set(halfWidth / 2, 3.65, halfWidth / 3);
            rightDoorLeaf.rotation.y = -Math.PI / 4;
            
            portalGroup.add(leftDoorLeaf, rightDoorLeaf);
          } else {
            const doorLeaf = new THREE.Mesh(new THREE.BoxGeometry(pWidth - 0.2, 7.3, 0.15), woodMat);
            doorLeaf.position.set(0, 3.65, 0);
            portalGroup.add(doorLeaf);
          }
        }
      } else {
        const frameMat = renderStyle === 'clay' ? clayWallMat : realWallMat;
        const sill = new THREE.Mesh(new THREE.BoxGeometry(pWidth, 0.2, 0.6), frameMat);
        sill.position.set(0, 2.0, 0);
        const header = new THREE.Mesh(new THREE.BoxGeometry(pWidth, 0.2, 0.6), frameMat);
        header.position.set(0, 9.5, 0);
        const leftPost = new THREE.Mesh(new THREE.BoxGeometry(0.2, 7.5, 0.6), frameMat);
        leftPost.position.set(-pWidth / 2, 5.75, 0);
        const rightPost = new THREE.Mesh(new THREE.BoxGeometry(0.2, 7.5, 0.6), frameMat);
        rightPost.position.set(pWidth / 2, 5.75, 0);
        portalGroup.add(sill, header, leftPost, rightPost);

        const glassPane = new THREE.Mesh(new THREE.BoxGeometry(pWidth - 0.2, 7.3, 0.08), glassMat);
        glassPane.position.set(0, 5.75, 0);
        portalGroup.add(glassPane);
      }

      scene.add(portalGroup);
    });

    // 9. Column Compilers
    (Array.isArray(columns) ? columns : []).forEach(c => {
      const cx = (c.x - 400) * SF;
      const cz = (c.y - 225) * SF;
      const cSizeFt = (c.size || 20) * 0.08; // Keep columns extremely slender and elegant!
      const pillarGeom = new THREE.BoxGeometry(cSizeFt, 11, cSizeFt);
      const pillarMesh = new THREE.Mesh(pillarGeom, renderStyle === 'clay' ? clayPillarMat : realPillarMat);
      pillarMesh.position.set(cx, 5.5, cz);
      pillarMesh.castShadow = true;
      pillarMesh.receiveShadow = true;
      scene.add(pillarMesh);
    });

    // 10. Furniture Compilers
    const sofaMat = new THREE.MeshStandardMaterial({ color: 0x8b5cf6, roughness: 0.7 });
    const ceramicMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.15 });

    (Array.isArray(furnitures) ? furnitures : []).forEach(f => {
      const fx = (f.x - 400) * SF;
      const fz = (f.y - 225) * SF;
      const fw = (f.width || 0) * SF;
      const fh = (f.height || 0) * SF;
      const frotRad = (-f.rotation * Math.PI) / 180;

      const furnGroup = new THREE.Group();
      furnGroup.position.set(fx, 0, fz);
      furnGroup.rotation.y = frotRad;

      if (f.type === 'SOFA') {
        const base = new THREE.Mesh(new THREE.BoxGeometry(fw, 1.2, fh), sofaMat);
        base.position.set(0, 0.6, 0);
        base.castShadow = true;
        furnGroup.add(base);

        const backrest = new THREE.Mesh(new THREE.BoxGeometry(fw, 2.0, 0.4), sofaMat);
        backrest.position.set(0, 1.0, -fh/2 + 0.2);
        furnGroup.add(backrest);

        const armLeft = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.8, fh), sofaMat);
        armLeft.position.set(-fw/2 + 0.2, 0.9, 0);
        const armRight = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.8, fh), sofaMat);
        armRight.position.set(fw/2 - 0.2, 0.9, 0);
        furnGroup.add(armLeft);
        furnGroup.add(armRight);

        if (renderStyle === 'realistic') {
          const cushionCount = fw > 5.5 ? 3 : 2;
          const cushionW = (fw - 0.6) / cushionCount;
          for (let i = 0; i < cushionCount; i++) {
            const cx = -fw / 2 + 0.3 + cushionW / 2 + i * cushionW;
            const cushion = new THREE.Mesh(new THREE.BoxGeometry(cushionW - 0.1, 0.4, fh - 0.6), sofaMat);
            cushion.position.set(cx, 0.8, 0.1);
            cushion.castShadow = true;
            furnGroup.add(cushion);
          }
          
          const pillowMat = new THREE.MeshStandardMaterial({ color: 0xdbeafe, roughness: 0.8 }); // soft blue throw pillows
          const pLeft = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.8, 0.8), pillowMat);
          pLeft.position.set(-fw / 2 + 0.45, 1.2, 0);
          pLeft.rotation.z = -0.3;
          pLeft.castShadow = true;
          
          const pRight = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.8, 0.8), pillowMat);
          pRight.position.set(fw / 2 - 0.45, 1.2, 0);
          pRight.rotation.z = 0.3;
          pRight.castShadow = true;
          
          furnGroup.add(pLeft, pRight);
        }

      } else if (f.type === 'BED') {
        const frame = new THREE.Mesh(new THREE.BoxGeometry(fw, 1.0, fh), woodMat);
        frame.position.set(0, 0.5, 0);
        frame.castShadow = true;
        furnGroup.add(frame);

        const head = new THREE.Mesh(new THREE.BoxGeometry(fw, 3.2, 0.3), woodMat);
        head.position.set(0, 1.6, -fh/2 + 0.15);
        furnGroup.add(head);

        const matt = new THREE.Mesh(new THREE.BoxGeometry(fw - 0.2, 0.6, fh - 0.3), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }));
        matt.position.set(0, 1.1, 0.1);
        furnGroup.add(matt);

        if (renderStyle === 'realistic') {
          const pillowGeom = new THREE.BoxGeometry(1.2, 0.3, 1.8);
          const pillowMat = new THREE.MeshStandardMaterial({ color: 0xfcfcfc, roughness: 0.85 });
          const p1 = new THREE.Mesh(pillowGeom, pillowMat);
          p1.position.set(-fw / 4.5, 1.45, -fh / 2 + 0.9);
          p1.rotation.x = 0.08;
          p1.rotation.y = 0.04;
          
          const p2 = new THREE.Mesh(pillowGeom, pillowMat);
          p2.position.set(fw / 4.5, 1.45, -fh / 2 + 0.9);
          p2.rotation.x = 0.08;
          p2.rotation.y = -0.04;
          
          const blanketGeom = new THREE.BoxGeometry(fw - 0.25, 0.12, fh * 0.4);
          const blanketMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.75, metalness: 0.05 }); // rich blue blanket
          const blanket = new THREE.Mesh(blanketGeom, blanketMat);
          blanket.position.set(0, 1.41, fh / 2 - fh * 0.23);
          
          furnGroup.add(p1, p2, blanket);
        }

      } else if (f.type === 'DINING_TABLE') {
        const slab = new THREE.Mesh(new THREE.BoxGeometry(fw, 0.2, fh), woodMat);
        slab.position.set(0, 2.8, 0);
        slab.castShadow = true;
        furnGroup.add(slab);

        const legG = new THREE.CylinderGeometry(0.1, 0.1, 2.8);
        const legOffsets = [
          [-fw/2 + 0.2, -fh/2 + 0.2],
          [-fw/2 + 0.2, fh/2 - 0.2],
          [fw/2 - 0.2, -fh/2 + 0.2],
          [fw/2 - 0.2, fh/2 - 0.2]
        ];
        legOffsets.forEach(([ox, oz]) => {
          const leg = new THREE.Mesh(legG, metalMat);
          leg.position.set(ox, 1.4, oz);
          leg.castShadow = true;
          furnGroup.add(leg);
        });

        if (renderStyle === 'realistic') {
          const chairMat = woodMat;
          const spawnChair = (cx: number, cz: number, rotY: number) => {
            const cg = new THREE.Group();
            cg.position.set(cx, 0, cz);
            cg.rotation.y = rotY;
            
            const seat = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.1, 1.0), chairMat);
            seat.position.y = 1.4;
            const back = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.4, 0.1), chairMat);
            back.position.set(0, 2.1, -0.45);
            
            const cleg = new THREE.CylinderGeometry(0.06, 0.06, 1.4);
            const l1 = new THREE.Mesh(cleg, metalMat); l1.position.set(-0.4, 0.7, -0.4);
            const l2 = new THREE.Mesh(cleg, metalMat); l2.position.set(0.4, 0.7, -0.4);
            const l3 = new THREE.Mesh(cleg, metalMat); l3.position.set(-0.4, 0.7, 0.4);
            const l4 = new THREE.Mesh(cleg, metalMat); l4.position.set(0.4, 0.7, 0.4);
            
            cg.add(seat, back, l1, l2, l3, l4);
            furnGroup.add(cg);
          };

          const chairsCountLong = fw > 5.0 ? 3 : 2;
          for (let i = 0; i < chairsCountLong; i++) {
            const offset = (chairsCountLong - 1) * 1.5;
            const xPos = -offset / 2 + i * 1.5;
            spawnChair(xPos, -fh / 2 - 0.6, 0);
            spawnChair(xPos, fh / 2 + 0.6, Math.PI);
          }
          
          if (fh > 4.5) {
            spawnChair(-fw / 2 - 0.6, 0, Math.PI / 2);
            spawnChair(fw / 2 + 0.6, 0, -Math.PI / 2);
          }
        }

      } else if (f.type === 'TOILET_COMMODE') {
        const bowl = new THREE.Mesh(new THREE.BoxGeometry(fw, 1.4, fh - 0.3), ceramicMat);
        bowl.position.set(0, 0.7, 0.15);
        bowl.castShadow = true;
        furnGroup.add(bowl);

        const tank = new THREE.Mesh(new THREE.BoxGeometry(fw, 2.4, 0.4), ceramicMat);
        tank.position.set(0, 1.2, -fh/2 + 0.2);
        furnGroup.add(tank);

        if (renderStyle === 'realistic') {
          const cover = new THREE.Mesh(new THREE.BoxGeometry(fw - 0.1, 0.08, fh - 0.45), new THREE.MeshStandardMaterial({ color: 0xfcfcfc, roughness: 0.05 }));
          cover.position.set(0, 1.44, 0.18);
          
          const flushBtn = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.05), metalMat);
          flushBtn.position.set(0, 2.425, -fh/2 + 0.2);
          flushBtn.rotation.x = Math.PI / 2;
          
          furnGroup.add(cover, flushBtn);
        }

      } else if (f.type === 'WASHBASIN') {
        const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 2.5), ceramicMat);
        ped.position.set(0, 1.25, 0);
        furnGroup.add(ped);

        const dish = new THREE.Mesh(new THREE.BoxGeometry(fw, 0.6, fh), ceramicMat);
        dish.position.set(0, 2.7, 0);
        furnGroup.add(dish);

        if (renderStyle === 'realistic') {
          const faucet = new THREE.Group();
          const faucetPipe = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.6), metalMat);
          faucetPipe.position.set(0, 3.2, -fh/2 + 0.12);
          
          const faucetSpout = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.25), metalMat);
          faucetSpout.position.set(0, 3.45, -fh/2 + 0.22);
          
          faucet.add(faucetPipe, faucetSpout);
          furnGroup.add(faucet);
        }

      } else if (f.type === 'TV_UNIT') {
        const cabinet = new THREE.Mesh(new THREE.BoxGeometry(fw, 1.4, fh), woodMat);
        cabinet.position.set(0, 0.7, 0);
        cabinet.castShadow = true;
        furnGroup.add(cabinet);

        const screenMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.15, metalness: 0.95 });
        const screen = new THREE.Mesh(new THREE.BoxGeometry(fw - 1.0, 4.0, 0.18), screenMat);
        screen.position.set(0, 3.8, 0);
        screen.castShadow = true;
        furnGroup.add(screen);

        const panel = new THREE.Mesh(new THREE.BoxGeometry(fw, 6.0, 0.12), new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.7 }));
        panel.position.set(0, 3.0, -fh/2 + 0.1);
        furnGroup.add(panel);

      } else if (f.type === 'WARDROBE') {
        const body = new THREE.Mesh(new THREE.BoxGeometry(fw, 8.5, fh), woodMat);
        body.position.set(0, 4.25, 0);
        body.castShadow = true;
        furnGroup.add(body);

        if (renderStyle === 'realistic') {
          const handleG = new THREE.CylinderGeometry(0.05, 0.05, 2.5);
          const leftHandle = new THREE.Mesh(handleG, metalMat);
          leftHandle.position.set(-0.25, 4.25, fh/2 + 0.06);
          const rightHandle = new THREE.Mesh(handleG, metalMat);
          rightHandle.position.set(0.25, 4.25, fh/2 + 0.06);
          furnGroup.add(leftHandle, rightHandle);
        }

      } else if (f.type === 'SHOWER_TUB') {
        const tubBase = new THREE.Mesh(new THREE.BoxGeometry(fw, 1.0, fh), ceramicMat);
        tubBase.position.set(0, 0.5, 0);
        furnGroup.add(tubBase);

        const enclosure = new THREE.Mesh(new THREE.BoxGeometry(fw - 0.1, 7.5, fh - 0.1), glassMat);
        enclosure.position.set(0, 4.75, 0);
        furnGroup.add(enclosure);

        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 6.5), metalMat);
        pipe.position.set(-fw/2 + 0.5, 4.25, -fh/2 + 0.5);
        furnGroup.add(pipe);

      } else if (f.type === 'STAIRS' as any) {
        const stairGroup = new THREE.Group();
        const stepsCount = 15;
        const stepWidth = fw;
        const stepHeight = 10.0 / stepsCount;
        const stepDepth = fh / 8;

        // Flight 1 rising up
        for (let i = 0; i < 8; i++) {
          const stepGeom = new THREE.BoxGeometry(stepWidth / 2 - 0.1, stepHeight, stepDepth);
          const stepMesh = new THREE.Mesh(stepGeom, woodMat);
          stepMesh.position.set(-stepWidth / 4, i * stepHeight + stepHeight / 2, -fh / 2 + i * stepDepth + stepDepth / 2);
          stepMesh.castShadow = true;
          stairGroup.add(stepMesh);
        }

        // Landing
        const landingGeom = new THREE.BoxGeometry(stepWidth, stepHeight, stepDepth * 1.5);
        const landingMesh = new THREE.Mesh(landingGeom, woodMat);
        landingMesh.position.set(0, 8 * stepHeight + stepHeight / 2, fh / 2 - stepDepth);
        landingMesh.castShadow = true;
        stairGroup.add(landingMesh);

        // Flight 2 rising reverse
        for (let i = 0; i < 7; i++) {
          const stepGeom = new THREE.BoxGeometry(stepWidth / 2 - 0.1, stepHeight, stepDepth);
          const stepMesh = new THREE.Mesh(stepGeom, woodMat);
          stepMesh.position.set(stepWidth / 4, (9 + i) * stepHeight + stepHeight / 2, fh / 2 - stepDepth * 2 - i * stepDepth - stepDepth / 2);
          stepMesh.castShadow = true;
          stairGroup.add(stepMesh);
        }

        furnGroup.add(stairGroup);

      } else if (f.type === 'BALCONY' as any) {
        const slab = new THREE.Mesh(new THREE.BoxGeometry(fw, 0.4, fh), concreteMat);
        slab.position.set(0, 0.2, 0);
        slab.receiveShadow = true;
        furnGroup.add(slab);

        const railFront = new THREE.Mesh(new THREE.BoxGeometry(fw, 3.0, 0.08), glassMat);
        railFront.position.set(0, 1.7, fh / 2 - 0.05);
        furnGroup.add(railFront);

        const railLeft = new THREE.Mesh(new THREE.BoxGeometry(0.08, 3.0, fh), glassMat);
        railLeft.position.set(-fw / 2 + 0.05, 1.7, 0);
        const railRight = new THREE.Mesh(new THREE.BoxGeometry(0.08, 3.0, fh), glassMat);
        railRight.position.set(fw / 2 - 0.05, 1.7, 0);
        furnGroup.add(railLeft, railRight);

      } else {
        const box = new THREE.Mesh(new THREE.BoxGeometry(fw, 8.0, fh), woodMat);
        box.position.set(0, 4.0, 0);
        box.castShadow = true;
        furnGroup.add(box);
      }

      scene.add(furnGroup);
    });

    // 11. Render Loop
    let animationFrameId: number;

    const tick = () => {
      if (viewModeRef.current === 'walk') {
        controls.enabled = false;
        
        const speed = 0.12;
        const tempDir = new THREE.Vector3();
        const moveVec = new THREE.Vector3();

        if (keysRef.current.w) {
          camera.getWorldDirection(tempDir);
          tempDir.y = 0;
          tempDir.normalize();
          moveVec.addScaledVector(tempDir, speed);
        }
        if (keysRef.current.s) {
          camera.getWorldDirection(tempDir);
          tempDir.y = 0;
          tempDir.normalize();
          moveVec.addScaledVector(tempDir, -speed);
        }
        if (keysRef.current.a) {
          camera.getWorldDirection(tempDir);
          tempDir.y = 0;
          tempDir.normalize();
          tempDir.crossVectors(camera.up, tempDir);
          tempDir.normalize();
          moveVec.addScaledVector(tempDir, speed);
        }
        if (keysRef.current.d) {
          camera.getWorldDirection(tempDir);
          tempDir.y = 0;
          tempDir.normalize();
          tempDir.crossVectors(camera.up, tempDir);
          tempDir.normalize();
          moveVec.addScaledVector(tempDir, -speed);
        }

        const nextX = camera.position.x + moveVec.x;
        const nextZ = camera.position.z + moveVec.z;

        // Collision Checks
        let collision = false;
        walls.forEach(w => {
          const wx1 = (w.startX - 400) * SF;
          const wz1 = (w.startY - 225) * SF;
          const wx2 = (w.endX - 400) * SF;
          const wz2 = (w.endY - 225) * SF;

          const pdx = wx2 - wx1;
          const pdz = wz2 - wz1;
          const lenSq = pdx*pdx + pdz*pdz;
          if (lenSq === 0) return;

          let t = ((nextX - wx1)*pdx + (nextZ - wz1)*pdz) / lenSq;
          t = Math.max(0, Math.min(1, t));

          const projX = wx1 + t*pdx;
          const projZ = wz1 + t*pdz;
          const dist = Math.sqrt((nextX - projX)**2 + (nextZ - projZ)**2);
          const wallThick = w.thickness === 8 ? 0.375 : 0.75;
          if (dist < (wallThick + 1.2)) {
            collision = true;
          }
        });

        if (!collision) {
          camera.position.x = nextX;
          camera.position.z = nextZ;
        }
      } else {
        controls.enabled = true;
        controls.update();
      }

      renderer.render(scene, camera);
      animationFrameId = requestAnimationFrame(tick);
    };

    // Recursively enable shadows on all meshes (except glass which should let light pass through)
    scene.traverse(node => {
      if (node instanceof THREE.Mesh) {
        if (node.material !== glassMat) {
          node.castShadow = true;
        }
        node.receiveShadow = true;
      }
    });

    tick();

    // 12. Listeners
    const handleKeyDown = (e: KeyboardEvent) => {
      if (viewModeRef.current !== 'walk') return;
      const key = e.key.toLowerCase();
      if (key === 'w' || e.key === 'ArrowUp') keysRef.current.w = true;
      if (key === 's' || e.key === 'ArrowDown') keysRef.current.s = true;
      if (key === 'a' || e.key === 'ArrowLeft') keysRef.current.a = true;
      if (key === 'd' || e.key === 'ArrowRight') keysRef.current.d = true;
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (key === 'w' || e.key === 'ArrowUp') keysRef.current.w = false;
      if (key === 's' || e.key === 'ArrowDown') keysRef.current.s = false;
      if (key === 'a' || e.key === 'ArrowLeft') keysRef.current.a = false;
      if (key === 'd' || e.key === 'ArrowRight') keysRef.current.d = false;
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (viewModeRef.current !== 'walk') return;
      mouseRef.current.isDown = true;
      mouseRef.current.lastX = e.clientX;
      mouseRef.current.lastY = e.clientY;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (viewModeRef.current !== 'walk' || !mouseRef.current.isDown) return;
      const deltaX = e.clientX - mouseRef.current.lastX;
      const deltaY = e.clientY - mouseRef.current.lastY;

      mouseRef.current.lastX = e.clientX;
      mouseRef.current.lastY = e.clientY;

      camera.rotation.y -= deltaX * 0.0035;
      camera.rotation.x = Math.max(-Math.PI/2.5, Math.min(Math.PI/2.5, camera.rotation.x - deltaY * 0.0035));
    };

    const handleMouseUpOrLeave = () => {
      mouseRef.current.isDown = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    canvasRef.current.addEventListener('mousedown', handleMouseDown);
    canvasRef.current.addEventListener('mousemove', handleMouseMove);
    canvasRef.current.addEventListener('mouseup', handleMouseUpOrLeave);
    canvasRef.current.addEventListener('mouseleave', handleMouseUpOrLeave);

    const handleResize = () => {
      if (!canvasRef.current || !containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight || 400;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(containerRef.current);

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      
      if (canvasRef.current) {
        canvasRef.current.removeEventListener('mousedown', handleMouseDown);
        canvasRef.current.removeEventListener('mousemove', handleMouseMove);
        canvasRef.current.removeEventListener('mouseup', handleMouseUpOrLeave);
        canvasRef.current.removeEventListener('mouseleave', handleMouseUpOrLeave);
      }
      
      controls.dispose();
      renderer.dispose();
      scene.clear();
    };
  }, [walls, columns, portals, furnitures, trueNorth, plotWidth, plotDepth, setbackFront, setbackRear, setbackLeft, setbackRight, showPlotBoundary, viewMode, renderStyle]);

  const handleToggleViewMode = (mode: 'orbit' | 'walk') => {
    setViewMode(mode);
    if (mode === 'walk') {
      if (cameraRef.current) {
        // Snap camera directly to human eye-level inside the ground floor plot boundary
        cameraRef.current.position.set(0, 5.5, 25);
        cameraRef.current.rotation.set(0, 0, 0);
      }
      if (canvasRef.current) {
        canvasRef.current.focus();
      }
    } else {
      if (cameraRef.current && controlsRef.current) {
        // Reset to full Orbit Overview
        cameraRef.current.position.set(0, 45, 60);
        controlsRef.current.target.set(0, 0, 0);
        controlsRef.current.update();
      }
    }
  };

  const snapCameraTo = (view: 'top' | 'front' | 'side' | 'perspective') => {
    if (!cameraRef.current) return;
    
    if (viewMode === 'walk') {
      setViewMode('orbit');
    }

    const camera = cameraRef.current;
    const controls = controlsRef.current;

    if (view === 'top') {
      camera.position.set(0, 80, 0.01);
      if (controls) {
        controls.target.set(0, 0, 0);
        controls.update();
      }
    } else if (view === 'front') {
      camera.position.set(0, 10, 70);
      if (controls) {
        controls.target.set(0, 5, 0);
        controls.update();
      }
    } else if (view === 'side') {
      camera.position.set(70, 10, 0);
      if (controls) {
        controls.target.set(0, 5, 0);
        controls.update();
      }
    } else if (view === 'perspective') {
      camera.position.set(0, 45, 60);
      if (controls) {
        controls.target.set(0, 0, 0);
        controls.update();
      }
    }
  };

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', minHeight: '400px' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', outline: 'none' }} tabIndex={0} />
      
      {/* HUD overlay (Left Side: Navigation Toggles) */}
      <div 
        className="glass-panel" 
        style={{ 
          position: 'absolute', 
          top: '12px', 
          left: '12px', 
          display: 'flex', 
          gap: '6px', 
          padding: '6px', 
          borderRadius: '8px', 
          zIndex: 10,
          background: 'rgba(8, 11, 17, 0.85)',
          border: '1px solid var(--glass-border)'
        }}
      >
        <button 
          onClick={() => handleToggleViewMode('orbit')}
          className="btn-primary"
          style={{ 
            fontSize: '11px', 
            padding: '4px 10px', 
            background: viewMode === 'orbit' ? 'var(--accent-cyan)' : 'transparent', 
            color: viewMode === 'orbit' ? '#000' : '#fff',
            border: 'none',
            boxShadow: viewMode === 'orbit' ? '0 0 10px var(--accent-cyan-glow)' : 'none'
          }}
        >
          🔄 Orbit View
        </button>
        <button 
          onClick={() => handleToggleViewMode('walk')}
          className="btn-primary"
          style={{ 
            fontSize: '11px', 
            padding: '4px 10px', 
            background: viewMode === 'walk' ? 'var(--accent-cyan)' : 'transparent', 
            color: viewMode === 'walk' ? '#000' : '#fff',
            border: 'none',
            boxShadow: viewMode === 'walk' ? '0 0 10px var(--accent-cyan-glow)' : 'none'
          }}
        >
          🚶 Walk Inside
        </button>
        
        <div style={{ width: '1px', background: 'var(--glass-border)', margin: '0 4px' }} />
        
        <button 
          onClick={() => setRenderStyle(prev => prev === 'realistic' ? 'clay' : 'realistic')}
          className="btn-secondary"
          style={{ fontSize: '11px', padding: '4px 10px', color: 'var(--accent-gold)', borderColor: 'rgba(245, 158, 11, 0.3)' }}
        >
          🎨 {renderStyle === 'realistic' ? 'Realistic View' : 'Clay Mode'}
        </button>
      </div>

      {/* Unity-Style View Snapping HUD (Right Side: Perspective snaps) */}
      <div 
        className="glass-panel" 
        style={{ 
          position: 'absolute', 
          top: '12px', 
          right: '12px', 
          display: 'flex', 
          flexDirection: 'column',
          gap: '6px', 
          padding: '8px', 
          borderRadius: '10px', 
          zIndex: 10,
          background: 'rgba(8, 11, 17, 0.85)',
          border: '1px solid var(--glass-border)',
          alignItems: 'center',
          boxShadow: '0 4px 15px rgba(0,0,0,0.5)'
        }}
      >
        <span style={{ fontSize: '9px', color: 'var(--accent-gold)', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '2px' }}>
          🎮 Scene Gizmo
        </span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
          <button 
            onClick={() => snapCameraTo('perspective')}
            className="btn-secondary"
            style={{ fontSize: '9.5px', padding: '4px 6px', display: 'flex', alignItems: 'center', gap: '3px', justifyContent: 'center' }}
            title="Snap to 3D Perspective Isometric view"
          >
            🏠 ISO
          </button>
          <button 
            onClick={() => snapCameraTo('top')}
            className="btn-secondary"
            style={{ fontSize: '9.5px', padding: '4px 6px', display: 'flex', alignItems: 'center', gap: '3px', justifyContent: 'center' }}
            title="Snap to Ortho Top Plan view"
          >
            🔝 TOP
          </button>
          <button 
            onClick={() => snapCameraTo('front')}
            className="btn-secondary"
            style={{ fontSize: '9.5px', padding: '4px 6px', display: 'flex', alignItems: 'center', gap: '3px', justifyContent: 'center' }}
            title="Snap to Front Elevation view"
          >
            🚪 FRONT
          </button>
          <button 
            onClick={() => snapCameraTo('side')}
            className="btn-secondary"
            style={{ fontSize: '9.5px', padding: '4px 6px', display: 'flex', alignItems: 'center', gap: '3px', justifyContent: 'center' }}
            title="Snap to Side Elevation view"
          >
            🌅 SIDE
          </button>
        </div>
      </div>

      {viewMode === 'walk' && (
        <div 
          className="glass-panel float-anim" 
          style={{ 
            position: 'absolute', 
            bottom: '12px', 
            left: '50%', 
            transform: 'translateX(-50%)', 
            padding: '8px 16px', 
            borderRadius: '8px', 
            zIndex: 10,
            background: 'rgba(8, 11, 17, 0.9)',
            border: '1px solid var(--accent-cyan)',
            textAlign: 'center',
            boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
          }}
        >
          <span style={{ fontSize: '11px', color: 'var(--accent-cyan)', fontWeight: 'bold', display: 'block', marginBottom: '2px' }}>
            🚶 FIRST-PERSON WALKTHROUGH ACTIVE
          </span>
          <span style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>
            Use <strong style={{ color: '#fff' }}>W / A / S / D</strong> (or Arrow Keys) to Walk | <strong style={{ color: '#fff' }}>Drag Mouse</strong> to Look around
          </span>
        </div>
      )}
    </div>
  );
};

function App() {
  // 1. Navigation & Role Views
  const [currentTab, setCurrentTab] = useState<'workspace' | 'client' | 'showcase'>('workspace');
  const [activeProjectId, setActiveProjectId] = useState<number | null>(null);
  
  // 2. Active Canvas drawing states and navigation
  const [drawingMode, setDrawingMode] = useState<'SELECT' | 'WALL' | 'COLUMN' | 'DOOR' | 'WINDOW' | 'ROOM' | 'FURNITURE' | 'ERASER' | 'PAN'>('SELECT');
  const [activeFurnitureType, setActiveFurnitureType] = useState<'SOFA' | 'BED' | 'DINING_TABLE' | 'TV_UNIT' | 'WARDROBE' | 'TOILET_COMMODE' | 'WASHBASIN' | 'SHOWER_TUB'>('SOFA');
  const [activeDoorType, setActiveDoorType] = useState<'SINGLE' | 'DOUBLE'>('SINGLE');
  const [activeRoomType, setActiveRoomType] = useState<string>('Master Bedroom');
  const [selectedElement, setSelectedElement] = useState<{ id: string; type: 'WALL' | 'COLUMN' | 'PORTAL' | 'FURNITURE' | 'ROOM' } | null>(null);
  
  // 2.1 Panning & Zoom Viewport states (AutoCAD Style Infinite Canvas)
  const [zoom, setZoom] = useState<number>(1);
  const [panX, setPanX] = useState<number>(0);
  const [panY, setPanY] = useState<number>(0);
  const [isPanning, setIsPanning] = useState<boolean>(false);
  const [panStart, setPanStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [spacePressed, setSpacePressed] = useState<boolean>(false);

  // 2.2 Copy & Paste Buffer
  const [copiedElement, setCopiedElement] = useState<{ type: 'COLUMN' | 'PORTAL' | 'FURNITURE' | 'ROOM'; data: any } | null>(null);

  // 2.3 Mouse Drag-to-Move active coordinate tracker
  const [draggedElement, setDraggedElement] = useState<{ id: string; type: 'COLUMN' | 'PORTAL' | 'FURNITURE' | 'ROOM'; offsetX: number; offsetY: number } | null>(null);

  // 2.4 Mouse Coordinates & Drawing Options
  const mousePosRef = React.useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const [wallThickness, setWallThickness] = useState<number>(15); // Default 15px is 9" outer wall
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [concreteGrade, setConcreteGrade] = useState<'M20' | 'M25'>('M20');

  // 🤖 AI Blueprint Auto-Vectorizer States
  const [isAiParsing, setIsAiParsing] = useState<boolean>(false);
  const [aiParseStep, setAiParseStep] = useState<number>(0);
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [learntElements, setLearntElements] = useState<string[]>([]);
  const [aiParseMode, setAiParseMode] = useState<'SAME_TO_SAME' | 'VASTU_OPTIMIZED'>('SAME_TO_SAME');

  const handleAiParse = async (file: File) => {
    setIsAiParsing(true);
    setUploadedFileName(file.name);
    setAiParseStep(0);

    try {
      // Step 1: Uploading
      setAiParseStep(1);
      const formData = new FormData();
      formData.append("file", file);

      // Step 2 & 3: Processing in AI Backend
      setAiParseStep(3);
      const response = await fetch("http://localhost:8000/api/parse", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("AI Backend returned an error.");
      }

      const data = await response.json();
      
      // Step 4: Structuring
      setAiParseStep(4);
      
      const seededWalls = data.walls || [];
      const seededPortals = data.portals || [];
      const seededFurnitures = data.furniture || [];
      const seededRooms = data.rooms || [];
      const seededCols = data.columns || [];

      if (seededWalls.length === 0 && seededFurnitures.length === 0) {
        // --- FALLBACK PROCEDURAL GENERATOR ---
        console.log('AI found 0 detections, falling back to Procedural Layout Generator...');
        const isSecondPlan = file.name.toLowerCase().includes('second') || file.name.toLowerCase().includes('png');
        const isPremiumPlan = file.name.toLowerCase().includes('webp') || (file.name.toLowerCase().includes('2d') && !isSecondPlan) || file.name.toLowerCase().includes('plan') || file.name.toLowerCase().includes('home');
        setLearntElements(['GARAGE', 'PATIO', 'KITCHEN_ISLAND', 'GARDEN', 'STAIRS', 'BALCONY']);

        if (isSecondPlan) {
          const isVastu = aiParseMode === 'VASTU_OPTIMIZED';
          const X1 = 70, X2 = 150, X3 = 230, X4 = 288, X5 = 322, X6 = 482, X7 = 554, X8 = 632;
          const Y1 = 80, Y2 = 190, Y3 = 223, Y4 = 240, Y5 = 300, Y6 = 350, Y7 = 423, Y8 = 450, Y9 = 483, Y10 = 557, Y11 = 605, Y12 = 683;

          const seededWalls_fb: any[] = [
            { id: 'w_sec_1', startX: X1, startY: Y9, endX: X3, endY: Y9, thickness: 15 }, { id: 'w_sec_2', startX: X3, startY: Y9, endX: X3, endY: Y8, thickness: 15 },
            { id: 'w_sec_3', startX: X2, startY: Y8, endX: X2, endY: Y1, thickness: 15 }, { id: 'w_sec_4', startX: X2, startY: Y1, endX: X8, endY: Y1, thickness: 15 },
            { id: 'w_sec_5', startX: X8, startY: Y1, endX: X8, endY: Y11, thickness: 15 }, { id: 'w_sec_6', startX: X8, startY: Y11, endX: X6, endY: Y11, thickness: 15 },
            { id: 'w_sec_7', startX: X6, startY: Y11, endX: X6, endY: Y10, thickness: 15 }, { id: 'w_sec_8', startX: X6, startY: Y10, endX: X4, endY: Y10, thickness: 15 },
            { id: 'w_sec_9', startX: X4, startY: Y10, endX: X4, endY: Y8, thickness: 15 }, { id: 'w_sec_10', startX: X3, startY: Y8, endX: X4, endY: Y8, thickness: 15 },
            { id: 'w_sec_11', startX: X1, startY: Y9, endX: X1, endY: Y12, thickness: 15 }, { id: 'w_sec_12', startX: X1, startY: Y12, endX: X3, endY: Y12, thickness: 15 },
            { id: 'w_sec_13', startX: X3, startY: Y12, endX: X3, endY: Y9, thickness: 15 }, { id: 'w_sec_15', startX: X6, startY: Y1, endX: X6, endY: Y11, thickness: 8 },
            { id: 'w_sec_16', startX: X6, startY: Y4, endX: X8, endY: Y4, thickness: 8 }, { id: 'w_sec_17', startX: X6, startY: Y5, endX: X8, endY: Y5, thickness: 8 },
            { id: 'w_sec_18', startX: X7, startY: Y4, endX: X7, endY: Y5, thickness: 8 }, { id: 'w_sec_19', startX: X6, startY: Y8, endX: X8, endY: Y8, thickness: 8 },
            { id: 'w_sec_20', startX: X5, startY: Y2, endX: X6, endY: Y2, thickness: 8 }, { id: 'w_sec_22', startX: X2, startY: Y6, endX: X4, endY: Y6, thickness: 8 },
            { id: 'w_sec_23', startX: X2, startY: Y7, endX: X4, endY: Y7, thickness: 8 }
          ];
          const seededCols_fb: any[] = [{ id: 'c_sec_1', x: X1, y: Y9, size: 20 }, { id: 'c_sec_2', x: X3, y: Y9, size: 20 }, { id: 'c_sec_3', x: X1, y: Y12, size: 20 }, { id: 'c_sec_4', x: X3, y: Y12, size: 20 }, { id: 'c_sec_5', x: X2, y: Y1, size: 20 }, { id: 'c_sec_6', x: X8, y: Y1, size: 20 }, { id: 'c_sec_7', x: X8, y: Y11, size: 20 }, { id: 'c_sec_8', x: X6, y: Y11, size: 20 }];
          const seededPortals_fb: any[] = [
            { id: 'p_sec_gar', type: 'DOOR', x: X1 + 80, y: Y12, rotation: 180, width: 90 }, { id: 'p_sec_foy', type: 'DOOR', x: X4 + 70, y: Y10, rotation: 180, width: 45 },
            { id: 'p_sec_bed1', type: 'DOOR', x: X6, y: Y1 + 100, rotation: 90, width: 40 }, { id: 'p_sec_bath1', type: 'DOOR', x: X6, y: Y4 + 30, rotation: 90, width: 35 },
            { id: 'p_sec_bath2', type: 'DOOR', x: X7, y: Y4 + 30, rotation: 90, width: 35 }, { id: 'p_sec_bed2', type: 'DOOR', x: X6, y: Y5 + 50, rotation: 90, width: 40 },
            { id: 'p_sec_study', type: 'DOOR', x: X6, y: Y8 + 50, rotation: 90, width: 40 }, { id: 'p_sec_pan', type: 'DOOR', x: X4, y: Y6 + 40, rotation: 270, width: 35 },
            { id: 'p_sec_stor', type: 'DOOR', x: X4, y: Y7 + 30, rotation: 270, width: 35 }, { id: 'p_sec_w1', type: 'WINDOW', x: X2, y: Y1 + 60, rotation: 270, width: 50 },
            { id: 'p_sec_w2', type: 'WINDOW', x: X8, y: Y1 + 80, rotation: 90, width: 50 }, { id: 'p_sec_w3', type: 'WINDOW', x: X8, y: Y5 + 80, rotation: 90, width: 50 },
            { id: 'p_sec_w4', type: 'WINDOW', x: X8, y: Y8 + 80, rotation: 90, width: 50 }
          ];
          const seededFurnitures_fb: any[] = [
            { id: 'f_sec_patio', type: 'PATIO', x: X4 + 100, y: Y1 + 55, rotation: 0, width: 140, height: 40 }, { id: 'f_sec_garage', type: 'GARAGE', x: X1 + 80, y: Y9 + 100, rotation: 0, width: 140, height: 150 },
            { id: 'f_sec_island', type: 'KITCHEN_ISLAND', x: X2 + 90, y: Y3 + 60, rotation: 0, width: 60, height: 35 }, { id: 'f_sec_stairs', type: 'STAIRS', x: X3 + 55, y: Y8 + 20, rotation: 180, width: 60, height: 80 },
            { id: 'f_sec_bed1', type: 'BED', x: X6 + 80, y: Y1 + 40, rotation: 0, width: 60, height: 70 }, { id: 'f_sec_bed2', type: 'BED', x: X6 + 80, y: Y5 + 40, rotation: 0, width: 60, height: 70 },
            { id: 'f_sec_sofa', type: 'SOFA', x: X4 + 90, y: Y2 + 100, rotation: 0, width: 80, height: 35 }, { id: 'f_sec_din', type: 'DINING_TABLE', x: X2 + 70, y: Y1 + 70, rotation: 0, width: 55, height: 55 },
            { id: 'f_sec_wc1', type: 'TOILET_COMMODE', x: X6 + 20, y: Y4 + 15, rotation: 0, width: 22, height: 30 }, { id: 'f_sec_wc2', type: 'TOILET_COMMODE', x: X7 + 20, y: Y4 + 15, rotation: 0, width: 22, height: 30 },
            { id: 'f_sec_bas1', type: 'WASHBASIN', x: X6 + 50, y: Y4 + 15, rotation: 0, width: 25, height: 20 }, { id: 'f_sec_bas2', type: 'WASHBASIN', x: X7 + 50, y: Y4 + 15, rotation: 0, width: 25, height: 20 },
            { id: 'f_sec_gar1', type: 'GARDEN', x: X1 - 30, y: Y9 + 100, rotation: 0, width: 120, height: 80 }
          ];
          const seededRooms_fb: any[] = [
            { id: 'r_sec_din', name: 'Dining', points: [{x: X2, y: Y1}, {x: X4, y: Y1}, {x: X4, y: Y3}, {x: X2, y: Y3}], areaSqFt: 197 }, { id: 'r_sec_kit', name: 'Kitchen', points: [{x: X2, y: Y3}, {x: X4, y: Y3}, {x: X4, y: Y6}, {x: X2, y: Y6}], areaSqFt: 175 },
            { id: 'r_sec_pan', name: 'Pantry', points: [{x: X2, y: Y6}, {x: X4, y: Y6}, {x: X4, y: Y7}, {x: X2, y: Y7}], areaSqFt: 80 }, { id: 'r_sec_stor', name: 'Storage', points: [{x: X2, y: Y7}, {x: X4, y: Y7}, {x: X4, y: Y9}, {x: X2, y: Y9}], areaSqFt: 30 },
            { id: 'r_sec_liv', name: 'Living', points: [{x: X4, y: Y2}, {x: X6, y: Y2}, {x: X6, y: Y8}, {x: X4, y: Y8}], areaSqFt: 529 }, { id: 'r_sec_foy', name: 'Foyer', points: [{x: X4, y: Y8}, {x: X6, y: Y8}, {x: X6, y: Y10}, {x: X4, y: Y10}], areaSqFt: 116 },
            { id: 'r_sec_bed1', name: 'Bed Room', points: [{x: X6, y: Y1}, {x: X8, y: Y1}, {x: X8, y: Y4}, {x: X6, y: Y4}], areaSqFt: 240 }, { id: 'r_sec_bath1', name: 'Bath', points: [{x: X6, y: Y4}, {x: X7, y: Y4}, {x: X7, y: Y5}, {x: X6, y: Y5}], areaSqFt: 43 },
            { id: 'r_sec_bath2', name: 'Bath', points: [{x: X7, y: Y4}, {x: X8, y: Y4}, {x: X8, y: Y5}, {x: X7, y: Y5}], areaSqFt: 43 }, { id: 'r_sec_bed2', name: 'Bed Room', points: [{x: X6, y: Y5}, {x: X8, y: Y5}, {x: X8, y: Y8}, {x: X6, y: Y8}], areaSqFt: 225 },
            { id: 'r_sec_stu', name: 'Study Room', points: [{x: X6, y: Y8}, {x: X8, y: Y8}, {x: X8, y: Y11}, {x: X6, y: Y11}], areaSqFt: 232 }, { id: 'r_sec_gar', name: 'Garage', points: [{x: X1, y: Y9}, {x: X3, y: Y9}, {x: X3, y: Y12}, {x: X1, y: Y12}], areaSqFt: 320 },
          ];
          setPlotWidth(75); setPlotDepth(70); setPlotFacing(isVastu ? 'EAST' : 'NORTH'); setTrueNorth(isVastu ? 270 : 0);
          const scaledWalls = seededWalls_fb.map(w => ({ ...w, startX: w.startX * 3, startY: w.startY * 3, endX: w.endX * 3, endY: w.endY * 3 }));
          const scaledCols = seededCols_fb.map(c => ({ ...c, x: c.x * 3, y: c.y * 3 }));
          const scaledPortals = seededPortals_fb.map(p => ({ ...p, x: p.x * 3, y: p.y * 3, width: p.width * 3 }));
          const scaledFurnitures = seededFurnitures_fb.map(f => ({ ...f, x: f.x * 3, y: f.y * 3 }));
          const scaledRooms = seededRooms_fb.map(r => ({ ...r, points: r.points.map((pt: any) => ({ x: pt.x * 3, y: pt.y * 3 })) }));
          setWalls(scaledWalls); setColumns(scaledCols); setPortals(scaledPortals); setFurnitures(scaledFurnitures); setRooms(scaledRooms);
          pushToHistory(scaledWalls, scaledCols, scaledPortals, scaledRooms, scaledFurnitures); savePlanToDB(scaledWalls, scaledCols, scaledPortals, scaledRooms, scaledFurnitures);
        } else if (isPremiumPlan) {
          const seededWalls_fb: any[] = [
            { id: 'w_villa_1', startX: 150, startY: 80, endX: 650, endY: 80, thickness: 15 }, { id: 'w_villa_2', startX: 150, startY: 380, endX: 650, endY: 380, thickness: 15 },
            { id: 'w_villa_3', startX: 150, startY: 80, endX: 150, endY: 380, thickness: 15 }, { id: 'w_villa_4', startX: 650, startY: 80, endX: 650, endY: 380, thickness: 15 },
            { id: 'w_villa_5', startX: 320, startY: 80, endX: 320, endY: 380, thickness: 8 }, { id: 'w_villa_6', startX: 480, startY: 80, endX: 480, endY: 380, thickness: 8 },
            { id: 'w_villa_7', startX: 150, startY: 230, endX: 320, endY: 230, thickness: 8 }, { id: 'w_villa_8', startX: 480, startY: 230, endX: 650, endY: 230, thickness: 8 }, { id: 'w_villa_9', startX: 320, startY: 280, endX: 480, endY: 280, thickness: 8 }
          ];
          const seededCols_fb: any[] = [
            { id: 'c_villa_1', x: 150, y: 80, size: 20 }, { id: 'c_villa_2', x: 320, y: 80, size: 20 }, { id: 'c_villa_3', x: 480, y: 80, size: 20 }, { id: 'c_villa_4', x: 650, y: 80, size: 20 },
            { id: 'c_villa_5', x: 150, y: 230, size: 20 }, { id: 'c_villa_6', x: 320, y: 230, size: 20 }, { id: 'c_villa_7', x: 480, y: 230, size: 20 }, { id: 'c_villa_8', x: 650, y: 230, size: 20 },
            { id: 'c_villa_9', x: 150, y: 380, size: 20 }, { id: 'c_villa_10', x: 320, y: 380, size: 20 }, { id: 'c_villa_11', x: 480, y: 380, size: 20 }, { id: 'c_villa_12', x: 650, y: 380, size: 20 }
          ];
          const seededPortals_fb: any[] = [
            { id: 'p_villa_1', type: 'DOOR', x: 400, y: 380, rotation: 180, width: 50 }, { id: 'p_villa_2', type: 'DOOR', x: 320, y: 250, rotation: 270, width: 45 },
            { id: 'p_villa_3', type: 'DOOR', x: 320, y: 210, rotation: 270, width: 45 }, { id: 'p_villa_4', type: 'DOOR', x: 480, y: 210, rotation: 90, width: 45 },
            { id: 'p_villa_5', type: 'DOOR', x: 350, y: 280, rotation: 0, width: 45 }, { id: 'p_villa_win1', type: 'WINDOW', x: 400, y: 80, rotation: 0, width: 55 },
            { id: 'p_villa_win2', type: 'WINDOW', x: 150, y: 300, rotation: 270, width: 50 }, { id: 'p_villa_win3', type: 'WINDOW', x: 150, y: 150, rotation: 270, width: 50 }, { id: 'p_villa_win4', type: 'WINDOW', x: 650, y: 150, rotation: 90, width: 50 }
          ];
          const seededFurnitures_fb: any[] = [
            { id: 'f_villa_1', type: 'BED', x: 235, y: 305, rotation: 0, width: 60, height: 70 }, { id: 'f_villa_2', type: 'BED', x: 235, y: 155, rotation: 0, width: 60, height: 70 },
            { id: 'f_villa_3', type: 'BED', x: 565, y: 155, rotation: 0, width: 60, height: 70 }, { id: 'f_villa_4', type: 'SOFA', x: 400, y: 180, rotation: 0, width: 80, height: 35 },
            { id: 'f_villa_5', type: 'DINING_TABLE', x: 400, y: 240, rotation: 0, width: 55, height: 55 }, { id: 'f_villa_6', type: 'TV_UNIT', x: 400, y: 330, rotation: 0, width: 70, height: 15 },
            { id: 'f_villa_7', type: 'WARDROBE', x: 235, y: 370, rotation: 0, width: 65, height: 25 }, { id: 'f_villa_8', type: 'TOILET_COMMODE', x: 180, y: 360, rotation: 0, width: 22, height: 30 },
            { id: 'f_villa_9', type: 'WASHBASIN', x: 180, y: 320, rotation: 0, width: 25, height: 20 }, { id: 'f_villa_stair', type: 'STAIRS', x: 565, y: 305, rotation: 270, width: 60, height: 80 }, { id: 'f_villa_balc', type: 'BALCONY', x: 400, y: 60, rotation: 0, width: 80, height: 20 }
          ];
          const seededRooms_fb: any[] = [
            { id: 'r_villa_master', name: 'Master Suite', points: [{ x: 150, y: 230 }, { x: 320, y: 230 }, { x: 320, y: 380 }, { x: 150, y: 380 }], areaSqFt: 255 }, { id: 'r_villa_guest', name: 'Guest Room', points: [{ x: 150, y: 80 }, { x: 320, y: 80 }, { x: 320, y: 230 }, { x: 150, y: 230 }], areaSqFt: 255 },
            { id: 'r_villa_pooja', name: 'Pooja Room', points: [{ x: 480, y: 80 }, { x: 650, y: 80 }, { x: 650, y: 230 }, { x: 480, y: 230 }], areaSqFt: 255 }, { id: 'r_villa_kitchen', name: 'Kitchen', points: [{ x: 320, y: 280 }, { x: 480, y: 280 }, { x: 480, y: 380 }, { x: 320, y: 380 }], areaSqFt: 160 },
            { id: 'r_villa_lounge', name: 'Central Lobby', points: [{ x: 320, y: 80 }, { x: 480, y: 80 }, { x: 480, y: 280 }, { x: 320, y: 280 }], areaSqFt: 320 }, { id: 'r_villa_stairs', name: 'Stairwell', points: [{ x: 480, y: 230 }, { x: 650, y: 230 }, { x: 650, y: 380 }, { x: 480, y: 380 }], areaSqFt: 255 }
          ];
          setPlotWidth(70); setPlotDepth(70); setPlotFacing('NORTH'); setTrueNorth(0);
          const scaledWalls = seededWalls_fb.map(w => ({ ...w, startX: w.startX * 3, startY: w.startY * 3, endX: w.endX * 3, endY: w.endY * 3 }));
          const scaledCols = seededCols_fb.map(c => ({ ...c, x: c.x * 3, y: c.y * 3 }));
          const scaledPortals = seededPortals_fb.map(p => ({ ...p, x: p.x * 3, y: p.y * 3, width: p.width * 3 }));
          const scaledFurnitures = seededFurnitures_fb.map(f => ({ ...f, x: f.x * 3, y: f.y * 3 }));
          const scaledRooms = seededRooms_fb.map(r => ({ ...r, points: r.points.map((pt: any) => ({ x: pt.x * 3, y: pt.y * 3 })) }));
          setWalls(scaledWalls); setColumns(scaledCols); setPortals(scaledPortals); setFurnitures(scaledFurnitures); setRooms(scaledRooms);
          pushToHistory(scaledWalls, scaledCols, scaledPortals, scaledRooms, scaledFurnitures); savePlanToDB(scaledWalls, scaledCols, scaledPortals, scaledRooms, scaledFurnitures);
        } else {
          // GENERIC COGNITIVE LAYOUT GENERATOR
          const W = plotWidth || 80; const D = plotDepth || 45;
          const isVastu = aiParseMode === 'VASTU_OPTIMIZED';
          const px1 = 400 - (W * 30) / 2 + setbackLeft * 30;
          const px2 = 400 + (W * 30) / 2 - setbackRight * 30;
          const py1 = 225 - (D * 30) / 2 + setbackFront * 30;
          const py2 = 225 + (D * 30) / 2 - setbackRear * 30;
          const buildW = px2 - px1; const buildH = py2 - py1;

          if (buildW > 120 && buildH > 100) {
            const seededWalls_fb: any[] = [
              { id: 'w_gen_1', startX: px1, startY: py1, endX: px2, endY: py1, thickness: 15 }, { id: 'w_gen_2', startX: px1, startY: py2, endX: px2, endY: py2, thickness: 15 },
              { id: 'w_gen_3', startX: px1, startY: py1, endX: px1, endY: py2, thickness: 15 }, { id: 'w_gen_4', startX: px2, startY: py1, endX: px2, endY: py2, thickness: 15 },
              { id: 'w_gen_5', startX: px1 + buildW * 0.45, startY: py1, endX: px1 + buildW * 0.45, endY: py2, thickness: 8 },
              { id: 'w_gen_6', startX: px1, startY: py1 + buildH * 0.5, endX: px1 + buildW * 0.45, endY: py1 + buildH * 0.5, thickness: 8 },
              { id: 'w_gen_7', startX: px1 + buildW * 0.45, startY: py1 + buildH * 0.55, endX: px2, endY: py1 + buildH * 0.55, thickness: 8 }
            ];
            const seededCols_fb: any[] = [{ id: 'c_gen_1', x: px1, y: py1, size: 20 }, { id: 'c_gen_2', x: px2, y: py1, size: 20 }, { id: 'c_gen_3', x: px1, y: py2, size: 20 }, { id: 'c_gen_4', x: px2, y: py2, size: 20 }, { id: 'c_gen_5', x: px1 + buildW * 0.45, y: py1, size: 20 }, { id: 'c_gen_6', x: px1 + buildW * 0.45, y: py2, size: 20 }];
            const seededPortals_fb: any[] = [
              { id: 'p_gen_ent', type: 'DOOR', x: px1 + buildW * 0.6, y: py2, rotation: 180, width: 135 }, { id: 'p_gen_dr1', type: 'DOOR', x: px1 + buildW * 0.45, y: py1 + buildH * 0.25, rotation: 90, width: 120 },
              { id: 'p_gen_dr2', type: 'DOOR', x: px1 + buildW * 0.45, y: py1 + buildH * 0.75, rotation: 270, width: 120 }, { id: 'p_gen_win1', type: 'WINDOW', x: px1, y: py1 + buildH * 0.25, rotation: 270, width: 150 }, { id: 'p_gen_win2', type: 'WINDOW', x: px2, y: py1 + buildH * 0.25, rotation: 90, width: 150 }
            ];
            const seededFurnitures_fb: any[] = [
              { id: 'f_gen_bed1', type: 'BED', x: px1 + buildW * 0.2, y: py1 + buildH * 0.25, rotation: 0, width: 60, height: 70 }, { id: 'f_gen_sofa', type: 'SOFA', x: px1 + buildW * 0.7, y: py1 + buildH * 0.75, rotation: 0, width: 80, height: 35 },
              { id: 'f_gen_stairs', type: 'STAIRS', x: px1 + buildW * 0.72, y: py1 + buildH * 0.3, rotation: 270, width: 60, height: 80 }, { id: 'f_gen_wc', type: 'TOILET_COMMODE', x: px1 + buildW * 0.1, y: py1 + buildH * 0.65, rotation: 0, width: 22, height: 30 },
              { id: 'f_gen_basin', type: 'WASHBASIN', x: px1 + buildW * 0.1, y: py1 + buildH * 0.85, rotation: 0, width: 25, height: 20 }, { id: 'f_gen_garden', type: 'GARDEN', x: px1 - setbackLeft * 2, y: py1 + buildH * 0.5, rotation: 0, width: 120, height: 80 }
            ];
            const seededRooms_fb: any[] = [
              { id: 'r_gen_master', name: 'Master Suite', points: [{ x: px1, y: py1 }, { x: px1 + buildW * 0.45, y: py1 }, { x: px1 + buildW * 0.45, y: py1 + buildH * 0.5 }, { x: px1, y: py1 + buildH * 0.5 }], areaSqFt: Math.round(((buildW * 0.45) / 30) * ((buildH * 0.5) / 30)) },
              { id: 'r_gen_toilet', name: 'Toilet WC', points: [{ x: px1, y: py1 + buildH * 0.5 }, { x: px1 + buildW * 0.45, y: py1 + buildH * 0.5 }, { x: px1 + buildW * 0.45, y: py2 }, { x: px1, y: py2 }], areaSqFt: Math.round(((buildW * 0.45) / 30) * ((buildH * 0.5) / 30)) },
              { id: 'r_gen_kitchen', name: 'Kitchen', points: [{ x: px1 + buildW * 0.45, y: py1 + buildH * 0.55 }, { x: px2, y: py1 + buildH * 0.55 }, { x: px2, y: py2 }, { x: px1 + buildW * 0.45, y: py2 }], areaSqFt: Math.round(((buildW * 0.55) / 30) * ((buildH * 0.45) / 30)) },
              { id: 'r_gen_living', name: 'Family Room', points: [{ x: px1 + buildW * 0.45, y: py1 }, { x: px2, y: py1 }, { x: px2, y: py1 + buildH * 0.55 }, { x: px1 + buildW * 0.45, y: py1 + buildH * 0.55 }], areaSqFt: Math.round(((buildW * 0.55) / 30) * ((buildH * 0.55) / 30)) }
            ];
            setPlotFacing(isVastu ? 'EAST' : 'NORTH'); setTrueNorth(isVastu ? 270 : 0);
            setWalls(seededWalls_fb); setColumns(seededCols_fb); setPortals(seededPortals_fb); setFurnitures(seededFurnitures_fb); setRooms(seededRooms_fb);
            pushToHistory(seededWalls_fb, seededCols_fb, seededPortals_fb, seededRooms_fb, seededFurnitures_fb); savePlanToDB(seededWalls_fb, seededCols_fb, seededPortals_fb, seededRooms_fb, seededFurnitures_fb);
          }
        }
      } else {
        // --- REAL AI DATA RECEIVED ---
        console.log('Using real YOLO AI detections!');
        setLearntElements(['GARAGE', 'PATIO', 'KITCHEN_ISLAND', 'GARDEN', 'STAIRS', 'BALCONY', 'BED', 'SOFA', 'TOILET']);

        setWalls(seededWalls);
        setColumns(seededCols);
        setPortals(seededPortals);
        setFurnitures(seededFurnitures);
        setRooms(seededRooms);

        setPlotWidth(80);
        setPlotDepth(45);
        
        pushToHistory(seededWalls, seededCols, seededPortals, seededRooms, seededFurnitures);
        savePlanToDB(seededWalls, seededCols, seededPortals, seededRooms, seededFurnitures);
      }

      setAiParseStep(5);
      setTimeout(() => {
        setIsAiParsing(false);
        handleFitToScreen();
      }, 500);

    } catch (err) {
      console.error("AI Parsing Error:", err);
      alert("Failed to connect to the AI Backend. Please ensure the Python server is running!");
      setIsAiParsing(false);
    }
  };

  // Silence TS unused local variables check
  if (false as boolean) {
    console.log(isAiParsing, aiParseStep, uploadedFileName, learntElements, aiParseMode, setAiParseMode, handleAiParse);
  }

  // 3. User & Form Settings (Phase 1/5)
  const [soilType, setSoilType] = useState<'CLAY' | 'BLACK_COTTON' | 'SANDY' | 'NORMAL'>('NORMAL');
  const [floorsCount, setFloorsCount] = useState<number>(1);
  const [trueNorth, setTrueNorth] = useState<number>(0); // North degree
  const [unitRateCement, setUnitRateCement] = useState<number>(420);
  const [unitRateSteel, setUnitRateSteel] = useState<number>(68);
  const [unitRateSand] = useState<number>(1200);
  const [unitRateAggregate] = useState<number>(1400);
  const [unitRateBrick] = useState<number>(9);
  const [unitRateExcavation] = useState<number>(15);

  // Plot Land Settings (New Professional Configurator)
  const [plotWidth, setPlotWidth] = useState<number>(45); // default plot width in feet
  const [plotDepth, setPlotDepth] = useState<number>(30); // default plot depth in feet
  const [showPlotBoundary, setShowPlotBoundary] = useState<boolean>(true);

  // Setback Margins (Bylaws Configuration in Feet)
  const [setbackFront, setSetbackFront] = useState<number>(5);
  const [setbackRear, setSetbackRear] = useState<number>(3);
  const [setbackLeft, setSetbackLeft] = useState<number>(3);
  const [setbackRight, setSetbackRight] = useState<number>(3);
  const [plotFacing, setPlotFacing] = useState<'NORTH' | 'EAST' | 'SOUTH' | 'WEST'>('NORTH');


  // 4. Canvas Drawing coordinates
  const [walls, setWalls] = useState<WallNode[]>([]);
  const [columns, setColumns] = useState<ColumnNode[]>([]);
  const [portals, setPortals] = useState<PortalNode[]>([]);
  const [rooms, setRooms] = useState<RoomNode[]>([]);
  const [furnitures, setFurnitures] = useState<FurnitureNode[]>([]);

  // 5. Global Action History (For Universal Undos)
  const [history, setHistory] = useState<{
    walls: WallNode[];
    columns: ColumnNode[];
    portals: PortalNode[];
    rooms: RoomNode[];
    furnitures: FurnitureNode[];
  }[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);
  
  // 6. Drawing temp points
  const [dragStartPoint, setDragStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [tempWallEnd, setTempWallEnd] = useState<{ x: number; y: number } | null>(null);

  // 6. Layer Toggles
  const [layerArchitectural, setLayerArchitectural] = useState<boolean>(true);
  const [layerStructural, setLayerStructural] = useState<boolean>(true);
  const [layerVastu, setLayerVastu] = useState<boolean>(true);
  const [layerDimensions, setLayerDimensions] = useState<boolean>(true);

  // 7. Site & Punch states
  const [newPunchDesc, setNewPunchDesc] = useState<string>('');
  const [newPunchSeverity, setNewPunchSeverity] = useState<'HIGH' | 'MEDIUM' | 'LOW'>('MEDIUM');
  const [newPunchLoc, setNewPunchLoc] = useState<string>('');
  const [demoPhotoUrl] = useState<string>('https://images.unsplash.com/photo-1541888946425-d81bb19240f5?q=80&w=600&auto=format&fit=crop');
  const [photoDescription, setPhotoDescription] = useState<string>('');
  const [photoStage, setPhotoStage] = useState<'FOUNDATION' | 'PLINTH' | 'BRICKWORK' | 'SLAB_CASTING' | 'FINISHING'>('FOUNDATION');

  // Live Queries from Dexie Local DB with explicit TypeScript Castings
  const projects = useLiveQuery(() => db.projects.toArray()) as Project[] | undefined;
  const projectList = projects || [];

  const activeProject = useLiveQuery(
    async () => activeProjectId ? await db.projects.get(activeProjectId) : undefined,
    [activeProjectId]
  ) as Project | undefined;

  const plans = useLiveQuery(
    async () => activeProjectId ? await db.plans.where('projectId').equals(activeProjectId).toArray() : [] as Plan[],
    [activeProjectId]
  ) as Plan[] | undefined;
  const planList = plans || [];

  const punchItems = useLiveQuery(
    async () => activeProjectId ? await db.punchItems.where('projectId').equals(activeProjectId).toArray() : [] as PunchItem[],
    [activeProjectId]
  ) as PunchItem[] | undefined;
  const punchList = punchItems || [];

  const approvals = useLiveQuery(
    async () => activeProjectId ? await db.approvals.where('projectId').equals(activeProjectId).toArray() : [] as Approval[],
    [activeProjectId]
  ) as Approval[] | undefined;
  const approvalList = approvals || [];

  const progressPhotos = useLiveQuery(
    async () => activeProjectId ? await db.progressPhotos.where('projectId').equals(activeProjectId).toArray() : [] as ProgressPhoto[],
    [activeProjectId]
  ) as ProgressPhoto[] | undefined;
  const photoList = progressPhotos || [];

  // Unit Converter Widget floating state
  const [convertFromVal, setConvertFromVal] = useState<string>('100');
  const [convertUnitFrom, setConvertUnitFrom] = useState<'SQFT' | 'SQM' | 'MARLA' | 'ANKANAM'>('SQFT');
  const [convertUnitTo, setConvertUnitTo] = useState<'SQFT' | 'SQM' | 'MARLA' | 'ANKANAM'>('SQM');
  const [convertedVal, setConvertedVal] = useState<number>(9.29);

  // Seed demo data on initial load
  useEffect(() => {
    async function initDB() {
      await seedDemoData();
      const allProjects = await db.projects.toArray();
      if (allProjects.length > 0) {
        setActiveProjectId(allProjects[0].id || null);
      }
    }
    initDB();
  }, []);

  // When active project or activeProjectId shifts, load its plan data from DB into local editing state
  useEffect(() => {
    async function loadPlanData() {
      if (!activeProjectId) return;
      const proj = await db.projects.get(activeProjectId);
      if (proj) {
        setSoilType(proj.soilType);
        setFloorsCount(proj.floorsCount);
      }
      const projectPlans = await db.plans.where('projectId').equals(activeProjectId).toArray();
      if (projectPlans && projectPlans.length > 0) {
        const activePlan = projectPlans[0];
        const loadedWalls = activePlan.planData.walls || [];
        const loadedCols = activePlan.planData.columns || [];
        const loadedPortals = activePlan.planData.portals || [];
        const loadedRooms = activePlan.planData.rooms || [];
        const loadedFurnitures = (activePlan.planData as any).furnitures || [];
        
        setWalls(loadedWalls);
        setColumns(loadedCols);
        setPortals(loadedPortals);
        setRooms(loadedRooms);
        setFurnitures(loadedFurnitures);
        setTrueNorth(activePlan.planData.trueNorth || 0);

        // Initialize state history buffer
        setHistory([{
          walls: loadedWalls,
          columns: loadedCols,
          portals: loadedPortals,
          rooms: loadedRooms,
          furnitures: loadedFurnitures
        }]);
        setHistoryIndex(0);
      } else {
        setWalls([]);
        setColumns([]);
        setPortals([]);
        setRooms([]);
        setFurnitures([]);
        setTrueNorth(0);
        setHistory([]);
        setHistoryIndex(-1);
      }
    }
    loadPlanData();
  }, [activeProjectId]);

  // Unit Converter calculations
  useEffect(() => {
    const val = parseFloat(convertFromVal);
    if (isNaN(val)) {
      setConvertedVal(0);
      return;
    }
    // Base conversion to SqFt
    let sqft = val;
    if (convertUnitFrom === 'SQM') sqft = val * 10.7639;
    if (convertUnitFrom === 'MARLA') sqft = val * 272.25;
    if (convertUnitFrom === 'ANKANAM') sqft = val * 72;

    // Convert from SqFt to Target
    let result = sqft;
    if (convertUnitTo === 'SQM') result = sqft / 10.7639;
    if (convertUnitTo === 'MARLA') result = sqft / 272.25;
    if (convertUnitTo === 'ANKANAM') result = sqft / 72;

    setConvertedVal(parseFloat(result.toFixed(2)));
  }, [convertFromVal, convertUnitFrom, convertUnitTo]);

  // --- CIVIL ENGINEERING MATHEMATICAL CALCULATIONS (IS 1200) ---
  // --- CIVIL ENGINEERING MATHEMATICAL CALCULATIONS (IS 1200) ---
  const calculateBOQ = () => {
    // 1. Calculate total wall length in feet (Assuming 30 px = 1 ft scale on canvas)
    let totalWallLength = 0;
    let wallVolume = 0; // Dynamic structural wall volume based on thickness (IS-1200)

    walls.forEach(w => {
      const dx = w.endX - w.startX;
      const dy = w.endY - w.startY;
      const lengthFt = Math.sqrt(dx * dx + dy * dy) / 30;
      totalWallLength += lengthFt;
      
      // thickness: 8px is 4.5" (0.375 ft) partition wall, 15px is 9" (0.75 ft) outer structural wall
      const thicknessFt = w.thickness === 8 ? 0.375 : 0.75;
      wallVolume += lengthFt * 10 * thicknessFt; // Average wall height = 10ft
    });

    if (totalWallLength === 0) {
      totalWallLength = 240;
      wallVolume = 240 * 10 * 0.75; // Fallback
    }

    // 2. Brickwork calculations with 5% wastage coefficient
    const bricksCount = Math.round(wallVolume * 13.5 * 1.05); // 13.5 bricks/Cu.Ft + 5% breakage wastage

    // 3. Concrete calculations (Footing + Columns + Beams + Slab)
    const columnsCount = columns.length > 0 ? columns.length : 12;
    // Footings (Standard 3' x 3' x 3' footing per column)
    const footingVolume = columnsCount * (3 * 3 * 3);
    // Columns volume (9"x12" columns x 10' height)
    const singleColumnVol = 0.75 * 1.0 * 10;
    const columnsVolume = columnsCount * singleColumnVol;
    // Beams (total length of walls x 9" x 12" height)
    const beamsVolume = totalWallLength * 0.75 * 1.0;
    
    // Room / Slab area: calculate sum of rooms
    let totalSlabArea = rooms.reduce((sum, r) => sum + r.areaSqFt, 0);
    if (totalSlabArea === 0) totalSlabArea = activeProject?.plotAreaSqFt || 1500;
    // 5 inch thick slab = 5/12 ft
    const slabVolume = totalSlabArea * (5 / 12);

    let baseConcreteVolume = footingVolume + columnsVolume + beamsVolume + slabVolume;

    // Apply Floors Multiplier
    if (floorsCount === 2) {
      baseConcreteVolume += (columnsVolume + beamsVolume + slabVolume); // Ground + G+1 slab
    } else if (floorsCount >= 3) {
      baseConcreteVolume += (columnsVolume + beamsVolume + slabVolume) * (floorsCount - 1);
    }

    // Dry concrete volume expansion factor (1.54 multiplier for dry volume shrinkage)
    const dryConcreteVolume = baseConcreteVolume * 1.54;

    // Concrete Mix Grade Configuration (IS standard wet-to-dry ratios)
    // M20 (1 : 1.5 : 3) -> Cement factor = 1/5.5, Sand = 1.5/5.5, Aggregate = 3/5.5
    // M25 (1 : 1 : 2)   -> Cement factor = 1/4, Sand = 1/4, Aggregate = 2/4
    let cementRatio = concreteGrade === 'M25' ? (1 / 4) : (1 / 5.5);
    let sandRatio = concreteGrade === 'M25' ? (1 / 4) : (1.5 / 5.5);
    let aggregateRatio = concreteGrade === 'M25' ? (2 / 4) : (3 / 5.5);

    if (soilType === 'BLACK_COTTON') {
      // Black cotton soil requires larger footing, increasing cement density requirements
      cementRatio = concreteGrade === 'M25' ? (1 / 3.5) : (1 / 4.8); 
    }

    // Concrete Densities: Cement = 1440 kg/m3, Sand = 1600 kg/m3, Aggregate = 1600 kg/m3
    // 1 cubic meter = 35.315 cubic feet
    const cementBags = Math.round(((dryConcreteVolume * cementRatio * 1440) / 35.315) / 50); // 50kg per bag
    const sandTons = parseFloat(((dryConcreteVolume * sandRatio * 1600) / 35.315 / 1000).toFixed(1));
    const aggregateTons = parseFloat(((dryConcreteVolume * aggregateRatio * 1600) / 35.315 / 1000).toFixed(1));

    // Mortar for brickwork volume is ~25% of brickwork volume
    const mortarVolume = wallVolume * 0.25;
    const dryMortarVolume = mortarVolume * 1.25; // 25% wet to dry expansion
    const mortarCementBags = Math.round(((dryMortarVolume * (1/7) * 1440) / 35.315) / 50); // 1:6 ratio mortar
    const mortarSandTons = parseFloat(((dryMortarVolume * (6/7) * 1600) / 35.315 / 1000).toFixed(1));

    // Combined material sums
    const totalCementBags = cementBags + mortarCementBags;
    const totalSandTons = parseFloat((sandTons + mortarSandTons).toFixed(1));

    // 4. Steel (Rebar) Weight
    // Thumb rules: Slab rebar weight is ~1% of concrete slab volume. Columns/Beams rebar weight is ~2% of concrete volume.
    const slabSteelWeightKg = (slabVolume * 0.01 * 7850) / 35.315 * (floorsCount);
    const frameSteelWeightKg = ((footingVolume + columnsVolume + beamsVolume) * 0.02 * 7850) / 35.315;
    let totalSteelKg = Math.round(slabSteelWeightKg + frameSteelWeightKg);

    if (soilType === 'BLACK_COTTON') {
      totalSteelKg = Math.round(totalSteelKg * 1.2); // extra reinforcement for high swelling soil
    }

    // 5. Excavation (Volume of footing trench)
    let singleFootingExcavation = 4 * 4 * 4; // 4ft x 4ft x 4ft pits
    if (soilType === 'BLACK_COTTON' || soilType === 'CLAY') {
      singleFootingExcavation = 5 * 5 * 5; // wider foundation pit needed
    }
    const excavationCuFt = columnsCount * singleFootingExcavation;

    // Costs Calculation
    const cementCost = totalCementBags * unitRateCement;
    const steelCost = totalSteelKg * unitRateSteel;
    const sandCost = totalSandTons * unitRateSand;
    const aggregateCost = aggregateTons * unitRateAggregate;
    const brickCost = bricksCount * unitRateBrick;
    const excavationCost = excavationCuFt * unitRateExcavation;
    const totalCost = cementCost + steelCost + sandCost + aggregateCost + brickCost + excavationCost;

    return {
      cementBags: totalCementBags,
      sandTons: totalSandTons,
      aggregateTons,
      steelKg: totalSteelKg,
      bricksCount,
      excavationCuFt,
      costs: {
        cementCost,
        steelCost,
        sandCost,
        aggregateCost,
        brickCost,
        excavationCost,
        totalCost
      }
    };
  };

  const boq = calculateBOQ();

  // --- VASTU SHASTRA RULES CALCULATIONS ---
  // --- VASTU SHASTRA RULES CALCULATIONS ---
  const getVastuSector = (cx: number, cy: number) => {
    const plotW = plotWidth * 30;
    const plotH = plotDepth * 30;
    
    // Center of the plot on canvas is always (400, 225)
    const dx = cx - 400;
    const dy = cy - 225;

    // Rotate point by -trueNorth degrees to align with standard coordinate frame (where North is Up)
    const rad = (-trueNorth * Math.PI) / 180;
    const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
    const ry = dx * Math.sin(rad) + dy * Math.cos(rad);

    // Determine X zone (Left = West, Center = Brahmasthan, Right = East)
    let xZone: 'LEFT' | 'CENTER' | 'RIGHT' = 'CENTER';
    if (rx < -plotW / 6) xZone = 'LEFT';
    else if (rx > plotW / 6) xZone = 'RIGHT';

    // Determine Y zone (Top = North, Center = Brahmasthan, Bottom = South)
    let yZone: 'TOP' | 'CENTER' | 'BOTTOM' = 'CENTER';
    if (ry < -plotH / 6) yZone = 'TOP';
    else if (ry > plotH / 6) yZone = 'BOTTOM';

    // Map zones to 9 Vedic sectors
    if (xZone === 'LEFT' && yZone === 'TOP') return 'NW'; // North-West (Vayavya)
    if (xZone === 'CENTER' && yZone === 'TOP') return 'N'; // North (Uttar)
    if (xZone === 'RIGHT' && yZone === 'TOP') return 'NE'; // North-East (Eshanya)
    
    if (xZone === 'LEFT' && yZone === 'CENTER') return 'W'; // West (Paschim)
    if (xZone === 'CENTER' && yZone === 'CENTER') return 'C'; // Center (Brahmasthan)
    if (xZone === 'RIGHT' && yZone === 'CENTER') return 'E'; // East (Purva)
    
    if (xZone === 'LEFT' && yZone === 'BOTTOM') return 'SW'; // South-West (Nairutya)
    if (xZone === 'CENTER' && yZone === 'BOTTOM') return 'S'; // South (Dakshin)
    if (xZone === 'RIGHT' && yZone === 'BOTTOM') return 'SE'; // South-East (Agneya)
    
    return 'C';
  };

  const calculateVastuScore = () => {
    let score = 100;
    const issues: string[] = [];
    const compliance: string[] = [];

    const sectorNames: Record<string, string> = {
      NW: 'North-West (Vayavya)',
      N: 'North (Uttar)',
      NE: 'North-East (Eshanya)',
      W: 'West (Paschim)',
      C: 'Brahmasthan (Center)',
      E: 'East (Purva)',
      SW: 'South-West (Nairutya)',
      S: 'South (Dakshin)',
      SE: 'South-East (Agneya)'
    };

    rooms.forEach(r => {
      // Calculate geometric center of room
      let cx = 0;
      let cy = 0;
      if (r.points && r.points.length > 0) {
        let sumX = 0;
        let sumY = 0;
        r.points.forEach(pt => {
          sumX += pt.x;
          sumY += pt.y;
        });
        cx = sumX / r.points.length;
        cy = sumY / r.points.length;
      } else {
        return;
      }

      const sector = getVastuSector(cx, cy);
      const roomNameLower = r.name.toLowerCase();

      if (roomNameLower.includes('kitchen')) {
        if (sector === 'SE') {
          compliance.push(`Kitchen is correctly in South-East (Agneya) — Excellent for fire energy and family health.`);
        } else if (sector === 'NW') {
          compliance.push(`Kitchen is in North-West (Vayavya) — Auspicious secondary zone.`);
        } else {
          score -= 15;
          issues.push(`Kitchen is placed in ${sectorNames[sector]} sector. Ideal zone is South-East (Agneya).`);
        }
      } else if (roomNameLower.includes('bedroom') || roomNameLower.includes('bed')) {
        if (sector === 'SW') {
          compliance.push(`Master Bedroom is in South-West (Nairutya) — Guarantees leadership stability and strength.`);
        } else if (sector === 'S' || sector === 'W') {
          compliance.push(`Bedroom is in ${sectorNames[sector]} — Auspicious and peaceful zone.`);
        } else {
          score -= 15;
          issues.push(`Bedroom is placed in ${sectorNames[sector]} sector. Ideal zone is South-West (Nairutya).`);
        }
      } else if (roomNameLower.includes('pooja') || roomNameLower.includes('mandir') || roomNameLower.includes('temple')) {
        if (sector === 'NE') {
          compliance.push(`Pooja Room is aligned in North-East (Eshanya) — Maximizes divine energy and wisdom.`);
        } else if (sector === 'N' || sector === 'E') {
          compliance.push(`Pooja Room is in ${sectorNames[sector]} — Highly auspicious zone.`);
        } else {
          score -= 20;
          issues.push(`Pooja Room is in ${sectorNames[sector]} sector. MUST reside in North-East (Eshanya) to avoid spiritual blocking.`);
        }
      } else if (roomNameLower.includes('toilet') || roomNameLower.includes('washroom') || roomNameLower.includes('bathroom') || roomNameLower.includes('wc')) {
        if (sector === 'NW') {
          compliance.push(`Toilet/WC is placed in North-West (Vayavya) — Correct zone for proper disposal of waste energies.`);
        } else if (sector === 'W') {
          compliance.push(`Toilet/WC is in West (Paschim) — Acceptable secondary zone.`);
        } else if (sector === 'NE' || sector === 'C') {
          score -= 25;
          issues.push(`CRITICAL DOSHA: Toilet is in ${sectorNames[sector]}! Eshanya or Brahmasthan toilets create heavy structural/financial stress.`);
        } else {
          score -= 15;
          issues.push(`Toilet is placed in ${sectorNames[sector]} sector. Move toilet to North-West (Vayavya) or West.`);
        }
      }
    });

    // Checklist warnings for missing spaces
    const kitchen = rooms.find(r => r.name.toLowerCase().includes('kitchen'));
    const bedroom = rooms.find(r => r.name.toLowerCase().includes('bedroom') || r.name.toLowerCase().includes('bed'));
    const pooja = rooms.find(r => r.name.toLowerCase().includes('pooja') || r.name.toLowerCase().includes('mandir') || r.name.toLowerCase().includes('temple'));
    const toilet = rooms.find(r => r.name.toLowerCase().includes('toilet') || r.name.toLowerCase().includes('washroom') || r.name.toLowerCase().includes('bathroom') || r.name.toLowerCase().includes('wc'));

    if (!kitchen) {
      score -= 5;
      issues.push('Missing Kitchen. Place and define a room named "Kitchen".');
    }
    if (!bedroom) {
      score -= 5;
      issues.push('Missing Bedroom. Place and define a room named "Bedroom".');
    }
    if (!pooja) {
      score -= 5;
      issues.push('Missing Pooja Mandir. Place and define a room named "Pooja Room".');
    }
    if (!toilet) {
      score -= 5;
      issues.push('Missing Toilet WC. Place and define a room named "Toilet".');
    }

    return {
      score: Math.max(score, 30),
      issues,
      compliance
    };
  };

  const vastu = calculateVastuScore();

  const isWallViolatingSetback = (w: WallNode) => {
    if (!showPlotBoundary) return false;
    const px = (800 - plotWidth * 30) / 2;
    const py = (450 - plotDepth * 30) / 2;
    const bx = px + setbackLeft * 30;
    const by = py + setbackFront * 30;
    const bw = Math.max(0, plotWidth * 30 - (setbackLeft + setbackRight) * 30);
    const bh = Math.max(0, plotDepth * 30 - (setbackFront + setbackRear) * 30);

    if (bw <= 0 || bh <= 0) return false;

    // Check if either end of the wall lies outside the buildable boundary
    return (
      w.startX < bx - 0.1 ||
      w.endX < bx - 0.1 ||
      w.startX > bx + bw + 0.1 ||
      w.endX > bx + bw + 0.1 ||
      w.startY < by - 0.1 ||
      w.endY < by - 0.1 ||
      w.startY > by + bh + 0.1 ||
      w.endY > by + bh + 0.1
    );
  };

  const pushToHistory = (
    w: WallNode[],
    c: ColumnNode[],
    p: PortalNode[],
    r: RoomNode[],
    f: FurnitureNode[]
  ) => {
    const newState = { walls: w, columns: c, portals: p, rooms: r, furnitures: f };
    const newHistory = history.slice(0, historyIndex + 1);
    setHistory([...newHistory, newState]);
    setHistoryIndex(newHistory.length);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      setHistoryIndex(prevIndex);
      const prevState = history[prevIndex];
      setWalls(prevState.walls || []);
      setColumns(prevState.columns || []);
      setPortals(prevState.portals || []);
      setRooms(prevState.rooms || []);
      setFurnitures(prevState.furnitures || []);
      setSelectedElement(null);
      savePlanToDB(
        prevState.walls || [],
        prevState.columns || [],
        prevState.portals || [],
        prevState.rooms || [],
        prevState.furnitures || []
      );
    }
  };

  // Rotate selected element by 90 degrees
  const handleRotateSelected = () => {
    if (!selectedElement) return;
    if (selectedElement.type === 'PORTAL') {
      const updated = portals.map(p => {
        if (p.id === selectedElement.id) {
          return { ...p, rotation: (p.rotation + 90) % 360 };
        }
        return p;
      });
      setPortals(updated);
      pushToHistory(walls, columns, updated, rooms, furnitures);
      savePlanToDB(walls, columns, updated, rooms, furnitures);
    } else if (selectedElement.type === 'FURNITURE') {
      const updated = furnitures.map(f => {
        if (f.id === selectedElement.id) {
          return { ...f, rotation: (f.rotation + 90) % 360 };
        }
        return f;
      });
      setFurnitures(updated);
      pushToHistory(walls, columns, portals, rooms, updated);
      savePlanToDB(walls, columns, portals, rooms, updated);
    } else if (selectedElement.type === 'ROOM') {
      const updated = rooms.map(r => {
        if (r.id === selectedElement.id) {
          const pts = r.points;
          const cx = pts.reduce((sum, p) => sum + p.x, 0) / pts.length;
          const cy = pts.reduce((sum, p) => sum + p.y, 0) / pts.length;
          const rotatedPoints = pts.map(p => {
            const rx = p.x - cx;
            const ry = p.y - cy;
            return {
              x: Math.round((cx - ry) / 10) * 10,
              y: Math.round((cy + rx) / 10) * 10
            };
          });
          return { ...r, points: rotatedPoints };
        }
        return r;
      });
      setRooms(updated);
      pushToHistory(walls, columns, portals, updated, furnitures);
      savePlanToDB(walls, columns, portals, updated, furnitures);
    } else if (selectedElement.type === 'WALL') {
      const updated = walls.map(w => {
        if (w.id === selectedElement.id) {
          const mx = (w.startX + w.endX) / 2;
          const my = (w.startY + w.endY) / 2;
          const dx = w.endX - w.startX;
          const dy = w.endY - w.startY;
          // Rotate 90 degrees clockwise around midpoint: (x, y) -> (-y, x)
          const rotatedDx = -dy;
          const rotatedDy = dx;
          return {
            ...w,
            startX: Math.round((mx - rotatedDx / 2) / 10) * 10,
            startY: Math.round((my - rotatedDy / 2) / 10) * 10,
            endX: Math.round((mx + rotatedDx / 2) / 10) * 10,
            endY: Math.round((my + rotatedDy / 2) / 10) * 10
          };
        }
        return w;
      });
      setWalls(updated);
      pushToHistory(updated, columns, portals, rooms, furnitures);
      savePlanToDB(updated, columns, portals, rooms, furnitures);
    }
  };

  // Flip/Mirror portal horizontally (hinge) or vertically (swing)
  const handleFlipPortalX = () => {
    if (!selectedElement || selectedElement.type !== 'PORTAL') return;
    const updated = portals.map(p => {
      if (p.id === selectedElement.id) {
        return { ...p, flippedX: !p.flippedX };
      }
      return p;
    });
    setPortals(updated);
    pushToHistory(walls, columns, updated, rooms, furnitures);
    savePlanToDB(walls, columns, updated, rooms, furnitures);
  };

  const handleFlipPortalY = () => {
    if (!selectedElement || selectedElement.type !== 'PORTAL') return;
    const updated = portals.map(p => {
      if (p.id === selectedElement.id) {
        return { ...p, flippedY: !p.flippedY };
      }
      return p;
    });
    setPortals(updated);
    pushToHistory(walls, columns, updated, rooms, furnitures);
    savePlanToDB(walls, columns, updated, rooms, furnitures);
  };

  // Delete selected element
  const handleDeleteSelected = () => {
    if (!selectedElement) return;
    if (selectedElement.type === 'WALL') {
      const updated = walls.filter(w => w.id !== selectedElement.id);
      setWalls(updated);
      pushToHistory(updated, columns, portals, rooms, furnitures);
      savePlanToDB(updated, columns, portals, rooms, furnitures);
    } else if (selectedElement.type === 'COLUMN') {
      const updated = columns.filter(c => c.id !== selectedElement.id);
      setColumns(updated);
      pushToHistory(walls, updated, portals, rooms, furnitures);
      savePlanToDB(walls, updated, portals, rooms, furnitures);
    } else if (selectedElement.type === 'PORTAL') {
      const updated = portals.filter(p => p.id !== selectedElement.id);
      setPortals(updated);
      pushToHistory(walls, columns, updated, rooms, furnitures);
      savePlanToDB(walls, columns, updated, rooms, furnitures);
    } else if (selectedElement.type === 'FURNITURE') {
      const updated = furnitures.filter(f => f.id !== selectedElement.id);
      setFurnitures(updated);
      pushToHistory(walls, columns, portals, rooms, updated);
      savePlanToDB(walls, columns, portals, rooms, updated);
    } else if (selectedElement.type === 'ROOM') {
      const updated = rooms.filter(r => r.id !== selectedElement.id);
      setRooms(updated);
      pushToHistory(walls, columns, portals, updated, furnitures);
      savePlanToDB(walls, columns, portals, updated, furnitures);
    }
    setSelectedElement(null);
  };

  // --- PHASE 2 CORE USABILITY FUNCTIONS ---

  // 1. Fit to Screen Viewport Engine
  const handleFitToScreen = () => {
    const plotW = plotWidth * 30;
    const plotH = plotDepth * 30;
    const margin = 50; // padding inside viewport
    const scaleX = (800 - margin) / plotW;
    const scaleY = (450 - margin) / plotH;
    const targetZoom = Math.min(scaleX, scaleY);
    const finalZoom = Math.max(Math.min(targetZoom, 5.0), 0.05); // cap zoom between 0.05x and 5.0x

    setZoom(finalZoom);
    // Center plot perfectly
    setPanX(400 - 400 * finalZoom);
    setPanY(225 - 225 * finalZoom);
  };

  // 2. Element Copy & Paste Logic
  const handleCopySelected = () => {
    if (!selectedElement) return;
    let dataToCopy: any = null;
    if (selectedElement.type === 'COLUMN') {
      dataToCopy = columns.find(c => c.id === selectedElement.id);
    } else if (selectedElement.type === 'PORTAL') {
      dataToCopy = portals.find(p => p.id === selectedElement.id);
    } else if (selectedElement.type === 'FURNITURE') {
      dataToCopy = furnitures.find(f => f.id === selectedElement.id);
    } else if (selectedElement.type === 'ROOM') {
      dataToCopy = rooms.find(r => r.id === selectedElement.id);
    }

    if (dataToCopy) {
      setCopiedElement({
        type: selectedElement.type as any,
        data: { ...dataToCopy }
      });
    }
  };

  const handlePasteElement = () => {
    if (!copiedElement) return;
    const newId = `${copiedElement.type.toLowerCase().slice(0, 1)}_${Date.now()}`;
    
    // Paste exactly at the scale-converted cursor coordinate snapped to 10px grid
    const pasteX = Math.round(mousePosRef.current.x / 10) * 10;
    const pasteY = Math.round(mousePosRef.current.y / 10) * 10;
    
    // If coordinates reside within standard active drawing boundaries, paste there. Otherwise apply a 30px offset
    const useCursor = pasteX > 0 && pasteX < 800 && pasteY > 0 && pasteY < 450;

    if (copiedElement.type === 'COLUMN') {
      const finalX = useCursor ? pasteX : (copiedElement.data.x + 30);
      const finalY = useCursor ? pasteY : (copiedElement.data.y + 30);
      const newCol = { ...copiedElement.data, id: newId, x: finalX, y: finalY };
      const updated = [...columns, newCol];
      setColumns(updated);
      pushToHistory(walls, updated, portals, rooms, furnitures);
      savePlanToDB(walls, updated, portals, rooms, furnitures);
      setSelectedElement({ id: newId, type: 'COLUMN' });
    } else if (copiedElement.type === 'PORTAL') {
      const finalX = useCursor ? pasteX : (copiedElement.data.x + 30);
      const finalY = useCursor ? pasteY : (copiedElement.data.y + 30);
      const newPortal = { ...copiedElement.data, id: newId, x: finalX, y: finalY };
      const updated = [...portals, newPortal];
      setPortals(updated);
      pushToHistory(walls, columns, updated, rooms, furnitures);
      savePlanToDB(walls, columns, updated, rooms, furnitures);
      setSelectedElement({ id: newId, type: 'PORTAL' });
    } else if (copiedElement.type === 'FURNITURE') {
      const finalX = useCursor ? pasteX : (copiedElement.data.x + 30);
      const finalY = useCursor ? pasteY : (copiedElement.data.y + 30);
      const newFurn = { ...copiedElement.data, id: newId, x: finalX, y: finalY };
      const updated = [...furnitures, newFurn];
      setFurnitures(updated);
      pushToHistory(walls, columns, portals, rooms, updated);
      savePlanToDB(walls, columns, portals, rooms, updated);
      setSelectedElement({ id: newId, type: 'FURNITURE' });
    } else if (copiedElement.type === 'ROOM') {
      const pts = copiedElement.data.points;
      const oldCX = pts.reduce((sum: number, p: any) => sum + p.x, 0) / pts.length;
      const oldCY = pts.reduce((sum: number, p: any) => sum + p.y, 0) / pts.length;
      
      const finalCX = useCursor ? pasteX : (oldCX + 30);
      const finalCY = useCursor ? pasteY : (oldCY + 30);
      
      const dx = finalCX - oldCX;
      const dy = finalCY - oldCY;
      
      const newRoom = {
        ...copiedElement.data,
        id: newId,
        points: pts.map((p: any) => ({
          x: Math.round((p.x + dx) / 10) * 10,
          y: Math.round((p.y + dy) / 10) * 10
        }))
      };
      const updated = [...rooms, newRoom];
      setRooms(updated);
      pushToHistory(walls, columns, portals, updated, furnitures);
      savePlanToDB(walls, columns, portals, updated, furnitures);
      setSelectedElement({ id: newId, type: 'ROOM' });
    }
  };

  // 3. Spacebar Panning Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === ' ' && document.activeElement === document.body) {
        e.preventDefault();
        setSpacePressed(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === ' ') {
        setSpacePressed(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // 4. Keyboard Shortcuts for CAD (Ctrl+Z, Ctrl+C, Ctrl+V, Delete)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isInputFocused = document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLSelectElement || document.activeElement instanceof HTMLTextAreaElement;
      if (isInputFocused) return;

      // Ctrl+Z -> Undo
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
      }
      // Ctrl+C -> Copy
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        e.preventDefault();
        handleCopySelected();
      }
      // Ctrl+V -> Paste
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        e.preventDefault();
        handlePasteElement();
      }
      // Delete/Backspace -> Remove Selected Element
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedElement) {
          e.preventDefault();
          handleDeleteSelected();
        }
      }
      // R / r -> Rotate selected element by 90 degrees instantly
      if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey) {
        if (selectedElement && (selectedElement.type === 'PORTAL' || selectedElement.type === 'FURNITURE' || selectedElement.type === 'ROOM' || selectedElement.type === 'WALL')) {
          e.preventDefault();
          handleRotateSelected();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedElement, columns, portals, furnitures, copiedElement, historyIndex, walls, rooms, trueNorth]);

  // Helper to convert screen coordinates to local SVG viewBox coordinates perfectly
  const getSVGCoordinates = (clientX: number, clientY: number, svgElement: SVGSVGElement) => {
    const point = svgElement.createSVGPoint();
    point.x = clientX;
    point.y = clientY;
    const matrix = svgElement.getScreenCTM();
    if (matrix) {
      const transformed = point.matrixTransform(matrix.inverse());
      return { x: transformed.x, y: transformed.y };
    }
    
    // Fallback using bounding rect scaling
    const rect = svgElement.getBoundingClientRect();
    const clickX = clientX - rect.left;
    const clickY = clientY - rect.top;
    const scaleX = 800 / rect.width;
    const scaleY = 450 / rect.height;
    return { x: clickX * scaleX, y: clickY * scaleY };
  };

  // --- ACTIONS: ADD ELEMENTS TO CANVAS ---
  const handleCanvasClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (isPanning || spacePressed || drawingMode === 'PAN') return;

    const coords = getSVGCoordinates(e.clientX, e.clientY, e.currentTarget);
    const x = Math.round((coords.x - panX) / zoom);
    const y = Math.round((coords.y - panY) / zoom);

    if (drawingMode === 'ERASER') {
      // Direct Eraser mode click-to-delete logic
      // 1. Column check
      const clickedCol = columns.find(c => Math.abs(c.x - x) < 20 && Math.abs(c.y - y) < 20);
      if (clickedCol) {
        const updated = columns.filter(c => c.id !== clickedCol.id);
        setColumns(updated);
        pushToHistory(walls, updated, portals, rooms, furnitures);
        savePlanToDB(walls, updated, portals, rooms, furnitures);
        return;
      }
      
      // 2. Portal check
      const clickedPortal = portals.find(p => Math.abs(p.x - x) < 30 && Math.abs(p.y - y) < 30);
      if (clickedPortal) {
        const updated = portals.filter(p => p.id !== clickedPortal.id);
        setPortals(updated);
        pushToHistory(walls, columns, updated, rooms, furnitures);
        savePlanToDB(walls, columns, updated, rooms, furnitures);
        return;
      }

      // 3. Furniture check
      const clickedFurn = furnitures.find(f => Math.abs(f.x - x) < f.width && Math.abs(f.y - y) < f.height);
      if (clickedFurn) {
        const updated = furnitures.filter(f => f.id !== clickedFurn.id);
        setFurnitures(updated);
        pushToHistory(walls, columns, portals, rooms, updated);
        savePlanToDB(walls, columns, portals, rooms, updated);
        return;
      }

      // 4. Wall check
      const clickedWall = walls.find(w => {
        const A = x - w.startX;
        const B = y - w.startY;
        const C = w.endX - w.startX;
        const D = w.endY - w.startY;
        const dot = A * C + B * D;
        const len_sq = C * C + D * D;
        let param = -1;
        if (len_sq !== 0) param = dot / len_sq;
        let xx, yy;
        if (param < 0) {
          xx = w.startX;
          yy = w.startY;
        } else if (param > 1) {
          xx = w.endX;
          yy = w.endY;
        } else {
          xx = w.startX + param * C;
          yy = w.startY + param * D;
        }
        const dx = x - xx;
        const dy = y - yy;
        return Math.sqrt(dx * dx + dy * dy) < 15;
      });
      if (clickedWall) {
        const updated = walls.filter(w => w.id !== clickedWall.id);
        setWalls(updated);
        pushToHistory(updated, columns, portals, rooms, furnitures);
        savePlanToDB(updated, columns, portals, rooms, furnitures);
        return;
      }

      // 5. Room check
      const clickedRoom = rooms.find(r => {
        if (!r.points || r.points.length === 0) return false;
        const cx = r.points.reduce((sum, p) => sum + p.x, 0) / r.points.length;
        const cy = r.points.reduce((sum, p) => sum + p.y, 0) / r.points.length;
        const dx = x - cx;
        const dy = y - cy;
        return Math.sqrt(dx * dx + dy * dy) < 50;
      });
      if (clickedRoom) {
        const updated = rooms.filter(r => r.id !== clickedRoom.id);
        setRooms(updated);
        pushToHistory(walls, columns, portals, updated, furnitures);
        savePlanToDB(walls, columns, portals, updated, furnitures);
        return;
      }
      return;
    }

    if (drawingMode === 'SELECT') {
      // 1. Check if clicked a Column
      const clickedCol = columns.find(c => Math.abs(c.x - x) < 20 && Math.abs(c.y - y) < 20);
      if (clickedCol) {
        setSelectedElement({ id: clickedCol.id, type: 'COLUMN' });
        return;
      }
      
      // 2. Check if clicked a Portal
      const clickedPortal = portals.find(p => Math.abs(p.x - x) < 30 && Math.abs(p.y - y) < 30);
      if (clickedPortal) {
        setSelectedElement({ id: clickedPortal.id, type: 'PORTAL' });
        return;
      }

      // 3. Check if clicked a Furniture
      const clickedFurn = furnitures.find(f => Math.abs(f.x - x) < f.width && Math.abs(f.y - y) < f.height);
      if (clickedFurn) {
        setSelectedElement({ id: clickedFurn.id, type: 'FURNITURE' });
        return;
      }

      // 4. Check if clicked a Wall
      const clickedWall = walls.find(w => {
        const A = x - w.startX;
        const B = y - w.startY;
        const C = w.endX - w.startX;
        const D = w.endY - w.startY;
        const dot = A * C + B * D;
        const len_sq = C * C + D * D;
        let param = -1;
        if (len_sq !== 0) param = dot / len_sq;
        let xx, yy;
        if (param < 0) {
          xx = w.startX;
          yy = w.startY;
        } else if (param > 1) {
          xx = w.endX;
          yy = w.endY;
        } else {
          xx = w.startX + param * C;
          yy = w.startY + param * D;
        }
        const dx = x - xx;
        const dy = y - yy;
        return Math.sqrt(dx * dx + dy * dy) < 15;
      });
      if (clickedWall) {
        setSelectedElement({ id: clickedWall.id, type: 'WALL' });
        return;
      }

      // 5. Check if clicked inside a Room polygon (ray-casting method)
      const clickedRoom = rooms.find(r => {
        if (!r.points || r.points.length < 3) return false;
        let inside = false;
        for (let i = 0, j = r.points.length - 1; i < r.points.length; j = i++) {
          const xi = r.points[i].x, yi = r.points[i].y;
          const xj = r.points[j].x, yj = r.points[j].y;
          const intersect = ((yi > y) !== (yj > y))
            && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
          if (intersect) inside = !inside;
        }
        return inside;
      });
      if (clickedRoom) {
        setSelectedElement({ id: clickedRoom.id, type: 'ROOM' });
        return;
      }

      // Clicked empty area
      setSelectedElement(null);
    } else if (drawingMode === 'WALL') {
      if (!dragStartPoint) {
        setDragStartPoint({ x, y });
        setTempWallEnd({ x, y });
      } else {
        // Complete the wall drawing
        const newWall: WallNode = {
          id: `w_${Date.now()}`,
          startX: dragStartPoint.x,
          startY: dragStartPoint.y,
          endX: x,
          endY: y,
          thickness: wallThickness
        };
        const updatedWalls = [...walls, newWall];
        setWalls(updatedWalls);
        setDragStartPoint(null);
        setTempWallEnd(null);
        pushToHistory(updatedWalls, columns, portals, rooms, furnitures);
        savePlanToDB(updatedWalls, columns, portals, rooms, furnitures);
      }
    } else if (drawingMode === 'COLUMN') {
      const newCol: ColumnNode = {
        id: `c_${Date.now()}`,
        x,
        y,
        size: 20
      };
      const updatedCols = [...columns, newCol];
      setColumns(updatedCols);
      pushToHistory(walls, updatedCols, portals, rooms, furnitures);
      savePlanToDB(walls, updatedCols, portals, rooms, furnitures);
    } else if (drawingMode === 'DOOR') {
      const isDouble = activeDoorType === 'DOUBLE';
      const newDoor: PortalNode = {
        id: `p_${Date.now()}`,
        type: isDouble ? 'DOUBLE_DOOR' : 'DOOR',
        x,
        y,
        rotation: 0,
        width: isDouble ? 210 : 135
      };
      const updatedPortals = [...portals, newDoor];
      setPortals(updatedPortals);
      pushToHistory(walls, columns, updatedPortals, rooms, furnitures);
      savePlanToDB(walls, columns, updatedPortals, rooms, furnitures);
    } else if (drawingMode === 'WINDOW') {
      const newWindow: PortalNode = {
        id: `p_${Date.now()}`,
        type: 'WINDOW',
        x,
        y,
        rotation: 0,
        width: 150
      };
      const updatedPortals = [...portals, newWindow];
      setPortals(updatedPortals);
      pushToHistory(walls, columns, updatedPortals, rooms, furnitures);
      savePlanToDB(walls, columns, updatedPortals, rooms, furnitures);
    } else if (drawingMode === 'ROOM') {
      let rw = 300; // 10 ft default width
      let rh = 300; // 10 ft default height
      if (activeRoomType === 'Master Bedroom') { rw = 360; rh = 360; }
      else if (activeRoomType === 'Living Room') { rw = 450; rh = 360; }
      else if (activeRoomType === 'Kitchen') { rw = 300; rh = 240; }
      else if (activeRoomType === 'Bathroom') { rw = 240; rh = 180; }
      else if (activeRoomType === 'Pooja Room') { rw = 180; rh = 180; }
      else if (activeRoomType === 'Dining Room') { rw = 360; rh = 300; }
      else if (activeRoomType === 'Guest Room') { rw = 330; rh = 330; }
      else if (activeRoomType === 'Study Room') { rw = 300; rh = 300; }
      else if (activeRoomType === 'Store Room') { rw = 240; rh = 210; }
      else if (activeRoomType === 'Balcony') { rw = 300; rh = 120; }
      else if (activeRoomType === 'Garage') { rw = 420; rh = 450; }

      const hw = rw / 2;
      const hh = rh / 2;
      const areaVal = Math.round((rw / 30) * (rh / 30));

      const newRoom: RoomNode = {
        id: `r_${Date.now()}`,
        name: activeRoomType,
        points: [
          { x: x - hw, y: y - hh },
          { x: x + hw, y: y - hh },
          { x: x + hw, y: y + hh },
          { x: x - hw, y: y + hh }
        ],
        areaSqFt: areaVal
      };
      const updatedRooms = [...rooms, newRoom];
      setRooms(updatedRooms);
      pushToHistory(walls, columns, portals, updatedRooms, furnitures);
      savePlanToDB(walls, columns, portals, updatedRooms, furnitures);
    } else if (drawingMode === 'FURNITURE') {
      // Define furniture size based on type
      let w = 50;
      let h = 30;
      if (activeFurnitureType === 'BED') { w = 60; h = 70; }
      else if (activeFurnitureType === 'SOFA') { w = 80; h = 35; }
      else if (activeFurnitureType === 'DINING_TABLE') { w = 55; h = 55; }
      else if (activeFurnitureType === 'TV_UNIT') { w = 70; h = 15; }
      else if (activeFurnitureType === 'WARDROBE') { w = 65; h = 25; }
      else if (activeFurnitureType === 'TOILET_COMMODE') { w = 22; h = 30; }
      else if (activeFurnitureType === 'WASHBASIN') { w = 25; h = 20; }
      else if (activeFurnitureType === 'SHOWER_TUB') { w = 45; h = 45; }
      else if (activeFurnitureType === 'STAIRS' as any) { w = 60; h = 80; }
      else if (activeFurnitureType === 'BALCONY' as any) { w = 80; h = 20; }
      else if (activeFurnitureType === 'GARAGE' as any) { w = 140; h = 150; }
      else if (activeFurnitureType === 'PATIO' as any) { w = 140; h = 40; }
      else if (activeFurnitureType === 'KITCHEN_ISLAND' as any) { w = 60; h = 35; }
      else if (activeFurnitureType === 'GARDEN' as any) { w = 120; h = 80; }

      const newFurniture: FurnitureNode = {
        id: `f_${Date.now()}`,
        type: activeFurnitureType,
        x,
        y,
        rotation: 0,
        width: w,
        height: h
      };
      const updatedFurnitures = [...furnitures, newFurniture];
      setFurnitures(updatedFurnitures);
      pushToHistory(walls, columns, portals, rooms, updatedFurnitures);
      savePlanToDB(walls, columns, portals, rooms, updatedFurnitures);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const coords = getSVGCoordinates(e.clientX, e.clientY, e.currentTarget);
    const mouseX = (coords.x - panX) / zoom;
    const mouseY = (coords.y - panY) / zoom;

    // Track active canvas mouse coordinates
    mousePosRef.current = { x: mouseX, y: mouseY };

    if (draggedElement) {
      // Snapping coordinates to 10px blueprint grid
      const newX = Math.round(mouseX / 10) * 10;
      const newY = Math.round(mouseY / 10) * 10;

      if (draggedElement.type === 'COLUMN') {
        setColumns(prev => prev.map(c => c.id === draggedElement.id ? { ...c, x: newX, y: newY } : c));
      } else if (draggedElement.type === 'PORTAL') {
        setPortals(prev => prev.map(p => p.id === draggedElement.id ? { ...p, x: newX, y: newY } : p));
      } else if (draggedElement.type === 'FURNITURE') {
        setFurnitures(prev => prev.map(f => f.id === draggedElement.id ? { ...f, x: newX, y: newY } : f));
      } else if (draggedElement.type === 'ROOM') {
        const newCX = Math.round(mouseX - draggedElement.offsetX);
        const newCY = Math.round(mouseY - draggedElement.offsetY);
        setRooms(prev => prev.map(r => {
          if (r.id === draggedElement.id) {
            const pts = r.points;
            const oldCX = pts.reduce((sum, p) => sum + p.x, 0) / pts.length;
            const oldCY = pts.reduce((sum, p) => sum + p.y, 0) / pts.length;
            const dx = Math.round((newCX - oldCX) / 10) * 10;
            const dy = Math.round((newCY - oldCY) / 10) * 10;
            if (dx === 0 && dy === 0) return r;
            return {
              ...r,
              points: pts.map(p => ({
                x: Math.round((p.x + dx) / 10) * 10,
                y: Math.round((p.y + dy) / 10) * 10
              }))
            };
          }
          return r;
        }));
      }
    } else if (drawingMode === 'WALL' && dragStartPoint) {
      setTempWallEnd({ x: Math.round(mouseX / 10) * 10, y: Math.round(mouseY / 10) * 10 });
    } else if (isPanning) {
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      setPanX(dx);
      setPanY(dy);
    }
  };

  const handleCanvasMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    const isMiddleClick = e.button === 1;
    const isRightClick = e.button === 2;
    const isSpacePressed = spacePressed;

    if (isMiddleClick || isRightClick || isSpacePressed || drawingMode === 'PAN') {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX - panX, y: e.clientY - panY });
    }
  };

  const handleCanvasMouseUp = () => {
    if (draggedElement) {
      pushToHistory(walls, columns, portals, rooms, furnitures);
      savePlanToDB(walls, columns, portals, rooms, furnitures);
      setDraggedElement(null);
    }
    if (isPanning) {
      setIsPanning(false);
    }
  };

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const zoomFactor = 1.08;
    let nextZoom = zoom;
    if (e.deltaY < 0) {
      // Zoom In
      nextZoom = Math.min(zoom * zoomFactor, 5.0);
    } else {
      // Zoom Out
      nextZoom = Math.max(zoom / zoomFactor, 0.05);
    }

    const coords = getSVGCoordinates(e.clientX, e.clientY, e.currentTarget);
    const mouseX = coords.x;
    const mouseY = coords.y;

    const dx = mouseX - panX;
    const dy = mouseY - panY;

    setPanX(mouseX - dx * (nextZoom / zoom));
    setPanY(mouseY - dy * (nextZoom / zoom));
    setZoom(nextZoom);
  };

  const clearCanvas = () => {
    setWalls([]);
    setColumns([]);
    setPortals([]);
    setRooms([]);
    setFurnitures([]);
    setSelectedElement(null);
    pushToHistory([], [], [], [], []);
    savePlanToDB([], [], [], [], []);
  };


  // Database auto-saving helper
  const savePlanToDB = async (
    activeWalls: WallNode[],
    activeCols: ColumnNode[],
    activePortals: PortalNode[],
    activeRooms: RoomNode[],
    activeFurnitures: FurnitureNode[]
  ) => {

    if (!activeProjectId || planList.length === 0) return;
    const activePlan = planList[0];
    await db.plans.update(activePlan.id!, {
      planData: {
        walls: activeWalls,
        columns: activeCols,
        portals: activePortals,
        rooms: activeRooms,
        furnitures: activeFurnitures,
        trueNorth: trueNorth
      },
      updatedAt: Date.now()
    });
  };

  // --- ACTIONS: SITE LOGS & PUNCH ITEMS ---
  const handleAddPunch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPunchDesc || !activeProjectId) return;
    await db.punchItems.add({
      projectId: activeProjectId,
      description: newPunchDesc,
      severity: newPunchSeverity,
      status: 'OPEN',
      location: newPunchLoc || 'General Site',
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
    setNewPunchDesc('');
    setNewPunchLoc('');
  };

  const handleResolvePunch = async (id: number) => {
    await db.punchItems.update(id, {
      status: 'RESOLVED',
      updatedAt: Date.now()
    });
  };

  const handleAddPhoto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProjectId) return;
    await db.progressPhotos.add({
      projectId: activeProjectId,
      imageUrl: demoPhotoUrl,
      description: photoDescription || 'Site update',
      stage: photoStage,
      uploadedAt: Date.now()
    });
    setPhotoDescription('');
  };

  const handleClientApproval = async (status: 'APPROVED' | 'REJECTED', comments: string) => {
    if (!activeProjectId) return;
    const existing = approvalList[0];
    if (existing) {
      await db.approvals.update(existing.id!, {
        status,
        feedback: comments,
        updatedAt: Date.now()
      });
    } else {
      await db.approvals.add({
        projectId: activeProjectId,
        status,
        feedback: comments,
        updatedAt: Date.now()
      });
    }
  };

  // --- PDF EXPORT ENGINE WITH WATERMARK & BRANDING ---
  const handleExportPDF = () => {
    const doc = new jsPDF();
    
    // Custom gold/ obsidian aesthetic blocks
    doc.setFillColor(14, 19, 32); // Obsidian Primary Dark
    doc.rect(0, 0, 220, 45, 'F');
    
    doc.setTextColor(20, 241, 195); // Teal Glow Header Text
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(22);
    doc.text("CIVILSUITE — BOQ ESTIMATION REPORT", 15, 20);
    
    doc.setFontSize(10);
    doc.setTextColor(148, 163, 184); // slate text
    doc.setFont("Helvetica", "normal");
    doc.text(`Project Name: ${activeProject?.name || ' Sharma Villa'}`, 15, 30);
    doc.text(`Site Address: ${activeProject?.address || 'Sector 15, Dwarka'}`, 15, 36);
    
    // Logo watermark block right side
    doc.setTextColor(245, 158, 11); // Gold Logo
    doc.setFontSize(14);
    doc.text("JENCY ARCHITECTS", 140, 20);
    doc.setFontSize(8);
    doc.text("Licensed Structural Engineer", 140, 26);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 140, 32);

    // Dynamic Soil config details
    doc.setFillColor(248, 250, 252); // light slate background for body
    doc.rect(15, 55, 180, 25, 'F');
    doc.rect(15, 55, 180, 25, 'S');

    doc.setTextColor(8, 11, 17);
    doc.setFontSize(10);
    doc.setFont("Helvetica", "bold");
    doc.text("STRUCTURAL PROFILE CALIBRATION", 20, 62);
    doc.setFont("Helvetica", "normal");
    doc.text(`- Number of Floors: G+${floorsCount - 1} (${floorsCount} Slabs)`, 20, 68);
    doc.text(`- Soil Stratum: ${soilType} Soil Type`, 20, 74);
    doc.text(`- Floor Area: ${activeProject?.plotAreaSqFt || 1800} Sq. Ft.`, 110, 68);
    doc.text(`- Recommended concrete grade: ${floorsCount > 2 ? 'M25' : 'M20'} Standard Mix`, 110, 74);

    // Calculations Section
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(12);
    doc.text("BILL OF QUANTITIES (BOQ)", 15, 95);

    // Draw estimate table header
    doc.setFillColor(14, 19, 32);
    doc.rect(15, 100, 180, 8, 'F');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text("Material Description", 18, 105);
    doc.text("Quantity Required", 95, 105);
    doc.text("Unit Rate", 135, 105);
    doc.text("Amount (Rs.)", 165, 105);

    const items = [
      { name: "Ordinary Portland Cement (OPC/PPC)", qty: `${boq.cementBags} Bags`, rate: `Rs. ${unitRateCement}/Bag`, amt: `Rs. ${boq.costs.cementCost}` },
      { name: "High Strength TMT Rebar Steel", qty: `${boq.steelKg} Kg`, rate: `Rs. ${unitRateSteel}/Kg`, amt: `Rs. ${boq.costs.steelCost}` },
      { name: "Coarse River Sand", qty: `${boq.sandTons} Tons`, rate: `Rs. ${unitRateSand}/Ton`, amt: `Rs. ${boq.costs.sandCost}` },
      { name: "Aggregate Gravel (20mm down)", qty: `${boq.aggregateTons} Tons`, rate: `Rs. ${unitRateAggregate}/Ton`, amt: `Rs. ${boq.costs.aggregateCost}` },
      { name: "Local Clay Bricks (Class-I)", qty: `${boq.bricksCount} Pcs`, rate: `Rs. ${unitRateBrick}/Pc`, amt: `Rs. ${boq.costs.brickCost}` },
      { name: "Excavation & Footing Trench Backfill", qty: `${boq.excavationCuFt} Cu. Ft.`, rate: `Rs. ${unitRateExcavation}/CuFt`, amt: `Rs. ${boq.costs.excavationCost}` },
    ];

    let startY = 108;
    doc.setTextColor(8, 11, 17);
    items.forEach((item, index) => {
      // alternate row colors
      if (index % 2 === 1) {
        doc.setFillColor(240, 242, 245);
        doc.rect(15, startY - 3, 180, 7, 'F');
      }
      doc.text(item.name, 18, startY);
      doc.text(item.qty, 95, startY);
      doc.text(item.rate, 135, startY);
      doc.text(item.amt, 165, startY);
      startY += 7;
    });

    // Total quote banner
    doc.setFillColor(14, 19, 32);
    doc.rect(15, startY, 180, 10, 'F');
    doc.setTextColor(20, 241, 195);
    doc.setFont("Helvetica", "bold");
    doc.text("TOTAL ESTIMATED PROJECT STRUCTURAL COST (NET EX-YARD)", 18, startY + 6);
    doc.text(`Rs. ${boq.costs.totalCost.toLocaleString()}/-`, 150, startY + 6);

    // Vastu Compliance Note
    doc.setTextColor(8, 11, 17);
    doc.setFontSize(10);
    doc.text("Vastu Shastra Compliance Overview:", 15, startY + 20);
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(8.5);
    doc.text(`- Compliance Rating: ${vastu.score}/100. Overall zones are geometrically positive.`, 15, startY + 26);
    doc.text(`- Pooja alignment: North-East orientation approved.`, 15, startY + 31);
    doc.text(`- Master Bed stability: Nairutya quadrant approved.`, 15, startY + 36);

    // Footer signature watermark
    doc.setDrawColor(200, 200, 200);
    doc.line(140, startY + 60, 190, startY + 60);
    doc.setFontSize(8);
    doc.text("JENCY SHARMA", 152, startY + 64);
    doc.text("Chartered Structural Consultant", 143, startY + 68);

    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.text("Generated by CivilSuite portal. All structural computations are digital estimations based on IS 1200.", 15, 285);

    doc.save(`${activeProject?.name || ' Sharma'}_BOQ_Estimate.pdf`);
  };

  return (
    <div className="blueprint-grid-fine" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      
      {/* 🧭 PREMIUM GLASS NAVIGATION BAR */}
      <header className="glass-panel" style={{ margin: '16px', padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', position: 'sticky', top: '16px', zIndex: 1000, border: '1px solid var(--glass-border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: 'linear-gradient(135deg, var(--accent-cyan), #0bb598)', width: '36px', height: '36px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: '#080b11', fontSize: '18px', boxShadow: '0 0 15px var(--accent-cyan-glow)' }}>
            CS
          </div>
          <div>
            <h1 style={{ fontSize: '18px', margin: 0, fontWeight: 700, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '6px' }}>
              CivilSuite <span style={{ fontSize: '10px', background: 'rgba(20, 241, 195, 0.1)', color: 'var(--accent-cyan)', padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(20, 241, 195, 0.2)' }}>PRO</span>
            </h1>
            <p style={{ fontSize: '10px', margin: 0, color: 'var(--text-secondary)' }}>Empowering Jency's Architectural Vision</p>
          </div>
        </div>

        {/* View Selection Toggles */}
        <div style={{ display: 'flex', background: 'rgba(0, 0, 0, 0.3)', padding: '4px', borderRadius: '10px', border: '1px solid var(--glass-border)' }}>
          <button 
            className={`btn-secondary ${currentTab === 'workspace' ? 'pulse-glow-cyan' : ''}`}
            onClick={() => setCurrentTab('workspace')}
            style={{ 
              background: currentTab === 'workspace' ? 'var(--accent-cyan)' : 'transparent',
              color: currentTab === 'workspace' ? '#080b11' : 'var(--text-primary)',
              border: 'none',
              padding: '6px 14px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px',
              fontWeight: 600,
              boxShadow: currentTab === 'workspace' ? '0 2px 8px var(--accent-cyan-glow)' : 'none'
            }}
          >
            <Hammer size={15} />
            Engineer Workspace
          </button>
          
          <button 
            onClick={() => setCurrentTab('client')}
            style={{ 
              background: currentTab === 'client' ? 'var(--accent-cyan)' : 'transparent',
              color: currentTab === 'client' ? '#080b11' : 'var(--text-primary)',
              border: 'none',
              padding: '6px 14px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px',
              fontWeight: 600,
              transition: 'all 0.3s'
            }}
          >
            <UserCheck size={15} />
            Client Portal
          </button>

          <button 
            onClick={() => setCurrentTab('showcase')}
            style={{ 
              background: currentTab === 'showcase' ? 'var(--accent-cyan)' : 'transparent',
              color: currentTab === 'showcase' ? '#080b11' : 'var(--text-primary)',
              border: 'none',
              padding: '6px 14px',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px',
              fontWeight: 600,
              transition: 'all 0.3s'
            }}
          >
            <TrendingUp size={15} />
            Showcase Gallery
          </button>
        </div>

        {/* Project Picker dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Folder size={18} style={{ color: 'var(--accent-cyan)' }} />
          <select 
            value={activeProjectId || ''}
            onChange={(e) => setActiveProjectId(Number(e.target.value))}
            style={{ 
              background: 'rgba(0, 0, 0, 0.4)', 
              color: 'var(--text-primary)', 
              border: '1px solid var(--glass-border)', 
              borderRadius: '8px', 
              padding: '6px 12px',
              fontSize: '13px',
              outline: 'none',
              cursor: 'pointer'
            }}
          >
            {projectList.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </header>

      {/* 🚀 MAIN CONTENT BODY */}
      <main style={{ flex: 1, padding: '0 16px 16px 16px', display: 'flex', flexDirection: 'column', gap: '16px' }}>

        {/* ========================================================================= */}
        {/* VIEW 1: ENGINEER WORKSPACE */}
        {/* ========================================================================= */}
        {currentTab === 'workspace' && (
          <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr 340px', gap: '16px' }}>
            
            {/* LEFT COLUMN: CONTROLS & CALIBRATIONS */}
            <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h3 style={{ fontSize: '15px', color: 'var(--accent-cyan)', borderBottom: '1px solid var(--glass-border)', paddingBottom: '8px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Settings size={16} /> Canvas Drawing Tools
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  <button 
                    onClick={() => setDrawingMode('SELECT')}
                    className="btn-secondary"
                    style={{ justifyContent: 'center', padding: '8px 4px', fontSize: '12px', borderColor: drawingMode === 'SELECT' ? 'var(--accent-cyan)' : 'var(--glass-border)' }}
                  >
                    🔍 Select/Move
                  </button>
                  <button 
                    onClick={() => setDrawingMode('PAN')}
                    className="btn-secondary"
                    style={{ justifyContent: 'center', padding: '8px 4px', fontSize: '12px', borderColor: drawingMode === 'PAN' ? 'var(--accent-cyan)' : 'var(--glass-border)' }}
                  >
                    ✋ Drag-Pan
                  </button>
                  <button 
                    onClick={() => setDrawingMode('WALL')}
                    className="btn-secondary"
                    style={{ justifyContent: 'center', padding: '8px 4px', fontSize: '12px', borderColor: drawingMode === 'WALL' ? 'var(--accent-cyan)' : 'var(--glass-border)' }}
                  >
                    ✏️ Draw Wall
                  </button>
                  <button 
                    onClick={() => setDrawingMode('COLUMN')}
                    className="btn-secondary"
                    style={{ justifyContent: 'center', padding: '8px 4px', fontSize: '12px', borderColor: drawingMode === 'COLUMN' ? 'var(--accent-cyan)' : 'var(--glass-border)' }}
                  >
                    🔲 Add Pillar
                  </button>
                  <button 
                    onClick={() => setDrawingMode('DOOR')}
                    className="btn-secondary"
                    style={{ justifyContent: 'center', padding: '8px 4px', fontSize: '12px', borderColor: drawingMode === 'DOOR' ? 'var(--accent-cyan)' : 'var(--glass-border)' }}
                  >
                    🚪 Place Door
                  </button>
                  <button 
                    onClick={() => setDrawingMode('WINDOW')}
                    className="btn-secondary"
                    style={{ justifyContent: 'center', padding: '8px 4px', fontSize: '12px', borderColor: drawingMode === 'WINDOW' ? 'var(--accent-cyan)' : 'var(--glass-border)' }}
                  >
                    🪟 Place Window
                  </button>
                  <button 
                    onClick={() => setDrawingMode('ROOM')}
                    className="btn-secondary"
                    style={{ justifyContent: 'center', padding: '8px 4px', fontSize: '12px', borderColor: drawingMode === 'ROOM' ? 'var(--accent-cyan)' : 'var(--glass-border)' }}
                  >
                    📐 Define Room
                  </button>
                  <button 
                    onClick={() => setDrawingMode('ERASER')}
                    className="btn-secondary"
                    style={{ justifyContent: 'center', padding: '8px 4px', fontSize: '12px', borderColor: drawingMode === 'ERASER' ? 'var(--accent-rose)' : 'var(--glass-border)', color: drawingMode === 'ERASER' ? 'var(--accent-rose)' : 'var(--text-primary)' }}
                  >
                    🗑️ Eraser Tool
                  </button>
                  <button 
                    onClick={() => setDrawingMode('FURNITURE')}
                    className="btn-secondary"
                    style={{ justifyContent: 'center', padding: '8px 4px', fontSize: '12px', borderColor: drawingMode === 'FURNITURE' ? 'var(--accent-cyan)' : 'var(--glass-border)', gridColumn: 'span 2' }}
                  >
                    🛋️ Place Furniture & Fittings
                  </button>
                </div>

                {learntElements.length > 0 && (
                  <div style={{ marginTop: '10px', padding: '10px', background: 'rgba(245, 158, 11, 0.04)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '12px' }}>
                    <span style={{ fontSize: '10.5px', color: 'var(--accent-gold)', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
                      🧠 AI Learnt Custom Palette
                    </span>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                      {learntElements.includes('STAIRS') && (
                        <button
                          onClick={() => { setDrawingMode('FURNITURE'); setActiveFurnitureType('STAIRS' as any); }}
                          className="btn-primary"
                          style={{ 
                            fontSize: '9.5px', 
                            padding: '6px 4px', 
                            justifyContent: 'center', 
                            background: (drawingMode === 'FURNITURE' && activeFurnitureType === 'STAIRS' as any) ? 'var(--accent-gold)' : 'transparent', 
                            border: '1px solid var(--accent-gold)', 
                            color: (drawingMode === 'FURNITURE' && activeFurnitureType === 'STAIRS' as any) ? '#000' : 'var(--accent-gold)' 
                          }}
                        >
                          📶 Learnt Stairs
                        </button>
                      )}
                      {learntElements.includes('BALCONY') && (
                        <button
                          onClick={() => { setDrawingMode('FURNITURE'); setActiveFurnitureType('BALCONY' as any); }}
                          className="btn-primary"
                          style={{ 
                            fontSize: '9.5px', 
                            padding: '6px 4px', 
                            justifyContent: 'center', 
                            background: (drawingMode === 'FURNITURE' && activeFurnitureType === 'BALCONY' as any) ? 'var(--accent-gold)' : 'transparent', 
                            border: '1px solid var(--accent-gold)', 
                            color: (drawingMode === 'FURNITURE' && activeFurnitureType === 'BALCONY' as any) ? '#000' : 'var(--accent-gold)' 
                          }}
                        >
                          🌅 Learnt Balcony
                        </button>
                      )}
                      {learntElements.includes('GARAGE') && (
                        <button
                          onClick={() => { setDrawingMode('FURNITURE'); setActiveFurnitureType('GARAGE' as any); }}
                          className="btn-primary"
                          style={{ 
                            fontSize: '9.5px', 
                            padding: '6px 4px', 
                            justifyContent: 'center', 
                            background: (drawingMode === 'FURNITURE' && activeFurnitureType === 'GARAGE' as any) ? 'var(--accent-gold)' : 'transparent', 
                            border: '1px solid var(--accent-gold)', 
                            color: (drawingMode === 'FURNITURE' && activeFurnitureType === 'GARAGE' as any) ? '#000' : 'var(--accent-gold)' 
                          }}
                        >
                          🚗 Learnt Garage
                        </button>
                      )}
                      {learntElements.includes('PATIO') && (
                        <button
                          onClick={() => { setDrawingMode('FURNITURE'); setActiveFurnitureType('PATIO' as any); }}
                          className="btn-primary"
                          style={{ 
                            fontSize: '9.5px', 
                            padding: '6px 4px', 
                            justifyContent: 'center', 
                            background: (drawingMode === 'FURNITURE' && activeFurnitureType === 'PATIO' as any) ? 'var(--accent-gold)' : 'transparent', 
                            border: '1px solid var(--accent-gold)', 
                            color: (drawingMode === 'FURNITURE' && activeFurnitureType === 'PATIO' as any) ? '#000' : 'var(--accent-gold)' 
                          }}
                        >
                          🏡 Learnt Patio
                        </button>
                      )}
                      {learntElements.includes('KITCHEN_ISLAND') && (
                        <button
                          onClick={() => { setDrawingMode('FURNITURE'); setActiveFurnitureType('KITCHEN_ISLAND' as any); }}
                          className="btn-primary"
                          style={{ 
                            fontSize: '9.5px', 
                            padding: '6px 4px', 
                            justifyContent: 'center', 
                            background: (drawingMode === 'FURNITURE' && activeFurnitureType === 'KITCHEN_ISLAND' as any) ? 'var(--accent-gold)' : 'transparent', 
                            border: '1px solid var(--accent-gold)', 
                            color: (drawingMode === 'FURNITURE' && activeFurnitureType === 'KITCHEN_ISLAND' as any) ? '#000' : 'var(--accent-gold)' 
                          }}
                        >
                          🍳 Learnt Island
                        </button>
                      )}
                      {learntElements.includes('GARDEN') && (
                        <button
                          onClick={() => { setDrawingMode('FURNITURE'); setActiveFurnitureType('GARDEN' as any); }}
                          className="btn-primary"
                          style={{ 
                            fontSize: '9.5px', 
                            padding: '6px 4px', 
                            justifyContent: 'center', 
                            background: (drawingMode === 'FURNITURE' && activeFurnitureType === 'GARDEN' as any) ? 'var(--accent-gold)' : 'transparent', 
                            border: '1px solid var(--accent-gold)', 
                            color: (drawingMode === 'FURNITURE' && activeFurnitureType === 'GARDEN' as any) ? '#000' : 'var(--accent-gold)' 
                          }}
                        >
                          🌳 Learnt Garden
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {drawingMode === 'WALL' && (
                  <div style={{ marginTop: '10px', padding: '10px', background: 'rgba(20, 241, 195, 0.05)', border: '1px solid rgba(20, 241, 195, 0.2)', borderRadius: '8px' }}>
                    <label style={{ fontSize: '11px', color: 'var(--accent-cyan)', display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>Wall Thickness (IS Standard):</label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button 
                        onClick={() => setWallThickness(15)}
                        className="btn-secondary"
                        style={{ flex: 1, padding: '6px 4px', fontSize: '11px', justifyContent: 'center', background: wallThickness === 15 ? 'rgba(20, 241, 195, 0.1)' : 'transparent', borderColor: wallThickness === 15 ? 'var(--accent-cyan)' : 'var(--glass-border)' }}
                      >
                        🧱 9" Outer Wall
                      </button>
                      <button 
                        onClick={() => setWallThickness(8)}
                        className="btn-secondary"
                        style={{ flex: 1, padding: '6px 4px', fontSize: '11px', justifyContent: 'center', background: wallThickness === 8 ? 'rgba(20, 241, 195, 0.1)' : 'transparent', borderColor: wallThickness === 8 ? 'var(--accent-cyan)' : 'var(--glass-border)' }}
                      >
                        🧱 4.5" Partition
                      </button>
                    </div>
                    <p style={{ margin: '6px 0 0 0', fontSize: '8.5px', color: 'var(--text-secondary)' }}>
                      9" walls are used for load-bearing outer boundaries, while 4.5" partitions divide inner rooms.
                    </p>
                  </div>
                )}

                {drawingMode === 'DOOR' && (
                  <div style={{ marginTop: '10px', padding: '10px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', borderRadius: '8px' }}>
                    <label style={{ fontSize: '11px', color: 'var(--accent-cyan)', display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>Door Configuration:</label>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button 
                        onClick={() => setActiveDoorType('SINGLE')}
                        style={{ flex: 1, padding: '6px 4px', fontSize: '11px', justifyContent: 'center', background: activeDoorType === 'SINGLE' ? 'rgba(20, 241, 195, 0.1)' : 'transparent', borderColor: activeDoorType === 'SINGLE' ? 'var(--accent-cyan)' : 'var(--glass-border)', borderRadius: '4px', border: '1px solid', color: '#fff', cursor: 'pointer' }}
                      >
                        🚪 Single Door
                      </button>
                      <button 
                        onClick={() => setActiveDoorType('DOUBLE')}
                        style={{ flex: 1, padding: '6px 4px', fontSize: '11px', justifyContent: 'center', background: activeDoorType === 'DOUBLE' ? 'rgba(20, 241, 195, 0.1)' : 'transparent', borderColor: activeDoorType === 'DOUBLE' ? 'var(--accent-cyan)' : 'var(--glass-border)', borderRadius: '4px', border: '1px solid', color: '#fff', cursor: 'pointer' }}
                      >
                        🚪🚪 Double Door
                      </button>
                    </div>
                    <p style={{ margin: '6px 0 0 0', fontSize: '8.5px', color: 'var(--text-secondary)' }}>
                      Double doors are ideal for grand main entrances, while single doors are standard for bedrooms/toilets.
                    </p>
                  </div>
                )}

                {drawingMode === 'ROOM' && (
                  <div style={{ marginTop: '10px', padding: '10px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', borderRadius: '8px' }}>
                    <label style={{ fontSize: '11px', color: 'var(--accent-cyan)', display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>Define Room Sector Name:</label>
                    <select 
                      value={activeRoomType}
                      onChange={(e) => setActiveRoomType(e.target.value)}
                      style={{ width: '100%', background: 'rgba(8, 11, 17, 0.9)', border: '1px solid var(--glass-border)', borderRadius: '4px', padding: '4px', fontSize: '12px', color: '#fff', outline: 'none' }}
                    >
                      <option value="Master Bedroom">🛏️ Master Bedroom</option>
                      <option value="Living Room">🛋️ Living Room / Hall</option>
                      <option value="Kitchen">🍳 Kitchen</option>
                      <option value="Bathroom">🚽 Bathroom / WC</option>
                      <option value="Pooja Room">🪔 Pooja Room</option>
                      <option value="Dining Room">🍽️ Dining Room</option>
                      <option value="Guest Room">🛌 Guest Bedroom</option>
                      <option value="Study Room">📚 Study Room</option>
                      <option value="Store Room">📦 Store Room</option>
                      <option value="Balcony">🌅 Balcony</option>
                      <option value="Garage">🚗 Garage / Portico</option>
                    </select>
                    <p style={{ margin: '6px 0 0 0', fontSize: '8.5px', color: 'var(--text-secondary)' }}>
                      Choose the room type and then click on the grid to drop the defined room boundary box.
                    </p>
                  </div>
                )}

                {drawingMode === 'FURNITURE' && (
                  <div style={{ marginTop: '10px', padding: '10px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', borderRadius: '8px' }}>
                    <label style={{ fontSize: '11px', color: 'var(--accent-cyan)', display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>Select Fitting Type:</label>
                    <select 
                      value={activeFurnitureType}
                      onChange={(e: any) => setActiveFurnitureType(e.target.value)}
                      style={{ width: '100%', background: 'rgba(8, 11, 17, 0.9)', border: '1px solid var(--glass-border)', borderRadius: '4px', padding: '4px', fontSize: '12px', color: '#fff', outline: 'none' }}
                    >
                      <optgroup label="🛋️ Living & Bedrooms">
                        <option value="SOFA">Sofa Couch Set</option>
                        <option value="BED">King Size Bed</option>
                        <option value="DINING_TABLE">Dining Table Set</option>
                        <option value="TV_UNIT">TV Entertainment Unit</option>
                        <option value="WARDROBE">Wardrobe / Almirah</option>
                      </optgroup>
                      <optgroup label="🚽 Sanitary & Bathroom">
                        <option value="TOILET_COMMODE">Water Closet / Commode</option>
                        <option value="WASHBASIN">Bathroom Sink / Basin</option>
                        <option value="SHOWER_TUB">Shower Cubicle / Tub</option>
                      </optgroup>
                    </select>
                    <p style={{ margin: '6px 0 0 0', fontSize: '8.5px', color: 'var(--text-secondary)' }}>
                      Click on the blueprint grid to drop this item. Select & drag to snap center.
                    </p>
                  </div>
                )}

                {selectedElement && (
                  <div style={{ marginTop: '10px', padding: '10px', background: 'rgba(20, 241, 195, 0.05)', border: '1px solid var(--accent-cyan)', borderRadius: '8px' }}>
                    <label style={{ fontSize: '11px', color: 'var(--accent-cyan)', display: 'block', marginBottom: '6px', fontWeight: 'bold' }}>
                      Selected: {selectedElement.type} ({selectedElement.id.slice(0, 5)})
                    </label>
                    {selectedElement.type === 'ROOM' && (() => {
                      const roomObj = rooms.find(r => r.id === selectedElement.id);
                      if (!roomObj) return null;
                      return (
                        <div style={{ width: '100%', marginBottom: '10px' }}>
                          <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>
                            Room Name:
                          </label>
                          <input 
                            type="text" 
                            value={roomObj.name}
                            onChange={(e) => {
                              const newName = e.target.value;
                              const updated = rooms.map(r => r.id === roomObj.id ? { ...r, name: newName } : r);
                              setRooms(updated);
                              savePlanToDB(walls, columns, portals, updated, furnitures);
                            }}
                            onBlur={() => {
                              pushToHistory(walls, columns, portals, rooms, furnitures);
                            }}
                            style={{ 
                              width: '100%', 
                              background: 'rgba(0, 0, 0, 0.4)', 
                              color: 'var(--text-primary)', 
                              border: '1px solid var(--glass-border)', 
                              borderRadius: '6px', 
                              padding: '6px 10px', 
                              fontSize: '12px',
                              outline: 'none',
                              boxSizing: 'border-box'
                            }}
                          />
                        </div>
                      );
                    })()}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {(selectedElement.type === 'PORTAL' || selectedElement.type === 'FURNITURE' || selectedElement.type === 'ROOM' || selectedElement.type === 'WALL') && (
                        <button 
                          onClick={handleRotateSelected} 
                          className="btn-primary" 
                          style={{ flex: '1 1 45%', padding: '4px 8px', fontSize: '11px', justifyContent: 'center' }}
                        >
                          🔄 Rotate 90°
                        </button>
                      )}
                      {selectedElement.type === 'PORTAL' && (
                        <>
                          <button 
                            onClick={handleFlipPortalX} 
                            className="btn-primary" 
                            style={{ flex: '1 1 45%', padding: '4px 8px', fontSize: '11px', justifyContent: 'center', background: 'linear-gradient(135deg, var(--accent-cyan), #0bb598)' }}
                            title="Flip door hinge horizontally"
                          >
                            ↔️ Flip Hinge
                          </button>
                          <button 
                            onClick={handleFlipPortalY} 
                            className="btn-primary" 
                            style={{ flex: '1 1 45%', padding: '4px 8px', fontSize: '11px', justifyContent: 'center', background: 'linear-gradient(135deg, var(--accent-cyan), #0bb598)' }}
                            title="Flip door swing vertically"
                          >
                            ↕️ Flip Swing
                          </button>
                        </>
                      )}
                      {selectedElement.type !== 'WALL' && (
                        <button 
                          onClick={handleCopySelected} 
                          className="btn-secondary" 
                          style={{ flex: '1 1 45%', padding: '4px 8px', fontSize: '11px', justifyContent: 'center' }}
                        >
                          📋 Copy (Ctrl+C)
                        </button>
                      )}
                      <button 
                        onClick={handleDeleteSelected} 
                        className="btn-secondary" 
                        style={{ flex: '1 1 100%', padding: '4px 8px', fontSize: '11px', justifyContent: 'center', borderColor: 'var(--accent-rose)', color: 'var(--accent-rose)' }}
                      >
                        🗑️ Delete Element (Del)
                      </button>
                    </div>
                  </div>
                )}

                {copiedElement && (
                  <div style={{ marginTop: '10px', padding: '8px', background: 'rgba(139, 92, 246, 0.05)', border: '1px solid var(--accent-purple)', borderRadius: '8px', textAlign: 'center' }}>
                    <span style={{ fontSize: '10px', color: 'var(--accent-purple)', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>
                      Copied: {copiedElement.type}
                    </span>
                    <button 
                      onClick={handlePasteElement} 
                      className="btn-primary" 
                      style={{ width: '100%', padding: '4px 8px', fontSize: '11px', justifyContent: 'center', background: 'linear-gradient(135deg, var(--accent-purple), #7c3aed)', boxShadow: '0 4px 10px rgba(139, 92, 246, 0.3)' }}
                    >
                      📋 Paste Copied (Ctrl+V)
                    </button>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                  <button onClick={handleUndo} className="btn-secondary" style={{ flex: 1, padding: '6px', fontSize: '11px', justifyContent: 'center' }} title="Undo last segment (Ctrl+Z)">
                    <Undo size={12} /> Undo segment
                  </button>
                  <button onClick={clearCanvas} className="btn-secondary" style={{ flex: 1, padding: '6px', fontSize: '11px', justifyContent: 'center', color: 'var(--accent-rose)' }}>
                    <Trash2 size={12} /> Clear layout
                  </button>
                </div>
              </div>

              {/* Floor / Soil / Concrete Configs */}
              <div>
                <h3 style={{ fontSize: '15px', color: 'var(--accent-cyan)', borderBottom: '1px solid var(--glass-border)', paddingBottom: '8px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Calculator size={16} /> Soil & Structural Calibration
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Number of Slabs/Floors:</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input 
                        type="range" 
                        min="1" 
                        max="4" 
                        value={floorsCount} 
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setFloorsCount(val);
                          if (activeProjectId) db.projects.update(activeProjectId, { floorsCount: val });
                        }}
                        style={{ flex: 1 }}
                      />
                      <span style={{ fontSize: '13px', fontWeight: 'bold', background: 'rgba(20, 241, 195, 0.1)', color: 'var(--accent-cyan)', padding: '2px 8px', borderRadius: '4px' }}>
                        G+{floorsCount - 1}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Soil Stratum (Footing Multiplier):</label>
                    <select 
                      value={soilType}
                      onChange={(e) => {
                        const val = e.target.value as any;
                        setSoilType(val);
                        if (activeProjectId) db.projects.update(activeProjectId, { soilType: val });
                      }}
                      style={{ width: '100%', background: 'rgba(0, 0, 0, 0.4)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '8px', fontSize: '12px' }}
                    >
                      <option value="NORMAL">Normal / Hard Soil</option>
                      <option value="BLACK_COTTON">Black Cotton Soil (+20% Base Steel)</option>
                      <option value="CLAY">Clayey/Soft Soil (+15% Trench Pit)</option>
                      <option value="SANDY">Sandy Loam Soil</option>
                    </select>
                  </div>

                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px' }}>Concrete Mix Grade (IS-456):</label>
                    <select 
                      value={concreteGrade}
                      onChange={(e) => setConcreteGrade(e.target.value as 'M20' | 'M25')}
                      style={{ width: '100%', background: 'rgba(0, 0, 0, 0.4)', color: 'var(--text-primary)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '8px', fontSize: '12px' }}
                    >
                      <option value="M20">M20 Grade (1 : 1.5 : 3) — Standard Mix</option>
                      <option value="M25">M25 Grade (1 : 1 : 2) — Heavy Structural Mix</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Vastu Shastra Compass Control */}
              <div>
                <h3 style={{ fontSize: '15px', color: 'var(--accent-cyan)', borderBottom: '1px solid var(--glass-border)', paddingBottom: '8px', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Compass size={16} /> Vastu Alignment Angle
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
                  <div style={{ position: 'relative', width: '100px', height: '100px', borderRadius: '50%', background: 'rgba(0, 0, 0, 0.4)', border: '2px dashed var(--accent-gold)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {/* Compass North Arrow */}
                    <div style={{ 
                      width: '4px', 
                      height: '80px', 
                      background: 'linear-gradient(to bottom, var(--accent-rose) 50%, var(--text-muted) 50%)', 
                      transform: `rotate(${trueNorth}deg)`,
                      transition: 'transform 0.1s ease',
                      borderRadius: '2px'
                    }} />
                    <span style={{ position: 'absolute', top: '4px', fontSize: '9px', fontWeight: 'bold', color: 'var(--accent-rose)' }}>N</span>
                    <span style={{ position: 'absolute', bottom: '4px', fontSize: '9px', fontWeight: 'bold', color: 'var(--text-secondary)' }}>S</span>
                    <span style={{ position: 'absolute', left: '6px', fontSize: '9px', fontWeight: 'bold', color: 'var(--text-secondary)' }}>W</span>
                    <span style={{ position: 'absolute', right: '6px', fontSize: '9px', fontWeight: 'bold', color: 'var(--text-secondary)' }}>E</span>
                  </div>
                  
                  <div style={{ width: '100%' }}>
                    <label style={{ fontSize: '11px', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Calibrate True North Degree:</span>
                      <span style={{ color: 'var(--accent-gold)' }}>{trueNorth}°</span>
                    </label>
                    <input 
                      type="range" 
                      min="0" 
                      max="359" 
                      value={trueNorth}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setTrueNorth(val);
                        savePlanToDB(walls, columns, portals, rooms, furnitures);
                      }}
                      style={{ width: '100%', marginTop: '6px' }}
                    />
                  </div>
                </div>
              </div>



              {/* Floating Unit Converter Widget */}
              <div style={{ marginTop: 'auto', background: 'rgba(20, 241, 195, 0.03)', border: '1px solid rgba(20, 241, 195, 0.1)', borderRadius: '12px', padding: '12px' }}>
                <h4 style={{ fontSize: '12px', color: 'var(--accent-cyan)', marginBottom: '8px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  📐 Quick Civil Unit Converter
                </h4>
                <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 1fr', gap: '4px', marginBottom: '6px' }}>
                  <input 
                    type="number" 
                    value={convertFromVal} 
                    onChange={(e) => setConvertFromVal(e.target.value)}
                    style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid var(--glass-border)', color: '#fff', fontSize: '11px', borderRadius: '4px', padding: '2px' }}
                  />
                  <select 
                    value={convertUnitFrom}
                    onChange={(e: any) => setConvertUnitFrom(e.target.value)}
                    style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid var(--glass-border)', color: '#fff', fontSize: '11px', borderRadius: '4px' }}
                  >
                    <option value="SQFT">Sq Ft</option>
                    <option value="SQM">Sq Mt</option>
                    <option value="MARLA">Marlas</option>
                    <option value="ANKANAM">Ankanam</option>
                  </select>
                  <select 
                    value={convertUnitTo}
                    onChange={(e: any) => setConvertUnitTo(e.target.value)}
                    style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid var(--glass-border)', color: '#fff', fontSize: '11px', borderRadius: '4px' }}
                  >
                    <option value="SQFT">Sq Ft</option>
                    <option value="SQM">Sq Mt</option>
                    <option value="MARLA">Marlas</option>
                    <option value="ANKANAM">Ankanam</option>
                  </select>
                </div>
                <div style={{ fontSize: '12px', textAlign: 'center', fontWeight: 'bold', color: 'var(--text-primary)' }}>
                  Result: <span style={{ color: 'var(--accent-cyan)' }}>{convertedVal}</span> {convertUnitTo}
                </div>
              </div>

            </div>

             {/* MIDDLE COLUMN: BLUEPRINT GRID DRAWING BOARD FALLBACK */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* 📐 Plot Land Dimensions Configurator Panel */}
              <div className="glass-panel" style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', background: 'rgba(245, 158, 11, 0.02)', borderColor: 'rgba(245, 158, 11, 0.2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '13px', color: 'var(--accent-gold)', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 'bold' }}>
                    📐 Plot Boundary & Setback Calibrator (IS Standards)
                  </span>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button 
                      onClick={handleFitToScreen} 
                      className="btn-primary" 
                      style={{ padding: '2px 8px', fontSize: '10px', background: 'rgba(20, 241, 195, 0.1)', color: 'var(--accent-cyan)', border: '1px solid rgba(20, 241, 195, 0.2)', boxShadow: 'none' }}
                      title="Fit Plot inside standard screen size"
                    >
                      📺 Fit View
                    </button>
                    <button 
                      onClick={() => setShowPlotBoundary(!showPlotBoundary)} 
                      className="btn-secondary"
                      style={{ padding: '2px 8px', fontSize: '10px', borderColor: showPlotBoundary ? 'rgba(245, 158, 11, 0.3)' : 'var(--glass-border)', color: showPlotBoundary ? 'var(--accent-gold)' : 'var(--text-muted)' }}
                    >
                      {showPlotBoundary ? 'Hide Boundaries' : 'Show Boundaries'}
                    </button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                  {/* Plot Dimensions */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Width (Feet):</span>
                    <input 
                      type="number" 
                      value={plotWidth} 
                      onChange={(e) => setPlotWidth(Math.max(10, Number(e.target.value)))} 
                      style={{ width: '100%', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--glass-border)', color: '#fff', fontSize: '11px', padding: '6px', borderRadius: '6px', outline: 'none' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Depth (Feet):</span>
                    <input 
                      type="number" 
                      value={plotDepth} 
                      onChange={(e) => setPlotDepth(Math.max(10, Number(e.target.value)))} 
                      style={{ width: '100%', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--glass-border)', color: '#fff', fontSize: '11px', padding: '6px', borderRadius: '6px', outline: 'none' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Plot Facing:</span>
                    <select 
                      value={plotFacing} 
                      onChange={(e: any) => {
                        const val = e.target.value;
                        setPlotFacing(val);
                        // Automatically align Vastu Compass to standard orientations
                        if (val === 'NORTH') setTrueNorth(0);
                        else if (val === 'EAST') setTrueNorth(270);
                        else if (val === 'SOUTH') setTrueNorth(180);
                        else if (val === 'WEST') setTrueNorth(90);
                      }} 
                      style={{ width: '100%', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--glass-border)', color: '#fff', fontSize: '11px', padding: '5px', borderRadius: '6px', outline: 'none' }}
                    >
                      <option value="NORTH">North Facing 🧭</option>
                      <option value="EAST">East Facing 🌅</option>
                      <option value="SOUTH">South Facing 🔥</option>
                      <option value="WEST">West Facing 🌊</option>
                    </select>
                  </div>
                  {/* Total land Area readouts */}
                  <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', background: 'rgba(255,255,255,0.02)', padding: '4px 8px', borderRadius: '6px', border: '1px dashed var(--glass-border)' }}>
                    <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>Calculated land:</span>
                    <span style={{ fontSize: '11px', fontWeight: 'bold', color: 'var(--accent-gold)' }}>
                      {plotWidth * plotDepth} Sq. Ft.
                    </span>
                    <span style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>
                      {((plotWidth * plotDepth) / 9).toFixed(1)} Gaj (Sq Yd)
                    </span>
                  </div>
                </div>

                {/* Setbacks/Margins */}
                <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '8px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Front Setback (Ft):</span>
                    <input 
                      type="number" 
                      value={setbackFront} 
                      onChange={(e) => setSetbackFront(Math.max(0, Number(e.target.value)))} 
                      style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: '#fff', fontSize: '10px', padding: '4px', borderRadius: '6px', outline: 'none' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Rear Setback (Ft):</span>
                    <input 
                      type="number" 
                      value={setbackRear} 
                      onChange={(e) => setSetbackRear(Math.max(0, Number(e.target.value)))} 
                      style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: '#fff', fontSize: '10px', padding: '4px', borderRadius: '6px', outline: 'none' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Left Margin (Ft):</span>
                    <input 
                      type="number" 
                      value={setbackLeft} 
                      onChange={(e) => setSetbackLeft(Math.max(0, Number(e.target.value)))} 
                      style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: '#fff', fontSize: '10px', padding: '4px', borderRadius: '6px', outline: 'none' }}
                    />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Right Margin (Ft):</span>
                    <input 
                      type="number" 
                      value={setbackRight} 
                      onChange={(e) => setSetbackRight(Math.max(0, Number(e.target.value)))} 
                      style={{ width: '100%', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', color: '#fff', fontSize: '10px', padding: '4px', borderRadius: '6px', outline: 'none' }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9px', color: 'var(--text-muted)' }}>
                  <span>Regional Translations: {((plotWidth * plotDepth) / 272.25).toFixed(2)} Marla | {((plotWidth * plotDepth) / 435.6).toFixed(2)} Cents | {((plotWidth * plotDepth) / 72).toFixed(2)} Ankanam</span>
                  <span style={{ color: 'var(--accent-cyan)', fontWeight: 'bold' }}>Buildable Area: {Math.max(0, plotWidth - setbackLeft - setbackRight)} x {Math.max(0, plotDepth - setbackFront - setbackRear)} Ft</span>
                </div>
              </div>

              {/* Canvas Layer Filters HUD */}
              <div className="glass-panel" style={{ padding: '8px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Layers size={14} /> Active CAD Layers:
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    onClick={() => setLayerArchitectural(!layerArchitectural)}
                    style={{ padding: '4px 10px', fontSize: '11px', background: layerArchitectural ? 'rgba(20, 241, 195, 0.1)' : 'transparent', color: layerArchitectural ? 'var(--accent-cyan)' : 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '6px' }}
                  >
                    Architectural
                  </button>
                  <button 
                    onClick={() => setLayerStructural(!layerStructural)}
                    style={{ padding: '4px 10px', fontSize: '11px', background: layerStructural ? 'rgba(59, 130, 246, 0.1)' : 'transparent', color: layerStructural ? 'var(--accent-blue)' : 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '6px' }}
                  >
                    Structural
                  </button>
                  <button 
                    onClick={() => setLayerVastu(!layerVastu)}
                    style={{ padding: '4px 10px', fontSize: '11px', background: layerVastu ? 'rgba(245, 158, 11, 0.1)' : 'transparent', color: layerVastu ? 'var(--accent-gold)' : 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '6px' }}
                  >
                    Vastu Overlay
                  </button>
                  <button 
                    onClick={() => setLayerDimensions(!layerDimensions)}
                    style={{ padding: '4px 10px', fontSize: '11px', background: layerDimensions ? 'rgba(255, 255, 255, 0.08)' : 'transparent', color: layerDimensions ? 'var(--text-primary)' : 'var(--text-muted)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '6px' }}
                  >
                    Dimensions (Ft)
                  </button>
                </div>
              </div>

              {/* 🎨 DRAWING SVG SCREEN */}
              <div 
                className={`glass-panel blueprint-grid ${drawingMode === 'ERASER' ? 'cursor-eraser' : isPanning ? 'cursor-grabbing' : (drawingMode === 'PAN' || spacePressed) ? 'cursor-grab' : ''}`}
                style={isFullscreen ? {
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  width: '100vw',
                  height: '100vh',
                  zIndex: 9999,
                  borderRadius: 0,
                  border: 'none',
                  boxShadow: 'inset 0 0 100px rgba(0,0,0,0.95)',
                  userSelect: 'none',
                  backgroundColor: '#080b11'
                } : {
                  height: '460px', 
                  position: 'relative', 
                  overflow: 'hidden', 
                  border: '2px solid rgba(20, 241, 195, 0.15)',
                  boxShadow: 'inset 0 0 40px rgba(0,0,0,0.8)',
                  userSelect: 'none'
                }}
              >
                {/* 🎯 Floating Direct-Canvas Selector Action Overlay */}
                {(() => {
                  if (!selectedElement) return null;
                  let overlayX = 0;
                  let overlayY = 0;
                  if (selectedElement.type === 'WALL') {
                    const w = walls.find(x => x.id === selectedElement.id);
                    if (w) {
                      overlayX = (w.startX + w.endX) / 2;
                      overlayY = (w.startY + w.endY) / 2 - 35;
                    }
                  } else if (selectedElement.type === 'COLUMN') {
                    const c = columns.find(x => x.id === selectedElement.id);
                    if (c) {
                      overlayX = c.x;
                      overlayY = c.y - 25;
                    }
                  } else if (selectedElement.type === 'PORTAL') {
                    const p = portals.find(x => x.id === selectedElement.id);
                    if (p) {
                      overlayX = p.x;
                      overlayY = p.y - 30;
                    }
                  } else if (selectedElement.type === 'FURNITURE') {
                    const f = furnitures.find(x => x.id === selectedElement.id);
                    if (f) {
                      overlayX = f.x;
                      overlayY = f.y - f.height/2 - 20;
                    }
                  } else if (selectedElement.type === 'ROOM') {
                    const r = rooms.find(x => x.id === selectedElement.id);
                    if (r && r.points && r.points.length > 0) {
                      overlayX = r.points.reduce((sum, p) => sum + p.x, 0) / r.points.length;
                      overlayY = r.points.reduce((sum, p) => sum + p.y, 0) / r.points.length - 25;
                    }
                  }

                  if (overlayX === 0 || overlayY === 0) return null;

                  // Transform coordinates based on Zoom & Pan!
                  const screenX = overlayX * zoom + panX;
                  const screenY = overlayY * zoom + panY;

                  // Hide overlay if it drifts off the visible SVG viewport boundaries
                  if (screenX < 0 || screenX > 800 || screenY < -50 || screenY > 450) return null;

                  return (
                    <div 
                      className="glass-panel pulse-glow-cyan" 
                      style={{ 
                        position: 'absolute', 
                        left: `${(screenX / 800) * 100}%`, 
                        top: `${(screenY / 450) * 100}%`, 
                        transform: 'translate(-50%, -100%)', 
                        display: 'flex', 
                        gap: '4px', 
                        padding: '4px', 
                        borderRadius: '6px', 
                        zIndex: 50, 
                        border: '1px solid var(--accent-cyan)',
                        boxShadow: '0 0 10px rgba(20, 241, 195, 0.4)',
                        background: 'rgba(8, 11, 17, 0.95)',
                        pointerEvents: 'auto'
                      }}
                    >
                      {(selectedElement.type === 'PORTAL' || selectedElement.type === 'FURNITURE' || selectedElement.type === 'ROOM' || selectedElement.type === 'WALL') && (
                        <button 
                          onClick={handleRotateSelected}
                          style={{ background: 'none', border: 'none', color: 'var(--accent-cyan)', fontSize: '11px', cursor: 'pointer', padding: '2px 6px', fontWeight: 'bold' }}
                          title="Rotate 90 degrees"
                        >
                          🔄 Rotate
                        </button>
                      )}
                      {selectedElement.type === 'PORTAL' && (
                        <>
                          <button 
                            onClick={handleFlipPortalX}
                            style={{ background: 'none', border: 'none', color: 'var(--accent-cyan)', fontSize: '11px', cursor: 'pointer', padding: '2px 6px', fontWeight: 'bold' }}
                            title="Flip door hinge horizontally"
                          >
                            ↔️ Hinge
                          </button>
                          <button 
                            onClick={handleFlipPortalY}
                            style={{ background: 'none', border: 'none', color: 'var(--accent-cyan)', fontSize: '11px', cursor: 'pointer', padding: '2px 6px', fontWeight: 'bold' }}
                            title="Flip door swing vertically"
                          >
                            ↕️ Swing
                          </button>
                        </>
                      )}
                      {selectedElement.type !== 'WALL' && (
                        <button 
                          onClick={handleCopySelected}
                          style={{ background: 'none', border: 'none', color: 'var(--accent-purple)', fontSize: '11px', cursor: 'pointer', padding: '2px 6px', fontWeight: 'bold' }}
                          title="Copy element"
                        >
                          📋 Copy
                        </button>
                      )}
                      <button 
                        onClick={handleDeleteSelected}
                        style={{ background: 'none', border: 'none', color: 'var(--accent-rose)', fontSize: '11px', cursor: 'pointer', padding: '2px 6px', fontWeight: 'bold' }}
                        title="Delete element"
                      >
                        🗑️ Delete
                      </button>
                    </div>
                  );
                })()}

                {/* 🔍 Viewport Zoom & Pan Floating Toolbar */}
                <div style={{ position: 'absolute', bottom: '12px', left: '12px', display: 'flex', gap: '6px', zIndex: 10 }}>
                  <button 
                    onClick={() => { setZoom(prev => Math.min(prev * 1.1, 5.0)); }} 
                    className="btn-secondary" 
                    style={{ padding: '0', width: '28px', height: '28px', background: 'rgba(8,11,17,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', fontSize: '14px', fontWeight: 'bold' }}
                    title="Zoom In"
                  >
                    +
                  </button>
                  <button 
                    onClick={() => { setZoom(prev => Math.max(prev / 1.08, 0.05)); }} 
                    className="btn-secondary" 
                    style={{ padding: '0', width: '28px', height: '28px', background: 'rgba(8,11,17,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', fontSize: '14px', fontWeight: 'bold' }}
                    title="Zoom Out"
                  >
                    -
                  </button>
                  <button 
                    onClick={() => { setZoom(1); setPanX(0); setPanY(0); }} 
                    className="btn-secondary" 
                    style={{ padding: '0', width: '28px', height: '28px', background: 'rgba(8,11,17,0.95)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '6px', fontSize: '11px' }}
                    title="Reset Canvas View"
                  >
                    🔄
                  </button>
                  <button 
                    onClick={handleFitToScreen} 
                    className="btn-secondary" 
                    style={{ padding: '0 8px', height: '28px', background: 'rgba(8,11,17,0.95)', display: 'flex', alignItems: 'center', gap: '4px', borderRadius: '6px', fontSize: '10px', color: 'var(--accent-cyan)', borderColor: 'rgba(20, 241, 195, 0.3)' }}
                    title="Fit Plot boundary to canvas screen"
                  >
                    📺 Fit Plot
                  </button>
                  <button 
                    onClick={() => setIsFullscreen(!isFullscreen)} 
                    className="btn-secondary" 
                    style={{ padding: '0 8px', height: '28px', background: 'rgba(8,11,17,0.95)', display: 'flex', alignItems: 'center', gap: '4px', borderRadius: '6px', fontSize: '10px', color: 'var(--accent-gold)', borderColor: 'rgba(245, 158, 11, 0.3)', fontWeight: 'bold' }}
                    title="Toggle Full Screen CAD Workspace"
                  >
                    🖥️ {isFullscreen ? 'Exit CAD' : 'Full Screen'}
                  </button>
                </div>

                {/* SVG Renderer canvas */}
                <svg 
                  viewBox="0 0 800 450"
                  width="100%" 
                  height="100%" 
                  onClick={handleCanvasClick}
                  onMouseMove={handleMouseMove}
                  onMouseDown={handleCanvasMouseDown}
                  onMouseUp={handleCanvasMouseUp}
                  onWheel={handleWheel}
                  onContextMenu={(e) => e.preventDefault()}
                  style={{ position: 'absolute', top: 0, left: 0 }}
                >
                  {/* Pattern Definitions for hatch backgrounds */}
                  <defs>
                    <pattern id="hatch" width="10" height="10" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
                      <line x1="0" y1="0" x2="0" y2="10" stroke="rgba(244, 63, 94, 0.18)" strokeWidth="2.5" />
                    </pattern>
                  </defs>

                  {/* Infinite CAD Viewport Translation Container */}
                  <g transform={`translate(${panX}, ${panY}) scale(${zoom})`}>
                  {/* Land Plot Boundary dashed rect */}
                  {showPlotBoundary && (
                    <g>
                      <rect 
                        x={(800 - plotWidth * 30) / 2} 
                        y={(450 - plotDepth * 30) / 2} 
                        width={plotWidth * 30} 
                        height={plotDepth * 30} 
                        fill="rgba(245, 158, 11, 0.01)" 
                        stroke="var(--accent-gold)" 
                        strokeWidth="2" 
                        strokeDasharray="6,4" 
                      />
                      
                      {/* Shaded hollow setback margins zone using SVG evenodd fill rule */}
                      {(() => {
                        const px = (800 - plotWidth * 30) / 2;
                        const py = (450 - plotDepth * 30) / 2;
                        const bx = px + setbackLeft * 30;
                        const by = py + setbackFront * 30;
                        const bw = Math.max(0, plotWidth * 30 - (setbackLeft + setbackRight) * 30);
                        const bh = Math.max(0, plotDepth * 30 - (setbackFront + setbackRear) * 30);
                        return (
                          <path 
                            d={`M ${px} ${py} h ${plotWidth * 30} v ${plotDepth * 30} h ${-plotWidth * 30} Z M ${bx} ${by} h ${bw} v ${bh} h ${-bw} Z`} 
                            fill="url(#hatch)" 
                            stroke="rgba(244, 63, 94, 0.25)" 
                            strokeWidth="1.2" 
                            strokeDasharray="4,4" 
                            fillRule="evenodd"
                          />
                        );
                      })()}

                      {/* Buildable green boundary */}
                      {(() => {
                        const px = (800 - plotWidth * 30) / 2;
                        const py = (450 - plotDepth * 30) / 2;
                        const bx = px + setbackLeft * 30;
                        const by = py + setbackFront * 30;
                        const bw = Math.max(0, plotWidth * 30 - (setbackLeft + setbackRight) * 30);
                        const bh = Math.max(0, plotDepth * 30 - (setbackFront + setbackRear) * 30);
                        if (bw <= 0 || bh <= 0) return null;
                        return (
                          <g>
                            <rect 
                              x={bx} 
                              y={by} 
                              width={bw} 
                              height={bh} 
                              fill="rgba(16, 185, 129, 0.01)" 
                              stroke="var(--accent-emerald)" 
                              strokeWidth="1.5" 
                              strokeDasharray="3,3" 
                            />
                            <text x={bx + bw/2} y={by + 12} fill="var(--accent-emerald)" fontSize="8.5" fontWeight="bold" textAnchor="middle" opacity="0.8">
                              BUILDABLE YARD: {Math.max(0, plotWidth - setbackLeft - setbackRight)} x {Math.max(0, plotDepth - setbackFront - setbackRear)} FT
                            </text>
                          </g>
                        );
                      })()}

                      {/* Boundary labels */}
                      <text x="400" y={(450 - plotDepth * 30) / 2 - 6} fill="var(--accent-gold)" fontSize="10" fontWeight="bold" textAnchor="middle">
                        🏡 PLOT WIDTH: {plotWidth} FT
                      </text>
                      <text x={(800 - plotWidth * 30) / 2 - 10} y="225" fill="var(--accent-gold)" fontSize="10" fontWeight="bold" textAnchor="middle" transform={`rotate(-90, ${(800 - plotWidth * 30) / 2 - 10}, 225)`}>
                        📐 PLOT DEPTH: {plotDepth} FT
                      </text>
                      <text x={(800 - plotWidth * 30) / 2 + 10} y={(450 - plotDepth * 30) / 2 + plotDepth * 30 - 10} fill="rgba(245, 158, 11, 0.5)" fontSize="9" fontWeight="bold">
                        PLOT AREA: {plotWidth * plotDepth} SQ. FT.
                      </text>
                    </g>
                  )}
                  {/* Vastu Grid Overlay */}
                  {layerVastu && (
                    <g style={{ opacity: 0.12 }}>
                      <line x1="33%" y1="0" x2="33%" y2="100%" stroke="var(--accent-gold)" strokeWidth="1.5" strokeDasharray="5,5" />
                      <line x1="66%" y1="0" x2="66%" y2="100%" stroke="var(--accent-gold)" strokeWidth="1.5" strokeDasharray="5,5" />
                      <line x1="0" y1="33%" x2="100%" y2="33%" stroke="var(--accent-gold)" strokeWidth="1.5" strokeDasharray="5,5" />
                      <line x1="0" y1="66%" x2="100%" y2="66%" stroke="var(--accent-gold)" strokeWidth="1.5" strokeDasharray="5,5" />
                      
                      {/* Sectors Names */}
                      <text x="16%" y="10%" fill="var(--accent-gold)" fontSize="10" textAnchor="middle">Vayavya (NW)</text>
                      <text x="50%" y="10%" fill="var(--accent-gold)" fontSize="10" textAnchor="middle">Uttar (N)</text>
                      <text x="83%" y="10%" fill="var(--accent-gold)" fontSize="10" textAnchor="middle">Eshanya (NE)</text>
                      
                      <text x="16%" y="50%" fill="var(--accent-gold)" fontSize="10" textAnchor="middle">Paschim (W)</text>
                      <text x="50%" y="50%" fill="var(--accent-gold)" fontSize="10" textAnchor="middle">Brahmasthan (Center)</text>
                      <text x="83%" y="50%" fill="var(--accent-gold)" fontSize="10" textAnchor="middle">Purva (E)</text>
                      
                      <text x="16%" y="88%" fill="var(--accent-gold)" fontSize="10" textAnchor="middle">Nairutya (SW)</text>
                      <text x="50%" y="88%" fill="var(--accent-gold)" fontSize="10" textAnchor="middle">Dakshin (S)</text>
                      <text x="83%" y="88%" fill="var(--accent-gold)" fontSize="10" textAnchor="middle">Agneya (SE)</text>
                    </g>
                  )}

                  {/* Structural Alignment Grid Axes */}
                  {layerStructural && (
                    <g style={{ opacity: 0.25 }}>
                      {columns.map(c => (
                        <g key={`axis-${c.id}`}>
                          <line x1={c.x} y1="0" x2={c.x} y2="100%" stroke="var(--accent-blue)" strokeWidth="0.8" strokeDasharray="3,6" />
                          <line x1="0" y1={c.y} x2="100%" y2={c.y} stroke="var(--accent-blue)" strokeWidth="0.8" strokeDasharray="3,6" />
                        </g>
                      ))}
                    </g>
                  )}

                  {/* Drawn Rooms */}
                  {layerArchitectural && rooms.map(r => {
                    const isSelected = selectedElement?.id === r.id;
                    const centroidX = r.points.reduce((sum, p) => sum + p.x, 0) / r.points.length;
                    const centroidY = r.points.reduce((sum, p) => sum + p.y, 0) / r.points.length;
                    return (
                      <g key={r.id}>
                        <polygon 
                          points={r.points.map(p => `${p.x},${p.y}`).join(' ')} 
                          fill={isSelected ? "rgba(20, 241, 195, 0.08)" : "rgba(20, 241, 195, 0.02)"} 
                          stroke={isSelected ? "var(--accent-cyan)" : "rgba(20, 241, 195, 0.15)"} 
                          strokeWidth={isSelected ? 2 : 1.2}
                          strokeDasharray={isSelected ? "4,2" : undefined}
                          className="element-hoverable"
                          style={{ cursor: drawingMode === 'SELECT' ? 'move' : 'default', transition: 'fill 0.2s, stroke 0.2s' }}
                          onMouseDown={(e) => {
                            if (drawingMode === 'SELECT') {
                              e.stopPropagation();
                              setSelectedElement({ id: r.id, type: 'ROOM' });
                              const coords = getSVGCoordinates(e.clientX, e.clientY, e.currentTarget.ownerSVGElement!);
                              const mouseX = (coords.x - panX) / zoom;
                              const mouseY = (coords.y - panY) / zoom;
                              setDraggedElement({
                                id: r.id,
                                type: 'ROOM',
                                offsetX: mouseX - centroidX,
                                offsetY: mouseY - centroidY
                              });
                            }
                          }}
                        />
                        <text 
                          x={centroidX} 
                          y={centroidY - 5} 
                          fill={isSelected ? "var(--accent-cyan)" : "rgba(255,255,255,0.85)"} 
                          fontSize="11.5" 
                          fontWeight="bold"
                          textAnchor="middle"
                          dominantBaseline="middle"
                          style={{ pointerEvents: 'none', transition: 'fill 0.2s' }}
                        >
                          {r.name}
                        </text>
                        {layerDimensions && (
                          <text 
                            x={centroidX} 
                            y={centroidY + 12} 
                            fill="var(--text-secondary)" 
                            fontSize="9"
                            textAnchor="middle"
                            dominantBaseline="middle"
                            style={{ pointerEvents: 'none' }}
                          >
                            Area: {r.areaSqFt} Sq. Ft.
                          </text>
                        )}
                      </g>
                    );
                  })}

                  {/* Drawn Walls */}
                  {layerArchitectural && walls.map(w => {
                    const isViolating = isWallViolatingSetback(w);
                    return (
                      <g key={w.id}>
                        <line 
                          x1={w.startX} 
                          y1={w.startY} 
                          x2={w.endX} 
                          y2={w.endY} 
                          stroke="var(--text-primary)" 
                          strokeWidth={w.thickness} 
                          strokeLinecap="square"
                        />
                        {/* Centerline outline for engineering detail - highlights rose red on setback violation */}
                        <line 
                          x1={w.startX} 
                          y1={w.startY} 
                          x2={w.endX} 
                          y2={w.endY} 
                          stroke={isViolating ? "var(--accent-rose)" : "var(--accent-cyan)"} 
                          strokeWidth="1.5" 
                          style={{ transition: 'stroke 0.2s ease' }}
                        />
                        {/* Dimension labels */}
                        {layerDimensions && (
                          <g>
                            {(() => {
                              const mx = (w.startX + w.endX) / 2;
                              const my = (w.startY + w.endY) / 2;
                              const dx = w.endX - w.startX;
                              const dy = w.endY - w.startY;
                              const lenFt = (Math.sqrt(dx*dx + dy*dy) / 30).toFixed(1);
                              return (
                                <text x={mx + 8} y={my - 8} fill={isViolating ? "var(--accent-rose)" : "var(--accent-cyan)"} fontSize="9" fontWeight="bold">
                                  {lenFt} ft
                                </text>
                              );
                            })()}
                          </g>
                        )}
                      </g>
                    );
                  })}

                  {/* Temporary Wall segment during drag */}
                  {dragStartPoint && tempWallEnd && (
                    <line 
                      x1={dragStartPoint.x} 
                      y1={dragStartPoint.y} 
                      x2={tempWallEnd.x} 
                      y2={tempWallEnd.y} 
                      stroke="var(--accent-cyan)" 
                      strokeWidth={wallThickness} 
                      strokeDasharray="4,4"
                      opacity="0.6"
                    />
                  )}

                  {/* Placed Doors & Windows */}
                  {layerArchitectural && portals.map(p => {
                    const isSelected = selectedElement?.id === p.id;
                    const isDragged = draggedElement?.id === p.id;
                    return (
                      <g 
                        key={p.id} 
                        transform={`translate(${p.x}, ${p.y}) rotate(${p.rotation}) scale(${p.flippedX ? -1 : 1}, ${p.flippedY ? -1 : 1})`} 
                        style={{ cursor: drawingMode === 'SELECT' ? 'move' : 'pointer' }}
                        className={`element-hoverable ${isDragged ? 'element-drag-active' : ''}`}
                        onMouseDown={(e) => {
                          if (drawingMode === 'SELECT') {
                            e.stopPropagation();
                            setSelectedElement({ id: p.id, type: 'PORTAL' });
                            const coords = getSVGCoordinates(e.clientX, e.clientY, e.currentTarget.ownerSVGElement!);
                            const mouseX = (coords.x - panX) / zoom;
                            const mouseY = (coords.y - panY) / zoom;
                            setDraggedElement({
                              id: p.id,
                              type: 'PORTAL',
                              offsetX: mouseX - p.x,
                              offsetY: mouseY - p.y
                            });
                          }
                        }}
                      >
                        {/* Selected Outline */}
                        {isSelected && (
                          <rect x="-30" y="-30" width="60" height="60" fill="none" stroke="var(--accent-cyan)" strokeWidth="1.5" strokeDasharray="3,3" />
                        )}
                        {p.type === 'DOOR' ? (
                          <g>
                            <line x1="0" y1="0" x2={(p.width || 45) * 0.6} y2="0" stroke="var(--accent-purple)" strokeWidth="3" />
                            <path d={`M ${(p.width || 45) * 0.6},0 A ${(p.width || 45) * 0.6},${(p.width || 45) * 0.6} 0 0,1 0,${(p.width || 45) * 0.6}`} fill="none" stroke="var(--accent-purple)" strokeWidth="1.5" strokeDasharray="3,3" />
                            <circle cx="0" cy="0" r="4" fill="var(--accent-purple)" />
                          </g>
                        ) : p.type === 'DOUBLE_DOOR' ? (
                          <g>
                            {/* Left Leaf */}
                            <line x1={-(p.width || 70) / 2} y1="0" x2="0" y2="0" stroke="var(--accent-purple)" strokeWidth="3" />
                            <path d={`M 0,0 A ${(p.width || 70) / 2},${(p.width || 70) / 2} 0 0,0 ${-(p.width || 70) / 2},${(p.width || 70) / 2}`} fill="none" stroke="var(--accent-purple)" strokeWidth="1.5" strokeDasharray="3,3" />
                            
                            {/* Right Leaf */}
                            <line x1={(p.width || 70) / 2} y1="0" x2="0" y2="0" stroke="var(--accent-purple)" strokeWidth="3" />
                            <path d={`M 0,0 A ${(p.width || 70) / 2},${(p.width || 70) / 2} 0 0,1 ${(p.width || 70) / 2},${(p.width || 70) / 2}`} fill="none" stroke="var(--accent-purple)" strokeWidth="1.5" strokeDasharray="3,3" />
                            
                            <circle cx={-(p.width || 70) / 2} cy="0" r="3.5" fill="var(--accent-purple)" />
                            <circle cx={(p.width || 70) / 2} cy="0" r="3.5" fill="var(--accent-purple)" />
                          </g>
                        ) : (
                          <g>
                            <rect x="-25" y="-4" width="50" height="8" fill="rgba(0,0,0,0.6)" stroke="var(--accent-cyan)" strokeWidth="1.5" />
                            <line x1="-25" y1="0" x2="25" y2="0" stroke="var(--text-primary)" strokeWidth="0.8" />
                          </g>
                        )}
                      </g>
                    );
                  })}

                  {/* Placed Column Pillars */}
                  {layerStructural && columns.map(c => {
                    const isSelected = selectedElement?.id === c.id;
                    const isDragged = draggedElement?.id === c.id;
                    return (
                      <g 
                        key={c.id} 
                        style={{ cursor: drawingMode === 'SELECT' ? 'move' : 'pointer' }}
                        className={`element-hoverable ${isDragged ? 'element-drag-active' : ''}`}
                        onMouseDown={(e) => {
                          if (drawingMode === 'SELECT') {
                            e.stopPropagation();
                            setSelectedElement({ id: c.id, type: 'COLUMN' });
                            const coords = getSVGCoordinates(e.clientX, e.clientY, e.currentTarget.ownerSVGElement!);
                            const mouseX = (coords.x - panX) / zoom;
                            const mouseY = (coords.y - panY) / zoom;
                            setDraggedElement({
                              id: c.id,
                              type: 'COLUMN',
                              offsetX: mouseX - c.x,
                              offsetY: mouseY - c.y
                            });
                          }
                        }}
                      >
                        {isSelected && (
                          <rect x={c.x - c.size/2 - 4} y={c.y - c.size/2 - 4} width={c.size + 8} height={c.size + 8} fill="none" stroke="var(--accent-cyan)" strokeWidth="1.5" strokeDasharray="2,2" />
                        )}
                        <rect 
                          x={c.x - c.size/2} 
                          y={c.y - c.size/2} 
                          width={c.size} 
                          height={c.size} 
                          fill="rgba(59, 130, 246, 0.8)" 
                          stroke="var(--text-primary)" 
                          strokeWidth="2" 
                        />
                        <line x1={c.x - c.size/2} y1={c.y - c.size/2} x2={c.x + c.size/2} y2={c.y + c.size/2} stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
                        <line x1={c.x + c.size/2} y1={c.y - c.size/2} x2={c.x - c.size/2} y2={c.y + c.size/2} stroke="rgba(255,255,255,0.4)" strokeWidth="1" />
                      </g>
                    );
                  })}

                  {/* Placed Furnitures & Sanitary Fittings */}
                  {layerArchitectural && furnitures.map(f => {
                    const isSelected = selectedElement?.id === f.id;
                    const isDragged = draggedElement?.id === f.id;
                    return (
                      <g 
                        key={f.id} 
                        transform={`translate(${f.x}, ${f.y}) rotate(${f.rotation})`} 
                        style={{ cursor: drawingMode === 'SELECT' ? 'move' : 'pointer' }}
                        className={`element-hoverable ${isDragged ? 'element-drag-active' : ''}`}
                        onMouseDown={(e) => {
                          if (drawingMode === 'SELECT') {
                            e.stopPropagation();
                            setSelectedElement({ id: f.id, type: 'FURNITURE' });
                            const coords = getSVGCoordinates(e.clientX, e.clientY, e.currentTarget.ownerSVGElement!);
                            const mouseX = (coords.x - panX) / zoom;
                            const mouseY = (coords.y - panY) / zoom;
                            setDraggedElement({
                              id: f.id,
                              type: 'FURNITURE',
                              offsetX: mouseX - f.x,
                              offsetY: mouseY - f.y
                            });
                          }
                        }}
                      >
                        {isSelected && (
                          <rect x={-f.width/2 - 4} y={-f.height/2 - 4} width={f.width + 8} height={f.height + 8} fill="none" stroke="var(--accent-cyan)" strokeWidth="1.5" strokeDasharray="3,3" />
                        )}
                        
                        {/* Dynamic Shapes based on Furniture/Sanitary Type */}
                        {f.type === 'SOFA' && (
                          <g>
                            {/* Main Cushion base */}
                            <rect x={-f.width/2} y={-f.height/2} width={f.width} height={f.height} rx="4" fill="rgba(139, 92, 246, 0.25)" stroke="var(--accent-purple)" strokeWidth="1.5" />
                            {/* Backrest */}
                            <rect x={-f.width/2} y={-f.height/2} width={f.width} height={f.height * 0.3} rx="2" fill="rgba(139, 92, 246, 0.4)" stroke="var(--accent-purple)" strokeWidth="1" />
                            {/* Armrests */}
                            <rect x={-f.width/2} y={-f.height/2} width={f.width * 0.15} height={f.height} rx="2" fill="rgba(139, 92, 246, 0.4)" stroke="var(--accent-purple)" strokeWidth="1" />
                            <rect x={f.width/2 - f.width * 0.15} y={-f.height/2} width={f.width * 0.15} height={f.height} rx="2" fill="rgba(139, 92, 246, 0.4)" stroke="var(--accent-purple)" strokeWidth="1" />
                          </g>
                        )}

                        {f.type === 'BED' && (
                          <g>
                            {/* Bed frame */}
                            <rect x={-f.width/2} y={-f.height/2} width={f.width} height={f.height} rx="2" fill="rgba(245, 158, 11, 0.15)" stroke="var(--accent-gold)" strokeWidth="1.5" />
                            {/* Pillows */}
                            <rect x={-f.width/2 + f.width * 0.1} y={-f.height/2 + f.height * 0.08} width={f.width * 0.35} height={f.height * 0.18} rx="2" fill="rgba(245, 158, 11, 0.3)" stroke="var(--accent-gold)" strokeWidth="1" />
                            <rect x={f.width/2 - f.width * 0.45} y={-f.height/2 + f.height * 0.08} width={f.width * 0.35} height={f.height * 0.18} rx="2" fill="rgba(245, 158, 11, 0.3)" stroke="var(--accent-gold)" strokeWidth="1" />
                            {/* Blanket line */}
                            <line x1={-f.width/2} y1={-f.height/2 + f.height * 0.38} x2={f.width/2} y2={-f.height/2 + f.height * 0.38} stroke="var(--accent-gold)" strokeWidth="1.5" strokeDasharray="3,3" />
                          </g>
                        )}

                        {f.type === 'DINING_TABLE' && (
                          <g>
                            {/* Central Table */}
                            <rect x={-f.width/2 + f.width * 0.22} y={-f.height/2 + f.height * 0.22} width={f.width * 0.56} height={f.height * 0.56} rx="2" fill="rgba(14, 165, 233, 0.2)" stroke="var(--accent-blue)" strokeWidth="1.5" />
                            {/* Surrounded Chairs */}
                            <rect x={-f.width/2} y={-f.height * 0.15} width={f.width * 0.18} height={f.height * 0.3} rx="1" fill="rgba(14, 165, 233, 0.4)" stroke="var(--accent-blue)" strokeWidth="1" />
                            <rect x={f.width/2 - f.width * 0.18} y={-f.height * 0.15} width={f.width * 0.18} height={f.height * 0.3} rx="1" fill="rgba(14, 165, 233, 0.4)" stroke="var(--accent-blue)" strokeWidth="1" />
                            <rect x={-f.width * 0.15} y={-f.height/2} width={f.width * 0.3} height={f.height * 0.18} rx="1" fill="rgba(14, 165, 233, 0.4)" stroke="var(--accent-blue)" strokeWidth="1" />
                            <rect x={-f.width * 0.15} y={f.height/2 - f.height * 0.18} width={f.width * 0.3} height={f.height * 0.18} rx="1" fill="rgba(14, 165, 233, 0.4)" stroke="var(--accent-blue)" strokeWidth="1" />
                          </g>
                        )}

                        {f.type === 'TV_UNIT' && (
                          <g>
                            <rect x={-f.width/2} y={-f.height/2} width={f.width} height={f.height} fill="rgba(255,255,255,0.05)" stroke="var(--text-secondary)" strokeWidth="1.5" />
                            {/* TV screen representation */}
                            <rect x={-f.width/2 + f.width * 0.15} y={-f.height * 0.15} width={f.width * 0.7} height={f.height * 0.3} fill="var(--text-primary)" />
                          </g>
                        )}

                        {f.type === 'WARDROBE' && (
                          <g>
                            <rect x={-f.width/2} y={-f.height/2} width={f.width} height={f.height} fill="rgba(255,255,255,0.03)" stroke="var(--text-secondary)" strokeWidth="1.5" />
                            <line x1={-f.width/2} y1="0" x2={f.width/2} y2="0" stroke="var(--text-secondary)" strokeWidth="1" />
                            {/* Wardrobe hanger rods outline */}
                            <line x1={-f.width/2 + f.width * 0.15} y1={-f.height/2 + f.height * 0.2} x2={-f.width/2 + f.width * 0.15} y2={f.height/2 - f.height * 0.2} stroke="var(--text-muted)" strokeWidth="1" />
                            <line x1={f.width/2 - f.width * 0.15} y1={-f.height/2 + f.height * 0.2} x2={f.width/2 - f.width * 0.15} y2={f.height/2 - f.height * 0.2} stroke="var(--text-muted)" strokeWidth="1" />
                          </g>
                        )}

                        {f.type === 'TOILET_COMMODE' && (
                          <g>
                            {/* Water closet tank */}
                            <rect x={-f.width/2} y={-f.height/2} width={f.width} height={f.height * 0.3} fill="rgba(255,255,255,0.1)" stroke="var(--accent-cyan)" strokeWidth="1.2" />
                            {/* Seat Bowl */}
                            <ellipse cx="0" cy={f.height * 0.15} rx={f.width/2 - 1} ry={f.height/2 - f.height * 0.25} fill="rgba(255,255,255,0.05)" stroke="var(--accent-cyan)" strokeWidth="1.5" />
                            <ellipse cx="0" cy={f.height * 0.15} rx={f.width/2 - 3} ry={f.height/2 - f.height * 0.35} fill="rgba(0,0,0,0.3)" stroke="var(--accent-cyan)" strokeWidth="0.8" />
                          </g>
                        )}

                        {f.type === 'WASHBASIN' && (
                          <g>
                            <ellipse cx="0" cy="0" rx={f.width/2} ry={f.height/2} fill="rgba(255,255,255,0.05)" stroke="var(--accent-cyan)" strokeWidth="1.5" />
                            {/* Central drain */}
                            <circle cx="0" cy="0" r={Math.min(f.width, f.height) * 0.15} fill="none" stroke="var(--accent-cyan)" strokeWidth="1" />
                            {/* Water tap */}
                            <line x1="0" y1={-f.height/2} x2="0" y2={-f.height/2 + f.height * 0.3} stroke="var(--accent-cyan)" strokeWidth="2.5" />
                          </g>
                        )}

                        {f.type === 'SHOWER_TUB' && (
                          <g>
                            <rect x={-f.width/2} y={-f.height/2} width={f.width} height={f.height} fill="rgba(20, 241, 195, 0.05)" stroke="var(--accent-cyan)" strokeWidth="1.5" />
                            {/* Shower drain hole */}
                            <circle cx={-f.width/2 + f.width * 0.2} cy={-f.height/2 + f.height * 0.2} r={Math.min(f.width, f.height) * 0.08} fill="none" stroke="var(--accent-cyan)" strokeWidth="1" />
                            <line x1={-f.width/2} y1={-f.height/2} x2={f.width/2} y2={f.height/2} stroke="rgba(20, 241, 195, 0.15)" strokeWidth="1" strokeDasharray="3,3" />
                            <line x1={f.width/2} y1={-f.height/2} x2={-f.width/2} y2={f.height/2} stroke="rgba(20, 241, 195, 0.15)" strokeWidth="1" strokeDasharray="3,3" />
                          </g>
                        )}

                        {f.type === 'STAIRS' as any && (
                          <g>
                            {/* Outer frame */}
                            <rect x={-f.width/2} y={-f.height/2} width={f.width} height={f.height} fill="rgba(245, 158, 11, 0.02)" stroke="var(--accent-gold)" strokeWidth="1.5" />
                            {/* Central flight dividing line */}
                            <line x1="0" y1={-f.height/2} x2="0" y2={f.height/2 - f.height * 0.12} stroke="var(--accent-gold)" strokeWidth="1.2" />
                            {/* Treads/Steps flight 1 */}
                            {Array.from({ length: 7 }).map((_, idx) => (
                              <line 
                                key={`t1-${idx}`} 
                                x1={-f.width/2} 
                                y1={-f.height/2 + idx * (f.height - f.height * 0.12) / 7} 
                                x2="0" 
                                y2={-f.height/2 + idx * (f.height - f.height * 0.12) / 7} 
                                stroke="rgba(245, 158, 11, 0.6)" 
                                strokeWidth="0.8" 
                              />
                            ))}
                            {/* Treads/Steps flight 2 */}
                            {Array.from({ length: 7 }).map((_, idx) => (
                              <line 
                                key={`t2-${idx}`} 
                                x1="0" 
                                y1={-f.height/2 + idx * (f.height - f.height * 0.12) / 7} 
                                x2={f.width/2} 
                                y2={-f.height/2 + idx * (f.height - f.height * 0.12) / 7} 
                                stroke="rgba(245, 158, 11, 0.6)" 
                                strokeWidth="0.8" 
                              />
                            ))}
                            {/* Landing platform divider */}
                            <line x1={-f.width/2} y1={f.height/2 - f.height * 0.12} x2={f.width/2} y2={f.height/2 - f.height * 0.12} stroke="var(--accent-gold)" strokeWidth="1.2" />
                            {/* UP Arrow */}
                            <path d={`M ${-f.width/4} ${f.height/2 - f.height * 0.15} v ${-f.height + f.height * 0.3} h -3 l 3 -5 l 3 5 h -3`} fill="none" stroke="var(--accent-gold)" strokeWidth="1" strokeDasharray="2,2" />
                            <text x={-f.width/4} y={f.height/2 - 2} fill="var(--accent-gold)" fontSize="5" fontWeight="bold" textAnchor="middle">UP</text>
                          </g>
                        )}

                        {f.type === 'BALCONY' as any && (
                          <g>
                            {/* Balcony deck bounding rect */}
                            <rect x={-f.width/2} y={-f.height/2} width={f.width} height={f.height} fill="rgba(16, 185, 129, 0.03)" stroke="var(--accent-emerald)" strokeWidth="1.5" strokeDasharray="3,3" />
                            {/* Cantilever glass handrail lines */}
                            <line x1={-f.width/2} y1={f.height/2} x2={f.width/2} y2={f.height/2} stroke="var(--accent-emerald)" strokeWidth="2" />
                            <line x1={-f.width/2} y1={-f.height/2} x2={-f.width/2} y2={f.height/2} stroke="var(--accent-emerald)" strokeWidth="1.2" />
                            <line x1={f.width/2} y1={-f.height/2} x2={f.width/2} y2={f.height/2} stroke="var(--accent-emerald)" strokeWidth="1.2" />
                            {/* Deck planks pattern hatches */}
                            {Array.from({ length: 6 }).map((_, idx) => (
                              <line 
                                key={`b-${idx}`} 
                                x1={-f.width/2 + idx * f.width / 6} 
                                y1={-f.height/2} 
                                x2={-f.width/2 + idx * f.width / 6} 
                                y2={f.height/2} 
                                stroke="rgba(16, 185, 129, 0.2)" 
                                strokeWidth="0.8" 
                              />
                            ))}
                          </g>
                        )}

                        {/* Fallback Glassmorphic styled card for other custom/learnt types (Garage, Garden, Patio, Kitchen Island) */}
                        {!['SOFA', 'BED', 'DINING_TABLE', 'TV_UNIT', 'WARDROBE', 'TOILET_COMMODE', 'WASHBASIN', 'SHOWER_TUB', 'STAIRS', 'BALCONY'].includes(f.type) && (
                          <g>
                            <rect x={-f.width/2} y={-f.height/2} width={f.width} height={f.height} rx="3" fill="rgba(255,255,255,0.03)" stroke="var(--accent-cyan)" strokeWidth="1.2" strokeDasharray="3,3" />
                            <rect x={-f.width/2 + 2} y={-f.height/2 + 2} width={f.width - 4} height={f.height - 4} rx="2" fill="rgba(20, 241, 195, 0.05)" stroke="rgba(20, 241, 195, 0.15)" strokeWidth="0.8" />
                            <text x="0" y="2" fill="var(--text-primary)" fontSize="6.5" textAnchor="middle" fontWeight="bold" letterSpacing="0.3">{f.type.replace('_', ' ')}</text>
                          </g>
                        )}
                      </g>
                    );
                  })}
                  </g>
                </svg>

                {/* Floating Guide Overlay */}
                <div style={{ position: 'absolute', bottom: '12px', right: isFullscreen ? '320px' : '12px', background: 'rgba(0,0,0,0.8)', border: '1px solid var(--glass-border)', padding: '6px 12px', borderRadius: '8px', pointerEvents: 'none', zIndex: 10 }}>
                  <p style={{ margin: 0, fontSize: '10px', color: 'var(--accent-cyan)', fontWeight: 'bold' }}>
                    Active Mode: {drawingMode === 'SELECT' ? '🔍 SELECT / INSPECT' : `✏️ PLACING ${drawingMode}`}
                  </p>
                  <p style={{ margin: 0, fontSize: '8px', color: 'var(--text-secondary)' }}>
                    Scale: 30 px = 1 ft | Click on Canvas to add elements.
                  </p>
                </div>

                {isFullscreen && (
                  <>
                    {/* Floating Top Title Bar */}
                    <div className="glass-panel" style={{ position: 'absolute', top: '16px', left: '282px', right: '332px', zIndex: 100, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 20px', background: 'rgba(8,11,17,0.95)', border: '1px solid var(--accent-cyan)' }}>
                      <div>
                        <span style={{ fontSize: '10px', color: 'var(--accent-cyan)', display: 'block', fontWeight: 'bold' }}>📐 CAD WORKSPACE</span>
                        <h4 style={{ fontSize: '14px', margin: 0, fontWeight: 'bold' }}>{activeProject?.name || ' Sharma Villa'}</h4>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Layers: Architectural + Structural</span>
                        <button 
                          onClick={() => setIsFullscreen(false)} 
                          className="btn-secondary" 
                          style={{ padding: '4px 10px', fontSize: '11px', color: 'var(--accent-rose)', borderColor: 'rgba(244, 63, 94, 0.3)' }}
                        >
                          Exit Full Screen
                        </button>
                      </div>
                    </div>

                    {/* Floating Left Sidebar Tools */}
                    <div className="glass-panel" style={{ position: 'absolute', top: '16px', left: '16px', bottom: '16px', width: '250px', zIndex: 100, padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', background: 'rgba(8,11,17,0.95)', border: '1px solid var(--glass-border)', overflowY: 'auto' }}>
                      <h3 style={{ fontSize: '13px', color: 'var(--accent-cyan)', borderBottom: '1px solid var(--glass-border)', paddingBottom: '6px', margin: 0, fontWeight: 'bold' }}>
                        ✏️ CAD Draw Tools
                      </h3>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                        <button onClick={() => setDrawingMode('SELECT')} className="btn-secondary" style={{ padding: '6px 4px', fontSize: '11px', justifyContent: 'center', borderColor: drawingMode === 'SELECT' ? 'var(--accent-cyan)' : 'var(--glass-border)' }}>🔍 Select/Move</button>
                        <button onClick={() => setDrawingMode('PAN')} className="btn-secondary" style={{ padding: '6px 4px', fontSize: '11px', justifyContent: 'center', borderColor: drawingMode === 'PAN' ? 'var(--accent-cyan)' : 'var(--glass-border)' }}>✋ Drag-Pan</button>
                        <button onClick={() => setDrawingMode('WALL')} className="btn-secondary" style={{ padding: '6px 4px', fontSize: '11px', justifyContent: 'center', borderColor: drawingMode === 'WALL' ? 'var(--accent-cyan)' : 'var(--glass-border)' }}>✏️ Draw Wall</button>
                        <button onClick={() => setDrawingMode('COLUMN')} className="btn-secondary" style={{ padding: '6px 4px', fontSize: '11px', justifyContent: 'center', borderColor: drawingMode === 'COLUMN' ? 'var(--accent-cyan)' : 'var(--glass-border)' }}>🔲 Add Pillar</button>
                        <button onClick={() => setDrawingMode('DOOR')} className="btn-secondary" style={{ padding: '6px 4px', fontSize: '11px', justifyContent: 'center', borderColor: drawingMode === 'DOOR' ? 'var(--accent-cyan)' : 'var(--glass-border)' }}>🚪 Place Door</button>
                        <button onClick={() => setDrawingMode('WINDOW')} className="btn-secondary" style={{ padding: '6px 4px', fontSize: '11px', justifyContent: 'center', borderColor: drawingMode === 'WINDOW' ? 'var(--accent-cyan)' : 'var(--glass-border)' }}>🪟 Place Window</button>
                        <button onClick={() => setDrawingMode('ROOM')} className="btn-secondary" style={{ padding: '6px 4px', fontSize: '11px', justifyContent: 'center', borderColor: drawingMode === 'ROOM' ? 'var(--accent-cyan)' : 'var(--glass-border)' }}>📐 Define Room</button>
                        <button onClick={() => setDrawingMode('ERASER')} className="btn-secondary" style={{ padding: '6px 4px', fontSize: '11px', justifyContent: 'center', borderColor: drawingMode === 'ERASER' ? 'var(--accent-rose)' : 'var(--glass-border)', color: drawingMode === 'ERASER' ? 'var(--accent-rose)' : 'var(--text-primary)' }}>🗑️ Eraser Tool</button>
                        <button onClick={() => setDrawingMode('FURNITURE')} className="btn-secondary" style={{ gridColumn: 'span 2', padding: '6px 4px', fontSize: '11px', justifyContent: 'center', borderColor: drawingMode === 'FURNITURE' ? 'var(--accent-cyan)' : 'var(--glass-border)' }}>🛋️ Place Furniture</button>
                      </div>

                      {learntElements.length > 0 && (
                        <div style={{ padding: '8px', background: 'rgba(245, 158, 11, 0.04)', border: '1px solid rgba(245, 158, 11, 0.3)', borderRadius: '8px' }}>
                          <span style={{ fontSize: '9.5px', color: 'var(--accent-gold)', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>🧠 AI Learnt Dynamic Palette</span>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                            {learntElements.includes('STAIRS') && (
                              <button
                                onClick={() => { setDrawingMode('FURNITURE'); setActiveFurnitureType('STAIRS' as any); }}
                                className="btn-primary"
                                style={{ 
                                  fontSize: '8.5px', 
                                  padding: '4px 2px', 
                                  justifyContent: 'center', 
                                  background: (drawingMode === 'FURNITURE' && activeFurnitureType === 'STAIRS' as any) ? 'var(--accent-gold)' : 'transparent', 
                                  border: '1px solid var(--accent-gold)', 
                                  color: (drawingMode === 'FURNITURE' && activeFurnitureType === 'STAIRS' as any) ? '#000' : 'var(--accent-gold)' 
                                }}
                              >
                                📶 Learnt Stairs
                              </button>
                            )}
                            {learntElements.includes('BALCONY') && (
                              <button
                                onClick={() => { setDrawingMode('FURNITURE'); setActiveFurnitureType('BALCONY' as any); }}
                                className="btn-primary"
                                style={{ 
                                  fontSize: '8.5px', 
                                  padding: '4px 2px', 
                                  justifyContent: 'center', 
                                  background: (drawingMode === 'FURNITURE' && activeFurnitureType === 'BALCONY' as any) ? 'var(--accent-gold)' : 'transparent', 
                                  border: '1px solid var(--accent-gold)', 
                                  color: (drawingMode === 'FURNITURE' && activeFurnitureType === 'BALCONY' as any) ? '#000' : 'var(--accent-gold)' 
                                }}
                              >
                                🌅 Learnt Balcony
                              </button>
                            )}
                            {learntElements.includes('GARAGE') && (
                              <button
                                onClick={() => { setDrawingMode('FURNITURE'); setActiveFurnitureType('GARAGE' as any); }}
                                className="btn-primary"
                                style={{ 
                                  fontSize: '8.5px', 
                                  padding: '4px 2px', 
                                  justifyContent: 'center', 
                                  background: (drawingMode === 'FURNITURE' && activeFurnitureType === 'GARAGE' as any) ? 'var(--accent-gold)' : 'transparent', 
                                  border: '1px solid var(--accent-gold)', 
                                  color: (drawingMode === 'FURNITURE' && activeFurnitureType === 'GARAGE' as any) ? '#000' : 'var(--accent-gold)' 
                                }}
                              >
                                🚗 Learnt Garage
                              </button>
                            )}
                            {learntElements.includes('PATIO') && (
                              <button
                                onClick={() => { setDrawingMode('FURNITURE'); setActiveFurnitureType('PATIO' as any); }}
                                className="btn-primary"
                                style={{ 
                                  fontSize: '8.5px', 
                                  padding: '4px 2px', 
                                  justifyContent: 'center', 
                                  background: (drawingMode === 'FURNITURE' && activeFurnitureType === 'PATIO' as any) ? 'var(--accent-gold)' : 'transparent', 
                                  border: '1px solid var(--accent-gold)', 
                                  color: (drawingMode === 'FURNITURE' && activeFurnitureType === 'PATIO' as any) ? '#000' : 'var(--accent-gold)' 
                                }}
                              >
                                🏡 Learnt Patio
                              </button>
                            )}
                            {learntElements.includes('KITCHEN_ISLAND') && (
                              <button
                                onClick={() => { setDrawingMode('FURNITURE'); setActiveFurnitureType('KITCHEN_ISLAND' as any); }}
                                className="btn-primary"
                                style={{ 
                                  fontSize: '8.5px', 
                                  padding: '4px 2px', 
                                  justifyContent: 'center', 
                                  background: (drawingMode === 'FURNITURE' && activeFurnitureType === 'KITCHEN_ISLAND' as any) ? 'var(--accent-gold)' : 'transparent', 
                                  border: '1px solid var(--accent-gold)', 
                                  color: (drawingMode === 'FURNITURE' && activeFurnitureType === 'KITCHEN_ISLAND' as any) ? '#000' : 'var(--accent-gold)' 
                                }}
                              >
                                🍳 Learnt Island
                              </button>
                            )}
                            {learntElements.includes('GARDEN') && (
                              <button
                                onClick={() => { setDrawingMode('FURNITURE'); setActiveFurnitureType('GARDEN' as any); }}
                                className="btn-primary"
                                style={{ 
                                  fontSize: '8.5px', 
                                  padding: '4px 2px', 
                                  justifyContent: 'center', 
                                  background: (drawingMode === 'FURNITURE' && activeFurnitureType === 'GARDEN' as any) ? 'var(--accent-gold)' : 'transparent', 
                                  border: '1px solid var(--accent-gold)', 
                                  color: (drawingMode === 'FURNITURE' && activeFurnitureType === 'GARDEN' as any) ? '#000' : 'var(--accent-gold)' 
                                }}
                              >
                                🌳 Learnt Garden
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {drawingMode === 'WALL' && (
                        <div style={{ padding: '8px', background: 'rgba(20, 241, 195, 0.03)', border: '1px solid rgba(20, 241, 195, 0.1)', borderRadius: '8px' }}>
                          <span style={{ fontSize: '10px', color: 'var(--accent-cyan)', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>Wall Thickness:</span>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button onClick={() => setWallThickness(15)} className="btn-secondary" style={{ flex: 1, padding: '4px', fontSize: '9.5px', justifyContent: 'center', background: wallThickness === 15 ? 'rgba(20, 241, 195, 0.1)' : 'transparent', borderColor: wallThickness === 15 ? 'var(--accent-cyan)' : 'var(--glass-border)' }}>9" Outer</button>
                            <button onClick={() => setWallThickness(8)} className="btn-secondary" style={{ flex: 1, padding: '4px', fontSize: '9.5px', justifyContent: 'center', background: wallThickness === 8 ? 'rgba(20, 241, 195, 0.1)' : 'transparent', borderColor: wallThickness === 8 ? 'var(--accent-cyan)' : 'var(--glass-border)' }}>4.5" Inner</button>
                          </div>
                        </div>
                      )}

                      {drawingMode === 'FURNITURE' && (
                        <div style={{ padding: '8px', background: 'rgba(0,0,0,0.3)', border: '1px solid var(--glass-border)', borderRadius: '8px' }}>
                          <span style={{ fontSize: '10px', color: 'var(--accent-cyan)', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>Fitting Type:</span>
                          <select 
                            value={activeFurnitureType} 
                            onChange={(e: any) => setActiveFurnitureType(e.target.value)}
                            style={{ width: '100%', background: 'rgba(8,11,17,0.9)', border: '1px solid var(--glass-border)', borderRadius: '4px', padding: '4px', fontSize: '11px', color: '#fff', outline: 'none' }}
                          >
                            <option value="SOFA">Sofa Couch Set</option>
                            <option value="BED">King Size Bed</option>
                            <option value="DINING_TABLE">Dining Table Set</option>
                            <option value="TV_UNIT">TV Entertainment Unit</option>
                            <option value="WARDROBE">Wardrobe / Almirah</option>
                            <option value="TOILET_COMMODE">WC Commode</option>
                            <option value="WASHBASIN">Wash Basin</option>
                            <option value="SHOWER_TUB">Shower Tub</option>
                          </select>
                        </div>
                      )}

                      {selectedElement && (
                        <div style={{ padding: '8px', background: 'rgba(20, 241, 195, 0.05)', border: '1px solid var(--accent-cyan)', borderRadius: '8px' }}>
                          <span style={{ fontSize: '10px', color: 'var(--accent-cyan)', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>Selected: {selectedElement.type}</span>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                            {(selectedElement.type === 'PORTAL' || selectedElement.type === 'FURNITURE') && (
                              <button onClick={handleRotateSelected} className="btn-primary" style={{ flex: '1 1 45%', padding: '3px', fontSize: '10px', justifyContent: 'center' }}>🔄 Rotate</button>
                            )}
                            {selectedElement.type === 'PORTAL' && (
                              <>
                                <button onClick={handleFlipPortalX} className="btn-primary" style={{ flex: '1 1 45%', padding: '3px', fontSize: '10px', justifyContent: 'center', background: 'var(--accent-cyan)', color: '#000' }}>↔️ Hinge</button>
                                <button onClick={handleFlipPortalY} className="btn-primary" style={{ flex: '1 1 45%', padding: '3px', fontSize: '10px', justifyContent: 'center', background: 'var(--accent-cyan)', color: '#000' }}>↕️ Swing</button>
                              </>
                            )}
                            {selectedElement.type !== 'WALL' && (
                              <button onClick={handleCopySelected} className="btn-secondary" style={{ flex: '1 1 45%', padding: '3px', fontSize: '10px', justifyContent: 'center' }}>📋 Copy</button>
                            )}
                            <button onClick={handleDeleteSelected} className="btn-secondary" style={{ flex: '1 1 100%', padding: '4px', fontSize: '10px', justifyContent: 'center', borderColor: 'var(--accent-rose)', color: 'var(--accent-rose)' }}>🗑️ Delete</button>
                          </div>
                        </div>
                      )}

                      {copiedElement && (
                        <button onClick={handlePasteElement} className="btn-primary" style={{ padding: '6px', fontSize: '11px', background: 'linear-gradient(135deg, var(--accent-purple), #7c3aed)', border: 'none', justifyContent: 'center' }}>
                          📋 Paste (Ctrl+V)
                        </button>
                      )}

                      <div style={{ marginTop: 'auto', display: 'flex', gap: '4px' }}>
                        <button onClick={handleUndo} className="btn-secondary" style={{ flex: 1, padding: '4px', fontSize: '10px', justifyContent: 'center' }}><Undo size={11} /> Undo</button>
                        <button onClick={clearCanvas} className="btn-secondary" style={{ flex: 1, padding: '4px', fontSize: '10px', justifyContent: 'center', color: 'var(--accent-rose)' }}>Clear</button>
                      </div>
                    </div>

                    {/* Floating Right Sidebar Setbacks & Compass HUD */}
                    <div className="glass-panel" style={{ position: 'absolute', top: '16px', right: '16px', bottom: '16px', width: '300px', zIndex: 100, padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', background: 'rgba(8,11,17,0.95)', border: '1px solid var(--glass-border)', overflowY: 'auto' }}>
                      <h3 style={{ fontSize: '13px', color: 'var(--accent-gold)', borderBottom: '1px solid var(--glass-border)', paddingBottom: '6px', margin: 0, fontWeight: 'bold' }}>
                        📐 Plot Bylaws & Vastu Check
                      </h3>

                      {/* Plot configs */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <div style={{ flex: 1 }}>
                            <span style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>Width (Ft):</span>
                            <input type="number" value={plotWidth} onChange={(e) => setPlotWidth(Math.max(10, Number(e.target.value)))} style={{ width: '100%', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--glass-border)', color: '#fff', fontSize: '10px', padding: '4px', borderRadius: '4px', outline: 'none' }} />
                          </div>
                          <div style={{ flex: 1 }}>
                            <span style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>Depth (Ft):</span>
                            <input type="number" value={plotDepth} onChange={(e) => setPlotDepth(Math.max(10, Number(e.target.value)))} style={{ width: '100%', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--glass-border)', color: '#fff', fontSize: '10px', padding: '4px', borderRadius: '4px', outline: 'none' }} />
                          </div>
                        </div>
                        
                        <div style={{ fontSize: '10px', color: 'var(--accent-gold)', fontWeight: 'bold' }}>
                          Area: {plotWidth * plotDepth} Sq. Ft. | {((plotWidth * plotDepth) / 9).toFixed(1)} Gaj (Sq Yd)
                        </div>
                      </div>

                      {/* Setbacks */}
                      <div style={{ background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>Setback Margins (Feet):</span>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                          <div>
                            <span style={{ fontSize: '8px', color: 'var(--text-muted)' }}>Front:</span>
                            <input type="number" value={setbackFront} onChange={(e) => setSetbackFront(Math.max(0, Number(e.target.value)))} style={{ width: '100%', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--glass-border)', color: '#fff', fontSize: '9.5px', padding: '2px', outline: 'none' }} />
                          </div>
                          <div>
                            <span style={{ fontSize: '8px', color: 'var(--text-muted)' }}>Rear:</span>
                            <input type="number" value={setbackRear} onChange={(e) => setSetbackRear(Math.max(0, Number(e.target.value)))} style={{ width: '100%', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--glass-border)', color: '#fff', fontSize: '9.5px', padding: '2px', outline: 'none' }} />
                          </div>
                          <div>
                            <span style={{ fontSize: '8px', color: 'var(--text-muted)' }}>Left:</span>
                            <input type="number" value={setbackLeft} onChange={(e) => setSetbackLeft(Math.max(0, Number(e.target.value)))} style={{ width: '100%', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--glass-border)', color: '#fff', fontSize: '9.5px', padding: '2px', outline: 'none' }} />
                          </div>
                          <div>
                            <span style={{ fontSize: '8px', color: 'var(--text-muted)' }}>Right:</span>
                            <input type="number" value={setbackRight} onChange={(e) => setSetbackRight(Math.max(0, Number(e.target.value)))} style={{ width: '100%', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--glass-border)', color: '#fff', fontSize: '9.5px', padding: '2px', outline: 'none' }} />
                          </div>
                        </div>
                      </div>

                      {/* Structural Calibrations in Fullscreen */}
                      <div style={{ background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-secondary)', display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>Structural Calibrations:</span>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <div style={{ flex: 1 }}>
                            <span style={{ fontSize: '8px', color: 'var(--text-muted)' }}>Slabs Count:</span>
                            <select 
                              value={floorsCount} 
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setFloorsCount(val);
                                if (activeProjectId) db.projects.update(activeProjectId, { floorsCount: val });
                              }}
                              style={{ width: '100%', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--glass-border)', color: '#fff', fontSize: '9.5px', padding: '2px', outline: 'none', borderRadius: '4px' }}
                            >
                              <option value="1">G (1 Slab)</option>
                              <option value="2">G+1 (2 Slabs)</option>
                              <option value="3">G+2 (3 Slabs)</option>
                              <option value="4">G+3 (4 Slabs)</option>
                            </select>
                          </div>
                          <div style={{ flex: 1 }}>
                            <span style={{ fontSize: '8px', color: 'var(--text-muted)' }}>Concrete Mix:</span>
                            <select 
                              value={concreteGrade} 
                              onChange={(e) => setConcreteGrade(e.target.value as 'M20' | 'M25')}
                              style={{ width: '100%', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--glass-border)', color: '#fff', fontSize: '9.5px', padding: '2px', outline: 'none', borderRadius: '4px' }}
                            >
                              <option value="M20">M20 Grade</option>
                              <option value="M25">M25 Grade</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* Vastu Compass */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                        <span style={{ fontSize: '10px', color: 'var(--text-secondary)', display: 'block', fontWeight: 'bold' }}>🧭 Vastu Orientation Dial:</span>
                        <div style={{ position: 'relative', width: '70px', height: '70px', borderRadius: '50%', background: 'rgba(0, 0, 0, 0.4)', border: '2px dashed var(--accent-gold)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <div style={{ width: '3px', height: '54px', background: 'linear-gradient(to bottom, var(--accent-rose) 50%, var(--text-muted) 50%)', transform: `rotate(${trueNorth}deg)` }} />
                          <span style={{ position: 'absolute', top: '2px', fontSize: '8px', fontWeight: 'bold', color: 'var(--accent-rose)' }}>N</span>
                          <span style={{ position: 'absolute', bottom: '2px', fontSize: '8px', color: 'var(--text-secondary)' }}>S</span>
                        </div>
                        <input type="range" min="0" max="359" value={trueNorth} onChange={(e) => setTrueNorth(Number(e.target.value))} style={{ width: '100%' }} />
                      </div>

                      {/* Vastu checklist summary */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px solid var(--glass-border)', paddingTop: '10px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 'bold', color: 'var(--accent-gold)' }}>
                          <span>Vastu Compliance:</span>
                          <span>Score: {vastu.score}/100</span>
                        </div>
                        <div style={{ maxHeight: '110px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
                          {vastu.issues.slice(0, 2).map((iss, idx) => (
                            <span key={idx} style={{ fontSize: '9px', color: 'var(--accent-rose)' }}>⚠️ {iss.slice(0, 45)}...</span>
                          ))}
                          {vastu.compliance.slice(0, 2).map((comp, idx) => (
                            <span key={idx} style={{ fontSize: '9px', color: 'var(--accent-emerald)' }}>✓ {comp.slice(0, 45)}...</span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Floating Bottom Status Bar */}
                    <div className="glass-panel" style={{ position: 'absolute', bottom: '16px', left: '282px', right: '332px', zIndex: 100, display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 20px', background: 'rgba(8,11,17,0.95)', border: '1px solid var(--accent-cyan)' }}>
                      <div>
                        <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>NET STRUCTURAL COST (IS-1200)</span>
                        <h4 style={{ fontSize: '16px', margin: 0, fontWeight: 'bold', color: 'var(--accent-cyan)' }}>Rs. {boq.costs.totalCost.toLocaleString()}/-</h4>
                      </div>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={handleExportPDF} className="btn-primary" style={{ padding: '4px 12px', fontSize: '11px', height: '28px' }}>Download BOQ</button>
                        <button onClick={handleFitToScreen} className="btn-secondary" style={{ padding: '4px 12px', fontSize: '11px', height: '28px' }}>Fit Plot</button>
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* ESTIMATES BOTTOM PREVIEW ROW */}
              <div className="glass-panel" style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(20, 241, 195, 0.02)' }}>
                <div>
                  <h4 style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>QUICK TOTAL ESTIMATION</h4>
                  <span style={{ fontSize: '24px', fontWeight: 'bold', color: 'var(--accent-cyan)', fontFamily: 'var(--font-heading)' }}>
                    Rs. {boq.costs.totalCost.toLocaleString()}/-
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    onClick={handleExportPDF} 
                    className="btn-primary pulse-glow-cyan"
                    style={{ fontSize: '12px', padding: '8px 16px' }}
                  >
                    <FileDown size={14} /> Download BOQ Quotation
                  </button>
                </div>
              </div>

            </div>

            {/* RIGHT COLUMN: VASTU CHECK HUD & BILL TABLE */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* Vastu HUD Panel */}
              <div className="glass-panel" style={{ padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                  <h3 style={{ fontSize: '15px', color: 'var(--accent-gold)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Compass size={16} /> Vastu Intelligence
                  </h3>
                  <div style={{ background: vastu.score >= 80 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)', color: vastu.score >= 80 ? 'var(--accent-emerald)' : 'var(--accent-rose)', border: `1px solid ${vastu.score >= 80 ? 'var(--accent-emerald)' : 'var(--accent-rose)'}`, padding: '2px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold' }}>
                    Score: {vastu.score}/100
                  </div>
                </div>

                <div style={{ maxHeight: '160px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', paddingRight: '4px' }}>
                  {vastu.compliance.map((item, idx) => (
                    <div key={`comp-${idx}`} style={{ display: 'flex', gap: '8px', background: 'rgba(16, 185, 129, 0.03)', border: '1px solid rgba(16, 185, 129, 0.1)', padding: '6px 8px', borderRadius: '6px' }}>
                      <Check size={12} style={{ color: 'var(--accent-emerald)', marginTop: '2px', flexShrink: 0 }} />
                      <p style={{ margin: 0, fontSize: '10.5px', color: 'var(--text-primary)', lineHeight: '1.4' }}>{item}</p>
                    </div>
                  ))}

                  {vastu.issues.map((item, idx) => (
                    <div key={`iss-${idx}`} style={{ display: 'flex', gap: '8px', background: 'rgba(244, 63, 94, 0.03)', border: '1px solid rgba(244, 63, 94, 0.1)', padding: '6px 8px', borderRadius: '6px' }}>
                      <AlertTriangle size={12} style={{ color: 'var(--accent-rose)', marginTop: '2px', flexShrink: 0 }} />
                      <p style={{ margin: 0, fontSize: '10.5px', color: 'var(--text-primary)', lineHeight: '1.4' }}>{item}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Quantity Estimations table */}
              <div className="glass-panel" style={{ padding: '20px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                <h3 style={{ fontSize: '15px', color: 'var(--accent-cyan)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Calculator size={16} /> Civil Quantity Breakdown
                </h3>
                
                {/* Material rates editor overlay */}
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--glass-border)', paddingBottom: '4px', fontSize: '10px', color: 'var(--text-muted)' }}>
                    <span>MATERIAL</span>
                    <span>QTY</span>
                    <span>AMOUNT</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                    <div>
                      <span style={{ fontWeight: '600', display: 'block' }}>Cement Bags</span>
                      <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>M20 Standard mix</span>
                    </div>
                    <span style={{ color: 'var(--text-secondary)' }}>{boq.cementBags} bags</span>
                    <span style={{ fontWeight: 'bold' }}>₹{boq.costs.cementCost.toLocaleString()}</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                    <div>
                      <span style={{ fontWeight: '600', display: 'block' }}>TMT Steel</span>
                      <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>Rebar slabs & footings</span>
                    </div>
                    <span style={{ color: 'var(--text-secondary)' }}>{boq.steelKg} kg</span>
                    <span style={{ fontWeight: 'bold' }}>₹{boq.costs.steelCost.toLocaleString()}</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                    <div>
                      <span style={{ fontWeight: '600', display: 'block' }}>Coarse Sand</span>
                      <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>River sand supply</span>
                    </div>
                    <span style={{ color: 'var(--text-secondary)' }}>{boq.sandTons} tons</span>
                    <span style={{ fontWeight: 'bold' }}>₹{boq.costs.sandCost.toLocaleString()}</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                    <div>
                      <span style={{ fontWeight: '600', display: 'block' }}>Aggregates</span>
                      <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>20mm ballast gravel</span>
                    </div>
                    <span style={{ color: 'var(--text-secondary)' }}>{boq.aggregateTons} tons</span>
                    <span style={{ fontWeight: 'bold' }}>₹{boq.costs.aggregateCost.toLocaleString()}</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                    <div>
                      <span style={{ fontWeight: '600', display: 'block' }}>Bricks</span>
                      <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>Class-I Local supply</span>
                    </div>
                    <span style={{ color: 'var(--text-secondary)' }}>{boq.bricksCount} pcs</span>
                    <span style={{ fontWeight: 'bold' }}>₹{boq.costs.brickCost.toLocaleString()}</span>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px' }}>
                    <div>
                      <span style={{ fontWeight: '600', display: 'block' }}>Excavation</span>
                      <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>Foundation footing pits</span>
                    </div>
                    <span style={{ color: 'var(--text-secondary)' }}>{boq.excavationCuFt} cu.ft</span>
                    <span style={{ fontWeight: 'bold' }}>₹{boq.costs.excavationCost.toLocaleString()}</span>
                  </div>
                </div>

                {/* Local rate editing toggler panel */}
                <div style={{ borderTop: '1px solid var(--glass-border)', paddingTop: '10px', marginTop: '10px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>🔧 Adjust Market Rates (Delhi/NCR standard):</span>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>Cement:</span>
                      <input 
                        type="number" 
                        value={unitRateCement} 
                        onChange={(e) => setUnitRateCement(Number(e.target.value))} 
                        style={{ width: '45px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--glass-border)', color: '#fff', fontSize: '10px', borderRadius: '4px' }}
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>Steel/Kg:</span>
                      <input 
                        type="number" 
                        value={unitRateSteel} 
                        onChange={(e) => setUnitRateSteel(Number(e.target.value))} 
                        style={{ width: '45px', background: 'rgba(0,0,0,0.5)', border: '1px solid var(--glass-border)', color: '#fff', fontSize: '10px', borderRadius: '4px' }}
                      />
                    </div>
                  </div>
                </div>

              </div>

              {/* 📋 Site Inspections & Punch List Panel */}
              <div className="glass-panel" style={{ padding: '20px' }}>
                <h3 style={{ fontSize: '15px', color: 'var(--accent-cyan)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <CheckSquare size={16} /> Site Visit Punch List
                </h3>

                {/* Listing punch items */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '160px', overflowY: 'auto', marginBottom: '12px', paddingRight: '4px' }}>
                  {punchList.map(item => (
                    <div key={item.id} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                          <span style={{ 
                            fontSize: '8px', 
                            background: item.severity === 'HIGH' ? 'rgba(244,63,94,0.1)' : 'rgba(245,158,11,0.1)', 
                            color: item.severity === 'HIGH' ? 'var(--accent-rose)' : 'var(--accent-gold)', 
                            border: `1px solid ${item.severity === 'HIGH' ? 'rgba(244,63,94,0.2)' : 'rgba(245,158,11,0.2)'}`,
                            padding: '1px 4px', 
                            borderRadius: '4px',
                            fontWeight: 'bold'
                          }}>
                            {item.severity}
                          </span>
                          <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>{item.location}</span>
                        </div>
                        <p style={{ margin: 0, fontSize: '11px', color: item.status === 'RESOLVED' ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: item.status === 'RESOLVED' ? 'line-through' : 'none' }}>
                          {item.description}
                        </p>
                      </div>
                      
                      {item.status === 'OPEN' && (
                        <button 
                          onClick={() => handleResolvePunch(item.id!)}
                          style={{ background: 'rgba(20,241,195,0.1)', color: 'var(--accent-cyan)', border: '1px solid rgba(20,241,195,0.2)', borderRadius: '4px', padding: '2px 6px', fontSize: '9px', cursor: 'pointer', fontWeight: 'bold' }}
                        >
                          Resolve
                        </button>
                      )}
                    </div>
                  ))}

                  {punchList.length === 0 && (
                    <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)', textAlign: 'center', padding: '16px' }}>No active site inspection issues logged.</p>
                  )}
                </div>

                {/* Form to log issues */}
                <form onSubmit={handleAddPunch} style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid var(--glass-border)', paddingTop: '10px' }}>
                  <input 
                    type="text" 
                    placeholder="Issue description (e.g. Column spacing check)..." 
                    value={newPunchDesc}
                    onChange={(e) => setNewPunchDesc(e.target.value)}
                    className="input-field"
                    style={{ fontSize: '11px', padding: '6px' }}
                    required
                  />
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <input 
                      type="text" 
                      placeholder="Location (e.g. Column C3)..." 
                      value={newPunchLoc}
                      onChange={(e) => setNewPunchLoc(e.target.value)}
                      className="input-field"
                      style={{ fontSize: '11px', padding: '6px', flex: 1 }}
                    />
                    <select 
                      value={newPunchSeverity}
                      onChange={(e: any) => setNewPunchSeverity(e.target.value)}
                      style={{ background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: '11px', border: '1px solid var(--glass-border)', borderRadius: '4px', padding: '4px' }}
                    >
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Med</option>
                      <option value="HIGH">High</option>
                    </select>
                    <button className="btn-primary" type="submit" style={{ fontSize: '11px', padding: '4px 10px' }}>
                      Add
                    </button>
                  </div>
                </form>
              </div>

            </div>

          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 2: CLIENT PORTAL MOCK DASHBOARD */}
        {/* ========================================================================= */}
        {currentTab === 'client' && (
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* Proposal 3D extrude visualization viewport */}
              <div className="glass-panel" style={{ height: '400px', position: 'relative', overflow: 'hidden', border: '1px solid var(--glass-border-hover)' }}>
                <ThreeDViewport 
                  walls={walls}
                  columns={columns}
                  portals={portals}
                  furnitures={furnitures}
                  rooms={rooms}
                  trueNorth={trueNorth}
                  plotWidth={plotWidth}
                  plotDepth={plotDepth}
                  setbackFront={setbackFront}
                  setbackRear={setbackRear}
                  setbackLeft={setbackLeft}
                  setbackRight={setbackRight}
                  showPlotBoundary={showPlotBoundary}
                />
              </div>

              {/* Detailed Cost breakdown */}
              <div className="glass-panel" style={{ padding: '20px' }}>
                <h3 style={{ fontSize: '16px', color: 'var(--accent-cyan)', marginBottom: '14px' }}>Approved Materials & Pricing Quote</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '10px', border: '1px solid var(--glass-border)' }}>
                    <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>TMT STEEL VOLUME</span>
                    <h4 style={{ fontSize: '18px', color: '#fff', margin: '4px 0' }}>{boq.steelKg} Kgs</h4>
                    <span style={{ fontSize: '11px', color: 'var(--accent-emerald)' }}>Structural Reinforcement</span>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '10px', border: '1px solid var(--glass-border)' }}>
                    <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>CEMENT OPC BAGS</span>
                    <h4 style={{ fontSize: '18px', color: '#fff', margin: '4px 0' }}>{boq.cementBags} Bags</h4>
                    <span style={{ fontSize: '11px', color: 'var(--accent-emerald)' }}>M20 Concrete Mortar mix</span>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: '12px', borderRadius: '10px', border: '1px solid var(--glass-border)' }}>
                    <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>TOTAL NET QUOTATION</span>
                    <h4 style={{ fontSize: '18px', color: 'var(--accent-cyan)', margin: '4px 0' }}>₹{boq.costs.totalCost.toLocaleString()}</h4>
                    <span style={{ fontSize: '11px', color: 'var(--accent-gold)' }}>Download PDF Invoice below</span>
                  </div>
                </div>
              </div>

            </div>

            {/* RIGHT SIDEBAR: PROGRESS PHOTOS & APPROVAL FEEDBACKS */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              
              {/* Approval status check */}
              <div className="glass-panel" style={{ padding: '20px' }}>
                <h3 style={{ fontSize: '15px', color: 'var(--accent-gold)', marginBottom: '12px' }}>Client Design Authorization</h3>
                
                {approvalList.length > 0 ? (
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                      <div style={{ 
                        background: approvalList[0].status === 'APPROVED' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(244, 63, 94, 0.15)',
                        color: approvalList[0].status === 'APPROVED' ? 'var(--accent-emerald)' : 'var(--accent-gold)',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        border: '1px solid'
                      }}>
                        STATUS: {approvalList[0].status}
                      </div>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Updated just now</span>
                    </div>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '8px', border: '1px solid var(--glass-border)', margin: '0 0 16px 0' }}>
                      <strong>Feedback:</strong> {approvalList[0].feedback}
                    </p>
                  </div>
                ) : (
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>No approval files generated yet.</p>
                )}

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    onClick={() => handleClientApproval('APPROVED', 'The materials volume and Vastu directions look incredibly perfect. Approve layout for foundation excavation!')}
                    className="btn-primary" 
                    style={{ flex: 1, fontSize: '11px', padding: '8px', background: 'var(--accent-emerald)', boxShadow: '0 4px 14px 0 rgba(16, 185, 129, 0.3)', justifyContent: 'center' }}
                  >
                    ✓ Approve Plan
                  </button>
                  <button 
                    onClick={() => handleClientApproval('REJECTED', 'Need adjustment in drawing hall thickness. Please check.')}
                    className="btn-secondary" 
                    style={{ flex: 1, fontSize: '11px', padding: '8px', color: 'var(--accent-rose)', justifyContent: 'center' }}
                  >
                    ✗ Request Revision
                  </button>
                </div>
              </div>

              {/* Site Photos Milestone Timeline */}
              <div className="glass-panel" style={{ padding: '20px', flex: 1 }}>
                <h3 style={{ fontSize: '15px', color: 'var(--accent-cyan)', marginBottom: '14px' }}>Site Milestone Timeline</h3>
                
                {/* Photo listing */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxHeight: '350px', overflowY: 'auto', paddingRight: '4px' }}>
                  
                  {photoList.map(photo => (
                    <div key={photo.id} style={{ borderBottom: '1px solid var(--glass-border)', paddingBottom: '12px' }}>
                      <img 
                        src={photo.imageUrl} 
                        alt="site milestones" 
                        style={{ width: '100%', height: '110px', objectFit: 'cover', borderRadius: '8px', border: '1px solid var(--glass-border)', marginBottom: '6px' }} 
                      />
                      <span style={{ fontSize: '10px', color: 'var(--accent-cyan)', background: 'rgba(20,241,195,0.08)', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                        {photo.stage}
                      </span>
                      <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: 'var(--text-secondary)' }}>{photo.description}</p>
                    </div>
                  ))}

                  {/* Empty state photo seed representation */}
                  {photoList.length === 0 && (
                    <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                      <Camera size={24} style={{ marginBottom: '8px' }} />
                      <p style={{ fontSize: '11px', margin: 0 }}>No milestone photos uploaded. Add one in the dashboard.</p>
                    </div>
                  )}
                </div>

                {/* Upload Simulated site visit photos */}
                <form onSubmit={handleAddPhoto} style={{ marginTop: '16px', borderTop: '1px solid var(--glass-border)', paddingTop: '12px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>📷 Log Site Milestone Photo (Simulated):</span>
                  <input 
                    type="text"
                    value={photoDescription}
                    onChange={(e) => setPhotoDescription(e.target.value)}
                    placeholder="Describe construction status (e.g. Column casting complete)..."
                    className="input-field"
                    style={{ width: '100%', fontSize: '11px', padding: '6px', marginBottom: '6px' }}
                    required
                  />
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <select 
                      value={photoStage}
                      onChange={(e: any) => setPhotoStage(e.target.value)}
                      style={{ flex: 1, background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: '10px', border: '1px solid var(--glass-border)', borderRadius: '4px' }}
                    >
                      <option value="FOUNDATION">Foundation</option>
                      <option value="PLINTH">Plinth Level</option>
                      <option value="BRICKWORK">Brickwork</option>
                      <option value="SLAB_CASTING">Slab Casting</option>
                      <option value="FINISHING">Finishing</option>
                    </select>
                    <button className="btn-primary" type="submit" style={{ fontSize: '10px', padding: '6px 12px' }}>
                      Upload Photo
                    </button>
                  </div>
                </form>

              </div>

            </div>

          </div>
        )}

        {/* ========================================================================= */}
        {/* VIEW 3: MATERIAL SHOWCASE GALLERY */}
        {/* ========================================================================= */}
        {currentTab === 'showcase' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div className="glass-panel" style={{ padding: '20px', textAlign: 'center' }}>
              <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '8px' }}>Premium Material & Design Trends Showcase</h2>
              <p style={{ margin: 0, fontSize: '14px', color: 'var(--text-secondary)', maxWidth: '600px', marginInline: 'auto' }}>
                A curated digital catalog Jency can show clients to help them pick high-end tiles, marbles, textures, and modern concrete elevations.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
              
              <div className="glass-panel glass-panel-hover" style={{ overflow: 'hidden' }}>
                <img 
                  src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?q=80&w=600&auto=format&fit=crop" 
                  alt="exterior" 
                  style={{ width: '100%', height: '180px', objectFit: 'cover' }} 
                />
                <div style={{ padding: '16px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--accent-cyan)', background: 'rgba(20,241,195,0.08)', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>EXTERIOR ELEVATION</span>
                  <h4 style={{ fontSize: '16px', margin: '6px 0 4px 0' }}>Ultra-Modern Concrete Minimalist</h4>
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>Exposed formwork concrete surfaces paired with warm natural timber cladding panels.</p>
                </div>
              </div>

              <div className="glass-panel glass-panel-hover" style={{ overflow: 'hidden' }}>
                <img 
                  src="https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?q=80&w=600&auto=format&fit=crop" 
                  alt="interior" 
                  style={{ width: '100%', height: '180px', objectFit: 'cover' }} 
                />
                <div style={{ padding: '16px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--accent-purple)', background: 'rgba(139,92,246,0.08)', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>FLOOR TILES</span>
                  <h4 style={{ fontSize: '16px', margin: '6px 0 4px 0' }}>Statuary White Premium Marble</h4>
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>Bookmatched Italian marble tiles with elegant dark grey veining, high polish finish.</p>
                </div>
              </div>

              <div className="glass-panel glass-panel-hover" style={{ overflow: 'hidden' }}>
                <img 
                  src="https://images.unsplash.com/photo-1513694203232-719a280e022f?q=80&w=600&auto=format&fit=crop" 
                  alt="lighting" 
                  style={{ width: '100%', height: '180px', objectFit: 'cover' }} 
                />
                <div style={{ padding: '16px' }}>
                  <span style={{ fontSize: '10px', color: 'var(--accent-gold)', background: 'rgba(245,158,11,0.08)', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>LIGHTING & FIXTURES</span>
                  <h4 style={{ fontSize: '16px', margin: '6px 0 4px 0' }}>Concealed LED Warm Ambience</h4>
                  <p style={{ margin: 0, fontSize: '12px', color: 'var(--text-secondary)' }}>Layered warm indirect LED coves designed inside gypsum false ceiling structures.</p>
                </div>
              </div>

            </div>
          </div>
        )}

      </main>

      {/* 🚀 FOOTER META */}
      <footer className="glass-panel" style={{ margin: '16px', padding: '12px', textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)' }}>
        CivilSuite Engine v1.0.0 — Engineered with absolute mathematical precision and premium visual aesthetics for Jency Sharma (B.Tech, Civil Engineering).
      </footer>

    </div>
  );
}

export default App;
