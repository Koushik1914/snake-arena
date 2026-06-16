#include <napi.h>
#include "game_engine.h"

/**
 * GameEngineWrap — N-API wrapper exposing the C++ GameEngine to Node.js.
 *
 * This is the boundary between Node.js (room management) and C++ (simulation).
 * All game logic lives in C++; Node.js only calls these methods.
 *
 * Exposed methods:
 *   addPlayer(id, name)
 *   removePlayer(id)
 *   handleInput(id, angle, isBoosting)
 *   update(dt) → EliminationEvent[]
 *   getSerializedState(playerId, ackSeq) → Buffer
 *   getSerializedLeaderboard() → Buffer
 *   mapSize (getter)
 */
class GameEngineWrap : public Napi::ObjectWrap<GameEngineWrap> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports);
    GameEngineWrap(const Napi::CallbackInfo& info);
    ~GameEngineWrap();

private:
    GameEngine* engine;

    Napi::Value AddPlayer(const Napi::CallbackInfo& info);
    Napi::Value RemovePlayer(const Napi::CallbackInfo& info);
    Napi::Value HandleInput(const Napi::CallbackInfo& info);
    Napi::Value Update(const Napi::CallbackInfo& info);
    Napi::Value GetSerializedState(const Napi::CallbackInfo& info);
    Napi::Value GetSerializedLeaderboard(const Napi::CallbackInfo& info);
    Napi::Value GetMapSize(const Napi::CallbackInfo& info);
};

Napi::Object GameEngineWrap::Init(Napi::Env env, Napi::Object exports) {
    Napi::Function func = DefineClass(env, "GameEngine", {
        InstanceMethod("addPlayer",               &GameEngineWrap::AddPlayer),
        InstanceMethod("removePlayer",            &GameEngineWrap::RemovePlayer),
        InstanceMethod("handleInput",             &GameEngineWrap::HandleInput),
        InstanceMethod("update",                  &GameEngineWrap::Update),
        InstanceMethod("getSerializedState",      &GameEngineWrap::GetSerializedState),
        InstanceMethod("getSerializedLeaderboard",&GameEngineWrap::GetSerializedLeaderboard),
        InstanceAccessor("mapSize",               &GameEngineWrap::GetMapSize, nullptr),
    });

    Napi::FunctionReference* constructor = new Napi::FunctionReference();
    *constructor = Napi::Persistent(func);
    env.SetInstanceData(constructor);

    exports.Set("GameEngine", func);
    return exports;
}

GameEngineWrap::GameEngineWrap(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<GameEngineWrap>(info) {
    Napi::Env env = info.Env();
    float mapSize = 4000.0f;
    if (info.Length() > 0 && info[0].IsNumber()) {
        mapSize = info[0].As<Napi::Number>().FloatValue();
    }
    this->engine = new GameEngine(mapSize);
}

GameEngineWrap::~GameEngineWrap() {
    delete this->engine;
}

// ── addPlayer(id: string, name: string) ──────────────────────────────────────
Napi::Value GameEngineWrap::AddPlayer(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 2 || !info[0].IsString() || !info[1].IsString()) {
        Napi::TypeError::New(env, "addPlayer(id: string, name: string)").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    std::string id   = info[0].As<Napi::String>().Utf8Value();
    std::string name = info[1].As<Napi::String>().Utf8Value();
    this->engine->addPlayer(id, name);
    return env.Undefined();
}

// ── removePlayer(id: string) ─────────────────────────────────────────────────
Napi::Value GameEngineWrap::RemovePlayer(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "removePlayer(id: string)").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    std::string id = info[0].As<Napi::String>().Utf8Value();
    this->engine->removePlayer(id);
    return env.Undefined();
}

// ── handleInput(id: string, angle: number, boost: boolean) ───────────────────
Napi::Value GameEngineWrap::HandleInput(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 3 || !info[0].IsString() || !info[1].IsNumber() || !info[2].IsBoolean()) {
        Napi::TypeError::New(env, "handleInput(id: string, angle: number, boost: boolean)").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    std::string id    = info[0].As<Napi::String>().Utf8Value();
    float angle       = info[1].As<Napi::Number>().FloatValue();
    bool  isBoosting  = info[2].As<Napi::Boolean>().Value();
    this->engine->handleInput(id, angle, isBoosting);
    return env.Undefined();
}

// ── update(dt: number) → EliminationEvent[] ──────────────────────────────────
Napi::Value GameEngineWrap::Update(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsNumber()) {
        Napi::TypeError::New(env, "update(dt: number)").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    float dt = info[0].As<Napi::Number>().FloatValue();
    std::vector<EliminationEvent> elims = this->engine->update(dt);

    Napi::Array result = Napi::Array::New(env, elims.size());
    for (size_t i = 0; i < elims.size(); ++i) {
        Napi::Object obj = Napi::Object::New(env);
        obj.Set("playerId",   Napi::String::New(env, elims[i].playerId));
        obj.Set("score",      Napi::Number::New(env, elims[i].score));
        obj.Set("rank",       Napi::Number::New(env, elims[i].rank));
        obj.Set("killerName", Napi::String::New(env, elims[i].killerName));
        result[i] = obj;
    }
    return result;
}

// ── getSerializedState(playerId: string, ackSeq: number) → Buffer ─────────────
// ackSeq is the last input sequence number the server processed for this player.
// Embedded in the packet for client-side reconciliation.
Napi::Value GameEngineWrap::GetSerializedState(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "getSerializedState(playerId: string, ackSeq?: number)").ThrowAsJavaScriptException();
        return env.Undefined();
    }
    std::string playerId = info[0].As<Napi::String>().Utf8Value();
    int ackSeq = 0;
    if (info.Length() >= 2 && info[1].IsNumber()) {
        ackSeq = info[1].As<Napi::Number>().Int32Value();
    }
    std::vector<uint8_t> buffer = this->engine->getSerializedState(playerId, ackSeq);
    return Napi::Buffer<uint8_t>::Copy(env, buffer.data(), buffer.size());
}

// ── getSerializedLeaderboard() → Buffer ──────────────────────────────────────
Napi::Value GameEngineWrap::GetSerializedLeaderboard(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    std::vector<uint8_t> buffer = this->engine->getSerializedLeaderboard();
    return Napi::Buffer<uint8_t>::Copy(env, buffer.data(), buffer.size());
}

// ── mapSize (getter) ──────────────────────────────────────────────────────────
Napi::Value GameEngineWrap::GetMapSize(const Napi::CallbackInfo& info) {
    return Napi::Number::New(info.Env(), this->engine->mapSize);
}

// ─────────────────────────────────────────────────────────────────────────────
// Module Initializer
// ─────────────────────────────────────────────────────────────────────────────
Napi::Object InitAll(Napi::Env env, Napi::Object exports) {
    return GameEngineWrap::Init(env, exports);
}

NODE_API_MODULE(game_engine, InitAll)
