import Dexie, { type Table } from 'dexie';

// Interfaces for our local-first Database

export interface UserProfile {
  id?: string;
  name: string;
  email: string;
  role: 'ENGINEER' | 'CLIENT';
  companyName?: string;
}

export interface Project {
  id?: number;
  name: string;
  address: string;
  plotAreaSqFt: number;
  soilType: 'CLAY' | 'BLACK_COTTON' | 'SANDY' | 'NORMAL';
  floorsCount: number; // 1 = G+0, 2 = G+1, 3 = G+2, etc.
  status: 'PLANNING' | 'DESIGNING' | 'ESTIMATED' | 'APPROVED' | 'ONGOING' | 'COMPLETED';
  createdAt: number;
  updatedAt: number;
}

export interface WallNode {
  id: string;
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  thickness: number; // in pixels (e.g. 15px is 9 inches)
}

export interface ColumnNode {
  id: string;
  x: number;
  y: number;
  size: number;
}

export interface PortalNode {
  id: string;
  type: 'DOOR' | 'DOUBLE_DOOR' | 'WINDOW';
  x: number;
  y: number;
  rotation: number;
  width: number;
  flippedX?: boolean;
  flippedY?: boolean;
}

export interface RoomNode {
  id: string;
  name: string;
  points: { x: number; y: number }[];
  areaSqFt: number;
}

export interface FurnitureNode {
  id: string;
  type: 'SOFA' | 'BED' | 'DINING_TABLE' | 'TV_UNIT' | 'WARDROBE' | 'TOILET_COMMODE' | 'WASHBASIN' | 'SHOWER_TUB';
  x: number;
  y: number;
  rotation: number;
  width: number;
  height: number;
}

export interface PlanData {
  walls: WallNode[];
  columns: ColumnNode[];
  portals: PortalNode[];
  rooms: RoomNode[];
  furnitures: FurnitureNode[];
  trueNorth: number; // angle in degrees (0 = Up/North, 90 = Right/East)
}

export interface Plan {
  id?: number;
  projectId: number;
  version: number;
  planData: PlanData; // Stored as a parsed JSON structure
  previewImage?: string; // Data URL of canvas preview
  createdAt: number;
  updatedAt: number;
}

export interface Estimate {
  id?: number;
  projectId: number;
  planId: number;
  cementBags: number;
  sandTons: number;
  aggregateTons: number;
  steelKg: number;
  bricksCount: number;
  excavationCuFt: number;
  unitRates: {
    cementBag: number;
    sandTon: number;
    aggregateTon: number;
    steelKg: number;
    brick: number;
    excavationCuFt: number;
  };
  totalCost: number;
  createdAt: number;
}

export interface ProgressPhoto {
  id?: number;
  projectId: number;
  imageUrl: string;
  description: string;
  stage: 'FOUNDATION' | 'PLINTH' | 'BRICKWORK' | 'SLAB_CASTING' | 'FINISHING';
  uploadedAt: number;
}

export interface PunchItem {
  id?: number;
  projectId: number;
  description: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';
  location: string;
  createdAt: number;
  updatedAt: number;
}

export interface Approval {
  id?: number;
  projectId: number;
  planId?: number;
  estimateId?: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  feedback: string;
  updatedAt: number;
}

// Main CivilSuite Database class
class CivilSuiteDatabase extends Dexie {
  projects!: Table<Project>;
  plans!: Table<Plan>;
  estimates!: Table<Estimate>;
  progressPhotos!: Table<ProgressPhoto>;
  punchItems!: Table<PunchItem>;
  approvals!: Table<Approval>;

  constructor() {
    super('CivilSuiteDatabase');
    
    // Schema definition for local storage
    this.version(1).stores({
      projects: '++id, name, status, createdAt',
      plans: '++id, projectId, version, createdAt',
      estimates: '++id, projectId, planId, createdAt',
      progressPhotos: '++id, projectId, stage, uploadedAt',
      punchItems: '++id, projectId, severity, status, createdAt',
      approvals: '++id, projectId, planId, estimateId, status'
    });
  }
}

export const db = new CivilSuiteDatabase();

// Helper seed data to populate database for Jency's showcase on first launch
export async function seedDemoData() {
  const projectCount = await db.projects.count();
  if (projectCount > 0) return; // DB already populated

  // 1. Seed a sample project for Jency
  const projectId = await db.projects.add({
    name: 'Sharma Villa Residence',
    address: 'Sector 15, Dwarka, New Delhi',
    plotAreaSqFt: 1800,
    soilType: 'NORMAL',
    floorsCount: 2, // G+1
    status: 'DESIGNING',
    createdAt: Date.now() - 5 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now()
  });

  // 2. Create coordinates for a sample floor plan
  const samplePlanData: PlanData = {
    walls: [
      { id: 'w1', startX: 300, startY: 300, endX: 1500, endY: 300, thickness: 45 },
      { id: 'w2', startX: 1500, startY: 300, endX: 1500, endY: 1200, thickness: 45 },
      { id: 'w3', startX: 1500, startY: 1200, endX: 300, endY: 1200, thickness: 45 },
      { id: 'w4', startX: 300, startY: 1200, endX: 300, endY: 300, thickness: 45 },
      // Inner wall partitioning bedroom/hall
      { id: 'w5', startX: 900, startY: 300, endX: 900, endY: 1200, thickness: 30 }
    ],
    columns: [
      { id: 'c1', x: 300, y: 300, size: 60 },
      { id: 'c2', x: 900, y: 300, size: 60 },
      { id: 'c3', x: 1500, y: 300, size: 60 },
      { id: 'c4', x: 300, y: 1200, size: 60 },
      { id: 'c5', x: 900, y: 1200, size: 60 },
      { id: 'c6', x: 1500, y: 1200, size: 60 }
    ],
    portals: [
      { id: 'p1', type: 'DOOR', x: 600, y: 1200, rotation: 0, width: 180 },
      { id: 'p2', type: 'WINDOW', x: 1200, y: 300, rotation: 0, width: 150 }
    ],
    rooms: [
      { id: 'r1', name: 'Master Bedroom', points: [{x:300, y:300}, {x:900, y:300}, {x:900, y:1200}, {x:300, y:1200}], areaSqFt: 600 },
      { id: 'r2', name: 'Drawing Hall', points: [{x:900, y:300}, {x:1500, y:300}, {x:1500, y:1200}, {x:900, y:1200}], areaSqFt: 600 }
    ],
    furnitures: [
      { id: 'f1', type: 'SOFA', x: 1200, y: 750, rotation: 0, width: 80, height: 35 },
      { id: 'f2', type: 'BED', x: 600, y: 600, rotation: 90, width: 60, height: 70 },
      { id: 'f3', type: 'TOILET_COMMODE', x: 420, y: 1050, rotation: 180, width: 22, height: 30 }
    ],
    trueNorth: 0 // True North is directly up
  };

  const planId = await db.plans.add({
    projectId: projectId,
    version: 1,
    planData: samplePlanData,
    createdAt: Date.now() - 4 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now()
  });

  // 3. Create a sample material estimate
  const estimateId = await db.estimates.add({
    projectId: projectId,
    planId: planId,
    cementBags: 340,
    sandTons: 45,
    aggregateTons: 60,
    steelKg: 2800,
    bricksCount: 16500,
    excavationCuFt: 1200,
    unitRates: {
      cementBag: 420,
      sandTon: 1200,
      aggregateTon: 1400,
      steelKg: 68,
      brick: 9,
      excavationCuFt: 15
    },
    totalCost: 512200, // Precalculated total
    createdAt: Date.now() - 3 * 24 * 60 * 60 * 1000
  });

  // 4. Create sample punch items
  await db.punchItems.add({
    projectId: projectId,
    description: 'Verify the grid spacing of column alignment C3-C5 at site',
    severity: 'MEDIUM',
    status: 'OPEN',
    location: 'Foundation Footing Area',
    createdAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now()
  });

  await db.punchItems.add({
    projectId: projectId,
    description: 'Cracks observed in local bricks supply. Request manufacturer quality report.',
    severity: 'HIGH',
    status: 'OPEN',
    location: 'Material Storage Yard',
    createdAt: Date.now() - 1 * 24 * 60 * 60 * 1000,
    updatedAt: Date.now()
  });

  // 5. Add a pending approval record
  await db.approvals.add({
    projectId: projectId,
    planId: planId,
    estimateId: estimateId,
    status: 'PENDING',
    feedback: 'Please review structural rebar volume calculations once. Otherwise the floor plan looks absolutely amazing!',
    updatedAt: Date.now()
  });
}
