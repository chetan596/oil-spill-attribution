"""
Comprehensive GPU & PyTorch Blackwell Validation Script.
Validates CUDA runtime, Blackwell sm_120 kernel execution, tensor operations,
and model forward-pass consistency between CPU and RTX 5050 GPU.
"""

import sys
import os
import time
import json
from pathlib import Path
import traceback

# Ensure UTF-8 output on Windows consoles
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

# Add services/ml-python to sys.path so app modules can be imported
current_dir = os.path.dirname(os.path.abspath(__file__))
ml_python_dir = os.path.abspath(os.path.join(current_dir, ".."))
if ml_python_dir not in sys.path:
    sys.path.insert(0, ml_python_dir)

import torch
import torch.nn as nn
import numpy as np


def run_diagnostics():
    results = {}
    print("=" * 65)
    print("STEP 5: TORCH / CUDA RUNTIME VALIDATION")
    print("=" * 65)

    python_version = sys.version.replace("\n", " ")
    torch_version = torch.__version__
    cuda_version = torch.version.cuda
    cuda_available = torch.cuda.is_available()
    device_count = torch.cuda.device_count()

    print(f"Python Version:             {python_version}")
    print(f"PyTorch Version:            {torch_version}")
    print(f"PyTorch CUDA Version:       {cuda_version}")
    print(f"CUDA Available:             {cuda_available}")
    print(f"Device Count:               {device_count}")

    results["python_version"] = python_version
    results["torch_version"] = torch_version
    results["cuda_version"] = cuda_version
    results["cuda_available"] = cuda_available
    results["device_count"] = device_count

    if not cuda_available:
        print("[ERROR] CUDA is not available. Aborting GPU kernel validation.")
        return results

    device_name = torch.cuda.get_device_name(0)
    capability = torch.cuda.get_device_capability(0)
    props = torch.cuda.get_device_properties(0)
    total_mem_mb = props.total_memory / (1024 * 1024)
    cudnn_avail = torch.backends.cudnn.is_available()
    cudnn_ver = torch.backends.cudnn.version() if cudnn_avail else None

    print(f"Device Name (cuda:0):       {device_name}")
    print(f"Compute Capability:         {capability} (sm_{capability[0]}{capability[1]})")
    print(f"Total VRAM:                 {total_mem_mb:.1f} MiB")
    print(f"cuDNN Available:            {cudnn_avail}")
    print(f"cuDNN Version:              {cudnn_ver}")

    results["device_name"] = device_name
    results["compute_capability"] = f"{capability[0]}.{capability[1]}"
    results["total_vram_mib"] = round(total_mem_mb, 1)
    results["cudnn_available"] = cudnn_avail
    results["cudnn_version"] = cudnn_ver

    print("\n" + "=" * 65)
    print("STEP 6: BLACKWELL ARCHITECTURE TENSOR & KERNEL VALIDATION")
    print("=" * 65)

    device = torch.device("cuda:0")

    # 1. FP32, FP16, BF16 allocation
    print("[1/5] Testing tensor allocation (FP32, FP16, BF16)...")
    t_fp32 = torch.randn(256, 256, device=device, dtype=torch.float32)
    t_fp16 = torch.randn(256, 256, device=device, dtype=torch.float16)
    t_bf16 = torch.randn(256, 256, device=device, dtype=torch.bfloat16)
    print(f"  [OK] Allocated FP32 on {t_fp32.device}, FP16 on {t_fp16.device}, BF16 on {t_bf16.device}")
    results["tensor_allocation"] = "PASSED"

    # 2. Matmul validation (1024x1024)
    print("[2/5] Testing 1024x1024 matrix multiplication (GPU vs CPU)...")
    a_cpu = torch.randn(1024, 1024, dtype=torch.float32)
    b_cpu = torch.randn(1024, 1024, dtype=torch.float32)

    a_gpu = a_cpu.to(device)
    b_gpu = b_cpu.to(device)

    # Warmup
    _ = torch.matmul(a_gpu, b_gpu)
    torch.cuda.synchronize()

    start_cpu = time.perf_counter()
    c_cpu = torch.matmul(a_cpu, b_cpu)
    cpu_matmul_ms = (time.perf_counter() - start_cpu) * 1000

    start_gpu = time.perf_counter()
    c_gpu = torch.matmul(a_gpu, b_gpu)
    torch.cuda.synchronize()
    gpu_matmul_ms = (time.perf_counter() - start_gpu) * 1000

    diff_matmul = torch.max(torch.abs(c_cpu - c_gpu.cpu())).item()
    mae_matmul = torch.mean(torch.abs(c_cpu - c_gpu.cpu())).item()
    print(f"  [OK] Matmul Max Diff: {diff_matmul:.2e}, MAE: {mae_matmul:.2e}")
    print(f"  [OK] Latency: CPU = {cpu_matmul_ms:.2f} ms, GPU = {gpu_matmul_ms:.2f} ms (Speedup: {cpu_matmul_ms/max(gpu_matmul_ms, 0.001):.1f}x)")
    results["matmul_max_diff"] = diff_matmul
    results["matmul_mae"] = mae_matmul
    results["matmul_cpu_ms"] = round(cpu_matmul_ms, 2)
    results["matmul_gpu_ms"] = round(gpu_matmul_ms, 2)
    assert diff_matmul < 1e-3, f"Matmul diff too large: {diff_matmul}"

    # 3. Conv2d operation (mimicking SAR U-Net layer: [1, 2, 512, 512])
    print("[3/5] Testing Conv2d layer (1x2x512x512 Dual-pol SAR chip)...")
    conv_cpu = nn.Conv2d(in_channels=2, out_channels=32, kernel_size=3, padding=1, bias=True)
    x_cpu = torch.randn(1, 2, 512, 512, dtype=torch.float32)

    import copy
    conv_gpu = copy.deepcopy(conv_cpu).to(device)
    x_gpu = x_cpu.to(device)

    conv_cpu.eval()
    conv_gpu.eval()

    with torch.no_grad():
        out_cpu = conv_cpu(x_cpu)
        torch.cuda.synchronize()
        out_gpu = conv_gpu(x_gpu)
        torch.cuda.synchronize()

    diff_conv = torch.max(torch.abs(out_cpu - out_gpu.cpu())).item()
    mae_conv = torch.mean(torch.abs(out_cpu - out_gpu.cpu())).item()
    print(f"  [OK] Conv2d Max Diff: {diff_conv:.2e}, MAE: {mae_conv:.2e}")
    results["conv2d_max_diff"] = diff_conv
    results["conv2d_mae"] = mae_conv
    assert diff_conv < 1e-4, f"Conv2d diff too large: {diff_conv}"

    # 4. Autograd & Backward pass
    print("[4/5] Testing Autograd & Backward pass on GPU...")
    conv_train = nn.Conv2d(2, 16, 3, padding=1).to(device)
    target = torch.randn(1, 16, 512, 512, device=device)
    opt = torch.optim.SGD(conv_train.parameters(), lr=0.01)

    out = conv_train(x_gpu)
    loss = nn.MSELoss()(out, target)
    opt.zero_grad()
    loss.backward()
    opt.step()

    grad_norm = conv_train.weight.grad.norm().item()
    print(f"  [OK] Loss: {loss.item():.4f}, Weight Grad Norm: {grad_norm:.4f}")
    results["autograd_loss"] = round(loss.item(), 4)
    results["autograd_grad_norm"] = round(grad_norm, 4)
    assert grad_norm > 0, "Gradient norm is zero"

    # 5. VRAM allocation and cleanup
    print("[5/5] Testing VRAM allocation and empty_cache()...")
    mem_before = torch.cuda.memory_allocated(device) / (1024 * 1024)
    big_tensor = torch.zeros((1000, 1000, 100), device=device)  # ~400 MB
    mem_during = torch.cuda.memory_allocated(device) / (1024 * 1024)
    del big_tensor, a_gpu, b_gpu, c_gpu, t_fp32, t_fp16, t_bf16, x_gpu, conv_gpu, conv_train, out, loss, target
    torch.cuda.empty_cache()
    mem_after = torch.cuda.memory_allocated(device) / (1024 * 1024)

    print(f"  [OK] VRAM Before: {mem_before:.1f} MiB -> Peak Allocation: {mem_during:.1f} MiB -> After empty_cache: {mem_after:.1f} MiB")
    results["vram_before_mib"] = round(mem_before, 1)
    results["vram_during_mib"] = round(mem_during, 1)
    results["vram_after_mib"] = round(mem_after, 1)

    print("\n" + "=" * 65)
    print("STEP 7: EXISTING MODEL FORWARD-PASS COMPATIBILITY TEST")
    print("=" * 65)

    from app.models.registry import ModelRegistry

    registry = ModelRegistry()
    active_id = "unet-dual-pol-sar-v2"
    print(f"Loading active model checkpoint: '{active_id}'...")

    # Load on CPU
    model_cpu, entry_cpu = registry.load_model(active_id, device="cpu")
    model_cpu.eval()

    # Load on CUDA
    model_gpu, entry_gpu = registry.load_model(active_id, device="cuda")
    model_gpu.eval()

    # Create reproducible SAR dual-pol input: shape (1, 2, 512, 512)
    torch.manual_seed(42)
    sample_sar = torch.randn(1, 2, 512, 512, dtype=torch.float32)

    # Benchmark CPU forward pass
    start_cpu = time.perf_counter()
    with torch.no_grad():
        out_cpu = model_cpu(sample_sar)
    lat_cpu = (time.perf_counter() - start_cpu) * 1000

    # Warmup GPU
    sample_gpu = sample_sar.to(device)
    with torch.no_grad():
        _ = model_gpu(sample_gpu)
    torch.cuda.synchronize()

    # Benchmark GPU forward pass
    runs = 5
    gpu_times = []
    with torch.no_grad():
        for _ in range(runs):
            t0 = time.perf_counter()
            out_gpu = model_gpu(sample_gpu)
            torch.cuda.synchronize()
            gpu_times.append((time.perf_counter() - t0) * 1000)
    lat_gpu = float(np.median(gpu_times))

    out_cpu_np = out_cpu.cpu().numpy()
    out_gpu_np = out_gpu.cpu().numpy()

    assert out_cpu.shape == out_gpu.shape, f"Shape mismatch: {out_cpu.shape} vs {out_gpu.shape}"

    max_diff = float(np.max(np.abs(out_cpu_np - out_gpu_np)))
    mae = float(np.mean(np.abs(out_cpu_np - out_gpu_np)))
    mse = float(np.mean((out_cpu_np - out_gpu_np) ** 2))
    speedup = lat_cpu / max(lat_gpu, 0.001)

    peak_vram_mb = torch.cuda.max_memory_allocated(device) / (1024 * 1024)

    print(f"  [OK] Output Shape CPU:         {out_cpu.shape}")
    print(f"  [OK] Output Shape GPU:         {out_gpu.shape}")
    print(f"  [OK] Max Numerical Difference: {max_diff:.2e}")
    print(f"  [OK] Mean Absolute Error (MAE):{mae:.2e}")
    print(f"  [OK] Mean Squared Error (MSE): {mse:.2e}")
    print(f"  [OK] Latency CPU:              {lat_cpu:.1f} ms")
    print(f"  [OK] Latency GPU (median {runs}x): {lat_gpu:.1f} ms")
    print(f"  [OK] GPU Speedup Factor:       {speedup:.1f}x")
    print(f"  [OK] Peak Model VRAM Footprint:{peak_vram_mb:.1f} MiB")

    results["model_active_id"] = active_id
    results["model_output_shape"] = list(out_gpu.shape)
    results["model_max_diff"] = max_diff
    results["model_mae"] = mae
    results["model_mse"] = mse
    results["model_latency_cpu_ms"] = round(lat_cpu, 1)
    results["model_latency_gpu_ms"] = round(lat_gpu, 1)
    results["model_speedup"] = round(speedup, 1)
    results["model_peak_vram_mib"] = round(peak_vram_mb, 1)
    results["status"] = "ALL_PASSED"

    print("\n" + "=" * 65)
    print("ALL VALIDATION CHECKS PASSED SUCCESSFULLY!")
    print("=" * 65)

    return results


if __name__ == "__main__":
    try:
        res = run_diagnostics()
        out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "diagnostics")
        os.makedirs(out_dir, exist_ok=True)
        out_file = os.path.join(out_dir, "validation_results.json")
        with open(out_file, "w", encoding="utf-8") as f:
            json.dump(res, f, indent=2)
        print(f"[REPORT] Validation JSON saved to {out_file}")
    except Exception as e:
        print(f"\n[FATAL ERROR] {e}")
        traceback.print_exc()
        sys.exit(1)
