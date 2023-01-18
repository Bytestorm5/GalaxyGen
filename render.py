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

def pixel_convesion(in_coord, center = True):
    return [(i * SCALE) + (int(0.5 * SCALE) if center else 0) for i in in_coord]


## Draw Hyperlanes
GRAY = (104, 104, 104)
for h in hyperlanes:
    start = pixel_convesion(stars[h[0]])
    end = pixel_convesion(stars[h[1]])
    
    output_image = cv2.line(output_image, start, end, GRAY, int(STAR_SIZE*0.4), cv2.LINE_AA)
## Draw Stars
for p in stars:
    output_image = cv2.circle(output_image, pixel_convesion(p), STAR_SIZE, (255, 255, 255), -1, cv2.LINE_AA)

#output_image = cv2.GaussianBlur(output_image, (3,3),0)
#cv2.imshow("Final Result",output_image)
cv2.imwrite("output.png", output_image)
#cv2.waitKey(0)