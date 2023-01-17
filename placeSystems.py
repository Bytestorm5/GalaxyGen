import random
from scipy.spatial import Delaunay
import numpy as np
from PIL import Image, ImageColor
from KNN import Index
from IntersectCalculator import convIntersect
import cv2

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
index.set_points(stars)
### DETERMINE HYPERLANES

hyperlanes = []
connCount = {}
for star in stars:
    #rand = int(np.random.random() * 5 + 1)
    connections = index.indexOf(star, 20)[1:]
    laneCount = 0

    badLanes = []

    # np.random.shuffle(connections)
    for i in range(len(connections)):
        # if connCount.get(tuple(star), 0) >= rand:
        #     break
        c = connections[i]

        intersections = 0
        j = 0
        while intersections < 2 and j < len(hyperlanes):
            if convIntersect(star, stars[c], hyperlanes[j][0], hyperlanes[j][1]):
                intersections += 1
                #print("INTERSECT: ", star, stars[c], hyperlanes[j])
                badLanes.append(hyperlanes[j])
            j += 1

        if intersections < 2:            
            hyperlanes.append([star, stars[c]])       

            for sys in hyperlanes[-1]:
                if connCount.get(tuple(sys)):
                    connCount[tuple(sys)] += 1
                else:
                    connCount[tuple(sys)] = 1
    if connCount.get(tuple(star), 0) == 0:
        print(star, stars[c], connCount.get(tuple(star),0))
        print(badLanes)
print(f"Generated {sum(connCount.values())} connections")

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