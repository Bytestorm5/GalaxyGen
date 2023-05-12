var galaxy;
var resources;
var countries;

var selection1 = undefined;
var selection2 = undefined;

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

function updateViewText() {
    let modetext = ""        
    if (view_mode == 0) { modetext = "Geography" }
    if (view_mode == 1) { modetext = "Resource" }
    if (view_mode == 2) { modetext = "Country" }
    console.log(`View Mode | ${view_mode}: ${modetext}`)
    document.getElementById("mode").innerHTML = `View: ${modetext}`
}

//0 = View
//1 = Add Star
//2 = Modify Star
//3 = Delete Lane
//4 = Add Lane
function updateEditText() {
    let modetext = ""        
    if (edit_mode == 0) { modetext = "None" }
    if (edit_mode == 1) { modetext = "Add Star" }
    if (edit_mode == 2) { modetext = "Modify Star" }
    if (edit_mode == 3) { modetext = "Delete Lane" }
    if (edit_mode == 4) { modetext = "Add Lane" }
    console.log(`Edit Mode | ${edit_mode}: ${modetext}`)
    document.getElementById("edit_mode").innerHTML = `Edit: ${modetext}`
    updateButtons()
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

async function saveGalaxy() {
    //Do not include voronoi in output file
    var galaxy_out = JSON.parse(JSON.stringify(galaxy)) //Deep copy
    voronoi = galaxy_out.voronoi
    delete galaxy_out.voronoi

    var myHeaders = new Headers();
    myHeaders.append("Content-Type", "application/json");

    var raw = JSON.stringify(galaxy_out);

    var requestOptions = {
        method: 'POST',
        headers: myHeaders,
        body: raw,
        redirect: 'follow'
    };

    await fetch("/api/SaveGalaxy", requestOptions)
    .then(response => response.text())
    .then(result => console.log(result))
    .catch(error => console.log('error', error));

    //Restore voronoi for renderer
    //galaxy['voronoi'] = voronoi
    await getVoronoi(galaxy['stars'])

    selection1 = undefined
    document.getElementById("selected_item_1").innerHTML = ""

    selection2 = undefined
    document.getElementById("selected_item_2").innerHTML = ""
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

//This is inefficient but isn't slow enough to be a problem (for now)
function searchRegionForSystem(active_regions, file, x, y) {
    for (var i = 0; i < active_regions.length; i++) {
        region_instance = active_regions[i]
        data = file[region_instance['id']]

        selected_region = -1
        j = 0
        while (j < region_instance['systems'].length && selected_region == -1) {
            region = galaxy.voronoi[region_instance['systems'][j]]

            xs = region.map(x => x[0] * SCALE)
            ys = region.map(x => x[1] * SCALE)

            if (pnpoly(region.length, xs, ys, x, y)) {
                selected_region = region_instance['systems'][j]
            }
            j++
        }
        if (selected_region != -1) {
            //Found Valid Region
            return {
                "instance": region_instance,
                "instance_index": i,
                "selected_region": j
            }
        }
    }
    return {
        "instance": null,
        "instance_index": -1,
        "selected_region": null
    }
}

function searchRegionForSystem(active_regions, file, idx) {
    for (var i = 0; i < active_regions.length; i++) {
        region_instance = active_regions[i]
        data = file[region_instance['id']]

        selected_region = -1
        j = 0
        while (j < region_instance['systems'].length && selected_region == -1) {
            if (region_instance['systems'][j] == idx) {
                selected_region = idx
            }
            j++
        }
        if (selected_region != -1) {
            //Found Valid Region
            return {
                "instance": region_instance,
                "instance_index": i,
                "selected_region": j
            }
        }
    }
    return {
        "instance": null,
        "instance_index": -1,
        "selected_region": null
    }
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

        if (edit_mode == 4 && selection1 != null && selection2 != null && selection1[1][0] == 255 && selection2[1][0] == 255) {
            drawLine(selection1[3][0] * SCALE, selection1[3][1] * SCALE, selection2[3][0] * SCALE, selection2[3][1] * SCALE, 'green', 0.2 * SCALE, -1)
        }

        galaxy.stars.forEach(function (element, i) {
            if (element[0] >= 0 && element[1] >= 0) {
                drawCircle(ctx, element[0] * SCALE, element[1] * SCALE, 0.1 * SCALE, 'white', 'white', 1, i)
            }                        
        });      
        
        if (edit_mode == 1 && selection1 != null && selection1[1][0] == 0) {
            drawCircle(ctx, selection1[3][0] * SCALE, selection1[3][1] * SCALE, 0.1 * SCALE, 'green', 'green', 1, -1)
        }
        
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

            if (selection1 != null && selection1[2] == i && selection1[1][0] == 255) {
                if (edit_mode == 4) {
                    ctx.fillStyle = 'rgb(43, 183, 198)'
                }
                else if (edit_mode == 2) {
                    ctx.fillStyle = 'rgb(198, 43, 43)'
                }
            }
            if (edit_mode == 4 && selection2 != null && selection2[2] == i && selection2[1][0] == 255) {
                ctx.fillStyle = 'rgb(43, 183, 198)'
            }        

            ctx.fill()
        }
        if (stroke) {
            ctx.lineWidth = strokeWidth
            ctx.strokeStyle = stroke

            if (selection1 != null && selection1[2] == i && selection1[1][0] == 255) {
                if (edit_mode == 4) {
                    ctx.strokeStyle = 'rgb(43, 183, 198)'
                }
                else if (edit_mode == 2) {
                    ctx.strokeStyle = 'rgb(196, 163, 0)'
                }
            }
            if (edit_mode == 4 && selection2 != null && selection2[2] == i && selection2[1][0] == 255) {
                ctx.strokeStyle = 'rgb(43, 183, 198)'
            } 

            ctx.stroke()
        }
    }
    function drawLine(x0, y0, x1, y1, color, width, i) {                    
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);       

        ctx.lineWidth = width
        ctx.strokeStyle = color

        if (edit_mode == 3 && selection1 != null && selection1[1][0] == 127 && selection1[2] == i) {
            ctx.strokeStyle = 'rgb(198, 43, 43)'
        }

        ctx.stroke(); 
    }

    function drawPoly(points, fill, stroke, strokeWidth, SCALE, i) {
        ctx.beginPath()
        ctx.moveTo(points[0][0] * SCALE, points[0][1] * SCALE)
        points.forEach(p => {
            if (p[0] != -1 && p[1] != -1) {
                ctx.lineTo(p[0] * SCALE, p[1] * SCALE)
            }
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
            
            // console.log(cameraZoom)
            // console.log(`Mouse: ${mouseX}, ${mouseY}`)
            // console.log(`Offset: ${cameraOffset.x}, ${cameraOffset.y}`)
            // console.log(zoomAmount)
        }
    }

    function getTransformedPoint(x, y) {
        const originalPoint = new DOMPoint(x, y);
        return ctx.getTransform().invertSelf().transformPoint(originalPoint);
    } 
    
    function dot_product(ax, ay, bx, by) {
        return (ax * bx) + (ay * by)
    }
    function cross_product(ax, ay, bx, by) {
        return (ax * by) - (ay * bx)
    }
    function normalize(x, y) {
        len = Math.sqrt(x*x + y*y)
        return [[x/len, y/len], len]
    }
    function triangle_area(ax, ay, bx, by, cx, cy) {
        out_val = ax * (bx - cx)
        out_val += bx * (cx - ax)
        out_val += cx * (ax - bx)
        return 0.5 * out_val
    }
    async function handleClick(e) { 
        mouse = getTransformedPoint(getEventLocation(e).x, getEventLocation(e).y)
        mouseX = mouse.x
        mouseY = mouse.y
      
        if (!(edit_mode == 4 && selection1 != null)) {
            document.getElementById("selected_item_1").innerHTML = `Loading... (${Math.round(mouseX / SCALE)}, ${Math.round(mouseY / SCALE)})`
        }

        if (edit_mode == 0 && view_mode != 0) {
            active_regions = view_mode == 2 ? galaxy.ownership : galaxy.resources
            file = view_mode == 2 ? countries : resources

            search = searchRegionForSystem(active_regions, file, mouseX, mouseY)
            if (search["instance"] != null) {
                document.getElementById("selected_item_1").innerHTML = `${view_mode == 2 ? "Country" : "Resource"}: ${search["instance"]["name"]} (Region ${search["selected_region"]})`
            }
            else {
                document.getElementById("selected_item_1").innerHTML = `Background (${Math.round(mouseX / SCALE)}, ${Math.round(mouseY / SCALE)})`
            }
        }
        else if (edit_mode != 0) {
            galaxy_point = new DOMPoint(mouseX / SCALE, mouseY / SCALE)
            maskPoint = undefined;
            
            if (edit_mode != 3) {
                clicked_star = -1
                for (let i = 0; i < galaxy.stars.length; i++) {
                    element = galaxy.stars[i]
                    if (element[0] >= 0 && element[1] >= 0) {
                        r = 0.4
                        xdist = element[0] - (galaxy_point.x)
                        ydist = element[1] - (galaxy_point.y)
                        dist = Math.sqrt(xdist*xdist + ydist*ydist)   
                                              
                        if (dist <= r) {
                            clicked_star = i
                            break
                        }                                            
                    }   
                }                
                if (clicked_star == -1) {
                    maskPoint = [`Background (${Math.round(galaxy_point.x)}, ${Math.round(galaxy_point.y)})`, [0, 0, 0], -1, [Math.round(galaxy_point.x), Math.round(galaxy_point.y)]]
                }
                else {
                    b_val = Math.floor(clicked_star / 255)
                    g_val = clicked_star % 255
                    star = galaxy.stars[clicked_star]
                    maskPoint = [`Star ${clicked_star} (${Math.round(galaxy_point.x)}, ${Math.round(galaxy_point.y)})`, [255, g_val, b_val], clicked_star, [Math.round(galaxy_point.x), Math.round(galaxy_point.y)]]
                }
            }
            else {
                clicked_lane = -1
                min_dist = 1999
                min_i = -1
                for (let i = 0; i < galaxy.hyperlanes.length; i++) {
                    element = galaxy.hyperlanes[i]
                    a = galaxy.stars[element[0]]
                    b = galaxy.stars[element[1]]
                    if (a[0] >= 0 && a[1] >= 0 && b[0] >= 0 && b[1] >= 0) {
                        w = 0.3

                        ap = normalize(galaxy_point.x - a[0], galaxy_point.y - a[1])
                        bp = normalize(galaxy_point.x - b[0], galaxy_point.y - b[1])
                        ab = normalize(b[0] - a[0], b[1] - a[1])

                        limit = Math.sqrt((ab[1] * ab[1]) + (w * w)) / ab[1]

                        dist = (ap[1] + bp[1]) / (ab[1])

                        if (dist <= 1 && triangle_area(a[0], a[1], b[0], b[1], c[0], c[1]) == 0) {
                            console.log(`${i} is co-linear`)
                        }

                        if (dist <= min_dist) {
                            min_dist = dist
                            min_i = i
                            clicked_lane = i
                        }
                    }   
                }
                console.log("Minimum Distance Lane")
                console.log(`${min_i} -> ${min_dist}`)
                if (clicked_lane == -1) {
                    maskPoint = [`Background (${Math.round(galaxy_point.x)}, ${Math.round(galaxy_point.y)})`, [0, 0, 0], -1, [Math.round(galaxy_point.x), Math.round(galaxy_point.y)]]
                }
                else {
                    b_val = Math.floor(clicked_lane / 255)
                    g_val = clicked_lane % 255
                    maskPoint = [`Lane ${clicked_lane} (${Math.round(galaxy_point.x)}, ${Math.round(galaxy_point.y)})`, [127, g_val, b_val], clicked_lane, [Math.round(galaxy_point.x), Math.round(galaxy_point.y)]]
                }
            }
            console.log(maskPoint)
            //1 = Add Star          
            if (edit_mode == 1 && maskPoint[1][0] == 0) {
                selection1 = maskPoint                
            }
            //2 = Modify Star
            else if (edit_mode == 2) {
                selection1 = maskPoint
            }
            //3 = Delete Lane
            else if (edit_mode == 3 && maskPoint[1][0] == 127) {
                selection1 = maskPoint
            }
            //4 = Add Lane
            else if (edit_mode == 4 && maskPoint[1][0] == 255) {
                if (selection1 == null) {
                    //First Selection
                    selection1 = maskPoint
                    document.getElementById("selected_item_1").innerHTML = `Selected: ${maskPoint[0]}`
                }
                else {
                    //Second Selection
                    selection2 = maskPoint
                    document.getElementById("selected_item_2").innerHTML = `Selected: ${maskPoint[0]}`
                }
            }     

            if (edit_mode != 4) {
                document.getElementById("selected_item_1").innerHTML = `Selected: ${maskPoint[0]}`
            }
            updateButtons()
        }
    }

    function applyChanges() {
        //1 = Add Star          
        if (edit_mode == 1 && maskPoint[1][0] == 0) {
            rounded_point = [Math.round(mouseX / SCALE), Math.round(mouseY / SCALE)]
            galaxy.stars.push(rounded_point)
        }
        //2 = Modify Star
        else if (edit_mode == 2 && maskPoint[1][0] == 255) {
            resource_dropdown = document.getElementById("resource_dropdown")
            owner_dropdown = document.getElementById("owner_dropdown")

            console.log(`SET ${maskPoint[2]} -- R: ${resource_dropdown.value} | C: ${owner_dropdown.value}`)

            //i is initialized outside the loop so that it's marginally easier to determine if either resources/ownership dicts are empty
            i = 0
            for (; i < galaxy.resources.length; i++) {
                region_instance = galaxy.resources[i]
                if (parseInt(resource_dropdown.value) != parseInt(region_instance['id'])) {
                    region_instance['systems'] = region_instance['systems'].filter(function(e) { return e !== maskPoint[2] })
                }
                else if (!region_instance['systems'].includes(maskPoint[2])) {
                    region_instance['systems'].push(maskPoint[2])
                }
                galaxy.resources[i] = region_instance
            }

            if (i <= parseInt(resource_dropdown.value)) {
                //Generate all resource dicts up to the current resource
                for (; i < parseInt(resource_dropdown.value); i++) {
                    galaxy.resources.push({
                        'id':i,
                        systems: []
                    })
                }
                //Add the resource being set w/ the relevant system
                galaxy.resources.push({
                    'id':parseInt(resource_dropdown.value),
                    systems: [maskPoint[2]]
                })
            }

            i = 0
            for (; i < galaxy.ownership.length; i++) {
                region_instance = galaxy.ownership[i]
                if (parseInt(owner_dropdown.value) != parseInt(region_instance['id'])) {
                    region_instance['systems'] = region_instance['systems'].filter(function(e) { return e !== maskPoint[2] })
                }
                else if (!region_instance['systems'].includes(maskPoint[2])) {
                    region_instance['systems'].push(maskPoint[2])
                }
                galaxy.ownership[i] = region_instance
            }

            if (i <= parseInt(owner_dropdown.value)) {
                //Generate all owner dicts up to the current owner
                for (; i < parseInt(owner_dropdown.value); i++) {
                    galaxy.ownership.push({
                        'id':i,
                        systems: []
                    })
                }
                //Add the owner being set w/ the relevant system
                galaxy.ownership.push({
                    'id':parseInt(owner_dropdown.value),
                    systems: [maskPoint[2]]
                })
            }
        }
        //3 = Delete Lane
        else if (edit_mode == 3 && maskPoint[1][0] == 127) {
            galaxy.hyperlanes.splice(maskPoint[2], 1)
        }
        //4 = Add Lane
        else if (edit_mode == 4 && maskPoint[1][0] == 255) {
            new_lane = [selection1[2], selection2[2]]
            galaxy.hyperlanes.push(new_lane)
        }         
    }

    document.getElementById("confirm_button").onclick = (event) => {
        applyChanges()
    }
    document.getElementById("delete_button").onclick = (event) => {
        if (edit_mode == 2 && selection1[1][0] == 255) {
            //Condition should never be false, but better safe than sorry
            galaxy.stars[selection1[2]] = [-1, -1]
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

    function mod(n, m) {
        return ((n % m) + m) % m;
    }

    document.addEventListener("keydown", (e) => {  
        if (e.key === "[") {
            view_mode = mod((view_mode + 1), 3)
            updateViewText()
        }
        else if (e.key === "]") {
            view_mode = mod((view_mode - 1), 3)
            updateViewText()
        }
        else if (e.key === ",") {
            edit_mode = mod((edit_mode + 1), 5)
            updateEditText()
        }
        else if (e.key === ".") {
            edit_mode = mod((edit_mode - 1), 5)
            updateEditText()
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

function updateButtons() {
    document.getElementById("confirm_button").hidden = edit_mode == 0
    document.getElementById("clear_1").hidden = edit_mode != 4
    document.getElementById("clear_2").hidden = edit_mode != 4
    document.getElementById("selected_item_2").hidden = edit_mode != 4
    document.getElementById("star_mod_menu").hidden = edit_mode != 2
    document.getElementById("delete_button").hidden = edit_mode != 2
    
    if (edit_mode == 2) {
        resource_dropdown = document.getElementById("resource_dropdown")
        owner_dropdown = document.getElementById("owner_dropdown")
        
        if (selection1 != null && selection1[1][0] == 255) {
            resource_dropdown.innerHTML = "<option value=\"-1\">No Resources</option>"
            owner_dropdown.innerHTML = "<option value=\"-1\">Unclaimed System</option>"

            resources.forEach(function (element, i) {
                resource_dropdown.innerHTML += `<option value=\"${i}\">${element["name"]}</option>`
            })

            countries.forEach(function (element, i) {
                owner_dropdown.innerHTML += `<option value=\"${i}\">${element["name"]}</option>`
            })

            resource_dropdown.value = searchRegionForSystem(galaxy.resources, resources, selection1[2])["instance_index"]
            owner_dropdown.value = searchRegionForSystem(galaxy.ownership, countries, selection1[2])["instance_index"]  
        }      
        else {
            resource_dropdown = document.getElementById("resource_dropdown")
            owner_dropdown = document.getElementById("owner_dropdown")
            resource_dropdown.innerHTML = "<option value=\"-1\">No System Selected</option>"
            owner_dropdown.innerHTML = "<option value=\"-1\">No System Selected</option>"
        }
    }
}

async function toolbarSetup() {
    edit_mode_text = document.getElementById("edit_mode")
    var link = document.getElementById('b_viewer');
    link.onclick = (event) => {
        console.log("Viewer Mode")
        edit_mode = 0;
        updateEditText()
    };

    link = document.getElementById('b_add_star');
    link.onclick = (event) => {
        console.log("Add Star")
        edit_mode = 1;
        updateEditText()
    };

    link = document.getElementById('b_del_star');
    link.onclick = (event) => {
        console.log("Star Modifier")
        edit_mode = 2;
        updateEditText()
    };    

    link = document.getElementById('b_del_lane');
    link.onclick = (event) => {
        console.log("Delete Lane")
        edit_mode = 3;
        updateEditText()
    };

    link = document.getElementById('b_add_lane');
    link.onclick = (event) => {
        console.log("Add Lane")
        edit_mode = 4;
        updateEditText()
    };

    updateButtons()

    document.getElementById("clear_1").onclick = (event) => {
        selection1 = undefined
        document.getElementById("selected_item_1").innerHTML = ""
    }
    document.getElementById("clear_2").onclick = (event) => {
        selection2 = undefined
        document.getElementById("selected_item_2").innerHTML = ""
    }    
    document.getElementById("save_button").onclick = saveGalaxy
}

document.addEventListener('DOMContentLoaded', canvasSetup)
document.addEventListener('DOMContentLoaded', toolbarSetup)