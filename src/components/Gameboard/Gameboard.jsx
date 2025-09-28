import React, { useState, useEffect, useContext } from 'react';
import ReactLoading from 'react-loading';
import { PlayerDataContext, SocketContext } from '../../App';
import useSocketData from '../../hooks/useSocketData';
import Map from './Map/Map';
import Navbar from '../Navbar/Navbar';
import Overlay from '../Overlay/Overlay';
import Scoreboard from '../Scoreboard/Scoreboard';
import GameTimer from '../GameTimer/GameTimer';
import styles from './Gameboard.module.css';
import trophyImage from '../../images/trophy.webp';

const Gameboard = () => {
    const socket = useContext(SocketContext);
    const context = useContext(PlayerDataContext);
    const [pawns, setPawns] = useState([]);
    const [players, setPlayers] = useState([]);
    const [scores, setScores] = useState({});
    const [captures, setCaptures] = useState({});

    const [rolledNumber, setRolledNumber] = useSocketData('game:roll');
    const [time, setTime] = useState();
    const [gameEndTime, setGameEndTime] = useState();
    const [isReady, setIsReady] = useState();
    const [nowMoving, setNowMoving] = useState(false);
    const [started, setStarted] = useState(false);

    const [movingPlayer, setMovingPlayer] = useState('red');

    const [winner, setWinner] = useState(null);
    const [finalScores, setFinalScores] = useState({});
    const [finalCaptures, setFinalCaptures] = useState({});

    useEffect(() => {
        socket.emit('room:data', context.roomId);

        socket.on('room:data', data => {
            data = JSON.parse(data);
            if (data.players == null) return;

            // Filling navbar with empty player nick container
            while (data.players.length !== 4) {
                data.players.push({ name: '...' });
            }

            // Checks if client is currently moving player by session ID
            const nowMovingPlayer = data.players.find(player => player.nowMoving === true);
            if (nowMovingPlayer) {
                if (nowMovingPlayer._id === context.playerId) {
                    setNowMoving(true);
                } else {
                    setNowMoving(false);
                }
                setMovingPlayer(nowMovingPlayer.color);
            }

            const currentPlayer = data.players.find(player => player._id === context.playerId);
            setIsReady(currentPlayer.ready);
            setRolledNumber(data.rolledNumber);
            setPlayers(data.players);
            setPawns(data.pawns);
            setTime(data.nextMoveTime);
            setGameEndTime(data.gameEndTime);
            setStarted(data.started);

            // Update scores from room data
            console.log('Room data received. PlayerScores:', data.playerScores, 'PlayerCaptures:', data.playerCaptures);
            if (data.playerScores) {
                console.log('Setting scores from room data:', data.playerScores);
                setScores(data.playerScores);
            }
            if (data.playerCaptures) {
                console.log('Setting captures from room data:', data.playerCaptures);
                setCaptures(data.playerCaptures);
            }
        });

        // Listen for real-time score updates
        socket.on('game:scores', scoreData => {
            console.log('=== FRONTEND: Received score update ===');
            console.log('Score data received:', scoreData);
            console.log('Current scores state:', scores);
            console.log('Current captures state:', captures);

            if (scoreData && scoreData.scores) {
                console.log('Setting new scores:', scoreData.scores);
                setScores(scoreData.scores);
            }
            if (scoreData && scoreData.captures) {
                console.log('Setting new captures:', scoreData.captures);
                setCaptures(scoreData.captures);
            }

            console.log('=== END FRONTEND SCORE UPDATE ===');
        });

        socket.on('game:winner', winnerData => {
            if (typeof winnerData === 'string') {
                // Handle old format
                setWinner(winnerData);
            } else {
                // Handle new format with scores
                setWinner(winnerData.winner);
                if (winnerData.finalScores) {
                    setFinalScores(winnerData.finalScores);
                }
                if (winnerData.finalCaptures) {
                    setFinalCaptures(winnerData.finalCaptures);
                }
            }
        });

        socket.on('redirect', () => {
            window.location.reload();
        });

        return () => {
            socket.off('room:data');
            socket.off('game:scores');
            socket.off('game:winner');
            socket.off('redirect');
        };
    }, [socket, context.playerId, context.roomId, setRolledNumber, scores, captures]);

    return (
        <>
            {pawns.length === 16 ? (
                <div className='container'>
                    <Navbar
                        players={players}
                        started={started}
                        time={time}
                        isReady={isReady}
                        movingPlayer={movingPlayer}
                        rolledNumber={rolledNumber}
                        nowMoving={nowMoving}
                        ended={winner !== null}
                    />
                    <Map pawns={pawns} nowMoving={nowMoving} rolledNumber={rolledNumber} />
                    {started && (
                        <>
                            <Scoreboard scores={scores} captures={captures} players={players} />
                            <GameTimer gameEndTime={gameEndTime} started={started} />
                        </>
                    )}
                </div>
            ) : (
                <ReactLoading type='spinningBubbles' color='white' height={667} width={375} />
            )}
            {winner ? (
                <Overlay>
                    <div className={styles.winnerContainer}>
                        <img src={trophyImage} alt='winner' />
                        <h1>
                            Winner: <span style={{ color: winner }}>{winner}</span>
                        </h1>
                        {finalScores && Object.keys(finalScores).length > 0 && (
                            <div className={styles.finalScores}>
                                <h3>Final Scores:</h3>
                                {Object.entries(finalScores)
                                    .sort(([, a], [, b]) => b - a)
                                    .map(([color, score]) => (
                                        <p key={color}>
                                            <span style={{ color }}>{color}</span>: {score} points
                                            {finalCaptures[color] > 0 && ` (${finalCaptures[color]} captures)`}
                                        </p>
                                    ))}
                            </div>
                        )}
                        <button onClick={() => socket.emit('player:exit')}>Play again</button>
                    </div>
                </Overlay>
            ) : null}
        </>
    );
};

export default Gameboard;
