import { EventBus } from './core/EventBus';
import { NetworkClient } from './network/NetworkClient';
import { GameApp } from './game/GameApp';
import { LobbyUI } from './ui/LobbyUI';
import { HudUI } from './ui/HudUI';

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────────────────

const bus      = new EventBus();
const network  = new NetworkClient(bus);
const lobbyUI  = new LobbyUI();
const hud      = new HudUI(bus);
let   gameApp: GameApp | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// WebSocket URL Resolution
// ─────────────────────────────────────────────────────────────────────────────

function resolveWsUrl(): string {
  const { hostname, protocol, host } = window.location;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `ws://${hostname}:3000/ws`;
  }
  const wsProto = protocol === 'https:' ? 'wss:' : 'ws:';
  return `${wsProto}//${host}/ws`;
}

const WS_URL = resolveWsUrl();

function connectToServer(): void {
  console.log(`[main] Connecting to ${WS_URL}`);
  network.connect(WS_URL);
}

// ─────────────────────────────────────────────────────────────────────────────
// Network → UI Event Wiring
// ─────────────────────────────────────────────────────────────────────────────

bus.on('connected', () => {
  console.log('[main] WebSocket connected.');

  // Auto-join from URL parameter ?room=XXXXXX
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room');
  if (roomParam) {
    const code = roomParam.trim().toUpperCase();
    if (code.length === 6) {
      const roomInput = document.getElementById('room-code-input') as HTMLInputElement;
      if (roomInput) roomInput.value = code;

      const nicknameInput = document.getElementById('nickname-input') as HTMLInputElement;
      const nickname = nicknameInput?.value.trim() || 'NeonSnake';

      console.log(`[main] Auto-joining room ${code} as ${nickname}`);
      network.joinRoom(code, nickname);

      // Clear query parameters to prevent loops on manual exit/disconnect
      const cleanUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
    }
  }
});

bus.on('roomJoined', ({ roomCode, playerId }) => {
  console.log(`[main] Joined room ${roomCode} as ${playerId}`);

  // Create GameApp if not already instantiated
  if (!gameApp) {
    gameApp = new GameApp(network, bus, hud);
  }

  // Find the local player's initial segments from the first server state update.
  // We wait for the first gameState to initialize prediction.
  const unsub = bus.once('gameState', (packet) => {
    // GameStatePacket is a tuple: [tick, ackSeq, players, foodAdded, foodRemoved, events]
    const [, , players] = packet;
    const myData = (players as unknown[]).find(
      (p) => Array.isArray(p) && (p as unknown[])[0] === network.localPlayerId
    );
    if (myData) {
      const row = myData as unknown as [string,string,string,number,boolean,[number,number][]];
      const mass = row[3]; const segments = row[5];
      gameApp!.initLocalPlayer(segments, mass);
    }
  });
  void unsub; // once() auto-unsubscribes

  hud.show(roomCode);
  lobbyUI.showGame(roomCode);
});

bus.on('eliminated', ({ score, rank, killerName }) => {
  console.log(`[main] Eliminated: score=${score}, rank=${rank}, by=${killerName}`);
  lobbyUI.showElimination(score, rank, killerName);
});

bus.on('networkError', ({ message }) => {
  lobbyUI.showError(message);
});

bus.on('disconnected', ({ code, reason }) => {
  console.warn(`[main] Disconnected: code=${code} reason=${reason}`);
  lobbyUI.showLobby();
  lobbyUI.showError('Disconnected from server. Reconnecting…');

  if (gameApp) {
    gameApp.destroy();
    gameApp = null;
  }

  setTimeout(connectToServer, 2000);
});

// ─────────────────────────────────────────────────────────────────────────────
// Lobby UI → Network Wiring
// ─────────────────────────────────────────────────────────────────────────────

lobbyUI.onCreateRoom = (nickname) => {
  if (!network.isConnected()) {
    lobbyUI.showError('Not connected. Reconnecting…');
    connectToServer();
    return;
  }
  network.createRoom(nickname);
};

lobbyUI.onJoinRoom = (roomCode, nickname) => {
  if (!network.isConnected()) {
    lobbyUI.showError('Not connected. Reconnecting…');
    connectToServer();
    return;
  }
  network.joinRoom(roomCode, nickname);
};

lobbyUI.onRespawn = () => {
  if (network.isConnected()) {
    network.rejoin();
  }
};

lobbyUI.onSpectate = () => {
  hud.show(network.roomCode);
  hud.hidePlayerStats();
};

lobbyUI.onLeaveToLobby = () => {
  network.disconnect();

  if (gameApp) {
    gameApp.destroy();
    gameApp = null;
  }

  lobbyUI.showLobby();
  connectToServer();
};

// ─────────────────────────────────────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────────────────────────────────────

connectToServer();
