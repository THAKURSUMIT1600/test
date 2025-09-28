/**
 * Utility functions for calculating scores in the Ludo game
 */

/**
 * Calculate pawn score after movement
 * @param {Object} pawn - The pawn object
 * @param {number} diceValue - The rolled dice value
 * @returns {number} - Updated pawn score
 */
function calculatePawnScore(pawn, diceValue) {
    // Add dice value to current pawn score
    return pawn.score + diceValue;
}

/**
 * Handle capture scoring - striker gets victim's score, victim resets to 0
 * @param {Object} striker - The attacking pawn
 * @param {Object} victim - The captured pawn
 * @returns {Object} - Object with updated striker and victim scores
 */
function handleCapture(striker, victim) {
    const strikerNewScore = striker.score + victim.score;
    const victimNewScore = 0;

    return {
        strikerScore: strikerNewScore,
        victimScore: victimNewScore,
    };
}

/**
 * Calculate total score for a player
 * @param {Array} pawns - Array of all pawns in the room
 * @param {string} playerColor - Player's color
 * @returns {number} - Total score for the player
 */
function calculatePlayerScore(pawns, playerColor) {
    const playerPawns = pawns.filter(pawn => pawn.color === playerColor);
    const totalScore = playerPawns.reduce((total, pawn) => {
        console.log(`Pawn ${playerColor} at position ${pawn.position} has score ${pawn.score}`);
        return total + pawn.score;
    }, 0);
    console.log(`Total score for ${playerColor}:`, totalScore);
    return totalScore;
}

/**
 * Calculate scores for all players
 * @param {Array} pawns - Array of all pawns in the room
 * @param {Array} players - Array of all players in the room
 * @returns {Object} - Object with player scores by color
 */
function calculateAllPlayerScores(pawns, players) {
    const playerScores = {};
    console.log(
        'Calculating scores for players:',
        players.map(p => p.color)
    );
    console.log(
        'Pawns data:',
        pawns.map(p => ({ color: p.color, position: p.position, score: p.score }))
    );

    players.forEach(player => {
        if (player.color) {
            const playerScore = calculatePlayerScore(pawns, player.color);
            playerScores[player.color] = playerScore;
            console.log(`Player ${player.color} total score:`, playerScore);
        }
    });

    console.log('Final calculated player scores:', playerScores);
    return playerScores;
}

/**
 * Count captures for each player (for tie-breaking)
 * @param {Array} pawns - Array of all pawns in the room
 * @param {string} playerColor - Player's color
 * @returns {number} - Number of captures made by the player
 */
function countCaptures(pawns, playerColor) {
    // In this implementation, we'll track captures in player data
    // This is a placeholder for capture counting logic
    return 0;
}

module.exports = {
    calculatePawnScore,
    handleCapture,
    calculatePlayerScore,
    calculateAllPlayerScores,
    countCaptures,
};
