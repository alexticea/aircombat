import React from 'react';
import { View, StyleSheet } from 'react-native';

interface PlaneVisualProps {
    cellSize: number;
    orientation: 'N' | 'S' | 'E' | 'W';
    color?: string;
    opacity?: number;
}

export const PlaneVisual: React.FC<PlaneVisualProps> = ({ cellSize, orientation, color = '#0f0', opacity = 1 }) => {
    // The plane spans 3x4 cells in North orientation
    // Head at (0,0), wings at (-1,1), (0,1), (1,1), body (0,2), tail (-1,3), (0,3), (1,3)

    // We render inside a box that contains the plane
    // For N: Width 3 * cellSize, Height 4 * cellSize

    const isVertical = orientation === 'N' || orientation === 'S';
    const width = (isVertical ? 5 : 4) * cellSize;
    const height = (isVertical ? 4 : 5) * cellSize;

    const parts = [
        { x: 0, y: 0, type: 'head' },
        { x: -2, y: 1 }, { x: -1, y: 1 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 },
        { x: 0, y: 2 },
        { x: -1, y: 3 }, { x: 0, y: 3 }, { x: 1, y: 3 },
    ];

    const getPartPos = (p: { x: number, y: number }) => {
        let dx = p.x;
        let dy = p.y;

        // Rotate relative to head (0,0)
        if (orientation === 'E') { [dx, dy] = [-dy, dx]; }
        else if (orientation === 'S') { [dx, dy] = [-dx, -dy]; }
        else if (orientation === 'W') { [dx, dy] = [dy, -dx]; }

        const offsets = {
            'N': { x: -2, y: 0 },
            'E': { x: -3, y: -2 },
            'S': { x: -2, y: -3 },
            'W': { x: 0, y: -2 },
        };

        const off = offsets[orientation];
        return {
            left: (dx - off.x) * cellSize,
            top: (dy - off.y) * cellSize,
        };
    };

    return (
        <View style={{ width, height, opacity }}>
            {parts.map((p, i) => (
                <View
                    key={i}
                    style={[
                        styles.part,
                        {
                            width: cellSize - 2,
                            height: cellSize - 2,
                            backgroundColor: color,
                            ...getPartPos(p)
                        }
                    ]}
                />
            ))}
        </View>
    );
};

const styles = StyleSheet.create({
    part: {
        position: 'absolute',
        borderRadius: 2,
    }
});
