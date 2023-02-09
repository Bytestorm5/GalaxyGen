var galaxy;
var resources;
var countries;

//0 = View
//1 = Add Star
//2 = Modify Star
//3 = Delete Lane
//4 = Add Lane
var edit_mode = 0;

//0 = Only geography
//1 = Resources
//2 = Countries
var view_mode = 0;

async function getJsonFile(filename) {
    return await fetch(`./${filename}`)
    .then((response) => response.json())
    .then((json) => {
        console.log(json)
        return json                    
    });
}  

async function get_mask(x, y) {
    var requestOptions = {
        method: 'GET',
        redirect: 'follow'
    };

    //var raw;
    
    return await fetch(`/api/getMask?x=${x}&y=${y}`, requestOptions)
    .then(response => response.text())
    .then(result => {
        console.log(result)
        var raw = JSON.parse(result)['pixel']
        if (raw[0] != 0) {
            var out = raw[0] == 255 ? "Star " : "Lane ";                    
            var id = raw[1]
            id += raw[2] * 255
            out += `${id} (${x}, ${y})`                        
            return [out, raw, id, [x, y]]
        }     
        else {
            return ["Background", [0, 0, 0], -1, [x, y]]
        }
    })
    .catch(error => console.log('error', error));             
}

async function getVoronoi(star_set) {
    var myHeaders = new Headers();
    myHeaders.append("Content-Type", "application/json");

    var raw = JSON.stringify(star_set);

    var requestOptions = {
        method: 'POST',
        headers: myHeaders,
        body: raw,
        redirect: 'follow'
    };

    return fetch("/api/GetCells", requestOptions)
    .then(response => response.json())
    .then(result => {
        console.log(result)
        galaxy['voronoi'] = result
    })
    .catch(error => console.log('error', error));
}

function saveGalaxy() {
    //Do not include voronoi in output file
    voronoi = galaxy.voronoi
    delete galaxy.voronoi

    var fs = require('fs');
    fs.writeFile("galaxy.json", galaxy, function(err) {
        if (err) {
            console.log(err);
        }
    });
    //Restore voronoi for renderer
    galaxy['voronoi'] = voronoi
}
async function canvasSetup() {           
    galaxy = await getJsonFile('galaxy.json') 
    resources = await getJsonFile('resources.json') 
    countries = await getJsonFile('countries.json')   
    await getVoronoi(galaxy['stars'])   
    let canvas = document.getElementById("canvas")
    let ctx = canvas.getContext('2d')

    let cameraOffset = { x: window.innerWidth/2, y: window.innerHeight/2 }
    let cameraZoom = 1
    let MAX_ZOOM = 50
    let MIN_ZOOM = 0.5
    let SCROLL_SENSITIVITY = -0.0005    
    
    let mouseX = undefined
    let mouseY = undefined

    SCALE = 2

    function draw()
    {
        canvas.width = window.innerWidth
        canvas.height = window.innerHeight
        
        // Translate to the canvas centre before zooming - so you'll always zoom on what you're looking directly at
        ctx.translate( window.innerWidth / 2, window.innerHeight / 2 )
        ctx.scale(cameraZoom, cameraZoom)
        ctx.translate( -window.innerWidth / 2 + cameraOffset.x, -window.innerHeight / 2 + cameraOffset.y )
        ctx.clearRect(0,0, window.innerWidth, window.innerHeight)
        // ctx.fillStyle = "#991111"
        // drawRect(-50,-50,100,100)
        
        // ctx.fillStyle = "#eecc77"
        // drawRect(-35,-35,20,20)
        // drawRect(15,-35,20,20)
        // drawRect(-35,15,70,20)
        
        // ctx.fillStyle = "#fff"
        // drawText("Simple Pan and Zoom Canvas", -255, -100, 32, "courier")
        
        // ctx.rotate(-31*Math.PI / 180)
        // ctx.fillStyle = `#${(Math.round(Date.now()/40)%4096).toString(16)}`
        // drawText("Now with touch!", -110, 100, 32, "courier")
        
        // ctx.fillStyle = "#fff"
        // ctx.rotate(31*Math.PI / 180)
        
        // drawText("Wow, you found me!", -260, -2000, 48, "courier")

        galaxy.hyperlanes.forEach(function (element, i) {
            s0 = galaxy.stars[element[0]]
            s1 = galaxy.stars[element[1]]
            if (s0[0] >= 0 && s0[1] >= 0 && s1[0] >= 0 && s1[1] >= 0) {
                drawLine(s0[0] * SCALE, s0[1] * SCALE, s1[0] * SCALE, s1[1] * SCALE, 'gray', 0.2 * SCALE, i)
            }
        });

        galaxy.stars.forEach(function (element, i) {
            if (element[0] >= 0 && element[1] >= 0) {
                drawCircle(ctx, element[0] * SCALE, element[1] * SCALE, 0.1 * SCALE, 'white', 'white', 1, i)
            }                        
        });          
        
        if (view_mode != 0) {
            let regions = view_mode == 2 ? galaxy["ownership"] : galaxy["resources"]
            let file = view_mode == 2 ? countries : resources

            regions.forEach(function (element, i) {
                data = file[element['id']]
                element.systems.forEach(sys => {
                    r = galaxy.voronoi[sys]
                    drawPoly(r, `rgba(${data.color[0]}, ${data.color[1]}, ${data.color[2]}, 0.5)`, `rgba(${data.color[0]}, ${data.color[1]}, ${data.color[2]}, 0.75)`, 0.3 * SCALE, SCALE, element['id'])
                })
            })
        }
        requestAnimationFrame(draw)
    }

    // Gets the relevant location from a mouse or single touch event
    function getEventLocation(e)
    {
        if (e.touches && e.touches.length == 1)
        {
            return { x:e.touches[0].clientX, y: e.touches[0].clientY }
        }
        else if (e.clientX && e.clientY)
        {
            return { x: e.clientX, y: e.clientY }        
        }
    }
    function drawCircle(ctx, x, y, radius, fill, stroke, strokeWidth, i) {
        ctx.beginPath()
        ctx.arc(x, y, radius, 0, 2 * Math.PI, false)

        if (fill) {
            ctx.fillStyle = fill
            ctx.fill()
        }
        if (stroke) {
            ctx.lineWidth = strokeWidth
            ctx.strokeStyle = stroke
            ctx.stroke()
        }
    }
    function drawLine(x0, y0, x1, y1, color, width, i) {                    
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);       

        ctx.lineWidth = width
        ctx.strokeStyle = color

        ctx.stroke(); 
    }

    function drawPoly(points, fill, stroke, strokeWidth, SCALE, i) {
        ctx.beginPath()
        ctx.moveTo(points[0][0] * SCALE, points[0][1] * SCALE)
        points.forEach(p => {
            ctx.lineTo(p[0] * SCALE, p[1] * SCALE)
        })
        ctx.closePath()

        if (fill) {
            ctx.fillStyle = fill
            ctx.fill()
        }
        if (stroke) {
            ctx.lineWidth = strokeWidth
            ctx.strokeStyle = stroke
            ctx.stroke()
        }
    }

    let isDragging = false
    let dragStart = { x: 0, y: 0 }

    function onPointerDown(e)
    {
        isDragging = true
        dragStart.x = getEventLocation(e).x/cameraZoom - cameraOffset.x
        dragStart.y = getEventLocation(e).y/cameraZoom - cameraOffset.y
    }

    function onPointerUp(e)
    {
        isDragging = false
        initialPinchDistance = null
        lastZoom = cameraZoom
    }

    function onPointerMove(e)
    {
        if (isDragging)
        {
            cameraOffset.x = getEventLocation(e).x/cameraZoom - dragStart.x
            cameraOffset.y = getEventLocation(e).y/cameraZoom - dragStart.y
        }
    }

    function handleTouch(e, singleTouchHandler)
    {
        if ( e.touches.length == 1 )
        {
            singleTouchHandler(e)
        }
        else if (e.type == "touchmove" && e.touches.length == 2)
        {
            isDragging = false
            handlePinch(e)
        }
    }

    let initialPinchDistance = null
    let lastZoom = cameraZoom

    function handlePinch(e)
    {
        e.preventDefault()
        
        let touch1 = { x: e.touches[0].clientX, y: e.touches[0].clientY }
        let touch2 = { x: e.touches[1].clientX, y: e.touches[1].clientY }
        
        // This is distance squared, but no need for an expensive sqrt as it's only used in ratio
        let currentDistance = (touch1.x - touch2.x)**2 + (touch1.y - touch2.y)**2
        
        if (initialPinchDistance == null)
        {
            initialPinchDistance = currentDistance
        }
        else
        {
            adjustZoom( null, currentDistance/initialPinchDistance )
        }
    }

    function adjustZoom(zoomAmount, zoomFactor)
    {
        if (!isDragging)
        {
            if (zoomAmount)
            {
                cameraZoom += zoomAmount*cameraZoom
            }
            else if (zoomFactor)
            {
                console.log(zoomFactor)
                cameraZoom = zoomFactor*lastZoom
            }
            
            cameraZoom = Math.min( cameraZoom, MAX_ZOOM )
            cameraZoom = Math.max( cameraZoom, MIN_ZOOM )
            
            console.log(cameraZoom)
            console.log(`Mouse: ${mouseX}, ${mouseY}`)
            console.log(`Offset: ${cameraOffset.x}, ${cameraOffset.y}`)
            // console.log(zoomAmount)
        }
    }

    function getTransformedPoint(x, y) {
        const originalPoint = new DOMPoint(x, y);
        return ctx.getTransform().invertSelf().transformPoint(originalPoint);
    } 
    
    function pnpoly( nvert, vertx, verty, testx, testy ) { 
        var i, j, c = false;
        for( i = 0, j = nvert-1; i < nvert; j = i++ ) {
            //alert( 'verty[i] - ' + verty[i] + ' testy - ' + testy + ' verty[j] - ' + verty[j] + ' testx - ' + testx); 
            if( ( ( verty[i] > testy ) != ( verty[j] > testy ) ) && ( testx < ( vertx[j] - vertx[i] ) * ( testy - verty[i] ) / ( verty[j] - verty[i] ) + vertx[i] ) ) {
                c = !c; 
                //alert('Condition true') 
            } 
        } 
        return c; 
    }

    async function handleClick(e) { 
        mouse = getTransformedPoint(getEventLocation(e).x, getEventLocation(e).y)
        mouseX = mouse.x
        mouseY = mouse.y
      

        document.getElementById("active").innerHTML = `Loading... (${mouseX}, ${mouseY})`
        if (edit_mode == 0 && view_mode != 0) {
            active_regions = view_mode == 2 ? galaxy.ownership : galaxy.resources
            file = view_mode == 2 ? countries : resources

            found = false

            for (var i = 0; i < active_regions.length; i++) {
                region_instance = active_regions[i]
                data = file[region_instance['id']]

                selected_region = -1
                j = 0
                while (j < region_instance['systems'].length && selected_region == -1) {
                    region = galaxy.voronoi[region_instance['systems'][j]]

                    xs = region.map(x => x[0] * SCALE)
                    ys = region.map(x => x[1] * SCALE)

                    if (pnpoly(region.length, xs, ys, mouseX, mouseY)) {
                        document.getElementById("active").innerHTML = `${country_mode ? "Country" : "Resource"}: ${data['name']} (Region ${j})`
                        selected_region = j
                        found = true
                    }
                    j++
                }
                if (selected_region != -1) {
                    break
                }
            }

            if (!found) {
                document.getElementById("active").innerHTML = `Background (${Math.round(mouseX)}, ${Math.round(mouseY)})`
            }
        }
        else if (edit_mode != 0) {
            maskPoint = await get_mask(mouseX, mouseY)

        }
    }

    canvas.addEventListener('mousedown', handleClick)
    canvas.addEventListener('mousedown', onPointerDown)
    canvas.addEventListener('touchstart', (e) => handleTouch(e, onPointerDown))
    canvas.addEventListener('mouseup', onPointerUp)
    canvas.addEventListener('touchend',  (e) => handleTouch(e, onPointerUp))
    canvas.addEventListener('mousemove', onPointerMove)
    canvas.addEventListener('touchmove', (e) => handleTouch(e, onPointerMove))
    canvas.addEventListener( 'wheel', (e) => adjustZoom(e.deltaY*SCROLL_SENSITIVITY))                
    
    function updateViewText() {
        let modetext = ""
        if (view_mode == 0) { modetext = "Geography" }
        if (view_mode == 1) { modetext = "Resource" }
        if (view_mode == 2) { modetext = "Country" }
        document.getElementById("mode").innerHTML = `View: ${modetext})`
    }

    document.addEventListener("keydown", (e) => {  
        if (e.key === "[") {
            view_mode = (country_mode + 1) % 3
            updateViewText()
        }
        else if (e.key === "]") {
            view_mode = (country_mode - 1) % 3
            updateViewText()
        }
        else if (e.key === "+" || e.key === "=") {
            adjustZoom(0.05)
        }
        else if (e.key === "-" || e.key === "_") {
            adjustZoom(-0.05)
        }
        else if (e.key === "ArrowLeft") {
            cameraOffset.x += 5
        }
        else if (e.key === "ArrowRight") {
            cameraOffset.x -= 5
        }
        else if (e.key === "ArrowDown") {
            cameraOffset.y += 5
        }
        else if (e.key === "ArrowUp") {
            cameraOffset.y -= 5
        }
        //console.log(galaxy) Can access galaxy from this scope
    })   

    draw()
}

async function toolbarSetup() {
    edit_mode_text = document.getElementById("edit_mode")
    var link = document.getElementById('b_viewer');
    link.onclick = (event) => {
        console.log("Viewer Mode")
        edit_mode = 0;
        mode_text.innerHTML = "Edit Mode: None" 
    };

    link = document.getElementById('b_del_star');
    link.onclick = (event) => {
        console.log("Star Modifier")
        edit_mode = 1;
        mode_text.innerHTML = "Edit Mode: Modify Star"
        
        updateButtons()
    };

    link = document.getElementById('b_add_star');
    link.onclick = (event) => {
        console.log("Add Star")
        edit_mode = 2;
        mode_text.innerHTML = "Edit Mode: Add Star"

        updateButtons()
    };

    link = document.getElementById('b_del_lane');
    link.onclick = (event) => {
        console.log("Delete Lane")
        edit_mode = 3;
        mode_text.innerHTML = "Edit Mode: Delete Lane"

        updateButtons()
    };

    link = document.getElementById('b_add_lane');
    link.onclick = (event) => {
        console.log("Add Lane")
        edit_mode = 4;
        mode_text.innerHTML = "Edit Mode: Add Lane"

        updateButtons()
    };

    updateButtons()
}

document.addEventListener('DOMContentLoaded', canvasSetup)
document.addEventListener('DOMContentLoaded', toolbarSetup)