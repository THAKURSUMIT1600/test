const { getRoom, updateRoom } = require('../services/roomService');
const { sendToPlayersRolledNumber, sendWinner, sendToPlayersScores, sendToPlayersData } = require('../socket/emits');
const { rollDice, isMoveValid } = require('./handlersFunctions');

module.exports = socket => {
    const req = socket.request;

    const handleMovePawn = async pawnId => {
        try {
            if (!req.session.roomId) {
                console.log('Move attempt without room session');
                return socket.emit('error:notInRoom', { message: 'Not in a room' });
            }

            const room = await getRoom(req.session.roomId);
            if (!room) {
                console.log(`Room not found for move: ${req.session.roomId}`);
                return socket.emit('error:roomNotFound', { message: 'Room not found' });
            }

            if (room.winner) {
                console.log('Game already has winner, move rejected');
                return socket.emit('error:gameEnded', { message: 'Game has already ended' });
            }

            if (!room.started) {
                console.log('Game not started yet');
                return socket.emit('error:gameNotStarted', { message: 'Game not started' });
            }

            // Check if player has rolled dice
            if (room.rolledNumber === null) {
                console.log('Player must roll dice first');
                return socket.emit('error:mustRollFirst', { message: 'Must roll dice first' });
            }

            const pawn = room.getPawn(pawnId);
            if (!pawn) {
                console.log(`Pawn not found: ${pawnId}`);
                return socket.emit('error:pawnNotFound', { message: 'Pawn not found' });
            }

            if (isMoveValid(req.session, pawn, room)) {
                console.log('=== PROCESSING VALID MOVE ===');
                console.log('Pawn before move:', { color: pawn.color, position: pawn.position, score: pawn.score });
                console.log('Dice rolled:', room.rolledNumber);

                // Execute the move (includes scoring and captures)
                room.movePawn(pawn);

                console.log('Pawn after move:', { color: pawn.color, position: pawn.position, score: pawn.score });

                // Check for traditional winner (all pawns home) - this takes priority
                const traditionalWinner = room.getWinner();
                if (traditionalWinner) {
                    room.endGame(traditionalWinner);
                    sendWinner(room._id.toString(), traditionalWinner, room.playerScores, room.playerCaptures);
                } else {
                    // Change turn after successful move
                    room.changeMovingPlayer();

                    // Send updated scores only once after move
                    sendToPlayersScores(req.session.roomId, room.playerScores, room.playerCaptures);
                }

                await updateRoom(room);
                sendToPlayersData(room);
            } else {
                console.log('Invalid move attempted');
                socket.emit('error:invalidMove', { message: 'Invalid move' });
            }
        } catch (error) {
            console.error('Error handling pawn move:', error);
            socket.emit('error:moveFailed', { message: error.message });
        }
    };

    const handleRollDice = async () => {
        try {
            if (!req.session.roomId) {
                console.log('Dice roll attempt without room session');
                return socket.emit('error:notInRoom', { message: 'Not in a room' });
            }

            const room = await getRoom(req.session.roomId);
            if (!room) {
                console.log(`Room not found for dice roll: ${req.session.roomId}`);
                return socket.emit('error:roomNotFound', { message: 'Room not found' });
            }

            if (room.winner) {
                console.log('Game already has winner, dice roll rejected');
                return socket.emit('error:gameEnded', { message: 'Game has already ended' });
            }

            if (!room.started) {
                console.log('Game not started yet');
                return socket.emit('error:gameNotStarted', { message: 'Game not started' });
            }

            // Check if it's the player's turn
            const currentPlayer = room.getCurrentlyMovingPlayer();
            if (!currentPlayer || currentPlayer._id.toString() !== req.session.playerId) {
                console.log(
                    `Not player's turn. Current: ${currentPlayer ? currentPlayer._id : 'none'}, Requesting: ${
                        req.session.playerId
                    }`
                );
                return socket.emit('error:notYourTurn', { message: 'Not your turn' });
            }

            // Check if player already rolled and hasn't moved
            if (room.rolledNumber !== null) {
                console.log('Player already rolled, must move first');
                return socket.emit('error:mustMoveFirst', { message: 'Must move before rolling again' });
            }

            const rolledNumber = rollDice();
            console.log(`Player ${currentPlayer.name} rolled: ${rolledNumber}`);

            // Update room with rolled number
            room.rolledNumber = rolledNumber;

            // Send dice roll result to all players in room
            sendToPlayersRolledNumber(req.session.roomId, rolledNumber);

            // Check if player can move with this roll
            const player = room.getPlayer(req.session.playerId);
            if (!player.canMove(room, rolledNumber)) {
                console.log('Player cannot move with this roll, changing turn after timeout');
                // Set a timeout to change turn if no move is made
                setTimeout(async () => {
                    try {
                        const freshRoom = await getRoom(req.session.roomId);
                        if (freshRoom && freshRoom.rolledNumber === rolledNumber) {
                            freshRoom.changeMovingPlayer();
                            await updateRoom(freshRoom);
                            sendToPlayersData(freshRoom);
                        }
                    } catch (error) {
                        console.error('Error in turn timeout:', error);
                    }
                }, 3000);
            }

            await updateRoom(room);
            sendToPlayersData(room);
        } catch (error) {
            console.error('Error handling dice roll:', error);
            socket.emit('error:rollFailed', { message: error.message });
        }
    };

    socket.on('game:roll', handleRollDice);
    socket.on('game:move', handleMovePawn);
};
