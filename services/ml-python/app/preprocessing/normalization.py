import numpy as np

def min_max_normalize(image_arr: np.ndarray) -> np.ndarray:
    return (image_arr - np.min(image_arr)) / (np.max(image_arr) - np.min(image_arr) + 1e-8)
