import React from 'react';
import styles from './Scoreboard.module.css';

const Scoreboard = ({ scores = {}, captures = {}, players = [] }) => {
    console.log('=== SCOREBOARD RENDER ===');
    console.log('Props received - scores:', scores);
    console.log('Props received - captures:', captures);
    console.log('Props received - players:', players);

    // Create an array of player data with scores
    const playerData = players
        .filter(player => player.color && player.name !== '...')
        .map(player => {
            const playerInfo = {
                name: player.name,
                color: player.color,
                score: typeof scores[player.color] === 'number' ? scores[player.color] : 0,
                captures: typeof captures[player.color] === 'number' ? captures[player.color] : 0,
            };
            console.log('Mapped player data:', playerInfo);
            return playerInfo;
        })
        .sort((a, b) => b.score - a.score); // Sort by score descending

    console.log('Final playerData for display:', playerData);
    console.log('=== END SCOREBOARD RENDER ===');

    // Always show scoreboard if there are active players
    if (playerData.length === 0) {
        return null;
    }

    return (
        <div className={styles.scoreboard}>
            <h3 className={styles.title}>Live Scores</h3>
            <div className={styles.scoresContainer}>
                {playerData.map((player, index) => (
                    <div key={player.color} className={`${styles.playerScore} ${styles[player.color]}`}>
                        <div className={styles.rank}>#{index + 1}</div>
                        <div className={styles.playerInfo}>
                            <div
                                className={styles.playerName}
                                style={{ color: player.color, textTransform: 'capitalize' }}
                            >
                                {player.color}: {player.score} points
                            </div>
                            {player.captures > 0 && <div className={styles.captures}>{player.captures} captures</div>}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default Scoreboard;
