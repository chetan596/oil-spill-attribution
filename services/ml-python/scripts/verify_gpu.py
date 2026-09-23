"""
Dynamic GPU Verification and Diagnostic Script for NVIDIA RTX 5050 Laptop GPU & PyTorch CUDA.
Dynamically inspects environment, runtime CUDA capabilities, and memory stats without hardcoding.
"""

import sys
import os

# Add parent directory to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import torch


def verify_gpu():
    print("=" * 60)
    print("SERVICES/ML-PYTHON GPU VERIFICATION REPORT")
    print("=" * 60)

    # Python & Torch Versions
    py_ver = sys.version.replace("\n", " ")
    torch_ver = torch.__version__
    cuda_runtime = torch.version.cuda
    cuda_avail = torch.cuda.is_available()
    gpu_count = torch.cuda.device_count()

    print(f"Python Version:             {py_ver}")
    print(f"PyTorch Version:            {torch_ver}")
    print(f"PyTorch CUDA Runtime:       {cuda_runtime}")
    print(f"CUDA Available:             {cuda_avail}")
    print(f"GPU Count:                  {gpu_count}")

    if not cuda_avail or gpu_count == 0:
        print("\n[WARNING] CUDA is NOT available or no GPU detected.")
        return {
            "python_version": py_ver,
            "torch_version": torch_ver,
            "cuda_runtime": cuda_runtime,
            "cuda_available": False,
            "gpu_count": 0,
        }

    device_idx = 0
    gpu_name = torch.cuda.get_device_name(device_idx)
    cap = torch.cuda.get_device_capability(device_idx)
    cap_str = f"{cap[0]}.{cap[1]}"
    props = torch.cuda.get_device_properties(device_idx)
    total_vram_bytes = props.total_memory
    total_vram_mib = total_vram_bytes / (1024 * 1024)
    allocated_vram_mib = torch.cuda.memory_allocated(device_idx) / (1024 * 1024)
    reserved_vram_mib = torch.cuda.memory_reserved(device_idx) / (1024 * 1024)

    print(f"GPU Device [0] Name:        {gpu_name}")
    print(f"Compute Capability:         {cap_str} (sm_{cap[0]}{cap[1]})")
    print(f"Total VRAM:                 {total_vram_mib:.2f} MiB ({total_vram_mib / 1024:.2f} GiB)")
    print(f"Allocated VRAM:             {allocated_vram_mib:.2f} MiB")
    print(f"Reserved VRAM:              {reserved_vram_mib:.2f} MiB")
    print(f"cuDNN Available:            {torch.backends.cudnn.is_available()}")
    if torch.backends.cudnn.is_available():
        print(f"cuDNN Version:              {torch.backends.cudnn.version()}")
    print("=" * 60)

    return {
        "python_version": py_ver,
        "torch_version": torch_ver,
        "cuda_runtime": cuda_runtime,
        "cuda_available": cuda_avail,
        "gpu_count": gpu_count,
        "gpu_name": gpu_name,
        "compute_capability": cap_str,
        "total_vram_mib": round(total_vram_mib, 2),
        "allocated_vram_mib": round(allocated_vram_mib, 2),
        "reserved_vram_mib": round(reserved_vram_mib, 2),
    }


if __name__ == "__main__":
    verify_gpu()
