import numpy as np    

class Index():  

    def __init__(self):
        self.index = {}
        self.vectors = []
    def set_points(self, points):
        self.vectors = np.array(points)
    
    def indexAll(self, neighbors):
        self.index = {}
        for point in self.vectors:
            self.indexOf(point, neighbors)
        return self.index

    def indexOf(self, point, neighbors, cache = True):
        if tuple(point) in self.index:
            return self.index[tuple(point)]
        else:
            pn = np.array(point)
            #copies = np.array([pn * pn] * len(self.vectors))
            dists = [np.linalg.norm(pn - p) for p in self.vectors]#np.sqrt(np.sum(np.square(copies - self.vectors),1))
            if cache:
                self.index[tuple(point)] = np.argsort(dists)[:neighbors]
                return self.index[tuple(point)]
            else:
                return np.argsort(dists)[:neighbors]

