#pragma once
#include <cstdint>
#include <string>
#include <vector>
#include <unordered_map>

/**
 * SpatialGrid — Fixed-cell spatial hash for fast proximity queries.
 *
 * Replaces O(n²) head-to-body collision detection with O(n × k) average case,
 * where k is the number of segments in the local neighborhood (typically ~20).
 *
 * Usage per tick:
 *   1. grid.clear()
 *   2. For each snake, for each segment: grid.insert(x, y, snakeId, segIndex)
 *   3. For each snake head: grid.queryRadius(headX, headY, radius) → nearby segs
 */

struct SegmentRef {
    std::string snakeId;
    int         segmentIndex;
};

class SpatialGrid {
public:
    explicit SpatialGrid(float cellSize = 120.0f);

    /** Remove all entries from the grid (call at start of each tick). */
    void clear();

    /** Register a segment at world position (x, y). */
    void insert(float x, float y, const std::string& snakeId, int segmentIndex);

    /**
     * Return all segment refs within the square neighbourhood of radius
     * around (cx, cy). May include refs slightly outside the circle — callers
     * should do a precise distance check on the results.
     */
    std::vector<SegmentRef> queryRadius(float cx, float cy, float radius) const;

private:
    float cellSize;

    /** Encode (col, row) pair as a single 64-bit key. */
    inline int64_t cellKey(int col, int row) const {
        return (static_cast<int64_t>(col) << 32) | static_cast<int64_t>(static_cast<uint32_t>(row));
    }

    inline int toCol(float x) const { return static_cast<int>(x / cellSize); }
    inline int toRow(float y) const { return static_cast<int>(y / cellSize); }

    std::unordered_map<int64_t, std::vector<SegmentRef>> cells;
};
