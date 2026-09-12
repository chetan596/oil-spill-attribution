import json
import numpy as np
import rasterio

def verify_dataset_and_splits():
    manifest_path = 'data/raw/satellite/dataset_manifest.json'
    with open(manifest_path) as f:
        manifest = json.load(f)

    scenes = manifest['scenes']
    print(f"============================================================")
    print(f"VERIFIED REAL SENTINEL-1 DATASET INVENTORY")
    print(f"============================================================")
    print(f"Total scenes in manifest: {len(scenes)}")

    categories = {}
    splits = {}
    split_scenes = {"train": [], "val": [], "test": []}
    scene_stats = []

    for s in scenes:
        cat = s.get('category')
        split = s.get('split')
        categories[cat] = categories.get(cat, 0) + 1
        splits[split] = splits.get(split, 0) + 1
        if split in split_scenes:
            split_scenes[split].append(s['scene_id'])

        mask_path = s.get('mask_path')
        pos_px = 0
        neg_px = 0
        if mask_path:
            with rasterio.open(mask_path) as src:
                mask = src.read(1)
                pos_px = int(np.sum(mask > 0))
                neg_px = int(np.sum(mask == 0))
        
        scene_stats.append({
            "scene_id": s['scene_id'],
            "category": cat,
            "split": split,
            "has_slick": s.get('has_oil', False),
            "pos_pixels": pos_px,
            "neg_pixels": neg_px,
            "total_pixels": pos_px + neg_px,
            "pos_pct": (pos_px / (pos_px + neg_px) * 100) if (pos_px + neg_px) > 0 else 0.0
        })

    print(f"\n1. SCENE CATEGORIES IN RAW DIRECTORY:")
    for cat, count in categories.items():
        print(f"   - {cat}: {count} scenes")

    print(f"\n2. OFFICIAL SCENE-LEVEL SPLITS:")
    for split_name in ["train", "val", "test"]:
        scenes_in_split = [st for st in scene_stats if st['split'] == split_name]
        pos_sum = sum(st['pos_pixels'] for st in scenes_in_split)
        neg_sum = sum(st['neg_pixels'] for st in scenes_in_split)
        tot_sum = pos_sum + neg_sum
        oil_count = sum(1 for st in scenes_in_split if st['pos_pixels'] > 0)
        zero_count = sum(1 for st in scenes_in_split if st['pos_pixels'] == 0)
        print(f"   [{split_name.upper()}] ({len(scenes_in_split)} scenes, {len(scenes_in_split)*16} tiles):")
        print(f"      - Scenes: {[st['scene_id'] for st in scenes_in_split]}")
        print(f"      - Oil Slicks: {oil_count} scenes | Zero Slicks: {zero_count} scenes")
        print(f"      - Positive Pixels: {pos_sum:,} ({pos_sum/tot_sum*100:.3f}%)")
        print(f"      - Negative Pixels: {neg_sum:,} ({neg_sum/tot_sum*100:.3f}%)")
        print(f"      - Total Pixels:    {tot_sum:,}")

    print(f"\n3. PER-SCENE BREAKDOWN (20 SCENES):")
    for idx, st in enumerate(scene_stats, 1):
        print(f"   {idx:2d}. {st['scene_id']:<36} | Cat: {st['category']:<10} | Split: {st['split']:<5} | Pos: {st['pos_pixels']:>7,} ({st['pos_pct']:>5.2f}%) | Neg: {st['neg_pixels']:>9,}")

    print(f"\n4. OVERALL DATASET PIXELS:")
    tot_pos = sum(st['pos_pixels'] for st in scene_stats)
    tot_neg = sum(st['neg_pixels'] for st in scene_stats)
    tot_all = tot_pos + tot_neg
    print(f"   - Total Positive (Oil):     {tot_pos:>10,} ({tot_pos/tot_all*100:.3f}%)")
    print(f"   - Total Negative (Clean/LA):{tot_neg:>10,} ({tot_neg/tot_all*100:.3f}%)")
    print(f"   - Grand Total Pixels:       {tot_all:>10,}")

if __name__ == '__main__':
    verify_dataset_and_splits()
