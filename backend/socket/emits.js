const socketManager = require('./socketManager');

const sendToPlayersRolledNumber = (id, rolledNumber) => {
    socketManager.getIO().to(id).emit('game:roll', rolledNumber);
};

const sendToPlayersData = room => {
    console.log('Sending room data. Room started:', room.started, 'Players:', room.players.length);
    socketManager.getIO().to(room._id.toString()).emit('room:data', JSON.stringify(room));
};

const sendToPlayersScores = (id, playerScores, playerCaptures = {}) => {
    console.log('Emitting scores to room:', id, 'Scores:', playerScores, 'Captures:', playerCaptures);
    socketManager.getIO().to(id).emit('game:scores', {
        scores: playerScores,
        captures: playerCaptures,
    });
};

const sendToOnePlayerData = (id, room) => {
    socketManager.getIO().to(id).emit('room:data', JSON.stringify(room));
};

const sendToOnePlayerRooms = (id, rooms) => {
    socketManager.getIO().to(id).emit('room:rooms', JSON.stringify(rooms));
};

const sendWinner = (id, winner, finalScores = {}, finalCaptures = {}) => {
    socketManager.getIO().to(id).emit('game:winner', {
        winner,
        finalScores,
        finalCaptures,
    });
};

module.exports = {
    sendToPlayersData,
    sendToPlayersRolledNumber,
    sendToPlayersScores,
    sendToOnePlayerData,
    sendToOnePlayerRooms,
    sendWinner,
};
