#include "food.h"
#include "snake.h"

#ifndef M_PI
#define M_PI 3.14159265358979323846f
#endif

const std::vector<std::string> FoodManager::COLORS = {
    "#00f0ff", // cyan
    "#ff007f", // hot pink
    "#39ff14", // neon green
    "#ffbf00", // amber/orange
    "#bd00ff", // purple
    "#ffffff"  // white
};

FoodManager::FoodManager(float mapSize)
    : nextId(1), mapSize(mapSize), cellSize(200.0f) {
    numCols = static_cast<int>(ceilf(mapSize / cellSize));
    numRows = static_cast<int>(ceilf(mapSize / cellSize));
    grid.resize(numCols, std::vector<std::unordered_set<int>>(numRows));
}

void FoodManager::getCellCoords(float x, float y, int& col, int& row) const {
    col = static_cast<int>(floorf(std::max(0.0f, std::min(mapSize - 1.0f, x)) / cellSize));
    row = static_cast<int>(floorf(std::max(0.0f, std::min(mapSize - 1.0f, y)) / cellSize));
    col = std::max(0, std::min(numCols - 1, col));
    row = std::max(0, std::min(numRows - 1, row));
}

void FoodManager::addFood(float x, float y, float mass, const std::string& color) {
    int id = nextId++;
    std::string finalColor = color;
    if (finalColor.empty()) {
        finalColor = COLORS[rand() % COLORS.size()];
    }

    FoodItem food = { id, x, y, mass, finalColor };
    foodMap[id] = food;

    int col, row;
    getCellCoords(x, y, col, row);
    grid[col][row].insert(id);
}

void FoodManager::removeFood(int id) {
    auto it = foodMap.find(id);
    if (it == foodMap.end()) return;

    int col, row;
    getCellCoords(it->second.x, it->second.y, col, row);
    grid[col][row].erase(id);
    foodMap.erase(it);
}

void FoodManager::getRandomCircularCoords(float& x, float& y) const {
    float r = sqrtf(static_cast<float>(rand()) / RAND_MAX) * (mapSize / 2.0f);
    float theta = (static_cast<float>(rand()) / RAND_MAX) * 2.0f * M_PI;
    x = (mapSize / 2.0f) + r * cosf(theta);
    y = (mapSize / 2.0f) + r * sinf(theta);
}

void FoodManager::getRandomCircularCoordsWithDensityCheck(float& x, float& y) const {
    float bestX = 0.0f;
    float bestY = 0.0f;
    int minDensity = 999999;

    for (int i = 0; i < 5; i++) {
        float cx, cy;
        getRandomCircularCoords(cx, cy);
        int col, row;
        getCellCoords(cx, cy, col, row);
        int density = static_cast<int>(grid[col][row].size());
        if (density < minDensity) {
            minDensity = density;
            bestX = cx;
            bestY = cy;
        }
    }
    x = bestX;
    y = bestY;
}

void FoodManager::spawnInitialFood(int targetCount) {
    for (int i = 0; i < targetCount; i++) {
        float x, y;
        getRandomCircularCoordsWithDensityCheck(x, y);
        
        float randVal = static_cast<float>(rand()) / RAND_MAX;
        float mass = 1.0f;
        if (randVal < 0.80f) {
            mass = 1.0f + (rand() % 2); // 1 to 2
        } else if (randVal < 0.95f) {
            mass = 4.0f + (rand() % 3); // 4 to 6
        } else {
            mass = 10.0f + (rand() % 5); // 10 to 14
        }
        addFood(x, y, mass);
    }
}

void FoodManager::maintainDensity(int targetCount) {
    int deficit = targetCount - static_cast<int>(foodMap.size());
    if (deficit > 0) {
        spawnInitialFood(deficit);
    }
}

void FoodManager::updateFoodGridPosition(int id, float oldX, float oldY, float newX, float newY) {
    int oldCol, oldRow;
    int newCol, newRow;
    getCellCoords(oldX, oldY, oldCol, oldRow);
    getCellCoords(newX, newY, newCol, newRow);

    if (oldCol != newCol || oldRow != newRow) {
        grid[oldCol][oldRow].erase(id);
        grid[newCol][newRow].insert(id);
    }
}

void FoodManager::updateMagnetization(const std::unordered_map<std::string, Snake*>& snakes, float dt) {
    if (snakes.empty()) return;

    for (auto& pair : foodMap) {
        FoodItem& food = pair.second;
        float minDistSq = 99999999.0f;
        Snake* nearestSnake = nullptr;

        for (auto const& sPair : snakes) {
            Snake* s = sPair.second;
            if (s->segments.empty()) continue;

            float dx = s->segments[0].x - food.x;
            float dy = s->segments[0].y - food.y;
            float distSq = dx * dx + dy * dy;

            if (distSq < minDistSq) {
                minDistSq = distSq;
                nearestSnake = s;
            }
        }

        if (nearestSnake) {
            float rHead = nearestSnake->getRadius();
            float magnetRange = rHead + 80.0f;
            float minDist = sqrtf(minDistSq);

            if (minDist < magnetRange && minDist > 1.0f) {
                float pullSpeed = 350.0f;
                // Quadratic decay pull factor (starts very gentle, gets stronger close to mouth)
                float linearPullFactor = (magnetRange - minDist) / magnetRange;
                float pullFactor = linearPullFactor * linearPullFactor;
                float dx = nearestSnake->segments[0].x - food.x;
                float dy = nearestSnake->segments[0].y - food.y;

                float oldX = food.x;
                float oldY = food.y;

                food.x += (dx / minDist) * pullSpeed * pullFactor * dt;
                food.y += (dy / minDist) * pullSpeed * pullFactor * dt;

                updateFoodGridPosition(food.id, oldX, oldY, food.x, food.y);
            }
        }
    }
}

std::vector<FoodItem> FoodManager::getFoodInRect(float minX, float minY, float maxX, float maxY) const {
    std::vector<FoodItem> results;
    int minCol, minRow;
    int maxCol, maxRow;

    getCellCoords(minX, minY, minCol, minRow);
    getCellCoords(maxX, maxY, maxCol, maxRow);

    for (int col = minCol; col <= maxCol; ++col) {
        for (int row = minRow; row <= maxRow; ++row) {
            for (int id : grid[col][row]) {
                auto it = foodMap.find(id);
                if (it != foodMap.end()) {
                    const FoodItem& food = it->second;
                    if (food.x >= minX && food.x <= maxX && food.y >= minY && food.y <= maxY) {
                        results.push_back(food);
                    }
                }
            }
        }
    }
    return results;
}
