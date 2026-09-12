import os
import sys
import py7zr

SCRATCH_DIR = r"C:\Users\cheta\.gemini\antigravity-ide\brain\c148ac0e-0e5c-4653-9e17-e600631cf18c\scratch"
MASKS_DIR = os.path.join(SCRATCH_DIR, "zenodo_masks")

def inspect_local_mask_archives():
    print("=== INSPECTING LOCAL MASK ARCHIVES ===")
    for mask_file in ["01_Train_Val_Oil_Spill_mask.7z", "01_Train_Val_No_Oil_mask.7z", "01_Train_Val_Lookalike_mask.7z"]:
        full_path = os.path.join(MASKS_DIR, mask_file)
        if os.path.exists(full_path):
            with py7zr.SevenZipFile(full_path, mode="r") as z:
                names = [n for n in z.getnames() if n.endswith(".tif")]
                print(f"Archive: {mask_file} -> {len(names)} masks available")
                print(f"  First 10: {[os.path.basename(n) for n in names[:10]]}")

if __name__ == "__main__":
    inspect_local_mask_archives()
