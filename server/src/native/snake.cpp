#include "snake.h"
#include <cstdlib>

#ifndef M_PI
#define M_PI 3.14159265358979323846f
#endif

Snake::Snake(const std::string& id, const std::string& name, float x, float y, const std::string& color)
    : id(id), name(name), color(color), mass(50.0f), isBoosting(false), pendingFoodSpawn(0.0f), outsideTime(0.0f) {
    
    // Seed and pick random angle
    angle = static_cast<float>(rand()) / static_cast<float>(RAND_MAX) * 2.0f * M_PI;
    targetAngle = angle;
 
    // Initialize segments at starting position, trailing behind the head
    float spacing = getSegmentSpacing();
    for (int i = 0; i < BASE_LENGTH; i++) {
        segments.push_back({ x - cosf(angle) * i * spacing, y - sinf(angle) * i * spacing });
    }
}
 
float Snake::getRadius() const {
    return BASE_RADIUS + sqrtf(mass) * RADIUS_FACTOR;
}
 
float Snake::getSegmentSpacing() const {
    return getRadius() * 0.45f;
}

void Snake::changeInput(float newAngle, bool newIsBoosting) {
    targetAngle = newAngle;
    isBoosting = newIsBoosting;
}

void Snake::grow(float amount) {
    mass += amount;
}

bool Snake::update(float dt, float mapSize, FoodSpawn& foodSpawn, bool& shouldSpawnFood) {
    shouldSpawnFood = false;

    // 1. Handle Speed Boost Mass Consumption
    if (isBoosting && mass > MIN_BOOST_MASS) {
        float massLost = BOOST_MASS_LOSS_RATE * dt;
        mass = std::max(MIN_BOOST_MASS, mass - massLost);
        pendingFoodSpawn += massLost;
    } else {
        isBoosting = false;
    }

    // 2. Turn physics - limit turning speed based on mass (1.4x more responsive while boosting)
    float turnSpeedFactor = 1.0f / (1.0f + sqrtf(mass) * 0.04f);
    float turnMultiplier = isBoosting ? 1.4f : 1.0f;
    float maxTurn = BASE_TURN_SPEED * turnSpeedFactor * turnMultiplier * dt;
    float angleDiff = targetAngle - angle;

    // Normalize angle difference to [-PI, PI]
    angleDiff = atan2f(sinf(angleDiff), cosf(angleDiff));

    if (std::abs(angleDiff) > maxTurn) {
        angle += (angleDiff > 0.0f ? 1.0f : -1.0f) * maxTurn;
    } else {
        angle = targetAngle;
    }

    // Normalize actual angle to [0, 2*PI]
    while (angle < 0.0f) angle += 2.0f * M_PI;
    while (angle >= 2.0f * M_PI) angle -= 2.0f * M_PI;

    // 3. Move the head
    // Speed scales down slightly as mass increases
    float speedFactor = std::max(0.65f, 1.0f - sqrtf(mass) * 0.006f);
    float currentSpeed = BASE_SPEED * (isBoosting ? BOOST_MULTIPLIER : 1.0f) * speedFactor;

    Segment head = segments[0];
    float newHeadX = head.x + cosf(angle) * currentSpeed * dt;
    float newHeadY = head.y + sinf(angle) * currentSpeed * dt;

    // Check circular boundary collision (3 seconds grace period)
    float cx = mapSize / 2.0f;
    float cy = mapSize / 2.0f;
    float r = mapSize / 2.0f;
    float dx = newHeadX - cx;
    float dy = newHeadY - cy;
    float dist = sqrtf(dx * dx + dy * dy);

    if (dist > r) {
        outsideTime += dt;
        if (outsideTime >= 3.0f) {
            return false; // Signals death by staying outside map boundary too long
        }
    } else {
        outsideTime = 0.0f;
    }

    segments[0].x = newHeadX;
    segments[0].y = newHeadY;

    // 4. Update segments with distance constraints (Inverse Kinematics)
    float spacing = getSegmentSpacing();
    for (size_t i = 1; i < segments.size(); ++i) {
        Segment prev = segments[i - 1];
        Segment curr = segments[i];
        float dx = prev.x - curr.x;
        float dy = prev.y - curr.y;
        float dist = sqrtf(dx * dx + dy * dy);

        if (dist > spacing) {
            float segAngle = atan2f(dy, dx);
            segments[i].x = prev.x - cosf(segAngle) * spacing;
            segments[i].y = prev.y - sinf(segAngle) * spacing;
        }
    }

    // 5. Manage length: add or remove segments based on mass
    size_t targetLength = BASE_LENGTH + static_cast<size_t>(floorf(mass / MASS_PER_SEGMENT));

    while (segments.size() < targetLength) {
        Segment tail = segments.back();
        segments.push_back({ tail.x, tail.y });
    }

    while (segments.size() > targetLength && segments.size() > static_cast<size_t>(BASE_LENGTH)) {
        segments.pop_back();
    }

    // 6. Handle spawning of food from boost (smaller threshold for continuous trail)
    if (pendingFoodSpawn >= 1.5f) {
        Segment tail = segments.back();
        float spawnMass = floorf(pendingFoodSpawn);
        pendingFoodSpawn -= spawnMass;

        foodSpawn.x = tail.x;
        foodSpawn.y = tail.y;
        foodSpawn.mass = spawnMass;
        shouldSpawnFood = true;
    }

    return true;
}
