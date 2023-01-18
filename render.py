from PIL import Image
import numpy as np
import cv2
import json

galaxy = json.load(open("galaxy.json"))
hyperlanes = galaxy['hyperlanes']
stars = galaxy['stars']

SIZE = [int(galaxy['width']), int(galaxy['height'])]
SCALE = 16

STAR_SIZE = 5

### GENERATE OUTPUT IMAGE
output_image = np.array(Image.new("RGB", tuple(np.array(SIZE) * int(SCALE))))
output_image = output_image[:, :, ::-1].copy() 

output_mask = np.array(Image.new("RGB", tuple(np.array(SIZE) * int(SCALE))))
output_mask = output_image[:, :, ::-1].copy() 

def pixel_convesion(in_coord, center = True):
    return [(i * SCALE) + (int(0.5 * SCALE) if center else 0) for i in in_coord]

# RED CHANNEL
# 0 = Background
# 127 = HYPERLANE
# 255 = STAR


## Draw Hyperlanes
GRAY = (104, 104, 104)
for i in range(len(hyperlanes)):
    h = hyperlanes[i]
    start = pixel_convesion(stars[h[0]])
    end = pixel_convesion(stars[h[1]])
    
    output_image = cv2.line(output_image, start, end, GRAY, int(STAR_SIZE*0.4), cv2.LINE_AA)

    B = i // 255
    G = i % 255

    output_mask = cv2.line(output_mask, start, end, (B, G, 127), int(STAR_SIZE*0.4))

## Draw Stars
for i in range(len(stars)):
    p = stars[i]
    output_image = cv2.circle(output_image, pixel_convesion(p), STAR_SIZE, (255, 255, 255), -1, cv2.LINE_AA)

    B = i // 255
    G = i % 255

    output_mask = cv2.circle(output_mask, pixel_convesion(p), STAR_SIZE, (B, G, 255), -1)

cv2.imwrite("output.png", output_image)
cv2.imwrite("output_mask.png", output_mask)