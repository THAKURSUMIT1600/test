const { getRooms, getRoom, updateRoom, createNewRoom } = require('../services/roomService');
const { sendToOnePlayerRooms, sendToOnePlayerData, sendWinner } = require('../socket/emits');

module.exports = socket => {
    const req = socket.request;

    const handleGetData = async () => {
        try {
            // Check if user is in a room
            if (!req.session.roomId) {
                console.log('User requested room data but is not in any room');
                return socket.emit('error:notInRoom', { message: 'Not in any room' });
            }

            const room = await getRoom(req.session.roomId);
            if (!room) {
                console.log(`Room not found: ${req.session.roomId}`);
                return socket.emit('error:roomNotFound', { message: 'Room not found' });
            }

            // Handle the situation when the server crashes and any player reconnects after the time has expired
            // Typically, the responsibility for changing players is managed by gameHandler.js.
            if (room.nextMoveTime && room.nextMoveTime <= Date.now()) {
                room.changeMovingPlayer();
                await updateRoom(room);
            }

            // Send room data
            sendToOnePlayerData(socket.id, room);

            // Send current scores if game is started (but not duplicate)
            if (room.started && room.playerScores && Object.keys(room.playerScores).length > 0) {
                console.log('Sending current scores to requesting player');
                socket.emit('game:scores', {
                    scores: room.playerScores,
                    captures: room.playerCaptures || {},
                });
            }

            // Send winner if game has ended
            if (room.winner) {
                sendWinner(socket.id, room.winner, room.playerScores, room.playerCaptures);
            }

            console.log(`Room data sent to player in room: ${req.session.roomId}`);
        } catch (error) {
            console.error('Error handling room data request:', error);
            socket.emit('error:roomDataFailed', { message: error.message });
        }
    };

    const handleGetAllRooms = async () => {
        try {
            const rooms = await getRooms();
            sendToOnePlayerRooms(socket.id, rooms);
        } catch (error) {
            console.error('Error getting rooms:', error);
            socket.emit('error:roomsFailed', { message: error.message });
        }
    };

    const handleCreateRoom = async data => {
        try {
            if (!data || !data.name || typeof data.name !== 'string') {
                return socket.emit('error:invalidRoomData', { message: 'Invalid room data' });
            }

            await createNewRoom(data);
            const rooms = await getRooms();
            sendToOnePlayerRooms(socket.id, rooms);
        } catch (error) {
            console.error('Error creating room:', error);
            socket.emit('error:roomCreationFailed', { message: error.message });
        }
    };

    socket.on('room:data', handleGetData);
    socket.on('room:rooms', handleGetAllRooms);
    socket.on('room:create', handleCreateRoom);
};
