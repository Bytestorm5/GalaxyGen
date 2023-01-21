import random
from scipy.spatial import Delaunay
import numpy as np
from PIL import Image
import json, codecs

system_count = int(input("Enter the amount of systems you want to generate: "))

input_image = Image.open("Distribution.png")
input_array = np.array(input_image) / 255
#real_image = Image.new("RGB", input_image.size)

print(f"OUTPUT IMAGE SIZE: {np.array(input_image.size) * 16}")

points = []
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

### DETERMINE HYPERLANES


# https://stackoverflow.com/a/23700182
def find_neighbors(pindex, triang):
    return triang.vertex_neighbor_vertices[1][triang.vertex_neighbor_vertices[0][pindex]:triang.vertex_neighbor_vertices[0][pindex+1]]

hyperlanes = []

#length_metrics = []

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
        #length_metrics.append(np.linalg.norm(np.subtract(star,stars[c])))

        #check if hyperlane intersects a pitch-black region
        midpoint = np.add(star, stars[c], dtype=int)//2
        mid_brightness = np.linalg.norm(input_array[midpoint[1], midpoint[0]]) ** 2
        if mid_brightness < 0.05:
            continue

        #if length_metrics[-1] < 75:
        hyperlanes.append([s, int(c)])
        laneCount += 1

    if laneCount == 0:  
        try:      
            hyperlanes.append([s, int(random.choice(connections))])
        except IndexError:
            closest_stars = sorted(stars, key=lambda x: np.linalg.norm(np.subtract(star,x)), reverse=False)
            for st in closest_stars:
                if st != star:
                    closest_star = st
                    break
            hyperlanes.append([s, stars.index(closest_star)])

### Generate resources



### Output to JS

output_json = {}
output_json['width'] = input_image.size[0]
output_json['height'] = input_image.size[1]
output_json['stars'] = list(stars)
output_json['hyperlanes'] = list(hyperlanes)

json.dump(output_json, codecs.open("galaxy.json", 'w', encoding='utf-8'), 
          separators=(',', ':'), 
          sort_keys=True, 
          indent=4)