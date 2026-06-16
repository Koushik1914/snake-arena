#include "game_engine.h"
#include <cmath>
#include <algorithm>

#ifndef M_PI
#define M_PI 3.14159265358979323846f
#endif

GameEngine::GameEngine(float mapSize)
    : mapSize(mapSize), tick(0), foodManager(mapSize), collisionGrid(120.0f) {
    foodManager.spawnInitialFood(TARGET_FOOD_COUNT);
}

GameEngine::~GameEngine() {
    for (auto& pair : snakes) {
        delete pair.second;
    }
    snakes.clear();
}

Snake* GameEngine::addPlayer(const std::string& id, const std::string& name) {
    // Spawn player at a random position inside the circle with a margin from the boundary
    float spawnRadius = (mapSize / 2.0f) - 300.0f;
    float r = sqrtf(static_cast<float>(rand()) / RAND_MAX) * spawnRadius;
    float theta = (static_cast<float>(rand()) / RAND_MAX) * 2.0f * M_PI;
    float x = (mapSize / 2.0f) + r * cosf(theta);
    float y = (mapSize / 2.0f) + r * sinf(theta);

    // Distinct neon snake colors
    static const std::vector<std::string> colors = {
        "#00f0ff", "#ff007f", "#39ff14", "#ffbf00",
        "#bd00ff", "#00ffcc", "#ff3300", "#ffff00"
    };
    std::string color = colors[rand() % colors.size()];

    Snake* snake = new Snake(id, name, x, y, color);
    snakes[id] = snake;
    return snake;
}

void GameEngine::removePlayer(const std::string& id) {
    auto it = snakes.find(id);
    if (it != snakes.end()) {
        delete it->second;
        snakes.erase(it);
    }
}

void GameEngine::handleInput(const std::string& id, float angle, bool isBoosting) {
    auto it = snakes.find(id);
    if (it != snakes.end()) {
        it->second->changeInput(angle, isBoosting);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Simulation Tick
// ─────────────────────────────────────────────────────────────────────────────
std::vector<EliminationEvent> GameEngine::update(float dt) {
    tick++;
    currentTickEvents.clear();
    std::vector<EliminationEvent> eliminations;

    // ── 1. Move all snakes; collect boundary deaths ───────────────────────────
    std::vector<std::pair<std::string, std::string>> boundaryDeaths;
    for (auto const& pair : snakes) {
        Snake* s = pair.second;
        FoodSpawn foodSpawn = { 0.0f, 0.0f, 0.0f };
        bool shouldSpawnFood = false;

        bool alive = s->update(dt, mapSize, foodSpawn, shouldSpawnFood);
        if (!alive) {
            boundaryDeaths.push_back({ s->id, "the boundary" });
            continue;
        }
        if (shouldSpawnFood) {
            foodManager.addFood(foodSpawn.x, foodSpawn.y, foodSpawn.mass, s->color);
        }
    }

    for (auto const& d : boundaryDeaths) {
        eliminatePlayer(d.first, d.second, eliminations);
    }
    if (snakes.empty()) {
        foodManager.maintainDensity(TARGET_FOOD_COUNT);
        return eliminations;
    }

    // ── 2. Rebuild spatial hash grid for collision detection ─────────────────
    //
    // O(n × k) collision detection using a spatial hash grid.
    // All snake segments are inserted once (O(n×segs)), then each head queries
    // only the cells in its vicinity (O(k) per query).
    //
    collisionGrid.clear();
    for (auto const& pair : snakes) {
        Snake* s = pair.second;
        for (int i = 0; i < static_cast<int>(s->segments.size()); ++i) {
            collisionGrid.insert(s->segments[i].x, s->segments[i].y, s->id, i);
        }
    }

    // ── 3. Snake-on-snake collision checks ───────────────────────────────────
    std::vector<Snake*> activeSnakes;
    activeSnakes.reserve(snakes.size());
    for (auto const& pair : snakes) activeSnakes.push_back(pair.second);

    std::unordered_map<std::string, std::string> pendingElims; // id → killerName

    for (size_t i = 0; i < activeSnakes.size(); ++i) {
        Snake* snakeA = activeSnakes[i];
        if (snakeA->segments.empty()) continue;
        if (pendingElims.count(snakeA->id)) continue; // already scheduled to die

        const Segment& headA = snakeA->segments[0];
        float rA = snakeA->getRadius();
        float queryR = rA + 20.0f; // slightly generous query radius

        // Query nearby segments from the spatial grid
        std::vector<SegmentRef> nearby = collisionGrid.queryRadius(headA.x, headA.y, queryR);

        for (const SegmentRef& ref : nearby) {
            // Skip own snake (self-collision disabled per design)
            if (ref.snakeId == snakeA->id) continue;

            Snake* snakeB = snakes.count(ref.snakeId) ? snakes.at(ref.snakeId) : nullptr;
            if (!snakeB || snakeB->segments.empty()) continue;

            float rB = snakeB->getRadius();
            const Segment& seg = snakeB->segments[ref.segmentIndex];
            float dx = headA.x - seg.x;
            float dy = headA.y - seg.y;
            float distSq = dx * dx + dy * dy;
            float hitRadius = (rA + rB) * 0.85f;

            // ── Head-to-Body collision ────────────────────────────────────
            if (ref.segmentIndex > 0 && distSq < hitRadius * hitRadius) {
                pendingElims[snakeA->id] = snakeB->name;
                break;
            }

            // ── Head-to-Head collision (only check once per pair: i < j) ──
            if (ref.segmentIndex == 0) {
                // Find snakeB's index to ensure we only process each pair once
                bool bHigherIndex = false;
                for (size_t j = i + 1; j < activeSnakes.size(); ++j) {
                    if (activeSnakes[j] == snakeB) { bHigherIndex = true; break; }
                }
                if (!bHigherIndex) continue;

                float hhRadius = (rA + rB) * 0.9f;
                if (distSq < hhRadius * hhRadius) {
                    if (snakeA->mass > snakeB->mass) {
                        // A wins, B dies
                        if (!pendingElims.count(snakeB->id))
                            pendingElims[snakeB->id] = snakeA->name;
                    } else if (snakeB->mass > snakeA->mass) {
                        // B wins, A dies
                        pendingElims[snakeA->id] = snakeB->name;
                        break;
                    } else {
                        // Equal mass: both die
                        pendingElims[snakeA->id] = snakeB->name;
                        pendingElims[snakeB->id] = snakeA->name;
                        break;
                    }
                }
            }
        }
    }

    for (auto const& pair : pendingElims) {
        eliminatePlayer(pair.first, pair.second, eliminations);
    }

    // ── 4. Food magnetization and ingestion ──────────────────────────────────
    foodManager.updateMagnetization(snakes, dt);

    for (auto const& pair : snakes) {
        Snake* s = pair.second;
        if (s->segments.empty()) continue;

        const Segment& head = s->segments[0];
        float rHead = s->getRadius();

        std::vector<FoodItem> nearbyFood = foodManager.getFoodInRect(
            head.x - (rHead + 15.0f), head.y - (rHead + 15.0f),
            head.x + (rHead + 15.0f), head.y + (rHead + 15.0f)
        );

        for (const FoodItem& food : nearbyFood) {
            float dx = head.x - food.x;
            float dy = head.y - food.y;
            float distSq = dx * dx + dy * dy;
            float eatR = rHead + 5.0f;

            if (distSq < eatR * eatR) {
                s->grow(food.mass);
                foodManager.removeFood(food.id);
                currentTickEvents.push_back({ "food_eaten", head.x, head.y, "", food.id });
            }
        }
    }

    // ── 5. Maintain food density ──────────────────────────────────────────────
    foodManager.maintainDensity(TARGET_FOOD_COUNT);

    return eliminations;
}

// ─────────────────────────────────────────────────────────────────────────────
// Elimination Handler
// ─────────────────────────────────────────────────────────────────────────────
void GameEngine::eliminatePlayer(
    const std::string& id,
    const std::string& killerName,
    std::vector<EliminationEvent>& outEliminations
) {
    auto it = snakes.find(id);
    if (it == snakes.end()) return;

    Snake* s = it->second;
    int score = static_cast<int>(floorf(s->mass));
    const Segment& head = s->segments[0];

    // Trigger visual explosion event for clients
    currentTickEvents.push_back({ "elimination", head.x, head.y, s->color, score });

    // Scatter 50% of snake mass as food drops along body segments
    int dropMassTotal = static_cast<int>(floorf(s->mass * 0.5f));
    int numSegments   = static_cast<int>(s->segments.size());
    float massPerDrop = std::max(2.0f, floorf(static_cast<float>(dropMassTotal) / std::max(1, numSegments)));

    for (int idx = 0; idx < numSegments; idx++) {
        if (idx % 2 == 0 || idx == 0) { // every other segment to avoid excessive food
            float ox = (static_cast<float>(rand()) / RAND_MAX - 0.5f) * 20.0f;
            float oy = (static_cast<float>(rand()) / RAND_MAX - 0.5f) * 20.0f;
            float fx = s->segments[idx].x + ox;
            float fy = s->segments[idx].y + oy;
            
            // Clamp to circular boundary
            float cx = mapSize / 2.0f;
            float cy = mapSize / 2.0f;
            float rMax = (mapSize / 2.0f) - 20.0f;
            float dx = fx - cx;
            float dy = fy - cy;
            float dist = sqrtf(dx * dx + dy * dy);
            if (dist > rMax) {
                fx = cx + (dx / dist) * rMax;
                fy = cy + (dy / dist) * rMax;
            }
            foodManager.addFood(fx, fy, massPerDrop, s->color);
        }
    }

    // Compute rank from leaderboard before removing
    auto leaderboard = getLeaderboard();
    int rank = 1;
    for (size_t idx = 0; idx < leaderboard.size(); idx++) {
        if (leaderboard[idx].first == s->name) { rank = static_cast<int>(idx + 1); break; }
    }

    outEliminations.push_back({ id, score, rank, killerName });

    delete s;
    snakes.erase(it);
}

// ─────────────────────────────────────────────────────────────────────────────
// Leaderboard
// ─────────────────────────────────────────────────────────────────────────────
std::vector<std::pair<std::string, int>> GameEngine::getLeaderboard() const {
    std::vector<std::pair<std::string, int>> lb;
    lb.reserve(snakes.size());
    for (auto const& pair : snakes) {
        lb.push_back({ pair.second->name, static_cast<int>(floorf(pair.second->mass)) });
    }
    std::sort(lb.begin(), lb.end(), [](const auto& a, const auto& b) {
        return a.second > b.second;
    });
    if (lb.size() > 10) lb.resize(10);
    return lb;
}

// ─────────────────────────────────────────────────────────────────────────────
// State Serialization
// Protocol: S_GAME_STATE = [13, tick, ackSeq, players, foodItems, events]
// ─────────────────────────────────────────────────────────────────────────────
std::vector<uint8_t> GameEngine::getSerializedState(const std::string& playerId, int ackSeq) {
    // Determine viewport center (follow this player's head, or arena center)
    float vx = mapSize / 2.0f, vy = mapSize / 2.0f;
    auto it = snakes.find(playerId);
    if (it != snakes.end() && !it->second->segments.empty()) {
        vx = it->second->segments[0].x;
        vy = it->second->segments[0].y;
    }

    // Cull food to viewport (half-view size scales with zoom)
    float halfView = 1400.0f;
    std::vector<FoodItem> foodInRange = foodManager.getFoodInRect(
        vx - halfView, vy - halfView,
        vx + halfView, vy + halfView
    );

    MsgPackWriter writer;

    // ── Packet header: [13, tick, ackSeq, players, food, events] ─────────────
    writer.write_array_header(6);
    writer.write_int(13);       // MessageType.S_GAME_STATE
    writer.write_int(tick);
    writer.write_int(ackSeq);   // Last processed input sequence for this player

    // ── Players ──────────────────────────────────────────────────────────────
    // Player entry: [id, name, color, mass, isBoosting, segments, ackSeq]
    writer.write_array_header(static_cast<uint32_t>(snakes.size()));
    for (auto const& pair : snakes) {
        Snake* s = pair.second;
        writer.write_array_header(7);
        writer.write_str(s->id);
        writer.write_str(s->name);
        writer.write_str(s->color);
        writer.write_int(static_cast<int64_t>(floorf(s->mass)));
        writer.write_bool(s->isBoosting);

        // Segments: [[x, y], ...]  — rounded to 1 decimal for bandwidth savings
        writer.write_array_header(static_cast<uint32_t>(s->segments.size()));
        for (const Segment& seg : s->segments) {
            writer.write_array_header(2);
            writer.write_double(roundf(seg.x * 10.0f) / 10.0f);
            writer.write_double(roundf(seg.y * 10.0f) / 10.0f);
        }

        // Per-player ack: same ackSeq for this recipient; 0 for others
        writer.write_int(s->id == playerId ? ackSeq : 0);
    }

    // ── Food ─────────────────────────────────────────────────────────────────
    // Each food: [id, x, y, mass, color]
    writer.write_array_header(static_cast<uint32_t>(foodInRange.size()));
    for (const FoodItem& f : foodInRange) {
        writer.write_array_header(5);
        writer.write_int(f.id);
        writer.write_int(static_cast<int64_t>(roundf(f.x)));
        writer.write_int(static_cast<int64_t>(roundf(f.y)));
        writer.write_int(static_cast<int64_t>(f.mass));
        writer.write_str(f.color);
    }

    // ── Events ───────────────────────────────────────────────────────────────
    writer.write_array_header(static_cast<uint32_t>(currentTickEvents.size()));
    for (const GameEvent& ev : currentTickEvents) {
        if (ev.type == "elimination") {
            writer.write_array_header(5);
            writer.write_str(ev.type);
            writer.write_int(static_cast<int64_t>(roundf(ev.x)));
            writer.write_int(static_cast<int64_t>(roundf(ev.y)));
            writer.write_str(ev.color);
            writer.write_int(ev.val);
        } else if (ev.type == "food_eaten") {
            writer.write_array_header(4);
            writer.write_str(ev.type);
            writer.write_int(ev.val); // foodId
            writer.write_int(static_cast<int64_t>(roundf(ev.x)));
            writer.write_int(static_cast<int64_t>(roundf(ev.y)));
        }
    }

    return writer.buffer;
}

// ─────────────────────────────────────────────────────────────────────────────
// Leaderboard Serialization
// Protocol: S_LEADERBOARD = [14, [[name, score], ...]]
// ─────────────────────────────────────────────────────────────────────────────
std::vector<uint8_t> GameEngine::getSerializedLeaderboard() {
    auto leaderboard = getLeaderboard();
    MsgPackWriter writer;

    writer.write_array_header(2);
    writer.write_int(14); // MessageType.S_LEADERBOARD

    writer.write_array_header(static_cast<uint32_t>(leaderboard.size()));
    for (auto const& entry : leaderboard) {
        writer.write_array_header(2);
        writer.write_str(entry.first);
        writer.write_int(entry.second);
    }

    return writer.buffer;
}
