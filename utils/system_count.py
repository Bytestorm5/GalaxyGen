import numpy as np
import json, codecs
import random
import time

# Region Defs define the systems of each region ('ownership' or 'resources' from the galaxy json)
def get_region_sys_counts(region_defs):
    out_dict = {}
    for region in region_defs:
        out_dict[int(region['id'])] = len(region['systems'])
    return out_dict

if __name__ == "__main__":
    start_time = time.time()

    galaxy = json.load(open("galaxy.json"))
    
    resources = json.load(open("resources.json"))
    resource_systems = 0
    print("-- RESOURCES --")
    for k, v in get_region_sys_counts(galaxy['resources']).items():
        print(f"{resources[k]['name']}: {v} systems")
        resource_systems += v

    countries = json.load(open("countries.json"))
    country_systems = 0
    print()
    print("-- COUNTRIES --")
    for k, v in get_region_sys_counts(galaxy['ownership']).items():
        print(f"{countries[k]['name']}: {v} systems")
        country_systems += v

    
    print()
    print(f"Total Stars: {len(galaxy['stars'])}")
    print(f"Total Stars Occupied: {country_systems}")
    print(f"Total Stars w/ Resources: {resource_systems}")
    print()
    print("--- %s seconds ---" % (time.time() - start_time))