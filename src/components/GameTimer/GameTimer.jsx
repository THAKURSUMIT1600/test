import React, { useState, useEffect } from 'react';
import styles from './GameTimer.module.css';

const GameTimer = ({ gameEndTime, started }) => {
    const [timeLeft, setTimeLeft] = useState(0);
    const [expired, setExpired] = useState(false);

    useEffect(() => {
        if (!started || !gameEndTime) {
            setTimeLeft(0);
            return;
        }

        const updateTimer = () => {
            const now = Date.now();
            const remaining = Math.max(0, gameEndTime - now);
            setTimeLeft(remaining);

            if (remaining === 0) {
                setExpired(true);
            }
        };

        // Update immediately
        updateTimer();

        // Set up interval to update every second
        const interval = setInterval(updateTimer, 1000);

        return () => clearInterval(interval);
    }, [gameEndTime, started]);

    if (!started || !gameEndTime) {
        return null;
    }

    const minutes = Math.floor(timeLeft / 60000);
    const seconds = Math.floor((timeLeft % 60000) / 1000);

    return (
        <div className={`${styles.gameTimer} ${expired ? styles.expired : ''}`}>
            <div className={styles.label}>Game Time</div>
            <div className={styles.time}>
                {minutes.toString().padStart(2, '0')}:{seconds.toString().padStart(2, '0')}
            </div>
            {expired && <div className={styles.expiredText}>Time's Up! Winner by score.</div>}
        </div>
    );
};

export default GameTimer;
