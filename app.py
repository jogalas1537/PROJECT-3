import os
import sys

# Limit threads to prevent OpenMP crashes in PyInstaller
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"

import cv2
import base64
import torch

# CRITICAL FIX: Explicitly import torchvision AT STARTUP to register C++ NMS ops
import torchvision

import traceback
import numpy as np
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from ultralytics import YOLO

# Limit PyTorch CPU threads
torch.set_num_threads(1)

def get_resource_path(relative_path):
    if hasattr(sys, '_MEIPASS'):
        return os.path.join(sys._MEIPASS, relative_path)
    return os.path.join(os.path.abspath("."), relative_path)

app = Flask(__name__, static_folder=get_resource_path('.'), static_url_path='')
CORS(app)

print("Loading YOLOv8 model (Medium size)...")
model_path = get_resource_path('yolov8m.pt')
model = YOLO(model_path)

# Run explicit model warmup on boot to initialize torchvision C++ ops
dummy_input = np.zeros((640, 640, 3), dtype=np.uint8)
model(dummy_input, classes=[0], conf=0.08, verbose=False)
print("Model loaded & warmed up successfully!")

@app.route('/')
def index():
    return send_from_directory(get_resource_path('.'), 'index.html')

@app.route('/<path:filename>')
def serve_static(filename):
    return send_from_directory(get_resource_path('.'), filename)

def nms_boxes(boxes, scores, iou_thresh=0.45):
    if len(boxes) == 0:
        return []
    boxes = np.array(boxes)
    scores = np.array(scores)
    x1, y1 = boxes[:, 0], boxes[:, 1]
    w, h = boxes[:, 2], boxes[:, 3]
    x2, y2 = x1 + w, y1 + h
    areas = w * h
    order = scores.argsort()[::-1]
    keep = []
    while order.size > 0:
        i = order[0]
        keep.append(i)
        xx1 = np.maximum(x1[i], x1[order[1:]])
        yy1 = np.maximum(y1[i], y1[order[1:]])
        xx2 = np.minimum(x2[i], x2[order[1:]])
        yy2 = np.minimum(y2[i], y2[order[1:]])
        w_int = np.maximum(0.0, xx2 - xx1)
        h_int = np.maximum(0.0, yy2 - yy1)
        inter = w_int * h_int
        ovr = inter / (areas[i] + areas[order[1:]] - inter)
        inds = np.where(ovr <= iou_thresh)[0]
        order = order[inds + 1]
    return keep

@app.route('/process_frame', methods=['POST'])
def process_frame():
    try:
        data = request.get_json()
        if not data or 'image' not in data:
            return jsonify({'error': 'No image data'}), 400

        image_data = data['image']
        if ',' in image_data:
            image_data = image_data.split(',')[1]

        img_bytes = base64.b64decode(image_data)
        nparr = np.frombuffer(img_bytes, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if frame is None:
            return jsonify({'error': 'Decoded frame is empty'}), 400

        h, w, _ = frame.shape
        half_w, half_h = w // 2, h // 2
        overlap_x, overlap_y = int(w * 0.1), int(h * 0.1)

        slices = [
            (0, 0, half_w + overlap_x, half_h + overlap_y),
            (half_w - overlap_x, 0, w, half_h + overlap_y),
            (0, half_h - overlap_y, half_w + overlap_x, h),
            (half_w - overlap_x, half_h - overlap_y, w, h),
            (0, 0, w, h)
        ]

        all_boxes, all_scores = [], []
        
        with torch.no_grad():
            for (x1, y1, x2, y2) in slices:
                crop = frame[y1:y2, x1:x2]
                results = model(crop, classes=[0], conf=0.08, imgsz=640, verbose=False)[0]
                for box in results.boxes:
                    bx1, by1, bx2, by2 = box.xyxy[0].tolist()
                    all_boxes.append([bx1 + x1, by1 + y1, bx2 - bx1, by2 - by1])
                    all_scores.append(float(box.conf[0]))

        keep_indices = nms_boxes(all_boxes, all_scores, iou_thresh=0.4)
        filtered_detections = [{'bbox': all_boxes[idx], 'score': float(all_scores[idx])} for idx in keep_indices]

        return jsonify({'count': len(filtered_detections), 'detections': filtered_detections})

    except Exception as e:
        print("\n" + "="*60)
        print("PROCESS_FRAME EXCEPTION DETECTED:")
        traceback.print_exc()
        print("="*60 + "\n")
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5000, debug=False)