import React from 'react';
import { View, TouchableOpacity, StyleSheet, Dimensions, Text } from 'react-native';
import { BOARD_SIZE, GridCell, Coordinate } from '../GameLogic';

const { width } = Dimensions.get('window');
const DEFAULT_CELL_SIZE = ((width - 40) / BOARD_SIZE) * 0.76;

interface GridProps {
    grid: GridCell[][];
    onCellPress: (x: number, y: number) => void;
    active: boolean;
    showPlanes?: boolean;
    previewCells?: Coordinate[];
    isValidPreview?: boolean;
    cellSize?: number;
}

const GridCellComponent = ({ cell, x, y, onPress, active, showPlanes, previewColor, cellSize = DEFAULT_CELL_SIZE }: any) => {
    // Replaced Animated with plain View for maximum compatibility on experimental devices
    const isGhost = !!previewColor;
    const underlyingColor = getCellColor(cell, showPlanes);
    const borderColor = isGhost ? '#FFFFFF' : '#333';
    const borderWidth = isGhost ? 1 : 0.5; // Thin white line for ghost
    const scale = cell.state !== 'EMPTY' || isGhost ? 1.05 : 1;

    // Ghost tint for validity feedback (very transparent so underlying planes show)
    const ghostTint = isGhost ? (previewColor + '33') : 'transparent'; // '33' is approx 20% opacity

    return (
        <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => active && onPress(x, y)}
            style={[styles.cellWrapper, { width: cellSize, height: cellSize, borderColor, borderWidth }]}
        >
            <View style={[styles.cell, { backgroundColor: underlyingColor, transform: [{ scale }] }]}>
                {isGhost && <View style={[StyleSheet.absoluteFill, { backgroundColor: ghostTint }]} />}
                {cell.state === 'DEAD_HEAD' && <Text style={[styles.skullText, { fontSize: cellSize * 0.6 }]}>💀</Text>}
                {cell.state === 'DEAD_BODY' && <Text style={[styles.skullText, { fontSize: cellSize * 0.6 }]}>💥</Text>}
                {cell.state === 'HIT' && <Text style={[styles.skullText, { fontSize: cellSize * 0.6 }]}>💥</Text>}
                {cell.state === 'MISS' && <Text style={[styles.missText, { fontSize: cellSize * 0.7 }]}>✕</Text>}
            </View>
        </TouchableOpacity>
    );
};

function getCellColor(cell: GridCell, showPlanes?: boolean) {
    if (cell.state === 'DEAD_HEAD') return '#FF6347'; // Tomato - Same as Hit
    if (cell.state === 'DEAD_BODY') return '#FF6347'; // Tomato - Same as Hit
    if (cell.state === 'HIT') return '#FF6347'; // Tomato - Plane Body Hit
    if (cell.state === 'MISS') return '#1A1A2E'; // Same as background

    // Show placed planes
    if (showPlanes && cell.planeId !== undefined) return '#90EE90'; // Light Green - Plane

    return '#1A1A2E'; // Dark Background
}

export const Grid: React.FC<GridProps> = ({ grid, onCellPress, active, showPlanes, previewCells, isValidPreview, cellSize }) => {
    const letters = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
    const numbers = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

    return (
        <View style={styles.gridContainer}>
            {/* Top Letters Row */}
            <View style={styles.topLabelRow}>
                <View style={[styles.labelCell, { width: 25 }]} />
                {letters.map(letter => (<View key={letter} style={[styles.labelCell, { width: cellSize || DEFAULT_CELL_SIZE }]}><Text style={styles.labelText}>{letter}</Text></View>))}
            </View>

            <View style={styles.bodyWithSideLabels}>
                {/* Left Numbers Column */}
                <View style={styles.sideLabelColumn}>
                    {numbers.map(num => (<View key={num} style={[styles.labelCell, { height: cellSize || DEFAULT_CELL_SIZE, width: 25 }]}><Text style={styles.labelText}>{num}</Text></View>))}
                </View>

                {/* The Board */}
                <View style={styles.grid}>
                    {grid.map((row, y) => (
                        <View key={y} style={styles.row}>
                            {row.map((cell, x) => {
                                let previewColor = undefined;
                                if (previewCells) {
                                    const isPreview = previewCells.some(c => c.x === x && c.y === y);
                                    if (isPreview) {
                                        previewColor = isValidPreview ? '#00FF00' : '#FF0000';
                                    }
                                }
                                return (
                                    <GridCellComponent
                                        key={`${x}-${y}`}
                                        cell={cell}
                                        x={x}
                                        y={y}
                                        onPress={onCellPress}
                                        active={active}
                                        showPlanes={showPlanes}
                                        previewColor={previewColor}
                                        cellSize={cellSize}
                                    />
                                );
                            })}
                        </View>
                    ))}
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    gridContainer: {
        alignItems: 'flex-start',
    },
    topLabelRow: {
        flexDirection: 'row',
        height: 20,
    },
    bodyWithSideLabels: {
        flexDirection: 'row',
    },
    sideLabelColumn: {
        marginRight: 2,
        width: 25,
    },
    labelCell: {
        justifyContent: 'center',
        alignItems: 'center',
    },
    labelText: {
        color: '#FFFFFF',
        fontSize: 10,
        fontWeight: 'bold',
    },
    grid: {
        borderWidth: 1,
        borderColor: '#333',
        backgroundColor: '#0F0F1A',
    },
    row: {
        flexDirection: 'row',
    },
    cellWrapper: {
        borderWidth: 0.5,
        borderColor: '#333',
        justifyContent: 'center',
        alignItems: 'center',
    },
    cell: {
        width: '90%',
        height: '90%',
        borderRadius: 2,
        justifyContent: 'center',
        alignItems: 'center',
    },
    hitMarker: {
        width: '50%',
        height: '50%',
        backgroundColor: 'white',
        borderRadius: 10,
    },
    skullText: {
        textAlign: 'center',
    },
    missText: {
        color: '#90EE90',
        fontWeight: 'bold',
        textAlign: 'center',
    }
});
