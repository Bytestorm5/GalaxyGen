import random
from scipy.spatial import Delaunay
import numpy as np
from PIL import Image, ImageColor

system_count = 2500
grid_size = 100

input_image = Image.open("Distribution.png")
input_array = np.array(input_image) / 255
#real_image = Image.new("RGB", input_image.size)
#output_image = Image.new("RGB", input_image.size)

points = []

### GENERATE STAR LOCATIONS 

for y in range(input_array.shape[0]):
    for x in range(input_array.shape[1]): 

        brightness = input_array[y, x] ** 2
        #bcolor = int(brightness * 255)
        #real_image.putpixel((x,y), (bcolor,bcolor,bcolor,bcolor))

        rand = np.random.random()
        
        if rand < brightness:
            #print(brightness, rand, y, x)
            #output_image.putpixel((x,y), (255,255,255,255))
            points.append([x, y])

print(f"{len(points)} Systems Generated; Picking {system_count}")

p = random.choices(points, k=system_count)

# Display Raw Star positions

# for point in p:
#     output_image.putpixel(point, (255,255,255,255))

# output_image.show()

