var express = require('express');
var una = require('..');
var should = require('should');
var http = require('http');
var request = require('supertest');
var ioc = require('socket.io-client');

var start_una = function() {
    var server = http.createServer(una.app).listen();
    una.listen(server);
    return server;
}

var new_socket = function(server) {
    var address = server.address();
    var url = 'http://' + address.address + ':' + address.port;
    return ioc.connect(url, {'force new connection': true});
}

var server_mode_una = function() {
    var una = require('..');
    una.enableServerMode();
    una.server_mode.registerInitState("game_state");
    return una;
}

var server = start_una();

describe('una', function() {
    describe('static files', function() {
        it('should be able to get una client file', function(done) {
            request(server).get('/una_js/una.js').expect(200, done)
        });
    });

    describe('server', function() {
        it('should be able to listen on port number', function(done) {
            var una = require('..').listen();
            request(una.http_server).get('/una_js/una.js').expect(200, done);
        });
    })

    describe('running of server', function() {
        var socket;

        beforeEach(function(done) {
            socket = new_socket(server);
            socket.on('connect', function() {
                done();
            })
        });
        afterEach(function(done) {
            if (socket.socket.connected) {
                socket.disconnect();
            }
            done();
        });

        it('should receive MOTD', function(done) {
            socket.on('server-message', function(data) {
                if (data.message.indexOf('MOTD') !== -1) {
                    done();
                }
            });
        });
    });

    describe('screen', function() {
        var socket;

        beforeEach(function(done) {
            socket = new_socket(server);
            socket.on('connect', function() {
                done();
            })
        });
        afterEach(function(done) {
            if (socket.socket.connected) {
                socket.disconnect();
            }
            done();
        });

        it('should be able to register', function(done) {
            socket.emit('register-screen', {room: '123'});
            socket.on('screen-ready', function(data) {
                if (data.success) {
                    done();
                }
            });
        });

        it('should only have one instance per room id', function(done) {
            var room_data = {room: '123'};
            socket.emit('register-screen', room_data);

            socket.on('screen-ready', function(data) {
                if (data.success) {
                    // We now have one screen, we try make another screen
                    // join the same room
                    var s2 = new_socket(server);
                    s2.emit('register-screen', room_data);
                    s2.on('screen-ready', function(data) {
                        if (!data.success) {
                            s2.disconnect();
                            done();
                        }
                    });
                }
            });
        });

        it('should only be able to join the room after the previous screen terminates', function(done) {
            var room_data = {room: '123'};
            socket.emit('register-screen', room_data);

            socket.on('screen-ready', function(data) {
                if (data.success) {
                    socket.disconnect();
                    // Since the screen has been disconnected, new screen should be able to
                    // join the same id
                    var s2 = new_socket(server);
                    s2.emit('register-screen', room_data);
                    s2.on('screen-ready', function(data) {
                        if (data.success) {
                            s2.disconnect();
                            done();
                        }
                    });
                }
            });
        });
    })

    describe('controller', function() {
        var socket;
        var room_data = {room: '123'};

        beforeEach(function(done) {
            socket = new_socket(server);
            socket.on('connect', function() {
                socket.emit('register-screen', room_data);
                done();
            })
        });
        afterEach(function(done) {
            if (socket.socket.connected) {
                socket.disconnect();
            }
            done();
        });

        it('should be able to join a screen', function(done) {
            var controller = new_socket(server);
            var user_data = {name: 'controller1'};

            controller.emit('register-controller', {room: room_data.room, user_data: user_data});
            socket.on('controller-join', function(data) {
                if (data.una.user_data.name == 'controller1')
                    done();
            });
        });

        it('should be ready only after acknowledged by screen', function(done) {
            var controller = new_socket(server);
            var user_data = {name: 'controller1'};
            var ack = false;

            controller.emit('register-controller', {room: room_data.room, user_data: user_data});
            socket.on('controller-join', function(data) {
                ack = true;
                socket.emit('acknowledge-controller', {controller_id: data.una.id, success: true});
            });

            controller.on('controller-ready', function(data) {
                done();
            });
        });

        it('s should be able to join a screen', function(done) {
            c1 = new_socket(server);
            c1_user_data = {name: 'controller1'};
            c2 = new_socket(server);
            c2_user_data = {name: 'controller2'};

            var total_count = 0;

            c1.emit('register-controller', {room: room_data.room, user_data: c1_user_data});
            c2.emit('register-controller', {room: room_data.room, user_data: c2_user_data});
            socket.on('controller-join', function(data) {
                total_count++;
                if (total_count == 2)
                    done();
            });
        });
    });

    describe('screen and controllers', function() {
        var socket;
        var room_data = {room: '123'};

        beforeEach(function(done) {
            socket = new_socket(server);
            socket.on('connect', function() {
                socket.emit('register-screen', room_data);
                done();
            })
        });
        afterEach(function(done) {
            if (socket.socket.connected) {
                socket.disconnect();
            }
            done();
        });

        it('should be informed when a controller leave', function(done) {
            var c1 = new_socket(server);
            var c1_user_data = {name: 'controller1'};
            var c2 = new_socket(server);
            var c2_user_data = {name: 'controller2'};
            c1.emit('register-controller', {room: room_data.room, user_data: c1_user_data});
            c2.emit('register-controller', {room: room_data.room, user_data: c2_user_data});

            socket.on('controller-join', function(data) {
                socket.emit('acknowledge-controller', {controller_id: data.una.id, success: true});
            });


            c1.on('controller-ready', function(data) {
                if (data.success)
                    c1.disconnect();
            });

            socket.on('controller-leave', function(data) {
                if (data.una.user_data.name == 'controller1') {
                    done();
                }
            });
        });

        it('should be able to send input from controller', function(done) {
            var c1 = new_socket(server);
            var c1_user_data = {name: 'controller1'};
            c1.emit('register-controller', {room: room_data.room, user_data: c1_user_data});

            socket.on('controller-join', function(data) {
                socket.emit('acknowledge-controller', {controller_id: data.una.id, success: true});
            });

            c1.on('controller-ready', function(data) {
                c1.emit('controller-to-screen', 'shoot', true);
            });

            socket.on('controller-to-screen', function(data) {
                if (data.key == 'shoot' && data.payload) {
                    done();
                }
            });
        });

        it('should be able to send input from screen', function(done) {
            var c1 = new_socket(server);
            var c1_user_data = {name: 'controller1'};
            c1.emit('register-controller', {room: room_data.room, user_data: c1_user_data});

            var c1_id;
            socket.on('controller-join', function(data) {
                c1_id = data.una.id;
                socket.emit('acknowledge-controller', {controller_id: data.una.id, success: true});
            });

            c1.on('controller-ready', function(data) {
                c1.emit('controller-to-screen', 'shoot', true);
            });

            c1.on('screen-to-controller', function(data) {
                if (data.key == 'success' && data.payload) 
                    done();
            });

            socket.on('controller-to-screen', function(data) {
                socket.emit('screen-to-controller', c1_id, 'success', true);
            });
        });
    });

    describe('screenless mode', function() {
        describe('server initialization', function() {
                it('should be possible', function(done) {
                var una_server = server_mode_una();
                done();
            });
        });

        describe('game state', function() {
            it('should be able to be set', function(done) {
                var una = server_mode_una();
                una.server_mode.registerInitState("abc");
                una.server_mode.registerOnScreenInput('mykey', function(UnaServer, una_header, payload) {
                    UnaServer.setState(payload);
                    UnaServer.sendToScreens('mykey2', UnaServer.getState());
                });
                una.listen();

                var scn = new_socket(una.http_server);
                scn.emit('register-screen', {room: '123'});
                scn.on('screen-ready', function(res) {
                    if (res.state == "abc") {
                        scn.emit('screen-to-server', 'mykey', 'def');
                    }
                });

                scn.on('server-to-screen', function(res) {
                    if (res.key == 'mykey2' && res.payload == 'def') {
                        done();
                    }
                });
            });

            it('should be tied to the same room', function(done) {
                var una = server_mode_una();
                una.server_mode.registerInitState("abc");
                una.server_mode.registerOnScreenInput('hellokey', function(UnaServer, una_header, payload) {
                    UnaServer.setState(payload);
                    UnaServer.sendToScreens('hellokey', UnaServer.getState());
                });
                una.listen();

                var scn = new_socket(una.http_server)
                var scn2 = new_socket(una.http_server)
                scn.emit('register-screen', {room: '123'});

                var count = 2;
                scn.on('screen-ready', function(res) {
                    if (res.success) {
                        if (res.state == "abc") {
                            scn.emit('screen-to-server', 'hellokey', 'hello from screen');
                        }
                    }
                    scn2.emit('register-screen', {room: '111'});
                });

                scn.on('server-to-screen', function(res) {
                    if (res.key == 'hellokey' && res.payload == 'hello from screen') {
                        count--;
                        if (count == 0) done();
                    }
                });

                scn2.on('screen-ready', function(res) {
                    if (res.success) {
                        if (res.state == "abc") {
                            count--;
                            if (count == 0) done();
                        }
                    }
                });
            });
        });

        describe('screen', function() {
            it('should be able to send to server', function(done) {
                var una = server_mode_una();
                una.server_mode.registerOnScreenInput('hellokey', function(UnaServer, una_header, payload) {
                    if (payload == 'hello from screen') {
                        done();
                    }
                });
                una.listen();

                var scn = new_socket(una.http_server)
                scn.emit('register-screen', {room: '123'});
                scn.on('screen-ready', function(res) {
                    if (res.success) {
                        if (res.state == "game_state") {
                            scn.emit('screen-to-server', 'hellokey', 'hello from screen');
                        }
                    }
                });
            });
        });

        describe('controller', function() {
            it('should be able to send to server', function(done) {
                var una = server_mode_una();
                una.server_mode.registerOnControllerInput('state_key', function(UnaServer, una_header, payload) {
                    if (payload == 'hello from controller') {
                        done();
                    }
                });
                una.listen();

                var c1 = new_socket(una.http_server)
                c1.emit('register-controller', {room: '123'});
                c1.on('controller-ready', function(res) {
                    if (res.success) {
                        if (res.state == "game_state") {
                            c1.emit('controller-to-server', 'state_key', 'hello from controller');
                        }
                    }
                });
            });
        });
       
        describe('interactions between screen and controller', function() {
            it('should work for one screen/controller', function(done) {
                var una = server_mode_una();
                una.server_mode.registerInitState({team_a: 0, team_b: 0});

                una.server_mode.registerOnControllerInput('my_key', function(UnaServer, una_header, payload) {
                    var gameState = UnaServer.getState();
                    if (payload == 'team_a') {
                        gameState.team_a++;
                    }
                    else if (payload == 'team_b') {
                        gameState.team_b++;
                    }
                    UnaServer.sendToScreens('my_key', payload);
                });
                una.listen();

                var scn = new_socket(una.http_server);
                var c1 = new_socket(una.http_server);

                scn.emit('register-screen', {room: '123'});

                scn.on('screen-ready', function(res) {
                    c1.emit('register-controller', {room: '123'});
                });

                c1.on('controller-ready', function(res) {
                    c1.emit('controller-to-server', 'my_key', 'team_b');
                });

                scn.on('server-to-screen', function(res) {
                    if (res.key == 'my_key', res.payload == 'team_b') {
                        done();
                    }
                });
            });

            it('should work for multiple screen', function(done) {
                var una = server_mode_una();
                una.server_mode.registerInitState({team_a: 0, team_b: 0});

                una.server_mode.registerOnControllerInput('my_key', function(UnaServer, una_header, payload) {
                    var gameState = UnaServer.getState();
                    if (payload == 'team_a') {
                        gameState.team_a++;
                    }
                    else if (payload == 'team_b') {
                        gameState.team_b++;
                    }
                    UnaServer.sendToScreens('my_key', payload);
                });
                una.listen();

                var scn = new_socket(una.http_server);
                var scn2 = new_socket(una.http_server);
                var c1 = new_socket(una.http_server);

                scn.emit('register-screen', {room: '123'});

                scn.on('screen-ready', function(res) {
                    c1.emit('register-controller', {room: '123'});
                });

                c1.on('controller-ready', function(res) {
                    c1.emit('controller-to-server', 'my_key', 'team_b');
                });

                scn.on('server-to-screen', function(res) {
                    if (res.payload == 'team_b') {
                        scn2.emit('register-screen', {room: '123'});
                    }
                });

                scn2.on('screen-ready', function(res) {
                    if (res.state.team_b == 1) 
                        done();
                });
            });

            it('should work for multiple controllers', function(done) {
                var una = server_mode_una();
                una.server_mode.registerInitState({team_a: 0, team_b: 0});

                una.server_mode.registerOnControllerInput('my_key', function(UnaServer, una_header, payload) {
                    var gameState = UnaServer.getState();
                    if (payload == 'team_a') {
                        gameState.team_a++;
                    }
                    else if (payload == 'team_b') {
                        gameState.team_b++;
                    }
                    UnaServer.sendToScreens('my_key', payload);
                });

                una.server_mode.registerOnScreenInput('my_key', function(UnaServer, una_header, payload) {
                    UnaServer.sendToControllers('my_key', payload);
                });

                una.server_mode.registerOnScreenInput('end_key', function(UnaServer, una_header, payload) {
                    UnaServer.sendToControllers('end_key', payload);
                });

                una.listen();

                var scn = new_socket(una.http_server);
                var c1 = new_socket(una.http_server);
                var c2 = new_socket(una.http_server);
                var server_count = 0;
                var count = 0;

                scn.emit('register-screen', {room: '123'});

                scn.on('screen-ready', function(res) {
                    c1.emit('register-controller', {room: '123'});
                    c2.emit('register-controller', {room: '123'});
                });

                c1.on('controller-ready', function(res) {
                    c1.emit('controller-to-server', 'my_key', 'team_b');
                });

                c2.on('controller-ready', function(res) {
                    c2.emit('controller-to-server', 'my_key', 'team_b');
                });

                scn.on('server-to-screen', function(res) {
                    server_count++;
                    if (server_count == 2) {
                        scn.emit('screen-to-server', 'end_key', 'end');
                    }
                });

                var ctrl_fn = function(res) {
                    if (res.key == 'end_key' && res.payload == 'end') {
                        count++;
                        if (count == 2)
                            done();
                    }
                }

                c1.on('server-to-controller', ctrl_fn);
                c2.on('server-to-controller', ctrl_fn);
            });
        });
    });

    describe('flood control', function() {
        it('should work', function(done) {
            var una = server_mode_una();
            una.set('floodControlDelay', 1000);

            una.enableServerMode();
            una.server_mode.registerInitState(0);
            una.server_mode.registerOnControllerInput('flood', function(UnaServer, una_header, payload) {
                var state = UnaServer.getState();
                state += 1;
                UnaServer.setState(state);
            });
            una.server_mode.registerOnControllerInput('value', function(UnaServer, una_head, payload) {
                UnaServer.sendToControllers('value', UnaServer.getState());
            });

            una.listen();

            var scn = new_socket(una.http_server);
            var c1 = new_socket(una.http_server);

            scn.emit('register-screen', {room: '123'});
            c1.emit('register-controller', {room: '123'});
            c1.on('controller-ready', function(res) {
                var flood = setInterval(function() {
                    c1.emit('controller-to-server', 'flood');
                }, 10);

                setTimeout(function() {
                    clearInterval(flood);
                    c1.emit('controller-to-server', 'value');
                },100);
            });

            c1.on('server-to-controller', function(res) {
                if (res.key == 'value' && res.payload == 1) {
                    done();
                } else {
                    throw "error: " + res.payload;
                }
            });
        });
    });
});