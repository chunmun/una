function Sockets(io) {
    if (!(this instanceof Sockets)) return new Sockets(io);
    this.io = io;
}

Sockets.prototype.register = function() {
    var MAX_USERS = {'screen': 1, 'controller': 999};
    var io = this.io;

    var sendMessage = function(socket, message) {
        socket.emit('server-message', {message: message});
    }
    var registerClient = function(socket, type, room) {
        var type_room = type + '-' + room;
        var type_ready = type + '-ready';

        socket.una.type = type;
        socket.una.room = room;

        // Check if number of client have exceeded the maximum
        // amount allowed for that type
        if (io.sockets.clients(type_room).length >= MAX_USERS[type]) {
            socket.emit(type_ready, {success: false, error: 'Room Full'});
            socket.disconnect();
            return false;
        }

        socket.emit(type_ready, {success: true});

        // Join the correct world
        socket.join('world-' + type);
        socket.join(type_room);
        return true;
    }

    io.sockets.on('connection', function(socket) {
        // Add custom payload to our socket
        socket.una = {room: 'lobby', type: 'unknown'};

        // When we first established a connection, the socket
        // will join the world room.
        socket.join('world');
        sendMessage(socket, "MOTD: Hello, World");

        socket.on('register-screen', function(data) {
            registerClient(socket, 'screen', data.room);
        });

        socket.on('register-controller', function(data) {
            registerClient(socket, 'controller', data.room);

            // Notify the screen that the controller have joined
            var screen_identifier = 'screen-' + data.room;
            var data = {id: socket.id, payload: payload};
            io.sockets.in(screen_identifier).emit('controller-join', data);
        })

        // Screen will emit RTT, to be handled by the server
        socket.on('screen-rttHeartBeat', function(data) {
            data.server_time = Date.now();
            socket.emit('server-rttHeartBeat', data);
        });

        socket.on('disconnect', function() {
            // Leave the room that the socket joined
            data = socket.una;
            var type_room = data.type + '-' + data.room;
            socket.leave(type_room)
            socket.leave('world-' + data.type);

            if (data.type == 'controller') {
                var screen_identifier = 'screen-' + data.room;
                var data = {id: socket.id};
                io.sockets.in(screen_identifier).emit('controller-leave', data);
            }
        });
    });
}

module.exports = Sockets;