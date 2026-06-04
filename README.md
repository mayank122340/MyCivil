# CivilSuite - AI-Powered 2D CAD Editor & Realistic 3D Visualizer

CivilSuite is a local-first, high-fidelity CAD editor and 3D visualization suite designed for architects, civil engineers, and clients. It enables users to draw 2D floor plans, place structural pillars/columns with intelligent grid-snapping, run real-time material estimators, and immediately visualize blueprints in a stunning 3D midnight-twilight environment with soft shadows and glowing interior ceiling lights.

---

## 🚀 Key Features

* **Interactive 2D CAD Canvas**: Complete drafting panel supporting walls, doors, windows, structural pillars, and furniture elements. 
* **Full Room & Wall Interactions**: Select, drag, delete, copy, paste, and rename rooms directly on the canvas. Rotate rooms (around their centroid) and walls (around their midpoint) by 90 degrees or via the `R` keyboard hotkey.
* **Automatic Soil & Material Estimator**: Instantly computes requirements for cement bags, sand, aggregates, steel volume, brick count, and excavation pits based on local soil calibrations and floor heights.
* **Realistic 3D Viewport**:
  * **Recursive Soft Shadows**: Enabled automatically on all architectural, portal, and furniture meshes (ignoring window glass).
  * **Interior Spotlight Fixtures**: Dynamic warm PointLights (`0xfff2e0`) are spawned at each room's centroid from ceiling fixtures, casting gorgeous interior gradients.
  * **Physical Materials**: Styled with Carrara marble bathroom tiles, warm Oakwood floorboards, industrial polished concrete, off-white plaster paint walls, and a forest green grass yard.
  * **Nocturnal twilight environment**: Deep blue twilight sky background (`0x0f172a`) and exp fog.
  * **Detailed Furniture Models**: Beds feature soft pillows and blankets, sofas feature cushions and arm throw pillows, and dining tables dynamically spawn surrounding chairs facing inward.
* **YOLOv8 AI Auto-Vectorizer**: Vectorizes raw uploaded 2D sketch plans into interactive CAD components.

---

## 🛠️ Technology Stack

### Frontend
* **Core**: React 18, Vite, TypeScript
* **3D Engine**: Three.js, OrbitControls
* **State & Local-First Database**: Dexie.js (IndexedDB wrapper for robust offline synchronization)
* **Styling**: Vanilla CSS, TailwindCSS (for utility layers)
* **Icons**: Lucide React

### Backend (AI Parser)
* **API Framework**: Python, FastAPI, Uvicorn
* **Computer Vision**: PyTorch, Ultralytics YOLOv8 (for object detection on 2D blueprints)

---

## 📂 Project Structure

```text
├── README.md               # Project guide and setup
├── package.json            # Frontend dependency manifest
├── tsconfig.json           # TypeScript configuration
├── index.html              # Frontend entry document
├── src/
│   ├── main.tsx            # React application entry point
│   ├── App.tsx             # Main CAD canvas, 3D viewport, & engine logic
│   ├── App.css             # Global UI animations and layout styles
│   ├── db/
│   │   └── db.ts           # Offline-first Dexie IndexedDB schemas & demo seed data
│   └── assets/             # Vector icons and images
├── public/                 # Favicons and blueprint test plans
└── ai-backend/             # Python YOLOv8 Computer Vision API
    ├── main.py             # FastAPI server entry point
    ├── requirements.txt    # Python package dependencies
    ├── best_furniture.pt   # Pretrained YOLOv8 weights for furniture
    └── best_structural.pt  # Pretrained YOLOv8 weights for structural features
```

---

## 💻 Installation & Local Setup

### Prerequisites
Make sure you have the following installed on your machine:
* **Node.js** (v18.0.0 or higher)
* **npm** (v9.0.0 or higher)
* **Python** (v3.9 or higher)
* **Git**

---

### Step 1: Clone the Repository
Clone this repository to your local PC using Git:
```bash
git clone https://github.com/mayank122340/MyCivil.git
cd MyCivil
```

---

### Step 2: Set Up and Run the Frontend (React + Vite)
Open a terminal in the project root directory (`MyCivil`) and run the following:

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start the local development server**:
   ```bash
   npm run dev
   ```
   *The frontend application will boot up at **`http://localhost:5173/`**.*

3. **Build for production** (optional):
   ```bash
   npm run build
   ```
   *This compiles TypeScript and outputs a minified production bundle in the `dist/` directory.*

---

### Step 3: Set Up and Run the AI Backend (Python + FastAPI)
Open a new terminal window, navigate to the `ai-backend` directory, and run the following:

1. **Navigate to backend**:
   ```bash
   cd ai-backend
   ```

2. **Create a virtual environment** (recommended):
   * **On Windows (PowerShell/CMD)**:
     ```powershell
     python -m venv venv
     .\venv\Scripts\activate
     ```
   * **On Mac/Linux**:
     ```bash
     python3 -m venv venv
     source venv/bin/activate
     ```

3. **Install python packages**:
   ```bash
   pip install -r requirements.txt
   ```
   *Note: If installing PyTorch takes time, ensure your pip version is updated.*

4. **Start the FastAPI backend server**:
   ```bash
   python main.py
   ```
   *The API server will launch at **`http://localhost:8000/`** with automated hot-reloading.*

Now, the frontend editor can make API vectorizer calls to the Python backend to scan 2D sketch uploads!
