//antbuilder server file

var path = require('path');
var express = require('express');

var db;

var websockets = {};
var num_sockets = 0;
var next_id = 0;

var last_pos_update_time = 0;
var ANT_POS_UPDATE_TIME = 33; //time in ms

var spawn = null;
var cake = null;

var MAX_GEN_DIST = 1500;
var MIN_GEN_DIST = 100;
var MAX_CAKE_GEN_DIST = 1400;
var MIN_CAKE_GEN_DIST = 1000;
var MAX_GEN_AMOUNT = 90;
var MIN_GEN_AMOUNT = 80;
var MAX_SURF_RADIUS = 200;
var MIN_SURF_RADIUS = 30;


// WHEN RESETING THE DATABASE FOR SURFACES, YOU CAN RESET THE ID!!!!
//  USING THIS: alter table surfaces AUTO_INCREMENT=0;


module.exports = {
    initialize : function(app, database) {
        //global db var set
        db = database;

        console.log("Initializing ant builder");

        app.use('/antbuilder', express.static(__dirname + '/../client'));

        app.get('/antbuilder', function(req, res) {
            res.sendFile(path.join(__dirname, '../client', 'antbuilder.html'));
            console.log("Get request for antbuilder");
        });

        var sql = "select * from game_objects where name like 'cake';";

        db.query(sql, function (err, result){
            cake = result[0];
            cake.radius = 15;
            cake.held = false;
            var sql = "select * from game_objects where name like 'spawn';";

            db.query(sql, function (err, result){
                spawn = result[0];
                spawn.radius = 30;

                if(!cake.initialized) {
                    resetWorld();
                }
            });
        });
        
    },

    resetDB : function(new_db) {
        //if database restarts, we need to do this
        //  maybe does not work though
        db = new_db;
    },

    addClient : function(ws) {
        ws.id = next_id ++;
        num_sockets ++;
        websockets[ws.id] = ws;
        ws.ant = {x: 0, y: 0, radius: 0};
        ws.holding_cake = false;

        console.log("\nWS " + ws.id + " connects");

        //send the new socket his ID
        // and the surfaces
        // basically initialize everything
        initializeWebsocket(ws);

        //transmit new ant to all on new connection
        data = {action: "create_live_ant"};
        data.ant = ws.ant;
        data.ant.id = ws.id;
        broadcast(JSON.stringify(data));

        ws.on('message', function(message) {
            var data = JSON.parse(message);

            switch(data.action) {
                case "lock":
                    console.log("\nPlayer wants to lock");
                    addAnt(data.ant);
                break;
                case "update_position":
                    updatePosition(data, ws);
                break;
                case "kamakazi":
                    console.log("\nPlayer self destructs");
                    kamakazi(data.ant, ws);
                break;
                case "request_cake":
                    console.log("Player requesting to hold cake");
                    var data = {action: "cake_access"};

                    //give them the cake if they are already holding it and don't know
                    if(cake.held == false || ws.holding_cake == true) {
                        cake.held = true;
                        ws.holding_cake = true;
                        data.access = true;
                    }
                    else {
                        data.access = false;
                    }

                    ws.send(JSON.stringify(data));
                break;
                case "drop_cake":
                    console.log("Player requesting to drop cake");
                    cake.held = false;
                    ws.holding_cake = false;

                    //update where the cake object is stored
                    var sql = "update game_objects set x_pos = ?, y_pos = ? where name like 'cake'";
                    db.query(sql, [cake.x_pos, cake.y_pos], function(err, result){
                        if(err) throw err;
                    });
                break;
                case "cake_delivered":
                    console.log("A player delivers the cake!");
                    var data = {action:"game_over"};
                    broadcast(JSON.stringify(data));
                    cake.held = false;
                    ws.holding_cake = false;
                    resetWorld();
                break;
                default:
                    console.log("\nUnknown action received: " + data.action);
                break;
            }
        });

        ws.on('close', function() {
            console.log("A ws closes");

            for(var key in websockets) {
                if(websockets.hasOwnProperty(key)) {
                    if(websockets[key].id == ws.id) {
                        console.log("\nWebsocket " + ws.id + " disconnects");

                        if(ws.holding_cake) {
                            cake.held = false;
                            ws.holding_cake = false;
                        }
                        
                        var data = {action: "delete_live_ant"};
                        data.id = ws.id;

                        delete websockets[key];
                        delete ws;
                        num_sockets --;

                        //if everyone disconnects, reset all the id's
                        if(num_sockets == 0) {
                            next_id = 0;
                        }

                        broadcast(JSON.stringify(data));
                    }
                }
            }
        });
    }
}

//also transmit the players id with it
//  send cake location, powerups here
//  also sends the list of live ants
function initializeWebsocket(ws) {
    var sql = "select * from surfaces;";

    db.query(sql, function (err, result){
        if (err) throw err; 
    
        var data = {};
        data.action = "initialize";
        data.surfaces = result;
        data.id = ws.id;
        data.live_ants = [];

        for(var key in websockets) {
            if(websockets.hasOwnProperty(key)) {
                websockets[key].ant.id = websockets[key].id;
                data.live_ants.push(websockets[key].ant);
            }
        }

        data.cake = cake;
        data.spawn = spawn;

        ws.send(JSON.stringify(data));
    });
}

//locks an ants position to the world
function addAnt(ant) {
    //first check if they are in the spawn circle
    if(Math.sqrt(Math.pow(ant.x - spawn.x_pos, 2) + Math.pow(ant.y - spawn.y_pos, 2)) < ant.radius + spawn.radius) {
        return;
    }

    var sql = "insert into surfaces (x_pos, y_pos, radius, is_ant) values ?;";

    var values = [[ant.x, ant.y, ant.radius, 1]];

    db.query(sql, [values], function(err, result){
        if(err) throw err;
        ant.is_ant = 1;
        ant.id = result.insertId;
        var data = {action: "surfaces_update"};
        data.surface = ant;
        data = JSON.stringify(data);
        broadcast(data);
    });
}

function kamakazi(ant) {
    var sql = "select * from surfaces;";

    db.query(sql, function (err, result){
        if (err) throw err;

        var destroyed_surfaces = [];

        for(var i = 0; i < result.length; i ++) {
            if(result[i].is_ant) {
                var separation = Math.sqrt(Math.pow(ant.x - result[i].x_pos, 2) + Math.pow(ant.y - result[i].y_pos, 2));
                if(separation < result[i].radius + ant.radius * 2) {
                    destroyed_surfaces.push(result[i]);
                }
            }
        }

        if(destroyed_surfaces.length > 0) {
            var data = {};
            data.action = "destroy_surfaces";
            data.destroyed_surfaces = destroyed_surfaces;
            data = JSON.stringify(data);
            broadcast(data);

            sql = "delete from surfaces where id in (";
            for(var i = 0; i < destroyed_surfaces.length; i ++) {
                sql += destroyed_surfaces[i].id;
                if(i != destroyed_surfaces.length - 1) {
                    sql += ",";
                }
            }
            sql += ");";

            db.query(sql, function(err, result){
                if(err) throw err;
            });
        }
    });
}

function updatePosition(data_in, ws) {
    ws.ant = data_in.ant;
    if(ws.holding_cake && data_in.cake != undefined) {
        cake.x_pos = data_in.cake.x;
        cake.y_pos = data_in.cake.y;
    }

    if(num_sockets > 1) {
        var current_time = new Date().getTime();
        if(current_time - last_pos_update_time > ANT_POS_UPDATE_TIME) {
            last_pos_update_time = current_time;

            var data = {action: "live_ants_update"};
            data.ants = [];
            data.cake = {x: cake.x_pos, y: cake.y_pos};

            for(var key in websockets) {
                if(websockets.hasOwnProperty(key)) {
                    websockets[key].ant.id = websockets[key].id;
                    data.ants.push(websockets[key].ant);
                }
            }

            data = JSON.stringify(data);
            broadcast(data);
        }
    }
}

function resetWorld() {
    console.log("Generating a new world");

    //remove any websockets from last game
    for(var key in websockets) {
        if(websockets.hasOwnProperty(key)) {
            if(websockets[key].readyState === websockets[key].OPEN)
                websockets[key].close();
        }
    }

    //delete all surfaces from database, reset auto increment counter
    var sql = "delete from surfaces;";
    db.query(sql, function(err, result){
        if(err) throw err;
    });
    var sql = "alter table surfaces auto_increment = 0;";
    db.query(sql, function(err, result){
        if(err) throw err;
    });
    

    //reset spawn position
    // maybe randomize this someday
    spawn.x_pos = 0;
    spawn.y_pos = 0;
    var sql = "update game_objects set x_pos = ?, y_pos = ? where name like 'spawn'";
    db.query(sql, [spawn.x_pos, spawn.y_pos], function(err, result){
        if(err) throw err;
    });

    //randomly place cake
    var angle = getRandAngle();
    var dist = (MAX_CAKE_GEN_DIST - MIN_CAKE_GEN_DIST) * Math.random() + MIN_CAKE_GEN_DIST;
    cake.x_pos = dist * Math.cos(angle);
    cake.y_pos = dist * Math.sin(angle);
    var sql = "update game_objects set x_pos = ?, y_pos = ?, initialized = 1 where name like 'cake'";
    db.query(sql, [cake.x_pos, cake.y_pos], function(err, result){
        if(err) throw err;
    });

    //randomly create random amount of random surfaces
    var surface_creation_count = (MAX_GEN_AMOUNT - MIN_GEN_AMOUNT) * Math.random() + MIN_GEN_AMOUNT;
    for(var i = 0; i < surface_creation_count; i ++) {
        var surface = {};
        var angle = getRandAngle();
        var dist = (MAX_GEN_DIST - MIN_GEN_DIST) * Math.random() + MIN_GEN_DIST;

        surface.x = dist * Math.cos(angle);
        surface.y = dist * Math.sin(angle);
        surface.radius = ((MAX_SURF_RADIUS - MIN_SURF_RADIUS) * dist / MAX_GEN_DIST + MIN_SURF_RADIUS - MIN_SURF_RADIUS) * Math.random() + MIN_SURF_RADIUS;

        //retry if the surface collides with the spawn point or the cake
        if(Math.sqrt(Math.pow(surface.x - spawn.x_pos, 2) + Math.pow(surface.y - spawn.y_pos, 2)) < surface.radius + spawn.radius ||
           Math.sqrt(Math.pow(surface.x - cake.x_pos, 2) + Math.pow(surface.y - cake.y_pos, 2)) < surface.radius + cake.radius) {
            i --;
            continue;
        }

        var sql = "insert into surfaces (x_pos, y_pos, radius, is_ant) values ?;";
        var values = [[surface.x, surface.y, surface.radius, 0]];
        db.query(sql, [values], function(err, result){
            if(err) throw err;
        });
    }

    console.log("Done generating a new world");
}

function getRandAngle() {
    return Math.PI * 2 * Math.random();
}

//sends a message to each connected socket
//  DATA SHOULD BE STRINGIFIED ALREADY
function broadcast(data) {
    for(var key in websockets) {
        if(websockets.hasOwnProperty(key)) {
            if(websockets[key].readyState === websockets[key].OPEN)
                websockets[key].send(data);
        }
    }
}
