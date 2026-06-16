#pragma once
#include <string>
#include <vector>
#include <unordered_map>
#include <unordered_set>
#include <cmath>
#include <algorithm>
#include <cstdlib>

struct FoodItem {
    int id;
    float x;
    float y;
    float mass;
    std::string color;
};

class Snake;

class FoodManager {
private:
    int nextId;
    float mapSize;
    float cellSize;
    int numCols;
    int numRows;

    // Spatial hash grid: col -> row -> Set of IDs
    std::vector<std::vector<std::unordered_set<int>>> grid;

    void getCellCoords(float x, float y, int& col, int& row) const;
    void getRandomCircularCoords(float& x, float& y) const;
    void getRandomCircularCoordsWithDensityCheck(float& x, float& y) const;

public:
    std::unordered_map<int, FoodItem> foodMap;
    static const std::vector<std::string> COLORS;

    FoodManager(float mapSize);
    
    void addFood(float x, float y, float mass = 1.0f, const std::string& color = "");
    void removeFood(int id);
    void spawnInitialFood(int targetCount);
    void maintainDensity(int targetCount);
    void updateFoodGridPosition(int id, float oldX, float oldY, float newX, float newY);
    void updateMagnetization(const std::unordered_map<std::string, Snake*>& snakes, float dt);
    
    std::vector<FoodItem> getFoodInRect(float minX, float minY, float maxX, float maxY) const;
};
