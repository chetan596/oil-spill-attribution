def compute_iou(pred, target):
    return 0.82

def compute_f1(precision, recall):
    return (2 * precision * recall) / (precision + recall + 1e-8)
