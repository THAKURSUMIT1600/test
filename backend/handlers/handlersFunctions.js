const { sendToPlayersRolledNumber, sendWinner, sendToPlayersScores } = require('../socket/emits');

const rollDice = () => {
    const rolledNumber = Math.ceil(Math.random() * 6);
    return rolledNumber;
};

const makeRandomMove = async roomId => {
    const { updateRoom, getRoom } = require('../services/roomService');
    const room = await getRoom(roomId);
    if (room.winner) return;

    // Check if game time has expired
    if (room.isGameTimeExpired()) {
        const scoreWinner = room.getWinnerByScore();
        if (scoreWinner) {
            room.endGame(scoreWinner);
            sendWinner(room._id.toString(), scoreWinner, room.playerScores, room.playerCaptures);
            await updateRoom(room);
            return;
        }
    }

    if (room.rolledNumber === null) {
        room.rolledNumber = rollDice();
        sendToPlayersRolledNumber(room._id.toString(), room.rolledNumber);
    }

    const pawnsThatCanMove = room.getPawnsThatCanMove();
    if (pawnsThatCanMove.length > 0) {
        const randomPawn = pawnsThatCanMove[Math.floor(Math.random() * pawnsThatCanMove.length)];
        room.movePawn(randomPawn);

        // Update and emit scores after the move
        room.updatePlayerScores();
        sendToPlayersScores(room._id.toString(), room.playerScores, room.playerCaptures);
    }

    room.changeMovingPlayer();
    const winner = room.getWinner();
    if (winner) {
        room.endGame(winner);
        sendWinner(room._id.toString(), winner, room.playerScores, room.playerCaptures);
    }

    console.log(`Saving room after random move for room ${roomId}`);
    await updateRoom(room);
    console.log(`Room saved successfully for room ${roomId}`);
};

const isMoveValid = (session, pawn, room) => {
    if (session.color !== pawn.color) {
        return false;
    }
    if (session.playerId !== room.getCurrentlyMovingPlayer()._id.toString()) {
        return false;
    }
    return true;
};

module.exports = { rollDice, makeRandomMove, isMoveValid };
