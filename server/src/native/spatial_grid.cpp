#include "spatial_grid.h"
#include <cmath>
#include <algorithm>

SpatialGrid::SpatialGrid(float cellSize) : cellSize(cellSize) {
    // Reserve enough buckets for a 4000×4000 world with 120-unit cells
    // = ~34×34 = ~1156 cells. Reserve more for load factor headroom.
    cells.reserve(2048);
}

void SpatialGrid::clear() {
    // Clear vectors but retain allocated bucket memory for reuse
    for (auto& pair : cells) {
        pair.second.clear();
    }
}

void SpatialGrid::insert(float x, float y, const std::string& snakeId, int segmentIndex) {
    int64_t key = cellKey(toCol(x), toRow(y));
    cells[key].push_back({ snakeId, segmentIndex });
}

std::vector<SegmentRef> SpatialGrid::queryRadius(float cx, float cy, float radius) const {
    std::vector<SegmentRef> results;

    // Compute the range of cells that overlap the bounding square [cx±radius, cy±radius]
    int minCol = toCol(cx - radius);
    int maxCol = toCol(cx + radius);
    int minRow = toRow(cy - radius);
    int maxRow = toRow(cy + radius);

    for (int col = minCol; col <= maxCol; ++col) {
        for (int row = minRow; row <= maxRow; ++row) {
            auto it = cells.find(cellKey(col, row));
            if (it != cells.end()) {
                for (const SegmentRef& ref : it->second) {
                    results.push_back(ref);
                }
            }
        }
    }

    return results;
}
