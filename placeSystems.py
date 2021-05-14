import random
from scipy.spatial import Delaunay
import numpy
from PIL import Image

__max_probability__ = 2
__system_count__ = 25

im = Image.open('Distribution.png')  # Can be many different formats.
pixH = im.convert('HSV').load()
imRGB = im.convert('RGB')
pix = imRGB.load()

probability = []
for x in range(0, im.size[0]):
    for y in range(0, im.size[1]):
        p = (255 - pixH[x, y][2])
        for i in range(0, int(p)):
            probability.append([x, y])

k = random.choices(probability, k=int(__system_count__))

tri = Delaunay(k)
points = numpy.array(k)

text_file = open("lanes.txt", "w")
n = text_file.write(str(points[tri.simplices]).strip())
text_file.close()

# for x in range(0, im.size[0]):
#     for y in range(0, im.size[1]):
#         if not k.__contains__((x, y)):
#             pix[x, y] = (255, 255, 255)
#         else:
#             pix[x, y] = (0, 0, 0)
# imRGB.save('Distribution2.png')
