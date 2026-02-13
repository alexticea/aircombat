
export type Coordinate = { x: number; y: number };
export type CellState = 'EMPTY' | 'MISS' | 'HIT' | 'DEAD_HEAD' | 'DEAD_BODY';

export interface GridCell {
    state: CellState;
    planeId?: number; // references a plane if occupied
}

export interface Plane {
    id: number;
    head: Coordinate;
    orientation: 'N' | 'S' | 'E' | 'W';
    isDestroyed: boolean; // True if head is hit
    cells: Coordinate[]; // Calculated cells occupied by this plane
}

export const BOARD_SIZE = 10;
export const PLANE_COUNT = 3;

// Plane Shape Definition based on Head at (0,0) and Orientation N
// Shape:
//   H (0,0)
// W W W (-1,1), (0,1), (1,1)
//   B   (0,2)
// T T T (-1,3), (0,3), (1,3)
const BASE_SHAPE_N = [
    { x: 0, y: 0, type: 'head' },
    { x: -2, y: 1, type: 'wing' }, { x: -1, y: 1, type: 'wing' }, { x: 0, y: 1, type: 'wing' }, { x: 1, y: 1, type: 'wing' }, { x: 2, y: 1, type: 'wing' },
    { x: 0, y: 2, type: 'body' },
    { x: -1, y: 3, type: 'tail' }, { x: 0, y: 3, type: 'tail' }, { x: 1, y: 3, type: 'tail' },
];

export function getPlaneCells(head: Coordinate, orientation: 'N' | 'S' | 'E' | 'W'): Coordinate[] {
    // Simple rotation logic
    // N: (x, y)
    // E: (y, -x) ? No, standard rotation.
    // Rotations around (0,0) for the relative offsets

    const cells: Coordinate[] = [];

    for (const part of BASE_SHAPE_N) {
        let dx = part.x;
        let dy = part.y;

        // Rotate relative coords
        if (orientation === 'E') { [dx, dy] = [-dy, dx]; }
        else if (orientation === 'S') { [dx, dy] = [-dx, -dy]; }
        else if (orientation === 'W') { [dx, dy] = [dy, -dx]; }

        cells.push({ x: head.x + dx, y: head.y + dy });
    }
    return cells;
}

export function isValidPlacement(planes: Plane[], newPlaneCells: Coordinate[]): boolean {
    // Check bounds
    for (const cell of newPlaneCells) {
        if (cell.x < 0 || cell.x >= BOARD_SIZE || cell.y < 0 || cell.y >= BOARD_SIZE) return false;
    }

    // Check overlap
    for (const existingPlane of planes) {
        for (const existingCell of existingPlane.cells) {
            for (const newCell of newPlaneCells) {
                if (existingCell.x === newCell.x && existingCell.y === newCell.y) return false;
            }
        }
    }

    return true;
}

export function generateRandomBoard(): Plane[] {
    const planes: Plane[] = [];
    let attempts = 0;

    while (planes.length < PLANE_COUNT && attempts < 1000) {
        attempts++;
        const x = Math.floor(Math.random() * BOARD_SIZE);
        const y = Math.floor(Math.random() * BOARD_SIZE);
        const orientations: ('N' | 'S' | 'E' | 'W')[] = ['N', 'S', 'E', 'W'];
        const orientation = orientations[Math.floor(Math.random() * orientations.length)];

        const cells = getPlaneCells({ x, y }, orientation);

        if (isValidPlacement(planes, cells)) {
            planes.push({
                id: planes.length,
                head: { x, y },
                orientation,
                isDestroyed: false,
                cells
            });
        }
    }

    if (planes.length < PLANE_COUNT) {
        // Retry if failed (naive backtracking via recursion or just retry loop)
        return generateRandomBoard();
    }
    return planes;
}

export function fireShot(grid: GridCell[][], planes: Plane[], target: Coordinate): { result: 'HIT' | 'MISS' | 'KILL'; plane?: Plane } {
    const cell = grid[target.y][target.x];

    // Ensure we don't shoot twice at same spot (UI should prevent, but good to check)
    if (cell.state !== 'EMPTY') return { result: 'MISS' }; // Already shot

    // Check if hit any plane
    for (const plane of planes) {

        // Check Head
        if (plane.head.x === target.x && plane.head.y === target.y) {
            plane.isDestroyed = true;
            // Mark only already hit cells of this plane as dead/destroyed
            plane.cells.forEach(c => {
                if (grid[c.y] && grid[c.y][c.x] && grid[c.y][c.x].state === 'HIT') {
                    grid[c.y][c.x].state = 'DEAD_BODY';
                }
            });
            grid[target.y][target.x].state = 'DEAD_HEAD';
            return { result: 'KILL', plane };
        }

        // Check Body
        for (const pCell of plane.cells) {
            if (pCell.x === target.x && pCell.y === target.y) {
                grid[target.y][target.x].state = 'HIT';
                return { result: 'HIT', plane };
            }
        }
    }

    grid[target.y][target.x].state = 'MISS';
    return { result: 'MISS' };
}

export function createEmptyGrid(): GridCell[][] {
    return Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(null).map(() => ({ state: 'EMPTY' })));
}
