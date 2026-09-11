class UNetInference:
    def predict_mask(self, tile_tensor):
        return tile_tensor > 0.5
