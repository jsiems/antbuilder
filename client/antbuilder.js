"use strict"

var MAX_SPEED = 30;
var MOVEMENT_SPEED = 0.2;
var ROTATION_SPEED = 0.05;
var GRAVITY = 0.2;
var JUMP_FORCE = 15;
var JUMP_TIME = 500;  //in ms
var DRAG = 0.05;
var DEFAULT_RADIUS = 10;

var update_interval = 0;
var running = false;

var stage;

var player = null;
var left_down = false;
var right_down = false;
var up_down = false;
var down_down = false;
var jump_down = false;
var lock_down = false;
var kamakazi_down = false;

var cake = null;
var spawn = null;

var surfaces = [];
var initialized = false;

var live_ants = [];
var my_id = -1;

var debug_text = null;
var show_debug = false;

var cake_delivered_message_sent = false;

var ws = null;

var mobile_user = false;

$("body").ready(function() {
    //Loads the canvas dimensions
    //  otherwise it will look like crap
    var canvas = $("#canvas");
    canvas.attr('width', canvas.width());
    canvas.attr('height', canvas.height());

    $("#destroy_button").css("left", 0);
    $("#lock_button").css("right", 0);

    $("#play_button").click(function() {
		initWebsocket();
    });
    
    $("#quit_button").click(function() {
        ws.close();
        //ws close will call the quitGame function
    });

    $("#left_button").bind("touchstart", function(e) {
        $("#left_button").css("background-color", "rgba(46, 46, 48, .75)");
        left_down = true;
    });
    $("#left_button").bind("touchend", function(e) {
        $("#left_button").css("background-color", "rgba(114, 122, 135, .75)");
        left_down = false;
    });
    $("#jump_button").bind("touchstart", function(e) {
        $("#jump_button").css("background-color", "rgba(46, 46, 48, .75)");
        jump_down = true;
    });
    $("#jump_button").bind("touchend", function(e) {
        $("#jump_button").css("background-color", "rgba(114, 122, 135, .75)");
        jump_down = false;
    });
    $("#right_button").bind("touchstart", function(e) {
        $("#right_button").css("background-color", "rgba(46, 46, 48, .75)");
        right_down = true;
    });
    $("#right_button").bind("touchend", function(e) {
        $("#right_button").css("background-color", "rgba(114, 122, 135, .75)");
        right_down = false;
    });
    $("#lock_button").bind("touchstart", function(e) {
        $("#lock_button").css("background-color", "rgba(46, 46, 48, .75)");
        lock_down = true;
    });
    $("#lock_button").bind("touchend", function(e) {
        $("#lock_button").css("background-color", "rgba(114, 122, 135, .75)");
        lock_down = false;
    });
    $("#destroy_button").bind("touchstart", function(e) {
        $("#destroy_button").css("background-color", "rgba(46, 46, 48, .75)");
        kamakazi_down = true;
    });
    $("#destroy_button").bind("touchend", function(e) {
        $("#destroy_button").css("background-color", "rgba(114, 122, 135, .75)");
        kamakazi_down = false;
    });

    mobile_user = window.mobileAndTabletcheck();
});

$(window).resize(function() {
    var canvas = $("#canvas");
    canvas.attr('width', canvas.width());
    canvas.attr('height', canvas.height());
}); 

function initWebsocket() {
    ws = new WebSocket('wss://' + document.location.hostname, 'antbuilder');

    ws.onopen = function() {
        console.log("Web socket connected successfully");
        startGame();
    }

    ws.onclose = function() {
        console.log("Disconnected");
        quitGame();
    }

    ws.onmessage = function(message) {
        var data = JSON.parse(message.data);

        switch(data.action) {
            case "initialize":
                for(var i = 0; i < data.surfaces.length; i ++) {
                    surfaces.push(new Surface(data.surfaces[i].x_pos, data.surfaces[i].y_pos, data.surfaces[i].radius, data.surfaces[i].is_ant, data.surfaces[i].id));
                    surfaces[i].init();
                }
                my_id = data.id;
                for(var i = 0; i < data.live_ants.length; i ++) {
                    if(data.live_ants[i].id != my_id && my_id != -1) {
                        live_ants.push(new LiveAnt(data.live_ants[i].x, data.live_ants[i].y, data.live_ants[i].radius, data.live_ants[i].id));
                        live_ants[live_ants.length - 1].init();
                    }
                }

                player.position.x = data.spawn.x_pos;
                player.position.y = data.spawn.y_pos;

                spawn = new GameObject(data.spawn.x_pos, data.spawn.y_pos, data.spawn.radius, "rgba(25,145,10, 1)");
                spawn.init();

                cake = new GameObject(data.cake.x_pos, data.cake.y_pos, data.cake.radius, "rgba(244,241,66, 1)");
                cake.held = false;
                cake.init();

                initialized = true;
            break;
            case "surfaces_update":
                surfaces.push(new Surface(data.surface.x, data.surface.y, data.surface.radius, data.surface.is_ant, data.surface.id));
                surfaces[surfaces.length - 1].init();
            break;
            case "create_live_ant":
                //creating new live ant
                //dont add the ant if it is me or my id has not been received yet
                if(data.ant.id != my_id && my_id != -1) {
                    live_ants.push(new LiveAnt(data.ant.x, data.ant.y, data.ant.radius, data.ant.id));
                    live_ants[live_ants.length - 1].init();
                }
            break;
            case "delete_live_ant":
                for(var i = 0; i < live_ants.length; i ++) {
                    if(data.id == live_ants[i].id) {
                        live_ants[i].graphics.graphics.clear();
                        stage.removeChild(live_ants[i].graphics);
                        delete live_ants[i];
                        live_ants.splice(i, 1);
                        break;
                    }
                }
            break;
            case "live_ants_update":
                //need a way to remove specific live ants and stuff like that
                for(var i = 0; i < data.ants.length; i ++) {
                    if(data.ants[i].id == my_id) {
                        continue;
                    }
                    for(var j = 0; j < live_ants.length; j ++) {
                        if(data.ants[i].id == live_ants[j].id) {
                            live_ants[j].position.x = data.ants[i].x;
                            live_ants[j].position.y = data.ants[i].y;
                            if(live_ants[j].radius != data.ants[i].radius) {
                                live_ants[j].radius = data.ants[i].radius;
                                live_ants[j].init();
                            }
                            break;
                        }
                    }
                }

                //if i'm not holding the cake, update it's position.
                if(!cake.held) {
                    cake.position.x = data.cake.x;
                    cake.position.y = data.cake.y;
                }
            break;
            case "destroy_surfaces":
                for(var i = 0; i < data.destroyed_surfaces.length; i ++) {
                    for(var j = 0; j < surfaces.length; j ++) {
                        if(surfaces[j].id == data.destroyed_surfaces[i].id) {
                            if(player.connected_surface != null && surfaces[j].id == player.connected_surface.id) {
                                player.connected_surface = null;
                                player.cs_angular_vel = 0;
                            }
                            surfaces[j].graphics.graphics.clear();
                            stage.removeChild(surfaces[j].graphics);
                            delete surfaces[j];
                            surfaces.splice(j, 1);
                            break;
                        }
                    }
                }
            break;
            case "cake_access":
                if(data.access == true) {
                    cake.held = true;
                }
                else {
                    cake.held = false;
                }
            break;
            case "game_over":
                ws.close();
                alert("Game over! The cake was delivered. New map being generated. Play again.");
            break;
            default:
                console.log("Unknown action received: " + data.action);
            break;
        }
    }
}

function startGame() {
    //remove buttons and stuff
    $("#menu").css("visibility", "hidden");
    $("#quit_button").css("visibility", "visible");
    if(mobile_user)
        $("#controls_container").css("visibility", "visible");

    //initialize all variables, just copied all from top
    update_interval = 0;
    running = false;
    player = null;
    left_down = false;
    right_down = false;
    up_down = false;
    down_down = false;
    jump_down = false;
    lock_down = false;
    kamakazi_down = false;
    debug_text = null;
    show_debug = false;
    cake_delivered_message_sent = false

    //set up createjs stuff
    stage = new createjs.Stage("canvas");

    debug_text = new createjs.Text("banana", "20px Arial");
    debug_text.x = 100;
    debug_text.y = 100;
    debug_text.textBaseline = "alphabetic";

    stage.addChild(debug_text);

    //set up player ant
    player = new PlayerAnt(150, 50, 10);
    player.init();

    update_interval = setInterval(updateWorld, 17);
    running = true;
}

//DO NOT USE THIS FUNCTION
//  use ws.close() instead
//  ws.close calls this function
function quitGame() {
    $("#menu").css("visibility", "visible");
    $("#quit_button").css("visibility", "hidden");
    $("#controls_container").css("visibility", "hidden");

    stage.clear();
    stage = null;

    ws = null;

    initialized = false;
    surfaces = [];
    live_ants = [];

    my_id = -1;

    clearInterval(update_interval);
}

function updateWorld() {
    //wait to receive surfaces
    if(!initialized) {
        return;
    }

    var canvaswidth = $("#canvas").css("width").replace("px", "");
    var canvasheight = $("#canvas").css("height").replace("px", "");

    player.update();

    //player will always be center of screen
    player.graphics.x = canvaswidth / 2;
    player.graphics.y = canvasheight / 2;

    for(var i = 0; i < surfaces.length; i ++) {
        var cs = surfaces[i];

        cs.graphics.x = canvaswidth / 2 + cs.position.x - player.position.x;
        cs.graphics.y = canvasheight / 2 + cs.position.y - player.position.y;
    }

    for(var i = 0; i < live_ants.length; i ++) {
        var ant = live_ants[i];

        ant.graphics.x = canvaswidth / 2 + ant.position.x - player.position.x;
        ant.graphics.y = canvasheight / 2 + ant.position.y - player.position.y;

        stage.setChildIndex(ant.graphics, stage.getNumChildren()-1);
    }

    cake.graphics.x = canvaswidth / 2 + cake.position.x - player.position.x;
    cake.graphics.y = canvasheight / 2 + cake.position.y - player.position.y;

    spawn.graphics.x = canvaswidth / 2 + spawn.position.x - player.position.x;
    spawn.graphics.y = canvasheight / 2 + spawn.position.y - player.position.y;

    if(show_debug) {
        debug_text.text = "velocity: " + Number.parseFloat(player.position.x).toPrecision(4) + ", " + Number.parseFloat(player.position.y).toPrecision(4);
    }
    else {
        debug_text.text = "";
    }

    stage.setChildIndex(player.graphics, stage.getNumChildren()-1);
    stage.setChildIndex(cake.graphics, stage.getNumChildren()-1);
    
    stage.update();

    //send position to server
    // ADD CODE TO ONLY SEND IT EVERY CERTAIN AMOUNT OF SECONDS!!!!!!!!
    var data = {action: "update_position"};
    data.ant = {x: player.position.x, y: player.position.y, radius: player.radius};
    if(cake.held) {
        data.cake = {x: cake.position.x, y: cake.position.y};
    }
    if(ws.readyState == ws.OPEN)
        ws.send(JSON.stringify(data));
}

//KEYDOWN DETECTION
$(document).keydown(function(e) {
    switch(e.which) {
        case 37:
            left_down = true;
        break;
        case 38:
            up_down = true;
        break;
        case 39:
            right_down = true;
        break;
        case 40:
            down_down = true;
        break;
        case 32:
            jump_down = true;
        break;
        case 90:
            kamakazi_down = true;
        break;
        case 88:
            lock_down = true;
        break;
        case 80:
            //'p' , pause the game
            if(running || ws == null) {
                running = false;
                clearInterval(update_interval);
            }
            else {
                running = true;
                update_interval = setInterval(updateWorld, 17);
            }
        break;
        case 81:
            show_debug = !show_debug;
        break;
        default:
            console.log("Unknown key pressed: " + e.which);
        break;
    }
});

//KEYUP DETECTION
$(document).keyup(function(e) {
    switch(e.which) {
        case 37:
            left_down = false;
        break;
        case 38:
            up_down = false;
        break;
        case 39:
            right_down = false;
        break;
        case 40:
            down_down = false;
        break;
        case 32:
            jump_down = false;
        break;
        case 90:
            kamakazi_down = false;
        break;
        case 88:
            lock_down = false;
        break;
        case 80:
            //do nothing
        break;
        case 81:
            //do nothing
        break;
        default:
            console.log("Unknown key releaded");
        break;
    }
});

function Vector(xin = 0, yin = 0) {
    this.x = xin;
    this.y = yin;

    this.getMag = function() {
        return Math.sqrt(this.x * this.x + this.y * this.y)
    }
}

function PlayerAnt(xin, yin, rin) {
    this.position = new Vector(xin, yin);
    this.velocity = new Vector(0, 0);
    this.radius = rin;

    this.connected_surface = null;
    this.cs_angle = 0;
    this.cs_angular_vel = 0;
    this.last_cs = null;

    this.last_jump_time = 0;

    var graphics = null;

    this.init = function() {
        this.graphics = new createjs.Shape();

        this.graphics.graphics.beginFill("rgba(255,0,300,1)").drawCircle(0, 0, this.radius);

        stage.addChild(this.graphics);
    }

    this.update = function() {
        var current_time = new Date().getTime();

        //self destructing
        if(kamakazi_down) {
            var ant = {};
            ant.x = this.position.x;
            ant.y = this.position.y;
            ant.radius = this.radius;

            var data = {action: "kamakazi", ant: ant};
            ws.send(JSON.stringify(data));

            //reset the players position
            //  perhaps move this to a function, it is called in two places (kind of)
            this.position.x = spawn.position.x;
            this.position.y = spawn.position.y;
            this.velocity.x = 0;
            this.velocity.y = 0;
            this.radius = DEFAULT_RADIUS;

            this.last_cs = this.connected_surface;
            this.connected_surface = null;
            this.cs_angular_vel = 0;

            if(cake.held) {
                cake.held = false;
                var data = {action: "drop_cake"};
                ws.send(JSON.stringify(data));
            }

            return;
        }

        //check and handle collisions with surfaces
        for(var i = 0; i < surfaces.length; i ++) {
            var cs = surfaces[i];

            //don't check for connection with a surface you are already connected to
            if(this.connected_surface == cs || this.last_cs == cs) {
                continue;
            }

            var separation = new Vector(this.position.x - cs.position.x, this.position.y - cs.position.y);
            if(separation.getMag() <= this.radius + cs.radius) {
                //calculate angle of connection; if statement to account for limited range of atan
                this.cs_angle = Math.atan((this.position.y - cs.position.y) / (this.position.x - cs.position.x));
                if(this.position.x < cs.position.x) {
                    this.cs_angle += Math.PI;
                }
                this.velocity.x = 0; this.velocity.y = 0;
                //calculate relative velocity if transitioning from different surface

                if(this.connected_surface != null) {
                    this.cs_angular_vel = this.cs_angular_vel * this.connected_surface.radius / cs.radius;
                }
                
                this.connected_surface = cs;
            }
        }

        if(this.connected_surface == null) {
            var accl = new Vector(MOVEMENT_SPEED * (right_down - left_down), 
                                  MOVEMENT_SPEED * (down_down - up_down));

            //to slow them to a stop
            accl.x += -1 * DRAG * this.velocity.x;
            accl.y += -1 * DRAG * this.velocity.y + GRAVITY;

            this.velocity.x += accl.x;
            this.velocity.y += accl.y;

            if(this.velocity.getMag() > MAX_SPEED) {
                var old_mag = this.velocity.getMag();
                /*
                  this kinda sucks
                  slows down one velocity when there is no reason to
                */
                this.velocity.x = this.velocity.x * MAX_SPEED / old_mag;
                this.velocity.y = this.velocity.y * MAX_SPEED / old_mag;
            }

            this.position.x += this.velocity.x;
            this.position.y += this.velocity.y;

            if(cake.held) {
                cake.held = false;
                var data = {action: "drop_cake"};
                ws.send(JSON.stringify(data));
            }
        }
        //they are connected to a surface and trying to jump off
        else if(jump_down && current_time - this.last_jump_time > JUMP_TIME) {
            this.last_jump_time = current_time;

            //transfer angular velocity to positional velocity
            this.velocity.x = this.cs_angular_vel * this.connected_surface.radius * Math.cos(this.cs_angle + Math.PI / 2);
            this.velocity.y = this.cs_angular_vel * this.connected_surface.radius * Math.sin(this.cs_angle + Math.PI / 2);

            //add jumping force
            this.velocity.x += JUMP_FORCE * Math.cos(this.cs_angle);
            this.velocity.y += JUMP_FORCE * Math.sin(this.cs_angle);

            this.last_cs = this.connected_surface;
            this.connected_surface = null;
            this.cs_angular_vel = 0;

            if(cake.held) {
                cake.held = false;
                var data = {action: "drop_cake"};
                ws.send(JSON.stringify(data));
            }
        }
        //on surface, not jumping, but trying to lock
        else if(lock_down) {
            var ant = {};
            ant.x = this.position.x;
            ant.y = this.position.y;
            ant.radius = this.radius;

            var data = {action: "lock", ant: ant};
            ws.send(JSON.stringify(data));

            this.position.x = spawn.position.x;
            this.position.y = spawn.position.y;
            this.radius = DEFAULT_RADIUS;

            this.last_cs = this.connected_surface;
            this.connected_surface = null;
            this.cs_angular_vel = 0;

            if(cake.held) {
                cake.held = false;
                var data = {action: "drop_cake"};
                ws.send(JSON.stringify(data));
            }
        }
        //connected to surface and not trying to jump or lock
        else {
            var ang_accl = ROTATION_SPEED / this.connected_surface.radius * (right_down - left_down);
            ang_accl += -1 * DRAG * this.cs_angular_vel;

            this.cs_angular_vel += ang_accl;

            if(Math.abs(this.cs_angular_vel) * this.connected_surface.radius > MAX_SPEED) {
                this.cs_angular_vel = MAX_SPEED / this.connected_surface.radius;
            }

            this.cs_angle += this.cs_angular_vel;

            this.position.x = this.connected_surface.position.x + (this.radius + this.connected_surface.radius) * Math.cos(this.cs_angle);
            this.position.y = this.connected_surface.position.y + (this.radius + this.connected_surface.radius) * Math.sin(this.cs_angle);

            if(cake.held) {
                var r = this.connected_surface.radius + player.radius + cake.radius;
                cake.position.x = this.connected_surface.position.x + (r) * Math.cos(this.cs_angle);
                cake.position.y = this.connected_surface.position.y + (r) * Math.sin(this.cs_angle);

                //check for collision with spawn point
                var separation = new Vector(this.position.x - spawn.position.x, this.position.y - spawn.position.y);
                if(separation.getMag() <= this.radius + spawn.radius && !cake_delivered_message_sent) {
                    var data = {action: "cake_delivered"};
                    ws.send(JSON.stringify(data));
                    cake_delivered_message_sent = true;
                }
            }
            //check for cake collision
            else {
                var separation = new Vector(this.position.x - cake.position.x, this.position.y - cake.position.y);
                if(separation.getMag() <= this.radius + cake.radius) {
                    var data = {action: "request_cake"};
                    ws.send(JSON.stringify(data));
                }
            }
        }

        if(this.last_cs != null) {
            var separation = new Vector(this.position.x - this.last_cs.position.x, this.position.y - this.last_cs.position.y);

            //must go certain px away before you can connect again
            if(separation.getMag() > this.radius + this.last_cs.radius + 1) {
                this.last_cs = null;
            }            
        }
    }
}

//square surface used for collisions
function Surface(xin, yin, rin, iain, idin) {
    //add rotation soon
    this.position = new Vector(xin, yin);
    this.radius = rin;
    this.is_ant = iain;
    this.id = idin;

    var graphics = null;
    
    this.init = function() {
        this.graphics = new createjs.Shape();

        var color = "rgba(0,0,0,1)";
        if(this.is_ant)
            color = "rgba(132,120,107,1)";

        this.graphics.graphics.beginFill(color).drawCircle(0, 0, this.radius);

        stage.addChild(this.graphics);
    }
}

function LiveAnt(xin, yin, rin, idin) {
    this.position = new Vector(xin, yin);
    this.radius = rin;
    this.id = idin;

    this.graphics = null;
    
    this.init = function() {
        this.graphics = new createjs.Shape();

        this.graphics.graphics.beginFill("rgba(239,135,31, 1)").drawCircle(0, 0, this.radius);

        stage.addChild(this.graphics);
    }
}

function GameObject(xin, yin, rin, color) {
    this.position = new Vector(xin, yin);
    this.radius = rin;

    this.graphics = null;
    
    this.init = function() {
        this.graphics = new createjs.Shape();

        this.graphics.graphics.beginFill(color).drawCircle(0, 0, this.radius);

        stage.addChild(this.graphics);
    }
}

window.mobileAndTabletcheck = function() {
    var check = false;
    (function(a){if(/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino|android|ipad|playbook|silk/i.test(a)||/1207|6310|6590|3gso|4thp|50[1-6]i|770s|802s|a wa|abac|ac(er|oo|s\-)|ai(ko|rn)|al(av|ca|co)|amoi|an(ex|ny|yw)|aptu|ar(ch|go)|as(te|us)|attw|au(di|\-m|r |s )|avan|be(ck|ll|nq)|bi(lb|rd)|bl(ac|az)|br(e|v)w|bumb|bw\-(n|u)|c55\/|capi|ccwa|cdm\-|cell|chtm|cldc|cmd\-|co(mp|nd)|craw|da(it|ll|ng)|dbte|dc\-s|devi|dica|dmob|do(c|p)o|ds(12|\-d)|el(49|ai)|em(l2|ul)|er(ic|k0)|esl8|ez([4-7]0|os|wa|ze)|fetc|fly(\-|_)|g1 u|g560|gene|gf\-5|g\-mo|go(\.w|od)|gr(ad|un)|haie|hcit|hd\-(m|p|t)|hei\-|hi(pt|ta)|hp( i|ip)|hs\-c|ht(c(\-| |_|a|g|p|s|t)|tp)|hu(aw|tc)|i\-(20|go|ma)|i230|iac( |\-|\/)|ibro|idea|ig01|ikom|im1k|inno|ipaq|iris|ja(t|v)a|jbro|jemu|jigs|kddi|keji|kgt( |\/)|klon|kpt |kwc\-|kyo(c|k)|le(no|xi)|lg( g|\/(k|l|u)|50|54|\-[a-w])|libw|lynx|m1\-w|m3ga|m50\/|ma(te|ui|xo)|mc(01|21|ca)|m\-cr|me(rc|ri)|mi(o8|oa|ts)|mmef|mo(01|02|bi|de|do|t(\-| |o|v)|zz)|mt(50|p1|v )|mwbp|mywa|n10[0-2]|n20[2-3]|n30(0|2)|n50(0|2|5)|n7(0(0|1)|10)|ne((c|m)\-|on|tf|wf|wg|wt)|nok(6|i)|nzph|o2im|op(ti|wv)|oran|owg1|p800|pan(a|d|t)|pdxg|pg(13|\-([1-8]|c))|phil|pire|pl(ay|uc)|pn\-2|po(ck|rt|se)|prox|psio|pt\-g|qa\-a|qc(07|12|21|32|60|\-[2-7]|i\-)|qtek|r380|r600|raks|rim9|ro(ve|zo)|s55\/|sa(ge|ma|mm|ms|ny|va)|sc(01|h\-|oo|p\-)|sdk\/|se(c(\-|0|1)|47|mc|nd|ri)|sgh\-|shar|sie(\-|m)|sk\-0|sl(45|id)|sm(al|ar|b3|it|t5)|so(ft|ny)|sp(01|h\-|v\-|v )|sy(01|mb)|t2(18|50)|t6(00|10|18)|ta(gt|lk)|tcl\-|tdg\-|tel(i|m)|tim\-|t\-mo|to(pl|sh)|ts(70|m\-|m3|m5)|tx\-9|up(\.b|g1|si)|utst|v400|v750|veri|vi(rg|te)|vk(40|5[0-3]|\-v)|vm40|voda|vulc|vx(52|53|60|61|70|80|81|83|85|98)|w3c(\-| )|webc|whit|wi(g |nc|nw)|wmlb|wonu|x700|yas\-|your|zeto|zte\-/i.test(a.substr(0,4))) check = true;})(navigator.userAgent||navigator.vendor||window.opera);
    return check;
};
