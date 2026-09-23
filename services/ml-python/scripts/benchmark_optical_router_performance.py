"""
Phase 12 — Optical Model Router Performance Benchmark.
Measures:
  - Routing time (ms)
  - Preprocessing time (ms)
  - Inference time (ms)
  - Artifact generation time (ms)
  - Total end-to-end pipeline time (ms)
  - GPU VRAM allocated (MB)
Across the 3 supported domains:
  1. Sentinel-2 Multi-Spectral (6 channels) -> mados-resnet34-rgbnir-swir-v1
  2. Satellite RGB (3 channels) -> mados-resnet34-rgb-v1
  3. Drone / Aerial RGB (3 channels) -> kerf-resnet34-focaldice-v1
"""

import os
import sys
import time
import json
import tempfile
import numpy as np
import torch
from PIL import Image

_script_dir = os.path.dirname(os.path.abspath(__file__))
_ml_py = os.path.abspath(os.path.join(_script_dir, ".."))
_repo_root = os.path.abspath(os.path.join(_script_dir, "../../.."))
if _repo_root not in sys.path:
    sys.path.insert(0, _repo_root)
if _ml_py not in sys.path:
    sys.path.insert(0, _ml_py)

from app.models.optical_model_registry import (
    OpticalInputDescriptor,
    SourceType,
    MODEL_A_SENTINEL2_MS,
    MODEL_B_DRONE_RGB,
    MODEL_C_SATELLITE_RGB,
)
from app.inference.optical_router import operational_optical_engine


def run_benchmark(num_warmup: int = 5, num_runs: int = 30):
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Running Optical Router Performance Benchmark on Device: {device} ({torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU'})")

    temp_dir = tempfile.mkdtemp()

    # 1. Create sample inputs
    # Sentinel-2 6-band
    s2_bands = {}
    for b_name in ["B4", "B3", "B2", "B8", "B11", "B12"]:
        p = os.path.join(temp_dir, f"perf_{b_name}.png")
        Image.fromarray(np.random.randint(10, 80, (240, 240), dtype=np.uint8)).save(p)
        s2_bands[b_name] = p

    # Satellite RGB
    sat_rgb_path = os.path.join(temp_dir, "perf_sat_rgb.png")
    Image.fromarray(np.random.randint(20, 100, (240, 240, 3), dtype=np.uint8)).save(sat_rgb_path)

    # Drone RGB (high-res 1024x1024)
    drone_rgb_path = os.path.join(temp_dir, "perf_drone_rgb.jpg")
    Image.fromarray(np.random.randint(60, 200, (1024, 1024, 3), dtype=np.uint8)).save(drone_rgb_path, format="JPEG")

    domains = [
        ("Sentinel-2 6-Band (MS)", {"band_paths": s2_bands, "user_selected_type": "SENTINEL_2"}),
        ("Satellite RGB (3-Band)", {"image_path": sat_rgb_path, "user_selected_type": "RGB_SATELLITE"}),
        ("Drone RGB (3-Band High-Res)", {"image_path": drone_rgb_path, "user_selected_type": "DRONE"}),
    ]

    out_artifact_dir = os.path.join(temp_dir, "perf_artifacts")

    results = {}

    for domain_name, kwargs in domains:
        print(f"\nEvaluating Domain: {domain_name}...")
        # Warmup
        for _ in range(num_warmup):
            operational_optical_engine.run_inference(
                output_dir=out_artifact_dir,
                prefix="warmup",
                **kwargs
            )

        # Timed runs
        routing_times = []
        prep_times = []
        inf_times = []
        art_times = []
        total_times = []

        if torch.cuda.is_available():
            torch.cuda.reset_peak_memory_stats()

        for i in range(num_runs):
            t0 = time.perf_counter()
            res = operational_optical_engine.run_inference(
                output_dir=out_artifact_dir,
                prefix=f"run_{i}",
                **kwargs
            )
            t_tot = (time.perf_counter() - t0) * 1000.0

            tm = res["timing_ms"]
            routing_times.append(tm["routing_time_ms"])
            prep_times.append(tm["preprocessing_time_ms"])
            inf_times.append(tm["inference_time_ms"])
            art_times.append(tm["artifact_time_ms"])
            total_times.append(t_tot)

        vram_mb = float(torch.cuda.max_memory_allocated() / (1024 * 1024)) if torch.cuda.is_available() else 0.0

        metrics = {
            "model_id": res["model"]["modelId"],
            "domain": res["model"]["domain"],
            "input_channels": len(res["model"]["bandsUsed"]),
            "runs": num_runs,
            "mean_routing_time_ms": float(np.mean(routing_times)),
            "mean_prep_time_ms": float(np.mean(prep_times)),
            "mean_inf_time_ms": float(np.mean(inf_times)),
            "mean_artifact_time_ms": float(np.mean(art_times)),
            "mean_total_time_ms": float(np.mean(total_times)),
            "fps": float(1000.0 / np.mean(total_times)),
            "peak_vram_mb": vram_mb,
        }
        results[domain_name] = metrics

        print(f"  Model ID: {metrics['model_id']}")
        print(f"  Routing: {metrics['mean_routing_time_ms']:.2f}ms | Prep: {metrics['mean_prep_time_ms']:.2f}ms | Inf: {metrics['mean_inf_time_ms']:.2f}ms | Artifacts: {metrics['mean_artifact_time_ms']:.2f}ms | Total: {metrics['mean_total_time_ms']:.2f}ms ({metrics['fps']:.1f} FPS)")
        print(f"  Peak VRAM: {metrics['peak_vram_mb']:.1f} MB")

    out_file = os.path.join(_repo_root, "ml/benchmark/results/phase12_router_performance.json")
    os.makedirs(os.path.dirname(out_file), exist_ok=True)
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    print(f"\nSaved benchmark results to: {out_file}")


if __name__ == "__main__":
    run_benchmark()
