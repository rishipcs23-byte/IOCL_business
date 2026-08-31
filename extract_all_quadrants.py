from PIL import Image
from rapidocr_onnxruntime import RapidOCR
import json
import os
import re

engine = RapidOCR()

all_crops = []

# Prepare crops
for p in [1, 2]:
    img_path = f'scratch_page_{p}_1_X2.jpg'
    img = Image.open(img_path)
    w, h = img.size
    
    # 4 quadrants with overlapping boundaries so no edge data is lost
    quadrants = [
        ('tl', (0, int(h * 0.05), int(w * 0.52), int(h * 0.55))),
        ('tr', (int(w * 0.48), int(h * 0.05), w, int(h * 0.55))),
        ('bl', (0, int(h * 0.48), int(w * 0.52), int(h * 0.96))),
        ('br', (int(w * 0.48), int(h * 0.48), w, int(h * 0.96))),
    ]
    
    for q_name, box in quadrants:
        crop = img.crop(box)
        fname = f'scratch_p{p}_{q_name}.jpg'
        crop.save(fname)
        all_crops.append((p, q_name, fname, box))

print(f"Created {len(all_crops)} quadrant crops.")

crop_results = {}

for p, q_name, fname, box in all_crops:
    print(f"Running OCR on {fname}...")
    results, _ = engine(fname)
    ocr_items = []
    if results:
        for r in results:
            b, txt, score = r
            # convert box relative to original page coordinates
            abs_box = [[b_pt[0] + box[0], b_pt[1] + box[1]] for b_pt in b]
            ocr_items.append({
                'box': abs_box,
                'text': txt.strip(),
                'score': float(score)
            })
    crop_results[f"p{p}_{q_name}"] = ocr_items

with open('scratch_quadrants_ocr.json', 'w') as f:
    json.dump(crop_results, f, indent=2)

print("Saved scratch_quadrants_ocr.json")
