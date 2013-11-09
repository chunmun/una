var express = require('express');
var una_js = require('..');
var should = require('should');
var http = require('http');
var request = require('supertest');
var ioc = require('socket.io-client');

var start_una = function() {
    var una = una_js();
    var server = http.createServer(una.app).listen(3000);
    una.listen(server);
    return server;
}

var new_socket = function() {
    return ioc.connect('http://localhost:3000', {'force new connection': true});
}

var server = start_una();

describe('una', function() {
    describe('static files', function() {
        it('should be able to get una client file', function(done) {
            request(server).get('/una_js/una.js').expect(200, done)
        });
    });

    describe('running of server', function() {
        var socket;

        beforeEach(function(done) {
            socket = new_socket();
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
            socket = new_socket();
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
                    var s2 = new_socket();
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
                    var s2 = new_socket();
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
            socket = new_socket();
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
            var controller = new_socket();
            var user_data = {name: 'controller1'};

            controller.emit('register-controller', {room: room_data.room, user_data: user_data});
            socket.on('controller-join', function(data) {
                if (data.socket_info.user_data.name == 'controller1')
                    done();
            });
        });

        it('should be ready only after acknowledged by screen', function(done) {
            var controller = new_socket();
            var user_data = {name: 'controller1'};
            var ack = false;

            controller.emit('register-controller', {room: room_data.room, user_data: user_data});
            socket.on('controller-join', function(data) {
                ack = true;
                socket.emit('acknowledge-controller', data.socket_info.id);
            });

            controller.on('controller-ready', function(data) {
                done();
            });
        });

        it('s should be able to join a screen', function(done) {
            c1 = new_socket();
            c1_user_data = {name: 'controller1'};
            c2 = new_socket();
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
            socket = new_socket();
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
            var c1 = new_socket();
            var c1_user_data = {name: 'controller1'};
            var c2 = new_socket();
            var c2_user_data = {name: 'controller2'};
            c1.emit('register-controller', {room: room_data.room, user_data: c1_user_data});
            c2.emit('register-controller', {room: room_data.room, user_data: c2_user_data});

            socket.on('controller-join', function(data) {
                socket.emit('acknowledge-controller', data.socket_info.id);
            });


            c1.on('controller-ready', function(data) {
                if (data.success)
                    c1.disconnect();
            });

            socket.on('controller-leave', function(data) {
                if (data.socket_info.user_data.name == 'controller1') {
                    done();
                }
            });
        });

        it('should be able to send input', function(done) {
            var c1 = new_socket();
            var c1_user_data = {name: 'controller1'};
            c1.emit('register-controller', {room: room_data.room, user_data: c1_user_data});

            socket.on('controller-join', function(data) {
                socket.emit('acknowledge-controller', data.socket_info.id);
            });

            c1.on('controller-ready', function(data) {
                c1.emit('controller-input', {shoot: true});
            });

            socket.on('controller-input', function(data) {
                if (data.payload.shoot)
                    done();
            });
        });
    });
});