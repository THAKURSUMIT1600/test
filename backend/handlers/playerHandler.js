const { getRoom, updateRoom, getRooms, createNewRoom } = require('../services/roomService');
const { COLORS } = require('../utils/constants');

module.exports = socket => {
    const req = socket.request;

    const handleLogin = async data => {
        try {
            console.log('Player login attempt:', data);

            // Validate input data
            if (!data || !data.name || typeof data.name !== 'string' || data.name.trim() === '') {
                console.error('Invalid login data:', data);
                return socket.emit('error:loginFailed', { message: 'Invalid name provided' });
            }

            let room;

            // If roomId is provided, try to join specific room
            if (data.roomId) {
                room = await getRoom(data.roomId);
                if (!room) return socket.emit('error:roomNotFound');
                if (room.isFull()) return socket.emit('error:changeRoom');
                if (room.started) return socket.emit('error:changeRoom');
                if (room.private && room.password !== data.password) return socket.emit('error:wrongPassword');
            } else {
                // Auto-assign to available room or create new one
                const rooms = await getRooms();
                room = rooms.find(r => r.players.length < 4 && !r.started && !r.private);

                // If no available room, create a new one
                if (!room) {
                    console.log('No available rooms, creating new room');
                    room = await createNewRoom({
                        name: `Room-${Date.now()}`,
                        private: false,
                        password: '',
                    });
                    console.log('New room created:', room._id);
                }
            }

            await addPlayerToExistingRoom(room, data);
        } catch (error) {
            console.error('Login error:', error);
            socket.emit('error:loginFailed', { message: error.message });
        }
    };

    const handleExit = async () => {
        req.session.reload(err => {
            if (err) return socket.disconnect();
            req.session.destroy();
            socket.emit('redirect');
        });
    };

    const handleReady = async () => {
        try {
            if (!req.session.roomId || !req.session.playerId) {
                console.log('Ready attempt without proper session data');
                return socket.emit('error:notInRoom', { message: 'Not in a room' });
            }

            const room = await getRoom(req.session.roomId);
            if (!room) {
                console.log(`Room not found: ${req.session.roomId}`);
                return socket.emit('error:roomNotFound', { message: 'Room not found' });
            }

            const player = room.getPlayer(req.session.playerId);
            if (!player) {
                console.log(`Player not found in room: ${req.session.playerId}`);
                return socket.emit('error:playerNotFound', { message: 'Player not found' });
            }

            player.changeReadyStatus();

            // Check if game can start
            if (room.canStartGame()) {
                console.log('Starting game - minimum players ready');
                room.startGame();
            }

            await updateRoom(room);

            // Emit updated room data to all players in the room
            const { sendToPlayersData } = require('../socket/emits');
            sendToPlayersData(room);

            console.log(`Player ${player.name} ready status: ${player.ready}`);
        } catch (error) {
            console.error('Ready status error:', error);
            socket.emit('error:readyFailed', { message: error.message });
        }
    };

    const addPlayerToExistingRoom = async (room, data) => {
        try {
            console.log('Adding player to room:', room._id, 'Player:', data.name);
            console.log('Room current players:', room.players.length);

            // Try to add player to room
            const added = room.addPlayer(data.name, req.session.id);

            if (!added) {
                // Room is full, find another room or create new one
                console.log('Room is full, finding alternative room');
                const rooms = await getRooms();
                const availableRoom = rooms.find(r => r.players.length < 4 && !r.started && !r.private);

                if (availableRoom) {
                    const alternativeAdded = availableRoom.addPlayer(data.name, req.session.id);
                    if (alternativeAdded) {
                        await updateRoom(availableRoom);
                        return await reloadSession(availableRoom);
                    }
                }

                // Create new room if no available room found
                const newRoom = await createNewRoom({
                    name: `Room-${Date.now()}`,
                    private: false,
                    password: '',
                });

                newRoom.addPlayer(data.name, req.session.id);
                await updateRoom(newRoom);
                return await reloadSession(newRoom);
            }

            if (room.isFull()) {
                console.log('Room is now full, starting game automatically');
                room.startGame();
            }

            await updateRoom(room);
            console.log('Room updated successfully');

            // Reload session and emit data
            await reloadSession(room);
        } catch (error) {
            console.error('Error adding player to room:', error);
            throw error;
        }
    };

    // Since it is not bound to an HTTP request, the session must be manually reloaded and saved
    const reloadSession = async room => {
        return new Promise((resolve, reject) => {
            req.session.reload(err => {
                if (err) {
                    console.error('Session reload error:', err);
                    socket.emit('error:sessionError', { message: 'Session reload failed' });
                    return reject(err);
                }

                const playerIndex = room.players.length - 1;
                const player = room.players[playerIndex];

                if (!player) {
                    console.error('Player not found after adding to room');
                    socket.emit('error:loginFailed', { message: 'Player not found after adding' });
                    return reject(new Error('Player not found'));
                }

                req.session.roomId = room._id.toString();
                req.session.playerId = player._id.toString();
                req.session.color = player.color || COLORS[playerIndex];

                req.session.save(saveErr => {
                    if (saveErr) {
                        console.error('Session save error:', saveErr);
                        socket.emit('error:sessionError', { message: 'Session save failed' });
                        return reject(saveErr);
                    }

                    // Join the room and emit player data
                    socket.join(room._id.toString());
                    console.log(`Player joined room socket: ${room._id.toString()}`);

                    // Emit player data to the client
                    socket.emit('player:data', JSON.stringify(req.session));
                    console.log('Player data emitted:', {
                        roomId: req.session.roomId,
                        playerId: req.session.playerId,
                        color: req.session.color,
                    });

                    // Also emit room data to all players in the room
                    const { sendToPlayersData } = require('../socket/emits');
                    sendToPlayersData(room);

                    resolve();
                });
            });
        });
    };

    socket.on('player:login', handleLogin);
    socket.on('player:ready', handleReady);
    socket.on('player:exit', handleExit);
};
