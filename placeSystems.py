import random
from scipy.spatial import Delaunay
import numpy as np
from PIL import Image, ImageColor
from KNN import Index
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

for star in stars:
    rand = int(np.random.random() * 5 + 1)
    connections = np.random.choice(index.indexOf(star, 6)[1:], size=rand, replace=False)
    for c in connections:
        hyperlanes.append([star, stars[c]])

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