from fastapi import FastAPI, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any
import uvicorn
import io
import os
from PIL import Image
from ultralytics import YOLO

# Initialize FastAPI
app = FastAPI(title="Civil Engineer Super Ensemble AI Backend", version="2.0.0")

# Allow CORS for React frontend (Vite default port 5173)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Models Path configuration
STRUCTURAL_MODEL_PATH = "best_structural.pt"
FURNITURE_MODEL_PATH = "best_furniture.pt"
DEFAULT_MODEL_PATH = "best.pt"

model_structural = None
model_furniture = None

# Load the custom structural model if it exists
if os.path.exists(STRUCTURAL_MODEL_PATH):
    print(f"Loading Structural Specialist model from {STRUCTURAL_MODEL_PATH}...")
    model_structural = YOLO(STRUCTURAL_MODEL_PATH)
else:
    print(f"Warning: {STRUCTURAL_MODEL_PATH} not found. Architectural parsing will fall back.")

# Load the custom furniture model if it exists
if os.path.exists(FURNITURE_MODEL_PATH):
    print(f"Loading Interior Specialist model from {FURNITURE_MODEL_PATH}...")
    model_furniture = YOLO(FURNITURE_MODEL_PATH)
elif os.path.exists(DEFAULT_MODEL_PATH):
    print(f"Loading Default model from {DEFAULT_MODEL_PATH} as Interior Specialist...")
    model_furniture = YOLO(DEFAULT_MODEL_PATH)
else:
    print(f"Warning: Neither {FURNITURE_MODEL_PATH} nor {DEFAULT_MODEL_PATH} found.")

class ParseResponse(BaseModel):
    walls: List[Dict[str, Any]]
    portals: List[Dict[str, Any]]
    furniture: List[Dict[str, Any]]
    rooms: List[Dict[str, Any]]
    columns: List[Dict[str, Any]]

def process_yolo_predictions(results_structural, results_furniture, img_width, img_height):
    """
    Converts predictions from both structural and furniture YOLO models
    into our unified 3D Application Coordinate Space (0 to 800, 0 to 450).
    """
    APP_WIDTH = 800
    APP_HEIGHT = 450
    
    scale_x = APP_WIDTH / img_width
    scale_y = APP_HEIGHT / img_height

    walls = []
    portals = []
    furnitures = []
    columns = []
    rooms = []

    wall_counter = 1
    portal_counter = 1
    furniture_counter = 1
    column_counter = 1

    has_structural_walls = False

    # 1. Process structural specialist model detections (Highly precise for structural items)
    if results_structural and len(results_structural) > 0:
        result = results_structural[0]
        names = result.names
        boxes = result.boxes
        
        for box in boxes:
            cls_id = int(box.cls[0].item())
            class_name = names[cls_id].lower()
            conf = float(box.conf[0].item())
            
            # Skip extremely low confidence structural items
            if conf < 0.15:
                continue
                
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            app_x1 = x1 * scale_x
            app_y1 = y1 * scale_y
            app_x2 = x2 * scale_x
            app_y2 = y2 * scale_y
            
            center_x = (app_x1 + app_x2) / 2
            center_y = (app_y1 + app_y2) / 2
            width = app_x2 - app_x1
            height = app_y2 - app_y1
            
            # Map structural components
            if "wall" in class_name or "curtain wall" in class_name:
                walls.append({
                    "id": f"wall_ai_{wall_counter}",
                    "startX": app_x1,
                    "startY": center_y if width > height else app_y1,
                    "endX": app_x2 if width > height else app_x1,
                    "endY": center_y if width > height else app_y2,
                    "thickness": max(8.0, min(width, height)) # Approximate thickness, min 8
                })
                wall_counter += 1
                has_structural_walls = True
                
            elif "door" in class_name or "sliding door" in class_name or "window" in class_name:
                portal_type = 'DOOR' if ("door" in class_name or "sliding" in class_name) else 'WINDOW'
                portals.append({
                    "id": f"portal_ai_{portal_counter}",
                    "wallId": "",
                    "type": portal_type,
                    "distanceFromStart": 0,
                    "width": max(width, height),
                    "ai_center_x": center_x,
                    "ai_center_y": center_y
                })
                portal_counter += 1
                
            elif "column" in class_name:
                columns.append({
                    "id": f"column_ai_{column_counter}",
                    "x": center_x,
                    "y": center_y,
                    "size": max(15.0, (width + height) / 2) # Column pillar size
                })
                column_counter += 1
                
            elif "stair" in class_name:
                furnitures.append({
                    "id": f"furn_ai_{furniture_counter}",
                    "type": 'STAIRS',
                    "x": center_x,
                    "y": center_y,
                    "width": width,
                    "height": height,
                    "rotation": 0
                })
                furniture_counter += 1

    # 2. Process interior furniture model detections (Highly detailed room contents)
    if results_furniture and len(results_furniture) > 0:
        result = results_furniture[0]
        names = result.names
        boxes = result.boxes
        
        for box in boxes:
            cls_id = int(box.cls[0].item())
            class_name = names[cls_id].lower()
            conf = float(box.conf[0].item())
            
            # Skip low confidence furniture items
            if conf < 0.15:
                continue
                
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            app_x1 = x1 * scale_x
            app_y1 = y1 * scale_y
            app_x2 = x2 * scale_x
            app_y2 = y2 * scale_y
            
            center_x = (app_x1 + app_x2) / 2
            center_y = (app_y1 + app_y2) / 2
            width = app_x2 - app_x1
            height = app_y2 - app_y1
            
            # If structural model didn't find any walls, fall back to structural predictions from furniture model
            if not has_structural_walls and "wall" in class_name:
                walls.append({
                    "id": f"wall_ai_{wall_counter}",
                    "startX": app_x1,
                    "startY": center_y if width > height else app_y1,
                    "endX": app_x2 if width > height else app_x1,
                    "endY": center_y if width > height else app_y2,
                    "thickness": max(8.0, min(width, height))
                })
                wall_counter += 1
                
            elif not has_structural_walls and ("door" in class_name or "window" in class_name):
                portal_type = 'DOOR' if "door" in class_name else 'WINDOW'
                portals.append({
                    "id": f"portal_ai_{portal_counter}",
                    "wallId": "",
                    "type": portal_type,
                    "distanceFromStart": 0,
                    "width": max(width, height),
                    "ai_center_x": center_x,
                    "ai_center_y": center_y
                })
                portal_counter += 1
                
            # Process standard furniture
            else:
                f_type = None
                if "bed" in class_name: f_type = 'BED'
                elif "sofa" in class_name: f_type = 'SOFA'
                elif "toilet" in class_name: f_type = 'TOILET_COMMODE'
                elif "bathtub" in class_name: f_type = 'BATHTUB'
                elif "shower" in class_name: f_type = 'SHOWER'
                elif "dining" in class_name: f_type = 'DINING_TABLE'
                elif "stove" in class_name: f_type = 'STOVE'
                elif "kitchen" in class_name: f_type = 'KITCHEN_ISLAND'
                elif "washbasin" in class_name or "wash basin" in class_name or "washbasing" in class_name: f_type = 'WASHBASIN'
                elif "cupboard" in class_name: f_type = 'CUPBOARD'
                
                if f_type:
                    furnitures.append({
                        "id": f"furn_ai_{furniture_counter}",
                        "type": f_type,
                        "x": center_x,
                        "y": center_y,
                        "width": width,
                        "height": height,
                        "rotation": 0
                    })
                    furniture_counter += 1

    return walls, portals, furnitures, columns, rooms

@app.post("/api/parse", response_model=ParseResponse)
async def parse_floorplan(file: UploadFile = File(...)):
    contents = await file.read()
    image = Image.open(io.BytesIO(contents)).convert("RGB")
    
    # Save a copy for debugging
    image.save("debug_upload.jpg")
    
    results_structural = None
    results_furniture = None
    
    # 1. Structural inference
    if model_structural is not None:
        try:
            print("Running Structural model inference...")
            results_structural = model_structural.predict(image, conf=0.1)
            print(f"Structural detections: {len(results_structural[0].boxes)}")
        except Exception as e:
            print(f"Error running structural model prediction: {e}")
            
    # 2. Furniture inference
    if model_furniture is not None:
        try:
            print("Running Furniture model inference...")
            results_furniture = model_furniture.predict(image, conf=0.1)
            print(f"Furniture detections: {len(results_furniture[0].boxes)}")
        except Exception as e:
            print(f"Error running furniture model prediction: {e}")
            
    # Return empty response if no models are available
    if model_structural is None and model_furniture is None:
        return {"walls": [], "portals": [], "furniture": [], "rooms": [], "columns": []}
        
    # Convert and combine results
    walls, portals, furnitures, columns, rooms = process_yolo_predictions(
        results_structural, 
        results_furniture, 
        image.width, 
        image.height
    )
    
    return {
        "walls": walls,
        "portals": portals,
        "furniture": furnitures,
        "rooms": rooms,
        "columns": columns
    }

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
