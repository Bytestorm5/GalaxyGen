from flask import Flask, render_template, send_from_directory, url_for, redirect, session
from flask import request
import json, codecs
import os
import requests
#import subprocess
from flask_cors import CORS #comment this on deployment
import numpy as np
from PIL import Image
from render import pixel_conversion, inverse_conversion, get_star_cells
import render as Renderer

app = Flask(__name__, static_folder='')
CORS(app)

input_image = Renderer.render()
#input_array = np.array(input_image) / 255

def saveGalaxy(path = "galaxy.json", render = True):
    global input_image
    json.dump(galaxy, codecs.open(path, 'w', encoding='utf-8'), 
          separators=(',', ':'), 
          sort_keys=True, 
          indent=4)
    if render:
        input_image = Renderer.render()        
        #input_array = np.array(input_image) / 255

galaxy = json.load(open("galaxy.json"))



@app.route("/")
def director():
    return render_template("index.html")

@app.route("/edit-galaxy")
def edit_systems():
    return render_template("edit_systems.html") 

@app.route("/edit-countries")
def edit_nations():
    return render_template("edit_nations.html") 

@app.route("/view")
def view_systems():
    return render_template("view_systems.html") 

@app.route("/view-resources")
def view_resources():
    return render_template("view_resources.html") 

@app.route("/api/getMask")
def getMask():
    x = float(request.args.get('x'))
    y = float(request.args.get('y'))
    coord = pixel_conversion((x, y), True)
    return {'pixel':np.ndarray.tolist(input_image[int(coord[1]), int(coord[0])][::-1])}

@app.route("/api/DeleteStar")
def delStar():
    id = int(request.args.get('id', None))
    star = galaxy['stars'][id]
    galaxy['stars'][id] = [-1, -1]
    #check for and delete any duplicates
    ids = [i for i in range(len(galaxy)) if galaxy['stars'][i] == star]    
    for i in ids:
        galaxy['stars'][i] = [-1, -1]
    ids.append(id)
    for lane in galaxy['hyperlanes']:
        for i in ids:
            if i in lane:
                print(lane)
                galaxy['hyperlanes'].remove(lane)
    saveGalaxy()
    return f"Successfully Deleted Star {id}"

@app.route("/api/AddStar")
def addStar():
    x = int(request.args.get('x'))
    y = int(request.args.get('y'))
    print(f"Add star @ {x}, {y}")
    coord = inverse_conversion([x, y])
    print(f"Converted to {coord}")
    #If star already exists, do nothing
    if coord not in galaxy['stars']:
        galaxy['stars'].append(coord)
    saveGalaxy()    
    return f"Successfully Added Star {len(galaxy['stars']) - 1}"

@app.route("/api/DeleteLane")
def delLane():
    id = int(request.args.get('id', None))
    lane = galaxy['hyperlanes'].pop(id)
    #check for and delete any duplicates
    if lane in galaxy['hyperlanes']:
        galaxy['hyperlanes'] = list(filter((lane).__ne__, galaxy['hyperlanes']))
    saveGalaxy()
    return f"Successfully Deleted Lane {id}"

@app.route("/api/AddLane")
def addLane():
    id1 = int(request.args.get('id1', None))
    id2 = int(request.args.get('id2', None))
    lane = [id1, id2]
    if lane not in galaxy['hyperlanes']:
        galaxy['hyperlanes'].append(lane)
        saveGalaxy()
    return f"Successfully Connected Stars {id1} and {id2}"

@app.route("/api/GetCells", methods=['POST'])
def getCells():
    if request.content_type == "application/json":
        stars = request.json
        regions = get_star_cells(stars)
        return json.dumps(regions)
    else:
        return "Invalid Request Type!"

if __name__ == '__main__':    
    #pgcr_thread = subprocess.run(['python', 'PGCRscanner.py'], capture_output=True, text=True, check=True)
    #CORS(app) #comment this on deployment
    port = int(os.environ.get("PORT", 8080))
    app.run(host='0.0.0.0', port=port)
    #pgcr_thread.terminate()
