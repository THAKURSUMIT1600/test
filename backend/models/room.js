const mongoose = require('mongoose');
const { COLORS, MOVE_TIME, GAME_DURATION } = require('../utils/constants');
const { makeRandomMove } = require('../handlers/handlersFunctions');
const timeoutManager = require('./timeoutManager.js');
const PawnSchema = require('./pawn');
const PlayerSchema = require('./player');
const { calculateAllPlayerScores } = require('../utils/scoreUtils');

const RoomSchema = new mongoose.Schema(
    {
        name: String,
        private: { type: Boolean, default: false },
        password: String,
        createDate: { type: Date, default: Date.now },
        started: { type: Boolean, default: false },
        full: { type: Boolean, default: false },
        nextMoveTime: Number,
        gameEndTime: Number,
        rolledNumber: Number,
        players: [PlayerSchema],
        winner: { type: String, default: null },
        playerScores: { type: Object, default: {} },
        playerCaptures: { type: Object, default: {} },
        pawns: {
            type: [PawnSchema],
            default: () => {
                const startPositions = [];
                for (let i = 0; i < 16; i++) {
                    let pawn = {};
                    pawn.basePos = i;
                    pawn.position = i;
                    pawn.score = 0;
                    if (i < 4) pawn.color = COLORS[0];
                    else if (i < 8) pawn.color = COLORS[1];
                    else if (i < 12) pawn.color = COLORS[2];
                    else if (i < 16) pawn.color = COLORS[3];
                    startPositions.push(pawn);
                }
                return startPositions;
            },
        },
    },
    { timestamps: true }
); // Add automatic createdAt and updatedAt timestamps

RoomSchema.methods.beatPawns = function (position, attackingPawnColor) {
    const pawnsOnPosition = this.pawns.filter(pawn => pawn.position === position);
    let totalCapturedScore = 0;

    console.log(`Checking for captures at position ${position} by ${attackingPawnColor}`);
    console.log(
        `Pawns at position:`,
        pawnsOnPosition.map(p => ({ color: p.color, score: p.score }))
    );

    // Find victims (pawns of different colors at this position)
    const victims = pawnsOnPosition.filter(pawn => pawn.color !== attackingPawnColor);

    if (victims.length > 0) {
        console.log(`Found ${victims.length} victims to capture`);

        // Find a random attacking pawn to receive the captured scores
        const attackingPlayerPawns = this.pawns.filter(p => p.color === attackingPawnColor);

        if (attackingPlayerPawns.length > 0) {
            const strikerPawn = attackingPlayerPawns[Math.floor(Math.random() * attackingPlayerPawns.length)];
            const strikerIndex = this.getPawnIndex(strikerPawn._id);

            // Process each victim
            victims.forEach(victim => {
                const victimIndex = this.getPawnIndex(victim._id);
                const victimScore = this.pawns[victimIndex].score;

                console.log(`Capturing: ${victim.color} pawn with ${victimScore} points`);

                // Striker gains victim's score
                this.pawns[strikerIndex].score += victimScore;
                totalCapturedScore += victimScore;

                // Reset victim: score = 0, position = base
                this.pawns[victimIndex].score = 0;
                this.pawns[victimIndex].position = this.pawns[victimIndex].basePos;

                console.log(`Victim sent to base, striker now has ${this.pawns[strikerIndex].score} points`);
            });

            // Track captures for tie-breaker
            if (totalCapturedScore > 0) {
                if (!this.playerCaptures[attackingPawnColor]) {
                    this.playerCaptures[attackingPawnColor] = 0;
                }
                this.playerCaptures[attackingPawnColor] += totalCapturedScore;
                console.log(`${attackingPawnColor} total captures: ${this.playerCaptures[attackingPawnColor]}`);

                // Mark the document as modified to ensure it gets saved
                this.markModified('pawns');
                this.markModified('playerScores');
                this.markModified('playerCaptures');
            }
        }
    }

    // Update player scores after all captures
    this.updatePlayerScores();
};

RoomSchema.methods.updatePlayerScores = function () {
    const newScores = calculateAllPlayerScores(this.pawns, this.players);
    this.playerScores = newScores;

    // Mark the document as modified to ensure it gets saved
    this.markModified('playerScores');
    this.markModified('playerCaptures');

    console.log('Player scores updated:', newScores);
};

// Helper function to calculate steps moved by pawn
RoomSchema.methods.calculateStepsMoved = function (pawn, diceValue) {
    // Steps moved = dice value (as per the scoring rules)
    return diceValue;
};

RoomSchema.methods.updatePawnScore = function (pawnId, additionalScore) {
    const pawnIndex = this.getPawnIndex(pawnId);
    console.log('Updating pawn score. Pawn index:', pawnIndex, 'Additional score:', additionalScore);
    if (pawnIndex !== -1) {
        const oldScore = this.pawns[pawnIndex].score;
        this.pawns[pawnIndex].score += additionalScore;
        console.log('Pawn score updated from', oldScore, 'to', this.pawns[pawnIndex].score);

        // Mark the document as modified to ensure it gets saved
        this.markModified('pawns');
        this.markModified('playerScores');
        this.markModified('playerCaptures');

        this.updatePlayerScores();
    } else {
        console.log('ERROR: Pawn not found for score update');
    }
};

RoomSchema.methods.changeMovingPlayer = function () {
    if (this.winner) return;

    const currentPlayerIndex = this.players.findIndex(player => player.nowMoving === true);
    if (currentPlayerIndex === -1) {
        // No player is currently moving, set first player
        if (this.players.length > 0) {
            this.players[0].nowMoving = true;
        }
    } else {
        // Move to next player
        this.players[currentPlayerIndex].nowMoving = false;
        const nextIndex = (currentPlayerIndex + 1) % this.players.length;
        if (this.players[nextIndex]) {
            this.players[nextIndex].nowMoving = true;
        }
    }

    this.nextMoveTime = Date.now() + MOVE_TIME;
    this.rolledNumber = null;
    timeoutManager.clear(this._id.toString());
    timeoutManager.set(makeRandomMove, MOVE_TIME, this._id.toString());

    console.log(`Turn changed to player: ${this.getCurrentlyMovingPlayer()?.name || 'Unknown'}`);
};

RoomSchema.methods.movePawn = function (pawn) {
    const originalPosition = pawn.position;
    const newPositionOfMovedPawn = pawn.getPositionAfterMove(this.rolledNumber);

    console.log(
        `Moving ${pawn.color} pawn from position ${originalPosition} to ${newPositionOfMovedPawn} with dice ${this.rolledNumber}`
    );

    // Update position first
    this.changePositionOfPawn(pawn, newPositionOfMovedPawn);

    // Only add score if pawn actually moved to a different position
    if (newPositionOfMovedPawn !== originalPosition) {
        console.log(`Pawn moved successfully, adding ${this.rolledNumber} points to score`);
        // Add dice value (steps moved) to pawn score
        this.updatePawnScore(pawn._id, this.rolledNumber);
    } else {
        console.log('Pawn position unchanged, no score added');
    }

    // Handle captures after movement
    this.beatPawns(newPositionOfMovedPawn, pawn.color);
};

RoomSchema.methods.getPawnsThatCanMove = function () {
    const movingPlayer = this.getCurrentlyMovingPlayer();
    const playerPawns = this.getPlayerPawns(movingPlayer.color);
    return playerPawns.filter(pawn => pawn.canMove(this.rolledNumber));
};

RoomSchema.methods.changePositionOfPawn = function (pawn, newPosition) {
    const pawnIndex = this.getPawnIndex(pawn._id);
    this.pawns[pawnIndex].position = newPosition;
};

RoomSchema.methods.canStartGame = function () {
    return this.players.filter(player => player.ready).length >= 2;
};

RoomSchema.methods.startGame = function () {
    console.log('Starting game...');
    this.started = true;
    this.nextMoveTime = Date.now() + MOVE_TIME;
    this.gameEndTime = Date.now() + GAME_DURATION;
    this.players.forEach(player => (player.ready = true));
    this.players[0].nowMoving = true;

    // Initialize scores properly
    this.playerScores = {};
    this.playerCaptures = {};

    // Set initial scores to 0 for all players
    this.players.forEach(player => {
        if (player.color) {
            this.playerScores[player.color] = 0;
            this.playerCaptures[player.color] = 0;
        }
    });

    console.log('Initial player scores set:', this.playerScores);
    console.log('Initial player captures set:', this.playerCaptures);

    // Calculate actual scores from pawns (should be 0 initially)
    this.updatePlayerScores();

    console.log('Game started. Final scores:', this.playerScores);

    timeoutManager.set(makeRandomMove, MOVE_TIME, this._id.toString());
};

RoomSchema.methods.endGame = function (winner) {
    timeoutManager.clear(this._id.toString());
    this.rolledNumber = null;
    this.nextMoveTime = null;
    this.players.map(player => (player.nowMoving = false));
    this.winner = winner;

    // Schedule room deletion after 5 minutes
    const roomId = this._id.toString();
    console.log(`Game ended in room ${roomId}. Winner: ${winner}. Room will be deleted in 5 minutes.`);

    setTimeout(async () => {
        try {
            const { deleteRoom } = require('../services/roomService');
            await deleteRoom(roomId);
            console.log(`Room ${roomId} has been automatically deleted after game completion.`);
        } catch (error) {
            console.error(`Failed to auto-delete room ${roomId}:`, error);
        }
    }, 5 * 60 * 1000); // 5 minutes delay

    this.save();
};

RoomSchema.methods.getWinner = function () {
    // Traditional win condition - all pawns home
    if (this.pawns.filter(pawn => pawn.color === 'red' && pawn.position === 73).length === 4) {
        return 'red';
    }
    if (this.pawns.filter(pawn => pawn.color === 'blue' && pawn.position === 79).length === 4) {
        return 'blue';
    }
    if (this.pawns.filter(pawn => pawn.color === 'green' && pawn.position === 85).length === 4) {
        return 'green';
    }
    if (this.pawns.filter(pawn => pawn.color === 'yellow' && pawn.position === 91).length === 4) {
        return 'yellow';
    }
    return null;
};

RoomSchema.methods.getWinnerByScore = function () {
    // Determine winner by highest score
    let highestScore = -1;
    let winner = null;
    let tiedPlayers = [];

    Object.entries(this.playerScores).forEach(([color, score]) => {
        if (score > highestScore) {
            highestScore = score;
            winner = color;
            tiedPlayers = [color];
        } else if (score === highestScore) {
            tiedPlayers.push(color);
        }
    });

    // Handle ties by comparing captures (tie-breaker)
    if (tiedPlayers.length > 1) {
        let highestCaptures = -1;
        let captureWinner = null;

        tiedPlayers.forEach(color => {
            const captures = this.playerCaptures[color] || 0;
            if (captures > highestCaptures) {
                highestCaptures = captures;
                captureWinner = color;
            }
        });

        return captureWinner || winner;
    }

    return winner;
};

RoomSchema.methods.isGameTimeExpired = function () {
    return this.gameEndTime && Date.now() > this.gameEndTime;
};

RoomSchema.methods.isFull = function () {
    if (this.players.length >= 4) {
        this.full = true;
        return true;
    }
    this.full = false;
    return false;
};

RoomSchema.methods.getPlayer = function (playerId) {
    return this.players.find(player => player._id.toString() === playerId.toString());
};

RoomSchema.methods.addPlayer = function (name, id) {
    // Check if room is already full or would become overfull
    if (this.players.length >= 4) {
        console.log(`Cannot add player ${name} - room already has ${this.players.length} players`);
        return false;
    }

    this.players.push({
        sessionID: id,
        name: name,
        ready: false,
        color: COLORS[this.players.length],
    });

    // Update full status
    this.isFull();

    console.log(`Player ${name} added. Room now has ${this.players.length}/4 players`);
    return true;
};

RoomSchema.methods.getPawnIndex = function (pawnId) {
    return this.pawns.findIndex(pawn => pawn._id.toString() === pawnId.toString());
};

RoomSchema.methods.getPawn = function (pawnId) {
    return this.pawns.find(pawn => pawn._id.toString() === pawnId.toString());
};

RoomSchema.methods.getPlayerPawns = function (color) {
    return this.pawns.filter(pawn => pawn.color === color);
};

RoomSchema.methods.getCurrentlyMovingPlayer = function () {
    return this.players.find(player => player.nowMoving === true);
};

const Room = mongoose.model('Room', RoomSchema);

module.exports = Room;
