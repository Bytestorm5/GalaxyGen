import numpy as np
import json, codecs
import random
import time




metadata = []

def KNN(idx, indices, stars, n = 5):
    if n == 0:
        return []
    
    pool = np.array(stars)

    start = np.array(stars[idx])
    dists = np.linalg.norm(pool - start, axis = 1)
    dist_args = np.argsort(dists)

    valid_systems = []
    i = 0
    while len(valid_systems) < n and i < len(dist_args):
        if dist_args[i] in indices and dist_args[i] != idx:
            valid_systems.append(int(dist_args[i]))
        i += 1

    return valid_systems #dist_args[:n].tolist()

def radius(p):
    return np.sqrt(p[0] ** 2 + p[1] ** 2)  

def weight_by_centricity(a, r, GALAXY_RADIUS):
    mr = r / GALAXY_RADIUS
    return ((a*mr + (0.5 * (1 - a))) ** max(6 * abs(a), 1))

def seed_count(rarity):
    return int((2 * (1 - rarity)) ** 2 + 1) + 3

def cluster_size(rarity):
    return int(9 * (1 - rarity))

def gen_resources(resources, galaxy):
    print("--- Generating Resources ---")
    stars = galaxy['stars']
    indices = list(range(len(stars)))
    metadata = []
    GALAXY_RADIUS = radius((galaxy['width'], galaxy['height']))    

    for resource in resources:
        print(f"Seeding Resource {resource['name']}")
        seed_systems = random.choices(indices, 
            weights=[weight_by_centricity(resource['centricity'], radius(star), GALAXY_RADIUS) for star in np.array(stars)[indices]], 
            k = seed_count(resource['rarity']))
        
        in_systems = seed_systems.copy()

        [indices.remove(sys) if sys in indices else "" for sys in in_systems]

        print(f"Creating Clusters for Resource {resource['name']}")
        i = 1
        for system in seed_systems:
            print(f" - Clustering System {i} / {len(seed_systems)}")
            in_systems += list(KNN(system, indices, stars, cluster_size(resource['rarity'])))
            [(indices.remove(sys) if sys in indices else None) for sys in in_systems]
            i += 1

        print(f"Finalizing Resource {resource['name']}")
        out_obj = {
            "id": resources.index(resource),
            "systems": list(in_systems)
        }
        metadata.append(out_obj)
        print("-----------")
    return metadata


if __name__ == "__main__":
    start_time = time.time()

    galaxy = json.load(open("galaxy.json"))
    stars = galaxy['stars']

    indices = list(range(len(stars)))

    resources = json.load(open("resources.json"))

    metadata = gen_resources(resources, galaxy)

    galaxy['resources'] = metadata
    json.dump(galaxy, codecs.open("galaxy.json", 'w', encoding='utf-8'), 
            separators=(',', ':'), 
            sort_keys=True, 
            indent=4)

    print("--- %s seconds ---" % (time.time() - start_time))