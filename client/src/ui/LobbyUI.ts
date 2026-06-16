export class LobbyUI {
  // UI Containers
  private lobbyOverlay: HTMLElement;
  private deathOverlay: HTMLElement;

  // Buttons & Inputs
  private nicknameInput: HTMLInputElement;
  private roomCodeInput: HTMLInputElement;
  private createRoomBtn: HTMLButtonElement;
  private joinRoomBtn: HTMLButtonElement;
  private copyCodeBtn: HTMLButtonElement;
  private shareWaBtn:  HTMLButtonElement;  // WhatsApp HUD share button
  private lobbyShareBtn: HTMLButtonElement; // WhatsApp Lobby share button
  private respawnBtn: HTMLButtonElement;
  private spectateBtn: HTMLButtonElement;
  private leaveBtn: HTMLButtonElement;

  // Dynamic Displays
  private hudRoomCode: HTMLElement;
  private leaderboardList: HTMLElement;
  private statScore: HTMLElement;
  private statRank: HTMLElement;
  private lobbyError: HTMLElement;
  private deathCause: HTMLElement;
  private deathScore: HTMLElement;
  private deathRank: HTMLElement;

  // Event Callbacks
  public onCreateRoom?: (nickname: string) => void;
  public onJoinRoom?: (roomCode: string, nickname: string) => void;
  public onRespawn?: () => void;
  public onSpectate?: () => void;
  public onLeaveToLobby?: () => void;

  constructor() {
    this.lobbyOverlay = document.getElementById('lobby-container')!;
    this.deathOverlay = document.getElementById('death-container')!;

    this.nicknameInput = document.getElementById('nickname-input')! as HTMLInputElement;
    this.roomCodeInput = document.getElementById('room-code-input')! as HTMLInputElement;
    this.createRoomBtn = document.getElementById('create-room-btn')! as HTMLButtonElement;
    this.joinRoomBtn = document.getElementById('join-room-btn')! as HTMLButtonElement;
    this.copyCodeBtn = document.getElementById('copy-code-btn')! as HTMLButtonElement;
    this.shareWaBtn = document.getElementById('share-wa-btn')! as HTMLButtonElement;
    this.lobbyShareBtn = document.getElementById('lobby-share-btn')! as HTMLButtonElement;
    this.respawnBtn = document.getElementById('respawn-btn')! as HTMLButtonElement;
    this.spectateBtn = document.getElementById('spectate-btn')! as HTMLButtonElement;
    this.leaveBtn = document.getElementById('leave-btn')! as HTMLButtonElement;

    this.hudRoomCode = document.getElementById('hud-room-code')!;
    this.leaderboardList = document.getElementById('leaderboard-list')!;
    this.statScore = document.getElementById('stat-score')!;
    this.statRank = document.getElementById('stat-rank')!;
    this.lobbyError = document.getElementById('lobby-error')!;
    this.deathCause = document.getElementById('death-cause')!;
    this.deathScore = document.getElementById('death-score')!;
    this.deathRank = document.getElementById('death-rank')!;

    this.initEventListeners();
  }

  private initEventListeners() {
    // 1. Create Room Action
    this.createRoomBtn.addEventListener('click', () => {
      const nickname = this.getNickname();
      if (this.onCreateRoom) this.onCreateRoom(nickname);
    });

    // 2. Join Room Action
    this.joinRoomBtn.addEventListener('click', () => {
      const nickname = this.getNickname();
      const code = this.roomCodeInput.value.trim().toUpperCase();
      if (!code) {
        this.showError("Please enter a room code.");
        return;
      }
      if (this.onJoinRoom) this.onJoinRoom(code, nickname);
    });

    // 3. Room Code Copy Action
    this.copyCodeBtn.addEventListener('click', () => {
      const code = this.hudRoomCode.textContent;
      if (code && code !== '------') {
        navigator.clipboard.writeText(code)
          .then(() => {
            const originalColor = this.copyCodeBtn.style.color;
            this.copyCodeBtn.style.color = '#39ff14'; // turn green
            setTimeout(() => {
              this.copyCodeBtn.style.color = originalColor;
            }, 1000);
          })
          .catch(err => console.error("Could not copy room code:", err));
      }
    });

    // WhatsApp Room Share Action (from HUD)
    this.shareWaBtn.addEventListener('click', () => {
      const code = this.hudRoomCode.textContent;
      if (code && code !== '------') {
        const inviteUrl = `${window.location.origin}/?room=${code}`;
        const text = `Join my snake arena game! Use room code: ${code} or click: ${inviteUrl}`;
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
      }
    });

    // WhatsApp Game/Room Share Action (from Lobby)
    this.lobbyShareBtn.addEventListener('click', () => {
      const code = this.roomCodeInput.value.trim().toUpperCase();
      let text = '';
      if (code) {
        const inviteUrl = `${window.location.origin}/?room=${code}`;
        text = `Join my snake arena game! Use room code: ${code} or click: ${inviteUrl}`;
      } else {
        text = `Join my snake arena game! Click: ${window.location.origin}/`;
      }
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
    });

    // 4. Respawn Action
    this.respawnBtn.addEventListener('click', () => {
      if (this.onRespawn) this.onRespawn();
    });

    // 5. Spectate Action
    this.spectateBtn.addEventListener('click', () => {
      this.showSpectatingHUD();
      if (this.onSpectate) this.onSpectate();
    });

    // 6. Return to Lobby Action
    this.leaveBtn.addEventListener('click', () => {
      if (this.onLeaveToLobby) this.onLeaveToLobby();
    });
  }

  private getNickname(): string {
    let name = this.nicknameInput.value.trim();
    if (!name) name = "NeonSnake";
    // Limit to 12 chars
    return name.substring(0, 12);
  }

  public showError(message: string) {
    this.lobbyError.textContent = message;
    this.lobbyError.classList.remove('hidden');
    
    // Auto-hide after 4 seconds
    setTimeout(() => {
      this.lobbyError.classList.add('hidden');
    }, 4000);
  }

  public showLobby() {
    this.lobbyOverlay.classList.remove('hidden');
    this.deathOverlay.classList.add('hidden');
  }

  public showGame(roomCode: string) {
    this.lobbyOverlay.classList.add('hidden');
    this.deathOverlay.classList.add('hidden');
    // Note: HudUI.show() is responsible for showing the HUD and setting room code
    void roomCode;
  }

  public showElimination(score: number, rank: number, killerName: string) {
    this.lobbyOverlay.classList.add('hidden');
    this.deathOverlay.classList.remove('hidden');

    this.deathCause.textContent = killerName === "the boundary"
      ? "You crashed into the boundary grid."
      : `You were eliminated by ${killerName}.`;

    this.deathScore.textContent = score.toString();
    this.deathRank.textContent = rank.toString();
  }

  public showSpectatingHUD() {
    this.deathOverlay.classList.add('hidden');
    
    // Hide score statistics since we are spectating
    this.statScore.parentElement!.classList.add('hidden');
    this.statRank.parentElement!.classList.add('hidden');
  }

  public updateStats(score: number, rank: number, totalPlayers: number) {
    // Make sure stats are visible (e.g. if we respawned after spectating)
    this.statScore.parentElement!.classList.remove('hidden');
    this.statRank.parentElement!.classList.remove('hidden');

    this.statScore.textContent = score.toString();
    this.statRank.textContent = `${rank}/${totalPlayers}`;
  }

  public updateLeaderboard(leaderboard: [string, number][], localPlayerName: string) {
    this.leaderboardList.innerHTML = '';
    
    if (leaderboard.length === 0) {
      this.leaderboardList.innerHTML = `<div class="leaderboard-item empty">Waiting for snakes...</div>`;
      return;
    }

    leaderboard.forEach((entry, idx) => {
      const [name, score] = entry;
      const rank = idx + 1;
      const isLocal = name === localPlayerName;

      const item = document.createElement('div');
      item.className = `leaderboard-item ${isLocal ? 'local' : ''}`;
      item.innerHTML = `
        <div class="rank-name">
          <span class="rank">${rank}</span>
          <span class="name">${this.escapeHTML(name)}</span>
        </div>
        <span class="score">${score}</span>
      `;
      this.leaderboardList.appendChild(item);
    });
  }

  private escapeHTML(str: string): string {
    const p = document.createElement('p');
    p.textContent = str;
    return p.innerHTML;
  }
}
