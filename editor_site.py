from flask import Flask, render_template, send_from_directory, url_for, redirect, session
from flask import request
import json
import os
import requests
#import subprocess
from flask_cors import CORS #comment this on deployment
import numpy as np
from PIL import Image

app = Flask(__name__, static_folder='')
CORS(app)
input_image = Image.open("output_mask.png")
input_array = np.array(input_image) / 255

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
    x = request.args.get('x')
    y = request.args.get('y')
    return {'pixel':input_image.getpixel((int(x),int(y)))}

if __name__ == '__main__':    
    #pgcr_thread = subprocess.run(['python', 'PGCRscanner.py'], capture_output=True, text=True, check=True)
    #CORS(app) #comment this on deployment
    port = int(os.environ.get("PORT", 8080))
    app.run(host='0.0.0.0', port=port)
    #pgcr_thread.terminate()
