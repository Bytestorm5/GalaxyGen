from PIL import Image

im = Image.open('Distribution.png') # Can be many different formats.
pix = im.load()
print(im.size)  # Get the width and hight of the image for iterating over
print(pix[0,0])  # Get the RGBA Value of the a pixel of an image
#pix[x,y] = value  # Set the RGBA Value of the image (tuple)
#im.save('Distribution.png')  # Save the modified pixels as .png