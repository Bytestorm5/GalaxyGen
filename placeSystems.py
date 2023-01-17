import random
from scipy.spatial import Delaunay
import numpy as np
from PIL import Image, ImageColor
from KNN import Index
from IntersectCalculator import convIntersect
import cv2

import matplotlib.pyplot as plt

system_count = 2500
grid_size = 100

input_image = Image.open("Distribution.png")
input_array = np.array(input_image) / 255
#real_image = Image.new("RGB", input_image.size)

print(f"OUTPUT IMAGE SIZE: {np.array(input_image.size) * 10}")

points = []
index = Index()
### GENERATE STAR LOCATIONS 

for y in range(input_array.shape[0]):
    for x in range(input_array.shape[1]): 
        brightness = np.linalg.norm(input_array[y, x]) ** 2
        rand = np.random.random()        
        if rand < brightness:
            points.append([x, y])            


print(f"{len(points)} Systems Generated; Picking {system_count}")

stars = random.choices(points, k=system_count)
delaunay = Delaunay(stars)
#index.set_points(stars)
### DETERMINE HYPERLANES


# https://stackoverflow.com/a/23700182
def find_neighbors(pindex, triang):
    return triang.vertex_neighbor_vertices[1][triang.vertex_neighbor_vertices[0][pindex]:triang.vertex_neighbor_vertices[0][pindex+1]]

hyperlanes = []

length_metrics = []

#conns = {}
for s in range(len(stars)):
    star = stars[s]
    brightness = np.linalg.norm(input_array[star[1], star[0]]) ** 2
    rand = int(((brightness + random.random()) / 2) * 5) + 1 

    connections = find_neighbors(s, delaunay)
    #connections = sorted(connections, key=lambda x: np.linalg.norm(np.subtract(star,stars[x])), reverse=True)
    random.shuffle(connections)
    laneCount = 0

    # np.random.shuffle(connections)
    for i in range(len(connections)):
        if laneCount >= rand:
            break
        c = connections[i]
        length_metrics.append(np.linalg.norm(np.subtract(star,stars[c])))

        midpoint = np.add(star, stars[c], dtype=int)//2
        mid_brightness = np.linalg.norm(input_array[midpoint[1], midpoint[0]]) ** 2
        if mid_brightness < 0.05:
            continue

        #if length_metrics[-1] < 75:
        hyperlanes.append([star, stars[c]])
        laneCount += 1

    if laneCount == 0:  
        try:      
            hyperlanes.append([star, stars[random.choice(connections)]])
        except IndexError:
            closest_stars = sorted(stars, key=lambda x: np.linalg.norm(np.subtract(star,x)), reverse=False)
            for s in closest_stars:
                if s != star:
                    closest_star = s
                    break
            hyperlanes.append([star, closest_star])

print("Min ", min(length_metrics))
print("Max ", max(length_metrics))
print("Median ", np.median(length_metrics))
print("Mean ", np.average(length_metrics))
print("Var ", np.var(length_metrics))

plt.hist(length_metrics)
plt.show()

### GENERATE OUTPUT IMAGE
output_image = np.array(Image.new("RGB", tuple(np.array(input_image.size) * 10)))
output_image = output_image[:, :, ::-1].copy() 

def pixel_convesion(in_coord, center = True):
    return [(i * 10) + 5 for i in in_coord]


## Draw Hyperlanes
GRAY = (104, 104, 104)
for h in hyperlanes:
    start = pixel_convesion(h[0])
    end = pixel_convesion(h[1])
    
    output_image = cv2.line(output_image, start, end, GRAY, 2)
## Draw Stars
for p in stars:
    output_image = cv2.circle(output_image, pixel_convesion(p), 3, (255, 255, 255), -1)

#output_image = cv2.GaussianBlur(output_image, (3,3),0)
#cv2.imshow("Final Result",output_image)
cv2.imwrite("output.png", output_image)
#cv2.waitKey(0)