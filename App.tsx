import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView, PanResponder, Dimensions, LayoutChangeEvent, Animated, TextInput, Modal, Platform } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Linking from 'expo-linking';
import { Grid } from './components/Grid';
import { PlaneVisual } from './components/PlaneVisual';
import * as Game from './GameLogic';
import { Coordinate, GridCell, Plane } from './GameLogic';

import { transact, Web3MobileWallet } from '@solana-mobile/mobile-wallet-adapter-protocol-web3js';
import { PublicKey, Connection, clusterApiUrl, LAMPORTS_PER_SOL } from '@solana/web3.js';

// Simple Linear Gradient BG placeholder (or use dark solid color)
const BG_COLOR = '#050510';
const APP_IDENTITY = {
    name: 'AirCombat',
    uri: 'https://aircombat.onrender.com/',
    icon: 'favicon.ico', // relative path to app icon if any
};

export default function App() {
    const [gameState, setGameState] = useState<'LOGIN' | 'LOBBY' | 'SETUP' | 'PLAY' | 'GAME_OVER'>('LOGIN');
    const [playerGrid, setPlayerGrid] = useState<GridCell[][]>(Game.createEmptyGrid());
    const [computerGrid, setComputerGrid] = useState<GridCell[][]>(Game.createEmptyGrid());
    const [playerPlanes, setPlayerPlanes] = useState<Plane[]>([]);
    const [computerPlanes, setComputerPlanes] = useState<Plane[]>([]);
    const [turn, setTurn] = useState<'PLAYER' | 'COMPUTER'>('PLAYER');
    const [winner, setWinner] = useState<'PLAYER' | 'COMPUTER' | null>(null);
    const [battleMsg, setBattleMsg] = useState<string | null>(null);
    const [playerScore, setPlayerScore] = useState(0);
    const [computerScore, setComputerScore] = useState(0);

    // Match Stats
    const [pHits, setPHits] = useState(0);
    const [pMisses, setPMisses] = useState(0);
    const [cHits, setCHits] = useState(0);
    const [cMisses, setCMisses] = useState(0);

    // User Profile & Leaderboard
    const [username, setUsername] = useState('Pilot_' + Math.floor(1000 + Math.random() * 9000));
    const [playerWins, setPlayerWins] = useState(0);
    const [totalPlanesDestroyed, setTotalPlanesDestroyed] = useState(0);
    const [showLeaderboard, setShowLeaderboard] = useState(false);
    const [isEditingName, setIsEditingName] = useState(false);
    const [tempName, setTempName] = useState('');
    const [showRecap, setShowRecap] = useState(false);
    const [leaderboard, setLeaderboard] = useState<{ username: string, wins: number, kills: number }[]>([]);
    const [balance, setBalance] = useState<number | null>(null);

    // For local testing: 'http://localhost:5000' or your local IP
    // For cloud: Replace with your Render/deployment URL
    const RAW_API_URL = 'https://aircombat.onrender.com/';
    const API_URL = RAW_API_URL.endsWith('/') ? RAW_API_URL.slice(0, -1) : RAW_API_URL;
    const [serverStatus, setServerStatus] = useState<'IDLE' | 'LOADING' | 'SUCCESS' | 'ERROR'>('IDLE');

    const fetchLeaderboard = async () => {
        setServerStatus('LOADING');
        try {
            console.log(`[NET] Fetching from: ${API_URL}/leaderboard`);
            const response = await fetch(`${API_URL}/leaderboard`);
            if (!response.ok) throw new Error('Server unreachable');
            const data = await response.json();
            setLeaderboard(data);
            setServerStatus('SUCCESS');
        } catch (err) {
            console.error('Leaderboard fetch error:', err);
            setServerStatus('ERROR');
        }
    };

    const submitScore = async (name: string, wins: number, kills: number) => {
        try {
            await fetch(`${API_URL}/update-score`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: name, wins, kills })
            });
            fetchLeaderboard();
        } catch (err) {
            console.error('Score submission error:', err);
        }
    };

    useEffect(() => {
        if (showLeaderboard) fetchLeaderboard();
    }, [showLeaderboard]);

    const [setupOrientation, setSetupOrientation] = useState<'N' | 'S' | 'E' | 'W'>('N');
    const orientationRef = useRef(setupOrientation);
    useEffect(() => { orientationRef.current = setupOrientation; }, [setupOrientation]);

    const [dragPos, setDragPos] = useState<{ x: number, y: number } | null>(null);
    const [dragPreview, setDragPreview] = useState<Coordinate | null>(null);

    // Animation State
    const flyAnim = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
    const [isFlying, setIsFlying] = useState(false);
    const isFlyingRef = useRef(isFlying);
    useEffect(() => { isFlyingRef.current = isFlying; }, [isFlying]);

    const [flyOrientation, setFlyOrientation] = useState<'N' | 'S' | 'E' | 'W'>('N');
    const turnPulseAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (turn === 'PLAYER' && gameState === 'PLAY') {
            Animated.loop(
                Animated.sequence([
                    Animated.timing(turnPulseAnim, { toValue: 1, duration: 1000, useNativeDriver: false }),
                    Animated.timing(turnPulseAnim, { toValue: 0, duration: 1000, useNativeDriver: false })
                ])
            ).start();
        } else {
            turnPulseAnim.stopAnimation();
            turnPulseAnim.setValue(0);
        }
    }, [turn, gameState]);

    const gameStartTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    const { width: SCREEN_WIDTH } = Dimensions.get('window');
    const CELL_SIZE = ((SCREEN_WIDTH - 40) / Game.BOARD_SIZE) * (
        gameState === 'SETUP' ? 0.84 :
            (gameState === 'GAME_OVER' && showRecap) ? 0.608 : 0.76
    );

    const onGridLayout = (event: LayoutChangeEvent) => {
        // We need pageX/pageY but layout only gives relative to parent.
        // For simplicity, we assume grid is centered and has 20px margin.
        // Better: use measure() if needed, but for this app the layout is predictable.
        const { x, y, width, height } = event.nativeEvent.layout;
        // Since it's in a gameContainer (alignItems: center), x is likely relative.
        // We'll use a ref to get absolute position later if needed, but let's try relative first.
    };

    const gridRef = useRef<View>(null);
    // Initialize with a reasonable guess for mobile screens to avoid 'not ready' errors
    const [absGridPos, setAbsGridPos] = useState<{ x: number, y: number }>({ x: 20, y: 120 });
    const absGridPosRef = useRef(absGridPos);
    useEffect(() => { absGridPosRef.current = absGridPos; }, [absGridPos]);

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => {
                updateGridPos();
                return true;
            },
            onMoveShouldSetPanResponder: () => true,
            onPanResponderMove: (evt, gestureState) => {
                const moveX = evt.nativeEvent.pageX;
                const moveY = evt.nativeEvent.pageY;
                setDragPos({ x: moveX, y: moveY });

                const gridPos = absGridPosRef.current;
                const orientation = orientationRef.current;

                const relativeX = moveX - gridPos.x - 2 - 25; // 25px for side labels
                const relativeY = moveY - gridPos.y - 2 - 20; // 20px for top labels

                const gridX = Math.floor(relativeX / CELL_SIZE);
                const gridY = Math.floor(relativeY / CELL_SIZE);

                if (gridX >= 0 && gridX < 10 && gridY >= 0 && gridY < 10) {
                    setDragPreview({ x: gridX, y: gridY });
                } else {
                    setDragPreview(null);
                }
            },
            onPanResponderRelease: (evt, gestureState) => {
                const releaseX = evt.nativeEvent.pageX;
                const releaseY = evt.nativeEvent.pageY;

                const gridPos = absGridPosRef.current;

                const relativeX = releaseX - gridPos.x - 2 - 25;
                const relativeY = releaseY - gridPos.y - 2 - 20;

                const gridX = Math.floor(relativeX / CELL_SIZE);
                const gridY = Math.floor(relativeY / CELL_SIZE);

                if (gridX >= 0 && gridX < 10 && gridY >= 0 && gridY < 10) {
                    handleSetupCellPressRef.current(gridX, gridY, releaseX, releaseY);
                } else {
                    console.log(`[DRAG] Drop outside grid: ${gridX}, ${gridY}`);
                }
                setDragPos(null);
                setDragPreview(null);
            },
        })
    ).current;

    const updateGridPos = () => {
        if (gridRef.current) {
            gridRef.current.measureInWindow((x, y, width, height) => {
                if (x !== 0 || y !== 0) {
                    setAbsGridPos({ x: Math.round(x), y: Math.round(y) });
                }
            });
        }
    };

    useEffect(() => {
        if (gameState === 'SETUP') {
            const interval = setInterval(updateGridPos, 500);
            return () => clearInterval(interval);
        }
    }, [gameState]);

    // Solana Login
    const handleLogin = async () => {
        console.log('Login button pressed');
        try {
            await connectWallet();
        } catch (e) {
            console.error('Wallet connection error:', e);
            Alert.alert('Wallet Error', 'Failed to connect wallet. Using Guest mode.');
            setGameState('LOBBY');
            fetchLeaderboard();
        }
    };

    const connectWallet = async () => {
        if (Platform.OS === 'web') {
            try {
                // @ts-ignore
                const solflare = window.solflare;
                // @ts-ignore
                const solana = window.solana;

                let provider = null;
                if (solflare && solflare.isSolflare) {
                    provider = solflare;
                } else if (solana && solana.isPhantom) {
                    provider = solana;
                }

                if (!provider) {
                    alert('Please install Solflare or Phantom wallet extension!');
                    return;
                }

                await provider.connect();
                const publicKey = provider.publicKey;
                const address = publicKey.toString();

                setUsername(address);

                try {
                    const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
                    const bal = await connection.getBalance(publicKey);
                    setBalance(bal / LAMPORTS_PER_SOL);
                } catch (e) {
                    console.error("Failed to fetch balance on web", e);
                }

                setTimeout(() => {
                    setGameState('LOBBY');
                    fetchLeaderboard();
                }, 500);
            } catch (err) {
                console.error("Web Login Error", err);
                Alert.alert("Login Failed", "Could not connect to wallet extension.");
            }
            return;
        }

        try {
            await transact(async (wallet: Web3MobileWallet) => {
                const { accounts, auth_token } = await wallet.authorize({
                    cluster: 'devnet',
                    identity: APP_IDENTITY,
                });

                const firstAccount = accounts[0];
                const publicKey = new PublicKey(firstAccount.address);
                const address = publicKey.toBase58();

                // Sign a message for verification (optional but good practice)
                const message = 'Log in to AirCombat';
                const messageBuffer = Buffer.from(message);

                const signedMessages = await wallet.signMessages({
                    addresses: [address],
                    payloads: [messageBuffer.toString('base64')],
                });

                // If successful
                setUsername(address);

                try {
                    const connection = new Connection(clusterApiUrl('devnet'), 'confirmed');
                    const bal = await connection.getBalance(publicKey);
                    setBalance(bal / LAMPORTS_PER_SOL);
                } catch (e) {
                    console.error("Failed to fetch balance", e);
                }

                setTimeout(() => {
                    setGameState('LOBBY');
                    fetchLeaderboard();
                }, 500);
            });
        } catch (err: any) {
            console.log('Mobile Wallet Adapter Error:', err);
            // Fallback for simple deeplinking if MWA fails or not supported
            if (err.message && err.message.includes('No wallet found')) {
                Linking.openURL('https://solflare.com/ul/v1/connect');
            } else {
                throw err;
            }
        }
    };

    const startGame = () => {
        setPlayerGrid(Game.createEmptyGrid());
        setPlayerPlanes([]);
        setComputerGrid(Game.createEmptyGrid());
        setComputerPlanes(Game.generateRandomBoard());
        setGameState('SETUP');
        setWinner(null);
        setPlayerScore(0);
        setComputerScore(0);
        setPHits(0);
        setPMisses(0);
        setCHits(0);
        setCMisses(0);
        setShowRecap(false);
    };

    // Setup Phase
    const handleSetupCellPress = (x: number, y: number, fromX?: number, fromY?: number) => {
        if (playerPlanes.length >= Game.PLANE_COUNT || isFlying) return;

        const newCells = Game.getPlaneCells({ x, y }, setupOrientation);
        if (Game.isValidPlacement(playerPlanes, newCells)) {
            if (fromX !== undefined && fromY !== undefined) {
                // Animate Flight
                setIsFlying(true);
                setFlyOrientation(setupOrientation);
                flyAnim.setValue({ x: fromX, y: fromY });

                const offsets = getOffsets(setupOrientation, CELL_SIZE);
                const targetX = absGridPos.x + 2 + 25 + x * CELL_SIZE + offsets.x;
                const targetY = absGridPos.y + 2 + 20 + y * CELL_SIZE + offsets.y;

                Animated.timing(flyAnim, {
                    toValue: { x: targetX, y: targetY },
                    duration: 500,
                    useNativeDriver: false,
                }).start(() => {
                    setIsFlying(false);
                    completePlacement(x, y);
                });
            } else {
                completePlacement(x, y);
            }
        } else {
            Alert.alert('Invalid Placement', 'Planes cannot overlap each other.');
        }
    };

    const handleSetupCellPressRef = useRef(handleSetupCellPress);
    useEffect(() => {
        handleSetupCellPressRef.current = handleSetupCellPress;
    });

    const completePlacement = (x: number, y: number) => {
        const newCells = Game.getPlaneCells({ x, y }, setupOrientation);
        const newPlane: Plane = {
            id: playerPlanes.length,
            head: { x, y },
            orientation: setupOrientation,
            isDestroyed: false,
            cells: newCells
        };

        setPlayerGrid(prevGrid => {
            const nextGrid = prevGrid.map(row => row.map(c => ({ ...c })));
            newCells.forEach(c => {
                nextGrid[c.y][c.x] = { ...nextGrid[c.y][c.x], planeId: newPlane.id };
            });
            return nextGrid;
        });

        setPlayerPlanes(prev => {
            const next = [...prev, newPlane];
            if (next.length === Game.PLANE_COUNT) {
                gameStartTimeout.current = setTimeout(() => {
                    setGameState('PLAY');
                    setTurn('PLAYER');
                }, 2000);
            }
            return next;
        });
    };

    const undoPlacement = () => {
        if (playerPlanes.length === 0 || isFlying) return;

        // Cancel game start if pending
        if (gameStartTimeout.current) {
            clearTimeout(gameStartTimeout.current);
            gameStartTimeout.current = null;
        }

        const updatedPlanes = [...playerPlanes];
        const removedPlane = updatedPlanes.pop();
        setPlayerPlanes(updatedPlanes);

        if (removedPlane) {
            setPlayerGrid(prevGrid => {
                const nextGrid = prevGrid.map(row => row.map(c => ({ ...c })));
                removedPlane.cells.forEach(c => {
                    nextGrid[c.y][c.x] = { ...nextGrid[c.y][c.x], planeId: undefined };
                });
                return nextGrid;
            });
        }
    };

    const rotateLeft = () => {
        const next = { 'N': 'W', 'W': 'S', 'S': 'E', 'E': 'N' } as const;
        setSetupOrientation(next[setupOrientation]);
    };

    const rotateRight = () => {
        const next = { 'N': 'E', 'E': 'S', 'S': 'W', 'W': 'N' } as const;
        setSetupOrientation(next[setupOrientation]);
    };

    // Game Loop
    const handleAttack = (x: number, y: number) => {
        if (turn !== 'PLAYER' || gameState !== 'PLAY') return;

        // Clone grid and planes to avoid direct mutation
        const gridClone = computerGrid.map(row => row.map(c => ({ ...c })));
        const planesClone = computerPlanes.map(p => ({ ...p, cells: [...p.cells] }));

        const result = Game.fireShot(gridClone, planesClone, { x, y });

        setComputerGrid(gridClone);
        setComputerPlanes(planesClone);

        // Check Win using the newly updated planes
        const allComputerDestroyed = planesClone.every(p => p.isDestroyed);
        if (allComputerDestroyed) {
            setTotalPlanesDestroyed(currentKills => {
                const finalKills = currentKills + 1;
                setPlayerWins(currentWins => {
                    const finalWins = currentWins + 1;
                    submitScore(username, finalWins, finalKills);
                    return finalWins;
                });
                return finalKills;
            });
            setWinner('PLAYER');
            setPlayerScore(3);
            setBattleMsg('VICTORY!');
            setTimeout(() => {
                setGameState('GAME_OVER');
                setBattleMsg(null);
            }, 5000);
            return;
        }

        if (result.result === 'HIT') {
            setPHits(prev => prev + 1);
            setBattleMsg('YOU HIT!');
            setTimeout(() => {
                setBattleMsg(null);
                setTurn('COMPUTER');
                setTimeout(computerTurn, 1000);
            }, 1200);
        } else if (result.result === 'KILL') {
            setPHits(prev => prev + 1);
            setBattleMsg('YOU DESTROYED!');
            setPlayerScore(prev => prev + 1);
            setTotalPlanesDestroyed(prev => prev + 1);
            setTimeout(() => {
                setBattleMsg(null);
                setTurn('COMPUTER');
                setTimeout(computerTurn, 1000);
            }, 1500);
        } else {
            setPMisses(prev => prev + 1);
            setBattleMsg('YOU MISSED!');
            setTimeout(() => {
                setBattleMsg(null);
                setTurn('COMPUTER');
                setTimeout(computerTurn, 1000);
            }, 1000);
        }
    };

    const computerTurn = () => {
        if (gameState !== 'PLAY') return;

        let target = { x: Math.floor(Math.random() * 10), y: Math.floor(Math.random() * 10) };
        let safeGuard = 0;

        // Clone grid and planes to avoid direct mutation
        const gridClone = playerGrid.map(row => row.map(c => ({ ...c })));
        const planesClone = playerPlanes.map(p => ({ ...p, cells: [...p.cells] }));

        while (gridClone[target.y][target.x].state !== 'EMPTY' && safeGuard < 100) {
            target = { x: Math.floor(Math.random() * 10), y: Math.floor(Math.random() * 10) };
            safeGuard++;
        }

        const computerShotResult = Game.fireShot(gridClone, planesClone, target);

        setPlayerGrid(gridClone);
        setPlayerPlanes(planesClone);

        // Check Loss using the newly updated planes
        const allPlayerDestroyed = planesClone.every(p => p.isDestroyed);
        if (allPlayerDestroyed) {
            setWinner('COMPUTER');
            setComputerScore(3);
            setBattleMsg('DEFEAT!');
            setTimeout(() => {
                setGameState('GAME_OVER');
                setBattleMsg(null);
            }, 5000);
            return;
        }

        if (computerShotResult) {
            if (computerShotResult.result === 'HIT') {
                setCHits(prev => prev + 1);
                setBattleMsg('ENEMY HIT!');
                setTimeout(() => {
                    setBattleMsg(null);
                    setTurn('PLAYER');
                }, 1200);
            } else if (computerShotResult.result === 'KILL') {
                setCHits(prev => prev + 1);
                setBattleMsg('ENEMY DESTROYED!');
                setComputerScore(prev => prev + 1);
                setTimeout(() => {
                    setBattleMsg(null);
                    setTurn('PLAYER');
                }, 1500);
            } else {
                setCMisses(prev => prev + 1);
                setBattleMsg('ENEMY MISS!');
                setTimeout(() => {
                    setBattleMsg(null);
                    setTurn('PLAYER');
                }, 1000);
            }
            setTurn('PLAYER');
        }
    };

    return (
        <SafeAreaProvider>
            <SafeAreaView style={styles.container}>
                <StatusBar style="light" />

                {gameState !== 'LOGIN' && (
                    <View style={styles.topBar}>
                        <View style={styles.profileBadgeSmall}>
                            <View style={styles.avatarSmall} />
                            <View>
                                <Text style={styles.profileNameSmall}>{username.length > 20 ? `${username.slice(0, 4)}...${username.slice(-4)}` : username}</Text>
                                {balance !== null && <Text style={styles.balanceText}>{balance.toFixed(2)} SOL</Text>}
                            </View>
                        </View>
                    </View>
                )}

                {gameState === 'LOGIN' && (
                    <View style={styles.center}>
                        <Text style={styles.title}>AIR COMBAT</Text>
                        <Text style={styles.subtitle}>-= SOLANA BATTLES =-</Text>
                        <TouchableOpacity style={styles.button} onPress={handleLogin}>
                            <Text style={styles.buttonText}>Sign with Wallet!</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[styles.button, { backgroundColor: '#333', marginTop: 20 }]}
                            onPress={() => setGameState('LOBBY')}
                        >
                            <Text style={styles.buttonText}>PLAY AS GUEST</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {gameState === 'LOBBY' && (
                    <View style={styles.center}>
                        <View style={styles.profileBadge}>
                            <Text style={styles.pilotRank}>ADMIRAL</Text>
                            <Text
                                style={[styles.pilotName, { fontSize: username.length > 20 ? 16 : 24 }]}
                                numberOfLines={1}
                                adjustsFontSizeToFit
                            >
                                {username}
                            </Text>

                            <View style={styles.badgeLine} />

                            <View style={styles.miniStatsRow}>
                                <View style={styles.miniStat}>
                                    <Text style={styles.miniStatLabel}>BATTLES WON</Text>
                                    <Text style={styles.miniStatValue}>{playerWins}</Text>
                                </View>
                                <View style={styles.miniStat}>
                                    <Text style={styles.miniStatLabel}>PLANES DESTROYED</Text>
                                    <Text style={styles.miniStatValue}>{totalPlanesDestroyed}</Text>
                                </View>
                            </View>

                            <TouchableOpacity style={styles.editIconBtn} onPress={() => { setTempName(username); setIsEditingName(true); }}>
                                <Text style={styles.editIconText}>✎</Text>
                            </TouchableOpacity>
                        </View>

                        <TouchableOpacity style={styles.button} onPress={startGame}>
                            <View style={styles.btnContent}>
                                <Text style={styles.btnIcon}>✈️</Text>
                                <Text style={styles.buttonText}>START MISSION</Text>
                            </View>
                        </TouchableOpacity>

                        <TouchableOpacity style={[styles.button, { opacity: 0.5 }]} disabled>
                            <View style={styles.btnContent}>
                                <Text style={styles.btnIcon}>🌐</Text>
                                <Text style={styles.buttonText}>MULTIPLAYER (SOON)</Text>
                            </View>
                        </TouchableOpacity>

                        <TouchableOpacity style={[styles.button, { backgroundColor: '#1E1E2E' }]} onPress={() => setShowLeaderboard(true)}>
                            <View style={styles.btnContent}>
                                <Text style={styles.btnIcon}>📊</Text>
                                <Text style={styles.buttonText}>LEADERBOARD</Text>
                            </View>
                        </TouchableOpacity>
                    </View>
                )}

                {gameState === 'SETUP' && (
                    <View style={styles.gameContainer}>
                        <View style={{ alignItems: 'center', marginBottom: 20 }}>
                            <Text style={styles.header}>PLACE YOUR FLEET ({playerPlanes.length}/3)</Text>
                            <TouchableOpacity
                                style={[styles.undoButton, { marginTop: 10, opacity: playerPlanes.length > 0 ? 1 : 0.4 }]}
                                onPress={undoPlacement}
                                disabled={playerPlanes.length === 0 || isFlying}
                            >
                                <Text style={styles.undoText}>↩ UNDO LAST PLANE</Text>
                            </TouchableOpacity>
                        </View>
                        <View
                            ref={gridRef}
                            collapsable={false}
                            onLayout={updateGridPos}
                            style={{ padding: 2, backgroundColor: dragPreview ? '#1a1a2e' : 'transparent', borderRadius: 5 }}
                        >
                            <Grid
                                grid={playerGrid}
                                active={false}
                                onCellPress={() => { }}
                                showPlanes={true}
                                previewCells={dragPreview ? Game.getPlaneCells(dragPreview, setupOrientation) : undefined}
                                isValidPreview={dragPreview ? Game.isValidPlacement(playerPlanes, Game.getPlaneCells(dragPreview, setupOrientation)) : undefined}
                                cellSize={CELL_SIZE}
                            />
                        </View>

                        {playerPlanes.length < Game.PLANE_COUNT && !isFlying && (
                            <View style={styles.dock}>
                                <Text style={styles.dockText}>DRAG PLANE TO GRID</Text>
                                <View style={styles.dockPlaneRow}>
                                    <TouchableOpacity onPress={rotateLeft} style={styles.arrowButton}>
                                        <Text style={styles.arrowText}>◀</Text>
                                    </TouchableOpacity>

                                    <View {...panResponder.panHandlers} style={[styles.planePreviewContainer, { width: CELL_SIZE * 3, height: CELL_SIZE * 3 }]}>
                                        <PlaneVisual cellSize={CELL_SIZE * 0.5} orientation={setupOrientation} />
                                    </View>

                                    <TouchableOpacity onPress={rotateRight} style={styles.arrowButton}>
                                        <Text style={styles.arrowText}>▶</Text>
                                    </TouchableOpacity>
                                </View>
                                <Text style={styles.orientationText}>ORIENTATION: {setupOrientation}</Text>
                            </View>
                        )}
                        {(playerPlanes.length >= Game.PLANE_COUNT || isFlying) && (
                            <View style={[styles.dock, { opacity: 0.5 }]}>
                                <Text style={styles.dockText}>{isFlying ? "DEPLOYING..." : "FLEET READY!"}</Text>
                            </View>
                        )}
                    </View>
                )}

                {gameState === 'PLAY' && (
                    <ScrollView contentContainerStyle={styles.scrollContent}>
                        <View style={styles.section}>
                            <Text style={[styles.header, { fontSize: 16, color: '#f00' }]}>ENEMY SECTOR</Text>
                            <View>
                                <Grid
                                    grid={computerGrid}
                                    active={turn === 'PLAYER'}
                                    onCellPress={handleAttack}
                                    showPlanes={false}
                                    cellSize={CELL_SIZE}
                                />
                                {!!battleMsg && (battleMsg.startsWith('YOU') || battleMsg === 'VICTORY!') && (
                                    <View style={styles.overlay} pointerEvents="none">
                                        <View style={styles.msgBadge}>
                                            <Text style={styles.msgText}>{battleMsg}</Text>
                                        </View>
                                    </View>
                                )}
                            </View>
                        </View>

                        <View style={styles.scoreBoard}>
                            <Text style={styles.scoreLabel}>PLAYER </Text>
                            <Text style={styles.scoreValue}>{playerScore}</Text>
                            <Text style={styles.scoreVs}>  VS  </Text>
                            <Text style={styles.scoreValue}>{computerScore}</Text>
                            <Text style={styles.scoreLabel}> ENEMY</Text>
                        </View>

                        <View style={styles.section}>
                            <Text style={[styles.header, { fontSize: 16, color: '#0f0' }]}>YOUR FLEET</Text>
                            <View>
                                <Grid
                                    grid={playerGrid}
                                    active={false}
                                    onCellPress={() => { }}
                                    showPlanes={true}
                                    cellSize={CELL_SIZE}
                                />
                                {!!battleMsg && (battleMsg.startsWith('ENEMY') || battleMsg === 'DEFEAT!') && (
                                    <View style={styles.overlay} pointerEvents="none">
                                        <View style={styles.msgBadge}>
                                            <Text style={styles.msgText}>{battleMsg}</Text>
                                        </View>
                                    </View>
                                )}
                            </View>
                            <Animated.View style={[
                                styles.turnIndicator,
                                turn === 'PLAYER' && {
                                    backgroundColor: turnPulseAnim.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: ['rgba(0,0,0,0.8)', 'rgba(0, 255, 100, 0.4)']
                                    }),
                                    borderColor: turnPulseAnim.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: ['#fff', '#0f0']
                                    })
                                }
                            ]}>
                                <Text style={styles.turnText}>{turn === 'PLAYER' ? "YOUR TURN" : "ENEMY ATTACKING..."}</Text>
                            </Animated.View>
                        </View>
                    </ScrollView>
                )}

                {gameState === 'GAME_OVER' && (
                    <View style={styles.center}>
                        {!showRecap ? (
                            <View style={styles.center}>
                                <Text style={[styles.title, { fontSize: 40, color: winner === 'PLAYER' ? '#0f0' : '#f00' }]}>
                                    {winner === 'PLAYER' ? "VICTORY" : "DEFEAT"}
                                </Text>
                                <View style={{ height: 20 }} />
                                <TouchableOpacity style={styles.button} onPress={() => setGameState('LOBBY')}>
                                    <Text style={styles.buttonText}>RETURNING TO BASE</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.button, { backgroundColor: '#1E1E2E' }]}
                                    onPress={() => setShowRecap(true)}
                                >
                                    <View style={styles.btnContent}>
                                        <Text style={styles.btnIcon}>🗺️</Text>
                                        <Text style={styles.buttonText}>REVIEW BATTLEFIELD</Text>
                                    </View>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <ScrollView contentContainerStyle={styles.scrollContent}>
                                <View style={styles.section}>
                                    <Text style={[styles.header, { fontSize: 16, color: '#f00' }]}>ENEMY SECTOR (REVEALED)</Text>
                                    <Grid
                                        grid={computerGrid}
                                        active={false}
                                        onCellPress={() => { }}
                                        showPlanes={true}
                                        cellSize={CELL_SIZE}
                                    />
                                </View>


                                {/* Mission Stats Dashboard */}
                                <View style={styles.missionStatsContainer}>
                                    <View style={styles.missionStatsCol}>
                                        <Text style={styles.statsColTitle}>PILOT (YOU)</Text>
                                        <View style={styles.missionStatRow}>
                                            <Text style={styles.missionStatLabel}>TOTAL HITS</Text>
                                            <Text style={[styles.missionStatValue, { color: '#0f0' }]}>{pHits}</Text>
                                        </View>
                                        <View style={styles.missionStatRow}>
                                            <Text style={styles.missionStatLabel}>TOTAL MISSES</Text>
                                            <Text style={[styles.missionStatValue, { color: '#f00' }]}>{pMisses}</Text>
                                        </View>
                                        <View style={styles.missionStatRow}>
                                            <Text style={styles.missionStatLabel}>PLANES KILLED</Text>
                                            <Text style={styles.missionStatValue}>{playerScore}</Text>
                                        </View>
                                    </View>

                                    <View style={styles.missionStatsDivider} />

                                    <View style={styles.missionStatsCol}>
                                        <Text style={styles.statsColTitle}>ENEMY AI</Text>
                                        <View style={styles.missionStatRow}>
                                            <Text style={styles.missionStatLabel}>TOTAL HITS</Text>
                                            <Text style={[styles.missionStatValue, { color: '#0f0' }]}>{cHits}</Text>
                                        </View>
                                        <View style={styles.missionStatRow}>
                                            <Text style={styles.missionStatLabel}>TOTAL MISSES</Text>
                                            <Text style={[styles.missionStatValue, { color: '#f00' }]}>{cMisses}</Text>
                                        </View>
                                        <View style={styles.missionStatRow}>
                                            <Text style={styles.missionStatLabel}>PLANES KILLED</Text>
                                            <Text style={styles.missionStatValue}>{computerScore}</Text>
                                        </View>
                                    </View>
                                </View>

                                <View style={styles.section}>
                                    <Text style={[styles.header, { fontSize: 16, color: '#0f0' }]}>YOUR FLEET</Text>
                                    <Grid
                                        grid={playerGrid}
                                        active={false}
                                        onCellPress={() => { }}
                                        showPlanes={true}
                                        cellSize={CELL_SIZE}
                                    />
                                </View>

                                <TouchableOpacity
                                    style={[styles.button, { alignSelf: 'center', marginTop: 20 }]}
                                    onPress={() => setShowRecap(false)}
                                >
                                    <Text style={styles.buttonText}>BACK TO SUMMARY</Text>
                                </TouchableOpacity>
                                <View style={{ height: 40 }} />
                            </ScrollView>
                        )}
                    </View>
                )}

                {(dragPos || isFlying) && (
                    <View style={StyleSheet.absoluteFill} pointerEvents="none">
                        {dragPos && (
                            <View
                                style={[
                                    styles.dragFollower,
                                    {
                                        left: dragPos.x - getOffsets(setupOrientation, CELL_SIZE).x,
                                        top: dragPos.y - getOffsets(setupOrientation, CELL_SIZE).y
                                    }
                                ]}
                            >
                                <PlaneVisual cellSize={CELL_SIZE} orientation={setupOrientation} opacity={0.7} />
                            </View>
                        )}

                        {isFlying && (
                            <Animated.View
                                style={[
                                    styles.dragFollower,
                                    {
                                        left: Animated.subtract(flyAnim.x, getOffsets(flyOrientation, CELL_SIZE).x),
                                        top: Animated.subtract(flyAnim.y, getOffsets(flyOrientation, CELL_SIZE).y),
                                    }
                                ]}
                            >
                                <PlaneVisual cellSize={CELL_SIZE} orientation={flyOrientation} />
                            </Animated.View>
                        )}
                    </View>
                )}

                {/* Name Editor Modal */}
                <Modal visible={isEditingName} transparent animationType="fade">
                    <View style={styles.modalBg}>
                        <View style={styles.modalContent}>
                            <Text style={styles.modalTitle}>IDENTIFICATION</Text>
                            <TextInput
                                style={styles.nameInput}
                                value={tempName}
                                onChangeText={setTempName}
                                placeholder="ENTER CALLSIGN"
                                placeholderTextColor="#555"
                                autoFocus
                                maxLength={15}
                            />
                            <View style={styles.modalButtons}>
                                <TouchableOpacity
                                    style={[styles.smallButton, { backgroundColor: '#333' }]}
                                    onPress={() => setIsEditingName(false)}
                                >
                                    <Text style={styles.smallButtonText}>CANCEL</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[styles.smallButton, { backgroundColor: '#6C5CE7' }]}
                                    onPress={() => {
                                        const newName = tempName || username;
                                        setUsername(newName);
                                        submitScore(newName, playerWins, totalPlanesDestroyed);
                                        setIsEditingName(false);
                                    }}
                                >
                                    <Text style={styles.smallButtonText}>SAVE</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </View>
                </Modal>

                {/* Leaderboard Modal */}
                <Modal visible={showLeaderboard} transparent animationType="slide">
                    <View style={styles.modalBg}>
                        <View style={[styles.modalContent, { height: '60%', width: '90%' }]}>
                            <Text style={styles.modalTitle}>LEADERBOARD</Text>
                            <ScrollView style={{ width: '100%' }}>
                                {leaderboard.map((ace, i) => (
                                    <View key={i} style={[styles.leaderRow, ace.username === username && styles.leaderRowLive]}>
                                        <View style={styles.rankContainer}>
                                            {i === 0 ? <Text style={styles.medal}>🥇</Text> :
                                                i === 1 ? <Text style={styles.medal}>🥈</Text> :
                                                    i === 2 ? <Text style={styles.medal}>🥉</Text> :
                                                        <Text style={styles.leaderRank}>#{i + 1}</Text>}
                                        </View>
                                        <Text style={[styles.leaderName, ace.username === username && { color: '#6C5CE7' }]}>{ace.username}</Text>
                                        <View style={styles.leaderStats}>
                                            <View style={styles.statBox}>
                                                <Text style={styles.statValueMini}>{ace.wins}</Text>
                                                <Text style={styles.statLabelMini}>WINS</Text>
                                            </View>
                                            <View style={styles.statBox}>
                                                <Text style={[styles.statValueMini, { color: '#0f0' }]}>{ace.kills}</Text>
                                                <Text style={styles.statLabelMini}>KILLS</Text>
                                            </View>
                                        </View>
                                    </View>
                                ))}
                                {leaderboard.length === 0 && (
                                    <View style={{ marginTop: 40, alignItems: 'center' }}>
                                        <Text style={{ color: '#555', textAlign: 'center' }}>
                                            {serverStatus === 'LOADING' ? 'CONNECTING TO BASE...' :
                                                serverStatus === 'ERROR' ? 'COMMUNICATION ERROR' : 'NO DATA RECORDED'}
                                        </Text>
                                        {(serverStatus === 'ERROR' || serverStatus === 'IDLE') && (
                                            <TouchableOpacity
                                                style={[styles.smallButton, { marginTop: 20, borderColor: '#6C5CE7' }]}
                                                onPress={fetchLeaderboard}
                                            >
                                                <Text style={styles.smallButtonText}>RETRY CONNECTION</Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                )}
                            </ScrollView>
                            <TouchableOpacity
                                style={[styles.button, { width: '100%', marginTop: 20 }]}
                                onPress={() => setShowLeaderboard(false)}
                            >
                                <Text style={styles.buttonText}>CLOSE</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Modal>
            </SafeAreaView>
        </SafeAreaProvider>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: BG_COLOR,
    },
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    gameContainer: {
        flex: 1,
        alignItems: 'center',
        paddingTop: 50,
    },
    scrollContent: {
        paddingVertical: 20,
        alignItems: 'center',
    },
    title: {
        fontSize: 48,
        fontWeight: '900',
        color: '#fff',
        letterSpacing: 4,
        marginBottom: 10,
    },
    subtitle: {
        fontSize: 18,
        color: '#aaa',
        marginBottom: 50,
        letterSpacing: 2,
    },
    header: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 10,
        letterSpacing: 1,
    },
    button: {
        backgroundColor: '#6C5CE7',
        width: 280,
        paddingVertical: 15,
        borderRadius: 8,
        marginVertical: 10,
        borderWidth: 1,
        borderColor: '#A29BFE',
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: '#6C5CE7',
        shadowOpacity: 0.5,
        shadowRadius: 10,
        elevation: 5,
    },
    buttonText: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 16,
        letterSpacing: 1,
    },
    btnContent: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingLeft: 30,
        gap: 15,
    },
    btnIcon: {
        fontSize: 18,
    },
    section: {
        alignItems: 'center',
        marginBottom: 20,
    },
    divider: {
        height: 1,
        width: '80%',
        backgroundColor: '#333',
        marginVertical: 20,
    },
    controls: {
        marginTop: 20,
        flexDirection: 'row',
    },
    smallButton: {
        backgroundColor: '#333',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 5,
        borderWidth: 1,
        borderColor: '#555',
    },
    smallButtonText: {
        color: '#fff',
        fontWeight: 'bold',
    },
    turnIndicator: {
        marginTop: 15,
        backgroundColor: 'rgba(0,0,0,0.8)',
        paddingHorizontal: 24,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#fff',
        alignSelf: 'center',
    },
    turnText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: 'bold',
    },
    undoButton: {
        backgroundColor: '#333',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 15,
        borderWidth: 1,
        borderColor: '#6C5CE7',
    },
    undoText: {
        color: '#6C5CE7',
        fontSize: 12,
        fontWeight: 'bold',
    },
    dock: {
        marginTop: 40,
        backgroundColor: '#1E1E2E',
        width: '90%',
        padding: 20,
        borderRadius: 15,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#333',
    },
    dockText: {
        color: '#aaa',
        fontSize: 12,
        fontWeight: 'bold',
        marginBottom: 10,
    },
    dockPlaneRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    arrowButton: {
        backgroundColor: '#333',
        width: 50,
        height: 50,
        borderRadius: 25,
        justifyContent: 'center',
        alignItems: 'center',
        marginHorizontal: 20,
    },
    arrowText: {
        color: '#fff',
        fontSize: 24,
    },
    planePreviewContainer: {
        width: 100,
        height: 100,
        backgroundColor: '#0F0F1A',
        borderRadius: 10,
        borderWidth: 2,
        borderColor: '#6C5CE7',
        justifyContent: 'center',
        alignItems: 'center',
    },
    orientationText: {
        color: '#6C5CE7',
        fontSize: 14,
        fontWeight: 'bold',
        marginTop: 10,
    },
    dragFollower: {
        position: 'absolute',
        pointerEvents: 'none',
        zIndex: 1000,
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 100,
    },
    msgBadge: {
        backgroundColor: 'rgba(0,0,0,0.8)',
        paddingHorizontal: 20,
        paddingVertical: 10,
        borderRadius: 20,
        borderWidth: 1.5,
        borderColor: '#0f0',
    },
    msgText: {
        color: '#0f0',
        fontSize: 24,
        fontWeight: '900',
        textShadowColor: 'rgba(0, 255, 0, 0.5)',
        textShadowRadius: 8,
    },
    scoreBoard: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        marginVertical: 10,
        backgroundColor: '#1E1E2E',
        borderRadius: 30,
        paddingHorizontal: 20,
        paddingVertical: 5,
        borderWidth: 1,
        borderColor: '#333',
    },
    scoreLabel: {
        color: '#aaa',
        fontSize: 12,
        fontWeight: 'bold',
    },
    scoreValue: {
        color: '#fff',
        fontSize: 20,
        fontWeight: '900',
    },
    scoreVs: {
        color: '#6C5CE7',
        fontSize: 14,
        fontWeight: '900',
    },
    // Lobby Styles
    profileBadge: {
        alignItems: 'center',
        marginBottom: 30,
        backgroundColor: '#1E1E2E',
        padding: 20,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#6C5CE7',
        width: '80%',
    },
    pilotRank: {
        color: '#6C5CE7',
        fontSize: 12,
        fontWeight: '900',
        letterSpacing: 2,
    },
    pilotName: {
        color: '#fff',
        fontSize: 28,
        fontWeight: 'bold',
        marginTop: 5,
    },
    badgeLine: {
        height: 1,
        width: '100%',
        backgroundColor: 'rgba(108, 92, 231, 0.3)',
        marginVertical: 15,
    },
    miniStatsRow: {
        flexDirection: 'row',
        width: '100%',
        justifyContent: 'space-around',
    },
    miniStat: {
        alignItems: 'center',
    },
    miniStatLabel: {
        color: '#aaa',
        fontSize: 10,
        fontWeight: 'bold',
        letterSpacing: 1,
    },
    miniStatValue: {
        color: '#0f0',
        fontSize: 18,
        fontWeight: '900',
        marginTop: 2,
    },
    editIconBtn: {
        position: 'absolute',
        top: 10,
        right: 15,
        padding: 5,
    },
    editIconText: {
        color: '#6C5CE7',
        fontSize: 20,
    },
    statRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 40,
    },
    statLabel: {
        color: '#aaa',
        fontSize: 14,
        fontWeight: 'bold',
    },
    statValue: {
        color: '#0f0',
        fontSize: 18,
        fontWeight: '900',
    },
    // Modal & Leaderboard Styles
    modalBg: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.85)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        backgroundColor: '#161625',
        width: '80%',
        padding: 30,
        borderRadius: 20,
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#333',
    },
    modalTitle: {
        color: '#fff',
        fontSize: 20,
        fontWeight: '900',
        letterSpacing: 2,
        marginBottom: 20,
    },
    nameInput: {
        width: '100%',
        backgroundColor: '#050510',
        color: '#fff',
        padding: 15,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: '#6C5CE7',
        fontSize: 18,
        textAlign: 'center',
        marginBottom: 20,
    },
    modalButtons: {
        flexDirection: 'row',
        gap: 10,
    },
    leaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#222',
        width: '100%',
    },
    leaderRowLive: {
        backgroundColor: 'rgba(108, 92, 231, 0.2)',
        borderRadius: 10,
        borderBottomWidth: 0,
    },
    leaderRank: {
        color: '#6C5CE7',
        fontSize: 12,
        fontWeight: '900',
    },
    rankContainer: {
        width: 35,
        alignItems: 'center',
    },
    medal: {
        fontSize: 18,
    },
    leaderName: {
        flex: 1,
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 14,
    },
    leaderStats: {
        flexDirection: 'row',
        gap: 15,
        alignItems: 'center',
    },
    statBox: {
        alignItems: 'center',
        minWidth: 35,
    },
    statValueMini: {
        color: '#fff',
        fontWeight: '900',
        fontSize: 14,
    },
    statLabelMini: {
        color: '#555',
        fontSize: 8,
        fontWeight: 'bold',
    },
    missionStatsContainer: {
        flexDirection: 'row',
        backgroundColor: '#161625',
        width: '90%',
        marginHorizontal: '5%',
        padding: 15,
        borderRadius: 15,
        borderWidth: 1,
        borderColor: '#333',
        marginBottom: 20,
    },
    missionStatsCol: {
        flex: 1,
    },
    missionStatsDivider: {
        width: 1,
        backgroundColor: '#333',
        marginHorizontal: 15,
    },
    statsColTitle: {
        color: '#6C5CE7',
        fontSize: 10,
        fontWeight: '900',
        marginBottom: 10,
        textAlign: 'center',
    },
    missionStatRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 5,
    },
    missionStatLabel: {
        color: '#aaa',
        fontSize: 9,
        fontWeight: 'bold',
    },
    missionStatValue: {
        color: '#fff',
        fontSize: 10,
        fontWeight: '900',
    },
    topBar: {
        position: 'absolute',
        top: 20,
        left: 20,
        zIndex: 100,
    },
    profileBadgeSmall: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(20, 20, 35, 0.9)',
        padding: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#6C5CE7',
    },
    avatarSmall: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#6C5CE7',
        marginRight: 10,
        borderWidth: 1,
        borderColor: '#fff',
    },
    profileNameSmall: {
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 12,
        marginBottom: 2,
    },
    balanceText: {
        color: '#00ffaa',
        fontSize: 10,
        fontWeight: 'bold',
        letterSpacing: 1,
    }
});

/**
 * Helper to calculate where the finger should be relative to the head of the plane
 * so that when you drag, the head of the plane is under your finger.
 */
function getOffsets(orientation: 'N' | 'S' | 'E' | 'W', cellSize: number) {
    switch (orientation) {
        case 'N': return { x: 2.5 * cellSize, y: 0.5 * cellSize };
        case 'E': return { x: 3.5 * cellSize, y: 2.5 * cellSize };
        case 'S': return { x: 2.5 * cellSize, y: 3.5 * cellSize };
        case 'W': return { x: 0.5 * cellSize, y: 2.5 * cellSize };
    }
}
