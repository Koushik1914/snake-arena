#pragma once
#include <string>
#include <vector>
#include <cmath>
#include <algorithm>

struct Segment {
    float x;
    float y;
};

struct FoodSpawn {
    float x;
    float y;
    float mass;
};

class Snake {
public:
    std::string id;
    std::string name;
    std::string color;
    float mass;
    std::vector<Segment> segments;
    float angle;
    float targetAngle;
    bool isBoosting;
    float pendingFoodSpawn;
    float outsideTime;

    // Physics constants
    static constexpr float BASE_SPEED = 180.0f;
    static constexpr float BOOST_MULTIPLIER = 2.5f;
    static constexpr float BASE_TURN_SPEED = 4.5f;
    static constexpr float BASE_RADIUS = 8.0f;
    static constexpr float RADIUS_FACTOR = 0.55f;
    static constexpr int BASE_LENGTH = 15;
    static constexpr float MASS_PER_SEGMENT = 5.0f;
    static constexpr float MIN_BOOST_MASS = 50.0f;
    static constexpr float BOOST_MASS_LOSS_RATE = 20.0f;

    Snake(const std::string& id, const std::string& name, float x, float y, const std::string& color);
    
    float getRadius() const;
    float getSegmentSpacing() const;
    void changeInput(float newAngle, bool newIsBoosting);
    void grow(float amount);
    
    // Returns true if alive, false if boundary collision
    bool update(float dt, float mapSize, FoodSpawn& foodSpawn, bool& shouldSpawnFood);
};
