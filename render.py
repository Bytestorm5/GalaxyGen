from PIL import Image
import numpy as np
import cv2
import json, codecs
from scipy.spatial import Voronoi

SCALE = 10
STAR_SIZE = 3

def pixel_conversion(in_coord, center = True):
    return [(i * SCALE) + (int(0.5 * SCALE) if center else 0) for i in in_coord]

def inverse_conversion(in_coord, center = True):
    return np.array([(i - (int(0.5 * SCALE) if center else 0)) // SCALE for i in in_coord])

def get_star_cells(star_list):
    voronoi = Voronoi(star_list)

    def get_star_region(star_idx):
        return np.array(voronoi.vertices[voronoi.regions[voronoi.point_region[star_idx]]])

    regions_cache = []

    [regions_cache.append(get_star_region(star).tolist()) for star in range(len(star_list))]

    return regions_cache

### GENERATE OUTPUT IMAGE
def render():   
    print("Loading Galaxy Data...")
    galaxy = json.load(open("galaxy.json"))
    hyperlanes = galaxy['hyperlanes']
    stars = galaxy['stars']

    SIZE = [int(galaxy['width']), int(galaxy['height'])]

    print("Initializing Output Images")
    output_image = np.array(Image.new("RGB", tuple(np.array(SIZE) * int(SCALE))))
    output_image = output_image[:, :, ::-1].copy() 

    output_mask = np.array(Image.new("RGB", tuple(np.array(SIZE) * int(SCALE))))
    output_mask = output_image[:, :, ::-1].copy() 


    # RED CHANNEL
    # 0 = Background
    # 127 = HYPERLANE
    # 255 = STAR
    print("--- Draw Geography ---")
    ## Draw Hyperlanes
    print("Drawing Hyperlanes")
    GRAY = (104, 104, 104)
    for i in range(len(hyperlanes)):
        h = hyperlanes[i]        

        #check if star was deleted
        #deleted stars still have to have a listing to keep the index of other stars from breaking
        if len(stars) <= max(h):
            continue #should never reach here, but won't crash if the json is broken
        if -1 in stars[h[0]] or  -1 in stars[h[1]]:
            continue

        start = pixel_conversion(stars[h[0]])
        end = pixel_conversion(stars[h[1]])
        
        output_image = cv2.line(output_image, start, end, GRAY, int(STAR_SIZE*0.4), cv2.LINE_AA)

        B = i // 255
        G = i % 255

        output_mask = cv2.line(output_mask, start, end, (B, G, 127), int(STAR_SIZE*0.4))
    
    ## Draw Stars
    print("Drawing Stars")
    for i in range(len(stars)):        
        p = stars[i]

        #check if star was deleted
        #deleted stars still have to have a listing to keep the index of other stars from breaking
        if -1 in p:
            continue

        output_image = cv2.circle(output_image, pixel_conversion(p), STAR_SIZE, (255, 255, 255), -1, cv2.LINE_AA)

        B = i // 255
        G = i % 255

        output_mask = cv2.circle(output_mask, pixel_conversion(p), STAR_SIZE, (B, G, 255), -1)
    
    print("Writing Mask and Geography Maps")
    cv2.imwrite("output_mask.png", output_mask)

    print("--- Draw Resources ---")
    print("Loading Resource & Country Data...")
    resource_data = json.load(open("resources.json"))           
    country_data = json.load(open("countries.json"))   

    output_raw = output_image.copy()
    cv2.imwrite("output_raw.png", output_raw)    
    if "resources" in galaxy and len(galaxy["resources"]) > 0:
        print("Cacheing Star Regions...")
        regions_cache = get_star_cells([pixel_conversion(star) for star in galaxy['stars']])
        ### Render Countries
        
        
        print("Generating Galaxy Bounds...")
        density = cv2.resize(cv2.cvtColor(cv2.imread("Distribution.png"), cv2.COLOR_BGR2GRAY), tuple(np.array(SIZE) * int(SCALE)))
        _, galaxy_mask = cv2.threshold(density, 12, 255, cv2.THRESH_BINARY)
        galaxy_mask = cv2.cvtColor(galaxy_mask, cv2.COLOR_GRAY2BGR)
        galaxy_mask = cv2.medianBlur(galaxy_mask, 39)
        
        #Country Overlay layer
        mask = output_raw.copy()
        print("Generating Resource Overlay...")
        for resource in galaxy["resources"]:
            print(f"- Drawing Resource {resource_data[int(resource['id'])]['name']}")
            resource_color = resource_data[int(resource['id'])]['color']
            for star in resource['systems']:
                region = regions_cache[star]
                mask = cv2.fillPoly(mask, np.int32([region]), (resource_color[2], resource_color[1], resource_color[0]))
                mask = cv2.polylines(mask, np.int32([region]), True, (0.45 * resource_color[2], 0.45 * resource_color[1], 0.45 * resource_color[0]), int(STAR_SIZE*0.4), cv2.LINE_AA)
        print("Applying Mask...")
        mask = cv2.bitwise_and(mask, galaxy_mask)
        #mask = cv2.medianBlur(mask, 149)  #<<<  Stellaris Style; Breaks due to countries being displayed in one mask rather than separately
        output_resources = cv2.addWeighted(output_raw, 0.5, mask, 0.5, 0)

        #Country Overlay layer
        mask = output_raw.copy()
        print("Generating Country Overlay...")
        for owner in galaxy["ownership"]:
            print(f"- Drawing Country {country_data[int(owner['id'])]['name']}")
            owner_color = country_data[int(owner['id'])]['color']
            for star in owner['systems']:
                region = regions_cache[star]
                mask = cv2.fillPoly(mask, np.int32([region]), (owner_color[2], owner_color[1], owner_color[0]))
                mask = cv2.polylines(mask, np.int32([region]), True, (0.45 * owner_color[2], 0.45 * owner_color[1], 0.45 * owner_color[0]), int(STAR_SIZE*0.4), cv2.LINE_AA)
        print("Applying Mask...")
        mask = cv2.bitwise_and(mask, galaxy_mask)
        #mask = cv2.medianBlur(mask, 149)  #<<<  Stellaris Style; Breaks due to countries being displayed in one mask rather than separately
        output_countries = cv2.addWeighted(output_raw, 0.5, mask, 0.5, 0)
    print("--- Finalizing Galaxy ---\nWriting Images...")
    cv2.imwrite("output_resources.png", output_resources)
    cv2.imwrite("output.png", output_countries)
    print("Render complete.")

    print("--- Creating Legends ---")
    
    def create_legend(systems, data, filename):
        print(f"[{filename}]: Text Size Pass")
        max_width = 0
        max_height = 0
        for region in systems:
            info = data[int(region['id'])]
            (label_width, label_height), baseline = cv2.getTextSize(info['name'], cv2.FONT_HERSHEY_SIMPLEX, 1, 2)

            if label_width > max_width:
                max_width = label_width
            if (label_height + baseline) > max_height:
                max_height = label_height + baseline
        
        padding = 5
        print(f"[{filename}]: Creating Legend Image...")
        legend = np.array(Image.new("RGB", [max_width + 30, padding + len(systems) * (max_height + padding)]))
        legend = legend[:, :, ::-1].copy()     

        text_x = 30
        text_y = max_height #+ padding

        print(f"[{filename}]: Drawing {len(systems)} Legend Items")
        for region in systems:
            info = data[int(region['id'])]        

            #Calculating this again for the baseline
            (label_width, label_height), baseline = cv2.getTextSize(info['name'], cv2.FONT_HERSHEY_SIMPLEX, 1, 2)
            
            legend = cv2.putText(legend, info['name'], (text_x, text_y), cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2, cv2.LINE_AA)
            
            start_point = (5, text_y - 20)
            end_point = (25, text_y)
            legend = cv2.rectangle(legend, start_point, end_point, tuple(reversed(info['color'])), -1)
            legend = cv2.rectangle(legend, start_point, end_point, (127, 127, 127), 2)

            text_y += padding + max_height

        cv2.imwrite(filename, legend)

    create_legend(galaxy['resources'], resource_data, "resource_legend.png")
    create_legend(galaxy['ownership'], country_data, "country_legend.png")

    return output_mask

if __name__ == "__main__":
    render()