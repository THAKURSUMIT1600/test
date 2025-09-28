const socketManager = require('../socket/socketManager');
const registerPlayerHandlers = require('../handlers/playerHandler');
const registerRoomHandlers = require('../handlers/roomHandler');
const registerGameHandlers = require('../handlers/gameHandler');
const { sessionMiddleware, wrap } = require('../config/session');
const { getRoom, deleteRoom } = require('../services/roomService');

module.exports = function (server) {
    socketManager.initialize(server);
    socketManager.getIO().engine.on('initial_headers', (headers, req) => {
        if (req.cookieHolder) {
            headers['set-cookie'] = req.cookieHolder;
            delete req.cookieHolder;
        }
    });
    socketManager.getIO().use(wrap(sessionMiddleware));
    socketManager.getIO().on('connection', socket => {
        registerPlayerHandlers(socket);
        registerRoomHandlers(socket);
        registerGameHandlers(socket);

        if (socket.request.session.roomId) {
            const roomId = socket.request.session.roomId.toString();
            socket.join(roomId);
            socket.emit('player:data', JSON.stringify(socket.request.session));
        }

        // Handle player disconnect for room cleanup
        socket.on('disconnect', async () => {
            try {
                if (socket.request.session.roomId) {
                    const room = await getRoom(socket.request.session.roomId);
                    if (room && !room.started && room.players.length === 1) {
                        // Delete room if only one player and game hasn't started
                        console.log(`Deleting empty room ${room._id} after player disconnect`);
                        await deleteRoom(room._id);
                    } else if (room && room.started && room.players.length <= 1) {
                        // End game if only one player remains in started game
                        const remainingPlayer = room.players[0];
                        if (remainingPlayer) {
                            room.endGame(remainingPlayer.color);
                            console.log(`Game ended due to player disconnect. Winner: ${remainingPlayer.color}`);
                        }
                    }
                }
            } catch (error) {
                console.error('Error handling disconnect cleanup:', error);
            }
        });
    });
};
