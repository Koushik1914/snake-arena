#pragma once
#include <unordered_map>
#include <string>
#include <vector>
#include "snake.h"
#include "food.h"
#include "msgpack_writer.h"
#include "spatial_grid.h"

struct EliminationEvent {
    std::string playerId;
    int         score;
    int         rank;
    std::string killerName;
};

struct GameEvent {
    std::string type;  // "elimination" or "food_eaten"
    float       x;
    float       y;
    std::string color;
    int         val;   // score or foodId
};

class GameEngine {
public:
    float mapSize;
    int   tick;
    std::unordered_map<std::string, Snake*> snakes;
    FoodManager                             foodManager;
    std::vector<GameEvent>                  currentTickEvents;

    static constexpr int TARGET_FOOD_COUNT = 3500;
 
    explicit GameEngine(float mapSize = 6000.0f);
    ~GameEngine();

    Snake* addPlayer(const std::string& id, const std::string& name);
    void   removePlayer(const std::string& id);
    void   handleInput(const std::string& id, float angle, bool isBoosting);

    /**
     * Steps the simulation by dt seconds.
     * Returns all players eliminated in this tick.
     */
    std::vector<EliminationEvent> update(float dt);

    /**
     * Serializes per-player game state into MessagePack.
     * @param playerId  The player receiving this packet (for viewport culling).
     * @param ackSeq    The last input sequence number this player sent (embedded
     *                  in the packet for client-side reconciliation).
     */
    std::vector<uint8_t> getSerializedState(const std::string& playerId, int ackSeq = 0);

    /** Serializes the top-10 leaderboard into MessagePack. */
    std::vector<uint8_t> getSerializedLeaderboard();

private:
    /** Spatial hash grid rebuilt each tick for O(k) collision queries. */
    SpatialGrid collisionGrid;

    void eliminatePlayer(
        const std::string& id,
        const std::string& killerName,
        std::vector<EliminationEvent>& outEliminations
    );

    std::vector<std::pair<std::string, int>> getLeaderboard() const;
};
