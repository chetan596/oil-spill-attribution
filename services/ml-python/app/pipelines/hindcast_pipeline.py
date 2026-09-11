class HindcastPipeline:
    def simulate_backward(self, lat: float, lng: float, hours: int):
        return {"origin": [lat, lng], "drift_vectors": []}
