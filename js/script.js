d3.queue(1) // one task at a time.
  .defer(prepareInstances, "main")
  .defer(prepareInstances, "inset")
  .defer(prepareCollisions)
  .defer(preparePaths)
  .await(function(error, instances, inset, collisions, paths) {
    if (error) throw error;

    // The graphical elements
    createFeatures(my.main, [paths, collisions, instances]);
    createFeatures(my.inset, [inset]);

    // The time data
    my.events = instances.features
      .concat(inset.features)
      .concat(collisions.features)
      .map(function(feature){
        return {
          id: feature.properties.id,
          time: feature.properties.time,
          latLng: L.latLng(feature.geometry.coordinates[1], feature.geometry.coordinates[0]),
          zoom: feature.properties.zoom
        };
      }).sort(function(a, b){
        return a.time - b.time;
      });
    my.times = my.events.map(function(event){return event.time})
      .filter(function(value, index, self) {
        return self.indexOf(value) === index;
      });

    // The clock
    updateClock();

    // The event listeners.
      // The buttons
        // some kind of de-disabling?
    d3.select("#step_forward_btn").on("click", function(){
      my.currentTimeIndex++;
      updateClock();
    });
    d3.select("#step_back_btn").on("click", function(){
      my.currentTimeIndex--;
      updateClock();
    });
      // The map
    $("path").on("click", function(){
      var id = $(this).attr("id").replace(/inset/, "instance");
      if (id.match(/ins/)){
        var scrollFactor = $("#text_box").scrollTop() + $("#text_" + id).position().top - 25;
        $("#text_box").animate({
          scrollTop: scrollFactor
        }, 500);
      }
    });
    
      // The textbox
    $(".place").on("click", function(){
      var idNum = $(this).attr("id").replace(/^.*_/, ""),
        event = my.events.filter(function(ev) {
          return ev.id.match(new RegExp("_" + idNum + "$"));
        })[0];
      updateClock(event.time);
    });

  }); // close await()

function updateClock(epochTime) {
  // The clock
  if (my.currentTimeIndex < 0){
    console.log("negative");
    my.currentTimeIndex = my.times.length - 1;
  } else if (my.currentTimeIndex >= my.times.length){
    console.log("postiive");
    my.currentTimeIndex = 0;
  }
  if (epochTime) {
    var time = epochTime;
    my.currentTimeIndex = my.times.indexOf(time);
  } else {
    var time = my.times[my.currentTimeIndex];
  }
  var glyph = '<span class="glyphicon glyphicon-time"></span>&nbsp;';
  d3.select("#clock")
    .html(glyph + my.formatTime(new Date(time)));

  // The graphical elements
  deFireDot();
  var firingEvents = my.events.map(function(event){
    if (event.time === time) {
      return event;
    }
  }).filter(Boolean);
  firingEvents.forEach(function(event){
    fireDot(event);
  });
}

function fireDot(event){
  var bg = event.id.match(/set/) ? "#adaada" : "#00dd00", // "inset"
    path = event.id.match(/set/) ? my.inset.path : my.main.path;
  d3.select("#text_" + event.id.replace(/inset/, "instance"))
    .classed("fired-text", true)
    .transition()
    .duration(500)
    .style("background-color", bg);
  if (event.id.match(/set/)) {
    my.inset.map.setView(event.latLng, +event.zoom, {animate: false, duration: 0});
  }
  d3.select("#" + event.id)
    .classed("fired", true)
    .style("cursor", "pointer")
    .style("pointer-events", "visibleFill")
    .style("fill-opacity", 0.9)
    .transition()
    .duration(500)
    .style("fill-opacity", 0.25)
    .attr("d", path.pointRadius(100))
    .transition()
    .duration(500)
    .style("fill-opacity", 0.9)
    .attr("d", path.pointRadius(4.5))
}

function deFireDot(){
  d3.selectAll(".fired")
    .classed("fired", false)
    .style("pointer-events", "none")
    .style("cursor", "auto")
    .transition()
    .duration(function(d){if(d.properties.instanceType === "instance"){ return 10000; } else { return 1000;}})
    .style("fill-opacity", 0);
  d3.selectAll(".fired-text")
    .classed("fired-text", false)
    .transition()
    .duration(1000)
    .style("background-color", "transparent");
}

function createFeatures(mapObj, dataArray) {
  // mapObj is the my.main or my.inset object.
  // dataArray is [data, data]
  var features = dataArray.map(function(dataObj){
    return makeDotPaths(dataObj, mapObj);
  });
  mapObj.map.on("viewreset", reset);
  mapObj.map.on("zoomend", reset);
  reset();

  function reset() {
    var topLeft = LatLngToXY(mapObj.topLeft, mapObj.map),
      bottomRight = LatLngToXY(mapObj.bottomRight, mapObj.map);
    mapObj.svg.attr("width", bottomRight[0] - topLeft[0])
      .attr("height", bottomRight[1] - topLeft[1])
      .style("left", topLeft[0] + "px")
      .style("top", topLeft[1] + "px");
    mapObj.g.attr("transform", "translate(" + -topLeft[0] + "," + -topLeft[1] + ")");
    features.forEach(function(feature){
      feature.attr("d", mapObj.path);
    });
  } 
}

function LatLngToXY(arr, map) {
  var latLng = map.latLngToLayerPoint(new L.LatLng(arr[1], arr[0]));
  // creates {x, y}
  return [latLng.x, latLng.y];
}

function makeDotPaths(geojson, mapObj) {
    var feature = mapObj.g.selectAll("path" + "." + geojson.properties.css)
      .data(geojson.features)
      .enter().append("path")
      .attr("id", function(d){ return d.properties.id.toString().replace(/^(\d)/, "path_$1"); }) // so paths don't have IDs that are only numbers
      .classed(geojson.properties.css, true);
  return feature;
}
  
function prepareInstances(map, callback) {
  d3.csv("instances.csv", function(data) {
    var instancesGeoJSON = {"type": "FeatureCollection", "properties": {"css": map}, "features": []};
    if (map === "main") {
      var instancesArray = prepareInstancesBySpace(data, instancesGeoJSON, 1);
      my.instances = instancesArray.filter(Boolean); // this is the list against which the collision checks.
      my.instancesGeoJSON = instancesGeoJSON;
    } else {
      prepareInstancesBySpace(data, instancesGeoJSON, 0);
    }
    callback(null, instancesGeoJSON);
  });
}

function prepareInstancesBySpace(data, geojson, spaceNum) { 
  var instancesArray = data.map(function(obj, i){
    var instanceType = "";
    if (spaceNum === 1){
      instanceType = "instance";
    } else {
      instanceType = "inset";
    }
    if (spaceNum === +obj.space){
      var instance = {
        "type": "Feature",
        "geometry": {"type": "Point",
          "coordinates": [+obj.longitude, +obj.latitude]},
        "properties": {
          "instanceType": instanceType,
          "space": +obj.space,
          "placeNameInText": +obj.place_name_in_text,
          "place": obj.place,
          "id": instanceType + "_" + obj.instance_id,
          "placeId": +obj.place_id,
          "time": d3.isoParse("1904-06-16T" + obj.time.replace(/'/g, ":") + ".000Z").getTime(),
          "zoom": obj.zoom,
          "order": i // so sorting by time doesn't break the narrative order.
        }
      }
      geojson.features.push(instance);
      if (spaceNum === 1) {
        var returnObj = {
          latitude: +obj.latitude,
          longitude: +obj.longitude,
          placeId: +obj.place_id,
        };
        return returnObj;
      }
    }
  });
  my.ia = instancesArray;
  return instancesArray;
}

function prepareCollisions(callback) {
  d3.csv("collisions.csv", function(data) {
    var collisionsGeoJSON = {"type": "FeatureCollection", "properties": {"css": "collision"}, "features": []};
    collisionsGeoJSON.features = data.map(function(obj, i){
      if (obj.latitude === "") { 
        // I was lazy about copying over lats and lons. It wouldn't be a
        // terrible idea to use the place id to pull in *all* lats and 
        // lons. That way, instances is always correct, and collisions
        // is only supplemental.
        var place = my.instances.filter(function (instance) {
          return instance.placeId === +obj.place_id;
        })[0];
        obj.latitude = place.latitude;
        obj.longitude = place.longitude;
      }
      return {
        "type": "Feature",
        "geometry": {"type": "Point",
          "coordinates": [+obj.longitude, +obj.latitude]},
        "properties": {
          "instanceType": "collision",
          "id": "collision_" + obj.instance_id,
          "primaryActor": obj.primary_actor,
          "secondaryActor": obj.secondary_actor,
          "time": d3.isoParse("1904-06-16T" + obj.time.replace(/'/g, ":") + ".000Z").getTime(),
          "order": i // so sorting by time doesn't break the narrative order.
        }
      };
    });
    my.collisionsGeoJSON = collisionsGeoJSON;
    callback(null, collisionsGeoJSON);
  });
}

function preparePaths(callback) {
  d3.json("paths.geojson", function(error, paths) {
    if (error) throw error;
    callback(null, paths);
  });
}

