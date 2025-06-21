import random
from scipy.spatial import Delaunay
import numpy as np
from PIL import Image
import json, codecs
from gen_resources import gen_resources
import os
from tqdm import tqdm

if os.path.exists("galaxy.json"):
    exit_catch = input("There is already a \"galaxy.json\" file in this folder, which will be overwritten. Enter \"n\" to exit, or press any other key to continue.")
    if exit_catch.lower() == "n":
        exit(0)


system_count = int(input("Enter the amount of systems you want to generate: "))

input_image = Image.open("Distribution.png")
input_array = np.array(input_image) / 255

# Compute brightness and flatten arrays
brightness_array = input_array ** 2
flatten_brightness = brightness_array.flatten()

rands = np.random.rand(len(flatten_brightness))
flatten_brightness[np.where(flatten_brightness < rands)] = 0

# Generate coordinates grid and flatten
coords = np.indices(brightness_array.shape).reshape(2, -1).T

# Select points based on brightness as weights
probabilities = flatten_brightness / flatten_brightness.sum()
selected_indices = np.random.choice(len(coords), size=system_count, p=probabilities)
stars = coords[selected_indices]

print("--- Generating Hyperlanes ---")
print("Generating Lane Pool...")
delaunay = Delaunay(stars)

### DETERMINE HYPERLANES

# https://stackoverflow.com/a/23700182
def find_neighbors(pindex, triang):
    return triang.vertex_neighbor_vertices[1][triang.vertex_neighbor_vertices[0][pindex]:triang.vertex_neighbor_vertices[0][pindex+1]]

hyperlanes = []

#length_metrics = []

#conns = {}
print("Trimming Lanes...")
for s in tqdm(list(range(len(stars)))):
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
        mid_brightness = brightness_array[midpoint[1]][midpoint[0]]
        if mid_brightness < 0.05:
            continue

        #if length_metrics[-1] < 75:
        hyperlanes.append([s, int(c)])
        laneCount += 1

    if laneCount == 0:  
        try:      
            if len(connections) == 0:
                #This is a bit hacky but it does the job
                raise IndexError()
            hyperlanes.append([s, int(np.random.choice(connections))])
        except IndexError:
            star_dists: np.ndarray = np.linalg.norm(star - stars, axis=1)
            star_dists[np.where(star_dists <= 0)[0]] = system_count
            closest_star = star_dists.argmin()
            #closest_stars = sorted(stars, key=lambda x: np.linalg.norm(np.subtract(star,x)), reverse=False)
            # for st in closest_stars:
            #     if st != star:
            #         closest_star = st
            #         break
            hyperlanes.append([s, closest_star])

### Output to JS
print("--- Creating Galaxy Object ---")
output_json = {}
output_json['width'] = input_image.size[0]
output_json['height'] = input_image.size[1]
output_json['stars'] = list(stars)
output_json['hyperlanes'] = list(hyperlanes)
output_json['ownership'] = []

print("--- Getting Resource Data ---")
### Get Resource Json (Actual Generation done in the JS stage)
resources = []
if os.path.exists("resources.json"):
    resources = json.load(open("resources.json"))
    print(f"File \"resources.json\" found; loading {len(resources)} resources")
    resources = gen_resources(resources, output_json)
else:
    print(f"\"resources.json\" not found; resources will not be generated")

output_json['resources'] = resources

print("--- Generation Finished ---")
json.dump(output_json, codecs.open("galaxy.json", 'w', encoding='utf-8'), 
          separators=(',', ':'), 
          sort_keys=True, 
          indent=4)