# train_yolo_colab.py
# Upload this file to your Google Colab instance after mounting Google Drive.

import os
from ultralytics import YOLO

def main():
    print("🚀 Starting YOLOv8 Training for Civil Engineer AI...")

    # 1. Provide the path to the data.yaml file downloaded from Roboflow
    # Example: dataset_path = "/content/Floor-Plan-Detection-1/data.yaml"
    dataset_path = input("Enter the path to your dataset's data.yaml file: ")

    if not os.path.exists(dataset_path):
        print("❌ Error: data.yaml not found at the specified path.")
        return

    # 2. Load the YOLOv8 model (we start with YOLOv8n, the fastest one, pre-trained on COCO)
    model = YOLO("yolov8n.pt") 

    # 3. Train the model
    # We train for 100 epochs. Depending on the dataset size, this could take a few hours on a T4 GPU.
    print("⏳ Training is beginning. This may take a while depending on your dataset size...")
    results = model.train(
        data=dataset_path,
        epochs=100,
        imgsz=640,          # Standard image size for YOLO
        batch=16,           # Batch size
        device=0,           # Use GPU 0
        project="Civil_AI", # Save folder name
        name="floorplan_run_1" 
    )

    print("✅ Training Complete!")
    print("The trained weights are saved in: runs/detect/floorplan_run_1/weights/best.pt")
    print("Download 'best.pt' and place it in your local 'ai-backend' folder!")

if __name__ == "__main__":
    main()
